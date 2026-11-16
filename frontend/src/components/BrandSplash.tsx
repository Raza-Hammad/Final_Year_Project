/** Short (~1.2 s) brand splash for returning visitors — static, no WebGL. */
import React, { useEffect } from 'react';
import AuroraBackground from './ui/AuroraBackground';
import Logomark from './ui/Logomark';

interface BrandSplashProps {
  onDone: () => void;
  /** Total visible time in ms. */
  duration?: number;
}

export const BrandSplash: React.FC<BrandSplashProps> = ({ onDone, duration = 1200 }) => {
  useEffect(() => {
    const id = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(id);
  }, [onDone, duration]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[var(--sr-bg-page)]"
      role="status"
      aria-label="Loading Cascadyx"
    >
      <AuroraBackground className="absolute inset-0" variant="hero" />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes splash-in { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes splash-out { to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .cx-splash { animation: none !important; } }
      `,
        }}
      />
      <div
        className="cx-splash relative flex flex-col items-center gap-4"
        style={{ animation: `splash-in 0.5s cubic-bezier(0.22,1,0.36,1) both, splash-out 0.25s ease ${duration - 250}ms forwards` }}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)]"
          style={{ boxShadow: 'var(--sr-shadow-glow)' }}
        >
          <Logomark className="h-8 w-8" />
        </div>
        <h1
          className="text-5xl font-bold tracking-tight"
          style={{
            fontFamily: 'var(--sr-font-brand)',
            backgroundImage: 'var(--sr-gradient-brand)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            letterSpacing: '-0.04em',
          }}
        >
          Cascadyx
        </h1>
        <p
          className="text-xs uppercase tracking-[0.28em] text-[var(--sr-text-secondary)]"
          style={{ fontFamily: 'var(--sr-font-display)' }}
        >
          Simulate · Detect · Explain
        </p>
      </div>
    </div>
  );
};

export default BrandSplash;
