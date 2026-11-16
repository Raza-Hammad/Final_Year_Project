"""Build the slim, git-committable runtime bundle used by free-tier hosting.

Why this exists
---------------
``data/`` is gitignored (the trained models are binary, ``processed_data.npz`` is
~266 MB and ``data/raw`` is ~52 GB), so a platform that builds from GitHub
(Render, Hugging Face Spaces, ...) would have **no models** and Cascadyx would boot
in a degraded state. This script copies only what the *running* app needs into
``deploy/data/`` (a few tens of MB) so the repo itself is deployable:

* ``deploy/data/cache`` -- production (mid-baseline) models, scaler, encoder,
  feature list, metrics JSON, demo flows and a **slim** ``processed_data.npz``
  that keeps only a per-class-capped sample of ``X_test`` / ``y_test`` (the
  simulator and cascade demo read nothing else; training arrays are emitted empty).
* ``deploy/data/raw`` -- the small recorded Quick Lab / replay captures.

It never copies ``app.db`` (local users) or any ``.env`` file.

Usage (repo root, backend venv active)::

    python scripts/build_deploy_bundle.py
    python scripts/build_deploy_bundle.py --max-per-class 2000 --out deploy/data

Re-run after retraining the models, then commit ``deploy/``.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]

CACHE_FILES: tuple[str, ...] = (
    "scaler.joblib",
    "label_encoder.joblib",
    "features.json",
    "benign_averages.json",
    "smote_stats.json",
    "cascade_demo_flows.json",
    "models/lightgbm.joblib",
    "models/random_forest.joblib",
    "models/xgboost.joblib",
    "models/active_variant.json",
    "models/hardened/EXPERIMENTAL.json",
)


def _copy(src: Path, dst: Path) -> None:
    """Copy one file, creating parent folders; fail loudly if the source is missing."""
    if not src.is_file():
        raise FileNotFoundError(f"Required runtime artifact missing: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def build_slim_npz(src_npz: Path, dst_npz: Path, max_per_class: int, seed: int = 42) -> dict[int, int]:
    """Write a compressed npz with a per-class-capped ``X_test`` / ``y_test`` sample.

    Args:
        src_npz: Full ``processed_data.npz`` (needs ``X_test`` and ``y_test``).
        dst_npz: Output path.
        max_per_class: Cap per class index; rare classes are kept in full.
        seed: RNG seed so the bundle is reproducible.

    Returns:
        Mapping of class index -> rows kept.
    """
    with np.load(src_npz) as data:
        x_test = data["X_test"]
        y_test = data["y_test"]
    rng = np.random.default_rng(seed)
    keep: list[np.ndarray] = []
    kept_per_class: dict[int, int] = {}
    for cls in np.unique(y_test):
        idx = np.where(y_test == cls)[0]
        if len(idx) > max_per_class:
            idx = rng.choice(idx, size=max_per_class, replace=False)
        keep.append(np.sort(idx))
        kept_per_class[int(cls)] = int(len(idx))
    sel = np.concatenate(keep)
    dst_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        dst_npz,
        X_train=np.empty((0, x_test.shape[1]), dtype=x_test.dtype),
        y_train=np.empty((0,), dtype=y_test.dtype),
        X_test=x_test[sel],
        y_test=y_test[sel],
    )
    return kept_per_class


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--src", type=Path, default=REPO_ROOT / "data", help="Full data dir (default: ./data)")
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "deploy" / "data", help="Bundle dir")
    parser.add_argument("--max-per-class", type=int, default=3000, help="X_test rows kept per class")
    args = parser.parse_args()

    src_cache = args.src / "cache"
    src_raw = args.src / "raw"
    out_cache = args.out / "cache"
    out_raw = args.out / "raw"

    if args.out.exists():
        shutil.rmtree(args.out)

    for rel in CACHE_FILES:
        _copy(src_cache / rel, out_cache / rel)

    metrics_dir = src_cache / "metrics"
    for js in sorted(metrics_dir.glob("*.json")):
        _copy(js, out_cache / "metrics" / js.name)

    kept = build_slim_npz(
        src_cache / "processed_data.npz",
        out_cache / "processed_data.npz",
        max_per_class=args.max_per_class,
    )

    lab = src_raw / "lab"
    if lab.is_dir():
        for f in lab.rglob("*"):
            if f.is_file():
                _copy(f, out_raw / "lab" / f.relative_to(lab))
    captures = src_raw / "captures"
    if captures.is_dir():
        for f in captures.glob("*.pcap*"):
            _copy(f, out_raw / "captures" / f.name)

    total = sum(f.stat().st_size for f in args.out.rglob("*") if f.is_file())
    print(f"Bundle written to {args.out}  ({total / 1_048_576:.1f} MB)")
    print(f"X_test rows kept per class index: {kept}")
    biggest = sorted(
        (f for f in args.out.rglob("*") if f.is_file()), key=lambda p: p.stat().st_size, reverse=True
    )[:5]
    for f in biggest:
        print(f"  {f.stat().st_size / 1_048_576:6.1f} MB  {f.relative_to(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
