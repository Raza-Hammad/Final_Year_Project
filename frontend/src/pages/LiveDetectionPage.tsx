/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck — Phase 3 mechanical extract; pages bind the full dashboard API.
import React, { useEffect, useMemo, useState } from 'react';
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
import ObservatoryCanvas from '../components/lattice/ObservatoryCanvas';
import { resolveNode } from '../components/lattice/topology';
import { WhatYoureSeeingNow, GuidedLearningTips } from '../components/learning/SimLearningCoach';


/**
 * LiveDetectionPage
 * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.
 * Phase 4 can mount R3F lattice scenes into this page without changing routing.
 */
export const LiveDetectionPage: React.FC = () => {
  const d = useDashboard();
  // Local aliases preserve the extracted JSX identifiers.
  const {
    user, wsConnected, lastHeartbeat, theme, setTheme, soundEnabled, setSoundEnabled, screenFlash,
    showExportModal, setShowExportModal, exportFormat, setExportFormat, exportSeverity, setExportSeverity,
    exportAttackType, setExportAttackType, liveEvents, packetsAnalyzed, attacksCount, selectedDetection,
    setSelectedDetection, chartData, packetsPerSecond, liveTiers, attackCounts, topTalkers, simStatus, selectedScenario, setSelectedScenario, scenarios,
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

  const [pinnedNode, setPinnedNode] = useState<string | null>(null);
  const [latticeFull, setLatticeFull] = useState(false);
  const isLive = !!simStatus.running || packetsPerSecond > 0;

  useEffect(() => {
    if (!latticeFull) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLatticeFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latticeFull]);

  // Clicking a host on the lattice filters the telemetry feed to flows touching it.
  const feedEvents = useMemo(() => {
    if (!pinnedNode) return liveEvents;
    return liveEvents.filter((evt) => {
      const dd = evt.data;
      if (!dd) return false;
      const isAtk = (dd.predicted_label || '').toUpperCase() !== 'BENIGN';
      return (
        resolveNode(dd.source_ip || 'unknown', dd.source_port || 0, 'src', isAtk).id === pinnedNode ||
        resolveNode(dd.dest_ip || 'unknown', dd.dest_port || 0, 'dst', isAtk).id === pinnedNode
      );
    });
  }, [liveEvents, pinnedNode]);

  return (
            <div className="flex flex-col gap-6 h-full">

              {/* Welcome — compact, typography-led */}
              <div className="relative shrink-0 overflow-hidden rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] px-6 py-5"
                style={{
                  background: 'linear-gradient(115deg, var(--sr-accent-soft) 0%, var(--sr-bg-surface) 48%, var(--sr-accent-2-soft) 100%)',
                }}
              >
                <Logomark className="pointer-events-none absolute -right-5 -top-6 h-32 w-32 opacity-[0.07]" />
                <div className="relative flex flex-col gap-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sr-accent-2)]">
                    Live Detection
                  </p>
                  <h2
                    className="text-xl font-bold tracking-tight sm:text-2xl"
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
                  <p className="max-w-lg text-sm text-[var(--sr-text-secondary)]">
                    {postureStatus.label === 'SECURE'
                      ? 'Every screened flow is resolving clean — the cascade is quiet and confident.'
                      : postureStatus.description}
                  </p>
                </div>
              </div>

              {simStatus.running && (
                <div className="shrink-0 space-y-3">
                  <WhatYoureSeeingNow
                    mode={simStatus.mode === 'replay' ? 'replay' : 'csv'}
                    severityHint={
                      simStatus.mode === 'replay'
                        ? null
                        : (SCENARIO_DETAILS[selectedScenario]?.severity || scenarios?.[selectedScenario]?.severity_hint)
                    }
                    attacksDetected={simStatus.attacks_detected || attacksCount || 0}
                    showLiveLink={false}
                    compact
                  />
                  <GuidedLearningTips
                    attacksDetected={simStatus.attacks_detected || attacksCount || 0}
                    aiQueriesRemaining={aiQueriesRemaining}
                    aiQueryLimit={aiQueryLimit}
                    aiUnlimited={aiUnlimited}
                    variant="live"
                  />
                </div>
              )}

              {/* Living Lattice v2 — the hero. Real WebSocket events, real IPs, lab VM zone. */}
              <div
                className={
                  latticeFull
                    ? 'fixed inset-0 z-[60] flex flex-col gap-3 bg-[var(--sr-bg-page)] p-4'
                    : 'grid shrink-0 grid-cols-1 items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_300px]'
                }
              >
                <GlowPanel className={`relative flex min-w-0 flex-col overflow-hidden p-3 sm:p-4 ${latticeFull ? 'min-h-0 flex-1' : ''}`}>
                  <div className="z-10 mb-2 flex w-full shrink-0 items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-[var(--sr-accent)]" />
                      <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
                        Living Lattice
                      </h3>
                      <span className="hidden text-[10px] text-[var(--sr-text-muted)] sm:inline">
                        · Network observatory · real telemetry, real IPs
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {isLive ? (
                        <>
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--sr-accent)]" />
                          <span className="font-medium text-[var(--sr-accent)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            Live · {packetsPerSecond} flows/s
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--sr-text-muted)]" />
                          <span className="font-medium text-[var(--sr-text-muted)]">Standby</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="relative min-h-0 flex-1">
                    <ObservatoryCanvas
                      className={latticeFull ? 'h-full w-full' : 'h-[min(68vh,640px)] min-h-[420px] w-full'}
                      pinnedNode={pinnedNode}
                      onPinNode={setPinnedNode}
                      onInspect={(det) => setSelectedDetection(det)}
                      fullscreen={latticeFull}
                      onToggleFullscreen={() => setLatticeFull((v) => !v)}
                    />
                  </div>
                </GlowPanel>

                {/* Threat Posture — its own panel beside the lattice (never overlays it). */}
                {!latticeFull && (
                  <GlowPanel className="flex min-w-0 flex-col p-4 sm:p-5" data-testid="threat-posture-panel">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
                        Threat Posture
                      </h3>
                      <span className="text-[10px] text-[var(--sr-text-muted)]">Rolling · last 2 min</span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,240px)_1fr] xl:grid-cols-1">
                      <div className="mx-auto w-full max-w-[240px]">
                        <svg viewBox="0 0 200 118" className="block w-full overflow-visible" role="img" aria-label={`Threat posture ${postureScore} percent, ${postureStatus.label}`}>
                          <defs>
                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="var(--sr-sev-info)" />
                              <stop offset="50%" stopColor="var(--sr-sev-medium)" />
                              <stop offset="100%" stopColor="var(--sr-sev-critical)" />
                            </linearGradient>
                          </defs>
                          <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="url(#gaugeGradient)" strokeWidth="12" strokeLinecap="round" opacity="0.2" />
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
                          <g transform="translate(100, 100)">
                            <line
                              x1="0" y1="0" x2="0" y2="-66"
                              stroke="var(--sr-text-primary)" strokeWidth="2" strokeLinecap="round"
                              style={{ transformOrigin: '0px 0px', transform: `rotate(${-90 + (postureScore / 100) * 180}deg)`, transition: 'transform 0.8s ease-in-out' }}
                            />
                            <circle cx="0" cy="0" r="4.5" fill="var(--sr-text-primary)" />
                          </g>
                          <text x="20" y="116" fontSize="9" textAnchor="middle" fill="var(--sr-text-muted)">0</text>
                          <text x="180" y="116" fontSize="9" textAnchor="middle" fill="var(--sr-text-muted)">100</text>
                        </svg>
                        <div className="-mt-3 text-center">
                          <p className="text-3xl font-semibold leading-none text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--sr-font-display)' }}>
                            {postureScore}%
                          </p>
                          <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold">
                            <span className={`h-2 w-2 rounded-full ${postureStatus.dotColor}`} />
                            <span className={postureStatus.color}>{postureStatus.label}</span>
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0 space-y-3">
                        <p className="text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">{postureStatus.description}</p>
                        <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="block h-8 w-full overflow-visible" aria-hidden="true">
                          <polyline
                            fill="none" stroke="var(--sr-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
                            vectorEffect="non-scaling-stroke"
                            points={postureHistory.map((v, i) => `${(i / Math.max(1, postureHistory.length - 1)) * 120},${26 - (v / 100) * 24}`).join(' ')}
                          />
                        </svg>
                        <dl className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-[var(--sr-radius-sm)] bg-[var(--sr-bg-surface-raised)] px-2.5 py-2">
                            <dt className="text-[10px] text-[var(--sr-text-muted)]">Flagged</dt>
                            <dd className="mt-0.5 text-sm font-semibold text-[var(--sr-sev-critical)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{attacksCount.toLocaleString()}</dd>
                          </div>
                          <div className="rounded-[var(--sr-radius-sm)] bg-[var(--sr-bg-surface-raised)] px-2.5 py-2">
                            <dt className="text-[10px] text-[var(--sr-text-muted)]">Screened</dt>
                            <dd className="mt-0.5 text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{packetsAnalyzed.toLocaleString()}</dd>
                          </div>
                          <div className="col-span-2 rounded-[var(--sr-radius-sm)] bg-[var(--sr-bg-surface-raised)] px-2.5 py-2">
                            <dt className="text-[10px] text-[var(--sr-text-muted)]">Top talker</dt>
                            <dd className="mt-0.5 truncate text-xs font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {Object.keys(topTalkers).length > 0
                                ? `${Object.entries(topTalkers).sort((a, b) => b[1] - a[1])[0][0]} (${Object.entries(topTalkers).sort((a, b) => b[1] - a[1])[0][1]})`
                                : '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </GlowPanel>
                )}
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
                      <span className="text-[11px] text-[var(--sr-text-muted)] hidden sm:inline">Ingress rate vs flagged anomalies</span>
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
                  {feedEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--sr-text-muted)] text-sm">
                      {pinnedNode ? 'No recent flows touch this host.' : 'Awaiting live telemetry packets...'}
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
                        {feedEvents.map((evt, i) => {
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
  );
};

export default LiveDetectionPage;
