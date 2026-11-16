/** Shared Cascadyx dashboard / telemetry types. */
export type TabId = 'live' | 'simulator' | 'lab' | 'history' | 'insights' | 'ai' | 'reviews';

export interface TopFeature {
  feature: string;
  value: number;
  importance: number;
  impact: number;
  benign_avg?: number;
}

export interface DetectionData {
  predicted_label: string;
  confidence: number;
  tier: number;
  tier_name: string;
  top_features: TopFeature[];
  alert_id?: number;
  source_scenario?: string;
  raw_features?: Record<string, any>;
  benign_averages?: Record<string, number>;
  severity?: string;
  source_ip?: string;
  dest_ip?: string;
  source_port?: number;
  dest_port?: number;
}

export interface TelemetryEvent {
  event: 'heartbeat' | 'detection';
  timestamp: string;
  data?: DetectionData;
}

export interface AttackVector {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
  isAttack: boolean;
  severity: string;
  source_ip: string;
  dest_ip: string;
  source_port: number;
  dest_port: number;
  confidence: number;
  createdAt: number;
}

export interface AlertLog {
  id: number;
  timestamp: string;
  predicted_label: string;
  confidence: number;
  tier: number;
  source_scenario: string;
  raw_features: Record<string, any>;
  severity?: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string | null;
}

export type SimMode = 'idle' | 'csv' | 'replay';

export interface SimStatus {
  running: boolean;
  /** Distinguishes CSV scenario streaming vs isolated lab sessions. */
  mode?: SimMode;
  /** Scenario id (csv) or lab session source (replay). */
  source?: string | null;
  scenario: string | null;
  rate: number;
  duration_seconds: number | null;
  elapsed_seconds: number;
  packets_sent: number;
  packets_parsed?: number;
  flows_built?: number;
  attacks_detected: number;
  tier_breakdown: Record<string, number>;
  replay_error?: string | null;
  safety_banner?: string;
}

export interface NavItem {
  id: TabId;
  label: string;
  icon: 'live' | 'simulator' | 'lab' | 'history' | 'insights' | 'ai' | 'reviews';
  color: string;
  soft: string;
  path: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
