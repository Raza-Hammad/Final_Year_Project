/**
 * Intro — Simulate → Detect → Explain (~8 s) then the Cascadyx brand moment.
 *
 * Performance model:
 *  1. First paint is a static shell (aurora + SVG hero + wordmark) — no three.js.
 *  2. The 3D stage is a lazy chunk that crossfades in on its first drawn frame.
 *  3. The beat clock starts when the scene is ready (or a 3.5 s safety timeout /
 *     static fallback), so beat 0 is never eaten by loading.
 *  4. Pointer parallax lives in a ref — React never re-renders on mousemove.
 *
 * Keys: Space / Enter / → advance · Esc skips.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlowButton from '../components/ui/GlowButton';
import AuroraBackground from '../components/ui/AuroraBackground';
import Logomark from '../components/ui/Logomark';
import { ArrowRight } from 'lucide-react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { StaticHero } from '../components/lattice/IntroStaticHero';
import type { IntroBeat, IntroPointer } from '../components/lattice/IntroScene';

const IntroStage = lazy(() => import('../components/lattice/IntroStage'));

interface IntroProps {
  onComplete: () => void;
  /** Label for the final CTA (defaults to "Enter console"). */
  ctaLabel?: string;
}

const BEATS: Record<number, { phase: string; title: string; sub: string }> = {
  1: {
    phase: 'Simulate',
    title: 'Run an attack in a sealed lab.',
    sub: 'Pick a vector — DDoS, port scan, brute force — and watch it cross an isolated Attacker → Victim network.',
  },
  2: {
    phase: 'Detect',
    title: 'The cascade catches it.',
    sub: 'LightGBM screens. Random Forest checks. An ensemble decides.',
  },
  3: {
    phase: 'Explain',
    title: 'Then it tells you why.',
    sub: 'Plain-English attribution: which features tipped the verdict, and how it differs from normal traffic.',
  },
};

/** Beat start times in ms from the moment the scene is ready (~8 s total). */
const BEAT_AT = [1600, 3600, 5600, 7400, 7900] as const;

const ease = [0.22, 1, 0.36, 1] as const;

function probeWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export const Intro: React.FC<IntroProps> = ({ onComplete, ctaLabel = 'Enter console' }) => {
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState<IntroBeat>(0);
  const [webglOk] = useState<boolean>(() => probeWebGL());
  const [sceneReady, setSceneReady] = useState(false);
  const pointerRef = useRef<IntroPointer>({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const stepRef = useRef<IntroBeat>(0);
  const clockStartedRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const use3d = !reducedMotion && webglOk;
  const showBrand = step >= 5 || reducedMotion;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const scheduleFrom = useCallback(
    (fromBeat: IntroBeat) => {
      clearTimers();
      if (reducedMotion) return;
      const base = fromBeat === 0 ? 0 : BEAT_AT[Math.max(0, fromBeat - 1)] ?? 0;
      BEAT_AT.forEach((at, i) => {
        const beat = (i + 1) as IntroBeat;
        if (beat <= fromBeat) return;
        timersRef.current.push(window.setTimeout(() => setStep(beat), Math.max(80, at - base)));
      });
    },
    [clearTimers, reducedMotion],
  );

  const startClock = useCallback(() => {
    if (clockStartedRef.current) return;
    clockStartedRef.current = true;
    scheduleFrom(0);
  }, [scheduleFrom]);

  const onSceneReady = useCallback(() => {
    setSceneReady(true);
    startClock();
  }, [startClock]);

  // Reduced motion: show the brand immediately. Static fallback: start at once.
  // Otherwise wait for the scene, with a safety net so a slow chunk can't stall.
  useEffect(() => {
    if (reducedMotion) {
      setStep(5);
      return undefined;
    }
    if (!webglOk) {
      startClock();
      return clearTimers;
    }
    const safety = window.setTimeout(startClock, 3500);
    return () => {
      window.clearTimeout(safety);
      clearTimers();
    };
  }, [reducedMotion, webglOk, startClock, clearTimers]);

  const advanceBeat = useCallback(() => {
    if (reducedMotion) return;
    const cur = stepRef.current;
    if (cur >= 5) return;
    clockStartedRef.current = true;
    const next = (cur + 1) as IntroBeat;
    setStep(next);
    if (next < 5) scheduleFrom(next);
    else clearTimers();
  }, [reducedMotion, scheduleFrom, clearTimers]);

  // Keyboard: Space / Enter / → advance (Enter on brand = CTA) · Esc skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onComplete();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (stepRef.current >= 5 || reducedMotion) {
          if (e.key === 'Enter') onComplete();
          return;
        }
        advanceBeat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceBeat, onComplete, reducedMotion]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const onPointerMove = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      if (reducedMotion) return;
      const x = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));
      pointerRef.current.x = x;
      pointerRef.current.y = y;
      const el = heroRef.current;
      if (el) el.style.transform = `translate3d(${x * 22}px, ${y * 14}px, 0)`;
    },
    [reducedMotion],
  );
  const resetPointer = useCallback(() => {
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
    if (heroRef.current) heroRef.current.style.transform = 'translate3d(0,0,0)';
  }, []);

  const showCaption = step >= 1 && step <= 3;
  const beat = BEATS[step];
  const firstBeatClean = step === 0 && !reducedMotion;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] overflow-hidden bg-[var(--sr-bg-page)] font-sans text-[var(--sr-text-primary)] outline-none"
      style={{ fontFamily: 'var(--sr-font-sans)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Cascadyx introduction. Press Space to advance, Escape to skip."
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes cta-border-sweep { to { transform: rotate(360deg); } }
        @keyframes brand-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes brand-title-shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes intro-ring-pulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
      `,
        }}
      />

      <AuroraBackground className="absolute inset-0" variant="hero" />
      {/* Static grid — no animated background-position, no noise overlay. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(var(--sr-border-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--sr-border-hairline) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 72% 58% at 50% 38%, black 18%, transparent 78%)',
        }}
        aria-hidden="true"
      />

      {/* Skip — always available */}
      <button
        type="button"
        onClick={onComplete}
        className="absolute right-4 top-4 z-50 flex cursor-pointer items-center gap-1.5 rounded-[var(--sr-radius-sm)] border border-transparent px-3 py-1.5 text-xs text-[var(--sr-text-muted)] transition-all hover:border-[var(--sr-border-hairline)] hover:bg-[var(--sr-glass-bg)] hover:text-[var(--sr-text-primary)] sm:right-8 sm:top-8"
      >
        Skip
        <span className="text-[10px] opacity-70">Esc</span>
      </button>

      {/* Quiet mark after beat 0 */}
      {!showBrand && !firstBeatClean && (
        <div className="pointer-events-none absolute left-4 top-4 z-40 flex items-center gap-2.5 sm:left-8 sm:top-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--sr-radius-sm)] bg-[var(--sr-accent-soft)]">
            <Logomark className="h-4 w-4" />
          </div>
          <span
            className="text-sm font-semibold tracking-tight text-[var(--sr-text-primary)]"
            style={{ fontFamily: 'var(--sr-font-display)' }}
          >
            Cascadyx
          </span>
        </div>
      )}

      {/* Interactive stage */}
      <div
        className="absolute inset-x-0 top-0 z-10 h-[min(72%,calc(100%-10.5rem))] sm:h-[min(76%,calc(100%-11.5rem))]"
        onMouseMove={(e) => onPointerMove(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
        onMouseLeave={resetPointer}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (!t) return;
          onPointerMove(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect());
        }}
        onTouchEnd={resetPointer}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          if (!showBrand) advanceBeat();
        }}
        role="presentation"
        style={{ cursor: showBrand || reducedMotion ? 'default' : 'pointer' }}
      >
        {/* Static shell — first paint; fades out once the 3D scene has drawn. */}
        <div
          ref={heroRef}
          className="absolute inset-0 flex items-center justify-center overflow-hidden px-6 pt-10 will-change-transform"
          style={{
            opacity: use3d && sceneReady ? 0 : 1,
            transition: 'opacity 0.7s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
          }}
        >
          <StaticHero brand={showBrand} />
        </div>

        {use3d && (
          <Suspense fallback={null}>
            <div
              className="absolute inset-0 h-full w-full overflow-hidden"
              style={{ opacity: sceneReady ? 1 : 0, transition: 'opacity 0.7s ease' }}
            >
              <IntroStage step={step} pointerRef={pointerRef} onReady={onSceneReady} />
            </div>
          </Suspense>
        )}

        {firstBeatClean && sceneReady && (
          <p
            className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-[10px] uppercase tracking-[0.2em] text-[var(--sr-text-muted)] opacity-50"
            aria-hidden="true"
          >
            Move to explore
          </p>
        )}

        {!showBrand && !reducedMotion && step > 0 && step < 5 && (
          <p
            className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-[10px] uppercase tracking-[0.14em] text-[var(--sr-text-muted)] opacity-55 sm:bottom-4"
            aria-hidden="true"
          >
            Space to advance
          </p>
        )}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          background: [
            'radial-gradient(ellipse 85% 58% at 50% 26%, transparent 28%, color-mix(in srgb, var(--sr-bg-page) 45%, transparent) 100%)',
            'linear-gradient(180deg, transparent 40%, color-mix(in srgb, var(--sr-bg-page) 80%, transparent) 62%, var(--sr-bg-page) 78%)',
          ].join(', '),
        }}
        aria-hidden="true"
      />

      <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[42%] min-h-[9.5rem] flex-col items-center justify-end overflow-visible px-5 pb-8 sm:min-h-[10.5rem] sm:px-6 sm:pb-11">
        <AnimatePresence mode="wait">
          {showCaption && beat && (
            <motion.div
              key={step}
              className="mx-auto mb-4 w-full max-w-xl text-center sm:mb-5"
              initial={reducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease }}
            >
              <p
                className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: 'var(--sr-accent-2)' }}
              >
                {beat.phase}
              </p>
              <h2
                className="text-xl font-semibold tracking-tight text-[var(--sr-text-primary)] sm:text-[1.85rem]"
                style={{ fontFamily: 'var(--sr-font-display)' }}
              >
                {beat.title}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--sr-text-secondary)]">
                {beat.sub}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress — thin segments, never on first beat */}
        {!showBrand && step > 0 && step < 5 && (
          <div className="mb-2 flex items-center gap-1.5" role="tablist" aria-label="Intro beats">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Go to beat ${s}`}
                aria-current={step === s ? 'true' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (reducedMotion) return;
                  clockStartedRef.current = true;
                  setStep(s as IntroBeat);
                  scheduleFrom(s as IntroBeat);
                }}
                className="h-[2.5px] cursor-pointer rounded-full transition-all duration-500 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sr-accent)]"
                style={{
                  width: step === s ? 32 : 12,
                  backgroundColor: step >= s ? 'var(--sr-accent)' : 'var(--sr-border-hairline)',
                  opacity: step === s ? 1 : 0.65,
                }}
              />
            ))}
          </div>
        )}

        <AnimatePresence>
          {showBrand && (
            <motion.div
              className="mb-2 flex flex-col items-center gap-5 sm:mb-3 sm:gap-6"
              initial={reducedMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.8, ease }}
            >
              <div className="relative flex items-center justify-center">
                {!reducedMotion && (
                  <>
                    <div
                      className="pointer-events-none absolute h-28 w-28 rounded-full sm:h-36 sm:w-36"
                      style={{
                        border: '1px solid color-mix(in srgb, var(--sr-accent) 30%, transparent)',
                        animation: 'intro-ring-pulse 3.8s ease-in-out infinite',
                      }}
                      aria-hidden="true"
                    />
                    <div
                      className="pointer-events-none absolute h-36 w-36 rounded-full sm:h-44 sm:w-44"
                      style={{
                        border: '1px solid color-mix(in srgb, var(--sr-accent-2) 22%, transparent)',
                        animation: 'intro-ring-pulse 4.6s ease-in-out infinite 0.4s',
                      }}
                      aria-hidden="true"
                    />
                  </>
                )}
                <div
                  className="relative z-10 flex h-16 w-16 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)] sm:h-[5rem] sm:w-[5rem]"
                  style={{
                    boxShadow: 'var(--sr-shadow-glow)',
                    animation: reducedMotion ? undefined : 'brand-breathe 4.2s ease-in-out infinite',
                  }}
                >
                  <Logomark className="h-8 w-8 sm:h-10 sm:w-10" />
                </div>
              </div>

              <div className="px-2 text-center">
                <h1
                  className="text-[clamp(3.25rem,14vw,6.5rem)] font-bold leading-[0.92] tracking-tight sm:text-8xl md:text-9xl"
                  style={{
                    fontFamily: 'var(--sr-font-brand)',
                    backgroundImage:
                      'linear-gradient(120deg, var(--sr-accent) 0%, var(--sr-accent-2) 40%, var(--sr-accent) 70%, var(--sr-accent-2) 100%)',
                    backgroundSize: '200% 200%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    letterSpacing: '-0.04em',
                    animation: reducedMotion ? undefined : 'brand-title-shimmer 7s ease-in-out infinite',
                  }}
                >
                  Cascadyx
                </h1>
                <p
                  className="mt-4 text-sm uppercase tracking-[0.22em] text-[var(--sr-text-secondary)] sm:text-base sm:tracking-[0.28em]"
                  style={{ fontFamily: 'var(--sr-font-display)' }}
                >
                  Simulate · Detect · Explain
                </p>
              </div>

              <div className="relative overflow-hidden rounded-[var(--sr-radius-sm)] p-[1.5px]">
                {!reducedMotion && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-[-120%]"
                    style={{
                      background:
                        'conic-gradient(from 0deg, transparent 0%, var(--sr-accent) 12%, transparent 26%, transparent 74%, var(--sr-accent-2) 88%, transparent 100%)',
                      animation: 'cta-border-sweep 4s linear infinite',
                    }}
                  />
                )}
                <GlowButton
                  variant="primary"
                  onClick={onComplete}
                  className="relative px-9 py-3.5 text-sm"
                  style={{ boxShadow: 'var(--sr-shadow-glow)' }}
                >
                  <span>{ctaLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </GlowButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Intro;
