import time


def test_simulate_status_initially_idle(client, auth_headers):
    resp = client.get("/api/simulate/status", headers=auth_headers)
    assert resp.status_code == 200, resp.text


def test_simulate_start_stop_lifecycle_and_telemetry(client, auth_headers):
    token = auth_headers["Authorization"].split(" ", 1)[1]

    with client.websocket_connect(f"/ws/live?token={token}") as websocket:
        start_resp = client.post(
            "/api/simulate/start",
            json={"scenario": "ddos_storm", "rate": 5, "duration_seconds": 3},
            headers=auth_headers,
        )
        assert start_resp.status_code == 200, start_resp.text
        # Legacy alias should resolve to its canonical scenario.
        assert start_resp.json()["scenario"] == "ddos_storm"

        detections_seen = 0
        deadline = time.time() + 6
        while time.time() < deadline and detections_seen < 1:
            event = websocket.receive_json()
            if event.get("event") == "detection":
                detections_seen += 1

        assert detections_seen > 0, "Simulator did not broadcast any detection events"

    status_resp = client.get("/api/simulate/status", headers=auth_headers)
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["packets_sent"] > 0

    # Ensure it's stopped so it doesn't leak into other tests.
    client.post("/api/simulate/stop", headers=auth_headers)


def test_simulate_start_rejects_unknown_scenario(client, auth_headers):
    resp = client.post(
        "/api/simulate/start",
        json={"scenario": "not_a_real_scenario", "rate": 5},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_simulate_start_rejects_excessive_rate(client, auth_headers):
    resp = client.post(
        "/api/simulate/start",
        json={"scenario": "benign_baseline", "rate": 999999},
        headers=auth_headers,
    )
    assert resp.status_code == 400
