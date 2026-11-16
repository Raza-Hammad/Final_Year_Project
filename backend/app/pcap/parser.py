"""
Streaming PCAP packet parser for Cascadyx.

Uses Scapy ``PcapReader`` so multi-GB CIC-IDS2017 captures (e.g. Friday
WorkingHours ~8 GB) are never loaded entirely into memory. Callers MUST pass
``max_packets`` for interactive / API use.

Only IPv4 TCP/UDP packets are emitted; non-IP and non-TCP/UDP frames are
skipped (CICFlowMeter similarly focuses on TCP/UDP flows for CIC-IDS2017).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PacketRecord:
    """Normalized per-packet fields used by flow aggregation.

    Attributes:
        timestamp: Packet arrival time in seconds since epoch (float).
        src_ip: Source IPv4 address.
        dst_ip: Destination IPv4 address.
        src_port: L4 source port (0 if unavailable).
        dst_port: L4 destination port (0 if unavailable).
        protocol: IP protocol number (6=TCP, 17=UDP).
        packet_length: Approximate CICFlowMeter packet length (IP total length
            when present, else raw frame length). Units: bytes.
        header_length: IP header + L4 header length in bytes.
        payload_length: Max(0, packet_length - header_length).
        tcp_flags: TCP flags byte (0 for UDP).
        tcp_window: TCP window size (0 for UDP / missing).
        psh: True if TCP PSH flag is set.
        fin_or_rst: True if TCP FIN or RST is set (flow-end hint).
    """

    timestamp: float
    src_ip: str
    dst_ip: str
    src_port: int
    dst_port: int
    protocol: int
    packet_length: int
    header_length: int
    payload_length: int
    tcp_flags: int
    tcp_window: int
    psh: bool
    fin_or_rst: bool


def _extract_record(pkt) -> Optional[PacketRecord]:
    """Convert a Scapy packet into a ``PacketRecord``, or None if unsupported."""
    try:
        from scapy.layers.inet import IP, TCP, UDP  # local import keeps module import light
    except ImportError as exc:  # pragma: no cover - environment issue
        raise ImportError(
            "scapy is required for PCAP parsing. Install with: pip install scapy"
        ) from exc

    if IP not in pkt:
        return None

    ip = pkt[IP]
    protocol = int(ip.proto)
    ip_hlen = int(ip.ihl) * 4 if getattr(ip, "ihl", None) else 20
    # CICFlowMeter / jNetPcap typically use IP total length when available.
    packet_length = int(ip.len) if getattr(ip, "len", None) else int(len(pkt))

    src_port = 0
    dst_port = 0
    l4_hlen = 0
    tcp_flags = 0
    tcp_window = 0
    psh = False
    fin_or_rst = False

    if protocol == 6 and TCP in pkt:
        tcp = pkt[TCP]
        src_port = int(tcp.sport)
        dst_port = int(tcp.dport)
        l4_hlen = int(tcp.dataofs) * 4 if getattr(tcp, "dataofs", None) else 20
        tcp_flags = int(tcp.flags)
        tcp_window = int(tcp.window) if getattr(tcp, "window", None) is not None else 0
        psh = bool(tcp_flags & 0x08)
        fin_or_rst = bool(tcp_flags & 0x01) or bool(tcp_flags & 0x04)
    elif protocol == 17 and UDP in pkt:
        udp = pkt[UDP]
        src_port = int(udp.sport)
        dst_port = int(udp.dport)
        l4_hlen = 8
    else:
        return None

    header_length = ip_hlen + l4_hlen
    payload_length = max(0, packet_length - header_length)
    ts = float(pkt.time) if getattr(pkt, "time", None) is not None else 0.0

    return PacketRecord(
        timestamp=ts,
        src_ip=str(ip.src),
        dst_ip=str(ip.dst),
        src_port=src_port,
        dst_port=dst_port,
        protocol=protocol,
        packet_length=packet_length,
        header_length=header_length,
        payload_length=payload_length,
        tcp_flags=tcp_flags,
        tcp_window=tcp_window,
        psh=psh,
        fin_or_rst=fin_or_rst,
    )


def iter_packets(
    pcap_path: str | Path,
    max_packets: Optional[int] = None,
) -> Iterator[PacketRecord]:
    """Yield normalized packet records from a PCAP without loading it wholly.

    Args:
        pcap_path: Path to a ``.pcap`` / ``.pcapng`` file.
        max_packets: Optional hard cap on *emitted* (TCP/UDP IPv4) packets.
            When None, the entire file is streamed (unsafe for multi-GB CIC
            captures in interactive demos — prefer a limit).

    Yields:
        PacketRecord for each supported packet.

    Raises:
        FileNotFoundError: If ``pcap_path`` does not exist.
        ImportError: If scapy is not installed.
        ValueError: If ``max_packets`` is <= 0.
    """
    path = Path(pcap_path)
    if not path.is_file():
        raise FileNotFoundError(f"PCAP not found: {path}")
    if max_packets is not None and max_packets <= 0:
        raise ValueError("max_packets must be a positive integer when provided")

    # Scapy 2.6+ lazy-loads layers: DLT_EN10MB (1) is unregistered until Ether
    # is imported. Without this, VirtualBox/tcpdump Ethernet PCAPs decode as Raw
    # and the pipeline emits 0 IPv4 flows.
    from scapy.layers.l2 import Ether  # noqa: F401 — registers conf.l2types[1]
    from scapy.utils import PcapReader

    emitted = 0
    scanned = 0
    logger.info(
        "Opening PCAP stream %s (max_packets=%s)",
        path,
        max_packets if max_packets is not None else "unlimited",
    )

    # PcapReader iterates from disk; do not call rdpcap() on CIC day files.
    with PcapReader(str(path)) as reader:
        for pkt in reader:
            scanned += 1
            record = _extract_record(pkt)
            if record is None:
                continue
            yield record
            emitted += 1
            if max_packets is not None and emitted >= max_packets:
                logger.info(
                    "Reached max_packets=%d (scanned %d frames); stopping parse",
                    max_packets,
                    scanned,
                )
                break

    logger.info("PCAP parse finished: emitted=%d scanned_frames=%d", emitted, scanned)
