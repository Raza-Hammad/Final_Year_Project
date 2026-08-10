import React, { useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';

interface DecoyOrigin {
  ip: string;
  geo: string;
}

// RFC 5737 documentation-range addresses (203.0.113.0/24, 198.51.100.0/24,
// 192.0.2.0/24) -- reserved for examples, guaranteed never to route on the
// real internet, so nothing here can be mistaken for an observed attack.
const DECOY_ORIGINS: DecoyOrigin[] = [
  { ip: '203.0.113.47', geo: 'Prague, CZ' },
  { ip: '198.51.100.23', geo: 'São Paulo, BR' },
  { ip: '192.0.2.181', geo: 'Singapore, SG' },
  { ip: '203.0.113.9', geo: 'Lagos, NG' },
  { ip: '198.51.100.114', geo: 'Reykjavík, IS' },
  { ip: '192.0.2.66', geo: 'Auckland, NZ' },
];

const ATTACK_PHRASES = [
  'Port scan probe',
  'Credential brute-force',
  'Payload injection attempt',
  'Session hijack attempt',
  'DNS tunneling probe',
];

interface StrikeEvent {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelLeft: boolean;
  origin: DecoyOrigin;
  phrase: string;
}

// A small roaming "threat actor" badge that orbits the cursor at a wary
// distance and periodically "strikes" -- darting in, flashing a beam +
// ripple at the pointer, and surfacing a brief attribution label whose
// decoy IP/location rotates each time (evoking how real attackers hop
// identities to evade detection). Purely ambient: position is driven by
// direct ref/DOM mutation (no per-frame React state) and every element is
// pointer-events-none so it never intercepts clicks.
export const RoamingAttacker: React.FC = () => {
  const badgeRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: window.innerWidth * 0.72, y: window.innerHeight * 0.32 });
  const angleRef = useRef(0);
  const phaseRef = useRef<'orbit' | 'strike'>('orbit');
  const originIdxRef = useRef(0);
  const [strike, setStrike] = useState<StrikeEvent | null>(null);
  const [isStriking, setIsStriking] = useState(false);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMove);

    const tick = () => {
      angleRef.current += 0.01;
      const holdDistance = phaseRef.current === 'strike' ? 30 : 130;
      const ox = Math.cos(angleRef.current) * holdDistance;
      const oy = Math.sin(angleRef.current) * holdDistance * 0.72;
      if (badgeRef.current) {
        badgeRef.current.style.transform = `translate(${mouseRef.current.x + ox}px, ${mouseRef.current.y + oy}px)`;
      }
    };
    const tickInterval = window.setInterval(tick, 50);
    tick();

    let strikeTimeout: number;
    let impactTimeout: number;
    let resetTimeout: number;
    let clearTimeoutId: number;

    const scheduleStrike = () => {
      const delay = 4500 + Math.random() * 2200;
      strikeTimeout = window.setTimeout(() => {
        phaseRef.current = 'strike';
        setIsStriking(true);

        impactTimeout = window.setTimeout(() => {
          const rect = badgeRef.current?.getBoundingClientRect();
          const bx = rect ? rect.left + rect.width / 2 : mouseRef.current.x;
          const by = rect ? rect.top + rect.height / 2 : mouseRef.current.y;
          const origin = DECOY_ORIGINS[originIdxRef.current % DECOY_ORIGINS.length];
          const phrase = ATTACK_PHRASES[originIdxRef.current % ATTACK_PHRASES.length];
          originIdxRef.current += 1;
          const labelLeft = mouseRef.current.x > window.innerWidth - 240;

          setStrike({
            id: Date.now(),
            x1: bx, y1: by,
            x2: mouseRef.current.x, y2: mouseRef.current.y,
            labelLeft,
            origin,
            phrase,
          });
          clearTimeoutId = window.setTimeout(() => setStrike(null), 2200);
        }, 420);

        resetTimeout = window.setTimeout(() => {
          phaseRef.current = 'orbit';
          setIsStriking(false);
        }, 480);

        scheduleStrike();
      }, delay);
    };
    scheduleStrike();

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.clearInterval(tickInterval);
      window.clearTimeout(strikeTimeout);
      window.clearTimeout(impactTimeout);
      window.clearTimeout(resetTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, []);

  return (
    <div className="pointer-events-none" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: `
        .atk-beam { animation: atk-beam-fade 0.9s ease-out forwards; }
        @keyframes atk-beam-fade {
          0% { opacity: 0; }
          20% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        .atk-ripple { animation: atk-ripple-grow 0.7s ease-out forwards; }
        @keyframes atk-ripple-grow {
          0% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.3); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.4); }
        }
        .atk-label { animation: atk-label-life 2.2s ease-out forwards; }
        @keyframes atk-label-life {
          0% { opacity: 0; transform: translateY(6px); }
          10% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-4px); }
        }
      `}} />

      {/* Roaming badge -- orbits the cursor, darts in on strike */}
      <div
        ref={badgeRef}
        className="fixed top-0 left-0 z-30 -translate-x-1/2 -translate-y-1/2"
        style={{ transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)', willChange: 'transform' }}
      >
        <div className="relative flex items-center justify-center">
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${isStriking ? 'animate-ping' : ''}`}
            style={{ backgroundColor: 'var(--sr-sev-critical)' }}
          />
          <div
            className="relative flex h-6 w-6 items-center justify-center rounded-full border transition-transform duration-300"
            style={{
              backgroundColor: 'rgba(208,59,59,0.1)',
              borderColor: 'var(--sr-sev-critical)',
              transform: isStriking ? 'scale(1.3)' : 'scale(1)',
              boxShadow: isStriking ? '0 0 16px rgba(208,59,59,0.5)' : 'none',
            }}
          >
            <Radio className="h-3 w-3" style={{ color: 'var(--sr-sev-critical)' }} />
          </div>
        </div>
      </div>

      {/* Strike beam + ripple + attribution label */}
      {strike && (
        <React.Fragment key={strike.id}>
          <svg className="fixed inset-0 z-30 w-full h-full" width="100%" height="100%">
            <line
              x1={strike.x1} y1={strike.y1} x2={strike.x2} y2={strike.y2}
              stroke="var(--sr-sev-critical)" strokeWidth="1.5" strokeDasharray="4 4"
              className="atk-beam"
            />
          </svg>

          <div
            className="fixed z-30 rounded-full border atk-ripple"
            style={{
              left: strike.x2, top: strike.y2,
              width: 36, height: 36,
              borderColor: 'var(--sr-sev-critical)',
            }}
          />

          <div
            className="fixed z-30 atk-label"
            style={{
              left: strike.labelLeft ? strike.x2 - 172 : strike.x2 + 18,
              top: strike.y2 + 18,
            }}
          >
            <div
              className="rounded-[var(--sr-radius-sm)] border px-2.5 py-1.5 backdrop-blur-md"
              style={{
                backgroundColor: 'var(--sr-glass-bg)',
                borderColor: 'var(--sr-border-hairline)',
                boxShadow: 'var(--sr-shadow-md)',
              }}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--sr-sev-critical)' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--sr-sev-critical)' }} />
                {strike.phrase}
              </div>
              <div className="mt-0.5 text-[9px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {strike.origin.ip} · {strike.origin.geo}
              </div>
              <div
                className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: 'rgba(12,163,12,0.1)', color: 'var(--sr-sev-info)' }}
              >
                Blocked
              </div>
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
};
export default RoamingAttacker;
