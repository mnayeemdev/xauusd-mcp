// Stage 11B data-integrity audit (research only). Gold 15m (V3 snapshot), gold 1D (V4 snapshot), cross-asset 15m (this stage).
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const DIR = 'validation/next_edge_session';
const gold = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'));
const cross = JSON.parse(fs.readFileSync(`${DIR}/cross_asset_bars_15m.json`, 'utf8'));
const iso = (s) => new Date(s * 1000).toISOString();
function audit(name, bars, step) {
  const t = bars.map((b) => b.time ?? b[0]);
  let dup = 0, nonmono = 0, badGeom = 0, weekendBars = 0, gaps = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const o = b.open ?? b[1], h = b.high ?? b[2], l = b.low ?? b[3], c = b.close ?? b[4];
    if (!(h >= Math.max(o, c) && l <= Math.min(o, c))) badGeom++;
    const d = new Date(t[i] * 1000).getUTCDay(); if (d === 6 || (d === 0 && new Date(t[i] * 1000).getUTCHours() < 22)) weekendBars++;
    if (i) { if (t[i] === t[i - 1]) dup++; if (t[i] < t[i - 1]) nonmono++; const g = t[i] - t[i - 1]; if (g > step * 3 && !(d === 1 || d === 0)) gaps.push({ from: iso(t[i - 1]), to: iso(t[i]), hours: +(g / 3600).toFixed(1) }); }
  }
  gaps.sort((a, b) => b.hours - a.hours);
  return { bars: bars.length, first: iso(t[0]), last: iso(t[t.length - 1]), duplicates: dup, non_monotonic: nonmono, bad_geometry: badGeom, saturday_or_sunday_daytime_bars: weekendBars, non_weekend_gaps_over_3_bars: gaps.length, largest_gaps: gaps.slice(0, 5), sha256: createHash('sha256').update(JSON.stringify(bars.length + ':' + t[0] + ':' + t[t.length - 1])).digest('hex').slice(0, 16) };
}
const out = { generated_at: new Date().toISOString(), gold_15m: audit('XAUUSDm 15m', gold['15m'], 900), gold_1d: audit('XAUUSDm 1D', gold['1D'], 86400) };
for (const [s, bars] of Object.entries(cross.series)) out[s] = audit(s, bars, 900);
// alignment: share of gold 15m timestamps present in each cross series over the common range
const gset = new Set(gold['15m'].map((b) => b.time));
for (const [s, bars] of Object.entries(cross.series)) { const from = Math.max(bars[0][0], gold['15m'][0].time); const both = bars.filter((b) => b[0] >= from).map((b) => b[0]); const inGold = both.filter((t) => gset.has(t)).length; out[`${s}_alignment`] = { common_from: iso(from), cross_bars_in_range: both.length, matched_gold_timestamps: inGold, share: +(inGold / both.length).toFixed(4) }; }
// DST sanity: hour of the daily close gap by month (gold), summer vs winter
const gapHours = {}; const g = gold['15m']; for (let i = 1; i < g.length; i++) { const d = g[i].time - g[i - 1].time; if (d >= 3000 && d < 12 * 3600) { const m = new Date(g[i - 1].time * 1000).getUTCMonth(); const h = new Date(g[i - 1].time * 1000).getUTCHours(); (gapHours[m] ||= {})[h] = ((gapHours[m] ||= {})[h] || 0) + 1; } }
out.gold_daily_close_gap_start_hour_utc_by_month = Object.fromEntries(Object.entries(gapHours).map(([m, hs]) => [m, Object.entries(hs).sort((a, b) => b[1] - a[1])[0][0]]));
out.previously_inspected = { gold_15m: 'YES (V3 structure events, V5 news, V2 protection replay)', gold_1d: 'YES (V4)', DXYm: 'NO (fetched 2026-09-26 for this stage)', XAGUSDm: 'NO', USTECm: 'NO' };
fs.writeFileSync(`${DIR}/data_integrity.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
