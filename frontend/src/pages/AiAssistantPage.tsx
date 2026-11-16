/* eslint-disable @typescript-eslint/no-unused-vars */
// @ts-nocheck — Phase 3 mechanical extract; pages bind the full dashboard API.
import React from 'react';
import { useDashboard } from '../dashboard/DashboardContext';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import StatusBadge from '../components/ui/StatusBadge';
import AttackIcon, { type AttackIconType } from '../components/ui/AttackIcons';
import Logomark from '../components/ui/Logomark';
import AuroraBackground from '../components/ui/AuroraBackground';
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
 * AiAssistantPage
 * Extracted from the monolithic Dashboard during Phase 3 Living Lattice foundation.
 * Phase 4 can mount R3F lattice scenes into this page without changing routing.
 */
export const AiAssistantPage: React.FC = () => {
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
            <div className="flex gap-5 h-[calc(100vh-190px)] relative w-full">
              <style dangerouslySetInnerHTML={{ __html: `
                .chat-history-container {
                  scrollbar-width: thin;
                  scrollbar-color: var(--sr-border-hover) transparent;
                }
                .chat-history-container::-webkit-scrollbar { width: 4px; }
                .chat-history-container::-webkit-scrollbar-track { background: transparent; }
                .chat-history-container::-webkit-scrollbar-thumb { background: var(--sr-border-hover); border-radius: 2px; }
                .convo-rail-container {
                  scrollbar-width: thin;
                  scrollbar-color: var(--sr-border-hover) transparent;
                }
                .convo-rail-container::-webkit-scrollbar { width: 4px; }
                .convo-rail-container::-webkit-scrollbar-thumb { background: var(--sr-border-hover); border-radius: 2px; }
                @keyframes typing-bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-6px); }
                }
                .typing-dot {
                  width: 6px; height: 6px; border-radius: 50%;
                  background-color: var(--sr-accent);
                  display: inline-block;
                  animation: typing-bounce 1.2s infinite ease-in-out;
                }
                .typing-dot:nth-child(1) { animation-delay: 0s; }
                .typing-dot:nth-child(2) { animation-delay: 0.15s; }
                .typing-dot:nth-child(3) { animation-delay: 0.3s; }
                .sentinel-gradient-text {
                  background-image: var(--sr-gradient-brand);
                  -webkit-background-clip: text;
                  background-clip: text;
                  color: transparent;
                }
              `}} />

              {/* ============== CONVERSATION HISTORY RAIL ============== */}
              <div className="w-64 shrink-0 flex flex-col gap-3">
                <GlowButton
                  type="button"
                  variant="primary"
                  onClick={startNewConversation}
                  className="w-full py-2.5 text-xs justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New conversation
                </GlowButton>

                <GlowPanel className="flex-1 overflow-hidden p-2 flex flex-col">
                  <div className="convo-rail-container flex-1 overflow-y-auto flex flex-col gap-3">
                    {loadingConversations ? (
                      <div className="p-4 text-center text-[11px] text-[var(--sr-text-muted)]">Loading history…</div>
                    ) : conversations.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-[var(--sr-text-muted)] leading-relaxed">
                        No saved conversations yet. Chats you send outside Incognito mode will appear here.
                      </div>
                    ) : (() => {
                      const pinned = conversations.filter((c) => c.pinned);
                      const unpinned = conversations.filter((c) => !c.pinned);
                      const dateGroups = groupConversationsByDate(unpinned);

                      const renderItem = (c: ConversationSummary) => {
                        const isActive = c.id === activeConversationId;
                        const isConfirmingDelete = confirmDeleteId === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => loadConversation(c.id)}
                            className={`group relative rounded-[var(--sr-radius-sm)] px-3 py-2.5 cursor-pointer transition-colors ${
                              isConfirmingDelete
                                ? 'bg-[rgba(208,59,59,0.06)]'
                                : isActive
                                ? 'bg-[var(--sr-accent-soft)]'
                                : 'hover:bg-[var(--sr-bg-surface-raised)]'
                            }`}
                          >
                            {renamingId === c.id ? (
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(c.id); if (e.key === 'Escape') setRenamingId(null); }}
                                  className="flex-1 min-w-0 text-xs bg-[var(--sr-bg-page)] border border-[var(--sr-accent)] rounded px-2 py-1 outline-none text-[var(--sr-text-primary)]"
                                />
                                <button type="button" onClick={() => commitRename(c.id)} className="shrink-0 text-[var(--sr-accent)] cursor-pointer">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : isConfirmingDelete ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-[var(--sr-sev-critical)]">Delete this chat?</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => confirmDeleteConversation(c.id, e)}
                                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--sr-sev-critical)] text-white cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelDeleteConversation}
                                    className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`flex items-center gap-1.5 text-xs font-medium truncate ${isActive ? 'text-[var(--sr-accent)]' : 'text-[var(--sr-text-primary)]'}`}>
                                    {c.pinned && <Pin className="w-2.5 h-2.5 shrink-0 fill-current" style={{ color: 'var(--sr-accent-2)' }} />}
                                    <span className="truncate">{c.title}</span>
                                  </p>
                                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => togglePinConversation(c, e)}
                                      title={c.pinned ? 'Unpin' : 'Pin to top'}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-accent-2)] cursor-pointer"
                                    >
                                      {c.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameDraft(c.title); }}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-accent)] cursor-pointer"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => requestDeleteConversation(c.id, e)}
                                      className="p-1 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-sev-critical)] cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {c.preview && (
                                  <p className="text-[10px] text-[var(--sr-text-muted)] truncate mt-0.5">{c.preview}</p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      };

                      return (
                        <>
                          {pinned.length > 0 && (
                            <div className="flex flex-col gap-1">
                              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">Pinned</span>
                              {pinned.map(renderItem)}
                            </div>
                          )}
                          {dateGroups.map((group) => (
                            <div key={group.label} className="flex flex-col gap-1">
                              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">{group.label}</span>
                              {group.items.map(renderItem)}
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </GlowPanel>
              </div>

              {/* ============== CHAT SURFACE ============== */}
              <div className="flex-1 relative min-w-0">
                <AuroraBackground className="absolute -inset-4" variant="hero" />
                <GlowPanel
                  className="h-full flex flex-col overflow-hidden p-0 relative transition-shadow duration-500"
                  style={{
                    boxShadow: incognito ? 'none' : 'var(--sr-shadow-glow)',
                    border: incognito ? '1px dashed var(--sr-text-muted)' : undefined,
                  }}
                >
                  {/* Incognito banner */}
                  {incognito && (
                    <div className="px-6 py-2 bg-[var(--sr-bg-surface-raised)] border-b border-dashed border-[var(--sr-text-muted)] flex items-center gap-2 shrink-0 z-10">
                      <Ghost className="w-3.5 h-3.5 text-[var(--sr-text-secondary)]" />
                      <span className="text-[11px] text-[var(--sr-text-secondary)]">
                        Incognito mode — this conversation will not be saved to your history.
                      </span>
                    </div>
                  )}

                  {/* Chat header */}
                  <div className="px-6 py-4 bg-[var(--sr-glass-bg)] backdrop-blur-md border-b border-[var(--sr-border-hairline)] flex items-center justify-between shrink-0 z-10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sr-accent-soft)]">
                        <Logomark className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="sentinel-gradient-text text-base font-bold leading-none mb-0.5" style={{ fontFamily: 'var(--sr-font-display)' }}>
                          SENTINEL AI
                        </h4>
                        <span className="text-[11px] text-[var(--sr-text-muted)] block leading-none">
                          Intelligent Security Analyst Assistant
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {/* Incognito toggle -- gradient "on" state reuses the same brand
                          gradient used for hero text/CTAs elsewhere, instead of a flat
                          black block that clashes with the rest of the palette. */}
                      <button
                        type="button"
                        onClick={toggleIncognito}
                        title={incognito ? 'Exit incognito mode' : 'Start an incognito (unsaved) chat'}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-full select-none cursor-pointer transition-all duration-300 border ${
                          incognito
                            ? 'text-white border-transparent'
                            : 'bg-transparent text-[var(--sr-text-muted)] border-[var(--sr-border-hairline)] hover:border-[var(--sr-text-muted)] hover:text-[var(--sr-text-secondary)]'
                        }`}
                        style={incognito ? {
                          backgroundImage: 'var(--sr-gradient-brand)',
                          boxShadow: '0 4px 14px -4px color-mix(in srgb, var(--sr-accent) 45%, transparent)',
                        } : undefined}
                      >
                        <Ghost className="w-3 h-3" />
                        Incognito {incognito ? 'on' : 'off'}
                      </button>

                      {/* Divider */}
                      <div className="h-4 w-[1px] bg-[var(--sr-border-hairline)]" />

                      {/* AI availability (no provider brand) */}
                      {aiAvailable ? (
                        <span
                          style={{ color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium rounded-full select-none"
                        >
                          <span className="text-[10px] leading-none">✦</span>
                          AI available
                        </span>
                      ) : (
                        <span
                          style={{ color: 'var(--sr-text-muted)', backgroundColor: 'var(--sr-bg-surface-raised)' }}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium rounded-full select-none"
                        >
                          <span className="text-[10px] leading-none">✦</span>
                          Rule-based
                        </span>
                      )}

                      <span
                        className="text-[10px] text-[var(--sr-text-muted)] select-none"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                        title="Lifetime AI questions across all conversations"
                      >
                        {aiUnlimited || aiQueriesRemaining === null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sr-accent-soft)] px-2 py-0.5 font-semibold text-[var(--sr-accent)]">
                            ∞ Unlimited AI
                          </span>
                        ) : (
                          <>{aiQueriesRemaining} of {aiQueryLimit} AI questions left</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Message Log */}
                  <div
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                    className="chat-history-container flex-1 overflow-y-auto p-6 relative overflow-hidden flex flex-col"
                  >
                    {loadingConversationDetail ? (
                      <div className="flex-1 flex items-center justify-center text-xs text-[var(--sr-text-muted)]">Loading conversation…</div>
                    ) : messages.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 max-w-lg mx-auto relative z-10 animate-fade-in my-auto select-none">
                        <div className="w-14 h-14 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center mb-4">
                          <Logomark className="w-6 h-6" />
                        </div>

                        <h2 className="sentinel-gradient-text text-xl font-bold mb-1" style={{ fontFamily: 'var(--sr-font-display)' }}>
                          SENTINEL AI
                        </h2>
                        <p className="text-xs text-[var(--sr-text-secondary)] leading-relaxed mb-6">
                          Cybersecurity intelligence — always on scope
                        </p>

                        <div className="grid grid-cols-2 gap-3 w-full mb-6">
                          {[
                            "What is a DDoS attack?",
                            "How does the cascade work?",
                            "Explain the last alert",
                            "What is SMOTE?"
                          ].map((q) => (
                            <GlowButton
                              key={q}
                              type="button"
                              variant="secondary"
                              onClick={() => sendChatMessage(q)}
                              className="px-3.5 py-2.5 text-xs text-left transition-all leading-normal flex items-center justify-start"
                            >
                              {q}
                            </GlowButton>
                          ))}
                        </div>

                        <span className="text-[11px] text-[var(--sr-text-muted)] block">
                          Or type your own question below
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-4 relative z-10 flex flex-col pb-3 pt-3">
                        {messages.map((msg, i) => {
                          const isUser = msg.role === 'user';

                          // Spacing visual check
                          const nextMsg = messages[i + 1];
                          const isSameNext = nextMsg && nextMsg.role === msg.role;
                          const mbClass = isSameNext ? 'mb-1.5' : 'mb-4';

                          return (
                            <div
                              key={i}
                              className={`flex flex-col ${
                                isUser ? 'ml-auto items-end max-w-[72%] w-full' : 'mr-auto items-start max-w-[80%] w-full'
                              } ${mbClass}`}
                            >
                              {isUser ? (
                                <div
                                  style={{ borderRadius: '12px 4px 12px 12px', padding: '12px 14px' }}
                                  className="border border-[var(--sr-accent)]/20 bg-[var(--sr-accent-soft)] text-[var(--sr-text-primary)] text-xs leading-relaxed w-full animate-fade-in flex flex-col gap-1.5"
                                >
                                  <span className="text-[10px] text-[var(--sr-text-muted)] font-medium block text-left leading-none">
                                    You
                                  </span>
                                  <div>{msg.text}</div>
                                  <span className="text-[10px] text-[var(--sr-text-muted)] block text-right mt-0.5 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {msg.time}
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-7 h-7 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center shrink-0">
                                      <Logomark className="w-3.5 h-3.5" />
                                    </div>
                                    <span className="text-[11px] font-medium text-[var(--sr-text-secondary)]">
                                      SENTINEL AI
                                    </span>
                                  </div>

                                  <div
                                    style={{ padding: '14px 16px', borderRadius: '4px 12px 12px 12px' }}
                                    className={`relative bg-[var(--sr-glass-bg)] backdrop-blur-md border ${
                                      msg.isError ? 'border-[var(--sr-sev-critical)]/30' : 'border-[var(--sr-border-hairline)]'
                                    } text-[var(--sr-text-primary)] text-xs leading-relaxed w-full shadow-[var(--sr-shadow-sm)] animate-fade-in flex flex-col gap-2.5`}
                                  >
                                    <div className="whitespace-pre-wrap">{msg.text}</div>

                                    {(msg.source || msg.responseTime || msg.time) && (
                                      <div className="pt-2 border-t border-[var(--sr-border-hairline)] flex items-center justify-between gap-2 mt-1">
                                        <div className="flex items-center">
                                          {msg.source && (
                                            (() => {
                                              const src = msg.source.toLowerCase();
                                              const isAi = src === 'ai' || src.includes('nebius');
                                              if (isAi) {
                                                return (
                                                  <span
                                                    style={{ color: 'var(--sr-accent)', backgroundColor: 'var(--sr-accent-soft)' }}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full select-none"
                                                  >
                                                    ✦ AI
                                                  </span>
                                                );
                                              }
                                              return (
                                                <span
                                                  style={{ color: 'var(--sr-cat-3)', backgroundColor: 'rgba(27, 175, 122, 0.10)' }}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full select-none"
                                                >
                                                  ⚡ Rule-based
                                                </span>
                                              );
                                            })()
                                          )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                          {msg.responseTime && (
                                            <span className="text-[10px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                              {msg.responseTime}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {msg.time}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {aiTyping && (
                      <div className="flex flex-col max-w-[80%] mr-auto items-start relative z-10 animate-fade-in w-full mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-7 h-7 rounded-full bg-[var(--sr-accent-soft)] flex items-center justify-center shrink-0">
                            <Logomark className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] font-medium text-[var(--sr-text-secondary)]">
                            SENTINEL AI
                          </span>
                        </div>

                        <div
                          style={{ padding: '14px 16px', borderRadius: '4px 12px 12px 12px' }}
                          className="relative bg-[var(--sr-glass-bg)] backdrop-blur-md border border-[var(--sr-border-hairline)] text-[var(--sr-text-primary)] text-xs leading-relaxed w-full shadow-[var(--sr-shadow-sm)] animate-fade-in flex flex-col gap-2.5"
                        >
                          <div className="flex items-center gap-1.5 h-4">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>

                          <div className="pt-2 border-t border-[var(--sr-border-hairline)] flex items-center justify-between mt-1">
                            <span className="text-[10px] font-medium text-[var(--sr-accent)] flex items-center gap-1">
                              ● Processing...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* Form Chat Input */}
                  <form
                    onSubmit={handleSendChat}
                    className="p-4 border-t border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md flex items-center gap-3 shrink-0 relative z-10"
                  >
                    <div className="flex-1 relative flex items-center">
                      <input
                        ref={chatInputRef}
                        type="text"
                        required
                        value={chatInput}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={incognito ? 'Ask SENTINEL AI (not saved)...' : 'Ask SENTINEL AI...'}
                        className="w-full bg-[var(--sr-bg-page)] border border-[var(--sr-border-hairline)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)] rounded-[var(--sr-radius-sm)] px-4 py-3 text-xs text-[var(--sr-text-primary)] outline-none placeholder-[var(--sr-text-muted)] transition-all"
                      />
                    </div>

                    <span
                      className="text-[11px] text-[var(--sr-text-muted)] transition-opacity duration-200 shrink-0"
                      style={{ opacity: inputFocused ? 1 : 0 }}
                    >
                      Enter ↵ to send
                    </span>

                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className={`px-5 py-3 text-xs font-semibold min-w-[90px] flex items-center justify-center gap-1.5 shrink-0 rounded-[var(--sr-radius-sm)] transition-all duration-200 active:scale-95 border ${
                        chatInput.trim()
                          ? 'bg-[var(--sr-accent)] border-transparent cursor-pointer text-white hover:bg-[var(--sr-accent-hover)] shadow-[var(--sr-shadow-sm)]'
                          : 'bg-[var(--sr-bg-surface-raised)] border-[var(--sr-border-hairline)] cursor-not-allowed text-[var(--sr-text-muted)]'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                </GlowPanel>
              </div>
            </div>
  );
};

export default AiAssistantPage;
