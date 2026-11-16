"""Cascade demo endpoint + detect(trace=True) tests."""


def test_detect_trace_shape(real_threat_features):
    from app.ml.cascade import get_detector

    result = get_detector().detect(real_threat_features, trace=True)
    trace = result["trace"]
    assert [row["tier"] for row in trace] == [1, 2, 3]
    assert trace[0]["reached"] is True and 0.0 <= trace[0]["confidence"] <= 1.0
    # Tiers beyond the resolving one are marked unreached.
    resolved = result["tier"]
    for row in trace:
        assert row["reached"] == (row["tier"] <= resolved)
    # Default call stays unchanged (no trace key).
    assert "trace" not in get_detector().detect(real_threat_features)


def test_demo_next_requires_auth(client):
    assert client.get("/api/cascade/demo/next").status_code == 401


def test_demo_guided_cycle_and_no_alert_side_effects(client, auth_headers):
    before = client.get("/api/alerts", headers=auth_headers).json()
    count_before = len(before) if isinstance(before, list) else before.get("total", 0)

    tiers = []
    for cursor in range(4):
        resp = client.get(f"/api/cascade/demo/next?mode=guided&cursor={cursor}", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["demo"] is True and body["trace"]
        assert body["next_cursor"] == cursor + 1
        tiers.append(body["tier"])
    assert tiers[0] == 1 and tiers[1] == 1

    after = client.get("/api/alerts", headers=auth_headers).json()
    count_after = len(after) if isinstance(after, list) else after.get("total", 0)
    assert count_before == count_after


def test_demo_tier_filter_and_validation(client, auth_headers):
    resp = client.get("/api/cascade/demo/next?mode=random&tier=3", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["bucket"] == "t3"
    assert client.get("/api/cascade/demo/next?tier=9", headers=auth_headers).status_code == 422
