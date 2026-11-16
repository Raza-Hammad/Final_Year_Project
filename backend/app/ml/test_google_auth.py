"""Google Sign-In tests — mock token verify; new users are analyst; password login intact."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlmodel import Session, select

from app.db import engine, User


MOCK_CLAIMS = {
    "sub": "google-sub-test-001",
    "email": "student.google@example.com",
    "email_verified": True,
    "iss": "https://accounts.google.com",
    "aud": "test-client-id.apps.googleusercontent.com",
}


@pytest.fixture
def google_configured(monkeypatch):
    """Ensure Google client settings look configured during these tests."""
    monkeypatch.setattr(
        "app.auth.google_oauth.settings.GOOGLE_CLIENT_ID",
        "test-client-id.apps.googleusercontent.com",
    )
    monkeypatch.setattr(
        "app.config.settings.GOOGLE_CLIENT_ID",
        "test-client-id.apps.googleusercontent.com",
    )
    monkeypatch.setattr(
        "app.main.settings.GOOGLE_CLIENT_ID",
        "test-client-id.apps.googleusercontent.com",
    )


def test_google_config_exposes_client_id_not_secret(client, google_configured, monkeypatch):
    monkeypatch.setattr("app.main.settings.GOOGLE_CLIENT_SECRET", "super-secret-value")
    r = client.get("/api/auth/google/config")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["client_id"] == "test-client-id.apps.googleusercontent.com"
    assert "super-secret-value" not in r.text
    assert "client_secret" not in body


def test_google_config_exposes_origin_diagnostics(client, google_configured):
    body = client.get("/api/auth/google/config").json()
    assert body["client_id_looks_valid"] is True
    for origin in ("http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000"):
        assert origin in body["required_origins"]


def test_google_client_id_shape_heuristic():
    from app.auth.google_oauth import google_client_id_looks_valid

    assert google_client_id_looks_valid("123456-abc.apps.googleusercontent.com")
    assert not google_client_id_looks_valid("your-client-id")
    assert not google_client_id_looks_valid("")
    assert not google_client_id_looks_valid(None)


def test_google_id_token_creates_analyst_user(client, google_configured):
    """POST /api/auth/google with mocked verify → new analyst, JWT usable on /api/users/me."""
    with patch(
        "app.main.verify_google_id_token",
        return_value=MOCK_CLAIMS,
    ) as mock_verify:
        r = client.post("/api/auth/google", json={"id_token": "fake.google.jwt"})
        assert r.status_code == 200, r.text
        mock_verify.assert_called_once()
        token = r.json()["access_token"]
        assert r.json()["token_type"] == "bearer"

    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    profile = me.json()
    assert profile["role"] == "analyst"
    assert profile.get("ai_queries_used", 0) == 0
    assert profile["username"]  # local-part or email

    with Session(engine) as session:
        user = session.exec(select(User).where(User.google_sub == MOCK_CLAIMS["sub"])).first()
        assert user is not None
        assert user.role == "analyst"
        assert user.ai_queries_used == 0
        assert user.email == MOCK_CLAIMS["email"]
        assert user.hashed_password  # placeholder hash only — not a Google password


def test_google_id_token_reuses_existing_user(client, google_configured):
    with patch("app.main.verify_google_id_token", return_value=MOCK_CLAIMS):
        first = client.post("/api/auth/google", json={"id_token": "fake.1"})
        second = client.post("/api/auth/google", json={"id_token": "fake.2"})
    assert first.status_code == 200
    assert second.status_code == 200

    with Session(engine) as session:
        rows = session.exec(select(User).where(User.google_sub == MOCK_CLAIMS["sub"])).all()
        assert len(rows) == 1


def test_google_rejects_missing_credential(client, google_configured):
    r = client.post("/api/auth/google", json={})
    assert r.status_code == 400


def test_password_login_still_works_alongside_google(client, google_configured):
    """Existing username/password register + login path remains intact."""
    username = "password_user_with_google_suite"
    password = "StillWorks!321"
    reg = client.post("/api/auth/register", json={"username": username, "password": password})
    assert reg.status_code == 201, reg.text
    assert reg.json()["role"] == "analyst"

    login = client.post("/api/auth/login", data={"username": username, "password": password})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == username
