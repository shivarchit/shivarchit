#!/usr/bin/env node
// CHANDIGARH NOCTURNE — a year of commits as a city at night.
// Each tower a month, each lit window a day, brightness = commits.
// Silent months are a sleeping district. The busiest night gets a rooftop
// searchlight. Live weather (Open-Meteo) draws the sky: moon, haze, or rain.
// A lava-blue Virtus crosses the street on a loop.
// Usage: node scripts/terrain.mjs [--demo]  → writes dist/terrain.svg

import { mkdirSync, writeFileSync } from 'node:fs';

const W = 720, H = 430, STREET = 330, PAD = 26;
const AMBER = '#F2AE4C', SILVER = '#C9D6E4', LAVA = '#2F6FC4';
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// time of day in Chandigarh decides the sky; the workflow re-renders on a cron
const phaseArg = process.argv.find(a => a.startsWith('--phase='))?.slice(8);
const now = new Date();
const istHour = (now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24;
const DAY_START = 8, DAY_END = 17; // shared by the phase split and the sun arc
const PHASE = phaseArg ||
  (istHour >= 5.5 && istHour < DAY_START ? 'dawn' : istHour >= DAY_START && istHour < DAY_END ? 'day'
    : istHour >= DAY_END && istHour < 19.5 ? 'dusk' : 'night');

const PALETTES = {
  night: { sky1: '#0A1626', sky2: '#13253E', sky3: '#1B3050', street1: '#0C1828', street2: '#060C16',
    tower: '#0A111C', darkwin: '#131E2E', haze: '#31517A', cloud: '#141F30', meta: '#8FA3BC',
    faint: '#5D7492', neon: '#F5D9A8', tag: '#EFD9B4' },
  dawn: { sky1: '#2B3550', sky2: '#6E5A70', sky3: '#C97F6E', street1: '#3A4258', street2: '#232A3A',
    tower: '#131C2C', darkwin: '#1E2A3E', haze: '#8A7A90', cloud: '#584A62', meta: '#D8DCE8',
    faint: '#9AA4BC', neon: '#F5D9A8', tag: '#F2E2D0' },
  day: { sky1: '#8FBADF', sky2: '#B8D4EA', sky3: '#D5E5F2', street1: '#7A93AC', street2: '#5C7288',
    tower: '#33475E', darkwin: '#3E5570', haze: '#E8EFF5', cloud: '#FFFFFF', meta: '#23364C',
    faint: '#41586F', neon: '#2B4258', tag: '#2B4258' },
  dusk: { sky1: '#3A2E4E', sky2: '#8A4A50', sky3: '#E08A55', street1: '#40384E', street2: '#262232',
    tower: '#1A1828', darkwin: '#282438', haze: '#8A6A70', cloud: '#55405C', meta: '#EAD8CC',
    faint: '#B09A94', neon: '#F5D9A8', tag: '#F5E4D4' },
};
const P = PALETTES[PHASE];

let seed = 47; // demo data only
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// decoration randomness keyed on stable strings, so silent-tower heights,
// stars, and flicker don't reshuffle every render as commit data changes
const h01 = s => {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};

const pulse = (hi, lo, dur) =>
  `<animate attributeName="opacity" values="${hi};${lo};${hi}" dur="${dur}s" repeatCount="indefinite"/>`;

// ---------- data ----------
async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const LOGIN = process.env.GITHUB_REPOSITORY_OWNER || 'shivarchit';

// one round-trip for both the calendar and the language split
async function fetchProfile() {
  const data = await gql(`query($login:String!){user(login:$login){
    contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}
    repositories(first:100, ownerAffiliations:OWNER, isFork:false){nodes{
      languages(first:5){edges{size node{name}}}}}}}`, { login: LOGIN });
  const days = data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays.map(d => ({ date: d.date, count: d.contributionCount })));
  const sizes = {};
  for (const repo of data.user.repositories.nodes)
    for (const e of repo.languages.edges) sizes[e.node.name] = (sizes[e.node.name] || 0) + e.size;
  const total = Object.values(sizes).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, size]) => ({ name, pct: Math.round(100 * size / total) }));
  return { days, langs };
}

async function fetchWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=30.73&longitude=76.78&current=temperature_2m,weather_code');
    const { current } = await res.json();
    const c = current.weather_code;
    const kind = c <= 1 ? 'clear' : c <= 3 ? 'cloudy' : (c === 45 || c === 48) ? 'haze'
      : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : 'rain';
    return { temp: Math.round(current.temperature_2m), kind };
  } catch { return null; } // weather is garnish — never fail the render over it
}

function demoDays() {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const silent = i < 150;
    let c = 0;
    if (!silent) c = rnd() < 0.10 ? Math.floor(5 + rnd() * 40) : rnd() < 0.35 ? Math.floor(1 + rnd() * 6) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count: c });
    d.setDate(d.getDate() + 1);
  }
  days[334].count = 243;
  return days;
}

function byMonth(days) {
  const map = new Map();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(day);
  }
  return [...map.entries()].slice(-12);
}

// ---------- render ----------
function render(rows, langs, weather) {
  const maxDay = Math.max(1, ...rows.flatMap(([, ds]) => ds.map(d => d.count)));
  const totals = rows.map(([, ds]) => ds.reduce((a, d) => a + d.count, 0));
  const maxTotal = Math.max(...totals, 1);

  const N = rows.length;
  const slot = (W - PAD * 2) / N, towerW = 40;
  // window grid geometry; the active-tower minimum height derives from it so a
  // 31-day month always fits and grid tweaks can't silently drop days
  const cols = 4, cw = 7, ch = 5, gx = (towerW - cols * cw) / (cols + 1), gy = 4;
  const minH = 14 + Math.ceil(31 / cols) * (ch + gy);
  let city = '', labels = '', burst = { c: -1 };

  rows.forEach(([key, ds], ti) => {
    const total = totals[ti], active = total > 0;
    const x = PAD + ti * slot + (slot - towerW) / 2;
    const h = active ? minH + 4 + 170 * Math.sqrt(total / maxTotal) : 34 + h01(key) * 26;
    const top = STREET - h;
    city += `<rect class="tw" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${towerW}" height="${h.toFixed(1)}"/>`;
    if (ti === N - 1) city += `<rect class="dawn" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="2" height="${h.toFixed(1)}" opacity="0.25"/>`;
    ds.forEach((day, d) => {
      // fill bottom-up: buildings light from the street; a young month keeps
      // dark floors above — under construction
      const col = d % cols, row = (d - col) / cols;
      const wx = x + gx + col * (cw + gx), wy = STREET - 10 - (row + 1) * (ch + gy);
      if (wy < top + 4) return;
      if (day.count > 0) {
        const o = 0.30 + 0.70 * Math.sqrt(day.count / maxDay);
        const flick = h01(day.date) < 0.12
          ? pulse(o.toFixed(2), (o * 0.45).toFixed(2), (3 + h01(day.date + 'd') * 4).toFixed(1)) : '';
        city += `<rect class="win" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${cw}" height="${ch}" opacity="${o.toFixed(2)}">${flick}</rect>`;
        if (day.count > burst.c) burst = { c: day.count, x: wx + cw / 2, y: wy + ch / 2, tx: x, th: h, date: day.date };
      } else {
        city += `<rect class="dark" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${cw}" height="${ch}"/>`;
      }
    });
    labels += `<text class="mo" x="${(x + towerW / 2).toFixed(1)}" y="${STREET + 16}" text-anchor="middle">${MONTHS[+key.slice(5) - 1]}</text>`;
  });

  // rooftop searchlight over the busiest tower; label pinned top-right sky
  let beacon = '';
  if (burst.c > 0) {
    const bd = new Date(burst.date + 'T00:00:00Z');
    const when = `${MONTHS[bd.getUTCMonth()]} ${String(bd.getUTCDate()).padStart(2, '0')}`;
    beacon = `
<rect x="${(burst.tx + towerW / 2 - 2).toFixed(1)}" y="26" width="4" height="${(STREET - burst.th - 26).toFixed(1)}" fill="url(#beam)" opacity="0.2">
  ${pulse(0.2, 0.08, 5)}
</rect>
<circle cx="${burst.x.toFixed(1)}" cy="${burst.y.toFixed(1)}" r="4.5" fill="#FFE3AC" filter="url(#glow)"/>
<text class="tag" x="${W - PAD}" y="46" text-anchor="end">${burst.c} COMMITS · ONE NIGHT</text>
<text class="tag dim" x="${W - PAD}" y="62" text-anchor="end">THE CITY DIDN'T SLEEP · ${when}</text>`;
  }

  // lava-blue Virtus, side profile, crossing on a loop (with reflection)
  const car = `
<g id="virtus">
  <path d="M2 8.6 C2 6.4 4 5.8 8.5 5.4 L14 2.6 C16.5 1.3 20 1 24 1.3 L30.5 2.3 C33.5 2.8 35.5 4 36.5 5.2 L42 6 C44.4 6.4 45 7.4 45 8.8 L45 10.6 L2 10.6 Z" fill="${LAVA}"/>
  <path d="M15.2 5.2 L18 2.9 C20 1.9 23 1.8 26 2.1 L30 2.7 C32 3.1 33.6 4.2 34.4 5.2 Z" fill="#0E1A2C" opacity="0.85"/>
  <line x1="26.4" y1="2" x2="26.4" y2="5.2" stroke="${LAVA}" stroke-width="0.8"/>
  <circle cx="11" cy="10.6" r="2.9" fill="#080D14"/><circle cx="11" cy="10.6" r="1.1" fill="#3A4A5E"/>
  <circle cx="36" cy="10.6" r="2.9" fill="#080D14"/><circle cx="36" cy="10.6" r="1.1" fill="#3A4A5E"/>
  <rect x="44" y="7" width="1.6" height="1.6" fill="#FFE9B0"/>
  <rect x="1.4" y="7" width="1.4" height="1.4" fill="#E0523E"/>
  <polygon points="45.6,7 68,5.4 68,10.2 45.6,9.4" fill="url(#headlight)"/>
</g>`;
  const carRun = `
<g filter="url(#glow)"><g>
  <animateTransform attributeName="transform" type="translate" from="-80 ${STREET - 13}" to="${W + 30} ${STREET - 13}" dur="12s" begin="-5s" repeatCount="indefinite"/>
  <use href="#virtus"/>
  <use href="#virtus" transform="translate(0 22.2) scale(1 -1)" opacity="0.18"/>
</g></g>`;

  // sky = phase (time of day) + weather
  const kind = weather?.kind ?? 'haze';
  let reflOpacity = PHASE === 'day' ? 0.10 : 0.16;

  // puffy cloud: overlapping soft ellipses with a slow drift
  const cloud = (cx, cy, s, drift) => `<g transform="translate(${cx} ${cy}) scale(${s})" fill="var(--cloud)" filter="url(#cloudblur)" opacity="0.75">
    <animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;${drift} 0;0 0" dur="47s" repeatCount="indefinite"/>
    <ellipse cx="0" cy="0" rx="34" ry="10"/><ellipse cx="-22" cy="3" rx="18" ry="7"/><ellipse cx="20" cy="2" rx="22" ry="8"/>
    <ellipse cx="-6" cy="-8" rx="16" ry="8"/><ellipse cx="12" cy="-5" rx="13" ry="6"/></g>`;

  // sun rides an arc through the day; moon holds the night sky
  let sky = '';
  if (PHASE === 'night') {
    sky = `<circle cx="300" cy="60" r="13" fill="#E8EDF4" opacity="${kind === 'clear' ? 0.85 : 0.5}" filter="url(#moonglow)"/>`;
    if (kind === 'clear') for (let i = 0; i < 22; i++) {
      const sx = PAD + h01(`sx${i}`) * (W - PAD * 2), sy = 24 + h01(`sy${i}`) * 120, so = 0.25 + h01(`so${i}`) * 0.5;
      sky += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="0.9" fill="#DCE6F2" opacity="${so.toFixed(2)}">${
        h01(`tw${i}`) < 0.3 ? pulse(so.toFixed(2), 0.1, (2 + h01(`td${i}`) * 4).toFixed(1)) : ''}</circle>`;
    }
  } else {
    const t = PHASE === 'dawn' ? 0.06 : PHASE === 'dusk' ? 0.94
      : Math.min(0.9, Math.max(0.1, (istHour - DAY_START) / (DAY_END - DAY_START)));
    const sx = PAD + 40 + t * (W - PAD * 2 - 80);
    const sy = 150 - 105 * Math.sin(Math.PI * t);
    const sunCol = PHASE === 'day' ? '#FFD98A' : PHASE === 'dawn' ? '#FFC08A' : '#FF9E5C';
    const sunOp = kind === 'clear' ? 0.95 : kind === 'haze' ? 0.6 : 0.35;
    sky = `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="15" fill="${sunCol}" opacity="${sunOp}" filter="url(#moonglow)"/>`;
  }

  if (kind === 'cloudy') {
    sky += cloud(250, 70, 1.1, 26) + cloud(470, 102, 0.85, -20) + cloud(602, 55, 0.7, 18);
  } else if (kind === 'haze') {
    sky += `<rect x="0" y="150" width="${W}" height="70" fill="url(#haze)" opacity="0.5"/>`;
  } else if (kind === 'rain' || kind === 'snow') {
    reflOpacity = 0.22;
    sky += cloud(230, 60, 1.15, 20) + cloud(500, 82, 0.95, -18);
    const drop = kind === 'snow' ? { len: 3, w: 1.4, col: '#D8E2EE', dur: 3.2 } : { len: 11, w: 0.9, col: '#7FA0C8', dur: 1.1 };
    let lines = '';
    for (let i = 0; i < 46; i++) {
      const rx = h01(`rx${i}`) * W, ry = h01(`ry${i}`) * H;
      lines += `<line x1="${rx.toFixed(1)}" y1="${ry.toFixed(1)}" x2="${(rx - 2).toFixed(1)}" y2="${(ry + drop.len).toFixed(1)}" stroke="${drop.col}" stroke-width="${drop.w}" opacity="0.35"/>`;
    }
    sky += `<g><animateTransform attributeName="transform" type="translate" from="0 -${H}" to="0 0" dur="${drop.dur}s" repeatCount="indefinite"/>${lines}
      <g transform="translate(0 -${H})">${lines}</g></g>`;
  }

  const header = weather
    ? `CHANDIGARH · ${weather.temp}°C · ${kind.toUpperCase()} · ${PHASE.toUpperCase()}`
    : `CHANDIGARH · ${PHASE.toUpperCase()}`;

  const LANG_COLORS = [AMBER, '#E88A6A', '#9BC0A0', '#B4A0D8'];
  // only names whose short form differs from the first-two-letters fallback
  const SHORT = { TypeScript: 'TS', JavaScript: 'JS', Rust: 'RS', HTML: 'HTML', CSS: 'CSS' };
  const signW = 64;
  const signs = langs.map((l, i) => {
    const sx = W - PAD - (langs.length - i) * (signW + 10);
    const col = LANG_COLORS[i % LANG_COLORS.length];
    const name = SHORT[l.name] || l.name.slice(0, 2).toUpperCase();
    return `<rect x="${sx}" y="${STREET + 26}" width="${signW}" height="20" rx="3" fill="none" stroke="${col}" stroke-opacity="0.55"/>
<text class="sign" x="${sx + signW / 2}" y="${STREET + 39.5}" text-anchor="middle" fill="${col}">${name} ${l.pct}%</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A year of commits as a city at night: each tower a month, each lit window a day">
<style>
  :root{--sky1:${P.sky1};--sky2:${P.sky2};--sky3:${P.sky3};--street1:${P.street1};--street2:${P.street2};--haze:${P.haze};
        --tower:${P.tower};--darkwin:${P.darkwin};--cloud:${P.cloud};--meta:${P.meta};--faint:${P.faint}}
  .tw{fill:var(--tower)}.dark{fill:var(--darkwin)}.win{fill:${AMBER}}
  .dawn{fill:${SILVER}}
  text{font:600 11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:1.6px;fill:var(--meta)}
  .neon{font-size:15px;letter-spacing:7px;fill:${P.neon}}
  .tag{font-size:10px;fill:${P.tag}}.dim{opacity:0.6}
  .mo{font-size:8px;fill:var(--faint);letter-spacing:1px}
  .sign{font-size:9px;letter-spacing:1px}
  .cap{font-size:9px;fill:var(--faint)}
  .temp{font-size:10px}
</style>
<defs>
  <linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--sky1)"/><stop offset="0.72" stop-color="var(--sky2)"/><stop offset="1" stop-color="var(--sky3)"/>
  </linearGradient>
  <linearGradient id="wet" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--street1)"/><stop offset="1" stop-color="var(--street2)"/>
  </linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFE3AC" stop-opacity="0"/><stop offset="1" stop-color="#FFE3AC" stop-opacity="0.55"/>
  </linearGradient>
  <linearGradient id="headlight" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#FFE9B0" stop-opacity="0.35"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="var(--haze)" stop-opacity="0"/><stop offset="0.5" stop-color="var(--haze)" stop-opacity="0.6"/><stop offset="1" stop-color="var(--haze)" stop-opacity="0"/>
  </linearGradient>
  <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="moonglow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="ripple"><feGaussianBlur stdDeviation="0.8 2.4"/></filter>
  <filter id="cloudblur" x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="3"/></filter>
  <clipPath id="streetclip"><rect x="0" y="${STREET}" width="${W}" height="${H - STREET}"/></clipPath>
  ${car}
</defs>
<rect width="${W}" height="${H}" fill="url(#skyg)"/>
${sky}
<text class="neon" x="${PAD}" y="52" filter="url(#glow)">SHIVARCHIT</text>
<text class="temp" x="${PAD}" y="74">${header}</text>
<rect x="0" y="${STREET}" width="${W}" height="${H - STREET}" fill="url(#wet)"/>
<g clip-path="url(#streetclip)">
  <g transform="translate(0 ${STREET * 2}) scale(1 -1)" opacity="${reflOpacity}" filter="url(#ripple)">${city}</g>
</g>
<rect x="0" y="${STREET}" width="${W}" height="1.2" fill="#2A3A50" opacity="0.9"/>
${city}
${carRun}
${beacon}
${labels}
${signs}
<text class="cap" x="${PAD}" y="${H - 12}">EACH TOWER A MONTH · EACH LIT WINDOW A DAY · SKY FOLLOWS CHANDIGARH, HOURLY</text>
</svg>\n`;
}

// ---------- main ----------
const demo = process.argv.includes('--demo');
const [profile, weather] = await Promise.all([
  demo
    ? { days: demoDays(), langs: [{ name: 'TypeScript', pct: 62 }, { name: 'Python', pct: 21 }, { name: 'Go', pct: 9 }] }
    : fetchProfile(),
  fetchWeather(),
]);
const rows = byMonth(profile.days);
const svg = render(rows, profile.langs, weather);
// city block appears twice (skyline + reflection)
if (!svg.includes('</svg>') || (svg.match(/class="tw"/g) || []).length !== rows.length * 2)
  throw new Error('render self-check failed');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/terrain.svg', svg);
console.log(`dist/terrain.svg written (${svg.length} bytes, weather: ${weather ? weather.kind : 'unavailable'})`);
