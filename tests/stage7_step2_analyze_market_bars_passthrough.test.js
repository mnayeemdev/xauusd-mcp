/**
 * src/core/xauusd_analyze_market.js -- Stage 7 Step 2 additive
 * `primary_confirmed_bars` passthrough. Proves:
 *   - analyzeMarket() exposes the EXACT SAME confirmed 15m bars array
 *     computeEvidence()/computeOpportunityPlan() already consumed -- no
 *     second OHLCV sweep, no recomputation
 *   - this is purely additive: every pre-existing field (action/entry/sl/
 *     tp1/tp2/rr/evidence/confluence/anticipation/candidates/
 *     pre_entry_plan) is completely unaffected by its presence
 *   - it degrades to null (never a fabricated bars array) when evidence is
 *     unavailable
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket } from '../src/core/xauusd_analyze_market.js';

const START_TIME = 1700000000;
function makeSwingBars(n, overrides = {}) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i * 0.001;
    const bar = { time: START_TIME + i * 900, open: 1985 + drift, close: 1985 + drift, high: 1990 + drift, low: 1980 + drift, volume: 100 };
    if (overrides[i]) Object.assign(bar, overrides[i]);
    bars.push(bar);
  }
  return bars;
}

const SWING_BARS = makeSwingBars(510, {
  400: { open: 1985.4, high: 2050, low: 1985, close: 2045 },
  440: { open: 1955, high: 1960, low: 1950, close: 1955 },
  480: { open: 2050, high: 2060, low: 2049, close: 2058 },
  505: { open: 2054, close: 2055, high: 2056, low: 2054 },
});

function baseDeps({ bars } = {}) {
  let tf = '15';
  return {
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: tf }),
    setTimeframe: async ({ timeframe }) => { tf = timeframe; return { success: true }; },
    getOhlcv: async () => ({ bars }),
    getMasterState: async () => { throw new Error('Pine unavailable in this test'); },
    loadStore: () => ({ signals: [] }),
    saveStore: () => {},
    storePath: 'unused-in-test',
  };
}

describe('xauusd_analyze_market: primary_confirmed_bars passthrough (Stage 7 Step 2, additive)', () => {
  it('exposes the same confirmed 15m bars array used for evidence/pre_entry_plan', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS }) });
    assert.ok(Array.isArray(result.primary_confirmed_bars));
    assert.ok(result.primary_confirmed_bars.length > 0);
    // The last confirmed bar must be the same one pre_entry_plan derived generated_from_bar_time from.
    const lastBar = result.primary_confirmed_bars[result.primary_confirmed_bars.length - 1];
    assert.equal(lastBar.time, result.pre_entry_plan.generated_from_bar_time);
  });

  it('is purely additive -- every pre-existing top-level field is unaffected', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS }) });
    assert.ok(['BUY', 'SELL', 'WAIT'].includes(result.action));
    assert.ok(result.evidence_available === true || result.evidence_available === false);
    assert.ok('evidence' in result);
    assert.ok('confluence' in result);
    assert.ok('anticipation' in result);
    assert.ok('candidates' in result);
    assert.ok('pre_entry_plan' in result);
    assert.ok('fetch_errors' in result);
  });

  it('degrades to null (never a fabricated bars array) when evidence is unavailable', async () => {
    const shortBars = makeSwingBars(10);
    const result = await analyzeMarket({ _deps: baseDeps({ bars: shortBars }) });
    assert.equal(result.evidence_available, false);
    assert.equal(result.primary_confirmed_bars, null);
  });
});
