"""
===============================================================================
STUDENT EXPLANATORY GUIDE: models.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file defines all Database Schemas (Tables) and API Request/Response Data Structures (Pydantic Models).
It uses SQLModel to define SQL database tables (`User`, `Alert`, `Conversation`, `ChatMessage`) while
simultaneously acting as data validation schemas for incoming REST API payloads.

KEY FUNCTIONALITIES:
--------------------
1. `User`: Database table storing user logins, encrypted passwords, and roles (`admin`/`analyst`).
2. `Alert`: Database table storing all flagged security threat incidents (predicted label, severity, IPs, ports).
3. `Conversation` & `ChatMessage`: Stores AI SOC Assistant chat history threads and messages.
4. Pydantic Request Schemas (`PredictionRequest`, `UserCreate`, `ConversationUpdate`): Validates incoming JSON data from HTTP requests.
5. Response Schemas (`UserResponse`, `Token`, `ConversationDetail`): Formats outgoing JSON responses.

LIBRARIES & TOOLS USED:
-----------------------
- `sqlmodel.SQLModel`, `Field`: Hybrid library combining SQLAlchemy ORM with Pydantic data validation.
- `datetime.datetime`: Timestamps user accounts, threat alerts, and chat messages.
- `typing.Dict`, `Optional`, `Any`: Python type hints for API input/output validation.
===============================================================================
"""

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone


def _utc_now() -> datetime:
    """Timezone-aware UTC now (required by SQLModel 0.0.50+ DateTime bind)."""
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    """Database model for application users authentication."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    role: str = Field(default="analyst")
    # Lifetime count of successful Nebius/LLM chat replies (rule-based answers do not increment).
    ai_queries_used: int = Field(default=0)
    # Google Sign-In linkage (optional; password users leave these null).
    email: Optional[str] = Field(default=None, index=True)
    google_sub: Optional[str] = Field(default=None, index=True, unique=True)
    created_at: datetime = Field(default_factory=_utc_now)


class GoogleAuthRequest(SQLModel):
    """Body for SPA Google Sign-In: GIS ID token and/or authorization code."""
    id_token: Optional[str] = None
    code: Optional[str] = None

class Alert(SQLModel, table=True):
    """Database model for security threat alerts triggered by malicious flows."""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_utc_now, index=True)
    predicted_label: str = Field(index=True)
    confidence: float
    tier: int = Field(index=True)
    source_scenario: str = Field(default="simulation")
    severity: str = Field(default="Medium", index=True)
    source_ip: str = Field(default="10.0.0.1")
    dest_ip: str = Field(default="192.168.10.50")
    source_port: int = Field(default=0)
    dest_port: int = Field(default=0)
    raw_features: str = Field(default="{}")  # JSON-encoded input feature dictionary


class Review(SQLModel, table=True):
    """One public product review per user (editable). Rendered as plain text only."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True, index=True)
    author_display: str = Field(default="Anonymous")
    rating: int = Field(default=5)
    title: str = Field(default="")
    body: str = Field(default="")
    would_recommend: bool = Field(default=True)
    suggestion: str = Field(default="")
    tags: str = Field(default="[]")  # JSON list from a fixed vocabulary
    status: str = Field(default="published", index=True)  # published | hidden
    helpful_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utc_now, index=True)
    updated_at: datetime = Field(default_factory=_utc_now)
    edited: bool = Field(default=False)


class ReviewHelpful(SQLModel, table=True):
    """A user marking a review helpful (unique per review/user pair)."""
    __table_args__ = (UniqueConstraint("review_id", "user_id", name="uq_reviewhelpful_pair"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    review_id: int = Field(foreign_key="review.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)


class AuditLog(SQLModel, table=True):
    """Append-only audit trail for sensitive admin/analyst actions."""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=_utc_now, index=True)
    user_id: Optional[int] = Field(default=None, index=True)
    username: str = Field(default="", index=True)
    role: str = Field(default="")
    action: str = Field(index=True)  # e.g. simulate.start, pcap.analyze, alerts.export
    detail: str = Field(default="{}")  # JSON-encoded context
    ip_address: Optional[str] = Field(default=None)

class Conversation(SQLModel, table=True):
    """Database model for a saved AI Assistant conversation thread. Conversations
    started in incognito mode are never persisted, so no row exists for them."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(default="New conversation")
    pinned: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=_utc_now, index=True)
    updated_at: datetime = Field(default_factory=_utc_now)

class ChatMessage(SQLModel, table=True):
    """Database model for a single message within a saved Conversation."""
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    role: str  # 'user' | 'assistant'
    content: str
    source: Optional[str] = None  # 'Rule-Based' | 'AI Nebius' | 'Error Fallback' | ...
    created_at: datetime = Field(default_factory=_utc_now)

class ConversationSummary(SQLModel):
    """Schema for a conversation list item (no message bodies)."""
    id: int
    title: str
    pinned: bool
    created_at: datetime
    updated_at: datetime
    message_count: int
    preview: Optional[str] = None

class ChatMessageResponse(SQLModel):
    """Schema for a single persisted chat message."""
    id: int
    role: str
    content: str
    source: Optional[str] = None
    created_at: datetime

class ConversationDetail(SQLModel):
    """Schema for a full conversation with its messages."""
    id: int
    title: str
    pinned: bool
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageResponse]

class ConversationUpdate(SQLModel):
    """Schema for a partial conversation update (rename and/or pin)."""
    title: Optional[str] = None
    pinned: Optional[bool] = None

class UserCreate(SQLModel):
    """Schema for user registration requests."""
    username: str
    password: str

class UserResponse(SQLModel):
    """Schema for user detail responses."""
    id: int
    username: str
    role: str
    ai_queries_used: int = 0
    created_at: datetime

class Token(SQLModel):
    """Schema for authentication access tokens."""
    access_token: str
    token_type: str

class TokenData(SQLModel):
    """Schema for data stored within JWT payloads."""
    username: Optional[str] = None

class PredictionRequest(SQLModel):
    """Schema for incoming prediction request packet data."""
    features: Dict[str, Any]
    source_scenario: Optional[str] = "simulation"
