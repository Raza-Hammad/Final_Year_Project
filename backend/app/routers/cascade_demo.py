"""Read-only cascade demo endpoint for the Cascade Machine "Demo traffic" mode."""

from __future__ import annotations

import logging
from typing import Any, Literal, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.auth import get_current_user
from app.db import User
from app.ml.cascade import get_detector
from app.rate_limit import limiter
from app.services.cascade_demo import (
    BUCKET_LABELS,
    GUIDED_ORDER,
    load_demo_flows,
    pick_flow,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cascade", tags=["cascade-demo"])
_rng = np.random.default_rng()


def _run_demo(mode: str, tier: Optional[int], cursor: int) -> dict[str, Any]:
    """Pick a curated flow and run the *real* cascade on it with tracing on."""
    buckets = load_demo_flows()
    bucket, flow = pick_flow(buckets, mode=mode, tier=tier, cursor=cursor, rng=_rng)
    detector = get_detector()
    result = detector.detect(flow["features"], trace=True)
    top = [
        {k: row[k] for k in ("feature", "value", "importance", "impact") if k in row}
        for row in result.get("top_features", [])[:5]
    ]
    return {
        "demo": True,
        "bucket": bucket,
        "bucket_label": BUCKET_LABELS[bucket],
        "flow_id": flow["id"],
        "true_label": flow["true_label"],
        "correct": result["predicted_label"] == flow["true_label"],
        "predicted_label": result["predicted_label"],
        "confidence": result["confidence"],
        "tier": result["tier"],
        "tier_name": result["tier_name"],
        "severity": result["severity"],
        "trace": result.get("trace", []),
        "top_features": top,
        "cursor": cursor,
        "next_cursor": cursor + 1,
        "playlist": list(GUIDED_ORDER),
    }


@router.get("/demo/next")
@limiter.limit("120/minute")
async def cascade_demo_next(
    request: Request,
    mode: Literal["guided", "random"] = "guided",
    tier: Optional[int] = None,
    cursor: int = 0,
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the next curated demo flow with a per-tier trace.

    Demo flows are real held-out test rows; they are never persisted as
    alerts or broadcast. ``cursor`` keeps guided playback stateless.
    """
    if tier is not None and tier not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="tier must be 1, 2 or 3")
    try:
        return await run_in_threadpool(_run_demo, mode, tier, max(0, cursor))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail="Demo flows unavailable: prepared test split is missing.",
        ) from exc
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
