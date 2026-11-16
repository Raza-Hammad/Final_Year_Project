/**
 * Public API surface shared by DashboardLayout → split pages.
 */
import type React from 'react';
import type {
  AlertLog,
  ConversationSummary,
  DetectionData,
  SimStatus,
  TelemetryEvent,
} from './types';

export interface DashboardApi {
  user: { username?: string; role?: string } | null | undefined;
  logout: () => void | Promise<void>;
  token: string | null | undefined;

  wsConnected: boolean;
  lastHeartbeat: number | null;
  reconnectAttempt: number;
  reconnectWs: () => void;

  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  screenFlash: boolean;

  showExportModal: boolean;
  setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>;
  exportFormat: 'pdf' | 'csv';
  setExportFormat: React.Dispatch<React.SetStateAction<'pdf' | 'csv'>>;
  exportSeverity: string;
  setExportSeverity: React.Dispatch<React.SetStateAction<string>>;
  exportAttackType: string;
  setExportAttackType: React.Dispatch<React.SetStateAction<string>>;

  liveEvents: TelemetryEvent[];
  packetsAnalyzed: number;
  attacksCount: number;
  selectedDetection: DetectionData | null;
  setSelectedDetection: React.Dispatch<React.SetStateAction<DetectionData | null>>;
  chartData: { time: string; packets: number; threats: number }[];
  packetsPerSecond: number;
  liveTiers: Record<number, number>;
  attackCounts: Record<string, number>;
  topTalkers: Record<string, number>;

  simStatus: SimStatus;
  selectedScenario: string;
  setSelectedScenario: React.Dispatch<React.SetStateAction<string>>;
  scenarios: Record<string, { display_name: string; description: string; severity_hint: string }> | null;
  loadingScenarios: boolean;
  simRate: number;
  setSimRate: React.Dispatch<React.SetStateAction<number>>;
  simDuration: number;
  setSimDuration: React.Dispatch<React.SetStateAction<number>>;
  simError: string | null;
  setSimError: React.Dispatch<React.SetStateAction<string | null>>;
  ppsHistory: number[];
  localElapsed: number;

  alerts: AlertLog[];
  expandedAlertId: number | null;
  setExpandedAlertId: React.Dispatch<React.SetStateAction<number | null>>;
  filterAttack: string;
  setFilterAttack: React.Dispatch<React.SetStateAction<string>>;
  filterTier: string;
  setFilterTier: React.Dispatch<React.SetStateAction<string>>;
  filterSeverity: string;
  setFilterSeverity: React.Dispatch<React.SetStateAction<string>>;
  filterDateFrom: string;
  setFilterDateFrom: React.Dispatch<React.SetStateAction<string>>;
  filterDateTo: string;
  setFilterDateTo: React.Dispatch<React.SetStateAction<string>>;
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  loadingHistory: boolean;

  smoteData: any;
  metricsData: any;
  loadingMetrics: boolean;
  selectedCMModel: 'lightgbm' | 'random_forest' | 'xgboost';
  setSelectedCMModel: React.Dispatch<React.SetStateAction<'lightgbm' | 'random_forest' | 'xgboost'>>;
  numFeaturesToShow: number;
  setNumFeaturesToShow: React.Dispatch<React.SetStateAction<number>>;
  hoveredCMCell: { row: number; col: number; val: number; pct: number } | null;
  setHoveredCMCell: React.Dispatch<React.SetStateAction<{ row: number; col: number; val: number; pct: number } | null>>;
  smoteViewMode: 'chart' | 'table';
  setSmoteViewMode: React.Dispatch<React.SetStateAction<'chart' | 'table'>>;
  cmViewMode: 'count' | 'percentage';
  setCmViewMode: React.Dispatch<React.SetStateAction<'count' | 'percentage'>>;
  showPacketsSeries: boolean;
  setShowPacketsSeries: React.Dispatch<React.SetStateAction<boolean>>;
  showThreatsSeries: boolean;
  setShowThreatsSeries: React.Dispatch<React.SetStateAction<boolean>>;
  activeAlertBanner: DetectionData | null;
  setActiveAlertBanner: React.Dispatch<React.SetStateAction<DetectionData | null>>;

  benignBaselines: Record<string, number>;
  aiExplanation: string;
  loadingExplanation: boolean;

  messages: { role: 'user' | 'assistant'; text: string; time: string; source?: string; responseTime?: string; isError?: boolean }[];
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  aiTyping: boolean;
  /** True when the LLM chat backend is reachable (never expose provider brand in UI). */
  aiAvailable: boolean;
  /** `null` when the account has unlimited AI (admins). */
  aiQueriesRemaining: number | null;
  aiQueryLimit: number | null;
  /** True for admin accounts — show an Unlimited badge instead of a counter. */
  aiUnlimited: boolean;
  inputFocused: boolean;
  setInputFocused: React.Dispatch<React.SetStateAction<boolean>>;
  conversations: ConversationSummary[];
  loadingConversations: boolean;
  loadingConversationDetail: boolean;
  activeConversationId: number | null;
  incognito: boolean;
  renamingId: number | null;
  setRenamingId: React.Dispatch<React.SetStateAction<number | null>>;
  renameDraft: string;
  setRenameDraft: React.Dispatch<React.SetStateAction<string>>;
  confirmDeleteId: number | null;

  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLInputElement | null>;

  handleChatScroll: () => void;
  handleStartSim: () => Promise<void>;
  handleStopSim: () => Promise<void>;
  handleExportReport: (format: 'pdf' | 'csv') => Promise<void>;
  getSmoteChartData: () => { class: string; 'Before SMOTE': number; 'After SMOTE': number }[];
  sendChatMessage: (text: string) => void;
  handleSendChat: (e: React.FormEvent) => void;
  fetchConversations: () => Promise<void>;
  startNewConversation: () => void;
  loadConversation: (id: number) => Promise<void>;
  requestDeleteConversation: (id: number, e?: React.MouseEvent) => void;
  cancelDeleteConversation: (e?: React.MouseEvent) => void;
  confirmDeleteConversation: (id: number, e?: React.MouseEvent) => Promise<void>;
  togglePinConversation: (c: ConversationSummary, e?: React.MouseEvent) => Promise<void>;
  commitRename: (id: number) => Promise<void>;
  toggleIncognito: () => void;
  getComparisonData: () => any[];
  postureScore: number;
  postureHistory: number[];
  postureStatus: { label: string; color: string; dotColor: string; description: string };
  renderConfusionMatrix: (modelKey: 'lightgbm' | 'random_forest' | 'xgboost') => React.ReactNode;
  playAlertSound: () => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}
