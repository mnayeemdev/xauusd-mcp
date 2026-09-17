/**
 * Higher-timeframe (HTF) context upgrade: 5m/15m/30m entry tiers plus
 * 1H/2H/4H/8H/1D/1W/1M context tiers (src/engine/htf.js,
 * src/core/xauusd_calculate.js). Synthetic OHLCV fixtures only -- these
 * prove the extension's own mechanics (fetch-all-10, resolution mapping,
 * hierarchy behavior, single-layer gate, no majority voting, macro tiers
 * never generate entries, fail-safe degradation, restore-on-failure); they
 * make no claim about real market profitability. See also
 * tests/engine_calculation.test.js for the original 5m/15m/30m suite,
 * which this file does not duplicate or modify.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRegime, REGIME_PARAMS } from '../src/engine/regime.js';
import { computeHtfContext, detectHtfConflict } from '../src/engine/htf.js';
import { calculateEntry } from '../src/core/xauusd_calculate.js';
import { seededRng } from '../validation/metrics.js';

const START_TIME = 1700000000;

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

// Fixed, pre-verified fixtures (see engineering notes in the P10 upgrade):
// a clean BULL_TREND regime, a clean BEAR_TREND regime, and an entry-tier
// series that organically produces a full BUY through the REAL pipeline
// (regime -> structure -> correction -> model -> risk -> quality), not a
// mocked/injected decision.
const BULL_CONTEXT_BARS = makeTrendBars(300, { drift: 0.6, noise: 0.1, seed: 11 });
const BEAR_CONTEXT_BARS = makeTrendBars(300, { drift: -0.6, noise: 0.1, seed: 12 });
const BUY_ENTRY_BARS = makeTrendBars(510, { drift: 0.2, noise: 0.6, seed: 2 });
const WAIT_ENTRY_BARS = makeTrendBars(510, { drift: 0.5, noise: 0.1, seed: 71 });

const ALL_TF_CODES = ['5', '15', '30', '60', '120', '240', '480', 'D', 'W', 'M'];
const ALL_TF_LABELS = ['5m', '15m', '30m', '1H', '2H', '4H', '8H', '1D', '1W', '1M'];

/**
 * Builds calculateEntry() _deps with a distinct bar series per timeframe
 * (barsByTf keyed by TradingView resolution code), tracking every
 * setTimeframe() call so tests can assert resolution mapping and
 * restore-after-success/failure. `startResolution` is the chart's
 * resolution before calculateEntry() is ever called.
 */
function buildDeps({ barsByTf, startResolution = '15', getMasterStateImpl, throwOnTf = null } = {}) {
  let currentTf = startResolution;
  const setTimeframeCalls = [];
  const deps = {
    getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: currentTf }),
    setTimeframe: async ({ timeframe }) => { setTimeframeCalls.push(timeframe); currentTf = timeframe; },
    getOhlcv: async () => {
      if (throwOnTf && currentTf === throwOnTf) throw new Error(`simulated fetch failure for ${throwOnTf}`);
      const bars = barsByTf[currentTf];
      if (!bars) throw new Error(`no fixture bars configured for timeframe ${currentTf}`);
      return { bars };
    },
    getMasterState: getMasterStateImpl ?? (async () => { throw new Error('Pine unavailable in this test'); }),
    loadStore: () => ({ signals: [] }),
    saveStore: () => {},
    storePath: 'unused-in-test',
  };
  return { deps, setTimeframeCalls: () => setTimeframeCalls };
}

function uniformBars(bars) {
  return Object.fromEntries(ALL_TF_CODES.map((tf) => [tf, bars]));
}

// ═══════════════════════════════════════════════════════════════════════
// Pure functions: computeHtfContext / detectHtfConflict
// ═══════════════════════════════════════════════════════════════════════

describe('engine/htf: computeHtfContext', () => {
  it('reports INSUFFICIENT_DATA on a too-short series, never a fabricated regime', () => {
    const ctx = computeHtfContext(makeTrendBars(20, { seed: 90 }));
    assert.equal(ctx.status, 'INSUFFICIENT_DATA');
    assert.equal(ctx.regime, null);
    assert.equal(ctx.structure_direction, null);
  });

  it('reports OK + BULL_TREND regime for a clean uptrend, matching classifyRegime directly', () => {
    const { regime: expected } = classifyRegime(BULL_CONTEXT_BARS, REGIME_PARAMS);
    const ctx = computeHtfContext(BULL_CONTEXT_BARS);
    assert.equal(ctx.status, 'OK');
    assert.equal(ctx.regime, expected);
    assert.equal(expected, 'BULL_TREND');
  });

  it('includeCorrection: false (the default / daily+macro tiers) never populates correction_state', () => {
    const ctx = computeHtfContext(BULL_CONTEXT_BARS, { includeCorrection: false });
    assert.equal(ctx.correction_state, null);
  });

  it('includeCorrection: true (the 1H/2H intermediate tier) populates correction_state once structure resolves', () => {
    const ctx = computeHtfContext(BULL_CONTEXT_BARS, { includeCorrection: true });
    if (ctx.structure_direction) assert.ok(['NONE', 'ACTIVE', 'RESOLVED'].includes(ctx.correction_state));
  });

  it('never runs model/risk/quality computation -- the returned object exposes no such fields', () => {
    const ctx = computeHtfContext(BULL_CONTEXT_BARS, { includeCorrection: true });
    for (const forbidden of ['model', 'entry', 'stop_loss', 'tp1', 'tp2', 'rr', 'quality', 'action']) {
      assert.ok(!(forbidden in ctx), `computeHtfContext must never expose "${forbidden}"`);
    }
  });
});

describe('engine/htf: detectHtfConflict (single-layer gate, not majority voting)', () => {
  it('BEAR_TREND context blocks a BUY', () => {
    assert.equal(detectHtfConflict('BUY', { status: 'OK', regime: 'BEAR_TREND' }), true);
  });
  it('BULL_TREND context blocks a SELL', () => {
    assert.equal(detectHtfConflict('SELL', { status: 'OK', regime: 'BULL_TREND' }), true);
  });
  it('aligned regime never blocks', () => {
    assert.equal(detectHtfConflict('BUY', { status: 'OK', regime: 'BULL_TREND' }), false);
    assert.equal(detectHtfConflict('SELL', { status: 'OK', regime: 'BEAR_TREND' }), false);
  });
  it('a non-trend regime (RANGE/COMPRESSION/etc.) never blocks -- only a clear opposing trend does', () => {
    assert.equal(detectHtfConflict('BUY', { status: 'OK', regime: 'RANGE' }), false);
  });
  it('unavailable/unclear HTF context never blocks -- informational only, not fail-closed', () => {
    assert.equal(detectHtfConflict('BUY', { status: 'INSUFFICIENT_DATA', regime: null }), false);
    assert.equal(detectHtfConflict('BUY', { status: 'DATA_UNAVAILABLE', regime: null }), false);
    assert.equal(detectHtfConflict('BUY', null), false);
  });
  it('WAIT is never gated (nothing to conflict with)', () => {
    assert.equal(detectHtfConflict('WAIT', { status: 'OK', regime: 'BEAR_TREND' }), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// calculateEntry integration: fetch-all-10 / resolution mapping / restore
// ═══════════════════════════════════════════════════════════════════════

describe('calculateEntry: fetches all 10 required timeframes with correct resolution mapping', () => {
  it('requests exactly the 10 documented TradingView resolution codes, in order, then restores the original', async () => {
    const { deps, setTimeframeCalls } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS), startResolution: '15' });
    await calculateEntry({ _deps: deps });
    const calls = setTimeframeCalls();
    assert.deepEqual(calls.slice(0, 10), ALL_TF_CODES, 'must request 5/15/30/60/120/240/480/D/W/M in this order');
    assert.equal(calls.at(-1), '15', 'must restore the original chart resolution as the final call');
  });

  it('every required timeframe label is present in the structured result', async () => {
    const { deps } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS) });
    const result = await calculateEntry({ _deps: deps });
    for (const label of ALL_TF_LABELS) assert.ok(label in result.timeframes, `missing timeframe: ${label}`);
    for (const label of ALL_TF_LABELS) assert.ok(label in result.market_data_times, `missing market_data_times: ${label}`);
  });

  it('chart resolution restoration after success', async () => {
    const { deps, setTimeframeCalls } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS), startResolution: '30' });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'OK');
    assert.equal(setTimeframeCalls().at(-1), '30');
  });

  it('chart resolution restoration after a context-timeframe fetch failure', async () => {
    const { deps, setTimeframeCalls } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS), startResolution: '15', throwOnTf: '240' });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'OK', 'a single context-tier fetch failure must not fail the whole call');
    assert.equal(setTimeframeCalls().at(-1), '15', 'must still restore the original resolution even though one fetch failed');
    assert.equal(result.timeframes['4H'].data_error !== null, true);
  });

  it('chart resolution restoration after an entry-timeframe fetch failure (DATA_UNAVAILABLE)', async () => {
    const { deps, setTimeframeCalls } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS), startResolution: '60', throwOnTf: '30' });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'DATA_UNAVAILABLE');
    assert.equal(result.action, 'WAIT');
    assert.equal(setTimeframeCalls().at(-1), '60', 'restore must still happen even when the whole call fails closed');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Missing/insufficient context data is rejected safely, never crashes,
// never forces the whole call to fail (only entry tiers are fail-closed)
// ═══════════════════════════════════════════════════════════════════════

describe('calculateEntry: context-timeframe data safety (fail-safe degrade, not fail-closed)', () => {
  it('a context timeframe with too few bars reports its own INSUFFICIENT_DATA-shaped error, engine still returns OK', async () => {
    const barsByTf = uniformBars(BULL_CONTEXT_BARS);
    barsByTf['M'] = makeTrendBars(20, { seed: 91 }); // far too few monthly bars for a real broker history
    const { deps } = buildDeps({ barsByTf });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'OK');
    assert.equal(result.timeframes['1M'].status, 'DATA_UNAVAILABLE');
    assert.notEqual(result.timeframes['1M'].data_error, null);
  });

  it('forming (currently-unconfirmed) bar is excluded from context computation, exactly like entry tiers', async () => {
    const barsByTf = uniformBars(BULL_CONTEXT_BARS);
    const { deps } = buildDeps({ barsByTf });
    const result = await calculateEntry({ _deps: deps });
    const expectedLastConfirmed = BULL_CONTEXT_BARS.at(-2).time; // -1 is the forming bar
    assert.equal(result.timeframes['1H'].last_confirmed_bar_time, expectedLastConfirmed);
    assert.equal(result.market_data_times['1H'], expectedLastConfirmed);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Hierarchy behavior: single-layer HTF gate (1H), never majority voting,
// macro tiers (1W/1M) never gate or generate entries
// ═══════════════════════════════════════════════════════════════════════

describe('calculateEntry: HTF hierarchy behavior', () => {
  function entryPlusContext(contextOverrides = {}) {
    const barsByTf = {
      5: BUY_ENTRY_BARS, 15: BUY_ENTRY_BARS, 30: BUY_ENTRY_BARS,
      60: BULL_CONTEXT_BARS, 120: BULL_CONTEXT_BARS, 240: BULL_CONTEXT_BARS, 480: BULL_CONTEXT_BARS,
      D: BULL_CONTEXT_BARS, W: BULL_CONTEXT_BARS, M: BULL_CONTEXT_BARS,
      ...contextOverrides,
    };
    return buildDeps({ barsByTf });
  }

  it('sanity: the entry fixture alone organically produces a real BUY (regime -> structure -> model -> risk -> quality), not a mocked decision', async () => {
    const { deps } = entryPlusContext();
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'OK');
    assert.equal(result.action, 'BUY');
    assert.ok(result.entry !== null && result.sl !== null && result.tp1 !== null && result.tp2 !== null && result.rr !== null);
  });

  it('HTF alignment: 1H aligned (BULL_TREND) with a BUY setup proceeds', async () => {
    const { deps } = entryPlusContext({ 60: BULL_CONTEXT_BARS });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.action, 'BUY');
    assert.equal(result.reason, null);
  });

  it('material HTF conflict at the gate timeframe (1H BEAR_TREND vs a BUY setup) forces WAIT/HTF_CONFLICT with null trade geometry', async () => {
    const { deps } = entryPlusContext({ 60: BEAR_CONTEXT_BARS });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.action, 'WAIT');
    assert.equal(result.reason, 'HTF_CONFLICT');
    for (const f of ['entry', 'sl', 'tp1', 'tp2', 'rr']) assert.equal(result[f], null, `${f} must be null on a HTF_CONFLICT WAIT`);
    assert.equal(result.diagnostics.htf_conflict.gate_timeframe, '1H');
    assert.equal(result.diagnostics.htf_conflict.gate_regime, 'BEAR_TREND');
  });

  it('acceptable partial alignment: 2H/4H/8H/1D opposing while 1H (the gate tier) stays aligned still proceeds -- not every timeframe must align', async () => {
    const { deps } = entryPlusContext({ 60: BULL_CONTEXT_BARS, 120: BEAR_CONTEXT_BARS, 240: BEAR_CONTEXT_BARS, 480: BEAR_CONTEXT_BARS, D: BEAR_CONTEXT_BARS });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.action, 'BUY', 'only the 1H gate tier can block -- opposing 2H/4H/8H/1D alone must not');
  });

  it('does not implement majority voting: every context tier except 1H is bearish, 1H alone is bullish -- BUY still proceeds', async () => {
    const { deps } = entryPlusContext({
      60: BULL_CONTEXT_BARS, 120: BEAR_CONTEXT_BARS, 240: BEAR_CONTEXT_BARS, 480: BEAR_CONTEXT_BARS,
      D: BEAR_CONTEXT_BARS, W: BEAR_CONTEXT_BARS, M: BEAR_CONTEXT_BARS,
    });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.action, 'BUY', 'a 6-against-1 bearish majority among context tiers must not override the single 1H gate');
  });

  it('1W/1M (macro) never gate an entry even when materially opposing: bearish 1W/1M cannot block an otherwise-clean BUY', async () => {
    const { deps } = entryPlusContext({ W: BEAR_CONTEXT_BARS, M: BEAR_CONTEXT_BARS });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.action, 'BUY');
  });

  it('1W/1M never directly generate an entry: strongly bullish macro context cannot turn an organic entry-tier WAIT into BUY', async () => {
    const barsByTf = {
      5: WAIT_ENTRY_BARS, 15: WAIT_ENTRY_BARS, 30: WAIT_ENTRY_BARS,
      60: BULL_CONTEXT_BARS, 120: BULL_CONTEXT_BARS, 240: BULL_CONTEXT_BARS, 480: BULL_CONTEXT_BARS,
      D: BULL_CONTEXT_BARS, W: BULL_CONTEXT_BARS, M: BULL_CONTEXT_BARS,
    };
    const { deps } = buildDeps({ barsByTf });
    const result = await calculateEntry({ _deps: deps });
    assert.notEqual(result.action, 'BUY');
    assert.equal(result.action, 'WAIT');
    assert.equal(result.entry, null);
  });

  it('macro context (1M/1W) is reported for auditing with regime/structure fields, distinct from the entry-tier shape', async () => {
    const { deps } = entryPlusContext();
    const result = await calculateEntry({ _deps: deps });
    for (const label of ['1M', '1W']) {
      const ctx = result.timeframes[label];
      assert.equal(ctx.status, 'OK');
      assert.equal(ctx.regime, 'BULL_TREND');
      assert.ok(!('model' in ctx) && !('quality' in ctx), `${label} must never expose entry-pipeline fields`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// No Pine dependency; existing 5m/15m/30m entry-tier output shape unchanged
// ═══════════════════════════════════════════════════════════════════════

describe('calculateEntry: no Pine dependency, existing entry-tier shape preserved', () => {
  it('produces a full result including HTF context even when Pine (getMasterState) throws', async () => {
    const barsByTf = {
      5: BUY_ENTRY_BARS, 15: BUY_ENTRY_BARS, 30: BUY_ENTRY_BARS,
      60: BULL_CONTEXT_BARS, 120: BULL_CONTEXT_BARS, 240: BULL_CONTEXT_BARS, 480: BULL_CONTEXT_BARS,
      D: BULL_CONTEXT_BARS, W: BULL_CONTEXT_BARS, M: BULL_CONTEXT_BARS,
    };
    const { deps } = buildDeps({ barsByTf });
    const result = await calculateEntry({ _deps: deps });
    assert.equal(result.status, 'OK');
    assert.equal(result.pine_reference.status, 'READ_ERROR');
    assert.equal(result.action, 'BUY');
  });

  it('entry-tier (5m/15m/30m) summary shape is unchanged: same field set as the original 3-timeframe engine', async () => {
    const { deps } = buildDeps({ barsByTf: uniformBars(BULL_CONTEXT_BARS) });
    const result = await calculateEntry({ _deps: deps });
    const expectedFields = ['status', 'regime', 'model', 'action', 'wait_reason', 'correction_state', 'quality', 'last_confirmed_bar_time', 'data_error', 'stale', 'new_signals_resolved'];
    for (const label of ['5m', '15m', '30m']) {
      assert.deepEqual(Object.keys(result.timeframes[label]).sort(), expectedFields.sort(), `${label} field set changed`);
    }
  });
});
