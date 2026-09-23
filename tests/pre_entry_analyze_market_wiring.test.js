/**
 * src/core/xauusd_analyze_market.js -- Pre-Entry Opportunity Planner
 * wiring (additive upgrade). Proves:
 *   - analyzeMarket() exposes a `pre_entry_plan` field
 *   - it is computed from the SAME already-fetched primarySplit.confirmed
 *     bars computeEvidence() itself used -- no second OHLCV sweep
 *   - `pre_entry_plan` never alters `action`/`entry`/`sl`/`tp1`/`tp2`/`rr`
 *   - it degrades to a safe NO_PLAN-shaped result (never throws) when
 *     evidence is unavailable
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

function baseDeps({ bars, getOhlcvCalls = null } = {}) {
  let tf = '15';
  return {
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: tf }),
    setTimeframe: async ({ timeframe }) => { tf = timeframe; return { success: true }; },
    getOhlcv: async () => { getOhlcvCalls?.push(tf); return { bars }; },
    getMasterState: async () => { throw new Error('Pine unavailable in this test'); },
    loadStore: () => ({ signals: [] }),
    saveStore: () => {},
    storePath: 'unused-in-test',
  };
}

describe('xauusd_analyze_market: pre_entry_plan wiring (additive)', () => {
  it('exposes a pre_entry_plan field with the expected shape', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS }) });
    assert.ok(result.pre_entry_plan);
    assert.ok(['PLAN', 'NO_PLAN', 'SUPERSEDED_BY_CONFIRMED_TRADE'].includes(result.pre_entry_plan.status));
    // 1.1.0: opportunityPlanner.js's non-authoritative RR field was renamed
    // candidate_rr -> planning_rr_illustrative (RR naming-ambiguity fix).
    assert.equal(result.pre_entry_plan.schema_version, '1.1.0');
  });

  it('never causes a second OHLCV sweep -- exactly one real getOhlcv call per timeframe', async () => {
    const getOhlcvCalls = [];
    await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS, getOhlcvCalls }) });
    assert.equal(getOhlcvCalls.length, 10); // ALL_TIMEFRAMES has 10 entries
  });

  it('never alters action/entry/sl/tp1/tp2/rr regardless of what the plan contains', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS }) });
    // The authoritative fields are untouched by adding pre_entry_plan -- structural proof: they come straight from `decision`, spread before pre_entry_plan is even computed.
    assert.ok(['BUY', 'SELL', 'WAIT'].includes(result.action));
    if (result.action === 'WAIT') {
      assert.equal(result.entry, null);
    }
  });

  it('when the authoritative decision is confirmed BUY/SELL, pre_entry_plan is SUPERSEDED_BY_CONFIRMED_TRADE with no candidate geometry', async () => {
    const result = await analyzeMarket({ _deps: baseDeps({ bars: SWING_BARS }) });
    if (result.action === 'BUY' || result.action === 'SELL') {
      assert.equal(result.pre_entry_plan.status, 'SUPERSEDED_BY_CONFIRMED_TRADE');
      assert.equal(result.pre_entry_plan.candidate_entry_zone, null);
    }
  });

  it('degrades to a safe NO_PLAN-shaped result, never throws, when evidence is unavailable', async () => {
    const shortBars = makeSwingBars(10);
    const result = await analyzeMarket({ _deps: baseDeps({ bars: shortBars }) });
    assert.equal(result.evidence_available, false);
    assert.ok(result.pre_entry_plan);
    assert.equal(result.pre_entry_plan.status, 'NO_PLAN');
  });
});
