"""Assemble the Quick Lab capture files and refresh the lab manifest.

Each capture is written as a classic Ethernet ``.pcap`` laid out like a sensor
port-mirroring an isolated ``192.168.56.0/24`` host-only network would record
(VirtualBox NIC vendor MACs, Linux TCP stacks, full handshakes, ARP/ICMP
chatter before the session starts).

Usage (from ``backend/`` with the venv active)::

    python -m app.ml.build_lab_captures            # write captures + manifest
    python -m app.ml.build_lab_captures --no-manifest

Output lands in ``data/raw/lab/captures/`` and ``data/raw/lab/manifest.json``.
The script is deterministic (fixed seeds) so reruns reproduce the same files.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

from scapy.layers.inet import ICMP, IP, TCP
from scapy.layers.l2 import ARP, Ether
from scapy.packet import Packet, Raw
from scapy.utils import wrpcap

from app.config import settings

LAB_DIR = Path(settings.DATA_RAW_DIR) / "lab"
CAPTURE_DIR = LAB_DIR / "captures"
MANIFEST_PATH = LAB_DIR / "manifest.json"

ATTACKER_IP = "192.168.56.10"
SENSOR_IP = "192.168.56.20"
VICTIM_IP = "192.168.56.30"
ATTACKER_MAC = "08:00:27:3a:b1:10"
VICTIM_MAC = "08:00:27:7c:42:30"

# Capture epoch base (arbitrary but plausible lab session start).
BASE_TS = 1_731_052_800.0
MAX_PACKETS = 5000

_SYN_OPTS: list[tuple[str, Any]] = [
    ("MSS", 1460), ("SAckOK", b""), ("Timestamp", (0, 0)), ("NOP", None), ("WScale", 7),
]
_SCAN_OPTS: list[tuple[str, Any]] = [("MSS", 1460), ("SAckOK", b"")]


@dataclass
class Host:
    """Endpoint description: addressing plus TCP stack personality."""

    ip: str
    mac: str
    syn_window: int
    synack_window: int
    run_window: int
    ttl: int = 64


def attacker(syn: int = 29200, run: int = 229) -> Host:
    return Host(ATTACKER_IP, ATTACKER_MAC, syn, 28960, run)


def victim(synack: int = 28960, run: int = 227) -> Host:
    return Host(VICTIM_IP, VICTIM_MAC, 29200, synack, run)


class Wire:
    """Packet recorder with its own clock; IP id counters may be shared."""

    def __init__(self, seed: int, start: float = 0.0, ipids: dict[str, int] | None = None) -> None:
        self.rng = random.Random(seed)
        self.t = BASE_TS + start
        self.packets: list[Packet] = []
        self._ipid: dict[str, int] = ipids if ipids is not None else {}

    def advance(self, seconds: float) -> None:
        self.t += max(0.0, seconds)

    def jitter(self, base: float, spread: float = 0.35) -> float:
        return max(1e-5, base * (1 + self.rng.uniform(-spread, spread)))

    def _ip_id(self, ip: str) -> int:
        cur = self._ipid.get(ip, self.rng.randint(1000, 40000))
        cur = (cur + self.rng.randint(1, 3)) & 0xFFFF
        self._ipid[ip] = cur
        return cur

    def emit(self, pkt: Packet, gap: float = 0.0) -> None:
        self.advance(gap)
        pkt.time = self.t
        self.packets.append(pkt)

    def tcp(
        self,
        src: Host,
        dst: Host,
        sport: int,
        dport: int,
        flags: str,
        seq: int,
        ack: int,
        window: int,
        payload: bytes = b"",
        options: list[tuple[str, Any]] | None = None,
        gap: float = 0.0,
    ) -> None:
        """Emit one TCP segment. ``options=[]`` means a bare 20-byte header."""
        ip = IP(src=src.ip, dst=dst.ip, ttl=src.ttl, id=self._ip_id(src.ip), flags="DF")
        if options is None:
            options = [("NOP", None), ("NOP", None), ("Timestamp", (int(self.t) & 0xFFFFFFF, 0))]
        seg = TCP(sport=sport, dport=dport, flags=flags, seq=seq, ack=ack, window=window, options=options)
        pkt = Ether(src=src.mac, dst=dst.mac) / ip / seg
        if payload:
            pkt = pkt / Raw(payload)
        self.emit(pkt, gap)


class Conn:
    """A single TCP connection between client and server with handshake helpers."""

    def __init__(self, wire: Wire, client: Host, server: Host, sport: int, dport: int) -> None:
        self.w = wire
        self.c = client
        self.s = server
        self.sport = sport
        self.dport = dport
        self.cseq = wire.rng.randint(1_000_000, 4_000_000_000)
        self.sseq = wire.rng.randint(1_000_000, 4_000_000_000)

    def handshake(self, rtt: float = 0.0004) -> None:
        w = self.w
        w.tcp(self.c, self.s, self.sport, self.dport, "S", self.cseq, 0, self.c.syn_window, options=_SYN_OPTS)
        self.cseq += 1
        w.tcp(self.s, self.c, self.dport, self.sport, "SA", self.sseq, self.cseq, self.s.synack_window,
              options=_SYN_OPTS, gap=w.jitter(rtt))
        self.sseq += 1
        w.tcp(self.c, self.s, self.sport, self.dport, "A", self.cseq, self.sseq, self.c.run_window,
              gap=w.jitter(rtt))

    def send(self, side: str, size: int, gap: float, push: bool, mss: int = 64000) -> None:
        """Send ``size`` bytes from ``side`` ('c' or 's'), segmenting at ``mss``."""
        w = self.w
        src, dst = (self.c, self.s) if side == "c" else (self.s, self.c)
        sp, dp = (self.sport, self.dport) if side == "c" else (self.dport, self.sport)
        remaining = size
        first = True
        while remaining > 0 or first:
            chunk = min(remaining, mss)
            remaining -= chunk
            seq, ack = (self.cseq, self.sseq) if side == "c" else (self.sseq, self.cseq)
            flag = "PA" if (push and remaining == 0) else "A"
            w.tcp(src, dst, sp, dp, flag, seq, ack, src.run_window, w.rng.randbytes(chunk) if chunk else b"",
                  gap=gap if first else w.jitter(0.00012, 0.5))
            if side == "c":
                self.cseq += chunk
            else:
                self.sseq += chunk
            first = False

    def ack(self, side: str, gap: float = 0.0004) -> None:
        """Pure ACK from ``side``."""
        w = self.w
        src, dst = (self.c, self.s) if side == "c" else (self.s, self.c)
        sp, dp = (self.sport, self.dport) if side == "c" else (self.dport, self.sport)
        seq, ack = (self.cseq, self.sseq) if side == "c" else (self.sseq, self.cseq)
        w.tcp(src, dst, sp, dp, "A", seq, ack, src.run_window, gap=w.jitter(gap))

    def close(self, by_client: bool = True, gap: float = 0.001) -> None:
        w = self.w
        a, b = (self.c, self.s) if by_client else (self.s, self.c)
        ap, bp = (self.sport, self.dport) if by_client else (self.dport, self.sport)
        aseq, bseq = (self.cseq, self.sseq) if by_client else (self.sseq, self.cseq)
        w.tcp(a, b, ap, bp, "FA", aseq, bseq, a.run_window, gap=gap)
        w.tcp(b, a, bp, ap, "FA", bseq, aseq + 1, b.run_window, gap=w.jitter(0.0004))
        w.tcp(a, b, ap, bp, "A", aseq + 1, bseq + 1, a.run_window, gap=w.jitter(0.0003))

    def reset(self, by_client: bool = True, gap: float = 0.001) -> None:
        w = self.w
        if by_client:
            w.tcp(self.c, self.s, self.sport, self.dport, "RA", self.cseq, self.sseq, self.c.run_window, gap=gap)
        else:
            w.tcp(self.s, self.c, self.dport, self.sport, "RA", self.sseq, self.cseq, 0, gap=gap)


Event = tuple[str, int, float, bool]  # (side, payload bytes, gap before, PSH)


def scripted_session(
    shared_ids: dict[str, int],
    seed: int,
    t0: float,
    client: Host,
    server: Host,
    sport: int,
    dport: int,
    events: Sequence[Event],
    end: str = "none",
    rtt: float = 0.0004,
) -> list[Packet]:
    """One TCP session driven by an event script.

    Data is acknowledged by the peer unless the next event is a quick reply
    (piggy-backed ACK), mirroring delayed-ACK behaviour.
    """
    w = Wire(seed, t0, shared_ids)
    conn = Conn(w, client, server, sport, dport)
    conn.handshake(rtt=rtt)
    for i, (side, size, gap, push) in enumerate(events):
        conn.send(side, size, gap, push)
        nxt = events[i + 1] if i + 1 < len(events) else None
        quick_reply = nxt is not None and nxt[0] != side and nxt[2] < 0.04
        if size > 0 and not quick_reply:
            conn.ack("s" if side == "c" else "c")
    if end == "rst":
        conn.reset(gap=w.jitter(0.002))
    elif end == "fin":
        conn.close(gap=w.jitter(0.002))
    return w.packets


# ---------------------------------------------------------------------------
# Link-layer chatter that precedes every session
# ---------------------------------------------------------------------------

def _arp_and_ping(w: Wire) -> None:
    """ARP resolution plus a short ICMP echo exchange (ignored by the flow parser)."""
    w.emit(Ether(src=ATTACKER_MAC, dst="ff:ff:ff:ff:ff:ff") /
           ARP(op=1, hwsrc=ATTACKER_MAC, psrc=ATTACKER_IP, pdst=VICTIM_IP))
    w.emit(Ether(src=VICTIM_MAC, dst=ATTACKER_MAC) /
           ARP(op=2, hwsrc=VICTIM_MAC, psrc=VICTIM_IP, hwdst=ATTACKER_MAC, pdst=ATTACKER_IP), gap=0.0006)
    for i in range(3):
        w.emit(Ether(src=ATTACKER_MAC, dst=VICTIM_MAC) /
               IP(src=ATTACKER_IP, dst=VICTIM_IP, ttl=64, id=w._ip_id(ATTACKER_IP)) /
               ICMP(type=8, id=0x1F2E, seq=i + 1) / Raw(bytes(range(48))), gap=0.9 if i else 0.01)
        w.emit(Ether(src=VICTIM_MAC, dst=ATTACKER_MAC) /
               IP(src=VICTIM_IP, dst=ATTACKER_IP, ttl=64, id=w._ip_id(VICTIM_IP)) /
               ICMP(type=0, id=0x1F2E, seq=i + 1) / Raw(bytes(range(48))), gap=w.jitter(0.0005))


def _preamble(seed: int) -> Wire:
    w = Wire(seed)
    _arp_and_ping(w)
    return w


def _vary(rng: random.Random, value: float, spread: float) -> float:
    return value * (1 + rng.uniform(-spread, spread))


# ---------------------------------------------------------------------------
# Scenario recipes
# ---------------------------------------------------------------------------

def build_ddos(seed: int = 11) -> list[Packet]:
    """Connection flood: many web clients held open against a slow-answering server."""
    pre = _preamble(seed)
    rng = random.Random(seed)
    ids = pre._ipid
    packets = list(pre.packets)
    t = 5.0
    sport = 31000
    for i in range(150):
        t += rng.uniform(0.01, 0.05)
        sport += rng.randint(1, 3)
        events: list[Event] = [
            ("c", int(_vary(rng, 300, 0.04)), 0.0002, False),
            ("s", int(_vary(rng, 11100, 0.02)), _vary(rng, 6.0, 0.02), True),
        ]
        packets += scripted_session(ids, seed * 1000 + i, t, attacker(256, 501), victim(229, 229), sport, 80,
                                    events, end="none")
    return packets


def build_port_scan(seed: int = 12) -> list[Packet]:
    """Half-open probe sweep across the low port range."""
    w = _preamble(seed)
    w.advance(2.5)
    ports = list(range(1, 1025))
    w.rng.shuffle(ports)
    open_ports = {22, 80, 111, 139, 445, 3306}
    sport = w.rng.randint(35000, 60000)
    scanner = Host(ATTACKER_IP, ATTACKER_MAC, 29200, 28960, 29200)
    target = Host(VICTIM_IP, VICTIM_MAC, 29200, 5840, 5840)
    for port in ports[:430]:
        seq = w.rng.randint(1, 4_000_000_000)
        w.tcp(scanner, target, sport, port, "SP", seq, 0, 29200, options=_SCAN_OPTS, gap=w.jitter(0.0012, 0.5))
        if port in open_ports:
            w.tcp(target, scanner, port, sport, "SA", w.rng.randint(1, 4_000_000_000), seq + 1, 5840,
                  options=[("MSS", 1460)], gap=w.jitter(0.00003, 0.4))
            w.tcp(scanner, target, sport, port, "R", seq + 1, 0, 0, options=[], gap=w.jitter(0.00004))
        else:
            w.tcp(target, scanner, port, sport, "RA", 0, seq + 1, 0, options=[], gap=w.jitter(0.00002, 0.5))
    return w.packets


_USERS = ["admin", "root", "ftpuser", "msfadmin", "test", "user", "backup", "service"]
_PWDS = ["123456", "password", "12345678", "qwerty", "abc123", "letmein", "welcome", "monkey", "dragon",
         "master", "iloveyou", "sunshine", "passw0rd", "trustno1", "football", "baseball"]


def _ftp_events(rng: random.Random) -> list[Event]:
    return [
        ("s", 20, 0.0008, True), ("c", 12, 0.0012, True), ("s", 34, 0.0006, True),
        ("c", 14, 0.0015, True), ("s", 22, _vary(rng, 0.9, 0.4), True), ("c", 6, 0.0012, True),
        ("s", 14, 0.0005, True),
    ]


def _ssh_events(rng: random.Random) -> list[Event]:
    return [
        ("s", 41, 0.0008, True), ("c", 22, 0.0008, True), ("c", 1008, 0.0014, True),
        ("s", 1040, 0.002, True), ("c", 160, 0.0016, True), ("s", 1344, 0.004, True),
        ("c", 48, 0.0012, True), ("s", 64, 0.001, True), ("c", 96, 0.0012, True),
        ("s", 64, _vary(rng, 1.1, 0.4), True),
    ]


def _web_login_events(rng: random.Random) -> list[Event]:
    return [
        ("c", int(_vary(rng, 546, 0.04)), _vary(rng, 4.88, 0.02), False),
        ("s", int(_vary(rng, 7700, 0.05)), 0.004, False),
    ]


def build_brute_force(seed: int = 13) -> list[Packet]:
    """Credential guessing against the web login, FTP and SSH services."""
    pre = _preamble(seed)
    rng = random.Random(seed)
    ids = pre._ipid
    packets = list(pre.packets)
    t = 4.0
    sport = 42000
    for i in range(100):
        t += rng.uniform(0.02, 0.08)
        sport += rng.randint(1, 4)
        packets += scripted_session(ids, seed * 1000 + i, t, attacker(29200, 229), victim(247, 502), sport, 80,
                                    _web_login_events(rng), end="none")
    t += 1.0
    for i in range(28):
        t += rng.uniform(0.05, 0.2)
        sport += rng.randint(1, 4)
        packets += scripted_session(ids, seed * 2000 + i, t, attacker(), victim(), sport, 21,
                                    _ftp_events(rng), end="rst")
    for i in range(22):
        t += rng.uniform(0.05, 0.2)
        sport += rng.randint(1, 4)
        packets += scripted_session(ids, seed * 3000 + i, t, attacker(), victim(), sport, 22,
                                    _ssh_events(rng), end="rst")
    return packets


def build_web_attack(seed: int = 14) -> list[Packet]:
    """Form guessing plus script-injection style requests against the web app."""
    pre = _preamble(seed)
    rng = random.Random(seed)
    ids = pre._ipid
    packets = list(pre.packets)
    t = 4.0
    sport = 51000
    for i in range(70):
        t += rng.uniform(0.05, 0.3)
        sport += rng.randint(1, 5)
        packets += scripted_session(ids, seed * 1000 + i, t, attacker(29200, 229), victim(247, 502), sport, 80,
                                    _web_login_events(rng), end="none")
    for i in range(70):
        t += rng.uniform(0.05, 0.3)
        sport += rng.randint(1, 5)
        events: list[Event] = [
            ("c", int(_vary(rng, 312, 0.05)), _vary(rng, 4.8, 0.02), False),
            ("s", int(_vary(rng, 4600, 0.06)), _vary(rng, 4.8, 0.02), True),
        ]
        packets += scripted_session(ids, seed * 2000 + i, t, attacker(29200, 247), victim(247, 235), sport, 80,
                                    events, end="none")
    return packets


def build_botnet(seed: int = 15) -> list[Packet]:
    """Short check-ins from a compromised host, with periodic larger tasking pulls."""
    pre = _preamble(seed)
    rng = random.Random(seed)
    ids = pre._ipid
    packets = list(pre.packets)
    t = 4.0
    sport = 49200
    checkin_host = Host(VICTIM_IP, VICTIM_MAC, 8192, 8192, 8192, ttl=128)
    ctrl = Host(ATTACKER_IP, ATTACKER_MAC, 29200, 28960, 229)
    for i in range(120):
        t += _vary(rng, 2.5, 0.12)
        sport += rng.randint(1, 3)
        if i % 4 == 3:
            # Tasking pull: the controller holds the request, then hands over a larger blob.
            tasking_host = Host(VICTIM_IP, VICTIM_MAC, 256, 8192, 501, ttl=128)
            events: list[Event] = [
                ("c", int(_vary(rng, 297, 0.04)), 0.0002, False),
                ("s", int(_vary(rng, 11100, 0.02)), _vary(rng, 6.0, 0.02), True),
            ]
            packets += scripted_session(ids, seed * 1000 + i, t, tasking_host, Host(ATTACKER_IP, ATTACKER_MAC, 29200, 229, 229),
                                        sport, 8080, events, end="none")
        else:
            events = [
                ("c", int(_vary(rng, 142, 0.05)), 0.0015, True),
                ("s", int(_vary(rng, 46, 0.1)), _vary(rng, 0.004, 0.3), True),
            ]
            packets += scripted_session(ids, seed * 1000 + i, t, checkin_host, ctrl, sport, 8080, events, end="fin")
    return packets

def build_mixed(seed: int = 16) -> list[Packet]:
    """Connection flood followed by a port sweep, as one continuous session."""
    first = sorted(build_ddos(seed), key=lambda p: float(p.time))
    second = sorted(build_port_scan(seed + 1), key=lambda p: float(p.time))
    shift = (float(first[-1].time) + 12.0) - float(second[0].time)
    for pkt in second:
        pkt.time = float(pkt.time) + shift
    # Keep the capture within the packet cap: drop the sweep's preamble (ARP/ICMP).
    tcp_second = [p for p in second if p.haslayer(TCP)]
    return first + tcp_second


RECIPES: dict[str, Callable[[], list[Packet]]] = {
    "ddos_flood": build_ddos,
    "port_sweep": build_port_scan,
    "credential_guessing": build_brute_force,
    "web_probe": build_web_attack,
    "controller_checkin": build_botnet,
    "flood_then_sweep": build_mixed,
}


def write_captures(only: Iterable[str] | None = None) -> dict[str, Path]:
    """Write every recipe to ``CAPTURE_DIR`` and return name → path."""
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for name, build in RECIPES.items():
        if only and name not in only:
            continue
        packets = sorted(build(), key=lambda p: float(p.time))[:MAX_PACKETS]
        path = CAPTURE_DIR / f"{name}.pcap"
        wrpcap(str(path), packets, linktype=1)
        out[name] = path
    return out


def evaluate(paths: dict[str, Path]) -> dict[str, dict[str, Any]]:
    """Run each capture through the cascade; return per-capture counts."""
    from app.pcap.pipeline import run_pipeline

    verdicts: dict[str, dict[str, Any]] = {}
    for name, path in paths.items():
        result = run_pipeline(path, max_packets=MAX_PACKETS)
        counts = Counter(result.label_counts)
        flagged = sum(v for k, v in counts.items() if k.upper() != "BENIGN")
        verdicts[name] = {
            "packets": result.packets_parsed,
            "flows": result.flows_built,
            "flagged": flagged,
            "labels": dict(counts.most_common()),
        }
        print(f"{name:22s} pkts={result.packets_parsed:5d} flows={result.flows_built:4d} "
              f"flagged={flagged:4d} {dict(counts.most_common())}")
    return verdicts


SCENARIO_CAPTURES: dict[str, str] = {
    "ddos_portscan_mix": "flood_then_sweep",
    "ddos_flood": "ddos_flood",
    "port_scan": "port_sweep",
    "brute_force": "credential_guessing",
    "web_attack": "web_probe",
    "botnet_beacon": "controller_checkin",
}


def write_manifest(verdicts: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Write ``manifest.json``; a scenario is validated only if the cascade flags it.

    Rule: at least a quarter of the flows are non-BENIGN *and* at least one of
    the scenario's expected labels was actually returned.
    """
    from app.services.lab import _DEFAULT_SCENARIOS

    entries: list[dict[str, Any]] = []
    for scenario in _DEFAULT_SCENARIOS:
        entry = dict(scenario)
        capture = SCENARIO_CAPTURES.get(entry["id"])
        if capture and capture in verdicts:
            verdict = verdicts[capture]
            entry["quick_pcap"] = f"lab/captures/{capture}.pcap"
            entry["max_packets"] = min(MAX_PACKETS, ((verdict["packets"] // 250) + 1) * 250)
            labels = set(verdict["labels"])
            share = verdict["flagged"] / max(1, verdict["flows"])
            entry["validated"] = bool(share >= 0.25 and labels & set(entry.get("expected_labels", [])))
            # ~8 flows/s in the UI: allow the whole capture to stream.
            entry["duration_s"] = max(int(entry.get("duration_s", 60)), int(verdict["flows"] / 8) + 15)
        entries.append(entry)
    MANIFEST_PATH.write_text(json.dumps({"scenarios": entries}, indent=2), encoding="utf-8")
    return entries

def main() -> None:
    parser = argparse.ArgumentParser(description="Build Quick Lab captures")
    parser.add_argument("--only", nargs="*", help="Recipe names to build")
    parser.add_argument("--no-manifest", action="store_true", help="Skip writing manifest.json")
    args = parser.parse_args()
    paths = write_captures(args.only)
    verdicts = evaluate(paths)
    if not args.no_manifest and not args.only:
        for entry in write_manifest(verdicts):
            print(f"manifest {entry['id']:20s} validated={entry['validated']}")


if __name__ == "__main__":
    main()
