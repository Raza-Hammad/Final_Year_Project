"""
Phase 5 — CIC-IDS2017 cascade model hardening (experimental search).

Runs a capped RandomizedSearchCV per tier (LightGBM / RF / XGBoost), keeps the
mid-eval models as the **production** baseline, writes hardened binaries as
**experimental / non-production** artifacts, and documents honest before/after
metrics (including regressions) plus the Web-Attack residual weakness.

CascadeDetector **never** loads ``models/hardened/`` — only ``models/*.joblib``
(mid baseline). Do not promote reduced-search artifacts that regress macro-F1.

How to retrain (from ``backend/`` with venv active)::

    # Reduced / demo-safe search (default — finishes in tens of minutes)
    python -m app.ml.harden

    # Wider search (still subsampled)
    python -m app.ml.harden --search-samples 150000 --n-iter 12 --final-samples 400000

    # DANGEROUS — only if comparison recommendation is promote_hardened AND you
    # explicitly accept replacing production mid models:
    python -m app.ml.harden --force-promote-to-live

Artifacts written under ``data/cache/``:
  - models/baseline/{lightgbm,random_forest,xgboost}.joblib   (immutable mid snapshot)
  - models/hardened/{...}.joblib + EXPERIMENTAL.json          (non-production)
  - metrics/baseline_summary.json
  - metrics/hardened_summary.json
  - metrics/hardening_report.json  (search space, winners, caveats)
  - metrics/comparison.json        (before/after for Insights API)
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from sklearn.model_selection import RandomizedSearchCV, StratifiedShuffleSplit, train_test_split

from app.config import settings
from app.data.loader import prepare_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Honest FYP caveat — scarce CIC Web-Attack rows; hardening must not hide this.
WEB_ATTACK_CAVEAT = (
    "Web Attack classes (Brute Force / XSS / Sql Injection) remain weak on CIC-IDS2017 "
    "due to scarce labelled samples. Hyperparameter search may shift F1 slightly but "
    "does not create a reliable web-attack detector. Scenario-level accuracy for pure "
    "web-attack traffic can stay near ~60%. Document this honestly in viva materials."
)

HARDENED_EXPERIMENTAL_NOTE = (
    "models/hardened/*.joblib are EXPERIMENTAL / NON-PRODUCTION. CascadeDetector loads "
    "only models/*.joblib (mid-eval baseline). Reduced RandomizedSearchCV runs that "
    "regress macro-F1 must not replace production."
)

MODEL_KEYS = ("lightgbm", "random_forest", "xgboost")
DISPLAY_NAMES = {
    "lightgbm": "LightGBM",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
}


def _paths() -> dict[str, Path]:
    cache = Path(settings.DATA_CACHE_DIR)
    models = cache / "models"
    metrics = cache / "metrics"
    return {
        "cache": cache,
        "models": models,
        "metrics": metrics,
        "baseline_models": models / "baseline",
        "hardened_models": models / "hardened",
        "hardened_marker": models / "hardened" / "EXPERIMENTAL.json",
        "active_variant": models / "active_variant.json",
        "baseline_summary": metrics / "baseline_summary.json",
        "hardened_summary": metrics / "hardened_summary.json",
        "hardening_report": metrics / "hardening_report.json",
        "comparison": metrics / "comparison.json",
        "summary": metrics / "summary.json",
    }


def snapshot_baseline(force: bool = False) -> None:
    """Copy current live mid models + summary into immutable baseline slots."""
    p = _paths()
    p["baseline_models"].mkdir(parents=True, exist_ok=True)
    p["metrics"].mkdir(parents=True, exist_ok=True)

    for key in MODEL_KEYS:
        src = p["models"] / f"{key}.joblib"
        dst = p["baseline_models"] / f"{key}.joblib"
        if not src.exists():
            raise FileNotFoundError(f"Live model missing: {src}. Train mid models first.")
        if force or not dst.exists():
            shutil.copy2(src, dst)
            logger.info("Baseline snapshot: %s -> %s", src.name, dst)

    if p["summary"].exists() and (force or not p["baseline_summary"].exists()):
        shutil.copy2(p["summary"], p["baseline_summary"])
        logger.info("Baseline metrics snapshot -> %s", p["baseline_summary"])

    # Confusion matrices for Insights comparison
    for key in MODEL_KEYS:
        src_cm = p["metrics"] / f"{key}_conf_matrix.json"
        dst_cm = p["metrics"] / f"baseline_{key}_conf_matrix.json"
        if src_cm.exists() and (force or not dst_cm.exists()):
            shutil.copy2(src_cm, dst_cm)


def _subsample(
    X: np.ndarray, y: np.ndarray, n: int, random_state: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    if len(X) <= n:
        return X, y
    _, X_s, _, y_s = train_test_split(
        X, y, test_size=n, stratify=y, random_state=random_state
    )
    return X_s, y_s


def _evaluate(
    clf: Any,
    X_test: np.ndarray,
    y_test: np.ndarray,
    class_labels: list[str],
    train_time: float,
) -> dict[str, Any]:
    start = time.time()
    y_pred = clf.predict(X_test)
    inf_time = time.time() - start
    avg_inf_ms = (inf_time / max(len(X_test), 1)) * 1000.0

    accuracy = accuracy_score(y_test, y_pred)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="macro", zero_division=0
    )
    per_p, per_r, per_f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average=None, labels=range(len(class_labels)), zero_division=0
    )
    per_class_f1 = {class_labels[i]: float(per_f1[i]) for i in range(len(class_labels))}
    cm = confusion_matrix(y_test, y_pred, labels=range(len(class_labels)))

    web_keys = [k for k in per_class_f1 if k.startswith("Web Attack")]
    web_f1 = {k: per_class_f1[k] for k in web_keys}

    return {
        "accuracy": float(accuracy),
        "macro_precision": float(precision),
        "macro_recall": float(recall),
        "macro_f1": float(f1),
        "training_time_seconds": float(train_time),
        "avg_inference_latency_ms": float(avg_inf_ms),
        "per_class_f1": per_class_f1,
        "web_attack_f1": web_f1,
        "confusion_matrix": cm.tolist(),
    }


def _search_spaces() -> dict[str, dict[str, Any]]:
    """Practical search grids — not multi-day Optuna sweeps."""
    return {
        "lightgbm": {
            "estimator_factory": lambda: __import__("lightgbm", fromlist=["LGBMClassifier"]).LGBMClassifier(
                random_state=42, n_jobs=-1, verbose=-1
            ),
            "param_distributions": {
                "n_estimators": [100, 150, 200],
                "num_leaves": [15, 31],
                "min_child_samples": [20, 50, 100],
                "reg_lambda": [0.5, 1.0, 2.0],
                "learning_rate": [0.05, 0.1],
            },
            # Mid baseline used at evaluation freeze
            "fallback_params": {
                "n_estimators": 150,
                "num_leaves": 15,
                "min_child_samples": 50,
                "reg_lambda": 1.0,
                "learning_rate": 0.1,
            },
        },
        "random_forest": {
            "estimator_factory": lambda: __import__(
                "sklearn.ensemble", fromlist=["RandomForestClassifier"]
            ).RandomForestClassifier(random_state=42, n_jobs=-1),
            "param_distributions": {
                "n_estimators": [50, 100, 150],
                "max_depth": [10, 12, 16, None],
                "min_samples_leaf": [1, 2, 4],
                "max_features": ["sqrt", 0.5],
            },
            "fallback_params": {
                "n_estimators": 50,
                "max_depth": 12,
                "min_samples_leaf": 1,
                "max_features": "sqrt",
            },
        },
        "xgboost": {
            "estimator_factory": lambda: __import__(
                "xgboost", fromlist=["XGBClassifier"]
            ).XGBClassifier(
                random_state=42,
                n_jobs=-1,
                tree_method="hist",
                eval_metric="mlogloss",
            ),
            "param_distributions": {
                "n_estimators": [80, 100, 150],
                "max_depth": [4, 6, 8],
                "learning_rate": [0.05, 0.1],
                "subsample": [0.8, 1.0],
                "colsample_bytree": [0.8, 1.0],
            },
            "fallback_params": {
                "n_estimators": 100,
                "max_depth": 6,
                "learning_rate": 0.1,
                "subsample": 1.0,
                "colsample_bytree": 1.0,
            },
        },
    }


def run_hardening(
    search_samples: int = 80000,
    final_samples: int = 200000,
    n_iter: int = 6,
    cv_folds: int = 2,
    promote: bool = False,
    force_promote: bool = False,
    force_baseline_snapshot: bool = False,
) -> dict[str, Any]:
    """Execute capped hyperparameter search, train hardened models, write metrics."""
    p = _paths()
    snapshot_baseline(force=force_baseline_snapshot)

    encoder = joblib.load(p["cache"] / "label_encoder.joblib")
    class_labels = list(encoder.classes_)

    logger.info("Loading preprocessed splits...")
    X_train, X_test, y_train, y_test = prepare_data(force=False)

    X_search, y_search = _subsample(X_train, y_train, search_samples, random_state=42)
    X_final, y_final = _subsample(X_train, y_train, final_samples, random_state=7)
    logger.info(
        "Search subsample=%s final retrain=%s test=%s",
        X_search.shape[0],
        X_final.shape[0],
        X_test.shape[0],
    )

    spaces = _search_spaces()
    hardened_summary: dict[str, Any] = {}
    report_models: dict[str, Any] = {}
    p["hardened_models"].mkdir(parents=True, exist_ok=True)

    cv = StratifiedShuffleSplit(n_splits=cv_folds, test_size=0.25, random_state=42)

    for key, spec in spaces.items():
        display = DISPLAY_NAMES[key]
        logger.info("=== Hyperparameter search: %s (n_iter=%d, cv=%d) ===", display, n_iter, cv_folds)
        est = spec["estimator_factory"]()
        search = RandomizedSearchCV(
            estimator=est,
            param_distributions=spec["param_distributions"],
            n_iter=n_iter,
            scoring="f1_macro",
            cv=cv,
            random_state=42,
            n_jobs=1,  # models already use n_jobs=-1; avoid oversubscription
            verbose=1,
            refit=True,
            error_score="raise",
        )
        t0 = time.time()
        try:
            search.fit(X_search, y_search)
            best_params = dict(search.best_params_)
            search_score = float(search.best_score_)
            search_seconds = time.time() - t0
            logger.info("%s best_params=%s cv_macro_f1=%.5f", display, best_params, search_score)
        except Exception as exc:
            logger.error("%s search failed (%s); using mid fallback params.", display, exc)
            best_params = dict(spec["fallback_params"])
            search_score = None
            search_seconds = time.time() - t0

        # Final fit on larger (still capped) stratified set with winning params
        final_est = spec["estimator_factory"]()
        final_est.set_params(**best_params)
        t1 = time.time()
        final_est.fit(X_final, y_final)
        train_time = time.time() - t1

        out_path = p["hardened_models"] / f"{key}.joblib"
        joblib.dump(final_est, out_path)
        logger.info("Saved hardened %s -> %s", display, out_path)

        metrics = _evaluate(final_est, X_test, y_test, class_labels, train_time)
        cm = metrics.pop("confusion_matrix")
        cm_path = p["metrics"] / f"hardened_{key}_conf_matrix.json"
        with open(cm_path, "w", encoding="utf-8") as f:
            json.dump(cm, f)

        hardened_summary[display] = metrics
        report_models[key] = {
            "display_name": display,
            "best_params": best_params,
            "search_cv_macro_f1": search_score,
            "search_seconds": search_seconds,
            "param_distributions": {
                k: [None if v is None else v for v in vals]
                if isinstance(vals, list)
                else vals
                for k, vals in spec["param_distributions"].items()
            },
            "test_accuracy": metrics["accuracy"],
            "test_macro_f1": metrics["macro_f1"],
            "web_attack_f1": metrics["web_attack_f1"],
        }

    with open(p["hardened_summary"], "w", encoding="utf-8") as f:
        json.dump(hardened_summary, f, indent=2)

    baseline_summary = {}
    if p["baseline_summary"].exists():
        with open(p["baseline_summary"], "r", encoding="utf-8") as f:
            baseline_summary = json.load(f)

    comparison = _build_comparison(
        baseline_summary,
        hardened_summary,
        search_samples=int(X_search.shape[0]),
        final_samples=int(X_final.shape[0]),
        n_iter=n_iter,
    )
    recommendation, recommendation_reason = _recommend_variant(comparison)
    comparison["recommendation"] = recommendation
    comparison["recommendation_reason"] = recommendation_reason
    comparison["production_models"] = "mid_baseline"
    comparison["hardened_status"] = "experimental_non_production"
    comparison["experimental_note"] = HARDENED_EXPERIMENTAL_NOTE
    with open(p["comparison"], "w", encoding="utf-8") as f:
        json.dump(comparison, f, indent=2)

    _write_experimental_marker(
        search_samples=int(X_search.shape[0]),
        final_samples=int(X_final.shape[0]),
        n_iter=n_iter,
        recommendation=recommendation,
    )

    report = {
        "dataset": "CIC-IDS2017",
        "search_algorithm": "sklearn.model_selection.RandomizedSearchCV",
        "scoring": "f1_macro",
        "search_samples": int(X_search.shape[0]),
        "final_train_samples": int(X_final.shape[0]),
        "n_iter_per_model": n_iter,
        "cv_folds": cv_folds,
        "cv_strategy": "StratifiedShuffleSplit(test_size=0.25)",
        "models": report_models,
        "web_attack_caveat": WEB_ATTACK_CAVEAT,
        "recommendation": recommendation,
        "recommendation_reason": recommendation_reason,
        "production_models": "mid_baseline",
        "hardened_status": "experimental_non_production",
        "experimental_note": HARDENED_EXPERIMENTAL_NOTE,
        "promoted_to_live": False,
        "timestamp_unix": time.time(),
    }
    with open(p["hardening_report"], "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    # Production cascade always stays on mid baseline unless explicitly force-promoted.
    _write_active_variant("mid_baseline")
    if force_promote:
        logger.warning("force_promote=True — overwriting production mid models.")
        promote_hardened(force=True)
        report["promoted_to_live"] = True
        report["hardened_status"] = "forced_into_production_against_default_policy"
        with open(p["hardening_report"], "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    elif promote:
        if recommendation != "promote_hardened":
            logger.error(
                "Refusing promote: recommendation=%s. Hardened remains experimental. "
                "Use --force-promote-to-live only if you intentionally replace mid models.",
                recommendation,
            )
        else:
            promote_hardened(force=True)
            report["promoted_to_live"] = True
            with open(p["hardening_report"], "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)

    _print_before_after(baseline_summary, hardened_summary, recommendation)
    logger.info("Hardening complete (hardened=experimental). Caveat: %s", WEB_ATTACK_CAVEAT)
    return report


def _write_experimental_marker(
    *,
    search_samples: int,
    final_samples: int,
    n_iter: int,
    recommendation: str,
) -> None:
    """Write models/hardened/EXPERIMENTAL.json so artifacts are never mistaken for live."""
    p = _paths()
    p["hardened_models"].mkdir(parents=True, exist_ok=True)
    marker = {
        "status": "experimental_non_production",
        "do_not_load_in_cascade_detector": True,
        "production_models": "models/*.joblib (mid_baseline)",
        "experimental_note": HARDENED_EXPERIMENTAL_NOTE,
        "search_samples": search_samples,
        "final_train_samples": final_samples,
        "n_iter_per_model": n_iter,
        "recommendation": recommendation,
        "updated_unix": time.time(),
    }
    with open(p["hardened_marker"], "w", encoding="utf-8") as f:
        json.dump(marker, f, indent=2)


def _build_comparison(
    baseline: dict,
    hardened: dict,
    *,
    search_samples: int | None = None,
    final_samples: int | None = None,
    n_iter: int | None = None,
) -> dict[str, Any]:
    models = []
    for display in ("LightGBM", "Random Forest", "XGBoost"):
        b = baseline.get(display, {})
        h = hardened.get(display, {})
        entry = {
            "name": display,
            "baseline_label": "mid_production",
            "hardened_label": "experimental_non_production",
            "baseline": {
                "accuracy": b.get("accuracy"),
                "macro_f1": b.get("macro_f1"),
                "avg_inference_latency_ms": b.get("avg_inference_latency_ms"),
                "per_class_f1": b.get("per_class_f1", {}),
                "web_attack_f1": {
                    k: v
                    for k, v in (b.get("per_class_f1") or {}).items()
                    if str(k).startswith("Web Attack")
                },
            },
            "hardened": {
                "accuracy": h.get("accuracy"),
                "macro_f1": h.get("macro_f1"),
                "avg_inference_latency_ms": h.get("avg_inference_latency_ms"),
                "per_class_f1": h.get("per_class_f1", {}),
                "web_attack_f1": h.get("web_attack_f1", {}),
            },
        }
        if b.get("accuracy") is not None and h.get("accuracy") is not None:
            entry["delta_accuracy"] = float(h["accuracy"]) - float(b["accuracy"])
            entry["delta_macro_f1"] = float(h["macro_f1"]) - float(b["macro_f1"])
            entry["regressed"] = bool(entry["delta_macro_f1"] < 0)
        models.append(entry)

    regressed = [m["name"] for m in models if m.get("regressed")]
    return {
        "dataset": "CIC-IDS2017",
        "web_attack_caveat": WEB_ATTACK_CAVEAT,
        "production_models": "mid_baseline",
        "hardened_status": "experimental_non_production",
        "experimental_note": HARDENED_EXPERIMENTAL_NOTE,
        "search_budget": {
            "search_samples": search_samples,
            "final_train_samples": final_samples,
            "n_iter_per_model": n_iter,
        },
        "regressed_models": regressed,
        "models": models,
    }


def _recommend_variant(comparison: dict[str, Any]) -> tuple[str, str]:
    """Prefer mid baseline unless hardened improves mean macro-F1 without collapsing accuracy."""
    deltas = [
        m.get("delta_macro_f1")
        for m in comparison.get("models", [])
        if m.get("delta_macro_f1") is not None
    ]
    acc_deltas = [
        m.get("delta_accuracy")
        for m in comparison.get("models", [])
        if m.get("delta_accuracy") is not None
    ]
    if not deltas:
        return (
            "keep_baseline",
            "Insufficient before/after metrics to justify promoting hardened models.",
        )
    mean_df1 = sum(deltas) / len(deltas)
    mean_dacc = (sum(acc_deltas) / len(acc_deltas)) if acc_deltas else 0.0
    if mean_df1 > 0.005 and mean_dacc >= -0.001:
        return (
            "promote_hardened",
            "Hardened models improve mean macro-F1 with stable accuracy; safe to promote.",
        )
    return (
        "keep_baseline",
        (
            "Hardened search/retrain (often on a reduced sample budget) did not beat the "
            "mid-eval models trained on the full capped-SMOTE set. Live cascade stays on "
            "baseline. Hardened artifacts remain for Insights comparison. Re-run with "
            "larger --final-samples if seeking promotion."
        ),
    )


def _write_active_variant(variant: str) -> None:
    p = _paths()
    payload = {
        "variant": variant,
        "production_models": "mid_baseline",
        "hardened_status": "experimental_non_production",
        "note": HARDENED_EXPERIMENTAL_NOTE,
        "updated_unix": time.time(),
    }
    with open(p["active_variant"], "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def promote_hardened(*, force: bool = False) -> None:
    """Copy hardened joblibs into live paths — DISABLED unless force=True.

    Reduced Phase 5 search regresses macro-F1 vs mid; CascadeDetector must stay
    on mid baseline. Use only after a full-budget search that beats baseline.
    """
    if not force:
        raise RuntimeError(
            "Refusing to promote experimental hardened models into production. "
            "CascadeDetector must keep mid baseline. Re-run with "
            "--force-promote-to-live only after comparison recommends promote_hardened."
        )

    p = _paths()
    logger.warning(
        "FORCE PROMOTE: replacing production mid models with experimental hardened binaries."
    )
    for key in MODEL_KEYS:
        src = p["hardened_models"] / f"{key}.joblib"
        if not src.exists():
            raise FileNotFoundError(f"Hardened model missing: {src}. Run harden first.")
        dst = p["models"] / f"{key}.joblib"
        shutil.copy2(src, dst)
        logger.info("Promoted %s -> live %s", src, dst.name)

        src_cm = p["metrics"] / f"hardened_{key}_conf_matrix.json"
        dst_cm = p["metrics"] / f"{key}_conf_matrix.json"
        if src_cm.exists():
            shutil.copy2(src_cm, dst_cm)

    if p["hardened_summary"].exists():
        shutil.copy2(p["hardened_summary"], p["summary"])
    _write_active_variant("hardened_forced_live")
    logger.warning("Live cascade paths overwritten — restart API to reload.")


def _print_before_after(
    baseline: dict, hardened: dict, recommendation: str = "keep_baseline"
) -> None:
    print("\n" + "=" * 88)
    print("  HARDENING BEFORE / AFTER (CIC-IDS2017) — hardened = EXPERIMENTAL")
    print("=" * 88)
    print(
        f"{'Model':<15} | {'Base Acc':<10} | {'Hard Acc':<10} | "
        f"{'Base F1':<10} | {'Hard F1':<10} | {'dF1':<10}"
    )
    print("-" * 88)
    for display in ("LightGBM", "Random Forest", "XGBoost"):
        b = baseline.get(display, {})
        h = hardened.get(display, {})
        ba, ha = b.get("accuracy"), h.get("accuracy")
        bf, hf = b.get("macro_f1"), h.get("macro_f1")
        df = (hf - bf) if (hf is not None and bf is not None) else None
        print(
            f"{display:<15} | "
            f"{(ba if ba is not None else float('nan')):<10.5f} | "
            f"{(ha if ha is not None else float('nan')):<10.5f} | "
            f"{(bf if bf is not None else float('nan')):<10.5f} | "
            f"{(hf if hf is not None else float('nan')):<10.5f} | "
            f"{(df if df is not None else float('nan')):<10.5f}"
        )
    print("=" * 88)
    print("PRODUCTION:", "mid_baseline (models/*.joblib) — CascadeDetector default")
    print("HARDENED:  ", "experimental_non_production (models/hardened/) — NOT loaded")
    print("RECOMMEND: ", recommendation)
    print("NOTE:", WEB_ATTACK_CAVEAT)
    print("NOTE:", HARDENED_EXPERIMENTAL_NOTE)


def main() -> None:
    parser = argparse.ArgumentParser(description="CIC-IDS2017 cascade hardening (experimental)")
    parser.add_argument("--search-samples", type=int, default=80000)
    parser.add_argument("--final-samples", type=int, default=200000)
    parser.add_argument("--n-iter", type=int, default=6, help="RandomizedSearchCV iterations per model")
    parser.add_argument("--cv", type=int, default=2)
    parser.add_argument(
        "--promote",
        action="store_true",
        help="After search, promote only if recommendation is promote_hardened",
    )
    parser.add_argument(
        "--force-promote-to-live",
        action="store_true",
        help="DANGEROUS: overwrite production mid models with experimental hardened binaries",
    )
    parser.add_argument(
        "--force-baseline-snapshot",
        action="store_true",
        help="Overwrite baseline snapshots from current live models",
    )
    args = parser.parse_args()

    if args.force_promote_to_live and not args.promote:
        # Standalone forced promote without a new search.
        snapshot_baseline(force=False)
        promote_hardened(force=True)
        return

    run_hardening(
        search_samples=args.search_samples,
        final_samples=args.final_samples,
        n_iter=args.n_iter,
        cv_folds=args.cv,
        promote=args.promote,
        force_promote=args.force_promote_to_live,
        force_baseline_snapshot=args.force_baseline_snapshot,
    )


if __name__ == "__main__":
    main()
