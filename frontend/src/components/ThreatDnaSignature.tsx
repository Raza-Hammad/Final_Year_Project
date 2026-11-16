/**
 * ThreatDnaSignature — static, memoized radar fingerprint for "Explain This Packet".
 *
 * Why this replaced the Recharts radar: the Explain modal lives inside the dashboard shell,
 * which re-renders on every WebSocket batch. Recharts rebuilt its polygons (and re-measured
 * its container) on each of those renders, which read as endless blinking. This component:
 *   - is `React.memo`'d on the detection object, so live traffic can't re-render it;
 *   - draws plain SVG at a fixed viewBox (no resize observer, no tooltip layer);
 *   - plays ONE short reveal when a new detection is explained, then stays perfectly still.
 */
import React, { useMemo } from 'react';
import type { DetectionData } from '../dashboard/types';

const RADAR_FEATURES = [
  { name: 'Init Fwd Win', key: 'Init_Win_bytes_forward', defaultMax: 65535 },
  { name: 'Init Bwd Win', key: 'Init_Win_bytes_backward', defaultMax: 65535 },
  { name: 'Max Bwd Pkt', key: 'Bwd Packet Length Max', defaultMax: 2000 },
  { name: 'Max Fwd Pkt', key: 'Fwd Packet Length Max', defaultMax: 2000 },
  { name: 'Avg Pkt Size', key: 'Average Packet Size', defaultMax: 1500 },
  { name: 'Pkt Var', key: 'Packet Length Variance', defaultMax: 500000 },
  { name: 'Total Fwd Len', key: 'Total Length of Fwd Packets', defaultMax: 10000 },
  { name: 'Bwd Pkts/s', key: 'Bwd Packets/s', defaultMax: 5000 },
] as const;

const CX = 150;
const CY = 118;
const R = 78;
const RINGS = [0.25, 0.5, 0.75, 1] as const;

interface DnaAxis {
  name: string;
  attack: number;
  baseline: number;
  rawAttack: number;
  rawBaseline: number;
}

function buildAxes(d: DetectionData): DnaAxis[] {
  return RADAR_FEATURES.map((f) => {
    const topFeat = d.top_features?.find((tf) => tf.feature === f.key);
    const rawAttack = Number(d.raw_features?.[f.key] ?? topFeat?.value ?? 0);
    const rawBaseline = Number(d.benign_averages?.[f.key] ?? topFeat?.benign_avg ?? 0);
    const max = Math.max(f.defaultMax, rawAttack * 1.1, rawBaseline * 1.1, 1);
    return {
      name: f.name,
      attack: Math.min(1, Math.max(0.08, rawAttack / max)),
      baseline: Math.min(1, Math.max(0.05, rawBaseline / max)),
      rawAttack,
      rawBaseline,
    };
  });
}

function point(index: number, count: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius];
}

function polygon(values: number[]): string {
  return values
    .map((v, i) => {
      const [x, y] = point(i, values.length, v * R);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const STYLE = `
@keyframes dna-reveal { from { transform: scale(0.12); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes dna-fade { from { opacity: 0; } to { opacity: 1; } }
.dna-attack { transform-box: view-box; transform-origin: ${CX}px ${CY}px; animation: dna-reveal 650ms cubic-bezier(0.22, 1, 0.36, 1) 1 both; }
.dna-baseline { animation: dna-fade 450ms ease-out 1 both; }
.dna-dots { animation: dna-fade 300ms ease-out 500ms 1 both; }
`;

interface Props {
  detection: DetectionData;
}

const ThreatDnaSignatureInner: React.FC<Props> = ({ detection }) => {
  const axes = useMemo(() => buildAxes(detection), [detection]);
  const attackPts = useMemo(() => polygon(axes.map((a) => a.attack)), [axes]);
  const baselinePts = useMemo(() => polygon(axes.map((a) => a.baseline)), [axes]);
  const outliers = useMemo(
    () =>
      [...axes]
        .map((a) => ({ ...a, delta: a.attack - a.baseline }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3),
    [axes],
  );

  return (
    <div className="w-full">
      <style>{STYLE}</style>
      <svg
        viewBox="-24 0 348 236"
        className="mx-auto block h-auto w-full max-w-[340px]"
        role="img"
        aria-label="Threat DNA signature: this flow's normalized feature profile compared with the normal baseline"
      >
        {/* Rings + spokes */}
        {RINGS.map((r) => (
          <polygon
            key={r}
            points={polygon(axes.map(() => r))}
            fill="none"
            stroke="var(--sr-border-hairline)"
            strokeWidth={r === 1 ? 1.2 : 0.8}
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = point(i, axes.length, R);
          return <line key={a.name} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--sr-border-hairline)" strokeWidth={0.8} />;
        })}

        {/* Baseline (behind) then this flow */}
        <polygon
          className="dna-baseline"
          points={baselinePts}
          fill="var(--sr-text-muted)"
          fillOpacity={0.16}
          stroke="var(--sr-text-muted)"
          strokeWidth={1.25}
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
        <polygon
          className="dna-attack"
          points={attackPts}
          fill="var(--sr-cat-1)"
          fillOpacity={0.3}
          stroke="var(--sr-cat-1)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <g className="dna-dots">
          {axes.map((a, i) => {
            const [x, y] = point(i, axes.length, a.attack * R);
            return (
              <circle key={a.name} cx={x} cy={y} r={3} fill="var(--sr-cat-1)" stroke="var(--sr-bg-surface-raised)" strokeWidth={1.5}>
                <title>{`${a.name}: this flow ${fmt(a.rawAttack)} · baseline ${fmt(a.rawBaseline)}`}</title>
              </circle>
            );
          })}
        </g>

        {/* Axis labels */}
        {axes.map((a, i) => {
          const [x, y] = point(i, axes.length, R + 15);
          const anchor = Math.abs(x - CX) < 6 ? 'middle' : x > CX ? 'start' : 'end';
          return (
            <text
              key={a.name}
              x={x}
              y={y + 3}
              textAnchor={anchor}
              fontSize={9}
              fill="var(--sr-text-secondary)"
            >
              {a.name}
            </text>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5 text-[var(--sr-text-secondary)] font-medium">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--sr-cat-1)' }} />
          This flow
        </span>
        <span className="flex items-center gap-1.5 text-[var(--sr-text-secondary)]">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--sr-text-muted)] bg-[var(--sr-text-muted)]/20" />
          Normal baseline
        </span>
      </div>

      <div className="mt-3 w-full border-t border-[var(--sr-border-hairline)] pt-2.5">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--sr-text-muted)]">
          Strongest deviations from normal
        </p>
        <ul className="space-y-1">
          {outliers.map((o) => (
            <li key={o.name} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--sr-text-primary)] font-medium">{o.name}</span>
              <span className="text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(o.rawAttack)} <span aria-hidden="true">vs</span> {fmt(o.rawBaseline)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/** Memoized on the detection object: live-feed re-renders cannot repaint the signature. */
export const ThreatDnaSignature = React.memo(ThreatDnaSignatureInner);
export default ThreatDnaSignature;
