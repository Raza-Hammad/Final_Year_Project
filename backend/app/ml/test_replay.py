"""Focused smoke tests for Phase 2 isolated PCAP Live Replay."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.config import settings


def _write_tiny_pcap(dest: Path) -> Path:
    """Write a few synthetic TCP packets under DATA_RAW_DIR for API smoke."""
    scapy = pytest.importorskip("scapy.all")
    IP, TCP, Ether, wrpcap = scapy.IP, scapy.TCP, scapy.Ether, scapy.wrpcap

    pkts = []
    for i in range(6):
        sport, dport = 40000 + i, 80
        pkts.append(
            Ether()
            / IP(src="10.0.0.1", dst="10.0.0.2")
            / TCP(sport=sport, dport=dport, flags="PA", seq=i * 10)
            / (b"x" * 40)
        )
        pkts.append(
            Ether()
            / IP(src="10.0.0.2", dst="10.0.0.1")
            / TCP(sport=dport, dport=sport, flags="PA", seq=i * 10, ack=(i + 1) * 10)
            / (b"y" * 60)
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    wrpcap(str(dest), pkts)
    return dest


@pytest.fixture
def tiny_capture(tmp_path_factory):
    """Tiny PCAP under DATA_RAW_DIR/captures for path-safe API tests."""
    dest = Path(settings.DATA_RAW_DIR) / "captures" / "_pytest_tiny_replay.pcap"
    _write_tiny_pcap(dest)
    yield dest
    if dest.exists():
        dest.unlink()


def test_simulate_status_includes_mode_fields(client, auth_headers):
    resp = client.get("/api/simulate/status", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "mode" in body
    assert body["mode"] in {"idle", "csv", "replay"}
    assert "packets_parsed" in body
    assert "flows_built" in body
    assert "safety_banner" in body
    assert "live attack" in body["safety_banner"].lower() or "recorded" in body["safety_banner"].lower()


def test_replay_start_stop_lifecycle(client, admin_headers, tiny_capture):
    client.post("/api/simulate/stop", headers=admin_headers)
    client.post("/api/simulate/replay/stop", headers=admin_headers)

    rel = f"captures/{tiny_capture.name}"
    start = client.post(
        "/api/simulate/replay/start",
        json={
            "pcap_path": rel,
            "max_packets": 50,
            "rate": 20,
            "duration_seconds": 5,
            "source_scenario": "isolated_replay",
        },
        headers=admin_headers,
    )
    assert start.status_code == 200, start.text
    payload = start.json()
    assert payload["mode"] == "replay"
    assert "safety_banner" in payload

    # Poll until at least one flow streamed or replay finishes.
    deadline = time.time() + 8
    status = {}
    while time.time() < deadline:
        status = client.get("/api/simulate/status", headers=admin_headers).json()
        if status.get("packets_sent", 0) > 0 or status.get("mode") == "idle":
            break
        time.sleep(0.2)

    assert status.get("packets_parsed", 0) > 0 or status.get("packets_sent", 0) > 0
    # While running, mode should be replay; after completion mode returns to idle.
    if status.get("running"):
        assert status["mode"] == "replay"
        assert status.get("source")

    stop = client.post("/api/simulate/replay/stop", headers=admin_headers)
    assert stop.status_code == 200, stop.text

    final = client.get("/api/simulate/status", headers=admin_headers).json()
    assert final["running"] is False
    assert final["mode"] == "idle"


def test_replay_rejects_path_outside_data_raw(client, admin_headers):
    resp = client.post(
        "/api/simulate/replay/start",
        json={"pcap_path": "../outside.pcap", "max_packets": 10, "rate": 5},
        headers=admin_headers,
    )
    assert resp.status_code in (400, 404)


def test_replay_mutex_with_csv(client, admin_headers, tiny_capture):
    client.post("/api/simulate/stop", headers=admin_headers)

    csv_start = client.post(
        "/api/simulate/start",
        json={"scenario": "benign_baseline", "rate": 5, "duration_seconds": 10},
        headers=admin_headers,
    )
    assert csv_start.status_code == 200, csv_start.text

    rel = f"captures/{tiny_capture.name}"
    replay_start = client.post(
        "/api/simulate/replay/start",
        json={"pcap_path": rel, "max_packets": 20, "rate": 5},
        headers=admin_headers,
    )
    assert replay_start.status_code == 400, replay_start.text

    client.post("/api/simulate/stop", headers=admin_headers)
