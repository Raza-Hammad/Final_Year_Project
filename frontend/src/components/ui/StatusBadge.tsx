/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: StatusBadge.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This file renders Security Status Pills & Severity Badges across the application.
 * It translates threat levels (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `SECURE`, `CONNECTED`)
 * into color-coded status badges with pulsing status dots.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Color Palette Mapping: Automatically assigns semantic design tokens (`--sr-sev-critical`, `--sr-sev-high`, `--sr-sev-info`).
 * 2. Status Dot Animation: Adds pulsing animations (`animate-pulse`) for active threats and live connections.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: Standard React component props typing.
 * ===============================================================================
 */

import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const statusUpper = status.toUpperCase();

  let badgeStyle = {
    color: 'var(--sr-text-secondary)',
    bg: 'var(--sr-bg-surface-raised)',
    dot: 'bg-[var(--sr-text-muted)]'
  };

  if (statusUpper === 'CRITICAL' || statusUpper === 'UNDER ATTACK') {
    badgeStyle = {
      color: 'var(--sr-sev-critical)',
      bg: 'rgba(208, 59, 59, 0.08)',
      dot: 'bg-[var(--sr-sev-critical)] animate-pulse'
    };
  } else if (statusUpper === 'HIGH' || statusUpper === 'ELEVATED' || statusUpper === 'ELEVATED RISK') {
    badgeStyle = {
      color: 'var(--sr-sev-high)',
      bg: 'rgba(236, 131, 90, 0.10)',
      dot: 'bg-[var(--sr-sev-high)] animate-pulse'
    };
  } else if (statusUpper === 'MEDIUM') {
    badgeStyle = {
      color: '#8A6300',
      bg: 'rgba(250, 178, 25, 0.16)',
      dot: 'bg-[var(--sr-sev-medium)]'
    };
  } else if (statusUpper === 'LOW' || statusUpper === 'INFO') {
    badgeStyle = {
      color: 'var(--sr-text-secondary)',
      bg: 'var(--sr-bg-surface-raised)',
      dot: 'bg-[var(--sr-sev-low)]'
    };
  } else if (statusUpper === 'SECURE' || statusUpper === 'CONNECTED' || statusUpper === 'SUCCESS' || statusUpper === 'OK' || statusUpper === 'ACTIVE') {
    badgeStyle = {
      color: 'var(--sr-sev-info)',
      bg: 'rgba(12, 163, 12, 0.08)',
      dot: 'bg-[var(--sr-sev-info)] animate-pulse'
    };
  } else if (statusUpper === 'GEMINI' || statusUpper === 'AI GEMINI') {
    badgeStyle = {
      color: 'var(--sr-accent)',
      bg: 'var(--sr-accent-soft)',
      dot: 'bg-[var(--sr-accent)] animate-pulse'
    };
  } else if (statusUpper === 'RULE-BASED' || statusUpper === 'RULE') {
    badgeStyle = {
      color: 'var(--sr-cat-3)',
      bg: 'rgba(27, 175, 122, 0.10)',
      dot: 'bg-[var(--sr-cat-3)]'
    };
  }

  return (
    <span
      style={{ color: badgeStyle.color, backgroundColor: badgeStyle.bg }}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full border border-[var(--sr-border-hairline)] ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${badgeStyle.dot}`} />
      {status}
    </span>
  );
};
export default StatusBadge;
