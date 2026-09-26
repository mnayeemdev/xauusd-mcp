/**
 * SEED RISK POLICY — HISTORICAL / REPLAY EVIDENCE STUDY. READ-ONLY ANALYSIS.
 *
 * Reconstructs every intraday_5m production-rule signal from confirmed MT5
 * XAUUSDm bars (class B evidence), cross-checks against the live signal
 * store (class A), simulates outcomes with the CURRENT production exit
 * stack, then runs the V2 SEED capital policy at several risk percentages
 * in two views (VIEW1 = production 2-loss daily breaker, VIEW2 = breaker
 * ignored for observation only). Writes only into this folder.
 *
 * Run from the repo root: node validation/replay_audit_2026-09-25/seed_risk_study.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPipeline } from '../../src/engine/pipeline.js';
import { classifyRegime, REGIME_PARAMS } from '../../src/engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { computeHtfContext } from '../../src/engine/htf.js';
import { computeBias } from '../../src/engine/intraday/bias.js';
import { runIntradayPipeline, combineIntraday } from '../../src/engine/intraday/pipeline5m.js';
import { INTRADAY_PARAMS } from '../../src/engine/intraday/params.js';
import { computeProtectiveStops, evaluateExecutableGeometry } from '../../src/engine/mt5Policy.js';
import { evaluateTradeManagement } from '../../src/engine/mt5TradeManagement.js';
import { atr } from '../../src/engine/math.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, 'xauusdm_bars_extended.json'), 'utf8'));
const STORE = JSON.parse(readFileSync(join(HERE, '..', 'mcp_engine_signals.json'), 'utf8')).signals;

const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400 };
const FETCH_LAG = 80, REQ = 500, SPREAD = 0.24, COST = 0.60, LEVERAGE = 200, CONTRACT = 100;
const START_EQUITY = 62.07;
const REAL = { profitTargetUsd: 30, maximumLossUsd: -50, brokerStructuralSlMultiple: 1.5, minEffectiveRr: 1.7 };
const POLICIES = [3, 5, 6, 7.5, 10];
const GOV = { caution: 0.08, defensive: 0.12, preservation: 0.20 }; // V2 tiers 0-2
const RUIN_EQUITY = START_EQUITY * 0.5; // defined before running: equity <= 50 % of start = RUIN
const NEAR_RUIN_DD = 0.30;             // peak-to-trough drawdown >= 30 % = NEAR-RUIN
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

function confirmedAt(tf, T) { const s = TF_SEC[tf]; const cut = Math.floor(T / s) * s; return BARS[tf].filter((b) => b.time < cut).slice(-(REQ - 1)); }
// index-based fast slice for 5m (bars sorted)
const b5all = BARS['5m'];

// ── 1. Reconstruct production-rule signals on every 5m close in the evaluable window ──
const firstEvaluable = Math.max(
  b5all[REQ - 1].time,
  BARS['15m'][REQ - 1].time, BARS['30m'][REQ - 1].time, BARS['1H'][REQ - 1].time,
);
const lastIdx = b5all.length - 2; // last CLOSED bar (the final bar is forming)
const decisions = [];
let evalCount = 0;
for (let i = 0; i <= lastIdx; i++) {
  const t = b5all[i].time;
  if (t < firstEvaluable) continue;
  const T = t + 300 + FETCH_LAG;
  const b5 = b5all.slice(Math.max(0, i - (REQ - 2)), i + 1);
  const b15 = confirmedAt('15m', T), b30 = confirmedAt('30m', T), b1h = confirmedAt('1H', T);
  const ctx1H = computeHtfContext(b1h, { includeCorrection: true });
  const m30 = runPipeline({ confirmedBars: b30 });
  const bias = computeBias({ confirmedBars: b15, params: INTRADAY_PARAMS });
  const intraday = runIntradayPipeline({ bars5: b5, bias, m30Regime: m30.regime, ctx1H, params: INTRADAY_PARAMS });
  const live = combineIntraday({ intraday, bias, m30, ctx1H });
  evalCount++;
  if (live.action === 'BUY' || live.action === 'SELL') {
    const c = intraday.evidence.candidate, rk = intraday.evidence.risk;
    decisions.push({ i, t, side: live.action, model: intraday.model, quality: intraday.quality.score, qThreshold: intraday.quality.threshold, entry: rk.entry, sl: rk.stop_loss, tp1: rk.tp1, tp2: rk.tp2, rr: rk.rr, anchor: c.anchor, atr: r2(atr(b5, 14).at(-1)), bias: bias.direction, regime5: intraday.regime, objective: rk.objective?.source ?? null });
  }
}

// ── 2. Signal identity / dedupe like the live store: same side+model+anchor (within 0.5 ATR) while the prior one is unresolved ──
// ── 3. Outcome simulation with the production exit stack (+ a V2 structural-exit variant) ──
function simulate(sig, stack) {
  const bars = b5all;
  const entryIdx = sig.i;
  const fill = sig.side === 'BUY' ? sig.entry + SPREAD : sig.entry;
  const risk = Math.abs(sig.entry - sig.sl);
  const geo = evaluateExecutableGeometry({ side: sig.side, price: fill, engineSl: sig.sl, engineTp2: sig.tp2, minRr: REAL.minEffectiveRr });
  if (!geo.valid) return { skipped: geo.reason, fill: r2(fill), risk: r2(risk) };
  let stops;
  if (stack === 'production') stops = computeProtectiveStops({ side: sig.side, fillPrice: fill, lot: 0.01, contractSize: CONTRACT, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sig.sl, plannedEntry: sig.entry, structuralMultiple: REAL.brokerStructuralSlMultiple, spread: SPREAD });
  else stops = { sl: sig.side === 'BUY' ? sig.sl - SPREAD : sig.sl + SPREAD, tp: sig.tp2, sl_basis: 'STRUCTURAL_V2' };
  const openSec = sig.t + 300 + FETCH_LAG + 5;
  const position = { side: sig.side, open_price: fill, open_time: new Date(openSec * 1000).toISOString(), initial_structural_risk: risk, engine: { structural_stop: sig.sl, engine_sl: sig.sl, setup_level: sig.anchor, planned_entry: sig.entry, engine_entry: sig.entry, engine_tp1: sig.tp1, engine_tp2: sig.tp2 } };
  let mfe = 0, mae = 0, exit = null;
  for (let j = entryIdx + 1; j < bars.length - 1; j++) {
    const b = bars[j];
    const fav = sig.side === 'BUY' ? b.high - fill : fill - (b.low + SPREAD);
    const adv = sig.side === 'BUY' ? fill - b.low : (b.high + SPREAD) - fill;
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    const hitSl = sig.side === 'BUY' ? b.low <= stops.sl : b.high + SPREAD >= stops.sl;
    const hitTp = stops.tp != null && (sig.side === 'BUY' ? b.high >= stops.tp : b.low + SPREAD <= stops.tp);
    if (hitSl) { exit = { reason: stack === 'production' ? `BROKER_SL_${stops.sl_basis}` : 'STRUCTURAL_SL', j, time: iso(b.time), price: stops.sl, pnl: (sig.side === 'BUY' ? stops.sl - fill : fill - stops.sl) }; break; }
    if (hitTp) { exit = { reason: stack === 'production' ? 'BROKER_TP_MONETARY_+30' : 'STRUCTURAL_TP2', j, time: iso(b.time), price: stops.tp, pnl: (sig.side === 'BUY' ? stops.tp - fill : fill - stops.tp) }; break; }
    const T = b.time + 300 + FETCH_LAG;
    const c5 = bars.slice(Math.max(0, j - (REQ - 2)), j + 1), c15 = confirmedAt('15m', T);
    const st = computeStructure(c5, STRUCTURE_PARAMS);
    const bias = computeBias({ confirmedBars: c15, params: INTRADAY_PARAMS });
    const { regime } = classifyRegime(c5, REGIME_PARAMS);
    const result = { primary_confirmed_bars: c5, evidence: { structure: st, regime }, bias, regime, timeframes: { '15m': { structure_state: bias.structure?.state ?? null }, '5m': { regime } }, action: 'WAIT', signal: null };
    const v = evaluateTradeManagement({ position, result });
    if (v.state !== 'HOLD') { exit = { reason: `${v.state}/${v.reason}`, j, time: iso(b.time), price: b.close, pnl: (sig.side === 'BUY' ? b.close - fill : fill - (b.close + SPREAD)) }; break; }
  }
  if (!exit) { const last = bars[bars.length - 2]; exit = { reason: 'OPEN_AT_END_OF_DATA', j: bars.length - 2, time: iso(last.time), price: last.close, pnl: (sig.side === 'BUY' ? last.close - fill : fill - (last.close + SPREAD)), open: true }; }
  const pnl = r2(exit.pnl); // USD at 0.01 lot (1 USD per 1.00), commission 0
  return { fill: r2(fill), risk: r2(risk), broker_sl: r2(stops.sl), broker_tp: r2(stops.tp), sl_basis: stops.sl_basis, mfe_r: r2(mfe / risk), mae_r: r2(mae / risk), exit: { ...exit, pnl }, pnl, r: r2(pnl / risk), closeIdx: exit.j, open: !!exit.open };
}

const signals = [];
let lastSig = null;
for (const d of decisions) {
  const sameThesis = lastSig && lastSig.side === d.side && lastSig.model === d.model && Math.abs(lastSig.anchor - d.anchor) <= 0.5 * Math.max(1, d.atr) && (lastSig.prod.open || d.i <= lastSig.prod.closeIdx);
  if (sameThesis) { lastSig.folded = (lastSig.folded ?? 0) + 1; continue; }
  const prod = simulate(d, 'production');
  const v2 = simulate(d, 'v2');
  const sig = { ...d, time: iso(d.t), day: new Date(d.t * 1000).toISOString().slice(0, 10), stop_dist: r2(Math.abs(d.entry - d.sl)), risk_at_0_01: r2(Math.abs(d.entry - d.sl) + COST), margin_0_01: r2(d.entry / LEVERAGE), prod, v2 };
  signals.push(sig); lastSig = sig;
}

// ── 4. Cross-check with the live store (class A, intraday 5m records only) ──
const liveA = STORE.filter((s) => s.timeframe === '5m').map((s) => ({ created: s.created_at, side: s.side, model: s.model, entry: s.entry, sl: s.stop_loss, rr: s.rr, quality: s.quality, status: s.status, realized_r: s.realized_r }));
const crossCheck = liveA.map((a) => {
  const at = Date.parse(a.created) / 1000;
  const m = signals.find((s) => Math.abs(s.t + 300 + FETCH_LAG - at) <= 400 && s.side === a.side);
  return { live: a, replay: m ? { time: m.time, model: m.model, entry: m.entry, sl: m.sl, rr: m.rr, quality: m.quality } : null, matched: !!m, modelMatch: m ? m.model === a.model : false };
});

// ── 5. Policy simulation ──
function runPolicy(pct, { breaker, multipliers, stack, marginCap = 0.40 }) {
  let equity = START_EQUITY, hwm = START_EQUITY, minEq = START_EQUITY, maxEq = START_EQUITY, maxDD = 0, maxDDusd = 0;
  let streak = 0, postBreakerHalf = false, winsInRow = 0, day = null, dayLosses = 0, preservation = false;
  let openUntil = -1;
  const c = { seen: 0, position_open: 0, breaker: 0, refused_risk: 0, refused_margin: 0, preservation: 0, geometry: 0, taken: 0, wins: 0, losses: 0, gp: 0, gl: 0, largestLossPct: 0, longestLossSeq: 0, rs: [], ruin: false, nearRuin: false, marginLockedEnd: false };
  let seq = 0;
  const path = [];
  for (const s of signals) {
    const o = s[stack];
    c.seen++;
    if (s.i <= openUntil) { c.position_open++; continue; }
    if (o.skipped) { c.geometry++; continue; }
    if (day !== s.day) { day = s.day; dayLosses = 0; }
    if (breaker && dayLosses >= 2) { c.breaker++; continue; }
    if (preservation) { c.preservation++; continue; }
    const dd = hwm > 0 ? (hwm - equity) / hwm : 0;
    let mGov = 1; if (dd >= GOV.preservation) { preservation = true; c.preservation++; continue; } else if (dd >= GOV.defensive) mGov = 0.25; else if (dd >= GOV.caution) mGov = 0.5;
    let mStreak = 1; if (streak >= 1 || postBreakerHalf) mStreak = 0.5;
    const permitted = equity * (pct / 100) * (multipliers ? mGov * mStreak : 1);
    if (s.risk_at_0_01 > permitted + 1e-9) { c.refused_risk++; continue; }
    const margin = s.margin_0_01;
    const marginOk = margin <= marginCap * equity && (equity - margin) >= 0.55 * equity && ((equity - s.risk_at_0_01) / margin) >= 2.0;
    if (!marginOk) { c.refused_margin++; continue; }
    // take the trade at 0.01
    c.taken++; openUntil = o.closeIdx;
    const pnl = o.pnl;
    equity = r2(equity + pnl);
    if (pnl > 0) { c.wins++; c.gp += pnl; streak = 0; winsInRow++; if (winsInRow >= 2) postBreakerHalf = false; seq = 0; dayLosses = 0; }
    else { c.losses++; c.gl += -pnl; streak++; winsInRow = 0; dayLosses++; seq++; c.longestLossSeq = Math.max(c.longestLossSeq, seq); if (dayLosses >= 2) postBreakerHalf = true; c.largestLossPct = Math.max(c.largestLossPct, -pnl / (equity - pnl)); }
    c.rs.push(o.r);
    hwm = Math.max(hwm, equity); maxEq = Math.max(maxEq, equity); minEq = Math.min(minEq, equity);
    const ddNow = (hwm - equity) / hwm; if (ddNow > maxDD) { maxDD = ddNow; maxDDusd = hwm - equity; }
    if (equity <= RUIN_EQUITY) c.ruin = true;
    if (ddNow >= NEAR_RUIN_DD) c.nearRuin = true;
    path.push({ time: s.time, side: s.side, model: s.model, risk: s.risk_at_0_01, permitted: r2(permitted), pnl, r: o.r, equity, dd: r2(ddNow * 100) });
  }
  c.marginLockedEnd = !(signals.at(-1).margin_0_01 <= marginCap * equity);
  const n = c.rs.length, avgR = n ? c.rs.reduce((a, b) => a + b, 0) / n : null;
  const reached = c.seen - c.position_open - c.geometry;
  return { pct, breaker, multipliers, stack, marginCap, counts: { ...c, rs: undefined }, ending_equity: equity, max_equity: maxEq, min_equity: minEq, max_dd_usd: r2(maxDDusd), max_dd_pct: r2(maxDD * 100), largest_single_loss_pct: r2(c.largestLossPct * 100), net: r2(c.gp - c.gl), gp: r2(c.gp), gl: r2(c.gl), profit_factor: c.gl > 0 ? r2(c.gp / c.gl) : (c.gp > 0 ? Infinity : null), win_rate: n ? r2(c.wins / n * 100) : null, avg_r: r2(avgR), expectancy_r: r2(avgR), participation_pct: reached ? r2(c.taken / reached * 100) : null, opportunities_reaching_policy: reached, path };
}
const views = {};
for (const view of [{ key: 'VIEW1_production_breaker', breaker: true }, { key: 'VIEW2_breaker_ignored', breaker: false }]) {
  views[view.key] = {};
  for (const mult of [true, false]) for (const stack of ['prod', 'v2']) {
    const k = `${mult ? 'v2_multipliers' : 'base_pct_only'}__${stack === 'prod' ? 'production_exits' : 'v2_structural_exits'}`;
    views[view.key][k] = POLICIES.map((p) => runPolicy(p, { breaker: view.breaker, multipliers: mult, stack }));
  }
  views[view.key]['base_pct_only__production_exits__marginCap50'] = POLICIES.map((p) => runPolicy(p, { breaker: view.breaker, multipliers: false, stack: 'prod', marginCap: 0.50 }));
}

// ── 6. Theoretical recovery table ──
const recovery = POLICIES.map((p) => { const row = { pct: p }; for (const n of [1, 2, 3, 5, 7, 10]) { const e = START_EQUITY * Math.pow(1 - p / 100, n); row[`after_${n}`] = r2(e); row[`recover_${n}_pct`] = r2((START_EQUITY / e - 1) * 100); } return row; });

// ── 7. Monte Carlo (seeded bootstrap) only if the completed-outcome pool is large enough ──
const pool = signals.filter((s) => !s.prod.open && !s.prod.skipped).map((s) => ({ risk: s.risk_at_0_01, pnl: s.prod.pnl, r: s.prod.r, margin: s.margin_0_01 }));
let monteCarlo = null;
if (pool.length >= 30) {
  let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const PATHS = 5000, N = 400; // 400 presented signals ~ the 6.5-week sample
  const seqs = Array.from({ length: PATHS }, () => Array.from({ length: N }, () => pool[Math.floor(rnd() * pool.length)]));
  monteCarlo = { paths: PATHS, presented_signals_per_path: N, pool_size: pool.length, semantics: 'VIEW2 (breaker ignored), production exits, identical sampled sequences across policies and modes; governor 8/12/20 %; margin cap 40 %', modes: {} };
  for (const mult of [false, true]) {
    const modeKey = mult ? 'v2_multipliers' : 'base_pct_only';
    monteCarlo.modes[modeKey] = {};
    for (const p of POLICIES) {
      const ends = [], dd20 = [], dd30 = [], lock = [], taken = [], pres = [];
      for (const seq of seqs) {
        let eq = START_EQUITY, hwm = eq, maxDD = 0, streak = 0, preservation = false, n = 0;
        for (const tr of seq) {
          if (preservation) break;
          const dd = (hwm - eq) / hwm; let m = 1; if (dd >= GOV.preservation) { preservation = true; break; } else if (dd >= GOV.defensive) m = 0.25; else if (dd >= GOV.caution) m = 0.5;
          if (mult && streak >= 1) m *= 0.5;
          const permitted = eq * (p / 100) * (mult ? m : 1);
          if (tr.risk > permitted) continue;
          if (!(tr.margin <= 0.4 * eq && (eq - tr.margin) >= 0.55 * eq && (eq - tr.risk) / tr.margin >= 2)) continue;
          eq += tr.pnl; n++; streak = tr.pnl > 0 ? 0 : streak + 1; hwm = Math.max(hwm, eq); maxDD = Math.max(maxDD, (hwm - eq) / hwm);
        }
        ends.push(eq); dd20.push(maxDD >= 0.20); dd30.push(maxDD >= 0.30); lock.push(!(pool[0].margin <= 0.4 * eq)); taken.push(n); pres.push(preservation);
      }
      const sorted = [...ends].sort((a, b) => a - b);
      monteCarlo.modes[modeKey][p] = { median_end: r2(sorted[Math.floor(PATHS / 2)]), p5_end: r2(sorted[Math.floor(PATHS * 0.05)]), p95_end: r2(sorted[Math.floor(PATHS * 0.95)]), p_dd_ge_20: r2(dd20.filter(Boolean).length / PATHS * 100), p_dd_ge_30: r2(dd30.filter(Boolean).length / PATHS * 100), p_cannot_afford_min_lot_at_end: r2(lock.filter(Boolean).length / PATHS * 100), p_preservation_lock: r2(pres.filter(Boolean).length / PATHS * 100), median_trades_taken: taken.sort((a, b) => a - b)[Math.floor(PATHS / 2)], p_end_below_start: r2(ends.filter((e) => e < START_EQUITY).length / PATHS * 100) };
    }
  }
  // strategy expectancy bootstrap (all 413 completed outcomes, production exits)
  const rs = pool.map((x) => x.r); const means = [], pfs = [];
  for (let k = 0; k < 5000; k++) { let sum = 0, gp = 0, gl = 0; for (let i = 0; i < rs.length; i++) { const x = pool[Math.floor(rnd() * pool.length)]; sum += x.r; if (x.pnl > 0) gp += x.pnl; else gl -= x.pnl; } means.push(sum / rs.length); pfs.push(gl > 0 ? gp / gl : 99); }
  means.sort((a, b) => a - b); pfs.sort((a, b) => a - b);
  monteCarlo.strategy_bootstrap = { n: rs.length, mean_r: r2(rs.reduce((a, b) => a + b, 0) / rs.length), mean_r_ci95: [r2(means[Math.floor(5000 * 0.025)]), r2(means[Math.floor(5000 * 0.975)])], pf_ci95: [r2(pfs[Math.floor(5000 * 0.025)]), r2(pfs[Math.floor(5000 * 0.975)])], p_mean_r_le_0: r2(means.filter((m) => m <= 0).length / 5000 * 100) };
}

// ── 8. Aggregate strategy statistics (class B, production exits) ──
const closed = signals.filter((s) => !s.prod.open && !s.prod.skipped);
const days = new Set(signals.map((s) => s.day)); const allDays = new Set(); for (let i = 0; i <= lastIdx; i++) if (b5all[i].time >= firstEvaluable) allDays.add(new Date(b5all[i].time * 1000).toISOString().slice(0, 10));
const stratStats = (arr, key) => { const rs = arr.map((s) => s[key].r).filter((x) => x != null); const w = arr.filter((s) => s[key].pnl > 0); const gp = w.reduce((a, s) => a + s[key].pnl, 0), gl = arr.filter((s) => s[key].pnl <= 0).reduce((a, s) => a - s[key].pnl, 0); return { n: arr.length, wins: w.length, win_rate: r2(w.length / arr.length * 100), avg_r: r2(rs.reduce((a, b) => a + b, 0) / rs.length), profit_factor: gl > 0 ? r2(gp / gl) : null, net_usd_at_0_01: r2(gp - gl), median_risk_at_0_01: r2([...arr].map((s) => s.risk_at_0_01).sort((a, b) => a - b)[Math.floor(arr.length / 2)]), risk_at_0_01_p25_p75: (() => { const a = [...arr].map((s) => s.risk_at_0_01).sort((x, y) => x - y); return [r2(a[Math.floor(a.length * 0.25)]), r2(a[Math.floor(a.length * 0.75)])]; })(), exits: Object.fromEntries(Object.entries(arr.reduce((m, s) => { const k = s[key].exit.reason; m[k] = (m[k] || 0) + 1; return m; }, {}))) }; };

const out = {
  generated_at: new Date().toISOString(), window: { from: iso(firstEvaluable), to: iso(b5all[lastIdx].time) }, sessions_evaluated: allDays.size, sessions_with_signals: days.size, confirmed_5m_candles_evaluated: evalCount,
  raw_signal_bars: decisions.length, distinct_signals: signals.length, completed_outcomes_production: closed.length,
  class_A_live_intraday_records: liveA.length, cross_check: crossCheck, cross_check_matched: crossCheck.filter((x) => x.matched).length,
  strategy_stats_production_exits: stratStats(closed, 'prod'), strategy_stats_v2_structural_exits: stratStats(signals.filter((s) => !s.v2.open && !s.v2.skipped), 'v2'),
  ruin_criteria: { RUIN: `equity <= ${RUIN_EQUITY} USD (50 % of start)`, NEAR_RUIN: 'peak-to-trough drawdown >= 30 %, or 0.01 lot unaffordable by the 40 % margin cap at the end' },
  policies: POLICIES, governor: GOV, views, recovery, monteCarlo, signals,
};
writeFileSync(join(HERE, 'seed_risk_study_results.json'), JSON.stringify(out, null, 1));

console.log('window', out.window, 'sessions', out.sessions_evaluated, 'candles', evalCount, 'raw signal bars', decisions.length, 'distinct signals', signals.length, 'completed', closed.length);
console.log('class A intraday live records', liveA.length, 'matched by replay', out.cross_check_matched);
for (const x of crossCheck) console.log('  A', x.live.created.slice(5, 16), x.live.side, x.live.model, 'q', x.live.quality, 'rr', x.live.rr, x.live.status, x.live.realized_r, '| B', x.replay ? `${x.replay.time} ${x.replay.model} rr ${x.replay.rr} q ${x.replay.quality}` : 'NO MATCH');
console.log('strategy (production exits)', JSON.stringify(out.strategy_stats_production_exits));
console.log('strategy (v2 structural exits)', JSON.stringify(out.strategy_stats_v2_structural_exits));
console.log('=== SIGNALS ===');
for (const s of signals) console.log(s.time, s.side, s.model, 'q', s.quality, 'rr', s.rr, 'e', s.entry, 'sl', s.sl, 'stop', s.stop_dist, 'risk@0.01', s.risk_at_0_01, 'margin', s.margin_0_01, '| prod', s.prod.skipped ?? `${s.prod.exit.reason} ${s.prod.pnl} (${s.prod.r}R)`, '| v2', s.v2.skipped ?? `${s.v2.exit.reason} ${s.v2.pnl} (${s.v2.r}R)`, s.folded ? `folded+${s.folded}` : '');
for (const [vk, v] of Object.entries(views)) for (const [k, rows] of Object.entries(v)) { console.log(`=== ${vk} / ${k} ===`); for (const r of rows) console.log(`  ${r.pct}%`, JSON.stringify({ ...r, path: undefined })); }
console.log('=== recovery ===', JSON.stringify(recovery));
console.log('=== monte carlo ===', monteCarlo ? JSON.stringify({ modes: monteCarlo.modes, strategy_bootstrap: monteCarlo.strategy_bootstrap }) : 'MONTE_CARLO_NOT_JUSTIFIED_DUE_TO_SAMPLE_SIZE (pool ' + pool.length + ')');
