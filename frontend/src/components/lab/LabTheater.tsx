/**
 * LabTheater — the "virtual machine theater": Attacker VM → Victim VM on a sealed
 * network with a Sensor VM tapping both links.
 *
 * Everything animated here is driven by real telemetry (detections that arrive
 * over the WebSocket for this lab), never by timers pretending traffic exists.
 * With nothing flowing, the stage is still. Reduced motion → static composition.
 */
import React from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { LabEvent, LabTrack } from './types';

interface LabTheaterProps {
  track: LabTrack;
  /** True while traffic is genuinely flowing (session running / sensor delivering). */
  active: boolean;
  /** Short status line under the stage. */
  status: string;
  attackerLines: string[];
  totals: { total: number; attacks: number };
  recent: LabEvent[];
  sensorLabel: string;
  sensorOk: boolean;
}

const BG = '#0B0E14';
const PANEL = '#121722';
const LINE = 'rgba(148,163,184,0.22)';
const TEXT = '#E2E8F0';
const MUTED = '#8B97AB';
const ATTACK = '#F2677A';
const OK = '#34D3A0';
const SENSOR = '#6AA9FF';

const SEV: Record<string, string> = {
  CRITICAL: '#F2677A',
  HIGH: '#F59E6B',
  MEDIUM: '#F6C453',
  LOW: '#9AA4B2',
};

function eventColor(e: LabEvent): string {
  return e.isAttack ? SEV[e.severity.toUpperCase()] ?? ATTACK : OK;
}

const KEYFRAMES = `
@keyframes lt-blink { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }
@keyframes lt-ring { 0% { transform: scale(.6); opacity: .7 } 100% { transform: scale(2.1); opacity: 0 } }
`;

interface VmWindowProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  accent: string;
  children?: React.ReactNode;
}

const VmWindow: React.FC<VmWindowProps> = ({ x, y, w, h, title, accent, children }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={10} fill={PANEL} stroke={LINE} />
    <rect x={x} y={y} width={w} height={22} rx={10} fill="rgba(255,255,255,0.03)" />
    <circle cx={x + 14} cy={y + 11} r={3.2} fill={accent} />
    <text x={x + 26} y={y + 14.5} fontSize={9.5} fontWeight={700} letterSpacing="0.12em" fill={TEXT}>
      {title}
    </text>
    {children}
  </g>
);

export const LabTheater: React.FC<LabTheaterProps> = ({
  track,
  active,
  status,
  attackerLines,
  totals,
  recent,
  sensorLabel,
  sensorOk,
}) => {
  const reduced = usePrefersReducedMotion();
  const share = totals.total > 0 ? totals.attacks / totals.total : 0;
  const lastAttack = recent.find((e) => e.isAttack);
  const dotColor = lastAttack ? eventColor(lastAttack) : OK;
  const dots = active && !reduced ? [0, 1, 2, 3, 4, 5] : [];

  return (
    <div className="overflow-hidden rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)]" style={{ background: BG }}>
      <style>{KEYFRAMES}</style>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
          Isolated lab · VirtualBox Internal Network
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium" style={{ color: active ? OK : MUTED }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: active ? OK : MUTED, animation: active && !reduced ? 'lt-blink 1.4s steps(1) infinite' : undefined }}
          />
          {active ? (track === 'live' ? 'Sensor online' : 'Session running') : 'Standing by'}
        </span>
      </div>

      <svg viewBox="0 0 800 300" className="block h-auto w-full" role="img" aria-label="Attacker VM sends traffic to the Victim VM while the Sensor VM watches both links">
        {/* hex-ish floor grid */}
        <defs>
          <pattern id="lt-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="rgba(148,163,184,0.06)" />
          </pattern>
          <path id="lt-path" d="M232 118 H568" />
        </defs>
        <rect width="800" height="300" fill="url(#lt-grid)" />

        {/* Attacker */}
        <VmWindow x={24} y={40} w={208} h={156} title="ATTACKER VM" accent={ATTACK}>
          {attackerLines.slice(0, 5).map((line, i) => (
            <text key={i} x={38} y={76 + i * 17} fontSize={9.5} fill={i === 0 ? ATTACK : MUTED} fontFamily="ui-monospace, Consolas, monospace">
              {line.length > 30 ? `${line.slice(0, 29)}…` : line}
            </text>
          ))}
          <rect x={38} y={76 + Math.min(attackerLines.length, 5) * 17 - 8} width={6} height={10} fill={ATTACK} style={{ animation: reduced ? undefined : 'lt-blink 1.1s steps(1) infinite' }} />
        </VmWindow>

        {/* Victim */}
        <VmWindow x={568} y={40} w={208} h={156} title="VICTIM VM" accent={OK}>
          <text x={582} y={78} fontSize={9.5} fill={MUTED}>Flows seen at victim</text>
          <text x={582} y={104} fontSize={22} fontWeight={700} fill={TEXT} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totals.total.toLocaleString()}
          </text>
          <rect x={582} y={120} width={180} height={6} rx={3} fill="rgba(255,255,255,0.07)" />
          <rect x={582} y={120} width={180 * share} height={6} rx={3} fill={ATTACK} style={{ transition: 'width 400ms ease' }} />
          <text x={582} y={144} fontSize={9.5} fill={totals.attacks > 0 ? ATTACK : MUTED}>
            {totals.attacks > 0 ? `${totals.attacks.toLocaleString()} flagged as attacks` : 'No attack flows flagged'}
          </text>
          {active && !reduced && totals.attacks > 0 && (
            <circle cx={766} cy={52} r={5} fill="none" stroke={ATTACK} style={{ transformOrigin: '766px 52px', animation: 'lt-ring 1.6s ease-out infinite' }} />
          )}
        </VmWindow>

        {/* Link */}
        <line x1={232} y1={118} x2={568} y2={118} stroke={LINE} strokeWidth={1.5} strokeDasharray="4 5" />
        <text x={400} y={106} fontSize={9} textAnchor="middle" fill={MUTED}>
          internal network 192.168.56.0/24
        </text>
        {dots.map((i) => (
          <circle key={i} r={3.2} fill={dotColor} opacity={0.9}>
            <animateMotion dur="1.6s" begin={`${(i * 1.6) / dots.length}s`} repeatCount="indefinite">
              <mpath href="#lt-path" />
            </animateMotion>
          </circle>
        ))}
        {!active && <polygon points="394,114 406,118 394,122" fill={LINE} />}

        {/* Taps to sensor */}
        <path d="M128 196 V236 H320" fill="none" stroke={SENSOR} strokeOpacity={0.45} strokeDasharray="3 4" />
        <path d="M672 196 V236 H480" fill="none" stroke={SENSOR} strokeOpacity={0.45} strokeDasharray="3 4" />

        {/* Sensor */}
        <VmWindow x={296} y={212} w={208} h={76} title="SENSOR VM" accent={SENSOR}>
          <text x={310} y={250} fontSize={9.5} fill={sensorOk ? SENSOR : MUTED}>
            {sensorLabel}
          </text>
          <text x={310} y={268} fontSize={9.5} fill={MUTED}>
            cascade tiers 1 → 2 → 3
          </text>
        </VmWindow>

        {/* Verdict ticker (real detections) */}
        {recent.slice(0, 3).map((e, i) => (
          <g key={e.id} opacity={1 - i * 0.28}>
            <circle cx={532} cy={236 + i * 17} r={3} fill={eventColor(e)} />
            <text x={542} y={239 + i * 17} fontSize={9.5} fill={TEXT}>
              {`${e.label} · T${e.tier} · ${(e.confidence * 100).toFixed(0)}%`}
            </text>
          </g>
        ))}
      </svg>

      <p className="border-t px-4 py-2.5 text-[11px]" style={{ borderColor: LINE, color: MUTED }} aria-live="polite">
        {status}
      </p>
    </div>
  );
};

export default LabTheater;
