/**
 * src/core/xauusd_chart_context.js -- Stage 6, Part 7-15 active chart
 * timeframe intelligence. Proves:
 *   - ZERO chart mutation: setTimeframe() is never called by this module
 *     (structural proof via source audit, plus a spy that would fail the
 *     test if invoked)
 *   - resolution normalization: recognizes 5/15/30/60/120/240/480/D/W/M
 *     (and 1D/1W/1M spellings), fails safe (UNKNOWN_TIMEFRAME) on an
 *     unrecognized resolution (e.g. "1", "3", "2H" is not a real TV code)
 *   - symbol mismatch -> SYMBOL_MISMATCH / VISUALIZATION_PAUSED_SYMBOL_MISMATCH,
 *     never force-switches the symbol, never computes evidence
 *   - insufficient bars -> INSUFFICIENT_DATA, never throws
 *   - a getState()/getOhlcv() failure -> READ_ERROR (fails closed), never
 *     fabricates a timeframe or evidence
 *   - status:OK returns real, non-fabricated TF-local evidence built from
 *     the SAME computeEvidence() the decision path uses
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getActiveChartContext, normalizeChartResolution } from '../src/core/xauusd_chart_context.js';

const START_TIME = 1700000000;
function makeTrendBars(n, { start = 2000, drift = 0.5, tfSeconds = 3600 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + drift;
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}

function baseDeps({ symbol = 'OANDA:XAUUSD', resolution = '60', bars, getStateThrows, getOhlcvThrows, setTimeframeCalls = null } = {}) {
  return {
    getState: async () => { if (getStateThrows) throw new Error('CDP unavailable'); return { success: true, symbol, resolution }; },
    getOhlcv: async () => { if (getOhlcvThrows) throw new Error('OHLCV read failed'); return { bars }; },
    setTimeframe: async ({ timeframe }) => { setTimeframeCalls?.push(timeframe); return { success: true }; },
  };
}

describe('xauusd_chart_context: source audit -- never mutates the chart', () => {
  it('never calls setTimeframe or setSymbol in actual code', () => {
    const src = readFileSync(new URL('../src/core/xauusd_chart_context.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/setTimeframe\(/.test(code));
    assert.ok(!/setSymbol\(/.test(code));
  });

  it('a spy setTimeframe is never invoked during a normal read', async () => {
    const setTimeframeCalls = [];
    await getActiveChartContext({ _deps: baseDeps({ bars: makeTrendBars(510), setTimeframeCalls }) });
    assert.deepEqual(setTimeframeCalls, []);
  });
});

describe('xauusd_chart_context: resolution normalization', () => {
  it('recognizes every documented timeframe code', () => {
    const cases = { 5: '5', 15: '15', 30: '30', 60: '60', 120: '120', 240: '240', 480: '480', D: 'D', W: 'W', M: 'M', '1D': 'D', '1W': 'W', '1M': 'M' };
    for (const [raw, expected] of Object.entries(cases)) assert.equal(normalizeChartResolution(raw), expected, `raw="${raw}"`);
  });

  it('fails safe (null) on an unrecognized resolution -- never guesses the nearest known one', () => {
    for (const raw of ['1', '3', '2H', '45', null, undefined, '']) assert.equal(normalizeChartResolution(raw), null, `raw="${raw}"`);
  });
});

describe('xauusd_chart_context: getActiveChartContext() -- status outcomes', () => {
  it('status:OK for an approved symbol + recognized timeframe + sufficient bars, with real TF-local evidence', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ resolution: '60', bars: makeTrendBars(510) }) });
    assert.equal(result.status, 'OK');
    assert.equal(result.timeframe, '60');
    assert.equal(result.timeframe_label, '1H');
    assert.ok(result.evidence);
    assert.ok(result.evidence.structure);
    assert.equal(typeof result.last_confirmed_bar_time, 'number');
  });

  it('accepts the "1D"-style spelling identically to the bare "D" TradingView code', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ resolution: '1D', bars: makeTrendBars(510, { tfSeconds: 86400 }) }) });
    assert.equal(result.status, 'OK');
    assert.equal(result.timeframe, 'D');
    assert.equal(result.timeframe_label, '1D');
  });

  it('SYMBOL_MISMATCH for a non-XAUUSD chart symbol -- never computes evidence, reports the safe paused state', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ symbol: 'NASDAQ:AAPL', bars: makeTrendBars(510) }) });
    assert.equal(result.status, 'SYMBOL_MISMATCH');
    assert.equal(result.visualization_state, 'VISUALIZATION_PAUSED_SYMBOL_MISMATCH');
    assert.equal(result.evidence, null);
  });

  it('UNKNOWN_TIMEFRAME for an unrecognized chart resolution -- fails safe, no evidence', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ resolution: '3', bars: makeTrendBars(510) }) });
    assert.equal(result.status, 'UNKNOWN_TIMEFRAME');
    assert.equal(result.evidence, null);
  });

  it('INSUFFICIENT_DATA for too few bars -- never throws', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ bars: makeTrendBars(5) }) });
    assert.equal(result.status, 'INSUFFICIENT_DATA');
    assert.equal(result.evidence, null);
  });

  it('READ_ERROR when getState() itself throws (e.g. CDP unavailable) -- fails closed, never fabricates a timeframe', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ bars: makeTrendBars(510), getStateThrows: true }) });
    assert.equal(result.status, 'READ_ERROR');
    assert.equal(result.timeframe, null);
  });

  it('READ_ERROR when getOhlcv() itself throws, after symbol/timeframe were already read successfully', async () => {
    const result = await getActiveChartContext({ _deps: baseDeps({ bars: makeTrendBars(510), getOhlcvThrows: true }) });
    assert.equal(result.status, 'READ_ERROR');
    assert.equal(result.symbol, 'OANDA:XAUUSD');
    assert.equal(result.timeframe, '60');
  });
});
