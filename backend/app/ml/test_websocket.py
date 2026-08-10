THREAT_PAYLOAD = {
    "features": {
        "Max Packet Length": 1500.0, "Packet Length Variance": 25000.0, "Packet Length Std": 158.0,
        "Avg Bwd Segment Size": 750.0, "Bwd Packet Length Max": 1500.0, "Total Length of Bwd Packets": 30000.0,
        "Subflow Fwd Bytes": 1500.0, "Subflow Bwd Bytes": 30000.0, "Average Packet Size": 700.0,
        "Total Length of Fwd Packets": 1500.0, "Fwd Packet Length Max": 1500.0, "Init_Win_bytes_forward": 29200.0,
        "Total Fwd Packets": 10.0, "Bwd Packet Length Std": 100.0, "Packet Length Mean": 500.0,
        "Avg Fwd Segment Size": 150.0, "Fwd Packet Length Mean": 150.0, "Bwd Packet Length Mean": 750.0,
        "Flow Bytes/s": 5000000.0, "Fwd Header Length.1": 200.0, "Bwd Packets/s": 5000.0,
        "Bwd Header Length": 200.0, "Fwd IAT Max": 5.0, "PSH Flag Count": 1.0, "Idle Min": 0.0,
        "Init_Win_bytes_backward": 29200.0, "Fwd Header Length": 200.0, "Flow IAT Max": 5.0,
        "act_data_pkt_fwd": 8.0, "Fwd IAT Std": 1.0,
    },
    "source_scenario": "websocket_live_unit_test",
}


def test_websocket_rejects_missing_token(client):
    # Starlette raises WebSocketDisconnect client-side when the server closes
    # the handshake before accept() -- this is the expected rejection path.
    from starlette.websockets import WebSocketDisconnect
    try:
        with client.websocket_connect("/ws/live"):
            pass
        assert False, "Expected the connection to be rejected without a token"
    except WebSocketDisconnect as exc:
        assert exc.code == 1008


def test_websocket_receives_broadcast_detection(client, auth_headers):
    token = auth_headers["Authorization"].split(" ", 1)[1]
    with client.websocket_connect(f"/ws/live?token={token}") as websocket:
        resp = client.post("/api/predict", json=THREAT_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 200, resp.text

        # A heartbeat could in principle arrive first -- keep reading until we see
        # the detection broadcast triggered by the POST above, or give up.
        for _ in range(10):
            event = websocket.receive_json()
            if event.get("event") == "detection":
                assert event["data"]["predicted_label"]
                assert "top_features" in event["data"]
                return
        assert False, "Did not receive a 'detection' broadcast event in time"
