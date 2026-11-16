# Cascadyx Isolated PCAP Replay (VirtualBox Two-VM Guide)

> **Public UX vs methodology.** In the app this feature is the **Attack Lab** (`/lab`). The UI says *lab session*, never PCAP/replay/recorded. This document is the methodology reference and keeps the technical truth:
>
> - **Quick Lab** → `POST /api/lab/sessions` wraps `simulator_engine.start_replay` on a **captured** session listed in `data/raw/lab/manifest.json` (defaults are built in; entries are `id`, `name`, `category`, `quick_pcap`, `provenance`, `expected_labels`, `validated`, `duration_s`, `max_packets`, `live_commands`).
> - **Live Lab** → a Sensor VM runs `tcpdump -G 3 -w data/raw/lab/live/chunk-%s.pcap`; the sensor watcher (`LAB_SENSOR_WATCH=1`, or the admin toggle `POST /api/lab/live/enable`) classifies each finished chunk and broadcasts detections (`source_scenario = lab:live`).
> - Capture checklist for new recipes: one file per attack type, Ethernet link type, full TCP handshakes, 20–60 s, within the 5000-packet cap, plus a benign baseline. Run it through `/api/pcap/analyze` and record what the cascade actually says before flipping `validated`.
> - The old capture-path textbox and upload panel were removed from the Simulator page; `/api/simulate/replay/*` and `/api/pcap/analyze` remain for developers and tests.

**Purpose:** Demonstrate proposal-aligned “live” traffic detection **without** attacking any real network. Cascadyx classifies **recorded** CIC-IDS2017 traffic that you replay and capture inside an isolated VirtualBox lab, then feed into the Phase 1 PCAP pipeline.

**Safety (non-negotiable):**

- Cascadyx **never** launches live attack tools (no nmap, Metasploit, exploit kits, credential stuffing against real hosts).
- Replay = `tcpreplay` of a **CIC-IDS2017** PCAP slice on a VirtualBox **Internal Network**.
- Detection = host Cascadyx (`POST /api/simulate/replay/start` or Simulator → Live Replay).
- Do **not** bridge the Internal Network to your LAN/Wi‑Fi.

---

## Architecture

```
┌──────────────────────────── VirtualBox Internal Network ────────────────────────────┐
│                                                                                     │
│   VM-A “Replayer”                         VM-B “Sensor”                             │
│   ───────────────                         ─────────────                             │
│   CIC PCAP slice on disk                  tcpdump / Wireshark                       │
│   tcpreplay → eth0 (intnet)  ──────────►  capture → /tmp/capture.pcap               │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ copy capture.pcap (Shared Folder / scp / USB)
                                      ▼
                         Windows host: data/raw/captures/
                                      │
                                      ▼
                    Cascadyx Live Replay → cascade → alerts + WebSocket
```

---

## Prerequisites (host)

| Item | Notes |
|------|--------|
| Oracle VirtualBox | Not installed yet on this machine — install from [virtualbox.org](https://www.virtualbox.org/) |
| Cascadyx backend + frontend | Running on the Windows host (`uvicorn` + `npm run dev`) |
| CIC-IDS2017 PCAP | Under `data/raw/PCAPs/` (e.g. `Friday-WorkingHours.pcap`). **Never** feed the full multi‑GB day file into Cascadyx in one shot — use a tiny slice for demos |
| Disk | ~20–40 GB free for two lightweight Linux VMs |

Recommended guest OS: **Ubuntu Server 22.04** (or Debian) for both VMs — small, CLI-friendly.

---

## Step 0 — Install VirtualBox (host)

1. Download and install **Oracle VM VirtualBox** (+ Extension Pack optional).
2. Confirm `VBoxManage --version` works in a new PowerShell window.
3. Create a folder for VM disks, e.g. `D:\VMs\CascadyxLab\`.

---

## Step 1 — Create an Internal Network

You will **not** use NAT-only for the replay path. Use VirtualBox **Internal Network** so packets stay between the two guests.

1. Open VirtualBox → prefer creating the network implicitly via each VM’s adapter (below).
2. Network name to use everywhere: **`cascadyx_intnet`**.
3. Optional Host-Only adapter: only if you want SSH from the Windows host into guests for file copy. Host-Only is **separate** from the Internal Network used for replay.

Adapter roles per VM:

| Adapter | Attachment | Purpose |
|---------|------------|---------|
| Adapter 1 | Internal Network `cascadyx_intnet` | Replay / capture traffic |
| Adapter 2 (optional) | Host-Only or NAT | SSH / package install |

---

## Step 2 — Create VM-A “Replayer”

1. New VM → Ubuntu Server → ≥2 GB RAM, ≥20 GB disk.
2. Settings → Network → Adapter 1:
   - Enable Network Adapter
   - Attached to: **Internal Network**
   - Name: `cascadyx_intnet`
   - Promiscuous Mode: **Allow All** (helps some capture setups)
3. (Optional) Adapter 2 → NAT for `apt install`.
4. Install Ubuntu. Create user `cascadyx`.
5. Inside the guest (with NAT available), install tools:

```bash
sudo apt update
sudo apt install -y tcpreplay tcpdump wireshark-common
```

6. Assign a static IP on the Internal Network interface (example `enp0s3` — check with `ip link`):

```bash
# Example Netplan snippet — adjust interface name
sudo tee /etc/netplan/99-cascadyx.yaml >/dev/null <<'EOF'
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: false
      addresses: [192.168.56.10/24]
EOF
sudo netplan apply
```

---

## Step 3 — Create VM-B “Sensor”

1. Clone VM-A or create a second Ubuntu Server VM the same way.
2. Adapter 1 → Internal Network `cascadyx_intnet`, Promiscuous Mode **Allow All**.
3. Static IP on the same subnet, e.g. `192.168.56.20/24`.
4. Install capture tools:

```bash
sudo apt update
sudo apt install -y tcpdump wireshark-common
```

5. Verify Layer-2 reachability from Replayer:

```bash
# On Replayer
ping -c 3 192.168.56.20
```

If ping fails, fix Internal Network names, IPs, and firewall (`sudo ufw disable` temporarily in the lab only).

---

## Step 4 — Prepare a **tiny** CIC PCAP slice (host)

Full CIC day PCAPs are multi‑GB. Cascadyx Live Replay and `/api/pcap/analyze` cap packet counts; demos should use a **small** file.

### Option A — Slice on the host (recommended if Wireshark/editcap available)

```powershell
# Example with Wireshark's editcap (adjust paths)
editcap -c 500 `
  "D:\Final_Year_Project\data\raw\PCAPs\Friday-WorkingHours.pcap" `
  "D:\Final_Year_Project\data\raw\captures\friday_slice_500.pcap"
```

### Option B — Copy a small existing capture

Place any small `.pcap` / `.pcapng` under:

```text
D:\Final_Year_Project\data\raw\captures\
```

### Copy the slice into VM-A

Use a VirtualBox **Shared Folder**, `scp` over Host-Only, or USB:

```bash
# On Replayer — example shared-folder mount
ls /media/sf_captures/
sudo cp /media/sf_captures/friday_slice_500.pcap ~/friday_slice_500.pcap
```

---

## Step 5 — Capture on VM-B, replay on VM-A

### On Sensor (VM-B) — start capture first

```bash
# Replace eth0/enp0s3 with your Internal Network interface
sudo tcpdump -i enp0s3 -w /tmp/cascadyx_capture.pcap
```

Leave this running.

### On Replayer (VM-A) — replay recorded CIC traffic

```bash
# --intf1 = Internal Network NIC
sudo tcpreplay --intf1=enp0s3 --stats=1 ~/friday_slice_500.pcap
```

When `tcpreplay` finishes, stop `tcpdump` on the Sensor with `Ctrl+C`.

**What this proves for viva:** packets physically crossed a virtual wire; Cascadyx still only analyzes a **file**, never a live exploit session.

---

## Step 6 — Copy capture to the Windows host

Copy `/tmp/cascadyx_capture.pcap` from VM-B to:

```text
D:\Final_Year_Project\data\raw\captures\vbox_capture.pcap
```

Shared Folder example (Sensor):

```bash
sudo cp /tmp/cascadyx_capture.pcap /media/sf_captures/vbox_capture.pcap
```

Confirm on the host:

```powershell
Get-Item D:\Final_Year_Project\data\raw\captures\vbox_capture.pcap
```

---

## Step 7 — Run Cascadyx Live Replay (host)

### Backend

```powershell
cd D:\Final_Year_Project\backend
.\venv\Scripts\Activate.ps1
# Prefer the AppLocker-safe interpreter if needed:
# D:\Python\python.exe -m uvicorn app.main:app --reload --port 8000
uvicorn app.main:app --reload --port 8000
```

### Start Live Replay (API)

```powershell
# Login first; then:
$headers = @{ Authorization = "Bearer $TOKEN"; "Content-Type" = "application/json" }
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8000/api/simulate/replay/start `
  -Headers $headers `
  -Body '{"pcap_path":"captures/vbox_capture.pcap","max_packets":500,"rate":10,"duration_seconds":60}'
```

### Stop

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8000/api/simulate/replay/stop -Headers $headers
```

### Status (CSV vs replay)

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/simulate/status -Headers $headers
```

Important status fields:

| Field | Meaning |
|-------|---------|
| `mode` | `idle` \| `csv` \| `replay` |
| `source` | Scenario id (CSV) or absolute PCAP path (replay) |
| `packets_parsed` | Packets read from the capture (replay) |
| `flows_built` | Bidirectional flows aggregated (replay) |
| `packets_sent` | Flows streamed through the cascade |
| `safety_banner` | Reminder that this is recorded-traffic only |

### UI

1. Open the Cascadyx frontend → **Threat Simulator**.
2. Use the **Live Replay (Isolated PCAP)** panel.
3. Path relative to `data/raw/`, e.g. `captures/vbox_capture.pcap`.
4. Keep **max packets** small (≤500 for demos). Rate stays near the honest ~44 flows/s cascade cap.
5. Watch **Live Detection** / WebSocket for alerts.

One-shot analysis (no streaming) remains available as:

```http
POST /api/pcap/analyze
{"pcap_path":"captures/vbox_capture.pcap","max_packets":200}
```

---

## How students learn with Live Replay

Use this path in class or viva when you want students to **see** detection while understanding **what** is happening — without attacking a real network.

1. **Before you press Start** — On Threat Simulator → Live Replay, read **What you will learn**. In plain words: two VirtualBox VMs share a private Internal Network; one replays a recorded CIC PCAP slice; the other captures packets to a file; Cascadyx on the Windows host streams that file through the cascade. The safety note is real: Cascadyx never launches live attack tools.
2. **While it is running** — Open **Live Detection** next to the Simulator. The **What you're seeing now** coach explains severity colors, why the Living Lattice pulses, and cascade tiers (Tier‑1 fast screen → Tier‑2 check → Tier‑3 for hard cases). Live Status on Simulator still shows packets parsed, flows built, and tier bars.
3. **If the capture looks quiet** — Files such as `captures/vbox_capture.pcap` are often mostly **BENIGN**. That is honest lab traffic, not a broken product. Students still learn the full pipeline (packets → flows → cascade → feed). For loud Critical alerts in the same session, run a CSV scenario (e.g. DDoS / Port Scan) after stopping replay.
4. **After the first alerts** — Optional tips nudge students to click **Explain**, check **Alert History**, and ask the **AI Assistant** once (quota is limited — use it for one clear question). Dismiss tips if you already know the flow.
5. **What to say in viva** — “CSV simulation injects labeled CIC rows; Live Replay classifies an isolated VirtualBox capture of recorded traffic. Same cascade, safer story.”

---

## Step 8 — Demo checklist (viva)

- [ ] VirtualBox Internal Network name matches on both VMs (`cascadyx_intnet`)
- [ ] `tcpreplay` completed without bridging to the LAN
- [ ] Capture file landed under `data/raw/captures/`
- [ ] Cascadyx status shows `mode: "replay"` while running
- [ ] Alerts appear with `source_scenario: "isolated_replay"`
- [ ] You can explain: **CSV sim** = labeled CIC rows; **Live Replay** = PCAP→flows→cascade from an isolated capture
- [ ] Student coach panels: **What you will learn** (arming) + **What you're seeing now** (running) on Simulator / Live Detection

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Empty capture | Sensor promiscuous mode; correct NIC; start tcpdump **before** tcpreplay |
| `pcap_path must stay under DATA_RAW_DIR` | Put files under `data/raw/` (e.g. `captures/…`); no absolute paths outside the tree |
| Replay rejected — already running | `POST /api/simulate/stop` or `/api/simulate/replay/stop` |
| Scapy / ImportError | Use `backend\venv` built with `D:\Python\python.exe --system-site-packages` |
| Huge runtime / memory | Lower `max_packets`; never point Live Replay at a full 8 GB day PCAP |
| Feature mismatch vs CICFlowMeter | Expected — Phase 1 documents approximations; cascade still classifies |

---

## Residual risks (honest)

1. **Feature drift:** Scapy-derived features approximate CICFlowMeter; labels on VirtualBox captures are not ground-truth CIC labels.
2. **Web-Attack / scarce classes:** Cascade limits from mid evaluation still apply.
3. **Operator error:** Misconfigured adapters (Bridged) could leak traffic — always verify **Internal Network**.
4. **AppLocker host:** Prefer `D:\Python\python.exe` / the rebuilt venv; some pip scripts may still break under policy.

---

## Related project paths

| Path | Role |
|------|------|
| `backend/app/pcap/` | Phase 1 parse → flow → features |
| `backend/app/simulator/replay.py` | Live Replay runner |
| `POST /api/simulate/replay/start\|stop` | Streaming replay API |
| `POST /api/pcap/analyze` | One-shot PCAP analysis |
| `data/raw/captures/` | Drop zone for VirtualBox captures |
| `data/raw/PCAPs/` | Original CIC day captures (slice before use) |
