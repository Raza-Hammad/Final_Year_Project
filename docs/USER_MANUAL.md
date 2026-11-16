# Cascadyx — User Manual

**Audience:** examiners, demo operators, and teammates walking the Living Lattice UI.  
**Start:** preferred one-command demo — see [`DEMO.md`](DEMO.md). Open **http://127.0.0.1:8000/** after `.\scripts\run_demo.ps1`.

Production models stay on **mid baseline**. Do not promote hardened models for demos.

---

## 1. First launch & login

1. Start the stack ([`DEMO.md`](DEMO.md) §0 or [`README.md`](../README.md)).
2. Open the app URL. On first visit in a browser session you see the **Intro** 3D scene (`frontend/src/pages/Intro.tsx`, `components/lattice/IntroScene.tsx`).
3. Complete the intro (or wait for it to finish) → **Login**.
4. Sign in with the seeded **admin** account (printed in the backend console on first DB create) or a registered analyst.

| Check | Expected |
|-------|----------|
| Health | `GET /api/health` → `{"status":"ok"}` |
| After login | App shell with nav: Live, Simulator, History, Insights, AI |
| Live socket | Connected indicator (token passed to `/ws/live`) |

**Screenshot placeholder — Intro 3D**  
`![Intro Living Lattice](screenshots/01-intro-3d.png)`  
*Student: capture full-bleed intro scaffold (Simulate → Detect → Explain beats).*

**Screenshot placeholder — Login**  
`![Login](screenshots/02-login.png)`

---

## 2. Live Detection (Living Lattice)

**Nav:** Live Detection (dashboard index) — `LiveDetectionPage.tsx` + `LiveAttackLattice.tsx`.

What you see:

- Spatial **lattice** of recent detections (severity / attack colouring).
- Live counters (packets/flows analyzed, attack count), tier breakdown, optional charts.
- Select a detection → open **Explain** (XAI attributions vs benign baselines).

How to generate traffic: start a CSV scenario or Live Replay from **Simulator** (next section); events arrive over WebSocket.

**Screenshot placeholder — Live lattice**  
`![Live Attack Lattice](screenshots/03-live-lattice.png)`  
*Student: show active DDoS/Port Scan stream with WS connected.*

**Screenshot placeholder — XAI explain**  
`![XAI Explain panel](screenshots/04-xai-explain.png)`

---

## 3. Simulator — CSV scenarios

**Nav:** Simulator — `SimulatorPage.tsx`.

1. Choose a scenario (registry in `backend/app/simulator/simulator.py`):

| ID | Display name | Typical demo use |
|----|--------------|------------------|
| `ddos` | DDoS Attack | High-signal, mostly Tier 1 |
| `port_scan` | Port Scan | High-signal |
| `dos` | DoS Attack | Volumetric |
| `brute_force` | Brute Force | FTP/SSH Patator |
| `web_attacks` | Web Attacks | Honest weak class (~61% scenario accuracy) |
| `bot` | Botnet Activity | Scarcer samples |
| `infiltration` / `heartbleed` | Rare classes | Tiny support |
| `mixed_attack` | Mixed Attack | Multi-vector |
| `benign_baseline` | Benign Baseline | False-positive check |

2. Set rate ≈ **5–10** flows/s (host capacity ~44 flows/s single-flow — see [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)).
3. Optional short duration (30–60 s) or stop manually.
4. **Start** (admin) → watch Live Detection. **Stop** when finished.

CSV mode streams **labelled test-split rows** — mid-eval path; no VirtualBox required.

**Screenshot placeholder — CSV Simulator armed**  
`![Simulator CSV](screenshots/05-simulator-csv.png)`

---

## 4. Simulator — Live Replay (PCAP)

Same Simulator page, **Live Replay** controls.

1. Place a **small** capture under `data/raw/` (e.g. `captures/your.pcap`). Paths must resolve under `DATA_RAW_DIR`.
2. For an isolated lab capture, follow [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md) (VirtualBox two-VM + `tcpreplay`) — do not duplicate that guide here; Cascadyx only consumes the copied file.
3. Enter relative path, keep `max_packets` small for demos.
4. **Start Replay** (admin) → cascade classifies extracted flows; stop when enough alerts show.

Safety banner in UI: Cascadyx never launches live attack tools — recorded CIC traffic only.

Alternatively, batch analyze via OpenAPI: `POST /api/pcap/analyze` (see [`API_SUMMARY.md`](API_SUMMARY.md)).

**Screenshot placeholder — Live Replay**  
`![Live Replay](screenshots/06-live-replay.png)`

---

## 5. Alert History & export

**Nav:** History — `AlertHistoryPage.tsx`.

1. Filter by attack type, tier, severity, date range; paginate.
2. Expand a row for details; explain from here or Live if wired the same context.
3. **Admin:** export **CSV** or **PDF** (`GET /api/alerts/export`). Exports are audit-logged.

**Screenshot placeholder — History filters**  
`![Alert History](screenshots/07-alert-history.png)`

**Screenshot placeholder — Export modal**  
`![Export report](screenshots/08-export.png)`

---

## 6. Model Insights & Cascade Machine

**Nav:** Insights — `ModelInsightsPage.tsx` + `CascadeMachine.tsx`.

Use this screen in viva to show:

- Mid-baseline accuracy / macro-F1 / confusion matrices / per-class F1.
- Throughput fields (~44 / ~120 flows/s).
- Hardening comparison: recommendation **`keep_baseline`**, hardened = experimental.
- Web-Attack caveat and SMOTE / feature charts where present.
- **Cascade Machine** visual: LGBM → RF → XGB escalation story.

**Screenshot placeholder — Insights metrics**  
`![Model Insights](screenshots/09-insights.png)`

**Screenshot placeholder — Cascade Machine**  
`![Cascade Machine](screenshots/10-cascade-machine.png)`

---

## 7. SENTINEL AI

**Nav:** AI — `AiAssistantPage.tsx`.

- Hybrid chat: **Nebius AI Studio** when `NEBIUS_API_KEY` is set; otherwise **rule-based / offline** answers (pytest uses rule-based).
- Ask about cascade threshold (0.85), tier roles, last alert, or general SOC-oriented questions.
- Conversations: list / pin / rename / delete; **incognito** mode skips persistence.

**Screenshot placeholder — SENTINEL AI**  
`![SENTINEL AI](screenshots/11-sentinel-ai.png)`

---

## 8. Roles cheat-sheet

| Action | Analyst | Admin |
|--------|---------|-------|
| Live view, history read, insights, chat, predict/explain | ✓ | ✓ |
| Start/stop CSV sim & Live Replay | ✗ | ✓ |
| PCAP analyze, alert export, audit logs | ✗ | ✓ |

---

## 9. Troubleshooting (short)

| Symptom | Fix |
|---------|-----|
| `/` is API JSON | `npm run build` in `frontend/`, restart uvicorn |
| 503 on predict/simulate | Missing `data/cache` models |
| WS disconnected | Same origin as UI; valid JWT; backend `:8000` |
| PCAP 400 | Path escape / not under `data/raw/` |
| Docker missing | Not required — see [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md) |

Full checklist: [`DEMO.md`](DEMO.md).
