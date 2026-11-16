/**
 * ObservatoryCanvas — Living Lattice v2.
 *
 * A single 2D canvas "network observatory": ~25 hosts in zones, driven by the
 * real WebSocket detection stream via `latticeBus`. Benign flows are small
 * cool packets; attacks are hot, severity-coloured arcs that raise host
 * pressure. Nothing is faked while idle — standby just breathes.
 *
 * Performance notes: DPR capped at 1.5, pooled particles (400), rAF paused when
 * the tab is hidden or the panel is off-screen, 12 fps trickle while standby.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pin, X } from 'lucide-react';
import type { DetectionData } from '../../dashboard/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { subscribeLattice, lastLatticeEventAt, recentLatticeEvents, type LatticeEvent } from './latticeBus';
import {
  EDGES,
  NODES,
  ZONES,
  nodeById,
  resolveNode,
  routeBetween,
  type TopoNode,
} from './topology';

const MAX_PARTICLES = 400;
const SOFT_BENIGN_CAP = 220;
const LIVE_WINDOW_MS = 8000;

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#FF5A5A',
  HIGH: '#FF9466',
  MEDIUM: '#FAB219',
  LOW: '#A0A8B5',
  INFO: '#A0A8B5',
};
const BENIGN_COLOR = '#5BC8E8';

type HostState = 'calm' | 'probed' | 'attack' | 'contained';

const STATE_COLOR: Record<HostState, string> = {
  calm: '#64748B',
  probed: '#FAB219',
  attack: '#FF5A5A',
  contained: '#34D3A0',
};

const STATE_LABEL: Record<HostState, string> = {
  calm: 'Calm',
  probed: 'Probed',
  attack: 'Under attack',
  contained: 'Contained',
};

const KIND_TINT: Partial<Record<TopoNode['kind'], string>> = {
  user: '#5BC8E8',
  threat: '#FF7A6B',
  gateway: '#A89AEF',
  'attacker-vm': '#FF9466',
  'victim-vm': '#7DA6FF',
  'sensor-vm': '#34D3A0',
};

interface NodeState {
  pressure: number;
  hits: number;
  lastAttackAt: number;
  lastEvent: LatticeEvent | null;
}

interface Particle {
  active: boolean;
  /** Route polyline in px (x0,y0,x1,y1,…) captured at spawn. */
  pts: number[];
  cum: number[];
  total: number;
  t: number;
  dur: number;
  ev: LatticeEvent | null;
  color: string;
  size: number;
  attack: boolean;
  critical: boolean;
  dstId: string;
  x: number;
  y: number;
}

interface Ring {
  x: number;
  y: number;
  t0: number;
  color: string;
}

interface PendingSpawn {
  at: number;
  ev: LatticeEvent;
}

type Tip =
  | { kind: 'node'; node: TopoNode; state: HostState; hits: number; last: LatticeEvent | null }
  | { kind: 'packet'; ev: LatticeEvent };

export interface ObservatoryCanvasProps {
  className?: string;
  /** Host id the analyst pinned (filters the feed in the parent). */
  pinnedNode?: string | null;
  onPinNode?: (id: string | null) => void;
  /** Open the XAI modal for a clicked packet. */
  onInspect?: (detection: DetectionData) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

function sevColor(ev: LatticeEvent): string {
  if (!ev.isAttack) return BENIGN_COLOR;
  return SEV_COLOR[ev.severity.toUpperCase()] ?? SEV_COLOR.MEDIUM;
}

function sevWeight(ev: LatticeEvent): number {
  switch (ev.severity.toUpperCase()) {
    case 'CRITICAL':
      return 3;
    case 'HIGH':
      return 2;
    case 'MEDIUM':
      return 1.4;
    default:
      return 1;
  }
}

function hostState(ns: NodeState, now: number): HostState {
  if (ns.pressure >= 3.5) return 'attack';
  if (ns.pressure >= 1) return 'probed';
  if (ns.lastAttackAt > 0 && now - ns.lastAttackAt < 25000) return 'contained';
  return 'calm';
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function makeParticle(): Particle {
  return {
    active: false,
    pts: [],
    cum: [],
    total: 1,
    t: 0,
    dur: 1,
    ev: null,
    color: BENIGN_COLOR,
    size: 2,
    attack: false,
    critical: false,
    dstId: '',
    x: 0,
    y: 0,
  };
}

function pointAt(p: Particle, s: number, out: { x: number; y: number }): void {
  const { pts, cum } = p;
  const segs = cum.length;
  let i = 1;
  while (i < segs - 1 && cum[i] < s) i += 1;
  const s0 = cum[i - 1];
  const s1 = cum[i];
  const f = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 0;
  const ax = pts[(i - 1) * 2];
  const ay = pts[(i - 1) * 2 + 1];
  const bx = pts[i * 2];
  const by = pts[i * 2 + 1];
  out.x = ax + (bx - ax) * f;
  out.y = ay + (by - ay) * f;
}

function drawNodeGlyph(
  ctx: CanvasRenderingContext2D,
  node: TopoNode,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (node.kind) {
    case 'threat': {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    }
    case 'gateway': {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'user':
      ctx.arc(x, y, r, 0, Math.PI * 2);
      break;
    default: {
      const rr = r * 0.32;
      const s = r * 0.95;
      ctx.moveTo(x - s + rr, y - s);
      ctx.arcTo(x + s, y - s, x + s, y + s, rr);
      ctx.arcTo(x + s, y + s, x - s, y + s, rr);
      ctx.arcTo(x - s, y + s, x - s, y - s, rr);
      ctx.arcTo(x - s, y - s, x + s, y - s, rr);
      ctx.closePath();
    }
  }
}

function nodeRadius(node: TopoNode): number {
  switch (node.kind) {
    case 'gateway':
      return 13;
    case 'workstation':
      return 8;
    case 'user':
    case 'threat':
      return 8;
    case 'attacker-vm':
    case 'victim-vm':
    case 'sensor-vm':
      return 11;
    default:
      return 10;
  }
}

function buildFloor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w + 48));
  c.height = Math.max(1, Math.floor(h + 48));
  const g = c.getContext('2d');
  if (!g) return c;
  const bg = g.createRadialGradient(c.width / 2, c.height * 0.45, 20, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.7);
  bg.addColorStop(0, '#111827');
  bg.addColorStop(1, '#0B0E14');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  const size = 24;
  const hh = size * Math.sqrt(3);
  g.strokeStyle = 'rgba(130, 150, 190, 0.07)';
  g.lineWidth = 1;
  for (let row = -1; row * hh * 0.5 < c.height + hh; row += 1) {
    for (let col = -1; col * size * 1.5 < c.width + size * 2; col += 1) {
      const cx = col * size * 1.5;
      const cy = row * hh * 0.5 + (col % 2 === 0 ? 0 : hh * 0.25);
      if ((row + col) % 2 !== 0) continue;
      g.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i;
        const px = cx + Math.cos(a) * (size * 0.55);
        const py = cy + Math.sin(a) * (size * 0.55);
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.stroke();
    }
  }
  return c;
}

export const ObservatoryCanvas: React.FC<ObservatoryCanvasProps> = ({
  className = '',
  pinnedNode = null,
  onPinNode,
  onInspect,
  fullscreen = false,
  onToggleFullscreen,
}) => {
  const reduced = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hud, setHud] = useState<{ rate: number; live: boolean; attackRate: number }>({
    rate: 0,
    live: false,
    attackRate: 0,
  });
  const [log, setLog] = useState<LatticeEvent[]>(() => recentLatticeEvents().slice(-6).reverse());

  const pinnedRef = useRef<string | null>(pinnedNode);
  useEffect(() => {
    pinnedRef.current = pinnedNode;
  }, [pinnedNode]);

  const onInspectRef = useRef(onInspect);
  const onPinRef = useRef(onPinNode);
  useEffect(() => {
    onInspectRef.current = onInspect;
    onPinRef.current = onPinNode;
  }, [onInspect, onPinNode]);

  const sim = useMemo(
    () => ({
      nodes: new Map<string, NodeState>(
        NODES.map((n) => [n.id, { pressure: 0, hits: 0, lastAttackAt: 0, lastEvent: null }]),
      ),
      heatAtk: new Map<string, number>(),
      heatBen: new Map<string, number>(),
      particles: Array.from({ length: MAX_PARTICLES }, () => makeParticle()),
      rings: [] as Ring[],
      pending: [] as PendingSpawn[],
      stamps: [] as { at: number; atk: boolean }[],
      hover: null as { type: 'node'; id: string } | { type: 'packet'; idx: number } | null,
      mouse: { x: 0, y: 0, in: false },
      size: { w: 800, h: 480, dpr: 1 },
      floor: null as HTMLCanvasElement | null,
      lastDraw: 0,
    }),
    [],
  );

  const drawFnRef = useRef<(now: number, dt: number) => void>(() => undefined);

  const spawn = useCallback(
    (ev: LatticeEvent) => {
      const { w, h } = sim.size;
      const src = resolveNode(ev.srcIp, ev.srcPort, 'src', ev.isAttack);
      let dst = resolveNode(ev.dstIp, ev.dstPort, 'dst', ev.isAttack);
      if (dst.id === src.id) dst = nodeById(src.zone === 'lab' ? 'lab-vic' : 'web') ?? dst;
      const ids = routeBetween(src.id, dst.id);
      const pts: number[] = [];
      ids.forEach((id) => {
        const n = nodeById(id);
        if (n) pts.push(n.x * w, n.y * h);
      });
      if (pts.length < 4) return;

      // Edge heat along the real route.
      for (let i = 0; i < ids.length - 1; i += 1) {
        const k = ids[i] < ids[i + 1] ? `${ids[i]}|${ids[i + 1]}` : `${ids[i + 1]}|${ids[i]}`;
        const m = ev.isAttack ? sim.heatAtk : sim.heatBen;
        m.set(k, Math.min(3, (m.get(k) ?? 0) + (ev.isAttack ? 0.6 : 0.15)));
      }

      const srcState = sim.nodes.get(src.id);
      if (srcState) {
        srcState.hits += 1;
        srcState.lastEvent = ev;
      }

      let slot: Particle | null = null;
      let liveCount = 0;
      for (const p of sim.particles) {
        if (p.active) liveCount += 1;
        else if (!slot) slot = p;
      }
      if (!ev.isAttack && liveCount > SOFT_BENIGN_CAP) return;
      if (!slot) return;

      const cum: number[] = [0];
      for (let i = 1; i < pts.length / 2; i += 1) {
        cum.push(
          cum[i - 1] + Math.hypot(pts[i * 2] - pts[(i - 1) * 2], pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]),
        );
      }
      slot.active = true;
      slot.pts = pts;
      slot.cum = cum;
      slot.total = Math.max(1, cum[cum.length - 1]);
      slot.t = 0;
      slot.dur = (ev.isAttack ? 1.7 : 1.15) + Math.random() * 0.4;
      slot.ev = ev;
      slot.color = sevColor(ev);
      slot.attack = ev.isAttack;
      slot.critical = ev.severity.toUpperCase() === 'CRITICAL';
      slot.size = ev.isAttack ? (slot.critical ? 4 : 3) : 1.7;
      slot.dstId = dst.id;
    },
    [sim],
  );

  // Subscribe to the bus once.
  useEffect(() => {
    let lastLogAt = 0;
    const off = subscribeLattice((ev) => {
      const now = performance.now();
      sim.stamps.push({ at: now, atk: ev.isAttack });
      const stagger = reduced ? 0 : Math.random() * 160;
      sim.pending.push({ at: now + stagger, ev });
      if (sim.pending.length > 600) sim.pending.splice(0, sim.pending.length - 600);
      if (reduced) {
        // Static path: apply pressure immediately and refresh the little log.
        const dst = resolveNode(ev.dstIp, ev.dstPort, 'dst', ev.isAttack);
        const ns = sim.nodes.get(dst.id);
        if (ns) {
          ns.hits += 1;
          ns.lastEvent = ev;
          if (ev.isAttack) {
            ns.pressure += sevWeight(ev);
            ns.lastAttackAt = Date.now();
          }
        }
        if (now - lastLogAt > 1000) {
          lastLogAt = now;
          setLog(recentLatticeEvents().slice(-6).reverse());
          drawFnRef.current(now, 0);
        }
      }
    });
    return off;
  }, [sim, reduced]);

  // Main render effect (canvas setup, loop, interactions).
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let raf = 0;
    let running = false;
    let visible = true;
    let lastT = performance.now();
    let lastHud = 0;
    const tmp = { x: 0, y: 0 };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.max(200, Math.floor(rect.width));
      const h = Math.max(160, Math.floor(rect.height));
      sim.size = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      sim.floor = buildFloor(w, h);
      drawFnRef.current(performance.now(), 0);
    };

    const draw = (now: number, dt: number) => {
      const { w, h, dpr } = sim.size;
      const wallNow = Date.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Decay
      const k = Math.exp(-dt / 6);
      sim.nodes.forEach((ns) => {
        ns.pressure *= k;
        if (ns.pressure < 0.02) ns.pressure = 0;
      });
      const heatK = Math.exp(-dt / 3.5);
      sim.heatAtk.forEach((v, key) => sim.heatAtk.set(key, v * heatK));
      sim.heatBen.forEach((v, key) => sim.heatBen.set(key, v * heatK));

      // Floor + parallax
      const px = sim.mouse.in ? (sim.mouse.x / w - 0.5) * -16 : 0;
      const py = sim.mouse.in ? (sim.mouse.y / h - 0.5) * -10 : 0;
      if (sim.floor) ctx.drawImage(sim.floor, -24 + px, -24 + py);
      else {
        ctx.fillStyle = '#0B0E14';
        ctx.fillRect(0, 0, w, h);
      }

      // Zones
      ctx.lineWidth = 1;
      ZONES.forEach((z) => {
        const zx = z.x * w;
        const zy = z.y * h;
        const zw = z.w * w;
        const zh = z.h * h;
        const lab = z.id === 'lab';
        ctx.fillStyle = lab ? 'rgba(52, 211, 160, 0.035)' : 'rgba(148, 163, 184, 0.03)';
        ctx.strokeStyle = lab ? 'rgba(52, 211, 160, 0.28)' : 'rgba(148, 163, 184, 0.14)';
        ctx.setLineDash(lab ? [5, 4] : []);
        ctx.beginPath();
        ctx.roundRect(zx, zy, zw, zh, 12);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lab ? 'rgba(52, 211, 160, 0.75)' : 'rgba(148, 163, 184, 0.55)';
        ctx.font = '600 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(z.label, zx + 10, zy + 14);
      });

      // Edges
      EDGES.forEach((e) => {
        const a = nodeById(e.a);
        const b = nodeById(e.b);
        if (!a || !b) return;
        const key = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
        const ha = sim.heatAtk.get(key) ?? 0;
        const hb = sim.heatBen.get(key) ?? 0;
        const heat = Math.min(1, Math.max(ha, hb));
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        if (e.tap) ctx.setLineDash([3, 5]);
        if (ha > hb && ha > 0.05) {
          ctx.strokeStyle = `rgba(255, 110, 90, ${0.12 + heat * 0.6})`;
        } else if (hb > 0.05) {
          ctx.strokeStyle = `rgba(91, 200, 232, ${0.12 + heat * 0.5})`;
        } else {
          ctx.strokeStyle = e.tap ? 'rgba(52, 211, 160, 0.2)' : 'rgba(148, 163, 184, 0.12)';
        }
        ctx.lineWidth = 1 + heat * 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Pending spawns
      if (sim.pending.length > 0) {
        const due: PendingSpawn[] = [];
        const rest: PendingSpawn[] = [];
        for (const p of sim.pending) (p.at <= now ? due : rest).push(p);
        if (due.length > 0) {
          sim.pending = rest;
          due.forEach((p) => spawn(p.ev));
        }
      }

      // Particles
      ctx.globalCompositeOperation = 'lighter';
      let anyActive = false;
      const hoverPacket = sim.hover && sim.hover.type === 'packet' ? sim.hover.idx : -1;
      for (let i = 0; i < sim.particles.length; i += 1) {
        const p = sim.particles[i];
        if (!p.active) continue;
        anyActive = true;
        p.t += dt / p.dur;
        if (p.t >= 1) {
          p.active = false;
          const ns = sim.nodes.get(p.dstId);
          const dnode = nodeById(p.dstId);
          if (ns && p.ev) {
            ns.hits += 1;
            ns.lastEvent = p.ev;
            if (p.attack) {
              ns.pressure += sevWeight(p.ev);
              ns.lastAttackAt = wallNow;
              if (p.critical && dnode) {
                sim.rings.push({ x: dnode.x * w, y: dnode.y * h, t0: now, color: p.color });
                if (sim.rings.length > 12) sim.rings.shift();
              }
            } else {
              ns.pressure += 0.02;
            }
          }
          continue;
        }
        const s = easeInOut(p.t) * p.total;
        pointAt(p, s, tmp);
        p.x = tmp.x;
        p.y = tmp.y;
        // Comet trail
        const trail = p.attack ? 7 : 4;
        let prevX = p.x;
        let prevY = p.y;
        for (let j = 1; j <= trail; j += 1) {
          const ts = Math.max(0, s - j * (p.attack ? 9 : 6));
          pointAt(p, ts, tmp);
          const alpha = (1 - j / (trail + 1)) * (p.attack ? 0.55 : 0.3);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(0.8, p.size * (1 - j / (trail + 2)));
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(tmp.x, tmp.y);
          ctx.stroke();
          prevX = tmp.x;
          prevY = tmp.y;
        }
        ctx.globalAlpha = 1;
        // Head + glow
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.attack ? 0.18 : 0.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, hoverPacket === i ? p.size + 2 : p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Shockwave rings
      if (sim.rings.length > 0) {
        sim.rings = sim.rings.filter((r) => now - r.t0 < 900);
        sim.rings.forEach((r) => {
          const f = (now - r.t0) / 900;
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = (1 - f) * 0.8;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 12 + f * 46, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }

      // Nodes
      const breath = reduced ? 0 : Math.sin(now / 1400);
      const hoverNode = sim.hover && sim.hover.type === 'node' ? sim.hover.id : null;
      NODES.forEach((n) => {
        const ns = sim.nodes.get(n.id);
        if (!ns) return;
        const state = hostState(ns, wallNow);
        const x = n.x * w;
        const y = n.y * h;
        let r = nodeRadius(n);
        const standby = !anyActive && state === 'calm';
        if (standby) r *= 1 + breath * 0.04;
        const color = STATE_COLOR[state];
        const tint = KIND_TINT[n.kind] ?? '#9AA7FF';

        if (state === 'attack' || state === 'probed') {
          const pulse = reduced ? 1 : 1 + 0.25 * Math.sin(now / 160);
          ctx.beginPath();
          ctx.arc(x, y, (r + 7) * pulse, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = state === 'attack' ? 0.22 : 0.12;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (state === 'contained') {
          ctx.beginPath();
          ctx.arc(x, y, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        drawNodeGlyph(ctx, n, x, y, r);
        ctx.fillStyle = '#0F1626';
        ctx.fill();
        ctx.lineWidth = hoverNode === n.id || pinnedRef.current === n.id ? 2.4 : 1.6;
        ctx.strokeStyle = state === 'calm' ? tint : color;
        ctx.globalAlpha = state === 'calm' && standby ? 0.7 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Inner glyph dot
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.8, r * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = state === 'calm' ? tint : color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (pinnedRef.current === n.id) {
          ctx.beginPath();
          ctx.arc(x, y, r + 5, 0, Math.PI * 2);
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#A89AEF';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.font = '500 9.5px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = state === 'calm' ? 'rgba(160, 174, 192, 0.85)' : color;
        ctx.fillText(n.label, x, y + r + 12);
      });

      // Throttled HUD state
      if (now - lastHud > 500) {
        lastHud = now;
        const cutoff = now - 2000;
        sim.stamps = sim.stamps.filter((s) => s.at >= cutoff);
        const total = sim.stamps.length / 2;
        const atk = sim.stamps.filter((s) => s.atk).length / 2;
        const live = wallNow - lastLatticeEventAt() < LIVE_WINDOW_MS && lastLatticeEventAt() > 0;
        setHud((prev) =>
          prev.live === live && Math.round(prev.rate) === Math.round(total) && Math.round(prev.attackRate) === Math.round(atk)
            ? prev
            : { rate: total, live, attackRate: atk },
        );
      }
      sim.lastDraw = now;
    };
    drawFnRef.current = (now: number, dt: number) => draw(now, dt);

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const live = Date.now() - lastLatticeEventAt() < LIVE_WINDOW_MS && lastLatticeEventAt() > 0;
      const busy = live || sim.pending.length > 0 || sim.particles.some((p) => p.active) || sim.rings.length > 0;
      if (!busy && now - lastT < 80) return; // ~12 fps trickle while standby
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      draw(now, dt);
    };

    const start = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    resize();

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(wrap);

    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVis);
    start();

    let staticTimer: number | null = null;
    if (reduced) {
      staticTimer = window.setInterval(() => draw(performance.now(), 2), 2000);
    }

    // Interaction
    const hit = (mx: number, my: number): Tip | null => {
      const { w, h } = sim.size;
      for (let i = 0; i < sim.particles.length; i += 1) {
        const p = sim.particles[i];
        if (p.active && p.ev && Math.hypot(p.x - mx, p.y - my) < 9) {
          sim.hover = { type: 'packet', idx: i };
          return { kind: 'packet', ev: p.ev };
        }
      }
      for (const n of NODES) {
        const r = nodeRadius(n) + 6;
        if (Math.hypot(n.x * w - mx, n.y * h - my) < r) {
          sim.hover = { type: 'node', id: n.id };
          const ns = sim.nodes.get(n.id);
          return {
            kind: 'node',
            node: n,
            state: ns ? hostState(ns, Date.now()) : 'calm',
            hits: ns?.hits ?? 0,
            last: ns?.lastEvent ?? null,
          };
        }
      }
      sim.hover = null;
      return null;
    };

    let tipKey = '';
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      sim.mouse = { x: mx, y: my, in: true };
      const t = hit(mx, my);
      const key = t ? (t.kind === 'node' ? `n:${t.node.id}:${t.state}` : `p:${t.ev.id}`) : '';
      if (key !== tipKey) {
        tipKey = key;
        setTip(t);
      }
      const el = tipRef.current;
      if (el) {
        const flip = mx > sim.size.w - 260;
        el.style.transform = `translate(${flip ? mx - 250 : mx + 14}px, ${Math.max(6, Math.min(my + 14, sim.size.h - 130))}px)`;
      }
      canvas.style.cursor = t ? 'pointer' : 'default';
      if (reduced) draw(performance.now(), 0);
    };
    const onLeave = () => {
      sim.mouse.in = false;
      sim.hover = null;
      tipKey = '';
      setTip(null);
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = hit(e.clientX - rect.left, e.clientY - rect.top);
      if (!t) {
        if (pinnedRef.current) onPinRef.current?.(null);
        return;
      }
      if (t.kind === 'packet') {
        onInspectRef.current?.(t.ev.raw);
      } else {
        onPinRef.current?.(pinnedRef.current === t.node.id ? null : t.node.id);
      }
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('click', onClick);
      if (staticTimer !== null) window.clearInterval(staticTimer);
      drawFnRef.current = () => undefined;
    };
  }, [sim, spawn, reduced]);

  // Redraw static frame when the pin changes in reduced-motion mode.
  useEffect(() => {
    if (reduced) drawFnRef.current(performance.now(), 0);
  }, [pinnedNode, reduced]);

  const pinnedLabel = pinnedNode ? nodeById(pinnedNode)?.label : null;

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-[var(--sr-radius-md)] border border-white/10 bg-[#0B0E14] ${className}`}
      role="img"
      aria-label="Living Lattice network observatory showing live traffic between hosts"
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* HUD — status */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-200 backdrop-blur">
          <span
            className={`h-1.5 w-1.5 rounded-full ${hud.live ? 'animate-pulse bg-[#34D3A0]' : 'bg-slate-500'}`}
          />
          {hud.live ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              LIVE · {Math.round(hud.rate)} flows/s
              {hud.attackRate >= 1 && (
                <span className="ml-2 text-[#FF8A7A]">{Math.round(hud.attackRate)} hostile/s</span>
              )}
            </span>
          ) : (
            <span className="text-slate-400">AWAITING TELEMETRY</span>
          )}
        </div>
        {pinnedLabel && (
          <button
            type="button"
            onClick={() => onPinNode?.(null)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[#A89AEF]/40 bg-[#A89AEF]/15 px-2.5 py-1 text-[10px] font-semibold text-[#C9BFFF]"
          >
            <Pin className="h-3 w-3" /> Feed filtered: {pinnedLabel}
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* HUD — controls */}
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen lattice' : 'Fullscreen lattice'}
          className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 p-1.5 text-slate-300 backdrop-blur transition-colors hover:text-white"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* HUD — legend */}
      <div className="pointer-events-none absolute bottom-2 right-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[9.5px] text-slate-400">
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: BENIGN_COLOR }} />Benign</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR.MEDIUM }} />Medium</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR.HIGH }} />High</span>
        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR.CRITICAL }} />Critical</span>
        <span className="text-slate-500">Hover a host or packet · click to pin / inspect</span>
      </div>

      {/* Reduced-motion static log */}
      {reduced && log.length > 0 && (
        <ul className="absolute bottom-8 left-3 max-w-[260px] space-y-0.5 rounded-lg border border-white/10 bg-black/50 p-2 text-[10px] text-slate-300">
          {log.map((ev) => (
            <li key={ev.id} className="truncate" style={{ color: sevColor(ev) }}>
              {ev.label} · {ev.srcIp} → {ev.dstIp}
            </li>
          ))}
        </ul>
      )}

      {/* Tooltip */}
      <div
        ref={tipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 w-[240px] rounded-lg border border-white/15 bg-[#0B0E14]/95 p-2.5 text-[11px] text-slate-200 shadow-xl backdrop-blur"
        style={{ opacity: tip ? 1 : 0, transition: 'opacity 120ms' }}
      >
        {tip?.kind === 'node' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{tip.node.label}</span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: STATE_COLOR[tip.state], background: 'rgba(255,255,255,0.06)' }}>
                {STATE_LABEL[tip.state]}
              </span>
            </div>
            <div className="text-slate-400">{tip.node.role}</div>
            <div className="text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tip.last
                ? `Last: ${tip.last.srcIp} → ${tip.last.dstIp}`
                : tip.node.ip}
            </div>
            <div className="text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{tip.hits} flows seen</div>
            <div className="text-[10px] text-[#A89AEF]">Click to filter the feed</div>
          </div>
        )}
        {tip?.kind === 'packet' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold" style={{ color: sevColor(tip.ev) }}>{tip.ev.label}</span>
              <span className="text-[10px] text-slate-400">{tip.ev.isAttack ? tip.ev.severity : 'Benign'}</span>
            </div>
            <div className="text-slate-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tip.ev.srcIp}:{tip.ev.srcPort} → {tip.ev.dstIp}:{tip.ev.dstPort}
            </div>
            <div className="text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
              Tier {tip.ev.tier} · {(tip.ev.confidence * 100).toFixed(1)}% confidence
            </div>
            <div className="text-[10px] text-[#A89AEF]">Click to explain this flow</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ObservatoryCanvas;
