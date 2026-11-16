/** Resolve Signal Room CSS tokens into Three.js-friendly hex strings. */

const FALLBACKS: Record<string, string> = {
  '--sr-accent': '#3D348B',
  '--sr-accent-2': '#B86B32',
  '--sr-sev-critical': '#D03B3B',
  '--sr-sev-high': '#EC835A',
  '--sr-sev-medium': '#FAB219',
  '--sr-sev-low': '#8A8F98',
  '--sr-sev-info': '#0CA30C',
  '--sr-cat-1': '#2A78D6',
  '--sr-cat-2': '#EB6834',
  '--sr-cat-3': '#1BAF7A',
  '--sr-text-primary': '#0B0B0B',
  '--sr-text-muted': '#8A8F98',
  '--sr-bg-page': '#F3F1ED',
  '--sr-border-hover': '#C5C8CE',
};

export function cssVarColor(name: string, fallback?: string): string {
  if (typeof window === 'undefined') {
    return fallback ?? FALLBACKS[name] ?? '#4C3F91';
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback ?? FALLBACKS[name] ?? '#4C3F91';
  if (raw.startsWith('#')) return raw;
  // rgb/rgba → leave as-is; Three accepts both
  return raw;
}

export function severityColor(severity: string, isBenign: boolean): string {
  if (isBenign) return cssVarColor('--sr-sev-info');
  const s = (severity || 'Info').toUpperCase();
  if (s === 'CRITICAL') return cssVarColor('--sr-sev-critical');
  if (s === 'HIGH') return cssVarColor('--sr-sev-high');
  if (s === 'MEDIUM') return cssVarColor('--sr-sev-medium');
  return cssVarColor('--sr-sev-low');
}

export function tierColor(tier: number): string {
  if (tier === 1) return cssVarColor('--sr-cat-1');
  if (tier === 2) return cssVarColor('--sr-cat-2');
  return cssVarColor('--sr-cat-3');
}
