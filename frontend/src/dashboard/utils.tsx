/** Shared dashboard helpers. */

export function extractErrorDetail(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { detail?: string } } }).response;
    return response?.data?.detail;
  }
  return undefined;
}

export function groupConversationsByDate<T extends { updated_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const today: T[] = [];
  const yesterdayItems: T[] = [];
  const older: T[] = [];

  for (const item of items) {
    const d = new Date(item.updated_at).toDateString();
    if (d === todayStr) today.push(item);
    else if (d === yesterdayStr) yesterdayItems.push(item);
    else older.push(item);
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterdayItems },
    { label: 'Older', items: older },
  ].filter((g) => g.items.length > 0);
}

const SEQ_RAMP_STOPS: [number, [number, number, number]][] = [
  [0, [205, 226, 251]],
  [0.33, [109, 167, 236]],
  [0.66, [37, 106, 191]],
  [1, [13, 54, 107]],
];

export function seqRampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SEQ_RAMP_STOPS.length - 1; i++) {
    const [t0, c0] = SEQ_RAMP_STOPS[i];
    const [t1, c1] = SEQ_RAMP_STOPS[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const local = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * local);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * local);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * local);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const last = SEQ_RAMP_STOPS[SEQ_RAMP_STOPS.length - 1][1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

export function compactCount(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function makeTruncatedYAxisTick(maxChars: number) {
  const TruncatedTick = (props: { x?: number; y?: number; payload?: { value?: unknown } }) => {
    const { x = 0, y = 0, payload } = props;
    const full = String(payload?.value ?? '');
    const text = full.length > maxChars ? `${full.slice(0, maxChars - 1)}…` : full;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{full}</title>
        <text x={0} y={0} dy={3} textAnchor="end" fontSize={9} fill="var(--sr-text-muted)">{text}</text>
      </g>
    );
  };
  return TruncatedTick;
}
