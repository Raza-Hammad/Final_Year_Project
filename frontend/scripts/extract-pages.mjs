/**
 * Extract tab JSX blocks from Dashboard.tsx into page modules.
 * Also emits marker info for manual wiring.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src');
const dash = fs.readFileSync(path.join(src, 'pages/Dashboard.tsx'), 'utf8');
const lines = dash.split(/\r?\n/);

function grab(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

// From earlier grep / read:
// live block inside `{activeTab === 'live' && (` ... matching close before simulator
// We'll extract by marker comments.

const markers = {
  liveStart: lines.findIndex((l) => l.includes("VIEW A: LIVE TELEMETRY")),
  simStart: lines.findIndex((l) => l.includes("VIEW B: THREAT SIMULATOR")),
  histStart: lines.findIndex((l) => l.includes("activeTab === 'history'")),
  insightsStart: lines.findIndex((l) => l.includes("activeTab === 'insights'")),
  aiStart: lines.findIndex((l) => l.includes("activeTab === 'ai'")),
  xaiStart: lines.findIndex((l) => l.includes('XAI EXPLAIN THE PACKET')),
  exportStart: lines.findIndex((l) => l.includes('EXPORT OPTIONS MODAL')),
};

console.log('markers (0-based):', markers);

// Find the opening `{activeTab === 'live' && (` line
const liveOpen = lines.findIndex((l) => l.includes("activeTab === 'live' &&"));
const simOpen = lines.findIndex((l) => l.includes("activeTab === 'simulator' &&"));
const histOpen = lines.findIndex((l, i) => i > simOpen && l.includes("activeTab === 'history' &&"));
const insightsOpen = lines.findIndex((l, i) => i > histOpen && l.includes("activeTab === 'insights' &&"));
const aiOpen = lines.findIndex((l, i) => i > insightsOpen && l.includes("activeTab === 'ai' &&"));

console.log({ liveOpen, simOpen, histOpen, insightsOpen, aiOpen });

// Ends: each block ends at the line before next open, except ai ends before `</section>`
const sectionClose = lines.findIndex((l, i) => i > aiOpen && l.trim() === '</section>');
console.log('sectionClose', sectionClose);

function extractInner(openIdx, endIdx) {
  // openIdx is the `{activeTab === 'x' && (` line; content until endIdx exclusive
  // For simulator which is `&& (() => {`, keep through the IIFE.
  return lines.slice(openIdx + 1, endIdx).join('\n');
}

const chunks = {
  live: extractInner(liveOpen, simOpen),
  simulator: extractInner(simOpen, histOpen),
  history: extractInner(histOpen, insightsOpen),
  insights: extractInner(insightsOpen, aiOpen),
  ai: extractInner(aiOpen, sectionClose),
};

for (const [k, v] of Object.entries(chunks)) {
  const out = path.join(src, `pages/dashboard/_raw_${k}.txt`);
  fs.writeFileSync(out, v);
  console.log(k, 'lines', v.split('\n').length, '->', out);
}

// Also dump XAI + export modals
const xaiOpen = lines.findIndex((l) => l.includes('selectedDetection && (() =>'));
const exportOpen = lines.findIndex((l) => l.includes('{showExportModal &&'));
const rootClose = lines.findIndex((l, i) => i > exportOpen && l.trim() === '</div>' && lines[i + 1]?.trim() === ');');
console.log({ xaiOpen, exportOpen, rootClose });

fs.writeFileSync(path.join(src, 'pages/dashboard/_raw_xai.txt'), lines.slice(xaiOpen, exportOpen).join('\n'));
fs.writeFileSync(path.join(src, 'pages/dashboard/_raw_export.txt'), lines.slice(exportOpen, rootClose + 1).join('\n'));
console.log('raw extracts done');
