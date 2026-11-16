"""
CICFlowMeter-style feature extraction for Cascadyx.

Only the 30 features listed in ``data/cache/features.json`` are produced —
these are the exact names ``CascadeDetector`` expects after training on
CIC-IDS2017 MachineLearningCSV exports.

---------------------------------------------------------------------------
Approximation notes vs official CICFlowMeter / ISCX labelled CSVs
---------------------------------------------------------------------------
This module re-implements a *practical subset* of CICFlowMeter statistics from
raw PCAPs. It is intentionally not a bit-identical port of the Java tool.

Documented deltas (honest for viva / report):

1. **Packet length**: Uses IPv4 ``total length`` when present (else frame
   length). CICFlowMeter/jNetPcap length semantics can differ slightly on
   truncated or VLAN-tagged frames.
2. **IAT units**: Inter-arrival times are reported in **microseconds**, matching
   CIC-IDS2017 CSV scale (``Fwd IAT Max``, ``Flow IAT Max``, ``Fwd IAT Std``,
   ``Idle Min`` means are O(1e6–1e7)).
3. **Header lengths** (``Fwd Header Length``, ``Fwd Header Length.1``,
   ``Bwd Header Length``): Sum of IP+L4 header bytes per direction. The
   published CIC CSVs contain known negative / corrupt header-length outliers;
   we emit non-negative sums (physically correct) and accept distribution shift.
4. **``Fwd Header Length.1``**: Duplicate of ``Fwd Header Length`` in the CIC
   feature set — we set both equal (same quirk as the training CSV).
5. **Subflow bytes**: Without CICFlowMeter's idle-based subflow split we set
   ``Subflow Fwd Bytes`` = ``Total Length of Fwd Packets`` and
   ``Subflow Bwd Bytes`` = ``Total Length of Bwd Packets``.
6. **Active / Idle**: Idle gaps use a 1.0s (1e6 µs) threshold, approximating
   CICFlowMeter's active/idle bulk separation. ``Idle Min`` is the minimum idle
   gap in µs (0 if no idle gap exists).
7. **``Average Packet Size`` / segment sizes**: Mean of packet lengths (all /
   fwd / bwd). CICFlowMeter's ``Average Packet Size`` sometimes uses a
   (total_length / total_packets) variant that can differ by one sample on
   edge cases; for our selected feature set the mean is an accepted proxy.
8. **``PSH Flag Count``**: Count of packets with TCP PSH set (UDP → 0).
9. **``act_data_pkt_fwd``**: Count of forward packets with payload_length > 0.
10. **Init window bytes**: TCP window from the *first* packet in that direction
    (0 for UDP or if that direction never appears).
11. **Short slices**: With ``max_packets`` caps, many flows are incomplete
    (missing teardown / reverse path). Features remain well-defined but will
    not match full-day CICFlowMeter rows for the same 5-tuple.
12. **No ground-truth labels**: PCAPs are unlabeled here; CascadeDetector
    predicts the class. Do not treat predictions on tiny slices as formal
    accuracy evaluation against CIC CSV labels.

Feature name strings MUST stay byte-identical to ``features.json`` (including
spaces, ``Init_Win_bytes_*``, and ``Fwd Header Length.1``).
"""

from __future__ import annotations

import json
import logging
import math
import statistics
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from app.config import settings
from app.pcap.flow_builder import Flow, FlowPacket

logger = logging.getLogger(__name__)

# CICFlowMeter-style active/idle boundary (microseconds).
_IDLE_THRESHOLD_US = 1_000_000.0


def load_selected_features(features_path: Optional[Path] = None) -> List[str]:
    """Load the ordered selected-feature name list used by CascadeDetector.

    Args:
        features_path: Optional override path. Defaults to
            ``{DATA_CACHE_DIR}/features.json``.

    Returns:
        Ordered list of feature name strings.
    """
    path = features_path or (Path(settings.DATA_CACHE_DIR) / "features.json")
    with open(path, "r", encoding="utf-8") as f:
        names = json.load(f)
    if not isinstance(names, list) or not names:
        raise ValueError(f"Invalid features list at {path}")
    return [str(n) for n in names]


def _mean(values: Sequence[float]) -> float:
    return float(statistics.mean(values)) if values else 0.0


def _std(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(statistics.pstdev(values))


def _var(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(statistics.pvariance(values))


def _iats_us(packets: Sequence[FlowPacket]) -> List[float]:
    """Consecutive inter-arrival times in microseconds for an ordered packet list."""
    if len(packets) < 2:
        return []
    out: List[float] = []
    for i in range(1, len(packets)):
        dt = (packets[i].timestamp - packets[i - 1].timestamp) * 1_000_000.0
        out.append(max(0.0, dt))
    return out


def _idle_gaps_us(all_packets: Sequence[FlowPacket]) -> List[float]:
    """Idle gaps (IAT > 1s) across the whole flow, in microseconds."""
    return [iat for iat in _iats_us(all_packets) if iat > _IDLE_THRESHOLD_US]


def extract_features(flow: Flow) -> Dict[str, float]:
    """Compute the 30 cascade-selected features for one bidirectional flow.

    Args:
        flow: Aggregated flow with one or more packets.

    Returns:
        Dict keyed by exact ``features.json`` names. Missing / undefined
        statistics default to ``0.0`` (CascadeDetector also defaults absent
        keys to 0.0).
    """
    if not flow.packets:
        return {name: 0.0 for name in load_selected_features()}

    ordered = sorted(flow.packets, key=lambda p: p.timestamp)
    fwd = [p for p in ordered if p.direction == "fwd"]
    bwd = [p for p in ordered if p.direction == "bwd"]

    all_lens = [float(p.packet_length) for p in ordered]
    fwd_lens = [float(p.packet_length) for p in fwd]
    bwd_lens = [float(p.packet_length) for p in bwd]

    duration_s = max(0.0, ordered[-1].timestamp - ordered[0].timestamp)
    # Avoid division by zero for single-packet / simultaneous bursts.
    duration_s_safe = duration_s if duration_s > 0.0 else 1e-6

    total_fwd_bytes = float(sum(fwd_lens))
    total_bwd_bytes = float(sum(bwd_lens))
    total_bytes = total_fwd_bytes + total_bwd_bytes

    fwd_header_sum = float(sum(p.header_length for p in fwd))
    bwd_header_sum = float(sum(p.header_length for p in bwd))

    fwd_iats = _iats_us(fwd)
    flow_iats = _iats_us(ordered)
    idle_gaps = _idle_gaps_us(ordered)

    init_win_fwd = float(fwd[0].tcp_window) if fwd else 0.0
    init_win_bwd = float(bwd[0].tcp_window) if bwd else 0.0

    psh_count = float(sum(1 for p in ordered if p.psh))
    act_data_pkt_fwd = float(sum(1 for p in fwd if p.payload_length > 0))

    fwd_pkt_mean = _mean(fwd_lens)
    bwd_pkt_mean = _mean(bwd_lens)

    features: Dict[str, float] = {
        "Max Packet Length": max(all_lens) if all_lens else 0.0,
        "Packet Length Variance": _var(all_lens),
        "Packet Length Std": _std(all_lens),
        "Avg Bwd Segment Size": bwd_pkt_mean,
        "Bwd Packet Length Max": max(bwd_lens) if bwd_lens else 0.0,
        "Total Length of Bwd Packets": total_bwd_bytes,
        # Approximation: no subflow split — equal to direction totals.
        "Subflow Fwd Bytes": total_fwd_bytes,
        "Subflow Bwd Bytes": total_bwd_bytes,
        "Average Packet Size": _mean(all_lens),
        "Total Length of Fwd Packets": total_fwd_bytes,
        "Fwd Packet Length Max": max(fwd_lens) if fwd_lens else 0.0,
        "Init_Win_bytes_forward": init_win_fwd,
        "Total Fwd Packets": float(len(fwd)),
        "Bwd Packet Length Std": _std(bwd_lens),
        "Packet Length Mean": _mean(all_lens),
        "Avg Fwd Segment Size": fwd_pkt_mean,
        "Fwd Packet Length Mean": fwd_pkt_mean,
        "Bwd Packet Length Mean": bwd_pkt_mean,
        "Flow Bytes/s": total_bytes / duration_s_safe,
        # Duplicate column quirk from CIC training schema.
        "Fwd Header Length.1": fwd_header_sum,
        "Bwd Packets/s": float(len(bwd)) / duration_s_safe,
        "Bwd Header Length": bwd_header_sum,
        "Fwd IAT Max": max(fwd_iats) if fwd_iats else 0.0,
        "PSH Flag Count": psh_count,
        "Idle Min": min(idle_gaps) if idle_gaps else 0.0,
        "Init_Win_bytes_backward": init_win_bwd,
        "Fwd Header Length": fwd_header_sum,
        "Flow IAT Max": max(flow_iats) if flow_iats else 0.0,
        "act_data_pkt_fwd": act_data_pkt_fwd,
        "Fwd IAT Std": _std(fwd_iats),
    }

    # Sanitize non-finite values (protect scaler / tree models).
    for key, val in list(features.items()):
        if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
            features[key] = 0.0
        else:
            features[key] = float(val)

    return features


def align_features(
    features: Dict[str, float],
    selected: Optional[Sequence[str]] = None,
) -> Dict[str, float]:
    """Return an ordered dict covering exactly the selected feature names.

    Args:
        features: Raw extracted mapping (may contain extras).
        selected: Feature name order; loads from cache when None.

    Returns:
        Dict with every selected feature present (missing → 0.0).
    """
    names = list(selected) if selected is not None else load_selected_features()
    return {name: float(features.get(name, 0.0)) for name in names}
