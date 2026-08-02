#!/usr/bin/env node
// Renders the last 12 months of GitHub contributions as an occlusion terrain SVG.
// One ridge per month, oldest at the back. Ice accent on the current month.
// Usage: node scripts/terrain.mjs [--demo]  → writes dist/terrain.svg

import { mkdirSync, writeFileSync } from 'node:fs';

const ACCENT = '#38BDF8';
const W = 720, H = 430, PAD_X = 52, TOP = 64, BOTTOM = 60;
const ROWS = 12, AMP = 64;

async function fetchDays() {
  const login = process.env.GITHUB_REPOSITORY_OWNER || 'shivarchit';
  const query = `query($login:String!){user(login:$login){contributionsCollection{
    contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays);
}

function demoDays() {
  let seed = 47;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const burst = rnd() < 0.06 ? rnd() * 18 : 0;
    days.push({
      date: d.toISOString().slice(0, 10),
      contributionCount: Math.max(0, Math.floor(rnd() * 9 - 2 + burst)),
    });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function byMonth(days) {
  const map = new Map();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(day.contributionCount);
  }
  return [...map.entries()].slice(-ROWS);
}

const smooth = v => v.map((p, i) =>
  (v[Math.max(0, i - 1)] + 2 * p + v[Math.min(v.length - 1, i + 1)]) / 4);

function ridgePath(vals, baseY, amp, innerW) {
  const n = vals.length, step = innerW / (n - 1);
  let d = `M ${PAD_X} ${(baseY - vals[0] * amp).toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const x = PAD_X + i * step, y = baseY - vals[i] * amp;
    const px = PAD_X + (i - 1) * step, py = baseY - vals[i - 1] * amp;
    const cx = (px + x) / 2;
    d += ` C ${cx.toFixed(1)} ${py.toFixed(1)}, ${cx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

function render(rows) {
  const innerW = W - PAD_X * 2;
  const gap = (H - TOP - BOTTOM) / (ROWS - 1);
  // Bursty, sparse data: presence floor makes every active day visible;
  // sqrt over a p90 cap adds magnitude without letting one 150-commit day flatten the rest.
  const nonzero = rows.flatMap(([, counts]) => counts).filter(c => c > 0).sort((a, b) => a - b);
  const cap = Math.max(1, nonzero[Math.floor(nonzero.length * 0.90)] ?? 1);
  const scale = c => c > 0 ? 0.22 + 0.78 * Math.min(1, Math.sqrt(c / cap)) : 0;

  let busiest = { count: -1, row: 0, idx: 0, len: 1 };
  rows.forEach(([, counts], m) => counts.forEach((c, i) => {
    if (c > busiest.count) busiest = { count: c, row: m, idx: i, len: counts.length };
  }));

  let body = '';
  // Accent the newest month that has activity — day 1 of a fresh month has no terrain yet
  let accentRow = ROWS - 1;
  while (accentRow > 0 && rows[accentRow][1].every(c => c === 0)) accentRow--;

  rows.forEach(([key, counts], m) => {
    const baseY = TOP + m * gap;
    const vals = smooth(counts.map(scale));
    const d = ridgePath(vals, baseY, AMP, innerW);
    const last = m === accentRow;
    const opacity = (0.3 + 0.7 * (m / (ROWS - 1))).toFixed(2);
    const delay = (m * 0.08).toFixed(2);
    body += `<path class="occ" d="${d} L ${W - PAD_X} ${H} L ${PAD_X} ${H} Z"/>`;
    body += `<path class="${last ? 'rl' : 'rg'}" pathLength="1" style="animation-delay:${delay}s"` +
      (last ? '' : ` stroke-opacity="${opacity}"`) + ` d="${d}"/>`;
    body += `<text class="faint" x="${PAD_X - 34}" y="${(baseY + 3).toFixed(1)}">${MONTHS[+key.slice(5) - 1]}</text>`;
    if (m === busiest.row && busiest.count > 0) {
      const step = innerW / (busiest.len - 1);
      const mx = PAD_X + busiest.idx * step;
      const my = baseY - vals[busiest.idx] * AMP;
      body += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3" fill="${ACCENT}"/>`;
      body += `<text x="${Math.min(mx + 9, W - 190).toFixed(1)}" y="${(my - 7).toFixed(1)}">BUSIEST · ${busiest.count} COMMITS</text>`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A year of commits rendered as terrain, one ridge per month">
<style>
  :root{--canvas:#0d1117;--ridge:#5a6572;--meta:#8b949e;--faint:#39424f}
  @media(prefers-color-scheme:light){:root{--canvas:#ffffff;--ridge:#6e7781;--meta:#57606a;--faint:#8c959f}}
  .occ{fill:var(--canvas)}
  .rg,.rl{fill:none;stroke:var(--ridge);stroke-width:1.3;stroke-dasharray:1;stroke-dashoffset:1;animation:d 1.6s ease-out forwards}
  .rl{stroke:${ACCENT};stroke-width:1.8}
  @keyframes d{to{stroke-dashoffset:0}}
  @media(prefers-reduced-motion:reduce){.rg,.rl{animation:none;stroke-dashoffset:0}}
  text{font:600 10px ui-monospace,Menlo,Consolas,monospace;letter-spacing:1.5px;fill:var(--meta)}
  .faint{fill:var(--faint);letter-spacing:1px}
</style>
${body}
<text class="faint" x="${PAD_X}" y="${H - 14}">01</text>
<text class="faint" x="${W - PAD_X - 14}" y="${H - 14}">31</text>
<text x="${W / 2}" y="${H - 14}" text-anchor="middle">365 DAYS · REDRAWN NIGHTLY · 00:00 UTC</text>
</svg>\n`;
}

const days = process.argv.includes('--demo') ? demoDays() : await fetchDays();
const svg = render(byMonth(days));
if (!svg.includes('</svg>') || (svg.match(/<path class="rg"|<path class="rl"/g) || []).length !== ROWS)
  throw new Error('render self-check failed');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/terrain.svg', svg);
console.log(`dist/terrain.svg written (${svg.length} bytes)`);
