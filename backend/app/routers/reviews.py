"""Reviews ("Wall of Signals"): one editable review per user, helpful votes, admin moderation.

All text is stored as plain text (trimmed, length-limited); the frontend renders it
as escaped React text. Admin actions are audited.
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.auth import get_current_user, require_admin
from app.db import Review, ReviewHelpful, User, get_session
from app.rate_limit import limiter
from app.services.audit import write_audit_log

router = APIRouter(tags=["reviews"])

TAG_VOCABULARY: tuple[str, ...] = (
    "Cascade",
    "Lattice",
    "Lab",
    "Explainability",
    "AI Assistant",
    "Design",
    "Performance",
)

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(text: str, limit: int) -> str:
    """Strip control chars and surrounding whitespace, then cap the length."""
    return _CTRL.sub("", text or "").strip()[:limit]


class ReviewIn(BaseModel):
    """Payload for creating / editing a review."""

    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=80)
    body: str = Field(default="", max_length=1000)
    would_recommend: bool = True
    suggestion: str = Field(default="", max_length=800)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _tags_in_vocab(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for tag in value:
            if tag not in TAG_VOCABULARY:
                raise ValueError(f"Unknown tag: {tag}")
            if tag not in seen:
                seen.append(tag)
        return seen


class ReviewModeration(BaseModel):
    """Admin moderation payload."""

    status: Literal["published", "hidden"]


def _display_name(user: User) -> str:
    """Privacy-safe author label — never an email address."""
    name = (user.username or "user").split("@")[0].replace("_", " ").replace(".", " ").strip()
    parts = [p for p in name.split() if p]
    if not parts:
        return "Anonymous"
    first = parts[0].capitalize()
    if len(parts) > 1:
        return f"{first} {parts[1][0].upper()}."
    return first


def _serialize(
    review: Review,
    *,
    viewer_id: int,
    helpful_ids: set[int],
    include_status: bool = False,
) -> dict[str, Any]:
    """Convert a Review row to a JSON-safe dict with viewer flags."""
    try:
        tags = json.loads(review.tags or "[]")
    except json.JSONDecodeError:
        tags = []
    data: dict[str, Any] = {
        "id": review.id,
        "author": review.author_display,
        "rating": review.rating,
        "title": review.title,
        "body": review.body,
        "would_recommend": review.would_recommend,
        "suggestion": review.suggestion,
        "tags": tags,
        "helpful_count": review.helpful_count,
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat(),
        "edited": review.edited,
        "mine": review.user_id == viewer_id,
        "i_marked_helpful": review.id in helpful_ids,
    }
    if include_status:
        data["status"] = review.status
        data["user_id"] = review.user_id
    return data


def _helpful_ids(session: Session, user_id: int) -> set[int]:
    rows = session.exec(select(ReviewHelpful.review_id).where(ReviewHelpful.user_id == user_id)).all()
    return {int(r) for r in rows}


@router.get("/api/reviews/summary")
async def reviews_summary(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Aggregate stats for the Wall of Signals hero."""
    rows = session.exec(select(Review).where(Review.status == "published")).all()
    count = len(rows)
    distribution = {str(i): 0 for i in range(1, 6)}
    tag_counter: Counter[str] = Counter()
    recommend = 0
    total = 0
    for r in rows:
        distribution[str(r.rating)] = distribution.get(str(r.rating), 0) + 1
        total += r.rating
        recommend += 1 if r.would_recommend else 0
        try:
            tag_counter.update(json.loads(r.tags or "[]"))
        except json.JSONDecodeError:
            pass
    return {
        "count": count,
        "average": round(total / count, 2) if count else 0.0,
        "distribution": distribution,
        "recommend_pct": round(100 * recommend / count) if count else 0,
        "top_tags": [{"tag": t, "count": c} for t, c in tag_counter.most_common(5)],
        "tag_vocabulary": list(TAG_VOCABULARY),
    }


@router.get("/api/reviews/mine")
async def my_review(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the caller's review (or ``{"review": null}``)."""
    review = session.exec(select(Review).where(Review.user_id == current_user.id)).first()
    if review is None:
        return {"review": None}
    return {
        "review": _serialize(
            review, viewer_id=int(current_user.id or 0), helpful_ids=set(), include_status=True
        )
    }


@router.get("/api/reviews")
async def list_reviews(
    sort: Literal["recent", "top", "helpful"] = "recent",
    tag: Optional[str] = None,
    min_rating: int = 1,
    limit: int = 30,
    offset: int = 0,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """List published reviews (hidden ones are excluded for everyone)."""
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    stmt = select(Review).where(Review.status == "published", Review.rating >= max(1, min_rating))
    rows = list(session.exec(stmt).all())
    if tag:
        rows = [r for r in rows if tag in (json.loads(r.tags or "[]"))]
    if sort == "top":
        rows.sort(key=lambda r: (r.rating, r.helpful_count, r.created_at), reverse=True)
    elif sort == "helpful":
        rows.sort(key=lambda r: (r.helpful_count, r.created_at), reverse=True)
    else:
        rows.sort(key=lambda r: r.created_at, reverse=True)
    total = len(rows)
    helpful = _helpful_ids(session, int(current_user.id or 0))
    page = rows[offset : offset + limit]
    return {
        "total": total,
        "items": [
            _serialize(r, viewer_id=int(current_user.id or 0), helpful_ids=helpful) for r in page
        ],
    }


def _apply(review: Review, body: ReviewIn) -> None:
    review.rating = body.rating
    review.title = _clean(body.title, 80)
    review.body = _clean(body.body, 1000)
    review.would_recommend = body.would_recommend
    review.suggestion = _clean(body.suggestion, 500)
    review.tags = json.dumps(body.tags)


@router.post("/api/reviews", status_code=201)
@limiter.limit("5/minute")
async def create_review(
    request: Request,
    body: ReviewIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create the caller's review (one per user)."""
    existing = session.exec(select(Review).where(Review.user_id == current_user.id)).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="You already have a review — edit it instead.")
    review = Review(user_id=int(current_user.id or 0), author_display=_display_name(current_user))
    _apply(review, body)
    session.add(review)
    session.commit()
    session.refresh(review)
    return _serialize(
        review, viewer_id=int(current_user.id or 0), helpful_ids=set(), include_status=True
    )


@router.put("/api/reviews/mine")
@limiter.limit("10/minute")
async def edit_review(
    request: Request,
    body: ReviewIn,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Edit the caller's review."""
    from app.db.models import _utc_now

    review = session.exec(select(Review).where(Review.user_id == current_user.id)).first()
    if review is None:
        raise HTTPException(status_code=404, detail="No review to edit.")
    _apply(review, body)
    review.edited = True
    review.updated_at = _utc_now()
    session.add(review)
    session.commit()
    session.refresh(review)
    return _serialize(
        review, viewer_id=int(current_user.id or 0), helpful_ids=set(), include_status=True
    )


def _delete_review(session: Session, review: Review) -> None:
    for vote in session.exec(select(ReviewHelpful).where(ReviewHelpful.review_id == review.id)).all():
        session.delete(vote)
    session.delete(review)
    session.commit()


@router.delete("/api/reviews/mine", status_code=204)
async def delete_my_review(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete the caller's review."""
    review = session.exec(select(Review).where(Review.user_id == current_user.id)).first()
    if review is None:
        raise HTTPException(status_code=404, detail="No review to delete.")
    _delete_review(session, review)
    return Response(status_code=204)


@router.post("/api/reviews/{review_id}/helpful")
@limiter.limit("60/minute")
async def toggle_helpful(
    request: Request,
    review_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Toggle a helpful vote (not allowed on your own review)."""
    review = session.get(Review, review_id)
    if review is None or review.status != "published":
        raise HTTPException(status_code=404, detail="Review not found.")
    if review.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't mark your own review helpful.")
    vote = session.exec(
        select(ReviewHelpful).where(
            ReviewHelpful.review_id == review_id, ReviewHelpful.user_id == current_user.id
        )
    ).first()
    if vote is None:
        session.add(ReviewHelpful(review_id=review_id, user_id=int(current_user.id or 0)))
        review.helpful_count += 1
        marked = True
    else:
        session.delete(vote)
        review.helpful_count = max(0, review.helpful_count - 1)
        marked = False
    session.add(review)
    session.commit()
    return {"id": review_id, "helpful_count": review.helpful_count, "i_marked_helpful": marked}


# --------------------------------------------------------------------------- admin


@router.get("/api/admin/reviews")
async def admin_list_reviews(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    """All reviews including hidden ones (admin moderation queue)."""
    rows = session.exec(select(Review)).all()
    rows = sorted(rows, key=lambda r: r.created_at, reverse=True)
    return {
        "total": len(rows),
        "items": [
            _serialize(r, viewer_id=int(current_user.id or 0), helpful_ids=set(), include_status=True)
            for r in rows
        ],
    }


@router.get("/api/admin/reviews/export")
async def admin_export_reviews(
    request: Request,
    format: Literal["csv"] = "csv",
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> Response:
    """CSV export of all reviews (FYP user-feedback evidence)."""
    rows = sorted(session.exec(select(Review)).all(), key=lambda r: r.created_at)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["id", "created_at", "author", "rating", "recommend", "tags", "title", "body", "suggestion", "helpful", "status"]
    )

    def safe(cell: str) -> str:
        # Neutralise spreadsheet formula injection.
        return "'" + cell if cell[:1] in ("=", "+", "-", "@") else cell

    for r in rows:
        writer.writerow(
            [
                r.id,
                r.created_at.isoformat(),
                safe(r.author_display),
                r.rating,
                "yes" if r.would_recommend else "no",
                "|".join(json.loads(r.tags or "[]")),
                safe(r.title),
                safe(r.body),
                safe(r.suggestion),
                r.helpful_count,
                r.status,
            ]
        )
    write_audit_log(session, user=current_user, action="reviews.export", detail={"rows": len(rows)}, request=request)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cascadyx_reviews.csv"'},
    )


@router.patch("/api/admin/reviews/{review_id}")
async def admin_moderate_review(
    request: Request,
    review_id: int,
    body: ReviewModeration,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    """Hide or unhide a review (audited)."""
    review = session.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    review.status = body.status
    session.add(review)
    session.commit()
    write_audit_log(
        session,
        user=current_user,
        action="reviews.hide" if body.status == "hidden" else "reviews.unhide",
        detail={"review_id": review_id},
        request=request,
    )
    return {"id": review_id, "status": review.status}


@router.delete("/api/admin/reviews/{review_id}", status_code=204)
async def admin_delete_review(
    request: Request,
    review_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> Response:
    """Delete any review (audited)."""
    review = session.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found.")
    _delete_review(session, review)
    write_audit_log(
        session, user=current_user, action="reviews.delete", detail={"review_id": review_id}, request=request
    )
    return Response(status_code=204)
