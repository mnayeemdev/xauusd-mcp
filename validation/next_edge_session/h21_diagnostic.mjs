// Descriptive failure diagnosis of the single discovery candidate S5H:H21 (long during the last London hour before
// the Exness daily close, 8-bar horizon) on DISCOVERY + VALIDATION only (holdout never opened). Research only.
import fs from 'node:fs';
const gold = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'));
const B = gold['15m'].map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }));
const ATR = new Array(B.length).fill(null); { let sum = 0; const q = []; for (let i = 1; i < B.length; i++) { const tr = Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); q.push(tr); sum += tr; if (q.length > 14) sum -= q.shift(); if (q.length === 14) ATR[i] = sum / 14; } }
function lastSunday(y, m0) { const d = new Date(Date.UTC(y, m0 + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
const lonOff = (ms) => { const y = new Date(ms).getUTCFullYear(); return ms >= Date.UTC(y, 2, lastSunday(y, 2), 1) && ms < Date.UTC(y, 9, lastSunday(y, 9), 1) ? 1 : 0; };
const lonHour = (t) => new Date(t * 1000 + lonOff(t * 1000) * 3600_000).getUTCHours();
const dateOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const REG = { DISCOVERY: ['2022-09-05', '2024-06-30'], VALIDATION: ['2024-07-01', '2025-08-31'] };
const SWAP_LONG_USD = 0.55, REOPEN_SPREAD_USD = 1.5, SPREAD = 0.26;
const out = {};
for (const [reg, [a, b]] of Object.entries(REG)) {
  const rows = [];
  for (let i = 15; i < B.length - 9; i++) { const d = dateOf(B[i].t); if (d < a || d > b) continue; const wd = new Date(B[i].t * 1000).getUTCDay(); if (wd === 0 || wd === 6) continue; if (lonHour(B[i].t) !== 21 || !ATR[i]) continue;
    const atr = ATR[i]; let gapBars = 0, gapMove = 0, intra = 0; for (let k = 1; k <= 8; k++) { const dt = B[i + k].t - B[i + k - 1].t; const mv = B[i + k].c - B[i + k - 1].c; if (dt > 900) { gapBars++; gapMove += B[i + k].o - B[i + k - 1].c; intra += B[i + k].c - B[i + k].o; } else intra += mv; }
    const total = (B[i + 8].c - B[i].c) / atr; const crossesClose = gapBars > 0;
    rows.push({ total, gap: gapMove / atr, intra: intra / atr, crossesClose, swap: crossesClose ? SWAP_LONG_USD / atr : 0, reopenSpread: crossesClose ? REOPEN_SPREAD_USD / atr : 0, spread: SPREAD / atr, atr, year: d.slice(0, 4), slot: new Date(B[i].t * 1000 + lonOff(B[i].t * 1000) * 3600_000).getUTCMinutes() });
  }
  const mean = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
  const byYear = {}; for (const r of rows) (byYear[r.year] ??= []).push(r.total);
  const bySlot = {}; for (const r of rows) (bySlot[r.slot] ??= []).push(r.total);
  out[reg] = { n: rows.length, share_crossing_close: +mean(rows.map((r) => (r.crossesClose ? 1 : 0))).toFixed(3), mean_total_atr: +mean(rows.map((r) => r.total)).toFixed(3), mean_close_to_reopen_gap_atr: +mean(rows.map((r) => r.gap)).toFixed(3), mean_intra_session_atr: +mean(rows.map((r) => r.intra)).toFixed(3), mean_atr_usd: +mean(rows.map((r) => r.atr)).toFixed(2), net_spread_only: +mean(rows.map((r) => r.total - r.spread)).toFixed(3), net_spread_swap: +mean(rows.map((r) => r.total - r.spread - r.swap)).toFixed(3), net_spread_swap_reopen_spread: +mean(rows.map((r) => r.total - r.spread - r.swap - r.reopenSpread)).toFixed(3), by_year: Object.fromEntries(Object.entries(byYear).map(([y, v]) => [y, { n: v.length, mean: +mean(v).toFixed(3) }])), by_15m_slot: Object.fromEntries(Object.entries(bySlot).map(([s, v]) => [s, { n: v.length, mean: +mean(v).toFixed(3) }])) };
}
fs.writeFileSync('validation/next_edge_session/h21_diagnostic.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
