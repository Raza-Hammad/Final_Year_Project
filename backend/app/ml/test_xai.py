MOCK_FEATURES = {
    "Max Packet Length": 435.0, "Packet Length Variance": 2240.5, "Packet Length Std": 47.33,
    "Avg Bwd Segment Size": 128.5, "Bwd Packet Length Max": 350.0, "Total Length of Bwd Packets": 1000.0,
    "Subflow Fwd Bytes": 150.0, "Subflow Bwd Bytes": 1000.0, "Average Packet Size": 95.0,
    "Total Length of Fwd Packets": 150.0, "Fwd Packet Length Max": 150.0, "Init_Win_bytes_forward": 29200.0,
    "Total Fwd Packets": 3.0, "Bwd Packet Length Std": 20.0, "Packet Length Mean": 95.0,
    "Avg Fwd Segment Size": 50.0, "Fwd Packet Length Mean": 50.0, "Bwd Packet Length Mean": 125.0,
    "Flow Bytes/s": 4500.0, "Fwd Header Length.1": 60.0, "Bwd Packets/s": 15.0,
    "Bwd Header Length": 60.0, "Fwd IAT Max": 100000.0, "PSH Flag Count": 1.0, "Idle Min": 0.0,
    "Init_Win_bytes_backward": 29200.0, "Fwd Header Length": 60.0, "Flow IAT Max": 100000.0,
    "act_data_pkt_fwd": 2.0, "Fwd IAT Std": 25000.0,
}


def test_xai_explain_returns_attributions_with_benign_averages(client, auth_headers):
    payload = {
        "predicted_label": "DDoS",
        "confidence": 0.985,
        "tier": 1,
        "features": MOCK_FEATURES,
    }
    resp = client.post("/api/xai/explain", json=payload, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    top_features = body.get("top_features", [])
    assert len(top_features) >= 3, "should return at least 3 attributing features"
    for feat in top_features:
        assert "benign_avg" in feat, "benign_avg is missing from feature dict!"

    assert body.get("explanation"), "explanation string is missing or empty!"
