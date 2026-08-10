/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: Dashboard.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This is the Master SOC Command Center Dashboard Component!
 * It contains all primary operational views: Live Telemetry, Threat Simulator Console,
 * Alert History, Model Insights (with SMOTE Tables/Charts & Confusion Matrix), Sentinel AI Chatbot,
 * and the Explainable AI (XAI) Threat DNA Radar Modal.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Live Telemetry View (`activeTab === 'live'`):
 *    - Real-time WebSocket connection listener receiving network stream events.
 *    - Security Posture Gauge, Volumetric Timeline line chart, and Live Telemetry table.
 *    - Top-right Floating Critical Threat Alert Banner with inspect actions.
 * 2. Threat Simulator View (`activeTab === 'simulator'`):
 *    - Controls real-time scenario injection (DoS, DDoS, PortScan, Brute Force, Web Attacks, Botnet).
 * 3. Alert History View (`activeTab === 'history'`):
 *    - Search, filter, paginate, and export (PDF/CSV) historical threat alerts from SQLite.
 * 4. Model Insights View (`activeTab === 'insights'`):
 *    - **SMOTE Oversampling Data Pipeline**: KPI analytics banner and toggle between Bar Charts & Comparative Table (showing raw vs synthetic sample ratios).
 *    - **Confusion Matrix Heatmap**: Segmented toggle between `Recall %` mode and raw sample counts.
 *    - **Random Forest Feature Importances**: Bar chart of top global features.
 * 5. Sentinel AI Assistant View (`activeTab === 'ai'`):
 *    - Interactive chatbot supporting Rule-Based Q&A and Google Gemini AI responses with thread persistence.
 * 6. Explainable AI (XAI) Modal:
 *    - Renders 30-feature Threat DNA Radar Polygon comparing packet features against benign baseline averages.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `recharts`: Responsive data visualization library (`AreaChart`, `BarChart`, `RadarChart`).
 * - `lucide-react`: UI icon set for security tools and action triggers.
 * - `api.ts` (Axios): Fetches REST API endpoints (`/api/alerts`, `/api/models/metrics`, `/api/xai/explain`).
 * - `WebSocket`: Enables real-time streaming telemetry from FastAPI to React.
 * ===============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import StatusBadge from '../components/ui/StatusBadge';
import NetworkBackground from '../components/ui/NetworkBackground';
import AuroraBackground from '../components/ui/AuroraBackground';
import AttackIcon, { type AttackIconType } from '../components/ui/AttackIcons';
import NavIcon from '../components/ui/NavIcons';
import Logomark from '../components/ui/Logomark';
import {
  Activity,
  LogOut,
  User as UserIcon,
  Play,
  Square,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Download,
  Crosshair,
  Send,
  TriangleAlert,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  X,
  Ghost,
  Plus,
  Trash2,
  Pencil,
  Check,
  Pin,
  PinOff
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  type TooltipValueType
} from 'recharts';

const CLASS_LABELS = [
  "BENIGN", "Bot", "DDoS", "DoS GoldenEye", "DoS Hulk", 
  "DoS Slowhttptest", "DoS slowloris", "FTP-Patator", "Heartbleed", "Infiltration", 
  "PortScan", "SSH-Patator", "Web Attack - Brute Force", "Web Attack - Sql Injection", "Web Attack - XSS"
];

const CLASS_ABBREVIATIONS = [
  "BNG", "BOT", "DDS", "DGE", "DHK",
  "DST", "DSL", "FTP", "HBD", "INF",
  "PSC", "SSH", "WBF", "WSI", "WXS"
];

// Pulls `detail` out of an axios error response without requiring an `any` cast.
function extractErrorDetail(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail;
  }
  return undefined;
}

// Buckets a list of conversations into Today / Yesterday / Older sections by
// their updated_at date, preserving whatever order they arrived in (the
// backend already sorts pinned-first / newest-updated within each bucket).
function groupConversationsByDate<T extends { updated_at: string }>(items: T[]): { label: string; items: T[] }[] {
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

// Sequential single-hue ramp (magnitude) for the confusion-matrix heatmap --
// four validated stops from tokens.css, interpolated in RGB space.
const SEQ_RAMP_STOPS: [number, [number, number, number]][] = [
  [0, [205, 226, 251]],   // --sr-seq-100
  [0.33, [109, 167, 236]], // --sr-seq-300
  [0.66, [37, 106, 191]],  // --sr-seq-500
  [1, [13, 54, 107]],      // --sr-seq-700
];

function seqRampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SEQ_RAMP_STOPS.length - 1; i++) {
    const [t0, c0] = SEQ_RAMP_STOPS[i];
    const [t1, c1] = SEQ_RAMP_STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const local = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * local);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * local);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * local);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const last = SEQ_RAMP_STOPS[SEQ_RAMP_STOPS.length - 1][1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

// Compact number formatter for tight heatmap cells ("12,345" -> "12.3K").
function compactCount(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

// A Recharts YAxis tick renderer that truncates long category labels with an
// ellipsis and exposes the full text via a native SVG <title> hover tooltip --
// used so long feature/class names never get silently clipped by axis width.
function makeTruncatedYAxisTick(maxChars: number) {
  const TruncatedTick = (props: any) => {
    const { x, y, payload } = props;
    const full = String(payload.value);
    const text = full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{full}</title>
        <text x={0} y={0} dy={3} textAnchor="end" fontSize={9} fill="var(--sr-text-muted)">{text}</text>
      </g>
    );
  };
  return TruncatedTick;
}

// Sidebar nav — grouped by role, each panel carries its own color identity
// (never reused from the severity/tier palettes, which encode different meanings).
type TabId = 'live' | 'simulator' | 'history' | 'insights' | 'ai';
const NAV_GROUPS: { label: string; items: { id: TabId; label: string; icon: 'live' | 'simulator' | 'history' | 'insights' | 'ai'; color: string; soft: string }[] }[] = [
  { label: 'Monitor', items: [
    { id: 'live', label: 'Live Detection', icon: 'live', color: '--sr-accent', soft: '--sr-accent-soft' },
  ]},
  { label: 'Operate', items: [
    { id: 'simulator', label: 'Threat Simulator', icon: 'simulator', color: '--sr-nav-simulator', soft: '--sr-nav-simulator-soft' },
  ]},
  { label: 'Analyze', items: [
    { id: 'history', label: 'Alert History', icon: 'history', color: '--sr-nav-history', soft: '--sr-nav-history-soft' },
    { id: 'insights', label: 'Model Insights', icon: 'insights', color: '--sr-accent-2', soft: '--sr-accent-2-soft' },
  ]},
  { label: 'Assist', items: [
    { id: 'ai', label: 'AI Assistant', icon: 'ai', color: '--sr-nav-ai', soft: '--sr-nav-ai-soft' },
  ]},
];

// Types matching backend API
interface TopFeature {
  feature: string;
  value: number;
  importance: number;
  impact: number;
  benign_avg?: number;
}

interface DetectionData {
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

interface TelemetryEvent {
  event: 'heartbeat' | 'detection';
  timestamp: string;
  data?: DetectionData;
}

interface AttackVector {
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

interface AlertLog {
  id: number;
  timestamp: string;
  predicted_label: string;
  confidence: number;
  tier: number;
  source_scenario: string;
  raw_features: Record<string, any>;
  severity?: string;
}

interface ConversationSummary {
  id: number;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  preview: string | null;
}

interface SimStatus {
  running: boolean;
  scenario: string | null;
  rate: number;
  duration_seconds: number | null;
  elapsed_seconds: number;
  packets_sent: number;
  attacks_detected: number;
  tier_breakdown: Record<string, number>;
}

const SCENARIO_DETAILS: Record<string, { type: string, tier: string, vector: string, severity: string, color: string }> = {
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

export const Dashboard: React.FC = () => {
  const { user, logout, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'live' | 'simulator' | 'history' | 'insights' | 'ai'>('live');

  // --- GLOBAL STATES ---
  const [wsConnected, setWsConnected] = useState(false);

  // --- THEME & ALERT AUDIO STATES ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('soundEnabled') !== 'false';
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  const [screenFlash, setScreenFlash] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Audio alert synthesizer (Web Audio API)
  const playAlertSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (e) {
      // Audio playback blocked
    }
  };

  // --- EXPORT MODAL STATES ---
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exportSeverity, setExportSeverity] = useState('');
  const [exportAttackType, setExportAttackType] = useState('');

  // --- LIVE TELEMETRY STATES (Throttled for Performance) ---
  const [liveEvents, setLiveEvents] = useState<TelemetryEvent[]>([]);
  const [packetsAnalyzed, setPacketsAnalyzed] = useState(0);
  const [attacksCount, setAttacksCount] = useState(0);
  const [selectedDetection, setSelectedDetection] = useState<DetectionData | null>(null);

  // Recharts live rate chart data
  const [chartData, setChartData] = useState<{ time: string; packets: number; threats: number }[]>([]);

  // Refs for throttled buffering
  const wsRef = useRef<WebSocket | null>(null);
  const eventBufferRef = useRef<TelemetryEvent[]>([]);

  // Heartbeat telemetry variables
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  const packetsThisSecondRef = useRef(0);
  const [liveTiers, setLiveTiers] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });
  const [attackCounts, setAttackCounts] = useState<Record<string, number>>({});
  const [topTalkers, setTopTalkers] = useState<Record<string, number>>({});
  const [activeVectors, setActiveVectors] = useState<AttackVector[]>([]);
  const [hoveredVector, setHoveredVector] = useState<any | null>(null);

  // Prune map vectors after 1.8 seconds using a creation timestamp filter, capping visible count at 6
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveVectors((prev) => {
        const filtered = prev.filter((v) => now - v.createdAt < 1800);
        if (filtered.length > 6) {
          return filtered.slice(-6);
        }
        return filtered;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 1-second interval to compute active packets per second
  useEffect(() => {
    const timer = setInterval(() => {
      setPacketsPerSecond(packetsThisSecondRef.current);
      packetsThisSecondRef.current = 0;
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- SIMULATOR STATES ---
  const [simStatus, setSimStatus] = useState<SimStatus>({
    running: false,
    scenario: null,
    rate: 5,
    duration_seconds: 30,
    elapsed_seconds: 0,
    packets_sent: 0,
    attacks_detected: 0,
    tier_breakdown: { '1': 0, '2': 0, '3': 0 }
  });
  const [selectedScenario, setSelectedScenario] = useState('benign_baseline');
  const [scenarios, setScenarios] = useState<Record<string, { display_name: string; description: string; severity_hint: string }> | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [simRate, setSimRate] = useState(5);
  const [simDuration, setSimDuration] = useState(30);
  const [simError, setSimError] = useState<string | null>(null);
  const [ppsHistory, setPpsHistory] = useState<number[]>(Array(20).fill(0));
  const [localElapsed, setLocalElapsed] = useState(0);

  // --- ALERT HISTORY STATES ---
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [filterAttack, setFilterAttack] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [smoteData, setSmoteData] = useState<any>(null);

  // --- MODEL INSIGHTS STATES ---
  const [metricsData, setMetricsData] = useState<any>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [selectedCMModel, setSelectedCMModel] = useState<'lightgbm' | 'random_forest' | 'xgboost'>('lightgbm');
  const [numFeaturesToShow, setNumFeaturesToShow] = useState<number>(10);
  const [hoveredCMCell, setHoveredCMCell] = useState<{ row: number; col: number; val: number; pct: number } | null>(null);

  // Enhancements states
  const [smoteViewMode, setSmoteViewMode] = useState<'chart' | 'table'>('chart');
  const [cmViewMode, setCmViewMode] = useState<'count' | 'percentage'>('percentage');
  const [showPacketsSeries, setShowPacketsSeries] = useState<boolean>(true);
  const [showThreatsSeries, setShowThreatsSeries] = useState<boolean>(true);
  const [activeAlertBanner, setActiveAlertBanner] = useState<DetectionData | null>(null);

  // --- EXPLAINABLE AI (XAI) STATES ---
  const [benignBaselines, setBenignBaselines] = useState<Record<string, number>>({});
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [loadingExplanation, setLoadingExplanation] = useState<boolean>(false);

  // --- AI CHATBOT STATES ---
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; time: string; source?: string; responseTime?: string; isError?: boolean }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [geminiAvailable, setGeminiAvailable] = useState<boolean>(true);
  const [inputFocused, setInputFocused] = useState<boolean>(false);

  // --- CONVERSATION HISTORY + INCOGNITO STATES ---
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingConversationDetail, setLoadingConversationDetail] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Refs mirror the state above so the async send-queue (which can span multiple
  // renders) always reads the current value instead of a stale closure.
  const activeConversationIdRef = useRef<number | null>(null);
  const incognitoRef = useRef(false);
  // Bumped by anything that changes which chat is on screen (new chat, load a
  // saved thread, toggle incognito). A slow response that resolves after the
  // user has already moved on is a mismatch and gets dropped instead of
  // appearing to "leak" into whatever chat is now visible.
  const chatGenerationRef = useRef(0);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatQueueRef = useRef<string[]>([]);
  const processingRef = useRef<boolean>(false);
  const isAtBottomRef = useRef<boolean>(true);

  const handleChatScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    isAtBottomRef.current = atBottom;
  };

  // ==========================================
  // 1. WEBSOCKET FEED + THROTTLED RE-RENDERING
  // ==========================================
  useEffect(() => {
    if (!token) return;
    const wsHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    const ws = new WebSocket(`ws://${wsHost}:8000/ws/live?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log('Telemetry WebSocket connected');
    };

    ws.onmessage = (msg) => {
      try {
        const payload: TelemetryEvent = JSON.parse(msg.data);
        if (payload.event === 'heartbeat') {
          setLastHeartbeat(Date.now());
        } else {
          // Push to buffer instead of updating React state immediately to prevent lag
          eventBufferRef.current.push(payload);
        }
      } catch (err) {
        console.error('WebSocket telemetry parse error:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.warn('Telemetry WebSocket disconnected');
    };

    ws.onerror = () => {
      ws.close();
    };

    return () => {
      ws.close();
    };
  }, [token]);

  // Flush buffer to React State at a throttled rate (every 300ms)
  useEffect(() => {
    const interval = setInterval(() => {
      if (eventBufferRef.current.length > 0) {
        const buffer = [...eventBufferRef.current];
        eventBufferRef.current = [];

        // Aggregate statistics from buffered packets
        let newPackets = 0;
        let newAttacks = 0;
        const processedDetections: TelemetryEvent[] = [];
        
        setLiveTiers((prev) => {
          const updated = { ...prev };
          buffer.forEach((evt) => {
            if (evt.event === 'detection' && evt.data) {
              const t = evt.data.tier;
              updated[t] = (updated[t] || 0) + 1;
            }
          });
          return updated;
        });

        setAttackCounts((prev) => {
          const updated = { ...prev };
          buffer.forEach((evt) => {
            if (evt.event === 'detection' && evt.data) {
              const lbl = evt.data.predicted_label;
              updated[lbl] = (updated[lbl] || 0) + 1;
            }
          });
          return updated;
        });

        setTopTalkers((prev) => {
          const updated = { ...prev };
          buffer.forEach((evt) => {
            if (evt.event === 'detection' && evt.data && evt.data.predicted_label.toUpperCase() !== 'BENIGN') {
              const ip = evt.data.source_ip || 'unknown';
              updated[ip] = (updated[ip] || 0) + 1;
            }
          });
          return updated;
        });

        const newVectors: AttackVector[] = [];
        buffer.forEach((evt) => {
          if (evt.event === 'detection' && evt.data) {
            newPackets += 1;
            processedDetections.push(evt);
            
            const data = evt.data;
            const label = data.predicted_label;
            const isAttack = label.toUpperCase() !== 'BENIGN';
            if (isAttack) {
              newAttacks += 1;
              const isCritical = data.severity === 'Critical' || ['DOS', 'DDOS', 'BOT', 'INFILTRATION', 'HEARTBLEED'].some(k => label.toUpperCase().includes(k));
              if (isCritical) {
                if (soundEnabledRef.current) playAlertSound();
                setScreenFlash(true);
                setActiveAlertBanner(data);
                setTimeout(() => setScreenFlash(false), 450);
              }
            }
            
            const fromY = isAttack ? 45 : 105;
            const raw_dest_ip = data.dest_ip || '192.168.10.50';
            const target = raw_dest_ip === '192.168.10.50' ? { x: 420, y: 30 } :
                           raw_dest_ip === '192.168.10.51' ? { x: 420, y: 75 } : { x: 420, y: 120 };
                           
            const display_dest_ip = raw_dest_ip === '192.168.10.50' ? '192.168.10.10' :
                                    raw_dest_ip === '192.168.10.51' ? '192.168.10.20' : '192.168.10.30';
                                    
            const display_src_ip = isAttack ? '203.0.113.45' : '192.168.10.50';
                           
            newVectors.push({
              id: Math.random().toString(36).substr(2, 9),
              fromX: 50,
              fromY,
              toX: target.x,
              toY: target.y,
              label,
              isAttack,
              severity: data.severity || 'Info',
              source_ip: display_src_ip,
              dest_ip: display_dest_ip,
              source_port: data.source_port || 0,
              dest_port: data.dest_port || 0,
              confidence: data.confidence || 0.95,
              createdAt: Date.now()
            });
          }
        });

        if (newVectors.length > 0) {
          setActiveVectors((prev) => [...prev, ...newVectors].slice(-6));
        }

        // 1. Update overall packet statistics
        setPacketsAnalyzed((prev) => prev + newPackets);
        setAttacksCount((prev) => prev + newAttacks);
        
        // Track packets this second
        packetsThisSecondRef.current += newPackets;

        // 2. Update list of recent event logs (capped at 50)
        if (processedDetections.length > 0) {
          setLiveEvents((prev) => [...processedDetections.reverse(), ...prev].slice(0, 50));
        }

        // 3. Update live activity chart
        setChartData((prev) => {
          const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const updated = [...prev, { time: timestamp, packets: newPackets, threats: newAttacks }];
          return updated.slice(-15); // Show last 15 ticks
        });
      }
    }, 300);

    return () => clearInterval(interval);
  }, [liveTiers, attackCounts]);

  // Initialize live chart layout
  useEffect(() => {
    const initialData = Array.from({ length: 15 }, (_, i) => ({
      time: new Date(Date.now() - (15 - i) * 2000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      packets: 0,
      threats: 0
    }));
    setChartData(initialData);
  }, []);

  // Smart scrolling logic for chatbot
  const lastActiveTabRef = useRef(activeTab);

  useEffect(() => {
    if (activeTab !== 'ai') {
      lastActiveTabRef.current = activeTab;
      return;
    }
    const container = chatContainerRef.current;
    if (!container) return;

    const tabJustSwitched = lastActiveTabRef.current !== 'ai';
    lastActiveTabRef.current = activeTab;

    const lastMsgIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user';

    if (tabJustSwitched || lastMsgIsUser || isAtBottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        // Reset to true after auto-scrolling
        isAtBottomRef.current = true;
      }, 50);
    }
  }, [messages, aiTyping, activeTab]);


  // Poll Gemini status
  useEffect(() => {
    const fetchGeminiStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await api.get('/api/chat/status');
        setGeminiAvailable(res.data.gemini_available);
      } catch (err) {
        console.error('Failed to fetch Gemini status:', err);
        setGeminiAvailable(false);
      }
    };
    
    if (activeTab === 'ai') {
      fetchGeminiStatus();
      const interval = setInterval(fetchGeminiStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Load the conversation history rail once, the first time the AI tab is opened.
  const conversationsFetchedRef = useRef(false);
  useEffect(() => {
    if (activeTab === 'ai' && !conversationsFetchedRef.current) {
      conversationsFetchedRef.current = true;
      fetchConversations();
    }
  }, [activeTab]);

  // ==========================================
  // 2. SIMULATOR LOGIC
  // ==========================================
  const fetchSimStatus = async () => {
    try {
      const res = await api.get('/api/simulate/status');
      setSimStatus(res.data);
    } catch (err) {
      console.error('Failed to retrieve simulator status:', err);
    }
  };

  // Poll simulator status when in simulator or live tab
  useEffect(() => {
    let interval: number;
    if (activeTab === 'simulator' || activeTab === 'live') {
      fetchSimStatus();
      interval = window.setInterval(fetchSimStatus, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  // Load scenarios dynamically on mount
  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        setLoadingScenarios(true);
        const res = await api.get('/api/simulate/scenarios');
        setScenarios(res.data);
        const keys = Object.keys(res.data);
        if (keys.length > 0 && !keys.includes(selectedScenario)) {
          setSelectedScenario(keys.includes('benign_baseline') ? 'benign_baseline' : keys[0]);
        }
      } catch (err) {
        console.error('Failed to fetch simulator scenarios:', err);
      } finally {
        setLoadingScenarios(false);
      }
    };
    fetchScenarios();
  }, []);

  // Load precomputed benign baseline averages once, used to reconstruct XAI
  // comparisons for historical alerts inspected from the Alert History tab.
  useEffect(() => {
    const fetchBenignBaselines = async () => {
      try {
        const res = await api.get('/api/data/benign-baseline');
        setBenignBaselines(res.data || {});
      } catch (err) {
        console.error('Failed to fetch benign baseline averages:', err);
      }
    };
    fetchBenignBaselines();
  }, []);

  // Track real-time packages per second history for mini waveform
  useEffect(() => {
    if (simStatus.running) {
      setPpsHistory(prev => {
        const next = [...prev.slice(1), packetsPerSecond];
        return next;
      });
    } else {
      setPpsHistory(Array(20).fill(0));
    }
  }, [packetsPerSecond, simStatus.running]);

  // Local elapsed time counter for smooth counting
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (simStatus.running) {
      setLocalElapsed(simStatus.elapsed_seconds || 0);
      timer = setInterval(() => {
        setLocalElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setLocalElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [simStatus.running]);

  useEffect(() => {
    if (simStatus.running) {
      setLocalElapsed(simStatus.elapsed_seconds);
    }
  }, [simStatus.elapsed_seconds, simStatus.running]);

  const handleStartSim = async () => {
    setSimError(null);
    try {
      await api.post('/api/simulate/start', {
        scenario: selectedScenario,
        rate: simRate,
        duration_seconds: simDuration || null
      });
      fetchSimStatus();
    } catch (err) {
      setSimError(extractErrorDetail(err) || 'Failed to start simulation.');
    }
  };

  const handleStopSim = async () => {
    try {
      await api.post('/api/simulate/stop');
      fetchSimStatus();
    } catch (err) {
      console.error('Failed to stop simulation:', err);
    }
  };

  // ==========================================
  // 3. ALERT HISTORY LOGS
  // ==========================================
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      let url = `/api/alerts?page=${historyPage}&limit=12`;
      if (filterAttack) url += `&attack_type=${encodeURIComponent(filterAttack)}`;
      if (filterTier) url += `&tier=${filterTier}`;
      if (filterSeverity) url += `&severity=${encodeURIComponent(filterSeverity)}`;
      if (filterDateFrom) url += `&date_from=${filterDateFrom}`;
      if (filterDateTo) url += `&date_to=${filterDateTo}`;

      const res = await api.get(url);
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to load alert logs:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyPage, filterAttack, filterTier, filterSeverity, filterDateFrom, filterDateTo]);

  // ==========================================
  // 4. MODEL BENCHMARKS
  // ==========================================
  useEffect(() => {
    const fetchMetrics = async () => {
      setLoadingMetrics(true);
      try {
        const [metricsRes, smoteRes] = await Promise.all([
          api.get('/api/models/metrics'),
          api.get('/api/data/smote-stats')
        ]);
        setMetricsData(metricsRes.data);
        setSmoteData(smoteRes.data);
        console.log('Model metrics & SMOTE loaded successfully');
      } catch (err) {
        console.error('Failed to load model metrics:', err);
      } finally {
        setLoadingMetrics(false);
      }
    };
    if (activeTab === 'insights') {
      fetchMetrics();
    }
  }, [activeTab]);

  // ==========================================
  // 4b. DYNAMIC EXPLAIN THIS PACKET (XAI)
  // ==========================================
  useEffect(() => {
    if (!selectedDetection) {
      setAiExplanation('');
      return;
    }

    const getExplanation = async () => {
      setLoadingExplanation(true);
      try {
        const res = await api.post('/api/xai/explain', {
          predicted_label: selectedDetection.predicted_label,
          confidence: selectedDetection.confidence,
          tier: selectedDetection.tier,
          features: selectedDetection.raw_features || {}
        });
        setAiExplanation(res.data.explanation);
      } catch (err) {
        console.error('Failed to get XAI explanation:', err);
        setAiExplanation('Failed to fetch plain-English attribution from secure AI services.');
      } finally {
        setLoadingExplanation(false);
      }
    };
    
    getExplanation();
  }, [selectedDetection]);

  const handleExportReport = async (format: 'pdf' | 'csv') => {
    try {
      let url = `/api/alerts/export?format=${format}`;
      if (filterAttack) url += `&attack_type=${encodeURIComponent(filterAttack)}`;
      if (filterTier) url += `&tier=${filterTier}`;
      if (filterSeverity) url += `&severity=${encodeURIComponent(filterSeverity)}`;
      if (filterDateFrom) url += `&date_from=${filterDateFrom}`;
      if (filterDateTo) url += `&date_to=${filterDateTo}`;

      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `alerts_report_${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "")}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to export alert report:', err);
      alert('Failed to generate export report.');
    }
  };

  const getSmoteChartData = () => {
    if (!smoteData) return [];
    const before = smoteData.before_smote || {};
    const after = smoteData.after_smote || {};
    return Object.keys(before).map((className) => ({
      class: className,
      "Before SMOTE": before[className] || 0,
      "After SMOTE": after[className] || 0
    }));
  };

  // ==========================================
  // 5. AI SECURITY BOT CHAT
  // ==========================================
  const sendChatMessage = (text: string) => {
    if (!text.trim()) return;

    const userMsg = text;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add user message to history immediately
    setMessages((prev) => [...prev, { role: 'user', text: userMsg, time }]);
    setChatInput('');
    
    // Refocus the input immediately
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 50);

    // Queue management
    if (processingRef.current) {
      chatQueueRef.current.push(userMsg);
    } else {
      processingRef.current = true;
      setAiTyping(true);
      processNextInQueue(userMsg);
    }
  };

  const processNextInQueue = async (text: string) => {
    const startTime = performance.now();
    // Snapshot which chat context this request belongs to. If the user has
    // switched away (new chat / loaded another thread / toggled incognito) by
    // the time the response lands, it's stale and must not be appended to
    // whatever is now on screen -- especially important for incognito, where a
    // slow response arriving after the user exits incognito must never render
    // as if it were part of the now-visible (saved) conversation.
    const generationAtSend = chatGenerationRef.current;
    const wasIncognito = incognitoRef.current;
    try {
      const res = await api.post('/api/chat', {
        message: text,
        conversation_id: activeConversationIdRef.current,
        incognito: wasIncognito
      });
      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const isStale = chatGenerationRef.current !== generationAtSend;

      let responseTimeStr = '';
      if (durationMs < 1000) {
        responseTimeStr = `${Math.round(durationMs)}ms`;
      } else {
        responseTimeStr = `${(durationMs / 1000).toFixed(1)}s`;
      }

      if (!isStale) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: res.data.answer,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: res.data.source,
            responseTime: responseTimeStr,
            isError: res.data.source === 'Error Fallback'
          }
        ]);
      }

      // A fresh conversation id comes back the first time a non-incognito turn
      // is saved -- adopt it so subsequent messages in this thread keep memory,
      // and refresh the history rail so the new/updated thread shows up.
      if (!wasIncognito && res.data.conversation_id) {
        if (!isStale && activeConversationIdRef.current !== res.data.conversation_id) {
          activeConversationIdRef.current = res.data.conversation_id;
          setActiveConversationId(res.data.conversation_id);
        }
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to communicate with chat backend:', err);
      if (chatGenerationRef.current === generationAtSend) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: "I'm having trouble right now — please try again in a moment.",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: 'Error Fallback',
            isError: true
          }
        ]);
      }
    }

    if (chatQueueRef.current.length > 0) {
      const nextMsg = chatQueueRef.current.shift()!;
      processNextInQueue(nextMsg);
    } else {
      processingRef.current = false;
      setAiTyping(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
  };

  // ==========================================
  // 5b. CONVERSATION HISTORY + INCOGNITO MODE
  // ==========================================
  const fetchConversations = async () => {
    setLoadingConversations(true);
    try {
      const res = await api.get('/api/conversations');
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to fetch conversation history:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const startNewConversation = () => {
    chatGenerationRef.current += 1;
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setMessages([]);
    chatQueueRef.current = [];
  };

  const loadConversation = async (id: number) => {
    if (id === activeConversationIdRef.current) return;
    chatGenerationRef.current += 1;
    setLoadingConversationDetail(true);
    try {
      const res = await api.get(`/api/conversations/${id}`);
      const loaded = (res.data.messages || []).map((m: { role: 'user' | 'assistant'; content: string; source?: string; created_at: string }) => ({
        role: m.role,
        text: m.content,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: m.source
      }));
      setMessages(loaded);
      activeConversationIdRef.current = id;
      setActiveConversationId(id);
      // Loading a saved thread only makes sense outside incognito mode.
      incognitoRef.current = false;
      setIncognito(false);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingConversationDetail(false);
    }
  };

  // Delete is two-step: first click arms a confirm state on that row, a second
  // click on the (now red) confirm icon actually deletes. Clicking anywhere
  // else, or the explicit cancel, disarms it. No jarring native confirm() popup.
  const requestDeleteConversation = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDeleteId(id);
  };

  const cancelDeleteConversation = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDeleteId(null);
  };

  const confirmDeleteConversation = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDeleteId(null);
    try {
      await api.delete(`/api/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationIdRef.current === id) {
        startNewConversation();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const togglePinConversation = async (c: ConversationSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextPinned = !c.pinned;
    // Optimistic update + re-sort (pinned-first, matching the backend's ordering).
    setConversations((prev) =>
      prev
        .map((conv) => (conv.id === c.id ? { ...conv, pinned: nextPinned } : conv))
        .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
    );
    try {
      await api.patch(`/api/conversations/${c.id}`, { pinned: nextPinned });
    } catch (err) {
      console.error('Failed to update pin state:', err);
      fetchConversations(); // resync on failure
    }
  };

  const commitRename = async (id: number) => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      const res = await api.patch(`/api/conversations/${id}`, { title });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: res.data.title } : c)));
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  };

  const toggleIncognito = () => {
    const next = !incognitoRef.current;
    incognitoRef.current = next;
    setIncognito(next);
    // Never blend a saved thread with an incognito one -- always start clean.
    startNewConversation();
  };

  const getComparisonData = () => {
    if (!metricsData || !metricsData.summary) return [];
    return Object.entries(metricsData.summary).map(([name, data]: [string, any]) => ({
      name,
      accuracy: data.accuracy * 100,
      macro_precision: data.macro_precision * 100,
      macro_f1: data.macro_f1 * 100,
      avg_latency: data.avg_inference_latency_ms,
      training_time: data.training_time_seconds
    }));
  };

  const postureScore = React.useMemo(() => {
    const detections = liveEvents.filter(evt => evt.event === 'detection' && evt.data);
    if (detections.length === 0) return 0;
    
    const weightMap: Record<string, number> = {
      'Info': 0,
      'Low': 1,
      'Medium': 2,
      'High': 3,
      'Critical': 4
    };
    
    let totalWeight = 0;
    detections.forEach(evt => {
      const sev = evt.data?.severity || 'Info';
      totalWeight += weightMap[sev] !== undefined ? weightMap[sev] : 2;
    });
    
    const avgWeight = totalWeight / detections.length;
    return Math.round((avgWeight / 4.0) * 100);
  }, [liveEvents]);

  // Rolling history of posture scores for the trend sparkline under the gauge
  const [postureHistory, setPostureHistory] = useState<number[]>(Array(20).fill(0));
  useEffect(() => {
    setPostureHistory((prev) => [...prev.slice(-19), postureScore]);
  }, [postureScore]);

  const postureStatus = React.useMemo(() => {
    if (postureScore <= 30) {
      return {
        label: 'SECURE',
        color: 'text-[var(--sr-sev-info)]',
        dotColor: 'bg-[var(--sr-sev-info)]',
        description: 'No significant threats detected.'
      };
    } else if (postureScore <= 60) {
      return {
        label: 'ELEVATED',
        color: 'text-[#8A6300]',
        dotColor: 'bg-[var(--sr-sev-medium)]',
        description: 'Moderate attack activity detected.'
      };
    } else {
      return {
        label: 'UNDER ATTACK',
        color: 'text-[var(--sr-sev-critical)]',
        dotColor: 'bg-[var(--sr-sev-critical)] animate-pulse',
        description: 'Sustained critical threat cascade active.'
      };
    }
  }, [postureScore]);

  const renderConfusionMatrix = (modelKey: 'lightgbm' | 'random_forest' | 'xgboost') => {
    if (!metricsData || !metricsData.confusion_matrices || !metricsData.confusion_matrices[modelKey]) {
      return <div className="text-[var(--sr-text-muted)] text-xs py-10 text-center">Matrix data not loaded.</div>;
    }
    const matrix = metricsData.confusion_matrices[modelKey];
    const matrixMax = Math.max(1, ...matrix.flat());

    return (
      <div className="flex flex-col gap-4">
        {/* Heatmap Grid — single-hue sequential scale (magnitude) */}
        <div className="overflow-x-auto pb-1">
          <div className="flex items-stretch gap-2 min-w-[480px]">
            {/* Rotated "Actual class" axis title, spanning the full row block */}
            <div className="flex items-center justify-center shrink-0 pb-6" aria-hidden="true">
              <span
                className="text-[10px] font-semibold text-[var(--sr-text-muted)] uppercase tracking-wide whitespace-nowrap"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Actual class
              </span>
            </div>

            <div className="flex flex-col flex-1 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-3">
              {/* "Predicted class" axis title, centered above the column headers */}
              <div className="pl-14 mb-1.5 text-center" aria-hidden="true">
                <span className="text-[10px] font-semibold text-[var(--sr-text-muted)] uppercase tracking-wide">Predicted class →</span>
              </div>

              {/* Column Headers */}
              <div className="flex items-center pl-14 mb-1">
                {CLASS_ABBREVIATIONS.map((abb, idx) => (
                  <div
                    key={idx}
                    title={CLASS_LABELS[idx]}
                    className="w-7 sm:w-8 text-[9px] text-center text-[var(--sr-text-muted)] font-medium select-none truncate"
                  >
                    {abb}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {matrix.map((rowArr: number[], i: number) => {
                const rowSum = rowArr.reduce((a, b) => a + b, 0);
                return (
                  <div key={i} className="flex items-center">
                    {/* Row Label (Left) */}
                    <div
                       title={CLASS_LABELS[i]}
                       className="w-14 pr-2 text-[9px] text-right text-[var(--sr-text-muted)] font-medium select-none truncate"
                    >
                      {CLASS_ABBREVIATIONS[i]}
                    </div>

                    {/* Row Cells */}
                    {rowArr.map((val: number, j: number) => {
                      const pct = rowSum > 0 ? (val / rowSum) : 0;
                      const magnitude = cmViewMode === 'percentage' ? pct : val / matrixMax;
                      const isCorrect = i === j;
                      const bgStyle: React.CSSProperties = val > 0
                        ? { backgroundColor: seqRampColor(magnitude) }
                        : { backgroundColor: 'var(--sr-bg-page)' };

                      const isHovered = hoveredCMCell && hoveredCMCell.row === i && hoveredCMCell.col === j;
                      const label = cmViewMode === 'percentage'
                        ? (pct > 0.05 ? `${Math.round(pct * 100)}%` : null)
                        : (val > 0 ? compactCount(val) : null);

                      return (
                        <div
                          key={j}
                          style={bgStyle}
                          onMouseEnter={() => setHoveredCMCell({ row: i, col: j, val, pct })}
                          onMouseLeave={() => setHoveredCMCell(null)}
                          className={`w-7 h-7 sm:w-8 sm:h-8 border border-[var(--sr-bg-surface)] relative flex items-center justify-center text-[8px] font-medium transition-all duration-150 cursor-pointer ${
                            isCorrect ? 'ring-1 ring-inset ring-[var(--sr-accent)]/30' : ''
                          } ${
                            isHovered ? 'ring-2 ring-[var(--sr-accent)] scale-110 z-10 shadow-[var(--sr-shadow-md)]' : ''
                          }`}
                        >
                          {label ? (
                            <span className={magnitude > 0.5 ? 'text-white' : 'text-[var(--sr-text-primary)]'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {label}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--sr-text-secondary)] border-t border-[var(--sr-border-hairline)] pt-4 px-2">
          <div className="flex items-center gap-3">
            <span className="text-[var(--sr-text-muted)]">Fewer flows</span>
            <div
              className="h-2.5 w-28 rounded-full overflow-hidden border border-[var(--sr-border-hairline)]"
              style={{ backgroundImage: 'linear-gradient(90deg, var(--sr-seq-100), var(--sr-seq-300), var(--sr-seq-500), var(--sr-seq-700))' }}
            />
            <span className="text-[var(--sr-text-muted)]">More flows</span>
          </div>
          <span className="text-[var(--sr-text-muted)]">
            Diagonal (ringed) = correct class · color intensity = {cmViewMode === 'percentage' ? 'row-normalized share' : 'flow count vs matrix max'}
          </span>
        </div>

        {/* Selected Cell Inspector */}
        <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-3 flex flex-col justify-center min-h-[56px] text-xs transition-all">
          {hoveredCMCell ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-[var(--sr-text-muted)] block mb-0.5">Actual class</span>
                <span className="text-[var(--sr-text-primary)] font-semibold truncate block">{CLASS_LABELS[hoveredCMCell.row]}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--sr-text-muted)] block mb-0.5">Predicted class</span>
                <span className="text-[var(--sr-text-primary)] font-semibold truncate block">{CLASS_LABELS[hoveredCMCell.col]}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--sr-text-muted)] block mb-0.5">Flow count (%)</span>
                <span className={`font-semibold ${hoveredCMCell.row === hoveredCMCell.col ? 'text-[var(--sr-accent)]' : hoveredCMCell.val > 0 ? 'text-[var(--sr-sev-critical)]' : 'text-[var(--sr-text-muted)]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {hoveredCMCell.val.toLocaleString()} ({(hoveredCMCell.pct * 100).toFixed(2)}%)
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-[var(--sr-text-muted)] text-xs italic">
              Hover over cells to inspect metrics
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen bg-[var(--sr-bg-page)] text-[var(--sr-text-primary)] flex font-sans select-none overflow-hidden h-screen relative transition-all duration-300 ${
      screenFlash ? 'ring-4 ring-red-500/80 shadow-[inset_0_0_40px_rgba(239,68,68,0.5)]' : ''
    }`} style={{ fontFamily: 'var(--sr-font-sans)' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />

      <AuroraBackground className="fixed inset-0 z-0" variant="ambient" />
      <NetworkBackground className="fixed inset-0 z-0" opacity={0.14} />

      {/* LEFT SIDEBAR NAVBAR */}
      <aside className="w-64 border-r border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md flex flex-col justify-between py-6 z-20 shrink-0">
        <div className="flex flex-col gap-7">
          {/* Dashboard Title Branding */}
          <div className="flex items-center gap-3 px-5">
            <div className="p-2 bg-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)]">
              <Logomark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-[var(--sr-text-primary)] leading-tight" style={{ fontFamily: 'var(--sr-font-display)' }}>Cascadyx</h1>
              <span className="text-[11px] text-[var(--sr-text-muted)]">Command Center</span>
            </div>
          </div>

          {/* Navigation Links — grouped by role, each panel carries its own color identity */}
          <nav className="flex flex-col gap-4 px-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                <span className="px-3 pb-0.5 text-[10px] font-semibold tracking-wider text-[var(--sr-text-muted)] uppercase">
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const underAttack = item.id === 'live' && postureStatus.label !== 'SECURE';
                  const simRunning = item.id === 'simulator' && simStatus.running;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`group relative flex items-center gap-2.5 pl-2.5 pr-2 py-1.5 rounded-[var(--sr-radius-sm)] text-sm font-medium transition-all cursor-pointer outline-none border-l-[3px] focus-visible:ring-2 focus-visible:ring-[var(--sr-accent-soft)] ${
                        isActive
                          ? 'text-[var(--sr-text-primary)]'
                          : 'text-[var(--sr-text-secondary)] hover:bg-[var(--sr-bg-surface-raised)] hover:text-[var(--sr-text-primary)]'
                      }`}
                      style={{
                        borderLeftColor: isActive ? `var(${item.color})` : 'transparent',
                        backgroundColor: isActive ? `var(${item.soft})` : undefined,
                      }}
                    >
                      <span
                        className="flex h-6.5 w-6.5 items-center justify-center rounded-full shrink-0 transition-colors"
                        style={{
                          backgroundColor: isActive ? `var(${item.color})` : 'var(--sr-bg-surface-raised)',
                          color: isActive ? '#fff' : 'var(--sr-text-muted)',
                        }}
                      >
                        <NavIcon type={item.icon} className="w-3.5 h-3.5" />
                      </span>
                      <span className="flex-1 text-left truncate">{item.label}</span>

                      {underAttack && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--sr-sev-critical)] animate-pulse" title="Under attack" />
                      )}
                      {simRunning && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: 'var(--sr-nav-simulator)' }} title="Simulation active" />
                      )}
                      {item.id === 'history' && attacksCount > 0 && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: 'var(--sr-nav-history-soft)', color: 'var(--sr-nav-history)' }}
                        >
                          {attacksCount > 99 ? '99+' : attacksCount}
                        </span>
                      )}
                      {item.id === 'ai' && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: geminiAvailable ? 'var(--sr-sev-info)' : 'var(--sr-text-muted)' }}
                          title={geminiAvailable ? 'Gemini online' : 'Rule-based mode'}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          {/* Mini session-activity widget — ambient "is it alive" signal */}
          <div className="mx-5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-[var(--sr-text-muted)]">Session activity</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-sev-info)] animate-pulse" />
            </div>
            <svg width="100%" height="18" viewBox="0 0 200 18" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="var(--sr-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={chartData.map((d, i) => `${(i / Math.max(1, chartData.length - 1)) * 200},${18 - Math.min(16, (d.packets / Math.max(1, Math.max(...chartData.map((c) => c.packets), 1))) * 16) - 1}`).join(' ')}
              />
            </svg>
          </div>

          {/* Sidebar Footer User Details */}
          <div className="pt-4 mx-5 border-t border-[var(--sr-border-hairline)] flex items-center gap-3">
            <div className="p-2 bg-[var(--sr-bg-surface-raised)] rounded-[var(--sr-radius-sm)] text-[var(--sr-text-secondary)] shrink-0">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-[var(--sr-text-primary)] truncate">{user?.username || 'analyst'}</p>
              <span className="text-[11px] text-[var(--sr-text-muted)] capitalize">{user?.role || 'analyst'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT CONTENT WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10 bg-transparent">
        {/* Floating Critical Incident Banner */}
        {activeAlertBanner && (
          <div className="fixed top-5 right-5 z-50 bg-[var(--sr-glass-bg)] backdrop-blur-md border border-[var(--sr-sev-critical)] shadow-2xl rounded-[var(--sr-radius-md)] p-4 max-w-md animate-fade-in flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[var(--sr-sev-critical)] animate-ping" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--sr-sev-critical)]">Critical Threat Flagged</span>
                  <span className="text-[10px] bg-[rgba(208,59,59,0.12)] text-[var(--sr-sev-critical)] px-1.5 py-0.5 rounded-full font-medium">{activeAlertBanner.predicted_label}</span>
                </div>
                <span className="text-[11px] text-[var(--sr-text-secondary)] block mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  Tier {activeAlertBanner.tier} Classifier • Confidence {(activeAlertBanner.confidence * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedDetection({
                    predicted_label: activeAlertBanner.predicted_label,
                    confidence: activeAlertBanner.confidence,
                    tier: activeAlertBanner.tier,
                    tier_name: `Tier ${activeAlertBanner.tier} Classifier`,
                    top_features: Object.entries(activeAlertBanner.raw_features || {}).slice(0, 5).map(([k, v]) => ({
                      feature: k,
                      value: Number(v),
                      importance: 0.05,
                      impact: 0.1,
                      benign_avg: benignBaselines[k] ?? 0
                    })),
                    raw_features: activeAlertBanner.raw_features,
                    benign_averages: benignBaselines
                  });
                  setActiveAlertBanner(null);
                }}
                className="px-2.5 py-1 bg-[var(--sr-accent)] text-white text-[11px] font-medium rounded-[var(--sr-radius-sm)] hover:bg-[var(--sr-accent-hover)] transition-colors cursor-pointer"
              >
                Inspect
              </button>
              <button
                type="button"
                onClick={() => setActiveAlertBanner(null)}
                className="text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] p-1 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* HEADER BRANDING BANNER */}
        <header className="border-b border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md px-8 py-4 flex items-center justify-between shrink-0">
          {activeTab === 'simulator' ? (
            // --- SIMULATOR TAB COMMAND BAR ---
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Crosshair
                  className="w-5 h-5 text-[var(--sr-accent)]"
                  style={{
                    animation: 'spin-slow 8s linear infinite',
                    animationPlayState: simStatus.running ? 'paused' : 'running'
                  }}
                />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--sr-text-primary)] leading-none mb-1">
                    Threat Simulation Console
                  </h2>
                  <span className="text-xs text-[var(--sr-text-secondary)] block leading-tight">
                    Controlled attack replay — isolated test environment — no live network traffic generated
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-[var(--sr-bg-surface-raised)] px-2.5 py-1 rounded-full">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Posture</span>
                  <StatusBadge status={postureStatus.label} className="!border-none !p-0 !bg-transparent" />
                </div>

                <div className="flex items-center gap-1.5 bg-[var(--sr-bg-surface-raised)] px-2.5 py-1 rounded-full">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Telemetry</span>
                  <StatusBadge
                    status={
                      !wsConnected ? 'Disconnected' :
                      (lastHeartbeat && Date.now() - lastHeartbeat < 8000) ? 'Connected' : 'Syncing'
                    }
                    className="!border-none !p-0 !bg-transparent"
                  />
                </div>

                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full border border-[var(--sr-border-hairline)]"
                  style={
                    simStatus.running
                      ? { color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }
                      : { color: 'var(--sr-text-muted)', backgroundColor: 'var(--sr-bg-surface-raised)' }
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${simStatus.running ? 'bg-[var(--sr-accent)] animate-pulse' : 'bg-[var(--sr-text-muted)]'}`} />
                  {simStatus.running ? 'Simulation active' : 'Simulation idle'}
                </span>

                <div className="h-5 w-[1px] bg-[var(--sr-border-hairline)] mx-1" />

                {/* Sound Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSoundEnabled(prev => !prev)}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={soundEnabled ? "Mute Critical alert sound" : "Unmute Critical alert sound"}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--sr-accent)]" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
                </button>

                {/* Theme Switcher Button */}
                <button
                  type="button"
                  onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={theme === 'light' ? "Switch to Dark Theme" : "Switch to Light Theme"}
                >
                  {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
                </button>

                <GlowButton variant="ghost" onClick={logout} className="px-2.5 py-1.5 text-xs">
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </GlowButton>
              </div>
            </div>
          ) : (
            // --- STANDARD BANNER FOR OTHER TABS ---
            <div className="flex items-center justify-between w-full">
              <div>
                <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">
                  {activeTab === 'live' && 'Live Telemetry'}
                  {activeTab === 'history' && 'Alert History'}
                  {activeTab === 'insights' && 'Cascade Benchmarks'}
                  {activeTab === 'ai' && 'Intelligent Analyst Assistant'}
                </h2>
                <span className="text-xs text-[var(--sr-text-muted)]">Bahria University Karachi Campus — BS(IT) Final Year Project</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Posture</span>
                  <StatusBadge status={postureStatus.label} />
                </div>

                <StatusBadge status={
                  !wsConnected ? 'Disconnected' :
                  (lastHeartbeat && Date.now() - lastHeartbeat < 8000) ? 'Connected' : 'Syncing'
                } />

                {simStatus.running && (
                  <StatusBadge status="ACTIVE" />
                )}

                <div className="h-5 w-[1px] bg-[var(--sr-border-hairline)] mx-1" />

                {/* Sound Toggle Button */}
                <button
                  type="button"
                  onClick={() => setSoundEnabled(prev => !prev)}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={soundEnabled ? "Mute Critical alert sound" : "Unmute Critical alert sound"}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--sr-accent)]" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
                </button>

                {/* Theme Switcher Button */}
                <button
                  type="button"
                  onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={theme === 'light' ? "Switch to Dark Theme" : "Switch to Light Theme"}
                >
                  {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
                </button>

                <GlowButton variant="ghost" onClick={logout} className="px-2.5 py-1.5 text-xs">
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </GlowButton>
              </div>
            </div>
          )}
        </header>

        {/* WORKSPACE TAB VIEWS CONTAINER */}
        <section className="flex-1 overflow-y-auto p-8 relative">
          
          {/* ==========================================
              VIEW A: LIVE TELEMETRY LOGS & CHARTS
              ========================================== */}
          {activeTab === 'live' && (
            <div className="flex flex-col gap-6 h-full">

              {/* HERO WELCOME BANNER — a proper landing moment for the console
                  instead of dropping straight into dense data. */}
              <div
                className="relative overflow-hidden rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] p-6 shrink-0"
                style={{
                  background: 'linear-gradient(115deg, var(--sr-accent-soft) 0%, var(--sr-bg-surface) 45%, var(--sr-accent-2-soft) 100%)',
                }}
              >
                <Logomark className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 opacity-[0.08]" />
                <div className="relative flex flex-col gap-1">
                  <h2
                    className="text-2xl sm:text-3xl font-bold tracking-tight"
                    style={{
                      fontFamily: 'var(--sr-font-display)',
                      backgroundImage: 'var(--sr-gradient-brand)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }}
                  >
                    {(() => {
                      const h = new Date().getHours();
                      const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
                      return `Good ${part}, ${user?.username || 'analyst'}.`;
                    })()}
                  </h2>
                  <p className="text-sm text-[var(--sr-text-secondary)] max-w-lg">
                    {postureStatus.label === 'SECURE'
                      ? 'Every screened flow is resolving clean — the cascade is quiet and confident.'
                      : postureStatus.description}
                  </p>
                </div>
              </div>

              {/* SECURITY POSTURE GAUGE & LIVE ATTACK MAP PANEL — the map is this
                  panel's hero visual (3 of 4 columns, taller), not an equal split. */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 shrink-0">
                {/* 1. Security Posture Gauge */}
                <GlowPanel className="flex flex-col items-center justify-between h-[300px] relative overflow-hidden p-4 pb-0">
                  <div className="w-full flex justify-between items-center pb-2 border-b border-[var(--sr-border-hairline)] shrink-0">
                    <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Threat Posture Index</h3>
                    <span className="text-[10px] text-[var(--sr-text-muted)]">2 min window</span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center mt-1">
                    <svg width="180" height="99" viewBox="0 0 200 110" className="overflow-visible">
                      <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="var(--sr-sev-info)" />
                          <stop offset="50%" stopColor="var(--sr-sev-medium)" />
                          <stop offset="100%" stopColor="var(--sr-sev-critical)" />
                        </linearGradient>
                      </defs>
                      {/* Gradient background track (dormant path) */}
                      <path
                        d="M20,100 A80,80 0 0,1 180,100"
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth="12"
                        strokeLinecap="round"
                        opacity="0.18"
                      />
                      {/* Gradient active progress track */}
                      <path
                        d="M20,100 A80,80 0 0,1 180,100"
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray="251.3"
                        strokeDashoffset={251.3 - (251.3 * postureScore) / 100}
                        className="transition-all duration-700 ease-out"
                      />

                      {/* Subtle instrument radial tick marks outside the arc */}
                      {[-90, -45, 0, 45, 90].map((angle, idx) => (
                        <line
                          key={idx}
                          x1="100"
                          y1="9"
                          x2="100"
                          y2="3"
                          stroke="var(--sr-text-muted)"
                          strokeWidth="1"
                          opacity="0.5"
                          transform={`rotate(${angle}, 100, 100)`}
                        />
                      ))}

                      {/* Speedometer Needle & Hub in center-bottom pivot group */}
                      <g transform="translate(100, 100)">
                        <line
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="-72"
                          stroke="var(--sr-text-primary)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          style={{
                            transformOrigin: '0px 0px',
                            transform: `rotate(${-90 + (postureScore / 100) * 180}deg)`,
                            transition: 'transform 0.8s ease-in-out',
                          }}
                        />
                        <circle cx="0" cy="0" r="4" fill="var(--sr-text-primary)" />
                      </g>
                    </svg>

                    {/* Numeric Score Overlay (positioned clearly below the pivot hub) */}
                    <div className="text-center mt-0.5 z-10">
                      <p className="text-xl font-semibold text-[var(--sr-text-primary)] leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{postureScore}%</p>
                      <span className="text-[10px] text-[var(--sr-text-muted)] mt-0.5 block">Risk index</span>
                    </div>

                    {/* Rolling trend sparkline */}
                    <svg width="120" height="20" viewBox="0 0 120 20" className="mt-1.5 overflow-visible">
                      <polyline
                        fill="none"
                        stroke="var(--sr-accent)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.7"
                        points={postureHistory.map((v, i) => `${(i / (postureHistory.length - 1)) * 120},${20 - (v / 100) * 18 - 1}`).join(' ')}
                      />
                    </svg>
                  </div>

                  {/* Status Indicator Bar */}
                  <div className="w-[calc(100%+32px)] mx-[-16px] flex items-center justify-between px-4 min-h-[36px] bg-[var(--sr-bg-surface-raised)] border-t border-[var(--sr-border-hairline)] transition-all duration-500 mt-auto shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${postureStatus.dotColor}`} />
                      <span className={`text-[11px] font-semibold ${postureStatus.color}`}>
                        {postureStatus.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--sr-text-secondary)] truncate ml-4">
                      {postureStatus.description}
                    </span>
                  </div>
                </GlowPanel>

                {/* 2. Interactive Live Attack Map — the hero visual of this panel */}
                <GlowPanel className="lg:col-span-3 flex flex-col justify-between h-[300px] relative overflow-hidden p-5">
                  <div className="w-full flex justify-between items-center pb-2 border-b border-[var(--sr-border-hairline)] shrink-0 z-10">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[var(--sr-accent)]" />
                      <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Live Attack &amp; Traffic Map</h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {simStatus.running ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-accent)] animate-pulse" />
                          <span className="text-[var(--sr-accent)] font-medium">Live</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-text-muted)]" />
                          <span className="text-[var(--sr-text-muted)] font-medium">Idle</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* SVG Attack Vector Canvas */}
                  <div className="flex-1 w-full relative mt-2 overflow-hidden rounded-[var(--sr-radius-sm)] bg-[var(--sr-bg-page)]">
                    <svg width="100%" height="100%" viewBox="0 0 500 150" className="overflow-visible relative z-10">
                      {/* CSS Keyframes Injection */}
                      <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes attacker-glow-active {
                          0% { r: 14px; opacity: 0.15; }
                          50% { r: 24px; opacity: 0.55; }
                          100% { r: 14px; opacity: 0.15; }
                        }
                        @keyframes attacker-glow-calm {
                          0% { r: 14px; opacity: 0.08; }
                          50% { r: 18px; opacity: 0.15; }
                          100% { r: 14px; opacity: 0.08; }
                        }
                        @keyframes client-glow-calm {
                          0% { r: 12px; opacity: 0.08; }
                          50% { r: 16px; opacity: 0.15; }
                          100% { r: 12px; opacity: 0.08; }
                        }
                        @keyframes map-vector-fade {
                          0% { opacity: 0; }
                          15% { opacity: 1; }
                          75% { opacity: 1; }
                          100% { opacity: 0; }
                        }
                        @keyframes standby-pulse {
                          0%, 100% { opacity: 0.01; }
                          50% { opacity: 0.4; }
                        }
                        .standby-text {
                          animation: standby-pulse 3s infinite ease-in-out;
                        }
                        .target-node-circle {
                          transition: all 0.3s ease;
                          stroke: var(--sr-border-hover);
                          stroke-width: 1.5px;
                          fill: var(--sr-bg-surface);
                        }
                        .target-node-circle:hover {
                          stroke: var(--sr-accent);
                          cursor: pointer;
                        }
                      `}} />

                      {/* 1. Draw static topological connections as background mesh */}
                      <path d="M 50 45 Q 235 25 420 30" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />
                      <path d="M 50 45 Q 235 60 420 75" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />
                      <path d="M 50 45 Q 235 90 420 120" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 60 420 30" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 90 420 75" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 120 420 120" fill="none" stroke="var(--sr-text-muted)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.08 : 0.25} className="transition-all duration-700" />

                      {/* 2. Left Node Group: Source Pools */}
                      {/* Attacker Node Pool */}
                      <circle
                        cx="50"
                        cy="45"
                        r="14"
                        fill="var(--sr-sev-critical)"
                        style={{
                          animation: simStatus.running
                            ? 'attacker-glow-active 1.5s infinite ease-in-out'
                            : 'attacker-glow-calm 3s infinite ease-in-out',
                          transformOrigin: '50px 45px'
                        }}
                      />
                      <circle cx="50" cy="45" r="12" stroke="var(--sr-sev-critical)" strokeWidth="1.5" fill="rgba(208, 59, 59, 0.10)" />
                      <text x="50" y="48" fill="var(--sr-sev-critical)" fontSize="7" textAnchor="middle" fontWeight="bold" className="select-none">ATK</text>
                      <text x="50" y="24" fill="var(--sr-sev-critical)" fontSize="7.5" textAnchor="middle" fontWeight="600" className="select-none">Attacker Pool</text>
                      <text x="50" y="32" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" className="select-none" style={{ fontVariantNumeric: 'tabular-nums' }}>203.0.113.45</text>

                      {/* Client Node Pool */}
                      <circle
                        cx="50"
                        cy="105"
                        r="12"
                        fill="var(--sr-sev-info)"
                        style={{
                          animation: 'client-glow-calm 4s infinite ease-in-out',
                          transformOrigin: '50px 105px'
                        }}
                      />
                      <circle cx="50" cy="105" r="10" stroke="var(--sr-sev-info)" strokeWidth="1.5" fill="rgba(12, 163, 12, 0.10)" />
                      <text x="50" y="108" fill="var(--sr-sev-info)" fontSize="7" textAnchor="middle" fontWeight="bold" className="select-none">USR</text>
                      <text x="50" y="126" fill="var(--sr-sev-info)" fontSize="7.5" textAnchor="middle" fontWeight="600" className="select-none">Clients (Benign)</text>
                      <text x="50" y="134" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" className="select-none" style={{ fontVariantNumeric: 'tabular-nums' }}>192.168.10.50</text>

                      {/* 3. Internal Network Boundary (Right) */}
                      <rect x="320" y="8" width="170" height="138" rx="6" fill="none" stroke="var(--sr-border-hairline)" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="405" y="20" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" fontWeight="bold" letterSpacing="1.5" className="select-none uppercase opacity-70">Internal LAN</text>

                      {/* Web Server Node */}
                      <circle cx="420" cy="30" r="10" className="target-node-circle" />
                      <text x="420" y="33" fill="var(--sr-text-primary)" fontSize="7" fontWeight="bold" className="select-none" textAnchor="middle">WS</text>
                      <text x="420" y="49" fill="var(--sr-text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="600" className="select-none">Web Server</text>
                      <text x="420" y="57" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" className="select-none" style={{ fontVariantNumeric: 'tabular-nums' }}>192.168.10.10</text>

                      {/* DB Server Node */}
                      <circle cx="420" cy="75" r="10" className="target-node-circle" />
                      <text x="420" y="78" fill="var(--sr-text-primary)" fontSize="7" fontWeight="bold" className="select-none" textAnchor="middle">DB</text>
                      <text x="420" y="94" fill="var(--sr-text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="600" className="select-none">DB Server</text>
                      <text x="420" y="102" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" className="select-none" style={{ fontVariantNumeric: 'tabular-nums' }}>192.168.10.20</text>

                      {/* Workstation Node */}
                      <circle cx="420" cy="120" r="10" className="target-node-circle" />
                      <text x="420" y="123" fill="var(--sr-text-primary)" fontSize="7" fontWeight="bold" className="select-none" textAnchor="middle">PC</text>
                      <text x="420" y="139" fill="var(--sr-text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="600" className="select-none">Workstation</text>
                      <text x="420" y="147" fill="var(--sr-text-muted)" fontSize="6" textAnchor="middle" className="select-none" style={{ fontVariantNumeric: 'tabular-nums' }}>192.168.10.30</text>

                      {/* 4. Active flow vectors mapping */}
                      {activeVectors.map((vec, index) => {
                        // Count concurrent vectors to offset curves dynamically
                        const concurrentCount = activeVectors.slice(0, index).filter(v => v.toY === vec.toY).length;
                        const offsetDirection = concurrentCount % 2 === 0 ? 1 : -1;
                        const multiplier = Math.floor((concurrentCount + 1) / 2);
                        const dynamicOffset = offsetDirection * multiplier * 12;

                        const isBenign = vec.label.toUpperCase() === 'BENIGN';
                        const severityUpper = (vec.severity || 'Info').toUpperCase();
                        const color = isBenign ? 'var(--sr-sev-info)' :
                          severityUpper === 'CRITICAL' ? 'var(--sr-sev-critical)' :
                          severityUpper === 'HIGH' ? 'var(--sr-sev-high)' :
                          severityUpper === 'MEDIUM' ? 'var(--sr-sev-medium)' :
                          'var(--sr-sev-low)'; // Low / Info
                          
                        const strokeWidth = vec.isAttack ? 2.5 : 1.2;
                        const controlOffset = (vec.isAttack ? -35 : -15) + dynamicOffset;
                        const pathString = `M ${vec.fromX} ${vec.fromY} Q ${(vec.fromX + vec.toX)/2} ${(vec.fromY + vec.toY)/2 + controlOffset} ${vec.toX} ${vec.toY}`;
                        
                        return (
                          <g 
                            key={vec.id} 
                            style={{ animation: 'map-vector-fade 1.8s ease-in-out forwards' }}
                          >
                            {/* Animated vector line path */}
                            <path
                              d={pathString}
                              fill="none"
                              stroke={color}
                              strokeWidth={strokeWidth}
                              opacity={vec.isAttack ? 0.65 : 0.3}
                              strokeLinecap="round"
                              className="transition-all duration-1000"
                            />
                            {/* Flying laser bullet glow halo */}
                            <circle r={vec.isAttack ? 6 : 4} fill={color} opacity="0.35">
                              <animateMotion
                                path={pathString}
                                dur="1.2s"
                                calcMode="spline"
                                keyTimes="0;1"
                                keySplines="0.25 1 0.5 1"
                                repeatCount="1"
                                fill="freeze"
                              />
                            </circle>
                            {/* Flying laser bullet */}
                            <circle r={vec.isAttack ? 2.5 : 1.5} fill="#ffffff">
                              <animateMotion
                                path={pathString}
                                dur="1.2s"
                                calcMode="spline"
                                keyTimes="0;1"
                                keySplines="0.25 1 0.5 1"
                                repeatCount="1"
                                fill="freeze"
                              />
                            </circle>

                            {/* Destination server impact flash */}
                            <circle cx={vec.toX} cy={vec.toY} r="12" stroke={color} strokeWidth="1.5" fill="none" className="animate-ping" opacity="0.4" style={{ animationDuration: '1.5s' }} />

                            {/* Transparent thicker path for easy hovering */}
                            <path
                              d={pathString}
                              fill="none"
                              stroke="transparent"
                              strokeWidth="8"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredVector(vec)}
                              onMouseLeave={() => setHoveredVector(null)}
                            />
                          </g>
                        );
                      })}
                    </svg>

                    {/* Tooltip Overlay */}
                    {hoveredVector && (
                      <div
                        className="absolute bg-[var(--sr-text-primary)] rounded-[var(--sr-radius-sm)] px-2.5 py-1.5 pointer-events-none text-[10px] text-white shadow-[var(--sr-shadow-md)] z-30 transition-all duration-150"
                        style={{
                          left: `${(hoveredVector.fromX + hoveredVector.toX) / 2 / 5}%`,
                          top: `${((hoveredVector.fromY + hoveredVector.toY) / 2 + (hoveredVector.isAttack ? -35 : -15)) / 1.5}%`,
                          transform: 'translate(-50%, -100%)',
                          marginTop: '-8px'
                        }}
                      >
                        <div className="font-semibold mb-0.5">
                          {hoveredVector.label}
                        </div>
                        <div className="text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {hoveredVector.source_ip}:{hoveredVector.source_port} &rarr; {hoveredVector.dest_ip}:{hoveredVector.dest_port}
                        </div>
                        <div className="mt-0.5 text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          Confidence {(hoveredVector.confidence * 100).toFixed(2)}%
                        </div>
                        <div className="mt-0.5">
                          <span className="font-semibold">{hoveredVector.severity}</span>
                        </div>
                      </div>
                    )}

                    {/* Threat Map overlay */}
                    {liveEvents.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
                        <span className="text-xs text-[var(--sr-text-muted)] standby-text">
                          Awaiting ingress stream telemetry…
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Legend Overlay at the bottom */}
                  <div className="flex justify-between items-center bg-[var(--sr-bg-surface-raised)] rounded-[var(--sr-radius-sm)] px-3 py-1.5 text-[10px] text-[var(--sr-text-secondary)] shrink-0 mt-2 z-10">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-medium text-[var(--sr-text-muted)]">Severity:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Benign', v: '--sr-sev-info' },
                          { label: 'Low', v: '--sr-sev-low' },
                          { label: 'Medium', v: '--sr-sev-medium' },
                          { label: 'High', v: '--sr-sev-high' },
                          { label: 'Critical', v: '--sr-sev-critical' },
                        ].map((s) => (
                          <span key={s.label} className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: `var(${s.v})` }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `var(${s.v})` }} />
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {Object.keys(topTalkers).length > 0 && (
                      <span className="text-[10px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        Top talker: {Object.entries(topTalkers).sort((a, b) => b[1] - a[1])[0][0]} ({Object.entries(topTalkers).sort((a, b) => b[1] - a[1])[0][1]})
                      </span>
                    )}
                  </div>
                </GlowPanel>
              </div>

              {/* SOC KPI STAT CARDS — asymmetric bento grid: the two volume metrics
                  lead as larger hero tiles, rate + tier breakdown sit as supporting
                  tiles beneath, rather than four identical equal-width boxes. */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                <GlowPanel className="md:col-span-2 flex flex-col justify-between h-[112px] p-5 overflow-hidden transition-shadow duration-300 hover:!shadow-[var(--sr-shadow-glow)]">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-medium text-[var(--sr-text-muted)]">Packets Processed</span>
                    <svg width="72" height="28" viewBox="0 0 72 28" className="opacity-70 shrink-0">
                      <polyline
                        fill="none" stroke="var(--sr-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        points={chartData.map((d, i) => `${(i / Math.max(1, chartData.length - 1)) * 72},${28 - Math.min(26, (d.packets / Math.max(1, Math.max(...chartData.map(c => c.packets), 1))) * 26) - 1}`).join(' ')}
                      />
                    </svg>
                  </div>
                  <div className="mt-1">
                    <p
                      className="text-3xl font-semibold tracking-tight"
                      style={{
                        fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--sr-font-display)',
                        backgroundImage: 'var(--sr-gradient-brand)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                      }}
                    >
                      {packetsAnalyzed.toLocaleString()}
                    </p>
                    <span className="text-[11px] text-[var(--sr-text-muted)] mt-0.5 block">Total streams screened in session</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="md:col-span-2 flex flex-col justify-between h-[112px] p-5 overflow-hidden transition-shadow duration-300 hover:!shadow-[0_20px_50px_-16px_rgba(208,59,59,0.3)]">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-medium text-[var(--sr-text-muted)]">Attacks Detected</span>
                    <svg width="72" height="28" viewBox="0 0 72 28" className="opacity-70 shrink-0">
                      <polyline
                        fill="none" stroke="var(--sr-sev-critical)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        points={chartData.map((d, i) => `${(i / Math.max(1, chartData.length - 1)) * 72},${28 - Math.min(26, (d.threats / Math.max(1, Math.max(...chartData.map(c => c.threats), 1))) * 26) - 1}`).join(' ')}
                      />
                    </svg>
                  </div>
                  <div className="mt-1">
                    <p className="text-3xl font-semibold text-[var(--sr-sev-critical)] tracking-tight" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--sr-font-display)' }}>{attacksCount.toLocaleString()}</p>
                    <span className="text-[11px] text-[var(--sr-text-muted)] mt-0.5 block">Flagged anomalies (non-BENIGN)</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="md:col-span-1 flex flex-col justify-between h-[84px] p-4">
                  <span className="text-[11px] font-medium text-[var(--sr-text-muted)]">Current Flow Rate</span>
                  <div className="mt-1">
                    <p className="text-xl font-semibold text-[var(--sr-accent)] tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{packetsPerSecond} <span className="text-xs font-medium text-[var(--sr-text-secondary)]">pkts/sec</span></p>
                    <span className="text-[11px] text-[var(--sr-text-muted)] mt-0.5 block">Real-time ingress bandwidth</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="md:col-span-3 flex flex-col justify-between h-[84px] p-4">
                  <span className="text-[11px] font-medium text-[var(--sr-text-muted)]">Cascade Tier Distribution</span>
                  <div className="mt-1 grid grid-cols-3 gap-3">
                    {[
                      { t: 1, v: liveTiers[1] || 0, c: '--sr-cat-1' },
                      { t: 2, v: liveTiers[2] || 0, c: '--sr-cat-2' },
                      { t: 3, v: liveTiers[3] || 0, c: '--sr-cat-3' },
                    ].map((tier) => (
                      <div key={tier.t} className="flex items-center gap-2 bg-[var(--sr-bg-surface-raised)] px-2.5 py-1.5 rounded-[var(--sr-radius-sm)]">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: `var(${tier.c})` }} />
                        <span className="text-sm font-semibold" style={{ color: `var(${tier.c})`, fontVariantNumeric: 'tabular-nums' }}>{tier.v}</span>
                        <span className="text-[10px] text-[var(--sr-text-muted)]">T{tier.t}</span>
                      </div>
                    ))}
                  </div>
                </GlowPanel>
              </div>

              {/* DUAL CHARTING SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 h-[280px]">
                {/* Chart 1: Volumetric Line Chart (Packets and Threats Rate) */}
                <GlowPanel className="lg:col-span-2 flex flex-col justify-between h-full p-5">
                  <div className="pb-3 border-b border-[var(--sr-border-hairline)] flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Volumetric Timeline</h3>
                      <span className="text-[11px] text-[var(--sr-text-muted)] hidden sm:inline">Replayed rate vs flagged anomalies</span>
                    </div>
                    {/* Interactive Legend Toggles */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setShowPacketsSeries(prev => !prev)}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--sr-radius-sm)] border text-[10px] font-medium transition-all cursor-pointer ${
                          showPacketsSeries
                            ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]'
                            : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] line-through'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-accent)]" />
                        Ingress Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowThreatsSeries(prev => !prev)}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--sr-radius-sm)] border text-[10px] font-medium transition-all cursor-pointer ${
                          showThreatsSeries
                            ? 'bg-[rgba(208,59,59,0.12)] border-[var(--sr-sev-critical)] text-[var(--sr-sev-critical)]'
                            : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] line-through'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-sev-critical)]" />
                        Threats Rate
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 w-full min-w-0 min-h-[180px] h-[180px] mt-4 relative">
                    {chartData.length === 0 || chartData.every(d => d.packets === 0) ? (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10 text-[11px] text-[var(--sr-text-muted)] italic">
                        No active traffic stream — start a scenario in Threat Simulator to observe telemetry
                      </div>
                    ) : null}
                    <div className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorPackets" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--sr-accent)" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="var(--sr-accent)" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--sr-sev-critical)" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="var(--sr-sev-critical)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--sr-border-hairline)" />
                          <XAxis dataKey="time" stroke="var(--sr-text-muted)" fontSize={10} />
                          <YAxis stroke="var(--sr-text-muted)" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: 'var(--sr-bg-surface)', border: '1px solid var(--sr-border-hairline)', borderRadius: 8, fontSize: 11, color: 'var(--sr-text-primary)' }} />
                          {showPacketsSeries && (
                            <Area type="monotone" dataKey="packets" name="Ingress rate" stroke="var(--sr-accent)" fillOpacity={1} fill="url(#colorPackets)" strokeWidth={2} />
                          )}
                          {showThreatsSeries && (
                            <Area type="monotone" dataKey="threats" name="Threats rate" stroke="var(--sr-sev-critical)" fillOpacity={1} fill="url(#colorThreats)" strokeWidth={2} />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </GlowPanel>

                {/* Chart 2: Threat Category counts */}
                <GlowPanel className="flex flex-col justify-between h-full p-5">
                  <div className="pb-3 border-b border-[var(--sr-border-hairline)] flex justify-between items-center">
                    <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Threat Distributions</h3>
                    <span className="text-[11px] text-[var(--sr-text-muted)]">Counts per category</span>
                  </div>
                  <div className="flex-1 w-full min-w-0 min-h-[180px] h-[180px] mt-4 relative">
                    <div className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart
                          data={Object.entries(attackCounts)
                            .filter(([name]) => name.toUpperCase() !== 'BENIGN')
                            .map(([name, count]) => ({ name, count }))}
                          margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--sr-border-hairline)" />
                          <XAxis type="number" stroke="var(--sr-text-muted)" fontSize={10} />
                          <YAxis type="category" dataKey="name" stroke="var(--sr-text-muted)" fontSize={10} width={70} />
                          <Tooltip contentStyle={{ backgroundColor: 'var(--sr-bg-surface)', border: '1px solid var(--sr-border-hairline)', borderRadius: 8, fontSize: 11, color: 'var(--sr-text-primary)' }} />
                          <Bar dataKey="count" fill="var(--sr-accent)" radius={[0, 4, 4, 0]} barSize={10} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </GlowPanel>
              </div>

              {/* FULL WIDTH LIVE TELEMETRY TABLE */}
              <GlowPanel className="flex-1 flex flex-col min-h-[300px] overflow-hidden p-5">
                <div className="pb-3 border-b border-[var(--sr-border-hairline)] flex justify-between items-center shrink-0">
                  <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Live Threat Telemetry Feed</h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--sr-text-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-sev-critical)] animate-pulse"></span>
                    Ingesting stream
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto mt-2 text-[13px]">
                  {liveEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--sr-text-muted)] text-sm">
                      Awaiting live telemetry packets...
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[var(--sr-bg-surface)] sticky top-0 border-b border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] font-medium text-[11px] z-10">
                        <tr>
                          <th className="p-3 font-medium">Time</th>
                          <th className="p-3 font-medium">Attack Category</th>
                          <th className="p-3 font-medium">Severity</th>
                          <th className="p-3 font-medium">Confidence</th>
                          <th className="p-3 font-medium">Resolution Classifier</th>
                          <th className="p-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--sr-border-hairline)]">
                        {liveEvents.map((evt, i) => {
                          const isThreat = evt.data && evt.data.predicted_label.toUpperCase() !== 'BENIGN';
                          const lbl = evt.data?.predicted_label || '';
                          const sevVar = isThreat ? 'var(--sr-sev-critical)' : 'var(--sr-sev-info)';

                          return (
                            <tr
                              key={i}
                              className="hover:bg-[var(--sr-bg-surface-raised)] transition-all animate-fade-in"
                              style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s`, borderLeft: `3px solid ${sevVar}` }}
                            >
                              <td className="p-3 text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                              </td>
                              <td className="p-3 font-medium text-[var(--sr-text-primary)]">
                                {lbl}
                              </td>
                              <td className="p-3">
                                <StatusBadge status={evt.data?.severity || 'Info'} />
                              </td>
                              <td className="p-3 font-medium text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {((evt.data?.confidence || 0) * 100).toFixed(2)}%
                              </td>
                              <td className="p-3 text-[var(--sr-text-secondary)]">
                                {evt.data?.tier_name}
                              </td>
                              <td className="p-3 text-right">
                                {evt.data?.top_features && (
                                  <button
                                    onClick={() => setSelectedDetection(evt.data!)}
                                    className="text-[var(--sr-accent)] hover:text-[var(--sr-accent-hover)] font-medium hover:underline cursor-pointer text-xs"
                                  >
                                    Explain
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </GlowPanel>
            </div>
          )}

          {/* ==========================================
              VIEW B: THREAT SIMULATOR CONTROLLERS
              ========================================== */}
          {activeTab === 'simulator' && (() => {
            const activeScenarioInfo = scenarios && selectedScenario ? scenarios[selectedScenario] : null;
            const armedScenarioDetails = selectedScenario && SCENARIO_DETAILS[selectedScenario] 
              ? { display_name: scenarios?.[selectedScenario]?.display_name || 'ATTACK', ...SCENARIO_DETAILS[selectedScenario] }
              : null;
            
            // Lookups for state badge in Live Status panel
            let stateDot = 'bg-[var(--sr-text-muted)]';
            let stateText = 'Standby';
            let stateColorVar = '--sr-text-muted';
            let stateBg = 'var(--sr-bg-surface-raised)';

            if (simStatus.running) {
              stateDot = 'bg-[var(--sr-accent)] animate-pulse';
              stateText = 'Transmitting';
              stateColorVar = '--sr-accent';
              stateBg = 'var(--sr-accent-soft)';
            } else if (simStatus.packets_sent > 0 && !simStatus.running) {
              stateDot = 'bg-[var(--sr-sev-info)]';
              stateText = 'Completed';
              stateColorVar = '--sr-sev-info';
              stateBg = 'rgba(12, 163, 12, 0.08)';
            }
            
            const generateWaveformPaths = () => {
              const width = 300;
              const height = 25;
              const points = ppsHistory;
              const maxVal = Math.max(...points, 5); // default scale min of 5
              const coords = points.map((val, idx) => {
                const x = idx * (width / (points.length - 1));
                const y = height - (val / maxVal) * (height - 4) - 2; // clamp with 2px borders
                return { x, y };
              });
              
              const lineD = coords.reduce((acc, coord, idx) => {
                return acc + `${idx === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`;
              }, '');
              
              const areaD = lineD + ` L ${width} ${height} L 0 ${height} Z`;
              return { lineD, areaD };
            };
            const wavePaths = generateWaveformPaths();
            
            const totalDetections = (simStatus.tier_breakdown['1'] || 0) + (simStatus.tier_breakdown['2'] || 0) + (simStatus.tier_breakdown['3'] || 0);
            const t1Pct = totalDetections > 0 ? ((simStatus.tier_breakdown['1'] || 0) / totalDetections) * 100 : 0;
            const t2Pct = totalDetections > 0 ? ((simStatus.tier_breakdown['2'] || 0) / totalDetections) * 100 : 0;
            const t3Pct = totalDetections > 0 ? ((simStatus.tier_breakdown['3'] || 0) / totalDetections) * 100 : 0;
            
            return (
              <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">

                  {/* Controller Settings Form */}
                  <GlowPanel className="flex flex-col justify-between p-6 md:col-span-2">
                    <div className="space-y-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--sr-border-hairline)] mb-4">
                          <h3 className="text-sm font-semibold text-[var(--sr-text-primary)] flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-[var(--sr-accent)]" />
                            Configure Simulator Preset
                          </h3>
                          <span className="text-[11px] text-[var(--sr-accent)] px-2 py-0.5 rounded-full bg-[var(--sr-accent-soft)]">
                            System live
                          </span>
                        </div>
                        <p className="text-xs text-[var(--sr-text-secondary)] mb-6">Select a threat replay scenario profile to inject test packets into the cascade engine.</p>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-2.5">Select scenario preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                          {loadingScenarios || !scenarios ? (
                            Array.from({ length: 10 }).map((_, idx) => (
                              <div
                                key={idx}
                                className="animate-pulse bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] h-[110px] p-3.5 flex flex-col justify-between"
                              >
                                <div className="flex justify-between items-center w-full">
                                  <div className="w-2 h-2 bg-[var(--sr-border-hover)] rounded-full" />
                                  <div className="w-4.5 h-4.5 bg-[var(--sr-border-hover)] rounded" />
                                </div>
                                <div className="space-y-1.5 w-full">
                                  <div className="w-16 h-2 bg-[var(--sr-border-hover)] rounded" />
                                  <div className="w-full h-1.5 bg-[var(--sr-border-hover)] rounded" />
                                </div>
                              </div>
                            ))
                          ) : (
                            Object.entries(scenarios).map(([key, info]) => {
                              const isSelected = selectedScenario === key;
                              const sevVar =
                                info.severity_hint === 'Critical' ? '--sr-sev-critical' :
                                info.severity_hint === 'High' ? '--sr-sev-high' :
                                info.severity_hint === 'Medium' ? '--sr-sev-medium' :
                                '--sr-sev-info';

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => { setSelectedScenario(key); setSimError(null); }}
                                  className="w-full text-left transition-all outline-none cursor-pointer select-none group relative"
                                >
                                  <div
                                    className={`relative p-3 flex flex-col justify-between min-h-[110px] rounded-[var(--sr-radius-sm)] border transition-all duration-200 ${
                                      isSelected
                                        ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)]'
                                        : 'bg-[var(--sr-bg-surface)] hover:bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] hover:border-[var(--sr-border-hover)]'
                                    }`}
                                  >
                                    {/* ARMED indicator */}
                                    {isSelected && (
                                      <span className="absolute top-1.5 right-1.5 text-[9px] font-medium text-[var(--sr-accent)]">
                                        Armed
                                      </span>
                                    )}

                                    {/* TOP ROW: severity dot + icon chip */}
                                    <div className="flex justify-between items-center w-full">
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: `var(${sevVar})` }}
                                        title={`Severity: ${info.severity_hint}`}
                                      />
                                      <span
                                        className="flex items-center justify-center w-7 h-7 rounded-full transition-transform duration-200 group-hover:scale-105"
                                        style={{ backgroundColor: `color-mix(in srgb, var(${sevVar}) 12%, transparent)` }}
                                      >
                                        <AttackIcon type={key as AttackIconType} className="w-3.5 h-3.5" style={{ color: `var(${sevVar})` }} />
                                      </span>
                                    </div>

                                    {/* MIDDLE: Display name */}
                                    <div className="mt-2 w-full">
                                      <p className={`font-semibold text-[11px] leading-tight ${isSelected ? 'text-[var(--sr-text-primary)]' : 'text-[var(--sr-text-secondary)]'}`}>
                                        {info.display_name}
                                      </p>
                                    </div>

                                    {/* BOTTOM: Description + severity label, stacked to give the description its full width to wrap in */}
                                    <div className="flex flex-col gap-1.5 mt-2.5 w-full">
                                      <span className="text-[11px] text-[var(--sr-text-muted)] block line-clamp-2 leading-tight">
                                        {info.description}
                                      </span>
                                      <span
                                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none self-start"
                                        style={{ color: `var(${sevVar})`, backgroundColor: `color-mix(in srgb, var(${sevVar}) 10%, transparent)` }}
                                      >
                                        {info.severity_hint}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Attack Profile Preview Panel */}
                      <div className={`transition-all duration-300 ease-in-out overflow-hidden border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] bg-[var(--sr-bg-surface-raised)] ${
                        selectedScenario
                          ? 'max-h-[300px] opacity-100 p-4 mt-2'
                          : 'max-h-[100px] opacity-90 p-4 mt-2'
                      }`}>
                        {!selectedScenario ? (
                          <div className="h-12 flex items-center justify-center text-[var(--sr-text-muted)] text-xs">
                            ← Select a scenario to view its attack profile
                          </div>
                        ) : (
                          (() => {
                            const info = SCENARIO_DETAILS[selectedScenario] || SCENARIO_DETAILS.benign_baseline;
                            const estPackets = simRate * simDuration;
                            const estDetections = selectedScenario === 'benign_baseline'
                              ? Math.round(estPackets * 0.02)
                              : Math.round(estPackets * 0.95);

                            // Simulation intensity calculation
                            let intensityLabel = 'Low';
                            let intensityWidth = '25%';
                            let intensityColorVar = '--sr-sev-info';
                            if (simRate >= 31) {
                              intensityLabel = 'Extreme';
                              intensityWidth = '100%';
                              intensityColorVar = '--sr-sev-critical';
                            } else if (simRate >= 16) {
                              intensityLabel = 'High';
                              intensityWidth = '85%';
                              intensityColorVar = '--sr-sev-high';
                            } else if (simRate >= 6) {
                              intensityLabel = 'Medium';
                              intensityWidth = '60%';
                              intensityColorVar = '--sr-sev-medium';
                            }

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs align-top">
                                {/* Left Half: Summary */}
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-semibold" style={{ color: info.color }}>
                                      {scenarios?.[selectedScenario]?.display_name || info.severity} scenario profile
                                    </h4>
                                    <span
                                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
                                      style={{ color: info.color, backgroundColor: `color-mix(in srgb, ${info.color} 10%, transparent)` }}
                                    >
                                      {info.severity}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[var(--sr-text-secondary)] leading-relaxed">
                                    {scenarios?.[selectedScenario]?.description || 'Configuration profile preview.'}
                                  </p>

                                  {/* Data Chips Row */}
                                  <div className="flex flex-wrap gap-2 text-[10px]">
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Severity: <span className="font-medium" style={{ color: info.color }}>{info.severity}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Type: <span className="font-medium text-[var(--sr-text-primary)]">{info.type}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Expected tier hit: <span className="font-medium text-[var(--sr-accent)]">{info.tier}</span>
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-[var(--sr-text-secondary)] leading-snug border-l-2 border-[var(--sr-accent)]/40 pl-2">
                                    <span className="text-[var(--sr-text-primary)] font-medium">Threat vector:</span> {info.vector}
                                  </p>
                                </div>

                                {/* Right Half: Estimated Readout */}
                                <div className="space-y-3 border-t md:border-t-0 md:border-l border-[var(--sr-border-hairline)] pt-3 md:pt-0 md:pl-6 flex flex-col justify-between">
                                  <div>
                                    <h4 className="text-[11px] font-medium text-[var(--sr-text-muted)] mb-2.5">
                                      Estimated simulation readout
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. packets</span>
                                        <span className="text-xs text-[var(--sr-text-primary)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{estPackets.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. alerts</span>
                                        <span className="text-xs text-[var(--sr-sev-critical)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{estDetections.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. duration</span>
                                        <span className="text-xs text-[var(--sr-text-primary)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{simDuration}s</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Intensity Bar */}
                                  <div className="space-y-1 mt-1">
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-[var(--sr-text-muted)]">Simulation intensity</span>
                                      <span className="font-medium text-[var(--sr-text-primary)]">{intensityLabel}</span>
                                    </div>
                                    <div className="w-full bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: intensityWidth, backgroundColor: `var(${intensityColorVar})` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>

                      {/* Divider */}
                      <div className="h-[1px] bg-[var(--sr-border-hairline)] my-4" />

                      {/* Rate & Duration Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        {/* Rate Control Group */}
                        <div className="md:border-r border-[var(--sr-border-hairline)] pr-0 md:pr-6 space-y-3">
                          <div>
                            <span className="text-[11px] font-medium text-[var(--sr-text-secondary)] block leading-none">Stream rate</span>
                            <span className="text-[10px] text-[var(--sr-text-muted)]">packets / second</span>
                          </div>

                          {/* Rate Presets */}
                          <div className="flex gap-2">
                            {[
                              { label: 'Slow · 2', val: 2 },
                              { label: 'Normal · 5', val: 5 },
                              { label: 'Fast · 15', val: 15 },
                              { label: 'Max · 30', val: 30 }
                            ].map((p) => (
                              <GlowButton
                                key={p.val}
                                type="button"
                                variant="ghost"
                                onClick={() => setSimRate(p.val)}
                                className={`px-2 py-1 text-[10px] leading-none border rounded-[var(--sr-radius-sm)] transition-all ${
                                  simRate === p.val
                                    ? '!text-[var(--sr-accent)] !border-[var(--sr-accent)] bg-[var(--sr-accent-soft)]'
                                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                                }`}
                              >
                                {p.label}
                              </GlowButton>
                            ))}
                          </div>

                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={simRate}
                            onChange={(e) => setSimRate(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] p-2.5 text-xs text-[var(--sr-text-primary)] outline-none transition-all"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                        </div>

                        {/* Duration Control Group */}
                        <div className="space-y-3">
                          <div>
                            <span className="text-[11px] font-medium text-[var(--sr-text-secondary)] block leading-none">Duration</span>
                            <span className="text-[10px] text-[var(--sr-text-muted)]">seconds</span>
                          </div>

                          {/* Duration Presets */}
                          <div className="flex gap-2">
                            {[
                              { label: '15s', val: 15 },
                              { label: '30s', val: 30 },
                              { label: '60s', val: 60 },
                              { label: '120s', val: 120 }
                            ].map((p) => (
                              <GlowButton
                                key={p.val}
                                type="button"
                                variant="ghost"
                                onClick={() => setSimDuration(p.val)}
                                className={`px-2.5 py-1 text-[10px] leading-none border rounded-[var(--sr-radius-sm)] transition-all ${
                                  simDuration === p.val
                                    ? '!text-[var(--sr-accent)] !border-[var(--sr-accent)] bg-[var(--sr-accent-soft)]'
                                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                                }`}
                              >
                                {p.label}
                              </GlowButton>
                            ))}
                          </div>

                          <input
                            type="number"
                            min="5"
                            max="300"
                            value={simDuration}
                            onChange={(e) => setSimDuration(Math.min(300, Math.max(5, parseInt(e.target.value) || 5)))}
                            className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] p-2.5 text-xs text-[var(--sr-text-primary)] outline-none transition-all"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-[1px] bg-[var(--sr-border-hairline)] my-4" />
                    </div>

                    {/* Action CTA Button */}
                    <div className="mt-6 z-10 relative">
                      {simStatus.running ? (
                        // RUNNING STATE: ABORT SIMULATION
                        <button
                          onClick={handleStopSim}
                          type="button"
                          className="relative w-full h-[52px] bg-[var(--sr-sev-critical)] rounded-[var(--sr-radius-md)] flex items-center justify-between px-5 cursor-pointer outline-none select-none overflow-hidden transition-all duration-300 text-xs shadow-[var(--sr-shadow-sm)]"
                        >
                          <div className="flex items-center gap-2 text-white font-semibold">
                            <Square className="w-4 h-4 fill-white" />
                            <span>Abort simulation</span>
                          </div>
                          <span className="text-[10px] text-white/80 bg-white/10 px-2 py-0.5 rounded-full font-medium">
                            {scenarios?.[selectedScenario]?.display_name || 'Attack'} stream active
                          </span>

                          {/* Bottom edge progress bar */}
                          <div
                            className="absolute bottom-0 left-0 h-1 bg-white opacity-40 transition-all ease-linear"
                            style={{
                              width: `${Math.min(100, (localElapsed / (simStatus.duration_seconds || 30)) * 100)}%`,
                              transitionDuration: '1000ms'
                            }}
                          />
                        </button>
                      ) : (
                        // IDLE STATE: INITIATE SIMULATION
                        (() => {
                          const isArmed = !!selectedScenario;
                          const info = armedScenarioDetails;
                          const labelText = isArmed ? `${info?.display_name || 'Attack'} armed` : 'Select a scenario';

                          return (
                            <button
                              onClick={isArmed ? handleStartSim : undefined}
                              type="button"
                              disabled={!isArmed}
                              className={`group relative w-full h-[52px] rounded-[var(--sr-radius-md)] flex items-center justify-between pl-8 pr-5 outline-none select-none overflow-hidden transition-all duration-300 text-xs border ${
                                isArmed
                                  ? 'bg-[var(--sr-accent)] border-transparent cursor-pointer hover:bg-[var(--sr-accent-hover)] shadow-[var(--sr-shadow-sm)] text-white'
                                  : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] cursor-not-allowed text-[var(--sr-text-muted)]'
                              }`}
                            >
                              {/* Launch-console hazard stripe — armed-state-only physical control cue */}
                              {isArmed && (
                                <span
                                  className="absolute left-0 top-0 h-full w-5"
                                  style={{
                                    backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 9px)',
                                  }}
                                  aria-hidden="true"
                                />
                              )}

                              <div className="flex items-center gap-2 font-semibold">
                                <Play className="w-4 h-4 fill-current" />
                                <span>Initiate simulation</span>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  isArmed
                                    ? 'text-white bg-white/15'
                                    : 'text-[var(--sr-text-muted)] bg-[var(--sr-bg-surface)]'
                                }`}
                              >
                                {isArmed && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                                {labelText}
                              </span>
                            </button>
                          );
                        })()
                      )}

                      {simError && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[rgba(208,59,59,0.06)] p-3 text-xs text-[var(--sr-text-secondary)]">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sr-sev-critical)]" />
                          <div>
                            <span className="font-medium text-[var(--sr-text-primary)]">Simulation could not start.</span>{' '}
                            {simError.includes('Cascade assets')
                              ? 'No trained model is available yet — the cascade needs to be trained on the CIC-IDS2017 dataset before simulations can run.'
                              : simError}
                          </div>
                        </div>
                      )}
                    </div>
                  </GlowPanel>

                  {/* Live Sim Telemetry Stats */}
                  <GlowPanel className="flex flex-col justify-between p-6">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--sr-text-primary)] mb-1 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[var(--sr-accent)]" />
                        Live Status Panel
                      </h3>
                      <p className="text-xs text-[var(--sr-text-secondary)] mb-6">Real-time telemetry — replayer task metrics</p>

                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2 items-center">
                          <span className="text-[var(--sr-text-secondary)]">Status state</span>
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full"
                            style={{ color: `var(${stateColorVar})`, backgroundColor: stateBg }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${stateDot}`} />
                            {stateText}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Preset scenario</span>
                          <span className="text-[var(--sr-accent)] font-medium text-[11px]">
                            {activeScenarioInfo?.display_name || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Elapsed / limit</span>
                          <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{localElapsed}s / {simStatus.duration_seconds || '∞'}s</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Ingress packets</span>
                          <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{simStatus.packets_sent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Threat alerts</span>
                          <span className={`font-medium ${simStatus.attacks_detected > 0 ? 'text-[var(--sr-sev-critical)]' : 'text-[var(--sr-text-muted)]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {simStatus.attacks_detected.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {simStatus.running && simStatus.duration_seconds && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-[var(--sr-text-muted)] mb-1">
                            <span>Simulation Progress</span>
                            <span>{Math.min(100, Math.round((localElapsed / simStatus.duration_seconds) * 100))}%</span>
                          </div>
                          <div className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] h-2 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--sr-accent)] rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, (localElapsed / simStatus.duration_seconds) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Live Intensity Waveform */}
                      <div className="my-4">
                        <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-1">
                          Detection intensity — last 20s
                        </span>
                        <div className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5 h-[35px] flex items-center relative overflow-hidden">
                          <svg className="w-full h-full text-[var(--sr-accent)]" viewBox="0 0 300 25" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="var(--sr-accent)" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path d={wavePaths.areaD} fill="url(#waveGrad)" stroke="none" />
                            <path d={wavePaths.lineD} fill="none" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-3">
                        Cascade Tier Resolution
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {[
                          { label: 'T-1 Screener', v: simStatus.tier_breakdown['1'] || 0, pct: t1Pct, c: '--sr-cat-1' },
                          { label: 'T-2 Validator', v: simStatus.tier_breakdown['2'] || 0, pct: t2Pct, c: '--sr-cat-2' },
                          { label: 'T-3 Arbiter', v: simStatus.tier_breakdown['3'] || 0, pct: t3Pct, c: '--sr-cat-3' },
                        ].map((tier) => (
                          <div key={tier.label} className="bg-[var(--sr-bg-surface-raised)] p-2.5 border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] flex flex-col justify-between">
                            <span className="text-[9px] text-[var(--sr-text-muted)] block leading-none mb-1.5">{tier.label}</span>
                            <p className="font-semibold text-xs leading-none" style={{ color: `var(${tier.c})`, fontVariantNumeric: 'tabular-nums' }}>{tier.v}</p>
                            <div className="w-full bg-[var(--sr-bg-surface)] h-1.5 rounded-full mt-2 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${tier.pct}%`, backgroundColor: `var(${tier.c})` }} />
                            </div>
                            <span className="text-[10px] text-[var(--sr-text-muted)] mt-1 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(tier.pct)}%</span>
                          </div>
                        ))}
                      </div>

                      <span className="text-[11px] text-[var(--sr-text-muted)] leading-relaxed block mt-2.5 text-center border-t border-[var(--sr-border-hairline)] pt-2.5">
                        T-2 and T-3 activate for ambiguous or rare attack patterns (Infiltration, Heartbleed). Run those scenarios to observe multi-tier escalation.
                      </span>
                    </div>
                  </GlowPanel>

                </div>
              </div>
            );
          })()}

          {/* ==========================================
              VIEW C: ALERT DATABASE HISTORY LOGS
              ========================================== */}
          {activeTab === 'history' && (
            <div className="flex flex-col gap-6 max-w-6xl mx-auto h-full">
              {/* Toolbar Filters */}
              <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] p-4 flex flex-col lg:flex-row items-center justify-between gap-4 shrink-0">
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full sm:w-44">
                    <Search className="w-4 h-4 text-[var(--sr-text-muted)] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter attack label..."
                      value={filterAttack}
                      onChange={(e) => { setFilterAttack(e.target.value); setHistoryPage(1); }}
                      className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] py-2 pl-9 pr-4 text-xs text-[var(--sr-text-primary)] placeholder-[var(--sr-text-muted)] outline-none transition-all"
                    />
                  </div>

                  <div className="relative w-full sm:w-36">
                    <Filter className="w-4 h-4 text-[var(--sr-text-muted)] absolute left-3 top-2.5" />
                    <select
                      value={filterTier}
                      onChange={(e) => { setFilterTier(e.target.value); setHistoryPage(1); }}
                      className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] py-2 pl-9 pr-4 text-xs text-[var(--sr-text-secondary)] outline-none cursor-pointer transition-all"
                    >
                      <option value="">All Tiers</option>
                      <option value="1">Tier 1 (LGBM)</option>
                      <option value="2">Tier 2 (RF)</option>
                      <option value="3">Tier 3 (Vote)</option>
                    </select>
                  </div>

                  <div className="relative w-full sm:w-36">
                    <Filter className="w-4 h-4 text-[var(--sr-text-muted)] absolute left-3 top-2.5" />
                    <select
                      value={filterSeverity}
                      onChange={(e) => { setFilterSeverity(e.target.value); setHistoryPage(1); }}
                      className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] py-2 pl-9 pr-4 text-xs text-[var(--sr-text-secondary)] outline-none cursor-pointer transition-all"
                    >
                      <option value="">All Severities</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                      <option value="Info">Info</option>
                    </select>
                  </div>

                  <div className="relative w-full sm:w-36 flex items-center bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus-within:border-[var(--sr-accent)] focus-within:ring-2 focus-within:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] px-3 py-1.5 gap-2 text-xs transition-all">
                    <span className="text-[var(--sr-text-muted)] text-[10px]">From</span>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => { setFilterDateFrom(e.target.value); setHistoryPage(1); }}
                      className="bg-transparent text-[var(--sr-text-secondary)] outline-none w-full text-xs cursor-pointer filter-date-picker"
                    />
                  </div>

                  <div className="relative w-full sm:w-36 flex items-center bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus-within:border-[var(--sr-accent)] focus-within:ring-2 focus-within:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] px-3 py-1.5 gap-2 text-xs transition-all">
                    <span className="text-[var(--sr-text-muted)] text-[10px]">To</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => { setFilterDateTo(e.target.value); setHistoryPage(1); }}
                      className="bg-transparent text-[var(--sr-text-secondary)] outline-none w-full text-xs cursor-pointer filter-date-picker"
                    />
                  </div>

                  <div className="flex gap-2">
                    <GlowButton
                      onClick={() => setShowExportModal(true)}
                      variant="primary"
                      className="py-1.5 px-3.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Telemetry Report
                    </GlowButton>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <GlowButton
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    variant="secondary"
                    className="p-2 min-w-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </GlowButton>
                  <span className="text-xs text-[var(--sr-text-secondary)] px-2" style={{ fontVariantNumeric: 'tabular-nums' }}>Page {historyPage}</span>
                  <GlowButton
                    disabled={alerts.length < 12}
                    onClick={() => setHistoryPage((p) => p + 1)}
                    variant="secondary"
                    className="p-2 min-w-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </GlowButton>
                </div>
              </div>

              {/* Severity distribution mini-bar for the current filtered page */}
              {alerts.length > 0 && (() => {
                const sevOrder = ['Critical', 'High', 'Medium', 'Low', 'Info'];
                const sevVarMap: Record<string, string> = {
                  Critical: '--sr-sev-critical', High: '--sr-sev-high', Medium: '--sr-sev-medium', Low: '--sr-sev-low', Info: '--sr-sev-info'
                };
                const counts: Record<string, number> = {};
                alerts.forEach((a) => {
                  const s = a.severity || (a.predicted_label === 'BENIGN' ? 'Info' : 'High');
                  counts[s] = (counts[s] || 0) + 1;
                });
                return (
                  <div className="flex items-center gap-3 px-1 shrink-0">
                    <span className="text-[11px] text-[var(--sr-text-muted)] shrink-0">This page</span>
                    <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-[var(--sr-bg-surface-raised)]">
                      {sevOrder.filter((s) => counts[s]).map((s) => (
                        <div key={s} style={{ width: `${(counts[s] / alerts.length) * 100}%`, backgroundColor: `var(${sevVarMap[s]})` }} />
                      ))}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {sevOrder.filter((s) => counts[s]).map((s) => (
                        <span key={s} className="text-[11px] text-[var(--sr-text-secondary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: `var(${sevVarMap[s]})` }} />
                          {counts[s]} {s}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Data Table */}
              <GlowPanel className="flex-1 overflow-hidden flex flex-col p-5">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead className="bg-[var(--sr-bg-surface)] sticky top-0 font-medium border-b border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] text-[11px] z-10">
                      <tr>
                        <th className="p-4 font-medium">ID</th>
                        <th className="p-4 font-medium">Timestamp (UTC)</th>
                        <th className="p-4 font-medium">Label</th>
                        <th className="p-4 font-medium">Severity</th>
                        <th className="p-4 font-medium">Confidence</th>
                        <th className="p-4 font-medium">Escalation Tier</th>
                        <th className="p-4 font-medium">Source Scenario</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sr-border-hairline)]">
                      {loadingHistory ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-[var(--sr-text-muted)] text-xs">
                            Loading alert records...
                          </td>
                        </tr>
                      ) : alerts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-[var(--sr-text-muted)] text-xs">
                            No persistent alerts found matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        alerts.map((alert, idx) => {
                          const isExpanded = expandedAlertId === alert.id;
                          const sevRailVar: Record<string, string> = {
                            Critical: '--sr-sev-critical', High: '--sr-sev-high', Medium: '--sr-sev-medium', Low: '--sr-sev-low', Info: '--sr-sev-info'
                          };
                          const railColor = sevRailVar[alert.severity || (alert.predicted_label === 'BENIGN' ? 'Info' : 'High')] || '--sr-border-hairline';
                          return (
                            <React.Fragment key={alert.id}>
                              <tr
                                onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                                className={`hover:bg-[var(--sr-bg-surface-raised)] transition-colors cursor-pointer ${
                                  isExpanded ? 'bg-[var(--sr-bg-surface-raised)]' : idx % 2 === 1 ? 'bg-[var(--sr-bg-page)]/60' : ''
                                }`}
                              >
                                <td className="p-4 pl-3 font-semibold text-[var(--sr-text-secondary)]" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--sr-font-display)', borderLeft: `3px solid var(${railColor})` }}>
                                  <span className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded px-1.5 py-0.5">#{String(alert.id).padStart(5, '0')}</span>
                                </td>
                                <td className="p-4 text-[var(--sr-text-muted)] text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {new Date(alert.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                                </td>
                                <td className="p-4 font-medium text-[var(--sr-text-primary)]">
                                  {alert.predicted_label}
                                </td>
                                <td className="p-4">
                                  <StatusBadge status={alert.severity || (alert.predicted_label === 'BENIGN' ? 'Info' : 'High')} />
                                </td>
                                <td className="p-4 font-medium text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{(alert.confidence).toFixed(4)}</td>
                                <td className="p-4 text-[var(--sr-text-secondary)]">
                                  Tier {alert.tier}
                                </td>
                                <td className="p-4 text-[var(--sr-text-secondary)] text-xs">{alert.source_scenario}</td>
                                <td className="p-4 text-right">
                                  <button
                                    type="button"
                                    className="text-[var(--sr-accent)] hover:text-[var(--sr-accent-hover)] font-medium text-xs cursor-pointer"
                                  >
                                    {isExpanded ? 'Hide' : 'Inspect'}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-[var(--sr-bg-surface-raised)]">
                                  <td colSpan={8} className="p-5">
                                    <div className="animate-fade-in space-y-3">
                                      <div className="flex justify-between items-center border-b border-[var(--sr-border-hairline)] pb-2">
                                        <span className="text-[11px] font-medium text-[var(--sr-text-primary)]">Raw Flow Feature Snapshot</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedDetection({
                                              predicted_label: alert.predicted_label,
                                              confidence: alert.confidence,
                                              tier: alert.tier,
                                              tier_name: `Tier ${alert.tier} Classifier`,
                                              top_features: Object.entries(alert.raw_features || {}).slice(0, 5).map(([k, v]) => ({
                                                feature: k,
                                                value: Number(v),
                                                importance: 0.05,
                                                impact: 0.1,
                                                benign_avg: benignBaselines[k] ?? 0
                                              })),
                                              raw_features: alert.raw_features,
                                              benign_averages: benignBaselines
                                            });
                                          }}
                                          className="text-xs font-medium text-[var(--sr-accent)] hover:text-[var(--sr-accent-hover)] transition-colors cursor-pointer"
                                        >
                                          Explain verdict
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--sr-bg-surface)] p-4 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] text-xs max-h-[220px] overflow-y-auto">
                                        {Object.entries(alert.raw_features || {}).map(([key, val]) => (
                                          <div key={key} className="flex justify-between items-center border-b border-[var(--sr-border-hairline)] pb-1.5 px-1 truncate">
                                            <span className="text-[var(--sr-text-muted)] mr-2 shrink-0">{key}:</span>
                                            <span className="text-[var(--sr-text-primary)] font-medium truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>{String(val)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </GlowPanel>
            </div>
          )}

          {/* ==========================================
              VIEW D: MODEL INSIGHTS COMPARISONS
              ========================================== */}
          {activeTab === 'insights' && (
            <div className="flex flex-col gap-6 max-w-6xl mx-auto h-full overflow-y-auto pb-8 pr-1">
              
              {/* Lifespan Alert or Loading State */}
              {loadingMetrics && (
                <GlowPanel className="p-8 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <span className="absolute w-8 h-8 rounded-full bg-[var(--sr-accent)] opacity-20 animate-ping"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--sr-accent)]"></span>
                    </div>
                    <p className="text-xs text-[var(--sr-text-secondary)]">Retrieving trained evaluation benchmarks...</p>
                  </div>
                </GlowPanel>
              )}

              {!loadingMetrics && !metricsData && (
                <GlowPanel className="p-8 flex items-center justify-center">
                  <div className="text-center text-[var(--sr-text-secondary)] text-xs">
                    Failed to load evaluation metrics. Ensure models are trained and server is running.
                  </div>
                </GlowPanel>
              )}

              {!loadingMetrics && metricsData && (
                <>
                  {/* Model Report Card — instant plain-English summary before the numeric detail */}
                  {(() => {
                    const data = getComparisonData();
                    if (data.length === 0) return null;
                    const mostAccurate = [...data].sort((a, b) => b.accuracy - a.accuracy)[0];
                    const fastest = [...data].sort((a, b) => a.avg_latency - b.avg_latency)[0];
                    const arbiter = data.find((d) => d.name !== mostAccurate.name && d.name !== fastest.name) || data[data.length - 1];
                    const cards = [
                      { model: mostAccurate, verdict: 'Most accurate', detail: `${mostAccurate.accuracy.toFixed(2)}% accuracy`, cat: '--sr-cat-1' },
                      { model: fastest, verdict: 'Fastest', detail: `${(fastest.avg_latency * 1000).toFixed(2)} μs / sample`, cat: '--sr-cat-2' },
                      { model: arbiter, verdict: 'Tie-breaker', detail: 'Weighted ensemble vote', cat: '--sr-cat-3' },
                    ];
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
                        {cards.map((c, i) => (
                          <GlowPanel
                            key={c.model.name}
                            className="relative pt-5 p-5 overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.015]"
                            style={{
                              borderTop: `3px solid var(${c.cat})`,
                              boxShadow: `0 16px 40px -18px color-mix(in srgb, var(${c.cat}) 45%, transparent)`,
                            }}
                          >
                            <span
                              className="absolute top-3 right-3 text-[28px] font-bold leading-none select-none"
                              style={{ color: `var(${c.cat})`, opacity: 0.12, fontFamily: 'var(--sr-font-display)' }}
                            >
                              T{i + 1}
                            </span>
                            <div className="flex items-center gap-3">
                              <span
                                className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 text-xs font-bold"
                                style={{ backgroundColor: `color-mix(in srgb, var(${c.cat}) 14%, transparent)`, color: `var(${c.cat})`, fontFamily: 'var(--sr-font-display)' }}
                              >
                                {c.model.name.slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--sr-text-primary)] truncate">{c.model.name}</p>
                                <p className="text-[11px] text-[var(--sr-text-muted)]">Tier {i + 1} of the cascade</p>
                              </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-[var(--sr-border-hairline)]">
                              <p className="text-lg font-semibold" style={{ color: `var(${c.cat})`, fontFamily: 'var(--sr-font-display)' }}>{c.verdict}</p>
                              <p className="text-[11px] text-[var(--sr-text-muted)] mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.detail}</p>
                            </div>
                          </GlowPanel>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Top Row: Diagram + Rationale Explanation */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    <GlowPanel className="lg:col-span-3 p-5">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5">
                        <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">AI Cascade Decision Logic</h3>
                      </div>
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-[var(--sr-text-secondary)]">
                        <div className="p-4 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold text-[var(--sr-text-primary)] mb-1">Incoming Flow Packet</p>
                          <span>Extracts top-30 selected features</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--sr-text-muted)] hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-1" style={{ color: 'var(--sr-cat-1)' }}>Tier 1: LightGBM</p>
                          <span>Is max confidence &ge; 0.85?</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--sr-text-muted)] hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-1" style={{ color: 'var(--sr-cat-2)' }}>Tier 2: Random Forest</p>
                          <span>Is max confidence &ge; 0.85?</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--sr-text-muted)] hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-1" style={{ color: 'var(--sr-cat-3)' }}>Tier 3: Expert Ensemble</p>
                          <span>Weighted probability argmax vote</span>
                        </div>
                      </div>
                    </GlowPanel>

                    <GlowPanel className="lg:col-span-2 p-5 flex flex-col justify-between">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-3">
                        <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Why a Cascade?</h3>
                      </div>
                      <div className="flex-1 flex flex-col justify-center">
                        <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">
                          To handle volumetric traffic, our pipeline cascades decisions through three models. This maximizes accuracy and speed while minimizing resource costs.
                        </p>
                        <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)] mt-2">
                          <strong className="text-[var(--sr-text-primary)]">Tier 1 (LightGBM)</strong> screens all incoming traffic. If confidence is high (<strong className="text-[var(--sr-text-primary)]">&ge; 85%</strong>), the decision is finalized instantly.
                          If uncertain, the packet escalates to <strong className="text-[var(--sr-text-primary)]">Tier 2 (Random Forest)</strong>. If uncertainty persists, the <strong className="text-[var(--sr-text-primary)]">Tier 3 Ensemble (XGBoost + T1 + T2)</strong> makes the final verdict using a weighted vote.
                        </p>
                      </div>
                    </GlowPanel>
                  </div>

                  {/* Benchmarks Metrics Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    {/* 3-Model Comparison Table */}
                    <GlowPanel className="lg:col-span-3 flex flex-col p-5">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5 flex justify-between items-center">
                        <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Trained Model Performance Comparison</h3>
                        <span className="text-[10px] text-[var(--sr-text-muted)]">Stratified test split validation</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] text-[11px]">
                              <th className="py-2.5 px-3 font-medium">Classifier Model</th>
                              <th className="py-2.5 px-3 font-medium text-right">Accuracy</th>
                              <th className="py-2.5 px-3 font-medium text-right">Macro Precision</th>
                              <th className="py-2.5 px-3 font-medium text-right">Macro F1</th>
                              <th className="py-2.5 px-3 font-medium text-right">Avg Latency</th>
                              <th className="py-2.5 px-3 font-medium text-right">Train Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--sr-border-hairline)]">
                            {getComparisonData().map((row, idx) => (
                              <tr key={row.name} className="hover:bg-[var(--sr-bg-surface-raised)]">
                                <td className="py-3 px-3 font-semibold text-[var(--sr-text-primary)]">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: `var(--sr-cat-${idx + 1})` }} />
                                  {row.name}
                                </td>
                                <td className="py-3 px-3 text-right text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.accuracy.toFixed(3)}%</td>
                                <td className="py-3 px-3 text-right text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.macro_precision.toFixed(3)}%</td>
                                <td className="py-3 px-3 text-right text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.macro_f1.toFixed(3)}%</td>
                                <td className="py-3 px-3 text-right text-[var(--sr-text-secondary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{(row.avg_latency * 1000).toFixed(2)} μs</td>
                                <td className="py-3 px-3 text-right text-[var(--sr-text-secondary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{row.training_time.toFixed(1)}s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-[var(--sr-text-muted)] mt-4 leading-normal">
                        * Latency counts capture mean inference cycles per sample on hardware. Performance benchmarks are updated dynamically when models are retrained.
                      </p>
                    </GlowPanel>

                    {/* Order Explanation Panel */}
                    <GlowPanel className="lg:col-span-2 flex flex-col justify-between p-5">
                      <div>
                        <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-4">
                          <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Cascade Order Rationale</h3>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <span className="text-[11px] font-semibold block" style={{ color: 'var(--sr-cat-1)' }}>1. Tier 1: LightGBM (Screener)</span>
                            <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)] mt-1">
                              Selected for highest overall accuracy (99.472%). Handles the clear majority of classification decisions with strong confidence, escalating only uncertain cases to Tier 2 to preserve system reliability.
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold block" style={{ color: 'var(--sr-cat-2)' }}>2. Tier 2: Random Forest (Validator)</span>
                            <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)] mt-1">
                              Queried only on LightGBM uncertainty. Fastest model at inference (2.88 μs) and highly explainable — drives the local XAI feature attributions shown in the Explain This Packet panel.
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-semibold block" style={{ color: 'var(--sr-cat-3)' }}>3. Tier 3: XGBoost (Vote Arbiter)</span>
                            <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)] mt-1">
                              Handles low-confidence edge cases that neither Tier 1 nor Tier 2 resolved with sufficient certainty. Executes a weighted ensemble vote (LGBM 0.2 / RF 0.3 / XGB 0.5) across all three models to minimize false alarm ratios on ambiguous traffic.
                            </p>
                          </div>
                        </div>
                      </div>
                    </GlowPanel>
                  </div>

                  {/* Confusion Matrices Heatmap & Feature Importances */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    
                    {/* Heatmap Card */}
                    <GlowPanel className="lg:col-span-3 flex flex-col p-5">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Confusion Matrix Heatmap</h3>
                          <span className="text-[10px] text-[var(--sr-text-muted)]">Actual vs predicted class flows</span>
                        </div>

                        {/* Selector Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Recall % vs Count Mode Toggle */}
                          <div className="flex items-center gap-1 bg-[var(--sr-bg-surface-raised)] p-1 rounded-full border border-[var(--sr-border-hairline)]">
                            <button
                              type="button"
                              onClick={() => setCmViewMode('percentage')}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                                cmViewMode === 'percentage'
                                  ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                  : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                              }`}
                            >
                              Recall %
                            </button>
                            <button
                              type="button"
                              onClick={() => setCmViewMode('count')}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                                cmViewMode === 'count'
                                  ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                  : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                              }`}
                            >
                              Counts
                            </button>
                          </div>

                          {/* Model selector */}
                          <div className="flex gap-1 bg-[var(--sr-bg-surface-raised)] p-1 rounded-full border border-[var(--sr-border-hairline)]">
                            {(['lightgbm', 'random_forest', 'xgboost'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => { setSelectedCMModel(m); setHoveredCMCell(null); }}
                                className={`px-3 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                                  selectedCMModel === m
                                    ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                    : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                                }`}
                              >
                                {m === 'lightgbm' ? 'LGBM' : m === 'random_forest' ? 'RF' : 'XGB'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {renderConfusionMatrix(selectedCMModel)}
                    </GlowPanel>

                    {/* RF Feature Importances Bar Chart */}
                    <GlowPanel className="lg:col-span-2 flex flex-col justify-between p-5">
                      <div>
                        <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5 flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">RF Feature Importances</h3>
                            <span className="text-[10px] text-[var(--sr-text-muted)]">Top random forest global weights</span>
                          </div>

                          {/* Toggle features count */}
                          <div className="flex gap-1 bg-[var(--sr-bg-surface-raised)] p-1 rounded-full">
                            {[10, 20].map((num) => (
                              <button
                                key={num}
                                onClick={() => setNumFeaturesToShow(num)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                                  numFeaturesToShow === num
                                    ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                    : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                                }`}
                              >
                                Top {num}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Chart Render container — grows with the feature count so Top 10 vs
                            Top 20 stay visibly distinct instead of cramming into a fixed height */}
                        <div className="relative w-full min-w-0 mt-2 shrink-0" style={{ height: numFeaturesToShow === 10 ? 320 : 580 }}>
                          <div className="absolute inset-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                              <BarChart
                                data={(metricsData?.feature_importances || []).slice(0, numFeaturesToShow)}
                                layout="vertical"
                                margin={{ top: 5, right: 12, left: 0, bottom: 24 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--sr-border-hairline)" />
                                <XAxis
                                  type="number"
                                  stroke="var(--sr-text-muted)"
                                  fontSize={10}
                                  label={{ value: 'Global importance weight (Gini)', position: 'insideBottom', offset: -14, fontSize: 10, fill: 'var(--sr-text-muted)' }}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="feature"
                                  stroke="var(--sr-text-muted)"
                                  fontSize={9}
                                  width={150}
                                  tick={makeTruncatedYAxisTick(22)}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'var(--sr-bg-surface)',
                                    border: '1px solid var(--sr-border-hairline)',
                                    borderRadius: 8,
                                    fontSize: 11,
                                    color: 'var(--sr-text-primary)'
                                  }}
                                />
                                <Bar
                                  dataKey="importance"
                                  name="Global weight"
                                  fill="var(--sr-accent)"
                                  radius={[0, 4, 4, 0]}
                                  barSize={numFeaturesToShow === 10 ? 14 : 10}
                                  isAnimationActive={false}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </GlowPanel>
                  </div>

                    {/* SMOTE Class Balancing Analysis */}
                    {smoteData && (() => {
                      const before = smoteData.before_smote || {};
                      const after = smoteData.after_smote || {};
                      const classes = Object.keys(before);
                      const totalBefore = Object.values(before).reduce((a: any, b: any) => a + b, 0) as number;
                      const totalAfter = Object.values(after).reduce((a: any, b: any) => a + b, 0) as number;
                      const oversampledCount = classes.filter(c => (after[c] || 0) > (before[c] || 0)).length;

                      return (
                        <div className="lg:col-span-5 flex flex-col gap-4 shrink-0 mt-4">
                          
                          {/* SMOTE Analytics KPI Banner */}
                          <GlowPanel className="p-5 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[var(--sr-border-hairline)] pb-3">
                              <div>
                                <h3 className="text-xs font-semibold text-[var(--sr-text-primary)] flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-[var(--sr-accent)]" />
                                  SMOTE Oversampling Data Pipeline
                                </h3>
                                <p className="text-[11px] text-[var(--sr-text-muted)] mt-0.5">
                                  Balanced synthetic oversampling applied to training set split (20,000 ceiling cap)
                                </p>
                              </div>
                              <div className="flex items-center gap-1 bg-[var(--sr-bg-surface-raised)] p-1 rounded-full shrink-0 border border-[var(--sr-border-hairline)]">
                                <button
                                  type="button"
                                  onClick={() => setSmoteViewMode('chart')}
                                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                                    smoteViewMode === 'chart'
                                      ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                      : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                                  }`}
                                >
                                  Bar Charts
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSmoteViewMode('table')}
                                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                                    smoteViewMode === 'table'
                                      ? 'bg-[var(--sr-bg-surface)] text-[var(--sr-accent)] shadow-[var(--sr-shadow-sm)]'
                                      : 'text-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                                  }`}
                                >
                                  Comparative Table
                                </button>
                              </div>
                            </div>

                            {/* KPI Metrics Strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div className="bg-[var(--sr-bg-surface-raised)] p-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)]">
                                <span className="text-[10px] text-[var(--sr-text-muted)] block">Oversampling Cap</span>
                                <span className="text-sm font-semibold text-[var(--sr-accent)]" style={{ fontVariantNumeric: 'tabular-nums' }}>20,000 / class</span>
                              </div>
                              <div className="bg-[var(--sr-bg-surface-raised)] p-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)]">
                                <span className="text-[10px] text-[var(--sr-text-muted)] block">Balanced Classes</span>
                                <span className="text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{oversampledCount} of {classes.length}</span>
                              </div>
                              <div className="bg-[var(--sr-bg-surface-raised)] p-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)]">
                                <span className="text-[10px] text-[var(--sr-text-muted)] block">Max Upsample Multiplier</span>
                                <span className="text-sm font-semibold text-[var(--sr-sev-critical)]" style={{ fontVariantNumeric: 'tabular-nums' }}>2,222x (Heartbleed)</span>
                              </div>
                              <div className="bg-[var(--sr-bg-surface-raised)] p-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)]">
                                <span className="text-[10px] text-[var(--sr-text-muted)] block">Training Set Size</span>
                                <span className="text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalBefore.toLocaleString()} &rarr; {totalAfter.toLocaleString()}</span>
                              </div>
                            </div>
                          </GlowPanel>

                          {/* Render Table or Charts */}
                          {smoteViewMode === 'table' ? (
                            <GlowPanel className="p-5 overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="border-b border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)] text-[10px] uppercase font-medium">
                                    <tr>
                                      <th className="py-2.5 px-3">Class Category</th>
                                      <th className="py-2.5 px-3 text-right">Raw Count (Before SMOTE)</th>
                                      <th className="py-2.5 px-3 text-right">Balanced Count (After SMOTE)</th>
                                      <th className="py-2.5 px-3 text-right">Synthetic Added (+Delta)</th>
                                      <th className="py-2.5 px-3 text-right">Upsampling Ratio</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]">
                                    {classes.map((cls) => {
                                      const bCount = before[cls] || 0;
                                      const aCount = after[cls] || 0;
                                      const delta = aCount - bCount;
                                      const ratio = bCount > 0 ? (aCount / bCount).toFixed(1) + 'x' : '—';
                                      const isOversampled = delta > 0;

                                      return (
                                        <tr key={cls} className="hover:bg-[var(--sr-bg-surface-raised)] transition-colors">
                                          <td className="py-2.5 px-3 font-medium text-[var(--sr-text-primary)]">{cls}</td>
                                          <td className="py-2.5 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{bCount.toLocaleString()}</td>
                                          <td className="py-2.5 px-3 text-right font-medium text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{aCount.toLocaleString()}</td>
                                          <td className={`py-2.5 px-3 text-right font-medium ${isOversampled ? 'text-[var(--sr-accent)]' : 'text-[var(--sr-text-muted)]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {isOversampled ? `+${delta.toLocaleString()}` : '0'}
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            {isOversampled ? (
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--sr-accent-soft)] text-[var(--sr-accent)]">
                                                {ratio}
                                              </span>
                                            ) : (
                                              <span className="text-[var(--sr-text-muted)] font-normal">1.0x (Natural)</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </GlowPanel>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <GlowPanel className="p-5 flex flex-col justify-between">
                                <div>
                                  <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5">
                                    <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Class Distribution Before SMOTE</h3>
                                    <span className="text-[10px] text-[var(--sr-text-muted)]">Severe class imbalance — raw training set proportions</span>
                                  </div>
                                  <div className="relative w-full min-w-0 min-h-[360px] h-[360px] mt-2 shrink-0">
                                    <div className="absolute inset-0">
                                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <BarChart
                                          data={getSmoteChartData()}
                                          layout="vertical"
                                          margin={{ top: 5, right: 20, left: 10, bottom: 24 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="var(--sr-border-hairline)" />
                                          <XAxis
                                            type="number"
                                            stroke="var(--sr-text-muted)"
                                            fontSize={10}
                                            label={{ value: 'Training sample count', position: 'insideBottom', offset: -14, fontSize: 10, fill: 'var(--sr-text-muted)' }}
                                          />
                                          <YAxis
                                            type="category"
                                            dataKey="class"
                                            stroke="var(--sr-text-muted)"
                                            fontSize={9}
                                            width={150}
                                            tick={makeTruncatedYAxisTick(22)}
                                          />
                                          <Tooltip
                                            contentStyle={{
                                              backgroundColor: 'var(--sr-bg-surface)',
                                              border: '1px solid var(--sr-border-hairline)',
                                              borderRadius: 8,
                                              fontSize: 11,
                                              color: 'var(--sr-text-primary)'
                                            }}
                                            formatter={(value?: TooltipValueType) => [Number(value ?? 0).toLocaleString(), "Samples"]}
                                          />
                                          <Bar dataKey="Before SMOTE" fill="var(--sr-sev-critical)" radius={[0, 4, 4, 0]} barSize={8} minPointSize={3} isAnimationActive={false} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                              </GlowPanel>

                              {/* After SMOTE */}
                              <GlowPanel className="p-5 flex flex-col justify-between">
                                <div>
                                  <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-5">
                                    <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Class Distribution After SMOTE</h3>
                                    <span className="text-[10px] text-[var(--sr-text-muted)]">Oversampled synthetic balance — SMOTE-synthesized training set</span>
                                  </div>
                                  <div className="relative w-full min-w-0 min-h-[360px] h-[360px] mt-2 shrink-0">
                                    <div className="absolute inset-0">
                                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                        <BarChart
                                          data={getSmoteChartData()}
                                          layout="vertical"
                                          margin={{ top: 5, right: 20, left: 10, bottom: 24 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="var(--sr-border-hairline)" />
                                          <XAxis
                                            type="number"
                                            stroke="var(--sr-text-muted)"
                                            fontSize={10}
                                            label={{ value: 'Training sample count', position: 'insideBottom', offset: -14, fontSize: 10, fill: 'var(--sr-text-muted)' }}
                                          />
                                          <YAxis
                                            type="category"
                                            dataKey="class"
                                            stroke="var(--sr-text-muted)"
                                            fontSize={9}
                                            width={150}
                                            tick={makeTruncatedYAxisTick(22)}
                                          />
                                          <Tooltip
                                            contentStyle={{
                                              backgroundColor: 'var(--sr-bg-surface)',
                                              border: '1px solid var(--sr-border-hairline)',
                                              borderRadius: 8,
                                              fontSize: 11,
                                              color: 'var(--sr-text-primary)'
                                            }}
                                            formatter={(value?: TooltipValueType) => [Number(value ?? 0).toLocaleString(), "Samples"]}
                                          />
                                          <Bar dataKey="After SMOTE" fill="var(--sr-accent)" radius={[0, 4, 4, 0]} barSize={8} minPointSize={3} isAnimationActive={false} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                              </GlowPanel>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    </>
                  )}
                </div>
              )}

          {/* ==========================================
              VIEW E: AI SECURITY CHAT ASSISTANT
              ========================================== */}
          {activeTab === 'ai' && (
            <div className="flex gap-5 h-[calc(100vh-190px)] relative w-full">
              <style dangerouslySetInnerHTML={{ __html: `
                .chat-history-container {
                  scrollbar-width: thin;
                  scrollbar-color: var(--sr-border-hover) transparent;
                }
                .chat-history-container::-webkit-scrollbar { width: 4px; }
                .chat-history-container::-webkit-scrollbar-track { background: transparent; }
                .chat-history-container::-webkit-scrollbar-thumb { background: var(--sr-border-hover); border-radius: 2px; }
                .convo-rail-container {
                  scrollbar-width: thin;
                  scrollbar-color: var(--sr-border-hover) transparent;
                }
                .convo-rail-container::-webkit-scrollbar { width: 4px; }
                .convo-rail-container::-webkit-scrollbar-thumb { background: var(--sr-border-hover); border-radius: 2px; }
                @keyframes typing-bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-6px); }
                }
                .typing-dot {
                  width: 6px; height: 6px; border-radius: 50%;
                  background-color: var(--sr-accent);
                  display: inline-block;
                  animation: typing-bounce 1.2s infinite ease-in-out;
                }
                .typing-dot:nth-child(1) { animation-delay: 0s; }
                .typing-dot:nth-child(2) { animation-delay: 0.15s; }
                .typing-dot:nth-child(3) { animation-delay: 0.3s; }
                .sentinel-gradient-text {
                  background-image: var(--sr-gradient-brand);
                  -webkit-background-clip: text;
                  background-clip: text;
                  color: transparent;
                }
              `}} />

              {/* ============== CONVERSATION HISTORY RAIL ============== */}
              <div className="w-64 shrink-0 flex flex-col gap-3">
                <GlowButton
                  type="button"
                  variant="primary"
                  onClick={startNewConversation}
                  className="w-full py-2.5 text-xs justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New conversation
                </GlowButton>

                <GlowPanel className="flex-1 overflow-hidden p-2 flex flex-col">
                  <div className="convo-rail-container flex-1 overflow-y-auto flex flex-col gap-3">
                    {loadingConversations ? (
                      <div className="p-4 text-center text-[11px] text-[var(--sr-text-muted)]">Loading history…</div>
                    ) : conversations.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-[var(--sr-text-muted)] leading-relaxed">
                        No saved conversations yet. Chats you send outside Incognito mode will appear here.
                      </div>
                    ) : (() => {
                      const pinned = conversations.filter((c) => c.pinned);
                      const unpinned = conversations.filter((c) => !c.pinned);
                      const dateGroups = groupConversationsByDate(unpinned);

                      const renderItem = (c: ConversationSummary) => {
                        const isActive = c.id === activeConversationId;
                        const isConfirmingDelete = confirmDeleteId === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => loadConversation(c.id)}
                            className={`group relative rounded-[var(--sr-radius-sm)] px-3 py-2.5 cursor-pointer transition-colors ${
                              isConfirmingDelete
                                ? 'bg-[rgba(208,59,59,0.06)]'
                                : isActive
                                ? 'bg-[var(--sr-accent-soft)]'
                                : 'hover:bg-[var(--sr-bg-surface-raised)]'
                            }`}
                          >
                            {renamingId === c.id ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(c.id); if (e.key === 'Escape') setRenamingId(null); }}
                                  className="flex-1 min-w-0 text-xs bg-[var(--sr-bg-page)] border border-[var(--sr-accent)] rounded px-2 py-1 outline-none text-[var(--sr-text-primary)]"
                                />
                                <button type="button" onClick={() => commitRename(c.id)} className="shrink-0 text-[var(--sr-accent)] cursor-pointer">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : isConfirmingDelete ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-[var(--sr-sev-critical)]">Delete this chat?</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => confirmDeleteConversation(c.id, e)}
                                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--sr-sev-critical)] text-white cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelDeleteConversation}
                                    className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`flex items-center gap-1.5 text-xs font-medium truncate ${isActive ? 'text-[var(--sr-accent)]' : 'text-[var(--sr-text-primary)]'}`}>
                                    {c.pinned && <Pin className="w-2.5 h-2.5 shrink-0 fill-current" style={{ color: 'var(--sr-accent-2)' }} />}
                                    <span className="truncate">{c.title}</span>
                                  </p>
                                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => togglePinConversation(c, e)}
                                      title={c.pinned ? 'Unpin' : 'Pin to top'}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-accent-2)] cursor-pointer"
                                    >
                                      {c.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameDraft(c.title); }}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-accent)] cursor-pointer"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => requestDeleteConversation(c.id, e)}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-sev-critical)] cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {c.preview && (
                                  <p className="text-[10px] text-[var(--sr-text-muted)] truncate mt-0.5">{c.preview}</p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      };

                      return (
                        <>
                          {pinned.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">Pinned</span>
                              {pinned.map(renderItem)}
                            </div>
                          )}
                          {dateGroups.map((group) => (
                            <div key={group.label} className="flex flex-col gap-1">
                              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">{group.label}</span>
                              {group.items.map(renderItem)}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </GlowPanel>
              </div>

              {/* ============== CHAT SURFACE ============== */}
              <div className="flex-1 relative min-w-0">
                <AuroraBackground className="absolute -inset-4" variant="hero" />
                <GlowPanel
                  className="h-full flex flex-col overflow-hidden p-0 relative transition-shadow duration-500"
                  style={{
                    boxShadow: incognito ? 'none' : 'var(--sr-shadow-glow)',
                    border: incognito ? '1px dashed var(--sr-text-muted)' : undefined,
                  }}
                >
                  {/* Incognito banner */}
                  {incognito && (
                    <div className="px-6 py-2 bg-[var(--sr-bg-surface-raised)] border-b border-dashed border-[var(--sr-text-muted)] flex items-center gap-2 shrink-0 z-10">
                      <Ghost className="w-3.5 h-3.5 text-[var(--sr-text-secondary)]" />
                      <span className="text-[11px] text-[var(--sr-text-secondary)]">
                        Incognito mode — this conversation will not be saved to your history.
                      </span>
                    </div>
                  )}

                  {/* Chat header */}
                  <div className="px-6 py-4 bg-[var(--sr-glass-bg)] backdrop-blur-md border-b border-[var(--sr-border-hairline)] flex items-center justify-between shrink-0 z-10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sr-accent-soft)]">
                        <Logomark className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="sentinel-gradient-text text-base font-bold leading-none mb-0.5" style={{ fontFamily: 'var(--sr-font-display)' }}>
                          SENTINEL AI
                        </h4>
                        <span className="text-[11px] text-[var(--sr-text-muted)] block leading-none">
                          Intelligent Security Analyst Assistant
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Incognito toggle -- gradient "on" state reuses the same brand
                          gradient used for hero text/CTAs elsewhere, instead of a flat
                          black block that clashes with the rest of the palette. */}
                      <button
                        type="button"
                        onClick={toggleIncognito}
                        title={incognito ? 'Exit incognito mode' : 'Start an incognito (unsaved) chat'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full select-none cursor-pointer transition-all duration-300 border ${
                          incognito
                            ? 'text-white border-transparent'
                            : 'bg-transparent text-[var(--sr-text-muted)] border-[var(--sr-border-hairline)] hover:border-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                        }`}
                        style={incognito ? {
                          backgroundImage: 'var(--sr-gradient-brand)',
                          boxShadow: '0 4px 14px -4px color-mix(in srgb, var(--sr-accent) 45%, transparent)',
                        } : undefined}
                      >
                        <Ghost className="w-3 h-3" />
                        Incognito {incognito ? 'on' : 'off'}
                      </button>

                      {/* Divider */}
                      <div className="h-4 w-[1px] bg-[var(--sr-border-hairline)]" />

                      {/* GEMINI Badge */}
                      {geminiAvailable ? (
                        <span
                          style={{ color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium rounded-full select-none"
                        >
                          <span className="text-[10px] leading-none">✦</span>
                          Gemini connected
                        </span>
                      ) : (
                        <span
                          style={{ color: 'var(--sr-text-muted)', backgroundColor: 'var(--sr-bg-surface-raised)' }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium rounded-full select-none"
                        >
                          <span className="text-[10px] leading-none">✦</span>
                          Rule-based mode
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Message Log */}
                  <div
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                    className="chat-history-container flex-1 overflow-y-auto p-6 relative overflow-hidden flex flex-col"
                  >
                    {loadingConversationDetail ? (
                      <div className="flex-1 flex items-center justify-center text-xs text-[var(--sr-text-muted)]">Loading conversation…</div>
                    ) : messages.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto relative z-10 animate-fade-in my-auto select-none">
                        <div className="w-14 h-14 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center mb-4">
                          <Logomark className="w-6 h-6" />
                        </div>

                        <h2 className="sentinel-gradient-text text-xl font-bold mb-1" style={{ fontFamily: 'var(--sr-font-display)' }}>
                          SENTINEL AI
                        </h2>
                        <p className="text-xs text-[var(--sr-text-secondary)] leading-relaxed mb-6">
                          Cybersecurity intelligence — always on scope
                        </p>

                        <div className="grid grid-cols-2 gap-3 w-full mb-6">
                          {[
                            "What is a DDoS attack?",
                            "How does the cascade work?",
                            "Explain the last alert",
                            "What is SMOTE?"
                          ].map((q) => (
                            <GlowButton
                              key={q}
                              type="button"
                              variant="secondary"
                              onClick={() => sendChatMessage(q)}
                              className="px-3.5 py-2.5 text-xs text-left transition-all leading-normal flex items-center justify-start"
                            >
                              {q}
                            </GlowButton>
                          ))}
                        </div>

                        <span className="text-[11px] text-[var(--sr-text-muted)] block">
                          Or type your own question below
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-4 relative z-10 flex flex-col pb-3 pt-3">
                        {messages.map((msg, i) => {
                          const isUser = msg.role === 'user';

                          // Spacing visual check
                          const nextMsg = messages[i + 1];
                          const isSameNext = nextMsg && nextMsg.role === msg.role;
                          const mbClass = isSameNext ? 'mb-1.5' : 'mb-4';

                          return (
                            <div
                              key={i}
                              className={`flex flex-col ${
                                isUser ? 'ml-auto items-end max-w-[72%] w-full' : 'mr-auto items-start max-w-[80%] w-full'
                              } ${mbClass}`}
                            >
                              {isUser ? (
                                <div
                                  style={{ borderRadius: '12px 4px 12px 12px', padding: '12px 14px' }}
                                  className="border border-[var(--sr-accent)]/20 bg-[var(--sr-accent-soft)] text-[var(--sr-text-primary)] text-xs leading-relaxed w-full animate-fade-in flex flex-col gap-1.5"
                                >
                                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium block text-left leading-none">
                                    You
                                  </span>
                                  <div>{msg.text}</div>
                                  <span className="text-[10px] text-[var(--sr-text-muted)] block text-right mt-0.5 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {msg.time}
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-7 h-7 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center shrink-0">
                                      <Logomark className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[11px] font-medium text-[var(--sr-text-secondary)]">
                                      SENTINEL AI
                                    </span>
                                  </div>

                                  <div
                                    style={{ padding: '14px 16px', borderRadius: '4px 12px 12px 12px' }}
                                    className={`relative bg-[var(--sr-glass-bg)] backdrop-blur-md border ${
                                      msg.isError ? 'border-[var(--sr-sev-critical)]/30' : 'border-[var(--sr-border-hairline)]'
                                    } text-[var(--sr-text-primary)] text-xs leading-relaxed w-full shadow-[var(--sr-shadow-sm)] animate-fade-in flex flex-col gap-2.5`}
                                  >
                                    <div className="whitespace-pre-wrap">{msg.text}</div>

                                    {(msg.source || msg.responseTime || msg.time) && (
                                      <div className="pt-2 border-t border-[var(--sr-border-hairline)] flex items-center justify-between gap-2 mt-1">
                                        <div className="flex items-center">
                                          {msg.source && (
                                            msg.source.toLowerCase().includes('gemini') ? (
                                              <span
                                                style={{ color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full select-none"
                                              >
                                                ✦ Gemini
                                              </span>
                                            ) : (
                                              <span
                                                style={{ color: 'var(--sr-cat-3)', backgroundColor: 'rgba(27, 175, 122, 0.10)' }}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full select-none"
                                              >
                                                ⚡ Rule-base
                                              </span>
                                            )
                                          )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                          {msg.responseTime && (
                                            <span className="text-[10px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {msg.responseTime}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {msg.time}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {aiTyping && (
                      <div className="flex flex-col max-w-[80%] mr-auto items-start relative z-10 animate-fade-in w-full mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-7 h-7 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center shrink-0">
                            <Logomark className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] font-medium text-[var(--sr-text-secondary)]">
                            SENTINEL AI
                          </span>
                        </div>

                        <div
                          style={{ padding: '14px 16px', borderRadius: '4px 12px 12px 12px' }}
                          className="relative bg-[var(--sr-glass-bg)] backdrop-blur-md border border-[var(--sr-border-hairline)] text-[var(--sr-text-primary)] text-xs leading-relaxed w-full shadow-[var(--sr-shadow-sm)] animate-fade-in flex flex-col gap-2.5"
                        >
                          <div className="flex items-center gap-1.5 h-4">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>

                          <div className="pt-2 border-t border-[var(--sr-border-hairline)] flex items-center justify-between mt-1">
                            <span className="text-[10px] font-medium text-[var(--sr-accent)] flex items-center gap-1">
                              ● Processing...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* Form Chat Input */}
                  <form
                    onSubmit={handleSendChat}
                    className="p-4 border-t border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md flex items-center gap-3 shrink-0 relative z-10"
                  >
                    <div className="flex-1 relative flex items-center">
                      <input
                        ref={chatInputRef}
                        type="text"
                        required
                        value={chatInput}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={incognito ? 'Ask SENTINEL AI (not saved)...' : 'Ask SENTINEL AI...'}
                        className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] px-4 py-3 text-xs text-[var(--sr-text-primary)] outline-none placeholder-[var(--sr-text-muted)] transition-all"
                      />
                    </div>

                    <span
                      className="text-[11px] text-[var(--sr-text-muted)] transition-opacity duration-200 shrink-0"
                      style={{ opacity: inputFocused ? 1 : 0 }}
                    >
                      Enter ↵ to send
                    </span>

                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className={`px-5 py-3 text-xs font-semibold min-w-[90px] flex items-center justify-center gap-1.5 shrink-0 rounded-[var(--sr-radius-sm)] transition-all duration-200 active:scale-95 border ${
                        chatInput.trim()
                          ? 'bg-[var(--sr-accent)] border-transparent cursor-pointer text-white hover:bg-[var(--sr-accent-hover)] shadow-[var(--sr-shadow-sm)]'
                          : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] cursor-not-allowed text-[var(--sr-text-muted)]'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                </GlowPanel>
              </div>
            </div>
          )}

        </section>
      </main>

      {/* ==========================================
          XAI EXPLAIN THE PACKET MODAL DIALOG
          ========================================== */}
      {selectedDetection && (() => {
        const RADAR_FEATURES = [
          { name: 'Init Fwd Win', key: 'Init_Win_bytes_forward', defaultMax: 65535 },
          { name: 'Init Bwd Win', key: 'Init_Win_bytes_backward', defaultMax: 65535 },
          { name: 'Max Bwd Pkt', key: 'Bwd Packet Length Max', defaultMax: 2000 },
          { name: 'Max Fwd Pkt', key: 'Fwd Packet Length Max', defaultMax: 2000 },
          { name: 'Avg Pkt Size', key: 'Average Packet Size', defaultMax: 1500 },
          { name: 'Pkt Var', key: 'Packet Length Variance', defaultMax: 500000 },
          { name: 'Total Fwd Len', key: 'Total Length of Fwd Packets', defaultMax: 10000 },
          { name: 'Bwd Pkts/s', key: 'Bwd Packets/s', defaultMax: 5000 }
        ];

        const radarData = RADAR_FEATURES.map(f => {
          const topFeat = selectedDetection.top_features?.find(tf => tf.feature === f.key);
          const rawVal = Number(selectedDetection.raw_features?.[f.key] ?? topFeat?.value ?? 0.0);
          const benignAvg = Number(selectedDetection.benign_averages?.[f.key] ?? topFeat?.benign_avg ?? 0.0);
          const dynamicMax = Math.max(f.defaultMax, rawVal * 1.1, benignAvg * 1.1, 1.0);

          const normAttack = Math.min(1.0, Math.max(0.08, rawVal / dynamicMax));
          const normBenign = Math.min(1.0, Math.max(0.05, benignAvg / dynamicMax));

          return {
            subject: f.name,
            "This Attack": parseFloat(normAttack.toFixed(3)),
            "Normal Baseline": parseFloat(normBenign.toFixed(3))
          };
        });

        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl animate-scaleUp">

              {/* Modal header */}
              <div className="pb-4 border-b border-[var(--sr-border-hairline)] flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-[var(--sr-accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--sr-text-primary)]">Explain This Packet</h3>
                </div>
                <button
                  onClick={() => setSelectedDetection(null)}
                  aria-label="Close attribution explanation modal"
                  title="Close modal"
                  className="p-1 text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] hover:bg-[var(--sr-bg-surface-raised)] border border-transparent rounded-[var(--sr-radius-sm)] cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--sr-accent-soft)]"
                >
                  ✕
                </button>
              </div>

              {/* 2-Column layout grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* LEFT COLUMN: VERDICTS & RADAR SIGNATURE */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-3.5 rounded-[var(--sr-radius-md)]">
                      <span className="text-[10px] text-[var(--sr-text-muted)] block mb-1">Classification Verdict</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                        selectedDetection.predicted_label.toUpperCase() !== 'BENIGN'
                          ? 'bg-[rgba(208,59,59,0.08)] text-[var(--sr-sev-critical)]'
                          : 'bg-[rgba(12,163,12,0.08)] text-[var(--sr-sev-info)]'
                      }`}>
                        {selectedDetection.predicted_label}
                      </span>
                    </div>
                    <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-3.5 rounded-[var(--sr-radius-md)]">
                      <span className="text-[10px] text-[var(--sr-text-muted)] block mb-1">Confidence Score</span>
                      <span className="text-[var(--sr-text-primary)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{(selectedDetection.confidence * 100).toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-3.5 rounded-[var(--sr-radius-md)] text-xs">
                    <span className="text-[10px] text-[var(--sr-text-muted)] block mb-1">Deciding ML Classifier Tier</span>
                    <span className="text-[var(--sr-text-primary)] font-medium">{selectedDetection.tier_name}</span>
                  </div>

                  {/* Attack DNA Radar Chart Container */}
                  <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-4 rounded-[var(--sr-radius-md)] flex flex-col items-center">
                    <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block self-start mb-2">Threat DNA Signature (normalized 0-1)</span>
                    <div className="w-full min-w-0 min-h-[220px] h-[220px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                          <PolarGrid stroke="var(--sr-border-hairline)" />
                          <PolarAngleAxis dataKey="subject" stroke="var(--sr-text-muted)" fontSize={9} />
                          <PolarRadiusAxis angle={30} domain={[0, 1.0]} stroke="var(--sr-border-hover)" fontSize={8} tickCount={3} />
                          <Radar name="This Attack" dataKey="This Attack" stroke="#2A78D6" fill="#2A78D6" fillOpacity={0.35} isAnimationActive={false} />
                          <Radar name="Normal Baseline" dataKey="Normal Baseline" stroke="#8A8F98" fill="#8A8F98" fillOpacity={0.2} isAnimationActive={false} />
                          <Tooltip contentStyle={{ backgroundColor: 'var(--sr-bg-surface)', border: '1px solid var(--sr-border-hairline)', borderRadius: 8, fontSize: 11 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex gap-4 mt-1 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sr-cat-1)' }}></span>
                        <span className="text-[var(--sr-text-secondary)] font-medium">This flow</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded bg-[var(--sr-text-muted)]"></span>
                        <span className="text-[var(--sr-text-secondary)]">Normal baseline</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: ATTRIBUTIONS & NATURAL LANGUAGE */}
                <div className="space-y-4 flex flex-col justify-between">
                  {/* Feature Impact comparisons bar charts */}
                  <div>
                    <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-3">Top Attributing Features (this vs benign average)</span>
                    <div className="space-y-2.5">
                      {selectedDetection.top_features.map((feat, idx) => {
                        const val = feat.value;
                        const benignAvg = feat.benign_avg ?? 0.0;
                        const maxVal = Math.max(val, benignAvg) || 1.0;
                        const valPct = (val / maxVal) * 100;
                        const benignPct = (benignAvg / maxVal) * 100;

                        return (
                          <div key={idx} className="text-xs bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-3 rounded-[var(--sr-radius-md)] space-y-1.5">
                            <div className="flex justify-between text-[var(--sr-text-secondary)] text-[11px]">
                              <span className="font-medium">{feat.feature}</span>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--sr-accent)] w-16 font-medium shrink-0">This flow</span>
                                <div className="flex-1 bg-[var(--sr-bg-page)] h-1.5 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-[var(--sr-accent)] rounded-full" style={{ width: `${valPct}%` }}></div>
                                </div>
                                <span className="text-[10px] text-[var(--sr-text-primary)] w-16 text-right shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {val.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--sr-text-muted)] w-16 font-medium shrink-0">Benign avg</span>
                                <div className="flex-1 bg-[var(--sr-bg-page)] h-1.5 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-[var(--sr-border-hover)] rounded-full" style={{ width: `${benignPct}%` }}></div>
                                </div>
                                <span className="text-[10px] text-[var(--sr-text-muted)] w-16 text-right shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {benignAvg.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Natural English explanation sentence */}
                  <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-3.5 rounded-[var(--sr-radius-md)] space-y-1.5 mt-auto">
                    <span className="text-[11px] font-medium text-[var(--sr-accent)] block">Natural AI Threat Attribution</span>
                    {loadingExplanation ? (
                      <div className="space-y-2 py-1 animate-pulse">
                        <div className="h-3 bg-[var(--sr-border-hairline)] rounded w-full"></div>
                        <div className="h-3 bg-[var(--sr-border-hairline)] rounded w-5/6"></div>
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">
                        {aiExplanation || "Unable to retrieve explanation attribution details."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="mt-6 pt-4 border-t border-[var(--sr-border-hairline)] text-right">
                <GlowButton
                  onClick={() => setSelectedDetection(null)}
                  variant="secondary"
                  className="px-5 py-2 text-xs ml-auto"
                >
                  Close explanation
                </GlowButton>
              </div>

            </div>
          </div>
        );
      })()}

      {/* EXPORT OPTIONS MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] p-6 max-w-md w-full shadow-2xl relative space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--sr-border-hairline)]">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--sr-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--sr-text-primary)]">Export Telemetry Report</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Format selection */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">File Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat('pdf')}
                    className={`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all ${
                      exportFormat === 'pdf'
                        ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]'
                        : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                    }`}
                  >
                    📄 PDF Document
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    className={`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all ${
                      exportFormat === 'csv'
                        ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]'
                        : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                    }`}
                  >
                    📊 CSV Dataset
                  </button>
                </div>
              </div>

              {/* Severity filter */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">Filter by Severity</label>
                <select
                  value={exportSeverity}
                  onChange={(e) => setExportSeverity(e.target.value)}
                  className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] px-3 py-2 text-xs text-[var(--sr-text-primary)] outline-none cursor-pointer"
                >
                  <option value="">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Info">Info</option>
                </select>
              </div>

              {/* Threat type filter */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">Filter by Threat Label</label>
                <select
                  value={exportAttackType}
                  onChange={(e) => setExportAttackType(e.target.value)}
                  className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] px-3 py-2 text-xs text-[var(--sr-text-primary)] outline-none cursor-pointer"
                >
                  <option value="">All Threat Vectors</option>
                  {CLASS_LABELS.map((lbl) => (
                    <option key={lbl} value={lbl}>{lbl}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--sr-border-hairline)] flex justify-end gap-2">
              <GlowButton onClick={() => setShowExportModal(false)} variant="secondary" className="px-4 py-1.5 text-xs">
                Cancel
              </GlowButton>
              <GlowButton
                onClick={() => {
                  handleExportReport(exportFormat);
                  setShowExportModal(false);
                }}
                variant="primary"
                className="px-4 py-1.5 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download {exportFormat.toUpperCase()}
              </GlowButton>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default Dashboard;
