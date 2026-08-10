from app.ml.cascade import CascadeDetector

KNOWN_CLASSES = {
    "BENIGN", "Bot", "DDoS", "DoS GoldenEye", "DoS Hulk", "DoS Slowhttptest",
    "DoS slowloris", "FTP-Patator", "Heartbleed", "Infiltration", "PortScan",
    "SSH-Patator", "Web Attack - Brute Force", "Web Attack - Sql Injection",
    "Web Attack - XSS",
}

# Mock benign-looking traffic (low values)
BENIGN_FLOW = {
    "Max Packet Length": 64.0, "Packet Length Variance": 0.0, "Packet Length Std": 0.0,
    "Avg Bwd Segment Size": 0.0, "Bwd Packet Length Max": 0.0, "Total Length of Bwd Packets": 0.0,
    "Subflow Fwd Bytes": 128.0, "Subflow Bwd Bytes": 0.0, "Average Packet Size": 32.0,
    "Total Length of Fwd Packets": 128.0, "Fwd Packet Length Max": 64.0, "Init_Win_bytes_forward": 256.0,
    "Total Fwd Packets": 2.0, "Bwd Packet Length Std": 0.0, "Packet Length Mean": 32.0,
    "Avg Fwd Segment Size": 64.0, "Fwd Packet Length Mean": 64.0, "Bwd Packet Length Mean": 0.0,
    "Flow Bytes/s": 1000.0, "Fwd Header Length.1": 40.0, "Bwd Packets/s": 0.0,
    "Bwd Header Length": 0.0, "Fwd IAT Max": 10.0, "PSH Flag Count": 0.0, "Idle Min": 0.0,
    "Init_Win_bytes_backward": 0.0, "Fwd Header Length": 40.0, "Flow IAT Max": 10.0,
    "act_data_pkt_fwd": 1.0, "Fwd IAT Std": 0.0,
}

# Mock DDoS/PortScan-looking traffic (high packets/s, high lengths, high IAT)
DDOS_FLOW = {
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
}


def _assert_valid_cascade_result(result: dict):
    assert result["predicted_label"] in KNOWN_CLASSES
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["tier"] in (1, 2, 3)
    assert result["tier_name"]
    assert len(result["top_features"]) > 0
    for feat in result["top_features"]:
        assert "feature" in feat and "value" in feat and "importance" in feat and "impact" in feat


def test_cascade_initializes_and_loads_real_trained_models():
    detector = CascadeDetector(confidence_threshold=0.85)
    assert detector.models["lightgbm"] is not None
    assert detector.models["random_forest"] is not None
    assert detector.models["xgboost"] is not None
    assert len(detector.selected_features) == 30


def test_cascade_classifies_benign_and_threat_flows():
    detector = CascadeDetector(confidence_threshold=0.85)

    benign_result = detector.detect(BENIGN_FLOW, threshold=0.85)
    _assert_valid_cascade_result(benign_result)

    ddos_result = detector.detect(DDOS_FLOW, threshold=0.85)
    _assert_valid_cascade_result(ddos_result)
