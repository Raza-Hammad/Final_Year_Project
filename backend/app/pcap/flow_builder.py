"""
Bidirectional flow aggregation for Cascadyx PCAP processing.

Mirrors CICFlowMeter's high-level flow model:
- A flow is keyed by the *first-seen* 5-tuple direction (src, dst, sport, dport, proto).
- Packets in the reverse direction are attached as backward traffic on the same flow.
- TCP FIN/RST or inactivity timeout closes a flow; remaining open flows are flushed
  at end-of-stream (important for tiny ``max_packets`` slices).

Approximation notes vs CICFlowMeter / ISCX:
- Inactive timeout defaults to 120s (CICFlowMeter default). Active/idle burst
  splitting for Idle features is handled later in ``feature_extractor``.
- We do not implement CICFlowMeter's exact subflow segmentation; Subflow byte
  features are approximated as total fwd/bwd bytes (see feature_extractor).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Optional, Tuple

from app.pcap.parser import PacketRecord

logger = logging.getLogger(__name__)

# CICFlowMeter default flow idle timeout (seconds).
DEFAULT_INACTIVE_TIMEOUT_S = 120.0

FlowKey = Tuple[str, str, int, int, int]


@dataclass
class FlowPacket:
    """One packet contribution inside a bidirectional flow."""

    timestamp: float
    direction: str  # "fwd" | "bwd"
    packet_length: int
    header_length: int
    payload_length: int
    tcp_window: int
    psh: bool
    fin_or_rst: bool


@dataclass
class Flow:
    """Accumulated bidirectional flow state ready for feature extraction."""

    key: FlowKey
    packets: List[FlowPacket] = field(default_factory=list)
    start_time: float = 0.0
    last_time: float = 0.0
    closed: bool = False

    @property
    def src_ip(self) -> str:
        return self.key[0]

    @property
    def dst_ip(self) -> str:
        return self.key[1]

    @property
    def src_port(self) -> int:
        return self.key[2]

    @property
    def dst_port(self) -> int:
        return self.key[3]

    @property
    def protocol(self) -> int:
        return self.key[4]


def _forward_key(pkt: PacketRecord) -> FlowKey:
    return (pkt.src_ip, pkt.dst_ip, pkt.src_port, pkt.dst_port, pkt.protocol)


def _reverse_key(pkt: PacketRecord) -> FlowKey:
    return (pkt.dst_ip, pkt.src_ip, pkt.dst_port, pkt.src_port, pkt.protocol)


class FlowBuilder:
    """Aggregates ``PacketRecord`` streams into CIC-style bidirectional flows.

    Args:
        inactive_timeout_s: Close a flow if the gap since last packet exceeds this.
    """

    def __init__(self, inactive_timeout_s: float = DEFAULT_INACTIVE_TIMEOUT_S) -> None:
        self.inactive_timeout_s = inactive_timeout_s
        self._active: Dict[FlowKey, Flow] = {}

    def _expire_idle(self, now: float) -> List[Flow]:
        expired: List[Flow] = []
        to_remove: List[FlowKey] = []
        for key, flow in self._active.items():
            if now - flow.last_time >= self.inactive_timeout_s:
                flow.closed = True
                expired.append(flow)
                to_remove.append(key)
        for key in to_remove:
            del self._active[key]
        return expired

    def add_packet(self, pkt: PacketRecord) -> List[Flow]:
        """Ingest one packet; return any flows that closed as a result."""
        closed_flows = self._expire_idle(pkt.timestamp)

        fwd = _forward_key(pkt)
        rev = _reverse_key(pkt)

        if fwd in self._active:
            key = fwd
            direction = "fwd"
        elif rev in self._active:
            key = rev
            direction = "bwd"
        else:
            key = fwd
            direction = "fwd"
            self._active[key] = Flow(key=key, start_time=pkt.timestamp, last_time=pkt.timestamp)

        flow = self._active[key]
        flow.packets.append(
            FlowPacket(
                timestamp=pkt.timestamp,
                direction=direction,
                packet_length=pkt.packet_length,
                header_length=pkt.header_length,
                payload_length=pkt.payload_length,
                tcp_window=pkt.tcp_window,
                psh=pkt.psh,
                fin_or_rst=pkt.fin_or_rst,
            )
        )
        flow.last_time = pkt.timestamp

        # TCP FIN/RST ends the flow (CICFlowMeter closes on teardown).
        if pkt.fin_or_rst:
            flow.closed = True
            closed_flows.append(flow)
            del self._active[key]

        return closed_flows

    def flush(self) -> List[Flow]:
        """Force-close all still-open flows (end of PCAP slice)."""
        remaining = list(self._active.values())
        for flow in remaining:
            flow.closed = True
        self._active.clear()
        return remaining


def build_flows(
    packets: Iterable[PacketRecord],
    inactive_timeout_s: float = DEFAULT_INACTIVE_TIMEOUT_S,
) -> Iterator[Flow]:
    """Yield completed flows from a packet iterable, flushing leftovers at the end.

    Args:
        packets: Iterable of ``PacketRecord`` (typically from ``iter_packets``).
        inactive_timeout_s: Inactivity timeout in seconds.

    Yields:
        Flow objects with at least one packet.
    """
    builder = FlowBuilder(inactive_timeout_s=inactive_timeout_s)
    flow_count = 0
    for pkt in packets:
        for flow in builder.add_packet(pkt):
            if flow.packets:
                flow_count += 1
                yield flow
    for flow in builder.flush():
        if flow.packets:
            flow_count += 1
            yield flow
    logger.info("Flow aggregation complete: %d flows emitted", flow_count)
