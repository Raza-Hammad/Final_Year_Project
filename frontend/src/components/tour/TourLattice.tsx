/**
 * Signal-Observatory lattice art for the tour poster: three tiers of nodes joined by
 * faint filaments, with pulses travelling down the cascade (Tier 1 → 2 → 3).
 */
import React from 'react';

interface Node {
  x: number;
  y: number;
  tier: 1 | 2 | 3;
}

// Deterministic layout (no randomness => stable SSR/hydration and screenshots).
const NODES: Node[] = [
  { x: 60, y: 70, tier: 1 }, { x: 150, y: 40, tier: 1 }, { x: 250, y: 85, tier: 1 },
  { x: 350, y: 45, tier: 1 }, { x: 450, y: 80, tier: 1 }, { x: 545, y: 50, tier: 1 },
  { x: 105, y: 170, tier: 2 }, { x: 215, y: 190, tier: 2 }, { x: 330, y: 160, tier: 2 },
  { x: 440, y: 195, tier: 2 }, { x: 530, y: 165, tier: 2 },
  { x: 170, y: 290, tier: 3 }, { x: 290, y: 310, tier: 3 }, { x: 410, y: 285, tier: 3 },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5],
  [0, 6], [1, 6], [1, 7], [2, 7], [2, 8], [3, 8], [3, 9], [4, 9], [5, 10], [4, 10],
  [6, 7], [7, 8], [8, 9], [9, 10],
  [6, 11], [7, 11], [7, 12], [8, 12], [8, 13], [9, 13],
  [11, 12], [12, 13],
];

const TIER_COLOR: Record<Node['tier'], string> = {
  1: '#2DD4BF',
  2: '#67E8F9',
  3: '#F5B25C',
};

interface TourLatticeProps {
  className?: string;
  animate?: boolean;
}

export const TourLattice: React.FC<TourLatticeProps> = ({ className = '', animate = true }) => (
  <svg
    viewBox="0 0 600 360"
    preserveAspectRatio="xMidYMid slice"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient id="tour-lat-glow" cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
      </radialGradient>
      <pattern id="tour-lat-grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0H0V30" fill="none" stroke="#2DD4BF" strokeOpacity="0.07" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="600" height="360" fill="url(#tour-lat-grid)" />
    <rect width="600" height="360" fill="url(#tour-lat-glow)" />
    {EDGES.map(([a, b], i) => (
      <line
        key={`${a}-${b}`}
        x1={NODES[a].x}
        y1={NODES[a].y}
        x2={NODES[b].x}
        y2={NODES[b].y}
        stroke={TIER_COLOR[NODES[Math.max(a, b)].tier]}
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray={animate ? '3 5' : undefined}
        style={animate ? { animation: `tour-dash 6s linear infinite`, animationDelay: `${(i % 7) * -0.8}s` } : undefined}
      />
    ))}
    {NODES.map((n, i) => (
      <g key={i}>
        <circle cx={n.x} cy={n.y} r="9" fill={TIER_COLOR[n.tier]} fillOpacity="0.10" />
        <circle
          cx={n.x}
          cy={n.y}
          r="3.2"
          fill={TIER_COLOR[n.tier]}
          style={
            animate
              ? { animation: 'tour-node 3.6s ease-in-out infinite', animationDelay: `${n.tier * 0.5 + (i % 5) * 0.37}s` }
              : undefined
          }
        />
      </g>
    ))}
  </svg>
);

export default TourLattice;
