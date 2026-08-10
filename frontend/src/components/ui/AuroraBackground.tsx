import React from 'react';

interface AuroraBackgroundProps {
  className?: string;
  /** 'hero' = larger, more saturated blobs for Intro/Login. 'ambient' = quieter wash for the Dashboard shell. */
  variant?: 'hero' | 'ambient';
}

// Soft, slowly-drifting gradient blobs -- the "aurora/mesh gradient" technique
// that reads as premium/designed rather than a flat white canvas. Colors are
// drawn entirely from --sr-accent/--sr-accent-2, so this re-colors itself
// automatically between light and dark theme with no separate dark variant needed.
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ className = '', variant = 'hero' }) => {
  const isHero = variant === 'hero';
  return (
    <div className={`pointer-events-none select-none overflow-hidden ${className}`} aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes aurora-drift-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, 6%) scale(1.08); }
        }
        @keyframes aurora-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-5%, -4%) scale(1.1); }
        }
        @keyframes aurora-drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(3%, -5%) scale(1.05); }
        }
      `}} />
      <div
        className="absolute rounded-full"
        style={{
          width: isHero ? '55%' : '38%',
          height: isHero ? '55%' : '38%',
          top: '-10%',
          left: '-8%',
          background: 'var(--sr-accent)',
          opacity: isHero ? 0.24 : 0.1,
          filter: 'blur(90px)',
          animation: 'aurora-drift-a 22s ease-in-out infinite',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: isHero ? '48%' : '32%',
          height: isHero ? '48%' : '32%',
          bottom: '-12%',
          right: '-6%',
          background: 'var(--sr-accent-2)',
          opacity: isHero ? 0.22 : 0.09,
          filter: 'blur(90px)',
          animation: 'aurora-drift-b 26s ease-in-out infinite',
        }}
      />
      {isHero && (
        <div
          className="absolute rounded-full"
          style={{
            width: '32%',
            height: '32%',
            top: '35%',
            left: '38%',
            background: 'var(--sr-accent)',
            opacity: 0.14,
            filter: 'blur(100px)',
            animation: 'aurora-drift-c 30s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
};
export default AuroraBackground;
