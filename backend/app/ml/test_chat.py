def test_chat_rule_based_qa(client, auth_headers):
    resp = client.post("/api/chat", json={"message": "how does the cascade work?"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "Rule-Based", f"Expected Rule-Based source, got {body['source']}"
    assert body["answer"]


def test_chat_explain_last_alert(client, auth_headers):
    resp = client.post("/api/chat", json={"message": "can you explain the latest alert?"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    answer = resp.json()["answer"].lower()
    assert "latest logged alert" in answer or "no alerts have been recorded" in answer
