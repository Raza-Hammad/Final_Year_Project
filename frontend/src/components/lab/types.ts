/** Attack Lab shared types. */

export interface LabScenario {
  id: string;
  name: string;
  category: string;
  blurb: string;
  expected_labels: string[];
  provenance: string;
  duration_s: number;
  live_commands: string[];
  quick_available: boolean;
  validated: boolean;
  experimental: boolean;
}

export interface LabCatalogue {
  scenarios: LabScenario[];
  checklist: string[];
  isolation_note: string;
}

export interface SensorStatus {
  enabled: boolean;
  sensor_online: boolean;
  seconds_since_chunk: number | null;
  chunks_processed: number;
  flows_classified: number;
  attacks_detected: number;
  last_error: string | null;
}

export interface LabStatus {
  sensor: SensorStatus;
  active_session: string | null;
}

export type LabSessionState = 'running' | 'completed' | 'stopped' | 'failed';

export interface LabSession {
  id: string;
  scenario_id: string;
  track: 'quick';
  state: LabSessionState;
  started_at: string;
  elapsed_seconds?: number;
  flows_total?: number;
  flows_classified?: number;
  threats_found?: number;
  tier_breakdown?: Record<string, number>;
  error?: string | null;
}

/** A detection as the theater sees it (from the lattice bus). */
export interface LabEvent {
  id: number;
  at: number;
  label: string;
  isAttack: boolean;
  severity: string;
  confidence: number;
  tier: number;
  srcIp: string;
  dstIp: string;
}

export type LabTrack = 'quick' | 'live';
