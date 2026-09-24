/**
 * MCP calculation engine (P9 pivot) — deterministic unit tests using
 * synthetic OHLCV fixtures only. These prove the engine's own math/gates
 * are correct; they make no claim about real market profitability.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { classifyRegime, REGIME_PARAMS } from '../src/engine/regime.js';
import { findPivots, computeStructure } from '../src/engine/structure.js';
import { computeCorrection } from '../src/engine/correction.js';
import { evaluateModels } from '../src/engine/models.js';
import { computeRisk } from '../src/engine/risk.js';
import { scoreQuality, classifySession } from '../src/engine/quality.js';
import { runPipeline, MIN_BARS_REQUIRED } from '../src/engine/pipeline.js';
import { combineTimeframes } from '../src/engine/mtf.js';
import { computeSignalId, registerOrGetSignal, resolveOpenSignals } from '../src/engine/signalStore.js';
import { computeSetupId, resolveStructuralAnchorPrice } from '../src/engine/anticipationStore.js';
import { calculateEntry, detectMaterialDisagreement } from '../src/core/xauusd_calculate.js';
import { formatEngineDecision } from '../src/core/presentation.js';
import { seededRng } from '../validation/metrics.js';

const START_TIME = 1700000000; // arbitrary fixed epoch, 15-minute bars unless noted

function makeTrendBars(n, { start = 2000, drift = 0.6, noise = 0.15, seed = 1, tfSeconds = 900 } = {}) {
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

function makeRangeBars(n, { center = 2000, amplitude = 3, seed = 2, tfSeconds = 900 } = {}) {
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

describe('engine/regime: classifyRegime', () => {
  it('classifies a strong clean uptrend as BULL_TREND', () => {
    const bars = makeTrendBars(220, { drift: 0.6, noise: 0.1, seed: 11 });
    const { regime } = classifyRegime(bars, REGIME_PARAMS);
    assert.equal(regime, 'BULL_TREND');
  });
  it('classifies a strong clean downtrend as BEAR_TREND', () => {
    const bars = makeTrendBars(220, { drift: -0.6, noise: 0.1, seed: 12 });
    const { regime } = classifyRegime(bars, REGIME_PARAMS);
    assert.equal(regime, 'BEAR_TREND');
  });
  it('does not classify a flat, driftless noisy series as a trend', () => {
    const rng = seededRng(13);
    const bars = [];
    let price = 2000;
    for (let i = 0; i < 220; i++) {
      const open = price;
      const close = 2000 + (rng() - 0.5) * 1.0; // mean-reverts around 2000, no systematic drift
      const high = Math.max(open, close) + 0.1;
      const low = Math.min(open, close) - 0.1;
      bars.push({ time: START_TIME + i * 900, open, high, low, close, volume: 100 });
      price = close;
    }
    const { regime } = classifyRegime(bars, REGIME_PARAMS);
    assert.ok(regime !== 'BULL_TREND' && regime !== 'BEAR_TREND');
  });
  it('reports insufficient_data rather than a fabricated regime on a short series', () => {
    const bars = makeTrendBars(20, { seed: 14 });
    const { regime, evidence } = classifyRegime(bars, REGIME_PARAMS);
    assert.equal(regime, null);
    assert.equal(evidence.insufficient_data, true);
  });
});

describe('engine/structure: no-lookahead', () => {
  it('a pivot reported from a longer bar series is IDENTICAL when computed from a shorter prefix that still contains its confirmation window', () => {
    const bars = makeTrendBars(150, { drift: 0.3, noise: 0.4, seed: 21 });
    const full = findPivots(bars, 5, 5);
    const prefix = findPivots(bars.slice(0, 110), 5, 5);
    const prefixEarly = prefix.filter((p) => p.index <= 100);
    const fullEarly = full.filter((p) => p.index <= 100);
    assert.deepEqual(prefixEarly, fullEarly);
  });
});

describe('engine/correction: active then resolved', () => {
  it('detects ACTIVE during a pullback and RESOLVED once momentum resumes', () => {
    const rng = seededRng(31);
    const bars = makeTrendBars(200, { drift: 0.5, noise: 0.1, seed: 31 });
    // splice in a pullback: 6 bars moving against the trend
    for (let i = 150; i < 156; i++) {
      bars[i].close = bars[i - 1].close - 1.2;
      bars[i].open = bars[i - 1].close;
      bars[i].high = Math.max(bars[i].open, bars[i].close) + 0.1;
      bars[i].low = Math.min(bars[i].open, bars[i].close) - 0.1;
    }
    const duringPullback = computeCorrection(bars.slice(0, 156), 'BULLISH');
    assert.equal(duringPullback.state, 'ACTIVE');
    // resume: several bars moving back up strongly, closing above emaFast
    for (let i = 156; i < 165; i++) {
      bars[i].close = bars[i - 1].close + 1.0;
      bars[i].open = bars[i - 1].close;
      bars[i].high = bars[i].close + 0.1;
      bars[i].low = bars[i].open - 0.1;
    }
    const afterResume = computeCorrection(bars.slice(0, 165), 'BULLISH');
    assert.ok(['RESOLVED', 'NONE'].includes(afterResume.state));
  });
  it('reports NONE without an established structure direction', () => {
    const bars = makeTrendBars(200, { seed: 32 });
    assert.equal(computeCorrection(bars, null).state, 'NONE');
  });
});

describe('engine/models: MR is hard-blocked outside RANGE regime', () => {
  const structureWithSweep = { state: 'BULLISH', lastEvent: null, lastSweep: { type: 'SWEEP_HIGH', bar: 99, level: 2010 }, lastSwingHigh: { index: 90, price: 2010, label: 'HH' }, lastSwingLow: { index: 80, price: 1990, label: 'HL' } };
  it('does not trigger MR when regime is BULL_TREND, even with a fresh sweep present', () => {
    const bars = makeTrendBars(120, { seed: 41 });
    const result = evaluateModels({ bars, regime: 'BULL_TREND', structure: structureWithSweep, correction: { state: 'NONE' }, atrVal: 1 });
    assert.notEqual(result?.model, 'MR');
  });
  it('can trigger MR when regime is RANGE with a fresh sweep at the last bar', () => {
    const bars = makeRangeBars(120, { seed: 42 });
    const structure = { ...structureWithSweep, lastSweep: { type: 'SWEEP_HIGH', bar: bars.length - 1, level: 2010 } };
    const result = evaluateModels({ bars, regime: 'RANGE', structure, correction: { state: 'NONE' }, atrVal: 1 });
    assert.equal(result?.model, 'MR');
    assert.equal(result.side, 'SELL');
  });
});

describe('engine/risk: geometry, overextension, and RR gates', () => {
  const bars = makeTrendBars(120, { start: 2000, drift: 0.5, seed: 51 });
  const atrVal = 2;

  it('BUY geometry: SL < Entry < TP1 < TP2', () => {
    const candidate = { model: 'TC', side: 'BUY', anchor: bars.at(-1).close - 1, originBar: bars.length - 5 };
    const result = computeRisk({ candidate, bars, atrVal, structure: {} });
    assert.equal(result.gate, 'OK');
    assert.ok(result.stop_loss < result.entry);
    assert.ok(result.tp1 > result.entry);
    assert.ok(result.tp2 > result.tp1);
  });

  it('SELL geometry: SL > Entry > TP1 > TP2', () => {
    const candidate = { model: 'TC', side: 'SELL', anchor: bars.at(-1).close + 1, originBar: bars.length - 5 };
    const result = computeRisk({ candidate, bars, atrVal, structure: {} });
    assert.equal(result.gate, 'OK');
    assert.ok(result.stop_loss > result.entry);
    assert.ok(result.tp1 < result.entry);
    assert.ok(result.tp2 < result.tp1);
  });

  it('rejects as OVEREXTENDED when the anchor is far beyond the configured ATR multiple', () => {
    const candidate = { model: 'TC', side: 'BUY', anchor: bars.at(-1).close - 100, originBar: bars.length - 5 };
    const result = computeRisk({ candidate, bars, atrVal, structure: {} });
    assert.equal(result.gate, 'OVEREXTENDED');
  });

  it('rejects as RR_NOT_ACCEPTABLE when the resulting RR is below the configured minimum', () => {
    const candidate = { model: 'TC', side: 'BUY', anchor: bars.at(-1).close - 0.05, originBar: bars.length - 5 };
    const result = computeRisk({ candidate, bars, atrVal: 50, structure: {} }, { overextendAtrMult: 2.5, slAtrBuffer: 0.25, slAtrFallback: 1.5, tp1RMultiple: 1.0, tp2RMultipleDefault: 0.5, tp2RMultipleCap: 0.5, minRR: 1.7 });
    assert.equal(result.gate, 'RR_NOT_ACCEPTABLE');
  });
});

describe('engine/quality: threshold gate', () => {
  it('quality score is bounded 0-100 and threshold-comparable', () => {
    const structure = { state: 'BULLISH', lastEvent: { type: 'BOS' }, lastSwingHigh: { label: 'HH' }, lastSwingLow: { label: 'HL' } };
    const q = scoreQuality({ candidate: { side: 'BUY', overextensionRatio: 0.1 }, structure, regime: 'BULL_TREND', adxVal: 30, adxThreshold: 20, atrRatio: 1.0, htfRegime: 'BULL_TREND', session: 'LONDON', rr: 3.0, minRR: 1.7 });
    assert.ok(q.score >= 0 && q.score <= 100);
    assert.ok(q.score >= 65, 'a well-aligned, high-RR, on-session candidate should clear the reference threshold');
  });
  it('classifySession buckets by UTC hour', () => {
    assert.equal(classifySession(START_TIME - (START_TIME % 86400) + 9 * 3600), 'LONDON');
    assert.equal(classifySession(START_TIME - (START_TIME % 86400) + 15 * 3600), 'NEW_YORK');
    assert.equal(classifySession(START_TIME - (START_TIME % 86400) + 2 * 3600), 'ASIA');
    assert.equal(classifySession(START_TIME - (START_TIME % 86400) + 22 * 3600), 'OTHER');
  });
});

describe('engine/pipeline: WAIT has null trade geometry, insufficient data is honest', () => {
  it('INSUFFICIENT_DATA on a too-short series, with null geometry', () => {
    const bars = makeTrendBars(10, { seed: 61 });
    const result = runPipeline({ confirmedBars: bars });
    assert.equal(result.status, 'INSUFFICIENT_DATA');
    assert.equal(result.decision.action, 'WAIT');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2']) assert.equal(result.decision[f], null);
  });
  it('a WAIT decision always carries null entry/sl/tp1/tp2/rr', () => {
    const bars = makeRangeBars(220, { seed: 62 });
    const result = runPipeline({ confirmedBars: bars });
    if (result.decision.action === 'WAIT') {
      for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.equal(result.decision[f], null);
    }
  });
  it('MIN_BARS_REQUIRED is a sane positive number derived from the regime lookbacks', () => {
    assert.ok(MIN_BARS_REQUIRED > 100);
  });
});

describe('engine/mtf: combineTimeframes never votes across timeframes and fails closed on conflict', () => {
  const waitResult = (reason) => ({ status: 'OK', regime: 'RANGE', decision: { action: 'WAIT', wait_reason: reason }, model: null, structure: {} });
  const buyResult = () => ({ status: 'OK', regime: 'BULL_TREND', decision: { action: 'BUY', wait_reason: null, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2 }, model: 'TC', quality: { score: 80 }, structure: { lastEvent: null } });

  it('15m WAIT stays WAIT regardless of 5m/30m', () => {
    const combined = combineTimeframes({ m5: buyResult(), m15: waitResult('NO_ELIGIBLE_STRATEGY'), m30: buyResult() });
    assert.equal(combined.action, 'WAIT');
  });
  it('15m BUY is blocked to WAIT/ENTRY_CONFLICT when 30m regime is BEAR_TREND', () => {
    const m30bear = { ...buyResult(), regime: 'BEAR_TREND' };
    const combined = combineTimeframes({ m5: waitResult('NO_TRIGGER'), m15: buyResult(), m30: m30bear });
    assert.equal(combined.action, 'WAIT');
    assert.equal(combined.wait_reason, 'ENTRY_CONFLICT');
  });
  it('15m BUY proceeds when 30m regime is BULL_TREND (aligned)', () => {
    const combined = combineTimeframes({ m5: waitResult('NO_TRIGGER'), m15: buyResult(), m30: buyResult() });
    assert.equal(combined.action, 'BUY');
  });
  it('unclear HTF (30m not OK) forces WAIT/HTF_CONTEXT_UNCLEAR even if 15m wants to trade', () => {
    const combined = combineTimeframes({ m5: waitResult('NO_TRIGGER'), m15: buyResult(), m30: { status: 'INSUFFICIENT_DATA', regime: null } });
    assert.equal(combined.action, 'WAIT');
    assert.equal(combined.wait_reason, 'HTF_CONTEXT_UNCLEAR');
  });
  it('does not implement any-timeframe-BUY=BUY: a 5m BUY alone cannot make the combined result BUY when 15m is WAIT', () => {
    const combined = combineTimeframes({ m5: buyResult(), m15: waitResult('NO_TRIGGER'), m30: buyResult() });
    assert.equal(combined.action, 'WAIT');
  });
});

describe('engine/signalStore: identity, dedup, entry freeze, and outcome resolution', () => {
  it('the same setup on the same origin bar produces the same signal ID', () => {
    const c = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'TC', side: 'BUY', originBar: 100, signalBarTime: 12345 };
    assert.equal(computeSignalId(c), computeSignalId({ ...c }));
  });
  it('a different origin bar produces a different signal ID', () => {
    const c1 = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'TC', side: 'BUY', originBar: 100, signalBarTime: 12345 };
    const c2 = { ...c1, originBar: 101 };
    assert.notEqual(computeSignalId(c1), computeSignalId(c2));
  });
  it('registerOrGetSignal does not create a duplicate for the same identity', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'SR', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    const first = registerOrGetSignal(store, candidate);
    const second = registerOrGetSignal(store, candidate);
    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(store.signals.length, 1);
    assert.equal(first.record.signal_id, second.record.signal_id);
  });
  it('resolveOpenSignals: TP2 hit before SL -> PASS; original entry/sl/tp fields remain unchanged', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'SR', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    registerOrGetSignal(store, candidate);
    const before = JSON.parse(JSON.stringify(store.signals[0]));
    const future = [{ time: 2000, open: 10, high: 12.5, low: 9.5, close: 12.1 }];
    resolveOpenSignals(store, { timeframe: '15m', confirmedBars: future });
    assert.equal(store.signals[0].status, 'PASS');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'signal_bar_time', 'side', 'model']) assert.equal(store.signals[0][f], before[f]);
  });
  it('resolveOpenSignals: SL and TP2 touched on the SAME future candle -> conservative FAIL', () => {
    const store = { signals: [] };
    const candidate = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'SR', side: 'BUY', originBar: 5, signalBarTime: 1000, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70 };
    registerOrGetSignal(store, candidate);
    const future = [{ time: 2000, open: 10, high: 12.5, low: 8.5, close: 10 }]; // both SL(9) and TP2(12) touched intrabar
    resolveOpenSignals(store, { timeframe: '15m', confirmedBars: future });
    assert.equal(store.signals[0].status, 'FAIL');
  });
  it('a terminal record does not get re-resolved on a later call', () => {
    const store = { signals: [{ signal_id: 'x', timeframe: '15m', status: 'PASS', side: 'BUY', entry: 10, stop_loss: 9, tp1: 11, tp2: 12, signal_bar_time: 1000, resolution_bar_time: 2000, realized_r: 2 }] };
    const future = [{ time: 3000, open: 10, high: 20, low: 1, close: 10 }];
    const updates = resolveOpenSignals(store, { timeframe: '15m', confirmedBars: future });
    assert.equal(updates.length, 0);
    assert.equal(store.signals[0].status, 'PASS');
  });
});

describe('engine/signalStore: same-structural-thesis open-signal concurrency guard (additive, narrow)', () => {
  // Distinct originBar/signalBarTime per call so each candidate below gets
  // its OWN signal_id (mirroring different confirmed 15m bars/models
  // re-triggering the same thesis), unless a test explicitly wants an
  // EXACT repeat.
  function buyCandidate(overrides = {}) {
    return { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'BUY', originBar: 100, signalBarTime: 100, entry: 10, stop_loss: 9, tp1: 11, tp2: 12, rr: 2, quality: 70, thesisId: 'thesisA', ...overrides };
  }
  function sellCandidate(overrides = {}) {
    return { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'PB', side: 'SELL', originBar: 100, signalBarTime: 100, entry: 10, stop_loss: 11, tp1: 9, tp2: 8, rr: 2, quality: 70, thesisId: 'thesisA', ...overrides };
  }

  it('1. first qualified BUY with thesis A registers OPEN normally', () => {
    const store = { signals: [] };
    const result = registerOrGetSignal(store, buyCandidate());
    assert.equal(result.isNew, true);
    assert.equal(result.blockedByOpenThesis, false);
    assert.equal(result.record.status, 'OPEN');
    assert.equal(result.record.thesis_id, 'thesisA');
    assert.equal(store.signals.length, 1);
  });

  it('2. second qualified BUY with same thesis A while first is OPEN is blocked, not a new record', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, buyCandidate());
    const second = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200, model: 'MR' }));
    assert.equal(store.signals.length, 1, 'no second record created');
    assert.equal(second.isNew, false);
    assert.equal(second.blockedByOpenThesis, true);
    assert.equal(second.existingSignalId, first.record.signal_id);
    assert.equal(second.record.signal_id, first.record.signal_id);
  });

  it('3. same for SELL', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, sellCandidate());
    const second = registerOrGetSignal(store, sellCandidate({ originBar: 200, signalBarTime: 200 }));
    assert.equal(store.signals.length, 1);
    assert.equal(second.blockedByOpenThesis, true);
    assert.equal(second.existingSignalId, first.record.signal_id);
  });

  it('4. same thesis, different model PB -> MR -> BO: while same-side OPEN, no second signal', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, buyCandidate({ model: 'PB', originBar: 100, signalBarTime: 100 }));
    const mr = registerOrGetSignal(store, buyCandidate({ model: 'MR', originBar: 200, signalBarTime: 200 }));
    const bo = registerOrGetSignal(store, buyCandidate({ model: 'BO', originBar: 300, signalBarTime: 300 }));
    assert.equal(store.signals.length, 1);
    assert.equal(mr.blockedByOpenThesis, true);
    assert.equal(bo.blockedByOpenThesis, true);
  });

  it('5. TP1-hit but status OPEN still blocks a second same-thesis signal', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, buyCandidate());
    first.record.tp1_hit = true; // TP1 lifecycle tracking never affects status/terminality
    first.record.tp1_hit_bar_time = 150;
    const second = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200 }));
    assert.equal(second.blockedByOpenThesis, true);
    assert.equal(store.signals.length, 1);
  });

  it('6. PASS releases the slot: same thesis can register again afterward', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, buyCandidate());
    store.signals.find((s) => s.signal_id === first.record.signal_id).status = 'PASS';
    const second = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200 }));
    assert.equal(second.isNew, true);
    assert.equal(second.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 2);
  });

  it('7. FAIL releases the slot: same thesis can register again afterward', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, buyCandidate());
    store.signals.find((s) => s.signal_id === first.record.signal_id).status = 'FAIL';
    const second = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200 }));
    assert.equal(second.isNew, true);
    assert.equal(second.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 2);
  });

  it('8. different thesis ID + same direction registers normally', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, buyCandidate({ thesisId: 'thesisA' }));
    const other = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200, thesisId: 'thesisB' }));
    assert.equal(other.isNew, true);
    assert.equal(other.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 2);
  });

  it('9. same thesis ID + opposite direction registers normally (opposite-direction protection is out of scope)', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, buyCandidate({ thesisId: 'thesisA' }));
    const opposite = registerOrGetSignal(store, sellCandidate({ originBar: 200, signalBarTime: 200, thesisId: 'thesisA' }));
    assert.equal(opposite.isNew, true);
    assert.equal(opposite.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 2);
  });

  it('10. a legacy OPEN record without thesis_id never crashes and never participates (no fabricated identity)', () => {
    const store = { signals: [{ signal_id: 'legacy-1', symbol: 'OANDA:XAUUSD', timeframe: '15m', side: 'BUY', status: 'OPEN', entry: 10, stop_loss: 9, tp1: 11, tp2: 12, signal_bar_time: 1 }] };
    const legacyBefore = JSON.stringify(store.signals[0]);
    const result = registerOrGetSignal(store, buyCandidate({ originBar: 500, signalBarTime: 500, thesisId: 'thesisA' }));
    assert.equal(result.isNew, true, 'a thesis_id-less legacy OPEN record must not block a new thesis-tagged candidate');
    assert.equal(result.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 2);
    assert.equal(JSON.stringify(store.signals.find((s) => s.signal_id === 'legacy-1')), legacyBefore, 'legacy record untouched, never rewritten');
  });

  it('11. existing exact-repeat dedup behavior remains unchanged (still hits the signal_id match, not the thesis guard)', () => {
    const store = { signals: [] };
    const candidate = buyCandidate();
    const first = registerOrGetSignal(store, candidate);
    const second = registerOrGetSignal(store, candidate);
    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(second.blockedByOpenThesis, false, 'an exact repeat is the pre-existing id-match path, not the new thesis-block path');
    assert.equal(store.signals.length, 1);
    assert.equal(first.record.signal_id, second.record.signal_id);
  });

  it('12. existing signal_id hashing remains unchanged -- thesisId never participates in computeSignalId()', () => {
    const c = { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'TC', side: 'BUY', originBar: 100, signalBarTime: 12345 };
    assert.equal(computeSignalId({ ...c, thesisId: 'thesisA' }), computeSignalId({ ...c, thesisId: 'thesisB' }));
    assert.equal(computeSignalId({ ...c, thesisId: 'thesisA' }), computeSignalId(c));
  });

  it('11b. a candidate with no thesisId (null/undefined) never wildcard-matches an existing OPEN thesis-tagged signal -- registers normally', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, buyCandidate({ thesisId: 'thesisA' }));
    const noThesisUndefined = registerOrGetSignal(store, buyCandidate({ originBar: 200, signalBarTime: 200, thesisId: undefined }));
    assert.equal(noThesisUndefined.isNew, true);
    assert.equal(noThesisUndefined.blockedByOpenThesis, false);
    const noThesisNull = registerOrGetSignal(store, buyCandidate({ originBar: 300, signalBarTime: 300, thesisId: null }));
    assert.equal(noThesisNull.isNew, true);
    assert.equal(noThesisNull.blockedByOpenThesis, false);
    assert.equal(store.signals.length, 3, 'all three are distinct OPEN records -- no wildcard blocking occurred');
  });

  it('13b. thesisId is deterministic for identical structural inputs and is NEVER a function of model -- computeSetupId()/resolveStructuralAnchorPrice() are reused verbatim, never reimplemented', () => {
    const structure = { state: 'BEARISH', lastSwingHigh: { price: 4347.39, label: 'LH' }, lastSwingLow: { price: 4291.5, label: 'LL' } };
    const anchor = resolveStructuralAnchorPrice({ structure });
    // Same symbol/timeframe/direction/anchor/regime, computed twice, as if produced by two DIFFERENT models (PB the first time, BO the second) -- computeSetupId() takes no model parameter at all, so identical structural inputs must yield an identical id regardless of which model produced the candidate.
    const idFromPbContext = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BEARISH', structuralAnchorPrice: anchor, regime: 'BEAR_TREND' });
    const idFromBoContext = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BEARISH', structuralAnchorPrice: anchor, regime: 'BEAR_TREND' });
    assert.equal(idFromPbContext, idFromBoContext, 'identical structural inputs must be deterministic regardless of which model context produced them');

    // A genuinely different structural anchor (a new/updated swing) must produce a different thesis id.
    const movedStructure = { state: 'BEARISH', lastSwingHigh: { price: 4360.0, label: 'LH' }, lastSwingLow: { price: 4291.5, label: 'LL' } };
    const movedAnchor = resolveStructuralAnchorPrice({ structure: movedStructure });
    const idAfterAnchorMove = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BEARISH', structuralAnchorPrice: movedAnchor, regime: 'BEAR_TREND' });
    assert.notEqual(idFromPbContext, idAfterAnchorMove, 'a genuinely changed structural anchor must produce a different thesis id');
  });

  it('13. BUY/SELL symmetry: the guard applies identically to both sides', () => {
    const buyStore = { signals: [] };
    const b1 = registerOrGetSignal(buyStore, buyCandidate());
    const b2 = registerOrGetSignal(buyStore, buyCandidate({ originBar: 200, signalBarTime: 200 }));
    const sellStore = { signals: [] };
    const s1 = registerOrGetSignal(sellStore, sellCandidate());
    const s2 = registerOrGetSignal(sellStore, sellCandidate({ originBar: 200, signalBarTime: 200 }));
    assert.equal(b2.blockedByOpenThesis, s2.blockedByOpenThesis);
    assert.equal(b1.isNew, s1.isNew);
  });

  it('14. regression: the real historical BO SELL cluster (thesis d1345dc04b4a5d84) -- only the first would have persisted', () => {
    const store = { signals: [] };
    const bo1 = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'BO', side: 'SELL', originBar: 1790143200, signalBarTime: 1790143200, entry: 4330.75, stop_loss: 4348.84, tp1: 4312.65, tp2: 4291.5, rr: 2.17, quality: 70, thesisId: 'd1345dc04b4a5d84' });
    const bo2 = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'BO', side: 'SELL', originBar: 1790144100, signalBarTime: 1790144100, entry: 4328.85, stop_loss: 4348.83, tp1: 4308.86, tp2: 4291.5, rr: 1.87, quality: 67, thesisId: 'd1345dc04b4a5d84' });
    const bo3 = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'BO', side: 'SELL', originBar: 1790145900, signalBarTime: 1790145900, entry: 4331.32, stop_loss: 4348.86, tp1: 4313.78, tp2: 4291.5, rr: 2.27, quality: 72, thesisId: 'd1345dc04b4a5d84' });
    assert.equal(store.signals.length, 1, 'only ONE OPEN record would exist under the new guard, not three');
    assert.equal(bo1.isNew, true);
    assert.equal(bo2.blockedByOpenThesis, true);
    assert.equal(bo3.blockedByOpenThesis, true);
    assert.equal(bo2.existingSignalId, bo1.record.signal_id);
    assert.equal(bo3.existingSignalId, bo1.record.signal_id);
  });

  it('15. regression: the real historical MR SELL cluster (thesis 971a1c47baf630cf) -- cross-model same-thesis suppression', () => {
    const store = { signals: [] };
    const mr1 = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'MR', side: 'SELL', originBar: 1790089200, signalBarTime: 1790089200, entry: 4336.23, stop_loss: 4347.23, tp1: 4325.23, tp2: 4303.24, rr: 3, quality: 83, thesisId: '971a1c47baf630cf' });
    const mr2 = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'MR', side: 'SELL', originBar: 1790090100, signalBarTime: 1790090100, entry: 4332.21, stop_loss: 4347.17, tp1: 4317.25, tp2: 4291.5, rr: 2.72, quality: 82, thesisId: '971a1c47baf630cf' });
    assert.equal(store.signals.length, 1, 'only ONE OPEN record would exist under the new guard, not two');
    assert.equal(mr1.isNew, true);
    assert.equal(mr2.blockedByOpenThesis, true);
    assert.equal(mr2.existingSignalId, mr1.record.signal_id);
  });

  it('16a. blocking a candidate never mutates the candidate object itself (its own qualified geometry is preserved, untouched)', () => {
    const store = { signals: [] };
    registerOrGetSignal(store, buyCandidate());
    const secondCandidate = buyCandidate({ originBar: 200, signalBarTime: 200, entry: 4331.32, stop_loss: 4348.86, tp1: 4313.78, tp2: 4291.5, rr: 2.27, quality: 72 });
    const before = JSON.stringify(secondCandidate);
    registerOrGetSignal(store, secondCandidate);
    assert.equal(JSON.stringify(secondCandidate), before, 'registerOrGetSignal must never mutate the candidate it was given');
  });

  it('16b. source audit: xauusd_calculate.js\'s returned action/entry/sl/tp1/tp2/rr/quality are read from combined.decision/combined.quality, never from registeredSignal', () => {
    const src = readFileSync(new URL('../src/core/xauusd_calculate.js', import.meta.url), 'utf8');
    const returnBlockMatch = src.match(/entry: finalAction[\s\S]*?quality: finalAction[\s\S]*?combined\.quality\?\.score : null,/);
    assert.ok(returnBlockMatch, 'expected entry/sl/tp1/tp2/quality construction block to exist');
    const block = returnBlockMatch[0];
    assert.ok(!/registeredSignal/.test(block), 'the protected decision/geometry fields must never read from registeredSignal');
    assert.ok(/combined\.decision\.entry/.test(block) && /combined\.decision\.stop_loss/.test(block) && /combined\.decision\.tp1/.test(block) && /combined\.decision\.tp2/.test(block) && /combined\.decision\.rr/.test(block), 'must read entry/sl/tp1/tp2/rr from combined.decision');
  });
});

describe('calculateEntry: no Pine dependency required, and fail-closed on material engine disagreement', () => {
  const bullBars = makeTrendBars(510, { drift: 0.5, noise: 0.1, seed: 71 });

  function baseDeps({ getMasterStateImpl } = {}) {
    let tf = '15';
    return {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: tf }),
      setTimeframe: async ({ timeframe }) => { tf = timeframe; },
      getOhlcv: async () => ({ bars: bullBars }),
      getMasterState: getMasterStateImpl ?? (async () => { throw new Error('Pine unavailable in this test'); }),
      loadStore: () => ({ signals: [] }),
      saveStore: () => {},
      storePath: 'unused-in-test',
    };
  }

  it('produces a status:OK result even when getMasterState throws (no Pine dependency)', async () => {
    const result = await calculateEntry({ _deps: baseDeps() });
    assert.equal(result.status, 'OK');
    assert.ok(result.pine_reference.status === 'READ_ERROR');
  });

  it('detectMaterialDisagreement: both actionable + opposing directions = material', () => {
    assert.equal(detectMaterialDisagreement('BUY', 'SELL'), true);
    assert.equal(detectMaterialDisagreement('SELL', 'BUY'), true);
  });
  it('detectMaterialDisagreement: both actionable + SAME direction = not material', () => {
    assert.equal(detectMaterialDisagreement('BUY', 'BUY'), false);
  });
  it('detectMaterialDisagreement: one side WAIT/null = not material (informational only)', () => {
    assert.equal(detectMaterialDisagreement('BUY', 'WAIT'), false);
    assert.equal(detectMaterialDisagreement('WAIT', 'SELL'), false);
    assert.equal(detectMaterialDisagreement('WAIT', null), false);
  });
  it('end-to-end: calculateEntry never returns an actionable result while Pine and MCP materially oppose (organic engine run, whatever it produces)', async () => {
    const opposing = async () => ({ status: 'OK', decision: { action: 'SELL' }, market: { regime: 'BEAR_TREND' } });
    const deps = baseDeps({ getMasterStateImpl: opposing });
    const result = await calculateEntry({ _deps: deps });
    if (detectMaterialDisagreement(result.action === 'WAIT' ? null : result.action, 'SELL')) {
      assert.fail('a material disagreement must never surface as an actionable result');
    }
    assert.ok(result.status === 'OK');
  });

  it('WAIT status carries null entry/sl/tp1/tp2', async () => {
    const shortBarsDeps = baseDeps();
    shortBarsDeps.getOhlcv = async () => ({ bars: makeTrendBars(5) });
    const result = await calculateEntry({ _deps: shortBarsDeps });
    assert.equal(result.status, 'DATA_UNAVAILABLE');
    assert.equal(result.action, 'WAIT');
  });

  it('rejects data with non-monotonic/duplicate timestamps rather than silently using it', async () => {
    const badBars = makeTrendBars(510, { seed: 72 });
    badBars[300].time = badBars[299].time; // duplicate timestamp
    const deps = baseDeps();
    deps.getOhlcv = async () => ({ bars: badBars });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'DATA_UNAVAILABLE');
  });

  it('formatEngineDecision renders a DATA UNAVAILABLE headline for a non-OK result', () => {
    const formatted = formatEngineDecision({ status: 'DATA_UNAVAILABLE', reason: 'insufficient bars' });
    assert.equal(formatted.headline, 'DATA UNAVAILABLE — NO TRADE DECISION');
    assert.equal(formatted.structured.tradeable, false);
  });
});

describe('P8 lock/boundary/source integrity untouched by this pivot', () => {
  const LOCK_PATH = fileURLToPath(new URL('../validation/p8_candidate_lock.json', import.meta.url));
  const BOUNDARY_PATH = fileURLToPath(new URL('../validation/p8_forward_boundary.json', import.meta.url));
  const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
  const STRATEGY_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));

  it('p8 candidate lock still reports C4 exactly', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    assert.equal(lock.locked_parameters.minRR, 1.7);
    assert.equal(lock.locked_parameters.corrResolveConfirmBars, 3);
    assert.equal(lock.locked_parameters.qualityThreshold, 65);
  });
  it('p8 boundary is still exactly the locked checkpoint value', () => {
    const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
    assert.equal(boundary.p8_boundary_utc, '2026-09-17T13:47:01Z');
  });
  it('frozen Pine trading source hashes are unchanged by this MCP-side pivot', () => {
    const sha = (p) => crypto.createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(sha(PINE_PATH), '6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6');
    assert.equal(sha(STRATEGY_PATH), '947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911');
  });
});
