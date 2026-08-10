/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: NetworkBackground.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This component renders an Animated Interactive Network Node Graph in the background.
 * It gives the dashboard a modern cyber SOC look by rendering topological nodes,
 * connecting edges, pulsing dots, and moving data packets across the screen.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Fixed SVG Topological Mesh (`NODES`, `EDGES`): Deterministic node network preventing layout jitter.
 * 2. Animated Motion Packets (`<animateMotion>`): Simulates network packets flowing along edges.
 * 3. Parallax Cursor Depth Tracking (`handleMouseMove`): Slightly tilts the background mesh toward the user's mouse cursor.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: `useRef` for DOM container bounds and `useState` for parallax offset tracking.
 * ===============================================================================
 */

import React, { useRef, useState } from 'react';

interface NetworkBackgroundProps {
  className?: string;
  opacity?: number;
  variant?: 'accent' | 'mixed';
  /** When true, the mesh drifts slightly toward the cursor for a subtle sense of depth. */
  interactive?: boolean;
}

// Fixed node layout (viewBox 0 0 400 300) — deterministic so it never jitters between renders.
const NODES: { x: number; y: number; r: number }[] = [
  { x: 24, y: 40, r: 2.2 }, { x: 78, y: 18, r: 1.6 }, { x: 132, y: 52, r: 2.6 },
  { x: 60, y: 96, r: 1.8 }, { x: 168, y: 24, r: 2 }, { x: 210, y: 70, r: 2.4 },
  { x: 150, y: 120, r: 1.6 }, { x: 260, y: 42, r: 2 }, { x: 300, y: 90, r: 2.6 },
  { x: 230, y: 130, r: 1.8 }, { x: 340, y: 30, r: 1.6 }, { x: 372, y: 100, r: 2.2 },
  { x: 300, y: 160, r: 1.8 }, { x: 100, y: 160, r: 2 }, { x: 20, y: 130, r: 1.6 },
  { x: 180, y: 190, r: 2.2 }, { x: 350, y: 190, r: 1.6 }, { x: 60, y: 220, r: 1.8 },
  { x: 250, y: 230, r: 2 }, { x: 130, y: 250, r: 1.6 }, { x: 320, y: 260, r: 1.8 },
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [2, 4], [2, 6], [4, 5], [5, 7], [5, 6], [7, 8], [8, 9],
  [6, 9], [7, 10], [10, 11], [8, 11], [9, 12], [11, 12], [3, 13], [13, 14], [0, 14],
  [13, 6], [13, 15], [15, 18], [12, 16], [16, 20], [15, 17], [17, 19], [18, 19], [18, 20],
];

// A handful of edges "carry traffic" — an animated dot travels them on a loop.
const PACKET_EDGES: [number, number, number][] = [
  [0, 1, 0], [2, 6, 1.1], [5, 7, 2.3], [8, 9, 0.6], [13, 15, 1.8], [16, 20, 2.6], [6, 9, 3.4],
];

export const NetworkBackground: React.FC<NetworkBackgroundProps> = ({ className = '', opacity = 1, variant = 'accent', interactive = false }) => {
  const lineColor = 'var(--sr-accent)';
  const nodeColor = 'var(--sr-accent)';
  const packetColor = variant === 'mixed' ? 'var(--sr-accent-2)' : 'var(--sr-accent)';

  const wrapRef = useRef<HTMLDivElement>(null);
  const [drift, setDrift] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1..1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setDrift({ x: nx * 10, y: ny * 8 });
  };

  const handleMouseLeave = () => setDrift({ x: 0, y: 0 });

  return (
    <div
      ref={wrapRef}
      className={`select-none ${interactive ? '' : 'pointer-events-none'} ${className}`}
      style={{ opacity }}
      aria-hidden="true"
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
    >
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full overflow-visible"
        style={interactive ? {
          transform: `translate(${drift.x}px, ${drift.y}px) scale(1.03)`,
          transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: 'auto',
        } : undefined}
      >
        <defs>
          <radialGradient id="nb-wash" cx="30%" cy="20%" r="80%">
            <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--sr-accent)" stopOpacity="0" />
          </radialGradient>
          <style>{`
            @keyframes nb-node-pulse {
              0%, 100% { opacity: 0.35; }
              50% { opacity: 0.85; }
            }
          `}</style>
        </defs>

        <rect x="0" y="0" width="400" height="300" fill="url(#nb-wash)" />

        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y}
            stroke={lineColor}
            strokeWidth="0.6"
            opacity="0.18"
          />
        ))}

        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x} cy={n.y} r={n.r}
            fill={nodeColor}
            style={{
              animation: `nb-node-pulse ${4 + (i % 5)}s ease-in-out infinite`,
              animationDelay: `${(i % 7) * 0.4}s`,
            }}
          />
        ))}

        {PACKET_EDGES.map(([a, b, delay], i) => {
          const path = `M ${NODES[a].x} ${NODES[a].y} L ${NODES[b].x} ${NODES[b].y}`;
          return (
            <circle key={i} r="1.4" fill={packetColor} opacity="0.6">
              <animateMotion path={path} dur="3.5s" begin={`${delay}s`} repeatCount="indefinite" />
            </circle>
          );
        })}
      </svg>
    </div>
  );
};
export default NetworkBackground;
