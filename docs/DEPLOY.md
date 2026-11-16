# Cascadyx — Public Deploy Guide (FREE: Render free web service)

**Requirement: everything must cost nothing.** The primary path is therefore the **Render.com free Web Service**
with the free subdomain **`https://cascadyx.onrender.com`** (no domain purchase, no credit card asked by this guide).
Click-by-click steps: [`GO_LIVE.md`](GO_LIVE.md). This page is the technical reference + honest limits +
alternatives. Cascadyx is an FYP demo stack, **not** a production IDS — see [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).
Local demo: [`DEMO.md`](DEMO.md).

> Nothing here deploys itself and no cloud credentials are stored in the repo.
> Paid options (Fly.io, VPS, custom domain) appear **only** in clearly-labelled appendices.

---

## 0) The chosen path

| Piece | Choice | Cost |
|-------|--------|------|
| Hosting | **Render free Web Service** (Docker, 512 MB RAM, 0.1 CPU, Singapore region) | **$0** |
| URL / TLS | `https://cascadyx.onrender.com` (auto HTTPS) — only if the name `cascadyx` is still free on Render, otherwise Render shows e.g. `cascadyx-ab12.onrender.com`; use whatever it shows | **$0** |
| Source | GitHub repo → Render builds from it (auto-deploy on push) | **$0** |
| Packaging | `render.yaml` (Blueprint) + `Dockerfile.render` | — |
| Models | Slim committed bundle `deploy/data/` (~23 MB) built by `scripts/build_deploy_bundle.py` | — |
| Database | SQLite inside the container — **ephemeral** (see §1) | **$0** |
| Sign-in | Username/password + Google (add the Render URL in Google Console, free) | **$0** |
| AI chat | Nebius key you already have (optional; falls back to rule-based answers) | existing key |

**Why Render free:** supports Docker + WebSockets + free HTTPS subdomain, deploys straight from GitHub, no card
needed for free web services (verify on the sign-up page), service name = URL, so `cascadyx` appears in the address.

**Architecture:**

```
Browser ──HTTPS/WSS──> Render proxy (TLS, cascadyx.onrender.com) ──> uvicorn :$PORT (1 worker)
                                                          ├─ /            React build (frontend/dist, baked in image)
                                                          ├─ /api/*       FastAPI
                                                          ├─ /ws/live     WebSocket
                                                          ├─ /app/data/cache   models + slim npz (from deploy/data, baked in)
                                                          └─ /app/data/cache/app.db   SQLite (EPHEMERAL)
```

Same-origin ⇒ no CORS pain. On Render the public URL is picked up automatically from Render's
`RENDER_EXTERNAL_URL` (CORS allow-list + Google redirect URI); `PUBLIC_BASE_URL` / `CORS_ORIGINS` are only
overrides.

### Why a slim bundle instead of `data/`?

`data/` is gitignored (52 GB raw dataset, 266 MB `processed_data.npz`, binary models). Render builds from
GitHub, so it would get **no models**. `scripts/build_deploy_bundle.py` copies only what the running app reads
into `deploy/data/` (production mid-baseline models, scaler/encoder, metrics JSON, demo flows, a **per-class
capped** `X_test` sample ≈ 1 MB, and the ~6 MB Quick Lab captures) and `.gitignore` re-allows `deploy/`.
Re-run it (and commit) after retraining. Not shipped: the experimental *hardened* model files, the
training arrays, the full test split, any `app.db`, any `.env`.
Local sanity check performed with this bundle + `PUBLIC_MODE=1`: `/api/health` ok, `/api/ready` →
`detector_loaded: true`, `/docs` → 404; detector RSS ≈ 280 MB on the dev machine.

---

## 1) Honest limits of the free tier

| Limit | What actually happens | What to say / do |
|-------|----------------------|------------------|
| **Sleep (cold start)** | A free web service spins down after **~15 min without inbound traffic**. The next request restarts the container: image start + loading 3 models on a **0.1 CPU** share ⇒ expect **~1–2 minutes** of "loading" before the site responds. | Open the URL ~3 min before a demo. Optional free keep-awake pinger (UptimeRobot / cron-job.org → `/api/health` every 5–10 min). |
| **No persistent disk** | Free instances have **no disk** (persistent disks are paid). The filesystem is rebuilt from the image on every **sleep→wake, redeploy, env-var change or Render restart**. | **SQLite data is lost each time**: registered analysts, alerts/history, chats, reviews, AI-query counters. |
| **What survives** | `admin` is re-seeded from `ADMIN_SEED_PASSWORD` on the empty DB. `JWT_SECRET` is stable (Render stores it), so old tokens stay *signed* validly, but their user rows are gone ⇒ users are logged out and must sign in again. Google sign-in simply re-creates the analyst account. | Acceptable for a viva/demo; do not store anything you need. |
| **If you add a keep-awake pinger** | Prevents the 15-min sleep wipe. One service 24/7 ≈ 744 of the **750 free instance-hours/month**, so it fits for one service. Redeploys/restarts still reset the DB. | Optional; check Render's current fair-use terms. |
| **512 MB RAM / 0.1 CPU** | App + models idle ≈ 280 MB on the dev PC; a running simulation adds some. Out-of-memory ⇒ Render restarts the instance (⇒ DB reset). Inference is slower than the ~44 flows/s measured locally. | Keep demos at **5–10 flows/s**; `OMP_NUM_THREADS=1` preset. Watch Render → Metrics. **Not load-tested on Render** (we haven't deployed). |
| **Build limits** | Free workspace has limited build minutes; first Docker build ≈ 8–15 min. | Avoid needless pushes (each push redeploys → DB reset). |
| **One shared simulator** | One uvicorn worker, one in-memory simulation for the whole site. UI shows a public notice (`PublicNotice.tsx`). | Ask users to run one at a time. Never scale beyond 1 instance. |
| **Rate limits** | `slowapi`: login 5/min, register 10/min, simulate/replay/pcap/chat/export/predict. `--proxy-headers` makes limits per real client IP behind Render's proxy. | — |
| **AI cap** | `AI_QUERY_LIMIT` Nebius questions per user (default 10); rule-based answers are free. | — |
| **Public-mode restrictions** | `/docs` + OpenAPI hidden, PCAP **uploads** 403, security headers, only the small recorded captures exist; no 52 GB CIC data, no Live Lab sensor VM. Simulator samples a capped test subset. | — |
| **JWT logout blacklist** | In memory; any restart clears it. Tokens last 7 days on Render. | — |

**Viva one-liner:** “The free public URL is for convenience; it sleeps when idle and its SQLite resets on restart.
The architecture is a single-process educational demo, not a scaled SOC platform.”

**Making data persistent for free?** Render's free Postgres is deleted after ~30 days and Render disks are paid.
A free external Postgres (e.g. Neon/Supabase) would work in principle, but `backend/app/db/session.py`
uses SQLite-only `PRAGMA` migrations and no Postgres driver is installed, so that is **not supported without code
changes** — deliberately out of scope.

---

## 2) Production hardening that still applies on Render

| Area | Behaviour |
|------|-----------|
| `PUBLIC_MODE=1` | Baked into `Dockerfile.render` **and** `render.yaml`. Hides `/docs`, `/redoc`, `/openapi.json`; adds HSTS/nosniff/frame/referrer headers; blocks multipart PCAP upload; **refuses to boot** if `JWT_SECRET` < 32 chars or `ADMIN_SEED_PASSWORD` < 12 chars (`validate_public_mode`). |
| CORS | Local dev origins + `PUBLIC_BASE_URL` (falls back to Render's `RENDER_EXTERNAL_URL`) + `CORS_ORIGINS`. Same-origin UI ⇒ no extra config. |
| Google OAuth | `GOOGLE_REDIRECT_URI` derived from the public URL; the origin is auto-allowed for post-login redirects. Don't set `GOOGLE_REDIRECT_URI` on Render. |
| Rate limiting | `slowapi`, with `--proxy-headers --forwarded-allow-ips '*'` in the Docker `CMD` (container is only reachable via Render's proxy). |
| Container | Runs uvicorn as non-root user `app` (UID 1000); `OMP_NUM_THREADS=1`. |
| Secrets | Never in git (`.env`, `backend/env`, `*.db` gitignored and excluded by `.dockerignore`). Set in Render → Environment. |
| Health | `/api/health` (Render health check) and `/api/ready` (detector loaded / UI built / public mode). |

### Environment variable checklist (names only)

| Variable | Required | Source |
|----------|----------|--------|
| `PUBLIC_MODE` | yes | `render.yaml` preset `1` |
| `JWT_SECRET` | yes | Render `generateValue` (≥ 32 chars) |
| `ADMIN_SEED_PASSWORD` | yes | you type it in Render (≥ 12 chars) |
| `ACCESS_TOKEN_EXPIRE_DAYS` | preset | `7` |
| `AI_QUERY_LIMIT` | preset | `10` |
| `LAB_SENSOR_WATCH` | preset | `0` |
| `OMP_NUM_THREADS` | preset | `1` |
| `NEBIUS_API_KEY` | optional | from local `backend\env` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Google login | from local `backend\env` |
| `PUBLIC_BASE_URL` | optional | only for a custom domain / if you want to override Render's URL |
| `CORS_ORIGINS`, `GOOGLE_FRONTEND_ORIGINS` | optional | extra hosts only |
| `GOOGLE_REDIRECT_URI`, `DATABASE_URL`, `PORT` | **leave unset** | derived / Render-provided |

### Google Cloud Console (free)

[Credentials](https://console.cloud.google.com/apis/credentials) → Web client:

- **Authorized JavaScript origins:** `https://cascadyx.onrender.com`
- **Authorized redirect URIs:** `https://cascadyx.onrender.com/api/auth/google/callback`
- [Consent screen](https://console.cloud.google.com/apis/credentials/consent): publish to *In production* (scopes `openid email profile` only) so non-test users can sign in; leave authorized-domain/homepage fields empty.
- Verify: `https://cascadyx.onrender.com/api/auth/google/config` lists the origin in `required_origins`. Helper: `scripts/check_google_origins.ps1`. Troubleshooting: [`GOOGLE_OAUTH.md`](GOOGLE_OAUTH.md).

---

## 3) Code/config changed for deployment (reference)

| File | Purpose |
|------|---------|
| `render.yaml` | Render Blueprint: free web service `cascadyx`, Docker, health check, env vars (no secrets) |
| `Dockerfile.render` | Free-tier image: React build + Python 3.14 + pinned ML libs + `deploy/data` bundle; non-root; `$PORT` aware |
| `deploy/data/`, `scripts/build_deploy_bundle.py` | Slim committed runtime bundle (models + capped test sample + lab captures) |
| `backend/app/config.py` | `PUBLIC_BASE_URL` (falls back to `RENDER_EXTERNAL_URL` / HF `SPACE_HOST`), `CORS_ORIGINS`, `PUBLIC_MODE`, `validate_public_mode()` |
| `backend/app/main.py`, `middleware.py` | CORS from env, docs off, PCAP upload off, security headers, `/api/ready` |
| `backend/app/auth/google_oauth.py` | Public URL auto-allowed as redirect origin |
| `frontend/.../PublicNotice.tsx` | Honest capacity banner on non-localhost |
| `backend/constraints-deploy.txt` | Pins ML libs to the versions that pickled the models |
| `fly.toml`, `Dockerfile` | **Optional paid appendix only (NOT FREE)** |

---

## 4) Security basics

- Never commit `.env` / `backend/env`; rotate `JWT_SECRET`, Nebius and Google secrets if they leak or are pasted anywhere.
- Guard the `admin` password (unlimited AI queries, audit-log access). Self-register/Google create **analyst** accounts only.
- Sign-ups are open (10/min per IP). If abused: lower `AI_QUERY_LIMIT` or **Suspend** the service in Render.
- Cascadyx only **replays recorded captures/datasets**; it never launches attack tools.

---

## Appendix A — Other FREE alternatives (more setup / less suitable)

| Option | Free? | Notes |
|--------|-------|-------|
| **Oracle Cloud "Always Free" VM** (Ampere A1 up to 4 vCPU / 24 GB, or AMD micro) | Free forever **but sign-up asks for a card for identity verification** (not charged). Capacity in some regions is often unavailable. | Always-on, real disk ⇒ SQLite persists; most capable free option. Setup: Ubuntu, open ports 80/443, Docker or Python 3.14 + Node 20, Caddy for HTTPS (needs a domain — free `duckdns.org` subdomain works), `docker build -f Dockerfile.render .` then `docker run -e PUBLIC_MODE=1 -e JWT_SECRET=… -e ADMIN_SEED_PASSWORD=… -e PUBLIC_BASE_URL=https://<name>.duckdns.org -p 127.0.0.1:10000:10000 -v cascadyx-db:/app/data/cache …` (mount a volume only over a DB subfolder if you need persistence — don't hide the models). Because of the card step it conflicts with "no card", so it's an appendix, not the primary. |
| **Hugging Face Spaces (Docker, free CPU)** | Free, no card. 16 GB RAM, sleeps after ~48 h idle, no persistent disk. | `Dockerfile.render` already honours `PORT=7860` and `SPACE_HOST`. Needs `README.md` Space metadata (`sdk: docker`, `app_port: 7860`). Plausible better-RAM alternative if Render's 512 MB is too small; not tested here. |
| **Railway** | Trial credit only (one-off, then paid); card may be needed. | Not truly free long-term — avoid for this requirement. |
| **Koyeb / Google Cloud Run / Vercel / Netlify** | Free tiers exist but have caps, scale-to-zero or can't hold a long-lived WebSocket + SQLite process. | Not recommended. |
| **Run locally + free tunnel** (Cloudflare Quick Tunnel / ngrok free) | Free, no hosting | `.\scripts\run_demo.ps1` then `cloudflared tunnel --url http://127.0.0.1:8000`; URL is random and only works while your PC is on. Good viva fallback. |

## Appendix B — Fly.io (**NOT FREE — optional paid always-on**)

> ⚠️ **Costs money (≈ US$10–12/month for `shared-cpu-2x/2 GB` + ≈ US$0.15/mo volume) and requires a credit/debit
> card. Do not use this to satisfy the "free" requirement.** Kept only because the files exist and it is the
> simplest paid always-on setup (persistent volume ⇒ SQLite survives, no sleep).

Files: `Dockerfile` (copies your full local gitignored `data/`) + `fly.toml`. Summary:

1. `fly auth login`; edit the `CHANGE-ME` lines in `fly.toml` (`app`, `primary_region`, `PUBLIC_BASE_URL`).
2. `fly apps create <app>`; `fly volumes create cascadyx_data --size 1 --region <region>` (exactly one).
3. `fly secrets set JWT_SECRET=… ADMIN_SEED_PASSWORD=… NEBIUS_API_KEY=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…`
4. `fly deploy --app <app> --ha=false`; keep exactly one machine (`fly scale count 1`).
5. Google Console: use your `https://<app>.fly.dev` (or custom domain) origin + `/api/auth/google/callback` redirect.
6. Backup: `fly ssh sftp get /data/app.db ./app-backup.db`.

A custom domain (e.g. `cascadyx.app`, ≈ US$12–20/yr) is also **paid**; free alternatives are the `onrender.com` subdomain
or a free `duckdns.org` name.

## Appendix C — Local demo (unchanged, free)

```powershell
.\scripts\run_demo.ps1      # http://127.0.0.1:8000 — builds frontend/dist if missing
```

Env table for local use: `backend/.env.example`.

---

## Quick checklist before announcing the URL

- [ ] `git push` done; `deploy/data/**` and `Dockerfile.render` visible on GitHub
- [ ] Render service **Live**; `/api/ready` healthy (wait out the first cold start)
- [ ] `ADMIN_SEED_PASSWORD` stored safely; secrets only in Render's Environment tab
- [ ] Google origin + redirect URI match the exact Render host; consent screen published
- [ ] Users told: sleeps when idle, data resets, one simulation at a time
- [ ] No secrets in git

More: [`GO_LIVE.md`](GO_LIVE.md) · [`DEMO.md`](DEMO.md) · [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) · [`USER_MANUAL.md`](USER_MANUAL.md) · [`GOOGLE_OAUTH.md`](GOOGLE_OAUTH.md)
