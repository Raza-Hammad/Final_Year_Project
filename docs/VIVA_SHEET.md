# Cascadyx — Viva Talking Points

One-page style answers. Cite code/metrics if asked. Demo script: [`DEMO.md`](DEMO.md). Limits: [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

---

## 1. What is Cascadyx? (30 s)

Educational **threat simulator + AI detector + visualizer** on **CIC-IDS2017**. Traffic comes from three honest sources: the **CSV scenario simulator** (labelled test rows), **Quick Lab** (a *captured* lab session streamed through the pipeline) and **Live Lab** (real VM-to-VM traffic when a Sensor VM delivers captures). A **3-tier cascade** classifies it and a **Living Lattice** UI shows the result with XAI and SENTINEL AI. We do **not** auto-block, and Cascadyx itself never launches attacks.

---

## 2. Cascade rationale

**Q: Why three models instead of one?**  
Clear cases exit early; uncertain cases escalate. On a 200k sample, **~99.69%** finish at Tier 1 — we pay for RF/XGB only on hard residue (`FYP_REPORT_DATA.md` §4.1).

**Q: Why LightGBM first if people say it’s for speed?**  
Tier 1 is chosen for **highest overall accuracy** (~99.75%), **not** speed. Random Forest is **faster** at inference (~0.0017 ms vs LGBM ~0.013 ms in summary.json). Say this out loud — it shows you read your own metrics (`cascade.py` docstring; FAQ in `main.py`).

**Q: Threshold?**  
**0.85** confidence to stay at a tier; else escalate.

**Q: Tier 3 weights?**  
LGBM **0.2**, RF **0.3**, XGB **0.5**.

**Q: Why is Tier 3 accuracy low (~28%)?**  
Only the hardest ~0.27% of flows reach it (many Web Attacks). It is a **best effort on ambiguous residue**, not a magic high-accuracy tier (§4.3).

---

## 3. DDoS / Port Scan — “T2/T3 idle”

On the 200k sample, **DDoS** resolved as Tier1/Tier2/Tier3 = **9047 / 8 / 0**. High-confidence volumetric classes almost never escalate. Demo DDoS or Port Scan to show a clean Tier-1-dominated lattice.

---

## 4. Web-Attack weakness (must say unprompted)

- Per-class F1 for Web Attack XSS/Brute Force/SQLi is weak (often **0.18–0.50**).
- Pure **Web Attacks** scenario cascade accuracy **~61.15%**.
- Cause: **scarce labelled CIC samples**, not a silent bug.
- Hardening **does not** invent missing data — caveat in `harden.py` / Insights.

---

## 5. Why not promote hardened models?

Phase 5 RandomizedSearch on a **reduced budget** produced **macro-F1 regression** on **all three** models (`comparison.json`: LGBM/RF/XGB all `regressed: true`). Recommendation: **`keep_baseline`**. `CascadeDetector` **always** loads `models/*.joblib` mid baseline; `models/hardened/` is experimental only. Promoting would **hurt** production quality.

---

## 6. Throughput ~44 flows/s

Measured sustained cascade throughput ~**44.35 flows/s** (§4.5); API constant `SINGLE_FLOW_THROUGHPUT_FPS = 44`. Batch path ~**120** flows/s for PCAP analyze. Simulator rate caps are **honest**, not arbitrary UI sliders.

---

## 7. CSV vs Quick Lab vs Live Lab

| | CSV simulator | Quick Lab | Live Lab |
|--|---------------|-----------|----------|
| Input | Labelled test rows | A **captured** lab session (PCAP under the hood) → flows → features | Rotating captures from a **Sensor VM** on a VirtualBox Internal Network |
| Is it live? | No (labelled data) | **No** — captured earlier; the user does not launch the attack | **Yes**, real VM-to-VM traffic — only when a sensor really delivers it |
| Role | Mid demos, scenario ground truth | One-click demo of the packet pipeline | Proposal "live traffic" story |
| Isolation | Not required | Sealed-lab story | Required (Internal Network only) |

**Say this unprompted if asked "is it live?":** the public UI avoids the word PCAP, but Quick Lab is captured traffic and Live Lab is the only genuinely live track. Unvalidated recipes are tagged *Experimental*. Real `hping3`/`nmap`/`hydra` traffic goes through Scapy-derived features while the models were trained on CICFlowMeter features, so the cascade can return BENIGN or the wrong class — we display the real verdict.

Training uses CSV features, not raw packets merged ad hoc.

---

## 8. Isolation safety

- Quick Lab = a **captured session** read from `data/raw/` and classified (Cascadyx does not launch anything).
- Live Lab = your own VMs on a **VirtualBox Internal Network**; the Sensor VM writes rotating captures to `data/raw/lab/live/`, which the sensor watcher classifies. The UI shows a pre-start isolation checklist.
- Cascadyx **never** launches nmap/Metasploit/hping3; the user runs lab commands inside their own VMs. Do **not** bridge intnet to the LAN. Live attack tooling needs your supervisor's sign-off (`Plan.md`).  
  Steps: [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md) — don’t recite the whole guide.

---

## 9. Living Lattice UI intent

Not a random 3D skin: **spatial metaphor** for traffic/threat posture (Intro beats Simulate→Detect→Explain; live lattice for streaming alerts; Cascade Machine for the ML story). Built with React Three Fiber while keeping the working console workflows (Simulator, History, Insights, AI).

---

## 10. Auth / engineering honesty

- JWT + bcrypt; **admin vs analyst** RBAC on simulate/replay/pcap/export/audit.
- Logout revoke is **in-memory `jti` blacklist** — fine for single-process demo; restart clears it.
- Nebius optional; **rule-based** chat always available.

---

## 11. Likely examiner traps → short replies

| Trap | Reply |
|------|--------|
| “Is this a real-time IDS on Gbps links?” | No — educational simulator; ~44 flows/s single-flow path. |
| “Did hardening improve the system?” | Experimentally compared; **regressed**; kept mid baseline. |
| “Can it stop attacks?” | Detection/awareness only — proposal scope. |
| “Why not BCCC / Electron / OAuth?” | Locked completion track: CIC-only + VirtualBox + Living Lattice. |
| “Docker?” | Not required on this host; isolation via VirtualBox. |

---

## 12. Demo order (5–7 min)

1. One-command start → login.  
2. CSV **DDoS** or **Port Scan** → Live lattice + Explain.  
3. Insights: mid metrics + keep_baseline + Web-Attack caveat.  
4. Optional: **Attack Lab → Quick Lab** (say clearly it is a captured session), or Live Lab if the VMs are up.  
5. History export or SENTINEL one question.  

Full checklist: [`DEMO.md`](DEMO.md).

---

## 13. Cascade demo traffic (Model Insights)

Natural traffic is ~99.7% Tier 1, so Tier 2/3 almost never show on the live feed. **Demo traffic** in the Cascade Machine plays *real held-out test flows* from `GET /api/cascade/demo/next` (built by `python -m app.ml.build_demo_flows`), with the real per-tier scores against the 0.85 gate. It is read-only: no alerts, no WebSocket broadcast, no simulator mutex. The playlist deliberately includes some **misses** (Tier 3 is ~28% accurate on its hard residue) — do not cherry-pick.

## 14. Reviews and AI quota

- **Reviews ("Wall of Signals")**: one review per account, helpful votes, admin hide/delete (audited) and CSV export — usable as user-feedback evidence.
- **AI quota**: analysts get a lifetime cap (`AI_QUERY_LIMIT`); **admins are unlimited** (role is read from the DB, not the JWT). The slowapi limit remains as an abuse guard.
