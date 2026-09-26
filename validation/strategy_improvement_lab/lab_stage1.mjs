/**
 * STRATEGY IMPROVEMENT LAB — STAGE 1: replay CONTROL at gate level, simulate exit stacks
 * and friction variants, write the research dataset, print DISCOVERY-ONLY diagnostics.
 * Research only. Never imported by production. Writes only into this folder.
 *
 * Run from repo root:  node validation/strategy_improvement_lab/lab_stage1.mjs
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
import { combineIntraday, resolveQualityThreshold } from '../../src/engine/intraday/pipeline5m.js';
import { evaluateIntradayModels } from '../../src/engine/intraday/models5m.js';
import { computeIntradayRisk } from '../../src/engine/intraday/risk5m.js';
import { INTRADAY_PARAMS } from '../../src/engine/intraday/params.js';
import { computeProtectiveStops, evaluateExecutableGeometry } from '../../src/engine/mt5Policy.js';
import { evaluateTradeManagement } from '../../src/engine/mt5TradeManagement.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, '..', 'master_edge_validation', 'xauusdm_bars_master.json'), 'utf8'));
const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600 };
const FETCH_LAG = 80, REQ = 500, SPREAD = 0.24, CONTRACT = 100;
const REAL = { profitTargetUsd: 30, maximumLossUsd: -50, brokerStructuralSlMultiple: 1.5, minEffectiveRr: 1.7 };
const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
function upperBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }
function confirmedAt(tf, T) { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = upperBound(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (REQ - 1)), end); }
const cache = { bias: new Map(), m30: new Map(), h1: new Map(), s5: new Map(), reg: new Map() };
const biasAt = (T) => { const c = Math.floor(T / 900) * 900; if (!cache.bias.has(c)) cache.bias.set(c, computeBias({ confirmedBars: confirmedAt('15m', T), params: INTRADAY_PARAMS })); return cache.bias.get(c); };
const m30At = (T) => { const c = Math.floor(T / 1800) * 1800; if (!cache.m30.has(c)) cache.m30.set(c, runPipeline({ confirmedBars: confirmedAt('30m', T) })); return cache.m30.get(c); };
const h1At = (T) => { const c = Math.floor(T / 3600) * 3600; if (!cache.h1.has(c)) cache.h1.set(c, computeHtfContext(confirmedAt('1H', T), { includeCorrection: true })); return cache.h1.get(c); };
const b5all = BARS['5m'];
const slice5 = (i) => b5all.slice(Math.max(0, i - (REQ - 2)), i + 1);
const s5At = (i) => { if (!cache.s5.has(i)) cache.s5.set(i, computeStructure(slice5(i), STRUCTURE_PARAMS)); return cache.s5.get(i); };
const regAt = (i) => { if (!cache.reg.has(i)) cache.reg.set(i, classifyRegime(slice5(i), REGIME_PARAMS)); return cache.reg.get(i); };
const lastIdx = b5all.length - 2;
const firstEvaluable = Math.max(b5all[REQ - 1].time, BARS['15m'][REQ - 1].time, BARS['30m'][REQ - 1].time, BARS['1H'][REQ - 1].time);

// ── gate-level replay of CONTROL (records every candidate that reached the quality gate) ──
const gate = []; const lagBars = [];
let evalCount = 0; const sessions = new Set();
for (let i = 0; i <= lastIdx; i++) {
  const t = b5all[i].time; if (t < firstEvaluable) continue;
  const T = t + 300 + FETCH_LAG; const bars5 = slice5(i);
  const bias = biasAt(T), m30 = m30At(T), ctx1H = h1At(T);
  evalCount++; sessions.add(day(t));
  const { regime, evidence: regimeEvidence } = regAt(i); if (!regime) continue;
  const structure = s5At(i);
  const lag = (bias.direction === 'BULLISH' && structure.state === 'BEARISH') || (bias.direction === 'BEARISH' && structure.state === 'BULLISH');
  lagBars.push({ i, t, lag });
  if (bias.status !== 'OK' || regime === 'CHOP_UNCERTAIN' || !bias.eligible_models.length || !structure.state) continue;
  const atrVal = atr(bars5, 14).at(-1); const closes = bars5.map((x) => x.close); const ema20 = ema(closes, 20);
  const { adx } = adxDi(bars5, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing); const atrRatio = regimeEvidence.atrRatio ?? 1;
  const candidate = evaluateIntradayModels({ bars: bars5, regime, structure, atrVal, atrRatio, ema20, bias, m30Regime: m30.regime }, INTRADAY_PARAMS);
  if (!candidate) continue;
  const risk = computeIntradayRisk({ candidate, bars: bars5, atrVal, structure5: structure, structure15: bias.structure }, INTRADAY_PARAMS);
  if (risk.gate !== 'OK') continue;
  const bar = bars5.at(-1); const session = classifySession(bar.time);
  const overext = Math.abs(bar.close - candidate.anchor) / (atrVal * INTRADAY_PARAMS.overextendAtrMult);
  const q = scoreQuality({ candidate: { ...candidate, overextensionRatio: overext }, structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30.regime, session, rr: risk.rr, minRR: INTRADAY_PARAMS.minRR });
  const htfOpposed = detectHtfConflict(candidate.side, ctx1H);
  const penalised = htfOpposed ? Math.max(0, q.score - INTRADAY_PARAMS.htfOpposedQualityPenalty) : q.score;
  const { threshold, basis } = resolveQualityThreshold({ bias, side: candidate.side, ctx1H, params: INTRADAY_PARAMS });
  const intradayLike = { status: 'OK', regime, structure, correction: candidate.correction ?? { state: 'NONE' }, model: candidate.model, decision: { action: candidate.side, wait_reason: null, entry: risk.entry, stop_loss: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr }, quality: { ...q, score: penalised, threshold }, evidence: { candidate, risk } };
  const combined = combineIntraday({ intraday: intradayLike, bias, m30, ctx1H });
  const vetoed = combined.action !== candidate.side ? combined.wait_reason : null;
  const passedQuality = penalised >= threshold;
  const range = bar.high - bar.low; const upperWick = bar.high - Math.max(bar.open, bar.close), lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const sweep = structure.lastSweep; const sweepAge = sweep ? i - (i - (bars5.length - 1 - sweep.bar)) : null;
  const sweepBarsAgo = sweep ? (bars5.length - 1 - sweep.bar) : null;
  const ev = structure.lastEvent; const evBarsAgo = ev ? (bars5.length - 1 - ev.bar) : null;
  const rangeMid = structure.rangeHigh != null && structure.rangeLow != null ? (structure.rangeHigh + structure.rangeLow) / 2 : null;
  const sideDir = candidate.side === 'BUY' ? 'BULLISH' : 'BEARISH';
  gate.push({
    i, t, time: iso(t), day: day(t), side: candidate.side, model: candidate.model, quality: penalised, rawQuality: q.score, threshold, thresholdBasis: basis, htfOpposed, passed: passedQuality && !vetoed, passedQuality, vetoed, qb: { ...q.breakdown },
    entry: risk.entry, sl: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr, anchor: r2(candidate.anchor), atr: r2(atrVal), atrRatio: r2(atrRatio), stop_dist: r2(Math.abs(risk.entry - risk.stop_loss)), risk_atr: r2(Math.abs(risk.entry - risk.stop_loss) / atrVal), objective: risk.objective?.source ?? null, slSource: risk.sl_source ?? null, session, lag,
    ctx: { regime5: regime, s5state: structure.state, s5event: ev?.type ?? null, s5eventDir: ev?.direction ?? null, s5eventBarsAgo: evBarsAgo, biasDir: bias.direction, biasRegime: bias.regime, biasStructure: bias.structure?.state ?? null, freshChoch: bias.fresh_opposing_choch?.direction ?? null, m30regime: m30.regime, m30structure: m30.structure?.state ?? null, h1regime: ctx1H.regime, h1structure: ctx1H.structure_direction, adx: r2(adx.at(-1)) },
    withStructure: structure.state === sideDir, alignedWithBias: bias.direction === sideDir, biasNeutral: bias.direction === 'NEUTRAL',
    sweep: sweep ? { type: sweep.type, barsAgo: sweepBarsAgo, level: r2(sweep.level), atLevel: r2(Math.abs(sweep.level - candidate.anchor) / atrVal) } : null,
    geom: { wickRatio: r2(range > 0 ? (candidate.side === 'BUY' ? lowerWick : upperWick) / range : null), closeLoc: r2(range > 0 ? (bar.close - bar.low) / range : null), barRangeAtr: r2(range / atrVal), levelDistAtr: r2(Math.abs(bar.close - candidate.anchor) / atrVal), levelFromRangeMidAtr: rangeMid != null ? r2((candidate.anchor - rangeMid) / atrVal * (candidate.side === 'BUY' ? 1 : -1)) : null, retestDepthAtr: candidate.slAnchor != null ? r2(Math.abs(candidate.slAnchor - candidate.anchor) / atrVal) : null, barsSinceOrigin: Number.isInteger(candidate.originBar) ? (bars5.length - 1 - candidate.originBar) : null, pullbackAtr: r2(candidate.correction?.evidence?.pullbackAtr), levelSource: candidate.level_source ?? null, reason: candidate.reason },
  });
}

// ── outcome simulation with several exit stacks and friction settings ──
function simulate(sig, { stack = 'production', spread = SPREAD, slip = 0 } = {}) {
  const fill = sig.side === 'BUY' ? sig.entry + spread + slip : sig.entry - slip;
  const risk = Math.abs(sig.entry - sig.sl);
  const geo = evaluateExecutableGeometry({ side: sig.side, price: fill, engineSl: sig.sl, engineTp2: sig.tp2, minRr: REAL.minEffectiveRr });
  if (!geo.valid) return { skipped: geo.reason };
  let stops;
  if (stack === 'production' || stack === 'lock') stops = computeProtectiveStops({ side: sig.side, fillPrice: fill, lot: 0.01, contractSize: CONTRACT, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sig.sl, plannedEntry: sig.entry, structuralMultiple: REAL.brokerStructuralSlMultiple, spread });
  else if (stack === 'structSL') stops = { ...computeProtectiveStops({ side: sig.side, fillPrice: fill, lot: 0.01, contractSize: CONTRACT, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sig.sl, plannedEntry: sig.entry, structuralMultiple: 1.0, spread }), sl_basis: 'STRUCTURAL_1.0' };
  else if (stack === 'sl125') stops = { ...computeProtectiveStops({ side: sig.side, fillPrice: fill, lot: 0.01, contractSize: CONTRACT, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sig.sl, plannedEntry: sig.entry, structuralMultiple: 1.25, spread }), sl_basis: 'STRUCTURAL_1.25' };
  const openSec = sig.t + 300 + FETCH_LAG + 5;
  const position = { side: sig.side, open_price: fill, open_time: new Date(openSec * 1000).toISOString(), initial_structural_risk: risk, engine: { structural_stop: sig.sl, engine_sl: sig.sl, setup_level: sig.anchor, planned_entry: sig.entry, engine_entry: sig.entry, engine_tp1: sig.tp1, engine_tp2: sig.tp2 } };
  let mfe = 0, mae = 0, exit = null, lockLevel = null, firstStopCloseBar = null, stopTouchBar = null;
  for (let j = sig.i + 1; j <= lastIdx; j++) {
    const b = b5all[j];
    const fav = sig.side === 'BUY' ? b.high - fill : fill - (b.low + spread);
    const adv = sig.side === 'BUY' ? fill - b.low : (b.high + spread) - fill;
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    const beyondStopIntrabar = sig.side === 'BUY' ? b.low <= sig.sl : b.high + spread >= sig.sl;
    if (beyondStopIntrabar && stopTouchBar === null) stopTouchBar = j;
    const closeBeyondStop = sig.side === 'BUY' ? b.close < sig.sl : b.close > sig.sl;
    if (closeBeyondStop && firstStopCloseBar === null) firstStopCloseBar = j;
    if (stack === 'lock' && lockLevel === null && mfe >= 1.0 * risk) lockLevel = sig.side === 'BUY' ? fill + 0.25 * risk : fill - 0.25 * risk;
    const effSl = lockLevel !== null ? (sig.side === 'BUY' ? Math.max(stops.sl, lockLevel) : Math.min(stops.sl, lockLevel)) : stops.sl;
    const hitSl = sig.side === 'BUY' ? b.low <= effSl : b.high + spread >= effSl;
    const hitTp = stops.tp != null && (sig.side === 'BUY' ? b.high >= stops.tp : b.low + spread <= stops.tp);
    if (hitSl) { const isLock = lockLevel !== null && effSl === lockLevel; exit = { reason: isLock ? 'PROFIT_LOCK_0.25R' : `BROKER_SL_${stops.sl_basis}`, j, pnl: (sig.side === 'BUY' ? effSl - fill : fill - effSl) - slip }; break; }
    if (hitTp) { exit = { reason: 'BROKER_TP_+30', j, pnl: (sig.side === 'BUY' ? stops.tp - fill : fill - stops.tp) - slip }; break; }
    const T = b.time + 300 + FETCH_LAG; const c5 = slice5(j); const st = s5At(j); const bias = biasAt(T); const { regime } = regAt(j);
    const result = { primary_confirmed_bars: c5, evidence: { structure: st, regime }, bias, regime, timeframes: { '15m': { structure_state: bias.structure?.state ?? null }, '5m': { regime } }, action: 'WAIT', signal: null };
    const v = evaluateTradeManagement({ position, result });
    if (v.state !== 'HOLD') { exit = { reason: v.state, sub: v.reason, j, pnl: (sig.side === 'BUY' ? b.close - fill : fill - (b.close + spread)) - slip }; break; }
  }
  if (!exit) return { skipped: 'OPEN_AT_END' };
  const pnl = r2(exit.pnl);
  return { pnl, r: r3(pnl / risk), exit: exit.reason, sub: exit.sub ?? null, closeIdx: exit.j, hold: exit.j - sig.i, mfe_r: r2(mfe / risk), mae_r: r2(mae / risk), risk: r2(risk), brokerSl: r2(stops.sl), stopTouchBar, firstStopCloseBar, latencyBars: firstStopCloseBar != null && stopTouchBar != null ? firstStopCloseBar - stopTouchBar : null };
}
console.error('gate candidates', gate.length, 'passed', gate.filter((g) => g.passed).length);
let k = 0;
for (const g of gate) {
  g.o = { prod: simulate(g), structSL: simulate(g, { stack: 'structSL' }), sl125: simulate(g, { stack: 'sl125' }), lock: simulate(g, { stack: 'lock' }) };
  g.o.fric1 = simulate(g, { spread: 0.40 }); g.o.fric2 = simulate(g, { spread: 0.40, slip: 0.15 });
  if (++k % 500 === 0) console.error('simulated', k);
}

// ── chronological regions by whole sessions: 50 / 25 / 25 ──
const sessionList = [...sessions].sort();
const aEnd = sessionList[Math.floor(sessionList.length * 0.5)], bEnd = sessionList[Math.floor(sessionList.length * 0.75)];
const region = (d) => (d < aEnd ? 'A' : d < bEnd ? 'B' : 'C');
for (const g of gate) g.region = region(g.day);

// ── discovery-only diagnostics ──
const CONTROL = gate.filter((g) => g.passed);
function dedupe(list) { const out = []; let last = null; for (const d of list) { const same = last && last.side === d.side && last.model === d.model && Math.abs(last.anchor - d.anchor) <= 0.5 * Math.max(1, d.atr) && d.i <= (last.o.prod.closeIdx ?? Infinity); if (same) continue; out.push(d); last = d; } return out; }
function stats(arr, key = 'prod') { const c = arr.filter((s) => s.o[key] && !s.o[key].skipped); const n = c.length; if (!n) return { n: 0 }; const rs = c.map((s) => s.o[key].r); const wins = c.filter((s) => s.o[key].pnl > 0); const gp = wins.reduce((a, s) => a + s.o[key].pnl, 0), gl = c.filter((s) => s.o[key].pnl <= 0).reduce((a, s) => a - s.o[key].pnl, 0); const mean = rs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1)); return { n, wr: r2(wins.length / n * 100), pf: gl > 0 ? r2(gp / gl) : null, mr: r3(mean), tot: r2(rs.reduce((a, b) => a + b, 0)), ci: [r3(mean - 1.96 * sd / Math.sqrt(n)), r3(mean + 1.96 * sd / Math.sqrt(n))] }; }
const groupStats = (arr, fn, key) => Object.fromEntries(Object.entries(arr.reduce((m, s) => { const k2 = fn(s); (m[k2] ??= []).push(s); return m; }, {})).sort((a, b) => b[1].length - a[1].length).map(([k2, v]) => [k2, stats(v, key)]));
const D = dedupe(CONTROL).filter((g) => g.region === 'A');
const diag = { regions: { A_end_exclusive: aEnd, B_end_exclusive: bEnd, A_sessions: sessionList.filter((d) => d < aEnd).length, B_sessions: sessionList.filter((d) => d >= aEnd && d < bEnd).length, C_sessions: sessionList.filter((d) => d >= bEnd).length }, discovery_control: stats(D) };
const SR = D.filter((g) => g.model === 'SR');
diag.SR = { all: stats(SR), by_side: groupStats(SR, (g) => g.side), by_withStructure: groupStats(SR, (g) => (g.withStructure ? 'aligned_with_5m_structure' : 'counter_structure')), by_biasDir: groupStats(SR, (g) => g.ctx.biasDir), by_biasRegime: groupStats(SR, (g) => g.ctx.biasRegime), by_regime5: groupStats(SR, (g) => g.ctx.regime5), by_levelSource: groupStats(SR, (g) => g.geom.levelSource), by_sweepFresh: groupStats(SR, (g) => (g.sweep && g.sweep.barsAgo <= 3 ? 'fresh_sweep' : g.sweep ? 'old_sweep' : 'no_sweep')), by_sweepAtLevel: groupStats(SR, (g) => (g.sweep && g.sweep.barsAgo <= 3 && g.sweep.atLevel <= 0.3 ? 'fresh_sweep_at_level' : 'other')), by_counter_and_bias: groupStats(SR, (g) => `${g.withStructure ? 'with' : 'counter'}_${g.alignedWithBias ? 'biasAligned' : g.biasNeutral ? 'biasNeutral' : 'biasOpposed'}`), by_stop: groupStats(SR, (g) => (g.stop_dist < 3 ? '<3' : g.stop_dist < 5 ? '3-5' : g.stop_dist < 8 ? '5-8' : '8+')), by_session: groupStats(SR, (g) => g.session), by_wick: groupStats(SR, (g) => (g.geom.wickRatio >= 0.7 ? 'wick>=0.7' : 'wick0.5-0.7')), by_barRange: groupStats(SR, (g) => (g.geom.barRangeAtr >= 1.0 ? 'bar>=1ATR' : 'bar<1ATR')), by_m30: groupStats(SR, (g) => g.ctx.m30regime), by_h1: groupStats(SR, (g) => g.ctx.h1regime), by_quality: groupStats(SR, (g) => (g.quality >= 85 ? '85+' : g.quality >= 75 ? '75-84' : '<75')), by_rr: groupStats(SR, (g) => (g.rr < 2 ? '<2' : g.rr < 3 ? '2-3' : '3+')), by_lag: groupStats(SR, (g) => (g.lag ? 'lag' : 'nolag')) };
const PB = D.filter((g) => g.model === 'PB');
diag.PB = { all: stats(PB), by_side: groupStats(PB, (g) => g.side), by_regime5_aligned: groupStats(PB, (g) => ((g.ctx.regime5 === 'BULL_TREND' && g.side === 'BUY') || (g.ctx.regime5 === 'BEAR_TREND' && g.side === 'SELL') ? '5m_trend_aligned' : `5m_${g.ctx.regime5}`)), by_withStructure: groupStats(PB, (g) => (g.withStructure ? 'with_structure' : 'counter_structure')), by_pullback: groupStats(PB, (g) => (g.geom.pullbackAtr >= 2 ? 'pullback>=2ATR' : g.geom.pullbackAtr >= 1.5 ? '1.5-2' : '1-1.5')), by_barsSinceResolved: groupStats(PB, (g) => `resolved_${(g.geom.reason.match(/resolved (\d) bar/) || [])[1] ?? '?'}b_ago`), by_stop: groupStats(PB, (g) => (g.stop_dist < 5 ? '<5' : g.stop_dist < 8 ? '5-8' : g.stop_dist < 12 ? '8-12' : '12+')), by_session: groupStats(PB, (g) => g.session), by_quality: groupStats(PB, (g) => (g.quality >= 85 ? '85+' : g.quality >= 75 ? '75-84' : '<75')), by_lag: groupStats(PB, (g) => (g.lag ? 'lag' : 'nolag')), by_adx: groupStats(PB, (g) => (g.ctx.adx >= 25 ? 'adx>=25' : 'adx<25')), by_h1: groupStats(PB, (g) => g.ctx.h1regime) };
const BO = D.filter((g) => g.model === 'BO');
diag.BO = { all: stats(BO), by_stop: groupStats(BO, (g) => (g.stop_dist < 3 ? '<3' : g.stop_dist < 5 ? '3-5' : g.stop_dist < 8 ? '5-8' : '8+')), by_riskAtr: groupStats(BO, (g) => (g.risk_atr <= 0.5 ? 'risk=0.5ATR_floor' : g.risk_atr < 1 ? '0.5-1ATR' : '1ATR+')), by_barsSinceBreak: groupStats(BO, (g) => (g.geom.barsSinceOrigin <= 2 ? 'fresh<=2' : g.geom.barsSinceOrigin <= 5 ? '3-5' : '6-10')), by_retestDepth: groupStats(BO, (g) => (g.geom.retestDepthAtr < 0.3 ? 'retest<0.3ATR' : g.geom.retestDepthAtr < 0.8 ? '0.3-0.8' : '0.8+')), by_levelFromMid: groupStats(BO, (g) => (g.geom.levelFromRangeMidAtr == null ? 'na' : g.geom.levelFromRangeMidAtr > 1 ? 'beyond_mid>1ATR' : g.geom.levelFromRangeMidAtr > -1 ? 'near_mid' : 'behind_mid')), by_biasDir: groupStats(BO, (g) => g.ctx.biasDir), by_biasRegime: groupStats(BO, (g) => g.ctx.biasRegime), by_regime5: groupStats(BO, (g) => g.ctx.regime5), by_withStructure: groupStats(BO, (g) => (g.withStructure ? 'with' : 'counter')), by_session: groupStats(BO, (g) => g.session), by_quality: groupStats(BO, (g) => (g.quality >= 85 ? '85+' : g.quality >= 75 ? '75-84' : '<75')), by_atrRatio: groupStats(BO, (g) => (g.atrRatio >= 1.3 ? 'expanding>=1.3' : g.atrRatio >= 0.8 ? 'normal' : 'contracting<0.8')), by_lag: groupStats(BO, (g) => (g.lag ? 'lag' : 'nolag')) };
const MC = D.filter((g) => g.model === 'MC');
diag.MC = { all: stats(MC), by_side: groupStats(MC, (g) => g.side), by_barsSinceBreak: groupStats(MC, (g) => `break_${g.geom.barsSinceOrigin}b_ago`), by_atrRatio: groupStats(MC, (g) => (g.atrRatio >= 1.5 ? '>=1.5' : g.atrRatio >= 1.2 ? '1.2-1.5' : '1.0-1.2')), by_stop: groupStats(MC, (g) => (g.stop_dist < 8 ? '<8' : g.stop_dist < 12 ? '8-12' : g.stop_dist < 20 ? '12-20' : '20+')), by_adx: groupStats(MC, (g) => (g.ctx.adx >= 30 ? 'adx>=30' : g.ctx.adx >= 20 ? '20-30' : '<20')), by_h1: groupStats(MC, (g) => g.ctx.h1regime), by_session: groupStats(MC, (g) => g.session), by_quality: groupStats(MC, (g) => (g.quality >= 85 ? '85+' : '<85')), by_lag: groupStats(MC, (g) => (g.lag ? 'lag' : 'nolag')) };
const MR = dedupe(CONTROL).filter((g) => g.model === 'MR');
diag.MR = { by_region: groupStats(MR, (g) => g.region), by_side: groupStats(MR, (g) => g.side), by_biasRegime: groupStats(MR, (g) => g.ctx.biasRegime), by_m30: groupStats(MR, (g) => g.ctx.m30regime), by_sweepType: groupStats(MR, (g) => g.sweep?.type ?? 'none'), by_quality: groupStats(MR, (g) => (g.quality >= 85 ? '85+' : g.quality >= 75 ? '75-84' : '<75')), by_stop: groupStats(MR, (g) => (g.stop_dist < 5 ? '<5' : g.stop_dist < 8 ? '5-8' : '8+')), by_session: groupStats(MR, (g) => g.session) };
// quality components on discovery
const comps = ['qStructure', 'qTrigger', 'qEntryLocation', 'qMomentum', 'qVolatility', 'qMtf', 'qSession', 'qRr'];
const corr = (xs, ys) => { const n = xs.length; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let c = 0, sx = 0, sy = 0; for (let q = 0; q < n; q++) { c += (xs[q] - mx) * (ys[q] - my); sx += (xs[q] - mx) ** 2; sy += (ys[q] - my) ** 2; } return sx && sy ? r3(c / Math.sqrt(sx * sy)) : 0; };
const Dq = D.filter((g) => g.o.prod && !g.o.prod.skipped);
diag.quality = { components: {}, pairwise: {}, by_bucket: groupStats(D, (g) => (g.quality >= 85 ? '85+' : g.quality >= 80 ? '80-84' : g.quality >= 75 ? '75-79' : g.quality >= 70 ? '70-74' : '65-69')), high_quality_losers_by_model: groupStats(D.filter((g) => g.quality >= 85), (g) => g.model), high_quality_by_biasDir: groupStats(D.filter((g) => g.quality >= 85), (g) => g.ctx.biasDir) };
for (const c of comps) { const xs = Dq.map((g) => g.qb[c] ?? 0), ys = Dq.map((g) => g.o.prod.r); const mean = xs.reduce((a, b) => a + b, 0) / xs.length; const hi = Dq.filter((g) => (g.qb[c] ?? 0) > mean), lo = Dq.filter((g) => (g.qb[c] ?? 0) <= mean); diag.quality.components[c] = { mean: r2(mean), max: Math.max(...xs), corr_with_r: corr(xs, ys), above_mean: stats(hi), at_or_below_mean: stats(lo), tercile_stats: (() => { const sorted = [...xs].sort((a, b) => a - b); const t1 = sorted[Math.floor(xs.length / 3)], t2 = sorted[Math.floor(xs.length * 2 / 3)]; return { low: stats(Dq.filter((g) => (g.qb[c] ?? 0) <= t1)), mid: stats(Dq.filter((g) => (g.qb[c] ?? 0) > t1 && (g.qb[c] ?? 0) <= t2)), high: stats(Dq.filter((g) => (g.qb[c] ?? 0) > t2)) }; })() }; }
for (let a = 0; a < comps.length; a++) for (let b = a + 1; b < comps.length; b++) diag.quality.pairwise[`${comps[a]}~${comps[b]}`] = corr(Dq.map((g) => g.qb[comps[a]] ?? 0), Dq.map((g) => g.qb[comps[b]] ?? 0));
// lag groups on discovery
const lagFired = D.filter((g) => g.lag);
diag.lag = { fired_during_lag: stats(lagFired), fired_by_model: groupStats(lagFired, (g) => g.model), fired_by_withStructure: groupStats(lagFired, (g) => (g.withStructure ? 'with' : 'counter')), not_lag: stats(D.filter((g) => !g.lag)) };
// exit loss inflation on discovery
const L = D.filter((g) => g.o.prod && !g.o.prod.skipped && g.o.prod.pnl <= 0);
diag.exit = { losses: L.length, gt1R: L.filter((g) => g.o.prod.r < -1).length, gt12R: L.filter((g) => g.o.prod.r < -1.2).length, gt15R: L.filter((g) => g.o.prod.r < -1.5).length, by_exit: groupStats(L, (g) => g.o.prod.exit), latency_bars_thesis_stop: (() => { const x = L.filter((g) => g.o.prod.sub === 'THESIS_STOP_CLOSE' && g.o.prod.latencyBars != null).map((g) => g.o.prod.latencyBars); x.sort((a, b) => a - b); return { n: x.length, median: x[Math.floor(x.length / 2)] ?? null, mean: r2(x.reduce((a, b) => a + b, 0) / Math.max(1, x.length)), p90: x[Math.floor(x.length * 0.9)] ?? null }; })(), brokerSL_losses_that_would_have_recovered_under_structSL: L.filter((g) => g.o.prod.exit.startsWith('BROKER_SL') && g.o.structSL.pnl > 0).length, control_vs_stacks_discovery: { prod: stats(D, 'prod'), structSL: stats(D, 'structSL'), sl125: stats(D, 'sl125'), lock: stats(D, 'lock') }, winners_giveback: (() => { const W = D.filter((g) => g.o.prod && !g.o.prod.skipped && g.o.prod.pnl > 0); const gb = W.map((g) => g.o.prod.mfe_r - g.o.prod.r); return { n: W.length, mean_mfe_r: r2(W.reduce((a, g) => a + g.o.prod.mfe_r, 0) / W.length), mean_realized_r: r2(W.reduce((a, g) => a + g.o.prod.r, 0) / W.length), mean_giveback_r: r2(gb.reduce((a, b) => a + b, 0) / gb.length), share_giveback_over_1R: r2(gb.filter((x) => x > 1).length / gb.length * 100) }; })() };
const out = { generated_at: new Date().toISOString(), window: { from: iso(firstEvaluable), to: iso(b5all[lastIdx].time) }, sessions: sessions.size, candles: evalCount, gate_candidates: gate.length, control_passed: CONTROL.length, control_distinct: dedupe(CONTROL).length, regions: diag.regions, gate, lagBars };
writeFileSync(join(HERE, 'lab_dataset.json'), JSON.stringify(out));
writeFileSync(join(HERE, 'lab_stage1_discovery_diagnostics.json'), JSON.stringify(diag, null, 1));
console.log(JSON.stringify({ window: out.window, sessions: out.sessions, candles: out.candles, gate: gate.length, control: CONTROL.length, control_distinct: out.control_distinct, regions: diag.regions }, null, 1));
