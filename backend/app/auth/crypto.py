"""
===============================================================================
STUDENT EXPLANATORY GUIDE: crypto.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file handles Security, Password Hashing, and JWT Authentication for the backend.
It makes sure user passwords are encrypted safely, issues cryptographic JSON Web Tokens (JWT)
upon login, validates user identity for protected API routes, and manages token revocation (logout).

KEY FUNCTIONALITIES:
--------------------
1. `get_password_hash()`: Encrypts plain-text passwords into secure Bcrypt hashes.
2. `verify_password()`: Verifies if a user's entered password matches the stored hash.
3. `create_access_token()`: Issues signed JWT tokens with expiration dates and unique `jti` IDs.
4. `decode_token()`: Unpacks JWTs and verifies cryptographic signatures and expiration.
5. `get_current_user()`: FastAPI dependency that protects API endpoints (returns the logged-in User).
6. `revoke_token()`: Blacklists tokens upon user logout so they cannot be reused.

LIBRARIES & TOOLS USED:
-----------------------
- `passlib.context.CryptContext` (Bcrypt): Hashes and verifies passwords securely.
- `jose.jwt`: Cryptographically signs and decodes JSON Web Tokens (HS256 algorithm).
- `fastapi.security.OAuth2PasswordBearer`: Intercepts Authorization Bearer header tokens.
- `sqlmodel.Session`: Queries user records from the SQLite database.
===============================================================================
"""

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlmodel import Session, select
from app.config import settings
from app.db.session import get_session
from app.db.models import User

# Passlib CryptContext configuration using bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 bearer token security helper
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# In-memory revoked-token set (by jti). Session-scoped like the other singletons in
# this codebase (CascadeDetector, ConnectionManager) -- resets on server restart,
# which is an acceptable tradeoff for a locally-run FYP demo rather than standing up
# a persistent revocation store for a single-process deployment.
_revoked_jtis: set[str] = set()

def revoke_token(jti: str) -> None:
    """Marks a token's jti as revoked so future requests using it are rejected."""
    _revoked_jtis.add(jti)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies that a plain text password matches a stored hashed password using passlib."""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Generates a secure bcrypt hash of a password using passlib."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generates a secure HS256-signed JWT token containing username + role + a unique jti."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "jti": secrets.token_hex(16)})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """Decodes and validates a JWT, raising JWTError if the signature/expiry is invalid
    or the token has been revoked (logged out)."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("jti") in _revoked_jtis:
        raise JWTError("Token has been revoked")
    return payload

def get_user_by_username(username: str, session: Session) -> Optional[User]:
    """Looks up a user by username."""
    statement = select(User).where(User.username == username)
    return session.exec(statement).first()

def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session)
) -> User:
    """Dependency that extracts the logged-in user from the JWT header, raising 401 if unauthorized."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(username, session)
    if user is None:
        raise credentials_exception

    return user
