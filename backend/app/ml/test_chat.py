def test_chat_rule_based_qa(client, auth_headers, monkeypatch):
    """Cascade keyword Q&A uses the Rule-Based path when Nebius is unavailable.

    Clears Nebius availability for this test so a live NEBIUS_API_KEY env does not
    route the same prompt through AI Nebius and break the Rule-Based assertion.
    """
    from app.main import nebius_client

    monkeypatch.setattr(nebius_client, "api_key", None)
    monkeypatch.setattr(nebius_client, "_client", None)

    resp = client.post(
        "/api/chat",
        json={"message": "how does the cascade work?"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "Rule-Based", f"Expected Rule-Based source, got {body['source']}"
    assert body["answer"]


def test_chat_cascade_qa_accepts_live_or_rule_based(client, auth_headers):
    """With whatever chat backend is configured, cascade Q&A still returns an answer."""
    resp = client.post(
        "/api/chat",
        json={"message": "how does the cascade work?"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] in {"Rule-Based", "AI", "AI Nebius", "Error Fallback", "Offline Fallback"}
    assert body["answer"]
    assert "ai_queries_remaining" in body
    assert "ai_query_limit" in body


def test_chat_status_hides_provider(client, auth_headers):
    """Status exposes availability + quota only — never model/provider brand strings."""
    resp = client.get("/api/chat/status", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "ai_available" in body
    assert body["status"] in {"AI available", "AI offline"}
    assert body["mode"] in {"ai", "rule-based"}
    assert "ai_queries_remaining" in body
    assert body["ai_query_limit"] == 10
    assert "nebius" not in body
    assert "model" not in body
    assert "provider" not in body
    blob = str(body).lower()
    assert "nebius" not in blob
    assert "qwen" not in blob


def test_ai_quota_rule_based_does_not_increment(client, auth_headers, monkeypatch):
    """Rule-based answers must not burn the lifetime AI quota."""
    from app.main import nebius_client
    from app.config import settings

    monkeypatch.setattr(nebius_client, "api_key", None)
    monkeypatch.setattr(nebius_client, "_client", None)

    before = client.get("/api/chat/status", headers=auth_headers).json()["ai_queries_used"]
    resp = client.post(
        "/api/chat",
        json={"message": "how does the cascade work?"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "Rule-Based"
    after = client.get("/api/chat/status", headers=auth_headers).json()["ai_queries_used"]
    assert after == before
    assert resp.json()["ai_queries_remaining"] == settings.AI_QUERY_LIMIT - after


def test_ai_quota_exhausted_rejects_non_rule_query(client, auth_headers, monkeypatch):
    """When lifetime LLM quota is spent and no rule matches, chat returns a friendly 429."""
    from app.main import nebius_client
    from app.db import engine, User
    from app.config import settings
    from sqlmodel import Session, select

    # Pretend AI is online so the quota gate applies, but never actually call the LLM.
    monkeypatch.setattr(nebius_client, "is_available", lambda: True)

    def _boom(*_a, **_k):
        raise RuntimeError("LLM must not be called when quota is exhausted")

    monkeypatch.setattr(nebius_client, "chat_completion", _boom)

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "pytest_analyst")).first()
        assert user is not None
        user.ai_queries_used = settings.AI_QUERY_LIMIT
        session.add(user)
        session.commit()

    try:
        # Rule-based still works without burning / rejecting.
        ok = client.post(
            "/api/chat",
            json={"message": "how does the cascade work?"},
            headers=auth_headers,
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["source"] == "Rule-Based"

        blocked = client.post(
            "/api/chat",
            json={"message": "invent a novel zero-day exploitation narrative for homework"},
            headers=auth_headers,
        )
        assert blocked.status_code == 429, blocked.text
        detail = blocked.json().get("detail", "")
        assert "10 AI questions" in detail or "AI questions" in detail
        assert "nebius" not in detail.lower()
    finally:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.username == "pytest_analyst")).first()
            if user is not None:
                user.ai_queries_used = 0
                session.add(user)
                session.commit()


def test_ai_quota_increments_on_successful_llm(client, auth_headers, monkeypatch):
    """Successful LLM replies increment ai_queries_used exactly once per turn."""
    from app.main import nebius_client
    from app.db import engine, User
    from sqlmodel import Session, select

    monkeypatch.setattr(nebius_client, "is_available", lambda: True)
    monkeypatch.setattr(
        nebius_client,
        "chat_completion",
        lambda *_a, **_k: "Cascadyx uses a three-tier ML cascade for intrusion detection.",
    )

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == "pytest_analyst")).first()
        assert user is not None
        user.ai_queries_used = 0
        session.add(user)
        session.commit()

    resp = client.post(
        "/api/chat",
        json={"message": "summarize the cascade detector for me please"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "AI"
    assert body["ai_queries_used"] == 1
    assert body["ai_queries_remaining"] == 9

    status_body = client.get("/api/chat/status", headers=auth_headers).json()
    assert status_body["ai_queries_used"] == 1
    assert status_body["ai_queries_remaining"] == 9


def test_chat_explain_last_alert(client, auth_headers, monkeypatch):
    """Force rule-based path so assertions stay stable without depending on live LLM phrasing."""
    from app.main import nebius_client

    monkeypatch.setattr(nebius_client, "api_key", None)
    monkeypatch.setattr(nebius_client, "_client", None)

    resp = client.post("/api/chat", json={"message": "can you explain the latest alert?"}, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    answer = resp.json()["answer"].lower()
    assert "latest logged alert" in answer or "no alerts have been recorded" in answer


def test_chat_status_unlimited_for_analyst_false(client, auth_headers):
    """Non-admin users keep a numeric lifetime cap and ai_unlimited is False."""
    body = client.get("/api/chat/status", headers=auth_headers).json()
    assert body["ai_unlimited"] is False
    assert body["ai_query_limit"] == 10


def test_admin_ai_unlimited_never_429(client, admin_headers, monkeypatch):
    """Admins bypass the lifetime AI cap: quota fields are null and no 429 is raised."""
    from app.main import nebius_client
    from app.db import engine, User
    from app.config import settings
    from sqlmodel import Session, select

    monkeypatch.setattr(nebius_client, "is_available", lambda: True)
    monkeypatch.setattr(
        nebius_client, "chat_completion", lambda *_a, **_k: "Admin answer from the AI."
    )

    with Session(engine) as session:
        admin = session.exec(select(User).where(User.username == "admin")).first()
        assert admin is not None
        original = admin.ai_queries_used
        admin.ai_queries_used = settings.AI_QUERY_LIMIT
        session.add(admin)
        session.commit()

    try:
        status_body = client.get("/api/chat/status", headers=admin_headers).json()
        assert status_body["ai_unlimited"] is True
        assert status_body["ai_queries_remaining"] is None
        assert status_body["ai_query_limit"] is None

        resp = client.post(
            "/api/chat",
            json={"message": "invent a novel zero-day exploitation narrative for homework"},
            headers=admin_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"] == "AI"
        assert body["ai_unlimited"] is True
        assert body["ai_queries_remaining"] is None

        quota = client.get("/api/chat/quota", headers=admin_headers).json()
        assert quota["ai_unlimited"] is True
        assert quota["remaining"] is None
    finally:
        with Session(engine) as session:
            admin = session.exec(select(User).where(User.username == "admin")).first()
            if admin is not None:
                admin.ai_queries_used = original
                session.add(admin)
                session.commit()
