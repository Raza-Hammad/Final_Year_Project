"""
Serve the Vite production build from FastAPI for the one-command Cascadyx demo.

When ``frontend/dist/index.html`` exists, ``/`` and client-side routes return the SPA
while ``/api/*``, ``/ws/*``, and OpenAPI docs remain owned by FastAPI routes registered
earlier in ``main.py``. When the dist folder is missing, ``/`` stays an API welcome JSON
payload so backend-only startups still work.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

logger = logging.getLogger(__name__)

# backend/app/static_ui.py → project root (Final_Year_Project/)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

# Path prefixes that must never be answered by the SPA fallback.
_RESERVED_PREFIXES = (
    "api/",
    "ws/",
    "docs",
    "redoc",
    "openapi",
    "assets/",
)


def frontend_dist_ready() -> bool:
    """Return True when a production Vite build is present."""
    return (FRONTEND_DIST / "index.html").is_file()


def mount_frontend(app: FastAPI, *, project_name: str) -> bool:
    """Mount ``frontend/dist`` (if built) or register an API-only root.

    Returns:
        True when the SPA is mounted; False when running API-only.
    """
    if not frontend_dist_ready():
        logger.warning(
            "Frontend dist not found at %s — run `npm run build` in frontend/ "
            "for the one-command demo UI. API-only mode remains available at /api.",
            FRONTEND_DIST,
        )

        @app.get("/")
        def api_root() -> dict:
            return {
                "message": f"Welcome to the {project_name} API",
                "docs_url": "/docs",
                "health_check": "/api/health",
                "ui": (
                    "Frontend not built. From repo root: "
                    "cd frontend; npm install; npm run build — "
                    "then restart uvicorn to serve the SPA from this port."
                ),
            }

        return False

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="frontend_assets",
        )

    index_html = FRONTEND_DIST / "index.html"
    dist_root = FRONTEND_DIST.resolve()

    @app.get("/", response_model=None)
    async def serve_spa_root() -> Response:
        return FileResponse(index_html)

    @app.get("/{full_path:path}", response_model=None)
    async def serve_spa(full_path: str) -> Response:
        """SPA fallback for client-side routes; never shadow /api or /ws."""
        lowered = full_path.lower().lstrip("/")
        if any(lowered.startswith(prefix) for prefix in _RESERVED_PREFIXES):
            raise HTTPException(status_code=404, detail="Not found")
        if lowered in {"openapi.json", "docs", "redoc"}:
            raise HTTPException(status_code=404, detail="Not found")

        candidate = (FRONTEND_DIST / full_path).resolve()
        try:
            candidate.relative_to(dist_root)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc

        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_html)

    logger.info("Serving Cascadyx UI from %s (same origin as /api and /ws)", FRONTEND_DIST)
    return True
