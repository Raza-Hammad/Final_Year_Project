/**
 * Observatory topology — ~25 hosts in zones, plus the mapping from a real
 * (IP, port) pair to a host node. Coordinates are fractions of the canvas.
 *
 * Nothing here is random per event: the same IP always lands on the same node,
 * so tooltips and arcs stay consistent with the telemetry feed.
 */

export type ZoneId = 'external' | 'dmz' | 'core' | 'workstations' | 'lab';

export type NodeKind =
  | 'user'
  | 'threat'
  | 'gateway'
  | 'web'
  | 'dns'
  | 'mail'
  | 'bastion'
  | 'app'
  | 'db'
  | 'file'
  | 'workstation'
  | 'attacker-vm'
  | 'sensor-vm'
  | 'victim-vm';

export interface TopoNode {
  id: string;
  label: string;
  role: string;
  zone: ZoneId;
  kind: NodeKind;
  x: number;
  y: number;
  /** Canonical IP shown in tooltips when no live event is hovered. */
  ip: string;
}

export interface TopoZone {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TopoEdge {
  a: string;
  b: string;
  /** Dashed tap/mirror links (Sensor VM). */
  tap?: boolean;
}

export const ZONES: TopoZone[] = [
  { id: 'external', label: 'EXTERNAL', x: 0.02, y: 0.05, w: 0.17, h: 0.66 },
  { id: 'dmz', label: 'DMZ', x: 0.30, y: 0.05, w: 0.17, h: 0.66 },
  { id: 'core', label: 'CORE', x: 0.55, y: 0.05, w: 0.15, h: 0.66 },
  { id: 'workstations', label: 'WORKSTATIONS', x: 0.78, y: 0.05, w: 0.2, h: 0.66 },
  { id: 'lab', label: 'ISOLATED LAB · VIRTUALBOX INTERNAL NETWORK', x: 0.02, y: 0.78, w: 0.68, h: 0.19 },
];

export const NODES: TopoNode[] = [
  // External — legitimate users (top) and threat actors (bottom)
  { id: 'u1', label: 'User A', role: 'Remote user', zone: 'external', kind: 'user', x: 0.07, y: 0.14, ip: '198.51.100.10' },
  { id: 'u2', label: 'User B', role: 'Remote user', zone: 'external', kind: 'user', x: 0.14, y: 0.22, ip: '198.51.100.24' },
  { id: 'u3', label: 'User C', role: 'Remote user', zone: 'external', kind: 'user', x: 0.07, y: 0.31, ip: '198.51.100.57' },
  { id: 'u4', label: 'User D', role: 'Remote user', zone: 'external', kind: 'user', x: 0.14, y: 0.4, ip: '198.51.100.88' },
  { id: 't1', label: 'Threat 1', role: 'External scanner', zone: 'external', kind: 'threat', x: 0.07, y: 0.5, ip: '10.0.0.5' },
  { id: 't2', label: 'Threat 2', role: 'Botnet node', zone: 'external', kind: 'threat', x: 0.14, y: 0.58, ip: '10.0.0.17' },
  { id: 't3', label: 'Threat 3', role: 'Flood source', zone: 'external', kind: 'threat', x: 0.07, y: 0.66, ip: '172.16.0.4' },
  { id: 't4', label: 'Threat 4', role: 'Brute-force source', zone: 'external', kind: 'threat', x: 0.14, y: 0.45, ip: '172.16.0.9' },

  // Perimeter
  { id: 'gw', label: 'Gateway', role: 'Edge firewall', zone: 'dmz', kind: 'gateway', x: 0.325, y: 0.38, ip: '192.168.10.1' },
  { id: 'web', label: 'Web', role: 'Web server', zone: 'dmz', kind: 'web', x: 0.42, y: 0.15, ip: '192.168.10.50' },
  { id: 'dns', label: 'DNS', role: 'Resolver', zone: 'dmz', kind: 'dns', x: 0.42, y: 0.33, ip: '192.168.10.53' },
  { id: 'mail', label: 'Mail', role: 'Mail relay', zone: 'dmz', kind: 'mail', x: 0.42, y: 0.5, ip: '192.168.10.25' },
  { id: 'bastion', label: 'Bastion', role: 'SSH / FTP jump host', zone: 'dmz', kind: 'bastion', x: 0.42, y: 0.65, ip: '192.168.10.22' },

  // Core
  { id: 'app', label: 'App', role: 'Application tier', zone: 'core', kind: 'app', x: 0.6, y: 0.24, ip: '192.168.10.60' },
  { id: 'db', label: 'Database', role: 'Database server', zone: 'core', kind: 'db', x: 0.65, y: 0.42, ip: '192.168.10.51' },
  { id: 'file', label: 'File', role: 'File server', zone: 'core', kind: 'file', x: 0.6, y: 0.6, ip: '192.168.10.70' },

  // Workstations
  { id: 'ws1', label: 'WS-1', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.83, y: 0.15, ip: '192.168.10.100' },
  { id: 'ws2', label: 'WS-2', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.92, y: 0.2, ip: '192.168.10.101' },
  { id: 'ws3', label: 'WS-3', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.83, y: 0.33, ip: '192.168.10.102' },
  { id: 'ws4', label: 'WS-4', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.92, y: 0.4, ip: '192.168.10.103' },
  { id: 'ws5', label: 'WS-5', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.83, y: 0.52, ip: '192.168.10.104' },
  { id: 'ws6', label: 'WS-6', role: 'Analyst workstation', zone: 'workstations', kind: 'workstation', x: 0.92, y: 0.6, ip: '192.168.10.105' },

  // Isolated lab (VirtualBox Internal Network)
  { id: 'lab-atk', label: 'Attacker VM', role: 'Lab attacker', zone: 'lab', kind: 'attacker-vm', x: 0.1, y: 0.88, ip: '192.168.56.10' },
  { id: 'lab-sensor', label: 'Sensor VM', role: 'Lab sensor', zone: 'lab', kind: 'sensor-vm', x: 0.36, y: 0.93, ip: '192.168.56.20' },
  { id: 'lab-vic', label: 'Victim VM', role: 'Lab victim', zone: 'lab', kind: 'victim-vm', x: 0.62, y: 0.88, ip: '192.168.56.30' },
];

export const EDGES: TopoEdge[] = [
  // External → gateway
  ...['u1', 'u2', 'u3', 'u4', 't1', 't2', 't3', 't4'].map((id) => ({ a: id, b: 'gw' })),
  // Gateway → DMZ
  { a: 'gw', b: 'web' },
  { a: 'gw', b: 'dns' },
  { a: 'gw', b: 'mail' },
  { a: 'gw', b: 'bastion' },
  // DMZ → core
  { a: 'web', b: 'app' },
  { a: 'mail', b: 'app' },
  { a: 'bastion', b: 'app' },
  { a: 'bastion', b: 'file' },
  { a: 'app', b: 'db' },
  { a: 'app', b: 'file' },
  // Core ↔ workstations
  { a: 'app', b: 'ws1' },
  { a: 'app', b: 'ws3' },
  { a: 'db', b: 'ws4' },
  { a: 'file', b: 'ws5' },
  { a: 'file', b: 'ws6' },
  { a: 'ws1', b: 'ws2' },
  { a: 'ws3', b: 'ws4' },
  { a: 'ws5', b: 'ws6' },
  // Lab
  { a: 'lab-atk', b: 'lab-vic' },
  { a: 'lab-atk', b: 'lab-sensor', tap: true },
  { a: 'lab-vic', b: 'lab-sensor', tap: true },
];

const NODE_BY_ID: Record<string, TopoNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
const ADJ: Record<string, string[]> = {};
EDGES.forEach((e) => {
  if (e.tap) return; // taps mirror traffic, they do not route it
  (ADJ[e.a] ??= []).push(e.b);
  (ADJ[e.b] ??= []).push(e.a);
});

export function nodeById(id: string): TopoNode | undefined {
  return NODE_BY_ID[id];
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isPrivate(ip: string): boolean {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('127.')
  );
}

const USERS = ['u1', 'u2', 'u3', 'u4'];
const THREATS = ['t1', 't2', 't3', 't4'];
const WORKSTATIONS = ['ws1', 'ws2', 'ws3', 'ws4', 'ws5', 'ws6'];

function serverByPort(port: number): string | null {
  switch (port) {
    case 80:
    case 443:
    case 8080:
    case 8443:
      return 'web';
    case 3306:
    case 5432:
    case 1433:
    case 27017:
      return 'db';
    case 22:
    case 21:
    case 2222:
      return 'bastion';
    case 445:
    case 139:
    case 2049:
      return 'file';
    case 53:
      return 'dns';
    case 25:
    case 587:
    case 143:
    case 993:
      return 'mail';
    default:
      return null;
  }
}

const KNOWN_SERVER_IPS: Record<string, string> = {
  '192.168.10.50': 'web',
  '192.168.10.51': 'db',
  '192.168.10.53': 'dns',
  '192.168.10.25': 'mail',
  '192.168.10.22': 'bastion',
  '192.168.10.60': 'app',
  '192.168.10.70': 'file',
  '192.168.10.1': 'gw',
  '192.168.56.10': 'lab-atk',
  '192.168.56.20': 'lab-sensor',
  '192.168.56.30': 'lab-vic',
};

/** Whether this IP belongs to the isolated VirtualBox lab subnet. */
export function isLabIp(ip: string): boolean {
  return ip.startsWith('192.168.56.');
}

/**
 * Resolve an endpoint to a host. `role` hints whether the endpoint is the
 * source or destination, and whether the flow was classified as an attack
 * (attack sources light up the threat-actor column).
 */
export function resolveNode(
  ip: string,
  port: number,
  role: 'src' | 'dst',
  isAttack: boolean,
): TopoNode {
  const known = KNOWN_SERVER_IPS[ip];
  if (known) return NODE_BY_ID[known];

  if (isLabIp(ip)) {
    return NODE_BY_ID[role === 'src' ? 'lab-atk' : 'lab-vic'];
  }

  if (role === 'dst') {
    if (ip === 'unknown') return NODE_BY_ID[serverByPort(port) ?? 'web'];
    const byPort = serverByPort(port);
    if (byPort && (isPrivate(ip) || ip === 'unknown')) return NODE_BY_ID[byPort];
    if (ip.startsWith('192.168.10.')) {
      const last = Number(ip.split('.')[3]);
      if (last >= 100) return NODE_BY_ID[WORKSTATIONS[last % WORKSTATIONS.length]];
      return NODE_BY_ID[byPort ?? 'app'];
    }
    if (byPort) return NODE_BY_ID[byPort];
    const h = hashStr(ip);
    // Public destinations: outbound traffic to a remote user / host.
    return NODE_BY_ID[USERS[h % USERS.length]];
  }

  // source
  if (ip.startsWith('192.168.10.')) {
    const last = Number(ip.split('.')[3]);
    return NODE_BY_ID[WORKSTATIONS[last % WORKSTATIONS.length]];
  }
  const h = hashStr(ip);
  if (isAttack) return NODE_BY_ID[THREATS[h % THREATS.length]];
  return NODE_BY_ID[USERS[h % USERS.length]];
}

const pathCache = new Map<string, string[]>();

/** Shortest hop route (node ids) between two hosts over routed links. */
export function routeBetween(fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId];
  const key = `${fromId}>${toId}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const prev: Record<string, string | null> = { [fromId]: null };
  const queue: string[] = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === toId) break;
    for (const nxt of ADJ[cur] ?? []) {
      if (!(nxt in prev)) {
        prev[nxt] = cur;
        queue.push(nxt);
      }
    }
  }
  if (!(toId in prev)) {
    pathCache.set(key, [fromId, toId]);
    return [fromId, toId];
  }
  const out: string[] = [];
  let at: string | null = toId;
  while (at) {
    out.unshift(at);
    at = prev[at];
  }
  pathCache.set(key, out);
  return out;
}
