from app.ml.severity import compute_severity


def test_predict_persists_alert_with_correct_severity(client, auth_headers, real_threat_features):
    resp = client.post(
        "/api/predict",
        json={"features": real_threat_features, "source_scenario": "simulation"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    verdict = body["predicted_label"]
    confidence = body["confidence"]

    assert "severity" in body
    expected_severity = compute_severity(verdict, confidence)
    assert body["severity"] == expected_severity


def test_alert_history_includes_severity(client, auth_headers, real_threat_features):
    # Ensure at least one alert exists before checking the history list.
    client.post(
        "/api/predict",
        json={"features": real_threat_features, "source_scenario": "simulation"},
        headers=auth_headers,
    )

    resp = client.get("/api/alerts?page=1&limit=10", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    alerts = resp.json()
    assert len(alerts) > 0, "No alerts populated in history list"
    assert "severity" in alerts[0]
