/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck — Phase 3 mechanical extract; pages bind the full dashboard API.
import React from 'react';
import { Link } from 'react-router-dom';
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
import {
  ScenarioLearnCard,
  WhatYoureSeeingNow,
  GuidedLearningTips,
} from '../components/learning/SimLearningCoach';


/**
 * SimulatorPage
 * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.
 * Phase 4 can mount R3F lattice scenes into this page without changing routing.
 */
export const SimulatorPage: React.FC = () => {
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


            const activeScenarioInfo = scenarios && selectedScenario ? scenarios[selectedScenario] : null;
            const armedScenarioDetails = selectedScenario && SCENARIO_DETAILS[selectedScenario] 
              ? { display_name: scenarios?.[selectedScenario]?.display_name || 'ATTACK', ...SCENARIO_DETAILS[selectedScenario] }
              : null;
            
            // Lookups for state badge in Live Status panel
            let stateDot = 'bg-[var(--sr-text-muted)]';
            let stateText = 'Standby';
            let stateColorVar = '--sr-text-muted';
            let stateBg = 'var(--sr-bg-surface-raised)';

            if (simStatus.running) {
              stateDot = 'bg-[var(--sr-accent)] animate-pulse';
              stateText = simStatus.mode === 'replay' ? 'Lab session' : 'Transmitting';
              stateColorVar = '--sr-accent';
              stateBg = 'var(--sr-accent-soft)';
            } else if (simStatus.packets_sent > 0 && !simStatus.running) {
              stateDot = 'bg-[var(--sr-sev-info)]';
              stateText = 'Completed';
              stateColorVar = '--sr-sev-info';
              stateBg = 'rgba(12, 163, 12, 0.08)';
            }

            const isReplayMode = simStatus.mode === 'replay';
            
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
                  <GlowPanel className="flex flex-col justify-between p-6 md:col-span-2">
                    <div className="space-y-6 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-3 border-b border-[var(--sr-border-hairline)] mb-4">
                          <h3 className="text-sm font-semibold text-[var(--sr-text-primary)] flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-[var(--sr-accent)]" />
                            Configure Simulator Preset
                          </h3>
                          <span className="text-[11px] text-[var(--sr-accent)] px-2 py-0.5 rounded-full bg-[var(--sr-accent-soft)]">
                            System live
                          </span>
                        </div>
                        <p className="text-xs text-[var(--sr-text-secondary)] mb-6">Pick a threat scenario to stream through the cascade engine.</p>
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-2.5">Select scenario preset</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {loadingScenarios || !scenarios ? (
                            Array.from({ length: 10 }).map((_, idx) => (
                              <div
                                key={idx}
                                className="animate-pulse bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] h-[110px] p-3.5 flex flex-col justify-between"
                              >
                                <div className="flex justify-between items-center w-full">
                                  <div className="w-2 h-2 bg-[var(--sr-border-hover)] rounded-full" />
                                  <div className="w-4.5 h-4.5 bg-[var(--sr-border-hover)] rounded" />
                                </div>
                                <div className="space-y-1.5 w-full">
                                  <div className="w-16 h-2 bg-[var(--sr-border-hover)] rounded" />
                                  <div className="w-full h-1.5 bg-[var(--sr-border-hover)] rounded" />
                                </div>
                              </div>
                            ))
                          ) : (
                            Object.entries(scenarios).map(([key, info]) => {
                              const isSelected = selectedScenario === key;
                              const sevVar =
                                info.severity_hint === 'Critical' ? '--sr-sev-critical' :
                                info.severity_hint === 'High' ? '--sr-sev-high' :
                                info.severity_hint === 'Medium' ? '--sr-sev-medium' :
                                '--sr-sev-info';

                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => { setSelectedScenario(key); setSimError(null); }}
                                  className="w-full text-left transition-all outline-none cursor-pointer select-none group relative"
                                >
                                  <div
                                    className={`relative p-3 flex flex-col justify-between min-h-[110px] rounded-[var(--sr-radius-sm)] border transition-all duration-200 ${
                                      isSelected
                                        ? 'bg-[var(--sr-accent-soft)] border-[var(--sr-accent)]'
                                        : 'bg-[var(--sr-bg-surface)] hover:bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] hover:border-[var(--sr-border-hover)]'
                                    }`}
                                  >
                                    {/* ARMED indicator */}
                                    {isSelected && (
                                      <span className="absolute top-1.5 right-1.5 text-[9px] font-medium text-[var(--sr-accent)]">
                                        Armed
                                      </span>
                                    )}

                                    {/* TOP ROW: severity dot + icon chip */}
                                    <div className="flex justify-between items-center w-full">
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: `var(${sevVar})` }}
                                        title={`Severity: ${info.severity_hint}`}
                                      />
                                      <span
                                        className="flex items-center justify-center w-7 h-7 rounded-full transition-transform duration-200 group-hover:scale-105"
                                        style={{ backgroundColor: `color-mix(in srgb, var(${sevVar}) 12%, transparent)` }}
                                      >
                                        <AttackIcon type={key as AttackIconType} className="w-3.5 h-3.5" style={{ color: `var(${sevVar})` }} />
                                      </span>
                                    </div>

                                    {/* MIDDLE: Display name */}
                                    <div className="mt-2 w-full">
                                      <p className={`font-semibold text-[11px] leading-tight ${isSelected ? 'text-[var(--sr-text-primary)]' : 'text-[var(--sr-text-secondary)]'}`}>
                                        {info.display_name}
                                      </p>
                                    </div>

                                    {/* BOTTOM: Description + severity label, stacked to give the description its full width to wrap in */}
                                    <div className="flex flex-col gap-1.5 mt-2.5 w-full">
                                      <span className="text-[11px] text-[var(--sr-text-muted)] block line-clamp-2 leading-tight">
                                        {info.description}
                                      </span>
                                      <span
                                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full leading-none self-start"
                                        style={{ color: `var(${sevVar})`, backgroundColor: `color-mix(in srgb, var(${sevVar}) 10%, transparent)` }}
                                      >
                                        {info.severity_hint}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Attack Profile Preview Panel */}
                      <div className={`transition-all duration-300 ease-in-out overflow-hidden border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] bg-[var(--sr-bg-surface-raised)] ${
                        selectedScenario
                          ? 'max-h-[480px] opacity-100 p-4 mt-2'
                          : 'max-h-[100px] opacity-90 p-4 mt-2'
                      }`}>
                        {!selectedScenario ? (
                          <div className="h-12 flex items-center justify-center text-[var(--sr-text-muted)] text-xs">
                            ← Select a scenario to view its attack profile
                          </div>
                        ) : (
                          (() => {
                            const info = SCENARIO_DETAILS[selectedScenario] || SCENARIO_DETAILS.benign_baseline;
                            const estPackets = simRate * simDuration;
                            const estDetections = selectedScenario === 'benign_baseline'
                              ? Math.round(estPackets * 0.02)
                              : Math.round(estPackets * 0.95);

                            // Intensity relative to honest ~44 flows/s cascade throughput.
                            let intensityLabel = 'Low';
                            let intensityWidth = '25%';
                            let intensityColorVar = '--sr-sev-info';
                            if (simRate >= 35) {
                              intensityLabel = 'At capacity';
                              intensityWidth = '100%';
                              intensityColorVar = '--sr-sev-critical';
                            } else if (simRate >= 16) {
                              intensityLabel = 'High';
                              intensityWidth = '85%';
                              intensityColorVar = '--sr-sev-high';
                            } else if (simRate >= 6) {
                              intensityLabel = 'Medium';
                              intensityWidth = '60%';
                              intensityColorVar = '--sr-sev-medium';
                            }

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs align-top">
                                {/* Left Half: Summary */}
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <h4 className="text-sm font-semibold" style={{ color: info.color }}>
                                      {scenarios?.[selectedScenario]?.display_name || info.severity} scenario profile
                                    </h4>
                                    <span
                                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
                                      style={{ color: info.color, backgroundColor: `color-mix(in srgb, ${info.color} 10%, transparent)` }}
                                    >
                                      {info.severity}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[var(--sr-text-secondary)] leading-relaxed">
                                    {scenarios?.[selectedScenario]?.description || 'Configuration profile preview.'}
                                  </p>

                                  {/* Data Chips Row */}
                                  <div className="flex flex-wrap gap-2 text-[10px]">
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Severity: <span className="font-medium" style={{ color: info.color }}>{info.severity}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Type: <span className="font-medium text-[var(--sr-text-primary)]">{info.type}</span>
                                    </span>
                                    <span className="px-2 py-0.5 bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] rounded-full">
                                      Expected tier hit: <span className="font-medium text-[var(--sr-accent)]">{info.tier}</span>
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-[var(--sr-text-secondary)] leading-snug border-l-2 border-[var(--sr-accent)]/40 pl-2">
                                    <span className="text-[var(--sr-text-primary)] font-medium">Threat vector:</span> {info.vector}
                                  </p>

                                  <ScenarioLearnCard
                                    scenarioKey={selectedScenario}
                                    displayName={scenarios?.[selectedScenario]?.display_name}
                                  />
                                </div>

                                {/* Right Half: Estimated Readout */}
                                <div className="space-y-3 border-t md:border-t-0 md:border-l border-[var(--sr-border-hairline)] pt-3 md:pt-0 md:pl-6 flex flex-col justify-between">
                                  <div>
                                    <h4 className="text-[11px] font-medium text-[var(--sr-text-muted)] mb-2.5">
                                      Estimated simulation readout
                                    </h4>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. packets</span>
                                        <span className="text-xs text-[var(--sr-text-primary)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{estPackets.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. alerts</span>
                                        <span className="text-xs text-[var(--sr-sev-critical)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{estDetections.toLocaleString()}</span>
                                      </div>
                                      <div className="bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5">
                                        <span className="text-[10px] text-[var(--sr-text-muted)] block">Est. duration</span>
                                        <span className="text-xs text-[var(--sr-text-primary)] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{simDuration}s</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Intensity Bar */}
                                  <div className="space-y-1 mt-1">
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="text-[var(--sr-text-muted)]">Simulation intensity</span>
                                      <span className="font-medium text-[var(--sr-text-primary)]">{intensityLabel}</span>
                                    </div>
                                    <div className="w-full bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: intensityWidth, backgroundColor: `var(${intensityColorVar})` }}
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
                      <div className="h-[1px] bg-[var(--sr-border-hairline)] my-4" />

                      {/* Rate & Duration Controls */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        {/* Rate Control Group */}
                        <div className="md:border-r border-[var(--sr-border-hairline)] pr-0 md:pr-6 space-y-3">
                          <div>
                            <span className="text-[11px] font-medium text-[var(--sr-text-secondary)] block leading-none">Stream rate</span>
                            <span className="text-[10px] text-[var(--sr-text-muted)]">
                              target flows / sec · real cascade ~{CASCADE_THROUGHPUT_CAPS.uiMax} flows/s
                            </span>
                          </div>

                          {/* Rate Presets — UI max mirrors honest single-thread inference (~44 flows/s) */}
                          <div className="flex gap-2">
                            {[
                              { label: 'Slow · 2', val: 2 },
                              { label: 'Normal · 5', val: 5 },
                              { label: 'Fast · 15', val: 15 },
                              { label: `Max · ${CASCADE_THROUGHPUT_CAPS.maxPreset}`, val: CASCADE_THROUGHPUT_CAPS.maxPreset }
                            ].map((p) => (
                              <GlowButton
                                key={p.val}
                                type="button"
                                variant="ghost"
                                onClick={() => setSimRate(p.val)}
                                className={`px-2 py-1 text-[10px] leading-none border rounded-[var(--sr-radius-sm)] transition-all ${
                                  simRate === p.val
                                    ? '!text-[var(--sr-accent)] !border-[var(--sr-accent)] bg-[var(--sr-accent-soft)]'
                                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                                }`}
                              >
                                {p.label}
                              </GlowButton>
                            ))}
                          </div>

                          <input
                            type="number"
                            min="1"
                            max={CASCADE_THROUGHPUT_CAPS.uiMax}
                            value={simRate}
                            onChange={(e) => setSimRate(Math.min(CASCADE_THROUGHPUT_CAPS.uiMax, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] p-2.5 text-xs text-[var(--sr-text-primary)] outline-none transition-all"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                          <p className="text-[10px] text-[var(--sr-text-muted)] leading-snug">
                            Cap {CASCADE_THROUGHPUT_CAPS.uiMax} flows/s matches measured cascade throughput. Higher API rates are rejected or will backlog — they are not sustained real-time inference.
                          </p>
                        </div>

                        {/* Duration Control Group */}
                        <div className="space-y-3">
                          <div>
                            <span className="text-[11px] font-medium text-[var(--sr-text-secondary)] block leading-none">Duration</span>
                            <span className="text-[10px] text-[var(--sr-text-muted)]">seconds</span>
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
                                className={`px-2.5 py-1 text-[10px] leading-none border rounded-[var(--sr-radius-sm)] transition-all ${
                                  simDuration === p.val
                                    ? '!text-[var(--sr-accent)] !border-[var(--sr-accent)] bg-[var(--sr-accent-soft)]'
                                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
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
                            className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] p-2.5 text-xs text-[var(--sr-text-primary)] outline-none transition-all"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-[1px] bg-[var(--sr-border-hairline)] my-4" />
                    </div>

                    {/* Action CTA Button */}
                    <div className="mt-6 z-10 relative">
                      {simStatus.running ? (
                        // RUNNING STATE: ABORT SIMULATION
                        <button
                          onClick={handleStopSim}
                          type="button"
                          className="relative w-full h-[52px] bg-[var(--sr-sev-critical)] rounded-[var(--sr-radius-md)] flex items-center justify-between px-5 cursor-pointer outline-none select-none overflow-hidden transition-all duration-300 text-xs shadow-[var(--sr-shadow-sm)]"
                        >
                          <div className="flex items-center gap-2 text-white font-semibold">
                            <Square className="w-4 h-4 fill-white" />
                            <span>{isReplayMode ? 'Stop lab session' : 'Abort simulation'}</span>
                          </div>
                          <span className="text-[10px] text-white/80 bg-white/10 px-2 py-0.5 rounded-full font-medium">
                            {isReplayMode
                              ? 'Isolated lab session'
                              : `${scenarios?.[selectedScenario]?.display_name || 'Attack'} stream active`}
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
                          const labelText = isArmed ? `${info?.display_name || 'Attack'} armed` : 'Select a scenario';

                          return (
                            <button
                              onClick={isArmed ? handleStartSim : undefined}
                              type="button"
                              disabled={!isArmed}
                              className={`group relative w-full h-[52px] rounded-[var(--sr-radius-md)] flex items-center justify-between pl-8 pr-5 outline-none select-none overflow-hidden transition-all duration-300 text-xs border ${
                                isArmed
                                  ? 'bg-[var(--sr-accent)] border-transparent cursor-pointer hover:bg-[var(--sr-accent-hover)] shadow-[var(--sr-shadow-sm)] text-white'
                                  : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] cursor-not-allowed text-[var(--sr-text-muted)]'
                              }`}
                            >
                              {/* Launch-console hazard stripe — armed-state-only physical control cue */}
                              {isArmed && (
                                <span
                                  className="absolute left-0 top-0 h-full w-5"
                                  style={{
                                    backgroundImage: 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 9px)',
                                  }}
                                  aria-hidden="true"
                                />
                              )}

                              <div className="flex items-center gap-2 font-semibold">
                                <Play className="w-4 h-4 fill-current" />
                                <span>Initiate simulation</span>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  isArmed
                                    ? 'text-white bg-white/15'
                                    : 'text-[var(--sr-text-muted)] bg-[var(--sr-bg-surface)]'
                                }`}
                              >
                                {isArmed && <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                                {labelText}
                              </span>
                            </button>
                          );
                        })()
                      )}

                      {simError && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[rgba(208,59,59,0.06)] p-3 text-xs text-[var(--sr-text-secondary)]">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sr-sev-critical)]" />
                          <div>
                            <span className="font-medium text-[var(--sr-text-primary)]">Simulation could not start.</span>{' '}
                            {simError.includes('Cascade assets')
                              ? 'No trained model is available yet — the cascade needs to be trained on the CIC-IDS2017 dataset before simulations can run.'
                              : simError}
                          </div>
                        </div>
                      )}

                      {simStatus.running && (
                        <div className="mt-4 space-y-3">
                          <WhatYoureSeeingNow
                            mode={isReplayMode ? 'replay' : 'csv'}
                            severityHint={
                              isReplayMode
                                ? null
                                : (armedScenarioDetails?.severity || scenarios?.[selectedScenario]?.severity_hint)
                            }
                            attacksDetected={simStatus.attacks_detected || 0}
                            showLiveLink
                          />
                          <GuidedLearningTips
                            attacksDetected={simStatus.attacks_detected || 0}
                            aiQueriesRemaining={aiQueriesRemaining}
                            aiQueryLimit={aiQueryLimit}
                    aiUnlimited={aiUnlimited}
                            variant="simulator"
                          />
                        </div>
                      )}
                    </div>
                  </GlowPanel>

                  {/* Live Sim Telemetry Stats */}
                  <GlowPanel className="flex flex-col justify-between p-6">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--sr-text-primary)] mb-1 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[var(--sr-accent)]" />
                        Live Status Panel
                      </h3>
                      <p className="text-xs text-[var(--sr-text-secondary)] mb-6">Real-time telemetry — scenario engine metrics</p>

                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2 items-center">
                          <span className="text-[var(--sr-text-secondary)]">Status state</span>
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full"
                            style={{ color: `var(${stateColorVar})`, backgroundColor: stateBg }}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${stateDot}`} />
                            {stateText}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Engine mode</span>
                          <span className="text-[var(--sr-accent)] font-medium text-[11px] uppercase tracking-wide">
                            {simStatus.mode || 'idle'}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Source</span>
                          <span className="text-[var(--sr-text-primary)] font-medium text-[11px] truncate max-w-[55%] text-right" title={simStatus.source || ''}>
                            {isReplayMode
                              ? 'Lab session'
                              : (activeScenarioInfo?.display_name || simStatus.scenario || '—')}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Elapsed / limit</span>
                          <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{localElapsed}s / {simStatus.duration_seconds || '∞'}s</span>
                        </div>
                        {isReplayMode && (
                          <>
                            <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                              <span className="text-[var(--sr-text-secondary)]">Packets seen</span>
                              <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {(simStatus.packets_parsed ?? 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                              <span className="text-[var(--sr-text-secondary)]">Flows built</span>
                              <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {(simStatus.flows_built ?? 0).toLocaleString()}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Ingress flows</span>
                          <span className="text-[var(--sr-text-primary)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{simStatus.packets_sent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--sr-border-hairline)] pb-2">
                          <span className="text-[var(--sr-text-secondary)]">Threat alerts</span>
                          <span className={`font-medium ${simStatus.attacks_detected > 0 ? 'text-[var(--sr-sev-critical)]' : 'text-[var(--sr-text-muted)]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {simStatus.attacks_detected.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {simStatus.running && simStatus.duration_seconds && (
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-[var(--sr-text-muted)] mb-1">
                            <span>Simulation Progress</span>
                            <span>{Math.min(100, Math.round((localElapsed / simStatus.duration_seconds) * 100))}%</span>
                          </div>
                          <div className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] h-2 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[var(--sr-accent)] rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, (localElapsed / simStatus.duration_seconds) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Live Intensity Waveform */}
                      <div className="my-4">
                        <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-1">
                          Detection intensity — last 20s
                        </span>
                        <div className="w-full bg-[var(--sr-bg-surface-raised)] border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] p-1.5 h-[35px] flex items-center relative overflow-hidden">
                          <svg className="w-full h-full text-[var(--sr-accent)]" viewBox="0 0 300 25" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="var(--sr-accent)" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            <path d={wavePaths.areaD} fill="url(#waveGrad)" stroke="none" />
                            <path d={wavePaths.lineD} fill="none" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <span className="text-[11px] font-medium text-[var(--sr-text-muted)] block mb-3">
                        Cascade Tier Resolution
                      </span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        {[
                          { label: 'T-1 Screener', v: simStatus.tier_breakdown['1'] || 0, pct: t1Pct, c: '--sr-cat-1' },
                          { label: 'T-2 Validator', v: simStatus.tier_breakdown['2'] || 0, pct: t2Pct, c: '--sr-cat-2' },
                          { label: 'T-3 Arbiter', v: simStatus.tier_breakdown['3'] || 0, pct: t3Pct, c: '--sr-cat-3' },
                        ].map((tier) => (
                          <div key={tier.label} className="bg-[var(--sr-bg-surface-raised)] p-2.5 border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-sm)] flex flex-col justify-between">
                            <span className="text-[9px] text-[var(--sr-text-muted)] block leading-none mb-1.5">{tier.label}</span>
                            <p className="font-semibold text-xs leading-none" style={{ color: `var(${tier.c})`, fontVariantNumeric: 'tabular-nums' }}>{tier.v}</p>
                            <div className="w-full bg-[var(--sr-bg-surface)] h-1.5 rounded-full mt-2 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${tier.pct}%`, backgroundColor: `var(${tier.c})` }} />
                            </div>
                            <span className="text-[10px] text-[var(--sr-text-muted)] mt-1 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(tier.pct)}%</span>
                          </div>
                        ))}
                      </div>

                      <span className="text-[11px] text-[var(--sr-text-muted)] leading-relaxed block mt-2.5 text-center border-t border-[var(--sr-border-hairline)] pt-2.5">
                        T-2 and T-3 activate for ambiguous or rare attack patterns (Infiltration, Heartbleed). Run those scenarios to observe multi-tier escalation.
                      </span>
                    </div>
                  </GlowPanel>

                </div>

                {/* Attack Lab entry point (replaces the old capture-path panel) */}
                <GlowPanel className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--sr-text-primary)] flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[var(--sr-accent)]" />
                        Want to see it on a network?
                      </h3>
                      <p className="text-xs text-[var(--sr-text-secondary)] mt-1.5 max-w-2xl leading-relaxed">
                        The Attack Lab puts an Attacker VM, a Victim VM and a Sensor on a sealed network
                        and shows the cascade reacting to what crosses the wire.
                      </p>
                    </div>
                    <Link to="/lab" className="inline-flex items-center gap-1.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-4 py-2 text-xs font-medium text-[var(--sr-text-primary)] hover:border-[var(--sr-accent)] transition-colors">
                      Open Attack Lab <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </GlowPanel>
              </div>
            );
};

export default SimulatorPage;
