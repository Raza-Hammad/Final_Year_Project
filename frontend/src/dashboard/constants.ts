import type { NavGroup } from './types';

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
    { id: 'lab', label: 'Attack Lab', icon: 'lab', color: '--sr-nav-lab', soft: '--sr-nav-lab-soft', path: '/lab' },
  ]},
  { label: 'Analyze', items: [
    { id: 'history', label: 'Alert History', icon: 'history', color: '--sr-nav-history', soft: '--sr-nav-history-soft', path: '/history' },
    { id: 'insights', label: 'Model Insights', icon: 'insights', color: '--sr-accent-2', soft: '--sr-accent-2-soft', path: '/insights' },
  ]},
  { label: 'Assist', items: [
    { id: 'ai', label: 'AI Assistant', icon: 'ai', color: '--sr-nav-ai', soft: '--sr-nav-ai-soft', path: '/ai' },
    { id: 'reviews', label: 'Reviews', icon: 'reviews', color: '--sr-nav-reviews', soft: '--sr-nav-reviews-soft', path: '/reviews' },
  ]},
];

export const TAB_FROM_PATH: Record<string, import('./types').TabId> = {
  '/': 'live',
  '/simulator': 'simulator',
  '/lab': 'lab',
  '/history': 'history',
  '/insights': 'insights',
  '/ai': 'ai',
  '/reviews': 'reviews',
};

export const PATH_FROM_TAB: Record<import('./types').TabId, string> = {
  live: '/',
  simulator: '/simulator',
  lab: '/lab',
  history: '/history',
  insights: '/insights',
  ai: '/ai',
  reviews: '/reviews',
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

/** Student-facing "What you will learn" blurbs for CSV scenario presets. */
export const SCENARIO_LEARN: Record<string, { title: string; story: string }> = {
  dos: {
    title: 'Denial of Service',
    story:
      'You will watch flood-style traffic consume resources. Severity usually lands Critical; the cascade should catch most flows at Tier‑1 (fast screener) because the pattern is loud and distinctive.',
  },
  ddos: {
    title: 'Distributed DoS',
    story:
      'Same overwhelm idea as DoS, but from many sources. Learn how the lattice pulses when volume spikes and why Critical alerts cluster while Tier‑1 handles the bulk.',
  },
  brute_force: {
    title: 'Credential guessing',
    story:
      'Repeated login attempts over FTP/SSH. You will see High-severity alerts and learn how failed-auth rhythm differs from normal traffic in the live feed.',
  },
  web_attacks: {
    title: 'Web exploit traffic',
    story:
      'SQL injection / XSS-style web probes. Expect mixed Tier‑1/Tier‑2 — some flows look ambiguous, so the cascade escalates for a second opinion.',
  },
  port_scan: {
    title: 'Network reconnaissance',
    story:
      'Wide port probing before an attack. Medium severity is common; watch many short connections light up the map as the scanner sweeps targets.',
  },
  bot: {
    title: 'Bot / C2 chatter',
    story:
      'Infected hosts phone home. Critical severity often appears as odd outbound patterns; follow alerts into Explain to see which features drove the call.',
  },
  infiltration: {
    title: 'Internal foothold',
    story:
      'Rare, sneaky lateral movement. Best scenario to watch Tier‑2/Tier‑3 escalate when Tier‑1 is unsure — the cascade “thinks harder.”',
  },
  heartbleed: {
    title: 'Heartbleed memory leak',
    story:
      'Classic OpenSSL bug traffic. Critical when flagged; good for linking a CVE story to concrete packets and cascade decisions.',
  },
  mixed_attack: {
    title: 'Multi-vector campaign',
    story:
      'Recon + exploit + flood in one run. You will see severity and tiers vary — practice reading the feed like a real SOC shift.',
  },
  benign_baseline: {
    title: 'Clean traffic baseline',
    story:
      'Mostly normal flows. Learn what “quiet” looks like: few or no attacks, lattice calm, posture low — so real alerts stand out later.',
  },
};

/** Running-state coach copy keyed by sim mode. */
export const RUNNING_COACH = {
  csv: {
    headline: "What you're seeing now",
    mapPulse:
      'The Living Lattice on Live Detection lights up when non-BENIGN flows arrive — brighter / hotter colors mean higher severity.',
    tiers:
      'Cascade tiers in plain words: Tier‑1 screens fast; Tier‑2 double-checks ambiguous flows; Tier‑3 arbitrates rare or hard cases.',
    liveLink: 'Keep Live Detection open beside this page to connect numbers here with the map and feed.',
  },
  replay: {
    headline: "What you're seeing now — lab session",
    mapPulse:
      'Traffic from the isolated lab network becomes flows. If the session is quiet, the map stays calm and most labels stay BENIGN — that is expected, not a broken demo.',
    tiers:
      'When something looks suspicious, Tier‑1 tries first; harder cases climb to Tier‑2/Tier‑3. Watch the Live Status tier bars on this page.',
    liveLink: 'Switch to Live Detection for the lattice + live feed while this session runs.',
  },
} as const;

/** One-shot guided tips after first detections (session-dismissible). */
export const GUIDED_LEARN_TIPS = [
  {
    id: 'explain',
    title: 'Click Explain',
    body: 'Open any alert and use Explain to see which features pushed the cascade decision — best viva talking point.',
  },
  {
    id: 'history',
    title: 'Check Alert History',
    body: 'After the run, filter History by attack type or severity to show persistence beyond the live window.',
  },
  {
    id: 'ai',
    title: 'Ask the AI Assistant',
    body: 'Ask in plain English what an alert means and which features tipped the verdict.',
  },
] as const;

export const GUIDED_TIPS_STORAGE_KEY = 'cascadyx-guided-learn-tips-dismissed';
