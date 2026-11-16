"""Focused Phase 5 tests: RBAC, AuditLog, and CascadeDetector.detect_batch."""

from __future__ import annotations

import json

import pytest
from sqlmodel import Session, select

from app.db import engine, AuditLog
from app.ml.cascade import CascadeDetector
from app.ml.harden import promote_hardened
from app.ml.test_cascade import BENIGN_FLOW, DDOS_FLOW, _assert_valid_cascade_result


def test_analyst_allowed_on_student_learning_routes(client, auth_headers):
    """Analysts (students) may run sim/replay/pcap/export; only audit-logs stay admin-only."""
    r = client.post(
        "/api/simulate/start",
        headers=auth_headers,
        json={"scenario": "benign_baseline", "rate": 1, "duration_seconds": 1},
    )
    assert r.status_code == 200, r.text
    try:
        r = client.post("/api/simulate/stop", headers=auth_headers)
        assert r.status_code == 200, r.text
    finally:
        client.post("/api/simulate/stop", headers=auth_headers)

    # Missing/invalid PCAP should be 4xx validation/not-found — never 403 for analysts.
    r = client.post(
        "/api/simulate/replay/start",
        headers=auth_headers,
        json={"pcap_path": "captures/does-not-matter.pcap", "rate": 1},
    )
    assert r.status_code != 403
    assert r.status_code in (400, 404)

    r = client.post(
        "/api/pcap/analyze",
        headers=auth_headers,
        json={"pcap_path": "captures/does-not-matter.pcap", "max_packets": 10},
    )
    assert r.status_code != 403
    assert r.status_code in (400, 404)

    r = client.get("/api/alerts/export?format=csv", headers=auth_headers)
    assert r.status_code == 200, r.text


def test_analyst_forbidden_on_audit_logs(client, auth_headers):
    """Audit log listing remains admin-only after student-access RBAC relaxation."""
    r = client.get("/api/audit-logs", headers=auth_headers)
    assert r.status_code == 403


def test_register_defaults_to_analyst(client):
    """Non-Google register path still works and always creates role=analyst."""
    username = "student_register_rbac_check"
    r = client.post(
        "/api/auth/register",
        json={"username": username, "password": "StudentPass!321"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["username"] == username
    assert body["role"] == "analyst"
    assert body.get("ai_queries_used", 0) == 0


def test_admin_simulate_start_writes_audit_log(client, admin_headers):
    r = client.post(
        "/api/simulate/start",
        headers=admin_headers,
        json={"scenario": "benign_baseline", "rate": 2, "duration_seconds": 2},
    )
    assert r.status_code == 200, r.text
    try:
        with Session(engine) as session:
            row = session.exec(
                select(AuditLog)
                .where(AuditLog.action == "simulate.start")
                .order_by(AuditLog.id.desc())
            ).first()
            assert row is not None
            assert row.username == "admin"
            assert row.role == "admin"
            detail = json.loads(row.detail)
            assert detail.get("scenario") == "benign_baseline"
            assert detail.get("rate") == 2
    finally:
        client.post("/api/simulate/stop", headers=admin_headers)


def test_admin_export_writes_audit_log(client, admin_headers):
    r = client.get("/api/alerts/export?format=csv", headers=admin_headers)
    assert r.status_code == 200, r.text
    with Session(engine) as session:
        row = session.exec(
            select(AuditLog)
            .where(AuditLog.action == "alerts.export")
            .order_by(AuditLog.id.desc())
        ).first()
        assert row is not None
        assert row.username == "admin"


def test_audit_logs_endpoint_admin_only(client, auth_headers, admin_headers):
    r = client.get("/api/audit-logs", headers=auth_headers)
    assert r.status_code == 403
    r = client.get("/api/audit-logs?limit=5", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_models_metrics_exposes_hardening_fields(client):
    r = client.get("/api/models/metrics")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "summary" in body
    assert "web_attack_caveat" in body
    assert "throughput" in body
    assert body["throughput"]["single_flow_fps"] == 44
    assert body["throughput"]["batch_flow_fps"] == 120
    assert body["production_models"] == "mid_baseline"
    assert body["hardened_status"] == "experimental_non_production"
    assert "experimental_note" in body
    assert "comparison" in body
    assert "baseline_summary" in body
    assert "hardened_summary" in body
    # Honest before/after: reduced search regressed F1 — keep baseline
    if body.get("comparison"):
        assert body["comparison"].get("hardened_status") == "experimental_non_production"
        assert body.get("recommendation") == "keep_baseline"
        assert body["comparison"].get("regressed_models")
        for model in body["comparison"]["models"]:
            assert model.get("delta_macro_f1") is not None
            assert model["delta_macro_f1"] < 0


def test_cascade_loads_mid_baseline_not_hardened():
    detector = CascadeDetector(confidence_threshold=0.85)
    assert detector.model_variant == "mid_baseline"


def test_detect_batch_matches_single_detect_shape():
    detector = CascadeDetector(confidence_threshold=0.85)
    batch = detector.detect_batch([BENIGN_FLOW, DDOS_FLOW])
    assert len(batch) == 2
    for item in batch:
        _assert_valid_cascade_result(item)

    single_a = detector.detect(BENIGN_FLOW)
    single_b = detector.detect(DDOS_FLOW)
    assert batch[0]["predicted_label"] == single_a["predicted_label"]
    assert batch[1]["predicted_label"] == single_b["predicted_label"]
    assert batch[0]["tier"] == single_a["tier"]
    assert batch[1]["tier"] == single_b["tier"]


def test_detect_batch_empty():
    detector = CascadeDetector(confidence_threshold=0.85)
    assert detector.detect_batch([]) == []

def test_promote_hardened_refuses_without_force():
    with pytest.raises(RuntimeError, match="Refusing to promote"):
        promote_hardened(force=False)
