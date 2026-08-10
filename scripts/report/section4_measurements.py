"""Throwaway report-data script (Section 4). Runs REAL measurements against
the actual CascadeDetector and cached test split -- no calculated/estimated
numbers, everything is measured wall-clock or counted directly. Does not
modify any application code (only imports and calls existing functions).

Produces scripts/report/out_section4.json
"""
import json
import sys
import time
from pathlib import Path
from collections import Counter

import numpy as np
import psutil
import platform
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.config import settings
from app.ml.cascade import CascadeDetector
from app.simulator.simulator import simulator_engine, SCENARIOS

OUT = Path(__file__).resolve().parent / "out_section4.json"
LOG = Path(__file__).resolve().parent / "section4_progress.log"

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")

log("Loading CascadeDetector...")
t0 = time.time()
detector = CascadeDetector()
log(f"Detector loaded in {time.time()-t0:.2f}s")

cache_dir = Path(settings.DATA_CACHE_DIR)
data = np.load(cache_dir / "processed_data.npz")
X_test, y_test = data["X_test"], data["y_test"]
classes = list(detector.label_encoder.classes_)
log(f"Test set loaded: {X_test.shape}")

log("Initializing SimulationEngine for real scenario index mappings...")
simulator_engine.initialize()
log("SimulationEngine initialized.")

# ============================================================
# 4.1 + 4.3: stratified sample of >=200,000 rows -> tier distribution,
# per-class x tier breakdown, mean confidence per tier, cascade accuracy
# overall and by deciding tier. Also captures per-row latency (feeds 4.2/4.5).
# ============================================================
SAMPLE_SIZE = 200000
idx_all = np.arange(len(X_test))
if len(X_test) > SAMPLE_SIZE:
    sample_idx, _ = train_test_split(idx_all, train_size=SAMPLE_SIZE, stratify=y_test, random_state=42)
else:
    sample_idx = idx_all
    SAMPLE_SIZE = len(X_test)
log(f"Stratified sample size for 4.1/4.3: {len(sample_idx)}")

unscaled_sample = detector.scaler.inverse_transform(X_test[sample_idx])
y_true_sample = y_test[sample_idx]

tier_counts = Counter()
tier_by_class = {c: Counter() for c in classes}
conf_by_tier = {1: [], 2: [], 3: []}
correct_overall = 0
correct_by_tier = {1: 0, 2: 0, 3: 0}
count_by_tier_for_acc = {1: 0, 2: 0, 3: 0}
latencies_ms = []
y_pred_list = []

n = len(sample_idx)
report_every = 10000
loop_start = time.time()
for i in range(n):
    row = dict(zip(detector.selected_features, unscaled_sample[i]))
    true_label = classes[y_true_sample[i]]

    t0 = time.perf_counter()
    result = detector.detect(row)
    latencies_ms.append((time.perf_counter() - t0) * 1000)

    tier = result["tier"]
    pred = result["predicted_label"]
    conf = result["confidence"]

    tier_counts[tier] += 1
    tier_by_class[true_label][tier] += 1
    conf_by_tier[tier].append(conf)
    count_by_tier_for_acc[tier] += 1

    is_correct = (pred == true_label)
    if is_correct:
        correct_overall += 1
        correct_by_tier[tier] += 1
    y_pred_list.append(pred)

    if (i + 1) % report_every == 0:
        elapsed = time.time() - loop_start
        rate = (i + 1) / elapsed
        eta_min = (n - (i + 1)) / rate / 60
        log(f"  4.1/4.3 progress: {i+1:,}/{n:,} ({rate:.1f} rows/s, ETA {eta_min:.1f} min)")

total_elapsed_4_1 = time.time() - loop_start
log(f"4.1/4.3 pass complete in {total_elapsed_4_1:.1f}s")

cascade_accuracy_overall = correct_overall / n
# macro F1 for the cascade over the sample (predictions collected during the loop above)
y_true_str = [classes[y] for y in y_true_sample]
cascade_macro_f1 = f1_score(y_true_str, y_pred_list, average="macro", labels=classes, zero_division=0)
cascade_macro_precision = None
cascade_macro_recall = None
from sklearn.metrics import precision_recall_fscore_support
cascade_macro_precision, cascade_macro_recall, cascade_macro_f1, _ = precision_recall_fscore_support(
    y_true_str, y_pred_list, average="macro", labels=classes, zero_division=0
)

section_4_1_4_3 = {
    "sample_size": n,
    "sample_method": "stratified (sklearn train_test_split, stratify=y_test, random_state=42) over the full cached test split (data/cache/processed_data.npz X_test/y_test)",
    "tier_counts": {str(k): v for k, v in tier_counts.items()},
    "tier_percentages": {str(k): (v / n * 100) for k, v in tier_counts.items()},
    "tier_by_class": {c: {str(t): tier_by_class[c].get(t, 0) for t in [1, 2, 3]} for c in classes},
    "mean_confidence_by_tier": {str(t): (float(np.mean(conf_by_tier[t])) if conf_by_tier[t] else None) for t in [1, 2, 3]},
    "cascade_accuracy_overall": cascade_accuracy_overall,
    "cascade_macro_precision": float(cascade_macro_precision),
    "cascade_macro_recall": float(cascade_macro_recall),
    "cascade_macro_f1": float(cascade_macro_f1),
    "cascade_accuracy_by_tier": {
        str(t): (correct_by_tier[t] / count_by_tier_for_acc[t] if count_by_tier_for_acc[t] > 0 else None)
        for t in [1, 2, 3]
    },
    "pass_wall_clock_seconds": total_elapsed_4_1,
}

# ============================================================
# 4.2 + 4.5: latency / cost-saving / throughput, measured on the SAME
# 200,000-row pass above (mean cascade latency, throughput) plus a dedicated
# "brute force all 3 models on every flow" timing pass on a 10,000-row subsample.
# ============================================================
log("Starting 4.2 brute-force-all-3-models timing pass (10,000 rows)...")
BRUTE_N = 10000
brute_idx = sample_idx[:BRUTE_N]
unscaled_brute = detector.scaler.inverse_transform(X_test[brute_idx])

import pandas as pd
brute_latencies_ms = []
t_brute_start = time.time()
for i in range(BRUTE_N):
    row = dict(zip(detector.selected_features, unscaled_brute[i]))
    t0 = time.perf_counter()
    feature_vector = [float(row.get(feat, 0.0)) for feat in detector.selected_features]
    raw_vector = np.array(feature_vector).reshape(1, -1)
    scaled_vector = detector.scaler.transform(raw_vector)
    scaled_df = pd.DataFrame(scaled_vector, columns=detector.selected_features)
    # Run ALL THREE models unconditionally (no early exit) -- this is the
    # brute-force baseline the cascade is designed to avoid paying on every flow.
    _ = detector.models["lightgbm"].predict_proba(scaled_df)[0]
    _ = detector.models["random_forest"].predict_proba(scaled_df)[0]
    _ = detector.models["xgboost"].predict_proba(scaled_df)[0]
    brute_latencies_ms.append((time.perf_counter() - t0) * 1000)
brute_elapsed = time.time() - t_brute_start
log(f"4.2 brute-force pass complete in {brute_elapsed:.1f}s")

mean_cascade_latency_ms = float(np.mean(latencies_ms))
mean_brute_latency_ms = float(np.mean(brute_latencies_ms))
pct_saving = (mean_brute_latency_ms - mean_cascade_latency_ms) / mean_brute_latency_ms * 100

section_4_2 = {
    "mean_cascade_latency_ms_per_flow": mean_cascade_latency_ms,
    "measured_over_n_flows_cascade": n,
    "mean_all_three_models_latency_ms_per_flow": mean_brute_latency_ms,
    "measured_over_n_flows_brute_force": BRUTE_N,
    "percentage_saving": pct_saving,
    "method": "Both measured with time.perf_counter() wall-clock timing per single-flow call on this machine; brute-force path replicates detect()'s own preprocessing (scaler.transform + DataFrame construction) then calls all three models' predict_proba unconditionally with no early exit.",
}

# throughput = rows processed per second sustained over the full 200k pass
throughput_flows_per_sec = n / total_elapsed_4_1

cpu_freq = psutil.cpu_freq()
section_4_5 = {
    "throughput_flows_per_second_sustained": throughput_flows_per_sec,
    "measured_over_n_flows": n,
    "measured_over_seconds": total_elapsed_4_1,
    "machine_cpu": platform.processor(),
    "machine_cpu_logical_cores": psutil.cpu_count(logical=True),
    "machine_cpu_physical_cores": psutil.cpu_count(logical=False),
    "machine_cpu_max_freq_mhz": cpu_freq.max if cpu_freq else None,
    "machine_ram_total_bytes": psutil.virtual_memory().total,
    "machine_ram_total_gb": psutil.virtual_memory().total / (1024**3),
    "machine_os": platform.platform(),
    "python_version": platform.python_version(),
}

# ============================================================
# 4.4: per-scenario behaviour, ~5000 flows per preset, using the REAL
# simulator_engine.scenarios index mapping (same logic as production).
# ============================================================
log("Starting 4.4 per-scenario measurements...")
rng = np.random.RandomState(42)
SCEN_N = 5000
scenario_results = {}

benign_idx_arr = simulator_engine.scenarios.get("benign_baseline", np.array([], dtype=int))
all_attack_idx_arr = simulator_engine.all_attack_indices

for scen_id, scen_info in SCENARIOS.items():
    log(f"  Scenario '{scen_id}'...")
    if scen_id == "mixed_attack":
        # Replicate simulator.py _runner()'s exact runtime mixing: per-draw,
        # 20% chance BENIGN, else uniformly from all_attack_indices.
        picks = []
        for _ in range(SCEN_N):
            if rng.rand() < 0.20:
                picks.append(int(rng.choice(benign_idx_arr)))
            else:
                picks.append(int(rng.choice(all_attack_idx_arr)))
        chosen = np.array(picks)
    else:
        source_indices = simulator_engine.scenarios.get(scen_id, np.array([], dtype=int))
        if len(source_indices) == 0:
            scenario_results[scen_id] = {"error": "no source rows"}
            continue
        take_n = min(SCEN_N, len(source_indices))
        # take_n is always <= len(source_indices) by construction, so replace=False
        # always gives full coverage with no duplicates (matters for rare classes
        # like Heartbleed/Infiltration where take_n == len(source_indices)).
        chosen = rng.choice(source_indices, size=take_n, replace=False)

    unscaled_scen = detector.scaler.inverse_transform(X_test[chosen])
    y_true_scen = y_test[chosen]

    confidences = []
    non_benign_count = 0
    misclass_pairs = Counter()
    correct = 0
    for i in range(len(chosen)):
        row = dict(zip(detector.selected_features, unscaled_scen[i]))
        true_label = classes[y_true_scen[i]]
        result = detector.detect(row)
        pred = result["predicted_label"]
        confidences.append(result["confidence"])
        if pred != "BENIGN":
            non_benign_count += 1
        if pred == true_label:
            correct += 1
        else:
            misclass_pairs[(true_label, pred)] += 1

    most_common = misclass_pairs.most_common(1)
    scenario_results[scen_id] = {
        "display_name": scen_info["display_name"],
        "mapped_labels": scen_info["labels"],
        "n_flows_sampled": len(chosen),
        "non_benign_prediction_rate": non_benign_count / len(chosen),
        "cascade_accuracy_vs_ground_truth": correct / len(chosen),
        "mean_confidence": float(np.mean(confidences)),
        "most_common_misclassification": (
            {"true_label": most_common[0][0][0], "predicted_label": most_common[0][0][1], "count": most_common[0][1]}
            if most_common else None
        ),
    }

log("4.4 complete.")

result = {
    "section_4_1_tier_distribution_and_4_3_cascade_accuracy": section_4_1_4_3,
    "section_4_2_cost_saving": section_4_2,
    "section_4_5_throughput_and_machine_spec": section_4_5,
    "section_4_4_per_scenario": scenario_results,
}

with open(OUT, "w") as f:
    json.dump(result, f, indent=2)
log(f"ALL DONE. Wrote {OUT}")
