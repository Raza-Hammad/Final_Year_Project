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

from sqlmodel import SQLModel, Field
from typing import Optional, Dict, Any
from datetime import datetime

class User(SQLModel, table=True):
    """Database model for application users authentication."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    hashed_password: str
    role: str = Field(default="analyst")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Alert(SQLModel, table=True):
    """Database model for security threat alerts triggered by malicious flows."""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
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

class Conversation(SQLModel, table=True):
    """Database model for a saved AI Assistant conversation thread. Conversations
    started in incognito mode are never persisted, so no row exists for them."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(default="New conversation")
    pinned: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatMessage(SQLModel, table=True):
    """Database model for a single message within a saved Conversation."""
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    role: str  # 'user' | 'assistant'
    content: str
    source: Optional[str] = None  # 'Rule-Based' | 'AI Gemini' | 'Error Fallback' | ...
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
