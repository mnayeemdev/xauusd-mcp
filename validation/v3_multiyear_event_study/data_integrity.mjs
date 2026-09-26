// Data integrity scan for the multi-year snapshot (research only).
import { readFileSync, writeFileSync } from 'node:fs';
const D = JSON.parse(readFileSync(new URL('./xauusdm_multiyear_bars.json', import.meta.url), 'utf8'));
const iso = (t) => new Date(t * 1000).toISOString();
const out = {};
for (const [tf, bars] of Object.entries(D)) {
  const sec = { '5m': 300, '15m': 900, '1H': 3600, '1D': 86400 }[tf];
  let dup = 0, nonMono = 0, badGeom = 0; const gaps = []; const closeHourByYear = {};
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1], b = bars[i];
    if (b.time === a.time) dup++; if (b.time < a.time) nonMono++;
    if (!(b.high >= b.low && b.high >= b.open && b.high >= b.close && b.low <= b.open && b.low <= b.close)) badGeom++;
    const d = b.time - a.time;
    if (d > sec) { const dt = new Date(a.time * 1000); const wd = dt.getUTCDay(); const weekend = (wd === 5 && dt.getUTCHours() >= 20) || wd === 6 || (wd === 0); if (!weekend && d > 2 * sec + 3600) gaps.push({ from: iso(a.time), to: iso(b.time), hours: +(d / 3600).toFixed(1) }); if (!weekend && tf !== '1D') { const y = dt.getUTCFullYear(); const h = dt.getUTCHours(); (closeHourByYear[y] ??= {}); closeHourByYear[y][h] = (closeHourByYear[y][h] || 0) + 1; } }
  }
  const sessionClose = Object.fromEntries(Object.entries(closeHourByYear).map(([y, m]) => [y, Object.entries(m).sort((x, z) => z[1] - x[1]).slice(0, 2).map(([h, c]) => `${h}:00 x${c}`).join(', ')]));
  out[tf] = { bars: bars.length, from: iso(bars[0].time), to: iso(bars.at(-1).time), duplicates: dup, non_monotonic: nonMono, bad_geometry: badGeom, non_weekend_gaps_over_2bars_plus_1h: gaps.length, largest_gaps: gaps.sort((x, z) => z.hours - x.hours).slice(0, 8), daily_close_gap_start_hour_by_year: sessionClose, bars_per_year: Object.fromEntries(Object.entries(bars.reduce((m, b) => { const y = new Date(b.time * 1000).getUTCFullYear(); m[y] = (m[y] || 0) + 1; return m; }, {}))) };
}
writeFileSync(new URL('./v3_data_integrity.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
