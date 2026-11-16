/** Static SVG hero used as Intro first paint, WebGL fallback and reduced-motion view. */
import React from 'react';

/** Premium static composition for reduced-motion / no-WebGL. */
export const StaticHero: React.FC<{ brand?: boolean }> = ({ brand = false }) => (
  <div
    className="relative mx-auto h-[min(52vh,460px)] w-full max-w-3xl"
    style={{
      transform: `scale(${brand ? 1.04 : 1})`,
      transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
    }}
  >
    <svg viewBox="0 0 640 380" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="ll-brand" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--sr-accent)" />
          <stop offset="100%" stopColor="var(--sr-accent-2)" />
        </linearGradient>
        <radialGradient id="ll-glow" cx="55%" cy="42%" r="48%">
          <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.28" />
          <stop offset="55%" stopColor="var(--sr-accent-2)" stopOpacity="0.1" />
          <stop offset="100%" stopColor="var(--sr-accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="ll-soft">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="640" height="380" fill="url(#ll-glow)" />
      {Array.from({ length: 11 }).map((_, i) => (
        <line
          key={`v${i}`}
          x1={30 + i * 58}
          y1={30}
          x2={30 + i * 58}
          y2={350}
          stroke="var(--sr-accent)"
          strokeOpacity="0.07"
        />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <line
          key={`h${i}`}
          x1={30}
          y1={40 + i * 55}
          x2={610}
          y2={40 + i * 55}
          stroke="var(--sr-accent)"
          strokeOpacity="0.07"
        />
      ))}
      {/* Lattice nodes */}
      {[
        [180, 120], [220, 160], [260, 110], [300, 150], [340, 100],
        [380, 145], [420, 115], [200, 210], [280, 200], [360, 205],
        [440, 180], [320, 240], [250, 260], [400, 250],
      ].map(([cx, cy], i) => (
        <circle
          key={`n${i}`}
          cx={cx}
          cy={cy}
          r={i % 4 === 0 ? 4.5 : 2.8}
          fill={i % 3 === 0 ? 'var(--sr-accent-2)' : 'var(--sr-accent)'}
          fillOpacity={0.55 + (i % 5) * 0.06}
        />
      ))}
      <ellipse cx="320" cy="185" rx="200" ry="105" fill="none" stroke="url(#ll-brand)" strokeOpacity="0.4" strokeWidth="1.6" />
      <ellipse cx="320" cy="185" rx="135" ry="70" fill="none" stroke="var(--sr-accent-2)" strokeOpacity="0.45" strokeWidth="1.3" />
      <ellipse cx="320" cy="185" rx="70" ry="36" fill="none" stroke="var(--sr-accent)" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="100" cy="200" r="12" fill="var(--sr-sev-critical)" fillOpacity="0.9" filter="url(#ll-soft)" />
      <circle cx="100" cy="200" r="22" fill="none" stroke="var(--sr-sev-critical)" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="490" cy="160" r="20" fill="none" stroke="var(--sr-accent)" strokeWidth="2.2" />
      <circle cx="490" cy="160" r="9" fill="var(--sr-accent)" />
      <circle cx="490" cy="160" r="32" fill="none" stroke="var(--sr-accent)" strokeOpacity="0.25" strokeWidth="1" />
      <path
        d="M112 198 C 200 110, 310 230, 470 162"
        fill="none"
        stroke="var(--sr-sev-critical)"
        strokeWidth="1.8"
        strokeOpacity="0.6"
        strokeDasharray="5 7"
      />
      <path
        d="M108 210 C 220 250, 340 120, 478 168"
        fill="none"
        stroke="var(--sr-accent-2)"
        strokeWidth="1.2"
        strokeOpacity="0.4"
        strokeDasharray="3 8"
      />
      <rect x="230" y="268" width="180" height="64" rx="10" fill="var(--sr-glass-bg)" stroke="var(--sr-border-hairline)" />
      <rect x="244" y="284" width="9" height="32" rx="2" fill="var(--sr-accent-2)" />
      <rect x="264" y="284" width="110" height="9" rx="2" fill="var(--sr-accent)" fillOpacity="0.75" />
      <rect x="264" y="300" width="120" height="6" rx="2" fill="var(--sr-border-hover)" />
      <rect x="264" y="314" width="95" height="6" rx="2" fill="var(--sr-border-hover)" />
    </svg>
  </div>
);

export default StaticHero;
