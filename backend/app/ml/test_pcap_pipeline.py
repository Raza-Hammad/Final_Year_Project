"""Focused smoke tests for the Phase 1 PCAP processing layer.

These tests avoid loading multi-GB CIC day captures. Synthetic PacketRecord
streams exercise flow building + feature alignment; an optional live PCAP
smoke reads at most a tiny packet cap when the Friday capture is present.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings
from app.pcap.feature_extractor import align_features, extract_features, load_selected_features
from app.pcap.flow_builder import build_flows
from app.pcap.parser import PacketRecord


def _pkt(
    ts: float,
    src: str,
    dst: str,
    sport: int,
    dport: int,
    length: int,
    *,
    proto: int = 6,
    header: int = 40,
    payload: int = None,
    window: int = 29200,
    psh: bool = False,
    fin: bool = False,
) -> PacketRecord:
    if payload is None:
        payload = max(0, length - header)
    return PacketRecord(
        timestamp=ts,
        src_ip=src,
        dst_ip=dst,
        src_port=sport,
        dst_port=dport,
        protocol=proto,
        packet_length=length,
        header_length=header,
        payload_length=payload,
        tcp_flags=0x08 if psh else (0x01 if fin else 0x02),
        tcp_window=window,
        psh=psh,
        fin_or_rst=fin,
    )


def test_selected_features_match_cache():
    names = load_selected_features()
    assert len(names) == 30
    assert "Fwd Header Length.1" in names
    assert "Init_Win_bytes_forward" in names


def test_flow_builder_merges_bidirectional_and_extracts_aligned_features():
    packets = [
        _pkt(1.0, "192.168.10.50", "192.168.10.51", 443, 50000, 60, psh=False),
        _pkt(1.001, "192.168.10.51", "192.168.10.50", 50000, 443, 1500, psh=True, window=8192),
        _pkt(1.002, "192.168.10.50", "192.168.10.51", 443, 50000, 100, psh=True),
        _pkt(1.010, "192.168.10.50", "192.168.10.51", 443, 50000, 40, fin=True, payload=0),
    ]
    flows = list(build_flows(packets))
    assert len(flows) == 1
    flow = flows[0]
    assert flow.src_ip == "192.168.10.50"
    assert any(p.direction == "bwd" for p in flow.packets)

    selected = load_selected_features()
    features = align_features(extract_features(flow), selected)
    assert list(features.keys()) == selected
    assert features["Total Fwd Packets"] == 3.0
    assert features["PSH Flag Count"] >= 1.0
    assert features["Init_Win_bytes_forward"] == 29200.0
    assert features["Init_Win_bytes_backward"] == 8192.0
    assert features["Fwd Header Length"] == features["Fwd Header Length.1"]
    assert features["Subflow Fwd Bytes"] == features["Total Length of Fwd Packets"]
    assert features["Max Packet Length"] == 1500.0
    # Golden slice: total lengths / header sums stay deterministic for this fixture.
    assert features["Total Length of Fwd Packets"] == 60.0 + 100.0 + 40.0
    assert features["Fwd Header Length"] == 40.0 * 3
    assert features["Bwd Header Length"] == 40.0 * 1
    assert features["act_data_pkt_fwd"] == 2.0  # fin packet has payload_length=0


def test_cascade_accepts_pcap_extracted_features():
    packets = [
        _pkt(10.0, "10.0.0.1", "10.0.0.2", 80, 12345, 64),
        _pkt(10.01, "10.0.0.1", "10.0.0.2", 80, 12345, 64),
    ]
    flow = list(build_flows(packets))[0]
    features = align_features(extract_features(flow))

    from app.ml.cascade import CascadeDetector

    detector = CascadeDetector(confidence_threshold=0.85)
    result = detector.detect(features)
    assert "predicted_label" in result
    assert result["tier"] in (1, 2, 3)
    assert 0.0 <= result["confidence"] <= 1.0


@pytest.mark.skipif(
    not (Path(settings.DATA_RAW_DIR) / "PCAPs" / "Friday-WorkingHours.pcap").is_file(),
    reason="Friday-WorkingHours.pcap not present under data/raw/PCAPs",
)
def test_live_friday_pcap_tiny_slice_smoke():
    """Parse only a handful of packets from the real CIC Friday capture."""
    scapy = pytest.importorskip("scapy")
    _ = scapy  # silence unused if importorskip returns module

    from app.pcap.pipeline import run_pipeline

    pcap = Path(settings.DATA_RAW_DIR) / "PCAPs" / "Friday-WorkingHours.pcap"
    result = run_pipeline(
        pcap_path=pcap,
        max_packets=50,
        persist_alerts=False,
        broadcast=False,
        source_scenario="pcap_smoke",
    )
    assert result.packets_parsed > 0
    assert result.flows_built >= 1
    assert len(result.detections) >= 1
    assert sum(result.label_counts.values()) == len(result.detections)
