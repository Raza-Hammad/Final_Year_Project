"""Curated demo flows for the Cascade Machine "Demo traffic" mode.

Natural traffic is ~99.7% Tier 1, so Tiers 2 and 3 almost never appear on the
live feed. This module scans the held-out *test split* once, keeps a small
playlist of **real** flows per tier (including a few the cascade gets wrong, so
the demo is honest rather than cherry-picked) and serves them read-only.

Nothing here writes alerts, broadcasts over WebSocket, or touches the
simulator mutex, so Alert History and KPIs stay clean.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import numpy as np

from app.config import settings
from app.ml.cascade import CascadeDetector, get_detector

logger = logging.getLogger(__name__)

DEMO_FILE = Path(settings.DATA_CACHE_DIR) / "cascade_demo_flows.json"

# Guided playlist order — repeated; each cycle advances within each bucket.
GUIDED_ORDER: tuple[str, ...] = ("t1_benign", "t1_attack", "t2", "t3")

BUCKET_LABELS: dict[str, str] = {
    "t1_benign": "Tier 1 · normal traffic",
    "t1_attack": "Tier 1 · confident attack",
    "t2": "Tier 2 · escalated to Random Forest",
    "t3": "Tier 3 · escalated to the expert ensemble",
}

_cache: Optional[dict[str, list[dict[str, Any]]]] = None


def build_demo_flows(
    per_class_cap: int = 600,
    per_bucket: int = 10,
    seed: int = 7,
    detector: Optional[CascadeDetector] = None,
) -> dict[str, list[dict[str, Any]]]:
    """Scan the test split and return curated flows per bucket.

    Args:
        per_class_cap: Max rows sampled per true class (keeps the scan fast).
        per_bucket: Max flows kept for each playlist bucket.
        seed: RNG seed so the playlist is reproducible.
        detector: Optional pre-loaded detector.

    Returns:
        Mapping bucket → list of ``{id, true_label, features}`` records.

    Raises:
        FileNotFoundError: When the prepared test-split cache is missing.
    """
    detector = detector or get_detector()
    npz_path = Path(settings.DATA_CACHE_DIR) / "processed_data.npz"
    if not npz_path.exists():
        raise FileNotFoundError(f"Prepared test split not found at {npz_path}")

    rng = np.random.default_rng(seed)
    with np.load(npz_path, mmap_mode="r") as data:
        x_test = data["X_test"]
        y_test = np.asarray(data["y_test"])
        picked: list[int] = []
        for cls in np.unique(y_test):
            idx = np.where(y_test == cls)[0]
            if len(idx) > per_class_cap:
                idx = rng.choice(idx, size=per_class_cap, replace=False)
            picked.extend(int(i) for i in idx)
        picked_arr = np.array(sorted(picked))
        scaled = np.asarray(x_test[picked_arr])

    raw = detector.scaler.inverse_transform(scaled)
    feats = [dict(zip(detector.selected_features, map(float, row))) for row in raw]
    results = detector.detect_batch(feats)

    classes = list(detector.label_encoder.classes_)
    buckets: dict[str, list[dict[str, Any]]] = {k: [] for k in GUIDED_ORDER}
    order = rng.permutation(len(picked_arr))
    wrong_t2 = wrong_t3 = 0
    for pos in order:
        res = results[int(pos)]
        true_label = str(classes[int(y_test[picked_arr[pos]])])
        tier = int(res["tier"])
        correct = res["predicted_label"] == true_label
        is_benign = true_label.upper() == "BENIGN"
        if tier == 1:
            key = "t1_benign" if is_benign else "t1_attack"
            if not correct:
                continue
        elif tier == 2:
            key = "t2"
            if not correct:
                if wrong_t2 >= 2:
                    continue
                wrong_t2 += 1
        else:
            key = "t3"
            if not correct:
                if wrong_t3 >= 4:
                    continue
                wrong_t3 += 1
        if len(buckets[key]) >= per_bucket:
            continue
        buckets[key].append(
            {
                "id": f"{key}-{int(picked_arr[pos])}",
                "true_label": true_label,
                "features": feats[int(pos)],
            }
        )
        if all(len(v) >= per_bucket for v in buckets.values()):
            break

    # Diversify tier-1 attacks across classes (shuffle already random).
    return buckets


def save_demo_flows(buckets: dict[str, list[dict[str, Any]]], path: Path = DEMO_FILE) -> Path:
    """Persist the curated playlist to JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": 1, "buckets": buckets}), encoding="utf-8")
    return path


def load_demo_flows(build_if_missing: bool = True) -> dict[str, list[dict[str, Any]]]:
    """Load (and cache) the playlist, building a small one on first use if needed."""
    global _cache
    if _cache is not None:
        return _cache
    if DEMO_FILE.exists():
        payload = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
        _cache = payload["buckets"]
        return _cache
    if not build_if_missing:
        raise FileNotFoundError(str(DEMO_FILE))
    logger.info("Building cascade demo flows (first use)…")
    buckets = build_demo_flows(per_class_cap=400, per_bucket=8)
    save_demo_flows(buckets)
    _cache = buckets
    return _cache


def pick_flow(
    buckets: dict[str, list[dict[str, Any]]],
    *,
    mode: str,
    tier: Optional[int],
    cursor: int,
    rng: np.random.Generator,
) -> tuple[str, dict[str, Any]]:
    """Choose the next ``(bucket, flow)`` for guided/random playback."""
    if tier in (1, 2, 3):
        keys = {1: ["t1_benign", "t1_attack"], 2: ["t2"], 3: ["t3"]}[int(tier)]
        keys = [k for k in keys if buckets.get(k)]
        if not keys:
            raise LookupError(f"No demo flows available for tier {tier}")
        key = keys[cursor % len(keys)] if mode == "guided" else str(rng.choice(keys))
    elif mode == "random":
        keys = [k for k in GUIDED_ORDER if buckets.get(k)]
        if not keys:
            raise LookupError("No demo flows available")
        key = str(rng.choice(keys))
    else:
        keys = [k for k in GUIDED_ORDER if buckets.get(k)]
        if not keys:
            raise LookupError("No demo flows available")
        key = keys[cursor % len(keys)]

    pool = buckets[key]
    if mode == "guided":
        cycle = cursor // max(1, len(GUIDED_ORDER))
        flow = pool[cycle % len(pool)]
    else:
        flow = pool[int(rng.integers(0, len(pool)))]
    return key, flow
