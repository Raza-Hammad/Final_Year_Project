/**
 * Transform copied Dashboard.tsx → DashboardLayout provider with AppShell + Outlet.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src');
const file = path.join(src, 'dashboard/DashboardLayout.tsx');
let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');

// Find component start and return (
const compIdx = lines.findIndex((l) => l.includes('export const Dashboard: React.FC'));
const returnIdx = lines.findIndex((l, i) => i > compIdx && l.trim() === 'return (');
if (compIdx < 0 || returnIdx < 0) {
  throw new Error('Could not locate Dashboard component/return');
}

// Keep logic through the line before return, but rewrite header + component shell.
const logicLines = lines.slice(compIdx + 1, returnIdx); // inside component body before return

// Strip duplicated type/const blocks from original file top — rebuild file.
const header = `/**
 * DashboardLayout — Phase 3 Living Lattice foundation.
 * Owns shared console state, WebSocket telemetry, theme/sound, and modals.
 * Page routes render via <Outlet /> inside AppShell.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import GlowButton from '../components/ui/GlowButton';
import { AppShell } from '../components/layout/AppShell';
import { DashboardContext } from './DashboardContext';
import type { DashboardApi } from './dashboardApi';
import { useLiveSocket } from '../hooks/useLiveSocket';
import { useToast } from '../components/toast/ToastProvider';
import {
  CLASS_LABELS,
  CLASS_ABBREVIATIONS,
  SCENARIO_DETAILS,
  TAB_FROM_PATH,
} from './constants';
import type {
  TabId,
  TopFeature,
  DetectionData,
  TelemetryEvent,
  AttackVector,
  AlertLog,
  ConversationSummary,
  SimStatus,
} from './types';
import {
  extractErrorDetail,
  groupConversationsByDate,
  seqRampColor,
  compactCount,
  makeTruncatedYAxisTick,
} from './utils';
import {
  Sparkles,
  Download,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
} from 'recharts';

export const DashboardLayout: React.FC = () => {
`;

// Process logic: replace activeTab state and WS block
let logic = logicLines.join('\n');

// Replace activeTab state with location-derived tab
logic = logic.replace(
  /const \[activeTab, setActiveTab\] = useState<'live' \| 'simulator' \| 'history' \| 'insights' \| 'ai'>\('live'\);/,
  `const location = useLocation();\n  const activeTab: TabId = TAB_FROM_PATH[location.pathname] ?? 'live';\n  const { pushToast } = useToast();\n  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('ll-sidebar-collapsed') === 'true');`,
);

// Remove old wsConnected state — hook provides it (keep setter pattern via derived)
logic = logic.replace(
  /const \[wsConnected, setWsConnected\] = useState\(false\);/,
  `const [wsConnected, setWsConnected] = useState(false); // synced from useLiveSocket`,
);

// Replace the WebSocket useEffect block with useLiveSocket wiring
const wsStart = logic.indexOf('// ==========================================\n  // 1. WEBSOCKET FEED + THROTTLED RE-RENDERING');
const wsFlushStart = logic.indexOf('// Flush buffer to React State at a throttled rate');
if (wsStart < 0 || wsFlushStart < 0) throw new Error('WS markers not found');

const wsReplacement = `// ==========================================
  // 1. WEBSOCKET FEED + THROTTLED RE-RENDERING
  // ==========================================
  const onTelemetryJson = useCallback((payload: unknown) => {
    const event = payload as TelemetryEvent;
    if (event.event === 'heartbeat') {
      setLastHeartbeat(Date.now());
    } else {
      eventBufferRef.current.push(event);
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

  `;

logic = logic.slice(0, wsStart) + wsReplacement + logic.slice(wsFlushStart);

// Remove wsRef if still present (optional cleanup)
logic = logic.replace(/const wsRef = useRef<WebSocket \| null>\(null\);\n/, '');

// Replace alert() with toast
logic = logic.replace(
  /alert\('Failed to generate export report\.'\);/,
  `pushToast('Failed to generate export report.', 'error');`,
);

// Persist sidebar collapse
const sidebarPersist = `
  useEffect(() => {
    localStorage.setItem('ll-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);
`;

// Insert after theme effect if possible
if (logic.includes("localStorage.setItem('theme', theme);")) {
  logic = logic.replace(
    "localStorage.setItem('theme', theme);\n  }, [theme]);",
    "localStorage.setItem('theme', theme);\n  }, [theme]);\n" + sidebarPersist,
  );
}

// Build context value + new return
const footer = `
  const dashboardApi: DashboardApi = {
    user, logout, token,
    wsConnected, lastHeartbeat, reconnectAttempt, reconnectWs,
    theme, setTheme, soundEnabled, setSoundEnabled, screenFlash,
    showExportModal, setShowExportModal, exportFormat, setExportFormat,
    exportSeverity, setExportSeverity, exportAttackType, setExportAttackType,
    liveEvents, packetsAnalyzed, attacksCount, selectedDetection, setSelectedDetection,
    chartData, packetsPerSecond, liveTiers, attackCounts, topTalkers,
    activeVectors, hoveredVector, setHoveredVector,
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
    messages, chatInput, setChatInput, aiTyping, geminiAvailable, inputFocused, setInputFocused,
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
  };

  const criticalBanner = activeAlertBanner ? (
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
              tier_name: \`Tier \${activeAlertBanner.tier} Classifier\`,
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
        geminiAvailable={geminiAvailable}
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
                      <span className={\`px-2 py-0.5 rounded-full font-medium text-[11px] \${
                        selectedDetection.predicted_label.toUpperCase() !== 'BENIGN'
                          ? 'bg-[rgba(208,59,59,0.08)] text-[var(--sr-sev-critical)]'
                          : 'bg-[rgba(12,163,12,0.08)] text-[var(--sr-sev-info)]'
                      }\`}>
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
                                  <div className="h-full bg-[var(--sr-accent)] rounded-full" style={{ width: \`\${valPct}%\` }}></div>
                                </div>
                                <span className="text-[10px] text-[var(--sr-text-primary)] w-16 text-right shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {val.toLocaleString(undefined, {maximumFractionDigits: 2})}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--sr-text-muted)] w-16 font-medium shrink-0">Benign avg</span>
                                <div className="flex-1 bg-[var(--sr-bg-page)] h-1.5 rounded-full overflow-hidden relative">
                                  <div className="h-full bg-[var(--sr-border-hover)] rounded-full" style={{ width: \`\${benignPct}%\` }}></div>
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
                  <button type="button" onClick={() => setExportFormat('pdf')} className={\`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all \${exportFormat === 'pdf' ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]' : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'}\`}>PDF Document</button>
                  <button type="button" onClick={() => setExportFormat('csv')} className={\`py-2 px-3 rounded-[var(--sr-radius-sm)] border text-xs font-medium cursor-pointer transition-all \${exportFormat === 'csv' ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)] text-[var(--sr-accent)]' : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'}\`}>CSV Dataset</button>
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
`;

const out = header + logic + footer;
fs.writeFileSync(file, out, 'utf8');
console.log('Wrote DashboardLayout.tsx lines', out.split('\n').length);
