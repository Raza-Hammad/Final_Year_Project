import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import StatusBadge from '../components/ui/StatusBadge';
import RadarBackground from '../components/ui/RadarBackground';
import {
  Shield,
  Activity,
  Database,
  Cpu,
  MessageSquare,
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
  Lock as LockIcon,
  Zap,
  Radio,
  Code,
  ScanLine,
  Bug,
  EyeOff,
  Heart,
  Layers,
  ShieldCheck,
  Crosshair,
  Send
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
  PolarRadiusAxis
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

const getScenarioIcon = (id: string) => {
  switch (id) {
    case 'dos':
      return Zap;
    case 'ddos':
      return Radio;
    case 'brute_force':
      return LockIcon;
    case 'web_attacks':
      return Code;
    case 'port_scan':
      return ScanLine;
    case 'bot':
      return Bug;
    case 'infiltration':
      return EyeOff;
    case 'heartbleed':
      return Heart;
    case 'mixed_attack':
      return Layers;
    case 'benign_baseline':
      return ShieldCheck;
    default:
      return Sliders;
  }
};

const SCENARIO_DETAILS: Record<string, { type: string, tier: string, vector: string, severity: string, color: string, bg: string, border: string, glow: string }> = {
  dos: {
    type: "Network",
    tier: "Mostly T-1",
    vector: "Floods target systems with malformed packets to consume CPU/memory resources.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  ddos: {
    type: "Network",
    tier: "Mostly T-1",
    vector: "Uses distributed botnet nodes to overwhelm bandwidth capacity.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  brute_force: {
    type: "Application",
    tier: "Mostly T-1",
    vector: "Systematically tests username/password combinations over FTP or SSH.",
    severity: "High",
    color: "var(--color-high)",
    bg: "rgba(249, 115, 22, 0.08)",
    border: "rgba(249, 115, 22, 0.2)",
    glow: "rgba(249, 115, 22, 0.3)"
  },
  web_attacks: {
    type: "Exploit",
    tier: "Mixed T-1/T-2",
    vector: "Injects malicious SQL queries or XSS scripts to compromise web databases.",
    severity: "High",
    color: "var(--color-high)",
    bg: "rgba(249, 115, 22, 0.08)",
    border: "rgba(249, 115, 22, 0.2)",
    glow: "rgba(249, 115, 22, 0.3)"
  },
  port_scan: {
    type: "Recon",
    tier: "Mostly T-1",
    vector: "Scans target ports to identify open network entry points and running services.",
    severity: "Medium",
    color: "var(--color-medium)",
    bg: "rgba(245, 166, 35, 0.08)",
    border: "rgba(245, 166, 35, 0.2)",
    glow: "rgba(245, 166, 35, 0.3)"
  },
  bot: {
    type: "Application",
    tier: "Mostly T-1",
    vector: "Establishes unauthorized Command & Control (C2) communication channels.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  infiltration: {
    type: "Exploit",
    tier: "Mixed T-1/T-2/T-3",
    vector: "Exploits system vulnerabilities to gain internal footholds and move laterally.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  heartbleed: {
    type: "Exploit",
    tier: "Mostly T-1",
    vector: "Exploits CVE-2014-0160 in OpenSSL — leaks up to 64KB of server memory per request.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  mixed_attack: {
    type: "Network",
    tier: "Mixed T-1/T-2/T-3",
    vector: "Combines reconnaissance, exploitation, and flooding in a multi-vector attack campaign.",
    severity: "Critical",
    color: "var(--color-critical)",
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.2)",
    glow: "rgba(239, 68, 68, 0.3)"
  },
  benign_baseline: {
    type: "Nominal",
    tier: "None",
    vector: "Generates normal, nominal user traffic with no malicious components.",
    severity: "Info",
    color: "var(--color-calm)",
    bg: "rgba(45, 212, 191, 0.08)",
    border: "rgba(45, 212, 191, 0.2)",
    glow: "rgba(45, 212, 191, 0.3)"
  }
};

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'live' | 'simulator' | 'history' | 'insights' | 'ai'>('live');

  // --- GLOBAL STATES ---
  const [wsConnected, setWsConnected] = useState(false);

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
  const [activeVectors, setActiveVectors] = useState<any[]>([]);
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
  const [ppsHistory, setPpsHistory] = useState<number[]>(Array(20).fill(0));
  const [localElapsed, setLocalElapsed] = useState(0);

  // --- ALERT HISTORY STATES ---
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [filterAttack, setFilterAttack] = useState('');
  const [filterTier, setFilterTier] = useState('');
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

  // --- EXPLAINABLE AI (XAI) STATES ---
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [loadingExplanation, setLoadingExplanation] = useState<boolean>(false);

  // --- AI CHATBOT STATES ---
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string; time: string; source?: string; responseTime?: string; isError?: boolean }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [geminiAvailable, setGeminiAvailable] = useState<boolean>(true);
  const [inputFocused, setInputFocused] = useState<boolean>(false);

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
    const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws/live`);
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
  }, []);

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

        const newVectors: any[] = [];
        buffer.forEach((evt) => {
          if (evt.event === 'detection' && evt.data) {
            newPackets += 1;
            processedDetections.push(evt);
            
            const data = evt.data;
            const label = data.predicted_label;
            const isAttack = label.toUpperCase() !== 'BENIGN';
            if (isAttack) {
              newAttacks += 1;
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
    let timer: any = null;
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
    try {
      await api.post('/api/simulate/start', {
        scenario: selectedScenario,
        rate: simRate,
        duration_seconds: simDuration || null
      });
      fetchSimStatus();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to start simulation.');
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
  }, [activeTab, historyPage, filterAttack, filterTier, filterDateFrom, filterDateTo]);

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
    try {
      const res = await api.post('/api/chat', { message: text });
      const endTime = performance.now();
      const durationMs = endTime - startTime;
      
      let responseTimeStr = '';
      if (durationMs < 1000) {
        responseTimeStr = `${Math.round(durationMs)}ms`;
      } else {
        responseTimeStr = `${(durationMs / 1000).toFixed(1)}s`;
      }

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
    } catch (err: any) {
      console.error('Failed to communicate with chat backend:', err);
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

  const getComparisonData = () => {
    if (!metricsData || !metricsData.summary) return [];
    return Object.entries(metricsData.summary).map(([name, data]: [string, any]) => ({
      name,
      accuracy: data.accuracy * 100,
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

  const postureStatus = React.useMemo(() => {
    if (postureScore <= 30) {
      return {
        label: 'SECURE',
        color: 'text-emerald-400',
        dotColor: 'bg-emerald-400',
        description: 'No significant threats detected.'
      };
    } else if (postureScore <= 60) {
      return {
        label: 'ELEVATED',
        color: 'text-amber-400',
        dotColor: 'bg-amber-400',
        description: 'Moderate attack activity detected.'
      };
    } else {
      return {
        label: 'UNDER ATTACK',
        color: 'text-red-400 font-bold tracking-wider',
        dotColor: 'bg-red-400 animate-pulse',
        description: 'Sustained critical threat cascade active.'
      };
    }
  }, [postureScore]);

  const renderConfusionMatrix = (modelKey: 'lightgbm' | 'random_forest' | 'xgboost') => {
    if (!metricsData || !metricsData.confusion_matrices || !metricsData.confusion_matrices[modelKey]) {
      return <div className="text-slate-500 text-xs py-10 text-center font-mono">Matrix data not loaded.</div>;
    }
    const matrix = metricsData.confusion_matrices[modelKey];
    
    return (
      <div className="flex flex-col gap-4">
        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-4">
          <div className="min-w-[420px] flex flex-col">
            {/* Column Headers */}
            <div className="flex items-center pl-16 mb-1">
              {CLASS_ABBREVIATIONS.map((abb, idx) => (
                <div
                  key={idx}
                  title={CLASS_LABELS[idx]}
                  className="w-6 sm:w-7 text-[8px] font-mono text-center text-slate-500 font-bold select-none truncate"
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
                     className="w-16 pr-2 text-[8px] font-mono text-right text-slate-500 font-bold select-none truncate"
                  >
                    {CLASS_ABBREVIATIONS[i]}
                  </div>

                  {/* Row Cells */}
                  {rowArr.map((val: number, j: number) => {
                    const pct = rowSum > 0 ? (val / rowSum) : 0;
                    const isCorrect = i === j;
                    
                    // Style cell color based on normalized row percentage using amber-to-red HUD scale
                    let bgStyle: React.CSSProperties = {};
                    if (val > 0) {
                      if (isCorrect) {
                        bgStyle = { backgroundColor: `rgba(245, 166, 35, ${0.15 + pct * 0.85})` }; // Amber scale for correct
                      } else {
                        bgStyle = { backgroundColor: `rgba(239, 68, 68, ${0.15 + pct * 0.85})` }; // Red scale for errors
                      }
                    } else {
                      bgStyle = { backgroundColor: 'var(--bg-base)' }; // Dark console base for 0
                    }

                    const isHovered = hoveredCMCell && hoveredCMCell.row === i && hoveredCMCell.col === j;

                    return (
                      <div
                        key={j}
                        style={bgStyle}
                        onMouseEnter={() => setHoveredCMCell({ row: i, col: j, val, pct })}
                        onMouseLeave={() => setHoveredCMCell(null)}
                        className={`w-6 h-6 sm:w-7 sm:h-7 border border-slate-950/40 relative flex items-center justify-center text-[7px] font-mono transition-all duration-150 cursor-pointer ${
                          isHovered ? 'ring-1 ring-[var(--accent-amber)] scale-105 z-10 border-transparent shadow-[0_0_12px_rgba(245,166,35,0.4)]' : ''
                        }`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[9px] font-mono text-[var(--text-secondary)] border-t border-[var(--border-subtle)]/30 pt-4 px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-[var(--accent-amber)] border border-[var(--border-subtle)]"></span>
              <span>Correct Class</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-[var(--color-critical)] border border-[var(--border-subtle)]"></span>
              <span>Misclassification</span>
            </div>
          </div>
          <span className="text-[var(--text-muted)]">Color intensity maps normalized recall row-wise</span>
        </div>

        {/* Selected Cell Inspector */}
        <div className="bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-col justify-center min-h-[56px] text-xs transition-all">
          {hoveredCMCell ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[9px] text-[var(--text-secondary)] block mb-0.5 uppercase tracking-wider font-bold font-sans">Actual Class</span>
                <span className="text-white font-semibold truncate block">{CLASS_LABELS[hoveredCMCell.row]}</span>
              </div>
              <div>
                <span className="text-[9px] text-[var(--text-secondary)] block mb-0.5 uppercase tracking-wider font-bold font-sans">Predicted Class</span>
                <span className="text-white font-semibold truncate block">{CLASS_LABELS[hoveredCMCell.col]}</span>
              </div>
              <div>
                <span className="text-[9px] text-[var(--text-secondary)] block mb-0.5 uppercase tracking-wider font-bold font-sans">Flow Counts (%)</span>
                <span className={`font-mono font-bold ${hoveredCMCell.row === hoveredCMCell.col ? 'text-[var(--accent-amber)]' : hoveredCMCell.val > 0 ? 'text-[var(--color-critical)]' : 'text-slate-500'}`}>
                  {hoveredCMCell.val.toLocaleString()} ({(hoveredCMCell.pct * 100).toFixed(2)}%)
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-[var(--text-secondary)] text-xs italic font-mono">
              Hover over cells to inspect metrics
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex font-sans select-none overflow-hidden h-screen relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes glow-pulse {
          0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 2px var(--glow-color)) drop-shadow(0 0 6px var(--glow-color)); }
          50% { opacity: 1.0; filter: drop-shadow(0 0 4px var(--glow-color)) drop-shadow(0 0 12px var(--glow-color)); }
        }
        @keyframes border-glow-pulse-critical {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.6); }
          50% { box-shadow: 0 0 14px rgba(239, 68, 68, 0.45); border-color: rgba(239, 68, 68, 1); }
        }
        @keyframes border-glow-pulse-high {
          0%, 100% { box-shadow: 0 0 4px rgba(249, 115, 22, 0.15); border-color: rgba(249, 115, 22, 0.6); }
          50% { box-shadow: 0 0 14px rgba(249, 115, 22, 0.45); border-color: rgba(249, 115, 22, 1); }
        }
        @keyframes border-glow-pulse-medium {
          0%, 100% { box-shadow: 0 0 4px rgba(245, 166, 35, 0.15); border-color: rgba(245, 166, 35, 0.6); }
          50% { box-shadow: 0 0 14px rgba(245, 166, 35, 0.45); border-color: rgba(245, 166, 35, 1); }
        }
        @keyframes border-glow-pulse-info {
          0%, 100% { box-shadow: 0 0 4px rgba(45, 212, 191, 0.15); border-color: rgba(45, 212, 191, 0.6); }
          50% { box-shadow: 0 0 14px rgba(45, 212, 191, 0.45); border-color: rgba(45, 212, 191, 1); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulse-bg-red {
          0%, 100% { background-color: rgba(185, 28, 28, 0.9); }
          50% { background-color: rgba(239, 68, 68, 0.9); }
        }
        
        .radar-active svg g {
          animation: radar-sweep 4s linear infinite !important;
        }
        
        .configure-panel.running-critical > span.absolute { border-color: var(--color-critical) !important; }
        .configure-panel.running-high > span.absolute { border-color: var(--color-high) !important; }
        .configure-panel.running-medium > span.absolute { border-color: var(--color-medium) !important; }
        .configure-panel.running-info > span.absolute { border-color: var(--color-calm) !important; }
      `}} />
      
      {/* LEFT SIDEBAR NAVBAR */}
      <aside className="w-64 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] flex flex-col justify-between py-6 z-20 shrink-0">
        <div className="flex flex-col gap-8">
          {/* Dashboard Title Branding */}
          <div className="flex items-center gap-3 px-5">
            <div className="p-2 bg-gradient-to-br from-amber-600/20 to-amber-700/20 border border-[var(--border-subtle)] rounded-xl shadow-lg shadow-amber-500/5">
              <Shield className="w-5 h-5 text-[var(--accent-amber)] animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight text-white leading-tight uppercase font-display">ThreatSim AI</h1>
              <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Command Center</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-l-none border-l-2 text-xs uppercase tracking-wider font-semibold font-body transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)] ${
                activeTab === 'live'
                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-glow)] text-[var(--accent-amber)] font-bold pl-4'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 pl-4'
              }`}
            >
              <Activity className={`w-4.5 h-4.5 ${activeTab === 'live' ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
              <span>Live Detection</span>
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-l-none border-l-2 text-xs uppercase tracking-wider font-semibold font-body transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)] ${
                activeTab === 'simulator'
                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-glow)] text-[var(--accent-amber)] font-bold pl-4'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 pl-4'
              }`}
            >
              <Sliders className={`w-4.5 h-4.5 ${activeTab === 'simulator' ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
              <span>Threat Simulator</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-l-none border-l-2 text-xs uppercase tracking-wider font-semibold font-body transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)] ${
                activeTab === 'history'
                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-glow)] text-[var(--accent-amber)] font-bold pl-4'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 pl-4'
              }`}
            >
              <Database className={`w-4.5 h-4.5 ${activeTab === 'history' ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
              <span>Alert History</span>
            </button>

            <button
              onClick={() => setActiveTab('insights')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-l-none border-l-2 text-xs uppercase tracking-wider font-semibold font-body transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)] ${
                activeTab === 'insights'
                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-glow)] text-[var(--accent-amber)] font-bold pl-4'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 pl-4'
              }`}
            >
              <Cpu className={`w-4.5 h-4.5 ${activeTab === 'insights' ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
              <span>Model Insights</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-l-none border-l-2 text-xs uppercase tracking-wider font-semibold font-body transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)] ${
                activeTab === 'ai'
                  ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-glow)] text-[var(--accent-amber)] font-bold pl-4'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/40 hover:text-slate-200 pl-4'
              }`}
            >
              <MessageSquare className={`w-4.5 h-4.5 ${activeTab === 'ai' ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
              <span>AI Assistant</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User Details */}
        <div className="pt-4 mx-5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-[var(--accent-amber)] shrink-0">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-200 truncate">{user?.username || 'analyst'}</p>
              <span className="text-[9px] text-[var(--accent-amber)] font-mono font-semibold uppercase tracking-wider">{user?.role || 'analyst'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT CONTENT WORKSPACE */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-10 bg-transparent">
        {/* HEADER BRANDING BANNER */}
        <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/40 backdrop-blur-md px-8 py-4 flex items-center justify-between shrink-0">
          {activeTab === 'simulator' ? (
            // --- SIMULATOR TAB OVERHAULED COMMAND BAR ---
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Crosshair 
                  className="w-5.5 h-5.5 text-[var(--accent-amber)]"
                  style={{
                    animation: 'spin-slow 8s linear infinite',
                    animationPlayState: simStatus.running ? 'paused' : 'running'
                  }}
                />
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wider uppercase font-display leading-none mb-0.5">
                    THREAT SIMULATION CONSOLE
                  </h2>
                  <span className="text-[9.5px] text-[var(--text-secondary)] font-sans block leading-tight">
                    Controlled attack replay — isolated test environment — no live network traffic generated
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Posture Status Badge */}
                <div className="flex items-center gap-1.5 bg-[var(--bg-panel-raised)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]/40">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase font-semibold font-mono">Posture:</span>
                  <StatusBadge status={postureStatus.label} className="!border-none !p-0" />
                </div>

                {/* Connection/WS Badge */}
                <div className="flex items-center gap-1.5 bg-[var(--bg-panel-raised)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]/40">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase font-semibold font-mono">Telemetry:</span>
                  <StatusBadge 
                    status={
                      !wsConnected ? 'Disconnected' : 
                      (lastHeartbeat && Date.now() - lastHeartbeat < 8000) ? 'Connected' : 'Syncing'
                    } 
                    className="!border-none !p-0"
                  />
                </div>

                {/* Simulation Running Badge */}
                <span 
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10"
                  style={
                    simStatus.running 
                      ? { color: 'var(--accent-amber)', backgroundColor: 'rgba(245, 166, 35, 0.12)' }
                      : { color: 'rgba(148, 163, 184, 0.8)', backgroundColor: 'rgba(148, 163, 184, 0.08)' }
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${simStatus.running ? 'bg-[var(--accent-amber)] animate-pulse' : 'bg-slate-500'}`} />
                  {simStatus.running ? 'SIMULATION: ACTIVE' : 'SIMULATION: IDLE'}
                </span>

                <div className="h-5 w-[1px] bg-[var(--border-subtle)] mx-1" />

                {/* Log Out */}
                <GlowButton variant="ghost" onClick={logout} className="px-2.5 py-1.5 text-[9px] font-bold">
                  <LogOut className="w-3 h-3" />
                  Logout
                </GlowButton>
              </div>
            </div>
          ) : (
            // --- STANDARD BANNER FOR OTHER TABS ---
            <div className="flex items-center justify-between w-full">
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide uppercase font-display">
                  {activeTab === 'live' && 'Security Operations Center - Live Telemetry'}
                  {activeTab === 'history' && 'Security Operations Center - SQLite Alert Database'}
                  {activeTab === 'insights' && 'Security Operations Center - Cascade Benchmarks'}
                  {activeTab === 'ai' && 'Security Operations Center - Intelligent Analyst assistant'}
                </h2>
                <span className="text-[10px] text-[var(--text-secondary)] font-medium">Bahria University Karachi  Campus — BS(IT) Final Year Project</span>
              </div>

              <div className="flex items-center gap-4">
                {/* Posture Status Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--text-secondary)] uppercase font-semibold">Posture:</span>
                  <StatusBadge status={postureStatus.label} />
                </div>

                {/* Connection/WS Badge */}
                <StatusBadge status={
                  !wsConnected ? 'Disconnected' : 
                  (lastHeartbeat && Date.now() - lastHeartbeat < 8000) ? 'Connected' : 'Syncing'
                } />

                {simStatus.running && (
                  <StatusBadge status="ACTIVE" />
                )}

                <div className="h-5 w-[1px] bg-[var(--border-subtle)] mx-1" />

                {/* Log Out */}
                <GlowButton variant="ghost" onClick={logout} className="px-2.5 py-1.5 text-[9px] font-bold">
                  <LogOut className="w-3 h-3" />
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
              
              {/* SECURITY POSTURE GAUGE & LIVE ATTACK MAP PANEL */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
                {/* 1. Security Posture Gauge */}
                <GlowPanel className="flex flex-col items-center justify-between h-[230px] relative overflow-hidden p-4 pb-0">
                  <div className="w-full flex justify-between items-center pb-2 border-b border-[var(--border-subtle)] shrink-0">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Threat Posture Index</h3>
                    <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">2 Min Window</span>
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center mt-1.5">
                    <svg width="150" height="82" viewBox="0 0 200 110" className="overflow-visible">
                      <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#22C55E" />
                          <stop offset="50%" stopColor="#F5A623" />
                          <stop offset="100%" stopColor="#EF4444" />
                        </linearGradient>
                      </defs>
                      {/* Gradient background track (dormant path) */}
                      <path
                        d="M20,100 A80,80 0 0,1 180,100"
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth="14"
                        strokeLinecap="round"
                        opacity="0.25"
                      />
                      {/* Gradient active progress track */}
                      <path
                        d="M20,100 A80,80 0 0,1 180,100"
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth="14"
                        strokeLinecap="round"
                        strokeDasharray="251.3"
                        strokeDashoffset={251.3 - (251.3 * postureScore) / 100}
                        className="transition-all duration-700 ease-out"
                        style={{ filter: 'drop-shadow(0 0 3px var(--accent-amber))' }}
                      />
                      
                      {/* Subtle instrument radial tick marks outside the arc */}
                      {[-90, -45, 0, 45, 90].map((angle, idx) => (
                        <line
                          key={idx}
                          x1="100"
                          y1="9"
                          x2="100"
                          y2="3"
                          stroke="var(--text-secondary)"
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
                          stroke="var(--accent-amber)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          style={{ 
                            transformOrigin: '0px 0px',
                            transform: `rotate(${-90 + (postureScore / 100) * 180}deg)`,
                            transition: 'transform 0.8s ease-in-out',
                            filter: 'drop-shadow(0 0 2px var(--accent-amber))'
                          }}
                        />
                        <circle cx="0" cy="0" r="5" fill="var(--accent-amber)" />
                      </g>
                    </svg>

                    {/* Numeric Score Overlay (positioned clearly below the pivot hub) */}
                    <div className="text-center mt-1.5 z-10">
                      <p className="text-xl font-black text-white tracking-tight leading-none font-mono">{postureScore}%</p>
                      <span className="text-[7.5px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold font-sans mt-0.5 block">Risk Index</span>
                    </div>
                  </div>

                  {/* Status Indicator Bar */}
                  <div className="w-[calc(100%+32px)] mx-[-16px] flex items-center justify-between px-4 min-h-[36px] bg-[var(--bg-panel-raised)] border-t border-[var(--border-subtle)] transition-all duration-500 mt-auto shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${postureStatus.dotColor}`} />
                      <span className={`text-[9px] font-bold uppercase ${postureStatus.color}`}>
                        {postureStatus.label}
                      </span>
                    </div>
                    <span className="text-[8px] text-[var(--text-secondary)] font-body truncate ml-4">
                      {postureStatus.description}
                    </span>
                  </div>
                </GlowPanel>

                {/* 2. Interactive Live Attack Map */}
                <GlowPanel className="lg:col-span-2 flex flex-col justify-between h-[230px] relative overflow-hidden p-5">
                  <div className="w-full flex justify-between items-center pb-2 border-b border-[var(--border-subtle)] shrink-0 z-10">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[var(--accent-amber)]" />
                      <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Live Attack & Traffic Map</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[8px] font-mono">
                      {simStatus.running ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] animate-pulse shadow-[0_0_8px_var(--accent-amber)]" />
                          <span className="text-[var(--accent-amber)] font-bold tracking-wider">LIVE</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-650" />
                          <span className="text-slate-500 font-bold tracking-wider">IDLE</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* SVG Attack Vector Canvas */}
                  <div className="flex-1 w-full relative mt-2 overflow-hidden rounded-[var(--radius-sm)]">
                    <RadarBackground isFixed={false} />
                    
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
                          stroke: var(--border-subtle);
                          stroke-width: 1.5px;
                          fill: var(--bg-panel-raised);
                        }
                        .target-node-circle:hover {
                          stroke: var(--accent-amber);
                          filter: drop-shadow(0 0 5px var(--accent-amber));
                          cursor: pointer;
                        }
                      `}} />

                      {/* 1. Draw static topological connections as background mesh */}
                      <path d="M 50 45 Q 235 25 420 30" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />
                      <path d="M 50 45 Q 235 60 420 75" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />
                      <path d="M 50 45 Q 235 90 420 120" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 60 420 30" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 90 420 75" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />
                      <path d="M 50 105 Q 235 120 420 120" fill="none" stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="2 2" opacity={activeVectors.length > 0 ? 0.04 : 0.15} className="transition-all duration-700" />

                      {/* 2. Left Node Group: Source Pools */}
                      {/* Attacker Node Pool */}
                      <circle 
                        cx="50" 
                        cy="45" 
                        r="14"
                        fill="var(--color-critical)" 
                        style={{ 
                          animation: simStatus.running 
                            ? 'attacker-glow-active 1.5s infinite ease-in-out' 
                            : 'attacker-glow-calm 3s infinite ease-in-out',
                          transformOrigin: '50px 45px'
                        }} 
                      />
                      <circle cx="50" cy="45" r="12" stroke="var(--color-critical)" strokeWidth="1.5" fill="rgba(239, 68, 68, 0.15)" />
                      <text x="50" y="48" fill="var(--color-critical)" fontSize="7" textAnchor="middle" fontWeight="bold" className="font-mono select-none">ATK</text>
                      <text x="50" y="24" fill="var(--color-critical)" fontSize="7.5" textAnchor="middle" fontWeight="bold" className="select-none uppercase tracking-wider font-sans">Attacker Pool</text>
                      <text x="50" y="32" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" className="font-mono select-none">203.0.113.45</text>

                      {/* Client Node Pool */}
                      <circle 
                        cx="50" 
                        cy="105" 
                        r="12"
                        fill="var(--color-calm)" 
                        style={{ 
                          animation: 'client-glow-calm 4s infinite ease-in-out',
                          transformOrigin: '50px 105px'
                        }} 
                      />
                      <circle cx="50" cy="105" r="10" stroke="var(--color-calm)" strokeWidth="1.5" fill="rgba(45, 212, 191, 0.12)" />
                      <text x="50" y="108" fill="var(--color-calm)" fontSize="7" textAnchor="middle" fontWeight="bold" className="font-mono select-none">USR</text>
                      <text x="50" y="126" fill="var(--color-calm)" fontSize="7.5" textAnchor="middle" fontWeight="bold" className="select-none uppercase tracking-wider font-sans">Clients (Benign)</text>
                      <text x="50" y="134" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" className="font-mono select-none">192.168.10.50</text>

                      {/* 3. Internal Network Boundary (Right) */}
                      <rect x="320" y="8" width="170" height="138" rx="6" fill="none" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="405" y="20" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" fontWeight="bold" letterSpacing="1.5" className="select-none font-sans uppercase opacity-60">INTERNAL LAN</text>

                      {/* Web Server Node */}
                      <circle cx="420" cy="30" r="10" className="target-node-circle" />
                      <text x="420" y="33" fill="var(--text-primary)" fontSize="7" fontWeight="bold" className="font-mono select-none" textAnchor="middle">WS</text>
                      <text x="420" y="49" fill="var(--text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="semibold" className="select-none font-sans">Web Server</text>
                      <text x="420" y="57" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" className="font-mono select-none">192.168.10.10</text>

                      {/* DB Server Node */}
                      <circle cx="420" cy="75" r="10" className="target-node-circle" />
                      <text x="420" y="78" fill="var(--text-primary)" fontSize="7" fontWeight="bold" className="font-mono select-none" textAnchor="middle">DB</text>
                      <text x="420" y="94" fill="var(--text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="semibold" className="select-none font-sans">DB Server</text>
                      <text x="420" y="102" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" className="font-mono select-none">192.168.10.20</text>

                      {/* Workstation Node */}
                      <circle cx="420" cy="120" r="10" className="target-node-circle" />
                      <text x="420" y="123" fill="var(--text-primary)" fontSize="7" fontWeight="bold" className="font-mono select-none" textAnchor="middle">PC</text>
                      <text x="420" y="139" fill="var(--text-primary)" fontSize="7.5" textAnchor="middle" fontWeight="semibold" className="select-none font-sans">Workstation</text>
                      <text x="420" y="147" fill="var(--text-secondary)" fontSize="6" textAnchor="middle" className="font-mono select-none">192.168.10.30</text>

                      {/* 4. Active flow vectors mapping */}
                      {activeVectors.map((vec, index) => {
                        // Count concurrent vectors to offset curves dynamically
                        const concurrentCount = activeVectors.slice(0, index).filter(v => v.toY === vec.toY).length;
                        const offsetDirection = concurrentCount % 2 === 0 ? 1 : -1;
                        const multiplier = Math.floor((concurrentCount + 1) / 2);
                        const dynamicOffset = offsetDirection * multiplier * 12;

                        const isBenign = vec.label.toUpperCase() === 'BENIGN';
                        const severityUpper = (vec.severity || 'Info').toUpperCase();
                        const color = isBenign ? 'var(--color-calm)' :
                          severityUpper === 'CRITICAL' ? 'var(--color-critical)' :
                          severityUpper === 'HIGH' ? 'var(--color-high)' :
                          severityUpper === 'MEDIUM' ? 'var(--color-medium)' :
                          'var(--color-low)'; // Low / Info
                          
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
                        className="absolute bg-[var(--bg-panel-raised)] border border-[var(--accent-amber)]/40 rounded px-2.5 py-1.5 pointer-events-none text-[8.5px] font-mono text-white shadow-xl z-30 transition-all duration-150"
                        style={{
                          left: `${(hoveredVector.fromX + hoveredVector.toX) / 2 / 5}%`,
                          top: `${((hoveredVector.fromY + hoveredVector.toY) / 2 + (hoveredVector.isAttack ? -35 : -15)) / 1.5}%`,
                          transform: 'translate(-50%, -100%)',
                          marginTop: '-8px'
                        }}
                      >
                        <div className="font-bold text-[var(--accent-amber)] mb-0.5 font-sans uppercase text-[9px]">
                          {hoveredVector.label}
                        </div>
                        <div>
                          <span className="text-slate-400">Route:</span> {hoveredVector.source_ip}:{hoveredVector.source_port} &rarr; {hoveredVector.dest_ip}:{hoveredVector.dest_port}
                        </div>
                        <div className="mt-0.5">
                          <span className="text-slate-400">Confidence:</span> <span className="text-slate-200">{(hoveredVector.confidence * 100).toFixed(2)}%</span>
                        </div>
                        <div className="mt-0.5">
                          <span className="text-slate-400">Severity:</span> <span style={{ color: hoveredVector.isAttack ? 'var(--color-critical)' : 'var(--color-calm)' }} className="font-bold">{hoveredVector.severity}</span>
                        </div>
                      </div>
                    )}

                    {/* Threat Map overlay */}
                    {liveEvents.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
                        <span className="text-[10px] text-[var(--text-secondary)] font-body tracking-wider uppercase standby-text font-bold">
                          Awaiting Ingress Stream Telemetry...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Legend Overlay at the bottom */}
                  <div className="flex justify-between items-center bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] px-3 py-1.5 text-[8px] font-mono text-[var(--text-secondary)] shrink-0 mt-2 z-10">
                    <div className="flex items-center gap-3">
                      <span className="text-[7.5px] font-bold text-slate-500 uppercase tracking-wider">Severity Scale:</span>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[7.5px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--color-calm)]/10 text-[var(--color-calm)] bg-[var(--color-calm)]/10">
                          <span className="w-1 h-1 rounded-full bg-[var(--color-calm)] animate-pulse" />
                          Benign
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[7.5px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--color-low)]/10 text-[var(--color-low)] bg-[var(--color-low)]/10">
                          <span className="w-1 h-1 rounded-full bg-[var(--color-low)]" />
                          Low
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[7.5px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--color-medium)]/10 text-[var(--color-medium)] bg-[var(--color-medium)]/10">
                          <span className="w-1 h-1 rounded-full bg-[var(--color-medium)]" />
                          Medium
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[7.5px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--color-high)]/10 text-[var(--color-high)] bg-[var(--color-high)]/10">
                          <span className="w-1 h-1 rounded-full bg-[var(--color-high)] animate-pulse" />
                          High
                        </span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[7.5px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--color-critical)]/10 text-[var(--color-critical)] bg-[var(--color-critical)]/10">
                          <span className="w-1 h-1 rounded-full bg-[var(--color-critical)] animate-pulse" />
                          Critical
                        </span>
                      </div>
                    </div>
                    <span className="text-[6.5px] text-[var(--text-secondary)] font-bold uppercase font-body">Live Attack Monitor</span>
                  </div>
                </GlowPanel>
              </div>

              {/* SOC KPI STAT CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                <GlowPanel className="flex flex-col justify-between h-[90px] p-4">
                  <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider font-sans">Packets Processed</span>
                  <div className="mt-1">
                    <p className="text-2xl font-extrabold text-white tracking-tight font-mono">{packetsAnalyzed.toLocaleString()}</p>
                    <span className="text-[8px] text-[var(--text-muted)] mt-0.5 block font-sans">Total streams screened in session</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="flex flex-col justify-between h-[90px] p-4">
                  <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider font-sans">Attacks Detected</span>
                  <div className="mt-1">
                    <p className="text-2xl font-extrabold text-[var(--color-critical)] tracking-tight font-mono">{attacksCount.toLocaleString()}</p>
                    <span className="text-[8px] text-[var(--text-muted)] mt-0.5 block font-sans">Flagged anomalies (non-BENIGN)</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="flex flex-col justify-between h-[90px] p-4">
                  <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider font-sans">Current Flow Rate</span>
                  <div className="mt-1">
                    <p className="text-2xl font-extrabold text-[var(--color-calm)] tracking-tight font-mono">{packetsPerSecond} <span className="text-xs font-semibold text-[var(--text-secondary)] font-sans">pkts/sec</span></p>
                    <span className="text-[8px] text-[var(--text-muted)] mt-0.5 block font-sans">Real-time ingress bandwidth</span>
                  </div>
                </GlowPanel>

                <GlowPanel className="flex flex-col justify-between h-[90px] p-4">
                  <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider font-sans">Cascade Tier Distribution</span>
                  <div className="mt-1 text-slate-300 font-semibold grid grid-cols-3 gap-1">
                    <div className="bg-[var(--bg-base)] p-1 border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center">
                      <p className="text-xs text-white font-mono">{liveTiers[1] || 0}</p>
                      <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T1</span>
                    </div>
                    <div className="bg-[var(--bg-base)] p-1 border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center">
                      <p className="text-xs text-white font-mono">{liveTiers[2] || 0}</p>
                      <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T2</span>
                    </div>
                    <div className="bg-[var(--bg-base)] p-1 border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-center">
                      <p className="text-xs text-white font-mono">{liveTiers[3] || 0}</p>
                      <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T3</span>
                    </div>
                  </div>
                </GlowPanel>
              </div>

              {/* DUAL CHARTING SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 h-[280px]">
                {/* Chart 1: Volumetric Line Chart (Packets and Threats Rate) */}
                <GlowPanel className="lg:col-span-2 flex flex-col justify-between h-full p-5">
                  <div className="pb-3 border-b border-[var(--border-subtle)] flex justify-between items-center">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Volumetric Timeline</h3>
                    <span className="text-[9px] text-[var(--text-secondary)]">Replayed Rate vs Flagged Anomalies</span>
                  </div>
                  <div className="flex-1 w-full h-[180px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorPackets" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-calm)" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="var(--color-calm)" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorThreats" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-critical)" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="var(--color-critical)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 166, 35, 0.05)" opacity={0.3} />
                        <XAxis dataKey="time" stroke="var(--text-secondary)" fontSize={8} />
                        <YAxis stroke="var(--text-secondary)" fontSize={8} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel-raised)', borderColor: 'var(--border-subtle)', fontSize: 10, color: 'white' }} />
                        <Area type="monotone" dataKey="packets" name="Ingress Rate" stroke="var(--color-calm)" fillOpacity={1} fill="url(#colorPackets)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="threats" name="Threats Rate" stroke="var(--color-critical)" fillOpacity={1} fill="url(#colorThreats)" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </GlowPanel>

                {/* Chart 2: Threat Category counts */}
                <GlowPanel className="flex flex-col justify-between h-full p-5">
                  <div className="pb-3 border-b border-[var(--border-subtle)] flex justify-between items-center">
                    <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Threat Distributions</h3>
                    <span className="text-[9px] text-[var(--text-secondary)]">Counts per category type</span>
                  </div>
                  <div className="flex-1 w-full h-[180px] mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(attackCounts)
                          .filter(([name]) => name.toUpperCase() !== 'BENIGN')
                          .map(([name, count]) => ({ name, count }))}
                        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 166, 35, 0.05)" opacity={0.3} />
                        <XAxis type="number" stroke="var(--text-secondary)" fontSize={8} />
                        <YAxis type="category" dataKey="name" stroke="var(--text-secondary)" fontSize={8} width={70} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-panel-raised)', borderColor: 'var(--border-subtle)', fontSize: 10, color: 'white' }} />
                        <Bar dataKey="count" fill="var(--accent-amber)" radius={[0, 4, 4, 0]} barSize={10} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlowPanel>
              </div>

              {/* FULL WIDTH LIVE TELEMETRY TABLE */}
              <GlowPanel className="flex-1 flex flex-col min-h-[300px] overflow-hidden p-5">
                <div className="pb-3 border-b border-[var(--border-subtle)] flex justify-between items-center shrink-0">
                  <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Live Threat Telemetry Feed</h3>
                  <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-secondary)] font-mono uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-critical)] animate-pulse"></span>
                    Ingesting Stream
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto mt-4 font-mono text-[9px]">
                  {liveEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--text-secondary)] text-xs">
                      Awaiting live telemetry packets...
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs text-slate-300">
                      <thead className="bg-[var(--bg-base)] sticky top-0 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-bold uppercase text-[9px] z-10">
                        <tr>
                          <th className="p-3">Time</th>
                          <th className="p-3">Attack Category</th>
                          <th className="p-3">Severity</th>
                          <th className="p-3">Confidence</th>
                          <th className="p-3">Resolution Classifier</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]/30 font-mono text-[10px]">
                        {liveEvents.map((evt, i) => {
                          const isThreat = evt.data && evt.data.predicted_label.toUpperCase() !== 'BENIGN';
                          const lbl = evt.data?.predicted_label || '';
                          
                          return (
                            <tr
                              key={i}
                              className={`hover:bg-slate-800/30 transition-all border-b border-[var(--border-subtle)]/20 animate-fade-in ${
                                isThreat ? 'bg-[var(--color-critical)]/5' : 'bg-[var(--bg-panel)]/10'
                              }`}
                              style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}
                            >
                              <td className="p-3 text-[var(--text-secondary)]">
                                {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 border rounded-md font-semibold font-mono text-[9px] ${
                                  isThreat 
                                    ? 'bg-red-950/20 border-red-500/20 text-[var(--color-critical)]'
                                    : 'bg-teal-950/20 border-teal-500/20 text-[var(--color-calm)]'
                                }`}>
                                  {lbl}
                                </span>
                              </td>
                              <td className="p-3">
                                <StatusBadge status={evt.data?.severity || 'Info'} />
                              </td>
                              <td className="p-3 font-semibold text-slate-200 font-mono">
                                {((evt.data?.confidence || 0) * 100).toFixed(2)}%
                              </td>
                              <td className="p-3 text-[var(--text-secondary)]">
                                {evt.data?.tier_name}
                              </td>
                              <td className="p-3 text-right">
                                {evt.data?.top_features && (
                                  <button
                                    onClick={() => setSelectedDetection(evt.data!)}
                                    className="text-[var(--accent-amber)] hover:text-white font-bold hover:underline cursor-pointer font-mono text-[10px]"
                                  >
                                    EXPLAIN
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
            
            const runningSeverity = (simStatus.running && scenarios && selectedScenario && scenarios[selectedScenario]) 
              ? scenarios[selectedScenario].severity_hint.toLowerCase() 
              : '';
            
            // Lookups for state badge in Live Status panel
            let stateDot = 'bg-slate-500';
            let stateText = 'STANDBY';
            let stateColor = 'text-slate-400 font-mono';
            let stateBg = 'rgba(148, 163, 184, 0.08)';
            
            if (simStatus.running) {
              stateDot = 'bg-amber-500 animate-pulse';
              stateText = 'TRANSMITTING';
              stateColor = 'text-[var(--accent-amber)] font-mono animate-pulse';
              stateBg = 'rgba(245, 166, 35, 0.12)';
            } else if (simStatus.packets_sent > 0 && !simStatus.running) {
              stateDot = 'bg-emerald-500';
              stateText = 'COMPLETED';
              stateColor = 'text-emerald-400 font-mono';
              stateBg = 'rgba(16, 185, 129, 0.12)';
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
                  <GlowPanel className={`configure-panel md:col-span-2 flex flex-col justify-between p-6 relative overflow-hidden transition-all duration-500 ${
                    runningSeverity ? `running-${runningSeverity}` : ''
                  }`}>
                    {/* Upgrade 7: Scoped Radar Background behind content */}
                    <div className="absolute inset-0 overflow-hidden rounded-[var(--radius-lg)] pointer-events-none z-0">
                      <RadarBackground 
                        isFixed={false} 
                        className={`transition-all duration-500 pointer-events-none ${
                          simStatus.running ? 'opacity-[0.06] radar-active' : 'opacity-[0.035]'
                        }`} 
                      />
                    </div>

                    <div className="relative z-10 space-y-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]/30 mb-4">
                          <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2 uppercase font-display leading-none">
                            <Sliders className="w-4 h-4 text-[var(--accent-amber)]" />
                            Configure Simulator Preset
                          </h3>
                          <span className="text-[8px] text-[var(--accent-amber)] font-mono tracking-wider border border-[var(--accent-amber)]/20 px-2 py-0.5 rounded bg-[var(--accent-amber-glow)]/5">
                            SYSTEM: LIVE
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mb-6 font-sans">Select threat replay scenario profile to inject test packets into the Cascade engine.</p>
                      </div>

                      <div>
                        <label className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-2.5">Select Scenario Preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                          {loadingScenarios || !scenarios ? (
                            Array.from({ length: 10 }).map((_, idx) => (
                              <div
                                key={idx}
                                className="animate-pulse bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)] rounded-[8px] h-[110px] p-3.5 flex flex-col justify-between"
                              >
                                <div className="flex justify-between items-center w-full">
                                  <div className="w-2 h-2 bg-slate-700 rounded-full" />
                                  <div className="w-4.5 h-4.5 bg-slate-700 rounded" />
                                </div>
                                <div className="space-y-1.5 w-full">
                                  <div className="w-16 h-2 bg-slate-700 rounded" />
                                  <div className="w-full h-1.5 bg-slate-700 rounded" />
                                </div>
                              </div>
                            ))
                          ) : (
                            Object.entries(scenarios).map(([key, info]) => {
                              const isSelected = selectedScenario === key;
                              const Icon = getScenarioIcon(key);
                              const details = SCENARIO_DETAILS[key] || SCENARIO_DETAILS.benign_baseline;
                              
                              const severityDotColor = 
                                info.severity_hint === 'Critical' ? 'bg-[var(--color-critical)]' :
                                info.severity_hint === 'High' ? 'bg-[var(--color-high)]' :
                                info.severity_hint === 'Medium' ? 'bg-[var(--color-medium)]' :
                                'bg-[var(--color-calm)]';
                                
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setSelectedScenario(key)}
                                  className="w-full text-left transition-all outline-none cursor-pointer select-none group relative"
                                >
                                  <div 
                                    className={`relative p-3 flex flex-col justify-between min-h-[110px] rounded-[8px] border transition-all duration-300 ${
                                      isSelected 
                                        ? 'bg-[var(--bg-panel-raised)] border-[var(--accent-amber)]' 
                                        : 'bg-[var(--bg-panel-raised)]/60 hover:bg-[var(--bg-panel-raised)] border-[var(--border-subtle)] hover:border-slate-500/80'
                                    }`}
                                    style={
                                      isSelected 
                                        ? { 
                                            borderColor: details.color, 
                                            boxShadow: `0 0 12px ${details.glow}`,
                                            animation: `border-glow-pulse-${details.severity.toLowerCase()} 2s ease-in-out infinite`
                                          } 
                                        : {}
                                    }
                                  >
                                    {/* ARMED OVERLAY ON TOP RIGHT */}
                                    {isSelected && (
                                      <span 
                                        className="absolute top-1 right-1.5 text-[7px] font-mono font-bold tracking-wider animate-[pulse-fast_1.5s_ease-in-out_infinite]"
                                        style={{ color: details.color }}
                                      >
                                        ARMED
                                      </span>
                                    )}

                                    {/* TOP ROW: Severity Dot (left) and Icon (right) */}
                                    <div className="flex justify-between items-center w-full">
                                      <span 
                                        className={`w-2 h-2 rounded-full ${severityDotColor}`}
                                        style={{
                                          animation: 
                                            info.severity_hint === 'Critical' 
                                              ? 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite' 
                                              : info.severity_hint === 'High' 
                                                ? 'pulse 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite' 
                                                : 'none'
                                        }}
                                        title={`Severity: ${info.severity_hint}`} 
                                      />
                                      <Icon 
                                        className={`w-5.5 h-5.5 transition-transform duration-300 group-hover:scale-[1.05]`} 
                                        style={{
                                          color: details.color,
                                          filter: isSelected ? `drop-shadow(0 0 6px ${details.color})` : 'none'
                                        }}
                                      />
                                    </div>

                                    {/* MIDDLE: Display name, wrapping allowed */}
                                    <div className="mt-2 w-full">
                                      <p className={`font-bold tracking-tight uppercase text-[9px] font-body leading-tight ${isSelected ? 'text-white font-extrabold' : 'text-slate-300'}`}>
                                        {info.display_name}
                                      </p>
                                    </div>

                                    {/* BOTTOM: Description and Severity Label chip */}
                                    <div className="flex items-end justify-between gap-1 mt-2.5 w-full">
                                      <span className="text-[11px] text-[var(--text-secondary)] block line-clamp-2 leading-tight pr-1 font-sans">
                                        {info.description}
                                      </span>
                                      <span 
                                        className="text-[6.5px] font-mono font-bold px-1.5 py-0.5 rounded border leading-none shrink-0" 
                                        style={{ color: details.color, borderColor: details.border, backgroundColor: details.bg }}
                                      >
                                        {info.severity_hint.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Upgrade 3: Attack Profile Preview Panel */}
                      <div className={`transition-all duration-300 ease-in-out overflow-hidden border border-[var(--border-subtle)]/45 rounded-[var(--radius-lg)] bg-[var(--bg-base)]/40 ${
                        selectedScenario 
                          ? 'max-h-[300px] opacity-100 p-4 mt-2' 
                          : 'max-h-[100px] opacity-90 p-4 mt-2'
                      }`}>
                        {!selectedScenario ? (
                          <div className="h-12 flex items-center justify-center text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-mono animate-pulse">
                            ← SELECT A SCENARIO TO VIEW ATTACK PROFILE
                          </div>
                        ) : (
                          (() => {
                            const info = SCENARIO_DETAILS[selectedScenario] || SCENARIO_DETAILS.benign_baseline;
                            const estPackets = simRate * simDuration;
                            const estDetections = selectedScenario === 'benign_baseline' 
                              ? Math.round(estPackets * 0.02) 
                              : Math.round(estPackets * 0.95);
                              
                            // Simulation intensity calculation
                            let intensityLabel = 'LOW';
                            let intensityWidth = '25%';
                            let intensityColor = 'bg-[var(--color-calm)]';
                            let intensityPulse = '';
                            if (simRate >= 31) {
                              intensityLabel = 'EXTREME';
                              intensityWidth = '100%';
                              intensityColor = 'bg-red-600';
                              intensityPulse = 'animate-pulse';
                            } else if (simRate >= 16) {
                              intensityLabel = 'HIGH';
                              intensityWidth = '85%';
                              intensityColor = 'bg-orange-500';
                            } else if (simRate >= 6) {
                              intensityLabel = 'MEDIUM';
                              intensityWidth = '60%';
                              intensityColor = 'bg-amber-500';
                            }

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs align-top">
                                {/* Left Half: Summary */}
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-bold uppercase tracking-wider font-display" style={{ color: info.color }}>
                                      {scenarios?.[selectedScenario]?.display_name || info.severity} Scenario Profile
                                    </h4>
                                    <span 
                                      className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded border leading-none"
                                      style={{ color: info.color, borderColor: info.border, backgroundColor: info.bg }}
                                    >
                                      {info.severity.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                    {scenarios?.[selectedScenario]?.description || 'Configuration profile preview.'}
                                  </p>
                                  
                                  {/* Data Chips Row */}
                                  <div className="flex flex-wrap gap-2 text-[9px] font-mono">
                                    <span className="px-2 py-0.5 bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/60 text-slate-300 rounded">
                                      SEVERITY: <span className="font-bold" style={{ color: info.color }}>{info.severity}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/60 text-slate-300 rounded">
                                      TYPE: <span className="text-white font-bold">{info.type}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/60 text-slate-300 rounded">
                                      EXPECTED TIER HIT: <span className="text-[var(--accent-amber)] font-bold">{info.tier}</span>
                                    </span>
                                  </div>
                                  
                                  <p className="text-[10px] text-slate-400 font-mono leading-snug border-l border-[var(--accent-amber)]/40 pl-2">
                                    <span className="text-[var(--accent-amber)] font-bold">THREAT VECTOR:</span> {info.vector}
                                  </p>
                                </div>

                                {/* Right Half: Estimated Readout */}
                                <div className="space-y-3 border-t md:border-t-0 md:border-l border-[var(--border-subtle)]/30 pt-3 md:pt-0 md:pl-6 flex flex-col justify-between">
                                  <div>
                                    <h4 className="text-[10.5px] font-mono font-bold text-white uppercase tracking-wider mb-2.5">
                                      Estimated Simulation Readout
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                                      <div className="bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/30 rounded p-1.5">
                                        <span className="text-[7.5px] text-[var(--text-secondary)] block uppercase">Est. Packets</span>
                                        <span className="text-xs text-white font-bold">{estPackets.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/30 rounded p-1.5">
                                        <span className="text-[7.5px] text-[var(--text-secondary)] block uppercase">Est. Alerts</span>
                                        <span className="text-xs text-[var(--color-critical)] font-bold">{estDetections.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)]/30 rounded p-1.5">
                                        <span className="text-[7.5px] text-[var(--text-secondary)] block uppercase">Est. Duration</span>
                                        <span className="text-xs text-white font-bold">{simDuration}s</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Intensity Bar */}
                                  <div className="space-y-1 mt-1">
                                    <div className="flex justify-between items-center text-[9px] font-mono">
                                      <span className="text-[var(--text-secondary)] uppercase">Simulation Intensity:</span>
                                      <span className="font-bold text-white uppercase">{intensityLabel}</span>
                                    </div>
                                    <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-[var(--border-subtle)]/30">
                                      <div 
                                        className={`h-full ${intensityColor} ${intensityPulse} rounded-full transition-all duration-300`} 
                                        style={{ width: intensityWidth }} 
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
                      <div className="h-[1px] bg-[var(--border-subtle)]/30 my-4" />

                      {/* Upgrade 4: Styled Tactical Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        {/* Rate Control Group */}
                        <div className="border-r border-[var(--border-subtle)]/30 pr-0 md:pr-6 space-y-3">
                          <div>
                            <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block leading-none">Stream Rate</span>
                            <span className="text-[8px] text-[var(--text-muted)] font-mono uppercase tracking-wider">packets / second</span>
                          </div>
                          
                          {/* Rate Presets */}
                          <div className="flex gap-2">
                            {[
                              { label: 'SLOW: 2', val: 2 },
                              { label: 'NORMAL: 5', val: 5 },
                              { label: 'FAST: 15', val: 15 },
                              { label: 'MAX: 30', val: 30 }
                            ].map((p) => (
                              <GlowButton
                                key={p.val}
                                type="button"
                                variant="ghost"
                                onClick={() => setSimRate(p.val)}
                                className={`px-2 py-1 text-[8.5px] font-mono leading-none border rounded transition-all ${
                                  simRate === p.val 
                                    ? '!text-[var(--accent-amber)] !border-[var(--accent-amber)] bg-[var(--accent-amber-glow)]/10' 
                                    : 'border-[var(--border-subtle)] text-slate-400'
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
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] p-2.5 text-xs text-white outline-none transition-all font-mono"
                          />
                        </div>

                        {/* Duration Control Group */}
                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block leading-none">Duration</span>
                            <span className="text-[8px] text-[var(--text-muted)] font-mono uppercase tracking-wider">seconds</span>
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
                                className={`px-2.5 py-1 text-[8.5px] font-mono leading-none border rounded transition-all ${
                                  simDuration === p.val 
                                    ? '!text-[var(--accent-amber)] !border-[var(--accent-amber)] bg-[var(--accent-amber-glow)]/10' 
                                    : 'border-[var(--border-subtle)] text-slate-400'
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
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] p-2.5 text-xs text-white outline-none transition-all font-mono"
                          />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-[1px] bg-[var(--border-subtle)]/30 my-4" />
                    </div>

                    {/* Action CTA Button */}
                    <div className="mt-6 z-10 relative">
                      {simStatus.running ? (
                        // RUNNING STATE: ABORT SIMULATION
                        <button
                          onClick={handleStopSim}
                          type="button"
                          className="relative w-full h-[52px] bg-red-950/40 border border-red-500 rounded-[var(--radius-md)] flex items-center justify-between px-5 cursor-pointer outline-none select-none overflow-hidden transition-all duration-300 text-xs animate-[pulse-bg-red_3s_ease-in-out_infinite]"
                        >
                          <div className="flex items-center gap-2 text-red-100 font-bold tracking-widest font-display">
                            <Square className="w-4 h-4 fill-red-100 animate-pulse" />
                            <span>ABORT SIMULATION</span>
                          </div>
                          <span className="font-mono text-[9px] text-red-200/80 bg-red-900/30 px-2 py-0.5 rounded border border-red-500/20 uppercase font-semibold">
                            [ {scenarios?.[selectedScenario]?.display_name || 'ATTACK'} STREAM ACTIVE ]
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
                          const labelText = isArmed ? `[ ${info?.display_name || 'ATTACK'} ARMED ]` : '[ SELECT SCENARIO ]';
                          
                          return (
                            <button
                              onClick={isArmed ? handleStartSim : undefined}
                              type="button"
                              disabled={!isArmed}
                              className={`group relative w-full h-[52px] rounded-[var(--radius-md)] flex items-center justify-between px-5 outline-none select-none overflow-hidden transition-all duration-300 text-xs border ${
                                isArmed 
                                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 border-amber-500/50 cursor-pointer hover:brightness-110 shadow-[0_0_12px_rgba(245,166,35,0.15)] text-white'
                                  : 'bg-slate-900 border-[var(--border-subtle)] cursor-not-allowed text-slate-500'
                              }`}
                            >
                              {/* Sweeping shimmer effect on hover */}
                              {isArmed && (
                                <div 
                                  className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_0.6s_ease-out]"
                                  style={{ backgroundSize: '200% 100%' }}
                                />
                              )}

                              <div className="flex items-center gap-2 font-bold tracking-widest font-display">
                                <Play 
                                  className={`w-4 h-4 fill-current`} 
                                  style={{
                                    transform: 'scale(1.0)',
                                    animation: isArmed ? 'pulse 2s ease-in-out infinite' : 'none'
                                  }}
                                />
                                <span>INITIATE SIMULATION</span>
                              </div>
                              
                              <span 
                                className={`font-mono text-[9px] px-2 py-0.5 rounded border uppercase font-semibold ${
                                  isArmed 
                                    ? 'text-amber-100 bg-amber-800/20 border-amber-400/20' 
                                    : 'text-red-400 bg-red-950/20 border-red-500/20'
                                }`}
                              >
                                {labelText}
                              </span>
                            </button>
                          );
                        })()
                      )}
                    </div>
                  </GlowPanel>

                  {/* Live Sim Telemetry Stats */}
                  <GlowPanel className="flex flex-col justify-between p-6">
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide mb-1 flex items-center gap-2 uppercase font-display">
                        <Activity className="w-4 h-4 text-[var(--accent-amber)] animate-pulse" />
                        Live Status Panel
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mb-6">Real-time telemetry — replayer task metrics</p>

                      <div className="space-y-4 text-xs font-mono">
                        <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2 items-center">
                          <span className="text-[var(--text-secondary)] font-sans">Status State:</span>
                          <span 
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold rounded-full border border-current/10"
                            style={{ color: stateColor.includes('amber') ? 'var(--accent-amber)' : stateColor.includes('emerald') ? 'rgb(52, 211, 153)' : 'rgba(148, 163, 184, 0.8)', backgroundColor: stateBg }}
                          >
                            <span className={`w-1 h-1 rounded-full ${stateDot}`} />
                            {stateText}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                          <span className="text-[var(--text-secondary)] font-sans">Preset Scenario:</span>
                          <span className="text-[var(--accent-amber)] font-bold uppercase font-mono text-[10.5px]">
                            {activeScenarioInfo?.display_name || '--'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                          <span className="text-[var(--text-secondary)] font-sans">Elapsed / Limit:</span>
                          <span className="text-slate-300 font-bold font-mono">{localElapsed}s / {simStatus.duration_seconds || '∞'}s</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                          <span className="text-[var(--text-secondary)] font-sans">Ingress Packets:</span>
                          <span className="text-white font-bold font-mono">{simStatus.packets_sent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                          <span className="text-[var(--text-secondary)] font-sans">Threat Alerts:</span>
                          <span className={`font-mono font-bold ${simStatus.attacks_detected > 0 ? 'text-[var(--color-critical)]' : 'text-slate-500'}`}>
                            {simStatus.attacks_detected.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Live Intensity Waveform Oscilloscope */}
                      <div className="my-4">
                        <span className="text-[8px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-1">
                          Detection Intensity — Last 20s
                        </span>
                        <div className="w-full bg-[var(--bg-base)]/60 border border-[var(--border-subtle)]/45 rounded p-1.5 h-[35px] flex items-center relative overflow-hidden">
                          <svg className="w-full h-full text-[var(--accent-amber)]" viewBox="0 0 300 25" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent-amber)" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="var(--accent-amber)" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path d={wavePaths.areaD} fill="url(#waveGrad)" stroke="none" />
                            <path d={wavePaths.lineD} fill="none" stroke="currentColor" strokeWidth="1.2" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-3 font-sans">
                        Cascade Tier Resolution
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {/* T-1 Block */}
                        <div className="bg-[var(--bg-panel-raised)] p-2.5 border border-[var(--border-subtle)]/65 rounded flex flex-col justify-between">
                          <span className="text-[6.5px] text-[var(--text-secondary)] block font-mono leading-none uppercase mb-1.5">T-1 Screener</span>
                          <p className="font-mono font-bold text-[var(--color-calm)] text-xs leading-none">{simStatus.tier_breakdown['1'] || 0}</p>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-[var(--color-calm)] rounded-full transition-all duration-300" style={{ width: `${t1Pct}%` }} />
                          </div>
                          <span className="text-[6px] text-slate-500 font-mono mt-1 leading-none">{Math.round(t1Pct)}%</span>
                        </div>
                        
                        {/* T-2 Block */}
                        <div className="bg-[var(--bg-panel-raised)] p-2.5 border border-[var(--border-subtle)]/65 rounded flex flex-col justify-between">
                          <span className="text-[6.5px] text-[var(--text-secondary)] block font-mono leading-none uppercase mb-1.5">T-2 Validator</span>
                          <p className="font-mono font-bold text-[var(--accent-amber)] text-xs leading-none">{simStatus.tier_breakdown['2'] || 0}</p>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-[var(--accent-amber)] rounded-full transition-all duration-300" style={{ width: `${t2Pct}%` }} />
                          </div>
                          <span className="text-[6px] text-slate-500 font-mono mt-1 leading-none">{Math.round(t2Pct)}%</span>
                        </div>
                        
                        {/* T-3 Block */}
                        <div className="bg-[var(--bg-panel-raised)] p-2.5 border border-[var(--border-subtle)]/65 rounded flex flex-col justify-between">
                          <span className="text-[6.5px] text-[var(--text-secondary)] block font-mono leading-none uppercase mb-1.5">T-3 Arbiter</span>
                          <p className="font-mono font-bold text-[#A78BFA] text-xs leading-none">{simStatus.tier_breakdown['3'] || 0}</p>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-[#A78BFA] rounded-full transition-all duration-300" style={{ width: `${t3Pct}%` }} />
                          </div>
                          <span className="text-[6px] text-slate-500 font-mono mt-1 leading-none">{Math.round(t3Pct)}%</span>
                        </div>
                      </div>

                      <span className="text-[7.5px] text-[var(--text-secondary)] leading-relaxed block mt-2.5 text-center border-t border-[var(--border-subtle)]/20 pt-2.5 font-sans italic">
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
              <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 flex flex-col lg:flex-row items-center justify-between gap-4 shrink-0">
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full sm:w-44">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter Attack Label..."
                      value={filterAttack}
                      onChange={(e) => { setFilterAttack(e.target.value); setHistoryPage(1); }}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 outline-none transition-all"
                    />
                  </div>

                  <div className="relative w-full sm:w-36">
                    <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <select
                      value={filterTier}
                      onChange={(e) => { setFilterTier(e.target.value); setHistoryPage(1); }}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] py-2 pl-9 pr-4 text-xs text-slate-400 outline-none cursor-pointer transition-all"
                    >
                      <option value="" className="bg-[var(--bg-panel)] text-white">All Tiers</option>
                      <option value="1" className="bg-[var(--bg-panel)] text-white">Tier 1 (LGBM)</option>
                      <option value="2" className="bg-[var(--bg-panel)] text-white">Tier 2 (RF)</option>
                      <option value="3" className="bg-[var(--bg-panel)] text-white">Tier 3 (Vote)</option>
                    </select>
                  </div>

                  <div className="relative w-full sm:w-36 flex items-center bg-[var(--bg-base)] border border-[var(--border-subtle)] focus-within:border-[var(--accent-amber)] focus-within:ring-1 focus-within:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] px-3 py-1.5 gap-2 text-xs transition-all">
                    <span className="text-slate-500 font-mono text-[9px] uppercase">From</span>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => { setFilterDateFrom(e.target.value); setHistoryPage(1); }}
                      className="bg-transparent text-slate-300 outline-none w-full text-xs cursor-pointer filter-date-picker font-mono"
                    />
                  </div>

                  <div className="relative w-full sm:w-36 flex items-center bg-[var(--bg-base)] border border-[var(--border-subtle)] focus-within:border-[var(--accent-amber)] focus-within:ring-1 focus-within:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] px-3 py-1.5 gap-2 text-xs transition-all">
                    <span className="text-slate-500 font-mono text-[9px] uppercase">To</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => { setFilterDateTo(e.target.value); setHistoryPage(1); }}
                      className="bg-transparent text-slate-300 outline-none w-full text-xs cursor-pointer filter-date-picker font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <GlowButton
                      onClick={() => handleExportReport('pdf')}
                      variant="primary"
                      className="py-1.5 px-3 text-[10px] font-bold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF Report
                    </GlowButton>
                    <GlowButton
                      onClick={() => handleExportReport('csv')}
                      variant="secondary"
                      className="py-1.5 px-3 text-[10px] font-bold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV Report
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
                  <span className="text-xs text-slate-400 font-mono px-2">Page {historyPage}</span>
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

              {/* Data Table */}
              <GlowPanel className="flex-1 overflow-hidden flex flex-col p-5">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full border-collapse text-left text-xs text-slate-300">
                    <thead className="bg-[var(--bg-base)] sticky top-0 font-bold border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="p-4">ID</th>
                        <th className="p-4">Timestamp (UTC)</th>
                        <th className="p-4">Label</th>
                        <th className="p-4">Severity</th>
                        <th className="p-4">Confidence</th>
                        <th className="p-4">Escalation Tier</th>
                        <th className="p-4">Source Scenario</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/30">
                      {loadingHistory ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500 font-mono text-[10px]">
                            Loading alert records...
                          </td>
                        </tr>
                      ) : alerts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-500 font-mono text-[10px]">
                            No persistent alerts found matching filter criteria.
                          </td>
                        </tr>
                      ) : (
                        alerts.map((alert) => {
                          const isExpanded = expandedAlertId === alert.id;
                          return (
                            <React.Fragment key={alert.id}>
                              <tr 
                                onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                                className={`hover:bg-slate-800/25 transition-colors cursor-pointer border-b border-[var(--border-subtle)]/20 ${
                                  isExpanded ? 'bg-[var(--bg-panel-raised)]/20' : ''
                                }`}
                              >
                                <td className="p-4 font-mono font-bold text-slate-400">#{alert.id}</td>
                                <td className="p-4 text-slate-400 font-mono text-[10px]">
                                  {new Date(alert.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                                </td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 border rounded-md font-semibold font-mono text-[9px] ${
                                    alert.predicted_label !== 'BENIGN' 
                                      ? 'bg-red-950/20 border-red-500/20 text-[var(--color-critical)]'
                                      : 'bg-teal-950/20 border-teal-500/20 text-[var(--color-calm)]'
                                  }`}>
                                    {alert.predicted_label}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <StatusBadge status={alert.severity || (alert.predicted_label === 'BENIGN' ? 'Info' : 'High')} />
                                </td>
                                <td className="p-4 font-semibold text-slate-200 font-mono">{(alert.confidence).toFixed(4)}</td>
                                <td className="p-4 text-slate-400">
                                  Tier {alert.tier}
                                </td>
                                <td className="p-4 text-slate-400 font-mono text-[10px]">{alert.source_scenario}</td>
                                <td className="p-4 text-right">
                                  <button
                                    type="button"
                                    className="text-[var(--accent-amber)] hover:text-white font-bold font-mono text-[10px] uppercase cursor-pointer"
                                  >
                                    {isExpanded ? 'Hide' : 'Inspect'}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-[var(--bg-panel-raised)]/30">
                                  <td colSpan={8} className="p-5 border-b border-[var(--border-subtle)]/20">
                                    <div className="animate-fade-in space-y-3">
                                      <div className="flex justify-between items-center border-b border-[var(--border-subtle)]/40 pb-2">
                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider font-display">Raw Flow Feature Snapshot</span>
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
                                                impact: 0.1
                                              }))
                                            });
                                          }}
                                          className="text-[10px] uppercase font-bold text-[var(--accent-amber)] hover:text-white transition-colors cursor-pointer font-mono"
                                        >
                                          [ EXPLAIN VERDICT ]
                                        </button>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--bg-base)] p-4 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]/50 text-[10px] font-mono max-h-[220px] overflow-y-auto">
                                        {Object.entries(alert.raw_features || {}).map(([key, val]) => (
                                          <div key={key} className="flex justify-between items-center border-b border-[var(--border-subtle)]/10 pb-1.5 px-1 truncate">
                                            <span className="text-slate-500 mr-2 shrink-0">{key}:</span>
                                            <span className="text-[var(--accent-amber)] font-bold truncate">{String(val)}</span>
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
                  <div className="flex flex-col items-center gap-3 font-mono">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <span className="absolute w-8 h-8 rounded-full bg-[var(--accent-amber)] opacity-20 animate-ping"></span>
                      <span className="absolute w-5 h-5 rounded-full bg-[var(--accent-amber)] opacity-40 animate-pulse"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-amber)]"></span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">Retrieving trained evaluation benchmarks...</p>
                  </div>
                </GlowPanel>
              )}

              {!loadingMetrics && !metricsData && (
                <GlowPanel className="p-8 flex items-center justify-center">
                  <div className="text-center text-[var(--text-secondary)] text-xs font-mono">
                    Failed to load evaluation metrics. Ensure models are trained and server is running.
                  </div>
                </GlowPanel>
              )}

              {!loadingMetrics && metricsData && (
                <>
                  {/* Top Row: Diagram + Rationale Explanation */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    <GlowPanel className="lg:col-span-3 p-5">
                      <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5">
                        <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">AI Cascade Decision logic</h3>
                      </div>
                      <div className="flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-[10px] text-[var(--text-secondary)]">
                        <div className="p-4 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-lg text-center flex-1 w-full md:w-auto">
                          <p className="font-bold text-slate-200 mb-1">Incoming Flow Packet</p>
                          <span>Extracts top-30 select features</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-700 hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--bg-base)] border border-[var(--accent-amber)]/20 rounded-lg text-center flex-1 w-full md:w-auto shadow-md shadow-[var(--accent-amber-glow)]/5">
                          <p className="font-bold text-[var(--accent-amber)] mb-1">Tier 1: LightGBM</p>
                          <span>Is Max Conf &gt;= 0.85?</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-700 hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--bg-base)] border border-[var(--accent-amber)]/20 rounded-lg text-center flex-1 w-full md:w-auto shadow-md shadow-[var(--accent-amber-glow)]/5">
                          <p className="font-bold text-[var(--accent-amber)] mb-1">Tier 2: Random Forest</p>
                          <span>Is Max Conf &gt;= 0.85?</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-700 hidden md:block shrink-0" />
                        <div className="p-4 bg-[var(--bg-base)] border border-[var(--color-calm)]/20 rounded-lg text-center flex-1 w-full md:w-auto shadow-md shadow-[var(--color-calm)]/5">
                          <p className="font-bold text-[var(--color-calm)] mb-1">Tier 3: Expert Ensemble</p>
                          <span>Weighted Prob ArgMax Vote</span>
                        </div>
                      </div>
                    </GlowPanel>

                    <GlowPanel className="lg:col-span-2 p-5 flex flex-col justify-between">
                      <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-3">
                        <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Why a Cascade?</h3>
                      </div>
                      <div className="flex-1 flex flex-col justify-center">
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] font-sans">
                          To handle volumetric traffic, our pipeline cascades decisions through three models. This maximizes accuracy and speed while minimizing resource costs.
                        </p>
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] mt-2 font-sans">
                          <strong>Tier 1 (LightGBM)</strong> screens all incoming traffic. If confidence is high (<strong>&ge; 85%</strong>), the decision is finalized instantly. 
                          If uncertain, the packet escalates to <strong>Tier 2 (Random Forest)</strong>. If uncertainty persists, the <strong>Tier 3 Ensemble (XGBoost + T1 + T2)</strong> makes the final verdict using a weighted vote.
                        </p>
                      </div>
                    </GlowPanel>
                  </div>

                  {/* Benchmarks Metrics Comparison */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    {/* 3-Model Comparison Table */}
                    <GlowPanel className="lg:col-span-3 flex flex-col p-5">
                      <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Trained Model Performance Comparison</h3>
                        <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">Stratified test split validation</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse text-slate-300">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider text-[9px]">
                              <th className="py-2.5 px-3">Classifier Model</th>
                              <th className="py-2.5 px-3 text-right">Accuracy</th>
                              <th className="py-2.5 px-3 text-right">Macro F1</th>
                              <th className="py-2.5 px-3 text-right">Avg Latency</th>
                              <th className="py-2.5 px-3 text-right">Train Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]/20 font-mono text-[10px]">
                            {getComparisonData().map((row) => (
                              <tr key={row.name} className="hover:bg-slate-800/10">
                                <td className="py-3 px-3 font-sans font-bold text-slate-200">{row.name}</td>
                                <td className="py-3 px-3 text-right text-[var(--color-calm)] font-semibold">{row.accuracy.toFixed(3)}%</td>
                                <td className="py-3 px-3 text-right text-[var(--accent-amber)] font-semibold">{row.macro_f1.toFixed(3)}%</td>
                                <td className="py-3 px-3 text-right text-[var(--color-medium)] font-semibold">{(row.avg_latency * 1000).toFixed(2)} μs</td>
                                <td className="py-3 px-3 text-right text-[var(--text-secondary)]">{row.training_time.toFixed(1)}s</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[8.5px] text-[var(--text-muted)] mt-4 leading-normal font-mono">
                        * Latency counts capture mean inference cycles per sample on hardware. Performance benchmarks are updated dynamically when models are retrained.
                      </p>
                    </GlowPanel>

                    {/* Order Explanation Panel */}
                    <GlowPanel className="lg:col-span-2 flex flex-col justify-between p-5">
                      <div>
                        <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-4">
                          <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Cascade Order Rationale</h3>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <span className="text-[9px] font-bold text-[var(--accent-amber)] uppercase tracking-wider font-display block">1. Tier 1: LightGBM (Screener)</span>
                            <p className="text-[10.5px] leading-relaxed text-[var(--text-secondary)] mt-1 font-sans">
                              Selected for highest overall accuracy (99.472%). Handles the clear majority of classification decisions with strong confidence, escalating only uncertain cases to Tier 2 to preserve system reliability.
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-[var(--accent-amber)] uppercase tracking-wider font-display block">2. Tier 2: Random Forest (Validator)</span>
                            <p className="text-[10.5px] leading-relaxed text-[var(--text-secondary)] mt-1 font-sans">
                              Queried only on LightGBM uncertainty. Fastest model at inference (2.88 μs) and highly explainable — drives the local XAI feature attributions shown in the Explain This Packet panel.
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-[var(--color-calm)] uppercase tracking-wider font-display block">3. Tier 3: XGBoost (Vote Arbiter)</span>
                            <p className="text-[10.5px] leading-relaxed text-[var(--text-secondary)] mt-1 font-sans">
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
                      <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Confusion Matrix Heatmap</h3>
                          <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">Actual vs Predicted class flows</span>
                        </div>
                        
                        {/* Selector Buttons */}
                        <div className="flex gap-1.5 bg-[var(--bg-base)] p-1 rounded-lg border border-[var(--border-subtle)]">
                          {(['lightgbm', 'random_forest', 'xgboost'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => { setSelectedCMModel(m); setHoveredCMCell(null); }}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-bold font-mono tracking-wide uppercase transition-all cursor-pointer ${
                                selectedCMModel === m
                                  ? 'bg-[var(--accent-amber-glow)] border border-[var(--accent-amber)] text-[var(--accent-amber)]'
                                  : 'text-slate-500 hover:text-slate-355 border border-transparent'
                              }`}
                            >
                              {m === 'lightgbm' ? 'LGBM' : m === 'random_forest' ? 'RF' : 'XGB'}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {renderConfusionMatrix(selectedCMModel)}
                    </GlowPanel>

                    {/* RF Feature Importances Bar Chart */}
                    <GlowPanel className="lg:col-span-2 flex flex-col justify-between p-5">
                      <div>
                        <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5 flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">RF Feature Importances</h3>
                            <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">Top random forest global weights</span>
                          </div>
                          
                          {/* Toggle features count */}
                          <div className="flex gap-1 bg-[var(--bg-base)] p-1 rounded-lg border border-[var(--border-subtle)]">
                            {[10, 20].map((num) => (
                              <button
                                key={num}
                                onClick={() => setNumFeaturesToShow(num)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold font-mono transition-all cursor-pointer ${
                                  numFeaturesToShow === num
                                    ? 'bg-[var(--accent-amber-glow)] border border-[var(--accent-amber)] text-[var(--accent-amber)]'
                                    : 'text-slate-500 hover:text-slate-350 border border-transparent'
                                }`}
                              >
                                Top {num}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Chart Render container */}
                        <div className="relative w-full h-[320px] mt-2 shrink-0">
                          <ResponsiveContainer width="99%" height="100%">
                            <BarChart
                              data={(metricsData?.feature_importances || []).slice(0, numFeaturesToShow)}
                              layout="vertical"
                              margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 166, 35, 0.05)" opacity={0.3} />
                              <XAxis type="number" stroke="var(--text-secondary)" fontSize={8} />
                              <YAxis type="category" dataKey="feature" stroke="var(--text-secondary)" fontSize={7.5} width={120} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'var(--bg-panel-raised)',
                                  borderColor: 'var(--border-subtle)',
                                  borderRadius: '6px',
                                  fontSize: 10,
                                  color: 'white'
                                }}
                              />
                              <Bar dataKey="importance" name="Global weight" fill="var(--accent-amber)" radius={[0, 4, 4, 0]} barSize={numFeaturesToShow === 10 ? 12 : 6} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </GlowPanel>
                  </div>

                    {/* SMOTE Class Balancing Analysis */}
                    {smoteData && (
                      <div className="lg:col-span-5 grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0 mt-2">
                        <GlowPanel className="p-5 flex flex-col justify-between">
                          <div>
                            <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5">
                              <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Class Distribution Before SMOTE</h3>
                              <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">Severe class imbalance (Raw training set proportions)</span>
                            </div>
                            <div className="relative w-full h-[340px] mt-2 shrink-0">
                              <ResponsiveContainer width="99%" height="100%">
                                <BarChart
                                  data={getSmoteChartData()}
                                  layout="vertical"
                                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 166, 35, 0.05)" opacity={0.3} />
                                  <XAxis type="number" stroke="var(--text-secondary)" fontSize={8} />
                                  <YAxis type="category" dataKey="class" stroke="var(--text-secondary)" fontSize={7.5} width={110} />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: 'var(--bg-panel-raised)',
                                      borderColor: 'var(--border-subtle)',
                                      borderRadius: '6px',
                                      fontSize: 10,
                                      color: 'white'
                                    }}
                                    formatter={(value: any) => [Number(value).toLocaleString(), "Samples"]}
                                  />
                                  <Bar dataKey="Before SMOTE" fill="var(--color-critical)" radius={[0, 4, 4, 0]} barSize={8} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </GlowPanel>

                        {/* After SMOTE */}
                        <GlowPanel className="p-5 flex flex-col justify-between">
                          <div>
                            <div className="pb-3 border-b border-[var(--border-subtle)]/40 mb-5">
                              <h3 className="text-xs font-bold text-white tracking-wide uppercase font-display">Class Distribution After SMOTE</h3>
                              <span className="text-[8px] font-mono text-[var(--text-secondary)] uppercase">Oversampled synthetic balance (SMOTE synthesized training set)</span>
                            </div>
                            <div className="relative w-full h-[340px] mt-2 shrink-0">
                              <ResponsiveContainer width="99%" height="100%">
                                <BarChart
                                  data={getSmoteChartData()}
                                  layout="vertical"
                                  margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(245, 166, 35, 0.05)" opacity={0.3} />
                                  <XAxis type="number" stroke="var(--text-secondary)" fontSize={8} />
                                  <YAxis type="category" dataKey="class" stroke="var(--text-secondary)" fontSize={7.5} width={110} />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: 'var(--bg-panel-raised)',
                                      borderColor: 'var(--border-subtle)',
                                      borderRadius: '6px',
                                      fontSize: 10,
                                      color: 'white'
                                    }}
                                    formatter={(value: any) => [Number(value).toLocaleString(), "Samples"]}
                                  />
                                  <Bar dataKey="After SMOTE" fill="var(--color-calm)" radius={[0, 4, 4, 0]} barSize={8} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </GlowPanel>
                      </div>
                    )}

                    </>
                  )}
                </div>
              )}

          {/* ==========================================
              VIEW E: AI SECURITY CHAT ASSISTANT
              ========================================== */}
          {activeTab === 'ai' && (
            <div className="flex flex-col gap-6 max-w-5xl mx-auto h-[calc(100vh-190px)] relative w-full" style={{ boxShadow: '0 0 30px rgba(245,166,35,0.04)' }}>
              <GlowPanel className="flex-1 flex flex-col overflow-hidden p-0 relative">
                {/* Chat header */}
                <div className="px-6 py-4 bg-[var(--bg-panel-raised)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 z-10">
                  <div className="flex items-center gap-3">
                    <Radio 
                      className="w-5 h-5 text-[var(--accent-amber)]" 
                      style={{ animation: 'icon-pulse-slow 3s ease-in-out infinite' }}
                    />
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-widest uppercase font-display leading-none mb-0.5">
                        SENTINEL AI
                      </h4>
                      <span className="text-[9px] text-[var(--text-secondary)] block leading-none font-sans">
                        Intelligent Security Analyst Assistant
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2.5">
                    {/* RULE-BASE Badge */}
                    <span 
                      style={{ color: 'var(--color-calm)', backgroundColor: 'rgba(45, 212, 191, 0.12)' }}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10 select-none"
                    >
                      <span className="text-[10px] leading-none">⚡</span>
                      RULE-BASE: ACTIVE
                    </span>
                    
                    {/* Divider */}
                    <div className="h-4 w-[1px] bg-[var(--border-subtle)]/45" />

                    {/* GEMINI Badge */}
                    {geminiAvailable ? (
                      <span 
                        style={{ color: 'var(--accent-amber)', backgroundColor: 'rgba(245, 166, 35, 0.12)' }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10 select-none"
                      >
                        <span className="text-[10px] leading-none">✦</span>
                        GEMINI: CONNECTED
                      </span>
                    ) : (
                      <span 
                        style={{ color: 'var(--text-secondary)', backgroundColor: 'rgba(148, 163, 184, 0.08)' }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10 select-none"
                      >
                        <span className="text-[10px] leading-none text-slate-500">✦</span>
                        GEMINI: UNAVAILABLE
                      </span>
                    )}
                  </div>
                </div>

                {/* Message Log */}
                <div 
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="chat-history-container flex-1 overflow-y-auto p-6 bg-[var(--bg-base)] relative overflow-hidden flex flex-col"
                  style={{ boxShadow: 'inset 0 8px 16px rgba(0, 0, 0, 0.45), inset 0 -8px 16px rgba(0, 0, 0, 0.45)' }}
                >
                  <RadarBackground isFixed={false} className="opacity-[0.035]" />
                  
                  <style dangerouslySetInnerHTML={{ __html: `
                    .chat-history-container {
                      scrollbar-width: thin;
                      scrollbar-color: rgba(245, 166, 35, 0.3) transparent;
                    }
                    .chat-history-container::-webkit-scrollbar {
                      width: 4px;
                    }
                    .chat-history-container::-webkit-scrollbar-track {
                      background: transparent;
                    }
                    .chat-history-container::-webkit-scrollbar-thumb {
                      background: rgba(245, 166, 35, 0.3);
                      border-radius: 2px;
                    }
                    .chat-history-container::-webkit-scrollbar-thumb:hover {
                      background: rgba(245, 166, 35, 0.6);
                    }
                    .chat-history-container svg g {
                      animation: radar-sweep 15s linear infinite !important;
                    }
                    @keyframes typing-bounce {
                      0%, 100% { transform: translateY(0); }
                      50% { transform: translateY(-6px); }
                    }
                    .typing-dot {
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background-color: var(--accent-amber);
                      display: inline-block;
                      animation: typing-bounce 1.2s infinite ease-in-out;
                    }
                    .typing-dot:nth-child(1) { animation-delay: 0s; }
                    .typing-dot:nth-child(2) { animation-delay: 0.15s; }
                    .typing-dot:nth-child(3) { animation-delay: 0.3s; }
                    
                    @keyframes icon-pulse-slow {
                      0%, 100% { transform: scale(1.0); }
                      50% { transform: scale(1.05); }
                    }
                    @keyframes opacity-pulse-slow {
                      0%, 100% { opacity: 0.45; }
                      50% { opacity: 0.95; }
                    }
                    @keyframes radar-spin-tiny {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                  `}} />

                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto relative z-10 animate-fade-in my-auto select-none">
                      {/* 56px Avatar spinning slowly */}
                      <div className="w-14 h-14 rounded-full bg-[var(--bg-panel-raised)] border border-[var(--accent-amber)] flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(245,166,35,0.15)]">
                        <Activity 
                          className="w-7 h-7 text-[var(--accent-amber)]" 
                          style={{ animation: 'spin-slow 8s linear infinite' }}
                        />
                      </div>
                      
                      <h2 className="text-xl font-bold text-white tracking-widest uppercase font-display mb-1">
                        SENTINEL AI
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-4 font-body">
                        Cybersecurity Intelligence — Always On Scope
                      </p>
                      
                      <div className="w-24 h-[1px] bg-[var(--border-subtle)]/40 mb-6 mx-auto" />
                      
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
                            variant="ghost"
                            onClick={() => sendChatMessage(q)}
                            className="px-3.5 py-2.5 text-[9.5px] font-sans text-left transition-all leading-normal flex items-center"
                          >
                            {q}
                          </GlowButton>
                        ))}
                      </div>
                      
                      <span 
                        className="text-[8.5px] text-[var(--text-secondary)] font-mono tracking-widest uppercase block"
                        style={{ animation: 'opacity-pulse-slow 2s ease-in-out infinite' }}
                      >
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
                                style={{ 
                                  backgroundColor: 'rgba(245, 166, 35, 0.08)', 
                                  borderColor: 'rgba(245, 166, 35, 0.25)',
                                  borderRadius: '12px 4px 12px 12px',
                                  boxShadow: '0 0 12px rgba(245, 166, 35, 0.05)',
                                  padding: '12px 14px'
                                }}
                                className="border text-[var(--text-primary)] text-xs leading-relaxed w-full font-body animate-fade-in flex flex-col gap-1.5"
                              >
                                <span className="text-[7.5px] text-[var(--text-secondary)] font-mono uppercase tracking-wider block text-left leading-none font-bold">
                                  YOU
                                </span>
                                <div>{msg.text}</div>
                                <span className="text-[7.5px] text-[var(--text-secondary)] font-mono tracking-wider block text-right mt-0.5 leading-none">
                                  {msg.time}
                                </span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-7 h-7 rounded-full bg-[var(--bg-panel-raised)] border border-[var(--accent-amber)]/60 flex items-center justify-center shrink-0">
                                    <Activity className="w-3.5 h-3.5 text-[var(--accent-amber)] animate-pulse" />
                                  </div>
                                  <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider font-mono">
                                    SENTINEL AI
                                  </span>
                                </div>

                                <div 
                                  style={{ 
                                    padding: '14px 16px',
                                    borderLeft: '3px solid rgba(245, 166, 35, 0.4)',
                                    borderRadius: '4px 12px 12px 12px'
                                  }}
                                  className={`relative bg-[var(--bg-panel-raised)] border ${
                                    msg.isError ? 'border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]' : 'border-[var(--border-subtle)]'
                                  } text-[var(--text-primary)] text-xs leading-relaxed w-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] animate-fade-in flex flex-col gap-2.5`}
                                >
                                  <div className="font-body whitespace-pre-wrap">{msg.text}</div>
                                  
                                  {(msg.source || msg.responseTime || msg.time) && (
                                    <div className="pt-2 border-t border-[var(--border-subtle)]/30 flex items-center justify-between gap-2 mt-1">
                                      <div className="flex items-center">
                                        {msg.source && (
                                          msg.source.toLowerCase().includes('gemini') ? (
                                            <span 
                                              style={{ color: 'var(--accent-amber)', backgroundColor: 'rgba(245, 166, 35, 0.12)' }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10 select-none"
                                            >
                                              ✦ GEMINI
                                            </span>
                                          ) : (
                                            <span 
                                              style={{ color: 'var(--color-calm)', backgroundColor: 'rgba(45, 212, 191, 0.12)' }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-full border border-current/10 select-none"
                                            >
                                              ⚡ RULE-BASE
                                            </span>
                                          )
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center gap-3">
                                        {msg.responseTime && (
                                          <span className="text-[9px] text-[var(--text-secondary)] font-mono">
                                            {msg.responseTime}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-[var(--text-secondary)] font-mono tracking-wider">
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
                        <div className="w-7 h-7 rounded-full bg-[var(--bg-panel-raised)] border border-[var(--accent-amber)]/60 flex items-center justify-center shrink-0">
                          <Activity className="w-3.5 h-3.5 text-[var(--accent-amber)] animate-pulse" />
                        </div>
                        <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider font-mono">
                          SENTINEL AI
                        </span>
                      </div>

                      <div 
                        style={{ 
                          padding: '14px 16px',
                          borderLeft: '3px solid rgba(245, 166, 35, 0.4)',
                          borderRadius: '4px 12px 12px 12px'
                        }}
                        className="relative bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs leading-relaxed w-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] animate-fade-in flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-1.5 h-4">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                        
                        <div className="pt-2 border-t border-[var(--border-subtle)]/30 flex items-center justify-between mt-1">
                          <span className="text-[8px] font-mono font-bold text-[var(--accent-amber)] flex items-center gap-1">
                            ● PROCESSING...
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
                  className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center gap-3 shrink-0 relative z-10"
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
                      placeholder="Ask SENTINEL AI..."
                      style={{ 
                        borderLeft: inputFocused ? '3px solid rgba(245, 166, 35, 0.6)' : '3px solid rgba(245, 166, 35, 0.2)' 
                      }}
                      className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] px-4 py-3 text-xs text-white outline-none placeholder-[var(--text-muted)] transition-all font-sans"
                    />
                  </div>
                  
                  <span 
                    className="text-[9px] text-[var(--text-secondary)] font-mono transition-opacity duration-200 shrink-0 font-semibold"
                    style={{ opacity: inputFocused ? 1 : 0 }}
                  >
                    Enter ↵ to send
                  </span>
                  
                  <button
                    type="submit"
                    disabled={!chatInput.trim()}
                    className={`group relative overflow-hidden px-5 py-3 text-xs font-bold font-sans uppercase tracking-wider min-w-[90px] flex items-center justify-center gap-1.5 shrink-0 rounded-[var(--radius-sm)] transition-all duration-200 active:scale-95 border ${
                      chatInput.trim()
                        ? 'bg-gradient-to-r from-amber-600 to-amber-500 border-amber-500/50 cursor-pointer text-white shadow-[0_0_8px_rgba(245,166,35,0.15)]'
                        : 'bg-slate-900 border-[var(--border-subtle)] cursor-not-allowed text-slate-500'
                    }`}
                  >
                    {chatInput.trim() && (
                      <div 
                        className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_0.4s_ease-out]"
                        style={{ backgroundSize: '200% 100%' }}
                      />
                    )}
                    <Send className="w-3.5 h-3.5" />
                    <span>SEND</span>
                  </button>
                </form>
              </GlowPanel>
            </div>
          )}

        </section>
      </main>

      {/* ==========================================
          XAI EXPLAIN THE PACKET MODAL DIALOG
          ========================================== */}
      {selectedDetection && (() => {
        const RADAR_FEATURES = [
          { name: 'Init Fwd Win', key: 'Init_Win_bytes_forward', max: 65535 },
          { name: 'Init Bwd Win', key: 'Init_Win_bytes_backward', max: 65535 },
          { name: 'Max Bwd Pkt', key: 'Bwd Packet Length Max', max: 2000 },
          { name: 'Max Fwd Pkt', key: 'Fwd Packet Length Max', max: 2000 },
          { name: 'Avg Pkt Size', key: 'Average Packet Size', max: 1500 },
          { name: 'Pkt Var', key: 'Packet Length Variance', max: 500000 },
          { name: 'Total Fwd Len', key: 'Total Length of Fwd Packets', max: 10000 },
          { name: 'Bwd Pkts/s', key: 'Bwd Packets/s', max: 5000 }
        ];

        const radarData = RADAR_FEATURES.map(f => {
          const rawVal = selectedDetection.raw_features?.[f.key] ?? 0.0;
          const benignAvg = selectedDetection.benign_averages?.[f.key] ?? 0.0;
          const normAttack = Math.min(1.0, Math.max(0.0, rawVal / f.max));
          const normBenign = Math.min(1.0, Math.max(0.0, benignAvg / f.max));
          return {
            subject: f.name,
            "This Attack": parseFloat(normAttack.toFixed(3)),
            "Normal Baseline": parseFloat(normBenign.toFixed(3))
          };
        });

        return (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl p-6 relative shadow-2xl animate-scaleUp">
              
              {/* Modal header */}
              <div className="pb-4 border-b border-slate-800/60 flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-white">Explain This Packet</h3>
                </div>
                <button
                  onClick={() => setSelectedDetection(null)}
                  aria-label="Close attribution explanation modal"
                  title="Close modal"
                  className="p-1 text-slate-500 hover:text-slate-300 hover:bg-[var(--bg-panel-raised)] border border-transparent rounded-[var(--radius-sm)] cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)]"
                >
                  ✕
                </button>
              </div>

              {/* 2-Column layout grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* LEFT COLUMN: VERDICTS & RADAR SIGNATURE */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-[var(--radius-md)]">
                      <span className="text-[9px] text-slate-500 font-bold block mb-1">Classification Verdict</span>
                      <span className={`px-2 py-0.5 border rounded font-semibold uppercase text-[9px] ${
                        selectedDetection.predicted_label.toUpperCase() !== 'BENIGN'
                          ? 'bg-red-950/20 border-red-500/20 text-[var(--color-critical)]'
                          : 'bg-teal-950/20 border-teal-500/20 text-[var(--color-calm)]'
                      }`}>
                        {selectedDetection.predicted_label}
                      </span>
                    </div>
                    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-[var(--radius-md)]">
                      <span className="text-[9px] text-slate-500 font-bold block mb-1">Confidence Score</span>
                      <span className="text-white font-bold">{(selectedDetection.confidence * 100).toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-[var(--radius-md)] text-xs">
                    <span className="text-[9px] text-slate-500 font-bold block mb-1">Deciding ML Classifier Tier</span>
                    <span className="text-slate-300 font-semibold">{selectedDetection.tier_name}</span>
                  </div>

                  {/* Attack DNA Radar Chart Container */}
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-4 rounded-[var(--radius-md)] flex flex-col items-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block self-start mb-2 font-display">Threat DNA Signature (Normalized 0-1)</span>
                    <div className="w-full h-[220px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                          <PolarGrid stroke="#1e293b" opacity={0.6} />
                          <PolarAngleAxis dataKey="subject" stroke="#94a3b8" fontSize={8} />
                          <PolarRadiusAxis angle={30} domain={[0, 1.0]} stroke="#475569" fontSize={7} tickCount={3} />
                          <Radar name="This Attack" dataKey="This Attack" stroke="var(--accent-amber)" fill="var(--accent-amber)" fillOpacity={0.25} />
                          <Radar name="Normal Baseline" dataKey="Normal Baseline" stroke="#334155" fill="#1e293b" fillOpacity={0.15} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: 10 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex gap-4 mt-1 text-[9px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-[var(--accent-amber-glow)] border border-[var(--accent-amber)] rounded animate-pulse"></span>
                        <span className="text-[var(--accent-amber)] font-bold">This Flow</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-slate-800/30 border border-slate-700 rounded"></span>
                        <span className="text-slate-400">Normal Baseline</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: ATTRIBUTIONS & NATURAL LANGUAGE */}
                <div className="space-y-4 flex flex-col justify-between">
                  {/* Feature Impact comparisons bar charts */}
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-3 font-display">Top Attributing Features (This vs Benign Avg)</span>
                    <div className="space-y-2.5">
                      {selectedDetection.top_features.map((feat, idx) => {
                        const val = feat.value;
                        const benignAvg = feat.benign_avg ?? 0.0;
                        const maxVal = Math.max(val, benignAvg) || 1.0;
                        const valPct = (val / maxVal) * 100;
                        const benignPct = (benignAvg / maxVal) * 100;

                        return (
                          <div key={idx} className="text-xs bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3 rounded-[var(--radius-md)] space-y-1.5">
                            <div className="flex justify-between text-slate-400 font-mono text-[9px]">
                              <span className="font-semibold text-slate-350">{feat.feature}</span>
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] text-[var(--accent-amber)] w-16 font-semibold shrink-0">This Flow:</span>
                                <div className="flex-1 bg-slate-950 h-1.5 rounded-full overflow-hidden relative">
                                  <div
                                    className="h-full bg-[var(--accent-amber)] rounded-full"
                                    style={{ width: `${valPct}%` }}
                                  ></div>
                                </div>
                                <span className="text-[8px] text-slate-200 font-mono w-16 text-right shrink-0">
                                  {val.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-500 w-16 font-semibold shrink-0">Benign Avg:</span>
                                <div className="flex-1 bg-slate-950 h-1.5 rounded-full overflow-hidden relative">
                                  <div
                                    className="h-full bg-slate-800 rounded-full"
                                    style={{ width: `${benignPct}%` }}
                                  ></div>
                                </div>
                                <span className="text-[8px] text-slate-400 font-mono w-16 text-right shrink-0">
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
                  <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-[var(--radius-md)] space-y-1.5 mt-auto">
                    <span className="text-[9px] text-[var(--accent-amber)] font-bold uppercase tracking-wider block font-display">Natural AI Threat Attribution</span>
                    {loadingExplanation ? (
                      <div className="space-y-2 py-1 animate-pulse">
                        <div className="h-3 bg-slate-850 rounded w-full"></div>
                        <div className="h-3 bg-slate-850 rounded w-5/6"></div>
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-slate-200 font-sans">
                        {aiExplanation || "Unable to retrieve explanation attribution details."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="mt-6 pt-4 border-t border-slate-800/60 text-right">
                <GlowButton
                  onClick={() => setSelectedDetection(null)}
                  variant="secondary"
                  className="px-5 py-2 text-xs ml-auto"
                >
                  Close Explanation
                </GlowButton>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
export default Dashboard;
