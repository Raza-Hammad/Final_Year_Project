/**
 * One-shot mechanical split of the monolithic Dashboard.tsx into
 * types / constants / utils / provider / page shells.
 *
 * Run from frontend/: node scripts/split-dashboard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dashPath = path.join(src, 'pages', 'Dashboard.tsx');
const raw = fs.readFileSync(dashPath, 'utf8');
const lines = raw.split(/\r?\n/);

function sliceLines(start, endInclusive) {
  return lines.slice(start - 1, endInclusive).join('\n');
}

function write(rel, content) {
  const full = path.join(src, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel, `(${content.split('\n').length} lines)`);
}

// --- types ---
write(
  'dashboard/types.ts',
  `/** Shared Cascadyx dashboard / telemetry types. */
export type TabId = 'live' | 'simulator' | 'history' | 'insights' | 'ai';

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

export interface SimStatus {
  running: boolean;
  scenario: string | null;
  rate: number;
  duration_seconds: number | null;
  elapsed_seconds: number;
  packets_sent: number;
  attacks_detected: number;
  tier_breakdown: Record<string, number>;
}

export interface NavItem {
  id: TabId;
  label: string;
  icon: 'live' | 'simulator' | 'history' | 'insights' | 'ai';
  color: string;
  soft: string;
  path: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
`,
);

write(
  'dashboard/constants.ts',
  `import type { NavGroup } from './types';

export const CLASS_LABELS = [
  "BENIGN", "Bot", "DDoS", "DoS GoldenEye", "DoS Hulk",
  "DoS Slowhttptest", "DoS slowloris", "FTP-Patator", "Heartbleed", "Infiltration",
  "PortScan", "SSH-Patator", "Web Attack - Brute Force", "Web Attack - Sql Injection", "Web Attack - XSS"
];

export const CLASS_ABBREVIATIONS = [
  "BNG", "BOT", "DDS", "DGE", "DHK",
  "DST", "DSL", "FTP", "HBD", "INF",
  "PSC", "SSH", "WBF", "WSI", "WXS"
];

/** Honest single-thread cascade throughput (~44 flows/s) — Phase 0 rate UX. */
export const CASCADE_THROUGHPUT_CAPS = {
  uiMax: 44,
  maxPreset: 40,
} as const;

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Monitor', items: [
    { id: 'live', label: 'Live Detection', icon: 'live', color: '--sr-accent', soft: '--sr-accent-soft', path: '/' },
  ]},
  { label: 'Operate', items: [
    { id: 'simulator', label: 'Threat Simulator', icon: 'simulator', color: '--sr-nav-simulator', soft: '--sr-nav-simulator-soft', path: '/simulator' },
  ]},
  { label: 'Analyze', items: [
    { id: 'history', label: 'Alert History', icon: 'history', color: '--sr-nav-history', soft: '--sr-nav-history-soft', path: '/history' },
    { id: 'insights', label: 'Model Insights', icon: 'insights', color: '--sr-accent-2', soft: '--sr-accent-2-soft', path: '/insights' },
  ]},
  { label: 'Assist', items: [
    { id: 'ai', label: 'AI Assistant', icon: 'ai', color: '--sr-nav-ai', soft: '--sr-nav-ai-soft', path: '/ai' },
  ]},
];

export const TAB_FROM_PATH: Record<string, import('./types').TabId> = {
  '/': 'live',
  '/simulator': 'simulator',
  '/history': 'history',
  '/insights': 'insights',
  '/ai': 'ai',
};

export const PATH_FROM_TAB: Record<import('./types').TabId, string> = {
  live: '/',
  simulator: '/simulator',
  history: '/history',
  insights: '/insights',
  ai: '/ai',
};

export const SCENARIO_DETAILS: Record<string, { type: string, tier: string, vector: string, severity: string, color: string }> = {
  dos: {
    type: "Network",
    tier: "Mostly T-1",
    vector: "Floods target systems with malformed packets to consume CPU/memory resources.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  ddos: {
    type: "Network",
    tier: "Mostly T-1",
    vector: "Uses distributed botnet nodes to overwhelm bandwidth capacity.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  brute_force: {
    type: "Application",
    tier: "Mostly T-1",
    vector: "Systematically tests username/password combinations over FTP or SSH.",
    severity: "High",
    color: "var(--sr-sev-high)"
  },
  web_attacks: {
    type: "Exploit",
    tier: "Mixed T-1/T-2",
    vector: "Injects malicious SQL queries or XSS scripts to compromise web databases.",
    severity: "High",
    color: "var(--sr-sev-high)"
  },
  port_scan: {
    type: "Recon",
    tier: "Mostly T-1",
    vector: "Scans target ports to identify open network entry points and running services.",
    severity: "Medium",
    color: "var(--sr-sev-medium)"
  },
  bot: {
    type: "Application",
    tier: "Mostly T-1",
    vector: "Establishes unauthorized Command & Control (C2) communication channels.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  infiltration: {
    type: "Exploit",
    tier: "Mixed T-1/T-2/T-3",
    vector: "Exploits system vulnerabilities to gain internal footholds and move laterally.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  heartbleed: {
    type: "Exploit",
    tier: "Mostly T-1",
    vector: "Exploits CVE-2014-0160 in OpenSSL — leaks up to 64KB of server memory per request.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  mixed_attack: {
    type: "Network",
    tier: "Mixed T-1/T-2/T-3",
    vector: "Combines reconnaissance, exploitation, and flooding in a multi-vector attack campaign.",
    severity: "Critical",
    color: "var(--sr-sev-critical)"
  },
  benign_baseline: {
    type: "Nominal",
    tier: "None",
    vector: "Generates normal, nominal user traffic with no malicious components.",
    severity: "Info",
    color: "var(--sr-sev-info)"
  }
};

/** Phase 4 extension point — PCAP analyze UI can mount beside simulator controls. */
export const PCAP_UI_EXTENSION = {
  enabled: false,
  placeholderLabel: 'PCAP analyze (coming soon)',
} as const;
`,
);

write(
  'dashboard/utils.ts',
  `/** Shared dashboard helpers. */

export function extractErrorDetail(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail;
  }
  return undefined;
}

export function groupConversationsByDate<T extends { updated_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const today: T[] = [];
  const yesterdayItems: T[] = [];
  const older: T[] = [];

  for (const item of items) {
    const d = new Date(item.updated_at).toDateString();
    if (d === todayStr) today.push(item);
    else if (d === yesterdayStr) yesterdayItems.push(item);
    else older.push(item);
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterdayItems },
    { label: 'Older', items: older },
  ].filter((g) => g.items.length > 0);
}

const SEQ_RAMP_STOPS: [number, [number, number, number]][] = [
  [0, [205, 226, 251]],
  [0.33, [109, 167, 236]],
  [0.66, [37, 106, 191]],
  [1, [13, 54, 107]],
];

export function seqRampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SEQ_RAMP_STOPS.length - 1; i++) {
    const [t0, c0] = SEQ_RAMP_STOPS[i];
    const [t1, c1] = SEQ_RAMP_STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const local = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * local);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * local);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * local);
      return \`rgb(\${r}, \${g}, \${b})\`;
    }
  }
  const last = SEQ_RAMP_STOPS[SEQ_RAMP_STOPS.length - 1][1];
  return \`rgb(\${last[0]}, \${last[1]}, \${last[2]})\`;
}

export function compactCount(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function makeTruncatedYAxisTick(maxChars: number) {
  const TruncatedTick = (props: { x?: number; y?: number; payload?: { value?: unknown } }) => {
    const { x = 0, y = 0, payload } = props;
    const full = String(payload?.value ?? '');
    const text = full.length > maxChars ? \`\${full.slice(0, maxChars - 1)}…\` : full;
    return (
      // @ts-expect-error SVG element in helper used by Recharts
      <g transform={\`translate(\${x},\${y})\`}>
        <title>{full}</title>
        <text x={0} y={0} dy={3} textAnchor="end" fontSize={9} fill="var(--sr-text-muted)">{text}</text>
      </g>
    );
  };
  return TruncatedTick;
}
`,
);

console.log('Base modules written. Provider/pages generated by follow-up transform.');
console.log('Dashboard line count:', lines.length);
