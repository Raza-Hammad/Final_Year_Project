import React from 'react';

interface AuroraBackgroundProps {
  className?: string;
  /** 'hero' = larger, more saturated blobs for Intro/Login. 'ambient' = quieter wash for the Dashboard shell. */
  variant?: 'hero' | 'ambient';
}

/**
 * Soft drifting colour washes. Built from radial gradients (not `filter: blur`)
 * so the browser rasterises each layer once and the drift is a pure compositor
 * transform — the old 100px blur layers repainted every frame and were the
 * single biggest CSS paint cost on Intro/Login.
 *
 * Colours come from --sr-accent / --sr-accent-2, so it re-themes automatically.
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ className = '', variant = 'hero' }) => {
  const isHero = variant === 'hero';
  const a = isHero ? 0.3 : 0.12;
  const b = isHero ? 0.28 : 0.11;
  const c = 0.17;
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`} aria-hidden="true">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes aurora-drift-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(4%, 6%, 0) scale(1.08); }
        }
        @keyframes aurora-drift-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-5%, -4%, 0) scale(1.1); }
        }
        @keyframes aurora-drift-c {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(3%, -5%, 0) scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-layer { animation: none !important; }
        }
      `,
        }}
      />
      <div
        className="aurora-layer absolute rounded-full will-change-transform"
        style={{
          width: isHero ? '70%' : '48%',
          height: isHero ? '78%' : '52%',
          top: '-18%',
          left: '-14%',
          background: `radial-gradient(closest-side, color-mix(in srgb, var(--sr-accent) ${Math.round(a * 100)}%, transparent), transparent)`,
          animation: 'aurora-drift-a 22s ease-in-out infinite',
        }}
      />
      <div
        className="aurora-layer absolute rounded-full will-change-transform"
        style={{
          width: isHero ? '62%' : '42%',
          height: isHero ? '70%' : '46%',
          bottom: '-22%',
          right: '-12%',
          background: `radial-gradient(closest-side, color-mix(in srgb, var(--sr-accent-2) ${Math.round(b * 100)}%, transparent), transparent)`,
          animation: 'aurora-drift-b 26s ease-in-out infinite',
        }}
      />
      {isHero && (
        <div
          className="aurora-layer absolute rounded-full will-change-transform"
          style={{
            width: '44%',
            height: '48%',
            top: '26%',
            left: '30%',
            background: `radial-gradient(closest-side, color-mix(in srgb, var(--sr-accent) ${Math.round(c * 100)}%, transparent), transparent)`,
            animation: 'aurora-drift-c 30s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
};
export default AuroraBackground;
