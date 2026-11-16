# Cascadyx

**Cascadyx** — Cybersecurity Threat Simulator Powered by AI (Final Year Project).

Replays CIC-IDS2017 traffic (CSV simulator and/or PCAP), classifies flows with a 3-tier ML cascade (LightGBM → Random Forest → XGBoost), and visualizes results in a real-time Living Lattice dashboard.

Production models: **mid baseline** in `data/cache` (gitignored). Hardened variants are experimental and **not** promoted for demos.

Honest engineering limits: [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)  
Isolated VirtualBox replay: [`docs/ISOLATED_REPLAY.md`](docs/ISOLATED_REPLAY.md)  
**5–7 min demo script:** [`docs/DEMO.md`](docs/DEMO.md)  
**Free public URL (Render, `cascadyx.onrender.com`):** [`docs/GO_LIVE.md`](docs/GO_LIVE.md) · reference & limits: [`docs/DEPLOY.md`](docs/DEPLOY.md) (Fly.io is a paid, optional appendix only)

### Phase 8 — docs / thesis / viva

| Doc | Purpose |
|-----|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System, data-flow, cascade, UI diagrams (Mermaid) |
| [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) | Feature walkthrough + screenshot placeholders |
| [`docs/TEST_CASES.md`](docs/TEST_CASES.md) | 50 test cases aligned to pytest + manual demos |
| [`docs/THESIS_DRAFT.md`](docs/THESIS_DRAFT.md) | Methodology → conclusion draft (honest metrics) |
| [`docs/VIVA_SHEET.md`](docs/VIVA_SHEET.md) | Examiner talking points |
| [`docs/API_SUMMARY.md`](docs/API_SUMMARY.md) | Key endpoints + link to FastAPI `/docs` |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Public HTTPS deploy + capacity honesty for viva |

## Project Structure

```text
Final_Year_Project/
├── backend/                  # FastAPI app (API + optional static UI)
├── frontend/                 # React + Vite + TypeScript
├── data/                     # raw CIC datasets + cache (mostly gitignored)
├── docs/                     # Demo, architecture, thesis/viva, API, manuals
├── scripts/run_demo.ps1      # One-command demo (Windows)
├── CLAUDE.md                 # Dev commands
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+ (npm)
- Git
- Trained mid-baseline artifacts under `data/cache` (models, scaler, encoder, features)
- **Docker is not required** (not used as a demo blocker on this host)

---

## One-command demo (recommended)

Serves the **production React build** from FastAPI on a single origin (`http://127.0.0.1:8000`). `/api/*` and `/ws/live` stay FastAPI routes.

```powershell
# From repo root (PowerShell)
.\scripts\run_demo.ps1
```

Open **http://127.0.0.1:8000/** — follow [`docs/DEMO.md`](docs/DEMO.md).

Manual equivalent:

```powershell
cd frontend
npm install
npm run build
cd ..\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If `frontend/dist` is missing, `/` returns API JSON with a build hint instead of the SPA.

---

## Mode A — Mid: CSV simulator (dual-process hot reload)

Best for day-to-day UI/API work. No PCAP or VirtualBox required.

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # optional: NEBIUS_API_KEY, JWT_SECRET
uvicorn app.main:app --reload --port 8000
```

Health: http://127.0.0.1:8000/api/health

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

UI: http://localhost:5173 (Vite proxies `/api` → `:8000`; WebSocket → `:8000`).

### Demo flow

1. Login (seeded admin appears in backend logs on first DB create).
2. Simulator → start a scenario (e.g. DDoS / Port Scan) at a modest rate.
3. Watch Live Detection + explain an alert; stop when done.

---

## Mode B — Final: PCAP analyze + isolated Live Replay

Proposal-aligned path using **recorded** CIC traffic only (never live attacks).

| Path | What you need | How |
|------|----------------|-----|
| **PCAP analyze** | Small `.pcap` / `.pcapng` under `data/raw/` | `POST /api/pcap/analyze` or OpenAPI `/docs` — keep `max_packets` small |
| **Live Replay** | Capture copied to `data/raw/captures/` after VirtualBox `tcpreplay` lab | Simulator → Live Replay, or `POST /api/simulate/replay/start` |

VirtualBox two-VM setup is **external** (host tools): step-by-step in [`docs/ISOLATED_REPLAY.md`](docs/ISOLATED_REPLAY.md). You can still demo Mode A without VMs.

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

## CORS / routing notes

- Dev: CORS allows Vite (`:5173`) and same-origin (`:8000`).
- Demo: SPA + API share `:8000` — relative `/api` calls and same-host `/ws/live` (no CORS friction).
- Static mount never owns `/api`, `/ws`, `/docs`, or `/openapi.json`.

---

## Useful commands

| Task | Command |
|------|---------|
| Backend tests | `cd backend; pytest` |
| Seed demo alerts | `cd backend; python -m app.ml.generate_test_alerts` (server already running) |
| Frontend production build | `cd frontend; npm run build` |
| Health | `curl http://127.0.0.1:8000/api/health` |

More detail: [`CLAUDE.md`](CLAUDE.md).
