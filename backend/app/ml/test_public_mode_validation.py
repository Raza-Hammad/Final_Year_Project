"""Tests for the PUBLIC_MODE fail-fast secret validation (free-tier go-live hardening)."""

from types import SimpleNamespace

import pytest

from app.config import validate_public_mode

GOOD_JWT = "a" * 40
GOOD_ADMIN = "Str0ng-Admin-Pass!"


def _cfg(public: bool) -> SimpleNamespace:
    return SimpleNamespace(PUBLIC_MODE=public)


def test_noop_when_not_public(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("ADMIN_SEED_PASSWORD", raising=False)
    validate_public_mode(_cfg(False))  # must not raise


def test_public_requires_strong_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "short")
    monkeypatch.setenv("ADMIN_SEED_PASSWORD", GOOD_ADMIN)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_public_mode(_cfg(True))


def test_public_requires_admin_seed_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", GOOD_JWT)
    monkeypatch.setenv("ADMIN_SEED_PASSWORD", "tooshort")
    with pytest.raises(RuntimeError, match="ADMIN_SEED_PASSWORD"):
        validate_public_mode(_cfg(True))


def test_public_ok_with_strong_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", GOOD_JWT)
    monkeypatch.setenv("ADMIN_SEED_PASSWORD", GOOD_ADMIN)
    validate_public_mode(_cfg(True))  # must not raise
