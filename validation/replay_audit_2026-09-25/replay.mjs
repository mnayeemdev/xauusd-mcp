/**
 * OFFLINE REPLAY / MISSED-OPPORTUNITY AUDIT -- 2026-09-25 12:30-18:15 UTC.
 *
 * ANALYSIS ONLY. Imports only PURE engine functions (no CDP, no chart, no
 * state files, no signal store). Reads the MT5 XAUUSDm bar snapshot saved
 * next to this file and the watcher's own recorded decisions (read-only)
 * for a fidelity check. Writes ONLY into this audit folder.
 *
 * Run from the repo root:  node validation/replay_audit_2026-09-25/replay.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runPipeline } from '../../src/engine/pipeline.js';
import { classifyRegime, REGIME_PARAMS } from '../../src/engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../../src/engine/structure.js';
import { computeCorrection, CORRECTION_PARAMS } from '../../src/engine/correction.js';
import { computeRisk as computeReferenceRisk } from '../../src/engine/risk.js';
import { scoreQuality, classifySession } from '../../src/engine/quality.js';
import { atr, adxDi, ema } from '../../src/engine/math.js';
import { computeHtfContext, detectHtfConflict } from '../../src/engine/htf.js';
import { computeBias, sideAllowedByBias } from '../../src/engine/intraday/bias.js';
import { runIntradayPipeline, combineIntraday, resolveQualityThreshold } from '../../src/engine/intraday/pipeline5m.js';
import { evaluateIntradayModels, evaluateMomentumContinuation, evaluateBreakoutRetest, evaluateStructureRejection, evaluateMeanReversion } from '../../src/engine/intraday/models5m.js';
import { computeIntradayRisk } from '../../src/engine/intraday/risk5m.js';
import { INTRADAY_PARAMS } from '../../src/engine/intraday/params.js';
import { computeProtectiveStops } from '../../src/engine/mt5Policy.js';
import { evaluateTradeManagement } from '../../src/engine/mt5TradeManagement.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BARS = JSON.parse(readFileSync(join(HERE, 'xauusdm_bars_snapshot.json'), 'utf8'));
const WAIT_LOG = join(HERE, '..', '..', 'state', 'xauusd_wait_opportunity_log.jsonl');

const TF_SEC = { '5m': 300, '15m': 900, '30m': 1800, '1H': 3600, '4H': 14400, '1D': 86400 };
const FETCH_LAG_SEC = 80; // the live watcher evaluates ~80 s after the 5m close
const REQUEST_COUNT = 500; // live engine requests 500 bars per timeframe (499 confirmed)
const WINDOW_START = Date.UTC(2026, 8, 25, 12, 30) / 1000;
const WINDOW_END = Date.UTC(2026, 8, 25, 18, 15) / 1000;
const SPREAD = 0.25; // observed XAUUSDm spread 0.24-0.26
const LOT_USD_PER_PRICE = 1; // 0.01 lot x 100 oz = 1 USD per 1.00 price move
const REAL = { profitTargetUsd: 30, maximumLossUsd: -50, brokerStructuralSlMultiple: 1.5, minEffectiveRr: 1.7, maxEntryDriftUsd: 2.0 };

const hhmm = (t) => new Date(t * 1000).toISOString().slice(11, 16);
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** Confirmed bars of `tf` as the live engine would have seen them at wall-clock T (forming bar stripped, last 499). */
function confirmedAt(tf, T) {
  const sec = TF_SEC[tf];
  const cutoff = Math.floor(T / sec) * sec; // bars with time < cutoff are closed
  const all = BARS[tf].filter((b) => b.time < cutoff);
  return all.slice(-(REQUEST_COUNT - 1));
}

// ── Hooked mirror of runIntradayPipeline() so counterfactual variants can swap ONE piece ──
function runVariant({ bars5, bias, m30, ctx1H, params = INTRADAY_PARAMS, variant = {} }) {
  const p = params;
  const wait = (wait_reason, extra = {}) => ({ action: 'WAIT', wait_reason, ...extra });
  const { regime, evidence: regimeEvidence } = classifyRegime(bars5, REGIME_PARAMS);
  if (!regime) return wait('INSUFFICIENT_DATA');
  const structure = computeStructure(bars5, STRUCTURE_PARAMS);
  const b = variant.biasFn ? variant.biasFn(bias, { regime, structure }) : bias;
  if (regime === 'CHOP_UNCERTAIN' || !b.eligible_models?.length) return wait('CHOP', { regime, structure, bias: b });
  const atrVal = atr(bars5, 14).at(-1);
  const ema20 = ema(bars5.map((x) => x.close), 20);
  const { adx } = adxDi(bars5, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const atrRatio = regimeEvidence.atrRatio ?? 1;
  const ctx = { bars: bars5, regime, structure, atrVal, atrRatio, ema20, bias: b, m30Regime: m30?.regime ?? null };
  const candidate = variant.modelsFn ? variant.modelsFn(ctx, p) : evaluateIntradayModels(ctx, p);
  if (!candidate) return wait('NO_ELIGIBLE_STRATEGY', { regime, structure, bias: b, atrVal });
  const riskArgs = { candidate, bars: bars5, atrVal, structure5: structure, structure15: b.structure };
  const risk = variant.riskFn ? variant.riskFn(riskArgs, p) : computeIntradayRisk(riskArgs, p);
  if (risk.gate !== 'OK') return wait(risk.gate, { regime, structure, bias: b, candidate, risk, atrVal });
  const lastBar = bars5.at(-1);
  const session = classifySession(lastBar.time);
  const overextensionRatio = Math.abs(lastBar.close - candidate.anchor) / (atrVal * p.overextendAtrMult);
  const quality = scoreQuality({ candidate: { ...candidate, overextensionRatio }, structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30?.regime ?? null, session, rr: risk.rr, minRR: p.minRR });
  const htfOpposed = detectHtfConflict(candidate.side, ctx1H);
  const penalised = htfOpposed ? Math.max(0, quality.score - p.htfOpposedQualityPenalty) : quality.score;
  const { threshold, basis } = resolveQualityThreshold({ bias: b, side: candidate.side, ctx1H, params: p });
  const finalQuality = { ...quality, score: penalised, threshold, threshold_basis: basis };
  if (penalised < threshold) return wait('NO_GOOD_ENTRY', { regime, structure, bias: b, candidate, risk, quality: finalQuality, atrVal });
  const intradayLike = { status: 'OK', regime, structure, correction: candidate.correction ?? { state: 'NONE' }, model: candidate.model, decision: { action: candidate.side, wait_reason: null, entry: risk.entry, stop_loss: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr }, quality: finalQuality, evidence: { candidate, risk } };
  const combined = combineIntraday({ intraday: intradayLike, bias: b, m30, ctx1H });
  return { action: combined.action, wait_reason: combined.wait_reason ?? null, conflict: combined.conflict ?? null, regime, structure, bias: b, candidate, risk, quality: finalQuality, atrVal };
}

// ── Counterfactual model / bias / risk hooks (compositions of EXISTING rules only) ──
function pbStructureResolved(ctx, p) {
  // PB whose "resolution" is a fresh confirmed 5m BOS/CHoCH in the bias direction instead of N EMA20 closes.
  const { bars, structure, bias } = ctx;
  const i = bars.length - 1;
  if (!bias || bias.direction === 'NEUTRAL') return null;
  const side = bias.direction === 'BULLISH' ? 'BUY' : 'SELL';
  if (!bias.eligible_models.includes('PB') || !sideAllowedByBias(bias, side)) return null;
  const corr = computeCorrection(bars, bias.direction, { ...CORRECTION_PARAMS, swingLookback: p.pbSwingLookback, corrAtrMultiplier: p.pbCorrAtrMultiplier, corrResolveConfirmBars: p.pbResolveConfirmBars });
  if (corr.state === 'NONE') return null; // no material pullback to resolve
  const ev = structure?.lastEvent;
  if (!ev || ev.direction !== bias.direction || i - ev.bar > 3) return null;
  const windowStart = Math.max(0, i - p.pbSwingLookback + 1);
  let extremeIdx = windowStart;
  for (let k = windowStart; k <= i; k++) if (side === 'BUY' ? bars[k].high > bars[extremeIdx].high : bars[k].low < bars[extremeIdx].low) extremeIdx = k;
  const leg = bars.slice(extremeIdx, i + 1);
  const pullbackExtreme = side === 'BUY' ? Math.min(...leg.map((x) => x.low)) : Math.max(...leg.map((x) => x.high));
  return { model: 'PB', side, anchor: pullbackExtreme, slAnchor: pullbackExtreme, originBar: ev.bar, correction: corr, reason: `pullback resolved by a fresh ${ev.type} in the bias direction (${i - ev.bar} bar(s) ago)` };
}
const modelsWithStructurePb = (ctx, p) => evaluateMomentumContinuation({ ...ctx, params: p }) ?? pbStructureResolved(ctx, p) ?? evaluateBreakoutRetest({ ...ctx, params: p }) ?? evaluateStructureRejection({ ...ctx, params: p }) ?? evaluateMeanReversion({ ...ctx, params: p }) ?? null;

const biasFrom5mRegimeWhenNeutral = (bias, { regime }) => {
  if (bias.direction !== 'NEUTRAL') return bias;
  if (regime !== 'BULL_TREND' && regime !== 'BEAR_TREND') return bias;
  return { ...bias, direction: regime === 'BULL_TREND' ? 'BULLISH' : 'BEARISH', eligible_models: ['MC', 'PB', 'BO', 'SR'], _cf: '5m regime used as bias (15m NEUTRAL)' };
};
const biasFrom5mStructure = (bias, { structure }) => {
  if (!structure?.state) return bias;
  return { ...bias, direction: structure.state, eligible_models: ['MC', 'PB', 'BO', 'SR', ...(bias.regime === 'RANGE' ? ['MR'] : [])], _cf: '5m structure direction used as bias' };
};
const referenceRisk = ({ candidate, bars, atrVal, structure5 }) => computeReferenceRisk({ candidate, bars, atrVal, structure: structure5 });

const VARIANTS = [
  { key: 'BASE', label: 'Live intraday_5m rules (must reproduce the watcher)', variant: {} },
  { key: 'A1_PB_RESOLVE_1BAR', label: 'PB correction resolves after 1 EMA20 close instead of 2', params: { ...INTRADAY_PARAMS, pbResolveConfirmBars: 1 } },
  { key: 'A2_PB_STRUCTURE_RESOLVE', label: 'PB correction resolved by a fresh confirmed 5m BOS/CHoCH in the bias direction', variant: { modelsFn: modelsWithStructurePb } },
  { key: 'B1_5M_REGIME_AS_BIAS', label: '15m NEUTRAL -> use the 5m trend regime as bias (MC/PB eligible)', variant: { biasFn: biasFrom5mRegimeWhenNeutral } },
  { key: 'B2_5M_STRUCTURE_AS_BIAS', label: '5m structure direction used as bias every bar (all models)', variant: { biasFn: biasFrom5mStructure } },
  { key: 'C1_TP2_DEFAULT_2R', label: 'TP2 = default 2R (objective-aware selection disabled)', params: { ...INTRADAY_PARAMS, objectiveMinR: 1e9 } },
  { key: 'C2_OBJECTIVE_MIN_R_1_7', label: 'skip structural objectives closer than 1.7R instead of 1.0R', params: { ...INTRADAY_PARAMS, objectiveMinR: 1.7 } },
  { key: 'C3_REFERENCE_RISK', label: 'reference risk.js stop/target (structural swing stop, range objective)', variant: { riskFn: referenceRisk } },
];

// ── Replay every 5m close in the window ──
const bars5All = BARS['5m'];
const closes = bars5All.filter((b) => b.time >= WINDOW_START && b.time <= WINDOW_END).map((b) => b.time);
const rows = [];
for (const t of closes) {
  const T = t + 300 + FETCH_LAG_SEC;
  const b5 = confirmedAt('5m', T), b15 = confirmedAt('15m', T), b30 = confirmedAt('30m', T), b1h = confirmedAt('1H', T), b4h = confirmedAt('4H', T), b1d = confirmedAt('1D', T);
  const ctx1H = computeHtfContext(b1h, { includeCorrection: true });
  const ctx4H = computeHtfContext(b4h), ctx1D = computeHtfContext(b1d);
  const m30 = runPipeline({ confirmedBars: b30 });
  const bias = computeBias({ confirmedBars: b15, params: INTRADAY_PARAMS });
  const intraday = runIntradayPipeline({ bars5: b5, bias, m30Regime: m30.regime, ctx1H, params: INTRADAY_PARAMS });
  const live = combineIntraday({ intraday, bias, m30, ctx1H });
  const ref5 = runPipeline({ confirmedBars: b5, htfRegime: m30.regime });
  const ref15 = runPipeline({ confirmedBars: b15, htfRegime: m30.regime });
  const variants = {};
  for (const v of VARIANTS) variants[v.key] = runVariant({ bars5: b5, bias, m30, ctx1H, params: v.params ?? INTRADAY_PARAMS, variant: v.variant ?? {} });
  const s5 = intraday.structure;
  rows.push({
    t, time: hhmm(t), close: b5.at(-1).close, atr5: r2(atr(b5, 14).at(-1)),
    live: { action: live.action, reason: live.wait_reason ?? null, conflict: live.conflict ?? null },
    intraday: { regime: intraday.regime, wait_reason: intraday.decision.wait_reason, model: intraday.model, candidate: intraday.evidence?.candidate ? { model: intraday.evidence.candidate.model, side: intraday.evidence.candidate.side, anchor: r2(intraday.evidence.candidate.anchor), slAnchor: r2(intraday.evidence.candidate.slAnchor), reason: intraday.evidence.candidate.reason } : null, risk: intraday.evidence?.risk ?? null, quality: intraday.quality ? { score: intraday.quality.score, threshold: intraday.quality.threshold, basis: intraday.quality.threshold_basis, breakdown: intraday.quality.breakdown } : null },
    s5: s5 ? { state: s5.state, lastEvent: s5.lastEvent ? { type: s5.lastEvent.type, direction: s5.lastEvent.direction, level: r2(s5.lastEvent.level), barsAgo: b5.length - 1 - s5.lastEvent.bar } : null, lastSweep: s5.lastSweep ? { type: s5.lastSweep.type, level: r2(s5.lastSweep.level), barsAgo: b5.length - 1 - s5.lastSweep.bar } : null, swingHigh: s5.lastSwingHigh ? { price: r2(s5.lastSwingHigh.price), label: s5.lastSwingHigh.label } : null, swingLow: s5.lastSwingLow ? { price: r2(s5.lastSwingLow.price), label: s5.lastSwingLow.label } : null, rangeHigh: r2(s5.rangeHigh), rangeLow: r2(s5.rangeLow) } : null,
    bias15: { direction: bias.direction, regime: bias.regime, correction: bias.correction?.state, structure: bias.structure?.state ?? null, eligible: bias.eligible_models, freshChoch: bias.fresh_opposing_choch },
    m30: { regime: m30.regime, structure: m30.structure?.state ?? null, correction: m30.correction?.state ?? null },
    h1: { regime: ctx1H.regime, structure: ctx1H.structure_direction, correction: ctx1H.correction_state }, h4: ctx4H.regime, d1: ctx1D.regime,
    ref5: { regime: ref5.regime, correction: ref5.correction?.state ?? null, model: ref5.model, wait_reason: ref5.decision.wait_reason, rr: ref5.evidence?.risk?.rr ?? null, side: ref5.evidence?.candidate?.side ?? null },
    ref15: { regime: ref15.regime, correction: ref15.correction?.state ?? null, model: ref15.model, wait_reason: ref15.decision.wait_reason, rr: ref15.evidence?.risk?.rr ?? null, side: ref15.evidence?.candidate?.side ?? null },
    variants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, { action: v.action, reason: v.wait_reason, conflict: v.conflict ?? null, model: v.candidate?.model ?? null, side: v.candidate?.side ?? null, anchor: r2(v.candidate?.anchor), entry: v.risk?.entry ?? null, sl: v.risk?.stop_loss ?? null, tp1: v.risk?.tp1 ?? null, tp2: v.risk?.tp2 ?? null, rr: v.risk?.rr ?? null, objective: v.risk?.objective ?? null, skipped: v.risk?.skipped_minor_objectives ?? null, quality: v.quality?.score ?? null, qThreshold: v.quality?.threshold ?? null, qBasis: v.quality?.threshold_basis ?? null, biasNote: v.bias?._cf ?? null, candidateReason: v.candidate?.reason ?? null }])),
  });
}

// ── Fidelity check against the watcher's own recorded decisions (read-only) ──
const recorded = {};
try {
  for (const line of readFileSync(WAIT_LOG, 'utf8').trim().split('\n')) {
    const o = JSON.parse(line);
    if (o.confirmed_bar_time >= WINDOW_START && o.confirmed_bar_time <= WINDOW_END) recorded[o.confirmed_bar_time] = o;
  }
} catch (e) { console.error('wait log unavailable:', e.message); }
const fidelity = rows.map((r) => {
  const rec = recorded[r.t];
  if (!rec) return { time: r.time, recorded: null };
  const c5 = rec.candidates?.['5m'] ?? {}, c15 = rec.candidates?.['15m'] ?? {};
  return {
    time: r.time,
    recorded: { action: rec.authoritative_action, reason: rec.authoritative_wait_reason, ref5: { regime: c5.regime, blocked_by: c5.blocked_by, model: c5.candidate_model, rr: c5.authoritative_candidate_rr }, ref15: { regime: c15.regime, blocked_by: c15.blocked_by, model: c15.candidate_model, rr: c15.authoritative_candidate_rr } },
    replay: { action: r.live.action, reason: r.live.reason, ref5: { regime: r.ref5.regime, blocked_by: r.ref5.wait_reason, model: r.ref5.model, rr: r.ref5.rr }, ref15: { regime: r.ref15.regime, blocked_by: r.ref15.wait_reason, model: r.ref15.model, rr: r.ref15.rr } },
    match: { action: rec.authoritative_action === r.live.action, reason: rec.authoritative_wait_reason === r.live.reason, ref5_regime: c5.regime === r.ref5.regime, ref5_block: c5.blocked_by === r.ref5.wait_reason, ref15_regime: c15.regime === r.ref15.regime },
  };
});

// ── Objective swing analysis of the window (zigzag, 1 x 5m ATR reversal threshold) ──
function zigzag(bars, threshold) {
  const legs = [];
  let dir = null, extIdx = 0, startIdx = 0;
  for (let i = 1; i < bars.length; i++) {
    if (dir === null) { dir = bars[i].close >= bars[0].close ? 'UP' : 'DOWN'; extIdx = i; continue; }
    const ext = dir === 'UP' ? bars[extIdx].high : bars[extIdx].low;
    if (dir === 'UP' ? bars[i].high > ext : bars[i].low < ext) extIdx = i;
    const rev = dir === 'UP' ? ext - bars[i].low : bars[i].high - ext;
    if (rev >= threshold) {
      legs.push({ dir, start: bars[startIdx].time, startPrice: dir === 'UP' ? bars[startIdx].low : bars[startIdx].high, end: bars[extIdx].time, endPrice: ext, size: r2(Math.abs(ext - (dir === 'UP' ? bars[startIdx].low : bars[startIdx].high))) });
      startIdx = extIdx; dir = dir === 'UP' ? 'DOWN' : 'UP'; extIdx = i;
    }
  }
  const ext = dir === 'UP' ? bars[extIdx].high : bars[extIdx].low;
  legs.push({ dir, start: bars[startIdx].time, startPrice: dir === 'UP' ? bars[startIdx].low : bars[startIdx].high, end: bars[extIdx].time, endPrice: ext, size: r2(Math.abs(ext - (dir === 'UP' ? bars[startIdx].low : bars[startIdx].high))), open: true });
  return legs;
}
const winBars = bars5All.filter((b) => b.time >= WINDOW_START - 1800 && b.time <= WINDOW_END + 300);
const atrWin = atr(winBars, 14).filter((v) => v != null);
const swingThreshold = r2(Math.max(5, atrWin.reduce((a, b) => a + b, 0) / atrWin.length));
const legs = zigzag(winBars, swingThreshold).map((l) => ({ ...l, startPrice: r2(l.startPrice), endPrice: r2(l.endPrice), start: hhmm(l.start), end: hhmm(l.end) }));

// ── Forward simulation: broker SL/TP + REAL adaptive management + monetary envelope ──
function simulate({ side, t, entry, sl, tp1, tp2, anchor, rr }) {
  const bars = bars5All;
  const entryIdx = bars.findIndex((b) => b.time === t);
  const fill = side === 'BUY' ? entry + SPREAD : entry; // BUY fills at ask, SELL at bid (bars are bid)
  const risk = Math.abs(entry - sl);
  const stops = computeProtectiveStops({ side, fillPrice: fill, lot: 0.01, contractSize: 100, digits: 3, profitTargetUsd: REAL.profitTargetUsd, maximumLossUsd: REAL.maximumLossUsd, estimatedRoundTripCommissionUsd: 0, brokerTakeProfit: true, structuralStop: sl, plannedEntry: entry, structuralMultiple: REAL.brokerStructuralSlMultiple, spread: SPREAD });
  const openSec = t + 300 + FETCH_LAG_SEC + 5;
  const position = { side, open_price: fill, open_time: new Date(openSec * 1000).toISOString(), initial_structural_risk: risk, engine: { structural_stop: sl, engine_sl: sl, setup_level: anchor, planned_entry: entry, engine_entry: entry, engine_tp1: tp1, engine_tp2: tp2 } };
  let mfe = 0, mae = 0, exit = null;
  let r1 = null, r17 = null, r2r = null, slBefore = null;
  for (let j = entryIdx + 1; j < bars.length; j++) {
    const b = bars[j];
    const fav = side === 'BUY' ? b.high - fill : fill - (b.low + SPREAD);
    const adv = side === 'BUY' ? fill - b.low : (b.high + SPREAD) - fill;
    mfe = Math.max(mfe, fav); mae = Math.max(mae, adv);
    // R-multiples reached before the broker SL (pure excursion question, adaptive exits ignored here)
    const hitBrokerSl = side === 'BUY' ? b.low <= stops.sl : b.high + SPREAD >= stops.sl;
    if (slBefore === null) {
      if (r1 === null && fav >= 1.0 * risk) r1 = hhmm(b.time);
      if (r17 === null && fav >= 1.7 * risk) r17 = hhmm(b.time);
      if (r2r === null && fav >= 2.0 * risk) r2r = hhmm(b.time);
      if (hitBrokerSl) slBefore = hhmm(b.time);
    }
    if (!exit) {
      const hitTp = side === 'BUY' ? b.high >= stops.tp : b.low + SPREAD <= stops.tp;
      if (hitBrokerSl) exit = { reason: stops.sl_basis === 'STRUCTURAL' ? 'BROKER_SL_STRUCTURAL_1.5R' : 'BROKER_SL_MONETARY', time: hhmm(b.time), price: stops.sl, pnl: r2((side === 'BUY' ? stops.sl - fill : fill - stops.sl) * LOT_USD_PER_PRICE) };
      else if (hitTp) exit = { reason: 'BROKER_TP_+30USD', time: hhmm(b.time), price: stops.tp, pnl: r2((side === 'BUY' ? stops.tp - fill : fill - stops.tp) * LOT_USD_PER_PRICE) };
      else {
        // adaptive management on the confirmed close, exactly as the executor would evaluate it
        const T = b.time + 300 + FETCH_LAG_SEC;
        const b5 = confirmedAt('5m', T), b15 = confirmedAt('15m', T);
        const st = computeStructure(b5, STRUCTURE_PARAMS);
        const bias = computeBias({ confirmedBars: b15, params: INTRADAY_PARAMS });
        const { regime } = classifyRegime(b5, REGIME_PARAMS);
        const result = { primary_confirmed_bars: b5, evidence: { structure: st, regime }, bias, regime, timeframes: { '15m': { structure_state: bias.structure?.state ?? null }, '5m': { regime } }, action: 'WAIT', signal: null };
        const v = evaluateTradeManagement({ position, result });
        if (v.state !== 'HOLD') exit = { reason: `${v.state}/${v.reason}${v.trigger ? '/' + v.trigger : ''}`, time: hhmm(b.time), price: b.close, pnl: r2((side === 'BUY' ? b.close - fill : fill - (b.close + SPREAD)) * LOT_USD_PER_PRICE) };
      }
    }
    if (exit && slBefore !== null) break;
    if (exit && (r2r !== null || slBefore !== null)) break;
  }
  const last = bars.at(-1);
  if (!exit) exit = { reason: 'STILL_OPEN_AT_END_OF_DATA', time: hhmm(last.time), price: last.close, pnl: r2((side === 'BUY' ? last.close - fill : fill - (last.close + SPREAD)) * LOT_USD_PER_PRICE) };
  return { fill: r2(fill), risk: r2(risk), broker_sl: stops.sl, broker_sl_basis: stops.sl_basis, broker_tp: stops.tp, mfe: r2(mfe), mfe_r: r2(mfe / risk), mae: r2(mae), mae_r: r2(mae / risk), reached_1r: r1, reached_1_7r: r17, reached_2r: r2r, broker_sl_hit_at: slBefore, exit, exit_r: r2(exit.pnl / risk) };
}

// Candidates: every bar where a variant produced BUY/SELL (deduped per variant by side+model+anchor within 1 ATR, first bar wins),
// plus the BASE bars where the live engine had a candidate rejected by RR (so "what if RR were different" can be answered on the live geometry).
const cfCandidates = [];
for (const v of VARIANTS) {
  let lastKey = null;
  for (const r of rows) {
    const x = r.variants[v.key];
    if (x.action !== 'BUY' && x.action !== 'SELL') { continue; }
    const key = `${x.side}|${x.model}|${Math.round((x.anchor ?? 0) / Math.max(1, r.atr5))}`;
    if (key === lastKey) continue;
    lastKey = key;
    cfCandidates.push({ variant: v.key, variant_label: v.label, time: r.time, t: r.t, side: x.side, model: x.model, entry: x.entry, sl: x.sl, tp1: x.tp1, tp2: x.tp2, rr: x.rr, quality: x.quality, qThreshold: x.qThreshold, anchor: x.anchor, objective: x.objective, base_action: r.live.action, base_reason: r.live.reason, base_candidate: r.intraday.candidate, base_risk: r.intraday.risk ? { gate: r.intraday.risk.gate, rr: r.intraday.risk.rr, entry: r.intraday.risk.entry, sl: r.intraday.risk.stop_loss, tp2: r.intraday.risk.tp2, objective: r.intraday.risk.objective } : null, sim: simulate({ side: x.side, t: r.t, entry: x.entry, sl: x.sl, tp1: x.tp1, tp2: x.tp2, anchor: x.anchor, rr: x.rr }) });
  }
}
// Live RR-rejected candidates, simulated on their own live geometry (as if the RR gate had passed them).
const liveRejected = rows.filter((r) => r.intraday.risk && r.intraday.risk.gate === 'RR_NOT_ACCEPTABLE').map((r) => ({ time: r.time, t: r.t, side: r.intraday.candidate.side, model: r.intraday.candidate.model, reason: r.intraday.candidate.reason, entry: r.intraday.risk.entry, sl: r.intraday.risk.stop_loss, tp1: r.intraday.risk.tp1, tp2: r.intraday.risk.tp2, rr: r.intraday.risk.rr, objective: r.intraday.risk.objective, skipped: r.intraday.risk.skipped_minor_objectives, sl_source: r.intraday.risk.sl_source, sim: simulate({ side: r.intraday.candidate.side, t: r.t, entry: r.intraday.risk.entry, sl: r.intraday.risk.stop_loss, tp1: r.intraday.risk.tp1, tp2: r.intraday.risk.tp2, anchor: r.intraday.candidate.anchor, rr: r.intraday.risk.rr }) }));

const out = { generated_at: new Date().toISOString(), window: { start: new Date(WINDOW_START * 1000).toISOString(), end: new Date(WINDOW_END * 1000).toISOString() }, data_source: 'MT5 Exness XAUUSDm history (read-only copy_rates), forming bar stripped, 499 confirmed bars per timeframe, evaluated 80 s after each 5m close exactly like the live watcher', swing_threshold_usd: swingThreshold, legs, rows, fidelity, cf_candidates: cfCandidates, live_rr_rejected: liveRejected, variants: VARIANTS.map((v) => ({ key: v.key, label: v.label })) };
writeFileSync(join(HERE, 'replay_results.json'), JSON.stringify(out, null, 1));

// ── Console summary ──
console.log('=== FIDELITY (replay vs watcher recorded) ===');
let n = 0, okA = 0, okR = 0, ok5 = 0, ok5b = 0, ok15 = 0;
for (const f of fidelity) { if (!f.recorded) continue; n++; okA += f.match.action; okR += f.match.reason; ok5 += f.match.ref5_regime; ok5b += f.match.ref5_block; ok15 += f.match.ref15_regime; if (!(f.match.action && f.match.reason && f.match.ref5_regime && f.match.ref5_block && f.match.ref15_regime)) console.log(' MISMATCH', f.time, 'rec', JSON.stringify(f.recorded), 'rep', JSON.stringify(f.replay)); }
console.log(` bars=${n} action=${okA} reason=${okR} ref5_regime=${ok5} ref5_block=${ok5b} ref15_regime=${ok15}`);
console.log('=== SWING LEGS (threshold', swingThreshold, ') ===');
for (const l of legs) console.log(' ', l.dir, l.start, l.startPrice, '->', l.end, l.endPrice, 'size', l.size, l.open ? '(open)' : '');
console.log('=== PER-BAR (live authority) ===');
for (const r of rows) console.log(' ', r.time, r.close, 'atr', r.atr5, '|', r.live.action, r.live.reason ?? '', '| 5m', r.intraday.regime, r.s5?.state, r.s5?.lastEvent?.type, r.s5?.lastEvent?.direction, '| 15m', r.bias15.direction, r.bias15.regime, r.bias15.correction, 'elig', r.bias15.eligible.join('/'), '| 30m', r.m30.regime, r.m30.structure, '| 1H', r.h1.regime, r.h1.structure, '| cand', r.intraday.candidate ? `${r.intraday.candidate.model} ${r.intraday.candidate.side}` : '-', r.intraday.risk ? `gate=${r.intraday.risk.gate} rr=${r.intraday.risk.rr} e=${r.intraday.risk.entry} sl=${r.intraday.risk.stop_loss} tp2=${r.intraday.risk.tp2} obj=${r.intraday.risk.objective?.source}` : '', r.intraday.quality ? `q=${r.intraday.quality.score}/${r.intraday.quality.threshold}` : '');
console.log('=== VARIANT ACTIONS PER BAR ===');
for (const r of rows) { const acts = VARIANTS.map((v) => { const x = r.variants[v.key]; return `${v.key}:${x.action === 'WAIT' ? x.reason : x.action + '/' + x.model + '/rr' + x.rr + '/q' + x.quality}`; }); console.log(' ', r.time, acts.join(' | ')); }
console.log('=== LIVE RR-REJECTED CANDIDATES (simulated as if taken) ===');
for (const c of liveRejected) console.log(' ', c.time, c.side, c.model, 'rr', c.rr, 'e', c.entry, 'sl', c.sl, 'tp2', c.tp2, 'obj', JSON.stringify(c.objective), 'skipped', JSON.stringify(c.skipped), 'slsrc', c.sl_source, '| sim', JSON.stringify(c.sim));
console.log('=== COUNTERFACTUAL ENTRIES ===');
for (const c of cfCandidates) console.log(' ', c.variant, c.time, c.side, c.model, 'rr', c.rr, 'q', c.quality + '/' + c.qThreshold, 'e', c.entry, 'sl', c.sl, 'tp2', c.tp2, '| base', c.base_action, c.base_reason, '| sim', JSON.stringify(c.sim));
