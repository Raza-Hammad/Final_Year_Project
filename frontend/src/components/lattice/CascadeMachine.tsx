/**
 * CascadeMachine — Model Insights "AI Cascade Machine".
 *
 * A faithful, readable replay of the backend 3-tier cascade (`backend/app/ml/cascade.py`):
 *
 *   Tier 1  LightGBM        every flow; exits when max-class confidence >= 0.85
 *   Tier 2  Random Forest   only flows Tier 1 was unsure about; exits at >= 0.85
 *   Tier 3  Weighted vote   only flows still unsure; 0.2·LGBM + 0.3·RF + 0.5·XGB, always decides
 *
 * Accuracy notes:
 *  - The early exit is confidence-based, not class-based: a *confident* verdict (benign OR
 *    attack) leaves at the first tier that clears the threshold.
 *  - The API only reports the deciding tier + final confidence. Earlier tiers are therefore
 *    drawn as "below threshold" (which is exactly what escalation implies) — no invented scores.
 *  - Motion is one-shot per flow: the packet travels tier by tier, settles on the deciding
 *    tier, and stays still. Nothing loops while idle.
 *  - "Demo traffic" mode pulls real held-out test flows from `/api/cascade/demo/next`; those
 *    come with a per-tier trace (real scores vs the 85% gate). They are never saved as alerts.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import api from '../../services/api';
import type { DetectionData } from '../../dashboard/types';

export interface CascadeMachineProps {
  /** Cumulative per-tier resolved counts from the live WebSocket feed. */
  liveTiers?: Record<number, number>;
  /** Alert the analyst pinned (e.g. opened Explain). Replayed instead of live flow. */
  pinnedDetection?: DetectionData | null;
  /** Most recent live detection (newest first from the feed). */
  liveDetection?: DetectionData | null;
  /** @deprecated Use `pinnedDetection`. Kept for call-site compatibility. */
  confidence?: number | null;
  /** @deprecated Use `pinnedDetection`. Kept for call-site compatibility. */
  activeTier?: number | null;
  className?: string;
  /** Minimum rendered height in px. */
  height?: number;
  /** Show the Live | Demo traffic switch (needs the demo endpoint). */
  enableDemo?: boolean;
}

interface TraceRow {
  tier: number;
  model: string;
  reached: boolean;
  top_label?: string;
  confidence?: number;
  threshold?: number | null;
  passed_gate?: boolean;
}

interface DemoResponse {
  bucket_label: string;
  true_label: string;
  correct: boolean;
  predicted_label: string;
  confidence: number;
  tier: number;
  trace: TraceRow[];
  next_cursor: number;
}

type SourceMode = 'live' | 'demo';
type Speed = 0.5 | 1 | 2;

/** Backend gate. Mirrors `CascadeDetector.confidence_threshold`. */
const THRESHOLD = 0.85;
const GATE_PCT = Math.round(THRESHOLD * 100);

type TierId = 1 | 2 | 3;
type Waypoint = 'in' | 't1' | 't2' | 't3' | 'b1' | 'b2' | 'b3';
type NodeState = 'idle' | 'scoring' | 'escalated' | 'resolved' | 'skipped';
type FlowSource = 'live' | 'pinned' | 'demo' | 'traffic';

interface Flow {
  id: number;
  source: FlowSource;
  tier: TierId;
  /** Final confidence, or null for illustrative walkthroughs. */
  confidence: number | null;
  label: string | null;
  benign: boolean;
  trace?: TraceRow[];
  trueLabel?: string;
  correct?: boolean;
  bucketLabel?: string;
}

const TIERS: ReadonlyArray<{
  id: TierId;
  name: string;
  role: string;
  x: number;
  cssVar: string;
}> = [
  { id: 1, name: 'LightGBM', role: 'Fast screener · all flows', x: 70, cssVar: '--sr-cat-1' },
  { id: 2, name: 'Random Forest', role: 'Validator · uncertain only', x: 260, cssVar: '--sr-cat-2' },
  { id: 3, name: 'Weighted Vote', role: 'Ensemble of all 3 models', x: 450, cssVar: '--sr-cat-3' },
];

const NODE_W = 130;
const NODE_Y = 50;
const NODE_H = 108;
const BUCKET_Y = 214;
const BUCKET_H = 66;

const WAYPOINT_XY: Record<Waypoint, [number, number]> = {
  in: [30, 104],
  t1: [135, 104],
  t2: [325, 104],
  t3: [515, 104],
  b1: [135, 212],
  b2: [325, 212],
  b3: [515, 212],
};

const PATHS: Record<TierId, Waypoint[]> = {
  1: ['in', 't1', 'b1'],
  2: ['in', 't1', 't2', 'b2'],
  3: ['in', 't1', 't2', 't3', 'b3'],
};

const DWELL_MS: Record<Waypoint, number> = {
  in: 350,
  t1: 950,
  t2: 950,
  t3: 1050,
  b1: 0,
  b2: 0,
  b3: 0,
};
/** How long a finished flow stays on screen before the next live sample starts. */
const SETTLE_MS = 1700;

let flowSeq = 0;

function clampTier(t: number): TierId {
  return t >= 3 ? 3 : t <= 1 ? 1 : 2;
}

function flowFromDetection(d: DetectionData, source: FlowSource): Flow {
  const label = d.predicted_label ?? null;
  return {
    id: ++flowSeq,
    source,
    tier: clampTier(d.tier),
    confidence: Number.isFinite(d.confidence) ? d.confidence : null,
    label,
    benign: (label ?? '').toUpperCase() === 'BENIGN',
  };
}

function flowFromDemoTraffic(d: DemoResponse): Flow {
  return {
    id: ++flowSeq,
    source: 'traffic',
    tier: clampTier(d.tier),
    confidence: Number.isFinite(d.confidence) ? d.confidence : null,
    label: d.predicted_label,
    benign: d.predicted_label.toUpperCase() === 'BENIGN',
    trace: d.trace,
    trueLabel: d.true_label,
    correct: d.correct,
    bucketLabel: d.bucket_label,
  };
}

function demoFlow(tier: TierId): Flow {
  return { id: ++flowSeq, source: 'demo', tier, confidence: null, label: null, benign: false };
}

/** Visual state of a tier node given the flow + the packet's current waypoint index. */
function nodeState(tier: TierId, flow: Flow | null, step: number): NodeState {
  if (!flow) return 'idle';
  const path = PATHS[flow.tier];
  const here = path[step];
  const gateIdx = path.indexOf(`t${tier}` as Waypoint);
  if (gateIdx === -1) {
    // Tier never reached by this flow: only call it "skipped" once the flow has settled.
    return step === path.length - 1 ? 'skipped' : 'idle';
  }
  if (here === `t${tier}`) return 'scoring';
  if (step < gateIdx) return 'idle';
  // Packet has moved on from this gate.
  return tier === flow.tier ? 'resolved' : 'escalated';
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const KEYFRAMES = `
@keyframes cm-scan { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes cm-settle { 0% { opacity: .35; } 100% { opacity: 1; } }
`;

export const CascadeMachine: React.FC<CascadeMachineProps> = ({
  liveTiers = { 1: 0, 2: 0, 3: 0 },
  pinnedDetection = null,
  liveDetection = null,
  confidence = null,
  activeTier = null,
  className = '',
  height = 300,
  enableDemo = false,
}) => {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<SourceMode>('live');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const speedRef = useRef<Speed>(1);
  const cursorRef = useRef(0);
  const fetchingRef = useRef(false);
  speedRef.current = speed;

  // Back-compat: synthesize a pinned detection from the legacy props.
  const legacyPinned = useMemo<DetectionData | null>(() => {
    if (pinnedDetection || activeTier == null) return null;
    return {
      predicted_label: '',
      confidence: confidence ?? NaN,
      tier: activeTier,
      tier_name: '',
      top_features: [],
    };
  }, [pinnedDetection, activeTier, confidence]);
  const pinned = pinnedDetection ?? legacyPinned;

  const [flow, setFlow] = useState<Flow | null>(null);
  // Step is tagged with the flow id so a new flow always starts at waypoint 0 (no stale frame).
  const [stepState, setStepState] = useState<{ id: number; step: number }>({ id: 0, step: 0 });
  const [idleTick, setIdleTick] = useState(0);
  const pendingRef = useRef<Flow | null>(null);
  const busyRef = useRef(false);

  // Pinned alert always wins and restarts the replay.
  useEffect(() => {
    if (pinned) {
      setMode('live');
      setPlaying(false);
      setFlow(flowFromDetection(pinned, 'pinned'));
    }
  }, [pinned]);

  // Newest live detection is queued (latest wins) — never stack up a backlog of animations.
  useEffect(() => {
    if (liveDetection) pendingRef.current = flowFromDetection(liveDetection, 'live');
  }, [liveDetection]);

  // Scheduler: start the queued live flow only when nothing is playing.
  useEffect(() => {
    if (pinned || busyRef.current || mode !== 'live') return;
    const next = pendingRef.current;
    if (next) {
      pendingRef.current = null;
      setFlow(next);
    }
  }, [liveDetection, idleTick, pinned, mode]);

  // Play the current flow tier by tier, then settle (one-shot, no loop).
  useEffect(() => {
    if (!flow) return;
    const path = PATHS[flow.tier];
    if (reduced) {
      setStepState({ id: flow.id, step: path.length - 1 });
      busyRef.current = false;
      return;
    }
    busyRef.current = true;
    setStepState({ id: flow.id, step: 0 });
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const advance = () => {
      if (i >= path.length - 1) {
        timer = setTimeout(() => {
          busyRef.current = false;
          setIdleTick((t) => t + 1);
        }, SETTLE_MS / speedRef.current);
        return;
      }
      timer = setTimeout(() => {
        i += 1;
        setStepState({ id: flow.id, step: i });
        advance();
      }, DWELL_MS[path[i]] / speedRef.current);
    };
    advance();
    return () => clearTimeout(timer);
  }, [flow, reduced]);

  const fetchNext = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setDemoBusy(true);
    try {
      const { data } = await api.get<DemoResponse>('/api/cascade/demo/next', {
        params: { mode: 'guided', cursor: cursorRef.current },
      });
      cursorRef.current = data.next_cursor;
      setDemoError(null);
      setFlow(flowFromDemoTraffic(data));
    } catch {
      setDemoError('Demo traffic is unavailable right now — the illustrative walkthrough still works.');
      setPlaying(false);
    } finally {
      fetchingRef.current = false;
      setDemoBusy(false);
    }
  }, []);

  // Demo autoplay: when the current flow has settled, pull the next one.
  useEffect(() => {
    if (mode !== 'demo' || !playing || reduced) return;
    if (busyRef.current || fetchingRef.current) return;
    void fetchNext();
  }, [mode, playing, idleTick, reduced, fetchNext]);

  const switchMode = useCallback((next: SourceMode) => {
    setMode(next);
    setPlaying(false);
    setDemoError(null);
    setFlow(null);
    busyRef.current = false;
  }, []);

  const replay = useCallback(() => {
    setFlow((f) => (f ? { ...f, id: ++flowSeq } : f));
  }, []);

  const path = flow ? PATHS[flow.tier] : null;
  const step = flow && path ? (stepState.id === flow.id ? stepState.step : reduced ? path.length - 1 : 0) : 0;
  const here: Waypoint = path ? path[Math.min(step, path.length - 1)] : 'in';
  const settled = !!path && step === path.length - 1;
  const [px, py] = WAYPOINT_XY[here];

  const total = (liveTiers[1] ?? 0) + (liveTiers[2] ?? 0) + (liveTiers[3] ?? 0);
  const verdictColor = flow?.benign ? 'var(--sr-sev-info)' : 'var(--sr-sev-critical)';
  const packetColor = flow && settled ? (flow.label ? verdictColor : `var(--sr-cat-${flow.tier})`) : 'var(--sr-accent)';

  const caption = useMemo(() => {
    if (!flow) return 'Waiting for traffic. Every flow enters at Tier 1 and leaves at the first tier that is at least 85% confident.';
    const verdict =
      flow.label && flow.confidence != null
        ? `${flow.label} at ${formatPct(flow.confidence)}`
        : flow.label
          ? flow.label
          : null;
    const row = (tier: number): TraceRow | undefined => flow.trace?.find((r) => r.tier === tier);
    const pct = (r?: TraceRow): string => (r?.confidence != null ? `${(r.confidence * 100).toFixed(1)}%` : '—');
    switch (here) {
      case 'in':
        return 'Flow enters the cascade at Tier 1.';
      case 't1':
        return row(1)
          ? `Tier 1 · LightGBM is ${pct(row(1))} sure this is ${row(1)?.top_label} — the gate is ${GATE_PCT}%.`
          : 'Tier 1 · LightGBM scores the flow against the 85% confidence gate.';
      case 't2':
        return row(1)
          ? `Tier 1 only reached ${pct(row(1))} → escalated. Tier 2 · Random Forest re-scores the flow.`
          : 'Tier 1 fell below 85% → escalated. Tier 2 · Random Forest re-scores the flow.';
      case 't3':
        return row(2)
          ? `Tier 2 only reached ${pct(row(2))} → escalated. Tier 3 · XGBoost + weighted vote (0.2 · 0.3 · 0.5) decides.`
          : 'Tier 2 also fell below 85% → escalated. Tier 3 · XGBoost + weighted vote (0.2 · 0.3 · 0.5) decides.';
      case 'b1':
        return `Early exit at Tier 1${verdict ? ` — ${verdict}` : ''}. Tiers 2 and 3 were never invoked.`;
      case 'b2':
        return `Resolved at Tier 2${verdict ? ` — ${verdict}` : ''}. LightGBM was unsure; Tier 3 was not needed.`;
      default:
        return `Decided by the Tier 3 weighted vote${verdict ? ` — ${verdict}` : ''}. The last tier always returns a verdict.`;
    }
  }, [flow, here]);

  const sourceLabel =
    flow?.source === 'pinned'
      ? 'Selected alert'
      : flow?.source === 'live'
        ? 'Live flow (sampled)'
        : flow?.source === 'demo'
          ? 'Illustrative walkthrough'
          : flow?.source === 'traffic'
            ? `Demo traffic${flow.bucketLabel ? ` · ${flow.bucketLabel}` : ''}`
            : mode === 'demo'
              ? 'Demo traffic · press Play'
              : 'Idle';

  const edgeLit = (edge: 'e1' | 'e2'): boolean => {
    if (!flow || !path) return false;
    const target: Waypoint = edge === 'e1' ? 't2' : 't3';
    const idx = path.indexOf(target);
    return idx !== -1 && step >= idx;
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] ${className}`}
      style={{ minHeight: height }}
    >
      <style>{KEYFRAMES}</style>

      {enableDemo && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5">
          <div role="tablist" aria-label="Traffic source" className="inline-flex rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-0.5 text-[10px] font-medium">
            {(['live', 'demo'] as SourceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`cursor-pointer rounded-[calc(var(--sr-radius-sm)-2px)] px-2.5 py-1 transition-colors ${
                  mode === m
                    ? 'bg-[var(--sr-accent-soft)] text-[var(--sr-accent)]'
                    : 'text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)]'
                }`}
              >
                {m === 'live' ? 'Live traffic' : 'Demo traffic'}
              </button>
            ))}
          </div>
          {mode === 'demo' && (
            <div className="flex items-center gap-1.5 text-[10px]">
              {!reduced && (
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-accent)] px-2 py-0.5 font-semibold text-[var(--sr-accent)]"
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
              )}
              <button
                type="button"
                disabled={demoBusy}
                onClick={() => void fetchNext()}
                className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-2 py-0.5 font-medium text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)] disabled:opacity-50"
              >
                Step
              </button>
              {([0.5, 1, 2] as Speed[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`cursor-pointer rounded-[var(--sr-radius-sm)] border px-1.5 py-0.5 font-medium ${
                    speed === s
                      ? 'border-[var(--sr-accent)] text-[var(--sr-accent)]'
                      : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-muted)]'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sr-border-hairline)] px-2 py-0.5 text-[10px] font-medium text-[var(--sr-text-secondary)]"
          aria-label={`Showing: ${sourceLabel}`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: flow ? 'var(--sr-accent)' : 'var(--sr-text-muted)' }}
          />
          {sourceLabel}
        </span>
        <div className={`flex items-center gap-1.5 text-[10px] ${mode === 'demo' ? 'hidden' : ''}`}>
          <span className="text-[var(--sr-text-muted)]">Walkthrough:</span>
          {([1, 2, 3] as TierId[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFlow(demoFlow(t))}
              className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-1.5 py-0.5 font-medium text-[var(--sr-text-secondary)] transition-colors hover:border-[var(--sr-border-hover)] hover:text-[var(--sr-text-primary)]"
              title={`Replay a flow that exits at Tier ${t}`}
            >
              {t === 1 ? 'T1 exit' : t === 2 ? 'T2 exit' : 'T3 vote'}
            </button>
          ))}
          {flow && (
            <button
              type="button"
              onClick={replay}
              className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-1.5 py-0.5 font-medium text-[var(--sr-accent)] transition-colors hover:border-[var(--sr-accent)]"
            >
              Replay
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 640 296"
          className="mx-auto block h-auto w-full min-w-[560px]"
          role="img"
          aria-label="Three-tier cascade: LightGBM, then Random Forest, then weighted vote. Confident flows exit early."
        >
          <defs>
            <marker id="cm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="var(--sr-text-muted)" />
            </marker>
          </defs>

          {/* Ingress */}
          <circle cx={30} cy={104} r={9} fill="none" stroke="var(--sr-border-hover)" strokeWidth={1.5} />
          <circle cx={30} cy={104} r={3} fill="var(--sr-text-muted)" />
          <text x={30} y={132} textAnchor="middle" fontSize={9} fill="var(--sr-text-muted)">
            flow in
          </text>
          <line
            x1={42}
            y1={104}
            x2={TIERS[0].x - 2}
            y2={104}
            stroke="var(--sr-border-hover)"
            strokeWidth={1.5}
            markerEnd="url(#cm-arrow)"
          />

          {/* Escalation edges */}
          {([
            { key: 'e1' as const, x1: TIERS[0].x + NODE_W + 2, x2: TIERS[1].x - 2, color: 'var(--sr-cat-2)' },
            { key: 'e2' as const, x1: TIERS[1].x + NODE_W + 2, x2: TIERS[2].x - 2, color: 'var(--sr-cat-3)' },
          ]).map((e) => {
            const lit = edgeLit(e.key);
            const mid = (e.x1 + e.x2) / 2;
            return (
              <g key={e.key}>
                <line
                  x1={e.x1}
                  y1={104}
                  x2={e.x2}
                  y2={104}
                  stroke={lit ? e.color : 'var(--sr-border-hover)'}
                  strokeWidth={lit ? 2.25 : 1.5}
                  strokeDasharray={lit ? undefined : '3 3'}
                  markerEnd="url(#cm-arrow)"
                  style={{ transition: 'stroke 300ms ease, stroke-width 300ms ease' }}
                />
                <text x={mid} y={92} textAnchor="middle" fontSize={9} fontWeight={600} fill={lit ? e.color : 'var(--sr-text-muted)'}>
                  &lt; 85%
                </text>
                <text x={mid} y={124} textAnchor="middle" fontSize={8} fill="var(--sr-text-muted)">
                  escalate
                </text>
              </g>
            );
          })}

          {/* Tier nodes + exit buckets */}
          {TIERS.map((t) => {
            const state = nodeState(t.id, flow, step);
            const color = `var(${t.cssVar})`;
            const active = state === 'scoring' || state === 'resolved';
            const dim = state === 'skipped';
            const bucketReached = flow && here === (`b${t.id}` as Waypoint);
            const count = liveTiers[t.id] ?? 0;
            const share = total > 0 ? Math.round((count / total) * 100) : 0;
            const exitLit = !!bucketReached;
            const statusText =
              state === 'scoring'
                ? 'Scoring…'
                : state === 'escalated'
                  ? 'Unsure → escalate'
                  : state === 'resolved'
                    ? t.id === 3
                      ? 'Vote decided'
                      : 'Confident ✓'
                    : state === 'skipped'
                      ? 'Not needed'
                      : t.id === 3
                        ? 'Always decides'
                        : `Gate ≥ ${GATE_PCT}%`;
            return (
              <g key={t.id} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity 350ms ease' }}>
                <rect
                  x={t.x}
                  y={NODE_Y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={`color-mix(in srgb, ${color} ${active ? 11 : 5}%, var(--sr-bg-surface))`}
                  stroke={active ? color : 'var(--sr-border-hairline)'}
                  strokeWidth={active ? 1.75 : 1}
                  style={{ transition: 'fill 350ms ease, stroke 350ms ease' }}
                />
                <text x={t.x + 12} y={NODE_Y + 19} fontSize={9} fontWeight={700} letterSpacing="0.12em" fill={color}>
                  TIER {t.id}
                </text>
                <text x={t.x + 12} y={NODE_Y + 39} fontSize={13} fontWeight={700} fill="var(--sr-text-primary)">
                  {t.name}
                </text>
                <text x={t.x + 12} y={NODE_Y + 54} fontSize={8.5} fill="var(--sr-text-muted)">
                  {t.role}
                </text>
                <text
                  x={t.x + 12}
                  y={NODE_Y + 75}
                  fontSize={10}
                  fontWeight={600}
                  fill={state === 'escalated' ? 'var(--sr-text-muted)' : active ? color : 'var(--sr-text-secondary)'}
                >
                  {statusText}
                </text>

                {t.id === 3 ? (
                  <g>
                    <rect x={t.x + 12} y={NODE_Y + 84} width={26} height={5} rx={2.5} fill="var(--sr-cat-1)" />
                    <rect x={t.x + 40} y={NODE_Y + 84} width={38} height={5} rx={2.5} fill="var(--sr-cat-2)" />
                    <rect x={t.x + 80} y={NODE_Y + 84} width={38} height={5} rx={2.5} fill="var(--sr-cat-3)" />
                    <text x={t.x + 12} y={NODE_Y + 101} fontSize={7.5} fill="var(--sr-text-muted)">
                      0.2 LGB · 0.3 RF · 0.5 XGB
                    </text>
                  </g>
                ) : (() => {
                  const row = flow?.trace?.find((r) => r.tier === t.id);
                  if (row && row.reached && row.confidence != null && state !== 'idle') {
                    const meterW = NODE_W - 24;
                    const conf = Math.max(0, Math.min(1, row.confidence));
                    return (
                      <g>
                        <rect x={t.x + 12} y={NODE_Y + 84} width={meterW} height={5} rx={2.5} fill="var(--sr-bg-surface-raised)" />
                        <rect
                          x={t.x + 12}
                          y={NODE_Y + 84}
                          width={meterW * conf}
                          height={5}
                          rx={2.5}
                          fill={row.passed_gate ? color : 'var(--sr-text-muted)'}
                          style={{ transition: 'width 450ms ease' }}
                        />
                        <rect x={t.x + 12 + meterW * THRESHOLD - 0.75} y={NODE_Y + 81} width={1.5} height={11} fill="var(--sr-text-primary)" opacity={0.7} />
                        <text x={t.x + 12} y={NODE_Y + 103} fontSize={8} fill="var(--sr-text-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {`score ${(conf * 100).toFixed(1)}% · gate ${GATE_PCT}%`}
                        </text>
                      </g>
                    );
                  }
                  return (
                    <text x={t.x + 12} y={NODE_Y + 94} fontSize={8} fill="var(--sr-text-muted)">
                      {t.id === 1 ? 'sees 100% of flows' : 'sees only escalations'}
                    </text>
                  );
                })()}

                {/* One-shot scoring sweep — plays once while the packet is at this gate. */}
                {state === 'scoring' && !reduced && (
                  <rect
                    key={`${flow?.id}-${t.id}`}
                    x={t.x + 6}
                    y={NODE_Y + NODE_H - 5}
                    width={NODE_W - 12}
                    height={2.5}
                    rx={1.25}
                    fill={color}
                    style={{
                      transformOrigin: 'left center',
                      transformBox: 'fill-box',
                      animation: `cm-scan ${DWELL_MS[`t${t.id}` as Waypoint]}ms linear 1 both`,
                    }}
                  />
                )}

                {/* Exit lane → bucket */}
                <line
                  x1={t.x + NODE_W / 2}
                  y1={NODE_Y + NODE_H + 2}
                  x2={t.x + NODE_W / 2}
                  y2={BUCKET_Y - 2}
                  stroke={exitLit ? color : 'var(--sr-border-hover)'}
                  strokeWidth={exitLit ? 2.25 : 1.5}
                  strokeDasharray={exitLit ? undefined : '3 3'}
                  markerEnd="url(#cm-arrow)"
                  style={{ transition: 'stroke 300ms ease' }}
                />
                <text
                  x={t.x + NODE_W / 2 + 7}
                  y={(NODE_Y + NODE_H + BUCKET_Y) / 2 + 3}
                  fontSize={9}
                  fontWeight={600}
                  fill={exitLit ? color : 'var(--sr-text-muted)'}
                >
                  {t.id === 3 ? 'final vote' : `≥ ${GATE_PCT}% exit`}
                </text>

                <rect
                  x={t.x}
                  y={BUCKET_Y}
                  width={NODE_W}
                  height={BUCKET_H}
                  rx={10}
                  fill={`color-mix(in srgb, ${color} ${exitLit ? 13 : 4}%, var(--sr-bg-surface))`}
                  stroke={exitLit ? color : 'var(--sr-border-hairline)'}
                  strokeWidth={exitLit ? 1.75 : 1}
                  style={{ transition: 'fill 350ms ease, stroke 350ms ease' }}
                />
                <text x={t.x + 12} y={BUCKET_Y + 16} fontSize={8.5} fontWeight={700} letterSpacing="0.08em" fill="var(--sr-text-muted)">
                  RESOLVED AT T{t.id}
                </text>
                <text
                  x={t.x + 12}
                  y={BUCKET_Y + 38}
                  fontSize={16}
                  fontWeight={700}
                  fill="var(--sr-text-primary)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {count.toLocaleString()}
                </text>
                <text
                  x={t.x + NODE_W - 12}
                  y={BUCKET_Y + 38}
                  textAnchor="end"
                  fontSize={10}
                  fontWeight={600}
                  fill={color}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {total > 0 ? `${share}%` : '—'}
                </text>
                {bucketReached && flow ? (
                  <text
                    x={t.x + 12}
                    y={BUCKET_Y + 56}
                    fontSize={9.5}
                    fontWeight={700}
                    fill={flow.label ? verdictColor : color}
                    style={{ animation: reduced ? undefined : 'cm-settle 400ms ease-out 1 both' }}
                  >
                    {flow.label
                      ? `${truncate(flow.label, 15)}${flow.confidence != null ? ` · ${(flow.confidence * 100).toFixed(0)}%` : ''}`
                      : 'Verdict issued'}
                  </text>
                ) : (
                  <text x={t.x + 12} y={BUCKET_Y + 56} fontSize={8.5} fill="var(--sr-text-muted)">
                    {total > 0 ? 'of flows this session' : 'no live flows yet'}
                  </text>
                )}
              </g>
            );
          })}

          {/* Flow packet — glides between waypoints; stationary when settled. */}
          {flow && (
            <g
              style={{
                transform: `translate(${px}px, ${py}px)`,
                transition: reduced ? 'none' : 'transform 560ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <circle r={11} fill={packetColor} opacity={0.18} style={{ transition: 'fill 300ms ease' }} />
              <circle r={6} fill={packetColor} stroke="var(--sr-bg-page)" strokeWidth={2} style={{ transition: 'fill 300ms ease' }} />
            </g>
          )}
        </svg>
      </div>

      {flow?.source === 'traffic' && flow.trueLabel && (
        <p className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--sr-text-secondary)]">
          <span>
            Ground truth: <b className="text-[var(--sr-text-primary)]">{flow.trueLabel}</b>
          </span>
          <span>
            Cascade said: <b className="text-[var(--sr-text-primary)]">{flow.label}</b>
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              color: flow.correct ? 'var(--sr-sev-info)' : 'var(--sr-sev-high)',
              backgroundColor: 'var(--sr-bg-surface-raised)',
            }}
          >
            {flow.correct ? 'Correct' : 'Missed — shown honestly'}
          </span>
        </p>
      )}
      {mode === 'demo' && (
        <p className="mx-3 mb-2 text-[10px] leading-snug text-[var(--sr-text-muted)]">
          {demoError ??
            'Demo traffic: real held-out test flows run through the live models. They are not live detections and are never saved to Alert History.'}
        </p>
      )}

      <p
        className="mx-3 mb-3 min-h-[2.5rem] rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface)] px-3 py-2 text-[11px] leading-snug text-[var(--sr-text-secondary)]"
        aria-live="off"
      >
        {caption}
      </p>
    </div>
  );
};

export default CascadeMachine;
