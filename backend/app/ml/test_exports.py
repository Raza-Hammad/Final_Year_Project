def test_smote_stats(client, auth_headers):
    resp = client.get("/api/data/smote-stats", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "before_smote" in body
    assert "after_smote" in body


def test_smote_stats_requires_auth(client):
    resp = client.get("/api/data/smote-stats")
    assert resp.status_code == 401


def test_csv_export(client, auth_headers):
    resp = client.get("/api/alerts/export?format=csv", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    first_line = resp.text.split("\n")[0]
    assert "--- AI SOC TELEMETRY EXPORT REPORT ---" in first_line


def test_pdf_export(client, auth_headers):
    resp = client.get("/api/alerts/export?format=pdf", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.content[:4] == b"%PDF"
