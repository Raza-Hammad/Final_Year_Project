"""Build ``data/cache/cascade_demo_flows.json`` (curated flows for the cascade demo).

Usage (from ``backend/``)::

    python -m app.ml.build_demo_flows
"""

from __future__ import annotations

import logging
from collections import Counter

from app.services.cascade_demo import DEMO_FILE, build_demo_flows, save_demo_flows

logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    """Scan the test split, write the playlist and print a short summary."""
    buckets = build_demo_flows()
    path = save_demo_flows(buckets)
    print(f"Wrote {path}")
    for key, flows in buckets.items():
        labels = Counter(f["true_label"] for f in flows)
        print(f"  {key:10s} {len(flows):2d} flows  {dict(labels)}")
    assert path == DEMO_FILE


if __name__ == "__main__":
    main()
