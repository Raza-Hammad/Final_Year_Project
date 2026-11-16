"""Attack Lab API tests (Quick Lab sessions + scenario catalogue)."""

import time


def test_lab_requires_auth(client):
    assert client.get("/api/lab/scenarios").status_code == 401


def test_lab_scenarios_catalogue(client, auth_headers):
    body = client.get("/api/lab/scenarios", headers=auth_headers).json()
    assert body["checklist"] and body["scenarios"]
    for scenario in body["scenarios"]:
        # Unvalidated recipes must be flagged experimental; no filesystem paths leak.
        assert scenario["experimental"] == (not scenario["validated"])
        assert "quick_pcap" not in scenario
    blob = str(body).lower()
    assert "pcap" not in blob and "replay" not in blob and "recorded" not in blob


def test_lab_unknown_and_unavailable(client, auth_headers, monkeypatch):
    assert client.post(
        "/api/lab/sessions", json={"scenario_id": "nope"}, headers=auth_headers
    ).status_code == 404
    # A scenario whose capture file is missing on this machine is a clean 404.
    monkeypatch.setattr("app.routers.lab.resolve_quick_path", lambda scenario: None)
    assert client.post(
        "/api/lab/sessions", json={"scenario_id": "botnet_beacon"}, headers=auth_headers
    ).status_code == 404


def test_lab_blurbs_stay_neutral(client, auth_headers):
    blob = str(client.get("/api/lab/scenarios", headers=auth_headers).json()).lower()
    for word in ("synthetic", "generated", "fake", "simulated", "crafted"):
        assert word not in blob


def test_lab_quick_session_lifecycle(client, auth_headers):
    scenarios = client.get("/api/lab/scenarios", headers=auth_headers).json()["scenarios"]
    ready = [s for s in scenarios if s["quick_available"]]
    if not ready:
        return  # no captures on this machine
    client.post("/api/simulate/stop", headers=auth_headers)
    started = client.post(
        "/api/lab/sessions", json={"scenario_id": ready[0]["id"], "rate": 50}, headers=auth_headers
    )
    assert started.status_code == 201, started.text
    sid = started.json()["id"]
    assert started.json()["state"] == "running"

    # Engine mutex: a second start is refused.
    again = client.post(
        "/api/lab/sessions", json={"scenario_id": ready[0]["id"]}, headers=auth_headers
    )
    assert again.status_code == 409

    status = client.get("/api/lab/status", headers=auth_headers).json()
    assert status["active_session"] == sid
    assert "sensor" in status

    time.sleep(0.5)
    stopped = client.post(f"/api/lab/sessions/{sid}/stop", headers=auth_headers)
    assert stopped.status_code == 200 and stopped.json()["state"] == "stopped"


def test_lab_sensor_toggle_admin_only(client, auth_headers, admin_headers):
    assert client.post("/api/lab/live/enable", headers=auth_headers).status_code == 403
    on = client.post("/api/lab/live/enable", headers=admin_headers)
    assert on.status_code == 200 and on.json()["enabled"] is True
    off = client.post("/api/lab/live/disable", headers=admin_headers)
    assert off.json()["enabled"] is False
