# Cascadyx Demo Checklist (≈5–7 minutes)

**Product:** Cascadyx — Cybersecurity Threat Simulator Powered by AI  
**Goal:** One browser tab, one FastAPI process — UI + `/api` + `/ws` on port **8000**.

Production models are the **mid baseline** in `data/cache` (gitignored). Do **not** switch to hardened/experimental models for the viva demo.

---

## 0) One-command start (preferred)

From the repo root in **PowerShell**:

```powershell
.\scripts\run_demo.ps1
```

Then open **http://127.0.0.1:8000/**  
Health: **http://127.0.0.1:8000/api/health**

If `frontend/dist` is missing, the script runs `npm run build` first.  
If `backend\venv` is missing, create it once (see [README](../README.md)).

Manual equivalent:

```powershell
cd frontend
npm install
npm run build
cd ..\backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---

## 1) Login (≈30 s)

1. Open http://127.0.0.1:8000/
2. Sign in with the seeded admin account (on first DB create the password comes from `ADMIN_SEED_PASSWORD`, or a random one printed once in the server console), or your local analyst account. New users join with **Google Sign-In**.
3. Confirm the Living Lattice / dashboard loads and the live socket shows connected (no CORS errors in DevTools).

---

## 2) Mid path — CSV scenario simulator (≈2–3 min)

This is the reliable mid-evaluation path (no VirtualBox, no PCAP files required beyond the prepared CSV cache).

1. Open **Simulator**.
2. Pick a high-signal scenario (e.g. **DDoS** or **Port Scan**) — read the **What you will learn** story under the attack profile.
3. Rate ≈ **5–10** flows/s, short duration (30–60 s) or stop manually.
4. **Start** → read **What you're seeing now** on Simulator; open **Live Detection** for lattice + feed (same coach panel there).
5. After first alerts, optional tip: **Explain** → **History** → **AI Assistant** (one clear question if quota is shown).
6. Open an alert → **Explain** (XAI). AI Assistant remains optional; rule-based answers still work without cloud keys.
7. **Stop** the simulator.

---

## 3a) Attack Lab (≈2 min)

1. Open **Attack Lab**. **Quick Lab:** pick a scenario → **Run lab session** and watch the theater (Attacker → Victim, Sensor tapping). Say plainly that this is a *captured* lab session, not an attack you launched.
2. **Live Lab** is shown as *Coming soon* in the UI (`LIVE_LAB_ENABLED` in `AttackLabPage.tsx`); Quick Lab is the working path for the demo.
3. Scenarios without a validated recipe are tagged **Experimental**; verdicts are shown exactly as the cascade returns them.

## 3b) Cascade demo traffic (≈1 min)

Model Insights → **AI Cascade Machine** → **Demo traffic** → **Play** (or **Step**). One loop shows Tier 1, Tier 2 and Tier 3 exits with real scores against the 85% gate. It never touches Alert History.

## 3) Legacy path — PCAP analyze (≈2–3 min, developer-facing)

Requires a small CIC PCAP under `data/raw/` (never point the API at a full multi-GB day capture).

### A) Batch analyze (no VirtualBox)

1. Admin session.
2. Call analyze (UI or OpenAPI `/docs`):

```powershell
# After logging in via UI, use /docs "Authorize" with the same JWT,
# or curl with a token from POST /api/auth/login
```

Example JSON body for `POST /api/pcap/analyze`:

```json
{
  "pcap_path": "PCAPs/your-small-slice.pcap",
  "max_packets": 200,
  "persist_alerts": true,
  "broadcast": true
}
```

3. Confirm alerts appear and WebSocket events fire.

### B) Isolated Live Replay (VirtualBox capture)

1. Follow [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md) offline prep (two VMs, `tcpreplay`, copy capture to `data/raw/captures/`). See **How students learn with Live Replay** in that doc for the classroom coach flow.
2. In Simulator → **Live Replay**, read the learning blurb + safety note; point at that capture (or `POST /api/simulate/replay/start`).
3. Watch streamed classifications on Live Detection; if the capture is mostly BENIGN, say so honestly, then optionally run a CSV attack scenario for louder alerts.
4. Stop when enough of the pipeline story is visible.

Cascadyx **never** launches live attack tools — only recorded CIC traffic.

---

## 4) Wrap-up (≈1 min)

1. **Alert History** — filter / page.
2. Optional admin **export** PDF or CSV.
3. **Model Insights** — mid baseline metrics; note Web-Attack caveats in [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
4. Stop the server with **Ctrl+C**.

---

## Dual-process mid-dev (optional)

Use only when iterating on React hot-reload:

| Process | Command | URL |
|---------|---------|-----|
| Backend | `cd backend; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000` | http://127.0.0.1:8000/api/health |
| Frontend | `cd frontend; npm run dev` | http://localhost:5173 |

Vite proxies `/api` to `:8000`; WebSocket still targets `:8000`.

---

## Quick failure checklist

| Symptom | Check |
|---------|--------|
| `/` is JSON, not UI | Run `npm run build` in `frontend/`, restart uvicorn |
| 503 on predict/simulate | Models missing under `data/cache` |
| WS disconnected | Same host as UI; token present; backend on `:8000` |
| PCAP 400 path error | Path must resolve under `data/raw/` |
| Docker | **Not required** — VirtualBox path is external; see ISOLATED_REPLAY |
