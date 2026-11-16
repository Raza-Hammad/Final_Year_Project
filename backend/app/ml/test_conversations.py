"""Conversation CRUD tests (Phase 6) — no live Nebius dependency."""

from __future__ import annotations


def _create_conversation_via_chat(client, headers, monkeypatch, message: str = "how does the cascade work?"):
    """Force non-Nebius chat so conversation rows are created without live API keys."""
    from app.main import nebius_client

    monkeypatch.setattr(nebius_client, "api_key", None)
    monkeypatch.setattr(nebius_client, "_client", None)
    resp = client.post("/api/chat", json={"message": message}, headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Rule-Based for known cascade FAQs; Offline Fallback for other prompts —
    # both persist conversations when Nebius is cleared.
    assert body["source"] in {"Rule-Based", "Offline Fallback", "Error Fallback"}
    assert body["conversation_id"] is not None
    return body["conversation_id"]


def test_conversations_list_get_patch_delete(client, auth_headers, monkeypatch):
    conv_id = _create_conversation_via_chat(client, auth_headers, monkeypatch)

    listed = client.get("/api/conversations", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert any(r["id"] == conv_id for r in rows)
    mine = next(r for r in rows if r["id"] == conv_id)
    assert mine["message_count"] >= 2
    assert mine["pinned"] is False

    detail = client.get(f"/api/conversations/{conv_id}", headers=auth_headers)
    assert detail.status_code == 200, detail.text
    payload = detail.json()
    assert payload["id"] == conv_id
    assert len(payload["messages"]) >= 2
    roles = {m["role"] for m in payload["messages"]}
    assert "user" in roles and "assistant" in roles

    patched = client.patch(
        f"/api/conversations/{conv_id}",
        json={"title": "Cascade Q&A", "pinned": True},
        headers=auth_headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["title"] == "Cascade Q&A"
    assert patched.json()["pinned"] is True

    deleted = client.delete(f"/api/conversations/{conv_id}", headers=auth_headers)
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["status"] == "deleted"

    missing = client.get(f"/api/conversations/{conv_id}", headers=auth_headers)
    assert missing.status_code == 404


def test_conversation_owner_isolation(client, auth_headers, admin_headers, monkeypatch):
    """Analyst-owned conversation is not readable/deletable by another user."""
    conv_id = _create_conversation_via_chat(
        client, auth_headers, monkeypatch, message="what is lightgbm in the cascade?"
    )

    as_admin = client.get(f"/api/conversations/{conv_id}", headers=admin_headers)
    assert as_admin.status_code == 404

    delete_as_admin = client.delete(f"/api/conversations/{conv_id}", headers=admin_headers)
    assert delete_as_admin.status_code == 404

    # Owner can still see it.
    as_owner = client.get(f"/api/conversations/{conv_id}", headers=auth_headers)
    assert as_owner.status_code == 200


def test_incognito_chat_does_not_persist_conversation(client, auth_headers, monkeypatch):
    from app.main import nebius_client

    monkeypatch.setattr(nebius_client, "api_key", None)
    monkeypatch.setattr(nebius_client, "_client", None)
    before = client.get("/api/conversations", headers=auth_headers)
    assert before.status_code == 200
    before_ids = {r["id"] for r in before.json()}

    resp = client.post(
        "/api/chat",
        json={"message": "how does the cascade work?", "incognito": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["conversation_id"] is None

    after = client.get("/api/conversations", headers=auth_headers)
    after_ids = {r["id"] for r in after.json()}
    assert after_ids == before_ids


def test_conversations_require_auth(client):
    assert client.get("/api/conversations").status_code == 401
