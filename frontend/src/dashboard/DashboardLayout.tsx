/**
 * DashboardLayout — Phase 3 Living Lattice foundation.
 * Owns shared console state, WebSocket telemetry, theme/sound, and modals.
 * Page routes render via <Outlet /> inside AppShell.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import GlowButton from '../components/ui/GlowButton';
import ThreatDnaSignature from '../components/ThreatDnaSignature';
import { AppShell } from '../components/layout/AppShell';
import { DashboardContext } from './DashboardContext';
import type { DashboardApi } from './dashboardApi';
import { useLiveSocket } from '../hooks/useLiveSocket';
import { publishDetection } from '../components/lattice/latticeBus';
import { useToast } from '../components/toast/ToastProvider';
import {
  CLASS_LABELS,
  CLASS_ABBREVIATIONS,
  TAB_FROM_PATH,
} from './constants';
import type {
  TabId,
  DetectionData,
  TelemetryEvent,
  AlertLog,
  ConversationSummary,
  SimStatus,
} from './types';
import {
  extractErrorDetail,
  seqRampColor,
  compactCount,
} from './utils';
import {
  Sparkles,
  Download,
  X,
} from 'lucide-react';
export const DashboardLayout: React.FC = () => {
  const { user, logout, token } = useAuth();
  const location = useLocation();
  const activeTab: TabId = TAB_FROM_PATH[location.pathname] ?? 'live';
  const { pushToast } = useToast();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('ll-sidebar-collapsed') === 'true');

  // --- GLOBAL STATES ---
  const [wsConnected, setWsConnected] = useState(false); // synced from useLiveSocket

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

  useEffect(() => {
    localStorage.setItem('ll-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);


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
    const eventBufferRef = useRef<TelemetryEvent[]>([]);

  // Heartbeat telemetry variables
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [packetsPerSecond, setPacketsPerSecond] = useState(0);
  const packetsThisSecondRef = useRef(0);
  const [liveTiers, setLiveTiers] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });
  const [attackCounts, setAttackCounts] = useState<Record<string, number>>({});
  const [topTalkers, setTopTalkers] = useState<Record<string, number>>({});
  // Lattice arcs no longer live in React state: raw detections go straight to
  // `latticeBus` (see onTelemetryJson) so idle consoles never re-render at 10 Hz.

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
    mode: 'idle',
    source: null,
    scenario: null,
    rate: 5,
    duration_seconds: 30,
    elapsed_seconds: 0,
    packets_sent: 0,
    packets_parsed: 0,
    flows_built: 0,
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
  const [aiAvailable, setAiAvailable] = useState<boolean>(true);
  const [aiQueriesRemaining, setAiQueriesRemaining] = useState<number | null>(10);
  const [aiQueryLimit, setAiQueryLimit] = useState<number | null>(10);
  const [aiUnlimited, setAiUnlimited] = useState<boolean>(false);
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
  const onTelemetryJson = useCallback((payload: unknown) => {
    const event = payload as TelemetryEvent;
    if (event.event === 'heartbeat') {
      setLastHeartbeat(Date.now());
    } else {
      eventBufferRef.current.push(event);
      if (event.event === 'detection' && event.data) {
        publishDetection(event.data);
      }
    }
  }, []);

  const {
    connected: liveSocketConnected,
    reconnectAttempt,
    reconnect: reconnectWs,
  } = useLiveSocket({
    token,
    onJson: onTelemetryJson,
  });

  useEffect(() => {
    setWsConnected(liveSocketConnected);
  }, [liveSocketConnected]);

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
          }
        });

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
    // Buffer + setters are stable; keeping deps empty stops the interval being
    // torn down and recreated on every flush.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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


  // Shared quota reader — admins come back with null limits + ai_unlimited.
  const applyAiQuota = (data: {
    ai_unlimited?: boolean;
    ai_queries_remaining?: number | null;
    ai_query_limit?: number | null;
  }) => {
    if (typeof data.ai_unlimited === 'boolean') setAiUnlimited(data.ai_unlimited);
    if (data.ai_queries_remaining === null || typeof data.ai_queries_remaining === 'number') {
      setAiQueriesRemaining(data.ai_queries_remaining);
    }
    if (data.ai_query_limit === null || typeof data.ai_query_limit === 'number') {
      setAiQueryLimit(data.ai_query_limit);
    }
  };

  // Poll AI chat status (availability + lifetime quota; no provider/model fields)
  useEffect(() => {
    const fetchAiStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await api.get('/api/chat/status');
        const available = Boolean(
          res.data.ai_available ?? res.data.nebius_available
        );
        setAiAvailable(available);
        applyAiQuota(res.data);
      } catch (err) {
        console.error('Failed to fetch AI status:', err);
        setAiAvailable(false);
      }
    };
    
    if (activeTab === 'ai') {
      fetchAiStatus();
      const interval = setInterval(fetchAiStatus, 30000);
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
      // Skip identical payloads so a 1 Hz poll does not re-render the console.
      setSimStatus((prev) => (JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data));
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
      if (simStatus.mode === 'replay') {
        await api.post('/api/simulate/replay/stop');
      } else {
        await api.post('/api/simulate/stop');
      }
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
      pushToast('Failed to generate export report.', 'error');
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
        const rawSource = String(res.data.source || '');
        const displaySource = /nebius/i.test(rawSource) ? 'AI' : rawSource;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: res.data.answer,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: displaySource,
            responseTime: responseTimeStr,
            isError: displaySource === 'Error Fallback'
          }
        ]);
      }

      applyAiQuota(res.data);

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
      const detail = extractErrorDetail(err);
      if (chatGenerationRef.current === generationAtSend) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: detail || "I'm having trouble right now — please try again in a moment.",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: 'Error Fallback',
            isError: true
          }
        ]);
      }
      // Refresh quota after a 429 so the remaining counter stays accurate.
      try {
        const statusRes = await api.get('/api/chat/status');
        applyAiQuota(statusRes.data);
      } catch {
        /* ignore secondary status failures */
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

  // Memoised so consumers only re-render when real state changes (the handlers
  // below close over exactly the state listed in the dependency array).
  const dashboardApi: DashboardApi = useMemo(() => ({
    user, logout, token,
    wsConnected, lastHeartbeat, reconnectAttempt, reconnectWs,
    theme, setTheme, soundEnabled, setSoundEnabled, screenFlash,
    showExportModal, setShowExportModal, exportFormat, setExportFormat,
    exportSeverity, setExportSeverity, exportAttackType, setExportAttackType,
    liveEvents, packetsAnalyzed, attacksCount, selectedDetection, setSelectedDetection,
    chartData, packetsPerSecond, liveTiers, attackCounts, topTalkers,
    simStatus, selectedScenario, setSelectedScenario, scenarios, loadingScenarios,
    simRate, setSimRate, simDuration, setSimDuration, simError, setSimError,
    ppsHistory, localElapsed,
    alerts, expandedAlertId, setExpandedAlertId,
    filterAttack, setFilterAttack, filterTier, setFilterTier,
    filterSeverity, setFilterSeverity, filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo, historyPage, setHistoryPage, loadingHistory,
    smoteData, metricsData, loadingMetrics, selectedCMModel, setSelectedCMModel,
    numFeaturesToShow, setNumFeaturesToShow, hoveredCMCell, setHoveredCMCell,
    smoteViewMode, setSmoteViewMode, cmViewMode, setCmViewMode,
    showPacketsSeries, setShowPacketsSeries, showThreatsSeries, setShowThreatsSeries,
    activeAlertBanner, setActiveAlertBanner,
    benignBaselines, aiExplanation, loadingExplanation,
    messages, chatInput, setChatInput, aiTyping, aiAvailable, aiQueriesRemaining, aiQueryLimit, aiUnlimited, inputFocused, setInputFocused,
    conversations, loadingConversations, loadingConversationDetail,
    activeConversationId, incognito, renamingId, setRenamingId, renameDraft, setRenameDraft,
    confirmDeleteId,
    chatContainerRef, bottomRef, chatInputRef,
    handleChatScroll, handleStartSim, handleStopSim, handleExportReport,
    getSmoteChartData, sendChatMessage, handleSendChat,
    fetchConversations, startNewConversation, loadConversation,
    requestDeleteConversation, cancelDeleteConversation, confirmDeleteConversation,
    togglePinConversation, commitRename, toggleIncognito,
    getComparisonData, postureScore, postureHistory, postureStatus, renderConfusionMatrix,
    playAlertSound,
    sidebarCollapsed, setSidebarCollapsed,
  }), [
      user, token, logout, reconnectWs, wsConnected, lastHeartbeat, reconnectAttempt,
      theme, soundEnabled, screenFlash, showExportModal, exportFormat, exportSeverity, exportAttackType,
      liveEvents, packetsAnalyzed, attacksCount, selectedDetection, chartData, packetsPerSecond,
      liveTiers, attackCounts, topTalkers, simStatus, selectedScenario, scenarios, loadingScenarios,
      simRate, simDuration, simError, ppsHistory, localElapsed,
      alerts, expandedAlertId, filterAttack, filterTier, filterSeverity, filterDateFrom, filterDateTo,
      historyPage, loadingHistory, smoteData, metricsData, loadingMetrics, selectedCMModel,
      numFeaturesToShow, hoveredCMCell, smoteViewMode, cmViewMode, showPacketsSeries, showThreatsSeries,
      activeAlertBanner, benignBaselines, aiExplanation, loadingExplanation, messages, chatInput,
      aiTyping, aiAvailable, aiQueriesRemaining, aiQueryLimit, aiUnlimited, inputFocused,
      conversations, loadingConversations, loadingConversationDetail, activeConversationId, incognito,
      renamingId, renameDraft, confirmDeleteId, postureScore, postureHistory, postureStatus,
      sidebarCollapsed, activeTab,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  const criticalBanner = activeAlertBanner ? (
    <div className="fixed top-24 right-5 z-30 bg-[var(--sr-glass-bg)] backdrop-blur-md border border-[var(--sr-sev-critical)] shadow-2xl rounded-[var(--sr-radius-md)] p-4 max-w-md animate-fade-in flex items-center justify-between gap-4">
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
  ) : null;

  return (
    <DashboardContext.Provider value={dashboardApi}>
      <AppShell
        username={user?.username}
        role={user?.role}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        onLogout={logout}
        wsConnected={wsConnected}
        lastHeartbeat={lastHeartbeat}
        simRunning={simStatus.running}
        postureLabel={postureStatus.label}
        attacksCount={attacksCount}
        aiAvailable={aiAvailable}
        chartData={chartData}
        screenFlash={screenFlash}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        banner={criticalBanner}
      >
        <Outlet />
      </AppShell>

      {/* XAI EXPLAIN THE PACKET MODAL */}
      {selectedDetection && (() => {
        return (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl animate-scaleUp">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <div className="bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] p-4 rounded-[var(--sr-radius-md)] flex flex-col items-center">
                    <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block self-start mb-2">Threat DNA Signature (normalized 0-1)</span>
                    <ThreatDnaSignature detection={selectedDetection} />
                  </div>
                </div>
                <div className="space-y-4 flex flex-col justify-between">
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
              <div className="mt-6 pt-4 border-t border-[var(--sr-border-hairline)] text-right">
                <GlowButton onClick={() => setSelectedDetection(null)} variant="secondary" className="px-5 py-2 text-xs ml-auto">
                  Close explanation
                </GlowButton>
              </div>
            </div>
          </div>
        );
      })()}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] p-6 max-w-md w-full shadow-2xl relative space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--sr-border-hairline)]">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--sr-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--sr-text-primary)]">Export Telemetry Report</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} className="text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] p-1 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">File Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setExportFormat('pdf')} className={`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all ${exportFormat === 'pdf' ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]' : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'}`}>PDF Document</button>
                  <button type="button" onClick={() => setExportFormat('csv')} className={`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all ${exportFormat === 'csv' ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]' : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'}`}>CSV Dataset</button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">Filter by Severity</label>
                <select value={exportSeverity} onChange={(e) => setExportSeverity(e.target.value)} className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] px-3 py-2 text-xs text-[var(--sr-text-primary)] outline-none cursor-pointer">
                  <option value="">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Info">Info</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--sr-text-muted)] mb-1.5">Filter by Threat Label</label>
                <select value={exportAttackType} onChange={(e) => setExportAttackType(e.target.value)} className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] px-3 py-2 text-xs text-[var(--sr-text-primary)] outline-none cursor-pointer">
                  <option value="">All Threat Vectors</option>
                  {CLASS_LABELS.map((lbl) => (
                    <option key={lbl} value={lbl}>{lbl}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-3 border-t border-[var(--sr-border-hairline)] flex justify-end gap-2">
              <GlowButton onClick={() => setShowExportModal(false)} variant="secondary" className="px-4 py-1.5 text-xs">Cancel</GlowButton>
              <GlowButton onClick={() => { handleExportReport(exportFormat); setShowExportModal(false); }} variant="primary" className="px-4 py-1.5 text-xs">
                <Download className="w-3.5 h-3.5" />
                Download {exportFormat.toUpperCase()}
              </GlowButton>
            </div>
          </div>
        </div>
      )}
    </DashboardContext.Provider>
  );
};

export default DashboardLayout;
