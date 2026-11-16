/**
 * Desktop-only viewport gate for Cascadyx (Signal Observatory).
 * Blocks mobile/tablet viewports; unlocks automatically when resized to desktop.
 */
import React, { useEffect, useState } from 'react';
import Logomark from './ui/Logomark';
import AuroraBackground from './ui/AuroraBackground';

const DESKTOP_MIN_WIDTH = 1024;

function isDesktopViewport(): boolean {
  if (typeof window === 'undefined') return true;
  const width = window.innerWidth;
  if (width >= DESKTOP_MIN_WIDTH) return true;
  // Coarse pointer (touch) on a narrow viewport → treat as mobile/tablet.
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  if (coarse && width < DESKTOP_MIN_WIDTH) return false;
  return width >= DESKTOP_MIN_WIDTH;
}

export const DesktopGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allowed, setAllowed] = useState(() => isDesktopViewport());

  useEffect(() => {
    const recheck = () => setAllowed(isDesktopViewport());
    window.addEventListener('resize', recheck);
    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;
    mq?.addEventListener?.('change', recheck);
    return () => {
      window.removeEventListener('resize', recheck);
      mq?.removeEventListener?.('change', recheck);
    };
  }, []);

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[var(--sr-bg-page)] px-8 text-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="desktop-gate-title"
      aria-describedby="desktop-gate-desc"
      style={{ fontFamily: 'var(--sr-font-sans)' }}
    >
      <AuroraBackground className="absolute inset-0" variant="hero" />
      <div className="relative z-10 flex max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)] p-4">
            <Logomark className="h-10 w-10" />
          </div>
          <h1
            id="desktop-gate-title"
            className="text-2xl font-bold tracking-tight text-[var(--sr-text-primary)]"
            style={{ fontFamily: 'var(--sr-font-brand)' }}
          >
            Cascadyx
          </h1>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sr-text-muted)]">
            Signal Observatory
          </p>
        </div>
        <div className="space-y-2">
          <p
            id="desktop-gate-desc"
            className="text-base leading-relaxed text-[var(--sr-text-secondary)]"
          >
            Cascadyx is built for desktop displays. Open this site on a computer
            (or widen your window to at least {DESKTOP_MIN_WIDTH}px) to continue.
          </p>
          <p className="text-xs text-[var(--sr-text-muted)]">
            Mobile and tablet viewports are blocked so the Living Lattice console
            stays usable.
          </p>
        </div>
        <div
          className="h-px w-24 bg-[var(--sr-gradient-brand)] opacity-60"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

export default DesktopGate;
