import React, { useState, useEffect, useRef } from 'react';
import GlowButton from '../components/ui/GlowButton';
import NetworkBackground from '../components/ui/NetworkBackground';
import AuroraBackground from '../components/ui/AuroraBackground';
import CursorSpotlight from '../components/ui/CursorSpotlight';
import RoamingAttacker from '../components/ui/RoamingAttacker';
import Logomark from '../components/ui/Logomark';
import { Radio, ShieldAlert, MessageSquareText, Sparkles, TriangleAlert } from 'lucide-react';

const STEP_DOTS = [1, 2, 3];

interface IntroProps {
  onComplete: () => void;
}

// Step timeline:
// 0 idle  1 SIMULATE (attack packet travels in)  2 DETECT (shield scan + catch)
// 3 EXPLAIN (insight card reveal)  4 pillars recap  5 title + CTA
const CAPTIONS: Record<number, { title: string; sub: string }> = {
  1: { title: 'We simulate real attack traffic.', sub: 'Recorded threat data, replayed safely in an isolated environment — never a live attack.' },
  2: { title: 'Our AI detects it — instantly.', sub: 'A cascade of machine learning models screens every flow the moment it arrives.' },
  3: { title: 'And explains exactly why.', sub: 'Not just a red light — a plain-English reason an analyst can actually act on.' },
};

const PILLARS = [
  { icon: Radio, label: 'Simulate', desc: 'Replay real attacks safely' },
  { icon: ShieldAlert, label: 'Detect', desc: 'AI cascade flags threats live' },
  { icon: MessageSquareText, label: 'Explain', desc: 'Plain-English attribution' },
];

// Very low-opacity ambient tint per step -- reinforces the narrative beat without
// ever reading as a "dark/bold" theme change.
const STEP_WASH: Record<number, string> = {
  1: 'rgba(42, 120, 214, 0.035)',
  2: 'rgba(208, 59, 59, 0.045)',
  3: 'rgba(12, 163, 12, 0.03)',
};

const ConfidenceRing: React.FC<{ progress: number }> = ({ progress }) => {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--sr-border-hairline)" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={radius} fill="none"
          stroke="var(--sr-sev-critical)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(progress)}%
      </span>
    </div>
  );
};

export const Intro: React.FC<IntroProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [packetsReplayed, setPacketsReplayed] = useState(0);
  const [burst, setBurst] = useState(false);
  const prevStepRef = useRef(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 900),
      setTimeout(() => setStep(2), 3600),
      setTimeout(() => setStep(3), 6400),
      setTimeout(() => setStep(4), 9600),
      setTimeout(() => setStep(5), 11600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Fires exactly on the 1 -> 2 transition (the "catch" moment): triggers the
  // confidence ring fill and a one-shot particle burst.
  useEffect(() => {
    if (prevStepRef.current === 1 && step === 2) {
      setBurst(true);
      const rampTimer = setTimeout(() => setConfidence(94), 60);
      const burstTimer = setTimeout(() => setBurst(false), 750);
      prevStepRef.current = step;
      return () => { clearTimeout(rampTimer); clearTimeout(burstTimer); };
    }
    if (step < 1) setConfidence(0);
    prevStepRef.current = step;
  }, [step]);

  // Live "packets replayed" tick while the Simulate step plays.
  useEffect(() => {
    if (step !== 1) {
      setPacketsReplayed(0);
      return;
    }
    const interval = setInterval(() => {
      setPacketsReplayed((prev) => Math.min(2847, prev + Math.round(40 + Math.random() * 90)));
    }, 90);
    return () => clearInterval(interval);
  }, [step]);

  const packetTravelling = step === 1;
  const scanning = step === 2;
  const caught = step >= 2;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[var(--sr-bg-page)] px-6 font-sans text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-sans)' }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cta-border-sweep {
          to { transform: rotate(360deg); }
        }
      `}} />

      <AuroraBackground className="absolute inset-0" variant="hero" />
      <NetworkBackground className="absolute inset-0" opacity={0.4} variant="mixed" interactive />
      <CursorSpotlight />
      {/* Roaming decoy "attacker" -- stalks the cursor during the live demo beats
          (Simulate/Detect/Explain), retreating once the pillars/title resolve the story */}
      {step < 4 && <RoamingAttacker />}

      {/* Ambient per-step color wash */}
      <div
        className="pointer-events-none absolute inset-0 transition-colors duration-1000"
        style={{ backgroundColor: STEP_WASH[step] ?? 'transparent' }}
        aria-hidden="true"
      />

      {/* Skip link */}
      <button
        onClick={onComplete}
        className="absolute right-6 top-6 z-50 flex cursor-pointer items-center gap-1.5 rounded-[var(--sr-radius-sm)] border border-transparent px-2.5 py-1 text-xs text-[var(--sr-text-muted)] transition-colors hover:border-[var(--sr-border-hairline)] hover:text-[var(--sr-text-primary)]"
      >
        Skip
        <span className="text-[10px]">»</span>
      </button>

      <div className="relative flex w-full max-w-xl flex-col items-center">

        {/* ============== SCENE (visible while step < 4) ============== */}
        <div className={`w-full transition-opacity duration-700 ${step >= 4 ? 'pointer-events-none absolute opacity-0' : 'opacity-100'}`}>
          <div className="relative mx-auto mb-8 h-[190px] w-full max-w-md">

            {/* Live confidence readout — appears at the moment of detection */}
            <div className={`absolute right-0 top-0 flex flex-col items-center gap-1 transition-all duration-500 ${
              step >= 2 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2'
            }`}>
              <ConfidenceRing progress={confidence} />
              <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--sr-text-muted)]">Confidence</span>
            </div>

            {/* Live packet counter — ticks while replaying */}
            <div className={`absolute left-0 top-0 transition-opacity duration-300 ${step === 1 ? 'opacity-100' : 'opacity-0'}`}>
              <span className="block text-[9px] font-medium uppercase tracking-wider text-[var(--sr-text-muted)]">Packets replayed</span>
              <span className="block text-lg font-semibold text-[var(--sr-text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {packetsReplayed.toLocaleString()}
              </span>
            </div>

            <svg viewBox="0 0 320 170" className="h-full w-full overflow-visible">
              {/* Dormant topology lines */}
              <path d="M 46 85 Q 160 40 274 60" fill="none" stroke="var(--sr-border-hover)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <path d="M 46 85 Q 160 130 274 110" fill="none" stroke="var(--sr-border-hover)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

              {/* Internal LAN boundary */}
              <rect x="230" y="30" width="80" height="110" rx="8" fill="none" stroke="var(--sr-border-hairline)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx="270" cy="55" r="10" fill="var(--sr-bg-surface)" stroke={caught ? 'var(--sr-sev-critical)' : 'var(--sr-border-hover)'} strokeWidth="1.5" className="transition-colors duration-500" />
              <circle cx="270" cy="85" r="8" fill="var(--sr-bg-surface)" stroke="var(--sr-border-hover)" strokeWidth="1.5" />
              <circle cx="270" cy="115" r="8" fill="var(--sr-bg-surface)" stroke="var(--sr-border-hover)" strokeWidth="1.5" />

              {/* Detection scan ring */}
              {scanning && (
                <circle cx="270" cy="55" r="10" fill="none" stroke="var(--sr-accent)" strokeWidth="1.5" opacity="0.7">
                  <animate attributeName="r" values="10;34" dur="1.1s" repeatCount="2" />
                  <animate attributeName="opacity" values="0.7;0" dur="1.1s" repeatCount="2" />
                </circle>
              )}

              {/* One-shot particle burst at the instant of the catch */}
              {burst && Array.from({ length: 8 }).map((_, i) => {
                const angle = (i / 8) * Math.PI * 2;
                const x2 = 270 + Math.cos(angle) * 26;
                const y2 = 55 + Math.sin(angle) * 26;
                return (
                  <line
                    key={i}
                    x1={270 + Math.cos(angle) * 11} y1={55 + Math.sin(angle) * 11}
                    x2={x2} y2={y2}
                    stroke="var(--sr-sev-critical)" strokeWidth="1.5" strokeLinecap="round"
                  >
                    <animate attributeName="opacity" values="0.9;0" dur="0.6s" fill="freeze" />
                  </line>
                );
              })}

              {caught && (
                <g className="animate-fade-in">
                  <circle cx="270" cy="55" r="15" fill="none" stroke="var(--sr-sev-critical)" strokeWidth="1" opacity="0.5" />
                  <foreignObject x="282" y="38" width="16" height="16">
                    <TriangleAlert className="h-3.5 w-3.5" style={{ color: 'var(--sr-sev-critical)' }} />
                  </foreignObject>
                </g>
              )}

              {/* Attacker node */}
              <circle cx="46" cy="85" r="12" fill="rgba(208,59,59,0.08)" stroke="var(--sr-sev-critical)" strokeWidth="1.5" />
              <foreignObject x="38" y="77" width="16" height="16">
                <Radio className="h-4 w-4" style={{ color: 'var(--sr-sev-critical)' }} />
              </foreignObject>

              {/* Travelling packet */}
              {packetTravelling && (
                <circle r="3" fill="var(--sr-sev-critical)">
                  <animateMotion path="M 46 85 Q 160 40 270 55" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
            </svg>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-[var(--sr-text-primary)]">
              {CAPTIONS[step]?.title ?? 'Every network hides both everyday traffic and hidden threats.'}
            </p>
            <p className="mt-1.5 text-sm text-[var(--sr-text-secondary)]">
              {CAPTIONS[step]?.sub ?? ' '}
            </p>
          </div>

          {/* Step-progress indicator — tracks which narrative beat is playing */}
          <div className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
            {STEP_DOTS.map((s) => (
              <span
                key={s}
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: step === s ? '20px' : '6px',
                  backgroundColor: step >= s ? 'var(--sr-accent)' : 'var(--sr-border-hairline)',
                }}
              />
            ))}
          </div>

          {/* EXPLAIN insight card */}
          <div className={`mt-6 mx-auto max-w-sm rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] p-4 shadow-[var(--sr-shadow-md)] backdrop-blur-sm transition-all duration-500 ${
            step === 3 ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2 absolute inset-x-0'
          }`}>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(208,59,59,0.1)]">
                <TriangleAlert className="h-3.5 w-3.5" style={{ color: 'var(--sr-sev-critical)' }} />
              </div>
              <span className="text-sm font-semibold text-[var(--sr-text-primary)]">DDoS Attack</span>
              <span className="ml-auto text-xs font-medium text-[var(--sr-sev-critical)]">Critical · 94%</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sr-text-secondary)]">
              Flagged because incoming traffic volume and packet-timing patterns diverged sharply from this network's normal baseline.
            </p>
          </div>
        </div>

        {/* ============== PILLARS RECAP (step 4) ============== */}
        <div className={`grid grid-cols-3 gap-4 transition-all duration-700 ${step === 4 ? 'opacity-100' : 'pointer-events-none absolute opacity-0'}`}>
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.label} className="flex flex-col items-center gap-2 rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] px-5 py-6 text-center shadow-[var(--sr-shadow-sm)] backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--sr-accent-soft)]">
                  <Icon className="h-5 w-5 text-[var(--sr-accent)]" />
                </div>
                <span className="text-sm font-semibold text-[var(--sr-text-primary)]">{p.label}</span>
                <span className="text-[11px] text-[var(--sr-text-muted)]">{p.desc}</span>
              </div>
            );
          })}
        </div>

        {/* ============== TITLE + CTA (step 5) ============== */}
        <div className={`flex flex-col items-center gap-6 transition-all duration-1000 ${
          step >= 5 ? 'translate-y-0 opacity-100' : 'pointer-events-none absolute translate-y-4 opacity-0'
        }`}>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)]"
            style={{ boxShadow: 'var(--sr-shadow-glow)' }}
          >
            <Logomark className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1
              className="text-6xl sm:text-7xl font-bold tracking-tight"
              style={{
                fontFamily: 'var(--sr-font-display)',
                backgroundImage: 'var(--sr-gradient-brand)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Cascadyx
            </h1>
            <p className="mt-2 text-base text-[var(--sr-text-secondary)]">Simulate. Detect. Explain.</p>
          </div>
          <div className="relative rounded-[var(--sr-radius-sm)] p-[1.5px] overflow-hidden">
            {/* Animated gradient border sweep — a slow rotating conic gradient clipped to a 1.5px ring */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[-120%]"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, var(--sr-accent) 12%, transparent 26%, transparent 74%, var(--sr-accent-2) 88%, transparent 100%)',
                animation: 'cta-border-sweep 4.5s linear infinite',
              }}
            />
            <GlowButton
              variant="primary"
              onClick={onComplete}
              className="relative px-7 py-3 text-sm"
              style={{ boxShadow: 'var(--sr-shadow-glow)' }}
            >
              <span>Enter Console</span>
              <Sparkles className="h-3.5 w-3.5" />
            </GlowButton>
          </div>
        </div>

      </div>
    </div>
  );
};
export default Intro;
