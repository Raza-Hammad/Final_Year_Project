/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: NavIcons.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This component renders Custom Line-Art SVG Navigation Icons for the left sidebar rail.
 * It provides distinct graphical marks for Live Telemetry, Threat Simulator, Alert History,
 * Model Insights, and Sentinel AI Assistant.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. `PATHS`: Record dictionary mapping navigation tabs (`live`, `simulator`, `history`, `insights`, `ai`) to custom SVG paths.
 * 2. Uses `stroke="currentColor"` so active navigation items highlight with their respective section colors.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - Inline SVG vector paths rendered as React JSX elements.
 * ===============================================================================
 */

import React from 'react';

export type NavIconType = 'live' | 'simulator' | 'history' | 'insights' | 'ai';

interface NavIconProps {
  type: NavIconType;
  className?: string;
}

// Bespoke line-art glyphs for the sidebar rail — one distinct mark per panel,
// matching the hand-drawn AttackIcon treatment rather than generic UI icons.
const PATHS: Record<NavIconType, React.ReactNode> = {
  live: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 12h2.2l1.3-3.2 2 6.4 1.3-3.2h4.2" />
    </>
  ),
  simulator: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  history: (
    <>
      <path d="M6 4.5h11a1.5 1.5 0 0 1 1.5 1.5v13L15 17l-2.5 2-2.5-2-2.5 2-2.5-2V6A1.5 1.5 0 0 1 6 4.5Z" />
      <path d="M8 9h8M8 12.5h8" />
    </>
  ),
  insights: (
    <>
      <path d="M4 20V10M9.5 20V6M15 20v-7M20 20V4" />
      <circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  ai: (
    <>
      <path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-9l-4 3.5V16H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
      <path d="M12 8.2 12.9 10.1 15 11l-2.1.9-.9 2.1-.9-2.1L9 11l2.1-.9Z" fill="currentColor" stroke="none" />
    </>
  ),
};

export const NavIcon: React.FC<NavIconProps> = ({ type, className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {PATHS[type]}
  </svg>
);
export default NavIcon;
