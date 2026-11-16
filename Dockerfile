# !! NOT FREE !! This image is for the OPTIONAL PAID Fly.io path (docs/DEPLOY.md, Appendix B).
# The FREE primary path (Render) uses `Dockerfile.render` + `render.yaml` (docs/GO_LIVE.md).
#
# Cascadyx — single-container production image (React build + FastAPI + WS + SQLite).
# Deploy target: Fly.io (see docs/DEPLOY.md). Build context = repo root; the large /
# private bits are filtered by .dockerignore (no .env, no dev DB, no 52 GB raw data).
#
# Layout inside the image (matches the paths the backend computes from __file__):
#   /app/backend/            FastAPI app          (BASE_DIR)
#   /app/frontend/dist/      Vite production UI   (static_ui.FRONTEND_DIST)
#   /app/data/cache/         trained models, scaler, npz, metrics (read-only artifacts)
#   /app/data/raw/lab/       small recorded Quick Lab captures
#   /data/app.db             SQLite on the persistent Fly volume (DATABASE_URL)

# ---- 1) Build the React UI ---------------------------------------------------
FROM node:22-slim AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2) Runtime ----------------------------------------------------------------
# Python minor version matches the one the models were trained/pickled with
# (see backend/constraints-deploy.txt). Do not bump casually: joblib model files are
# sensitive to scikit-learn / lightgbm / xgboost versions.
FROM python:3.14-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PUBLIC_MODE=1 \
    DATABASE_URL=sqlite:////data/app.db

# libgomp1: OpenMP runtime required by lightgbm / xgboost wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/constraints-deploy.txt backend/
RUN pip install -r backend/requirements.txt -c backend/constraints-deploy.txt

COPY backend/ backend/
COPY data/ data/
COPY --from=ui /ui/dist frontend/dist

RUN mkdir -p /data

WORKDIR /app/backend
EXPOSE 8080

# One worker on purpose: SQLite + in-process WebSocket manager + single simulator engine.
# --proxy-headers / --forwarded-allow-ips: trust Fly's X-Forwarded-For so slowapi rate
# limits and audit logs see the real client IP (the container is only reachable via Fly's proxy).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
