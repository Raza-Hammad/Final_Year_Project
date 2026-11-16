import React, { useState } from 'react';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import StatusBadge from '../components/ui/StatusBadge';
import Logomark from '../components/ui/Logomark';
import CascadeMachine from '../components/lattice/CascadeMachine';
import ThreatDnaSignature from '../components/ThreatDnaSignature';
import type { DetectionData } from '../dashboard/types';

const DNA_SAMPLE: DetectionData = {
  predicted_label: 'DDoS',
  confidence: 0.97,
  tier: 1,
  tier_name: 'Tier 1: LightGBM (Fast Screener)',
  top_features: [],
  raw_features: {
    Init_Win_bytes_forward: 8192,
    Init_Win_bytes_backward: 0,
    'Bwd Packet Length Max': 0,
    'Fwd Packet Length Max': 1460,
    'Average Packet Size': 920,
    'Packet Length Variance': 310000,
    'Total Length of Fwd Packets': 6400,
    'Bwd Packets/s': 12,
  },
  benign_averages: {
    Init_Win_bytes_forward: 4200,
    Init_Win_bytes_backward: 2900,
    'Bwd Packet Length Max': 640,
    'Fwd Packet Length Max': 240,
    'Average Packet Size': 160,
    'Packet Length Variance': 40000,
    'Total Length of Fwd Packets': 900,
    'Bwd Packets/s': 420,
  },
};
import { RefreshCw } from 'lucide-react';

const SWATCHES: { label: string; varName: string }[] = [
  { label: 'Page', varName: '--sr-bg-page' },
  { label: 'Surface', varName: '--sr-bg-surface' },
  { label: 'Surface raised', varName: '--sr-bg-surface-raised' },
  { label: 'Accent', varName: '--sr-accent' },
  { label: 'Accent hover', varName: '--sr-accent-hover' },
];

const STATUS_SWATCHES: { label: string; varName: string }[] = [
  { label: 'Critical', varName: '--sr-sev-critical' },
  { label: 'High', varName: '--sr-sev-high' },
  { label: 'Medium', varName: '--sr-sev-medium' },
  { label: 'Low', varName: '--sr-sev-low' },
  { label: 'Info', varName: '--sr-sev-info' },
];

const CATEGORICAL_SWATCHES: { label: string; varName: string }[] = [
  { label: 'Tier 1', varName: '--sr-cat-1' },
  { label: 'Tier 2', varName: '--sr-cat-2' },
  { label: 'Tier 3', varName: '--sr-cat-3' },
];

const Swatch: React.FC<{ label: string; varName: string }> = ({ label, varName }) => (
  <div className="flex flex-col gap-2">
    <div
      className="h-14 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)]"
      style={{ backgroundColor: `var(${varName})` }}
    />
    <div>
      <p className="text-xs font-medium text-[var(--sr-text-primary)]">{label}</p>
      <p className="text-[11px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{varName}</p>
    </div>
  </div>
);

export const DesignSystemDemo: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleSimulate = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div
      className="min-h-screen bg-[var(--sr-bg-page)] text-[var(--sr-text-primary)] px-6 py-12 sm:px-10"
      style={{ fontFamily: 'var(--sr-font-sans)' }}
    >
      <div className="mx-auto w-full max-w-5xl space-y-10">

        {/* Header */}
        <div className="flex flex-col gap-2 border-b border-[var(--sr-border-hairline)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--sr-radius-sm)] bg-[var(--sr-accent-soft)]">
              <Logomark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
                Cascadyx — Design System
              </h1>
              <p className="text-sm text-[var(--sr-text-secondary)]">
                "Signal Room" — light, restrained, one accent color
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <StatusBadge status="Secure" />
            <StatusBadge status="Connected" />
          </div>
        </div>

        {/* Color palette */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">Surfaces &amp; accent</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {SWATCHES.map((s) => <Swatch key={s.varName} {...s} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">
            Status palette <span className="font-normal text-[var(--sr-text-muted)]">— always paired with a dot + label, never color alone</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {STATUS_SWATCHES.map((s) => <Swatch key={s.varName} {...s} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">
            Categorical palette <span className="font-normal text-[var(--sr-text-muted)]">— fixed order, reused everywhere cascade tiers or models appear</span>
          </h2>
          <div className="grid grid-cols-3 gap-4 sm:max-w-md">
            {CATEGORICAL_SWATCHES.map((s) => <Swatch key={s.varName} {...s} />)}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">
            Cascade machine <span className="font-normal text-[var(--sr-text-muted)]">— sample counts; use the walkthrough buttons to replay a T1 / T2 / T3 exit</span>
          </h2>
          <GlowPanel className="p-5">
            <CascadeMachine liveTiers={{ 1: 1840, 2: 212, 3: 37 }} height={300} />
          </GlowPanel>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]">
            Threat DNA signature <span className="font-normal text-[var(--sr-text-muted)]">— one-shot reveal, then static</span>
          </h2>
          <GlowPanel className="max-w-md p-5">
            <ThreatDnaSignature detection={DNA_SAMPLE} />
          </GlowPanel>
        </section>

        {/* Typography */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GlowPanel>
            <h3 className="mb-4 border-b border-[var(--sr-border-hairline)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sr-text-muted)]">
              Typography
            </h3>
            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-[11px] text-[var(--sr-text-muted)]">Heading — Inter Semibold</span>
                <h2 className="text-2xl font-semibold tracking-tight text-[var(--sr-text-primary)]">
                  Threat Posture Index
                </h2>
              </div>
              <div>
                <span className="mb-1 block text-[11px] text-[var(--sr-text-muted)]">Body — Inter Regular</span>
                <p className="text-sm leading-relaxed text-[var(--sr-text-secondary)]">
                  Body copy stays in the same sans family as headings, just lighter weight and a secondary ink
                  color — no separate display face, no monospace-for-everything.
                </p>
              </div>
              <div>
                <span className="mb-1 block text-[11px] text-[var(--sr-text-muted)]">Tabular numerals — reserved for aligned data only</span>
                <div className="rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] p-3 text-sm text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <p>Verdict&nbsp;&nbsp;&nbsp;&nbsp;DDoS Attack</p>
                  <p>Confidence&nbsp;99.98%</p>
                  <p>Rate&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;148,252 pkts/sec</p>
                </div>
              </div>
            </div>
          </GlowPanel>

          <GlowPanel>
            <h3 className="mb-4 border-b border-[var(--sr-border-hairline)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sr-text-muted)]">
              Buttons
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <span className="block text-center text-[11px] text-[var(--sr-text-muted)]">Primary</span>
                <GlowButton variant="primary" className="w-full" onClick={handleSimulate} disabled={loading}>
                  {loading ? (<><RefreshCw className="h-3.5 w-3.5 animate-spin" />Working</>) : 'Start simulation'}
                </GlowButton>
              </div>
              <div className="space-y-2">
                <span className="block text-center text-[11px] text-[var(--sr-text-muted)]">Secondary</span>
                <GlowButton variant="secondary" className="w-full">Acknowledge</GlowButton>
              </div>
              <div className="space-y-2">
                <span className="block text-center text-[11px] text-[var(--sr-text-muted)]">Ghost</span>
                <GlowButton variant="ghost" className="w-full">Dismiss</GlowButton>
              </div>
            </div>

            <h3 className="mb-4 mt-6 border-b border-[var(--sr-border-hairline)] pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sr-text-muted)]">
              Severity badges
            </h3>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="Critical" />
              <StatusBadge status="High" />
              <StatusBadge status="Medium" />
              <StatusBadge status="Low" />
              <StatusBadge status="Info" />
              <StatusBadge status="Rule-Based" />
              <StatusBadge status="AI" />
            </div>
          </GlowPanel>
        </section>

        {/* Card example */}
        <GlowPanel className="max-w-sm">
          <span className="text-[11px] font-medium text-[var(--sr-text-muted)]">Packets processed</span>
          <p className="mt-1 text-3xl font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>12,480</p>
          <p className="mt-1 text-xs text-[var(--sr-text-secondary)]">Total streams screened this session</p>
        </GlowPanel>

        <div className="border-t border-[var(--sr-border-hairline)] pt-6 text-center">
          <span className="text-xs text-[var(--sr-text-muted)]">Cascadyx · Design System v2 · Signal Room</span>
        </div>

      </div>
    </div>
  );
};
export default DesignSystemDemo;
