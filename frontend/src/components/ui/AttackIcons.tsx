/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: AttackIcons.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This component renders Custom Line-Art SVG Icons for each network threat scenario.
 * It provides distinct graphical silhouettes for DoS, DDoS, Brute Force, Web Attacks,
 * PortScan, Botnet, Infiltration, Heartbleed, and Benign Baseline.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. `PATHS`: Record dictionary mapping attack types to vector SVG path geometry.
 * 2. Uses `stroke="currentColor"` so icon colors automatically match severity text colors (`--sr-sev-critical`, `--sr-sev-high`).
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - Inline SVG vector graphics rendered as React JSX nodes.
 * ===============================================================================
 */

import React from 'react';

export type AttackIconType =
  | 'dos' | 'ddos' | 'brute_force' | 'web_attacks' | 'port_scan'
  | 'bot' | 'infiltration' | 'heartbleed' | 'mixed_attack' | 'benign_baseline';

interface AttackIconProps {
  type: AttackIconType;
  className?: string;
  style?: React.CSSProperties;
}

// Small hand-crafted line-art glyphs, one per attack type — distinct silhouettes
// so each scenario reads as a unique "mark" rather than a generic UI icon.
// All strokes use currentColor so they inherit severity tinting from the caller.
const PATHS: Record<AttackIconType, React.ReactNode> = {
  dos: (
    <>
      <rect x="9.5" y="4" width="5" height="16" rx="1" />
      <path d="M2 12h4M18 12h4M4 6l2.5 2M20 6l-2.5 2M4 18l2.5-2M20 18l-2.5-2" />
    </>
  ),
  ddos: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M5.6 18.4l2.5-2.5M15.9 8.1l2.5-2.5" />
    </>
  ),
  brute_force: (
    <>
      <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
      <path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5" />
      <circle cx="12" cy="14.5" r="1.3" />
      <path d="M12 15.8v1.6" />
    </>
  ),
  web_attacks: (
    <>
      <rect x="3" y="4.5" width="18" height="14" rx="1.5" />
      <path d="M3 8.5h18" />
      <path d="M9 12.5 7 14.5l2 2M15 12.5l2 2-2 2" />
    </>
  ),
  port_scan: (
    <>
      <rect x="3.5" y="4" width="4" height="4" rx="0.5" />
      <rect x="10" y="4" width="4" height="4" rx="0.5" />
      <rect x="16.5" y="4" width="4" height="4" rx="0.5" />
      <rect x="3.5" y="10" width="4" height="4" rx="0.5" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
      <rect x="16.5" y="10" width="4" height="4" rx="0.5" />
      <rect x="3.5" y="16" width="4" height="4" rx="0.5" />
      <rect x="10" y="16" width="4" height="4" rx="0.5" />
      <path d="M2 2l3 3M22 2l-3 3" />
    </>
  ),
  bot: (
    <>
      <rect x="6" y="8" width="12" height="9" rx="2" />
      <path d="M12 8V5M9.5 5h5" />
      <circle cx="9.5" cy="12.5" r="1" />
      <circle cx="14.5" cy="12.5" r="1" />
      <path d="M3 11v3M21 11v3M8 17.5v2M16 17.5v2" />
    </>
  ),
  infiltration: (
    <>
      <path d="M4 4v16M20 4v16" strokeDasharray="2 2.5" />
      <path d="M4 12h7" />
      <path d="M9 8.5 13 12l-4 3.5" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
  heartbleed: (
    <>
      <path d="M12 19c-4.5-3-8-6.1-8-9.8A4.2 4.2 0 0 1 12 6.8a4.2 4.2 0 0 1 8 2.4c0 3.7-3.5 6.8-8 9.8Z" />
      <path d="M12 12.5v3.5M12 16 10.7 18" />
    </>
  ),
  mixed_attack: (
    <>
      <rect x="4" y="4" width="9" height="9" rx="1.5" transform="rotate(-8 8.5 8.5)" />
      <rect x="11" y="11" width="9" height="9" rx="1.5" transform="rotate(8 15.5 15.5)" />
    </>
  ),
  benign_baseline: (
    <>
      <path d="M12 3.5 5 6v5.2c0 4.3 2.9 7.4 7 9.3 4.1-1.9 7-5 7-9.3V6l-7-2.5Z" />
      <path d="M9 12l2.2 2.2L15.5 9.5" />
    </>
  ),
};

export const AttackIcon: React.FC<AttackIconProps> = ({ type, className = 'w-5 h-5', style }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {PATHS[type]}
  </svg>
);
export default AttackIcon;
