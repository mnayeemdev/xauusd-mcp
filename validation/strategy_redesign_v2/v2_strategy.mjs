/**
 * STRATEGY REDESIGN V2 — OFFLINE CHALLENGER (research only; never imported by production).
 * Price/structure/event-first rules with boolean gates; WAIT is the default.
 *
 * Usage (from repo root):  node validation/strategy_redesign_v2/v2_strategy.mjs A|B|C [--pp]
 *   Only the requested chronological region is evaluated (A discovery, B validation, C holdout).
 *   Rules are frozen in docs/XAUUSD_STRATEGY_V2_SPEC.md before B is run; the spec records the
 *   sha256 of this file. Outcome resolution uses later confirmed bars (no lookahead at decision time).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { atr } from '../../src/engine/math.js';

const REGION = process.argv[2]; if (!['A', 'B', 'C'].includes(REGION)) throw new Error('region A|B|C required');
const PP = process.argv.includes('--pp'); // profit protection variant (decided on A, then frozen: OFF)
const FAM = (process.argv.find((x) => x.startsWith('--families=')) ?? '--families=ABC').split('=')[1]; // frozen V2 = 'C' (families A and B rejected on discovery)
const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, '..', 'master_edge_validation', 'xauusdm_bars_master.json'), 'utf8'));
const b5 = BARS['5m'], b15 = BARS['15m'], b30 = BARS['30m'], b1h = BARS['1H'];
const REQ = 500, A_END = '2026-07-13', B_END = '2026-08-19', SPREAD = 0.24;
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const regionOf = (t) => (day(t) < A_END ? 'A' : day(t) < B_END ? 'B' : 'C');
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const firstEvaluable = Date.UTC(2026, 3, 29, 9, 0) / 1000;
const ATR = atr(b5, 14);
const lastIdx = b5.length - 2;
const sCache = new Map(); const sAt = (i) => { if (!sCache.has(i)) sCache.set(i, computeStructure(b5.slice(Math.max(0, i - (REQ - 2)), i + 1), STRUCTURE_PARAMS)); return sCache.get(i); };
const offOf = (i) => i - Math.min(i, REQ - 2);
const upper = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].time < x) lo = m + 1; else hi = m; } return lo; };
const htfCache = new Map();
function htfContext(tf, bars, T) { const sec = { '15m': 900, '30m': 1800, '1H': 3600 }[tf]; const cut = Math.floor(T / sec) * sec; const key = tf + cut; if (!htfCache.has(key)) { const end = upper(bars, cut); const s = computeStructure(bars.slice(Math.max(0, end - 300), end), STRUCTURE_PARAMS); htfCache.set(key, { state: s.state, lastEvent: s.lastEvent?.type ?? null, rangeHigh: r2(s.rangeHigh), rangeLow: r2(s.rangeLow) }); } return htfCache.get(key); }
function atrAvg100(i) { let s = 0, c = 0; for (let j = i - 100; j < i; j++) if (ATR[j] > 0) { s += ATR[j]; c++; } return c ? s / c : ATR[i]; }
function marketState(i, s) { const a = ATR[i], av = atrAvg100(i); const ev = s.lastEvent; const evAge = ev ? i - (offOf(i) + ev.bar) : 999; if (a <= 0.7 * av) return 'COMPRESSION'; if (a >= 1.4 * av) return 'EXPANSION'; if (ev && ev.type === 'BOS' && evAge <= 20) return 'TREND_CONTINUATION'; return 'BALANCED'; }
const MIN_RR = 1.7;

// ── objective selection (structural only) ──
function objective(i, s, dir, entry, risk) { const off = offOf(i); const cands = []; const pivs = s.pivots.slice(-10); for (const p of pivs) { if (dir > 0 && p.type === 'high' && p.price > entry) cands.push({ price: p.price, source: '5m_pivot_high' }); if (dir < 0 && p.type === 'low' && p.price < entry) cands.push({ price: p.price, source: '5m_pivot_low' }); } if (dir > 0 && s.rangeHigh != null && s.rangeHigh > entry) cands.push({ price: s.rangeHigh, source: 'range_high' }); if (dir < 0 && s.rangeLow != null && s.rangeLow < entry) cands.push({ price: s.rangeLow, source: 'range_low' }); const ok = cands.map((c) => ({ ...c, r: Math.abs(c.price - entry) / risk })).filter((c) => c.r >= 1.0).sort((x, y) => x.r - y.r); return ok[0] ?? null; }

// ── families (all rules on confirmed bars; entry at the close of the confirming bar) ──
function famA(i, s) { // LIQUIDITY SWEEP + RECLAIM at the range extreme
  const a = ATR[i]; if (!(a > 0)) return null; const bar = b5[i];
  for (const dir of [+1, -1]) {
    const level = dir > 0 ? s.rangeLow : s.rangeHigh; if (level == null) continue;
    // find a sweep bar k in [i-3, i-1]: pierce > 0.1 ATR and close back inside; and no confirmed close beyond the level between k and i
    for (let k = i - 3; k <= i - 1; k++) { const sb = b5[k]; const swept = dir > 0 ? sb.low < level - 0.1 * a && sb.close >= level : sb.high > level + 0.1 * a && sb.close <= level; if (!swept) continue; let broken = false; for (let j = k + 1; j < i; j++) if (dir > 0 ? b5[j].close < level : b5[j].close > level) broken = true; if (broken) continue; const confirmed = dir > 0 ? bar.close > level && bar.close > sb.high : bar.close < level && bar.close < sb.low; if (!confirmed) continue; const stop = dir > 0 ? sb.low - 0.1 * a : sb.high + 0.1 * a; return { family: 'V2A_SWEEP_RECLAIM', dir, level, stop, sweepBar: k, trigger: 'RANGE_SWEEP', confirmation: 'RECLAIM_CLOSE_BEYOND_SWEEP_BAR' }; }
  }
  return null;
}
function famB(i, s) { // STRUCTURAL BREAK (BOS, displacement) + RETEST HOLD
  const a = ATR[i]; if (!(a > 0)) return null; const bar = b5[i]; const ev = s.lastEvent; if (!ev || ev.type !== 'BOS') return null; const evAbs = offOf(i) + ev.bar; const age = i - evAbs; if (age < 1 || age > 10) return null; const dir = ev.direction === 'BULLISH' ? +1 : -1; const level = ev.level; const bb = b5[evAbs]; const disp = Math.abs(bb.close - level) / ATR[evAbs]; if (disp < 0.5) return null; for (let j = evAbs + 1; j < i; j++) if (dir > 0 ? b5[j].close < level : b5[j].close > level) return null; const touched = dir > 0 ? bar.low <= level + 0.3 * a && bar.low >= level - 0.6 * a : bar.high >= level - 0.3 * a && bar.high <= level + 0.6 * a; const held = dir > 0 ? bar.close > level : bar.close < level; if (!(touched && held)) return null; if (Math.abs(bar.close - level) > 1.0 * a) return null; const stop = dir > 0 ? bar.low - 0.1 * a : bar.high + 0.1 * a; return { family: 'V2B_BOS_RETEST', dir, level, stop, trigger: 'BOS_DISPLACEMENT', confirmation: 'RETEST_HOLD_CLOSE', displacementAtr: r2(disp), barsSinceBreak: age }; }
function famC(i, s) { // COMPRESSION -> EXPANSION with acceptance
  const a = ATR[i]; if (!(a > 0)) return null; const bar = b5[i], prev = b5[i - 1]; const av = atrAvg100(i - 1); if (!(ATR[i - 1] <= 0.7 * av)) return null; const box = b5.slice(i - 13, i - 1); const bh = Math.max(...box.map((x) => x.high)), bl = Math.min(...box.map((x) => x.low)); const dir = prev.close > bh + 0.1 * ATR[i - 1] && bar.close > bh ? +1 : prev.close < bl - 0.1 * ATR[i - 1] && bar.close < bl ? -1 : 0; if (!dir) return null; const stop = dir > 0 ? bl - 0.1 * a : bh + 0.1 * a; return { family: 'V2C_COMPRESSION_EXPANSION', dir, level: dir > 0 ? bh : bl, stop, trigger: 'COMPRESSION_BREAK_CLOSE', confirmation: 'ACCEPTANCE_SECOND_CLOSE', boxHeightAtr: r2((bh - bl) / a), measuredMove: dir > 0 ? bh + 2 * (bh - bl) : bl - 2 * (bh - bl) }; }

// ── outcome simulation: structural thesis exits + separate emergency protection ──
function simulate(sig, { spread = SPREAD, slip = 0, pp = PP } = {}) {
  const fill = sig.dir > 0 ? sig.entry + spread + slip : sig.entry - slip; const risk = Math.abs(sig.entry - sig.stop); const a = ATR[sig.i];
  const emergency = sig.dir > 0 ? sig.stop - 0.5 * a : sig.stop + 0.5 * a;
  let mfe = 0, mae = 0, exit = null;
  for (let j = sig.i + 1; j <= lastIdx; j++) {
    const b = b5[j]; const fav = sig.dir > 0 ? b.high - fill : fill - (b.low + spread); const adv = sig.dir > 0 ? fill - b.low : (b.high + spread) - fill; mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    const hitEmergency = sig.dir > 0 ? b.low <= emergency : b.high + spread >= emergency;
    const hitTarget = sig.dir > 0 ? b.high >= sig.target : b.low + spread <= sig.target;
    if (hitEmergency) { exit = { reason: 'EMERGENCY_BROKER_SL', j, pnl: (sig.dir > 0 ? emergency - fill : fill - emergency) - slip }; break; }
    if (hitTarget) { exit = { reason: 'STRUCTURAL_TARGET', j, pnl: (sig.dir > 0 ? sig.target - fill : fill - sig.target) - slip }; break; }
    const closePnl = (sig.dir > 0 ? b.close - fill : fill - (b.close + spread)) - slip;
    if (sig.dir > 0 ? b.close < sig.stop : b.close > sig.stop) { exit = { reason: 'THESIS_INVALIDATION_CLOSE', j, pnl: closePnl }; break; }
    const st = sAt(j); const ev = st.lastEvent; if (ev && offOf(j) + ev.bar > sig.i && ((sig.dir > 0 && ev.direction === 'BEARISH') || (sig.dir < 0 && ev.direction === 'BULLISH')) && closePnl < 0) { exit = { reason: 'THESIS_DETERIORATION_OPPOSITE_STRUCTURE', j, pnl: closePnl }; break; }
    if (pp && mfe >= 1.5 * risk && closePnl <= 0.5 * risk) { exit = { reason: 'PROFIT_PROTECTION', j, pnl: closePnl }; break; }
    if (j - sig.i >= 48) { exit = { reason: 'TIME_STOP_48_BARS', j, pnl: closePnl }; break; }
  }
  if (!exit) return { skipped: 'OPEN_AT_END' };
  const pnl = r2(exit.pnl); return { pnl, r: r3(pnl / risk), exit: exit.reason, closeIdx: exit.j, hold: exit.j - sig.i, mfe_r: r2(mfe / risk), mae_r: r2(mae / risk) };
}

// ── main loop over the requested region only ──
const signals = []; const gates = { bars: 0, eventA: 0, eventB: 0, eventC: 0, objectiveMissing: 0, rrRejected: 0, stopTooTight: 0 };
let openUntil = -1;
for (let i = 520; i <= lastIdx; i++) {
  const t = b5[i].time; if (t < firstEvaluable || regionOf(t) !== REGION) continue; gates.bars++;
  const s = sAt(i); if (!s.state) continue;
  const cands = [FAM.includes('A') ? famA(i, s) : null, FAM.includes('B') ? famB(i, s) : null, FAM.includes('C') ? famC(i, s) : null].filter(Boolean);
  for (const c of cands) {
    gates[c.family === 'V2A_SWEEP_RECLAIM' ? 'eventA' : c.family === 'V2B_BOS_RETEST' ? 'eventB' : 'eventC']++;
    const entry = b5[i].close; const risk = Math.abs(entry - c.stop); const a = ATR[i];
    if (risk < 0.3 * a) { gates.stopTooTight++; continue; }
    const obj = c.measuredMove ? { price: c.measuredMove, source: 'measured_move_2x_box', r: Math.abs(c.measuredMove - entry) / risk } : objective(i, s, c.dir, entry, risk);
    if (!obj) { gates.objectiveMissing++; continue; }
    const rr = obj.r; if (rr < MIN_RR) { gates.rrRejected++; continue; }
    if (i <= openUntil) continue; // one position at a time (research realism, same as production)
    const T = t + 300 + 80; const sig = { i, t, time: iso(t), day: day(t), region: REGION, family: c.family, dir: c.dir, side: c.dir > 0 ? 'BUY' : 'SELL', state: marketState(i, s), s5: s.state, s5event: s.lastEvent?.type ?? null, ctx15: htfContext('15m', b15, T), ctx30: htfContext('30m', b30, T), ctx1h: htfContext('1H', b1h, T), trigger: c.trigger, confirmation: c.confirmation, entry: r2(entry), stop: r2(c.stop), stop_dist: r2(risk), stop_atr: r2(risk / a), target: r2(obj.price), target_source: obj.source, rr: r2(rr), level: r2(c.level), extra: { displacementAtr: c.displacementAtr, barsSinceBreak: c.barsSinceBreak, boxHeightAtr: c.boxHeightAtr, sweepBar: c.sweepBar } };
    sig.o = simulate(sig); sig.o_spread040 = simulate(sig, { spread: 0.40 }); sig.o_spread040_slip015 = simulate(sig, { spread: 0.40, slip: 0.15 }); sig.o_ppOther = simulate(sig, { pp: !PP });
    if (!sig.o.skipped) openUntil = sig.o.closeIdx;
    signals.push(sig);
  }
}
function stats(arr, key = 'o') { const c = arr.filter((s) => s[key] && !s[key].skipped); const n = c.length; if (!n) return { n: 0 }; const rs = c.map((s) => s[key].r); const wins = c.filter((s) => s[key].pnl > 0); const gp = wins.reduce((x, s) => x + s[key].pnl, 0), gl = c.filter((s) => s[key].pnl <= 0).reduce((x, s) => x - s[key].pnl, 0); const mean = rs.reduce((x, y) => x + y, 0) / n; const sd = Math.sqrt(rs.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, n - 1)); let ls = 0, mls = 0; for (const s of c) { if (s[key].pnl <= 0) { ls++; mls = Math.max(mls, ls); } else ls = 0; } let cum = 0, peak = 0, dd = 0; for (const s of c) { cum += s[key].r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); } const sorted = [...rs].sort((x, y) => y - x); const total = rs.reduce((x, y) => x + y, 0); const ex = (k) => r2(total - sorted.slice(0, k).reduce((x, y) => x + y, 0)); const med = [...rs].sort((x, y) => x - y)[Math.floor(n / 2)]; return { n, wr: r2(wins.length / n * 100), pf: gl > 0 ? r2(gp / gl) : null, mean_r: r3(mean), median_r: r3(med), total_r: r2(total), ci95: [r3(mean - 1.96 * sd / Math.sqrt(n)), r3(mean + 1.96 * sd / Math.sqrt(n))], max_dd_r: r2(dd), max_loss_streak: mls, mean_mae_r: r2(c.reduce((x, s) => x + s[key].mae_r, 0) / n), mean_mfe_r: r2(c.reduce((x, s) => x + s[key].mfe_r, 0) / n), avg_hold: r2(c.reduce((x, s) => x + s[key].hold, 0) / n), total_ex_top1: ex(1), total_ex_top3: ex(3), total_ex_top5: ex(5), exits: Object.fromEntries(Object.entries(c.reduce((m, s) => { m[s[key].exit] = (m[s[key].exit] || 0) + 1; return m; }, {}))) }; }
const group = (arr, fn, key = 'o') => Object.fromEntries(Object.entries(arr.reduce((m, s) => { const k = fn(s); (m[k] ??= []).push(s); return m; }, {})).sort((x, y) => y[1].length - x[1].length).map(([k, v]) => [k, stats(v, key)]));
let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function boot(arr, key = 'o') { const c = arr.filter((s) => s[key] && !s[key].skipped); const rs = c.map((s) => s[key].r); const n = rs.length; if (n < 10) return { n, note: 'too small' }; const ms = [], pfs = []; for (let k = 0; k < 2000; k++) { let sum = 0, gp = 0, gl = 0; for (let q = 0; q < n; q++) { const x = c[Math.floor(rnd() * n)]; sum += x[key].r; if (x[key].pnl > 0) gp += x[key].pnl; else gl -= x[key].pnl; } ms.push(sum / n); pfs.push(gl > 0 ? gp / gl : 9); } ms.sort((x, y) => x - y); pfs.sort((x, y) => x - y); return { n, mean_r: r3(rs.reduce((x, y) => x + y, 0) / n), ci95: [r3(ms[50]), r3(ms[1949])], pf_ci95: [r2(pfs[50]), r2(pfs[1949])], p_mean_le_0: r2(ms.filter((m) => m <= 0).length / 2000 * 100) }; }
const stopBucket = (s) => (s.stop_dist < 3 ? 'a_<3' : s.stop_dist < 5 ? 'b_3-5' : s.stop_dist < 8 ? 'c_5-8' : s.stop_dist < 12 ? 'd_8-12' : s.stop_dist < 20 ? 'e_12-20' : 'f_>20');
const rrBucket = (s) => (s.rr < 2 ? 'a_1.7-2' : s.rr < 2.5 ? 'b_2-2.5' : s.rr < 3 ? 'c_2.5-3' : 'd_3+');
const sessionOf = (t) => { const h = new Date(t * 1000).getUTCHours(); return h >= 8 && h < 13 ? 'LONDON' : h >= 13 && h < 21 ? 'NEW_YORK' : h < 8 ? 'ASIA' : 'OTHER'; };
const out = { region: REGION, families: FAM, profit_protection_variant: PP, sessions: new Set(signals.map((s) => s.day)).size, gates, overall: stats(signals), bootstrap: boot(signals), by_family: group(signals, (s) => s.family), by_side: group(signals, (s) => s.side), by_family_side: group(signals, (s) => s.family + '_' + s.side), by_state: group(signals, (s) => s.state), by_session: group(signals, (s) => sessionOf(s.t)), by_stop: group(signals, stopBucket), by_rr: group(signals, rrBucket), by_ctx15: group(signals, (s) => `15m_${s.ctx15.state ?? 'none'}_${s.side}`), by_ctx1h: group(signals, (s) => `1H_${s.ctx1h.state ?? 'none'}_${s.side}`), friction: { spread040: stats(signals, 'o_spread040'), spread040_slip015: stats(signals, 'o_spread040_slip015') }, other_pp_variant: stats(signals, 'o_ppOther'), signals };
writeFileSync(join(HERE, `v2_results_${REGION}${PP ? '_pp' : ''}${FAM === 'ABC' ? '' : '_fam' + FAM}.json`), JSON.stringify(out, null, 1));
const brief = { ...out, signals: undefined }; console.log(JSON.stringify(brief, null, 1));
