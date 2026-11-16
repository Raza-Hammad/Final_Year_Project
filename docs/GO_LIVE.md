# Cascadyx — Go Live for Free (Render free web service)

Goal: Cascadyx on a public HTTPS URL, **$0**, no credit card, name contains **cascadyx**
(e.g. `https://cascadyx.onrender.com`). One container serves the React UI + `/api` + `/ws`
(same origin), so there is no CORS setup.

> The paid / custom-domain path (Fly.io + a bought domain) is in [`DEPLOY.md`](DEPLOY.md).
> This page is the free path. For honest viva wording see
> [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

---

## 0) Why Render free (and what the catch is)

| Platform | RAM / CPU | Card? | Name | Verdict |
|----------|-----------|-------|------|---------|
| **Render free web service** | 512 MB / 0.1 CPU | No | `cascadyx.onrender.com` | **Primary.** GitHub auto-deploy, WebSockets, free HTTPS. Measured app footprint with the slim bundle ≈ **285 MB** (Windows) → fits, with little headroom. |
| Hugging Face Spaces (Docker) | 16 GB / 2 vCPU | No | `cascadyx-app.hf.space` | **Fallback** if Render runs out of memory (§8). Far more RAM/CPU, but a less “normal” URL and a manual push flow. |
| Fly.io | — | Yes | `cascadyx.fly.dev` | Not free for new accounts (card + pay-as-you-go). Config exists for the paid path only. |

**Free-tier realities (tell the examiner):**

1. **Sleeps after ~15 min idle**; first request afterwards takes ~30–60 s (models reload).
2. **Disk is ephemeral.** SQLite (`app.db`) is wiped on every sleep/restart/redeploy:
   registered users, alerts, chat history, reviews vanish; `admin` is re-seeded from
   `ADMIN_SEED_PASSWORD`; Google users are simply re-created on next login. Sessions
   survive because `JWT_SECRET` is stable, but their user row is gone → just log in again.
3. **0.1 CPU**: the dev machine measures ~44 flows/s; expect far less here. Use simulator
   rates ≤ 5 flows/s and **one simulation at a time**.
4. Free instances get ~750 h/month — enough for one always-on service.

Optional “stay awake”: a free monitor (e.g. UptimeRobot, 5-min interval) hitting
`/api/health` avoids the cold start, but the DB still resets on every redeploy.

---

## 1) What was prepared in the repo

| File | Purpose |
|------|---------|
| `Dockerfile.render` | Free-tier image: builds UI, installs pinned ML libs, copies `deploy/data`, non-root user, honours `$PORT`, proxy headers. |
| `render.yaml` | Render Blueprint: free plan, health check `/api/health`, env vars (secrets asked in dashboard). |
| `deploy/data/**` | **Slim runtime bundle (~23 MB)**: production models, scaler, encoder, metrics, demo flows, a per-class-capped `processed_data.npz`, Quick Lab captures. Committed on purpose — `data/` is gitignored, so without it GitHub-built hosts have **no models**. |
| `scripts/build_deploy_bundle.py` | Rebuilds `deploy/data` from `data/` (re-run after retraining). |
| `backend/constraints-deploy.txt` | Exact numpy/scikit-learn/lightgbm/xgboost pins that match the pickled models. |
| `backend/app/config.py` | `PUBLIC_BASE_URL` auto-detected from `RENDER_EXTERNAL_URL` / `SPACE_HOST`; new `validate_public_mode()`. |
| `backend/app/main.py` | Calls `validate_public_mode()` at boot; admin password never logged when `PUBLIC_MODE=1`. |
| `.gitignore` | Covers `.env`, `backend/.env`, `backend/env`, `**/.env`, `.env.*` (not `.env.example`), `*.db`, logs; re-allows `deploy/data/**`. |

Hardening in `PUBLIC_MODE=1` (set by the image): API docs hidden, security headers + HSTS,
multipart PCAP upload disabled, **refuses to start** if `JWT_SECRET` < 32 chars or
`ADMIN_SEED_PASSWORD` < 12 chars. Desktop-only gate stays (UI blocks viewports < 1024 px).
Rate limits (`slowapi`) stay on; `--proxy-headers` makes them per real client IP.

---

## 2) Step-by-step for you (PSS)

### Step 1 — Push the code to GitHub (5 min)

The repo's `origin` is `https://github.com/Raza-Hammad/Final_Year_Project.git`. Render must be
able to read it: use the GitHub account that owns it, **or** create your own repo and
`git remote set-url origin https://github.com/<you>/cascadyx.git`.

```powershell
cd D:\Final_Year_Project
.\backend\venv\Scripts\python.exe scripts\build_deploy_bundle.py   # only if models changed
git rm --cached backend/uvicorn.log          # log file was tracked by mistake
git add -A
git status                                   # CHECK: no .env, no *.db, no data/ (only deploy/data)
git commit -m "Cascadyx: free-tier deploy (Render)"
git push -u origin HEAD
```

`git status` must **not** list `backend/.env`, `backend/env` or any `.db`. If it does, stop.

### Step 2 — Rotate any secret that ever touched the repo or chat

If `backend/env` / `.env` real keys were ever pasted anywhere public, rotate them first
(Nebius key, Google client secret).

### Step 3 — Render account + service (10 min)

1. Go to <https://render.com> → **Get Started** → *Sign up with GitHub* (no card).
2. Dashboard → **New +** → **Blueprint** → connect/select the repo → branch (`main`).
3. Render reads `render.yaml`. If the name `cascadyx` is taken it will say so — edit
   `name:` in `render.yaml` (candidates below), commit, push, retry.
4. When prompted, fill in:
   - `ADMIN_SEED_PASSWORD` = `<a strong password, >= 12 chars>` (this is your `admin` login)
   - (`JWT_SECRET` is auto-generated by Render — leave it.)
5. **Apply**. First build takes ~8–15 min (UI build + ML wheels).
6. If Blueprint creation asks for a card, use the manual route instead:
   **New + → Web Service → Build and deploy from a Git repository →** repo →
   *Language*: **Docker** → *Dockerfile Path*: `./Dockerfile.render` → *Instance type*: **Free** →
   *Health Check Path*: `/api/health` → add the env vars from §3 → **Create Web Service**.

### Step 4 — Confirm the URL

Service page shows `https://<name>.onrender.com`. Open `https://<name>.onrender.com/api/health` →
expect `{"status":"ok", ...}` (HTTP 200). `503` + `detector_loaded:false` means the models did
not load (check Logs).

### Step 5 — Google Sign-In (optional, 10 min)

Google Cloud Console → *APIs & Services* → **Credentials** → your **Web application** OAuth client:

- **Authorized JavaScript origins:** `https://<name>.onrender.com` (scheme + host only; no slash)
- **Authorized redirect URIs:** `https://<name>.onrender.com/api/auth/google/callback`
- Keep your existing `http://localhost:5173`, `http://127.0.0.1:8000` entries for local work.
- **OAuth consent screen → Publishing status → “In production”**. In *Testing* mode only
  listed test users (max 100) can sign in — not “anyone”. Scopes used are only
  `openid email profile`, which need no Google verification.

Then in Render → service → **Environment** → add:

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | `<xxxx>.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `<paste from Console — never commit>` |

`GOOGLE_REDIRECT_URI` is derived automatically from the Render URL. Save → Render redeploys.
Console changes can take a few minutes to propagate. Troubleshooting: [`GOOGLE_OAUTH.md`](GOOGLE_OAUTH.md).

### Step 6 — AI assistant (optional)

Add `NEBIUS_API_KEY=<your key>` in **Environment**. Without it chat uses rule-based answers.
`AI_QUERY_LIMIT` (default 10 lifetime questions per user) caps spend.

---

## 3) Environment variables (names only — never commit values)

| Variable | Required | Value / note |
|----------|----------|--------------|
| `PUBLIC_MODE` | Yes | `1` (set by Dockerfile + `render.yaml`) |
| `JWT_SECRET` | Yes | ≥ 32 random chars. Render generates it; manual route: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_SEED_PASSWORD` | Yes | ≥ 12 chars; password of user `admin` |
| `PORT` | Auto | Injected by Render; Dockerfile falls back to 10000 |
| `RENDER_EXTERNAL_URL` | Auto | Injected by Render → used as `PUBLIC_BASE_URL` (CORS + Google) |
| `PUBLIC_BASE_URL` | Custom domain only | `https://your.domain` (overrides auto-detection) |
| `ACCESS_TOKEN_EXPIRE_DAYS` | Recommended | `7` (code default is 365 for local use) |
| `OMP_NUM_THREADS` | Recommended | `1` |
| `AI_QUERY_LIMIT` | Optional | default `10` |
| `LAB_SENSOR_WATCH` | Optional | `0` |
| `NEBIUS_API_KEY` / `NEBIUS_BASE_URL` / `NEBIUS_MODEL` | Optional | AI chat |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google Sign-In |
| `GOOGLE_REDIRECT_URI` / `GOOGLE_FRONTEND_ORIGINS` / `CORS_ORIGINS` | Optional | Only with extra hosts / custom domain |
| `DATABASE_URL`, `DATA_CACHE_DIR`, `DATA_RAW_DIR` | Leave unset | Image layout already matches defaults |

---

## 4) Free URL options containing “cascadyx”

| URL | How | Notes |
|-----|-----|-------|
| `https://cascadyx.onrender.com` | Service name `cascadyx` | First come, first served. |
| `https://cascadyx-fyp.onrender.com` | name `cascadyx-fyp` | Good fallback. |
| `https://cascadyx-app.onrender.com` / `cascadyx-demo` / `cascadyx-ids` | other names | If the name is taken Render appends a random suffix (`cascadyx-ab12`) — still contains the project name. |
| `https://cascadyx-app.hf.space` | Hugging Face: create **organisation** `cascadyx`, Space `app` | Fallback host (§8). A personal account gives `<user>-cascadyx.hf.space`. |

Always spell it **Cascadyx** (not “cascaadyx”) — service names are lowercase `cascadyx`.

### Free custom domain?

Honest answer: a real `cascadyx.com` is **not free** (~US$10–15/yr). Free-ish routes:

- **Subdomain services** (`cascadyx.is-a.dev`, `cascadyx.eu.org`): free but need an approval
  request/PR, can be rejected, and rules change — verify before relying on them. Then add
  it in Render → *Settings → Custom Domains* (free TLS) and set `PUBLIC_BASE_URL` + the same
  origin/redirect URIs in Google Console.
- **GitHub Student Developer Pack** (if you qualify): usually a **free 1-year** domain
  (e.g. `.me`/`.tech`) — free for a year, then paid.
- Dynamic-DNS names like `cascadyx.duckdns.org` do **not** work (no CNAME to Render).

If you add a custom domain, you must update Google origins/redirects to that exact host.

---

## 5) Post-go-live smoke checklist

Wait for cold start (first load can take ~60 s), then:

- [ ] `GET /api/health` → 200, `detector_loaded: true`, `ui_built: true`, `public_mode: true`
- [ ] `GET /docs` → **404** (docs hidden in public mode)
- [ ] Homepage loads on a desktop browser; on a phone / narrow window the **desktop gate** appears
- [ ] Register a new analyst, log in (password flow works)
- [ ] Log in as `admin` with `ADMIN_SEED_PASSWORD`; **Audit logs** page opens (admin-only)
- [ ] Simulator: start `ddos` at **rate 5**, 10 s → live feed updates over WebSocket (no WS error)
- [ ] Attack Lab / Quick Lab replay of a bundled capture works
- [ ] Model Insights page shows metrics
- [ ] PCAP **upload** returns 403 “disabled on the public deployment”
- [ ] Google Sign-In works from the Render URL (if configured)
- [ ] AI chat answers (rule-based if no Nebius key)
- [ ] Render **Logs/Metrics**: memory stays < 512 MB during a simulation; no “Out of memory”
- [ ] `git ls-files | findstr /i "\.env \.db"` shows nothing secret

---

## 6) Capacity honesty (viva wording)

- Single process, single SQLite file, ~40 flows/s on a dev laptop; **less** on 0.1 CPU. A class
  demo of a few simultaneous viewers is fine; this is not a scaled SOC product.
- One simulation at a time; others watch or use History.
- Registration is open (anyone gets an *analyst* role). Rate limits: login 5/min, register
  10/min, simulate 20/min, etc. Admin-only: audit logs. Nothing here launches real attacks.
- The slim bundle has ~30k test flows (≤ 3000/class), not the full 565k, so scenario replays
  repeat samples more often; trained models are identical to local.
- DB is ephemeral (see §0). For persistence you would need a paid disk (Render/Fly volume) or
  an external free Postgres (not implemented/tested here).

---

## 7) Updating / rolling back

- Push to the connected branch → Render auto-redeploys (DB resets).
- Retrained models? `python scripts/build_deploy_bundle.py`, commit `deploy/`, push.
- Bad deploy: Render → *Events* → **Rollback** to a previous deploy.
- Rotate `JWT_SECRET`: edit in Environment (everyone must log in again).

---

## 8) Fallback: Hugging Face Spaces (only if Render shows “Out of memory”)

1. <https://huggingface.co> → sign up (no card) → **New → Organization** `cascadyx` → **New Space**:
   owner `cascadyx`, name `app`, SDK **Docker → Blank**, visibility Public.
2. Add a `README.md` at the Space root with this front-matter, then push the repo contents there
   (use `Dockerfile.render` renamed to `Dockerfile`; no file in the bundle exceeds the 10 MB non-LFS limit):

   ```yaml
   ---
   title: Cascadyx
   sdk: docker
   app_port: 7860
   ---
   ```
3. Space → **Settings → Variables and secrets**: Variable `PORT=7860`, `PUBLIC_MODE=1`; Secrets
   `JWT_SECRET`, `ADMIN_SEED_PASSWORD` (+ optional `GOOGLE_*`, `NEBIUS_API_KEY`).
4. URL: `https://cascadyx-app.hf.space` (the app auto-detects it via `SPACE_HOST`). Add that exact
   origin + `/api/auth/google/callback` to Google Console. Use the direct `.hf.space` URL, not the
   huggingface.co wrapper page (iframe).
5. Spaces also sleep when idle and have an ephemeral disk. This path is less tested than Render.

---

## 9) Not tested here

No Docker daemon and no Render/HF account were available on the authoring machine, so the image
itself was **not built or deployed**. Verified locally instead: the slim bundle boots the real app
(`/api/health` OK, login, simulator run, metrics API, `/docs` = 404 with `PUBLIC_MODE=1`), UI
`tsc` + `vite build` pass, and the backend tests for the new validation pass. Watch the first Render
build log; the most likely failure is a base-image/wheel version mismatch (pins in
`backend/constraints-deploy.txt`, base `python:3.14-slim` in `Dockerfile.render`).
