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
import CascadeMachine from '../components/lattice/CascadeMachine';


/**
 * ModelInsightsPage
 * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.
 * Phase 4 can mount R3F lattice scenes into this page without changing routing.
 */
export const ModelInsightsPage: React.FC = () => {
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

                  {/* Living Lattice cascade machine + rationale */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                    <GlowPanel className="lg:col-span-3 p-5" id="cascade-machine">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-4 flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">AI Cascade Machine</h3>
                        <span className="text-[10px] text-[var(--sr-text-muted)]">
                          Confident flows exit early · uncertain flows escalate
                        </span>
                      </div>
                      <CascadeMachine
                        liveTiers={liveTiers}
                        pinnedDetection={selectedDetection ?? null}
                        liveDetection={liveEvents.find((evt) => evt.event === 'detection' && evt.data)?.data ?? null}
                        height={300}
                        enableDemo
                      />
                      <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-[var(--sr-text-secondary)]">
                        <div className="p-3 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-0.5" style={{ color: 'var(--sr-cat-1)' }}>Tier 1 · ≥ 0.85</p>
                          <span>LightGBM screen</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--sr-text-muted)] hidden md:block shrink-0" />
                        <div className="p-3 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-0.5" style={{ color: 'var(--sr-cat-2)' }}>Tier 2 · ≥ 0.85</p>
                          <span>Random Forest</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--sr-text-muted)] hidden md:block shrink-0" />
                        <div className="p-3 bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] text-center flex-1 w-full md:w-auto">
                          <p className="font-semibold mb-0.5" style={{ color: 'var(--sr-cat-3)' }}>Tier 3 · vote</p>
                          <span>Expert ensemble</span>
                        </div>
                      </div>
                    </GlowPanel>

                    <GlowPanel className="lg:col-span-2 p-5 flex flex-col justify-between">
                      <div className="pb-3 border-b border-[var(--sr-border-hairline)] mb-3">
                        <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]">Why a Cascade?</h3>
                      </div>
                      <ol className="flex-1 space-y-3.5">
                        {[
                          {
                            n: 1,
                            title: 'The cost and accuracy problem',
                            body: 'Running the biggest model on every flow is expensive; running only a small one misses the awkward cases. Most traffic is easy, a little is not — so spend effort where it is needed.',
                          },
                          {
                            n: 2,
                            title: 'The 0.85 gate and early exit',
                            body: 'Each tier reports how sure it is of its top answer. At 85% or more the verdict is final and the flow leaves immediately — benign or attack. Below that it escalates.',
                          },
                          {
                            n: 3,
                            title: 'Why this order',
                            body: 'LightGBM goes first for accuracy, Random Forest second because it is fast and explainable, and XGBoost last inside a weighted vote (0.2 / 0.3 / 0.5). See the rationale card below.',
                          },
                          {
                            n: 4,
                            title: 'Honest numbers',
                            body: 'On a 200k-flow sample about 99.7% finish at Tier 1. Only ~0.3% reach Tier 3, mostly Web Attacks, and Tier 3 is right only ~28% of the time on that hard residue. The demo includes misses on purpose.',
                          },
                        ].map((s) => (
                          <li key={s.n} className="flex gap-2.5">
                            <span
                              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                              style={{ backgroundColor: 'var(--sr-accent-soft)', color: 'var(--sr-accent)' }}
                            >
                              {s.n}
                            </span>
                            <div>
                              <p className="text-[11px] font-semibold text-[var(--sr-text-primary)]">{s.title}</p>
                              <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)] mt-0.5">{s.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <button
                        type="button"
                        onClick={() => document.getElementById('cascade-machine')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-accent)] px-3 py-2 text-[11px] font-semibold text-[var(--sr-accent)] transition-colors hover:bg-[var(--sr-accent-soft)]"
                      >
                        Explore it yourself — try Demo traffic
                        <ArrowRight className="h-3 w-3" />
                      </button>
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
  );
};

export default ModelInsightsPage;
