// Stage 11B next-edge research (research only; nothing here is imported by production).
// Implements docs/XAUUSD_NEXT_EDGE_RESEARCH_PROTOCOL.md. Phases are gated by files:
//   --phase discovery   -> discovery_results.json (+ frozen_candidates.json when candidates pass)
//   --phase validation  -> requires frozen_candidates.json; validation_results.json (+ validation_pass_<c>.json)
//   --phase holdout     -> requires validation_pass_*.json; holdout_results.json
//   --phase robustness  -> survivors only; robustness_results.json
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isEDT } from '../v5_news_edge/et_time.mjs';

const DIR = 'validation/next_edge_session';
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) ?? '--phase=discovery').split('=')[1];
const REG = { DISCOVERY: ['2022-09-05', '2024-06-30'], VALIDATION: ['2024-07-01', '2025-08-31'], HOLDOUT: ['2025-09-01', '2026-09-25'] };
const P = { orBars: 2, lonScanEnd: 12 * 60, nyScanEnd: 13 * 60, s3Atr: 4, s4Sessions: true, dz: 1.5, sigmaWin: 96, horizons: [4, 8, 16], cost: 0.26, costStress: 0.40, slip: 0.10 };
const H = P.horizons;

// ---------- data ----------
const gold = JSON.parse(fs.readFileSync('validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json', 'utf8'));
const B = gold['15m'].map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }));
const D1 = gold['1D'].map((b) => ({ t: b.time, h: b.high, l: b.low }));
const cross = JSON.parse(fs.readFileSync(`${DIR}/cross_asset_bars_15m.json`, 'utf8')).series;
const idx = new Map(B.map((b, i) => [b.t, i]));
const ATR = new Array(B.length).fill(null);
{ let sum = 0; const q = []; for (let i = 1; i < B.length; i++) { const tr = Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); q.push(tr); sum += tr; if (q.length > 14) sum -= q.shift(); if (q.length === 14) ATR[i] = sum / 14; } }

// ---------- clocks ----------
function lastSunday(year, month0) { const d = new Date(Date.UTC(year, month0 + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
function londonOffsetH(ms) { const y = new Date(ms).getUTCFullYear(); const a = Date.UTC(y, 2, lastSunday(y, 2), 1), b = Date.UTC(y, 9, lastSunday(y, 9), 1); return ms >= a && ms < b ? 1 : 0; }
function nyOffsetH(ms) { const d = new Date(ms); return isEDT(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()) ? -4 : -5; }
const lon = (t) => { const ms = t * 1000 + londonOffsetH(t * 1000) * 3600_000; const d = new Date(ms); return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.toISOString().slice(0, 10), wd: d.getUTCDay(), hour: d.getUTCHours() }; };
const ny = (t) => { const ms = t * 1000 + nyOffsetH(t * 1000) * 3600_000; const d = new Date(ms); return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.toISOString().slice(0, 10) }; };
const dateOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const regionOf = (t) => { const d = dateOf(t); return Object.entries(REG).find(([, [a, b]]) => d >= a && d <= b)?.[0] ?? null; };

// ---------- drift per region (mean per-bar move in ATR units) ----------
const drift = {};
for (const r of Object.keys(REG)) { let s = 0, n = 0; for (let i = 15; i < B.length - 1; i++) if (regionOf(B[i].t) === r && ATR[i]) { s += (B[i + 1].c - B[i].c) / ATR[i]; n++; } drift[r] = { per_bar_atr: s / n, bars: n }; }

// ---------- day groups (London day) ----------
const days = new Map();
for (let i = 15; i < B.length; i++) { const L = lon(B[i].t); if (L.wd === 0 || L.wd === 6) continue; (days.get(L.day) ?? days.set(L.day, []).get(L.day)).push(i); }

// ---------- families: each returns events [{i, dir, day, family, side}] ----------
function orBreak(fam, clock, orStartMin, scanEndMin, orBars) {
  const ev = [];
  for (const [day, ids] of days) {
    const orIds = ids.filter((i) => { const m = clock(B[i].t).min; return m >= orStartMin && m < orStartMin + 15 * orBars; });
    if (orIds.length !== orBars) continue;
    const hi = Math.max(...orIds.map((i) => B[i].h)), lo = Math.min(...orIds.map((i) => B[i].l));
    for (const i of ids) { const m = clock(B[i].t).min; if (m < orStartMin + 15 * orBars || m >= scanEndMin) continue; if (B[i].c > hi) { ev.push({ i, dir: 1, day, family: fam, side: 'BUY' }); break; } if (B[i].c < lo) { ev.push({ i, dir: -1, day, family: fam, side: 'SELL' }); break; } }
  }
  return ev;
}
function asiaBreak(scanEnd = P.lonScanEnd) {
  const ev = [];
  for (const [day, ids] of days) {
    const asia = ids.filter((i) => lon(B[i].t).min < 8 * 60); if (asia.length < 16) continue;
    const hi = Math.max(...asia.map((i) => B[i].h)), lo = Math.min(...asia.map((i) => B[i].l));
    for (const i of ids) { const m = lon(B[i].t).min; if (m < 8 * 60 || m >= scanEnd) continue; if (B[i].c > hi) { ev.push({ i, dir: 1, day, family: 'S2', side: 'BUY' }); break; } if (B[i].c < lo) { ev.push({ i, dir: -1, day, family: 'S2', side: 'SELL' }); break; } }
  }
  return ev;
}
function transition(thr = P.s3Atr) { // returns events with explicit outcome (NY leg) instead of horizons
  const ev = [];
  for (const [day, ids] of days) {
    const lonOpen = ids.find((i) => lon(B[i].t).min >= 8 * 60); const beforeNy = ids.filter((i) => ny(B[i].t).min < 9 * 60 + 30 && lon(B[i].t).min >= 8 * 60).at(-1); const nyClose = ids.filter((i) => ny(B[i].t).min < 16 * 60).at(-1);
    if (lonOpen == null || beforeNy == null || nyClose == null || nyClose <= beforeNy || !ATR[beforeNy]) continue;
    const leg = B[beforeNy].c - B[lonOpen].o; if (Math.abs(leg) < thr * ATR[beforeNy]) continue;
    const dir = Math.sign(leg); const bars = nyClose - beforeNy;
    ev.push({ i: beforeNy, dir, day, family: 'S3', side: dir > 0 ? 'BUY' : 'SELL', fixed: { move: dir * (B[nyClose].c - B[beforeNy].c) / ATR[beforeNy], bars } });
  }
  return ev;
}
function pdLevels() {
  const ev = []; const d1 = new Map(D1.map((b, k) => [dateOf(b.t), k]));
  for (const [day, ids] of days) {
    const utcDay = dateOf(B[ids[0]].t); const k = d1.get(utcDay); if (k == null || k === 0) continue; const pdh = D1[k - 1].h, pdl = D1[k - 1].l;
    let up = null, dn = null;
    for (const i of ids) { const inSess = (lon(B[i].t).min >= 8 * 60 && lon(B[i].t).min < 16 * 60 + 30) || (ny(B[i].t).min >= 9 * 60 + 30 && ny(B[i].t).min < 16 * 60); if (!inSess) continue; if (up == null && B[i].h >= pdh) up = i; if (dn == null && B[i].l <= pdl) dn = i; }
    if (up != null) ev.push({ i: up, dir: 1, day, family: 'S4', side: 'BUY' }); if (dn != null) ev.push({ i: dn, dir: -1, day, family: 'S4', side: 'SELL' });
  }
  return ev;
}
function seasonality() { const ev = []; for (const [day, ids] of days) for (const i of ids) { const L = lon(B[i].t); ev.push({ i, dir: 1, day, family: 'S5H', side: `H${String(L.hour).padStart(2, '0')}` }); ev.push({ i, dir: 1, day, family: 'S5W', side: `W${L.wd}` }); } return ev; }
function crossLead(sym, fam, sign, z0 = P.dz) {
  const s = cross[sym]; if (!s) return []; const ev = []; const r = new Map(); const win = [];
  for (let k = 1; k < s.length; k++) { const lr = Math.log(s[k][4] / s[k - 1][4]); win.push(lr); if (win.length > P.sigmaWin) win.shift(); if (win.length < P.sigmaWin) continue; const m = win.reduce((a, b) => a + b, 0) / win.length; const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / win.length); if (sd > 0) r.set(s[k][0], lr / sd); }
  for (const [t, z] of r) { if (Math.abs(z) < z0) continue; const i = idx.get(t); if (i == null || !ATR[i]) continue; const L = lon(t); if (L.wd === 0 || L.wd === 6) continue; const dir = sign * Math.sign(z); ev.push({ i, dir, day: L.day, family: fam, side: dir > 0 ? 'BUY' : 'SELL' }); }
  return ev;
}
function contemporaneousBeta(sym, region) { const s = cross[sym]; const m = new Map(s.map((b, k) => [b[0], k])); let sxy = 0, sxx = 0, n = 0, syy = 0; for (let i = 15; i < B.length; i++) { const k = m.get(B[i].t); if (k == null || k === 0 || regionOf(B[i].t) !== region) continue; const x = Math.log(s[k][4] / s[k - 1][4]), y = Math.log(B[i].c / B[i - 1].c); sxy += x * y; sxx += x * x; syy += y * y; n++; } return { n, beta: +(sxy / sxx).toFixed(3), corr: +(sxy / Math.sqrt(sxx * syy)).toFixed(3) }; }

const FAMILIES = () => [
  ...orBreak('S1L', lon, 8 * 60, P.lonScanEnd, P.orBars), ...orBreak('S1N', ny, 9 * 60 + 30, P.nyScanEnd, P.orBars), ...asiaBreak(), ...transition(), ...pdLevels(), ...seasonality(),
  ...crossLead('DXYm', 'D1', -1), ...crossLead('XAGUSDm', 'D2', 1), ...crossLead('USTECm', 'D3', 1),
];

// ---------- outcome measurement ----------
function measure(e, region, { delay = 0 } = {}) {
  const i0 = e.i + delay; if (i0 + 16 >= B.length || !ATR[e.i]) return null; const a = ATR[e.i], p0 = B[i0].c; const d = drift[region].per_bar_atr;
  const m = { atr: a, cost_atr: P.cost / a, cost_stress_atr: P.costStress / a, slip_atr: P.slip / a, year: dateOf(B[e.i].t).slice(0, 4), day: e.day };
  if (e.fixed) { m.ex = { 8: e.fixed.move - e.dir * d * e.fixed.bars }; m.ex[4] = m.ex[8]; m.ex[16] = m.ex[8]; m.bars = e.fixed.bars; }
  else for (const h of H) m.ex ??= {}, m.ex[h] = e.dir * ((B[i0 + h].c - p0) / a) - e.dir * d * h * Math.sign(e.dir) * e.dir; // excess = dir*move - dir*drift*h
  // path on 8 bars (or fixed leg)
  const span = e.fixed ? e.fixed.bars : 8; let mfe = 0, mae = 0, first = null;
  for (let k = 1; k <= Math.min(span, 16); k++) { const b = B[i0 + k]; if (!b) break; const up = (b.h - p0) / a, dn = (p0 - b.l) / a; const fav = e.dir > 0 ? up : dn, adv = e.dir > 0 ? dn : up; mfe = Math.max(mfe, fav); mae = Math.max(mae, adv); if (first == null) { if (adv >= 0.5 && fav >= 0.5) first = 'BOTH'; else if (fav >= 0.5) first = 'FAV'; else if (adv >= 0.5) first = 'ADV'; } }
  m.mfe = mfe; m.mae = mae; m.first = first; return m;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length; const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; }; const r3 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(3));
let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function bootDays(rows, key, R = 2000) { const byDay = new Map(); for (const r of rows) (byDay.get(r.m.day) ?? byDay.set(r.m.day, []).get(r.m.day)).push(r); const ds = [...byDay.values()]; const out = []; for (let k = 0; k < R; k++) { let s = 0, n = 0; for (let j = 0; j < ds.length; j++) { const g = ds[Math.floor(rnd() * ds.length)]; for (const r of g) { s += key(r); n++; } } out.push(s / n); } out.sort((a, b) => a - b); return { lo: out[Math.floor(0.025 * R)], hi: out[Math.floor(0.975 * R)], lo99: out[Math.floor(0.005 * R)], hi99: out[Math.floor(0.995 * R)], p_le_0: out.filter((v) => v <= 0).length / R }; }
function summarize(rows) {
  if (!rows.length) return null; const S = { n: rows.length, days: new Set(rows.map((r) => r.m.day)).size, h: {} };
  for (const h of H) { const v = rows.map((r) => r.m.ex[h]); const b = bootDays(rows, (r) => r.m.ex[h]); S.h[h] = { mean: r3(mean(v)), median: r3(median(v)), ci95: [r3(b.lo), r3(b.hi)], ci99: [r3(b.lo99), r3(b.hi99)], p_le_0: r3(b.p_le_0), p_win: r3(v.filter((x) => x > 0).length / v.length), net_026: r3(mean(rows.map((r) => r.m.ex[h] - r.m.cost_atr))), net_040: r3(mean(rows.map((r) => r.m.ex[h] - r.m.cost_stress_atr))) }; }
  const v8 = rows.map((r) => r.m.ex[8]); const pos = v8.filter((x) => x > 0).reduce((a, b) => a + b, 0), neg = -v8.filter((x) => x < 0).reduce((a, b) => a + b, 0); S.pf8 = r3(neg ? pos / neg : null);
  S.mfe = r3(mean(rows.map((r) => r.m.mfe))); S.mae = r3(mean(rows.map((r) => r.m.mae))); S.mfe_mae = r3(S.mfe / S.mae); const f = rows.map((r) => r.m.first).filter((x) => x === 'FAV' || x === 'ADV'); S.p_plus05_first = r3(f.filter((x) => x === 'FAV').length / (f.length || 1)); S.first_n = f.length;
  const sorted = [...v8].sort((a, b) => b - a); S.no_top1 = r3(mean(sorted.slice(1))); S.no_top3 = r3(mean(sorted.slice(3))); S.no_top5 = r3(mean(sorted.slice(5))); const q = [...v8].sort((a, b) => a - b); const lo = q[Math.floor(0.05 * q.length)], hi = q[Math.floor(0.95 * q.length)]; S.winsor = r3(mean(v8.map((x) => Math.min(hi, Math.max(lo, x)))));
  const years = {}; for (const r of rows) (years[r.m.year] ??= []).push(r.m.ex[8]); S.by_year = Object.fromEntries(Object.entries(years).map(([y, v]) => [y, { n: v.length, mean: r3(mean(v)) }])); const yy = Object.values(S.by_year).filter((x) => x.n >= 20); S.pos_year_share = yy.length ? r3(yy.filter((x) => x.mean > 0).length / yy.length) : null;
  const sides = {}; for (const r of rows) (sides[r.e.side] ??= []).push(r.m.ex[8]); S.by_side = Object.fromEntries(Object.entries(sides).map(([s, v]) => [s, { n: v.length, mean: r3(mean(v)) }]));
  const atrs = rows.map((r) => r.m.atr).sort((a, b) => a - b); const t1 = atrs[Math.floor(atrs.length / 3)], t2 = atrs[Math.floor(2 * atrs.length / 3)]; const vol = { LOW: [], MID: [], HIGH: [] }; for (const r of rows) (r.m.atr <= t1 ? vol.LOW : r.m.atr <= t2 ? vol.MID : vol.HIGH).push(r.m.ex[8]); S.by_vol = Object.fromEntries(Object.entries(vol).map(([k, v]) => [k, { n: v.length, mean: r3(v.length ? mean(v) : null) }]));
  return S;
}
function gateDiscovery(S, fam) {
  const minN = fam === 'S3' ? 60 : fam.startsWith('S5') ? 300 : 100; const g = { pass: false, reasons: [] };
  if (!S || S.n < minN) { g.reasons.push(`N ${S?.n ?? 0} < ${minN}`); return g; }
  const key = fam.startsWith('S5') ? 'ci99' : 'ci95'; const posH = H.filter((h) => S.h[h].mean > 0 && S.h[h][key][0] > 0); g.horizons = posH;
  if (fam === 'S3') { if (!(S.h[8].mean > 0 && S.h[8][key][0] > 0)) g.reasons.push('S3 NY-leg excess CI includes 0'); } else if (posH.length < 2) g.reasons.push(`positive CI-excluding horizons ${posH.length} < 2`);
  if (!(S.p_plus05_first >= 0.53)) g.reasons.push(`P(+0.5 first) ${S.p_plus05_first}`); if (!(S.mfe_mae >= 1.1)) g.reasons.push(`MFE/MAE ${S.mfe_mae}`); if (!(S.h[8].net_026 > 0)) g.reasons.push(`cost-net h8 ${S.h[8].net_026}`); if (!(S.pos_year_share >= 0.6)) g.reasons.push(`years ${S.pos_year_share}`); if (!(S.no_top5 > 0)) g.reasons.push(`no-top5 ${S.no_top5}`);
  g.pass = g.reasons.length === 0; return g;
}
function gateValidation(S, fam, disc) {
  const minN = fam === 'S3' ? 25 : 40; const g = { pass: false, reasons: [] }; if (!S || S.n < minN) { g.reasons.push(`N ${S?.n ?? 0} < ${minN}`); return g; }
  const hs = fam === 'S3' ? [8] : disc.gate.horizons.slice(0, 2); for (const h of hs) if (!(S.h[h].mean > 0)) g.reasons.push(`h${h} sign`);
  const need = Math.max(0.10, 0.5 * disc.stats.h[8].mean); if (!(S.h[8].mean >= need)) g.reasons.push(`h8 ${S.h[8].mean} < ${r3(need)}`); if (!(S.h[8].ci95[0] > -0.05)) g.reasons.push(`ci lower ${S.h[8].ci95[0]}`); if (!(S.no_top3 > 0)) g.reasons.push(`no-top3 ${S.no_top3}`); if (!(S.h[8].net_026 > 0)) g.reasons.push('cost-net'); if (!(S.pos_year_share >= 0.5)) g.reasons.push(`years ${S.pos_year_share}`);
  g.pass = g.reasons.length === 0; return g;
}
function candidatesFrom(events, region) {
  const groups = new Map();
  for (const e of events) { const key = e.family.startsWith('S5') ? `${e.family}:${e.side}` : (['S1L', 'S1N', 'S2', 'S4', 'D1', 'D2', 'D3'].includes(e.family) ? `${e.family}:${e.side}` : e.family); if (regionOf(B[e.i].t) !== region) continue; const m = measure(e, region); if (!m) continue; (groups.get(key) ?? groups.set(key, []).get(key)).push({ e, m }); }
  // pooled symmetric versions for the two-sided families
  for (const fam of ['S1L', 'S1N', 'S2', 'S4', 'D1', 'D2', 'D3']) { const both = [...(groups.get(`${fam}:BUY`) ?? []), ...(groups.get(`${fam}:SELL`) ?? [])]; if (both.length) groups.set(`${fam}:BOTH`, both); }
  const out = {}; for (const [key, rows] of groups) out[key] = { stats: summarize(rows), rows };
  return out;
}

// ---------- phases ----------
const events = FAMILIES();
if (PHASE === 'discovery') {
  const C = candidatesFrom(events, 'DISCOVERY'); const results = { generated_at: new Date().toISOString(), region: REG.DISCOVERY, params: P, drift, betas: {}, candidates: {} };
  for (const s of ['DXYm', 'XAGUSDm', 'USTECm']) results.betas[s] = contemporaneousBeta(s, 'DISCOVERY');
  const frozen = [];
  for (const [key, { stats }] of Object.entries(C)) { const fam = key.split(':')[0]; const gate = gateDiscovery(stats, fam); results.candidates[key] = { stats, gate }; if (gate.pass) frozen.push({ key, family: fam, side: key.split(':')[1], params: P, horizons: gate.horizons, discovery: { n: stats.n, h8: stats.h[8] } }); }
  results.passing = frozen.map((f) => f.key);
  fs.writeFileSync(`${DIR}/discovery_results.json`, JSON.stringify(results, null, 1));
  if (frozen.length) { const body = JSON.stringify({ frozen_at: new Date().toISOString(), protocol: 'docs/XAUUSD_NEXT_EDGE_RESEARCH_PROTOCOL.md', candidates: frozen }, null, 1); const sha = createHash('sha256').update(body).digest('hex'); fs.writeFileSync(`${DIR}/frozen_candidates.json`, body); fs.writeFileSync(`${DIR}/frozen_candidates.sha256`, sha + '\n'); console.log('FROZEN', frozen.length, sha); }
  else console.log('NEXT_PREMISE_FAILED_AT_DISCOVERY: no candidate passed');
  for (const [key, { stats, gate }] of Object.entries(results.candidates)) console.log(key.padEnd(10), 'n', String(stats.n).padStart(5), 'h4', stats.h[4].mean, 'h8', stats.h[8].mean, stats.h[8].ci95, 'h16', stats.h[16].mean, 'win8', stats.h[8].p_win, 'pf8', stats.pf8, 'r', stats.mfe_mae, 'p05', stats.p_plus05_first, 'net', stats.h[8].net_026, 'yrs', stats.pos_year_share, 'nt5', stats.no_top5, gate.pass ? 'PASS' : 'fail:' + gate.reasons.join('|'));
  console.log('drift', JSON.stringify(drift), 'betas', JSON.stringify(results.betas));
}
if (PHASE === 'validation') {
  if (!fs.existsSync(`${DIR}/frozen_candidates.json`)) { console.log('REFUSED: no frozen_candidates.json (discovery produced no candidate)'); process.exit(0); }
  const body = fs.readFileSync(`${DIR}/frozen_candidates.json`, 'utf8'); const sha = createHash('sha256').update(body).digest('hex'); if (sha + '\n' !== fs.readFileSync(`${DIR}/frozen_candidates.sha256`, 'utf8')) { console.log('REFUSED: frozen candidates checksum mismatch'); process.exit(1); }
  const F = JSON.parse(body).candidates; const C = candidatesFrom(events, 'VALIDATION'); const disc = JSON.parse(fs.readFileSync(`${DIR}/discovery_results.json`, 'utf8')).candidates; const results = { generated_at: new Date().toISOString(), region: REG.VALIDATION, frozen_sha256: sha, candidates: {} };
  for (const f of F) { const stats = C[f.key]?.stats ?? null; const gate = gateValidation(stats, f.family, disc[f.key]); results.candidates[f.key] = { stats, gate }; if (gate.pass) fs.writeFileSync(`${DIR}/validation_pass_${f.key.replace(':', '_')}.json`, JSON.stringify({ candidate: f, validation: stats, gate, written_at: new Date().toISOString() }, null, 1)); console.log(f.key.padEnd(10), 'n', stats?.n, 'h8', stats?.h[8].mean, stats?.h[8].ci95, 'net', stats?.h[8].net_026, 'nt3', stats?.no_top3, 'yrs', stats?.pos_year_share, gate.pass ? 'PASS' : 'FAIL:' + gate.reasons.join('|')); }
  fs.writeFileSync(`${DIR}/validation_results.json`, JSON.stringify(results, null, 1));
}
if (PHASE === 'holdout') {
  const arts = fs.readdirSync(DIR).filter((f) => /^validation_pass_.+\.json$/.test(f)); if (!arts.length) { console.log('REFUSED: no validation_pass artifact; holdout not opened'); process.exit(0); }
  const C = candidatesFrom(events, 'HOLDOUT'); const results = { generated_at: new Date().toISOString(), region: REG.HOLDOUT, note: 'reused data (V3/V5 inspected), not pristine', candidates: {} };
  for (const a of arts) { const { candidate } = JSON.parse(fs.readFileSync(`${DIR}/${a}`, 'utf8')); const stats = C[candidate.key]?.stats ?? null; const hs = candidate.family === 'S3' ? [8] : candidate.horizons.slice(0, 2); const pass = !!stats && hs.every((h) => stats.h[h].mean > 0) && stats.h[8].net_026 > 0; results.candidates[candidate.key] = { stats, pass }; console.log(candidate.key, 'n', stats?.n, 'h8', stats?.h[8].mean, stats?.h[8].ci95, 'net', stats?.h[8].net_026, pass ? 'POSITIVE' : 'NEGATIVE'); }
  fs.writeFileSync(`${DIR}/holdout_results.json`, JSON.stringify(results, null, 1));
}
if (PHASE === 'robustness') {
  const arts = fs.readdirSync(DIR).filter((f) => /^validation_pass_.+\.json$/.test(f)); if (!arts.length) { console.log('no survivors'); process.exit(0); }
  const results = {}; const regions = ['DISCOVERY', 'VALIDATION'];
  const run = (evs, key) => { const rows = []; for (const e of evs) { const r = regionOf(B[e.i].t); if (!regions.includes(r)) continue; if (!key(e)) continue; const m = measure(e, r); if (m) rows.push({ e, m }); } const S = summarize(rows); return S ? { n: S.n, h8: S.h[8].mean, net: S.h[8].net_026, net040: S.h[8].net_040, nt5: S.no_top5 } : null; };
  for (const a of arts) {
    const { candidate: c } = JSON.parse(fs.readFileSync(`${DIR}/${a}`, 'utf8')); const fam = c.family; const sideOk = (e) => e.family === fam && (c.side === 'BOTH' || e.side === c.side); const R = {};
    R.base = run(events, sideOk);
    const delayed = []; for (const e of events) { if (!sideOk(e)) continue; const r = regionOf(B[e.i].t); if (!regions.includes(r)) continue; const m = measure(e, r, { delay: 1 }); if (m) delayed.push({ e, m }); } const Sd = summarize(delayed); R.delay1 = Sd ? { n: Sd.n, h8: Sd.h[8].mean, net: Sd.h[8].net_026 } : null;
    if (fam === 'S1L') { R.or1 = run(orBreak('S1L', lon, 480, P.lonScanEnd, 1), sideOk); R.or3 = run(orBreak('S1L', lon, 480, P.lonScanEnd, 3), sideOk); R.scan11 = run(orBreak('S1L', lon, 480, 11 * 60, 2), sideOk); R.scan13 = run(orBreak('S1L', lon, 480, 13 * 60, 2), sideOk); }
    if (fam === 'S1N') { R.or1 = run(orBreak('S1N', ny, 570, P.nyScanEnd, 1), sideOk); R.or3 = run(orBreak('S1N', ny, 570, P.nyScanEnd, 3), sideOk); R.scan12 = run(orBreak('S1N', ny, 570, 12 * 60, 2), sideOk); R.scan14 = run(orBreak('S1N', ny, 570, 14 * 60, 2), sideOk); }
    if (fam === 'S2') { R.scan11 = run(asiaBreak(11 * 60), sideOk); R.scan13 = run(asiaBreak(13 * 60), sideOk); }
    if (fam === 'S3') { R.thr3 = run(transition(3), sideOk); R.thr5 = run(transition(5), sideOk); }
    if (fam === 'D1') { R.z10 = run(crossLead('DXYm', 'D1', -1, 1.0), sideOk); R.z20 = run(crossLead('DXYm', 'D1', -1, 2.0), sideOk); }
    if (fam === 'D2') { R.z10 = run(crossLead('XAGUSDm', 'D2', 1, 1.0), sideOk); R.z20 = run(crossLead('XAGUSDm', 'D2', 1, 2.0), sideOk); }
    if (fam === 'D3') { R.z10 = run(crossLead('USTECm', 'D3', 1, 1.0), sideOk); R.z20 = run(crossLead('USTECm', 'D3', 1, 2.0), sideOk); }
    const vals = Object.values(R).filter(Boolean); R.survival = { perturbations: vals.length, positive_net: vals.filter((v) => v.net > 0).length, share: +(vals.filter((v) => v.net > 0).length / vals.length).toFixed(2) };
    results[c.key] = R; console.log(c.key, JSON.stringify(R));
  }
  fs.writeFileSync(`${DIR}/robustness_results.json`, JSON.stringify(results, null, 1));
}
