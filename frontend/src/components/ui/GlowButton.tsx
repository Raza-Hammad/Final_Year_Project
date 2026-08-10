/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: GlowButton.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This is a reusable Button Component supporting Cyberpunk / Signal Room design variants.
 * It renders buttons with subtle blue accent glow, active press physics, and disabled state handling.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Supports 3 design variants: `primary` (accent blue fill), `secondary` (outlined surface), and `ghost` (transparent background).
 * 2. Formats focus rings, flex alignment, and icon spacing automatically.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: HTML button attributes typing.
 * ===============================================================================
 */

import React from 'react';

interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}

export const GlowButton: React.FC<GlowButtonProps> = ({ 
  variant = 'primary', 
  children, 
  className = '', 
  ...props 
}) => {
  let styleClasses = '';

  if (variant === 'primary') {
    styleClasses = 'bg-[var(--sr-accent)] hover:bg-[var(--sr-accent-hover)] text-white font-semibold shadow-[var(--sr-shadow-sm)] border border-transparent';
  } else if (variant === 'secondary') {
    styleClasses = 'bg-[var(--sr-bg-surface)] border border-[var(--sr-border-hairline)] hover:border-[var(--sr-border-hover)] text-[var(--sr-accent)] font-semibold';
  } else {
    styleClasses = 'bg-transparent border border-transparent text-[var(--sr-text-secondary)] hover:text-[var(--sr-text-primary)] hover:bg-[var(--sr-bg-surface-raised)] font-medium';
  }

  return (
    <button
      className={`px-4 py-2 text-xs rounded-[var(--sr-radius-sm)] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--sr-accent)] focus-visible:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none cursor-pointer active:scale-[0.98] flex items-center justify-center gap-1.5 ${styleClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
export default GlowButton;
