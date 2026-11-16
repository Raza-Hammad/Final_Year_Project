/**
 * SignalMeter — a 5-bar signal-strength rating (replaces stars; fits the
 * Signal Observatory language). Static by default; interactive when `onChange`
 * is provided.
 */
import React from 'react';

interface SignalMeterProps {
  /** 0–5; fractional values fill the last bar partially. */
  value: number;
  /** Bar-group height in px. */
  size?: number;
  onChange?: (value: number) => void;
  className?: string;
  label?: string;
}

const BAR_COUNT = 5;

export const SignalMeter: React.FC<SignalMeterProps> = ({ value, size = 18, onChange, className = '', label }) => {
  const bars = Array.from({ length: BAR_COUNT }, (_, i) => i + 1);
  const barW = Math.max(3, Math.round(size / 4));

  return (
    <div
      className={`inline-flex items-end gap-[3px] ${className}`}
      style={{ height: size }}
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={label ?? `Signal strength ${value.toFixed(1)} out of 5`}
    >
      {bars.map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        const h = Math.round((size * (0.34 + 0.66 * (n / BAR_COUNT))));
        const inner = (
          <span
            className="block w-full rounded-[2px]"
            style={{
              height: '100%',
              background: `linear-gradient(to top, var(--sr-nav-reviews) ${fill * 100}%, var(--sr-bg-surface-raised) ${fill * 100}%)`,
              boxShadow: fill > 0 ? '0 0 8px color-mix(in srgb, var(--sr-nav-reviews) 40%, transparent)' : 'none',
            }}
          />
        );
        if (!onChange) {
          return (
            <span key={n} style={{ width: barW, height: h }}>
              {inner}
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={Math.round(value) === n}
            aria-label={`${n} of ${BAR_COUNT}`}
            onClick={() => onChange(n)}
            className="cursor-pointer rounded-[2px] outline-none transition-transform hover:scale-y-110 focus-visible:ring-2 focus-visible:ring-[var(--sr-nav-reviews)]"
            style={{ width: barW + 4, height: h }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
};

export default SignalMeter;
