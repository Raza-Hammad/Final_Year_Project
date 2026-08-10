"""Throwaway report-data script (Section 1.3). Derives per-class precision,
recall, F1, and test-set support for each of the 3 cascade models directly
from the cached confusion matrix JSON files -- deterministic derivation
(P = diag/col_sum, R = diag/row_sum, F1 = 2PR/(P+R)), not a re-run of
inference. Output written to scripts/report/out_per_class_metrics.json.
Does not modify any application code.
"""
import json
from pathlib import Path

CACHE = Path(__file__).resolve().parents[2] / "data" / "cache"
OUT = Path(__file__).resolve().parent / "out_per_class_metrics.json"

label_classes = [
    "BENIGN", "Bot", "DDoS", "DoS GoldenEye", "DoS Hulk", "DoS Slowhttptest",
    "DoS slowloris", "FTP-Patator", "Heartbleed", "Infiltration", "PortScan",
    "SSH-Patator", "Web Attack - Brute Force", "Web Attack - Sql Injection", "Web Attack - XSS"
]

models = {
    "LightGBM": "lightgbm_conf_matrix.json",
    "Random Forest": "random_forest_conf_matrix.json",
    "XGBoost": "xgboost_conf_matrix.json",
}

result = {}
for model_name, fname in models.items():
    cm = json.load(open(CACHE / "metrics" / fname))
    n = len(cm)
    row_sums = [sum(row) for row in cm]  # support per true class
    col_sums = [sum(cm[r][c] for r in range(n)) for c in range(n)]  # predicted count per class
    per_class = {}
    for i, cls in enumerate(label_classes):
        tp = cm[i][i]
        support = row_sums[i]
        predicted = col_sums[i]
        precision = (tp / predicted) if predicted > 0 else 0.0
        recall = (tp / support) if support > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        per_class[cls] = {
            "support_test": support,
            "predicted_count": predicted,
            "true_positive": tp,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
    result[model_name] = per_class

with open(OUT, "w") as f:
    json.dump(result, f, indent=2)

print(f"Wrote {OUT}")
