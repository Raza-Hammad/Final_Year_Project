/**
 * latticeBus — tiny pub/sub that carries raw WebSocket detections straight to
 * the Observatory canvas, bypassing React state entirely.
 *
 * Why: the previous design pushed every flow through a 300 ms throttled
 * `setState`, which re-rendered the whole console and made 40 flows/s look like
 * bursty batches. The bus lets the canvas stagger spawns itself.
 */
import type { DetectionData } from '../../dashboard/types';

export interface LatticeEvent {
  id: number;
  /** Wall-clock arrival time (ms). */
  at: number;
  label: string;
  isAttack: boolean;
  severity: string;
  confidence: number;
  tier: number;
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  scenario?: string;
  raw: DetectionData;
}

type Listener = (event: LatticeEvent) => void;

const listeners = new Set<Listener>();
let seq = 0;
let lastAt = 0;
const recent: LatticeEvent[] = [];
const RECENT_MAX = 40;

/** Convert a backend detection payload into a bus event and fan it out. */
export function publishDetection(data: DetectionData): void {
  const label = data.predicted_label || 'BENIGN';
  const event: LatticeEvent = {
    id: ++seq,
    at: Date.now(),
    label,
    isAttack: label.toUpperCase() !== 'BENIGN',
    severity: data.severity || 'Info',
    confidence: data.confidence ?? 0,
    tier: data.tier ?? 1,
    srcIp: data.source_ip || 'unknown',
    dstIp: data.dest_ip || 'unknown',
    srcPort: data.source_port || 0,
    dstPort: data.dest_port || 0,
    scenario: data.source_scenario,
    raw: data,
  };
  lastAt = event.at;
  recent.push(event);
  if (recent.length > RECENT_MAX) recent.shift();
  listeners.forEach((fn) => fn(event));
}

export function subscribeLattice(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Timestamp (ms) of the most recent event; 0 when none seen this session. */
export function lastLatticeEventAt(): number {
  return lastAt;
}

/** Snapshot of the last few events (oldest first) for reduced-motion logs. */
export function recentLatticeEvents(): LatticeEvent[] {
  return recent.slice();
}
