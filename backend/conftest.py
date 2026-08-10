"""Shared pytest fixtures for the backend test suite.

Runs the real FastAPI app (real trained cascade models, real SimulationEngine)
against an isolated, temporary SQLite database, so tests never touch or pollute
the actual dev database at data/cache/app.db.
"""
import os
import tempfile

# Must happen before `app.config`/`app.db.session` are imported anywhere (including
# transitively via `app.main`), since DATABASE_URL is read once at import time.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{tempfile.mktemp(suffix='.db')}")

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    """A TestClient running the real app lifespan (seeds the admin user, loads the
    real trained cascade models, initializes the simulator) against the isolated
    test database."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    """Authorization header for a single shared analyst account, reused by every
    test module. Logging in once per session (rather than once per test file) keeps
    the suite comfortably under the /api/auth/login rate limit (5/minute)."""
    username, password = "pytest_analyst", "SecurePassword!321"
    client.post("/api/auth/register", json={"username": username, "password": password})
    resp = client.post("/api/auth/login", data={"username": username, "password": password})
    assert resp.status_code == 200, f"Shared test analyst login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def real_threat_features():
    """Extracts one real, unscaled non-BENIGN row from the cached test split, so
    tests can exercise the cascade with genuine feature values instead of hand-typed
    mock data."""
    import json
    import numpy as np
    import joblib
    from pathlib import Path
    from app.config import settings

    cache_dir = Path(settings.DATA_CACHE_DIR)
    data = np.load(cache_dir / "processed_data.npz")
    X_test = data["X_test"]
    y_test = data["y_test"]
    scaler = joblib.load(cache_dir / "scaler.joblib")
    encoder = joblib.load(cache_dir / "label_encoder.joblib")

    benign_idx = list(encoder.classes_).index("BENIGN")
    threat_indices = np.where(y_test != benign_idx)[0]
    assert len(threat_indices) > 0, "No threat samples found in the cached test split!"

    idx = int(threat_indices[0])
    scaled_row = X_test[idx]
    unscaled_row = scaler.inverse_transform(scaled_row.reshape(1, -1))[0]

    with open(cache_dir / "features.json", "r") as f:
        selected_features = json.load(f)

    return {name: float(val) for name, val in zip(selected_features, unscaled_row)}
