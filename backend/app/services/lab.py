"""Attack Lab support: scenario manifest and the Live Lab sensor watcher.

Developer note (kept for viva / docs, not part of the public UI wording):

* **Quick Lab** streams a capture file from ``data/raw/lab/captures/`` through
  the same parse → feature-extract → cascade pipeline as everything else.
  The files are built by ``app.ml.build_lab_captures``; verdicts are whatever
  the cascade returns for them, and ``validated`` only reflects that run.
* **Live Lab** watches ``data/raw/lab/live/`` for rotating capture chunks written
  by a Sensor VM on an isolated VirtualBox Internal Network. Detections appear
  only when that sensor really delivers traffic.

Cascadyx itself never launches attack tools.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

LAB_DIR = Path(settings.DATA_RAW_DIR) / "lab"
LIVE_DIR = LAB_DIR / "live"
MANIFEST_PATH = LAB_DIR / "manifest.json"

PRE_START_CHECKLIST: tuple[str, ...] = (
    "Both VMs are on a VirtualBox Internal Network (not Bridged, not NAT with port-forwarding).",
    "The Host-Only / Bridged adapters are disabled on the Attacker VM.",
    "The Victim VM holds no real data and no credentials you care about.",
    "You have supervisor approval for running attack tools in the lab.",
)

# Built-in scenario catalogue — data/raw/lab/manifest.json entries override these by ``id``.
_DEFAULT_SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "ddos_portscan_mix",
        "name": "DDoS and port-scan wave",
        "category": "Volumetric",
        "blurb": "A burst of connection-flood traffic followed by a sweep across many ports.",
        "quick_pcap": "lab/captures/flood_then_sweep.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["DDoS", "PortScan"],
        "validated": True,
        "duration_s": 90,
        "max_packets": 2000,
        "live_commands": [
            "sudo hping3 -S --flood -p 80 <VICTIM_IP>",
            "sudo nmap -sS -p 1-2000 <VICTIM_IP>",
        ],
    },
    {
        "id": "ddos_flood",
        "name": "DDoS connection flood",
        "category": "Volumetric",
        "blurb": "Dozens of clients pile onto the web server and hold their connections open.",
        "quick_pcap": "lab/captures/ddos_flood.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["DDoS"],
        "validated": True,
        "duration_s": 60,
        "max_packets": 1500,
        "live_commands": ["sudo hping3 -S --flood -p 80 <VICTIM_IP>"],
    },
    {
        "id": "port_scan",
        "name": "Port scan sweep",
        "category": "Reconnaissance",
        "blurb": "A fast half-open sweep across the low port range on the Victim VM.",
        "quick_pcap": "lab/captures/port_sweep.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["PortScan"],
        "validated": True,
        "duration_s": 75,
        "max_packets": 1500,
        "live_commands": ["sudo nmap -sS -p 1-1024 <VICTIM_IP>"],
    },
    {
        "id": "brute_force",
        "name": "Credential brute force",
        "category": "Access",
        "blurb": "Rapid repeated web-login guessing against HTTP authentication.",
        "quick_pcap": "lab/captures/credential_guessing.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["Web Attack - Brute Force"],
        "validated": True,
        "duration_s": 60,
        "max_packets": 2500,
        "live_commands": ["hydra -l victim -P wordlist.txt ssh://<VICTIM_IP> -t 4"],
    },
    {
        "id": "web_attack",
        "name": "Web application probing",
        "category": "Application",
        "blurb": "Login guessing and script-injection style requests against a web app.",
        "quick_pcap": "lab/captures/web_probe.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["Web Attack - XSS", "Web Attack - Brute Force"],
        "validated": True,
        "duration_s": 60,
        "max_packets": 2500,
        "live_commands": ["nikto -h http://<VICTIM_IP>"],
    },
    {
        "id": "botnet_beacon",
        "name": "Botnet beaconing",
        "category": "Command & control",
        "blurb": "Periodic low-volume check-ins from a compromised host, with the odd tasking pull.",
        "quick_pcap": "lab/captures/controller_checkin.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": ["Bot"],
        "validated": False,
        "duration_s": 90,
        "max_packets": 2000,
        "live_commands": ["while true; do curl -s http://<VICTIM_IP>/beacon; sleep 5; done"],
    },
    {
        "id": "vbox_session",
        "name": "Isolated VM session",
        "category": "Mixed",
        "blurb": "Everyday traffic between the lab VMs as the Sensor saw it.",
        "quick_pcap": "captures/vbox_capture.pcap",
        "provenance": "Isolated lab network · sensor view",
        "expected_labels": [],
        "validated": False,
        "duration_s": 45,
        "max_packets": 500,
        "live_commands": ["ping -c 20 <VICTIM_IP>", "curl -s http://<VICTIM_IP>/ > /dev/null"],
    },
]

def load_manifest() -> list[dict[str, Any]]:
    """Return lab scenarios (manifest.json entries replace defaults by ``id``)."""
    scenarios: dict[str, dict[str, Any]] = {s["id"]: dict(s) for s in _DEFAULT_SCENARIOS}
    if MANIFEST_PATH.is_file():
        try:
            payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            for entry in payload.get("scenarios", payload if isinstance(payload, list) else []):
                if isinstance(entry, dict) and entry.get("id"):
                    merged = {**scenarios.get(entry["id"], {}), **entry}
                    scenarios[merged["id"]] = merged
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Ignoring unreadable lab manifest %s: %s", MANIFEST_PATH, exc)
    return list(scenarios.values())


def resolve_quick_path(scenario: dict[str, Any]) -> Optional[Path]:
    """Resolve a scenario's capture under ``DATA_RAW_DIR`` (None if absent/unsafe)."""
    rel = scenario.get("quick_pcap")
    if not rel:
        return None
    raw_root = Path(settings.DATA_RAW_DIR).resolve()
    candidate = (raw_root / rel).resolve() if not Path(rel).is_absolute() else Path(rel).resolve()
    try:
        candidate.relative_to(raw_root)
    except ValueError:
        return None
    if candidate.suffix.lower() not in {".pcap", ".pcapng"} or not candidate.is_file():
        return None
    return candidate


def public_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    """Shape a manifest entry for the UI (no filesystem paths leaked)."""
    quick_ok = resolve_quick_path(scenario) is not None
    validated = bool(scenario.get("validated"))
    return {
        "id": scenario["id"],
        "name": scenario.get("name", scenario["id"]),
        "category": scenario.get("category", ""),
        "blurb": scenario.get("blurb", ""),
        "expected_labels": scenario.get("expected_labels", []),
        "provenance": scenario.get("provenance", ""),
        "duration_s": scenario.get("duration_s", 60),
        "live_commands": scenario.get("live_commands", []),
        "quick_available": quick_ok,
        "validated": validated,
        "experimental": not validated,
    }


@dataclass
class SensorWatcher:
    """Polls ``LIVE_DIR`` for finished capture chunks and runs them through the cascade."""

    poll_seconds: float = 2.0
    settle_seconds: float = 2.5
    enabled: bool = False
    last_chunk_at: Optional[float] = None
    chunks_processed: int = 0
    flows_classified: int = 0
    attacks_detected: int = 0
    last_error: Optional[str] = None
    _seen: dict[str, tuple[float, int]] = field(default_factory=dict)
    _task: Optional["asyncio.Task[None]"] = None

    def status(self) -> dict[str, Any]:
        """Return a JSON-safe status block."""
        now = time.time()
        online = self.enabled and self.last_chunk_at is not None and now - self.last_chunk_at < 20
        return {
            "enabled": self.enabled,
            "sensor_online": online,
            "seconds_since_chunk": None if self.last_chunk_at is None else int(now - self.last_chunk_at),
            "chunks_processed": self.chunks_processed,
            "flows_classified": self.flows_classified,
            "attacks_detected": self.attacks_detected,
            "last_error": self.last_error,
        }

    def start(self) -> None:
        """Begin polling (idempotent). Existing files are treated as already seen."""
        if self.enabled and self._task and not self._task.done():
            return
        LIVE_DIR.mkdir(parents=True, exist_ok=True)
        for path in self._candidates():
            st = path.stat()
            self._seen[path.name] = (st.st_mtime, st.st_size)
        self.enabled = True
        self.last_error = None
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        """Stop polling."""
        self.enabled = False
        if self._task:
            self._task.cancel()
            self._task = None

    def _candidates(self) -> list[Path]:
        if not LIVE_DIR.is_dir():
            return []
        return sorted(p for p in LIVE_DIR.iterdir() if p.suffix.lower() in {".pcap", ".pcapng"})

    async def _run(self) -> None:
        from app.pcap.pipeline import API_ABSOLUTE_MAX_PACKETS, analyze_pcap

        while self.enabled:
            try:
                now = time.time()
                for path in self._candidates():
                    st = path.stat()
                    key = (st.st_mtime, st.st_size)
                    if self._seen.get(path.name) == key or st.st_size < 64:
                        continue
                    if now - st.st_mtime < self.settle_seconds:
                        continue  # still being written by the sensor
                    self._seen[path.name] = key
                    summary = await analyze_pcap(
                        path,
                        max_packets=API_ABSOLUTE_MAX_PACKETS,
                        persist_alerts=True,
                        broadcast=True,
                        source_scenario="lab:live",
                    )
                    self.last_chunk_at = time.time()
                    self.chunks_processed += 1
                    self.flows_classified += int(summary.get("flows_built", 0))
                    self.attacks_detected += int(summary.get("alerts_persisted", 0))
            except asyncio.CancelledError:
                break
            except Exception as exc:  # keep polling; surface the last error
                self.last_error = str(exc)[:200]
                logger.warning("Sensor watcher error: %s", exc)
            await asyncio.sleep(self.poll_seconds)


sensor_watcher = SensorWatcher()
