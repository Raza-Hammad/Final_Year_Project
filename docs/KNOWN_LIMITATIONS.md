# Cascadyx — Known Limitations (honest FYP notes)

Documented for viva / examiners. These are intentional tradeoffs for a local demo, not silent bugs.

## Authentication & sessions

- **JWT revoke is in-memory only.** `logout` blacklists the token `jti` in a process-local set (`backend/app/auth/crypto.py`). A server restart clears the blacklist; previously issued JWTs remain valid until expiry unless the process stayed up. Acceptable for a single-process FYP demo; production would use Redis / DB-backed revocation.
- **Default analyst role** is enforced via RBAC on sensitive routes (simulate / replay / PCAP analyze / alert export / audit logs). Admins are lifespan-seeded.

## Detection quality

- **Web-Attack classes** remain the weakest CIC-IDS2017 cohort (scarce samples). Metrics expose an honest caveat; do not claim production IDS parity.
- **Production cascade stays on `mid_baseline`.** Hardened/search artifacts are experimental and are **not** auto-promoted (Phase 5).

## Throughput & simulator

- Single-flow inference is ~**44 flows/s**; batch path ~**120 flows/s** (see `/api/models/metrics` throughput fields). The CSV simulator rate cap matches realistic host capacity.

## Live Nebius chat

- Chat falls back to **Rule-Based / Offline** answers when `NEBIUS_API_KEY` is unset or the API errors. Pytest forces the Rule-Based path where source assertions matter; live Nebius is not required for CI/local suite reliability.

## Attack Lab, PCAP and replay safety

- **Quick Lab is captured traffic**, not a live attack and not launched by the user. The public UI intentionally avoids the word PCAP; docs and viva answers must not. Never present Quick Lab as real-time user-launched attacks.
- **Live Lab is the only live track** (currently shown as *Coming soon* in the UI) and works only when a Sensor VM writes rotating captures to `data/raw/lab/live/` and the sensor watcher is on. Flows that span two capture chunks are classified per chunk.
- **Detection mismatch:** real `hping3`/`nmap`/`hydra` traffic is converted with Scapy-derived features, while the models were trained on CIC-IDS2017 CICFlowMeter features, so verdicts on live recipes can be BENIGN or the wrong class. Recipes are tagged **Experimental** until validated against `/api/pcap/analyze`.
- Quick Lab and PCAP analyze only read capture files under `DATA_RAW_DIR`. Cascadyx never launches live attack tools; Live Lab attacks must stay on a VirtualBox Internal Network (never bridged). See `docs/ISOLATED_REPLAY.md`.

## Cascade demo traffic

- Demo flows are real held-out test rows, curated per tier. Tier 2 has few examples and Tier 3 is low-accuracy on its hard residue; the playlist includes misses on purpose.

## Public deployment

- The free public site (Render free web service) is one 512 MB / 0.1 CPU instance with one uvicorn worker, an **ephemeral SQLite DB** (users/alerts/chats reset on every sleep, redeploy or restart; `admin` is re-seeded) and a single shared in-memory simulator: **one simulation at a time for everyone**, **sleeps after ~15 min idle (~1–2 min cold start)**, inference slower than the ~44 flows/s measured locally, no horizontal scaling. A non-localhost-only banner in the UI says so. See [`DEPLOY.md`](DEPLOY.md) §1.
- `PUBLIC_MODE=1` disables PCAP uploads, `/docs`/OpenAPI and large-PCAP/Live Lab paths (the 52 GB CIC dataset and the sensor VM are not deployed). Only the ~6 MB recorded Quick Lab captures and the held-out test flows ship in the image.
- Self-registration is open (rate-limited); abuse controls beyond slowapi limits and the per-user AI cap are out of scope. See [`DEPLOY.md`](DEPLOY.md).

## Reviews

- Public text is stored as plain text with length limits and rendered escaped. Moderation is admin hide/delete with audit entries; there is no spam filter beyond rate limits.
