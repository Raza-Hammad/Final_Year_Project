import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye, Lightbulb, X, ArrowRight } from 'lucide-react';
import {
  SCENARIO_LEARN,
  RUNNING_COACH,
  GUIDED_LEARN_TIPS,
  GUIDED_TIPS_STORAGE_KEY,
} from '../../dashboard/constants';

type ScenarioLearnCardProps = {
  scenarioKey: string | null | undefined;
  displayName?: string;
};

/** Idle CSV arming: short attack story / learning outcomes. */
export const ScenarioLearnCard: React.FC<ScenarioLearnCardProps> = ({ scenarioKey, displayName }) => {
  if (!scenarioKey) return null;
  const learn = SCENARIO_LEARN[scenarioKey];
  if (!learn) return null;

  return (
    <div className="mt-3 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <BookOpen className="w-3.5 h-3.5 text-[var(--sr-accent)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--sr-text-primary)]">
          What you will learn
          {displayName ? ` · ${displayName}` : learn.title ? ` · ${learn.title}` : ''}
        </span>
      </div>
      <p className="text-[11px] text-[var(--sr-text-secondary)] leading-relaxed">{learn.story}</p>
    </div>
  );
};

type WhatYoureSeeingProps = {
  mode: 'csv' | 'replay';
  severityHint?: string | null;
  attacksDetected: number;
  /** When true, show link toward Live Detection (Simulator page). */
  showLiveLink?: boolean;
  /** Compact layout for Live Detection page. */
  compact?: boolean;
};

/** Shown while simulation / replay is running. */
export const WhatYoureSeeingNow: React.FC<WhatYoureSeeingProps> = ({
  mode,
  severityHint,
  attacksDetected,
  showLiveLink = true,
  compact = false,
}) => {
  const navigate = useNavigate();
  const coach = mode === 'replay' ? RUNNING_COACH.replay : RUNNING_COACH.csv;

  return (
    <div
      className={`rounded-[var(--sr-radius-md)] border border-[var(--sr-accent)]/35 bg-[var(--sr-accent-soft)] ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Eye className="w-3.5 h-3.5 text-[var(--sr-accent)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--sr-text-primary)]">{coach.headline}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-[var(--sr-accent)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--sr-accent)] animate-pulse" />
          Live
        </span>
      </div>

      <ul className="space-y-1.5 text-[11px] text-[var(--sr-text-secondary)] leading-relaxed">
        {severityHint && mode === 'csv' && (
          <li>
            <span className="text-[var(--sr-text-primary)] font-medium">Severity cue:</span>{' '}
            this preset leans <span className="font-medium text-[var(--sr-text-primary)]">{severityHint}</span> when
            attacks fire — compare that to colors on the lattice.
          </li>
        )}
        <li>{coach.mapPulse}</li>
        <li>{coach.tiers}</li>
        <li>
          <span className="text-[var(--sr-text-primary)] font-medium">So far:</span>{' '}
          {attacksDetected > 0
            ? `${attacksDetected.toLocaleString()} threat alert${attacksDetected === 1 ? '' : 's'} flagged in this run.`
            : mode === 'replay'
              ? 'No attacks yet — quiet sessions often stay BENIGN; keep watching the status counters.'
              : 'Waiting for the first non-BENIGN classification…'}
        </li>
      </ul>

      {showLiveLink && (
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--sr-accent)] hover:underline"
        >
          {coach.liveLink}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

type GuidedTipsProps = {
  attacksDetected: number;
  aiQueriesRemaining?: number | null;
  aiQueryLimit?: number | null;
  /** Admin accounts have no AI cap. */
  aiUnlimited?: boolean;
  /** Prefer 'history' | 'ai' path hints when on Live Detection. */
  variant?: 'simulator' | 'live';
};

/**
 * Non-spammy tips after the first detection in a browser session.
 * Dismissed tips stay hidden via sessionStorage for the tab lifetime.
 */
export const GuidedLearningTips: React.FC<GuidedTipsProps> = ({
  attacksDetected,
  aiQueriesRemaining,
  aiQueryLimit,
  aiUnlimited = false,
  variant = 'simulator',
}) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem(GUIDED_TIPS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (attacksDetected > 0) setUnlocked(true);
  }, [attacksDetected]);

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [id]: true };
      try {
        sessionStorage.setItem(GUIDED_TIPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  };

  if (!unlocked) return null;

  const visible = GUIDED_LEARN_TIPS.filter((t) => !dismissed[t.id]);
  if (visible.length === 0) return null;

  // Show one tip at a time to stay non-spammy
  const tip = visible[0];
  const quotaNote =
    tip.id === 'ai' &&
    !aiUnlimited &&
    typeof aiQueriesRemaining === 'number' &&
    typeof aiQueryLimit === 'number' &&
    aiQueryLimit > 0
      ? ` About ${aiQueriesRemaining} of ${aiQueryLimit} AI questions left on your account.`
      : '';

  const go = () => {
    if (tip.id === 'history') navigate('/history');
    else if (tip.id === 'ai') navigate('/ai');
    else if (tip.id === 'explain' && variant === 'simulator') navigate('/');
    else if (tip.id === 'explain') navigate('/history');
  };

  return (
    <div className="rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] px-3 py-2.5 flex gap-2.5 items-start">
      <Lightbulb className="w-3.5 h-3.5 text-[var(--sr-accent-2)] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-[var(--sr-text-primary)] mb-0.5">
          Next step · {tip.title}
        </p>
        <p className="text-[11px] text-[var(--sr-text-secondary)] leading-relaxed">
          {tip.body}
          {quotaNote}
        </p>
        <button
          type="button"
          onClick={go}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--sr-accent)] hover:underline"
        >
          Open
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => dismiss(tip.id)}
        className="shrink-0 p-0.5 rounded text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)]"
        aria-label="Dismiss tip"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
