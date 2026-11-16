/** AuthorGlyph — deterministic 5×5 symmetric avatar from a name hash (no images, no email). */
import React, { useMemo } from 'react';

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const AuthorGlyph: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => {
  const { cells, hue } = useMemo(() => {
    const h = hash(name || 'anon');
    const grid: boolean[] = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        grid.push(((h >> (row * 3 + col)) & 1) === 1);
      }
    }
    const out: { x: number; y: number }[] = [];
    grid.forEach((on, i) => {
      if (!on) return;
      const row = Math.floor(i / 3);
      const col = i % 3;
      out.push({ x: col, y: row });
      if (col < 2) out.push({ x: 4 - col, y: row });
    });
    return { cells: out, hue: 180 + (h % 60) };
  }, [name]);

  const color = `hsl(${hue} 62% 42%)`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      aria-hidden="true"
      className="shrink-0 rounded-md"
      style={{ background: `color-mix(in srgb, ${color} 14%, var(--sr-bg-surface))` }}
    >
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
};

export default AuthorGlyph;
