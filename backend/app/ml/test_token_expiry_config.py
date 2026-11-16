"""Unit check: ACCESS_TOKEN_EXPIRE_DAYS drives long-lived JWT lifetime."""

from datetime import datetime, timedelta, timezone

from jose import jwt

from app.auth.crypto import create_access_token
from app.config import settings


def test_access_token_expire_days_default_is_long_lived():
    """Persistent login: default expiry is 365 days (env-overridable)."""
    assert settings.ACCESS_TOKEN_EXPIRE_DAYS == 365
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 365 * 24 * 60


def test_create_access_token_uses_configured_minutes():
    """Default create_access_token expiry is ~ACCESS_TOKEN_EXPIRE_DAYS from now."""
    token = create_access_token(data={"sub": "expiry_probe", "role": "analyst"})
    payload = jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )
    assert "exp" in payload
    remaining = datetime.fromtimestamp(payload["exp"], tz=timezone.utc) - datetime.now(
        timezone.utc
    )
    assert remaining > timedelta(days=300)
    assert remaining < timedelta(days=370)
