"""PCAP processing layer for Cascadyx (CIC-IDS2017).

Pipeline: PCAP parse → bidirectional flow aggregation → CICFlowMeter-style
feature extraction (30 selected features) → CascadeDetector inference.

Import heavy entry points lazily so ``python -m app.pcap.pipeline`` does not
re-execute the module after a circular package import.
"""

from typing import Any

__all__ = ["analyze_pcap", "run_pipeline"]


def __getattr__(name: str) -> Any:
    if name in {"analyze_pcap", "run_pipeline"}:
        from app.pcap import pipeline as _pipeline

        return getattr(_pipeline, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
