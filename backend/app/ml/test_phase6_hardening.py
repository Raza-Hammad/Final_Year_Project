"""Phase 6 production-hardening smoke tests.

Covers: PCAP analyze API (tiny slice), rate-limit wiring, error envelope,
JWT logout revoke limitation surface, and batch detect via pipeline path.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.config import settings


def _write_tiny_pcap(dest: Path) -> Path:
    scapy = pytest.importorskip("scapy.all")
    IP, TCP, Ether, wrpcap = scapy.IP, scapy.TCP, scapy.Ether, scapy.wrpcap
    pkts = []
    for i in range(4):
        pkts.append(
            Ether()
            / IP(src="10.0.0.1", dst="10.0.0.2")
            / TCP(sport=41000 + i, dport=80, flags="PA", seq=i * 10)
            / (b"a" * 32)
        )
        pkts.append(
            Ether()
            / IP(src="10.0.0.2", dst="10.0.0.1")
            / TCP(sport=80, dport=41000 + i, flags="PA", seq=i * 10, ack=(i + 1) * 10)
            / (b"b" * 48)
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    wrpcap(str(dest), pkts)
    return dest


@pytest.fixture
def tiny_pcap_for_api():
    dest = Path(settings.DATA_RAW_DIR) / "captures" / "_pytest_tiny_analyze.pcap"
    _write_tiny_pcap(dest)
    yield dest
    if dest.exists():
        dest.unlink()


def test_pcap_analyze_api_tiny_slice_golden(client, admin_headers, tiny_pcap_for_api):
    """End-to-end /api/pcap/analyze on a tiny synthetic PCAP (no multi-GB day file)."""
    rel = f"captures/{tiny_pcap_for_api.name}"
    resp = client.post(
        "/api/pcap/analyze",
        headers={**admin_headers, "Content-Type": "application/json"},
        json={
            "pcap_path": rel,
            "max_packets": 50,
            "persist_alerts": False,
            "broadcast": False,
            "source_scenario": "pcap_phase6_smoke",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["packets_parsed"] > 0
    assert body["flows_built"] >= 1
    assert isinstance(body.get("label_counts"), dict)
    assert body.get("requested_by") == "admin"
    # Detections summary present without requiring a specific attack class.
    detections = body.get("detections") or body.get("results") or []
    assert len(detections) >= 1 or sum(body["label_counts"].values()) >= 1


def test_pcap_analyze_rejects_path_escape(client, admin_headers):
    resp = client.post(
        "/api/pcap/analyze",
        headers={**admin_headers, "Content-Type": "application/json"},
        json={"pcap_path": "../outside.pcap", "max_packets": 10, "persist_alerts": False},
    )
    assert resp.status_code in (400, 404)
    payload = resp.json()
    assert "detail" in payload
    assert payload.get("error") == "http_error"
    assert payload.get("status_code") == resp.status_code


def test_validation_error_envelope(client, auth_headers):
    """Malformed predict body returns consistent validation envelope."""
    resp = client.post(
        "/api/predict",
        headers=auth_headers,
        json={"features": "not-a-dict"},
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "validation_error"
    assert body["status_code"] == 422
    assert "detail" in body
    assert "X-Request-ID" in resp.headers


def test_sensitive_routes_are_rate_limited():
    """Sanity: Phase 6 sensitive handlers are wrapped by slowapi (``__wrapped__``)."""
    from app import main as main_mod

    limited = [
        main_mod.predict_flow,
        main_mod.chat_assistant,
        main_mod.explain_packet,
        main_mod.export_alerts,
        main_mod.simulate_start,
        main_mod.simulate_replay_start,
        main_mod.pcap_analyze,
        main_mod.register_user,
        main_mod.login_user,
    ]
    for fn in limited:
        assert hasattr(fn, "__wrapped__"), f"{fn.__name__} missing rate-limit wrap"


def test_logout_revokes_token_in_process(client):
    """JWT revoke works until process restart (documented known limitation)."""
    username, password = f"revoke_user_{int(time.time())}", "SecurePassword!321"
    reg = client.post("/api/auth/register", json={"username": username, "password": password})
    assert reg.status_code == 201, reg.text
    login = client.post("/api/auth/login", data={"username": username, "password": password})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/users/me", headers=headers)
    assert me.status_code == 200

    logout = client.post("/api/auth/logout", headers=headers)
    assert logout.status_code == 200

    me_after = client.get("/api/users/me", headers=headers)
    assert me_after.status_code == 401


def test_pipeline_batch_detect_on_synthetic_flows():
    """PCAP pipeline uses detect_batch when available (Phase 5/6 integration)."""
    from app.ml.cascade import CascadeDetector
    from app.pcap.feature_extractor import align_features, extract_features
    from app.pcap.flow_builder import build_flows
    from app.pcap.parser import PacketRecord

    def pkt(ts, src, dst, sport, dport, length):
        return PacketRecord(
            timestamp=ts,
            src_ip=src,
            dst_ip=dst,
            src_port=sport,
            dst_port=dport,
            protocol=6,
            packet_length=length,
            header_length=40,
            payload_length=max(0, length - 40),
            tcp_flags=0x18,
            tcp_window=8192,
            psh=True,
            fin_or_rst=False,
        )

    packets = [
        pkt(1.0, "10.1.1.1", "10.1.1.2", 443, 50001, 100),
        pkt(1.01, "10.1.1.2", "10.1.1.1", 50001, 443, 200),
        pkt(2.0, "10.1.1.3", "10.1.1.4", 80, 50002, 120),
        pkt(2.01, "10.1.1.4", "10.1.1.3", 50002, 80, 220),
    ]
    flows = list(build_flows(packets))
    assert len(flows) == 2
    rows = [align_features(extract_features(f)) for f in flows]
    detector = CascadeDetector(confidence_threshold=0.85)
    batch = detector.detect_batch(rows)
    assert len(batch) == 2
    for item in batch:
        assert "predicted_label" in item
        assert item["tier"] in (1, 2, 3)


def test_health_still_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_rbac_pcap_and_export_allow_analyst(client, auth_headers):
    """Student learning routes accept analyst tokens (not 403); bad paths still 4xx."""
    r = client.post(
        "/api/pcap/analyze",
        headers={**auth_headers, "Content-Type": "application/json"},
        json={"pcap_path": "captures/x.pcap", "max_packets": 5},
    )
    assert r.status_code != 403
    assert r.status_code in (400, 404)
    assert r.json().get("error") == "http_error"

    r = client.get("/api/alerts/export?format=csv", headers=auth_headers)
    assert r.status_code == 200
