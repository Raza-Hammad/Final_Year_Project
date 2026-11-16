"""
===============================================================================
STUDENT EXPLANATORY GUIDE: config.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file is the central "Control Panel" or "Configuration Hub" of our FastAPI backend.
It reads settings from the environment file (.env) and defines all global variables,
database file paths, security secret keys, and server port numbers used across the app.

KEY FUNCTIONALITIES:
--------------------
1. Loads environment variables from `.env` (preferred) or legacy `env` via python-dotenv.
2. Configures JWT Secret Keys for user authentication (generates a fallback key if missing).
3. Defines absolute file paths for raw dataset storage (`data/raw`) and trained model cache (`data/cache`).
4. Establishes the SQLite Database connection string (`sqlite:///.../data/cache/app.db`).
5. Extracts Nebius AI Studio settings for the Sentinel AI SOC assistant
   (optional legacy GEMINI_API_KEYS are ignored by the chat path).

LIBRARIES & TOOLS USED:
-----------------------
- `os`, `pathlib.Path`: Standard Python tools for handling OS paths and directories.
- `secrets`: Generates cryptographically secure random secret keys if `.env` is missing.
- `dotenv (load_dotenv)`: Parses environment variables from `.env` files into Python.
- `logging`: Logs helpful startup warnings if settings are missing.
===============================================================================
"""

import logging
import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables. Prefer standard `.env`; fall back to legacy
# `env` (this repo historically used that name) so existing setups keep working.
_env_candidates = (BASE_DIR / ".env", BASE_DIR / "env")
_loaded_env = next((p for p in _env_candidates if p.exists()), None)
if _loaded_env is not None:
    load_dotenv(dotenv_path=_loaded_env)
else:
    load_dotenv()

class Settings:
    PROJECT_NAME: str = "Cybersecurity Threat Simulator Powered by AI"
    API_V1_STR: str = "/api"

    # Secrets / LLM providers
    # Nebius AI Studio (OpenAI-compatible) — primary chat / XAI prose provider.
    NEBIUS_API_KEY: str = os.getenv("NEBIUS_API_KEY", "").strip()
    NEBIUS_BASE_URL: str = os.getenv(
        "NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1"
    ).strip()
    # Qwen3-30B-A3B Instruct: strong technical Q&A, MoE → demo-friendly latency.
    NEBIUS_MODEL: str = os.getenv(
        "NEBIUS_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507"
    ).strip()

    # Lifetime AI (LLM) chat queries per user. Rule-based answers do not count.
    AI_QUERY_LIMIT: int = int(os.getenv("AI_QUERY_LIMIT", "10"))

    # Legacy (unused by chat path; kept so old .env files still load cleanly)
    GEMINI_API_KEYS: list[str] = [
        k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()
    ]

    # If JWT_SECRET isn't set (no .env configured), fall back to a random per-process
    # secret rather than a static hardcoded string -- a hardcoded fallback would let
    # anyone reading this source forge valid tokens against a deployment that forgot
    # to set .env. The tradeoff: existing sessions won't survive a server restart when
    # running on the generated fallback, since the value changes every time.
    _env_jwt_secret = os.getenv("JWT_SECRET")
    if _env_jwt_secret:
        JWT_SECRET: str = _env_jwt_secret
    elif os.getenv("PUBLIC_MODE", "").strip().lower() in {"1", "true", "yes", "on"}:
        # Fail fast on the public internet: a per-process random secret would silently
        # log every user out on each restart/deploy and hides a missing-secret mistake.
        raise RuntimeError(
            "PUBLIC_MODE is enabled but JWT_SECRET is not set. "
            "Set it first, e.g. `fly secrets set JWT_SECRET=<long random string>`."
        )
    else:
        JWT_SECRET: str = secrets.token_hex(32)
        logger.warning(
            "JWT_SECRET is not set in the environment/.env file. Generated a random "
            "per-process secret instead -- all existing sessions will be invalidated "
            "on every server restart. Set JWT_SECRET in backend/.env (or legacy backend/env) "
            "for persistent sessions."
        )
    JWT_ALGORITHM: str = "HS256"
    # Long-lived sessions: token stays valid in localStorage across browser/device
    # restarts until the user explicitly logs out (or the token expires).
    ACCESS_TOKEN_EXPIRE_DAYS: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "365"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60

    
    # Data Directories
    DATA_RAW_DIR: str = os.getenv("DATA_RAW_DIR", str(BASE_DIR.parent / "data" / "raw"))
    DATA_CACHE_DIR: str = os.getenv("DATA_CACHE_DIR", str(BASE_DIR.parent / "data" / "cache"))

    # Ensure the cache directory exists before anything (e.g. the SQLite engine below)
    # tries to create a file inside it — SQLite will not create missing parent directories.
    Path(DATA_CACHE_DIR).mkdir(parents=True, exist_ok=True)

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{Path(DATA_CACHE_DIR) / 'app.db'}")
    
    # Server configuration
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", 8000))

    # --- Public deployment (see docs/DEPLOY.md) -------------------------------
    # Canonical public origin, e.g. ``https://cascadyx.app`` (scheme + host, no path,
    # no trailing slash). When set it is automatically added to CORS, the Google
    # post-login allow-list, and used to derive GOOGLE_REDIRECT_URI if that is unset.
    # Free-tier hosts publish their own URL, so PUBLIC_BASE_URL can stay unset there:
    # Render -> RENDER_EXTERNAL_URL, Hugging Face Spaces -> SPACE_HOST (bare host).
    PUBLIC_BASE_URL: str = (
        os.getenv("PUBLIC_BASE_URL", "").strip()
        or os.getenv("RENDER_EXTERNAL_URL", "").strip()
        or (f"https://{os.getenv('SPACE_HOST', '').strip()}" if os.getenv("SPACE_HOST", "").strip() else "")
    ).rstrip("/")
    # Extra comma-separated browser origins allowed by CORS (e.g. the ``www.`` host).
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "").strip()
    # PUBLIC_MODE=1 hardens the app for the open internet: hides /docs + /redoc +
    # /openapi.json, adds security headers (HSTS etc.) and disables multipart PCAP
    # uploads (the UI never uses them; only recorded captures baked into the image
    # under DATA_RAW_DIR are analysed). Default off so local dev / pytest are unchanged.
    PUBLIC_MODE: bool = os.getenv("PUBLIC_MODE", "").strip().lower() in {"1", "true", "yes", "on"}

    # Google Sign-In / OAuth (client secret stays server-side only).
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    # Redirect-flow callback. Explicit env wins; else derived from PUBLIC_BASE_URL;
    # else the local default. Production: see docs/DEPLOY.md.
    GOOGLE_REDIRECT_URI: str = (
        os.getenv("GOOGLE_REDIRECT_URI", "").strip()
        or (
            f"{PUBLIC_BASE_URL}/api/auth/google/callback"
            if PUBLIC_BASE_URL
            else "http://127.0.0.1:8000/api/auth/google/callback"
        )
    )
    # Comma-separated extra origins allowed as post-login ``next`` targets
    # (in addition to local Vite / demo hosts and PUBLIC_BASE_URL). Example production:
    # GOOGLE_FRONTEND_ORIGINS=https://www.cascadyx.app
    GOOGLE_FRONTEND_ORIGINS: str = os.getenv("GOOGLE_FRONTEND_ORIGINS", "").strip()

    @classmethod
    def cors_allowed_origins(cls) -> list[str]:
        """Return the CORS allow-list: local dev hosts + PUBLIC_BASE_URL + CORS_ORIGINS."""
        origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]
        extras = [cls.PUBLIC_BASE_URL, *cls.CORS_ORIGINS.split(",")]
        for raw in extras:
            origin = raw.strip().rstrip("/")
            if origin and origin not in origins:
                origins.append(origin)
        return origins

settings = Settings()

MIN_JWT_SECRET_LEN = 32
MIN_ADMIN_PASSWORD_LEN = 12


def validate_public_mode(cfg: Settings = settings) -> None:
    """Refuse to boot an internet-facing deploy with weak / missing secrets.

    Only enforced when ``PUBLIC_MODE=1`` (local dev and pytest are unaffected).

    Args:
        cfg: Settings instance to validate (defaults to the global one).

    Raises:
        RuntimeError: If ``JWT_SECRET`` is unset/short (an unset secret silently falls
            back to a per-process random one, which logs everybody out on every
            restart/sleep) or ``ADMIN_SEED_PASSWORD`` is unset/short.
    """
    if not cfg.PUBLIC_MODE:
        return
    problems: list[str] = []
    if len(os.getenv("JWT_SECRET", "").strip()) < MIN_JWT_SECRET_LEN:
        problems.append(
            f"JWT_SECRET must be set to a random string of at least {MIN_JWT_SECRET_LEN} chars "
            "(e.g. `python -c \"import secrets; print(secrets.token_hex(32))\"`)"
        )
    if len(os.getenv("ADMIN_SEED_PASSWORD", "").strip()) < MIN_ADMIN_PASSWORD_LEN:
        problems.append(
            f"ADMIN_SEED_PASSWORD must be set to a strong password of at least "
            f"{MIN_ADMIN_PASSWORD_LEN} chars (it seeds the 'admin' account on a fresh database)"
        )
    if problems:
        raise RuntimeError("PUBLIC_MODE=1 but the deployment is not safe to start:\n  - " + "\n  - ".join(problems))
