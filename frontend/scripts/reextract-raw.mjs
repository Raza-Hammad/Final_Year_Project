import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src');

const raw = execSync('git -C D:/Final_Year_Project show HEAD:frontend/src/pages/Dashboard.tsx', {
  maxBuffer: 20 * 1024 * 1024,
}).toString('utf8');
const lines = raw.split(/\r?\n/);

const opens = [];
lines.forEach((l, i) => {
  if (/activeTab === '(live|simulator|history|insights|ai)' && \(/.test(l)) {
    opens.push({ line: i + 1, tab: l.match(/'(live|simulator|history|insights|ai)'/)[1] });
  }
});

const sectionClose = lines.findIndex(
  (l, i) => i > (opens[opens.length - 1]?.line || 0) && l.trim() === '</section>',
);

function extractBetween(openLine1, endExclusive1) {
  let chunk = lines.slice(openLine1, endExclusive1 - 1);

  // Drop trailing VIEW section comments (may be multi-line JSX comments)
  const joined = chunk.join('\n');
  const cleaned = joined.replace(
    /\n\s*(\)\}\s*|\}\)\(\)\}\s*)?(\n\s*)?\{\/\*\s*=+[\s\S]*?\*\/\}\s*$/,
    '',
  );
  chunk = cleaned.split('\n');

  while (chunk.length) {
    const t = chunk[chunk.length - 1].trim();
    if (t === '' || t === ')}' || t === '})()}') {
      chunk.pop();
      continue;
    }
    break;
  }
  return chunk;
}

for (let i = 0; i < opens.length; i++) {
  const start = opens[i].line;
  const endExclusive = i + 1 < opens.length ? opens[i + 1].line : sectionClose + 1;
  const chunk = extractBetween(start, endExclusive);
  fs.writeFileSync(path.join(src, 'pages/dashboard/_raw_' + opens[i].tab + '.txt'), chunk.join('\n'));
  console.log(opens[i].tab, chunk.length, 'tail:', (chunk[chunk.length - 1] || '').trim().slice(0, 80));
}
