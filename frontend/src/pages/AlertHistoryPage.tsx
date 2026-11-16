/* eslint-disable @typescript-eslint/no-unused-vars */
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
  CLASS_LABELS, CLASS_ABBREVIATIONS, SCENARIO_DETAILS, CASCADE_THROUGHPUT_CAPS,
} from '../dashboard/constants';
import { compactCount, seqRampColor, makeTruncatedYAxisTick, groupConversationsByDate } from '../dashboard/utils';


/**
 * AlertHistoryPage
 * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.
 * Phase 4 can mount R3F lattice scenes into this page without changing routing.
 */
export const AlertHistoryPage: React.FC = () => {
  const d = useDashboard();
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
    aiAvailable, aiQueriesRemaining, aiQueryLimit, aiUnlimited, inputFocused, setInputFocused, conversations, loadingConversations,
    loadingConversationDetail, activeConversationId, incognito, renamingId, setRenamingId, renameDraft,
    setRenameDraft, confirmDeleteId, chatContainerRef, bottomRef, chatInputRef, handleChatScroll,
    handleStartSim, handleStopSim, handleExportReport, getSmoteChartData, sendChatMessage, handleSendChat,
    fetchConversations, startNewConversation, loadConversation, requestDeleteConversation,
    cancelDeleteConversation, confirmDeleteConversation, togglePinConversation, commitRename,
    toggleIncognito, getComparisonData, postureScore, postureHistory, postureStatus, renderConfusionMatrix,
  } = d;
  void d;

  return (
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
  );
};

export default AlertHistoryPage;
