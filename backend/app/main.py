"""
===============================================================================
STUDENT EXPLANATORY GUIDE: main.py
===============================================================================
WHAT THIS FILE IS FOR:
----------------------
This file is the Main Entry Point and Primary Router of the FastAPI backend application!
It configures the FastAPI web server, initializes database tables and ML models on startup,
defines CORS middleware, sets up rate limiters, handles user authentication routes,
and exposes REST API endpoints for threat detection, simulator controls, alert exports (PDF/CSV),
Explainable AI (XAI), and the Sentinel AI SOC Assistant.

KEY FUNCTIONALITIES:
--------------------
1. `@asynccontextmanager lifespan()`: Executes startup tasks when FastAPI boots:
   - Initializes database tables (`init_db()`).
   - Pre-loads machine learning models (`CascadeDetector`) into memory.
   - Pre-loads simulator test dataset mappings (`simulator_engine.initialize()`).
2. Authentication Endpoints (`/api/auth/login`, `/api/auth/logout`, `/api/users/me`):
   - Logs users in and returns signed JWT tokens.
3. Prediction Endpoint (`/api/predict`):
   - Receives network feature vectors, runs 3-Tier ML Cascade classification, persists alerts, and broadcasts to WebSockets.
4. Simulator Endpoints (`/api/simulate/start`, `/api/simulate/stop`, `/api/simulate/status`,
   `/api/simulate/replay/start`, `/api/simulate/replay/stop`):
   - Controls CSV threat scenario simulation and isolated PCAP Live Replay.
5. Alert Management Endpoints (`/api/alerts`, `/api/alerts/stats`, `/api/alerts/export`):
   - Fetches historical security alerts and exports PDF / CSV session reports.
6. Model Metrics & SMOTE Stats (`/api/models/metrics`, `/api/data/smote-stats`):
   - Returns evaluation metrics and Before/After SMOTE oversampling class ratios to the UI.
7. Sentinel AI Assistant Router (`/api/chat`, `/api/conversations`):
   - Routes user SOC questions to Nebius AI Studio (OpenAI-compatible) or offline Rule-Based logic.

LIBRARIES & TOOLS USED:
-----------------------
- `fastapi.FastAPI`, `Depends`, `HTTPException`: Core REST API framework and dependency injection.
- `slowapi.Limiter`: Rate-limiting library protecting endpoints against brute-force flooding.
- `reportlab.platypus`: Generates dynamic, professional PDF security reports for alert exports.
- `openai` (Nebius): OpenAI-compatible client for Nebius Token Factory chat completions.
- `sqlmodel.Session`, `select`: Database ORM query builder.
===============================================================================
"""

import json
import logging
import os
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, status, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from app.static_ui import mount_frontend
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session, select, func
from datetime import datetime, timedelta, timezone
from typing import Optional
from io import BytesIO
import tempfile
import shutil
import secrets
from urllib.parse import quote

from app.middleware import RequestLoggingMiddleware, SecurityHeadersMiddleware

from app.config import settings, validate_public_mode
from app.db import (
    engine, init_db, get_session, User, Alert, AuditLog, UserCreate, UserResponse, Token, PredictionRequest,
    GoogleAuthRequest,
    Conversation, ChatMessage, ConversationSummary, ChatMessageResponse, ConversationDetail, ConversationUpdate
)
from app.auth import (
    get_password_hash, verify_password, create_access_token, get_current_user,
    decode_token, revoke_token, oauth2_scheme, get_user_by_username, require_admin,
)
from app.auth.google_oauth import (
    GIS_POPUP_REDIRECT_URI,
    build_google_authorize_url,
    exchange_google_auth_code,
    get_or_create_google_user,
    google_client_id_looks_valid,
    google_oauth_configured,
    google_required_origins,
    google_redirect_configured,
    issue_access_token_for_user,
    sanitize_frontend_next,
    verify_google_id_token,
)
from app.services.audit import write_audit_log
from jose import JWTError
from app.ml.cascade import CascadeDetector, get_detector
from app.ml.severity import compute_severity
from app.ml.metadata_helper import get_raw_flow_metadata
from app.simulator import simulator_engine
from app.ws_manager import manager, broadcast_detection
from pydantic import BaseModel
from typing import Optional, Dict, Any

class SimulateStartRequest(BaseModel):
    scenario: str
    rate: int = 1
    duration_seconds: Optional[int] = None

class XaiRequest(BaseModel):
    predicted_label: str
    confidence: float
    tier: int
    features: Dict[str, Any]

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[int] = None
    incognito: bool = False

class PcapAnalyzeBody(BaseModel):
    """JSON body for server-side CIC PCAP analysis (path under data/raw)."""
    pcap_path: str
    max_packets: int = 500
    persist_alerts: bool = True
    broadcast: bool = True
    source_scenario: str = "pcap"


class ReplayStartRequest(BaseModel):
    """JSON body for isolated PCAP Live Replay (path under data/raw)."""

    pcap_path: str
    max_packets: int = 500
    rate: int = 5
    duration_seconds: Optional[int] = None
    source_scenario: str = "isolated_replay"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

async def send_heartbeat():
    """Periodic background worker sending heartbeat ping event to connected frontends."""
    while True:
        try:
            await asyncio.sleep(5)  # 5-second interval
            heartbeat_msg = {
                "event": "heartbeat",
                "timestamp": datetime.utcnow().isoformat()
            }
            await manager.broadcast(heartbeat_msg)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in heartbeat loop: {e}")
            await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 0. Public deploys must have a strong JWT_SECRET + ADMIN_SEED_PASSWORD (no-op locally).
    validate_public_mode()

    # 1. Initialize SQLite Database Tables (creates /data/cache/app.db)
    logger.info("Initializing database tables on startup...")
    init_db()
    
    # 2. Seed default admin user on first run if not exists
    with Session(engine) as session:
        statement = select(User).where(User.role == "admin")
        admin = session.exec(statement).first()
        if not admin:
            # Seed password: ADMIN_SEED_PASSWORD env var, else a random one-time value
            # printed in the banner below (never a hard-coded default).
            admin_password = os.getenv("ADMIN_SEED_PASSWORD", "").strip() or secrets.token_urlsafe(14)
            hashed_pwd = get_password_hash(admin_password)
            admin_user = User(
                username="admin",
                hashed_password=hashed_pwd,
                role="admin"
            )
            session.add(admin_user)
            session.commit()
            
            # Print credentials prominently in a clean visual banner on stdout
            logger.info(
                "\n" + "=" * 80 +
                "\n          [SEEDING DEFAULT ADMIN USER] FIRST TIME RUN ONLY" +
                "\n" + "=" * 80 +
                "\n  An administrative user has been successfully seeded in the database." +
                f"\n  Username: admin" +
                (
                    "\n  Password: (from ADMIN_SEED_PASSWORD env var — not logged)"
                    if settings.PUBLIC_MODE
                    else f"\n  Password: {admin_password}"
                ) +
                "\n  Role:     admin" +
                "\n" + "=" * 80
            )
            
    # 3. Load Cascade Detector into memory once
    logger.info("Initializing CascadeDetector models (this may take a few seconds)...")
    try:
        app.state.detector = get_detector()
        logger.info("CascadeDetector successfully loaded and cached in application state.")
    except Exception as e:
        logger.error(f"Failed to load CascadeDetector: {e}")
        
    # 4. Initialize Simulation Engine index mappings
    try:
        simulator_engine.initialize()
    except Exception as e:
        logger.error(f"Failed to initialize simulator engine indices: {e}")
        
    # 5. Start background heartbeat task
    logger.info("Starting background WebSocket heartbeat loop...")
    heartbeat_task = asyncio.create_task(send_heartbeat())

    # 6. Optional Live Lab sensor watcher (admins can also toggle it in the UI).
    if os.getenv("LAB_SENSOR_WATCH", "").strip() == "1":
        from app.services.lab import sensor_watcher
        sensor_watcher.start()
    
    yield
    
    # Clean up background task on shutdown
    logger.info("Stopping simulator engine if active...")
    simulator_engine.stop()
    from app.services.lab import sensor_watcher
    sensor_watcher.stop()

    logger.info("Stopping background WebSocket heartbeat task...")
    heartbeat_task.cancel()
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass
    logger.info("Application shutting down.")

# PUBLIC_MODE hides the interactive API docs from the open internet.
_docs_kwargs: dict = (
    {"docs_url": None, "redoc_url": None, "openapi_url": None}
    if settings.PUBLIC_MODE
    else {}
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for Cybersecurity Threat Simulator Powered by AI",
    version="0.1.0",
    lifespan=lifespan,
    **_docs_kwargs,
)

# Rate limiting — auth + sensitive admin/detection endpoints (Phase 6).
# Limits are intentionally generous for local FYP demos / pytest; they still
# blunt naive brute-force and accidental UI hammering.
from app.rate_limit import limiter  # shared with routers
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def _error_payload(
    *,
    status_code: int,
    detail: object,
    request: Optional[Request] = None,
    error: str = "error",
) -> dict:
    """Uniform JSON error envelope used by exception handlers."""
    request_id = None
    if request is not None:
        request_id = getattr(request.state, "request_id", None)
    payload: dict = {"error": error, "detail": detail, "status_code": status_code}
    if request_id:
        payload["request_id"] = request_id
    return payload


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a consistent 422 body for malformed request payloads."""
    logger.warning(
        "validation_error path=%s detail=%s",
        request.url.path,
        exc.errors(),
    )
    # Prefer the newer Starlette alias when available; fall back for older pins.
    unprocessable = getattr(
        status, "HTTP_422_UNPROCESSABLE_CONTENT", status.HTTP_422_UNPROCESSABLE_ENTITY
    )
    return JSONResponse(
        status_code=unprocessable,
        content=_error_payload(
            status_code=unprocessable,
            detail=jsonable_encoder(exc.errors(), custom_encoder={Exception: str}),
            request=request,
            error="validation_error",
        ),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Keep FastAPI HTTPException semantics but attach request_id when present."""
    headers = dict(exc.headers) if exc.headers else None
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(
            status_code=exc.status_code,
            detail=exc.detail,
            request=request,
            error="http_error",
        ),
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so unexpected failures never leak stack traces to clients."""
    logger.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_payload(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error. Check server logs for details.",
            request=request,
            error="internal_error",
        ),
    )


# CORS: local Vite dev server / script probes + PUBLIC_BASE_URL + CORS_ORIGINS (env).
# In the recommended public deploy the SPA, API and WS share one origin, so CORS is
# rarely exercised — but the public origin is allow-listed anyway.
origins = settings.cors_allowed_origins()

# Middleware order: last added runs first. Request logging wraps CORS so we still
# observe CORS-preflight / actual request timing for API paths.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)
if settings.PUBLIC_MODE:
    # Outermost: security headers land on every response (API, SPA, errors).
    app.add_middleware(SecurityHeadersMiddleware)

@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend connectivity."""
    return {"status": "ok"}


@app.get("/api/ready")
def readiness_check(request: Request):
    """Deployment smoke check: models loaded, UI bundle present, public-mode flag."""
    from app.static_ui import frontend_dist_ready

    detector_loaded = getattr(request.app.state, "detector", None) is not None
    payload = {
        "status": "ok" if detector_loaded else "degraded",
        "detector_loaded": detector_loaded,
        "ui_built": frontend_dist_ready(),
        "public_mode": settings.PUBLIC_MODE,
    }
    if not detector_loaded:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload

# --- AUTHENTICATION ROUTES ---

@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register_user(request: Request, user_in: UserCreate, session: Session = Depends(get_session)):
    """Public endpoint to register a new user analyst account."""
    # Check if user already exists
    statement = select(User).where(User.username == user_in.username)
    existing_user = session.exec(statement).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered."
        )
        
    # Create new user (students / self-register always land as analyst)
    hashed_pwd = get_password_hash(user_in.password)
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_pwd,
        role="analyst",
        ai_queries_used=0,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    return new_user

@app.post("/api/auth/login", response_model=Token)
@limiter.limit("5/minute")
def login_user(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    """Authenticates username/password and returns a JWT token containing sub + role claims."""
    statement = select(User).where(User.username == form_data.username)
    user = session.exec(statement).first()
    if (
        not user
        or not user.hashed_password
        or not verify_password(form_data.password, user.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    # Sign token containing sub and role claims
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/logout")
def logout_user(token: str = Depends(oauth2_scheme)):
    """Revokes the presented token's jti so it can no longer be used to authenticate (Protected)."""
    try:
        payload = decode_token(token)
    except JWTError:
        # Already invalid/expired -- logging out is a no-op, not an error.
        return {"status": "logged_out"}
    jti = payload.get("jti")
    if jti:
        revoke_token(jti)
    return {"status": "logged_out"}


@app.get("/api/auth/google/config")
def google_auth_config():
    """Public Google Sign-In config for the SPA (client id is public; secret is never returned)."""
    client_id = settings.GOOGLE_CLIENT_ID or None
    return {
        "enabled": google_oauth_configured(),
        "client_id": client_id,
        "redirect_enabled": google_redirect_configured(),
        # Diagnostics only (all public values; never the secret).
        "redirect_uri": settings.GOOGLE_REDIRECT_URI or None,
        "client_id_looks_valid": google_client_id_looks_valid(client_id),
        "required_origins": google_required_origins(),
    }


@app.post("/api/auth/google", response_model=Token)
@limiter.limit("10/minute")
def google_auth_token(
    request: Request,
    body: GoogleAuthRequest,
    session: Session = Depends(get_session),
):
    """SPA Google Sign-In: verify GIS ID token or exchange a popup auth code, then issue JWT.

    Preferred path for Vite (:5173) and production same-origin (:8000): the frontend
    obtains a Google credential via Identity Services and posts it here. Client secret
    stays on the server (used only for authorization-code exchange).
    """
    if not google_oauth_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured on this server.",
        )

    claims = None
    try:
        if body.id_token:
            claims = verify_google_id_token(body.id_token.strip())
        elif body.code:
            # GIS ``initCodeClient`` popup uses redirect_uri=postmessage.
            claims = exchange_google_auth_code(
                body.code.strip(),
                redirect_uri=GIS_POPUP_REDIRECT_URI,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide id_token or code.",
            )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    user = get_or_create_google_user(session, claims)
    return {"access_token": issue_access_token_for_user(user), "token_type": "bearer"}


@app.get("/api/auth/google/login")
@limiter.limit("10/minute")
def google_auth_login(request: Request, next: Optional[str] = None):
    """Start Google OAuth redirect flow; browser returns via ``/api/auth/google/callback``."""
    if not google_redirect_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google redirect Sign-In is not configured on this server.",
        )
    state = secrets.token_urlsafe(24)
    safe_next = sanitize_frontend_next(next)
    # Short-lived cookie bridges CSRF state + post-login destination across the Google hop.
    response = RedirectResponse(url=build_google_authorize_url(state), status_code=302)
    response.set_cookie(
        key="g_oauth_state",
        value=state,
        httponly=True,
        samesite="lax",
        max_age=600,
        path="/api/auth/google",
    )
    response.set_cookie(
        key="g_oauth_next",
        value=safe_next,
        httponly=True,
        samesite="lax",
        max_age=600,
        path="/api/auth/google",
    )
    return response


@app.get("/api/auth/google/callback")
@limiter.limit("10/minute")
def google_auth_callback(
    request: Request,
    session: Session = Depends(get_session),
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """OAuth redirect callback: exchange code, upsert user, send JWT to SPA via URL hash."""
    cookie_state = request.cookies.get("g_oauth_state")
    next_url = sanitize_frontend_next(request.cookies.get("g_oauth_next"))

    def _error_redirect(message: str) -> RedirectResponse:
        sep = "&" if "?" in next_url else "?"
        # Errors use a query param the Login page can show; success uses the hash (below).
        target = f"{next_url}{sep}google_error={quote(message)}"
        resp = RedirectResponse(url=target, status_code=302)
        resp.delete_cookie("g_oauth_state", path="/api/auth/google")
        resp.delete_cookie("g_oauth_next", path="/api/auth/google")
        return resp

    if error:
        return _error_redirect(error)
    if not code or not state or not cookie_state or state != cookie_state:
        return _error_redirect("invalid_oauth_state")
    if not google_redirect_configured():
        return _error_redirect("google_not_configured")

    try:
        claims = exchange_google_auth_code(code, redirect_uri=settings.GOOGLE_REDIRECT_URI)
        user = get_or_create_google_user(session, claims)
        token = issue_access_token_for_user(user)
    except ValueError as exc:
        logger.warning("Google OAuth callback failed: %s", exc)
        return _error_redirect("google_auth_failed")

    # Hash fragment keeps the JWT out of server logs / Referer on subsequent navigations.
    if next_url.startswith("http"):
        target = f"{next_url}#access_token={token}"
    else:
        # Relative path on same host as this API (production static on :8000).
        target = f"{next_url}#access_token={token}"
    resp = RedirectResponse(url=target, status_code=302)
    resp.delete_cookie("g_oauth_state", path="/api/auth/google")
    resp.delete_cookie("g_oauth_next", path="/api/auth/google")
    return resp


@app.get("/api/users/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the logged-in analyst's profile details."""
    return current_user

# --- ML CASCADE PREDICTION & METRICS ---

@app.post("/api/predict")
@limiter.limit("60/minute")
async def predict_flow(
    request: Request,
    body: PredictionRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Receives raw network packet features, runs cascade detection, and records threat alerts (Protected)."""
    detector: CascadeDetector = getattr(app.state, "detector", None)
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Machine learning cascade detector is not loaded yet."
        )
        
    try:
        # Run detection (needs to run in main thread or run pool if blocking, but it's fast enough)
        result = detector.detect(body.features)
    except Exception as e:
        logger.error(f"Inference failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inference failed. Check that the submitted features match the expected schema."
        )
        
    label = result["predicted_label"]
    # Determine IP/Port display metadata using deterministic hash of features
    import hashlib
    features_hash = hashlib.md5(json.dumps(body.features).encode('utf-8')).hexdigest()
    idx = int(features_hash, 16) % 1000000
    src_ip, dest_ip, src_port, dest_port = get_raw_flow_metadata(idx, label)
    result["source_ip"] = src_ip
    result["dest_ip"] = dest_ip
    result["source_port"] = src_port
    result["dest_port"] = dest_port

    # If the label is not BENIGN, record an alert in the SQLite database
    if label.upper() != "BENIGN":
        alert = Alert(
            predicted_label=label,
            confidence=result["confidence"],
            tier=result["tier"],
            source_scenario=body.source_scenario or "simulation",
            severity=result.get("severity", "Medium"),
            source_ip=src_ip,
            dest_ip=dest_ip,
            source_port=src_port,
            dest_port=dest_port,
            raw_features=json.dumps(body.features)
        )
        session.add(alert)
        session.commit()
        session.refresh(alert)
        result["alert_id"] = alert.id
        result["source_scenario"] = alert.source_scenario
        logger.info(f"Threat Alert recorded [ID: {alert.id}]: {label} (Scenario: {alert.source_scenario}, Tier: {alert.tier})")
        
    # Broadcast classification result to all connected WebSocket clients instantly
    await broadcast_detection(result)
        
    return result

# Nebius AI Studio (OpenAI-compatible) — SENTINEL AI + XAI prose
from app.services.nebius_client import nebius_client


def _is_nebius_transient_error(e: Exception) -> bool:
    """Detect rate-limit / quota / overloaded responses from Nebius."""
    err_str = str(e).lower()
    status = getattr(e, "status_code", None) or getattr(e, "code", None)
    if status in (429, 503):
        return True
    return any(
        term in err_str
        for term in ("quota", "rate limit", "resource_exhausted", "too many requests", "overloaded")
    )


def _ai_queries_used(user: User) -> int:
    """Safe read of lifetime LLM query counter (handles pre-migration rows)."""
    return int(getattr(user, "ai_queries_used", 0) or 0)


def _is_ai_unlimited(user: User) -> bool:
    """Admins have no lifetime AI cap (role is read from the DB, never the JWT)."""
    return (getattr(user, "role", "") or "").lower() == "admin"


def _ai_queries_remaining(user: User) -> Optional[int]:
    """How many successful LLM chat replies the user may still consume.

    Returns ``None`` for unlimited (admin) users.
    """
    if _is_ai_unlimited(user):
        return None
    return max(0, settings.AI_QUERY_LIMIT - _ai_queries_used(user))


def _ai_quota_fields(user: User) -> Dict[str, Any]:
    """Shared quota payload for chat, status and quota endpoints."""
    unlimited = _is_ai_unlimited(user)
    return {
        "ai_unlimited": unlimited,
        "ai_queries_used": _ai_queries_used(user),
        "ai_queries_remaining": _ai_queries_remaining(user),
        "ai_query_limit": None if unlimited else settings.AI_QUERY_LIMIT,
    }


def _increment_ai_queries_used(session: Session, user: User) -> User:
    """Bump lifetime LLM counter after a successful Nebius/chat completion."""
    db_user = session.get(User, user.id)
    if db_user is None:
        return user
    db_user.ai_queries_used = _ai_queries_used(db_user) + 1
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


_AI_QUOTA_EXHAUSTED_DETAIL = (
    f"You've used all {settings.AI_QUERY_LIMIT} AI questions included with your account. "
    "Common topics (cascade architecture, simulator presets, threat types) still work via "
    "built-in answers — or ask your instructor if you need more AI questions."
)


@app.post("/api/xai/explain")
@limiter.limit("30/minute")
async def explain_packet(
    request: Request,
    req: XaiRequest,
    current_user: User = Depends(get_current_user)
):
    """Generates a plain-English explanation for a flagged packet flow (Protected)."""
    detector: CascadeDetector = getattr(app.state, "detector", None)
    if detector is None:
        detector = get_detector()
        
    try:
        result = detector.detect(req.features)
        top_features = result.get("top_features", [])
    except Exception as e:
        logger.warning(f"Failed to align features in explain endpoint: {e}")
        top_features = []

    features_desc_list = []
    for feat in top_features:
        name = feat.get("feature")
        val = feat.get("value", 0.0)
        benign_avg = feat.get("benign_avg", 0.0)
        features_desc_list.append(
            f"- {name}: Value = {val:.4f} (Benign Baseline Average = {benign_avg:.4f})"
        )
    features_str = "\n".join(features_desc_list)
    
    tier_names = {
        1: "Tier 1: LightGBM (Fast Volumetric Screener)",
        2: "Tier 2: Random Forest (Explainable Validator)",
        3: "Tier 3: Expert Ensemble & Weighted Vote"
    }
    tier_name = tier_names.get(req.tier, f"Tier {req.tier} Classifier")

    explanation = None
    if nebius_client.is_available():
        prompt = (
            "You are a security operations center (SOC) AI analyst.\n"
            f"Provide exactly one plain-English sentence explaining why this network flow was "
            f"classified as '{req.predicted_label}' by the ML cascade.\n"
            "Keep the sentence professional, highly technical but readable, and direct. "
            "Mention specific values and comparison with their benign baseline averages if appropriate.\n\n"
            f"Resolution Tier: {tier_name}\n"
            f"Confidence level: {req.confidence:.2%}\n"
            f"Top contributing packet features:\n{features_str}\n\n"
            "Format instructions:\n"
            "Provide exactly one natural, readable sentence. Do NOT use markdown bolding, "
            "asterisks (*), or lists in the output sentence. Do not say "
            "\"Based on the provided information...\" or similar intro phrases."
        )
        try:
            loop = asyncio.get_running_loop()

            def call_nebius() -> str:
                return nebius_client.chat_completion(
                    [
                        {"role": "system", "content": "You are a concise SOC AI analyst for Cascadyx, a LightGBM → Random Forest → XGBoost/weighted-vote cascade detector. Never mention any AI vendor or platform name."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=256,
                )

            explanation = await loop.run_in_executor(None, call_nebius)
            explanation = explanation.replace("*", "").replace("`", "").strip()
        except Exception as api_err:
            if _is_nebius_transient_error(api_err):
                logger.warning("Nebius transient error in explain endpoint: %s", api_err)
            else:
                logger.error("Nebius API execution error in explain: %s", api_err)
            explanation = None

    if not explanation:
        if top_features:
            primary_feat = top_features[0]
            name = primary_feat.get("feature")
            val = primary_feat.get("value", 0.0)
            benign_avg = primary_feat.get("benign_avg", 0.0)
            explanation = (
                f"This flow was flagged as a potential {req.predicted_label} threat by {tier_name} (Confidence: {req.confidence:.1%}) "
                f"primarily because the feature '{name}' was measured at {val:.2f}, which deviates significantly from the benign average of {benign_avg:.2f}."
            )
        else:
            explanation = (
                f"This flow was flagged as a potential {req.predicted_label} threat by {tier_name} (Confidence: {req.confidence:.1%}) "
                f"based on multivariate feature anomalies matching threat signatures."
            )

    return {
        "verdict": req.predicted_label,
        "confidence": req.confidence,
        "tier": req.tier,
        "tier_name": tier_name,
        "top_features": top_features,
        "explanation": explanation,
        "benign_averages": result.get("benign_averages", {}) if 'result' in locals() else {},
        "severity": compute_severity(req.predicted_label, req.confidence)
    }


RULES_QA = [
    {
        "keywords": ["how does the cascade work", "cascade logic", "explain cascade", "cascade pipeline"],
        "answer": "The threat detection system utilizes a 3-tier cascade to maximize accuracy and explainability. Tier 1 (LightGBM) screens every incoming flow first — it is selected for its highest overall accuracy (99.472%), not speed — and resolves the clear majority of decisions with high confidence. Tier 2 (Random Forest) validates the remaining uncertain cases and is actually the fastest model at inference (~2.88μs), also driving the system's explainability. Low-confidence anomalies escalate to Tier 3 (Expert Ensemble) for a weighted vote (LGBM 0.2 / RF 0.3 / XGB 0.5) to resolve the final alert verdict.",
        "source": "Rule-Based"
    },
    {
        "keywords": ["ddos", "distributed denial of service", "storm preset"],
        "answer": "The DDoS storm simulation preset replays high-volume SYN/UDP flooding traffic. It is characterized by high packet rates, large backward/forward packet counts, and elevated TCP window sizes (Init_Win_bytes_forward).",
        "source": "Rule-Based"
    },
    {
        "keywords": ["port scan", "portscan", "reconnaissance"],
        "answer": "The Port Scan simulation preset replays scanning traffic (SYN, ACK, NULL, FIN scans). It maps open host ports and is identified by low flow duration, high forward packet rates, and empty payloads.",
        "source": "Rule-Based"
    },
    {
        "keywords": ["brute force", "bruteforce", "credential stuffing"],
        "answer": "The Brute Force simulation preset replays SSH/FTP credential-stuffing login attempts. It features repeated connection attempts, small data transfers, and standard patterns in TCP handshake intervals.",
        "source": "Rule-Based"
    },
    {
        "keywords": ["what is the threshold", "confidence threshold", "escalation threshold"],
        "answer": "The escalation threshold is set to 0.85 (85%) by default. If a classifier's prediction confidence is below 0.85, the flow escalates to the next tier in the cascade.",
        "source": "Rule-Based"
    },
    {
        "keywords": ["who created this", "about this project", "project creator"],
        "answer": "This is Cascadyx (Signal Observatory), a cybersecurity console for security operations analysts to safely explore sealed-lab attack sessions and study explainable cascade detection (LightGBM → Random Forest → XGBoost/weighted vote).",
        "source": "Rule-Based"
    }
]

def _save_chat_turn(
    session: Session, user: User, conversation_id: Optional[int],
    user_msg: str, answer: str, source: str, incognito: bool
) -> Optional[int]:
    """Persists a user+assistant message pair to a Conversation, creating one if
    needed. Returns None (no-op) when incognito, so nothing is ever written."""
    if incognito:
        return None

    conversation: Optional[Conversation] = None
    if conversation_id is not None:
        conversation = session.get(Conversation, conversation_id)
        if conversation is not None and conversation.user_id != user.id:
            conversation = None  # not owned by this user -- start a fresh one instead

    if conversation is None:
        title = user_msg[:60] + ("…" if len(user_msg) > 60 else "")
        conversation = Conversation(user_id=user.id, title=title or "New conversation")
        session.add(conversation)
        session.commit()
        session.refresh(conversation)

    session.add(ChatMessage(conversation_id=conversation.id, role="user", content=user_msg))
    session.add(ChatMessage(conversation_id=conversation.id, role="assistant", content=answer, source=source))
    conversation.updated_at = datetime.now(timezone.utc)
    session.add(conversation)
    session.commit()
    return conversation.id


@app.post("/api/chat")
@limiter.limit("30/minute")
async def chat_assistant(
    request: Request,
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Provides security operations intelligence through Nebius (primary, with
    per-conversation memory) and rule-based/offline fallback when Nebius is
    unavailable (Protected). Persists the turn to a Conversation unless incognito."""
    _ = request  # required by slowapi key function / rate-limit decorator
    user_msg = req.message.strip()
    user_msg_lower = user_msg.lower()

    # 1. Check for "explain last alert" trigger -- real DB context, useful to
    # both the Nebius prompt and the rule-based/offline fallback text.
    is_last_alert_query = any(k in user_msg_lower for k in [
        "last alert", "last threat", "last attack", "latest alert", "latest threat", "latest attack", "explain the last"
    ])

    latest_alert_details = None
    if is_last_alert_query:
        stmt = select(Alert).order_by(Alert.id.desc()).limit(1)
        alert = session.exec(stmt).first()
        if alert:
            try:
                features = json.loads(alert.raw_features)
            except Exception:
                features = {}

            detector = getattr(app.state, "detector", None) or get_detector()
            try:
                result = detector.detect(features)
                top_feats = result.get("top_features", [])
            except Exception:
                top_feats = []

            feats_str = ", ".join([f"'{f['feature']}'={f['value']:.2f} (benign avg: {f['benign_avg']:.2f})" for f in top_feats])
            latest_alert_details = (
                f"Latest logged alert [ID {alert.id}] at {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}. "
                f"Verdict: {alert.predicted_label} (Confidence: {alert.confidence:.2%}, Resolved by Tier {alert.tier}). "
                f"Top attributing features: {feats_str}."
            )
        else:
            latest_alert_details = "No alerts have been recorded in the database yet."

    last_alert_fallback_text = (
        f"Here is the details of the latest logged security event:\n{latest_alert_details}"
        if latest_alert_details else None
    )

    answer: Optional[str] = None
    source: Optional[str] = None
    used_llm = False
    unlimited = _is_ai_unlimited(current_user)
    remaining_before = _ai_queries_remaining(current_user)
    has_quota = unlimited or (remaining_before or 0) > 0
    ai_online = nebius_client.is_available()

    # 2. LLM is the primary engine when configured and the user still has quota.
    # It gets real conversation memory (prior turns) so follow-ups stay coherent.
    # Rule-based answers never consume quota. When quota is exhausted, skip LLM
    # and fall through to rules; if nothing matches, reject with a friendly 429.
    if ai_online and has_quota:
        system_instruction = (
            "You are the Cascadyx AI assistant, a helpful, professional cybersecurity operations center (SOC) analyst "
            "embedded in the Cascadyx (Signal Observatory) console. Never call the product 'THREATSIM', 'Threat Simulator "
            "portal', or mention the name of any AI vendor, model provider, or hosting platform; if asked who you are, say you "
            "are the Cascadyx AI assistant. "
            "Cascadyx detects network intrusions with a 3-tier ML cascade: Tier 1 is LightGBM, the first-pass screener that "
            "scores every flow (highest overall accuracy, ~99.47%) and resolves most flows when its confidence is at least 0.85; "
            "Tier 2 is Random Forest, which validates flows Tier 1 is unsure about and drives feature-level explainability; "
            "Tier 3 is the expert ensemble, a weighted vote of LightGBM 0.2 / Random Forest 0.3 / XGBoost 0.5 that resolves the "
            "remaining low-confidence flows. Describe the cascade exactly this way and do not invent other tier models. "
            "You answer questions related to cybersecurity, network traffic patterns, machine learning intrusion detection "
            "(LightGBM, Random Forest, XGBoost), the 3-tier cascade detector, logged alerts from this console "
            "(including explaining the latest/last alert, verdicts, confidence, tiers, and feature attributions), "
            "simulator presets, or general SOC analyst guidelines. "
            "When the user asks about the latest or last alert and alert context is provided in the message, "
            "summarize that context clearly — do not treat alert explanation as off-topic. "
            "If the question is truly off-topic (e.g. cooking, travel, non-cybersecurity topics), politely decline using "
            "the following professional analyst response or a very similar tone:\n"
            "\"My operational scope covers cybersecurity threats, network intrusion analysis, the Cascadyx detection cascade, "
            "and SOC analyst workflows. For [topic], I'd recommend a general-purpose AI. How can I help with your security analysis?\"\n"
            "Substitute [topic] with the actual off-topic subject mentioned by the user."
        )

        messages: list[dict[str, str]] = [{"role": "system", "content": system_instruction}]
        if req.conversation_id is not None and not req.incognito:
            prior = session.exec(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == req.conversation_id)
                .order_by(ChatMessage.id.asc())
                .limit(20)
            ).all()
            for m in prior:
                role = "assistant" if m.role == "assistant" else "user"
                messages.append({"role": role, "content": m.content})

        message_text = user_msg
        if latest_alert_details:
            message_text = (
                f"Context on the latest recorded security threat alert: {latest_alert_details}\n\n"
                f"User message: {user_msg}"
            )
        messages.append({"role": "user", "content": message_text})

        try:
            loop = asyncio.get_running_loop()

            def call_nebius() -> str:
                return nebius_client.chat_completion(messages, temperature=0.4, max_tokens=1024)

            answer = await loop.run_in_executor(None, call_nebius)
            answer = answer.replace("*", "").replace("`", "").strip()
            source = "AI"  # Provider name never exposed to the UI
            used_llm = True
        except Exception as e:
            if _is_nebius_transient_error(e):
                logger.warning("Nebius transient/rate-limit error: %s", e)
            else:
                logger.error("Nebius API error: %s", e)
            answer = None

    # 3. Rule-based keyword match -- used when LLM isn't configured, failed, or quota is exhausted.
    if answer is None and not is_last_alert_query:
        for rule in RULES_QA:
            if any(kw in user_msg_lower for kw in rule["keywords"]):
                answer = rule["answer"]
                source = rule["source"]
                break

    # 4. Last-alert detail text, quota rejection, or a generic offline notice.
    if answer is None:
        if last_alert_fallback_text:
            answer = last_alert_fallback_text
            source = "Rule-Based"
        elif ai_online and not has_quota:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=_AI_QUOTA_EXHAUSTED_DETAIL,
            )
        elif ai_online:
            answer = "Our AI is experiencing high demand right now. Your rule-based answers are still available."
            source = "Error Fallback"
        else:
            answer = "I am currently operating in offline mode. Please ask about the cascade architecture, simulator presets, or specific threat types (DDoS, Port Scan, Brute Force)."
            source = "Offline Fallback"

    if used_llm:
        current_user = _increment_ai_queries_used(session, current_user)

    conversation_id = _save_chat_turn(session, current_user, req.conversation_id, user_msg, answer, source, req.incognito)

    return {
        "answer": answer,
        "source": source,
        "conversation_id": conversation_id,
        **_ai_quota_fields(current_user),
    }


@app.get("/api/chat/status")
def get_chat_status(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns AI availability and the caller's remaining lifetime AI quota (Protected).

    Intentionally omits provider name and model string from the payload shown to the UI.
    """
    # Re-read user so quota reflects the latest committed counter.
    db_user = session.get(User, current_user.id) or current_user
    available = nebius_client.is_available()
    return {
        "ai_available": available,
        "status": "AI available" if available else "AI offline",
        "mode": "ai" if available else "rule-based",
        **_ai_quota_fields(db_user),
    }


@app.get("/api/chat/quota")
def get_chat_quota(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Returns the caller's lifetime AI quota only (Protected).

    Mirrors the quota fields of ``/api/chat/status`` and ``POST /api/chat``
    (``ai_queries_used`` / ``ai_queries_remaining`` / ``ai_query_limit``), plus
    short ``used`` / ``remaining`` / ``limit`` aliases.
    """
    db_user = session.get(User, current_user.id) or current_user
    fields = _ai_quota_fields(db_user)
    return {
        **fields,
        "used": fields["ai_queries_used"],
        "remaining": fields["ai_queries_remaining"],
        "limit": fields["ai_query_limit"],
    }


# --- CONVERSATION HISTORY (AI ASSISTANT) ---

@app.get("/api/conversations", response_model=list[ConversationSummary])
def list_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Lists the current user's saved conversations, pinned first then
    newest-updated (Protected). Conversations started in incognito mode never
    exist here -- there's nothing to list."""
    conversations = session.exec(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
    ).all()

    summaries = []
    for c in conversations:
        messages = session.exec(
            select(ChatMessage).where(ChatMessage.conversation_id == c.id).order_by(ChatMessage.id.desc()).limit(1)
        ).all()
        last = messages[0] if messages else None
        count = session.exec(select(func.count()).select_from(ChatMessage).where(ChatMessage.conversation_id == c.id)).one()
        summaries.append(ConversationSummary(
            id=c.id, title=c.title, pinned=c.pinned, created_at=c.created_at, updated_at=c.updated_at,
            message_count=count,
            preview=(last.content[:80] + ("…" if len(last.content) > 80 else "")) if last else None
        ))
    return summaries


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Returns a single conversation's full message history (Protected, owner-only)."""
    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    messages = session.exec(
        select(ChatMessage).where(ChatMessage.conversation_id == conversation_id).order_by(ChatMessage.id.asc())
    ).all()
    return ConversationDetail(
        id=conversation.id, title=conversation.title, pinned=conversation.pinned,
        created_at=conversation.created_at, updated_at=conversation.updated_at,
        messages=[ChatMessageResponse(id=m.id, role=m.role, content=m.content, source=m.source, created_at=m.created_at) for m in messages]
    )


@app.patch("/api/conversations/{conversation_id}", response_model=ConversationSummary)
def update_conversation(
    conversation_id: int,
    req: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Partially updates a conversation -- rename and/or pin/unpin (Protected, owner-only)."""
    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if req.title is not None:
        title = req.title.strip()
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty.")
        conversation.title = title[:100]

    if req.pinned is not None:
        conversation.pinned = req.pinned

    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    count = session.exec(select(func.count()).select_from(ChatMessage).where(ChatMessage.conversation_id == conversation.id)).one()
    return ConversationSummary(
        id=conversation.id, title=conversation.title, pinned=conversation.pinned,
        created_at=conversation.created_at, updated_at=conversation.updated_at,
        message_count=count, preview=None
    )


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Deletes a conversation and all its messages (Protected, owner-only)."""
    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    messages = session.exec(select(ChatMessage).where(ChatMessage.conversation_id == conversation_id)).all()
    for m in messages:
        session.delete(m)
    session.delete(conversation)
    session.commit()
    return {"status": "deleted", "conversation_id": conversation_id}


@app.get("/api/models/metrics")
def get_models_metrics():
    """Reads trained evaluation summaries, confusion matrices, and Phase 5 before/after hardening data."""
    metrics_dir = Path(settings.DATA_CACHE_DIR) / "metrics"
    models_dir = Path(settings.DATA_CACHE_DIR) / "models"
    summary_path = metrics_dir / "summary.json"
    
    if not summary_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model metrics summary not found. Ensure models are trained first."
        )
        
    try:
        with open(summary_path, "r") as f:
            summary = json.load(f)
            
        conf_matrices = {}
        for model in ["lightgbm", "random_forest", "xgboost"]:
            cm_path = metrics_dir / f"{model}_conf_matrix.json"
            if cm_path.exists():
                with open(cm_path, "r") as f:
                    conf_matrices[model] = json.load(f)

        def _load_json(path: Path):
            if not path.exists():
                return None
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)

        baseline_summary = _load_json(metrics_dir / "baseline_summary.json")
        hardened_summary = _load_json(metrics_dir / "hardened_summary.json")
        comparison = _load_json(metrics_dir / "comparison.json")
        hardening_report = _load_json(metrics_dir / "hardening_report.json")
        active_variant = _load_json(models_dir / "active_variant.json") or {
            "variant": "mid_baseline",
            "production_models": "mid_baseline",
            "hardened_status": "experimental_non_production",
        }
        experimental_marker = _load_json(models_dir / "hardened" / "EXPERIMENTAL.json")

        # Extract feature importances from the live (mid baseline) RF model
        feature_importances = []
        production_variant = "mid_baseline"
        try:
            detector = get_detector()
            if detector and hasattr(detector, "models") and "random_forest" in detector.models:
                rf = detector.models["random_forest"]
                importances = rf.feature_importances_
                features = detector.selected_features
                feature_importances = [
                    {"feature": name, "importance": float(imp)}
                    for name, imp in zip(features, importances)
                ]
                # Sort descending
                feature_importances.sort(key=lambda x: x["importance"], reverse=True)
                production_variant = getattr(detector, "model_variant", production_variant)
        except Exception as xai_err:
            logger.error(f"Failed to extract RF feature importances: {xai_err}")

        from app.ml.cascade import BATCH_THROUGHPUT_FPS, SINGLE_FLOW_THROUGHPUT_FPS
        from app.ml.harden import HARDENED_EXPERIMENTAL_NOTE, WEB_ATTACK_CAVEAT

        recommendation = (comparison or {}).get("recommendation") or (
            (hardening_report or {}).get("recommendation")
        )
        return {
            # `summary` is always the production (mid) metrics CascadeDetector uses.
            "summary": summary,
            "confusion_matrices": conf_matrices,
            "feature_importances": feature_importances,
            "production_models": "mid_baseline",
            "active_variant": production_variant,
            "hardened_status": "experimental_non_production",
            "experimental_note": (
                (comparison or {}).get("experimental_note")
                or (hardening_report or {}).get("experimental_note")
                or HARDENED_EXPERIMENTAL_NOTE
            ),
            "recommendation": recommendation,
            "recommendation_reason": (comparison or {}).get("recommendation_reason")
            or (hardening_report or {}).get("recommendation_reason"),
            "baseline_summary": baseline_summary,
            "hardened_summary": hardened_summary,
            "comparison": comparison,
            "hardening_report": hardening_report,
            "experimental_marker": experimental_marker,
            "variant_meta": active_variant,
            "web_attack_caveat": (
                (comparison or {}).get("web_attack_caveat")
                or (hardening_report or {}).get("web_attack_caveat")
                or WEB_ATTACK_CAVEAT
            ),
            "throughput": {
                "single_flow_fps": SINGLE_FLOW_THROUGHPUT_FPS,
                "batch_flow_fps": BATCH_THROUGHPUT_FPS,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read evaluation metrics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read evaluation metrics. Ensure models are trained and cached correctly."
        )

# --- ALERTS LOG RETRIEVAL & STATS ---

@app.get("/api/alerts")
def get_alerts(
    attack_type: Optional[str] = None,
    tier: Optional[int] = None,
    severity: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Returns a list of threat alerts from SQLite with support for filtering and pagination (Protected)."""
    statement = select(Alert)

    # Apply filters
    if attack_type:
        statement = statement.where(Alert.predicted_label == attack_type)
    if tier is not None:
        statement = statement.where(Alert.tier == tier)
    if severity:
        statement = statement.where(Alert.severity == severity)
    if date_from:
        statement = statement.where(Alert.timestamp >= date_from)
    if date_to:
        statement = statement.where(Alert.timestamp <= date_to)
        
    # Sort newest first
    statement = statement.order_by(Alert.timestamp.desc())
    
    # Pagination
    offset = (page - 1) * limit
    statement = statement.offset(offset).limit(limit)
    
    alerts = session.exec(statement).all()
    
    # Parse JSON strings back to dict before returning
    parsed_alerts = []
    for alert in alerts:
        parsed_alerts.append({
            "id": alert.id,
            "timestamp": alert.timestamp,
            "predicted_label": alert.predicted_label,
            "confidence": alert.confidence,
            "tier": alert.tier,
            "source_scenario": alert.source_scenario,
            "severity": alert.severity,
            "source_ip": alert.source_ip,
            "dest_ip": alert.dest_ip,
            "source_port": alert.source_port,
            "dest_port": alert.dest_port,
            "raw_features": json.loads(alert.raw_features)
        })
    return parsed_alerts

@app.get("/api/alerts/stats")
def get_alerts_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Returns alert counts grouped by attack type and by resolution tier (Protected)."""
    # Count by attack type (predicted_label)
    attack_type_statement = select(Alert.predicted_label, func.count(Alert.id)).group_by(Alert.predicted_label)
    attack_type_counts = session.exec(attack_type_statement).all()
    
    # Count by tier
    tier_statement = select(Alert.tier, func.count(Alert.id)).group_by(Alert.tier)
    tier_counts = session.exec(tier_statement).all()
    
    return {
        "by_attack_type": {label: count for label, count in attack_type_counts},
        "by_tier": {tier: count for tier, count in tier_counts}
    }


@app.get("/api/data/smote-stats")
def get_smote_stats(current_user: User = Depends(get_current_user)):
    """Reads and returns the oversampling stats generated by the SMOTE data preprocessor (Protected)."""
    smote_path = Path(settings.DATA_CACHE_DIR) / "smote_stats.json"
    if not smote_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SMOTE oversampling stats not found. Ensure dataset preprocessor has run."
        )
    try:
        with open(smote_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read SMOTE stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read SMOTE stats."
        )


@app.get("/api/data/benign-baseline")
def get_benign_baseline(current_user: User = Depends(get_current_user)):
    """Reads and returns the precomputed benign average values for top features (Protected)."""
    baseline_path = Path(settings.DATA_CACHE_DIR) / "benign_averages.json"
    if not baseline_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benign baseline averages not found."
        )
    try:
        with open(baseline_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read benign averages: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read benign averages."
        )


@app.get("/api/alerts/export")
@limiter.limit("20/minute")
def export_alerts(
    request: Request,
    format: str = "pdf",
    attack_type: Optional[str] = None,
    tier: Optional[int] = None,
    severity: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Generates an in-memory session report of filtered alerts in PDF or CSV format (analyst+)."""
    write_audit_log(
        session,
        user=current_user,
        action="alerts.export",
        detail={
            "format": format,
            "attack_type": attack_type,
            "tier": tier,
            "severity": severity,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        request=request,
    )
    statement = select(Alert)
    if attack_type:
        statement = statement.where(Alert.predicted_label == attack_type)
    if tier is not None:
        statement = statement.where(Alert.tier == tier)
    if severity:
        statement = statement.where(Alert.severity == severity)
    if date_from:
        statement = statement.where(Alert.timestamp >= date_from)
    if date_to:
        statement = statement.where(Alert.timestamp <= date_to)
        
    statement = statement.order_by(Alert.timestamp.desc())
    alerts = session.exec(statement).all()

    total_alerts = len(alerts)
    by_tier = {1: 0, 2: 0, 3: 0}
    by_attack = {}
    for alert in alerts:
        by_tier[alert.tier] = by_tier.get(alert.tier, 0) + 1
        by_attack[alert.predicted_label] = by_attack.get(alert.predicted_label, 0) + 1

    if format.lower() == "csv":
        import csv
        from io import StringIO
        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer)
        
        # Write metadata headers
        writer.writerow(["--- AI SOC TELEMETRY EXPORT REPORT ---"])
        writer.writerow(["Generated At", datetime.now().strftime('%Y-%m-%d %H:%M:%S')])
        writer.writerow(["Query Date From", date_from.strftime('%Y-%m-%d %H:%M:%S') if date_from else "All Time"])
        writer.writerow(["Query Date To", date_to.strftime('%Y-%m-%d %H:%M:%S') if date_to else "Present"])
        writer.writerow([])
        
        # Write summary stats
        writer.writerow(["SUMMARY STATISTICS"])
        writer.writerow(["Total Alerts", total_alerts])
        writer.writerow(["Tier 1 (LightGBM)", by_tier[1]])
        writer.writerow(["Tier 2 (Random Forest)", by_tier[2]])
        writer.writerow(["Tier 3 (Expert Ensemble)", by_tier[3]])
        writer.writerow([])
        
        # Write alerts
        writer.writerow(["INCIDENT LOG TABLE"])
        writer.writerow(["Alert ID", "Timestamp (UTC)", "Verdict Label", "Confidence Score", "Severity", "Classifier Tier", "Source Scenario"])
        for alert in alerts:
            writer.writerow([
                alert.id,
                alert.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                alert.predicted_label,
                f"{alert.confidence:.4f}",
                alert.severity,
                f"Tier {alert.tier}",
                alert.source_scenario
            ])
            
        output = BytesIO(csv_buffer.getvalue().encode('utf-8'))
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=alerts_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
        
    else: # pdf
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'DocTitle',
            parent=styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#4f46e5'),
            spaceAfter=15
        )
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=11,
            textColor=colors.HexColor('#1e1b4b'),
            spaceBefore=12,
            spaceAfter=6
        )
        normal_style = styles['Normal']
        
        elements = []
        elements.append(Paragraph("AI-Powered SOC Telemetry Incident Report", title_style))
        
        meta_info = (
            f"<b>Generated At:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}<br/>"
            f"<b>Query Range:</b> {date_from.strftime('%Y-%m-%d %H:%M:%S') if date_from else 'All Time'} to {date_to.strftime('%Y-%m-%d %H:%M:%S') if date_to else 'Present'}<br/>"
            f"<b>Total Logged Threats:</b> {total_alerts}"
        )
        elements.append(Paragraph(meta_info, normal_style))
        elements.append(Spacer(1, 15))
        
        elements.append(Paragraph("Resolution Classification Tier Breakdown", section_style))
        tier_data = [
            ["Escalation Classifier Tier", "Alert Count", "Percentage of Total"],
            ["Tier 1 (LightGBM)", str(by_tier[1]), f"{(by_tier[1] / total_alerts * 100):.1f}%" if total_alerts else "0.0%"],
            ["Tier 2 (Random Forest)", str(by_tier[2]), f"{(by_tier[2] / total_alerts * 100):.1f}%" if total_alerts else "0.0%"],
            ["Tier 3 (Weighted Ensemble)", str(by_tier[3]), f"{(by_tier[3] / total_alerts * 100):.1f}%" if total_alerts else "0.0%"]
        ]
        t_tier = Table(tier_data, colWidths=[220, 140, 140])
        t_tier.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4f46e5')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('BOTTOMPADDING', (0,0), (-1,0), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f8fafc')),
            ('PADDING', (0,1), (-1,-1), 5),
        ]))
        elements.append(t_tier)
        elements.append(Spacer(1, 15))
        
        elements.append(Paragraph("Incident Threat Category Summary", section_style))
        threat_data = [["Attack Type Category", "Frequency Count", "Percentage of Total"]]
        for label, cnt in by_attack.items():
            threat_data.append([
                label, str(cnt), f"{(cnt / total_alerts * 100):.1f}%" if total_alerts else "0.0%"
            ])
        if not by_attack:
            threat_data.append(["No security incidents logged.", "0", "0.0%"])
            
        t_threat = Table(threat_data, colWidths=[220, 140, 140])
        t_threat.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e1b4b')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('BOTTOMPADDING', (0,0), (-1,0), 6),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f8fafc')),
            ('PADDING', (0,1), (-1,-1), 5),
        ]))
        elements.append(t_threat)
        elements.append(Spacer(1, 15))
        
        elements.append(Paragraph("Logged Incidents Log Feed (Latest 50 alerts)", section_style))
        feed_data = [["ID", "Timestamp (UTC)", "Verdict Label", "Conf", "Severity", "Tier", "Source Scenario"]]
        for alert in alerts[:50]:
            feed_data.append([
                str(alert.id),
                alert.timestamp.strftime('%H:%M:%S'),
                alert.predicted_label,
                f"{alert.confidence:.2%}",
                alert.severity,
                f"T{alert.tier}",
                alert.source_scenario
            ])
        if not alerts:
            feed_data.append(["-", "-", "No logged events.", "-", "-", "-", "-"])
            
        t_feed = Table(feed_data, colWidths=[30, 70, 110, 50, 60, 40, 140])
        t_feed.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#6366f1')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,0), 4),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
            ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f8fafc')),
            ('PADDING', (0,1), (-1,-1), 4),
        ]))
        elements.append(t_feed)
        
        if total_alerts > 50:
            elements.append(Spacer(1, 6))
            elements.append(Paragraph(f"<i>* Report shows latest 50 of {total_alerts} matching alerts. Export to CSV for full audit logs.</i>", styles['Italic']))
            
        doc.build(elements)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=alerts_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"}
        )

# --- SIMULATOR ROUTE ---

@app.get("/api/simulate")
def simulate_endpoint(current_user: User = Depends(get_current_user)):
    """Returns status indicator for the simulation flow engine (Protected)."""
    from app.simulator.simulator import SCENARIOS
    return {
        "status": "ready",
        "active_scenarios": list(SCENARIOS.keys()),
        "triggered_by": current_user.username,
        "analyst_role": current_user.role
    }

@app.get("/api/simulate/scenarios")
def get_simulate_scenarios(current_user: User = Depends(get_current_user)):
    """Returns the dictionary of configured scenarios (Protected)."""
    from app.simulator.simulator import SCENARIOS
    return {
        sc_id: {
            "display_name": info["display_name"],
            "description": info["description"],
            "severity_hint": info["severity_hint"]
        }
        for sc_id, info in SCENARIOS.items()
    }

@app.post("/api/simulate/start")
@limiter.limit("20/minute")
async def simulate_start(
    request: Request,
    req: SimulateStartRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Start CSV scenario simulation (analyst+; audited)."""
    if req.rate <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulation rate must be at least 1 packet per second."
        )
    from app.simulator.simulator import SCENARIOS, LEGACY_SCENARIO_ALIASES
    valid_ids = list(SCENARIOS.keys()) + list(LEGACY_SCENARIO_ALIASES.keys())
    if req.scenario not in valid_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scenario: {req.scenario}. Must be one of {list(SCENARIOS.keys())}"
        )
    try:
        simulator_engine.start(req.scenario, req.rate, req.duration_seconds)
        write_audit_log(
            session,
            user=current_user,
            action="simulate.start",
            detail={
                "scenario": req.scenario,
                "rate": req.rate,
                "duration_seconds": req.duration_seconds,
            },
            request=request,
        )
        return {
            "status": "started",
            "scenario": req.scenario,
            "rate": req.rate,
            "duration_seconds": req.duration_seconds,
            "triggered_by": current_user.username
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cascade assets (scaler, encoder, or features list) are missing. Run prepare_data first."
        )
    except Exception as e:
        logger.error(f"Failed to start simulation: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start simulation."
        )

@app.post("/api/simulate/stop")
async def simulate_stop(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Stops the active simulation (analyst+; audited)."""
    if not simulator_engine.is_running:
        return {"status": "not_running", "message": "No active simulation is running."}
    
    simulator_engine.stop()
    write_audit_log(
        session,
        user=current_user,
        action="simulate.stop",
        detail={},
        request=request,
    )
    return {
        "status": "stopped",
        "stopped_by": current_user.username
    }

@app.get("/api/simulate/status")
def simulate_status(current_user: User = Depends(get_current_user)):
    """Retrieves current simulation running status, scenario details, and telemetry counters (Protected).

    Status includes ``mode`` (``idle`` | ``csv`` | ``replay``), ``source`` (scenario
    id or PCAP path), and for replay: ``packets_parsed`` / ``flows_built``.
    """
    return simulator_engine.get_status()


@app.post("/api/simulate/replay/start")
@limiter.limit("20/minute")
async def simulate_replay_start(
    request: Request,
    req: ReplayStartRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Start isolated PCAP Live Replay (analyst+; recorded CIC / VirtualBox capture).

    Never launches attack tools. ``pcap_path`` must resolve under ``DATA_RAW_DIR``
    (typically ``data/raw/captures/...`` after copying from the sensor VM).
    See ``docs/ISOLATED_REPLAY.md``.
    """
    from app.simulator.replay import SAFETY_BANNER

    if req.rate <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Replay rate must be at least 1 flow per second.",
        )
    try:
        resolved = _resolve_raw_pcap_path(req.pcap_path)
        simulator_engine.start_replay(
            resolved,
            max_packets=req.max_packets,
            rate=req.rate,
            duration_seconds=req.duration_seconds,
            source_scenario=req.source_scenario or "isolated_replay",
        )
        write_audit_log(
            session,
            user=current_user,
            action="replay.start",
            detail={
                "pcap_path": str(resolved),
                "max_packets": req.max_packets,
                "rate": req.rate,
                "duration_seconds": req.duration_seconds,
                "source_scenario": req.source_scenario or "isolated_replay",
            },
            request=request,
        )
        return {
            "status": "started",
            "mode": "replay",
            "source": str(resolved),
            "max_packets": req.max_packets,
            "rate": req.rate,
            "duration_seconds": req.duration_seconds,
            "source_scenario": req.source_scenario or "isolated_replay",
            "triggered_by": current_user.username,
            "safety_banner": SAFETY_BANNER,
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        ) from ve
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("Failed to start PCAP replay: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start isolated PCAP replay.",
        ) from exc


@app.post("/api/simulate/replay/stop")
async def simulate_replay_stop(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Stop an active isolated PCAP Live Replay (analyst+; audited)."""
    status_now = simulator_engine.get_status()
    if not simulator_engine.is_running:
        return {
            "status": "not_running",
            "mode": "idle",
            "message": "No active replay is running.",
        }
    if status_now.get("mode") != "replay":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Engine is running in '{status_now.get('mode')}' mode, not replay. "
                "Use POST /api/simulate/stop to abort the CSV simulator."
            ),
        )

    simulator_engine.stop()
    write_audit_log(
        session,
        user=current_user,
        action="replay.stop",
        detail={},
        request=request,
    )
    return {
        "status": "stopped",
        "mode": "idle",
        "stopped_by": current_user.username,
    }


# --- PCAP ANALYSIS ROUTE (Phase 1) ---

def _resolve_raw_pcap_path(pcap_path: str) -> Path:
    """Resolve a PCAP path that must stay under DATA_RAW_DIR (path-traversal safe)."""
    raw_root = Path(settings.DATA_RAW_DIR).resolve()
    candidate = Path(pcap_path)
    if not candidate.is_absolute():
        candidate = raw_root / candidate
    resolved = candidate.resolve()
    try:
        resolved.relative_to(raw_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"pcap_path must stay under DATA_RAW_DIR ({raw_root})",
        ) from exc
    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PCAP file not found: {resolved}",
        )
    if resolved.suffix.lower() not in {".pcap", ".pcapng"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pcap / .pcapng files are supported",
        )
    return resolved


@app.post("/api/pcap/analyze")
@limiter.limit("10/minute")
async def pcap_analyze(
    request: Request,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Stream-parse a CIC-IDS2017 PCAP slice, extract features, run CascadeDetector (analyst+).

    Accepts either:
      - JSON ``{"pcap_path": "PCAPs/Friday-WorkingHours.pcap", "max_packets": 200}``
        (``pcap_path`` must resolve under ``DATA_RAW_DIR``)
      - multipart form with ``file`` (small upload) and optional ``max_packets``,
        or form field ``pcap_path`` under ``DATA_RAW_DIR``

    Never loads an entire multi-GB day capture into memory; ``max_packets`` is capped.
    """
    from app.pcap.pipeline import API_ABSOLUTE_MAX_PACKETS, DEFAULT_MAX_PACKETS, analyze_pcap

    detector: CascadeDetector = getattr(app.state, "detector", None)
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Machine learning cascade detector is not loaded yet.",
        )

    content_type = (request.headers.get("content-type") or "").lower()
    tmp_path: Optional[Path] = None
    try:
        if "application/json" in content_type:
            raw = await request.json()
            payload = PcapAnalyzeBody(**raw)
            resolved = _resolve_raw_pcap_path(payload.pcap_path)
            pkt_cap = payload.max_packets
            do_persist = payload.persist_alerts
            do_broadcast = payload.broadcast
            scenario = payload.source_scenario or "pcap"
        elif "multipart/form-data" in content_type:
            if settings.PUBLIC_MODE:
                # Open-internet deploys never accept arbitrary file uploads (disk/CPU abuse).
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "PCAP uploads are disabled on the public deployment. "
                        "Use the built-in Quick Lab captures instead."
                    ),
                )
            form = await request.form()
            pkt_cap = int(form.get("max_packets") or DEFAULT_MAX_PACKETS)
            do_persist = str(form.get("persist_alerts", "true")).lower() not in {"0", "false", "no"}
            do_broadcast = str(form.get("broadcast", "true")).lower() not in {"0", "false", "no"}
            scenario = str(form.get("source_scenario") or "pcap")

            upload = form.get("file")
            form_path = form.get("pcap_path")
            if upload is not None and getattr(upload, "filename", None):
                suffix = Path(str(upload.filename)).suffix.lower() or ".pcap"
                if suffix not in {".pcap", ".pcapng"}:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Only .pcap / .pcapng uploads are supported",
                    )
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                tmp_path = Path(tmp.name)
                tmp.close()
                with open(tmp_path, "wb") as out_f:
                    shutil.copyfileobj(upload.file, out_f)
                resolved = tmp_path
            elif form_path:
                resolved = _resolve_raw_pcap_path(str(form_path))
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Provide multipart file or pcap_path",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Use application/json or multipart/form-data",
            )

        if pkt_cap <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="max_packets must be a positive integer",
            )
        if pkt_cap > API_ABSOLUTE_MAX_PACKETS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"max_packets capped at {API_ABSOLUTE_MAX_PACKETS} for API safety",
            )

        logger.info(
            "PCAP analyze requested by %s: path=%s max_packets=%d",
            current_user.username,
            resolved,
            pkt_cap,
        )
        summary = await analyze_pcap(
            pcap_path=resolved,
            max_packets=pkt_cap,
            detector=detector,
            persist_alerts=do_persist,
            broadcast=do_broadcast,
            source_scenario=scenario,
        )
        summary["requested_by"] = current_user.username
        write_audit_log(
            session,
            user=current_user,
            action="pcap.analyze",
            detail={
                "pcap_path": str(resolved),
                "max_packets": pkt_cap,
                "persist_alerts": do_persist,
                "broadcast": do_broadcast,
                "source_scenario": scenario,
                "flows": summary.get("flows_built") or summary.get("flows"),
                "alerts_persisted": summary.get("alerts_persisted"),
            },
            request=request,
        )
        return summary
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("PCAP analyze failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PCAP analysis failed. Check server logs for details.",
        ) from exc
    finally:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                logger.warning("Could not delete temp PCAP upload %s", tmp_path)


@app.get("/api/audit-logs")
def list_audit_logs(
    action: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """List recent AuditLog rows (Admin)."""
    limit = max(1, min(limit, 200))
    statement = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    if action:
        statement = select(AuditLog).where(AuditLog.action == action).order_by(
            AuditLog.timestamp.desc()
        ).limit(limit)
    rows = session.exec(statement).all()
    return [
        {
            "id": r.id,
            "timestamp": r.timestamp,
            "user_id": r.user_id,
            "username": r.username,
            "role": r.role,
            "action": r.action,
            "detail": json.loads(r.detail) if r.detail else {},
            "ip_address": r.ip_address,
        }
        for r in rows
    ]


# --- WEBSOCKET LIVE ROUTE ---

@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket, token: Optional[str] = None, session: Session = Depends(get_session)):
    """Exposes real-time event socket feed for dashboard synchronization (Protected via ?token= query param).

    Browsers' native WebSocket API can't set an Authorization header, so the JWT is
    passed as a query parameter instead. Validated before accept() so an unauthenticated
    caller never receives a live connection.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        payload = decode_token(token)
        username = payload.get("sub")
        if not username or get_user_by_username(username, session) is None:
            raise JWTError("Unknown user")
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket)
    try:
        while True:
            # We await incoming frames to capture close codes and disconnects cleanly
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("WebSocket disconnect event registered cleanly.")
    except Exception as e:
        logger.info(f"WebSocket client connection closed: {e}")
    finally:
        manager.disconnect(websocket)


# --- STATIC UI (Phase 7 one-command demo) ---
# Registered last so /api/*, /ws/*, and OpenAPI routes keep priority.
# Build with: cd frontend; npm run build  →  serves SPA from this same port.
from app.routers import cascade_demo as _cascade_demo_router
app.include_router(_cascade_demo_router.router)
from app.routers import reviews as _reviews_router
app.include_router(_reviews_router.router)
from app.routers import lab as _lab_router
app.include_router(_lab_router.router)

mount_frontend(app, project_name=settings.PROJECT_NAME)
