/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: GlowPanel.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This file is a reusable Glassmorphism Panel UI Component.
 * It provides a sleek dark-themed container card with backdrop blur and border glow hover effects.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Wraps children inside a styled `div` with Signal Room design tokens (`--sr-glass-bg`, `--sr-border-hairline`).
 * 2. Adds smooth CSS hover transitions (`hover:border-[var(--sr-border-hover)]`, `hover:shadow-md`).
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: Standard Functional Component props typing.
 * ===============================================================================
 */

import React from 'react';

interface GlowPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const GlowPanel: React.FC<GlowPanelProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`relative bg-[var(--sr-glass-bg)] backdrop-blur-md border border-[var(--sr-border-hairline)] rounded-[var(--sr-radius-md)] p-5 shadow-[var(--sr-shadow-sm)] transition-all duration-200 hover:border-[var(--sr-border-hover)] hover:shadow-[0_4px_20px_rgba(42,120,214,0.08)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
export default GlowPanel;
