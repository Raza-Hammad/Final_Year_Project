/**
 * Phase 3 builder: transform DashboardLayout + emit page modules + AppShell wiring helpers.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src');

function read(rel) {
  return fs.readFileSync(path.join(src, rel), 'utf8');
}
function write(rel, content) {
  const full = path.join(src, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

// ---------- AppShell ----------
write(
  'components/layout/AppShell.tsx',
  `/**
 * Cascadyx AppShell — collapsible sidebar + header chrome for Living Lattice UI.
 * Full 3D lattice scenes mount inside page outlets (Phase 4), not here.
 */
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Crosshair,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import GlowButton from '../ui/GlowButton';
import StatusBadge from '../ui/StatusBadge';
import NavIcon from '../ui/NavIcons';
import Logomark from '../ui/Logomark';
import NetworkBackground from '../ui/NetworkBackground';
import AuroraBackground from '../ui/AuroraBackground';
import PageTransition from './PageTransition';
import { NAV_GROUPS, TAB_FROM_PATH } from '../../dashboard/constants';
import type { TabId } from '../../dashboard/types';

export interface AppShellChromeProps {
  username?: string;
  role?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
  wsConnected: boolean;
  lastHeartbeat: number | null;
  simRunning: boolean;
  postureLabel: string;
  attacksCount: number;
  geminiAvailable: boolean;
  chartData: { time: string; packets: number; threats: number }[];
  screenFlash: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  /** Critical banner slot rendered above the header */
  banner?: React.ReactNode;
  children: React.ReactNode;
}

const TITLE: Record<TabId, string> = {
  live: 'Live Telemetry',
  simulator: 'Threat Simulation Console',
  history: 'Alert History',
  insights: 'Cascade Benchmarks',
  ai: 'Intelligent Analyst Assistant',
};

export const AppShell: React.FC<AppShellChromeProps> = ({
  username,
  role,
  theme,
  onToggleTheme,
  soundEnabled,
  onToggleSound,
  onLogout,
  wsConnected,
  lastHeartbeat,
  simRunning,
  postureLabel,
  attacksCount,
  geminiAvailable,
  chartData,
  screenFlash,
  sidebarCollapsed,
  onToggleSidebar,
  banner,
  children,
}) => {
  const location = useLocation();
  const activeTab: TabId = TAB_FROM_PATH[location.pathname] ?? 'live';
  const isSimulator = activeTab === 'simulator';

  return (
    <div
      className={\`min-h-screen bg-[var(--sr-bg-page)] text-[var(--sr-text-primary)] flex font-sans select-none overflow-hidden h-screen relative transition-all duration-300 \${
        screenFlash ? 'ring-4 ring-red-500/80 shadow-[inset_0_0_40px_rgba(239,68,68,0.5)]' : ''
      }\`}
      style={{ fontFamily: 'var(--sr-font-sans)' }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: \`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      \`,
        }}
      />

      <AuroraBackground className="fixed inset-0 z-0" variant="ambient" />
      <NetworkBackground className="fixed inset-0 z-0" opacity={0.14} />

      <aside
        className={\`border-r border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md flex flex-col justify-between py-6 z-20 shrink-0 transition-[width] ease-[var(--ll-ease-out)] duration-[var(--ll-motion-base)] \${
          sidebarCollapsed ? 'w-[var(--ll-sidebar-collapsed)]' : 'w-[var(--ll-sidebar-expanded)]'
        }\`}
      >
        <div className="flex flex-col gap-7">
          <div className={\`flex items-center gap-3 \${sidebarCollapsed ? 'px-3 justify-center' : 'px-5'}\`}>
            <div className="p-2 bg-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] shrink-0">
              <Logomark className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <h1
                  className="text-sm font-semibold tracking-tight text-[var(--sr-text-primary)] leading-tight truncate"
                  style={{ fontFamily: 'var(--sr-font-display)' }}
                >
                  Cascadyx
                </h1>
                <span className="text-[11px] text-[var(--sr-text-muted)]">Command Center</span>
              </div>
            )}
          </div>

          <nav className={\`flex flex-col gap-4 \${sidebarCollapsed ? 'px-2' : 'px-3'}\`}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-1">
                {!sidebarCollapsed && (
                  <span className="px-3 pb-0.5 text-[10px] font-semibold tracking-wider text-[var(--sr-text-muted)] uppercase">
                    {group.label}
                  </span>
                )}
                {group.items.map((item) => {
                  const underAttack = item.id === 'live' && postureLabel !== 'SECURE';
                  const simRunningDot = item.id === 'simulator' && simRunning;
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      end={item.path === '/'}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        \`group relative flex items-center gap-2.5 py-1.5 rounded-[var(--sr-radius-sm)] text-sm font-medium transition-all cursor-pointer outline-none border-l-[3px] focus-visible:ring-2 focus-visible:ring-[var(--sr-accent-soft)] \${
                          sidebarCollapsed ? 'justify-center pl-1 pr-1' : 'pl-2.5 pr-2'
                        } \${
                          isActive
                            ? 'text-[var(--sr-text-primary)]'
                            : 'text-[var(--sr-text-secondary)] hover:bg-[var(--sr-bg-surface-raised)] hover:text-[var(--sr-text-primary)]'
                        }\`
                      }
                      style={({ isActive }) => ({
                        borderLeftColor: isActive ? \`var(\${item.color})\` : 'transparent',
                        backgroundColor: isActive ? \`var(\${item.soft})\` : undefined,
                      })}
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-full shrink-0 transition-colors"
                            style={{
                              backgroundColor: isActive ? \`var(\${item.color})\` : 'var(--sr-bg-surface-raised)',
                              color: isActive ? '#fff' : 'var(--sr-text-muted)',
                            }}
                          >
                            <NavIcon type={item.icon} className="w-3.5 h-3.5" />
                          </span>
                          {!sidebarCollapsed && (
                            <>
                              <span className="flex-1 text-left truncate">{item.label}</span>
                              {underAttack && (
                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--sr-sev-critical)] animate-pulse" title="Under attack" />
                              )}
                              {simRunningDot && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                                  style={{ backgroundColor: 'var(--sr-nav-simulator)' }}
                                  title="Simulation active"
                                />
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
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          {!sidebarCollapsed && (
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
                  points={chartData
                    .map((d, i) => {
                      const maxP = Math.max(1, Math.max(...chartData.map((c) => c.packets), 1));
                      return \`\${(i / Math.max(1, chartData.length - 1)) * 200},\${18 - Math.min(16, (d.packets / maxP) * 16) - 1}\`;
                    })
                    .join(' ')}
                />
              </svg>
            </div>
          )}

          <div className={\`\${sidebarCollapsed ? 'mx-2' : 'mx-5'} flex \${sidebarCollapsed ? 'justify-center' : 'items-center gap-3'} pt-4 border-t border-[var(--sr-border-hairline)]\`}>
            <div className="p-2 bg-[var(--sr-bg-surface-raised)] rounded-[var(--sr-radius-sm)] text-[var(--sr-text-secondary)] shrink-0">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-semibold text-[var(--sr-text-primary)] truncate">{username || 'analyst'}</p>
                <span className="text-[11px] text-[var(--sr-text-muted)] capitalize">{role || 'analyst'}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleSidebar}
            className={\`\${sidebarCollapsed ? 'mx-2' : 'mx-5'} mt-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] cursor-pointer transition-colors\`}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative z-10 bg-transparent">
        {banner}

        <header className="border-b border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md px-8 py-4 flex items-center justify-between shrink-0">
          {isSimulator ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <Crosshair
                  className="w-5 h-5 text-[var(--sr-accent)]"
                  style={{
                    animation: 'spin-slow 8s linear infinite',
                    animationPlayState: simRunning ? 'paused' : 'running',
                  }}
                />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--sr-text-primary)] leading-none mb-1">
                    {TITLE.simulator}
                  </h2>
                  <span className="text-xs text-[var(--sr-text-secondary)] block leading-tight">
                    Controlled attack replay — isolated test environment — no live network traffic generated
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-[var(--sr-bg-surface-raised)] px-2.5 py-1 rounded-full">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Posture</span>
                  <StatusBadge status={postureLabel} className="!border-none !p-0 !bg-transparent" />
                </div>
                <div className="flex items-center gap-1.5 bg-[var(--sr-bg-surface-raised)] px-2.5 py-1 rounded-full">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Telemetry</span>
                  <StatusBadge
                    status={
                      !wsConnected ? 'Disconnected' : lastHeartbeat && Date.now() - lastHeartbeat < 8000 ? 'Connected' : 'Syncing'
                    }
                    className="!border-none !p-0 !bg-transparent"
                  />
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full border border-[var(--sr-border-hairline)]"
                  style={
                    simRunning
                      ? { color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }
                      : { color: 'var(--sr-text-muted)', backgroundColor: 'var(--sr-bg-surface-raised)' }
                  }
                >
                  <span className={\`w-1.5 h-1.5 rounded-full \${simRunning ? 'bg-[var(--sr-accent)] animate-pulse' : 'bg-[var(--sr-text-muted)]'}\`} />
                  {simRunning ? 'Simulation active' : 'Simulation idle'}
                </span>
                <div className="h-5 w-[1px] bg-[var(--sr-border-hairline)] mx-1" />
                <button
                  type="button"
                  onClick={onToggleSound}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={soundEnabled ? 'Mute Critical alert sound' : 'Unmute Critical alert sound'}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--sr-accent)]" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
                </button>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
                >
                  {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
                </button>
                <GlowButton variant="ghost" onClick={onLogout} className="px-2.5 py-1.5 text-xs">
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </GlowButton>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div>
                <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">{TITLE[activeTab]}</h2>
                <span className="text-xs text-[var(--sr-text-muted)]">
                  Bahria University Karachi Campus — BS(IT) Final Year Project
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium">Posture</span>
                  <StatusBadge status={postureLabel} />
                </div>
                <StatusBadge
                  status={
                    !wsConnected ? 'Disconnected' : lastHeartbeat && Date.now() - lastHeartbeat < 8000 ? 'Connected' : 'Syncing'
                  }
                />
                {simRunning && <StatusBadge status="ACTIVE" />}
                <div className="h-5 w-[1px] bg-[var(--sr-border-hairline)] mx-1" />
                <button
                  type="button"
                  onClick={onToggleSound}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={soundEnabled ? 'Mute Critical alert sound' : 'Unmute Critical alert sound'}
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[var(--sr-accent)]" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
                </button>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="p-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] transition-all cursor-pointer"
                  title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
                >
                  {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
                </button>
                <GlowButton variant="ghost" onClick={onLogout} className="px-2.5 py-1.5 text-xs">
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </GlowButton>
              </div>
            </div>
          )}
        </header>

        <section className="flex-1 overflow-y-auto p-8 relative">
          <AnimatePresence mode="wait">
            <PageTransition motionKey={location.pathname} className="h-full">
              {children}
            </PageTransition>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
};

export default AppShell;
`,
);

console.log('AppShell written');

// Clean raw extracts for pages
function cleanRaw(name) {
  let t = read(`pages/dashboard/_raw_${name}.txt`);
  // drop trailing IIFE close / comments bleeding into next view
  t = t.replace(/\n\s*\)\}\s*$/, '');
  t = t.replace(/\n\s*\}\)\(\)\}\s*$/, '');
  t = t.replace(/\n\s*\/\* =+\s*\n\s*VIEW C:[\s\S]*$/, '');
  return t.trimEnd() + '\n';
}

const pageMeta = [
  { file: 'LiveDetectionPage.tsx', name: 'LiveDetectionPage', raw: 'live', wrap: 'div' },
  { file: 'SimulatorPage.tsx', name: 'SimulatorPage', raw: 'simulator', wrap: 'iife' },
  { file: 'AlertHistoryPage.tsx', name: 'AlertHistoryPage', raw: 'history', wrap: 'div' },
  { file: 'ModelInsightsPage.tsx', name: 'ModelInsightsPage', raw: 'insights', wrap: 'div' },
  { file: 'AiAssistantPage.tsx', name: 'AiAssistantPage', raw: 'ai', wrap: 'div' },
];

const pageImports = `import React from 'react';
import { useDashboard } from '../../dashboard/DashboardContext';
import GlowPanel from '../../components/ui/GlowPanel';
import GlowButton from '../../components/ui/GlowButton';
import StatusBadge from '../../components/ui/StatusBadge';
import AttackIcon, { type AttackIconType } from '../../components/ui/AttackIcons';
import Logomark from '../../components/ui/Logomark';
import {
  Activity, Play, Square, ArrowRight, Sparkles, Search, Filter, ChevronLeft, ChevronRight,
  Sliders, Download, Send, TriangleAlert, Ghost, Plus, Trash2, Pencil, Check, Pin, PinOff, X
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, type TooltipValueType
} from 'recharts';
import { CLASS_LABELS, CLASS_ABBREVIATIONS, SCENARIO_DETAILS, CASCADE_THROUGHPUT_CAPS, PCAP_UI_EXTENSION } from '../../dashboard/constants';
import { compactCount, seqRampColor, makeTruncatedYAxisTick, groupConversationsByDate } from '../../dashboard/utils';
`;

for (const p of pageMeta) {
  let body = cleanRaw(p.raw);
  if (p.wrap === 'iife') {
    // body already starts with const activeScenarioInfo... and ends with ); from return
    // Ensure it is wrapped as IIFE component body
    if (!body.trimStart().startsWith('const ') && !body.trimStart().startsWith('let ')) {
      // ok
    }
    // Remove trailing `);` that closed the return of IIFE if present alone - keep structure:
    // Original was: (() => { ... return (...); })()
    // We want: { ... return (...); } inside function component
    body = body.replace(/\n\s*\/\* =+[\s\S]*$/, '');
    if (body.includes('return (')) {
      // already has return from IIFE
      write(
        `pages/${p.file}`,
        `${pageImports}\n\n/** ${p.name} — extracted from monolithic Dashboard (Phase 3). */\nexport const ${p.name}: React.FC = () => {\n  const d = useDashboard();\n  const {\n    // re-bind dashboard API onto local names used by the extracted JSX\n    ...rest\n  } = d;\n  void rest;\n  withDashboardLocals(d, () => {\n    /* locals applied below via destructure */\n  });\n\n${buildDestructure()}\n\n${body}\n};\n\nexport default ${p.name};\n`,
      );
      continue;
    }
  }

  write(
    `pages/${p.file}`,
    `${pageImports}\n\n/** ${p.name} — extracted from monolithic Dashboard (Phase 3). */\nexport const ${p.name}: React.FC = () => {\n${buildDestructure()}\n\n  return (\n${body}\n  );\n};\n\nexport default ${p.name};\n`,
  );
}

function buildDestructure() {
  // Pages pull the full dashboard API; unused locals are fine for Phase 3 extract.
  return `  const {
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
  } = useDashboard();
  void token; void logout; void reconnectAttempt; void reconnectWs; void playAlertSound;
  void CASCADE_THROUGHPUT_CAPS; void PCAP_UI_EXTENSION;`;
}

function withDashboardLocals() {}

console.log('Pages emitted (may need TS polish)');
console.log('Next: transform DashboardLayout into context provider');
