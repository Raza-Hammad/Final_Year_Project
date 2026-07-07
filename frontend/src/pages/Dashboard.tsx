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
  Clock,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Download,
  Lock as LockIcon
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
  const [selectedScenario, setSelectedScenario] = useState('ddos_storm');
  const [simRate, setSimRate] = useState(5);
  const [simDuration, setSimDuration] = useState(30);

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
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide uppercase font-display">
              {activeTab === 'live' && 'Security Operations Center - Live Telemetry'}
              {activeTab === 'simulator' && 'Security Operations Center - Threat Simulator'}
              {activeTab === 'history' && 'Security Operations Center - SQLite Alert Database'}
              {activeTab === 'insights' && 'Security Operations Center - Cascade Benchmarks'}
              {activeTab === 'ai' && 'Security Operations Center - Intelligent Analyst assistant'}
            </h2>
            <span className="text-[10px] text-[var(--text-secondary)] font-medium">Bu BUIC BS(IT) Final Year Project Scope</span>
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
          {activeTab === 'simulator' && (
            <div className="flex flex-col gap-6 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Controller Settings Form */}
                <GlowPanel className="md:col-span-2 flex flex-col justify-between p-6">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide mb-1 flex items-center gap-2 uppercase font-display">
                      <Sliders className="w-4 h-4 text-[var(--accent-amber)]" />
                      Configure Simulator Preset
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-6">Select scenario preset to stream rows from prepared test data split.</p>

                    <div className="space-y-5">
                      <div>
                        <label className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-2.5">Select Scenario Preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            { key: 'ddos_storm', label: 'DDoS Storm', icon: Shield, desc: 'DDoS & DoS traffic' },
                            { key: 'port_scan', label: 'Port Scan', icon: Activity, desc: 'Sequential port scans' },
                            { key: 'brute_force', label: 'Brute Force', icon: LockIcon, desc: 'FTP/SSH & Web Brute' },
                            { key: 'mixed_attack', label: 'Mixed Attack', icon: Sliders, desc: '20% Benign, 80% Attack' },
                            { key: 'benign_baseline', label: 'Benign Baseline', icon: Database, desc: 'Pure nominal traffic' }
                          ].map((preset) => {
                            const isSelected = selectedScenario === preset.key;
                            const Icon = preset.icon;
                            return (
                              <button
                                key={preset.key}
                                type="button"
                                onClick={() => setSelectedScenario(preset.key)}
                                className={`relative p-3 bg-[var(--bg-panel)] border text-left rounded-[var(--radius-md)] transition-all outline-none cursor-pointer flex flex-col justify-between h-[85px] select-none text-xs hover:border-[var(--border-glow-hover)] ${
                                  isSelected 
                                    ? 'border-[var(--accent-amber)] shadow-[0_0_12px_rgba(245,166,35,0.2)]' 
                                    : 'border-[var(--border-subtle)]'
                                }`}
                              >
                                {isSelected && (
                                  <>
                                    <span className="absolute top-[-1px] left-[-1px] w-2 h-2 border-t-2 border-l-2 border-[var(--accent-amber)] rounded-tl-[var(--radius-sm)]" />
                                    <span className="absolute top-[-1px] right-[-1px] w-2 h-2 border-t-2 border-r-2 border-[var(--accent-amber)] rounded-tr-[var(--radius-sm)]" />
                                    <span className="absolute bottom-[-1px] left-[-1px] w-2 h-2 border-b-2 border-l-2 border-[var(--accent-amber)] rounded-bl-[var(--radius-sm)]" />
                                    <span className="absolute bottom-[-1px] right-[-1px] w-2 h-2 border-b-2 border-r-2 border-[var(--accent-amber)] rounded-br-[var(--radius-sm)]" />
                                  </>
                                )}
                                <div className="flex justify-between items-start w-full">
                                  <Icon className={`w-4 h-4 ${isSelected ? 'text-[var(--accent-amber)]' : 'text-slate-500'}`} />
                                  <span className={`text-[6.5px] font-mono px-1 py-0.5 rounded ${isSelected ? 'bg-[var(--accent-amber-glow)] text-[var(--accent-amber)]' : 'bg-[var(--bg-base)] text-slate-500'}`}>
                                    {isSelected ? 'ACTIVE' : 'READY'}
                                  </span>
                                </div>
                                <div className="mt-2 overflow-hidden w-full">
                                  <p className={`font-bold tracking-tight uppercase text-[8.5px] truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>{preset.label}</p>
                                  <span className="text-[7.5px] text-[var(--text-secondary)] block truncate leading-none mt-0.5">{preset.desc}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-2">Stream Rate (Packets/Sec)</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={simRate}
                            onChange={(e) => setSimRate(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] p-2.5 text-xs text-white outline-none transition-all font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-2">Duration (Seconds)</label>
                          <input
                            type="number"
                            min="5"
                            value={simDuration}
                            onChange={(e) => setSimDuration(Math.max(5, parseInt(e.target.value) || 5))}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] p-2.5 text-xs text-white outline-none transition-all font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-[var(--border-subtle)]/40 flex gap-3">
                    {simStatus.running ? (
                      <GlowButton
                        onClick={handleStopSim}
                        variant="secondary"
                        className="px-6 py-2.5 border-[var(--color-critical)] text-[var(--color-critical)] hover:bg-[var(--color-critical)]/10 flex items-center gap-1.5"
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop Simulation
                      </GlowButton>
                    ) : (
                      <GlowButton
                        onClick={handleStartSim}
                        variant="primary"
                        className="px-6 py-2.5 flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Simulation
                      </GlowButton>
                    )}
                  </div>
                </GlowPanel>

                {/* Live Sim Telemetry Stats */}
                <GlowPanel className="flex flex-col justify-between p-6">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide mb-1 flex items-center gap-2 uppercase font-display">
                      <Clock className="w-4 h-4 text-[var(--accent-amber)]" />
                      Live Status Panel
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-6">Real-time status metrics of replayer task.</p>

                    <div className="space-y-4 text-xs font-mono">
                      <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                        <span className="text-[var(--text-secondary)] font-sans">Status State:</span>
                        <StatusBadge status={simStatus.running ? 'RUNNING' : 'READY'} />
                      </div>
                      <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                        <span className="text-[var(--text-secondary)] font-sans">Preset Scenario:</span>
                        <span className="text-slate-300 font-bold uppercase text-[10px]">{simStatus.scenario || '--'}</span>
                      </div>
                      <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                        <span className="text-[var(--text-secondary)] font-sans">Elapsed / Limit:</span>
                        <span className="text-slate-300 font-bold">{simStatus.elapsed_seconds}s / {simStatus.duration_seconds || '∞'}s</span>
                      </div>
                      <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                        <span className="text-[var(--text-secondary)] font-sans">Ingress Packets:</span>
                        <span className="text-white font-bold">{simStatus.packets_sent.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-b border-[var(--border-subtle)]/30 pb-2">
                        <span className="text-[var(--text-secondary)] font-sans">Threat Alerts Logged:</span>
                        <span className="text-[var(--color-critical)] font-bold">{simStatus.attacks_detected.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <span className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-wider block mb-3 font-sans">Resolution Cascade breakdown</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-[var(--bg-base)] p-2 border border-[var(--border-subtle)] rounded-lg text-center">
                        <p className="font-mono font-bold text-white text-xs">{simStatus.tier_breakdown['1'] || 0}</p>
                        <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T-1</span>
                      </div>
                      <div className="bg-[var(--bg-base)] p-2 border border-[var(--border-subtle)] rounded-lg text-center">
                        <p className="font-mono font-bold text-white text-xs">{simStatus.tier_breakdown['2'] || 0}</p>
                        <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T-2</span>
                      </div>
                      <div className="bg-[var(--bg-base)] p-2 border border-[var(--border-subtle)] rounded-lg text-center">
                        <p className="font-mono font-bold text-white text-xs">{simStatus.tier_breakdown['3'] || 0}</p>
                        <span className="text-[7px] text-[var(--text-secondary)] block font-mono">T-3</span>
                      </div>
                    </div>
                  </div>
                </GlowPanel>

              </div>
            </div>
          )}

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
            <div className="flex flex-col gap-6 max-w-4xl mx-auto h-[550px] relative w-full">
              <GlowPanel className="flex-1 flex flex-col overflow-hidden p-0 relative">
                {/* Chat header */}
                <div className="px-6 py-4 bg-[var(--bg-panel-raised)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)] animate-pulse shadow-[0_0_8px_var(--accent-amber)]" />
                    <h4 className="text-xs font-bold text-white tracking-widest uppercase font-display">
                      AI SECURITY ASSISTANT
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-teal-400/20 bg-teal-950/20 text-teal-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                      RULE-BASE: ACTIVE
                    </span>
                    {geminiAvailable ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--accent-amber)]/20 bg-amber-950/20 text-[var(--accent-amber)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] animate-pulse" />
                        GEMINI: CONNECTED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold font-mono uppercase tracking-wider rounded-full border border-slate-500/20 bg-slate-900/50 text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        GEMINI: UNAVAILABLE
                      </span>
                    )}
                  </div>
                </div>

                {/* Message Log */}
                <div 
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 overflow-y-auto p-6 space-y-6 bg-[var(--bg-base)] relative overflow-hidden flex flex-col"
                >
                  <RadarBackground isFixed={false} className="opacity-[0.05]" />
                  
                  <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes typing-dot-1 {
                      0%, 100% { opacity: 0.3; transform: translateY(0px); }
                      50% { opacity: 1; transform: translateY(-4px); }
                    }
                    @keyframes typing-dot-2 {
                      0%, 100% { opacity: 0.3; transform: translateY(0px); }
                      50% { opacity: 1; transform: translateY(-4px); }
                    }
                    @keyframes typing-dot-3 {
                      0%, 100% { opacity: 0.3; transform: translateY(0px); }
                      50% { opacity: 1; transform: translateY(-4px); }
                    }
                    @keyframes radar-spin-tiny {
                      from { transform: rotate(0deg); }
                      to { transform: rotate(360deg); }
                    }
                  `}} />

                  {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto relative z-10 animate-fade-in my-auto">
                      <h2 className="text-xl font-bold text-white tracking-wider uppercase font-display mb-2">
                        SENTINEL AI
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6 font-body">
                        Ask me anything about cybersecurity, this system, or any active threat.
                      </p>
                      <div className="grid grid-cols-2 gap-3 w-full">
                        {[
                          "What is a DDoS attack?",
                          "How does the cascade work?",
                          "Explain the last alert",
                          "What is SMOTE?"
                        ].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => sendChatMessage(q)}
                            className="px-3 py-2 bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)] hover:border-[var(--accent-amber)] hover:text-white rounded-[var(--radius-sm)] text-[10px] text-[var(--text-secondary)] font-mono transition-all text-left truncate cursor-pointer hover:shadow-[0_0_8px_rgba(245,166,35,0.1)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)]"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5 relative z-10 flex flex-col">
                      {messages.map((msg, i) => {
                        const isUser = msg.role === 'user';
                        return (
                          <div
                            key={i}
                            className={`flex flex-col max-w-[80%] ${
                              isUser ? 'ml-auto items-end' : 'mr-auto items-start'
                            }`}
                          >
                            <span className="text-[8px] text-[var(--text-secondary)] mb-1 block px-1 font-mono uppercase tracking-wider">
                              {isUser ? (
                                "YOU"
                              ) : (
                                <div className="flex items-center gap-1">
                                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                                    <svg 
                                      className="w-full h-full text-[var(--accent-amber)]" 
                                      viewBox="0 0 24 24" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="1.5"
                                      style={{ 
                                        animation: 'radar-spin-tiny 3s linear infinite',
                                        transformOrigin: '12px 12px'
                                      }}
                                    >
                                      <circle cx="12" cy="12" r="10" strokeDasharray="3 3" stroke="currentColor" strokeWidth="0.8" />
                                      <path d="M 12 12 L 12 2 A 10 10 0 0 1 22 12 Z" fill="rgba(245,166,35,0.15)" stroke="none" />
                                      <line x1="12" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  </div>
                                  <span>SENTINEL AI</span>
                                </div>
                              )}
                            </span>

                            {isUser ? (
                              <div 
                                style={{ 
                                  backgroundColor: 'rgba(245, 166, 35, 0.11)', 
                                  borderColor: 'rgba(245, 166, 35, 0.3)' 
                                }}
                                className="p-3.5 border text-[var(--text-primary)] rounded-2xl rounded-tr-none text-xs leading-relaxed max-w-full font-body animate-fade-in shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                              >
                                {msg.text}
                              </div>
                            ) : (
                              <div 
                                className={`relative p-3.5 bg-[var(--bg-panel-raised)] border ${
                                  msg.isError ? 'border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]' : 'border-[var(--border-subtle)]'
                                } text-[var(--text-primary)] rounded-2xl rounded-tl-none text-xs leading-relaxed max-w-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] animate-fade-in`}
                              >
                                <span className="absolute top-[-1px] left-[-1px] w-1.5 h-1.5 border-t border-l border-[var(--accent-amber)] rounded-tl-[var(--radius-sm)]" />
                                <span className="absolute top-[-1px] right-[-1px] w-1.5 h-1.5 border-t border-r border-[var(--accent-amber)] rounded-tr-[var(--radius-sm)]" />
                                <span className="absolute bottom-[-1px] left-[-1px] w-1.5 h-1.5 border-b border-l border-[var(--accent-amber)] rounded-bl-[var(--radius-sm)]" />
                                <span className="absolute bottom-[-1px] right-[-1px] w-1.5 h-1.5 border-b border-r border-[var(--accent-amber)] rounded-br-[var(--radius-sm)]" />
                                
                                <div className="font-body whitespace-pre-wrap">{msg.text}</div>
                                
                                {(msg.source || msg.responseTime) && (
                                  <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]/30 flex items-center gap-2 justify-end">
                                    {msg.source && (
                                      <>
                                        {msg.source.toLowerCase().includes('gemini') ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-full border border-[var(--accent-amber)]/20 bg-amber-950/20 text-[var(--accent-amber)]">
                                            ✦ GEMINI
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-full border border-teal-400/20 bg-teal-950/20 text-teal-400">
                                            ⚡ RULE-BASE
                                          </span>
                                        )}
                                      </>
                                    )}
                                    {msg.responseTime && (
                                      <span className="text-[9px] text-[var(--text-secondary)] font-mono">
                                        {msg.responseTime}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            <span className="text-[7.5px] text-[var(--text-secondary)] mt-1 block px-1 font-mono tracking-wider">{msg.time}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {aiTyping && (
                    <div className="flex flex-col max-w-[80%] mr-auto items-start relative z-10 animate-fade-in">
                      <span className="text-[8px] text-[var(--text-secondary)] mb-1 block px-1 font-mono uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            <svg 
                              className="w-full h-full text-[var(--accent-amber)]" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="1.5"
                              style={{ 
                                animation: 'radar-spin-tiny 3s linear infinite',
                                transformOrigin: '12px 12px'
                              }}
                            >
                              <circle cx="12" cy="12" r="10" strokeDasharray="3 3" stroke="currentColor" strokeWidth="0.8" />
                              <path d="M 12 12 L 12 2 A 10 10 0 0 1 22 12 Z" fill="rgba(245,166,35,0.15)" stroke="none" />
                              <line x1="12" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" />
                            </svg>
                          </div>
                          <span>SENTINEL AI</span>
                        </div>
                      </span>

                      <div className="relative px-4 py-3 bg-[var(--bg-panel-raised)] border border-[var(--border-subtle)] rounded-2xl rounded-tl-none shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center gap-1.5">
                        <span className="absolute top-[-1px] left-[-1px] w-1.5 h-1.5 border-t border-l border-[var(--accent-amber)] rounded-tl-[var(--radius-sm)]" />
                        <span className="absolute top-[-1px] right-[-1px] w-1.5 h-1.5 border-t border-r border-[var(--accent-amber)] rounded-tr-[var(--radius-sm)]" />
                        <span className="absolute bottom-[-1px] left-[-1px] w-1.5 h-1.5 border-b border-l border-[var(--accent-amber)] rounded-bl-[var(--radius-sm)]" />
                        <span className="absolute bottom-[-1px] right-[-1px] w-1.5 h-1.5 border-b border-r border-[var(--accent-amber)] rounded-br-[var(--radius-sm)]" />
                        
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] animate-[typing-dot-1_1.4s_infinite]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] animate-[typing-dot-2_1.4s_infinite] [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-amber)] animate-[typing-dot-3_1.4s_infinite] [animation-delay:0.4s]" />
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
                  <input
                    ref={chatInputRef}
                    type="text"
                    required
                    value={chatInput}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask SENTINEL AI..."
                    className="flex-1 bg-[var(--bg-base)] border border-[var(--border-subtle)] focus:border-[var(--accent-amber)] focus:ring-1 focus:ring-[var(--accent-amber)] rounded-[var(--radius-sm)] px-4 py-3 text-xs text-white outline-none placeholder-[var(--text-muted)] transition-all font-sans"
                  />
                  
                  {inputFocused && (
                    <span className="text-[9px] text-[var(--text-secondary)] font-mono transition-opacity duration-200 animate-fade-in shrink-0">
                      Enter ↵ to send
                    </span>
                  )}
                  
                  <GlowButton
                    type="submit"
                    variant="primary"
                    className="px-5 py-3 text-xs font-bold font-sans uppercase tracking-wider min-w-[70px] flex items-center justify-center shrink-0"
                  >
                    Send
                  </GlowButton>
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
