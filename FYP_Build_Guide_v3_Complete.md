# FYP Build Guide v3 — Complete Reference
### Cybersecurity Threat Simulator Powered by AI
**Bahria University Karachi · BS(IT) · Group E**
**Team: Muhammad Hammad Raza · Yasir Hussain · Muhammad Izhan Khan**
**Supervisor: Mr. Muhammad Shahzad**

---

## Table of Contents

1. [What Changed from Earlier Guides](#corrections)
2. [Project Overview & Scope Guardrails](#overview)
3. [Final Architecture & Tech Stack](#architecture)
4. [Dataset Architecture — Two-Layer Design](#dataset)
5. [CLAUDE.md — Master Context File](#claudemd)
6. [PRE-MID PHASES](#premid)
   - Phase 0 — Scaffold & Setup
   - Phase 1 — Data Pipeline
   - Phase 2a — Train & Evaluate Three Models
   - Phase 2b — CascadeDetector
   - Phase 2c — Unified Severity Scoring *(added)*
   - Phase 3a — Prediction API
   - Phase 3b — Database & Alert Logging
   - Phase 3c — Auth
   - Phase 3d — WebSocket
   - Phase 4 — Attack Simulator (10 scenarios)
   - Design Step 0 — Design System Foundation *(before Phase 5)*
   - Design Step 1 — Intro Animation
   - Design Step 2 — Login Page
   - Phase 5a — App Shell & Auth Flow
   - Design Step 3 — Live Detection Restyle
   - Phase 5b — Live Detection Page
   - Security Posture Gauge *(between 5b and 5c)*
   - Phase 5c — Simulator Control & Alert History
   - Design Step 4 — Simulator & Alert History Restyle
   - Phase 5d — Model Insights
   - Phase 6a — Explain This Packet (XAI)
   - Phase 6b — Attack DNA Radar
   - Phase 6c — Smart Hybrid AI Assistant (SENTINEL AI)
   - Phase 6d — SMOTE Visualization & Export Report
   - Phase 6e — Live Attack Map *(updated to match design system)*
   - Design Step 5 — Model Insights & AI Assistant Restyle
   - Design Step 6 — Final Polish Pass
7. [Targeted Fix Prompts](#fixes)
   - Model Insights Accuracy Audit
   - Gauge + Attack Map Rebuild
   - Simulator 10-Scenario Upgrade
   - Simulator UI Overhaul
   - AI Assistant SENTINEL AI Overhaul
   - Gemini Key Rotation System
   - Chat Scroll Fix & Gemini Live Test
   - Full System Audit
8. [Mid-Evaluation Checklist](#mideval)
9. [POST-MID PHASES](#postmid)
   - Phase 7 — PCAP Processing Layer
   - Phase 8 — Real PCAP Replay in Isolated Environment
   - Phase 9 — BCCC Dataset Upgrade & Model Hardening
   - Phase 10 — Production Hardening & Testing
   - Phase 11 — Packaging & Deployment
   - Phase 12 — Documentation & Thesis
10. [Important Decisions & Viva Talking Points](#viva)

---

<a name="corrections"></a>
## 1. What Changed from Earlier Guides (v1 → v3)

These are the key corrections. Read them before anything else.

**CORRECTION 1 — Dataset roles were wrong in v1.**
PCAPs and CSVs do two completely different jobs. Never merged for training.
- `CIC-IDS2017 PCAPs` → **Simulation layer** (traffic replay, post-mid)
- `CIC-IDS2017 CSVs (GeneratedLabelledFlows)` → **Detection layer** (ML training, mid-eval)
- `BCCC-CIC-IDS2017 (2024)` → **Detection layer upgrade** (post-mid accuracy boost)

**CORRECTION 2 — LightGBM is NOT chosen for speed.**
LightGBM has the HIGHEST latency of the three models (10.20 μs). It is Tier 1 because of its highest accuracy (99.472%), not speed. The Tier 1 rationale on the Model Insights page was fixed.

**CORRECTION 3 — Login was never in the proposal.**
The proposal's Figure 3.1 shows one generic "User / Researcher" with no login step. Login was added as a realistic enhancement. The correct viva answer: *"We added login to simulate a real SOC tool — it adds role-based access and an audit trail beyond what the proposal required."*

**CORRECTION 4 — Simulator scenarios expanded from 5 to 10.**
DoS and DDoS are now separate scenarios. The 8 attack types in our dataset are: DoS, DDoS, Brute Force, Web Attacks, Port Scan, Bot, Infiltration, Heartbleed + Mixed Attack + Benign Baseline = 10 total.

**CORRECTION 5 — DDoS Storm no longer exists.**
The old "ddos_storm" scenario that mixed DoS + DDoS is replaced by two separate cards.

**CORRECTION 6 — T-2/T-3 showing 0 is NOT a bug.**
For common attacks (DDoS, DoS) on CIC-IDS2017, LightGBM catches everything at Tier 1 with >99% confidence. T-2 and T-3 activate for ambiguous rare attacks (Infiltration, Heartbleed). This is documented on the Model Insights page.

**CORRECTION 7 — PCAP processing is a new phase (Phase 7).**
The v1 guide had no PCAP processing phase. Your proposal's Figure 3.1 explicitly requires PCAP Parsing → Flow Generation → Feature Extraction. This is now Phase 7 (post-mid).

**NEW — Unified Severity Scoring** added between Phase 2b and Phase 3.
**NEW — Design System (10 steps)** added before Phase 5 for the Command Center identity.
**NEW — Security Posture Gauge** added between Phase 5b and 5c.
**NEW — SENTINEL AI branding** for the AI assistant.
**NEW — Gemini key rotation** across 10 free-tier API keys.
**NEW — Google Sign-In** planned for Phase 9/10 (post-mid).

---

<a name="overview"></a>
## 2. Project Overview & Scope Guardrails

**Three pillars (from the approved proposal):**
1. **SIMULATE** network attacks (DDoS, Port Scan, Brute Force, etc.) in a controlled, offline environment.
2. **DETECT** them using an AI/ML cascade analyzing network traffic.
3. **VISUALIZE** results in a real-time educational web dashboard with Explainable AI.

**Scope guardrails — never cross these in the viva:**
- Detection + Analysis + Awareness ONLY. No auto-blocking (not an active defense).
- Attacks produced by **replaying recorded traffic**, NOT running live attack tools.
- Network-level enterprise threats. NOT IoT-specific, not application-layer pentest.
- Mid-eval: CSV-based simulated-streaming. Final: real PCAP replay in isolated VM.

**Login clarification:**
The public zone (intro animation, about) requires no account. The private zone (dashboard) requires login. Open self-signup so any student can register. Default role: "analyst." Seeded admin role for higher access.

---

<a name="architecture"></a>
## 3. Final Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS + Recharts + lucide-react |
| Backend | Python + FastAPI + Uvicorn |
| ML | scikit-learn (RF), LightGBM, XGBoost, imbalanced-learn, joblib |
| Database | SQLite via SQLModel |
| Auth | passlib[bcrypt] + JWT (python-jose) |
| AI Chat | Google Gemini API (10-key rotation) + rule-based layer |
| Real-time | WebSocket |
| PDF Export | ReportLab |
| Post-mid PCAP | scapy / pyshark + tcpreplay |
| Post-mid Docker | docker-compose |

**Cascade design:** 3 tiers, confidence threshold 0.85
- Tier 1: LightGBM — highest accuracy (99.472%), handles ~95% of packets
- Tier 2: Random Forest — fastest inference (2.88 μs), drives XAI, ~4%
- Tier 3: XGBoost — weighted vote arbiter (LGBM 0.2 / RF 0.3 / XGB 0.5), ~1%

**Visual identity:** Command Center / Radar theme. Deep navy-black background, amber-gold accent, cyan for secure/calm. Space Grotesk (display), Inter (body), JetBrains Mono (numbers/data). One signature motif: slow-rotating radar sweep reused across every page.

---

<a name="dataset"></a>
## 4. Dataset Architecture — Two-Layer Design

```
CIC-IDS2017/
├── CSVs/
│   ├── GeneratedLabelledFlows.zip  ← USE FOR MID-EVAL DETECTION TRAINING
│   │   (8 CSVs, ~2.83M rows, 85 cols, 14 attack types)
│   │   Known bugs: 288,602 empty rows (Thursday), byte 0x96 encoding (Thursday)
│   └── MachineLearningCSV.zip      ← Cleaner fallback (78 features, no IP/metadata)
└── PCAPs/
    ├── Monday-WorkingHours.pcap    ← Benign only
    ├── Tuesday-WorkingHours.pcap   ← Brute Force
    ├── Wednesday-workingHours.pcap ← DoS + Heartbleed
    ├── Thursday-WorkingHours.pcap  ← Web Attacks + Infiltration
    └── Friday-WorkingHours.pcap    ← Botnet + Port Scan + DDoS
```

| Layer | Dataset | Format | Phase |
|---|---|---|---|
| Detection (mid) | CIC-IDS2017 GeneratedLabelledFlows | CSV | 1–2 |
| Simulation (mid) | Same CSV rows, replayed | CSV | 4 |
| PCAP processing (final) | CIC-IDS2017 PCAPs | PCAP | 7 |
| Real simulation (final) | CIC-IDS2017 PCAPs | PCAP | 8 |
| Detection upgrade (final) | BCCC-CIC-IDS2017 (2024) | CSV | 9 |

**CRITICAL:** Drop `Flow ID`, `Source/Destination IP`, `Source/Destination Port`, `Timestamp` from training features. The model must never memorize IP addresses. These columns are kept for display-only in the simulator.

**Dataset bugs to handle in the loader:**
- ~288,602 fully empty padding rows in Thursday WebAttacks file → drop them
- UTF-8 failure (byte 0x96 = Windows en-dash) in Thursday file → latin-1 fallback
- Infinity/NaN values → clean before training

---

<a name="claudemd"></a>
## 5. CLAUDE.md — Master Context File

Create this file in your project root **before writing any code**. Claude Code reads it automatically every session.

```markdown
# Project: Cybersecurity Threat Simulator Powered by AI (FYP)

## Team & Context
- Bahria University Karachi, BS(IT) Final Year Project. Supervisor: Mr. Muhammad Shahzad.
- Team: Muhammad Hammad Raza, Yasir Hussain, Muhammad Izhan Khan.
- Mid-evaluation: ~mid-2026 (target 60-70% complete). Final eval: ~13 Dec 2026.

## What the system does (three pillars)
1. SIMULATE network attacks in a controlled, OFFLINE/isolated environment.
2. DETECT them using an AI/ML cascade analyzing network traffic.
3. VISUALIZE results in a real-time educational web dashboard with Explainable AI.

## SCOPE GUARDRAILS
- Detection + Analysis + Awareness ONLY. Does NOT auto-block attacks.
- Attacks are produced by REPLAYING recorded traffic. No live attack tools. No real pentest.
- Network-level enterprise threats. Not IoT-specific.

## Architecture
- Backend: Python + FastAPI (REST + WebSocket). Frontend: React + Vite + Tailwind.
- Database: SQLite via SQLModel. Auth: bcrypt + JWT.
- AI Assistant: "SENTINEL AI" — rule-based layer first, Google Gemini API fallback.
  Gemini uses 10-key rotation (GEMINI_API_KEYS in .env, comma-separated).

## ML Cascade (3 tiers, confidence threshold 0.85)
- Tier 1: LightGBM — highest accuracy (99.472%), handles ~95% of packets.
- Tier 2: Random Forest — fastest inference (2.88μs), drives XAI feature attributions.
- Tier 3: XGBoost — weighted vote (LGBM 0.2 / RF 0.3 / XGB 0.5), rare edge cases.

## Severity Scoring (single source of truth, compute_severity() in severity.py)
- Attack base severity: DDoS/Bot/Infiltration/Heartbleed → Critical,
  BruteForce/WebAttack → High, PortScan → Medium, DoS → Critical, Benign → Info.
- If confidence < 0.70 → downgrade severity one level.
- EVERY part of the system (live feed, gauge, map, alerts, export) uses this same function.

## Dataset Architecture (NEVER merge for training)
- Detection layer (mid): CIC-IDS2017 GeneratedLabelledFlows CSVs.
- Detection layer (final): BCCC-CIC-IDS2017 (2024) CSVs.
- Simulation layer (mid): CSV row replay (simulated streaming).
- Simulation layer (final): CIC-IDS2017 PCAP replay in isolated environment.
- Known CSV bugs: 288,602 empty rows in Thursday file, byte 0x96 encoding → latin-1 fallback.
- Drop from training: Flow ID, Source/Dest IP, Source/Dest Port, Timestamp.

## Simulator Scenarios (10 total)
dos, ddos, brute_force, web_attacks, port_scan, bot, infiltration, heartbleed,
mixed_attack, benign_baseline.
All scenarios filter from the real test-set CSV data by label.
Low-count scenarios (Heartbleed, Infiltration) loop their available samples.

## Visual Identity — Command Center / Radar Theme
- One signature motif: slow-rotating radar sweep reused everywhere.
- Colors: --bg-base (#0A0E1A), --bg-panel (#111827), --bg-panel-raised (#1A2335),
  --accent-amber (#F5A623), --color-calm (#2DD4BF).
- Severity: Critical #EF4444, High #F97316, Medium #F5A623, Low/Info #64748B.
- Fonts: Space Grotesk (display/headings), Inter (body), JetBrains Mono (all numbers/data).
- Reusable components: RadarBackground, GlowPanel, GlowButton, StatusBadge.

## Folder Structure
- /backend  → FastAPI app, ML, DB, simulator, (later) PCAP processing
- /frontend → React app
- /data/raw → CSVs + PCAPs (gitignored)
- /data/cache → processed data + saved models + metrics
- /backend/.env → GEMINI_API_KEYS, JWT_SECRET (gitignored)

## Conventions
- Type hints + docstrings, PEP8, small testable functions.
- Never commit .env, datasets, or model files.
- After every feature the app must still run.
- Code must be defendable in a viva — comment non-obvious logic.
```

---

<a name="premid"></a>
## 6. PRE-MID-EVALUATION PHASES

---

### PHASE 0 — Project Scaffold & Setup

```
Set up the full project scaffold.

1. Structure: /backend, /frontend, /data/raw, /data/cache.
2. Backend: Python venv + requirements.txt with:
   fastapi, uvicorn[standard], pandas, numpy, scikit-learn, lightgbm, xgboost,
   imbalanced-learn, joblib, sqlmodel, passlib[bcrypt], python-jose[cryptography],
   python-multipart, python-dotenv, google-generativeai, reportlab.
   Minimal app: GET /api/health → {"status":"ok"}. config.py reading from .env.
   backend/.env.example with GEMINI_API_KEYS= and JWT_SECRET=.
3. Frontend: React+Vite in /frontend, install Tailwind, recharts, lucide-react, axios.
   Landing page calling /api/health showing "Backend connected" or error.
4. Root .gitignore: venv, node_modules, __pycache__, .env, /data, *.pkl, *.joblib.
5. git init + README.md with exact run commands.

Confirm health check works end to end. Do not start ML work.
```

---

### PHASE 1a — Data Loader & Cleaning

```
Build the data ingestion layer in backend/app/data/.

1. safe_read_csv(path): try utf-8, fall back to latin-1 on UnicodeDecodeError.
2. load_dataset(dir): read all 8 GeneratedLabelledFlows CSVs from /data/raw, concatenate:
   - Strip whitespace from column names. Standardize label column to 'Label'.
   - Drop ~288,602 fully-empty padding rows and rows with >50 NaN features.
   - Replace +/- infinity with NaN; drop or median-impute remaining NaN (explain choice).
3. Print summary: rows before/after cleaning, feature count, class distribution.
4. Data path configurable via config.py (default /data/raw).

Show how to run as one-off script to see the summary.
```

### PHASE 1b — Features, Split, SMOTE, Cache

```
Extend the pipeline with prepare_data() in backend/app/data/.

- Load cleaned dataframe from Phase 1a.
- DROP identifier/leakage columns: Flow ID, Source IP, Destination IP,
  Source Port, Destination Port, Timestamp.
- Label-encode target; SAVE encoder to /data/cache/label_encoder.joblib.
- Select top-K features by Random Forest importance (default K=30);
  SAVE to /data/cache/features.json.
- Stratified 80/20 train/test split (random_state=42).
- Apply SMOTE to TRAINING set ONLY. Save class distribution before/after
  to /data/cache/smote_stats.json.
- StandardScaler → save to /data/cache/scaler.joblib.
- Save X_train/X_test/y_train/y_test to /data/cache.
- Caching: load cached files if they exist unless force=True.

Explain feature-selection and SMOTE choices in plain English.
```

---

### PHASE 2a — Train & Evaluate Three Models

```
Build backend/app/ml/train.py using cached processed data.

Train LightGBM (multiclass), Random Forest, and XGBoost on SMOTE-balanced training data.
For EACH model on the untouched test set, compute and SAVE to /data/cache/metrics/:
- accuracy, macro precision/recall/F1, per-class F1.
- confusion matrix as JSON AND as a PNG image.
- training time and average inference time per sample.
Save models to /data/cache/models/ (lightgbm.joblib, random_forest.joblib, xgboost.joblib).
Force-retrain flag; skip if models already exist.
Print a 3-model comparison table. Explain which wins on speed vs accuracy
and why that justifies the cascade.
```

### PHASE 2b — CascadeDetector

```
Build backend/app/ml/cascade.py with CascadeDetector class.
Loads all 3 models + scaler + label encoder once at init.

detect(features) logic (threshold 0.85, configurable):
  1. LightGBM predict_proba; if max conf >= 0.85 → return.
  2. Else Random Forest; if max conf >= 0.85 → return.
  3. Else XGBoost; weighted vote across all three (LGBM 0.2 / RF 0.3 / XGB 0.5) → argmax.

Return dict: predicted_label (decoded), confidence, tier (1/2/3), tier_name,
top_features (3-5 feature names, this sample's values, using RF importances).
Add self-test running a few test-set samples. Explain cascade in plain English.
```

### PHASE 2c — Unified Severity Scoring *(add between 2b and Phase 3)*

```
Add a unified severity scoring layer in backend/app/ml/severity.py.

Create compute_severity(attack_type: str, confidence: float) -> str:

Base severity map (use exact CIC-IDS2017 label names):
  DDoS → Critical, Bot → Critical, Infiltration → Critical, Heartbleed → Critical,
  All DoS variants → Critical,
  Web Attack variants → High, FTP-Patator → High, SSH-Patator → High,
  PortScan → Medium,
  BENIGN → Info.

Logic:
  - Start from base severity.
  - If confidence < 0.70, downgrade one level (Critical→High→Medium→Low).
  - Never downgrade Benign/Info.
  - Severity order: Critical > High > Medium > Low > Info.

Wire in:
- CascadeDetector.detect() returns "severity" field using compute_severity().
- Alert DB model stores severity as a column.
- Every WebSocket broadcast and API response includes severity.

Test: DDoS at 0.95 confidence → Critical. DDoS at 0.60 → High.
```

---

### PHASE 3a — Prediction API

```
Wire CascadeDetector into FastAPI.
- Load once into app state on startup (not per request).
- POST /api/predict: accept features JSON → run detect() → return full result.
- GET /api/models/metrics: return saved metrics + confusion matrix data.
- CORS for localhost:5173.
Show how to test /api/predict with a sample payload.
```

### PHASE 3b — Database & Alert Logging

```
Add SQLite via SQLModel in backend/app/db/.
Tables:
  User(id, username unique, hashed_password, role default 'analyst', created_at)
  Alert(id, timestamp, predicted_label, confidence, tier, severity,
        source_scenario, raw_features JSON, source_ip, dest_ip, source_port, dest_port)

- Create DB + tables on startup (/data/cache/app.db).
- On every NON-benign prediction, auto-insert an Alert.
- GET /api/alerts: list with filters (attack_type, tier, severity, date_from, date_to)
  + pagination (limit/offset, newest first).
- GET /api/alerts/stats: counts grouped by attack_type AND by tier.
Test: run predictions, confirm /api/alerts returns them with severity field.
```

### PHASE 3c — Auth

```
Add auth in backend/app/auth/.
- POST /api/auth/register: bcrypt-hash password (passlib).
- POST /api/auth/login: verify → return JWT (python-jose) with username + role.
- get_current_user dependency; protect /api/predict, /api/alerts, /api/simulate.
- JWT_SECRET from .env. Seed one default admin on first run, print credentials once.
Show login flow with example requests.
```

### PHASE 3d — WebSocket

```
Add WebSocket /ws/live with connection manager. broadcast_detection(result) helper
pushes each detection to all connected clients. Heartbeat every few seconds.
Broadcast message must include: predicted_label, confidence, tier, severity,
top_features, source_ip, dest_ip, timestamp.
Explain frontend connection and message shape.
```

---

### PHASE 4 — Attack Simulator (10 Scenarios)

**Pre-prompt:**
```
This builds the MID-EVAL simulator. It safely simulates attacks by replaying real
labelled rows from the TEST data through the cascade. NOT by running real attack tools.
NOT by parsing PCAP files (PCAP replay is Phase 8, post-mid).
```

**Step 1 — Verify labels in dataset first:**
```
Before writing any simulator code, verify which attack labels exist in our real dataset.

1. Load /data/cache/label_encoder.joblib and print all classes + integer codes.
2. Also run df['Label'].unique() on cached processed data for ground truth.
3. Build this mapping table with REAL label strings from our data:

   USER SCENARIO    | REAL DATASET LABEL(S)
   dos              | (all DoS variant labels found)
   ddos             | (DDoS label)
   brute_force      | (FTP-Patator, SSH-Patator, etc.)
   web_attacks      | (Web Attack sub-types)
   port_scan        | (PortScan)
   bot              | (Bot)
   infiltration     | (Infiltration)
   heartbleed       | (Heartbleed)
   benign_baseline  | (BENIGN)
   mixed_attack     | (all non-benign combined)

4. Print row counts per label in the TEST set. Flag any with < 50 rows.
5. Write a verification report: CONFIRMED / LOW SAMPLE COUNT / NOT FOUND.
Only proceed to building after this report is written.
```

**Step 2 — Build the simulator:**
```
Using ONLY confirmed attack types from the verification above, build backend/app/simulator/.

SCENARIO REGISTRY: a SCENARIOS dict with 10 entries, each having:
  scenario_id, display_name, labels (exact dataset strings), description (≤15 words),
  severity_hint (Critical/High/Medium/Info).

SCENARIOS to build (fill labels from Step 1 verification):
  dos: "DoS Attack" — "Floods a target to exhaust its resources." — Critical
  ddos: "DDoS Attack" — "Distributed flood from multiple sources." — Critical
  brute_force: "Brute Force" — "Repeated login attempts to crack credentials." — High
  web_attacks: "Web Attacks" — "SQL injection, XSS, and web brute-force exploits." — High
  port_scan: "Port Scan" — "Systematically probes open ports to map the network." — Medium
  bot: "Botnet Activity" — "Automated bot communicating with a command server." — Critical
  infiltration: "Infiltration" — "Stealthy lateral movement after initial compromise." — Critical
  heartbleed: "Heartbleed" — "Exploits OpenSSL to leak server memory contents." — Critical
  mixed_attack: "Mixed Attack" — "Multi-vector attack combining all threat types." — Critical
  benign_baseline: "Benign Baseline" — "Normal network traffic, no malicious activity." — Info

LOW-SAMPLE HANDLING (Heartbleed, Infiltration):
If fewer than 50 test rows found for a label, loop and shuffle available samples to
sustain the full requested simulation duration. Never end early.

SIMULATION RUNNER: streams samples at configurable rate (packets/sec).
For each: call CascadeDetector.detect(), log Alert to DB, broadcast over /ws/live.
Runs as background task. Start/stop supported.

ENDPOINTS (auth-protected):
  POST /api/simulate/start {scenario_id, rate, duration_seconds}
  POST /api/simulate/stop
  GET  /api/simulate/status → running, scenario, packets_sent, attacks_detected,
                               tier_breakdown {tier1, tier2, tier3}
  GET  /api/simulate/scenarios → full SCENARIOS dict for frontend to build UI dynamically.

400 error if scenario_id not in SCENARIOS. 400 error if zero rows found for labels.
```

---

### DESIGN STEP 0 — Design System Foundation *(do before any page is built)*

```
Build the visual design system foundation — the "Command Center" identity.
Do this BEFORE touching any existing page.

1. CSS variables in frontend/src/styles/tokens.css:
   --bg-base: #0A0E1A; --bg-panel: #111827; --bg-panel-raised: #1A2335;
   --accent-amber: #F5A623; --color-calm: #2DD4BF;
   Severity: Critical #EF4444, High #F97316, Medium #F5A623, Low/Info #64748B;
   --text-primary: #E5E7EB; --text-secondary: #94A3B8;
   Border: rgba(245,166,35,0.15). Spacing scale: 4/8/12/16/24/32/48px.

2. Typography:
   Display/headings: Space Grotesk. Body: Inter. Monospace (all numbers/data): JetBrains Mono.

3. Reusable components in frontend/src/components/ui/:
   - RadarBackground: full-page very-low-opacity slow-rotating radar sweep SVG/CSS.
     Respects prefers-reduced-motion (freeze if set).
   - GlowPanel: card/panel wrapper with panel background, subtle border, four small
     HUD-style corner bracket decorations.
   - GlowButton: primary (amber glow on hover/focus) and ghost variants.
   - StatusBadge: colored pill for severity/status labels.

4. Quality bar (applies everywhere from now on):
   - Consistent spacing from scale. Every interactive element has hover + focus state.
   - Text readable (WCAG AA contrast) against dark background.
   - No animation ever blocks interaction. Loading states use skeletons.

Show a small demo page with RadarBackground + GlowPanel + GlowButton + StatusBadge.
Approve look before touching real pages.
```

### DESIGN STEP 1 — Landing Intro Animation *(before Phase 5a)*

```
Build a "Command Center" intro sequence (~10-12 seconds) shown before Login.
Uses tokens/components from Step 0. No WebGL — pure SVG + CSS animations.

1. Dark screen → faint radar grid (concentric circles + crosshair, low-opacity amber).
2. Glowing sweep arm begins rotating.
3. As sweep passes sectors, red blips fade in and multiply (Critical/red = hidden threats).
   Text fades in: "Threats don't announce themselves."
4. Sweep brightens, speeds up. Each blip crossed: targeting-reticle lock-on → blip turns cyan.
5. Text: "Our AI doesn't just scan. It detects, explains, and responds." → fades out.
6. Sweep settles to slow rotation. Project title in center (display font), tagline below.
7. GlowButton appears: "Enter Command Center" → goes to Login.
8. "Skip" text link visible from second one, works instantly.

Respect prefers-reduced-motion: skip to title + button immediately.
Add "Replay intro" link on Login page for demo use.
Confirm Skip and Replay both work.
```

### DESIGN STEP 2 — Login Page Restyle

```
Restyle ONLY the Login page using Step 0 tokens. Do not touch login logic.

- Background: RadarBackground.
- Form in a GlowPanel, centered. Project name above it in display font.
- Inputs: dark fill, amber glow border + soft glow on focus (no default blue outline).
- Submit: GlowButton primary.
- Errors: calm plain-English message inside the panel — no browser-default alerts.
- Add "Replay intro" link beneath the form.
- Tab order logical. Everything aligned to spacing scale.
```

### PHASE 5a — App Shell & Auth Flow

```
Build frontend foundation in /frontend.
- Login page calling /api/auth/login; store JWT in memory + React context; redirect to dashboard.
- axios instance attaching JWT to every request; on 401 → redirect to login.
- Protected routing (react-router).
- App shell: left sidebar (Live Detection, Threat Simulator, Alert History, Model Insights,
  AI Assistant), top header (logged-in user + posture badge + connected badge + logout).
  Dark SOC theme.
```

### DESIGN STEP 3 — Dashboard Shell + Live Detection Restyle

```
Restyle app shell and Live Detection page. Components already exist — restyle only.

App shell:
- Sidebar: nav items in body font, active item highlighted with amber accent left bar.
  Icons recolored to palette.
- Header: posture StatusBadge + connected StatusBadge + logout GlowButton ghost.

Live Detection page:
- Wrap Posture Gauge and Attack Map each in GlowPanel with corner brackets.
  These are the centerpiece — give them most weight.
- Recolor map pulses and gauge arc to severity tokens.
- Stat cards: GlowPanel style, numbers in monospace, small captions in body font.
- Live feed: alternate row shading, severity as StatusBadge, smooth fade-in for new rows.
- Live chart: severity palette series, faint gridlines.
Check consistency: same padding, no stray blue focus rings, no misaligned card heights,
hover states on every clickable item, gauge/map/feed agree on color language.
```

### PHASE 5b — Live Detection Page

```
Build the Live Detection page.
- Connect to /ws/live; green "Connected" indicator from heartbeat.
- Stat cards: Packets Processed, Attacks Detected, Packets/sec, Tier Breakdown (1/2/3).
- Live feed: detections (timestamp, attack type, confidence, tier, severity badge).
  Color-coded by severity. Cap length. Smooth fade-in.
- Live Recharts chart: counts per attack type or over time, updates as messages arrive.
Smooth under fast stream (throttle re-renders if needed).
```

### Security Posture Gauge *(add after Phase 5b, before 5c)*

```
Add a "Security Posture Gauge" to Live Detection page beside the Attack Map.

Rolling window: last 50 detections or last 2 minutes.
Score (0-100): weight by severity (Info=0, Low=1, Medium=2, High=3, Critical=4).
Average, normalize to 0-100.

Render as SVG semi-circular speedometer:
- Colored arc: green (0%) → amber (50%) → red (100%).
- Needle: thin radial line from center pivot, --accent-amber, rotates by angle formula:
    needleAngle = -90 + (score / 100) * 180
  At 0%: -90deg (hard left). At 50%: 0deg (straight up). At 100%: +90deg (hard right).
  CSS transition: transform 0.8s ease-in-out.
- Score percentage in large monospace font, positioned BELOW the needle pivot.
- "RISK INDEX" in small body font below the score.
- Status bar always visible (minimum 36px height):
    0-30: ● green "SECURE" + "No significant threats detected."
    31-60: ● amber "ELEVATED" + "Moderate attack activity detected."
    61-100: ● red "UNDER ATTACK" + "Sustained critical threat cascade active."
- Tick marks at 0/25/50/75/100% along the arc.
All four elements (needle, score text, arc, status bar) must read from one score variable.
```

### PHASE 5c — Simulator Control & Alert History

```
Build two frontend pages.

1) Simulator page:
   - Cards loaded dynamically from GET /api/simulate/scenarios (not hardcoded).
   - Scenario cards with icon, name, description, severity dot.
   - Rate and duration controls.
   - Start/Stop calling /api/simulate/*.
   - Live status panel reading /api/simulate/status.

2) Alert History:
   - Filterable, paginated table from /api/alerts (attack type, tier, severity, date range).
   - Summary chart from /api/alerts/stats.
   - Each row expandable to show raw feature snapshot.
Clean and responsive.
```

### DESIGN STEP 4 — Simulator & Alert History Restyle

*(See "Simulator UI Overhaul" in Targeted Fix Prompts — Section 7)*

### PHASE 5d — Model Insights

```
Build Model Insights from /api/models/metrics:
- 3-model comparison table (accuracy, macro F1, avg inference time, train time).
- Confusion matrices as heatmaps.
- RF feature importance bar chart (sorted highest to lowest; labeled "Random Forest
  Feature Importances" — not generic).
- SMOTE before/after charts from /api/data/smote-stats.
- Cascade rationale panel (plain English, no numbers contradicting the table).
- "Why a cascade" panel explaining 85% confidence threshold.
```

---

### PHASE 6a — "Explain This Packet" (XAI)

```
Add Explainable AI.
Backend: each detection includes top_features with feature name, this packet's value,
and benign baseline average (precomputed from benign test data, cached).
Expose GET /api/data/benign-baseline.

Frontend: clicking any detection opens "Explain This Packet" panel:
- Verdict (attack type, confidence, deciding tier) in plain English.
- Top 3-5 features as bar comparisons (this value vs benign average).
- One plain-English summary sentence on why it was flagged.
```

### PHASE 6b — Attack DNA Radar

```
Add "Attack DNA" radar chart (Recharts RadarChart) inside the Explain panel.
Two overlaid polygons: "This Attack" vs "Normal Baseline" across 6-8 key features,
normalized to 0-1. Each attack type gets a distinct visual signature.
```

### PHASE 6c — Smart Hybrid AI Assistant (SENTINEL AI)

```
Build the AI Assistant (branded "SENTINEL AI").
Backend POST /api/chat:
- Rule-based layer: dictionary of common Q&A about the system, attacks, cascade.
- Gemini fallback (see Phase: Gemini Key Rotation for multi-key setup).
  System prompt scopes to cybersecurity. Off-topic: professional redirect, not robotic refusal.
- "explain the last alert" → fetch latest alert from DB, inject details, explain in plain English.
- Response includes: "source" field ("rule_based" or "gemini"), response_time_ms.

Gemini errors caught gracefully — never crash, always return a fallback message.
Never expose API keys to frontend.

GET /api/chat/status → {gemini_available, keys_total, keys_available, keys_exhausted}.
```

### PHASE 6d — SMOTE Visualization & Export Report

```
1) SMOTE before/after: expose /api/data/smote-stats (reads smote_stats.json).
   Frontend: two bar charts (before = imbalanced, after = more balanced) on Model Insights.

2) Export Report: backend endpoint generating PDF (reportlab) + CSV of filtered alerts.
   Include: summary stats, tier breakdown, alert table with real data.
   Stream as file download. Add button on Alert History page.
```

### PHASE 6e — Live Attack Map *(design system aligned)*

**Pre-prompt:**
```
Build a "Live Attack Map" for the Live Detection page.
Severity colors must use ONLY our design system tokens — no ad-hoc colors.
Source IP/Destination IP/Port used for display only — NEVER passed to the ML model.
```

```
Build AttackMapPanel component in frontend.

Backend: ensure each detection broadcast includes source_ip, dest_ip, source_port,
dest_port (display only from the raw flow record, not from the model).

Frontend:
- Simple network diagram: "Attacker Pool" node (left), "Clients (Benign)" node (left),
  "Web Server", "DB Server", "Workstation" nodes (right column).
- All nodes are circles (consistent size). Target nodes: --bg-panel-raised fill, thin border,
  2-letter abbreviation (WS/DB/PC) in monospace, name + IP below in body font.
  Attacker Pool: larger, deep red tinted, fast pulsing glow when attack active.
  Clients: --color-calm tinted, calm slow pulse.
- Unique IPs: Web Server 192.168.10.10, DB Server 192.168.10.20, Workstation 192.168.10.30,
  Attacker Pool 203.0.113.45, Clients 192.168.10.50.
- Label: "INTERNAL LAN" (NOT "Internet LAN") for the right column.
- Attack arcs colored by SEVERITY using our token colors (not ad-hoc colors).
  Fade out after 1.5-2 seconds. Cap at 6 simultaneous arcs. Offset concurrent arcs.
- Tooltip on hover showing source IP → dest IP:port, attack type, confidence. No inline labels on lines.
- Idle state: dashed dormant path lines (low opacity) showing network topology.
  "AWAITING INGRESS STREAM TELEMETRY..." with slow pulsing opacity, disappears on first detection.
- IDLE/LIVE indicator top-right: grey "IDLE" vs pulsing amber dot + "LIVE".
- RadarBackground scoped to this panel (very low opacity). Legend as StatusBadge chips.
- Wrap in GlowPanel.
Severity colors and legend chips must be byte-identical to the live feed severity badges.
```

### DESIGN STEP 5 — Model Insights & AI Assistant Restyle

*(Included in "AI Assistant SENTINEL AI Overhaul" in Section 7)*

### DESIGN STEP 6 — Final Whole-Site Polish Pass

```
Full visual QA pass across the entire app. Check AND fix each item:

1. Borders & corners: every panel uses GlowPanel style — no leftover default borders.
2. Spacing: consistent padding/margins from scale; consistent vertical rhythm.
3. Typography: headings = Space Grotesk, body = Inter, numbers/data = JetBrains Mono. Everywhere.
4. Color meaning: severity colors mean the SAME thing everywhere — fix any drift.
5. Buttons & inputs: every button is GlowButton variant, every input matches our style.
6. Animation: calm and intentional. prefers-reduced-motion respected everywhere.
7. Empty/loading/error states: every page shows on-brand messages — never blank or raw errors.
8. Responsiveness: resize to smaller laptop width, confirm no overlap/overflow.
9. Accessibility: visible focus on every interactive element, sufficient contrast, labels on icon-only buttons.

Give a short summary of what was found and corrected.
```

---

<a name="fixes"></a>
## 7. Targeted Fix Prompts

---

### FIX — Model Insights Accuracy Audit

```
Fix a factual contradiction and do a full accuracy audit on Model Insights page.

TASK 1 — FIX THE CONTRADICTION:
Tier 1 rationale says LightGBM "selected for speed (~10.2μs)" but the table shows
LightGBM has the HIGHEST latency (10.20μs — slowest). Fix the rationale:

Tier 1 — LightGBM (Screener):
"Selected for highest overall accuracy (99.472%). Handles the clear majority of
classification decisions, escalating only uncertain cases to Tier 2."

Tier 2 — Random Forest (Validator):
"Queried only on LightGBM uncertainty. Fastest at inference (2.88μs) and highly
explainable — drives local XAI feature attributions in Explain This Packet."

Tier 3 — XGBoost (Vote Arbiter):
"Handles low-confidence edge cases. Executes a weighted ensemble vote
(LGBM 0.2 / RF 0.3 / XGB 0.5) to minimize false alarm ratios."

Remove "90%+ BENIGN flows" — unsupported claim.
Remove "speed" describing LightGBM anywhere on this page.

TASK 2 — FULL PAGE AUDIT:
Check every visible element: metrics table (real data not hardcoded), confusion matrices
(real saved PNGs not dummy), feature importance (real RF importances, sorted, named),
SMOTE charts (before ≠ after), cascade rationale (no internal contradictions),
no placeholder text (NaN/null/undefined/"0.000%"), unit labels (% for accuracy, μs for latency).
Report what was checked, what was fixed, what needs manual verification.
```

---

### FIX — Gauge + Attack Map Rebuild

```
Fix all issues in the Threat Posture Gauge and Live Attack & Traffic Map.

PART 1 — GAUGE FIXES:

FIX 1 — NEEDLE (currently a flat horizontal bar — wrong):
Replace with proper SVG radial needle:
  <g transform="translate(cx, cy)">
    <line x1="0" y1="0" x2="0" y2="-radius" stroke="--accent-amber" strokeWidth="2.5"/>
    <circle r="5" fill="--accent-amber"/>
  </g>
  Rotation: needleAngle = -90 + (score / 100) * 180
  CSS transition: transform 0.8s ease-in-out on the needle group.
  At 76%: angle = 46.8deg (firmly in red zone near right). Confirm visually.

FIX 2 — ARC GRADIENT MISSING:
Draw the arc as SVG <path> with LinearGradient:
  0% → #22C55E (green), 50% → #F5A623 (amber), 100% → #EF4444 (red).
  Stroke-width: 12-16px. Always visible, even at score 0%.

FIX 3 — STATUS BAR HIDDEN:
Minimum height 36px. Always visible. Shows:
  0-30: ● green "SECURE" + "No significant threats detected."
  31-60: ● amber "ELEVATED" + "Moderate attack activity detected."
  61-100: ● red "UNDER ATTACK" + "Sustained critical threat cascade active."
Updates in real time from the same score variable.

FIX 4 — SYNC: all four (needle, score text, arc fill, status bar) read from one variable.

PART 2 — ATTACK MAP FIXES:

FIX 1: "INTERNET LAN" → "INTERNAL LAN" everywhere.

FIX 2: Web Server, DB Server, Workstation must be circle NODES on the canvas,
not a text list. Same approach as Attacker Pool and Clients nodes.
Abbreviations: WS, DB, PC. Names + IPs below.

FIX 3: Assign unique IPs:
  Web Server: 192.168.10.10, DB Server: 192.168.10.20, Workstation: 192.168.10.30,
  Attacker Pool: 203.0.113.45, Clients: 192.168.10.50.

FIX 4: Idle empty area — add dashed dormant path lines (low opacity).
"AWAITING..." text with slow pulsing opacity animation, disappears on first detection.

FIX 5: IDLE/LIVE indicator and LIVE ATTACK MONITOR label per design system.
```

---

### FIX — Simulator 10-Scenario Upgrade

*(Full prompt in Phase 4 section above — "Step 2: Build the simulator")*
*(Run the dataset label verification first, then the simulator build)*

---

### FIX — Simulator UI Overhaul

```
Full visual + UX overhaul of Threat Simulator page. Do not change any logic.

FIX TYPO: "Bu BUIC BS(IT)" → "By Bahria University Karachi — BS(IT) Final Year Project"

UPGRADE 1 — PAGE HEADER COMMAND BAR:
- Rotating Crosshair icon (pauses during simulation, resumes when idle).
- "THREAT SIMULATION CONSOLE" in display font.
- Subtitle: "Controlled attack replay — isolated test environment — no live network traffic"
- Right side: Posture badge + Connected badge + "SIMULATION: IDLE/ACTIVE" badge + Logout.

UPGRADE 2 — SCENARIO CARDS (10 total, 5x2 grid, min 110px height):
Each card: severity dot (pulsing fast for Critical), lucide icon in severity color,
full display_name (not truncated), description (min 11px, max 2 lines), severity chip.
Selected state: severity-colored border glow, "ARMED" label top-right, pulsing border.
Hover: border brightens, icon scales 5%.

UPGRADE 3 — ATTACK PROFILE PREVIEW PANEL (slides in on card select):
Left: full description, data chips (Severity/Type/Expected Tier Hit), Threat Vector sentence.
Right: live-calculating Est. Total Packets, Est. Attack Detections, Simulation Intensity bar.
All update instantly as rate/duration inputs change.
When no card selected: "← SELECT A SCENARIO TO VIEW ATTACK PROFILE" centered, pulsing.

UPGRADE 4 — CONTROLS:
Rate: 4 preset buttons [SLOW:2] [NORMAL:5] [FAST:15] [MAX:30] above styled input.
Duration: 4 preset buttons [15s] [30s] [60s] [120s] above styled input.

UPGRADE 5 — SIMULATION BUTTON:
Idle: "INITIATE SIMULATION" full-width 52px, display font, shimmer on hover,
selected scenario name right side, pulsing play icon.
Disabled (no scenario): darker, no shimmer, cursor not-allowed, red "[ SELECT SCENARIO ]".
Running: "ABORT SIMULATION" red pulsing background + progress bar filling over duration.

UPGRADE 6 — LIVE STATUS PANEL:
Status badge: STANDBY/TRANSMITTING/COMPLETED/FAULT.
Metric rows: compact instrument-panel style, monospace numbers, thin separators.
Elapsed counter: ticks up live every second using setInterval.
Live Intensity Waveform: small area chart (detection rate last 20s) fills dead whitespace.
CASCADE BREAKDOWN: T-1 (cyan) / T-2 (amber) / T-3 (purple) with percentage bars.
Note below: "T-2 and T-3 activate for Infiltration and Heartbleed scenarios."

UPGRADE 7 — BACKGROUND:
RadarBackground scoped to left panel (4% opacity). Speeds up during active simulation.
GlowPanel corner brackets glow in active scenario's severity color while running.
```

---

### FIX — AI Assistant SENTINEL AI Overhaul

```
Full visual upgrade of AI Assistant page. Do not change any chat logic or API calls.

FIX 1 — DASHED BORDER: Replace dashed AI bubble border with solid 1px standard border.
FIX 2 — SCROLLBAR: Custom thin amber scrollbar (4px width, rgba amber track).
FIX 3 — REFUSAL TONE: Update Gemini system prompt — replace "I can only assist with..."
  with a professional analyst redirect:
  "My operational scope covers cybersecurity threats, network intrusion analysis, the
   THREATSIM detection system, and SOC analyst workflows. For [topic], I'd recommend a
   general-purpose AI. How can I help with your security analysis?"

UPGRADE 1 — HEADER:
Left: pulsing ShieldAlert icon + "SENTINEL AI" in display font (primary name) +
  "Intelligent Security Analyst Assistant" in tiny secondary text.
Right: "⚡ RULE-BASE: ACTIVE" cyan chip + "✦ GEMINI: CONNECTED/UNAVAILABLE" amber/grey chip.
Thin separator line below header.

UPGRADE 2 — CHAT BACKGROUND:
--bg-base fill. RadarBackground scoped (3-4% opacity, 15s rotation). Inset shadows top+bottom.

UPGRADE 3 — USER BUBBLES:
Right-aligned. amber rgba(245,166,35,0.08) background, 1px amber border.
Border-radius: 12px except top-right corner (4px — tail side).
"YOU" label inside bubble top-left in tiny monospace. Timestamp inside bubble bottom-right.

UPGRADE 4 — SENTINEL AI BUBBLES:
Left-aligned. 28px avatar circle (amber icon, --bg-panel-raised, amber border) above bubble.
"SENTINEL AI" label beside avatar. Solid border (NOT dashed). --bg-panel-raised background.
3px solid left border in --accent-amber at 40% opacity — visual distinguisher.
Badge row at bottom (thin separator): "⚡ RULE-BASE" cyan chip OR "✦ GEMINI" amber chip +
response time in tiny monospace + timestamp.

UPGRADE 5 — EMPTY STATE (welcome screen when no messages):
Center: 56px SENTINEL AI avatar + "SENTINEL AI" in display font + subtitle.
4 suggestion chips in 2x2 grid: "What is a DDoS attack?" / "How does the cascade work?" /
"Explain the last alert" / "What is SMOTE?" — clicking sends immediately.
Disappears on first message.

UPGRADE 6 — INPUT BAR:
Separator line at top. --bg-panel background (lighter than chat area).
Input: 3px amber left accent (20% opacity, brightens to 60% on focus).
Send GlowButton: Send icon + "SEND" text, shimmer on hover, scale-down click feedback.
"Enter ↵ to send" hint visible only when input focused.

UPGRADE 7 — TYPING INDICATOR:
Proper SENTINEL AI bubble (same avatar/style) with three bouncing amber dots:
translateY(0→-6px→0), each dot 0.15s staggered delay. Badge shows "● PROCESSING..."

UPGRADE 8 — PANEL: GlowPanel container. Height: calc(100vh - header - input bar).
Input always visible without page scroll.

UPGRADE 9 — MESSAGE SPACING: Same-sender gap 6px. Between exchanges 16px. 12px padding edges.
```

---

### FIX — Gemini Key Rotation System

```
Add 10-key Gemini rotation in backend.

1. .env: GEMINI_API_KEYS=key1,key2,...,key10 (comma-separated on one line).
   Remove old GEMINI_API_KEY. Update .env.example with format comment.

2. backend/app/services/gemini_key_manager.py — GeminiKeyManager class:
   - Init: read GEMINI_API_KEYS, split/strip, store as list. current_index=0.
     exhausted=set(). Thread-safe with threading.Lock().
   - get_current_key(): skip exhausted keys. If all exhausted, clear set and restart.
   - mark_exhausted(key): add to exhausted set, advance index. Log "Key #N exhausted" (never log the actual key string).
   - rotate(): advance index by 1 (modulo length) for load spreading.

3. Retry logic in /api/chat:
   for attempt in range(len(keys)):
       key = key_manager.get_current_key()
       try:
           response = call_gemini(key, prompt)
           key_manager.rotate()  # spread load
           return response
       except quota_error:
           key_manager.mark_exhausted(key)
           continue  # NO sleep — instant rotation
   return graceful_error_response("All keys exhausted — rule-base still available.")

4. is_quota_error(e) helper: catches HTTP 429, HTTP 503 with "quota",
   ResourceExhausted, ServiceUnavailable, any str(e) containing
   "quota"/"rate limit"/"resource_exhausted"/"too many requests".

5. GET /api/chat/status → {gemini_available, keys_total, keys_available, keys_exhausted}.
   Never expose key strings or indexes in response.

Security: search entire codebase for any place a key string could be logged or returned. Remove all.
```

---

### FIX — Chat Scroll + Gemini Live Test

```
Test and fix two things on the AI Assistant page.

PART 1 — SCROLL FIX:
Inspect code. Confirm:
a) bottomRef on a div at bottom of messages list.
b) useEffect watching messages → scrollIntoView when messages change.
c) useEffect firing when isLoading turns ON (scroll to typing indicator).
d) Smart-scroll check before forcing scroll:
   const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
   if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });

Live tests:
A) Send message → user bubble visible at bottom. No manual scroll needed.
B) Gemini message → typing dots auto-scroll into view.
C) AI response arrives → chat scrolls to show full response.
D) 5 messages rapid → always at bottom, no manual scroll.
E) Scroll UP to read old message → new arrival does NOT force-jump back down.
Fix any failing test before continuing.

PART 2 — GEMINI LIVE TEST:
Find a question that DEFINITELY won't match any rule. Use exactly:
  "How does a TCP SYN flood attack differ from a UDP amplification attack
   in terms of network layer exploitation?"

Add temporary log lines (remove after test):
  print("[GEMINI TEST] Calling Gemini API with key index:", key_manager.current_index)
  print("[GEMINI TEST] Gemini responded successfully.")

Confirm:
A) Backend terminal shows GEMINI TEST log (not blocked by rule-base).
B) Frontend shows "✦ GEMINI" badge (not "⚡ RULE-BASE").
C) Response is a substantive cybersecurity answer, not a generic redirect.
D) Scroll works correctly with slow Gemini response.
Remove temp log lines after passing.

Report: scroll tests pass/fail, Gemini key index used, response time.
```

---

### FIX — Full System Audit

```
Perform a complete systematic audit. Check every section in order. Fix every issue found.

SECTION 1 — Foundation: env vars, pip install, npm install, startup logs (zero errors),
health endpoint, frontend "Backend connected."

SECTION 2 — ML: model files present (lightgbm/random_forest/xgboost .joblib), scaler,
label_encoder, features.json, smote_stats.json. Cascade loads on startup (not per request).
/api/predict returns all fields including severity, top_features with benign_baseline.

SECTION 3 — DB & Auth: app.db exists, both tables with severity column on Alert.
Default admin seeded once. JWT login works. Wrong password returns 401. JWT_SECRET from .env.
Protected endpoints return 401 without token (not 500).

SECTION 4 — All Endpoints:
POST /api/predict, GET /api/alerts (all filters), GET /api/alerts/stats (both groupings),
all 5 /api/simulate/* endpoints (all 10 scenarios tested), GET /api/models/metrics,
GET /api/data/smote-stats (before ≠ after), GET /api/data/benign-baseline (not null),
POST /api/chat (rule-based + Gemini + "explain last alert"),
GET /api/chat/status, GET/POST /api/reports/export (PDF opens, CSV has data),
WebSocket /ws/live (broadcasts during sim, heartbeat when idle, reconnect works).

SECTION 5 — Frontend-Backend: single axios instance, correct baseURL, JWT interceptor,
401 → redirect, no CORS errors, WebSocket URL correct, auto-reconnect, Connected indicator accurate.

SECTION 6 — Page by Page:
Intro (plays, skip works, replay works), Login (Enter key, error messages, demo button),
Live Detection (WS green in 2s, stat cards increment, map pulses, gauge needle correct,
feed color-coded, explain panel with real feature values),
Simulator (all 10 cards clickable, status increments, all 10 scenarios produce detections),
Alert History (filters work, pagination works, PDF/CSV export work),
Model Insights (no NaN/null values, matrices render, SMOTE charts differ),
AI Assistant (empty state, scroll works, Gemini badge correct, graceful error).

SECTION 7 — End-to-end journey (11 steps without stopping):
1. Intro 2. Login 3. WS green 4. Start DDoS sim 5. Map/gauge/feed live
6. Explain panel 7. Alert history + filter 8. Model Insights 9. AI "explain last alert"
10. Export PDF 11. Logout. Fix any failing step and re-run all 11.

SECTION 8 — Console cleanup: zero red errors, zero undefined/null render errors,
zero "Failed to fetch", zero WebSocket closed-state repeated errors.

Report: FIXED list / VERIFIED list / REQUIRES MANUAL ACTION / KNOWN LIMITATIONS.
```

---

<a name="mideval"></a>
## 8. Mid-Evaluation Checklist

Walk in able to demo all of these live without stopping:

- [ ] Intro animation plays; Skip and Replay both work.
- [ ] Login with bcrypt + JWT auth.
- [ ] Go to Simulator, select DDoS Attack, rate 15, duration 60s. Click INITIATE.
- [ ] Button shows ABORT + progress bar filling. Status shows TRANSMITTING.
- [ ] Switch to Live Detection — Attack Map pulses red, Gauge climbs to UNDER ATTACK.
- [ ] Live feed fills with detections, all severity-coded correctly.
- [ ] Click one detection — Explain panel opens with feature comparison bars + Attack DNA radar.
- [ ] Show Tier 1 catch vs one that escalated to Tier 3 (run Infiltration or Heartbleed).
- [ ] Alert History — all detections saved, filters work, PDF export downloads and opens.
- [ ] Model Insights — 3-model table, confusion matrices, SMOTE before/after, corrected rationale.
- [ ] AI Assistant — ask a cybersecurity question (rule-based badge), ask a complex question (Gemini badge), ask "explain the last alert" (specific alert response).
- [ ] README exists. Whole project runs with two commands.

**Panel talking points (know these before the defense):**
- Why a cascade? Speed vs accuracy trade-off — same reason real production IDS systems use ensemble approaches.
- Why LightGBM at Tier 1? Highest accuracy (99.472%), not speed — addresses the highest volume of confident detections.
- How did you handle dataset bugs? 288,602 corrupt rows found and dropped, 0x96 byte encoding failure fixed with latin-1 fallback.
- Why SMOTE? CIC-IDS2017 is severely imbalanced — Heartbleed has tiny sample count. SMOTE on training set only.
- Why detection uses CSV, simulation uses PCAP? Different jobs: CSV provides clean feature vectors for training; PCAPs contain raw packet captures for traffic replay (post-mid).
- Why simulated-streaming at mid? Proposal allows "batch or simulated streaming form." Real PCAP replay in isolation is Phase 8 (post-mid) — on track for final.
- Is this software? Yes — it is a web-based software system. Web-based and desktop are both software; web gives real-time visualization that desktop toolkits cannot match.
- Why login if proposal didn't mention it? Added as a realistic enhancement — real SOC tools require sign-in. Adds role-based access and audit trail beyond what the proposal required.

---

<a name="postmid"></a>
## 9. POST-MID-EVALUATION PHASES

---

### PHASE 7 — PCAP Processing Layer

**Pre-prompt:**
```
NEW capability. We now process raw PCAP files. Implements the proposal's Traffic Processing
Layer from Figure 3.1 (PCAP Parsing → Flow Generation → Feature Extraction). Extracted
features MUST match the feature set in /data/cache/features.json so existing models can classify them.
Start with a small slice — do not process all PCAPs at once (they are tens of GB).
```

```
Build backend/app/pcap/ — a PCAP-to-flow pipeline.

- Read a .pcap (scapy or pyshark), aggregate packets into bidirectional flows.
- Compute flow features matching features.json: flow duration, fwd/bwd packet counts,
  packet length stats, flow bytes/sec, IAT stats, flag counts.
- Output a DataFrame aligned to model features → run through CascadeDetector.detect().
- CLI: process a pcap path (--max-packets flag) and print detections.

Start with a small slice of Friday-WorkingHours.pcap (DDoS + PortScan).
Document any feature approximated vs original CICFlowMeter definition.
```

---

### PHASE 8 — Real PCAP Replay in Isolated Environment

**Pre-prompt:**
```
Fulfills the proposal's committed isolated environment (VirtualBox/VMware + Wireshark/tcpdump
from Resource Table 4.2). Replay recorded PCAP over a virtual interface inside an ISOLATED
setup, CAPTURE it, extract flows (Phase 7), feed to cascade live. NOT live attacks.
Scope to 1-2 attack types and a short slice. Key: it cannot touch the real network.
```

```
Build real-traffic replay in an isolated environment.

- Setup: Docker bridge network OR two-VM VirtualBox/VMware guide, fully isolated from host.
- Replay a PCAP slice over a virtual interface (tcpreplay), capture receiving side
  (tcpdump/pyshark), feed through Phase 7 pipeline → CascadeDetector → log + WebSocket.
- Add "Live Replay" mode on Simulator page (separate from CSV simulated-streaming).
- POST /api/simulate/replay/start, POST /api/simulate/replay/stop.
- Document exact setup steps and safety boundary (why traffic cannot escape).
Scope: Friday DDoS slice + one PortScan slice.
```

---

### PHASE 9 — BCCC Dataset Upgrade + Model Hardening

**Pre-prompt:**
```
Execute the Detection-Layer upgrade from the Dataset Justification document: retrain on
BCCC-CIC-IDS2017 (2024 cleaned) vs original-2017 baseline. Same cascade architecture.
I will place BCCC CSVs in /data/raw/bccc.
```

```
Upgrade the detection side for final evaluation.

- Extend pipeline to load BCCC-CIC-IDS2017 CSVs (map columns to our schema, document differences).
- Retrain the full cascade on BCCC. Keep original-2017 models for comparison.
- Train on the FULL feature set and compare vs top-30 reduced set.
- Hyperparameter tuning (RandomizedSearchCV or Optuna) per model + k-fold cross-validation.
- Produce before-vs-after comparison (original-2017 baseline vs BCCC) for dashboard and thesis.
- Add Google Sign-In (OAuth) alongside manual signup:
  POST /api/auth/google: verify Google token server-side, create/find user account.
  Never see or store the user's Google password.
  Frontend: "Continue with Google" button on Login page using Google Identity Services.

Summarize exactly what improved and by how much.
```

---

### PHASE 10 — Production Hardening & Testing

```
Harden the application and add automated tests.

- Pydantic validation everywhere, consistent error handling, request logging, rate limiting.
- Role-based access (admin vs analyst) + Audit log table (who did what, when).
- pytest suite covering data pipeline, cascade logic, key API endpoints.
- GitHub Actions workflow running tests on push.

List tests written and how to run them.
```

---

### PHASE 11 — Packaging & Deployment

```
Make the project easy to run and distribute for the final demo.

- Production-build React app, serve from FastAPI as static files (single-command demo).
- docker-compose (backend + frontend) running with one command. Document it.
- Optional: Electron wrapper OR PyInstaller build with simple installer for offline demo.
```

---

### PHASE 12 — Documentation & Thesis

```
Produce final documentation deliverables.

- Architecture diagrams (system, data flow, cascade, isolated-env replay) as images.
- API documentation (FastAPI /docs + written summary).
- User manual (PDF) with screenshots of each feature.
- 20-30 test cases (input → expected output) with results.
- Help draft thesis chapters: methodology, implementation, results/evaluation, conclusion.
  (Literature review with 14-20 papers already done in the proposal.)
- Final demo video script (~5 minutes, all features).
```

---

<a name="viva"></a>
## 10. Important Decisions & Viva Talking Points

| Question an examiner might ask | Your answer |
|---|---|
| Why a 3-tier cascade? | Production IDS systems use ensemble approaches for the same reason — speed at Tier 1 for easy cases, accuracy at deeper tiers for hard ones. We empirically validated this split. |
| Why is LightGBM Tier 1 if it's the slowest? | LightGBM is Tier 1 for its highest accuracy (99.472%), not speed. It resolves the majority of clear-cut detections confidently. Random Forest at Tier 2 is actually the fastest (2.88 μs). |
| Why does T-2 and T-3 show 0? | Correct behavior. LightGBM catches common attacks (DDoS, DoS, PortScan) at >99% confidence. T-2 and T-3 activate for rare/ambiguous attacks — run Infiltration or Heartbleed scenarios to observe escalation. |
| Why is the Macro F1 so much lower than accuracy? | Because CIC-IDS2017 is imbalanced. Rare classes like Heartbleed pull the macro average down even when the model classifies them correctly. SMOTE improved this — we show the before/after. |
| Is your simulation real hacking? | No. We replay pre-recorded real attack traffic from CIC-IDS2017 through our AI in a controlled offline environment. No real attack tools run. No real network is targeted. The proposal explicitly scopes out live pentest. |
| Why web-based software and not a desktop app? | Web-based is how real SOC dashboards are built. Real-time WebSocket visualization is dramatically smoother in a browser. The architecture (separate frontend + backend) mirrors real production systems. |
| Why did you use CIC-IDS2017 when there's a 2024 version? | The 2017 dataset is the only version with raw PCAPs for our simulation layer. BCCC-CIC-IDS2017 (2024) is our post-mid upgrade for the detection layer — specifically planned for a measurable accuracy improvement story at final eval. |
| Why train only on CSVs and not PCAPs? | PCAPs are raw packet captures. Training requires structured feature vectors. The CIC researchers pre-extracted those features into the CSV format using CICFlowMeter. Training on PCAPs directly would require re-implementing their feature extraction pipeline. |
| Did your proposal require a login system? | No — we added login as a realistic enhancement. Real SOC tools always require authentication. It adds role-based access and an audit trail beyond the proposal's requirements. |
| What is SENTINEL AI? | Our AI assistant's brand name. It uses a rule-based layer for common questions (instant, no API call) and Google Gemini API for complex queries. 10 free-tier API keys rotate silently so users never see a quota error. |

---

**Commit after every phase.** Your git history is evidence of work.
**Test on the actual presentation machine**, not just your dev laptop.
**When Claude Code builds something, ask it to explain it** — you must defend every decision in the viva.

---
*FYP Build Guide v3 — Last updated: July 2026*
*Covers all development from project scaffold through mid-evaluation, plus post-mid roadmap.*
