import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src');

const IMPORTS = `/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck — Phase 3 mechanical extract; pages bind the full dashboard API.
import React from 'react';
import { useDashboard } from '../dashboard/DashboardContext';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import StatusBadge from '../components/ui/StatusBadge';
import AttackIcon, { type AttackIconType } from '../components/ui/AttackIcons';
import Logomark from '../components/ui/Logomark';
import {
  Activity, Play, Square, ArrowRight, Sparkles, Search, Filter, ChevronLeft, ChevronRight,
  Sliders, Download, Send, TriangleAlert, Ghost, Plus, Trash2, Pencil, Check, Pin, PinOff, X
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar
} from 'recharts';
import {
  CLASS_LABELS, CLASS_ABBREVIATIONS, SCENARIO_DETAILS, CASCADE_THROUGHPUT_CAPS, PCAP_UI_EXTENSION,
} from '../dashboard/constants';
import { compactCount, seqRampColor, makeTruncatedYAxisTick, groupConversationsByDate } from '../dashboard/utils';
`;

const BIND = `  const d = useDashboard();
  // Local aliases preserve the extracted JSX identifiers.
  const {
    user, wsConnected, lastHeartbeat, theme, setTheme, soundEnabled, setSoundEnabled, screenFlash,
    showExportModal, setShowExportModal, exportFormat, setExportFormat, exportSeverity, setExportSeverity,
    exportAttackType, setExportAttackType, liveEvents, packetsAnalyzed, attacksCount, selectedDetection,
    setSelectedDetection, chartData, packetsPerSecond, liveTiers, attackCounts, topTalkers, activeVectors,
    hoveredVector, setHoveredVector, simStatus, selectedScenario, setSelectedScenario, scenarios,
    loadingScenarios, simRate, setSimRate, simDuration, setSimDuration, simError, setSimError, ppsHistory,
    localElapsed, alerts, expandedAlertId, setExpandedAlertId, filterAttack, setFilterAttack, filterTier,
    setFilterTier, filterSeverity, setFilterSeverity, filterDateFrom, setFilterDateFrom, filterDateTo,
    setFilterDateTo, historyPage, setHistoryPage, loadingHistory, smoteData, metricsData, loadingMetrics,
    selectedCMModel, setSelectedCMModel, numFeaturesToShow, setNumFeaturesToShow, hoveredCMCell,
    setHoveredCMCell, smoteViewMode, setSmoteViewMode, cmViewMode, setCmViewMode, showPacketsSeries,
    setShowPacketsSeries, showThreatsSeries, setShowThreatsSeries, activeAlertBanner, setActiveAlertBanner,
    benignBaselines, aiExplanation, loadingExplanation, messages, chatInput, setChatInput, aiTyping,
    geminiAvailable, inputFocused, setInputFocused, conversations, loadingConversations,
    loadingConversationDetail, activeConversationId, incognito, renamingId, setRenamingId, renameDraft,
    setRenameDraft, confirmDeleteId, chatContainerRef, bottomRef, chatInputRef, handleChatScroll,
    handleStartSim, handleStopSim, handleExportReport, getSmoteChartData, sendChatMessage, handleSendChat,
    fetchConversations, startNewConversation, loadConversation, requestDeleteConversation,
    cancelDeleteConversation, confirmDeleteConversation, togglePinConversation, commitRename,
    toggleIncognito, getComparisonData, postureScore, postureHistory, postureStatus, renderConfusionMatrix,
  } = d;
  void d;
`;

function loadRaw(name) {
  let t = fs.readFileSync(path.join(src, 'pages/dashboard/_raw_' + name + '.txt'), 'utf8');
  t = t.replace(/\r\n/g, '\n');
  return t.trimEnd();
}

function writePage(file, componentName, body, { iife = false } = {}) {
  const header =
    IMPORTS +
    '\n\n/**\n * ' +
    componentName +
    '\n * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.\n' +
    ' * Phase 4 can mount R3F lattice scenes into this page without changing routing.\n */\n' +
    'export const ' +
    componentName +
    ': React.FC = () => {\n' +
    BIND +
    '\n';

  let mid;
  if (iife) {
    mid = body.replace(/\n\s*\}\)\(\)\}\s*$/, '\n') + '\n';
  } else {
    mid = '  return (\n' + body + '\n  );\n';
  }

  const content = header + mid + '};\n\nexport default ' + componentName + ';\n';
  fs.writeFileSync(path.join(src, 'pages', file), content, 'utf8');
  console.log('wrote', file, content.split('\n').length);
}

writePage('LiveDetectionPage.tsx', 'LiveDetectionPage', loadRaw('live'));
writePage('SimulatorPage.tsx', 'SimulatorPage', loadRaw('simulator'), { iife: true });
writePage('AlertHistoryPage.tsx', 'AlertHistoryPage', loadRaw('history'));
writePage('ModelInsightsPage.tsx', 'ModelInsightsPage', loadRaw('insights'));
writePage('AiAssistantPage.tsx', 'AiAssistantPage', loadRaw('ai'));
console.log('done');
