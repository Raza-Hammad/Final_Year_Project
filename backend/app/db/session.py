"""
===============================================================================
STUDENT EXPLANATORY GUIDE: session.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file sets up the database connection engine and manages database sessions.
It supports two backends, chosen purely by the `DATABASE_URL` environment variable:

  * SQLite (default, local dev + pytest): `sqlite:///.../data/cache/app.db`
  * PostgreSQL (production, e.g. Neon): `postgresql://...` -- rewritten to the
    psycopg 3 driver (`postgresql+psycopg://...`) automatically.

It creates database tables when the backend boots up and ensures every API request gets
a clean, isolated database transaction context.

KEY FUNCTIONALITIES:
--------------------
1. `create_engine()`: Connects FastAPI to SQLite or PostgreSQL with dialect-appropriate options.
2. `init_db()`: Automatically creates missing database tables on app startup.
3. SQLite-only migration fixes: adds indexes and missing columns on pre-existing local
   databases (PRAGMA-based; skipped on PostgreSQL where `create_all` builds the full schema).
4. `get_session()`: FastAPI dependency yielding a clean database session per HTTP request.

LIBRARIES & TOOLS USED:
-----------------------
- `sqlmodel.SQLModel`: Unified ORM models bridging Python objects with SQL tables.
- `sqlmodel.create_engine`, `sqlmodel.Session`: Database connection pooling and transaction manager.
- `sqlalchemy.text`: Executes raw SQL migration queries (SQLite only).
- `psycopg` (v3): PostgreSQL driver used when `DATABASE_URL` points at Postgres.
===============================================================================
"""

from typing import Any, Iterator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings


def _normalize_database_url(url: str) -> str:
    """Return a SQLAlchemy URL that uses the psycopg 3 driver for PostgreSQL.

    Args:
        url: Raw ``DATABASE_URL`` value (may be ``postgresql://``, ``postgres://``,
            already ``postgresql+psycopg://``, or a SQLite URL).

    Returns:
        The URL with the scheme rewritten for PostgreSQL, otherwise unchanged.
    """
    url = url.strip()
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


DATABASE_URL: str = _normalize_database_url(settings.DATABASE_URL)
_IS_SQLITE: bool = DATABASE_URL.startswith("sqlite")


def _build_engine_kwargs() -> dict[str, Any]:
    """Build ``create_engine`` keyword arguments for the active dialect."""
    if _IS_SQLITE:
        # check_same_thread=False allows FastAPI multithreaded requests to query SQLite.
        return {"connect_args": {"check_same_thread": False}}
    return {
        # Neon scales idle compute to zero and the pooler drops idle connections:
        # test each connection before use and recycle them well before that happens.
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 2,
        "max_overflow": 3,
        "connect_args": {"connect_timeout": 15},
    }


engine = create_engine(DATABASE_URL, **_build_engine_kwargs())


def _run_sqlite_migrations() -> None:
    """Retrofit indexes/columns onto SQLite databases created by older schema versions.

    ``create_all()`` only creates tables that don't exist yet -- it won't retrofit indexes
    or new columns onto a table created by an earlier version of the schema. SQLite-only:
    relies on ``PRAGMA table_info`` and unquoted ``user`` table names. PostgreSQL databases
    are always created fresh from the current models by ``create_all()``.
    """
    with engine.connect() as conn:
        for column in ("timestamp", "predicted_label", "tier", "severity"):
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_alert_{column} ON alert ({column})"))

        # `pinned` was added to Conversation after the table may already have been
        # created by an earlier run -- add it if missing (SQLite has no
        # "ADD COLUMN IF NOT EXISTS", so check PRAGMA table_info first).
        existing_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(conversation)")).fetchall()}
        if existing_cols and "pinned" not in existing_cols:
            conn.execute(text("ALTER TABLE conversation ADD COLUMN pinned BOOLEAN DEFAULT 0"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conversation_pinned ON conversation (pinned)"))

        # Lifetime AI (LLM) query counter — retrofit for databases created before Phase student-access.
        user_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user)")).fetchall()}
        if user_cols and "ai_queries_used" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN ai_queries_used INTEGER DEFAULT 0"))

        # Google Sign-In columns — retrofit for databases created before OAuth wiring.
        if user_cols and "email" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN email TEXT"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_email ON user (email)"))
        if user_cols and "google_sub" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN google_sub TEXT"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_google_sub ON user (google_sub)"))

        # AuditLog indexes (create_all makes the table; indexes may need retrofit).
        for column in ("timestamp", "username", "action", "user_id"):
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS ix_auditlog_{column} ON auditlog ({column})")
            )

        for column in ("status", "created_at"):
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_review_{column} ON review ({column})"))

        conn.commit()


def init_db() -> None:
    """Create all tables from SQLModel metadata; run SQLite-only migrations when applicable."""
    # Importing models here ensures they are registered with SQLModel metadata before creation
    from app.db.models import (  # noqa: F401
        User, Alert, Conversation, ChatMessage, AuditLog, Review, ReviewHelpful,
    )
    SQLModel.metadata.create_all(engine)

    if engine.dialect.name != "sqlite":
        return

    _run_sqlite_migrations()


def get_session() -> Iterator[Session]:
    """Dependency generator yielding a clean database session context per request."""
    with Session(engine) as session:
        yield session
