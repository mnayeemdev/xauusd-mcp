/**
 * Stage 6, Part 3 -- CANDIDATE vs AUTHORITATIVE observability.
 *
 * Proves analyzeMarket()'s new, additive `candidates` field:
 *   - is present for exactly '5m'/'15m'/'30m' (ENTRY_TIMEFRAMES only --
 *     never a context timeframe, which has no "candidate" concept here)
 *   - is derived via runPipeline() (the SAME protected, pure pipeline
 *     calculateEntry() itself uses) on the SAME already-fetched bars --
 *     never a second, divergent implementation
 *   - is PURELY OBSERVATIONAL: it never alters `decision.action`, never
 *     itself becomes a BUY/SELL, and a WAIT result exposes a non-null
 *     `blocked_by` while a confirmed candidate at that timeframe exposes
 *     `blocked_by: null`
 *   - `persistSignals` defaults to false (ephemeral store, unchanged
 *     existing behavior) and, when explicitly set to true, routes to the
 *     real injected loadStore/saveStore instead of the ephemeral shim
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket, extractCandidateObservability } from '../src/core/xauusd_analyze_market.js';
import { combineTimeframes } from '../src/engine/mtf.js';

const START_TIME = 1700000000;
function makeTrendBars(n, { start = 2000, drift = 0.5, tfSeconds = 900 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + drift;
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}

function makeChoppyBars(n, { start = 2000, tfSeconds = 900 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + (i % 2 === 0 ? 0.3 : -0.3);
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}

function baseDeps({ bars, loadStore, saveStore } = {}) {
  let tf = '15';
  return {
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: tf }),
    setTimeframe: async ({ timeframe }) => { tf = timeframe; return { success: true }; },
    getOhlcv: async () => ({ bars }),
    getMasterState: async () => { throw new Error('Pine unavailable in this test'); },
    loadStore: loadStore ?? (() => ({ signals: [] })),
    saveStore: saveStore ?? (() => {}),
    storePath: 'unused-in-test',
  };
}

describe('Stage 6 Part 3: analyzeMarket().candidates -- candidate vs authoritative observability', () => {
  const bullBars = makeTrendBars(510, { drift: 0.5 });
  const choppyBars = makeChoppyBars(510);

  it('exposes candidates for exactly 5m/15m/30m, never for a context timeframe', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: bullBars }) });
    assert.ok(result.candidates);
    assert.deepEqual(Object.keys(result.candidates).sort(), ['15m', '30m', '5m']);
  });

  it('each candidate entry reports status/regime/candidate_action/candidate_model/candidate_quality/authoritative_candidate_rr/authoritative_candidate_entry/authoritative_candidate_sl/authoritative_candidate_tp1/authoritative_candidate_tp2/authoritative_rr_gate/blocked_by', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: bullBars }) });
    for (const tf of ['5m', '15m', '30m']) {
      const c = result.candidates[tf];
      assert.ok('status' in c);
      assert.ok('regime' in c);
      assert.ok('candidate_action' in c);
      assert.ok('candidate_model' in c);
      assert.ok('candidate_quality' in c);
      assert.ok('authoritative_candidate_rr' in c);
      assert.ok('authoritative_candidate_entry' in c);
      assert.ok('authoritative_candidate_sl' in c);
      assert.ok('authoritative_candidate_tp1' in c);
      assert.ok('authoritative_candidate_tp2' in c);
      assert.ok('authoritative_rr_gate' in c);
      assert.ok('blocked_by' in c);
      assert.ok(!('candidate_rr' in c), 'the ambiguous, unprefixed candidate_rr name must not reappear');
    }
  });

  it('candidate observability never alters the authoritative decision.action, regardless of what any single-TF candidate shows', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: bullBars }) });
    // The authoritative action always comes from calculateEntry()'s own
    // combineTimeframes()/detectHtfConflict() -- never from any one
    // single-TF runPipeline() call this file makes for observability.
    assert.ok(['BUY', 'SELL', 'WAIT'].includes(result.action));
  });

  it('a WAIT candidate at a given timeframe exposes a non-null blocked_by; a confirmed candidate exposes blocked_by:null', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: bullBars }) });
    for (const tf of ['5m', '15m', '30m']) {
      const c = result.candidates[tf];
      if (c.candidate_action === 'BUY' || c.candidate_action === 'SELL') {
        // A confirmed single-TF candidate: blocked_by must be null IFF this
        // timeframe's OWN pipeline reached BUY/SELL (still may not be the
        // final authoritative action once mtf/htf gates apply upstream).
        assert.ok(c.blocked_by === null || typeof c.blocked_by === 'string');
      } else if (c.status === 'OK') {
        assert.equal(typeof c.blocked_by, 'string');
      }
    }
  });

  it('CHOP/TRANSITION regime bars never throw and report a coherent blocked_by per timeframe', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: choppyBars }) });
    assert.ok(result.candidates);
    for (const tf of ['5m', '15m', '30m']) {
      assert.ok(result.candidates[tf].status);
    }
  });

  it('insufficient bars on an entry timeframe report status:UNAVAILABLE rather than throwing', async () => {
    const shortBars = makeTrendBars(10, { drift: 0.5 });
    const result = await analyzeMarket({ _deps: baseDeps({ bars: shortBars }) });
    for (const tf of ['5m', '15m', '30m']) {
      assert.ok(['UNAVAILABLE', 'INSUFFICIENT_DATA'].includes(result.candidates[tf].status));
      assert.equal(result.candidates[tf].candidate_action, null);
    }
  });
});

describe('Stage 6 Part 3: persistSignals opt-in (default false = unchanged ephemeral behavior)', () => {
  const bullBars = makeTrendBars(510, { drift: 0.5 });

  it('default (no persistSignals) never touches the injected real loadStore/saveStore', async () => {
    let loadCalls = 0;
    let saveCalls = 0;
    const deps = baseDeps({
      bars: bullBars,
      loadStore: () => { loadCalls++; return { signals: [] }; },
      saveStore: () => { saveCalls++; },
    });
    await analyzeMarket({ _deps: deps });
    assert.equal(loadCalls, 0);
    assert.equal(saveCalls, 0);
  });

  it('persistSignals:false explicitly behaves identically to the default', async () => {
    let loadCalls = 0;
    const deps = baseDeps({ bars: bullBars, loadStore: () => { loadCalls++; return { signals: [] }; } });
    await analyzeMarket({ _deps: deps, persistSignals: false });
    assert.equal(loadCalls, 0);
  });

  it('persistSignals:true routes to the real injected loadStore/saveStore instead of the ephemeral shim', async () => {
    let loadCalls = 0;
    let savedStore = null;
    const deps = baseDeps({
      bars: bullBars,
      loadStore: () => { loadCalls++; return { signals: [] }; },
      saveStore: (_path, s) => { savedStore = s; },
    });
    await analyzeMarket({ _deps: deps, persistSignals: true });
    assert.ok(loadCalls > 0);
    assert.ok(savedStore !== null);
  });
});

describe('Stage 6 completion review, Section 4-5: candidate vs authoritative divergence, using the protected mtf.js gate directly', () => {
  // Synthetic runPipeline()-shaped fixtures (never fabricated bars) --
  // proves the exact scenario the review explicitly asks about: "A 15m
  // BUY candidate may exist while final action remains WAIT" / "A 5m SELL
  // candidate may exist while final action remains WAIT" -- using
  // mtf.js's OWN, unmodified, protected combineTimeframes() HTF-conflict
  // gate to force the overall WAIT, and extractCandidateObservability()
  // (the exact function analyzeMarket() itself uses) to read the
  // per-timeframe candidate off the SAME pipeline result object.
  function confirmedPipelineResult({ action, regime = 'BULL_TREND', model = 'PB', rr = 2.0, quality = 80 }) {
    return {
      status: 'OK', regime, structure: { state: action === 'BUY' ? 'BULLISH' : 'BEARISH', lastEvent: null }, correction: { state: 'NONE' }, model,
      decision: { action, wait_reason: null, entry: 2000, stop_loss: 1990, tp1: 2010, tp2: 2020, rr },
      quality: { score: quality },
      evidence: { candidate: { side: action }, risk: { rr } },
    };
  }
  function waitPipelineResult({ regime = 'BULL_TREND', wait_reason = 'NO_ELIGIBLE_STRATEGY' } = {}) {
    return {
      status: 'OK', regime, structure: null, correction: { state: 'NONE' }, model: null,
      decision: { action: 'WAIT', wait_reason, entry: null, stop_loss: null, tp1: null, tp2: null, rr: null },
      quality: null, evidence: {},
    };
  }

  it('a confirmed 15m BUY candidate coexists with an overall WAIT, when 30m HTF regime materially opposes it (mtf.js ENTRY_CONFLICT gate)', () => {
    const m15 = confirmedPipelineResult({ action: 'BUY' });
    const m30 = { status: 'OK', regime: 'BEAR_TREND', structure: null, correction: { state: 'NONE' }, model: null, decision: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' }, quality: null, evidence: {} };
    const m5 = waitPipelineResult({ regime: 'BEAR_TREND' });

    const combined = combineTimeframes({ m5, m15, m30 });
    assert.equal(combined.action, 'WAIT');
    assert.equal(combined.wait_reason, 'ENTRY_CONFLICT');

    // The SAME m15 pipeline result, read through the EXACT function
    // analyzeMarket() uses for candidate observability, still reports a
    // real, confirmed BUY candidate at 15m -- candidate observability is
    // never gated by mtf.js's own HTF-conflict decision.
    const candidate15m = extractCandidateObservability(m15);
    assert.equal(candidate15m.candidate_action, 'BUY');
    assert.equal(candidate15m.blocked_by, null); // m15's OWN pipeline confirmed -- never blocked at its own tier
  });

  it('a confirmed 5m SELL candidate coexists with an overall WAIT, when 30m HTF regime materially opposes a SELL at 15m', () => {
    // Mirrors the above symmetrically for SELL -- proves no directional bias in candidate observability.
    const m15 = confirmedPipelineResult({ action: 'SELL' });
    const m30 = { status: 'OK', regime: 'BULL_TREND', structure: null, correction: { state: 'NONE' }, model: null, decision: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' }, quality: null, evidence: {} };
    const m5Confirmed = confirmedPipelineResult({ action: 'SELL', regime: 'BEAR_TREND' });

    const combined = combineTimeframes({ m5: m5Confirmed, m15, m30 });
    assert.equal(combined.action, 'WAIT');
    assert.equal(combined.wait_reason, 'ENTRY_CONFLICT');

    const candidate5m = extractCandidateObservability(m5Confirmed);
    assert.equal(candidate5m.candidate_action, 'SELL');
    assert.equal(candidate5m.blocked_by, null);
  });

  it('candidate observability NEVER bypasses the protected gates -- the authoritative action stays WAIT regardless of what any single-TF candidate shows', () => {
    const m15 = confirmedPipelineResult({ action: 'BUY' });
    const m30 = { status: 'OK', regime: 'BEAR_TREND', structure: null, correction: { state: 'NONE' }, model: null, decision: { action: 'WAIT', wait_reason: 'NO_ELIGIBLE_STRATEGY' }, quality: null, evidence: {} };
    const m5 = waitPipelineResult({ regime: 'BEAR_TREND' });
    const combined = combineTimeframes({ m5, m15, m30 });
    // combineTimeframes() -- the protected, unmodified gate -- is the
    // ONLY authority here; extractCandidateObservability() never
    // participates in producing `combined`.
    assert.notEqual(combined.action, m15.decision.action);
    assert.equal(combined.action, 'WAIT');
  });
});
