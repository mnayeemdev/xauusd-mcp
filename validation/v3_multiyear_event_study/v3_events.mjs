/**
 * V3 MULTI-YEAR 15M / 1H STRUCTURAL EVENT DISCOVERY STUDY. Research only; never imported by production.
 * Reads xauusdm_multiyear_bars.json (MT5 Exness XAUUSDm, read-only fetch). Writes only into this folder.
 *
 * PRE-DECLARED before any event statistic was computed (see docs/XAUUSD_V3_DATA_INTEGRITY.md):
 *   15m regions: DISCOVERY 2022-07-04..2024-06-30 | VALIDATION 2024-07-01..2025-08-31 | HOLDOUT 2025-09-01..2026-09-25
 *   1H  regions: DISCOVERY 2014-01-14..2021-12-31 | VALIDATION 2022-01-01..2024-06-30 | HOLDOUT 2024-07-01..2026-09-25
 *   Event definitions: single variants below (F has two labelled definitions). Discovery gate:
 *     N >= 100 (15m) / 60 (1H) per direction; drift-adjusted mean > 0 with the 95% CI (shifted by drift) excluding 0
 *     at >= 2 horizons; MFE/MAE >= 1.10 at the 4-bar horizon or later; P(+0.5 ATR before -0.5 ATR) >= 53%.
 *   Symmetry: SYMMETRIC if both directions pass; ONE_SIDED if one; NO_EDGE if none. Regime dependence is assessed
 *   on candidates with the pre-declared regime labels (volatility tercile vs rolling median ATR; efficiency-ratio trend/range;
 *   calendar-month direction +/-2%).
 * Run from repo root: node validation/v3_multiyear_event_study/v3_events.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { atr } from '../../src/engine/math.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(HERE, 'xauusdm_multiyear_bars.json'), 'utf8'));
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const yearOf = (t) => new Date(t * 1000).getUTCFullYear();
const monthOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);
const halfOf = (t) => `${yearOf(t)}H${new Date(t * 1000).getUTCMonth() < 6 ? 1 : 2}`;
const sessionOf = (t) => { const h = new Date(t * 1000).getUTCHours(); return h >= 13 && h < 16 ? 'LONDON_NY_OVERLAP' : h >= 8 && h < 13 ? 'LONDON' : h >= 16 && h < 21 ? 'NEW_YORK' : h >= 0 && h < 8 ? 'ASIA' : 'OTHER'; };
let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const CFG = {
  '15m': { H: [1, 2, 4, 8, 16, 32], regions: [['DISCOVERY', '2022-07-04', '2024-06-30'], ['VALIDATION', '2024-07-01', '2025-08-31'], ['HOLDOUT', '2025-09-01', '2026-09-25']], minN: 100 },
  '1H': { H: [1, 2, 4, 8, 16, 24], regions: [['DISCOVERY', '2014-01-14', '2021-12-31'], ['VALIDATION', '2022-01-01', '2024-06-30'], ['HOLDOUT', '2024-07-01', '2026-09-25']], minN: 60 },
};
const WIN = 300; // structure window (bars)

function study(tf) {
  const bars = DATA[tf]; const cfg = CFG[tf]; const H = cfg.H; const maxH = Math.max(...H);
  const ATR = atr(bars, 14);
  const regionOf = (t) => { const d = dayOf(t); for (const [name, a, b] of cfg.regions) if (d >= a && d <= b) return name; return null; };
  // rolling median ATR over 1000 bars (sampled every 50 bars for speed) and 100-bar efficiency ratio for regimes
  const atrMed = new Array(bars.length).fill(null); { let cache = null, cacheAt = -1; for (let i = 1000; i < bars.length; i++) { if (i - cacheAt >= 50) { const w = ATR.slice(i - 1000, i).filter((x) => x != null).sort((a, b) => a - b); cache = w[Math.floor(w.length / 2)]; cacheAt = i; } atrMed[i] = cache; } }
  const volRegime = (i) => (atrMed[i] == null || ATR[i] == null ? 'UNKNOWN' : ATR[i] >= 1.25 * atrMed[i] ? 'HIGH_VOLATILITY' : ATR[i] <= 0.8 * atrMed[i] ? 'LOW_VOLATILITY' : 'NORMAL_VOLATILITY');
  const structRegime = (i) => { if (i < 100) return 'UNKNOWN'; let sum = 0; for (let j = i - 99; j <= i; j++) sum += Math.abs(bars[j].close - bars[j - 1].close); const er = sum > 0 ? Math.abs(bars[i].close - bars[i - 100].close) / sum : 0; return er >= 0.3 ? 'TRENDING' : 'RANGING'; };
  const monthRet = {}; { const byM = {}; for (const b of bars) { const m = monthOf(b.time); (byM[m] ??= { first: b.open, last: b.close }).last = b.close; } for (const [m, v] of Object.entries(byM)) monthRet[m] = (v.last - v.first) / v.first; }
  const dirRegime = (t) => { const r = monthRet[monthOf(t)]; return r >= 0.02 ? 'BULLISH_PERIOD' : r <= -0.02 ? 'BEARISH_PERIOD' : 'MIXED_PERIOD'; };
  // ── event detection ──
  const events = []; const counts = { bars: 0, matureRangeBars: 0, bos: 0, choch: 0 };
  const sCache = new Map(); const sAt = (i) => { if (!sCache.has(i)) { sCache.set(i, computeStructure(bars.slice(i - WIN + 1, i + 1), STRUCTURE_PARAMS)); if (sCache.size > 40) sCache.delete(sCache.keys().next().value); } return sCache.get(i); };
  const off = (i) => i - WIN + 1;
  for (let i = WIN + 1000; i < bars.length - maxH - 1; i++) {
    const t = bars[i].time; const reg = regionOf(t); if (!reg) continue; counts.bars++;
    const a = ATR[i]; if (!(a > 0)) continue; const s = sAt(i); const bar = bars[i]; const ctx = { i, t, region: reg, year: yearOf(t), half: halfOf(t), session: sessionOf(t), vol: volRegime(i), struct: structRegime(i), dirp: dirRegime(t) };
    // mature range: extremes from the last 5 confirmed pivots, defining pivots >= 20 bars old, width >= 2 ATR
    const highs = s.pivots.filter((p) => p.type === 'high').slice(-5), lows = s.pivots.filter((p) => p.type === 'low').slice(-5);
    let range = null; if (highs.length && lows.length) { const ph = highs.reduce((m, p) => (p.price > m.price ? p : m)), pl = lows.reduce((m, p) => (p.price < m.price ? p : m)); const width = ph.price - pl.price; if (i - (off(i) + ph.index) >= 20 && i - (off(i) + pl.index) >= 20 && width >= 2 * a) range = { high: ph.price, low: pl.price, mid: (ph.price + pl.price) / 2, width }; }
    if (range) counts.matureRangeBars++;
    const loc = (price) => { if (!range) return 'NO_RANGE'; const d = Math.min(Math.abs(price - range.high), Math.abs(price - range.low)) / range.width; if (d <= 0.25) return 'NEAR_EXTREME'; if (Math.abs(price - range.mid) / range.width <= 0.25) return 'NEAR_MID'; return 'BETWEEN'; };
    // A RANGE_SWEEP (wick beyond a mature range extreme, close back inside, first pierce in 10 bars)
    if (range) {
      for (const [dir, level, pierce] of [[-1, range.high, bar.high > range.high + 0.1 * a && bar.close <= range.high], [+1, range.low, bar.low < range.low - 0.1 * a && bar.close >= range.low]]) {
        if (!pierce) continue; let prior = false; for (let j = i - 10; j < i; j++) if (dir < 0 ? bars[j].high > level + 0.1 * a : bars[j].low < level - 0.1 * a) { prior = true; break; } if (prior) continue;
        events.push({ ...ctx, kind: 'A_RANGE_SWEEP', dir, level, loc: 'NEAR_EXTREME' });
        // B SWEEP_RECLAIM: within 1-3 bars a confirmed close beyond the sweep bar's inner extreme
        for (let k = 1; k <= 3; k++) { const b = bars[i + k]; if (!b) break; const ok = dir < 0 ? b.close < bar.low : b.close > bar.high; if (ok) { events.push({ ...ctx, i: i + k, t: b.time, kind: 'B_SWEEP_RECLAIM', dir, level, sweepBar: i, loc: 'NEAR_EXTREME' }); break; } if (dir < 0 ? b.close > level : b.close < level) break; }
        // C SWEEP_CHOCH: within 12 bars a confirmed CHoCH opposing the sweep side
        for (let k = 1; k <= 12; k++) { const j = i + k; if (j >= bars.length - maxH - 1) break; const sj = sAt(j); const ev = sj.lastEvent; if (ev && ev.type === 'CHOCH' && off(j) + ev.bar === j && ((dir < 0 && ev.direction === 'BEARISH') || (dir > 0 && ev.direction === 'BULLISH'))) { events.push({ ...ctx, i: j, t: bars[j].time, kind: 'C_SWEEP_CHOCH', dir, level: ev.level, sweepBar: i, loc: 'NEAR_EXTREME' }); break; } }
      }
      // D FAILED_BREAKOUT: previous bar(s) closed beyond the extreme (1-4 closes), this bar closes back inside
      for (const [dir, level] of [[-1, range.high], [+1, range.low]]) { const outside = (b) => (dir < 0 ? b.close > level : b.close < level); if (!outside(bars[i - 1]) || outside(bar)) continue; let n = 0; for (let j = i - 1; j >= i - 4 && outside(bars[j]); j--) n++; if (n >= 1 && n <= 4 && !outside(bars[i - n - 1])) events.push({ ...ctx, kind: 'D_FAILED_BREAKOUT', dir, level, closesOutside: n, loc: 'NEAR_EXTREME' }); }
    }
    // E BOS_RETEST and plain BOS / CHOCH (for G location study)
    const ev = s.lastEvent;
    if (ev && off(i) + ev.bar === i) { const dir = ev.direction === 'BULLISH' ? +1 : -1; const disp = Math.abs(bar.close - ev.level) / a; if (ev.type === 'BOS') counts.bos++; else counts.choch++; events.push({ ...ctx, kind: ev.type === 'BOS' ? 'BOS' : 'CHOCH', dir, level: ev.level, disp: r2(disp), loc: loc(ev.level) }); }
    if (ev && ev.type === 'BOS') { const eb = off(i) + ev.bar; const age = i - eb; if (age >= 2 && age <= 12) { const dir = ev.direction === 'BULLISH' ? +1 : -1; const disp = Math.abs(bars[eb].close - ev.level) / ATR[eb]; if (disp >= 0.5) { let through = false; for (let j = eb + 1; j < i; j++) if (dir > 0 ? bars[j].close < ev.level : bars[j].close > ev.level) { through = true; break; } if (!through) { const touched = dir > 0 ? bar.low <= ev.level + 0.3 * a && bar.low >= ev.level - 0.6 * a : bar.high >= ev.level - 0.3 * a && bar.high <= ev.level + 0.6 * a; if (touched) { const held = dir > 0 ? bar.close > ev.level : bar.close < ev.level; events.push({ ...ctx, kind: held ? 'E_BOS_RETEST_HOLD' : 'E_BOS_RETEST_FAIL', dir: held ? dir : -dir, level: ev.level, loc: loc(ev.level) }); } } } } }
    // F1 COMP_ATR (ATR contraction) and F2 COMP_BOX (20-bar box <= 1.5 ATR): break by close beyond the box
    if (i >= 120) { let sum = 0, c = 0; for (let j = i - 101; j < i - 1; j++) if (ATR[j] > 0) { sum += ATR[j]; c++; } const avg = c ? sum / c : a; const box12 = bars.slice(i - 12, i); const bh = Math.max(...box12.map((x) => x.high)), bl = Math.min(...box12.map((x) => x.low)); if (ATR[i - 1] <= 0.7 * avg) { const dir = bar.close > bh + 0.1 * a ? +1 : bar.close < bl - 0.1 * a ? -1 : 0; if (dir) { events.push({ ...ctx, kind: 'F1_COMP_ATR_BREAK', dir, level: dir > 0 ? bh : bl, loc: loc(bar.close) }); const nb = bars[i + 1]; if (nb && (dir > 0 ? nb.close > bh : nb.close < bl)) events.push({ ...ctx, i: i + 1, t: nb.time, kind: 'F1_COMP_ATR_ACCEPT', dir, level: dir > 0 ? bh : bl, loc: loc(bar.close) }); } } const box20 = bars.slice(i - 20, i); const h20 = Math.max(...box20.map((x) => x.high)), l20 = Math.min(...box20.map((x) => x.low)); if (h20 - l20 <= 1.5 * a) { const dir = bar.close > h20 + 0.1 * a ? +1 : bar.close < l20 - 0.1 * a ? -1 : 0; if (dir) events.push({ ...ctx, kind: 'F2_COMP_BOX_BREAK', dir, level: dir > 0 ? h20 : l20, loc: loc(bar.close) }); } }
  }
  // ── forward measurement ──
  function forward(e) { const a = ATR[e.i]; const c0 = bars[e.i].close; const out = {}; let mfe = 0, mae = 0, tMfe = 0, tMae = 0, first05 = null, first1 = null; for (let h = 1; h <= maxH; h++) { const b = bars[e.i + h]; if (!b) break; const fav = (e.dir > 0 ? b.high - c0 : c0 - b.low) / a, adv = (e.dir > 0 ? c0 - b.low : b.high - c0) / a; if (fav > mfe) { mfe = fav; tMfe = h; } if (adv > mae) { mae = adv; tMae = h; } if (first05 === null) { const up = fav >= 0.5, dn = adv >= 0.5; if (up && dn) first05 = 'ADVERSE'; else if (up) first05 = 'FAVORABLE'; else if (dn) first05 = 'ADVERSE'; } if (first1 === null) { const up = fav >= 1, dn = adv >= 1; if (up && dn) first1 = 'ADVERSE'; else if (up) first1 = 'FAVORABLE'; else if (dn) first1 = 'ADVERSE'; } if (H.includes(h)) out[h] = { d: (b.close - c0) * e.dir / a, dUsd: (b.close - c0) * e.dir, mfe, mae, tMfe, tMae }; } return { ...out, first05, first1 }; }
  for (const e of events) e.f = forward(e);
  // unconditional drift per region and per year (ATR units) for each horizon
  const drift = { region: {}, year: {} }; { const acc = {}; for (let i = WIN + 1000; i < bars.length - maxH - 1; i++) { const t = bars[i].time; const reg = regionOf(t); if (!reg || !(ATR[i] > 0)) continue; for (const key of [`region:${reg}`, `year:${yearOf(t)}`]) { const o = (acc[key] ??= Object.fromEntries(H.map((h) => [h, [0, 0]]))); for (const h of H) { o[h][0] += (bars[i + h].close - bars[i].close) / ATR[i]; o[h][1]++; } } } for (const [key, o] of Object.entries(acc)) { const [kind, name] = key.split(':'); drift[kind][name] = Object.fromEntries(H.map((h) => [h, o[h][1] ? o[h][0] / o[h][1] : 0])); } }
  function summarize(list, driftRow) { const n = list.length; if (!n) return { n: 0 }; const o = { n }; for (const h of H) { const L = list.filter((e) => e.f[h]); if (!L.length) continue; const ds = L.map((e) => e.f[h].d); const mean = ds.reduce((x, y) => x + y, 0) / L.length; const sd = Math.sqrt(ds.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, L.length - 1)); const se = sd / Math.sqrt(L.length); const dirMean = L.reduce((x, e) => x + e.dir, 0) / L.length; const dr = driftRow ? driftRow[h] : 0; const excess = mean - dirMean * dr; const sorted = [...ds].sort((x, y) => x - y); const mfe = L.reduce((x, e) => x + e.f[h].mfe, 0) / L.length, mae = L.reduce((x, e) => x + e.f[h].mae, 0) / L.length; o[`h${h}`] = { mean_atr: r3(mean), median_atr: r3(sorted[Math.floor(L.length / 2)]), mean_usd: r2(L.reduce((x, e) => x + e.f[h].dUsd, 0) / L.length), drift_atr: r3(dr), excess_atr: r3(excess), excess_ci95: [r3(excess - 1.96 * se), r3(excess + 1.96 * se)], p_fav: r2(ds.filter((d) => d > 0).length / L.length * 100), p_adv: r2(ds.filter((d) => d < 0).length / L.length * 100), mfe: r2(mfe), mae: r2(mae), mfe_mae: r2(mae > 0 ? mfe / mae : null), t_mfe: r2(L.reduce((x, e) => x + e.f[h].tMfe, 0) / L.length), t_mae: r2(L.reduce((x, e) => x + e.f[h].tMae, 0) / L.length) }; } o.p_plus05_before_minus05 = r2(list.filter((e) => e.f.first05 === 'FAVORABLE').length / Math.max(1, list.filter((e) => e.f.first05).length) * 100); o.p_plus1_before_minus1 = r2(list.filter((e) => e.f.first1 === 'FAVORABLE').length / Math.max(1, list.filter((e) => e.f.first1).length) * 100); return o; }
  function gate(sum) { if (!sum || sum.n < cfg.minN) return { pass: false, reason: 'N' }; const later = H.filter((h) => h >= 4); const ciPass = H.filter((h) => sum[`h${h}`] && sum[`h${h}`].excess_ci95[0] > 0).length; const ratioOk = later.some((h) => sum[`h${h}`] && sum[`h${h}`].mfe_mae >= 1.10); const p05 = sum.p_plus05_before_minus05 >= 53; return { pass: ciPass >= 2 && ratioOk && p05, ci_horizons_positive: ciPass, ratio_ok: ratioOk, p05_ok: p05 }; }
  function bootstrap(list, h) { const L = list.filter((e) => e.f[h]); const n = L.length; if (n < 30) return null; const ds = L.map((e) => e.f[h].d); const ms = []; for (let k = 0; k < 2000; k++) { let s = 0; for (let q = 0; q < n; q++) s += ds[Math.floor(rnd() * n)]; ms.push(s / n); } ms.sort((x, y) => x - y); return { h, n, ci95: [r3(ms[50]), r3(ms[1949])] }; }
  function outlier(list, h) { const L = list.filter((e) => e.f[h]); if (L.length < 30) return null; const ds = L.map((e) => e.f[h].d); const abs = [...ds].map(Math.abs).sort((x, y) => x - y); const cut = abs[Math.floor(abs.length * 0.99)]; const trimmed = ds.filter((d) => Math.abs(d) < cut); const lo = [...ds].sort((x, y) => x - y)[Math.floor(ds.length * 0.01)], hi = [...ds].sort((x, y) => x - y)[Math.floor(ds.length * 0.99)]; const wins = ds.map((d) => Math.min(hi, Math.max(lo, d))); const m = (x) => r3(x.reduce((p, q) => p + q, 0) / x.length); return { h, all: m(ds), without_top1pct_abs: m(trimmed), winsorized_1_99: m(wins) }; }
  const KINDS = ['A_RANGE_SWEEP', 'B_SWEEP_RECLAIM', 'C_SWEEP_CHOCH', 'D_FAILED_BREAKOUT', 'E_BOS_RETEST_HOLD', 'E_BOS_RETEST_FAIL', 'F1_COMP_ATR_BREAK', 'F1_COMP_ATR_ACCEPT', 'F2_COMP_BOX_BREAK', 'BOS', 'CHOCH'];
  const result = { tf, bars: bars.length, range: [dayOf(bars[0].time), dayOf(bars.at(-1).time)], counts, regions: cfg.regions, drift, events: {} };
  const byReg = (kind, dir, reg) => events.filter((e) => e.kind === kind && e.dir === dir && e.region === reg);
  for (const kind of KINDS) {
    const rec = { by_direction: {} };
    for (const dir of [+1, -1]) { const dn = dir > 0 ? 'BULL' : 'BEAR'; const D = byReg(kind, dir, 'DISCOVERY'); const sum = summarize(D, drift.region.DISCOVERY); const g = gate(sum); rec.by_direction[dn] = { discovery: sum, discovery_gate: g }; }
    const bullPass = rec.by_direction.BULL.discovery_gate.pass, bearPass = rec.by_direction.BEAR.discovery_gate.pass;
    rec.symmetry_on_discovery = bullPass && bearPass ? 'SYMMETRIC' : bullPass || bearPass ? 'ONE_SIDED' : 'NO_EDGE';
    // validation & holdout are computed for every event (matrix transparency); the CANDIDATE label uses discovery only
    for (const dir of [+1, -1]) { const dn = dir > 0 ? 'BULL' : 'BEAR'; for (const reg of ['VALIDATION', 'HOLDOUT']) rec.by_direction[dn][reg.toLowerCase()] = summarize(byReg(kind, dir, reg), drift.region[reg]); }
    const FORCE = (process.env.FORCE_DETAIL || '').split(',').filter(Boolean); // exploratory: near-miss events forced into the stability panels
    if (rec.symmetry_on_discovery !== 'NO_EDGE' || FORCE.includes(`${tf}:${kind}`)) { // stability panels for candidates (and forced near-misses, labelled exploratory)
      const all = events.filter((e) => e.kind === kind); const hRef = H.includes(8) ? 8 : H[3];
      rec.candidate_detail = { horizon_ref: hRef, exploratory_forced: !(rec.symmetry_on_discovery !== 'NO_EDGE') };
      for (const dir of [+1, -1]) { const dn = dir > 0 ? 'BULL' : 'BEAR'; const E = all.filter((e) => e.dir === dir); const byY = {}; for (const y of [...new Set(E.map((e) => e.year))].sort()) { const L = E.filter((e) => e.year === y); const s = summarize(L, drift.year[y]); byY[y] = { n: s.n, excess: s[`h${hRef}`]?.excess_atr ?? null, mean: s[`h${hRef}`]?.mean_atr ?? null, mfe_mae: s[`h${hRef}`]?.mfe_mae ?? null, p05: s.p_plus05_before_minus05 }; } const byH = {}; for (const hh of [...new Set(E.map((e) => e.half))].sort()) { const L = E.filter((e) => e.half === hh); if (L.length < 15) continue; const s = summarize(L, drift.year[L[0].year]); byH[hh] = { n: s.n, excess: s[`h${hRef}`]?.excess_atr ?? null }; } const grp = (fn) => Object.fromEntries(Object.entries(E.reduce((m, e) => { (m[fn(e)] ??= []).push(e); return m; }, {})).map(([k, L]) => [k, (() => { const s = summarize(L, drift.region[L[0].region]); return { n: s.n, excess: s[`h${hRef}`]?.excess_atr ?? null, mfe_mae: s[`h${hRef}`]?.mfe_mae ?? null, p05: s.p_plus05_before_minus05 }; })()])); rec.candidate_detail[dn] = { by_year: byY, by_half_year: byH, by_vol_regime: grp((e) => e.vol), by_struct_regime: grp((e) => e.struct), by_direction_period: grp((e) => e.dirp), by_session: grp((e) => e.session), by_location: grp((e) => e.loc), bootstrap_discovery: bootstrap(byReg(kind, dir, 'DISCOVERY'), hRef), bootstrap_validation: bootstrap(byReg(kind, dir, 'VALIDATION'), hRef), outlier_discovery: outlier(byReg(kind, dir, 'DISCOVERY'), hRef), outlier_validation: outlier(byReg(kind, dir, 'VALIDATION'), hRef) }; }
    }
    result.events[kind] = rec;
  }
  // G: location study for BOS and CHOCH (discovery only, both directions pooled by direction-signed move)
  result.location_study = {}; for (const kind of ['BOS', 'CHOCH', 'B_SWEEP_RECLAIM', 'D_FAILED_BREAKOUT']) { result.location_study[kind] = {}; for (const loc of ['NEAR_EXTREME', 'NEAR_MID', 'BETWEEN', 'NO_RANGE']) { const L = events.filter((e) => e.kind === kind && e.loc === loc && e.region === 'DISCOVERY'); const s = summarize(L, drift.region.DISCOVERY); result.location_study[kind][loc] = { n: s.n, excess_h4: s.h4?.excess_atr ?? null, excess_h8: s.h8?.excess_atr ?? null, mfe_mae_h8: s.h8?.mfe_mae ?? null, p05: s.p_plus05_before_minus05 }; } }
  result.event_counts = Object.fromEntries(KINDS.map((k) => [k, { DISCOVERY: events.filter((e) => e.kind === k && e.region === 'DISCOVERY').length, VALIDATION: events.filter((e) => e.kind === k && e.region === 'VALIDATION').length, HOLDOUT: events.filter((e) => e.kind === k && e.region === 'HOLDOUT').length }]));
  return result;
}
const out = { generated_at: new Date().toISOString(), '15m': study('15m'), '1H': study('1H') };
writeFileSync(join(HERE, 'v3_event_results.json'), JSON.stringify(out, null, 1));
console.log('done', JSON.stringify({ '15m': { bars: out['15m'].bars, counts: out['15m'].counts, event_counts: out['15m'].event_counts }, '1H': { bars: out['1H'].bars, counts: out['1H'].counts, event_counts: out['1H'].event_counts } }, null, 1));
