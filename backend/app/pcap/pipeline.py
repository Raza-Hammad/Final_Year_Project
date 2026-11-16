"""
End-to-end PCAP → flow → features → CascadeDetector pipeline.

CLI
---
From the ``backend/`` directory (venv activated)::

    python -m app.pcap.pipeline --pcap ../data/raw/PCAPs/Friday-WorkingHours.pcap --max-packets 200

Always pass ``--max-packets`` for CIC day captures (multi-GB). The parser
streams from disk and never calls ``rdpcap()`` on the full file.

API
---
``analyze_pcap`` is the library entry used by ``POST /api/pcap/analyze``.
When ``persist_alerts`` / ``broadcast`` are enabled, non-BENIGN predictions
are written to SQLite and pushed over the existing WebSocket helper.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.pcap.feature_extractor import align_features, extract_features, load_selected_features
from app.pcap.flow_builder import Flow, build_flows
from app.pcap.parser import iter_packets

logger = logging.getLogger(__name__)

# Hard safety cap for API callers so a mistaken "analyze whole Friday PCAP"
# request cannot pin the process for hours.
DEFAULT_MAX_PACKETS = 500
API_ABSOLUTE_MAX_PACKETS = 5000


@dataclass
class FlowDetection:
    """One flow's classification result plus endpoint metadata."""

    src_ip: str
    dst_ip: str
    src_port: int
    dst_port: int
    protocol: int
    packet_count: int
    features: Dict[str, float]
    result: Dict[str, Any]


@dataclass
class PipelineResult:
    """Aggregate output of a PCAP analysis run."""

    pcap_path: str
    packets_parsed: int
    flows_built: int
    detections: List[FlowDetection] = field(default_factory=list)
    alerts_persisted: int = 0
    label_counts: Dict[str, int] = field(default_factory=dict)

    def summary(self) -> Dict[str, Any]:
        """JSON-serializable summary suitable for API responses."""
        return {
            "pcap_path": self.pcap_path,
            "packets_parsed": self.packets_parsed,
            "flows_built": self.flows_built,
            "alerts_persisted": self.alerts_persisted,
            "label_counts": self.label_counts,
            "detections": [
                {
                    "src_ip": d.src_ip,
                    "dst_ip": d.dst_ip,
                    "src_port": d.src_port,
                    "dst_port": d.dst_port,
                    "protocol": d.protocol,
                    "packet_count": d.packet_count,
                    "predicted_label": d.result.get("predicted_label"),
                    "confidence": d.result.get("confidence"),
                    "tier": d.result.get("tier"),
                    "severity": d.result.get("severity"),
                    "features": d.features,
                    "top_features": d.result.get("top_features"),
                }
                for d in self.detections
            ],
        }


def run_pipeline(
    pcap_path: str | Path,
    max_packets: int = DEFAULT_MAX_PACKETS,
    detector=None,
    persist_alerts: bool = False,
    broadcast: bool = False,
    source_scenario: str = "pcap",
    min_packets_per_flow: int = 1,
) -> PipelineResult:
    """Parse a PCAP slice, extract features, and classify each flow.

    Args:
        pcap_path: Path to ``.pcap`` / ``.pcapng``.
        max_packets: Maximum TCP/UDP IPv4 packets to ingest (required for
            large CIC files — do not omit in demos).
        detector: Optional ``CascadeDetector`` instance. Loads singleton if None.
        persist_alerts: When True, insert non-BENIGN rows into the Alert table.
        broadcast: When True, push each detection via ``broadcast_detection``.
        source_scenario: Stored on Alert rows / result metadata.
        min_packets_per_flow: Skip flows with fewer packets than this.

    Returns:
        PipelineResult with per-flow detections and aggregate counts.
    """
    path = Path(pcap_path)
    if max_packets <= 0:
        raise ValueError("max_packets must be positive")

    if detector is None:
        from app.ml.cascade import get_detector

        detector = get_detector()

    selected = load_selected_features()
    packets = list(iter_packets(path, max_packets=max_packets))
    flows = list(build_flows(packets))

    result = PipelineResult(
        pcap_path=str(path.resolve()),
        packets_parsed=len(packets),
        flows_built=len(flows),
    )

    # Lazy imports keep CLI ``--help`` usable even if DB stack is mid-install.
    session = None
    if persist_alerts:
        from sqlmodel import Session
        from app.db import engine

        session = Session(engine)

    try:
        # Build feature rows first, then vectorized cascade (Phase 5 batch path).
        eligible: list[tuple] = []
        feature_rows: list[dict] = []
        for flow in flows:
            if len(flow.packets) < min_packets_per_flow:
                continue
            raw_features = extract_features(flow)
            features = align_features(raw_features, selected)
            eligible.append((flow, features))
            feature_rows.append(features)

        if hasattr(detector, "detect_batch") and feature_rows:
            detections = detector.detect_batch(feature_rows)
        else:
            detections = [detector.detect(f) for f in feature_rows]

        for (flow, features), detection in zip(eligible, detections):
            label = str(detection.get("predicted_label", "UNKNOWN"))
            result.label_counts[label] = result.label_counts.get(label, 0) + 1

            detection = dict(detection)
            detection["source_ip"] = flow.src_ip
            detection["dest_ip"] = flow.dst_ip
            detection["source_port"] = flow.src_port
            detection["dest_port"] = flow.dst_port
            detection["source_scenario"] = source_scenario
            detection["protocol"] = flow.protocol

            flow_det = FlowDetection(
                src_ip=flow.src_ip,
                dst_ip=flow.dst_ip,
                src_port=flow.src_port,
                dst_port=flow.dst_port,
                protocol=flow.protocol,
                packet_count=len(flow.packets),
                features=features,
                result=detection,
            )
            result.detections.append(flow_det)

            if persist_alerts and session is not None and label.upper() != "BENIGN":
                from app.db import Alert

                alert = Alert(
                    predicted_label=label,
                    confidence=float(detection.get("confidence", 0.0)),
                    tier=int(detection.get("tier", 0)),
                    source_scenario=source_scenario,
                    severity=str(detection.get("severity", "Medium")),
                    source_ip=flow.src_ip,
                    dest_ip=flow.dst_ip,
                    source_port=flow.src_port,
                    dest_port=flow.dst_port,
                    raw_features=json.dumps(features),
                )
                session.add(alert)
                session.commit()
                session.refresh(alert)
                detection["alert_id"] = alert.id
                result.alerts_persisted += 1
                logger.info(
                    "PCAP alert [%s] %s → %s (conf=%.3f tier=%s)",
                    alert.id,
                    f"{flow.src_ip}:{flow.src_port}",
                    label,
                    detection.get("confidence", 0.0),
                    detection.get("tier"),
                )

            if broadcast:
                _broadcast_sync(detection)
    finally:
        if session is not None:
            session.close()

    return result


def _broadcast_sync(detection: Dict[str, Any]) -> None:
    """Broadcast a detection, scheduling onto a running loop when present."""
    from app.ws_manager import broadcast_detection

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(broadcast_detection(detection))
        return

    # Called from a sync FastAPI path that itself may be async — schedule safely.
    loop.create_task(broadcast_detection(detection))


async def analyze_pcap(
    pcap_path: str | Path,
    max_packets: int = DEFAULT_MAX_PACKETS,
    detector=None,
    persist_alerts: bool = True,
    broadcast: bool = True,
    source_scenario: str = "pcap",
) -> Dict[str, Any]:
    """Async wrapper used by the FastAPI route.

    Runs the CPU-bound parse/classify work in a worker thread (broadcast
    disabled there), then optionally broadcasts each detection on the
    running event loop. Returns ``PipelineResult.summary()``.
    """
    from app.ws_manager import broadcast_detection

    pipeline_result: PipelineResult = await asyncio.to_thread(
        run_pipeline,
        pcap_path,
        max_packets,
        detector,
        persist_alerts,
        False,  # broadcast on the event loop below, not from the worker thread
        source_scenario,
    )

    if broadcast:
        for det in pipeline_result.detections:
            await broadcast_detection(det.result)

    return pipeline_result.summary()


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.pcap.pipeline",
        description=(
            "Stream a CIC-IDS2017 PCAP slice, extract cascade features, "
            "and classify flows. Always set --max-packets for multi-GB files."
        ),
    )
    parser.add_argument(
        "--pcap",
        required=True,
        help="Path to .pcap / .pcapng (e.g. ../data/raw/PCAPs/Friday-WorkingHours.pcap)",
    )
    parser.add_argument(
        "--max-packets",
        type=int,
        default=DEFAULT_MAX_PACKETS,
        help=f"Max TCP/UDP packets to parse (default {DEFAULT_MAX_PACKETS})",
    )
    parser.add_argument(
        "--persist-alerts",
        action="store_true",
        help="Write non-BENIGN predictions to the SQLite Alert table",
    )
    parser.add_argument(
        "--broadcast",
        action="store_true",
        help="Broadcast detections over the Cascadyx WebSocket manager",
    )
    parser.add_argument(
        "--scenario",
        default="pcap",
        help="source_scenario label stored on alerts (default: pcap)",
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Optional path to write the full summary JSON",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable DEBUG logging",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """CLI entry point for ``python -m app.pcap.pipeline``."""
    args = _build_arg_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    pcap_path = Path(args.pcap)
    if not pcap_path.is_file():
        logger.error("PCAP not found: %s", pcap_path)
        return 1

    logger.info(
        "Starting PCAP pipeline: file=%s max_packets=%d persist=%s broadcast=%s",
        pcap_path,
        args.max_packets,
        args.persist_alerts,
        args.broadcast,
    )

    try:
        pipeline_result = run_pipeline(
            pcap_path=pcap_path,
            max_packets=args.max_packets,
            persist_alerts=args.persist_alerts,
            broadcast=args.broadcast,
            source_scenario=args.scenario,
        )
    except Exception as exc:
        logger.exception("Pipeline failed: %s", exc)
        return 1

    summary = pipeline_result.summary()
    # Compact stdout report for demos / viva.
    print("=" * 72)
    print("CASCADYX PCAP PIPELINE SUMMARY")
    print("=" * 72)
    print(f"PCAP:            {summary['pcap_path']}")
    print(f"Packets parsed:  {summary['packets_parsed']}")
    print(f"Flows built:     {summary['flows_built']}")
    print(f"Alerts saved:    {summary['alerts_persisted']}")
    print(f"Label counts:    {summary['label_counts']}")
    print("-" * 72)
    for det in summary["detections"][:20]:
        print(
            f"  {det['src_ip']}:{det['src_port']} → {det['dst_ip']}:{det['dst_port']} "
            f"| {det['predicted_label']} "
            f"(conf={det['confidence']:.3f}, tier={det['tier']}, pkts={det['packet_count']})"
        )
    if len(summary["detections"]) > 20:
        print(f"  ... ({len(summary['detections']) - 20} more flows)")
    print("=" * 72)

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        logger.info("Wrote summary JSON to %s", out_path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
