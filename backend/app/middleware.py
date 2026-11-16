"""HTTP middleware helpers for Cascadyx production hardening (Phase 6)."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("cascadyx.request")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add baseline browser security headers (enabled only when ``PUBLIC_MODE=1``).

    No ``Content-Security-Policy`` on purpose: Google Identity Services loads remote
    scripts/frames and a wrong CSP would silently break Sign-In. HSTS is only meaningful
    over HTTPS, which the public host terminates before traffic reaches uvicorn.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log method, path, status, duration, and a short request id per HTTP call.

    Skips noisy high-frequency paths (health, OpenAPI) to keep demo logs readable.
    WebSocket upgrades are not wrapped by BaseHTTPMiddleware the same way; they
    keep their existing connect/disconnect logging in ``main.websocket_live_endpoint``.
    """

    SKIP_PREFIXES = (
        "/api/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/favicon",
        "/assets/",
    )

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(prefix) for prefix in self.SKIP_PREFIXES):
            return await call_next(request)

        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception:
            logger.exception(
                "request_id=%s method=%s path=%s unhandled_error",
                request_id,
                request.method,
                path,
            )
            raise
        finally:
            duration_ms = (time.perf_counter() - started) * 1000.0
            logger.info(
                "request_id=%s method=%s path=%s status=%s duration_ms=%.1f",
                request_id,
                request.method,
                path,
                status_code,
                duration_ms,
            )
