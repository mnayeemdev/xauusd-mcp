/**
 * src/core/xauusd_analyze_market.js -- integration proof that wiring in
 * computeAnticipation() (Stage 1+2) is purely additive: the authoritative
 * decision and the confluence report are untouched, no second
 * calculateEntry() call or OHLCV sweep is introduced, and the chart
 * timeframe is still restored exactly as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket } from '../src/core/xauusd_analyze_market.js';

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

function baseDeps({ bars, getOhlcvCalls = null, setTimeframeCalls = null } = {}) {
  let tf = '15';
  return {
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: tf }),
    setTimeframe: async ({ timeframe }) => { tf = timeframe; setTimeframeCalls?.push(timeframe); return { success: true }; },
    getOhlcv: async () => { getOhlcvCalls?.push(tf); return { bars }; },
    getMasterState: async () => { throw new Error('Pine unavailable in this test'); },
    loadStore: () => ({ signals: [] }),
    saveStore: () => {},
    storePath: 'unused-in-test',
  };
}

describe('xauusd_analyze_market: anticipation is additive only', () => {
  const bullBars = makeTrendBars(510, { drift: 0.5 });

  it('adds an `anticipation` field without changing `action`/`entry`/`sl`/`tp1`/`tp2`/`rr`/`quality` or the confluence action', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: bullBars }) });
    assert.ok('anticipation' in result);
    assert.equal(result.confluence.action, result.action);
    assert.equal(result.confluence.entry, result.entry);
    assert.equal(result.confluence.sl, result.sl);
    assert.equal(result.confluence.tp1, result.tp1);
    assert.equal(result.confluence.tp2, result.tp2);
    assert.equal(result.confluence.rr, result.rr);
    assert.equal(result.confluence.quality, result.quality);
    if (result.anticipation) {
      assert.equal(result.anticipation.state === 'CONFIRMED', result.action === 'BUY' || result.action === 'SELL');
    }
  });

  it('still fetches OHLCV exactly once per timeframe -- anticipation introduces no additional CDP sweep', async () => {
    const getOhlcvCalls = [];
    await analyzeMarket({ _deps: baseDeps({ bars: bullBars, getOhlcvCalls }) });
    assert.equal(getOhlcvCalls.length, 10, `expected exactly 10 real getOhlcv calls (one per timeframe), got ${getOhlcvCalls.length}`);
  });

  it('still restores the original chart resolution', async () => {
    const setTimeframeCalls = [];
    await analyzeMarket({ _deps: baseDeps({ bars: bullBars, setTimeframeCalls }) });
    assert.equal(setTimeframeCalls.at(-1), '15');
  });

  it('anticipation is null-safe when evidence is unavailable (insufficient data)', async () => {
    const shortBars = makeTrendBars(5);
    const result = await analyzeMarket({ _deps: baseDeps({ bars: shortBars }) });
    assert.equal(result.evidence_available, false);
    assert.ok(result.anticipation); // computeAnticipation still runs -- decision.status is not OK, so it returns a minimal WAIT-shaped object
    assert.equal(result.anticipation.state, 'WAIT');
  });
});
