"""
Google Sign-In helpers: ID-token verification, auth-code exchange, and user upsert.

Primary SPA path verifies a Google ID token (GIS) with ``google-auth``.
Redirect / popup authorization-code flows exchange the code server-side so the
client secret never leaves the backend.
"""

from __future__ import annotations

import logging
import secrets
from typing import Any, Optional
from urllib.parse import urlencode, urlparse

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlmodel import Session, select

from app.auth.crypto import create_access_token, get_password_hash
from app.config import settings
from app.db.models import User

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
# GIS popup ``initCodeClient`` uses this special redirect URI.
GIS_POPUP_REDIRECT_URI = "postmessage"


def google_oauth_configured() -> bool:
    """Return True when a Google client id is present (minimum for ID-token verify)."""
    return bool(settings.GOOGLE_CLIENT_ID)


def google_client_id_looks_valid(client_id: Optional[str]) -> bool:
    """Heuristic check that the id has Google's Web-client shape (not a placeholder).

    Valid ids look like ``<digits>-<random>.apps.googleusercontent.com``. This cannot
    prove the client exists or is a *Web application* client; it only catches typos
    and ``your-client-id`` style placeholders.
    """
    if not client_id:
        return False
    cid = client_id.strip()
    return cid.endswith(".apps.googleusercontent.com") and "-" in cid and " " not in cid


def google_required_origins() -> list[str]:
    """Browser origins that must be in Console → Authorized JavaScript origins.

    GIS popup sign-in is rejected by Google (``no registered origin``) for any page
    origin missing from that list. Includes local dev hosts and any extras from
    ``GOOGLE_FRONTEND_ORIGINS``.
    """
    return sorted(_allowed_frontend_origins())


def google_redirect_configured() -> bool:
    """Return True when redirect-code exchange can run (id + secret + redirect URI)."""
    return bool(
        settings.GOOGLE_CLIENT_ID
        and settings.GOOGLE_CLIENT_SECRET
        and settings.GOOGLE_REDIRECT_URI
    )


def verify_google_id_token(token: str) -> dict[str, Any]:
    """Verify a Google ID token and return its claims.

    Raises:
        ValueError: If the token is invalid or audience mismatches.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")
    try:
        claims = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:  # noqa: BLE001 — google-auth raises assorted types
        raise ValueError(f"Invalid Google ID token: {exc}") from exc

    iss = claims.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Invalid Google ID token issuer")
    if not claims.get("sub"):
        raise ValueError("Google ID token missing subject")
    if not claims.get("email"):
        raise ValueError("Google ID token missing email")
    return claims


def exchange_google_auth_code(
    code: str,
    *,
    redirect_uri: Optional[str] = None,
) -> dict[str, Any]:
    """Exchange an authorization code for tokens; return verified ID-token claims.

    Args:
        code: Authorization code from Google (redirect callback or GIS popup).
        redirect_uri: Must match the URI used to obtain the code. Defaults to
            ``settings.GOOGLE_REDIRECT_URI``. Pass ``postmessage`` for GIS popup.
    """
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("Google OAuth client is not fully configured")

    uri = redirect_uri or settings.GOOGLE_REDIRECT_URI
    if not uri:
        raise ValueError("GOOGLE_REDIRECT_URI is not configured")

    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            GOOGLE_TOKEN_URI,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": uri,
                "grant_type": "authorization_code",
            },
        )
    if resp.status_code != 200:
        logger.warning("Google token exchange failed: %s %s", resp.status_code, resp.text[:300])
        raise ValueError("Failed to exchange Google authorization code")

    payload = resp.json()
    id_tok = payload.get("id_token")
    if not id_tok:
        raise ValueError("Google token response missing id_token")
    return verify_google_id_token(id_tok)


def build_google_authorize_url(state: str) -> str:
    """Build the Google OAuth consent URL for the redirect flow."""
    if not google_redirect_configured():
        raise ValueError("Google redirect OAuth is not configured")
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "include_granted_scopes": "true",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URI}?{urlencode(params)}"


def _allowed_frontend_origins() -> set[str]:
    """Origins allowed as post-login redirect targets (dev Vite + same-origin demo)."""
    allowed = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    }
    extras = [settings.PUBLIC_BASE_URL, *settings.GOOGLE_FRONTEND_ORIGINS.split(",")]
    for raw in extras:
        origin = raw.strip().rstrip("/")
        if origin:
            allowed.add(origin)
    return allowed


def sanitize_frontend_next(next_url: Optional[str]) -> str:
    """Validate ``next`` against an allow-list; default to same-origin frontend root."""
    default = "/"
    if not next_url:
        return default
    next_url = next_url.strip()
    if next_url.startswith("/") and not next_url.startswith("//"):
        return next_url
    parsed = urlparse(next_url)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in _allowed_frontend_origins():
            path = parsed.path or "/"
            return f"{origin}{path}"
    return default


def _username_from_email(email: str, session: Session) -> str:
    """Pick a unique username: prefer email local-part, then full email, then suffix."""
    local = (email.split("@")[0] or "user").strip() or "user"
    # Keep usernames simple (no spaces).
    local = "".join(ch for ch in local if ch.isalnum() or ch in ("_", ".", "-", "+")) or "user"

    def _taken(name: str) -> bool:
        return session.exec(select(User).where(User.username == name)).first() is not None

    if not _taken(local):
        return local
    if not _taken(email):
        return email
    return f"{local}_{secrets.token_hex(3)}"


def get_or_create_google_user(session: Session, claims: dict[str, Any]) -> User:
    """Find an existing Google user (by sub / email) or create an analyst account.

    Never stores a Google password. New users get ``role=analyst`` and
    ``ai_queries_used=0``.
    """
    sub = str(claims["sub"])
    email = str(claims["email"]).strip().lower()

    user = session.exec(select(User).where(User.google_sub == sub)).first()
    if user is None and email:
        user = session.exec(select(User).where(User.email == email)).first()

    if user is not None:
        changed = False
        if not getattr(user, "google_sub", None):
            user.google_sub = sub
            changed = True
        if email and not getattr(user, "email", None):
            user.email = email
            changed = True
        if changed:
            session.add(user)
            session.commit()
            session.refresh(user)
        return user

    # Unusable random hash placeholder so column stays non-null on older rows /
    # schemas that still expect a string; password login rejects empty verifies.
    placeholder = get_password_hash(secrets.token_urlsafe(32))
    new_user = User(
        username=_username_from_email(email, session),
        hashed_password=placeholder,
        role="analyst",
        ai_queries_used=0,
        email=email,
        google_sub=sub,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user


def issue_access_token_for_user(user: User) -> str:
    """Issue the same JWT shape as password login (``sub`` + ``role``)."""
    return create_access_token(data={"sub": user.username, "role": user.role})


if settings.GOOGLE_CLIENT_ID and not google_client_id_looks_valid(settings.GOOGLE_CLIENT_ID):
    logger.warning(
        "GOOGLE_CLIENT_ID does not look like a Web client id (expected '<digits>-<hash>.apps.googleusercontent.com'). "
        "Google Sign-In will fail with invalid_client until it is corrected (see docs/GOOGLE_OAUTH.md)."
    )
