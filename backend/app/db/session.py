"""
===============================================================================
STUDENT EXPLANATORY GUIDE: session.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file sets up the SQLite Database Connection Engine and manages database sessions.
It creates database tables when the backend boots up and ensures every API request gets
a clean, isolated database transaction context.

KEY FUNCTIONALITIES:
--------------------
1. `create_engine()`: Connects FastAPI to the SQLite file (`data/cache/app.db`).
2. `init_db()`: Automatically creates missing database tables (`User`, `Alert`, `Conversation`, `ChatMessage`) on app startup.
3. Database Migration Fixes: Automatically adds database indexes and missing columns if schema changes.
4. `get_session()`: FastAPI dependency yielding a clean database session per HTTP request.

LIBRARIES & TOOLS USED:
-----------------------
- `sqlmodel.SQLModel`: Unified ORM models bridging Python objects with SQL tables.
- `sqlmodel.create_engine`, `sqlmodel.Session`: Database connection pooling and transaction manager.
- `sqlalchemy.text`: Executes raw SQL migration queries (e.g. index creation and table alteration).
===============================================================================
"""

from sqlmodel import SQLModel, create_engine, Session
from app.config import settings

# Setup SQLite database engine. check_same_thread=False allows FastAPI multithreaded requests to query SQLite.
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
)

def init_db():
    """Initializes tables in the SQLite database based on SQLModel metadata."""
    # Importing models here ensures they are registered with SQLModel metadata before creation
    from app.db.models import (  # noqa: F401
        User, Alert, Conversation, ChatMessage, AuditLog, Review, ReviewHelpful,
    )
    SQLModel.metadata.create_all(engine)

    # create_all() only creates tables that don't exist yet -- it won't retrofit indexes
    # or new columns onto a table created by an earlier version of the schema. Add them
    # explicitly so existing databases (not just fresh ones) pick up schema changes too.
    from sqlalchemy import text
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

def get_session():
    """Dependency generator yielding a clean database session context per request."""
    with Session(engine) as session:
        yield session
