"""
Isolated PCAP Live Replay runner for Cascadyx (Phase 2).

Feeds a user-provided capture (typically copied from a VirtualBox tcpdump
guest) through the Phase 1 PCAP pipeline → CascadeDetector → Alert DB + WS.

This module never invokes live attack tooling. Replay is strictly of recorded
CIC-IDS2017 (or VirtualBox-captured CIC replay) traffic files on disk.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlmodel import Session

from app.db import engine, Alert
from app.ml.cascade import get_detector
from app.pcap.feature_extractor import align_features, extract_features, load_selected_features
from app.pcap.flow_builder import build_flows
from app.pcap.parser import iter_packets
from app.pcap.pipeline import API_ABSOLUTE_MAX_PACKETS, DEFAULT_MAX_PACKETS
from app.ws_manager import broadcast_detection

logger = logging.getLogger(__name__)

SAFETY_BANNER = (
    "Isolated lab only. Cascadyx never launches live attack tools (no nmap, "
    "Metasploit, exploit frameworks); attacks run between VMs on a sealed "
    "VirtualBox Internal Network. See docs/ISOLATED_REPLAY.md."
)

DEFAULT_REPLAY_SCENARIO = "isolated_replay"

# A pacer that falls this many seconds behind its schedule re-anchors instead
# of bursting to catch up (keeps the stream smooth when cascade-bound).
_MAX_PACING_LAG_S = 1.0


class ReplayMixin:
    """Mixin adding PCAP replay mode to SimulationEngine (CSV + replay mutex)."""

    # Attributes expected on SimulationEngine; declared for type checkers.
    is_running: bool
    current_scenario: Optional[str]
    packets_sent: int
    attacks_detected: int
    tier_breakdown: Dict[int, int]
    rate: int
    duration_seconds: Optional[int]
    start_time: Optional[datetime]
    task: Optional[asyncio.Task]

    def _init_replay_state(self) -> None:
        self.mode: str = "idle"  # idle | csv | replay
        self.replay_source: Optional[str] = None
        self.packets_parsed: int = 0
        self.flows_built: int = 0
        self.replay_error: Optional[str] = None

    def start_replay(
        self,
        pcap_path: str | Path,
        *,
        max_packets: int = DEFAULT_MAX_PACKETS,
        rate: int = 5,
        duration_seconds: Optional[int] = None,
        source_scenario: str = DEFAULT_REPLAY_SCENARIO,
    ) -> None:
        """Start background Live Replay of a recorded PCAP slice."""
        from app.simulator.simulator import MAX_SIMULATION_RATE

        if self.is_running:
            raise ValueError(
                "A simulation or replay is already running. Stop it first."
            )

        path = Path(pcap_path)
        if not path.is_file():
            raise FileNotFoundError(f"PCAP file not found: {path}")
        if path.suffix.lower() not in {".pcap", ".pcapng"}:
            raise ValueError("Only .pcap / .pcapng files are supported")
        if max_packets <= 0:
            raise ValueError("max_packets must be a positive integer")
        if max_packets > API_ABSOLUTE_MAX_PACKETS:
            raise ValueError(
                f"max_packets capped at {API_ABSOLUTE_MAX_PACKETS} for safety"
            )
        if rate <= 0:
            raise ValueError("Replay rate must be at least 1 flow per second")
        if rate > MAX_SIMULATION_RATE:
            raise ValueError(
                f"Replay rate cannot exceed {MAX_SIMULATION_RATE} flows/sec."
            )

        self.is_running = True
        self.mode = "replay"
        self.current_scenario = source_scenario or DEFAULT_REPLAY_SCENARIO
        self.replay_source = str(path.resolve())
        self.rate = rate
        self.duration_seconds = duration_seconds
        self.packets_sent = 0
        self.attacks_detected = 0
        self.tier_breakdown = {1: 0, 2: 0, 3: 0}
        self.packets_parsed = 0
        self.flows_built = 0
        self.replay_error = None
        self.start_time = datetime.utcnow()

        logger.info(
            "Launching isolated PCAP replay. source=%s max_packets=%d rate=%d "
            "scenario=%s | %s",
            self.replay_source,
            max_packets,
            rate,
            self.current_scenario,
            SAFETY_BANNER,
        )
        self.task = asyncio.create_task(
            self._replay_runner(path, max_packets, self.current_scenario)
        )

    async def _replay_runner(
        self,
        pcap_path: Path,
        max_packets: int,
        source_scenario: str,
    ) -> None:
        """Parse a PCAP slice, then stream flows through the cascade at ``rate``.

        Pacing is deadline-based (flow *i* is due at ``t0 + i / rate``) so the
        requested rate holds regardless of per-flow DB/WebSocket cost. Flows are
        classified in vectorised chunks off the event loop, one chunk ahead of
        the streaming position, so the cascade never blocks the stream until the
        requested rate exceeds the batch throughput.
        """
        try:
            selected = load_selected_features()
            detector = get_detector()

            def _parse() -> tuple[list, list]:
                packets = list(iter_packets(pcap_path, max_packets=max_packets))
                flows = list(build_flows(packets))
                # ``build_flows`` yields flows as they close, so never-terminated
                # flows (e.g. a connection flood) would trail the closed ones.
                # Stream in capture order so multi-phase sessions keep their story.
                flows.sort(key=lambda f: f.start_time)
                return packets, flows

            packets, flows = await asyncio.to_thread(_parse)
            self.packets_parsed = len(packets)
            self.flows_built = len(flows)
            logger.info(
                "Replay parse complete: packets=%d flows=%d",
                self.packets_parsed,
                self.flows_built,
            )

            if not flows:
                logger.warning("Replay found no flows in %s", pcap_path)
                self.is_running = False
                self.mode = "idle"
                return

            interval = 1.0 / self.rate
            chunk_size = max(8, min(64, int(self.rate)))

            def _classify(chunk: list) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
                rows = [align_features(extract_features(f), selected) for f in chunk]
                if hasattr(detector, "detect_batch"):
                    detections = detector.detect_batch(rows)
                else:
                    detections = [detector.detect(r) for r in rows]
                return list(zip(rows, detections))

            chunks = [
                flows[i : i + chunk_size] for i in range(0, len(flows), chunk_size)
            ]
            pending = asyncio.create_task(asyncio.to_thread(_classify, chunks[0]))

            loop = asyncio.get_running_loop()
            t0 = loop.time()
            emitted = 0
            done = False

            for ci, chunk in enumerate(chunks):
                classified = await pending
                if ci + 1 < len(chunks):
                    # Prefetch the next chunk while this one streams.
                    pending = asyncio.create_task(
                        asyncio.to_thread(_classify, chunks[ci + 1])
                    )

                for flow, (features, detection) in zip(chunk, classified):
                    if not self.is_running:
                        done = True
                        break

                    due = t0 + emitted * interval
                    now = loop.time()
                    if due > now:
                        await asyncio.sleep(due - now)
                    elif now - due > _MAX_PACING_LAG_S:
                        t0 = now - emitted * interval  # re-anchor, no burst
                    emitted += 1

                    await self._emit_flow(flow, features, detection, source_scenario)

                    if self.duration_seconds and self.start_time:
                        elapsed = (datetime.utcnow() - self.start_time).total_seconds()
                        if elapsed >= self.duration_seconds:
                            logger.info(
                                "Replay completed — duration limit %ss reached.",
                                self.duration_seconds,
                            )
                            done = True
                            break
                if done:
                    break

            if not pending.done():
                pending.cancel()

            logger.info(
                "Replay finished. flows_streamed=%d attacks=%d source=%s",
                self.packets_sent,
                self.attacks_detected,
                self.replay_source,
            )
        except asyncio.CancelledError:
            logger.info("Replay runner cancelled.")
        except Exception as exc:
            self.replay_error = str(exc)
            logger.error("Critical error in replay loop: %s", exc)
        finally:
            self.is_running = False
            self.mode = "idle"
            self.task = None

    async def _emit_flow(
        self,
        flow: Any,
        features: Dict[str, Any],
        detection: Dict[str, Any],
        source_scenario: str,
    ) -> None:
        """Persist (if non-benign), broadcast and count one classified flow."""
        result: Dict[str, Any] = dict(detection)
        predicted_label = str(result.get("predicted_label", "UNKNOWN"))
        confidence = float(result.get("confidence", 0.0))
        tier = int(result.get("tier", 0))

        result["source_ip"] = flow.src_ip
        result["dest_ip"] = flow.dst_ip
        result["source_port"] = flow.src_port
        result["dest_port"] = flow.dst_port
        result["source_scenario"] = source_scenario
        result["protocol"] = flow.protocol
        result["replay_source"] = self.replay_source

        is_attack = predicted_label.upper() != "BENIGN"
        if is_attack:
            try:
                with Session(engine) as session:
                    alert = Alert(
                        predicted_label=predicted_label,
                        confidence=confidence,
                        tier=tier,
                        source_scenario=source_scenario,
                        severity=str(result.get("severity", "Medium")),
                        source_ip=flow.src_ip,
                        dest_ip=flow.dst_ip,
                        source_port=flow.src_port,
                        dest_port=flow.dst_port,
                        raw_features=json.dumps(features),
                    )
                    session.add(alert)
                    session.commit()
                    session.refresh(alert)
                    result["alert_id"] = alert.id
            except Exception as db_err:
                logger.error("Error persisting replay alert: %s", db_err)

        try:
            await broadcast_detection(result)
        except Exception as ws_err:
            logger.warning("WebSocket error during replay: %s", ws_err)

        self.packets_sent += 1
        if is_attack:
            self.attacks_detected += 1
        self.tier_breakdown[tier] = self.tier_breakdown.get(tier, 0) + 1
