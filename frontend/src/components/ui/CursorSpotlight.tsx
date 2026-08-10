import React, { useRef } from 'react';

interface CursorSpotlightProps {
  className?: string;
  color?: string;
  size?: number;
}

// A soft radial glow that follows the cursor. Updates a CSS custom property
// directly via ref (not React state) so it never triggers a re-render on
// mousemove -- just a cheap style mutation, smooth even on a busy page.
export const CursorSpotlight: React.FC<CursorSpotlightProps> = ({
  className = '',
  color = 'var(--sr-accent)',
  size = 500,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !wrapRef.current) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    wrapRef.current.style.setProperty('--spot-x', `${x}%`);
    wrapRef.current.style.setProperty('--spot-y', `${y}%`);
    wrapRef.current.style.setProperty('--spot-opacity', '1');
  };

  const handleMouseLeave = () => {
    wrapRef.current?.style.setProperty('--spot-opacity', '0');
  };

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`absolute inset-0 ${className}`}
      style={{ ['--spot-opacity' as string]: 0 }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 transition-opacity duration-500 pointer-events-none"
        style={{
          opacity: 'var(--spot-opacity, 0)',
          background: `radial-gradient(${size}px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, ${color} 12%, transparent), transparent 70%)`,
        }}
      />
    </div>
  );
};
export default CursorSpotlight;
