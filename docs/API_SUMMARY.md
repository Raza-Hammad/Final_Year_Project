# Cascadyx — API Summary

**Interactive docs (preferred):** with the backend running, open  
**http://127.0.0.1:8000/docs** (Swagger UI) or **http://127.0.0.1:8000/redoc**.  
OpenAPI schema: `/openapi.json`.

Authorize in Swagger with the JWT from `POST /api/auth/login` (`Bearer` token).  
Implementation: `backend/app/main.py`. Static SPA must not own `/api`, `/ws`, `/docs`, or `/openapi.json` (`static_ui.py`).

---

## Auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | Public | Create analyst; rate-limited |
| POST | `/api/auth/login` | Public | OAuth2 password form → JWT (`sub`, `role`, `jti`); ~5/min |
| POST | `/api/auth/logout` | Bearer | In-memory `jti` revoke |
| GET | `/api/users/me` | Bearer | Current user profile |

---

## Health & detection

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | Public | `{"status":"ok"}` |
| POST | `/api/predict` | Bearer | Single-flow cascade; persists non-BENIGN alerts; rate-limited |
| POST | `/api/xai/explain` | Bearer | Feature attributions vs benign averages |
| GET | `/api/models/metrics` | Bearer* | Mid baseline metrics, harden comparison, throughput 44/120 (*check live OpenAPI; typically authenticated in app flows) |

\*Confirm exact dependency in `/docs` if examiners probe — payload fields include `production_models`, `recommendation`, `throughput`.

---

## Alerts & exports

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/alerts` | Bearer | Filter: attack_type, tier, severity, dates; page/limit |
| GET | `/api/alerts/stats` | Bearer | Counts by attack type / tier |
| GET | `/api/alerts/export` | **Admin** | CSV or PDF; audit-logged |
| GET | `/api/data/smote-stats` | Bearer | Training imbalance charts data |
| GET | `/api/data/benign-baseline` | Bearer | Benign feature averages for XAI |

---

## Simulator & PCAP

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/simulate` | Bearer | Sim module info / legacy surface |
| GET | `/api/simulate/scenarios` | Bearer | Scenario registry metadata |
| POST | `/api/simulate/start` | **Admin** | CSV scenario stream; audit-logged |
| POST | `/api/simulate/stop` | **Admin** | Stop CSV or shared runner |
| GET | `/api/simulate/status` | Bearer | running, mode, counters, tier breakdown |
| POST | `/api/simulate/replay/start` | **Admin** | Live Replay PCAP under `data/raw/` |
| POST | `/api/simulate/replay/stop` | **Admin** | Stop replay |
| POST | `/api/pcap/analyze` | **Admin** | Batch PCAP → flows → cascade; `max_packets` bound |

CSV and Live Replay share a **mutex** (only one mode running).

Example analyze body:

```json
{
  "pcap_path": "PCAPs/your-small-slice.pcap",
  "max_packets": 200,
  "persist_alerts": true,
  "broadcast": true
}
```

---

## SENTINEL AI & conversations

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/chat` | Bearer | Hybrid Nebius / rule-based |
| GET | `/api/chat/status` | Bearer | `nebius_available` + model |
| GET | `/api/conversations` | Bearer | List (pinned first) |
| GET | `/api/conversations/{id}` | Bearer | Detail (owner-scoped) |
| PATCH | `/api/conversations/{id}` | Bearer | Rename / pin |
| DELETE | `/api/conversations/{id}` | Bearer | Delete |

---

## Audit & realtime

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/audit-logs` | **Admin** | Sensitive action history |
| WS | `/ws/live?token=…` | JWT query | Live detection broadcast; rejects missing/invalid/revoked tokens |

---

## Role matrix (sensitive)

| Capability | Analyst | Admin |
|------------|---------|-------|
| predict, explain, alerts read, metrics, chat | ✓ | ✓ |
| simulate / replay start-stop | | ✓ |
| pcap analyze | | ✓ |
| alerts export | | ✓ |
| audit logs | | ✓ |

---

## Related

- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)  
- Demo: [`DEMO.md`](DEMO.md)  
- Limitations (JWT revoke, throughput): [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)

## Lab, cascade demo and reviews (UX overhaul)

| Method | Path | Notes |
|---|---|---|
| GET | /api/cascade/demo/next?mode=guided|random&tier=1|2|3&cursor= | Read-only curated demo flow with per-tier trace |
| GET | /api/lab/scenarios | Scenario cards + isolation checklist |
| GET | /api/lab/status | Sensor status + active Quick Lab session |
| POST | /api/lab/sessions | Start Quick Lab (audited: lab.start) |
| GET | /api/lab/sessions/{id} | Session progress |
| POST | /api/lab/sessions/{id}/stop | Stop (audited: lab.stop) |
| POST | /api/lab/live/{enable|disable} | Admin: sensor watcher toggle |
| GET/POST | /api/reviews, /api/reviews/summary, /api/reviews/mine | List, create, summary, own review (PUT/DELETE on /mine) |
| POST | /api/reviews/{id}/helpful | Toggle helpful vote |
| GET/PATCH/DELETE | /api/admin/reviews[...], /api/admin/reviews/export | Admin moderation + CSV (audited) |
