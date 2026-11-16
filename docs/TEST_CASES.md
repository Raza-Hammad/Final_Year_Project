# Cascadyx — Test Cases (FYP table)

Aligned to real `pytest` coverage under `backend/app/ml/test_*.py` (run from `backend/`: `pytest`). Suite uses an isolated temp DB plus **real mid-baseline cascade models** — no separately running server required.

Manual / demo rows are marked **Manual**; automated rows cite the test function.

| ID | Area | Test case | Steps / trigger | Expected result | Automation |
|----|------|-----------|-----------------|-----------------|------------|
| TC-01 | Health | API health | `GET /api/health` | `{"status":"ok"}` | `test_health_still_ok` |
| TC-02 | Auth | Predict without token | `POST /api/predict` no JWT | 401 Unauthorized | `test_predict_requires_authentication` |
| TC-03 | Auth | Login + me | Login then `GET /api/users/me` | Profile with username/role | Manual + auth fixtures |
| TC-04 | Auth | Logout revokes JWT in-process | Login → logout → reuse token on WS/API | Rejected as revoked until process restart | `test_logout_revokes_token_in_process`, `test_websocket_rejects_revoked_token` |
| TC-05 | Auth | Rate limit login | Burst `POST /api/auth/login` | 429 after limit (5/min) | Covered by limiter config; `test_sensitive_routes_are_rate_limited` (sensitive routes) |
| TC-06 | Cascade | Models load mid baseline | Construct `CascadeDetector` | `model_variant == "mid_baseline"`; three `.joblib` loaded | `test_cascade_initializes_and_loads_real_trained_models`, `test_cascade_loads_mid_baseline_not_hardened` |
| TC-07 | Cascade | Benign vs threat | `detect` on real feature vectors | Labels + confidence + tier ∈ {1,2,3} | `test_cascade_classifies_benign_and_threat_flows` |
| TC-08 | Cascade | Predict API verdict | Authenticated `POST /api/predict` | Cascade fields; alert persisted if non-BENIGN | `test_predict_returns_cascade_verdict` |
| TC-09 | Cascade | Severity on persist | Predict threat flow | Severity matches `compute_severity` policy | `test_predict_persists_alert_with_correct_severity` |
| TC-10 | Cascade | Batch ≡ single shape | `detect_batch` vs `detect` | Same keys / coherent labels | `test_detect_batch_matches_single_detect_shape` |
| TC-11 | Cascade | Empty batch | `detect_batch([])` | Empty list, no crash | `test_detect_batch_empty` |
| TC-12 | Harden policy | Promote without force | `promote_hardened(force=False)` | Refused; production unchanged | `test_promote_hardened_refuses_without_force` |
| TC-13 | Metrics | Insights payload | `GET /api/models/metrics` | `production_models=mid_baseline`, `recommendation` keep_baseline when comparison present, throughput 44 / 120 | `test_models_metrics_exposes_hardening_fields` |
| TC-14 | XAI | Explain attributions | `POST /api/xai/explain` | Feature attributions + benign averages | `test_xai_explain_returns_attributions_with_benign_averages` |
| TC-15 | Sim | Idle status | `GET /api/simulate/status` while stopped | `running=false` | `test_simulate_status_initially_idle` |
| TC-16 | Sim | CSV start/stop | Admin start scenario → stop | Telemetry increments; stops cleanly | `test_simulate_start_stop_lifecycle_and_telemetry` |
| TC-17 | Sim | Unknown scenario | Start invalid id | 4xx rejection | `test_simulate_start_rejects_unknown_scenario` |
| TC-18 | Sim | Excessive rate | Rate above cap | 4xx rejection | `test_simulate_start_rejects_excessive_rate` |
| TC-19 | RBAC | Analyst blocked | Analyst hits simulate/replay/pcap/export/audit | 403 | `test_analyst_forbidden_on_sensitive_routes`, `test_rbac_pcap_and_export_still_admin_only` |
| TC-20 | Audit | Simulate start logged | Admin start sim | Audit log entry | `test_admin_simulate_start_writes_audit_log` |
| TC-21 | Audit | Export logged | Admin export | Audit log entry | `test_admin_export_writes_audit_log` |
| TC-22 | Audit | Logs admin-only | Analyst vs admin `GET /api/audit-logs` | 403 vs 200 | `test_audit_logs_endpoint_admin_only` |
| TC-23 | Export | CSV export | Admin `GET /api/alerts/export?format=csv` | CSV download | `test_csv_export` |
| TC-24 | Export | PDF export | Admin export PDF | PDF bytes | `test_pdf_export` |
| TC-25 | Data | SMOTE stats | Authenticated `GET /api/data/smote-stats` | Stats JSON; 401 without auth | `test_smote_stats`, `test_smote_stats_requires_auth` |
| TC-26 | History | Severity in list | After predict, `GET /api/alerts` | Severity field present | `test_alert_history_includes_severity` |
| TC-27 | Chat | Rule-based Q&A | `POST /api/chat` with Nebius mocked off | Rule-based answer | `test_chat_rule_based_qa` |
| TC-28 | Chat | Cascade FAQ | Ask cascade question | Live Nebius or rule-based accepted | `test_chat_cascade_qa_accepts_live_or_rule_based` |
| TC-29 | Chat | Explain last alert | Chat explain-last | References recent alert | `test_chat_explain_last_alert` |
| TC-30 | Chat | Conversations CRUD | List/get/patch/delete | Owner-scoped; auth required | `test_conversations_list_get_patch_delete`, `test_conversations_require_auth` |
| TC-31 | Chat | Owner isolation | User A cannot read B’s conversation | 404/403 | `test_conversation_owner_isolation` |
| TC-32 | Chat | Incognito | Chat with incognito | No persisted conversation | `test_incognito_chat_does_not_persist_conversation` |
| TC-33 | WS | Missing token | Connect `/ws/live` | Rejected | `test_websocket_rejects_missing_token` |
| TC-34 | WS | Invalid token | Bad JWT | Rejected | `test_websocket_rejects_invalid_token` |
| TC-35 | WS | Broadcast | Valid WS + detection broadcast | Client receives event | `test_websocket_receives_broadcast_detection` |
| TC-36 | WS | Reconnect contract | Frontend hook | Reconnect helper exists | `test_use_live_socket_reconnect_contract_exists` |
| TC-37 | PCAP | Feature alignment | Flow builder vs `features.json` | Selected features match cache | `test_selected_features_match_cache`, `test_flow_builder_merges_bidirectional_and_extracts_aligned_features` |
| TC-38 | PCAP | Cascade accepts PCAP features | Synthetic extracted dict → `detect` | Valid verdict | `test_cascade_accepts_pcap_extracted_features` |
| TC-39 | PCAP | Tiny Friday slice smoke | Optional tiny live slice | Pipeline runs without crash | `test_live_friday_pcap_tiny_slice_smoke` |
| TC-40 | PCAP API | Analyze golden | Admin `POST /api/pcap/analyze` tiny pcap | Alerts / counts coherent | `test_pcap_analyze_api_tiny_slice_golden` |
| TC-41 | PCAP API | Path escape | `../` outside `data/raw` | 400 | `test_pcap_analyze_rejects_path_escape` |
| TC-42 | Replay | Status mode fields | Status JSON | Includes mode / replay fields | `test_simulate_status_includes_mode_fields` |
| TC-43 | Replay | Start/stop lifecycle | Admin replay tiny capture | Starts, classifies, stops | `test_replay_start_stop_lifecycle` |
| TC-44 | Replay | Path outside raw | Escape path | Rejected | `test_replay_rejects_path_outside_data_raw` |
| TC-45 | Replay | Mutex vs CSV | Start CSV then replay (or reverse) | Second start rejected while running | `test_replay_mutex_with_csv` |
| TC-46 | API errors | Validation envelope | Bad body | Structured validation error | `test_validation_error_envelope` |
| TC-47 | Batch pipeline | Synthetic flows batch | Pipeline batch detect | Batch path returns results | `test_pipeline_batch_detect_on_synthetic_flows` |
| TC-48 | Demo | CSV DDoS end-to-end UI | Manual: login → Simulator DDoS 5–10 fps → Live lattice | Alerts + WS updates; mostly Tier 1 | **Manual** ([`DEMO.md`](DEMO.md)) |
| TC-49 | Demo | Web Attacks honesty | Manual: run `web_attacks` briefly; check Insights caveat | Expect weaker accuracy; do not claim IDS parity | **Manual** ([`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md), `FYP_REPORT_DATA.md` §4.4 ≈61.15%) |
| TC-50 | Isolation | VBox capture → Live Replay | Manual: follow [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md), copy to `captures/`, start replay | Classifications without bridging LAN | **Manual** |

### How to run automated suite

```powershell
cd D:\Final_Year_Project\backend
.\venv\Scripts\Activate.ps1
pytest
```

Seed UI demo alerts (server already running): `python -m app.ml.generate_test_alerts`.
