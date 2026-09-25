/**
 * intraday_5m engine profile (src/engine/intraday/, src/engine/engineProfile.js).
 *
 * Covers: profile selection; the 15m bias layer; every 5m entry model
 * (MC/PB/BO/SR/MR) including negative cases; objective-aware risk; the
 * cross-timeframe combiner's three vetoes; no-forced-trade properties;
 * calculateEntry()/analyzeMarket() wiring (5m signal identity, thesis
 * dedup, reference profile byte-identical by default); and the MT5 policy
 * defaults being untouched by the redesign.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_PROFILES, DEFAULT_ENGINE_PROFILE, normalizeEngineProfile, resolveEngineProfile, isIntradayProfile } from '../src/engine/engineProfile.js';
import { INTRADAY_PARAMS } from '../src/engine/intraday/params.js';
import { computeBias, eligibleModelsFor, sideAllowedByBias, vetoedByFreshChoch, alignedWithBias } from '../src/engine/intraday/bias.js';
import { evaluateIntradayModels, evaluateMomentumContinuation, evaluatePullbackContinuation, evaluateBreakoutRetest, evaluateStructureRejection, evaluateMeanReversion } from '../src/engine/intraday/models5m.js';
import { computeIntradayRisk } from '../src/engine/intraday/risk5m.js';
import { runIntradayPipeline, combineIntraday } from '../src/engine/intraday/pipeline5m.js';
import { calculateEntry, INTRADAY_SCHEMA_VERSION, CALCULATE_SCHEMA_VERSION, ALL_TIMEFRAMES } from '../src/core/xauusd_calculate.js';
import { analyzeMarket } from '../src/core/xauusd_analyze_market.js';
import { computeSignalId, registerOrGetSignal } from '../src/engine/signalStore.js';
import { computeSetupId } from '../src/engine/anticipationStore.js';
import { MIN_BARS_REQUIRED } from '../src/engine/pipeline.js';
import { RISK_PARAMS } from '../src/engine/risk.js';
import { QUALITY_PARAMS } from '../src/engine/quality.js';
import { MT5_DEFAULTS } from '../src/engine/mt5Policy.js';
import { seededRng } from '../validation/metrics.js';

const START_TIME = 1_790_000_000;

function makeTrendBars(n, { start = 4000, drift = 0.6, noise = 0.15, seed = 1, tfSeconds = 300 } = {}) {
  const rng = seededRng(seed);
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const move = drift + (rng() - 0.5) * noise * 2;
    const close = open + move;
    const high = Math.max(open, close) + Math.abs(rng()) * noise;
    const low = Math.min(open, close) - Math.abs(rng()) * noise;
    bars.push({ time: START_TIME + i * tfSeconds, open, high, low, close, volume: 100 });
    price = close;
  }
  return bars;
}

function makeFlatBars(n, { price = 4000, tfSeconds = 300 } = {}) {
  return Array.from({ length: n }, (_, i) => ({ time: START_TIME + i * tfSeconds, open: price, high: price + 0.01, low: price - 0.01, close: price, volume: 1 }));
}

function makeRangeBars(n, { center = 4000, amplitude = 3, seed = 2, tfSeconds = 300 } = {}) {
  const rng = seededRng(seed);
  const bars = [];
  for (let i = 0; i < n; i++) {
    const wobble = Math.sin(i / 6) * amplitude + (rng() - 0.5) * 0.5;
    const open = center + wobble;
    const close = center + Math.sin((i + 1) / 6) * amplitude + (rng() - 0.5) * 0.5;
    const high = Math.max(open, close) + 0.3;
    const low = Math.min(open, close) - 0.3;
    bars.push({ time: START_TIME + i * tfSeconds, open, high, low, close, volume: 100 });
  }
  return bars;
}

function bias(over = {}) {
  return { status: 'OK', direction: 'BULLISH', regime: 'BULL_TREND', structure: { state: 'BULLISH', lastSwingLow: { price: 3990, label: 'HL', index: 1 }, lastSwingHigh: { price: 4010, label: 'HH', index: 2 }, rangeHigh: 4012, rangeLow: 3988, pivots: [] }, correction: { state: 'NONE' }, fresh_opposing_choch: null, eligible_models: ['MC', 'PB', 'BO', 'SR'], evidence: {}, ...over };
}

function constEma(n, v) { return Array.from({ length: n }, () => v); }

// ── 1. Profile selection ───────────────────────────────────────────────
describe('intraday: engine profile selection', () => {
  it('defaults to the reference 15m profile when nothing selects one', () => {
    assert.equal(DEFAULT_ENGINE_PROFILE, ENGINE_PROFILES.REFERENCE_15M);
    assert.equal(resolveEngineProfile(null, {}), 'reference_15m');
    assert.equal(resolveEngineProfile(undefined, { XAUUSD_ENGINE_PROFILE: '' }), 'reference_15m');
  });
  it('explicit option wins over env; env wins over default; aliases normalise', () => {
    assert.equal(resolveEngineProfile('intraday', { XAUUSD_ENGINE_PROFILE: 'reference' }), 'intraday_5m');
    assert.equal(resolveEngineProfile(null, { XAUUSD_ENGINE_PROFILE: 'intraday_5m' }), 'intraday_5m');
    assert.equal(normalizeEngineProfile('FAST'), 'intraday_5m');
    assert.equal(normalizeEngineProfile('15m'), 'reference_15m');
    assert.equal(isIntradayProfile('intraday_5m'), true);
    assert.equal(isIntradayProfile('reference_15m'), false);
  });
  it('an unknown profile throws instead of silently running the wrong engine', () => {
    assert.throws(() => normalizeEngineProfile('turbo'), /unknown engine profile/);
    assert.throws(() => resolveEngineProfile(null, { XAUUSD_ENGINE_PROFILE: 'nope' }), /unknown engine profile/);
  });
  it('kept-verbatim constants: quality 65 and RR 1.7 match the reference engine; ceiling params are 5m calibrations', () => {
    assert.equal(INTRADAY_PARAMS.qualityThreshold, QUALITY_PARAMS.qualityThreshold);
    assert.equal(INTRADAY_PARAMS.minRR, RISK_PARAMS.minRR);
    assert.equal(INTRADAY_PARAMS.entryTimeframe, '5');
    assert.equal(INTRADAY_PARAMS.biasTimeframe, '15');
  });
});

// ── 2. Bias layer ──────────────────────────────────────────────────────
describe('intraday: 15m bias layer', () => {
  it('a clean 15m uptrend -> BULLISH bias with the continuation model set', () => {
    const b = computeBias({ confirmedBars: makeTrendBars(260, { tfSeconds: 900 }) });
    assert.equal(b.status, 'OK');
    assert.equal(b.direction, 'BULLISH');
    assert.deepEqual(b.eligible_models, ['MC', 'PB', 'BO', 'SR']);
    assert.ok(b.structure);
  });
  it('a clean 15m downtrend -> BEARISH bias', () => {
    const b = computeBias({ confirmedBars: makeTrendBars(260, { drift: -0.6, tfSeconds: 900 }) });
    assert.equal(b.direction, 'BEARISH');
  });
  it('TRANSITION / RANGE / COMPRESSION are NEUTRAL bias with a restricted model set, never a WAIT', () => {
    assert.deepEqual(eligibleModelsFor({ regime: 'TRANSITION', direction: 'NEUTRAL' }), ['BO', 'SR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'RANGE', direction: 'NEUTRAL' }), ['BO', 'SR', 'MR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'COMPRESSION', direction: 'NEUTRAL' }), ['BO']);
    assert.deepEqual(eligibleModelsFor({ regime: 'HIGH_VOLATILITY', direction: 'NEUTRAL' }), ['BO']);
  });
  it('CHOP_UNCERTAIN keeps an empty model set (fails closed downstream)', () => {
    assert.deepEqual(eligibleModelsFor({ regime: 'CHOP_UNCERTAIN', direction: 'NEUTRAL' }), []);
  });
  it('insufficient 15m data -> INSUFFICIENT_DATA, NEUTRAL, no models', () => {
    const b = computeBias({ confirmedBars: makeTrendBars(40, { tfSeconds: 900 }) });
    assert.equal(b.status, 'INSUFFICIENT_DATA');
    assert.deepEqual(b.eligible_models, []);
  });
  it('side gating: directional bias permits only its own side; NEUTRAL permits both', () => {
    assert.equal(sideAllowedByBias(bias(), 'BUY'), true);
    assert.equal(sideAllowedByBias(bias(), 'SELL'), false);
    assert.equal(sideAllowedByBias(bias({ direction: 'BEARISH' }), 'SELL'), true);
    assert.equal(sideAllowedByBias(bias({ direction: 'NEUTRAL' }), 'SELL'), true);
    assert.equal(sideAllowedByBias({ status: 'INSUFFICIENT_DATA' }, 'BUY'), false);
    assert.equal(alignedWithBias(bias({ direction: 'NEUTRAL' }), 'BUY'), false);
  });
  it('fresh opposing CHoCH veto: only within freshChochMaxAgeBars, only against the trade side', () => {
    const fresh = bias({ fresh_opposing_choch: { direction: 'BEARISH', level: 4000, bars_ago: 1 } });
    assert.equal(vetoedByFreshChoch(fresh, 'BUY'), true);
    assert.equal(vetoedByFreshChoch(fresh, 'SELL'), false);
    assert.equal(vetoedByFreshChoch(bias(), 'BUY'), false);
    // Built from real structure: an old CHoCH is not reported as fresh.
    const bars = makeTrendBars(260, { tfSeconds: 900 });
    const b = computeBias({ confirmedBars: bars });
    if (b.structure.lastEvent?.type === 'CHOCH') assert.ok(bars.length - 1 - b.structure.lastEvent.bar <= INTRADAY_PARAMS.freshChochMaxAgeBars || b.fresh_opposing_choch === null);
  });
});

// ── 3. Entry models ────────────────────────────────────────────────────
describe('intraday: Momentum Continuation (MC)', () => {
  function momentumBars() {
    // 30 bars around 4000, then a 5-bar momentum leg breaking the swing high 4006 on bar 27.
    const bars = makeFlatBars(31, { price: 4000 });
    const closes = [4001, 4003, 4005, 4007, 4009];
    for (let k = 0; k < 5; k++) {
      const idx = 26 + k;
      bars[idx] = { time: bars[idx].time, open: closes[k] - 1.5, high: closes[k] + 0.3, low: closes[k] - 1.8, close: closes[k], volume: 1 };
    }
    return bars;
  }
  const structure = { state: 'BULLISH', lastSwingHigh: { price: 4006, index: 10, label: 'HH' }, lastSwingLow: { price: 3995, index: 5, label: 'HL' }, pivots: [] };
  it('fires on N progressing closes above EMA20 with expansion and a fresh swing break', () => {
    const bars = momentumBars();
    const c = evaluateMomentumContinuation({ bars, structure, atrRatio: 1.2, ema20: constEma(bars.length, 4000), bias: bias() });
    assert.ok(c, 'expected an MC candidate');
    assert.equal(c.model, 'MC');
    assert.equal(c.side, 'BUY');
    assert.equal(c.anchor, 4006);
    assert.equal(c.originBar, 29, 'first close above 4006 was 4007 at index 29');
    assert.ok(c.slAnchor < 4006, 'SL anchor is the leg base');
  });
  it('does NOT fire without volatility expansion, without progression, or when too late', () => {
    const bars = momentumBars();
    assert.equal(evaluateMomentumContinuation({ bars, structure, atrRatio: 0.8, ema20: constEma(bars.length, 4000), bias: bias() }), null);
    const stalled = momentumBars(); stalled[30].close = 4008.5; stalled[29].close = 4009; // last close lower than previous
    assert.equal(evaluateMomentumContinuation({ bars: stalled, structure, atrRatio: 1.2, ema20: constEma(bars.length, 4000), bias: bias() }), null);
    const late = { ...structure, lastSwingHigh: { price: 4000.5, index: 10, label: 'HH' } }; // broken 5 bars ago
    assert.equal(evaluateMomentumContinuation({ bars, structure: late, atrRatio: 1.2, ema20: constEma(bars.length, 4000), bias: bias() }), null);
  });
  it('never fires under NEUTRAL bias or against the bias side', () => {
    const bars = momentumBars();
    assert.equal(evaluateMomentumContinuation({ bars, structure, atrRatio: 1.2, ema20: constEma(bars.length, 4000), bias: bias({ direction: 'NEUTRAL', regime: 'RANGE', eligible_models: ['BO', 'SR', 'MR'] }) }), null);
    assert.equal(evaluateMomentumContinuation({ bars, structure, atrRatio: 1.2, ema20: constEma(bars.length, 4000), bias: bias({ direction: 'BEARISH', regime: 'BEAR_TREND' }) }), null);
  });
});

describe('intraday: Pullback Continuation (PB) measured against the 15m bias', () => {
  function pullbackBars({ resolvedBarsAgo = 0 } = {}) {
    // 40 uptrend bars to a 4040.3 high (ATR ~1.6), an 8-point pullback to
    // 4032 (~5 ATR), then closes back above the 5m EMA20 for N bars. The
    // detector needs >= swingLookback + emaFastLen (40) bars of history.
    const bars = [];
    let t = START_TIME;
    for (let i = 0; i < 40; i++) bars.push({ time: t += 300, open: 4000 + i, high: 4001.3 + i, low: 3999.7 + i, close: 4001 + i, volume: 1 });
    const pb = [4038, 4036, 4034, 4033, 4032.5, 4032];
    for (const c of pb) bars.push({ time: t += 300, open: c + 1, high: c + 1.3, low: c - 0.6, close: c, volume: 1 });
    // resumption closes stay below the old peak so the pullback remains material while the run lengthens.
    const res = [4037, 4037.3, 4037.6, 4037.9, 4038.1, 4038.3];
    const n = INTRADAY_PARAMS.pbResolveConfirmBars + resolvedBarsAgo;
    for (let k = 0; k < n; k++) { const c = res[k]; bars.push({ time: t += 300, open: c - 0.6, high: c + 0.3, low: c - 0.9, close: c, volume: 1 }); }
    return bars;
  }
  const EMA_RUN = 4035; // the run-length EMA reference: pullback closes 4034..4032 sit below it, resumption closes above
  it('fires on the resolution bar (fresh), with anchor/SL at the pullback extreme', () => {
    const bars = pullbackBars();
    const c = evaluatePullbackContinuation({ bars, ema20: constEma(bars.length, EMA_RUN), bias: bias() });
    assert.ok(c, 'expected a PB candidate');
    assert.equal(c.model, 'PB');
    assert.equal(c.side, 'BUY');
    assert.equal(c.anchor, 4031.4, 'pullback extreme low');
    assert.equal(c.slAnchor, c.anchor);
    assert.equal(c.originBar, bars.length - 1);
    assert.equal(c.correction.state, 'RESOLVED');
  });
  it('is NOT late-chased: resolution older than pbMaxEntryLateBars returns null even though the correction is still RESOLVED', () => {
    const bars = pullbackBars({ resolvedBarsAgo: INTRADAY_PARAMS.pbMaxEntryLateBars + 1 });
    assert.equal(evaluatePullbackContinuation({ bars, ema20: constEma(bars.length, EMA_RUN), bias: bias() }), null);
  });
  it('does not fire without a material pullback, or under NEUTRAL bias', () => {
    const trend = makeTrendBars(60, { noise: 0.02 });
    assert.equal(evaluatePullbackContinuation({ bars: trend, ema20: constEma(trend.length, trend.at(-1).close - 1), bias: bias() }), null);
    const bars = pullbackBars();
    assert.equal(evaluatePullbackContinuation({ bars, ema20: constEma(bars.length, EMA_RUN), bias: bias({ direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['BO', 'SR'] }) }), null);
  });
});

describe('intraday: Breakout/Retest (BO), Structure/Rejection (SR), Mean Reversion (MR)', () => {
  it('BO mirrors the reference rule on 5m and respects bias side', () => {
    const bars = makeFlatBars(20, { price: 4000 });
    bars[15] = { ...bars[15], close: 4001.2, high: 4001.4 }; // breakout bar
    bars[17] = { ...bars[17], low: 3999.9, close: 4000.6 }; // retest
    bars[19] = { ...bars[19], close: 4001.0, high: 4001.2 }; // reclaim
    const structure = { state: 'BULLISH', lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 15, level: 4000.5 } };
    const c = evaluateBreakoutRetest({ bars, regime: 'BULL_TREND', structure, atrVal: 0.5, bias: bias() });
    assert.equal(c?.model, 'BO');
    assert.equal(c.side, 'BUY');
    assert.equal(evaluateBreakoutRetest({ bars, regime: 'BULL_TREND', structure, atrVal: 0.5, bias: bias({ direction: 'BEARISH', regime: 'BEAR_TREND' }) }), null, 'a BUY breakout is not allowed under BEARISH bias');
  });
  it('SR requires real rejection evidence at a 15m/5m swing level, not merely a nearby swing', () => {
    const bars = makeFlatBars(20, { price: 4000 });
    // rejection candle at the 15m swing low 3990: long lower wick, close in the top third
    bars[19] = { time: bars[19].time, open: 3991.0, high: 3991.4, low: 3989.9, close: 3991.3, volume: 1 };
    const c = evaluateStructureRejection({ bars, structure: { state: 'BULLISH', lastSwingLow: null, lastSwingHigh: null }, atrVal: 1.0, bias: bias() });
    assert.equal(c?.model, 'SR');
    assert.equal(c.side, 'BUY');
    assert.equal(c.anchor, 3990);
    assert.equal(c.level_source, '15m_swing_low');
    // Same level, but a full-bodied bar with no wick -> no rejection.
    const noWick = makeFlatBars(20, { price: 4000 });
    noWick[19] = { time: noWick[19].time, open: 3990.2, high: 3991.4, low: 3990.1, close: 3991.3, volume: 1 };
    assert.equal(evaluateStructureRejection({ bars: noWick, structure: { state: 'BULLISH' }, atrVal: 1.0, bias: bias() }), null);
  });
  it('MR: only under 15m RANGE bias, 30m not trending, fresh 5m sweep; target = 15m range midpoint', () => {
    const bars = makeFlatBars(20, { price: 4000 });
    bars[18] = { ...bars[18], high: 4012.5, close: 4009 }; // sweep of 4012
    const structure = { state: 'BULLISH', lastSweep: { type: 'SWEEP_HIGH', bar: 18, level: 4012 } };
    const rangeBias = bias({ direction: 'NEUTRAL', regime: 'RANGE', eligible_models: ['BO', 'SR', 'MR'] });
    const c = evaluateMeanReversion({ bars, regime: 'RANGE', structure, bias: rangeBias, m30Regime: 'RANGE' });
    assert.equal(c?.model, 'MR');
    assert.equal(c.side, 'SELL');
    assert.equal(c.objectiveOverride, 4000, 'midpoint of 15m range 3988..4012');
    assert.equal(evaluateMeanReversion({ bars, regime: 'RANGE', structure, bias: bias(), m30Regime: 'RANGE' }), null, 'blocked outside 15m RANGE');
    assert.equal(evaluateMeanReversion({ bars, regime: 'RANGE', structure, bias: rangeBias, m30Regime: 'BULL_TREND' }), null, 'blocked when 30m trends');
    assert.equal(evaluateMeanReversion({ bars, regime: 'HIGH_VOLATILITY', structure, bias: rangeBias, m30Regime: 'RANGE' }), null, 'blocked in HIGH_VOLATILITY');
    const stale = { ...structure, lastSweep: { ...structure.lastSweep, bar: 10 } };
    assert.equal(evaluateMeanReversion({ bars, regime: 'RANGE', structure: stale, bias: rangeBias, m30Regime: 'RANGE' }), null, 'stale sweep');
  });
  it('evaluateIntradayModels returns null on a flat tape and when the bias has no eligible models', () => {
    const bars = makeFlatBars(40);
    const ctx = { bars, regime: 'RANGE', structure: { state: 'BULLISH' }, atrVal: 0.02, atrRatio: 1, ema20: constEma(40, 4000), m30Regime: 'RANGE' };
    assert.equal(evaluateIntradayModels({ ...ctx, bias: bias() }), null);
    assert.equal(evaluateIntradayModels({ ...ctx, bias: bias({ eligible_models: [] }) }), null);
  });
});

// ── 4. Risk / objective selection ──────────────────────────────────────
describe('intraday: risk and objective-aware TP2 selection', () => {
  const bars = makeFlatBars(30, { price: 4000 });
  const cand = (over = {}) => ({ model: 'MC', side: 'BUY', anchor: 3999, slAnchor: 3997, originBar: 29, ...over });
  it('skips a minor objective inside objectiveMinR and takes the next genuine one; reports what it skipped', () => {
    // entry 4000, sl = 3997 - 0.25*2 = 3996.5 -> risk 3.5. Pivot at 4002 (0.57R) is minor; 4007 (2.0R) is the objective.
    const structure5 = { pivots: [{ type: 'high', price: 4002, label: 'HH' }, { type: 'high', price: 4007, label: 'HH' }] };
    const r = computeIntradayRisk({ candidate: cand(), bars, atrVal: 2, structure5 });
    assert.equal(r.gate, 'OK');
    assert.equal(r.objective.price, 4007);
    assert.equal(r.objective.source, '5m_pivot');
    assert.equal(r.tp2, 4007);
    assert.equal(r.rr, 2);
    assert.deepEqual(r.skipped_minor_objectives.map((o) => o.price), [4002]);
  });
  it('caps the objective at tp2RMultipleCap and falls back to the default R-multiple with no structure at all', () => {
    const far = { pivots: [{ type: 'high', price: 4100 }] };
    const r = computeIntradayRisk({ candidate: cand(), bars, atrVal: 2, structure5: far });
    assert.equal(r.rr, INTRADAY_PARAMS.tp2RMultipleCap);
    assert.equal(r.objective.capped, true);
    const none = computeIntradayRisk({ candidate: cand(), bars, atrVal: 2 });
    assert.equal(none.objective.source, 'default_r_multiple');
    assert.equal(none.rr, INTRADAY_PARAMS.tp2RMultipleDefault);
  });
  it('RR floor 1.7 is enforced: an objective between 1.0R and 1.7R is a real obstacle -> RR_NOT_ACCEPTABLE', () => {
    const structure5 = { pivots: [{ type: 'high', price: 4004.5 }] }; // 1.29R
    const r = computeIntradayRisk({ candidate: cand(), bars, atrVal: 2, structure5 });
    assert.equal(r.gate, 'RR_NOT_ACCEPTABLE');
    assert.ok(r.rr < INTRADAY_PARAMS.minRR);
    assert.equal(r.tp2, 4004.5, 'the protected geometry that produced the rejection is exposed');
  });
  it('model objective override (MR midpoint) is used verbatim', () => {
    const r = computeIntradayRisk({ candidate: cand({ model: 'MR', objectiveOverride: 4008 }), bars, atrVal: 2, structure5: { pivots: [{ type: 'high', price: 4003 }] } });
    assert.equal(r.objective.source, 'model_override');
    assert.equal(r.tp2, 4008);
  });
  it('volatility sufficiency: refuses when 5m ATR is below minAtrUsd', () => {
    const r = computeIntradayRisk({ candidate: cand(), bars, atrVal: INTRADAY_PARAMS.minAtrUsd - 0.5 });
    assert.equal(r.gate, 'VOLATILITY_INSUFFICIENT');
  });
  it('overextension gate and minimum risk distance', () => {
    assert.equal(computeIntradayRisk({ candidate: cand({ anchor: 3990 }), bars, atrVal: 2 }).gate, 'OVEREXTENDED');
    const tight = computeIntradayRisk({ candidate: cand({ slAnchor: 3999.9 }), bars, atrVal: 2 });
    assert.equal(tight.gate, 'OK');
    assert.ok(tight.risk_atr >= INTRADAY_PARAMS.minRiskAtr - 1e-9, 'stop never inside 5m noise');
    assert.match(tight.sl_source, /min_risk/);
  });
  it('geometry ordering for BUY and SELL', () => {
    const b = computeIntradayRisk({ candidate: cand(), bars, atrVal: 2 });
    assert.ok(b.stop_loss < b.entry && b.entry < b.tp1 && b.tp1 < b.tp2);
    const s = computeIntradayRisk({ candidate: cand({ side: 'SELL', anchor: 4001, slAnchor: 4003 }), bars, atrVal: 2 });
    assert.ok(s.stop_loss > s.entry && s.entry > s.tp1 && s.tp1 > s.tp2);
  });
});

// ── 5. Combiner vetoes ─────────────────────────────────────────────────
describe('intraday: combineIntraday applies only the three strong-conflict vetoes', () => {
  const buy = { status: 'OK', regime: 'BULL_TREND', model: 'MC', structure: { state: 'BULLISH' }, decision: { action: 'BUY', wait_reason: null, entry: 1, stop_loss: 0.5, tp1: 1.5, tp2: 2, rr: 2 }, quality: { score: 80 } };
  const wait = { status: 'OK', regime: 'BULL_TREND', model: null, decision: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' } };
  it('bias unavailable -> WAIT/BIAS_UNAVAILABLE; 5m WAIT passes through its own reason', () => {
    assert.equal(combineIntraday({ intraday: buy, bias: { status: 'INSUFFICIENT_DATA' } }).wait_reason, 'BIAS_UNAVAILABLE');
    assert.equal(combineIntraday({ intraday: wait, bias: bias() }).wait_reason, 'NO_ELIGIBLE_STRATEGY');
  });
  it('15m fresh opposing CHoCH -> ENTRY_CONFLICT', () => {
    const r = combineIntraday({ intraday: buy, bias: bias({ fresh_opposing_choch: { direction: 'BEARISH', level: 1, bars_ago: 0 } }) });
    assert.equal(r.action, 'WAIT');
    assert.equal(r.wait_reason, 'ENTRY_CONFLICT');
    assert.match(r.conflict, /CHoCH/);
  });
  it('30m vetoes only on TWO-factor opposition (regime AND structure); one factor alone passes', () => {
    const both = { status: 'OK', regime: 'BEAR_TREND', structure: { state: 'BEARISH' } };
    const regimeOnly = { status: 'OK', regime: 'BEAR_TREND', structure: { state: 'BULLISH' } };
    const noStructure = { status: 'OK', regime: 'BEAR_TREND', structure: null };
    assert.equal(combineIntraday({ intraday: buy, bias: bias(), m30: both }).wait_reason, 'ENTRY_CONFLICT');
    assert.equal(combineIntraday({ intraday: buy, bias: bias(), m30: regimeOnly }).action, 'BUY');
    assert.equal(combineIntraday({ intraday: buy, bias: bias(), m30: noStructure }).action, 'BUY');
  });
  it('1H opposed vetoes MR and unaligned trades only; an aligned continuation passes (penalised, not blocked)', () => {
    const ctx1H = { status: 'OK', regime: 'BEAR_TREND' };
    const aligned = combineIntraday({ intraday: buy, bias: bias(), ctx1H });
    assert.equal(aligned.action, 'BUY');
    assert.equal(aligned.htf_penalised, true);
    const neutral = combineIntraday({ intraday: buy, bias: bias({ direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['BO', 'SR'] }), ctx1H });
    assert.equal(neutral.wait_reason, 'HTF_CONFLICT');
    const mr = combineIntraday({ intraday: { ...buy, model: 'MR' }, bias: bias({ direction: 'NEUTRAL', regime: 'RANGE', eligible_models: ['BO', 'SR', 'MR'] }), ctx1H });
    assert.equal(mr.wait_reason, 'HTF_CONFLICT');
    assert.equal(combineIntraday({ intraday: buy, bias: bias(), ctx1H: { status: 'DATA_UNAVAILABLE', regime: null } }).action, 'BUY', 'unavailable 1H never blocks');
  });
  it('a passing trade carries the 5m geometry verbatim and source_timeframe 5m', () => {
    const r = combineIntraday({ intraday: buy, bias: bias() });
    assert.equal(r.source_timeframe, '5m');
    assert.deepEqual(r.decision, buy.decision);
    assert.equal(r.model, 'MC');
  });
});

// ── 6. No forced trades ────────────────────────────────────────────────
describe('intraday: pipeline never forces a trade', () => {
  it('a flat tape is 100% WAIT with null geometry', () => {
    const bars5 = makeFlatBars(MIN_BARS_REQUIRED + 20);
    const r = runIntradayPipeline({ bars5, bias: bias() });
    assert.equal(r.decision.action, 'WAIT');
    assert.equal(r.decision.entry, null);
    assert.equal(r.decision.rr, null);
  });
  it('CHOP bias (no eligible models) -> WAIT/CHOP; missing bias -> BIAS_UNAVAILABLE; short data -> INSUFFICIENT_DATA', () => {
    const bars5 = makeTrendBars(MIN_BARS_REQUIRED + 20);
    assert.equal(runIntradayPipeline({ bars5, bias: bias({ regime: 'CHOP_UNCERTAIN', direction: 'NEUTRAL', eligible_models: [] }) }).decision.wait_reason, 'CHOP');
    assert.equal(runIntradayPipeline({ bars5, bias: { status: 'INSUFFICIENT_DATA' } }).decision.wait_reason, 'BIAS_UNAVAILABLE');
    assert.equal(runIntradayPipeline({ bars5: bars5.slice(0, 50), bias: bias() }).status, 'INSUFFICIENT_DATA');
  });
  it('a real 5m uptrend under BULLISH bias produces either WAIT with a named reason or a fully-formed BUY (never SELL, never partial geometry)', () => {
    const bars5 = makeTrendBars(260, { drift: 0.9, noise: 0.5, seed: 7 });
    const b = computeBias({ confirmedBars: makeTrendBars(260, { tfSeconds: 900, drift: 1.5, noise: 0.6, seed: 3 }) });
    const r = runIntradayPipeline({ bars5, bias: b, m30Regime: 'BULL_TREND' });
    if (r.decision.action === 'WAIT') {
      assert.ok(typeof r.decision.wait_reason === 'string' && r.decision.wait_reason.length > 0);
    } else {
      assert.equal(r.decision.action, 'BUY');
      for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.ok(Number.isFinite(r.decision[f]), f);
      assert.ok(r.decision.rr >= INTRADAY_PARAMS.minRR);
      assert.ok(r.quality.score >= INTRADAY_PARAMS.qualityThreshold);
    }
  });
});

// ── 7. Orchestrator wiring ─────────────────────────────────────────────
function fakeDeps({ bars5, bars15, bars30, barsCtx, store = { signals: [] }, env = {}, master = null }) {
  const byTf = {};
  for (const tf of ALL_TIMEFRAMES) byTf[tf] = tf === '5' ? bars5 : tf === '15' ? bars15 : tf === '30' ? bars30 : barsCtx;
  let current = '5';
  const saved = { store };
  return {
    deps: {
      getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: current }),
      setTimeframe: async ({ timeframe }) => { current = timeframe; return { success: true }; },
      getOhlcv: async () => ({ bars: byTf[current] }),
      getMasterState: async () => master ?? { status: 'NOT_FOUND' },
      loadStore: () => saved.store,
      saveStore: (_p, s) => { saved.store = s; },
      storePath: 'memory',
      withCdpLock: async (_path, fn) => fn(),
      cdpLockPath: 'memory.lock',
      env,
    },
    saved,
  };
}
function stripVolatile(r) { const { calculated_at, ...rest } = r; return rest; }

describe('intraday: calculateEntry() profile wiring', () => {
  const bars5 = makeTrendBars(400, { drift: 0.9, noise: 0.5, seed: 11 });
  const bars15 = makeTrendBars(400, { tfSeconds: 900, drift: 1.5, noise: 0.6, seed: 12 });
  const bars30 = makeTrendBars(400, { tfSeconds: 1800, drift: 2.5, noise: 0.8, seed: 13 });
  const barsCtx = makeTrendBars(400, { tfSeconds: 3600, drift: 4, noise: 1, seed: 14 });

  it('default (no profile anywhere) is the reference engine, byte-identical to an explicit reference_15m call', async () => {
    const a = await calculateEntry({ _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    const b = await calculateEntry({ engineProfile: 'reference_15m', _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    assert.equal(a.schema_version, CALCULATE_SCHEMA_VERSION);
    assert.equal(a.engine_profile, undefined, 'reference result shape is unchanged');
    assert.equal(a.diagnostics.source_timeframe, '15m');
    assert.deepEqual(stripVolatile(a), stripVolatile(b));
  });
  it('intraday_5m via the option OR the env produces the 5m-authority result shape', async () => {
    const viaOpt = await calculateEntry({ engineProfile: 'intraday_5m', _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    const viaEnv = await calculateEntry({ _deps: fakeDeps({ bars5, bars15, bars30, barsCtx, env: { XAUUSD_ENGINE_PROFILE: 'intraday' } }).deps });
    for (const r of [viaOpt, viaEnv]) {
      assert.equal(r.status, 'OK');
      assert.equal(r.schema_version, INTRADAY_SCHEMA_VERSION);
      assert.equal(r.engine_profile, 'intraday_5m');
      assert.equal(r.diagnostics.source_timeframe, '5m');
      assert.equal(r.diagnostics.bias_timeframe, '15m');
      assert.equal(r.timeframes['5m'].role, 'entry');
      assert.equal(r.timeframes['15m'].role, 'bias');
      assert.equal(r.timeframes['30m'].role, 'conflict_filter');
      assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(r.bias.direction));
      assert.ok(Array.isArray(r.bias.eligible_models));
      assert.ok(r.timeframes['1H'] && r.timeframes['1D'], 'context tiers still reported');
      if (r.action === 'WAIT') { assert.equal(r.entry, null); assert.ok(r.reason); } else { assert.ok(r.signal); assert.equal(r.signal.timeframe, '5m'); }
    }
  });
  it('an unknown profile throws before any chart sweep', async () => {
    let swept = false;
    const { deps } = fakeDeps({ bars5, bars15, bars30, barsCtx });
    deps.getState = async () => { swept = true; return { symbol: 'OANDA:XAUUSD', resolution: '5' }; };
    await assert.rejects(() => calculateEntry({ engineProfile: 'turbo', _deps: deps }), /unknown engine profile/);
    assert.equal(swept, false);
  });
  it('DATA_UNAVAILABLE on the intraday profile still fails closed and is labelled', async () => {
    const r = await calculateEntry({ engineProfile: 'intraday_5m', _deps: fakeDeps({ bars5: bars5.slice(0, 20), bars15, bars30, barsCtx }).deps });
    assert.equal(r.status, 'DATA_UNAVAILABLE');
    assert.equal(r.action, 'WAIT');
    assert.equal(r.engine_profile, 'intraday_5m');
  });
  it('analyzeMarket() forwards the profile and keeps the 15m observability layers', async () => {
    const r = await analyzeMarket({ engineProfile: 'intraday_5m', _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    assert.equal(r.engine_profile, 'intraday_5m');
    assert.equal(r.diagnostics.source_timeframe, '5m');
    assert.ok(r.anticipation, 'anticipation layer still present');
    assert.ok(r.candidates, 'candidate observability still present');
    assert.ok(Array.isArray(r.primary_confirmed_bars));
  });
});

// ── 8. Signal identity / dedup on the 5m profile ───────────────────────
describe('intraday: 5m signal identity, thesis dedup, fresh-signal semantics', () => {
  it('a 5m signal id never collides with a 15m id for the same bar/model/side', () => {
    const base = { symbol: 'OANDA:XAUUSD', model: 'BO', side: 'BUY', originBar: 100, signalBarTime: 100 };
    assert.notEqual(computeSignalId({ ...base, timeframe: '5m' }), computeSignalId({ ...base, timeframe: '15m' }));
  });
  it('same 5m level + side while OPEN is folded into the existing record; a new level is a new thesis', () => {
    const store = { signals: [] };
    const thesisA = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '5m', direction: 'BULLISH', structuralAnchorPrice: 4006, regime: 'BULL_TREND' });
    const thesisB = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '5m', direction: 'BULLISH', structuralAnchorPrice: 4020, regime: 'BULL_TREND' });
    const c = (over) => ({ symbol: 'OANDA:XAUUSD', timeframe: '5m', model: 'MC', side: 'BUY', originBar: 1, signalBarTime: 1, entry: 4007, stop_loss: 4004, tp1: 4010, tp2: 4013, rr: 2, quality: 70, thesisId: thesisA, ...over });
    const first = registerOrGetSignal(store, c({}));
    const second = registerOrGetSignal(store, c({ originBar: 2, signalBarTime: 2, model: 'PB' }));
    const third = registerOrGetSignal(store, c({ originBar: 3, signalBarTime: 3, thesisId: thesisB }));
    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(second.blockedByOpenThesis, true);
    assert.equal(third.isNew, true);
    assert.equal(store.signals.length, 2);
  });
  it('a 15m OPEN record does not block a 5m registration (profiles coexist in one store)', () => {
    const store = { signals: [] };
    const thesis = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 4006, regime: 'BULL_TREND' });
    registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 1, signalBarTime: 1, entry: 1, stop_loss: 0.5, tp1: 1.5, tp2: 2, rr: 2, quality: 70, thesisId: thesis });
    const r = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '5m', model: 'MC', side: 'BUY', originBar: 1, signalBarTime: 1, entry: 1, stop_loss: 0.5, tp1: 1.5, tp2: 2, rr: 2, quality: 70, thesisId: thesis });
    assert.equal(r.isNew, true);
  });
});

// ── 9. MT5 safety rules untouched ──────────────────────────────────────
describe('intraday: MT5 DEMO policy defaults are untouched by the engine redesign', () => {
  it('account/lot/budget/overlay/ceiling/circuit-breaker defaults are exactly as before', () => {
    assert.equal(MT5_DEFAULTS.login, 480236873);
    assert.equal(MT5_DEFAULTS.server, 'Exness-MT5Trial11');
    assert.equal(MT5_DEFAULTS.symbol, 'XAUUSDm');
    assert.equal(MT5_DEFAULTS.lotSize, 0.01);
    assert.equal(MT5_DEFAULTS.maxLotSize, 0.01);
    assert.equal(MT5_DEFAULTS.tradeBudgetUsd, 10);
    assert.equal(MT5_DEFAULTS.takeProfitPercent, 30);
    assert.equal(MT5_DEFAULTS.stopLossPercent, 50);
    assert.equal(MT5_DEFAULTS.maxTradesPerDay, 150);
    assert.equal(MT5_DEFAULTS.dailyLossLimitUsd, 25);
    assert.equal(MT5_DEFAULTS.maxConsecutiveLosses, 5);
    assert.equal(MT5_DEFAULTS.maxSignalAgeSec, 600);
  });
});

// ── 10. Replay-verified fixes (2026-09-25 session) ─────────────────────
// Real OANDA:XAUUSD bars, used ONLY for invariants -- never for trade
// counts or outcomes (no optimisation to one day's tape).
import { readFileSync as _readFixture } from 'node:fs';
import { fileURLToPath as _toPath } from 'node:url';
import { htfSupportsSide, resolveQualityThreshold } from '../src/engine/intraday/pipeline5m.js';
import { runPipeline as _runReferencePipeline } from '../src/engine/pipeline.js';
import { computeHtfContext } from '../src/engine/htf.js';
import { attachIntradayEngineCandidate } from '../src/core/xauusd_analyze_market.js';
import { formatMarketAnalysis } from '../src/core/presentation.js';
import { MODEL_PARAMS } from '../src/engine/models.js';
import { CORRECTION_PARAMS } from '../src/engine/correction.js';

const FIXTURE = JSON.parse(_readFixture(_toPath(new URL('./fixtures/xauusd_intraday_session_2026-09-25.json', import.meta.url)), 'utf8'));
const closedBy = (bars, tfSec, tClose) => bars.filter((b) => b.time + tfSec <= tClose);

/** Decision at 5m bar index i using ONLY bars closed by that bar's close on every timeframe. */
function decideAt(i, fx = FIXTURE) {
  const b5 = fx.bars['5'].slice(0, i + 1);
  const tClose = b5.at(-1).time + 300;
  const b15 = closedBy(fx.bars['15'], 900, tClose), b30 = closedBy(fx.bars['30'], 1800, tClose), b60 = closedBy(fx.bars['60'], 3600, tClose);
  const biasR = computeBias({ confirmedBars: b15 });
  const m30 = _runReferencePipeline({ confirmedBars: b30 });
  const ctx1H = computeHtfContext(b60, { includeCorrection: true });
  const intraday = runIntradayPipeline({ bars5: b5, bias: biasR, m30Regime: m30.regime, ctx1H });
  const combined = combineIntraday({ intraday, bias: biasR, m30, ctx1H });
  return { intraday, combined, bias: biasR, ctx1H, m30 };
}

describe('intraday: replay-verified fix 1 -- BO stop anchored at the retest extreme', () => {
  it('BO SELL: slAnchor is the highest high AFTER the breakout bar, not the distant prior swing high', () => {
    const bars = makeFlatBars(30, { price: 4280 });
    bars[20] = { ...bars[20], close: 4277.0, low: 4276.8 }; // breakout below 4277.66
    bars[22] = { ...bars[22], high: 4277.9, close: 4277.2 }; // retest (within 0.3 ATR)
    bars[29] = { ...bars[29], close: 4274.8, high: 4275.2 }; // reclaim below
    const structure = { state: 'BEARISH', lastEvent: { type: 'BOS', direction: 'BEARISH', bar: 20, level: 4277.66 }, lastSwingHigh: { price: 4296.5, index: 3, label: 'LH' } };
    const c = evaluateBreakoutRetest({ bars, regime: 'BEAR_TREND', structure, atrVal: 3.0, bias: bias({ direction: 'BEARISH', regime: 'BEAR_TREND' }) });
    assert.equal(c?.model, 'BO');
    assert.equal(c.slAnchor, 4280.01, 'max high of bars 21..29 (flat bars carry high = price + 0.01)');
    assert.ok(c.slAnchor < 4296.5, 'never the stale prior swing high');
  });
  it('the same candidate now passes the RR gate that the stale-swing stop failed (objective selection unchanged)', () => {
    const bars = makeFlatBars(30, { price: 4271.9 });
    const structure5 = { lastSwingHigh: { price: 4296.7 }, pivots: [{ type: 'low', price: 4244.27 }] };
    const stale = computeIntradayRisk({ candidate: { model: 'BO', side: 'SELL', anchor: 4277.66, slAnchor: null, originBar: 25 }, bars, atrVal: 3.16, structure5 });
    const fixed = computeIntradayRisk({ candidate: { model: 'BO', side: 'SELL', anchor: 4277.66, slAnchor: 4277.13, originBar: 25 }, bars, atrVal: 3.16, structure5 });
    assert.equal(stale.gate, 'RR_NOT_ACCEPTABLE');
    assert.ok(stale.rr < INTRADAY_PARAMS.minRR);
    assert.equal(fixed.gate, 'OK');
    assert.equal(fixed.objective.price, 4244.27, 'objective identical in both runs');
    assert.ok(fixed.rr >= INTRADAY_PARAMS.minRR);
    assert.ok(fixed.risk_atr < INTRADAY_PARAMS.overextendAtrMult, 'stop distance is intraday-scale, not a stale swing');
  });
  it('a retest that trades on the wrong side of the entry still falls back to the ATR stop (never a zero/negative risk)', () => {
    const bars = makeFlatBars(30, { price: 4270 });
    const r = computeIntradayRisk({ candidate: { model: 'BO', side: 'SELL', anchor: 4271, slAnchor: 4269, originBar: 25 }, bars, atrVal: 3 });
    assert.ok(r.gate === 'OK' || r.gate === 'RR_NOT_ACCEPTABLE');
    assert.ok(r.stop_loss > 4270);
    assert.match(r.sl_source, /atr_fallback/);
  });
});

describe('intraday: replay-verified fix 2 -- quality bar qualified by 1H support under NEUTRAL bias', () => {
  const bear1H = { status: 'OK', regime: 'BEAR_TREND', structure_direction: 'BEARISH' };
  const range1H = { status: 'OK', regime: 'RANGE', structure_direction: null };
  it('directional bias -> 65 regardless of 1H', () => {
    assert.deepEqual(resolveQualityThreshold({ bias: bias(), side: 'BUY', ctx1H: bear1H }), { threshold: 65, basis: 'directional_bias' });
  });
  it('NEUTRAL bias + 1H supports the side -> 65 (directional context exists)', () => {
    const neutral = bias({ direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['BO', 'SR'] });
    assert.equal(htfSupportsSide(bear1H, 'SELL'), true);
    assert.deepEqual(resolveQualityThreshold({ bias: neutral, side: 'SELL', ctx1H: bear1H }), { threshold: 65, basis: 'neutral_bias_htf_supported' });
  });
  it('NEUTRAL bias + no 1H support -> 70; NEUTRAL + 1H opposed -> 70 (and the combiner still vetoes the unaligned trade)', () => {
    const neutral = bias({ direction: 'NEUTRAL', regime: 'TRANSITION', eligible_models: ['BO', 'SR'] });
    assert.deepEqual(resolveQualityThreshold({ bias: neutral, side: 'SELL', ctx1H: range1H }), { threshold: 70, basis: 'neutral_bias_unsupported' });
    assert.deepEqual(resolveQualityThreshold({ bias: neutral, side: 'BUY', ctx1H: bear1H }), { threshold: 70, basis: 'neutral_bias_unsupported' });
    assert.equal(htfSupportsSide(bear1H, 'BUY'), false);
    assert.equal(htfSupportsSide({ status: 'DATA_UNAVAILABLE', regime: null }, 'SELL'), false, 'unavailable 1H is never "support"');
  });
  it('the qualified bar never enables MC/PB under NEUTRAL bias (bias eligibility untouched)', () => {
    assert.deepEqual(eligibleModelsFor({ regime: 'TRANSITION', direction: 'NEUTRAL' }), ['BO', 'SR']);
    assert.deepEqual(eligibleModelsFor({ regime: 'RANGE', direction: 'NEUTRAL' }), ['BO', 'SR', 'MR']);
  });
});

describe('intraday: real-session replay invariants (no look-ahead, confirmed candles only, no forced trade)', () => {
  const start = FIXTURE.bars['5'].findIndex((b) => b.time >= FIXTURE.session_start);
  const rows = [];
  for (let i = start; i < FIXTURE.bars['5'].length; i++) rows.push({ i, ...decideAt(i) });

  it('the fixture covers a real session and every bar produced a decision with a named reason or a full trade', () => {
    assert.ok(rows.length >= 60, `expected >= 60 session bars, got ${rows.length}`);
    for (const r of rows) {
      if (r.combined.action === 'WAIT') assert.ok(typeof r.combined.wait_reason === 'string' && r.combined.wait_reason.length > 0, `bar ${r.i}`);
      else {
        assert.ok(['BUY', 'SELL'].includes(r.combined.action));
        for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.ok(Number.isFinite(r.combined.decision[f]), `bar ${r.i} ${f}`);
        assert.ok(r.combined.decision.rr >= INTRADAY_PARAMS.minRR, `bar ${r.i} rr`);
        assert.ok(r.combined.quality.score >= r.combined.quality.threshold, `bar ${r.i} quality`);
      }
    }
  });
  it('no look-ahead: a decision computed from a prefix is identical to the one recorded while replaying, and appending later bars never changes it', () => {
    for (const idx of [start + 10, start + 30, start + 45, rows.length - 1 + start]) {
      const a = rows.find((r) => r.i === idx);
      const b = decideAt(idx);
      assert.deepEqual(b.combined.action, a.combined.action);
      assert.deepEqual(b.combined.wait_reason, a.combined.wait_reason);
      assert.deepEqual(b.intraday.evidence?.candidate ?? null, a.intraday.evidence?.candidate ?? null);
      // Truncated universe: the same bar index from a fixture cut off right after it must agree.
      const cut = { ...FIXTURE, bars: Object.fromEntries(Object.entries(FIXTURE.bars).map(([tf, bars]) => [tf, bars.filter((x) => x.time <= FIXTURE.bars['5'][idx].time)])) };
      const c = decideAt(idx, cut);
      assert.equal(c.combined.action, a.combined.action);
      assert.equal(c.combined.wait_reason, a.combined.wait_reason);
    }
  });
  it('models were genuinely evaluated on real data (candidates formed) and every model respects its bias gate', () => {
    const withCand = rows.filter((r) => r.intraday.evidence?.candidate);
    assert.ok(withCand.length > 0, 'at least one 5m candidate formed during the session');
    for (const r of withCand) {
      const c = r.intraday.evidence.candidate;
      assert.ok(r.bias.eligible_models.includes(c.model), `bar ${r.i}: ${c.model} not eligible under ${r.bias.direction}/${r.bias.regime}`);
      if (c.model === 'MC' || c.model === 'PB') assert.notEqual(r.bias.direction, 'NEUTRAL', `bar ${r.i}: ${c.model} under NEUTRAL bias`);
      if (c.model === 'MR') assert.equal(r.bias.regime, 'RANGE');
      if (r.bias.direction === 'BULLISH') assert.equal(c.side, 'BUY');
      if (r.bias.direction === 'BEARISH') assert.equal(c.side, 'SELL');
    }
  });
  it('quality bar basis is consistent with 1H support on every candidate bar', () => {
    for (const r of rows.filter((r) => r.intraday.quality)) {
      const q = r.intraday.quality;
      const side = r.intraday.evidence.candidate.side;
      const expect = resolveQualityThreshold({ bias: r.bias, side, ctx1H: r.ctx1H });
      assert.equal(q.threshold, expect.threshold, `bar ${r.i}`);
      assert.equal(q.threshold_basis, expect.basis, `bar ${r.i}`);
    }
  });
  it('BO stops are never anchored beyond the retest extreme (no 3-6 ATR stale-swing stops)', () => {
    for (const r of rows.filter((r) => r.intraday.evidence?.candidate?.model === 'BO' && r.intraday.evidence?.risk?.stop_loss != null)) {
      const risk = r.intraday.evidence.risk;
      assert.ok(risk.risk_atr <= INTRADAY_PARAMS.overextendAtrMult + INTRADAY_PARAMS.slAtrBuffer + 0.6, `bar ${r.i}: risk ${risk.risk_atr} ATR`);
    }
  });
  it('every WAIT keeps null geometry and no trade is ever fabricated on a bar without a candidate', () => {
    for (const r of rows) {
      if (r.combined.action === 'WAIT') assert.equal(r.intraday.decision.entry === null || r.intraday.decision.action === 'WAIT', true);
      if (!r.intraday.evidence?.candidate) assert.equal(r.intraday.decision.action, 'WAIT', `bar ${r.i}`);
    }
  });
});

describe('intraday: planner wiring (engine candidate is planning-only)', () => {
  const dec = (over = {}) => ({ engine_profile: 'intraday_5m', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', entry: null, sl: null, tp1: null, tp2: null, rr: null,
    diagnostics: { source_timeframe: '5m', candidate: { model: 'BO', side: 'SELL', anchor: 4277.66, reason: 'x' }, candidate_geometry: { gate: 'RR_NOT_ACCEPTABLE', entry: 4271.2, sl: 4296.7, tp1: 4245.7, tp2: 4244.27, rr: 1.06, quality: null, quality_threshold: null }, objective: { price: 4244.27, source: '15m_range', r: 1.06 } }, ...over });
  it('attaches engine_candidate on an intraday WAIT with a candidate, with the exact blocker and the condition still required', () => {
    const plan = attachIntradayEngineCandidate({ status: 'NO_PLAN' }, dec());
    assert.equal(plan.engine_candidate.planning_only, true);
    assert.equal(plan.engine_candidate.model, 'BO');
    assert.equal(plan.engine_candidate.blocked_by, 'RR_NOT_ACCEPTABLE');
    assert.equal(plan.engine_candidate.entry, 4271.2);
    assert.match(plan.engine_candidate.condition_required, /1\.7/);
  });
  it('never attaches on BUY/SELL, never for the reference profile, never without a candidate; top-level trade fields stay null', () => {
    const d = dec();
    assert.equal(attachIntradayEngineCandidate({ status: 'PLAN' }, { ...d, action: 'SELL' }).engine_candidate, null);
    assert.equal(attachIntradayEngineCandidate({ status: 'PLAN' }, { ...d, engine_profile: undefined }).engine_candidate, undefined);
    assert.equal(attachIntradayEngineCandidate({ status: 'PLAN' }, { ...d, diagnostics: { source_timeframe: '5m', candidate: null } }).engine_candidate, null);
    assert.equal(d.entry, null);
  });
  it('presentation prints the intraday candidate as planning-only lines, never as Entry/SL/TP trade lines', () => {
    const plan = attachIntradayEngineCandidate({ status: 'NO_PLAN', reason: 'NO_OBJECTIVE_SETUP' }, dec());
    const out = formatMarketAnalysis({ schema_version: '1.2.0', status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', symbol: 'OANDA:XAUUSD', timeframes: {}, regime: 'BEAR_TREND', diagnostics: { source_timeframe: '5m' }, pre_entry_plan: plan, anticipation: null, confluence: null });
    const text = out.lines.join('\n');
    assert.match(text, /Intraday candidate: BO SELL — blocked by RR_NOT_ACCEPTABLE/);
    assert.match(text, /Provisional \(planning only\): Entry 4271\.2/);
    assert.doesNotMatch(text, /^Entry: /m, 'no confirmed-trade Entry line on WAIT');
  });
  it('analyzeMarket() on the intraday profile reports 5m evidence and a planning candidate when one is blocked', async () => {
    const bars5 = FIXTURE.bars['5'], bars15 = FIXTURE.bars['15'], bars30 = FIXTURE.bars['30'], barsCtx = FIXTURE.bars['60'];
    const r = await analyzeMarket({ engineProfile: 'intraday_5m', _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    assert.equal(r.evidence_timeframe, '5m');
    assert.ok(Array.isArray(r.primary_confirmed_bars) && r.primary_confirmed_bars.length === bars5.length - 1, 'planning bars are the confirmed 5m bars');
    assert.ok('engine_candidate' in (r.pre_entry_plan ?? {}), 'engine_candidate key present on the intraday plan');
    if (r.action === 'WAIT' && r.diagnostics.candidate) assert.equal(r.pre_entry_plan.engine_candidate.model, r.diagnostics.candidate.model);
    const ref = await analyzeMarket({ _deps: fakeDeps({ bars5, bars15, bars30, barsCtx }).deps });
    assert.equal(ref.evidence_timeframe, '15m', 'reference profile evidence stays on 15m');
    assert.equal(ref.pre_entry_plan?.engine_candidate, undefined, 'reference plan shape untouched');
  });
});

describe('intraday: reference engine constants untouched by the fixes', () => {
  it('reference model/risk/correction/quality params are the locked values', () => {
    assert.deepEqual(MODEL_PARAMS, { boRetestAtrTol: 0.3, boMaxEntryLateBars: 10, tcMaxEntryLateBars: 5, pbMaxEntryLateBars: 5, freshEventLookbackBars: 3 });
    assert.equal(RISK_PARAMS.minRR, 1.7);
    assert.equal(RISK_PARAMS.slAtrBuffer, 0.25);
    assert.equal(CORRECTION_PARAMS.corrResolveConfirmBars, 3);
    assert.equal(QUALITY_PARAMS.qualityThreshold, 65);
  });
});
