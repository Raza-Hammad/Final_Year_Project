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
1. Loads environment variables from the `.env` file using python-dotenv.
2. Configures JWT Secret Keys for user authentication (generates a fallback key if missing).
3. Defines absolute file paths for raw dataset storage (`data/raw`) and trained model cache (`data/cache`).
4. Establishes the SQLite Database connection string (`sqlite:///.../data/cache/app.db`).
5. Extracts Google Gemini API keys for the Sentinel AI SOC assistant.

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

# Load environment variables from .env file if it exists
env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

class Settings:
    PROJECT_NAME: str = "Cybersecurity Threat Simulator Powered by AI"
    API_V1_STR: str = "/api"

    # Secrets
    GEMINI_API_KEYS: list[str] = [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()]

    # If JWT_SECRET isn't set (no .env configured), fall back to a random per-process
    # secret rather than a static hardcoded string -- a hardcoded fallback would let
    # anyone reading this source forge valid tokens against a deployment that forgot
    # to set .env. The tradeoff: existing sessions won't survive a server restart when
    # running on the generated fallback, since the value changes every time.
    _env_jwt_secret = os.getenv("JWT_SECRET")
    if _env_jwt_secret:
        JWT_SECRET: str = _env_jwt_secret
    else:
        JWT_SECRET: str = secrets.token_hex(32)
        logger.warning(
            "JWT_SECRET is not set in the environment/.env file. Generated a random "
            "per-process secret instead -- all existing sessions will be invalidated "
            "on every server restart. Set JWT_SECRET in backend/.env for persistent sessions."
        )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours -- long enough for a single demo/eval session
    
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

settings = Settings()
