/**
 * XAUUSD MASTER EDGE VALIDATION — research/replay only. Never imported by production.
 * Reads the MT5 bar snapshot in this folder and the live signal store (read-only);
 * writes only master_edge_results.json in this folder.
 *
 * Run from the repo root:  node validation/master_edge_validation/master_edge.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runPipeline } from '../../src/engine/pipeline.js';
import { classifyRegime, REGIME_PARAMS } from '../../src/engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { scoreQuality, classifySession } from '../../src/engine/quality.js';
import { atr, adxDi, ema } from '../../src/engine/math.js';
import { computeHtfContext, detectHtfConflict } from '../../src/engine/htf.js';
import { computeBias } from '../../src/engine/intraday/bias.js';
import { runIntradayPipeline, combineIntraday, resolveQualityThreshold } from '../../src/engine/intraday/pipeline5m.js';
import { evaluateIntradayModels } from '../../src/engine/intraday/models5m.js';
import { computeIntradayRisk } from '../../src/engine/intraday/risk5m.js';
import { INTRADAY_PARAMS } from '../../src/engine/intraday/params.js';
import { computeProtectiveStops, evaluateExecutableGeometry } from '../../src/engine/mt5Policy.js';
import { evaluateTradeManagement } from '../../src/engine/mt5TradeManagement.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, 'xauusdm_bars_master.json'), 'utf8'));
const STORE = JSON.parse(readFileSync(join(HERE, '..', 'mcp_engine_signals.json'), 'utf8')).signals;
const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400 };
const FETCH_LAG = 80, REQ = 500, SPREAD = 0.24, COST = 0.60, LEVERAGE = 200, CONTRACT = 100, START_EQUITY = 62.07;
const REAL = { profitTargetUsd: 30, maximumLossUsd: -50, brokerStructuralSlMultiple: 1.5, minEffectiveRr: 1.7 };
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ── fast confirmed-bar slices ──
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
function upperBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }
function confirmedAt(tf, T) { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = upperBound(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (REQ - 1)), end); }
const cache = { bias: new Map(), m30: new Map(), h1: new Map() };
function biasAt(T) { const cut = Math.floor(T / 900) * 900; if (!cache.bias.has(cut)) cache.bias.set(cut, computeBias({ confirmedBars: confirmedAt('15m', T), params: INTRADAY_PARAMS })); return cache.bias.get(cut); }
function m30At(T) { const cut = Math.floor(T / 1800) * 1800; if (!cache.m30.has(cut)) cache.m30.set(cut, runPipeline({ confirmedBars: confirmedAt('30m', T) })); return cache.m30.get(cut); }
function h1At(T) { const cut = Math.floor(T / 3600) * 3600; if (!cache.h1.has(cut)) cache.h1.set(cut, computeHtfContext(confirmedAt('1H', T), { includeCorrection: true })); return cache.h1.get(cut); }
const b5all = BARS['5m'];
const s5cache = new Map();
function s5At(i) { if (!s5cache.has(i)) s5cache.set(i, computeStructure(b5all.slice(Math.max(0, i - (REQ - 2)), i + 1), STRUCTURE_PARAMS)); return s5cache.get(i); }

// ── hooked mirror of runIntradayPipeline for the observational variants (identical rules, one concept swapped via biasFn) ──
function runVariant({ bars5, bias, m30, ctx1H, structure, regimeInfo, biasFn }) {
  const p = INTRADAY_PARAMS;
  const { regime, evidence: regimeEvidence } = regimeInfo;
  const b = biasFn ? biasFn(bias, { regime, structure }) : bias;
  if (!b || b.status !== 'OK') return { action: 'WAIT', wait_reason: 'BIAS_UNAVAILABLE' };
  if (regime === 'CHOP_UNCERTAIN' || !b.eligible_models?.length) return { action: 'WAIT', wait_reason: 'CHOP' };
  const atrVal = atr(bars5, 14).at(-1);
  const ema20 = ema(bars5.map((x) => x.close), 20);
  const { adx } = adxDi(bars5, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const atrRatio = regimeEvidence.atrRatio ?? 1;
  const candidate = evaluateIntradayModels({ bars: bars5, regime, structure, atrVal, atrRatio, ema20, bias: b, m30Regime: m30?.regime ?? null }, p);
  if (!candidate) return { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' };
  const risk = computeIntradayRisk({ candidate, bars: bars5, atrVal, structure5: structure, structure15: b.structure }, p);
  if (risk.gate !== 'OK') return { action: 'WAIT', wait_reason: risk.gate };
  const lastBar = bars5.at(-1);
  const overextensionRatio = Math.abs(lastBar.close - candidate.anchor) / (atrVal * p.overextendAtrMult);
  const quality = scoreQuality({ candidate: { ...candidate, overextensionRatio }, structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30?.regime ?? null, session: classifySession(lastBar.time), rr: risk.rr, minRR: p.minRR });
  const htfOpposed = detectHtfConflict(candidate.side, ctx1H);
  const penalised = htfOpposed ? Math.max(0, quality.score - p.htfOpposedQualityPenalty) : quality.score;
  let { threshold, basis } = resolveQualityThreshold({ bias: b, side: candidate.side, ctx1H, params: p });
  if (b._qOverride && b._qOverride > threshold) { threshold = b._qOverride; basis = 'variant_override'; }
  if (penalised < threshold) return { action: 'WAIT', wait_reason: 'NO_GOOD_ENTRY' };
  const intradayLike = { status: 'OK', regime, structure, correction: candidate.correction ?? { state: 'NONE' }, model: candidate.model, decision: { action: candidate.side, wait_reason: null, entry: risk.entry, stop_loss: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr }, quality: { ...quality, score: penalised, threshold, threshold_basis: basis }, evidence: { candidate, risk } };
  const combined = combineIntraday({ intraday: intradayLike, bias: b, m30, ctx1H });
  if (combined.action !== 'BUY' && combined.action !== 'SELL') return { action: 'WAIT', wait_reason: combined.wait_reason };
  return { action: combined.action, candidate, risk, quality: intradayLike.quality, atrVal, biasUsed: b };
}
const VARIANTS = {
  A_CHOCH_NEUTRALIZES_STALE_BIAS: (bias) => { if ((bias.direction === 'BULLISH' && bias.structure?.state === 'BEARISH') || (bias.direction === 'BEARISH' && bias.structure?.state === 'BULLISH')) return { ...bias, direction: 'NEUTRAL', eligible_models: ['BO', 'SR'], _variant: 'A' }; return bias; },
  B_5M_FLIP_CONFIRMED_STRICT_QUALITY: (bias, { regime, structure }) => { const dir = structure?.state; if (!dir || bias.direction === 'NEUTRAL' || dir === bias.direction) return bias; const confirmed = (dir === 'BULLISH' && regime === 'BULL_TREND') || (dir === 'BEARISH' && regime === 'BEAR_TREND'); if (!confirmed) return bias; return { ...bias, direction: dir, eligible_models: ['MC', 'PB', 'BO', 'SR'], _qOverride: 75, _variant: 'B' }; },
  C_15M_STRUCTURE_BIAS_UNDER_TRANSITION: (bias) => { if (bias.regime !== 'TRANSITION' || !bias.structure?.state) return bias; return { ...bias, direction: bias.structure.state, eligible_models: ['MC', 'PB', 'BO', 'SR'], _variant: 'C' }; },
};

// ── 1. replay every confirmed 5m close ──
const firstEvaluable = Math.max(b5all[REQ - 1].time, BARS['15m'][REQ - 1].time, BARS['30m'][REQ - 1].time, BARS['1H'][REQ - 1].time);
const lastIdx = b5all.length - 2;
const raw = { CURRENT: [], A: [], B: [], C: [] };
const lagBars = []; // per-bar lag observation
let evalCount = 0; const sessions = new Set();
for (let i = 0; i <= lastIdx; i++) {
  const t = b5all[i].time; if (t < firstEvaluable) continue;
  const T = t + 300 + FETCH_LAG;
  const b5 = b5all.slice(Math.max(0, i - (REQ - 2)), i + 1);
  const bias = biasAt(T), m30 = m30At(T), ctx1H = h1At(T);
  const intraday = runIntradayPipeline({ bars5: b5, bias, m30Regime: m30.regime, ctx1H, params: INTRADAY_PARAMS });
  const live = combineIntraday({ intraday, bias, m30, ctx1H });
  evalCount++; sessions.add(day(t));
  const structure = intraday.structure ?? s5At(i);
  const regimeInfo = classifyRegime(b5, REGIME_PARAMS);
  const ctx = { regime5: intraday.regime ?? regimeInfo.regime, s5state: structure?.state ?? null, s5event: structure?.lastEvent?.type ?? null, biasDir: bias.direction, biasRegime: bias.regime, biasStructure: bias.structure?.state ?? null, freshChoch: bias.fresh_opposing_choch?.direction ?? null, m30regime: m30.regime, m30structure: m30.structure?.state ?? null, h1regime: ctx1H.regime, h1structure: ctx1H.structure_direction };
  const lag = (bias.direction === 'BULLISH' && ctx.s5state === 'BEARISH') || (bias.direction === 'BEARISH' && ctx.s5state === 'BULLISH');
  lagBars.push({ i, t, lag, biasDir: bias.direction, s5state: ctx.s5state, current: live.action, wait: live.wait_reason ?? null });
  if (live.action === 'BUY' || live.action === 'SELL') {
    const c = intraday.evidence.candidate, rk = intraday.evidence.risk;
    raw.CURRENT.push({ i, t, side: live.action, model: intraday.model, quality: intraday.quality.score, threshold: intraday.quality.threshold, qBreakdown: intraday.quality.breakdown, entry: rk.entry, sl: rk.stop_loss, tp1: rk.tp1, tp2: rk.tp2, rr: rk.rr, anchor: c.anchor, atr: r2(atr(b5, 14).at(-1)), objective: rk.objective?.source ?? null, slSource: rk.sl_source ?? null, ctx, lag });
  }
  for (const [key, fn] of Object.entries(VARIANTS)) {
    const v = runVariant({ bars5: b5, bias, m30, ctx1H, structure, regimeInfo, biasFn: fn });
    if (v.action === 'BUY' || v.action === 'SELL') raw[key[0]].push({ i, t, side: v.action, model: v.candidate.model, quality: v.quality.score, threshold: v.quality.threshold, entry: v.risk.entry, sl: v.risk.stop_loss, tp1: v.risk.tp1, tp2: v.risk.tp2, rr: v.risk.rr, anchor: v.candidate.anchor, atr: r2(v.atrVal), objective: v.risk.objective?.source ?? null, ctx, lag, variantApplied: !!v.biasUsed?._variant });
  }
}

// ── 2. outcome simulation (production exit stack; V2 structural exits as secondary) ──
function simulate(sig, stack) {
  const fill = sig.side === 'BUY' ? sig.entry + SPREAD : sig.entry;
  const risk = Math.abs(sig.entry - sig.sl);
  const geo = evaluateExecutableGeometry({ side: sig.side, price: fill, engineSl: sig.sl, engineTp2: sig.tp2, minRr: REAL.minEffectiveRr });
  if (!geo.valid) return { skipped: geo.reason, effRr: geo.rr ?? null };
  const stops = stack === 'production'
    ? computeProtectiveStops({ side: sig.side, fillPrice: fill, lot: 0.01, contractSize: CONTRACT, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sig.sl, plannedEntry: sig.entry, structuralMultiple: REAL.brokerStructuralSlMultiple, spread: SPREAD })
    : { sl: sig.side === 'BUY' ? sig.sl - SPREAD : sig.sl + SPREAD, tp: sig.tp2, sl_basis: 'STRUCTURAL_V2' };
  const openSec = sig.t + 300 + FETCH_LAG + 5;
  const position = { side: sig.side, open_price: fill, open_time: new Date(openSec * 1000).toISOString(), initial_structural_risk: risk, engine: { structural_stop: sig.sl, engine_sl: sig.sl, setup_level: sig.anchor, planned_entry: sig.entry, engine_entry: sig.entry, engine_tp1: sig.tp1, engine_tp2: sig.tp2 } };
  let mfe = 0, mae = 0, exit = null, mfeBeforeExit = 0, maeBeforeExit = 0;
  for (let j = sig.i + 1; j <= lastIdx; j++) {
    const b = b5all[j];
    const fav = sig.side === 'BUY' ? b.high - fill : fill - (b.low + SPREAD);
    const adv = sig.side === 'BUY' ? fill - b.low : (b.high + SPREAD) - fill;
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    const hitSl = sig.side === 'BUY' ? b.low <= stops.sl : b.high + SPREAD >= stops.sl;
    const hitTp = stops.tp != null && (sig.side === 'BUY' ? b.high >= stops.tp : b.low + SPREAD <= stops.tp);
    if (hitSl) { exit = { reason: stack === 'production' ? (stops.sl_basis === 'STRUCTURAL' ? 'BROKER_SL_STRUCTURAL_1.5R' : 'BROKER_SL_MONETARY') : 'STRUCTURAL_SL', j, pnl: sig.side === 'BUY' ? stops.sl - fill : fill - stops.sl }; break; }
    if (hitTp) { exit = { reason: stack === 'production' ? 'BROKER_TP_MONETARY_+30' : 'STRUCTURAL_TP2', j, pnl: sig.side === 'BUY' ? stops.tp - fill : fill - stops.tp }; break; }
    const T = b.time + 300 + FETCH_LAG;
    const c5 = b5all.slice(Math.max(0, j - (REQ - 2)), j + 1);
    const st = s5At(j); const bias = biasAt(T); const { regime } = classifyRegime(c5, REGIME_PARAMS);
    const result = { primary_confirmed_bars: c5, evidence: { structure: st, regime }, bias, regime, timeframes: { '15m': { structure_state: bias.structure?.state ?? null }, '5m': { regime } }, action: 'WAIT', signal: null };
    const v = evaluateTradeManagement({ position, result });
    if (v.state !== 'HOLD') { exit = { reason: v.state, sub: v.reason, trigger: v.trigger ?? null, j, pnl: sig.side === 'BUY' ? b.close - fill : fill - (b.close + SPREAD) }; break; }
  }
  if (!exit) return { skipped: 'OPEN_AT_END_OF_DATA' };
  const pnl = r2(exit.pnl);
  return { fill: r2(fill), risk: r2(risk), effRr: geo.rr, broker_sl: r2(stops.sl), broker_tp: r2(stops.tp), sl_basis: stops.sl_basis, mfe: r2(mfe), mae: r2(mae), mfe_r: r2(mfe / risk), mae_r: r2(mae / risk), mfe_atr: r2(mfe / sig.atr), mae_atr: r2(mae / sig.atr), exit: exit.reason, exit_sub: exit.sub ?? null, exit_trigger: exit.trigger ?? null, closeIdx: exit.j, hold_bars: exit.j - sig.i, pnl, r: r2(pnl / risk) };
}
function dedupeAndSimulate(list) {
  const out = []; let last = null;
  for (const d of list) {
    const same = last && last.side === d.side && last.model === d.model && Math.abs(last.anchor - d.anchor) <= 0.5 * Math.max(1, d.atr) && d.i <= (last.prod?.closeIdx ?? Infinity);
    if (same) { last.folded = (last.folded ?? 0) + 1; continue; }
    const prod = simulate(d, 'production'); const v2 = simulate(d, 'v2');
    const s = { ...d, time: iso(d.t), day: day(d.t), stop_dist: r2(Math.abs(d.entry - d.sl)), risk_at_0_01: r2(Math.abs(d.entry - d.sl) + COST), margin_0_01: r2(d.entry / LEVERAGE), prod, v2 };
    out.push(s); last = s;
  }
  return out;
}
const SIG = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, dedupeAndSimulate(v)]));
const done = (arr) => arr.filter((s) => !s.prod.skipped);

// ── 3. statistics ──
function stats(arr, key = 'prod') {
  const c = arr.filter((s) => !s[key].skipped); const n = c.length;
  if (!n) return { n: 0 };
  const rs = c.map((s) => s[key].r); const pnls = c.map((s) => s[key].pnl);
  const wins = c.filter((s) => s[key].pnl > 0), losses = c.filter((s) => s[key].pnl <= 0);
  const gp = wins.reduce((a, s) => a + s[key].pnl, 0), gl = losses.reduce((a, s) => a - s[key].pnl, 0);
  const mean = rs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const sorted = [...rs].sort((a, b) => a - b);
  let ls = 0, ws = 0, maxLs = 0, maxWs = 0; for (const s of c) { if (s[key].pnl > 0) { ws++; ls = 0; } else { ls++; ws = 0; } maxLs = Math.max(maxLs, ls); maxWs = Math.max(maxWs, ws); }
  let boot = null; if (n >= 10) { const ms = []; for (let k = 0; k < 1000; k++) { let sum = 0; for (let q = 0; q < n; q++) sum += rs[Math.floor(rnd() * n)]; ms.push(sum / n); } ms.sort((a, b) => a - b); boot = [r3(ms[Math.floor(1000 * 0.025)]), r3(ms[Math.floor(1000 * 0.975)])]; }
  const avgR = (xs) => (xs.length ? r3(xs.reduce((a, s) => a + s[key].r, 0) / xs.length) : null);
  return { n, wins: wins.length, win_rate: r2(wins.length / n * 100), profit_factor: gl > 0 ? r2(gp / gl) : null, mean_r: r3(mean), median_r: r3(sorted[Math.floor(n / 2)]), total_r: r2(rs.reduce((a, b) => a + b, 0)), net_usd: r2(gp - gl), avg_win_r: avgR(wins), avg_loss_r: avgR(losses), max_win_r: r2(Math.max(...rs)), max_loss_r: r2(Math.min(...rs)), max_loss_streak: maxLs, max_win_streak: maxWs, mean_mae_r: r2(c.reduce((a, s) => a + s[key].mae_r, 0) / n), mean_mfe_r: r2(c.reduce((a, s) => a + s[key].mfe_r, 0) / n), avg_hold_bars: r2(c.reduce((a, s) => a + s[key].hold_bars, 0) / n), ci95_normal: [r3(mean - 1.96 * sd / Math.sqrt(n)), r3(mean + 1.96 * sd / Math.sqrt(n))], ci95_bootstrap: boot };
}
function classify(st, wf) {
  if (!st || st.n < 10) return 'NO_DEMONSTRATED_EDGE (n<10)';
  const lo = st.ci95_bootstrap?.[0] ?? st.ci95_normal[0], hi = st.ci95_bootstrap?.[1] ?? st.ci95_normal[1];
  const wfOk = wf ? (wf.discovery.mean_r > 0 && wf.validation.mean_r > 0) : true;
  if (hi < 0 || (st.n >= 30 && st.profit_factor !== null && st.profit_factor < 0.8 && st.mean_r < -0.1)) return 'NEGATIVE_EVIDENCE';
  if (st.n >= 100 && lo > 0 && st.profit_factor > 1.2 && wfOk) return 'EDGE_SUPPORTED';
  if (st.n >= 30 && st.mean_r > 0.1 && st.profit_factor > 1.1) return 'PROMISING_BUT_UNPROVEN';
  return 'NO_DEMONSTRATED_EDGE';
}
const CUR = SIG.CURRENT; const CURd = done(CUR);
const sessionList = [...sessions].sort(); const splitIdx = Math.floor(sessionList.length * 0.6); const splitDay = sessionList[splitIdx];
const inDisc = (s) => s.day < splitDay, inVal = (s) => s.day >= splitDay;
const walk = (arr, key = 'prod') => ({ split_day: splitDay, discovery: stats(arr.filter(inDisc), key), validation: stats(arr.filter(inVal), key) });
const groupBy = (arr, fn) => { const m = {}; for (const s of arr) { const k = fn(s); (m[k] ??= []).push(s); } return m; };
const groupStats = (arr, fn, key = 'prod') => Object.fromEntries(Object.entries(groupBy(arr, fn)).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, stats(v, key)]));

const overall = stats(CUR); const wfOverall = walk(CUR);
const byModel = Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => { const arr = CUR.filter((s) => s.model === m); const st = stats(arr); const wf = walk(arr); return [m, { ...st, signal_count: arr.length, walk_forward: wf, classification: classify(st, wf), by_side: groupStats(arr, (s) => s.side) }]; }));
const bySide = groupStats(CUR, (s) => s.side);
const align = (s) => { const b = s.ctx.biasDir, r = s.ctx.regime5; if (b === 'NEUTRAL') return `15m_NEUTRAL_${s.ctx.biasRegime}`; const rt = r === 'BULL_TREND' ? 'BULLISH' : r === 'BEAR_TREND' ? 'BEARISH' : null; if (!rt) return `15m_${b}__5m_${r}`; return rt === b ? '5m_trend_ALIGNED_with_15m' : '5m_trend_OPPOSED_to_15m'; };
const m30rel = (s) => { const r = s.ctx.m30regime; if (r === 'BULL_TREND' || r === 'BEAR_TREND') return ((r === 'BULL_TREND') === (s.side === 'BUY')) ? '30m_ALIGNED' : '30m_CONFLICTED'; return `30m_${r}`; };
const h1rel = (s) => { const r = s.ctx.h1regime; if (r === 'BULL_TREND' || r === 'BEAR_TREND') return ((r === 'BULL_TREND') === (s.side === 'BUY')) ? '1H_ALIGNED' : '1H_CONFLICTED'; return `1H_${r}`; };
const regimes = { by_5m_regime: groupStats(CUR, (s) => s.ctx.regime5), by_15m_regime: groupStats(CUR, (s) => s.ctx.biasRegime), by_15m_bias: groupStats(CUR, (s) => s.ctx.biasDir), by_30m_regime: groupStats(CUR, (s) => s.ctx.m30regime), by_1H_regime: groupStats(CUR, (s) => s.ctx.h1regime), by_5m_vs_15m: groupStats(CUR, align), by_30m_relation: groupStats(CUR, m30rel), by_1H_relation: groupStats(CUR, h1rel), by_5m_structure_vs_side: groupStats(CUR, (s) => (s.ctx.s5state === (s.side === 'BUY' ? 'BULLISH' : 'BEARISH')) ? 'WITH_5m_structure' : 'AGAINST_5m_structure'), by_lag_flag: groupStats(CUR, (s) => (s.lag ? 'signal_during_15m_lag' : 'no_lag')), by_session: groupStats(CUR, (s) => classifySession(s.t)) };
const stopBucket = (s) => { const d = s.stop_dist; return d < 3 ? 'a_<3' : d < 5 ? 'b_3-5' : d < 8 ? 'c_5-8' : d < 12 ? 'd_8-12' : d < 20 ? 'e_12-20' : 'f_>20'; };
const byStop = Object.fromEntries(Object.entries(groupBy(CUR, stopBucket)).sort().map(([k, v]) => [k, { ...stats(v), models: Object.fromEntries(Object.entries(groupBy(v, (s) => s.model)).map(([m, a]) => [m, a.length])), exits: Object.fromEntries(Object.entries(groupBy(done(v), (s) => s.prod.exit)).map(([m, a]) => [m, a.length])) }]));
const rrBucket = (x) => (x < 2 ? 'a_1.7-2.0' : x < 2.5 ? 'b_2.0-2.5' : x < 3 ? 'c_2.5-3.0' : 'd_3.0+');
const byRR = { planned: Object.fromEntries(Object.entries(groupBy(CUR, (s) => rrBucket(s.rr))).sort().map(([k, v]) => [k, stats(v)])), effective_at_fill: Object.fromEntries(Object.entries(groupBy(CURd, (s) => rrBucket(s.prod.effRr))).sort().map(([k, v]) => [k, stats(v)])) };
const qBucket = (q) => (q < 70 ? 'a_65-69' : q < 75 ? 'b_70-74' : q < 80 ? 'c_75-79' : q < 85 ? 'd_80-84' : 'e_85+');
const byQuality = Object.fromEntries(Object.entries(groupBy(CUR, (s) => qBucket(s.quality))).sort().map(([k, v]) => [k, stats(v)]));
const qComponents = {}; for (const comp of ['qStructure', 'qTrigger', 'qEntryLocation', 'qMomentum', 'qVolatility', 'qMtf', 'qSession', 'qRr']) { const vals = CURd.map((s) => ({ x: s.qBreakdown?.[comp] ?? 0, r: s.prod.r })); const mx = vals.reduce((a, v) => a + v.x, 0) / vals.length, mr = vals.reduce((a, v) => a + v.r, 0) / vals.length; const cov = vals.reduce((a, v) => a + (v.x - mx) * (v.r - mr), 0), sx = Math.sqrt(vals.reduce((a, v) => a + (v.x - mx) ** 2, 0)), sr = Math.sqrt(vals.reduce((a, v) => a + (v.r - mr) ** 2, 0)); const hi = vals.filter((v) => v.x >= mx), lo = vals.filter((v) => v.x < mx); qComponents[comp] = { corr_with_r: r3(sx && sr ? cov / (sx * sr) : 0), mean_r_above_avg: r3(hi.length ? hi.reduce((a, v) => a + v.r, 0) / hi.length : null), mean_r_below_avg: r3(lo.length ? lo.reduce((a, v) => a + v.r, 0) / lo.length : null), n_above: hi.length, n_below: lo.length }; }
const exitAudit = { production: Object.fromEntries(Object.entries(groupBy(CURd, (s) => s.prod.exit)).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, stats(v)])), v2_structural: Object.fromEntries(Object.entries(groupBy(done(CUR.map((s) => ({ ...s, prod: s.v2 }))), (s) => s.prod.exit)).sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, stats(v)])), overall_v2: stats(CUR, 'v2'), walk_forward_v2: walk(CUR, 'v2') };
const lossMag = (() => { const L = CURd.filter((s) => s.prod.pnl <= 0); const th = [1.0, 1.2, 1.5, 2.0]; const out = { losses: L.length }; for (const x of th) { const sub = L.filter((s) => s.prod.r < -x); out[`gt_${x}R`] = { n: sub.length, pct_of_losses: r2(sub.length / L.length * 100), by_exit: Object.fromEntries(Object.entries(groupBy(sub, (s) => s.prod.exit)).map(([k, v]) => [k, v.length])) }; } out.sl_basis_of_broker_sl_losses = Object.fromEntries(Object.entries(groupBy(L.filter((s) => s.prod.exit.startsWith('BROKER_SL')), (s) => s.prod.sl_basis)).map(([k, v]) => [k, v.length])); out.thesis_stop_close_mean_r = r3(L.filter((s) => s.prod.exit === 'THESIS_INVALIDATION_CLOSE' && s.prod.exit_sub === 'THESIS_STOP_CLOSE').reduce((a, s, _, arr) => a + s.prod.r / arr.length, 0)); return out; })();
const timing = Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR', 'ALL'].map((m) => { const arr = m === 'ALL' ? CURd : CURd.filter((s) => s.model === m); const W = arr.filter((s) => s.prod.pnl > 0), L = arr.filter((s) => s.prod.pnl <= 0); const avg = (xs, f) => (xs.length ? r2(xs.reduce((a, s) => a + f(s), 0) / xs.length) : null); const med = (xs, f) => { if (!xs.length) return null; const v = xs.map(f).sort((a, b) => a - b); return r2(v[Math.floor(v.length / 2)]); }; return [m, { winners: { n: W.length, mae_usd_avg: avg(W, (s) => s.prod.mae), mae_usd_median: med(W, (s) => s.prod.mae), mae_atr: avg(W, (s) => s.prod.mae_atr), mae_r: avg(W, (s) => s.prod.mae_r), share_mae_over_0_5R: r2(W.filter((s) => s.prod.mae_r > 0.5).length / Math.max(1, W.length) * 100), hold_bars: avg(W, (s) => s.prod.hold_bars) }, losers: { n: L.length, mfe_usd_avg: avg(L, (s) => s.prod.mfe), mfe_usd_median: med(L, (s) => s.prod.mfe), mfe_atr: avg(L, (s) => s.prod.mfe_atr), mfe_r: avg(L, (s) => s.prod.mfe_r), share_mfe_over_1R: r2(L.filter((s) => s.prod.mfe_r >= 1).length / Math.max(1, L.length) * 100), share_mfe_under_0_25R: r2(L.filter((s) => s.prod.mfe_r < 0.25).length / Math.max(1, L.length) * 100), hold_bars: avg(L, (s) => s.prod.hold_bars) } }]; }));

// ── 4. breaker audit at flat 0.01 (no capital policy) ──
function breakerPath(arr, breaker) {
  let openUntil = -1, dayK = null, dayLosses = 0, cumR = 0, peakR = 0, maxDDR = 0, cumUsd = 0, peakUsd = 0, maxDDUsd = 0, ls = 0, maxLs = 0;
  const c = { taken: 0, blocked: [], position_open: 0 };
  for (const s of arr) { if (s.prod.skipped) continue; if (s.i <= openUntil) { c.position_open++; s.breakerView = 'POSITION_OPEN'; continue; } if (dayK !== s.day) { dayK = s.day; dayLosses = 0; } if (breaker && dayLosses >= 2) { c.blocked.push(s); s.breakerView = 'BREAKER_BLOCKED'; continue; } c.taken++; if (breaker) s.breakerView = 'TAKEN'; openUntil = s.prod.closeIdx; cumR += s.prod.r; cumUsd += s.prod.pnl; if (s.prod.pnl <= 0) { dayLosses++; ls++; maxLs = Math.max(maxLs, ls); } else { dayLosses = 0; ls = 0; } peakR = Math.max(peakR, cumR); maxDDR = Math.max(maxDDR, peakR - cumR); peakUsd = Math.max(peakUsd, cumUsd); maxDDUsd = Math.max(maxDDUsd, peakUsd - cumUsd); }
  return { taken: c.taken, position_open: c.position_open, blocked: c.blocked.length, blocked_outcomes: stats(c.blocked), net_r: r2(cumR), net_usd: r2(cumUsd), max_dd_r: r2(maxDDR), max_dd_usd: r2(maxDDUsd), max_loss_streak: maxLs };
}
const breakerAudit = { with_breaker: breakerPath(CUR, true), without_breaker: breakerPath(CUR, false) };

// ── 5. 15m lag quantification + variant comparison with walk-forward ──
const episodes = []; let ep = null;
for (const b of lagBars) { if (b.lag) { if (!ep) ep = { start: b.t, bars: 0, biasDir: b.biasDir, current_signals: 0 }; ep.bars++; if (b.current !== 'WAIT') ep.current_signals++; } else if (ep) { ep.end = b.t; episodes.push(ep); ep = null; } }
if (ep) { ep.end = lagBars.at(-1).t; episodes.push(ep); }
const lagStats = { bars_total: lagBars.length, lag_bars: lagBars.filter((b) => b.lag).length, lag_share_pct: r2(lagBars.filter((b) => b.lag).length / lagBars.length * 100), episodes: episodes.length, episode_bars_mean: r2(episodes.reduce((a, e) => a + e.bars, 0) / Math.max(1, episodes.length)), episode_bars_median: episodes.length ? [...episodes].map((e) => e.bars).sort((a, b) => a - b)[Math.floor(episodes.length / 2)] : null, episode_bars_max: Math.max(0, ...episodes.map((e) => e.bars)), current_signals_during_lag: CUR.filter((s) => s.lag).length, current_signals_during_lag_stats: stats(CUR.filter((s) => s.lag)) };
function compareVariant(key) {
  const V = SIG[key]; const curKeys = new Set(CUR.map((s) => `${s.i}|${s.side}`)); const vKeys = new Set(V.map((s) => `${s.i}|${s.side}`));
  const added = V.filter((s) => !curKeys.has(`${s.i}|${s.side}`)), removed = CUR.filter((s) => !vKeys.has(`${s.i}|${s.side}`));
  const whipsaw = added.filter((s) => { const later = lagBars.find((b) => b.i > s.i && b.i <= s.i + 12); return s.variantApplied && later && !later.lag; });
  return { total: stats(V), walk_forward: walk(V), added: { n: added.length, stats: stats(added), walk_forward: walk(added), during_lag: added.filter((s) => s.lag).length }, removed: { n: removed.length, stats: stats(removed) }, false_reversal_proxy: { n: whipsaw.length, stats: stats(whipsaw), definition: 'variant-added trade whose 15m-vs-5m disagreement resolved back within 12 bars' }, breaker_path: breakerPath(V, true) };
}
const variants = Object.fromEntries(['A', 'B', 'C'].map((k) => [k, compareVariant(k)]));

// ── 6. loss drivers ──
const drivers = []; const addDriver = (label, arr, kind) => { const L = arr.filter((s) => !s.prod.skipped); if (L.length < 8) return; const neg = L.filter((s) => s.prod.r < 0).reduce((a, s) => a + s.prod.r, 0); const st = stats(L); drivers.push({ driver: label, n: L.length, total_negative_r: r2(neg), net_r: st.total_r, mean_r: st.mean_r, ci95: st.ci95_bootstrap ?? st.ci95_normal, confidence: st.ci95_bootstrap && st.ci95_bootstrap[1] < 0 ? 'HIGH (CI below 0)' : st.n >= 30 ? 'MEDIUM' : 'LOW', likely: kind }); };
for (const m of ['MC', 'PB', 'BO', 'SR', 'MR']) addDriver(`model ${m}`, CUR.filter((s) => s.model === m), 'STRATEGY DESIGN');
for (const k of Object.keys(regimes.by_5m_vs_15m)) addDriver(`regime ${k}`, CUR.filter((s) => align(s) === k), 'STRATEGY DESIGN');
for (const k of ['30m_CONFLICTED', '1H_CONFLICTED']) addDriver(k, CUR.filter((s) => (k.startsWith('30m') ? m30rel(s) : h1rel(s)) === k), 'STRATEGY DESIGN');
for (const k of Object.keys(byStop)) addDriver(`stop bucket ${k}`, CUR.filter((s) => stopBucket(s) === k), 'RISK MANAGEMENT');
for (const k of Object.keys(byQuality)) addDriver(`quality ${k}`, CUR.filter((s) => qBucket(s.quality) === k), 'STRATEGY DESIGN');
for (const k of ['BUY', 'SELL']) addDriver(`side ${k}`, CUR.filter((s) => s.side === k), 'STRATEGY DESIGN');
addDriver('exit BROKER_SL_STRUCTURAL_1.5R', CURd.filter((s) => s.prod.exit === 'BROKER_SL_STRUCTURAL_1.5R'), 'RISK MANAGEMENT');
addDriver('exit THESIS_STOP_CLOSE', CURd.filter((s) => s.prod.exit_sub === 'THESIS_STOP_CLOSE'), 'EXECUTION');
addDriver('exit THESIS_DETERIORATION', CURd.filter((s) => s.prod.exit === 'THESIS_DETERIORATION_CLOSE'), 'EXECUTION');
addDriver('entry timing: losers with MFE>=1R (gave back a win)', CURd.filter((s) => s.prod.pnl <= 0 && s.prod.mfe_r >= 1), 'EXECUTION');
addDriver('signals during 15m lag', CUR.filter((s) => s.lag), 'STRATEGY DESIGN');
drivers.sort((a, b) => a.total_negative_r - b.total_negative_r);

// ── 7. Monte Carlo on CURRENT outcomes (deterministic seed) ──
const pool = CURd.map((s) => ({ r: s.prod.r, pnl: s.prod.pnl, risk: s.risk_at_0_01, margin: s.margin_0_01 }));
const mc = (() => { const P = 5000, N = pool.length; const means = [], dds = [], streaks = []; for (let k = 0; k < P; k++) { let sum = 0, cum = 0, peak = 0, dd = 0, ls = 0, mls = 0; for (let q = 0; q < N; q++) { const x = pool[Math.floor(rnd() * N)]; sum += x.r; cum += x.r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); if (x.pnl <= 0) { ls++; mls = Math.max(mls, ls); } else ls = 0; } means.push(sum / N); dds.push(dd); streaks.push(mls); } means.sort((a, b) => a - b); dds.sort((a, b) => a - b); streaks.sort((a, b) => a - b); const pc = (a, p) => a[Math.floor(P * p)]; return { paths: P, trades_per_path: N, mean_r: { p5: r3(pc(means, 0.05)), p50: r3(pc(means, 0.5)), p95: r3(pc(means, 0.95)), p_le_0: r2(means.filter((m) => m <= 0).length / P * 100) }, max_dd_r: { p50: r2(pc(dds, 0.5)), p95: r2(pc(dds, 0.95)) }, max_loss_streak: { p50: pc(streaks, 0.5), p95: pc(streaks, 0.95) } }; })();

// ── 8. capital policy research (SEED) with alternative loss-state designs ──
const GOV = { caution: 0.08, defensive: 0.12, preservation: 0.20 };
function runPolicy(pct, { mode, breaker = true, marginCap = 0.40 }) {
  let equity = START_EQUITY, hwm = equity, minEq = equity, maxEq = equity, maxDD = 0, streak = 0, lossAt = null, presentedSinceLoss = 0, dayK = null, dayLosses = 0, preservation = false, openUntil = -1;
  const c = { seen: 0, position_open: 0, breaker: 0, refused_risk: 0, refused_margin: 0, preservation: 0, taken: 0, wins: 0, losses: 0, gp: 0, gl: 0, largestLossPct: 0, longestLossSeq: 0 }; let seq = 0;
  for (const s of CUR) { const o = s.prod; c.seen++; if (o.skipped) continue; if (s.i <= openUntil) { c.position_open++; continue; } if (dayK !== s.day) { dayK = s.day; dayLosses = 0; if (mode === 'dayroll_reset') streak = 0; } presentedSinceLoss++; if (breaker && dayLosses >= 2) { c.breaker++; continue; } if (preservation) { c.preservation++; continue; }
    const dd = (hwm - equity) / hwm; let mGov = 1; if (dd >= GOV.preservation) { preservation = true; c.preservation++; continue; } else if (dd >= GOV.defensive) mGov = 0.25; else if (dd >= GOV.caution) mGov = 0.5;
    let mStreak = 1; if (mode === 'v2_deadlock' && streak >= 1) mStreak = 0.5; if (mode === 'dayroll_reset' && streak >= 1) mStreak = 0.5; if (mode === 'signal_decay10' && streak >= 1 && presentedSinceLoss <= 10) mStreak = 0.5; if (mode === 'cooling_4h' && lossAt != null && s.t - lossAt < 4 * 3600) mStreak = 0.5;
    const permitted = equity * (pct / 100) * mGov * mStreak;
    if (s.risk_at_0_01 > permitted + 1e-9) { c.refused_risk++; continue; }
    if (!(s.margin_0_01 <= marginCap * equity && (equity - s.margin_0_01) >= 0.55 * equity && ((equity - s.risk_at_0_01) / s.margin_0_01) >= 2.0)) { c.refused_margin++; continue; }
    c.taken++; openUntil = o.closeIdx; equity = r2(equity + o.pnl);
    if (o.pnl > 0) { c.wins++; c.gp += o.pnl; streak = 0; seq = 0; dayLosses = 0; } else { c.losses++; c.gl += -o.pnl; streak++; seq++; dayLosses++; lossAt = b5all[o.closeIdx].time; presentedSinceLoss = 0; c.longestLossSeq = Math.max(c.longestLossSeq, seq); c.largestLossPct = Math.max(c.largestLossPct, -o.pnl / (equity - o.pnl)); }
    hwm = Math.max(hwm, equity); maxEq = Math.max(maxEq, equity); minEq = Math.min(minEq, equity); maxDD = Math.max(maxDD, (hwm - equity) / hwm);
  }
  const reached = c.seen - c.position_open - CUR.filter((s) => s.prod.skipped).length;
  return { pct, mode, taken: c.taken, wins: c.wins, losses: c.losses, refused_risk: c.refused_risk, refused_margin: c.refused_margin, breaker: c.breaker, preservation_locked: preservation, net: r2(c.gp - c.gl), pf: c.gl > 0 ? r2(c.gp / c.gl) : null, ending: equity, max_equity: maxEq, min_equity: minEq, max_dd_pct: r2(maxDD * 100), largest_loss_pct: r2(c.largestLossPct * 100), longest_loss_seq: c.longestLossSeq, participation_pct: r2(c.taken / reached * 100), margin_locked_end: !(CUR.at(-1).margin_0_01 <= marginCap * equity) };
}
const PCTS = [3, 4, 5, 6, 7.5, 10]; const MODES = ['none', 'v2_deadlock', 'dayroll_reset', 'signal_decay10', 'cooling_4h'];
const capital = Object.fromEntries(MODES.map((m) => [m, PCTS.map((p) => runPolicy(p, { mode: m }))]));
const capitalMC = (() => { const P = 3000, N = 1200; const seqs = Array.from({ length: P }, () => Array.from({ length: N }, () => pool[Math.floor(rnd() * pool.length)])); const out = {}; for (const mode of ['none', 'signal_decay10']) { out[mode] = {}; for (const p of PCTS) { const ends = [], dd20 = [], lock = [], pres = [], taken = []; for (const seq of seqs) { let eq = START_EQUITY, hwm = eq, maxDD = 0, streak = 0, since = 0, preservation = false, n = 0; for (const tr of seq) { if (preservation) break; since++; const dd = (hwm - eq) / hwm; let m = 1; if (dd >= GOV.preservation) { preservation = true; break; } else if (dd >= GOV.defensive) m = 0.25; else if (dd >= GOV.caution) m = 0.5; if (mode === 'signal_decay10' && streak >= 1 && since <= 10) m *= 0.5; if (tr.risk > eq * (p / 100) * m) continue; if (!(tr.margin <= 0.4 * eq && (eq - tr.margin) >= 0.55 * eq && (eq - tr.risk) / tr.margin >= 2)) continue; eq += tr.pnl; n++; if (tr.pnl > 0) streak = 0; else { streak++; since = 0; } hwm = Math.max(hwm, eq); maxDD = Math.max(maxDD, (hwm - eq) / hwm); } ends.push(eq); dd20.push(maxDD >= 0.2); lock.push(!(pool[0].margin <= 0.4 * eq)); pres.push(preservation); taken.push(n); } const sorted = [...ends].sort((a, b) => a - b); taken.sort((a, b) => a - b); out[mode][p] = { median_end: r2(sorted[Math.floor(P / 2)]), p5_end: r2(sorted[Math.floor(P * 0.05)]), p95_end: r2(sorted[Math.floor(P * 0.95)]), p_dd_ge_20: r2(dd20.filter(Boolean).length / P * 100), p_margin_locked_end: r2(lock.filter(Boolean).length / P * 100), p_preservation: r2(pres.filter(Boolean).length / P * 100), median_trades: taken[Math.floor(P / 2)], p_end_below_start: r2(ends.filter((e) => e < START_EQUITY).length / P * 100) }; } } return { paths: P, presented_signals_per_path: N, semantics: 'breaker ignored; governor 8/12/20; margin cap 40 %; production exits; identical sequences', results: out }; })();

// ── 9. class A cross-check ──
const liveA = STORE.filter((s) => s.timeframe === '5m');
const crossCheck = liveA.map((a) => { const at = Date.parse(a.created_at) / 1000; const m = CUR.find((s) => Math.abs(s.t + 300 + FETCH_LAG - at) <= 400 && s.side === a.side) ?? raw.CURRENT.find((s) => Math.abs(s.t + 300 + FETCH_LAG - at) <= 400 && s.side === a.side); return { live: `${a.created_at.slice(5, 16)} ${a.side} ${a.model} q${a.quality} rr${a.rr} ${a.status} ${a.realized_r ?? ''}`, replay: m ? `${iso(m.t)} ${m.model} rr${m.rr} q${m.quality}` : 'NO MATCH', matched: !!m }; });

// ── 10. output ──
const dataGaps = (() => { const g = []; for (let i = 1; i < b5all.length; i++) { const d = b5all[i].time - b5all[i - 1].time; if (d > 1800) { const wd = new Date(b5all[i - 1].time * 1000).getUTCDay(); if (!(wd === 5 || wd === 6 || wd === 0) && d > 3900) g.push({ from: iso(b5all[i - 1].time), to: iso(b5all[i].time), minutes: d / 60 }); } } return g; })();
const out = {
  generated_at: new Date().toISOString(), window: { from: iso(firstEvaluable), to: iso(b5all[lastIdx].time) }, sessions: sessions.size, session_split_day: splitDay, discovery_sessions: sessionList.filter((d) => d < splitDay).length, validation_sessions: sessionList.filter((d) => d >= splitDay).length, confirmed_5m_candles: evalCount, data_gaps_non_weekend_over_65min: dataGaps,
  counts: Object.fromEntries(Object.entries(SIG).map(([k, v]) => [k, { raw_bars: raw[k].length, distinct: v.length, completed: done(v).length, geometry_skipped: v.filter((s) => s.prod.skipped && s.prod.skipped !== 'OPEN_AT_END_OF_DATA').length, open_at_end: v.filter((s) => s.prod.skipped === 'OPEN_AT_END_OF_DATA').length }])),
  class_A: { intraday_live_records: liveA.length, cross_check: crossCheck, matched: crossCheck.filter((x) => x.matched).length },
  overall, classification: classify(overall, wfOverall), walk_forward: wfOverall, by_model: byModel, by_side: bySide, by_model_side: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => [m, groupStats(CUR.filter((s) => s.model === m), (s) => s.side)])), regimes, lag: lagStats, variants, by_stop: byStop, by_rr: byRR, by_quality: byQuality, quality_components: qComponents, exit_audit: exitAudit, loss_magnitude: lossMag, timing, breaker_audit: breakerAudit, loss_drivers: drivers, monte_carlo: mc, capital, capital_mc: capitalMC, recovery: PCTS.map((p) => { const row = { pct: p }; for (const n of [1, 2, 3, 5, 7, 10]) { const e = START_EQUITY * Math.pow(1 - p / 100, n); row[`after_${n}`] = r2(e); row[`recover_${n}_pct`] = r2((START_EQUITY / e - 1) * 100); } return row; }),
  signals: CUR.map((s) => ({ ...s, qBreakdown: undefined })), variant_signals: { A: SIG.A, B: SIG.B, C: SIG.C },
};
writeFileSync(join(HERE, 'master_edge_results.json'), JSON.stringify(out, null, 1));
const brief = { ...out, signals: undefined, variant_signals: undefined };
console.log(JSON.stringify(brief, null, 1));
