/**
 * AttackLabPage — an isolated VirtualBox lab you can watch.
 *
 * Two tracks:
 *  - Quick Lab: one click streams a lab session through the cascade. It never claims
 *    the user launched an attack; it says a lab session is running.
 *  - Live Lab: shown as Coming Soon (gated by LIVE_LAB_ENABLED). The guided steps, commands and
 *    sensor status stay in this file for when it ships.
 *
 * Unvalidated scenarios carry an "Experimental" badge and verdicts are shown as returned.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Copy, FlaskConical, Info, Play, Radio, ShieldAlert, Square, X } from 'lucide-react';
import api from '../services/api';
import { useDashboard } from '../dashboard/DashboardContext';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import { useToast } from '../components/toast/ToastProvider';
import { subscribeLattice } from '../components/lattice/latticeBus';
import { nodeById } from '../components/lattice/topology';
import LabTheater from '../components/lab/LabTheater';
import type {
  LabCatalogue,
  LabEvent,
  LabScenario,
  LabSession,
  LabStatus,
  LabTrack,
} from '../components/lab/types';

const NUDGE_KEY = 'cx-review-nudge-dismissed';

/** Live Lab is parked behind a teaser until the sensor workflow ships. Flip to re-enable the full track. */
const LIVE_LAB_ENABLED = false;

interface EventSnapshot {
  recent: LabEvent[];
  total: number;
  attacks: number;
  counts: Record<string, number>;
}

const EMPTY_SNAPSHOT: EventSnapshot = { recent: [], total: 0, attacks: 0, counts: {} };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

/** Collect detections for this lab from the lattice bus (throttled to ~2.5 Hz of React state). */
function useLabEvents(match: (scenario: string | undefined) => boolean): EventSnapshot & { reset: () => void } {
  const matchRef = useRef(match);
  matchRef.current = match;
  const recent = useRef<LabEvent[]>([]);
  const totals = useRef({ total: 0, attacks: 0 });
  const counts = useRef<Record<string, number>>({});
  const dirty = useRef(false);
  const [snap, setSnap] = useState<EventSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    const unsubscribe = subscribeLattice((ev) => {
      if (!matchRef.current(ev.scenario)) return;
      const item: LabEvent = {
        id: ev.id,
        at: ev.at,
        label: ev.label,
        isAttack: ev.isAttack,
        severity: ev.severity,
        confidence: ev.confidence,
        tier: ev.tier,
        srcIp: ev.srcIp,
        dstIp: ev.dstIp,
      };
      recent.current = [item, ...recent.current].slice(0, 8);
      totals.current.total += 1;
      if (ev.isAttack) totals.current.attacks += 1;
      counts.current[ev.label] = (counts.current[ev.label] ?? 0) + 1;
      dirty.current = true;
    });
    const timer = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setSnap({
        recent: recent.current,
        total: totals.current.total,
        attacks: totals.current.attacks,
        counts: { ...counts.current },
      });
    }, 400);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, []);

  const reset = useCallback(() => {
    recent.current = [];
    totals.current = { total: 0, attacks: 0 };
    counts.current = {};
    dirty.current = false;
    setSnap(EMPTY_SNAPSHOT);
  }, []);

  return { ...snap, reset };
}

const Badge: React.FC<{ tone: 'ok' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
    style={{
      color: tone === 'ok' ? 'var(--sr-sev-info)' : 'var(--sr-sev-medium)',
      backgroundColor: tone === 'ok' ? 'rgba(12,163,12,0.08)' : 'rgba(250,178,25,0.14)',
    }}
  >
    {children}
  </span>
);

/** Polished placeholder for the parked Live Lab track — no checklist, commands or sensor status. */
const LiveLabTeaser: React.FC = () => (
  <GlowPanel className="relative overflow-hidden p-5" aria-label="Live Lab, coming soon" data-testid="live-lab-coming-soon">
    <div
      className="pointer-events-none absolute inset-0 opacity-60"
      style={{ background: 'radial-gradient(60% 120% at 100% 0%, var(--sr-nav-lab-soft) 0%, transparent 70%)' }}
    />
    <div className="relative flex flex-wrap items-center gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sr-nav-lab-soft)] text-[var(--sr-nav-lab)]">
        <Radio className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
            Live Lab
          </h3>
          <span className="rounded-full bg-[rgba(250,178,25,0.14)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--sr-sev-medium)]">
            Coming soon
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">
          A hands-on track for your own isolated network: bring your own Attacker, Victim and Sensor and watch the cascade classify what the Sensor
          sees in real time. It is not available yet — Quick Lab is the way to explore the lab today.
        </p>
      </div>
      <GlowButton type="button" disabled className="shrink-0 opacity-60">
        Not available yet
      </GlowButton>
    </div>
  </GlowPanel>
);

const HowItWorks: React.FC<{ open: boolean; onClose: () => void; note: string }> = ({ open, onClose, note }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="How the lab works"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface)] p-6 shadow-[var(--sr-shadow-md)]"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
                How the lab works
              </h2>
              <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-3 space-y-3 text-xs leading-relaxed text-[var(--sr-text-secondary)]">
              <li>
                <b className="text-[var(--sr-text-primary)]">A sealed network.</b> An Attacker VM, a Victim VM and a Sensor VM share a VirtualBox
                Internal Network. It has no route to your LAN or the internet. {note}
              </li>
              <li>
                <b className="text-[var(--sr-text-primary)]">The sensor watches the wire.</b> It mirrors what crosses the link; Cascadyx turns that
                into flows and runs the three-tier cascade on each one.
              </li>
              <li>
                <b className="text-[var(--sr-text-primary)]">Quick Lab</b> streams a lab session captured earlier on a lab network, so you can see the
                cascade work in under a minute without setting anything up. You are watching the sealed lab — you are not launching the attack yourself.
              </li>
              <li>
                <b className="text-[var(--sr-text-primary)]">Live Lab</b> is coming soon: a guided track for your own VMs, where detections appear as your
                Sensor delivers traffic.
              </li>
              <li>
                <b className="text-[var(--sr-text-primary)]">Honest verdicts.</b> Scenarios we haven't validated are tagged Experimental. The
                cascade was trained on CIC-IDS2017, so verdicts on unfamiliar traffic can be BENIGN or the wrong class — we show exactly what it returns.
              </li>
              <li>
                <b className="text-[var(--sr-text-primary)]">Detection only.</b> Cascadyx never launches attack tools and never blocks traffic.
              </li>
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const AttackLabPage: React.FC = () => {
  const { user, wsConnected } = useDashboard();
  const { pushToast } = useToast();
  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';

  const [catalogue, setCatalogue] = useState<LabCatalogue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [track, setTrack] = useState<LabTrack>('quick');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [session, setSession] = useState<LabSession | null>(null);
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [howOpen, setHowOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [nudgeHidden, setNudgeHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NUDGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  const scenario: LabScenario | null = useMemo(
    () => catalogue?.scenarios.find((s) => s.id === selectedId) ?? null,
    [catalogue, selectedId],
  );

  const events = useLabEvents(
    useCallback(
      (sc: string | undefined) => {
        if (!sc) return false;
        if (track === 'live') return sc === 'lab:live';
        return !!session && sc === `lab:${session.scenario_id}`;
      },
      [track, session],
    ),
  );

  // Initial load (catalogue + resume any active session).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, st] = await Promise.all([
          api.get<LabCatalogue>('/api/lab/scenarios'),
          api.get<LabStatus>('/api/lab/status'),
        ]);
        if (cancelled) return;
        setCatalogue(cat.data);
        setChecked(cat.data.checklist.map(() => false));
        setStatus(st.data);
        const firstReady = cat.data.scenarios.find((s) => s.quick_available) ?? cat.data.scenarios[0];
        setSelectedId(firstReady?.id ?? null);
        if (st.data.active_session) {
          const s = await api.get<LabSession>(`/api/lab/sessions/${st.data.active_session}`);
          if (!cancelled) {
            setSession(s.data);
            setSelectedId(s.data.scenario_id);
          }
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err, 'Could not load the lab.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the running Quick Lab session.
  useEffect(() => {
    if (!session || session.state !== 'running') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await api.get<LabSession>(`/api/lab/sessions/${session.id}`);
        setSession(data);
      } catch {
        /* transient; next tick retries */
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  // Poll sensor status on the Live Lab track.
  useEffect(() => {
    if (track !== 'live') return undefined;
    const tick = async () => {
      try {
        const { data } = await api.get<LabStatus>('/api/lab/status');
        setStatus(data);
      } catch {
        /* transient */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => window.clearInterval(timer);
  }, [track]);

  const startQuick = async () => {
    if (!scenario) return;
    setStarting(true);
    setActionError(null);
    try {
      events.reset();
      const { data } = await api.post<LabSession>('/api/lab/sessions', { scenario_id: scenario.id, rate: 8 });
      setSession(data);
    } catch (err) {
      setActionError(errorText(err, 'Could not start the lab session.'));
    } finally {
      setStarting(false);
    }
  };

  const stopQuick = async () => {
    if (!session) return;
    try {
      const { data } = await api.post<LabSession>(`/api/lab/sessions/${session.id}/stop`);
      setSession(data);
    } catch (err) {
      setActionError(errorText(err, 'Could not stop the session.'));
    }
  };

  const toggleSensor = async (action: 'enable' | 'disable') => {
    try {
      await api.post(`/api/lab/live/${action}`);
      const { data } = await api.get<LabStatus>('/api/lab/status');
      setStatus(data);
      pushToast(action === 'enable' ? 'Sensor watcher enabled.' : 'Sensor watcher disabled.', 'info');
    } catch (err) {
      pushToast(errorText(err, 'Could not change the sensor watcher.'), 'error');
    }
  };

  const copyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
    } catch {
      pushToast('Copy failed — select the command and copy it manually.', 'warning');
    }
  };

  const dismissNudge = () => {
    setNudgeHidden(true);
    try {
      localStorage.setItem(NUDGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const victimIp = nodeById('lab-vic')?.ip ?? '192.168.56.30';
  const quickRunning = session?.state === 'running';
  const quickDone = !!session && session.state !== 'running';
  const allChecked = checked.length > 0 && checked.every(Boolean);
  const sensor = status?.sensor;

  // Theater props per track.
  const theaterActive = track === 'quick' ? !!quickRunning : !!sensor?.sensor_online;
  const quickStatus = !session
    ? 'Pick a scenario and start a lab session. Nothing is running yet.'
    : quickRunning
      ? `Lab session running on the isolated Attacker → Victim network${scenario ? ` · ${scenario.name}` : ''}. The Sensor is classifying what crosses the wire.`
      : session.state === 'failed'
        ? `Lab session failed${session.error ? `: ${session.error}` : '.'}`
        : `Lab session ${session.state === 'stopped' ? 'stopped' : 'finished'} — ${(session.flows_classified ?? 0).toLocaleString()} flows classified, ${(session.threats_found ?? 0).toLocaleString()} flagged.`;
  const liveStatus = !sensor?.enabled
    ? 'Sensor watcher is off. An admin can switch it on once your Sensor VM is writing captures.'
    : sensor.sensor_online
      ? `Sensor online — ${sensor.flows_classified.toLocaleString()} flows classified so far.`
      : 'Waiting for sensor… run a command on the Attacker VM and keep the Sensor capturing.';
  const attackerLines =
    track === 'live'
      ? ['$ ready', ...(scenario?.live_commands ?? []).slice(0, 3).map((c) => `$ ${c.replace('<VICTIM_IP>', victimIp)}`)]
      : ['● session channel open', scenario ? `scenario: ${scenario.name}` : 'no scenario selected', quickRunning ? '… traffic on the wire' : 'idle'];

  const phase = !session ? 0 : session.state === 'running' ? ((session.flows_classified ?? 0) > 0 ? 3 : (session.flows_total ?? 0) > 0 ? 2 : 1) : 4;
  const PHASES = ['Channel open', 'Traffic on the wire', 'Sensor classifying', 'Session complete'];

  if (loadError) {
    return (
      <p role="alert" className="py-16 text-center text-xs text-[var(--sr-sev-critical)]">
        {loadError}
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <GlowPanel className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-nav-lab)]">
              <FlaskConical className="h-3 w-3" /> Attack Lab
            </p>
            <h1 className="mt-1 text-lg font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
              Watch an attack cross a sealed network
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--sr-text-secondary)]">
              An Attacker VM, a Victim VM and a Sensor on an isolated VirtualBox Internal Network. Pick a scenario and see the cascade classify
              what the Sensor sees.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]"
            >
              <Info className="h-3 w-3" /> How the lab works
            </button>
            <div role="tablist" aria-label="Lab track" className="inline-flex rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-0.5 text-[11px] font-medium">
              {(['quick', 'live'] as LabTrack[]).map((t) => {
                const locked = t === 'live' && !LIVE_LAB_ENABLED;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={track === t}
                    aria-disabled={locked}
                    disabled={locked}
                    title={locked ? 'Live Lab is coming soon' : undefined}
                    onClick={() => {
                      if (locked) return;
                      setTrack(t);
                      setActionError(null);
                      events.reset();
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 transition-colors ${
                      locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    } ${track === t ? 'bg-[var(--sr-nav-lab-soft)] text-[var(--sr-nav-lab)]' : 'text-[var(--sr-text-secondary)]'}`}
                  >
                    {t === 'quick' ? 'Quick Lab' : 'Live Lab'}
                    {locked && (
                      <span className="rounded-full bg-[var(--sr-bg-surface-raised)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--sr-text-muted)]">
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </GlowPanel>

      {/* Scenario cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(catalogue?.scenarios ?? []).map((s) => {
          const selected = s.id === selectedId;
          const unavailable = track === 'quick' && !s.quick_available;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (quickRunning) return;
                setSelectedId(s.id);
                setActionError(null);
              }}
              aria-pressed={selected}
              className={`cursor-pointer rounded-[var(--sr-radius-md)] border p-4 text-left transition-all ${
                selected
                  ? 'border-[var(--sr-nav-lab)] bg-[var(--sr-nav-lab-soft)]'
                  : 'border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] hover:border-[var(--sr-border-hover)]'
              } ${unavailable ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">{s.category}</span>
                {s.validated ? <Badge tone="ok">Validated</Badge> : <Badge tone="warn">Experimental</Badge>}
              </div>
              <h3 className="mt-1.5 text-sm font-semibold text-[var(--sr-text-primary)]">{s.name}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">{s.blurb}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.expected_labels.map((l) => (
                  <span key={l} className="rounded-full border border-[var(--sr-border-hairline)] px-1.5 py-0.5 text-[10px] text-[var(--sr-text-secondary)]">
                    {l}
                  </span>
                ))}
                {unavailable && <span className="text-[10px] text-[var(--sr-text-muted)]">Quick Lab session not available yet</span>}
              </div>
            </button>
          );
        })}
      </div>

      {scenario?.experimental && (
        <p className="flex items-start gap-2 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[rgba(250,178,25,0.08)] px-3 py-2 text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sr-sev-medium)]" />
          <span>
            <b className="text-[var(--sr-text-primary)]">Experimental scenario.</b> We haven’t validated how the cascade scores this one yet, so
            verdicts are shown exactly as returned — often BENIGN or a near-miss class.
          </span>
        </p>
      )}

      {/* Theater */}
      <LabTheater
        track={track}
        active={theaterActive}
        status={track === 'quick' ? quickStatus : liveStatus}
        attackerLines={attackerLines}
        totals={{ total: events.total, attacks: events.attacks }}
        recent={events.recent}
        sensorLabel={
          track === 'quick'
            ? quickRunning
              ? 'capturing · classifying'
              : 'standing by'
            : sensor?.sensor_online
              ? 'online · delivering captures'
              : sensor?.enabled
                ? 'waiting for traffic…'
                : 'watcher off'
        }
        sensorOk={track === 'quick' ? !!quickRunning : !!sensor?.sensor_online}
      />

      {!wsConnected && (
        <p className="text-[11px] text-[var(--sr-sev-medium)]">Live feed disconnected — detections won’t animate until it reconnects.</p>
      )}

      {/* Track controls */}
      {track === 'quick' ? (
        <GlowPanel className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            {quickRunning ? (
              <GlowButton type="button" onClick={() => void stopQuick()} className="!bg-[var(--sr-sev-critical)] !text-white !border-transparent">
                <Square className="h-3.5 w-3.5 fill-white" /> Stop session
              </GlowButton>
            ) : (
              <GlowButton
                type="button"
                onClick={scenario?.quick_available && !starting ? () => void startQuick() : undefined}
                disabled={!scenario?.quick_available || starting}
              >
                <Play className="h-3.5 w-3.5 fill-current" /> {starting ? 'Starting…' : 'Run lab session'}
              </GlowButton>
            )}
            <p className="text-[11px] text-[var(--sr-text-muted)]">
              {scenario?.provenance ? `Source: ${scenario.provenance} · ` : ''}about {scenario?.duration_s ?? 60}s
            </p>
            <Link to="/" className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--sr-accent)] hover:underline">
              Watch it on Live Detection <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 text-xs text-[var(--sr-sev-critical)]">
              {actionError}
            </p>
          )}

          <ol className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {PHASES.map((label, i) => {
              const reached = phase >= i + 1;
              return (
                <li
                  key={label}
                  className="rounded-[var(--sr-radius-sm)] border px-3 py-2 text-[11px]"
                  style={{
                    borderColor: reached ? 'var(--sr-nav-lab)' : 'var(--sr-border-hairline)',
                    background: reached ? 'var(--sr-nav-lab-soft)' : 'transparent',
                    color: reached ? 'var(--sr-text-primary)' : 'var(--sr-text-muted)',
                  }}
                >
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: reached ? 'var(--sr-nav-lab)' : 'var(--sr-bg-surface-raised)', color: reached ? '#fff' : 'inherit' }}>
                    {reached ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  {label}
                  {i === 1 && (session?.flows_total ?? 0) > 0 && (
                    <span className="ml-1 text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      · {(session?.flows_total ?? 0).toLocaleString()} flows
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {quickDone && Object.keys(events.counts).length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-[var(--sr-text-primary)]">What the cascade said</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(events.counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, n]) => (
                    <span key={label} className="rounded-full border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] px-2 py-0.5 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {label}: {n}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {quickDone && !nudgeHidden && session?.state === 'completed' && (
            <div className="mt-4 flex items-center gap-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-nav-reviews)] bg-[var(--sr-nav-reviews-soft)] px-3 py-2 text-[11px] text-[var(--sr-text-secondary)]">
              <span className="flex-1">Enjoyed the lab? Share quick feedback — it helps us decide what to build next.</span>
              <Link to="/reviews" className="font-semibold text-[var(--sr-nav-reviews)] hover:underline">
                Share feedback
              </Link>
              <button type="button" onClick={dismissNudge} aria-label="Dismiss" className="cursor-pointer text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </GlowPanel>
      ) : (
        <GlowPanel className="p-5">
          <h3 className="text-sm font-semibold text-[var(--sr-text-primary)]">Before you start</h3>
          <p className="mt-1 text-[11px] text-[var(--sr-text-muted)]">{catalogue?.isolation_note}</p>
          <ul className="mt-3 space-y-2">
            {(catalogue?.checklist ?? []).map((item, i) => (
              <li key={item}>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--sr-text-secondary)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--sr-nav-lab)]"
                    checked={checked[i] ?? false}
                    onChange={(e) => setChecked((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))}
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>

          {allChecked ? (
            <div className="mt-5 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-[var(--sr-text-primary)]">Run on the Attacker VM{scenario ? ` · ${scenario.name}` : ''}</h4>
                <p className="mt-0.5 text-[11px] text-[var(--sr-text-muted)]">
                  Victim address assumed to be {victimIp} — change it if your Victim VM uses another one.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(scenario?.live_commands ?? []).map((raw) => {
                    const cmd = raw.replace('<VICTIM_IP>', victimIp);
                    return (
                      <li key={raw} className="flex items-center gap-2 rounded-[var(--sr-radius-sm)] bg-[#0B0E14] px-3 py-2">
                        <code className="flex-1 overflow-x-auto whitespace-nowrap text-[11px] text-slate-200" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>
                          $ {cmd}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyCommand(cmd)}
                          className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-medium text-slate-300 hover:text-white"
                        >
                          {copied === cmd ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copied === cmd ? 'Copied' : 'Copy'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                  style={{
                    background: sensor?.sensor_online ? 'rgba(12,163,12,0.1)' : 'var(--sr-bg-surface-raised)',
                    color: sensor?.sensor_online ? 'var(--sr-sev-info)' : 'var(--sr-text-muted)',
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                  {sensor?.sensor_online ? 'Sensor online' : sensor?.enabled ? 'Waiting for sensor…' : 'Sensor watcher off'}
                </span>
                {sensor?.last_error && <span className="text-[var(--sr-sev-critical)]">Last error: {sensor.last_error}</span>}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void toggleSensor(sensor?.enabled ? 'disable' : 'enable')}
                    className="ml-auto cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-2.5 py-1 font-medium text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]"
                  >
                    {sensor?.enabled ? 'Turn sensor watcher off' : 'Turn sensor watcher on'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[11px] text-[var(--sr-text-muted)]">Tick every item to reveal the commands.</p>
          )}
        </GlowPanel>
      )}

      {!LIVE_LAB_ENABLED && <LiveLabTeaser />}

      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} note={catalogue?.isolation_note ?? ''} />
    </div>
  );
};

export default AttackLabPage;
