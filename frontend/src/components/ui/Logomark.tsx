import React, { useId } from 'react';

interface LogomarkProps {
  className?: string;
}

// The Cascadyx brand mark: three descending steps, each smaller than the last,
// gradient-blended from the primary indigo (Tier 1) through to the copper
// secondary (Tier 3) -- a literal, ownable abstraction of "confidence cascading
// down through tiers until it resolves," rather than a generic shield/lock glyph.
export const Logomark: React.FC<LogomarkProps> = ({ className = 'h-5 w-5' }) => {
  const gradId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--sr-accent)" />
          <stop offset="100%" stopColor="var(--sr-accent-2)" />
        </linearGradient>
      </defs>
      <rect x="3" y="4" width="17" height="6" rx="3" fill={`url(#${gradId})`} />
      <rect x="9.5" y="13" width="17" height="6" rx="3" fill={`url(#${gradId})`} opacity="0.82" />
      <rect x="16" y="22" width="13" height="6" rx="3" fill={`url(#${gradId})`} opacity="0.64" />
    </svg>
  );
};
export default Logomark;
