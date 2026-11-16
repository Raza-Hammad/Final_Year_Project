"""Audit-log helper for sensitive Cascadyx actions (Phase 5 RBAC)."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import Request
from sqlmodel import Session

from app.db.models import AuditLog, User

logger = logging.getLogger(__name__)


def write_audit_log(
    session: Session,
    *,
    user: Optional[User],
    action: str,
    detail: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> AuditLog:
    """Persist an AuditLog row and commit within the caller's session."""
    ip_address = None
    if request is not None:
        ip_address = request.client.host if request.client else None

    entry = AuditLog(
        user_id=user.id if user is not None else None,
        username=user.username if user is not None else "",
        role=user.role if user is not None else "",
        action=action,
        detail=json.dumps(detail or {}),
        ip_address=ip_address,
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    logger.info(
        "AuditLog action=%s user=%s role=%s id=%s",
        action,
        entry.username,
        entry.role,
        entry.id,
    )
    return entry
