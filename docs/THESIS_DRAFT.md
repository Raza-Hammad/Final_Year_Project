# Cascadyx — Thesis Draft Outline & Chapter Content

**Working title:** Cascadyx: A Cybersecurity Threat Simulator Powered by AI  
**Institution:** Bahria University Karachi — BS(IT) FYP  
**Team / supervisor:** see `Plan.md`  
**Evidence base:** `FYP_REPORT_DATA.md`, `data/cache/metrics/*`, `docs/KNOWN_LIMITATIONS.md`, codebase paths cited inline.

This document is a **draft skeleton with substantive content**, not a final formatted thesis. Replace placeholders (screenshots, page numbers, exact chapter numbering per departmental template) before submission.

---

## Chapter A — Methodology

### A.1 Problem framing

Enterprise networks need educational tools that **simulate**, **detect**, and **explain** intrusion traffic without performing live attacks. Cascadyx addresses three proposal pillars:

1. **Simulate** — replay recorded CIC-IDS2017 traffic (CSV streaming and/or PCAP).
2. **Detect** — classify flows with a 3-tier ML cascade.
3. **Visualize** — real-time Living Lattice dashboard with XAI and SENTINEL AI.

**Out of scope (proposal guardrails):** active blocking, live penetration testing, IoT-specific IDS, merging unrelated datasets for training.

### A.2 Dataset

- **Source:** CIC-IDS2017 GeneratedLabelledFlows (CSV) for training and CSV simulation; raw PCAPs under `data/raw/` for the final pipeline and isolated replay.
- **Classes:** 15 labels (BENIGN + 14 attack types) — encoder order in `FYP_REPORT_DATA.md` §1.1.
- **Known data hygiene:** empty padding rows in Thursday WebAttacks file; latin-1 fallback; Inf/NaN cleaning; drop ID/IP/port before training (`Plan.md`).
- **Imbalance:** SMOTE with capped minority targets; Web Attack raw supports remain tiny (e.g. Sql Injection 17 train rows pre-SMOTE — §2.x in report data).

**Track decision:** remain on CIC-IDS2017 only (no BCCC upgrade in this completion track).

### A.3 Feature pipeline

- Select top **30** features (`data/cache/features.json`).
- `StandardScaler` + `LabelEncoder` persisted under `data/cache/`.
- PCAP path: packet parse → bidirectional flow aggregation → same 30 features → cascade (`test_pcap_pipeline.py` asserts alignment).

### A.4 Cascade design

| Tier | Model | Role | Exit rule |
|------|-------|------|-----------|
| 1 | LightGBM | Screener (accuracy-first) | conf ≥ 0.85 |
| 2 | Random Forest | Explainable validator | conf ≥ 0.85 |
| 3 | Weighted ensemble | LGBM 0.2 + RF 0.3 + XGB 0.5 | always decides |

Implementation: `backend/app/ml/cascade.py`. Mid-eval hyperparameters: `backend/app/ml/train.py` (LGBM `num_leaves=15`, etc.).

### A.5 Simulation methodology

- **CSV:** `SimulationEngine` streams test-split rows for 10 scenarios (`simulator.py`).
- **PCAP analyze:** bounded `max_packets` batch via `detect_batch`.
- **Isolated replay:** VirtualBox Internal Network + `tcpreplay` + host-side Live Replay — methodology documented in [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md); Cascadyx never runs attack tools.

### A.6 Evaluation methodology

- Per-model metrics from held-out test split (`summary.json`, confusion matrices).
- Whole-cascade measurement on stratified 200,000-flow sample (`scripts/report/`, `FYP_REPORT_DATA.md` §4).
- Per-scenario presets (~5,000 flows where available).
- Hardening: RandomizedSearchCV on reduced budget → compare macro-F1 → **do not promote** if regression (`harden.py`, `comparison.json`).

### A.7 System / UX methodology

- FastAPI REST + `/ws/live`; JWT + RBAC; SQLite alerts.
- Frontend: React/Vite; Living Lattice (React Three Fiber) for Intro + Live Detection + Cascade Machine.

---

## Chapter B — Implementation

### B.1 Backend

| Component | Path |
|-----------|------|
| App entry, routes, WS | `backend/app/main.py` |
| Cascade + severity + XAI helpers | `backend/app/ml/cascade.py` |
| Train / prepare / harden | `backend/app/ml/train.py`, `harden.py` |
| CSV + replay engine | `backend/app/simulator/` |
| Auth / JWT revoke | `backend/app/auth/` |
| Static SPA mount | `backend/app/static_ui.py` |

Demo packaging: `scripts/run_demo.ps1` serves `frontend/dist` + API on `:8000`.

### B.2 Frontend

| Area | Path |
|------|------|
| Routes | `frontend/src/App.tsx` |
| Pages | `pages/LiveDetectionPage.tsx`, `SimulatorPage.tsx`, `AlertHistoryPage.tsx`, `ModelInsightsPage.tsx`, `AiAssistantPage.tsx`, `Intro.tsx` |
| Lattice | `components/lattice/*` |
| Live socket | `hooks/useLiveSocket.ts` |

### B.3 Dual traffic modes

Document clearly in implementation chapter:

- **CSV** = labelled mid simulator (fast demos, ground-truth scenarios).
- **PCAP** = proposal-aligned packet→flow path; isolation is **external** VirtualBox, then file ingest.

### B.4 Chat

Hybrid SENTINEL AI: Nebius when API key available; rule-based fallback for reliability and tests.

---

## Chapter C — Results & Evaluation

### C.1 Individual model performance (mid baseline)

From `data/cache/metrics/summary.json` / `FYP_REPORT_DATA.md` §1.2:

| Model | Accuracy | Macro F1 | Avg latency (ms) |
|-------|----------|----------|------------------|
| LightGBM | 0.9975 | 0.8435 | 0.0130 |
| Random Forest | 0.9958 | 0.8141 | 0.0017 |
| XGBoost | 0.9968 | 0.8348 | 0.0059 |

### C.2 Whole-cascade (200k stratified sample)

| Metric | Value |
|--------|-------|
| Accuracy | 99.71% |
| Macro F1 | 0.8104 |
| Tier 1 share | 99.69% |
| Mean latency / flow | ~22.5 ms |
| Sustained throughput | **~44.35 flows/s** |

Tier-conditional accuracy: T1 ~99.91%, T2 ~75.6%, T3 ~28.4% — Tier 3 is the **hard residue**, not a higher-accuracy oracle (§4.3).

### C.3 Per-scenario highlights

| Scenario | Cascade accuracy | Note |
|----------|------------------|------|
| DDoS / Port Scan / DoS | ≥99.6% | Strong volumetric/network classes |
| Brute Force | 99.93% | Strong |
| Web Attacks | **61.15%** | Primary weakness |
| Benign Baseline | 99.60% (0.40% FP rate) | |

### C.4 Hardening experiment

`comparison.json` recommendation: **`keep_baseline`**. All three models **regressed** on macro-F1 (approx. ΔF1: LGBM −0.038, RF −0.032, XGB −0.066) under reduced search/final sample budget. Production cascade remains mid baseline; hardened binaries stay experimental for Insights.

### C.5 Throughput product mapping

API advertises `single_flow_fps: 44`, `batch_flow_fps: 120`. Simulator rate caps match honest host capacity.

---

## Chapter D — Limitations

Write these **explicitly** (examiners reward honesty):

1. **Web-Attack classes** — scarce CIC labels; F1 often 0.18–0.50; scenario accuracy ~61%; hardening does not fix sample scarcity (`WEB_ATTACK_CAVEAT` in `harden.py`).
2. **Hardened models regress** — must not claim “Phase 5 improved production accuracy.”
3. **Throughput** — ~44 flows/s single-threaded cascade path; not wire-speed IDS.
4. **JWT revoke in-memory** — restart clears blacklist ([`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md)).
5. **CSV ≠ packet fidelity** — CSV uses precomputed flow features; PCAP path approximates CIC-style features but is a separate pipeline.
6. **Isolation is operator-dependent** — VirtualBox steps are external; Docker not used on this host.
7. **Nebius optional** — offline rule-based chat is the reliable default for demos/CI.
8. **No active defense** — detection and awareness only.

---

## Chapter E — Conclusion & future work

### E.1 Contributions delivered

- End-to-end FYP: CSV simulator, PCAP pipeline, isolated replay guide, cascade IDS, XAI, Living Lattice UI, SENTINEL AI, packaging/docs.
- Measurable cascade behaviour with transparent weak classes and non-promotion of regressed models.

### E.2 Conclusion statement (draft)

Cascadyx demonstrates that a confidence-gated LightGBM→RF→XGBoost cascade on CIC-IDS2017 can deliver high overall accuracy and strong performance on volumetric and scanning attacks inside a safe replay-based simulator, while remaining transparent about web-application attack weakness, inference throughput, and experimental hardening regressions. The Living Lattice interface and isolated VirtualBox workflow complete the proposal’s simulate–detect–visualize loop without live offensive tooling.

### E.3 Future work (brief)

- Larger/cleaner web-attack corpora or hierarchical classifiers for HTTP-layer threats.
- Batched inference in the CSV simulator path; Redis-backed JWT revoke.
- Optional host-only capture automation (still replay-only).

---

## Figures / tables the student must still insert

| Item | Suggested source |
|------|------------------|
| Architecture diagrams | Export Mermaid from [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| UI screenshots | Placeholders in [`USER_MANUAL.md`](USER_MANUAL.md) → `docs/screenshots/` |
| Confusion matrices | `data/cache/metrics/*_conf_matrix.json` or Insights UI |
| Harden before/after | `comparison.json` / Insights |
| Isolation topology | ASCII/diagram already in [`ISOLATED_REPLAY.md`](ISOLATED_REPLAY.md) |

Department-required chapters (Abstract, Literature Review, Introduction numbering) should wrap around A–E per local template — content above maps to Methodology / Implementation / Results / Limitations / Conclusion.
