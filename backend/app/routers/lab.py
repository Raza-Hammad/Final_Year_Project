"""Attack Lab API: scenario catalogue, Quick Lab sessions and Live Lab sensor status.

Cascadyx never launches attack tools. Quick Lab streams a captured lab session
through the cascade; Live Lab only surfaces detections from a real Sensor VM
feeding ``data/raw/lab/live/``.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.auth import get_current_user, require_admin
from app.db import User, get_session
from app.rate_limit import limiter
from app.services.audit import write_audit_log
from app.services.lab import (
    PRE_START_CHECKLIST,
    load_manifest,
    public_scenario,
    resolve_quick_path,
    sensor_watcher,
)
from app.simulator import simulator_engine

router = APIRouter(prefix="/api/lab", tags=["lab"])

_SESSIONS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
_MAX_SESSIONS = 20


class LabSessionRequest(BaseModel):
    """Start a Quick Lab session."""

    scenario_id: str
    rate: int = 8


def _find(scenario_id: str) -> dict[str, Any]:
    for scenario in load_manifest():
        if scenario["id"] == scenario_id:
            return scenario
    raise HTTPException(status_code=404, detail="Unknown lab scenario.")


def _session_view(record: dict[str, Any]) -> dict[str, Any]:
    """Merge a stored session with live engine counters."""
    status = simulator_engine.get_status()
    is_active = (
        status.get("running")
        and status.get("mode") == "replay"
        and status.get("scenario") == f"lab:{record['scenario_id']}"
        and not record.get("stopped")
    )
    state = "running" if is_active else ("stopped" if record.get("stopped") else "completed")
    if not is_active and record.get("failed"):
        state = "failed"
    view: dict[str, Any] = {
        "id": record["id"],
        "scenario_id": record["scenario_id"],
        "track": "quick",
        "state": state,
        "started_at": record["started_at"],
    }
    if state == "running" or record["id"] == next(reversed(_SESSIONS), None):
        view.update(
            elapsed_seconds=status.get("elapsed_seconds", 0),
            flows_total=status.get("flows_built", 0),
            flows_classified=status.get("packets_sent", 0),
            threats_found=status.get("attacks_detected", 0),
            tier_breakdown=status.get("tier_breakdown", {}),
            error=status.get("replay_error"),
        )
    return view


@router.get("/scenarios")
async def lab_scenarios(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Scenario cards plus the isolation checklist for the Live Lab."""
    return {
        "scenarios": [public_scenario(s) for s in load_manifest()],
        "checklist": list(PRE_START_CHECKLIST),
        "isolation_note": (
            "Attacks run only between two VMs on a sealed VirtualBox Internal Network. "
            "Cascadyx itself never launches attack tools."
        ),
    }


@router.get("/status")
async def lab_status(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Sensor status for the Live Lab track plus the active Quick Lab session id."""
    active = None
    for record in reversed(_SESSIONS.values()):
        if _session_view(record)["state"] == "running":
            active = record["id"]
            break
    return {"sensor": sensor_watcher.status(), "active_session": active}


@router.post("/sessions", status_code=201)
@limiter.limit("20/minute")
async def lab_start_session(
    request: Request,
    req: LabSessionRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Start a Quick Lab session (analyst+; audited)."""
    scenario = _find(req.scenario_id)
    path = resolve_quick_path(scenario)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail="This scenario's lab session isn't available yet. Try another scenario.",
        )
    try:
        simulator_engine.start_replay(
            path,
            max_packets=int(scenario.get("max_packets", 500)),
            rate=max(1, req.rate),
            duration_seconds=int(scenario.get("duration_s", 60)),
            source_scenario=f"lab:{scenario['id']}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Lab session unavailable.") from exc

    record = {
        "id": uuid.uuid4().hex[:12],
        "scenario_id": scenario["id"],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stopped": False,
    }
    _SESSIONS[record["id"]] = record
    while len(_SESSIONS) > _MAX_SESSIONS:
        _SESSIONS.popitem(last=False)
    write_audit_log(
        session,
        user=current_user,
        action="lab.start",
        detail={"scenario_id": scenario["id"], "track": "quick"},
        request=request,
    )
    return _session_view(record)


@router.get("/sessions/{session_id}")
async def lab_get_session(
    session_id: str, current_user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """Progress for a Quick Lab session."""
    record = _SESSIONS.get(session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return _session_view(record)


@router.post("/sessions/{session_id}/stop")
async def lab_stop_session(
    request: Request,
    session_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Stop a Quick Lab session (audited)."""
    record = _SESSIONS.get(session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    if simulator_engine.is_running and simulator_engine.get_status().get("mode") == "replay":
        simulator_engine.stop()
    record["stopped"] = True
    write_audit_log(
        session,
        user=current_user,
        action="lab.stop",
        detail={"scenario_id": record["scenario_id"]},
        request=request,
    )
    return _session_view(record)


@router.post("/live/{action}")
async def lab_live_toggle(
    request: Request,
    action: Literal["enable", "disable"],
    current_user: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Admin: turn the Live Lab sensor watcher on or off (audited)."""
    if action == "enable":
        sensor_watcher.start()
    else:
        sensor_watcher.stop()
    write_audit_log(
        session, user=current_user, action=f"lab.sensor.{action}", detail={}, request=request
    )
    return sensor_watcher.status()
