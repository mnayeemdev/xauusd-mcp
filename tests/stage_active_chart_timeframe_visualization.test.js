/**
 * Active-chart-timeframe visualization fix: restores mapping.intents to
 * xauusd_visualize_chart_context.js's reconcileVisualization() call
 * (previously hardcoded to `[]` during an earlier presentation-cleanup pass
 * and never revisited). Proves:
 *   - 30m / 4H / 1D active-chart contexts actually render chart_-prefixed
 *     analytics to TradingView (not just computed and discarded)
 *   - switching the active chart timeframe reconciles/removes ONLY the
 *     previous timeframe's stale chart_* entries -- never a decision-TF
 *     role, never a different symbol
 *   - decision-TF roles survive a chart-local reconciliation pass, and
 *     chart-local roles survive a decision-TF reconciliation pass (shared
 *     registry, disjoint ownership)
 *   - chart-local labels stay concise (reuse the SAME short-label category
 *     builders decision-TF analytics already use -- never a verbose
 *     diagnostic sentence)
 *   - the current signal/watch/confirmed-trade display is completely
 *     unaffected by chart-local reconciliation running alongside it
 *   - chart-local NEVER produces a trade/status_box/trade_card role --
 *     BUY/SELL authority stays exclusively with the decision-TF pipeline
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { visualizeActiveChartContext } from '../src/core/xauusd_visualize_chart_context.js';
import { visualizeMarketAnalysis } from '../src/core/xauusd_visualize_market.js';
import { buildChartLocalVisualizationIntents } from '../src/engine/marketVisualization.js';

const START_TIME = 1700000000;

/** Same swing-injection technique used elsewhere (stage6_visualize_chart_context.test.js) -- a pure monotonic drift produces no pivots and every candidate would be empty. */
function makeSwingBars(n, tfSeconds, overrides = {}) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i * 0.001;
    const bar = { time: START_TIME + i * tfSeconds, open: 1985 + drift, close: 1985 + drift, high: 1990 + drift, low: 1980 + drift, volume: 100 };
    if (overrides[i]) Object.assign(bar, overrides[i]);
    bars.push(bar);
  }
  return bars;
}

function swingBarsFor(tfSeconds) {
  return makeSwingBars(510, tfSeconds, {
    400: { open: 1985.4, high: 2050, low: 1985, close: 2045 },
    440: { open: 1955, high: 1960, low: 1950, close: 1955 },
    480: { open: 2050, high: 2060, low: 2049, close: 2058 },
    505: { open: 2054, close: 2055, high: 2056, low: 2054 },
  });
}

function sharedDeps({ symbol = 'OANDA:XAUUSD', resolution, bars, registryEntries = {}, chartShapeIds = [] } = {}) {
  let registry = { schema_version: 1, entries: { ...registryEntries } };
  const drawCalls = [];
  const removeCalls = [];
  let nextId = 1;
  return {
    _deps: {
      getState: async () => ({ success: true, symbol, resolution }),
      getOhlcv: async () => ({ bars }),
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({
        success: true,
        count: Object.keys(registry.entries).length + chartShapeIds.length,
        shapes: [...Object.values(registry.entries).map((e) => ({ id: e.entity_id, name: e.primitive })), ...chartShapeIds.map((id) => ({ id, name: 'horizontal_line' }))],
      }),
      drawShape: async () => { const id = `new_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; },
      now: () => new Date('2025-01-01T00:00:00.000Z'),
      loadSignalStore: () => ({ signals: [] }),
      signalStorePath: 'unused-in-test',
    },
    getRegistry: () => registry, drawCalls, removeCalls,
  };
}

function chartLocalEntry({ symbol = 'OANDA:XAUUSD', timeframe, role = 'chart_structure_primary', entity_id }) {
  return { role, entity_id, symbol, timeframe, primitive: 'horizontal_line', intent_signature: 'sig', created_at: '2025-01-01T00:00:00.000Z' };
}

describe('Active chart timeframe visualization: renders for each supported viewing timeframe', () => {
  for (const [label, resolution, tfSeconds] of [['30m', '30', 1800], ['4H', '240', 14400], ['1D', 'D', 86400]]) {
    it(`${label} active-chart context actually draws chart_-prefixed analytics to TradingView`, async () => {
      const deps = sharedDeps({ resolution, bars: swingBarsFor(tfSeconds) });
      const result = await visualizeActiveChartContext({ _deps: deps._deps });
      assert.equal(result.context.status, 'OK', `expected OK context for ${label}`);
      assert.ok(result.mapping.intents.length > 0, `expected ${label} to produce at least one chart-local intent`);
      assert.ok(deps.drawCalls.length > 0, `expected ${label} to actually draw to TradingView, not just compute`);
      for (const i of result.mapping.intents) assert.ok(i.role.startsWith('chart_'));
    });
  }
});

describe('Active chart timeframe visualization: switching timeframe reconciles only the previous TF\'s stale entries', () => {
  it('switching 1H -> 4H removes the stale 1H chart_ entry, never a decision-TF role or a different symbol', async () => {
    const deps = sharedDeps({
      resolution: '240', // now viewing 4H
      bars: swingBarsFor(14400),
      registryEntries: {
        stale_1h: chartLocalEntry({ timeframe: '1H', entity_id: 'e_stale' }),
        decision_role: { role: 'nearest_support', entity_id: 'e_decision', symbol: 'OANDA:XAUUSD', timeframe: '15m', primitive: 'horizontal_line', intent_signature: 'sig', created_at: '2025-01-01T00:00:00.000Z' },
        other_symbol: chartLocalEntry({ symbol: 'OANDA:EURUSD', timeframe: '1H', entity_id: 'e_other' }),
      },
      chartShapeIds: ['e_stale', 'e_decision', 'e_other'],
    });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.cleanup.removed.length, 1);
    assert.equal(result.cleanup.removed[0].timeframe, '1H');
    assert.deepEqual(deps.removeCalls, ['e_stale']);
    // The decision-TF role and the different symbol's entry are both still registered, untouched.
    const registry = deps.getRegistry();
    assert.ok(registry.entries.decision_role);
    assert.ok(registry.entries.other_symbol);
  });
});

describe('Active chart timeframe visualization: decision-TF and chart-local ownership never interferes', () => {
  it('decision-TF roles survive a chart-local reconciliation pass run against the SAME registry', async () => {
    const decision = {
      status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', symbol: 'OANDA:XAUUSD', setup: null, entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
      timeframes: { '15m': { last_confirmed_bar_time: START_TIME } }, market_data_times: { '15m': START_TIME }, diagnostics: { source_timeframe: '15m' },
      evidence: { regime: 'BULL_TREND', structure: { state: 'BULLISH', lastEvent: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2000, label: 'HL' }, rangeHigh: 2060, rangeLow: 1980 }, correction: { state: 'NONE' }, eligibility: { eligible: [], blocked_reason: null }, candlestickPatterns: [], classicalPatterns: [], breakoutState: { state: 'NO_BREAKOUT', evidence: {} }, liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } }, levelsContext: { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] }, volatilityContext: { atrValue: 5, state: 'NORMAL' }, sessionContext: { current: { session: 'LONDON', last_close: 2020 } }, dailyWeeklyContext: {} },
      confluence: null, anticipation: null,
    };
    const deps = sharedDeps({ resolution: '240', bars: swingBarsFor(14400) });

    const decisionResult = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps: deps._deps });
    assert.ok(decisionResult.visualization.active_roles.includes('structure_primary__label'));
    const decisionEntityIds = Object.values(deps.getRegistry().entries).map((e) => e.entity_id);

    await visualizeActiveChartContext({ _deps: deps._deps });

    // None of the decision-TF entities were ever passed to removeOne.
    for (const id of decisionEntityIds) assert.ok(!deps.removeCalls.includes(id), `decision-TF entity ${id} must never be removed by chart-local reconciliation`);
    const registry = deps.getRegistry();
    assert.ok(Object.values(registry.entries).some((e) => e.role === 'structure_primary__label'));
  });

  it('chart-local roles survive a decision-TF reconciliation pass run against the SAME registry', async () => {
    const deps = sharedDeps({ resolution: '240', bars: swingBarsFor(14400) });
    const chartResult = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.ok(chartResult.mapping.intents.length > 0);
    const chartEntityIds = Object.values(deps.getRegistry().entries).map((e) => e.entity_id);

    const decision = {
      status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', symbol: 'OANDA:XAUUSD', setup: null, entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
      timeframes: { '15m': { last_confirmed_bar_time: START_TIME } }, market_data_times: { '15m': START_TIME }, diagnostics: { source_timeframe: '15m' },
      evidence: null, confluence: null, anticipation: null,
    };
    await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps: deps._deps });

    for (const id of chartEntityIds) assert.ok(!deps.removeCalls.includes(id), `chart-local entity ${id} must never be removed by decision-TF reconciliation`);
    const registry = deps.getRegistry();
    assert.ok(Object.values(registry.entries).some((e) => e.role.startsWith('chart_')));
  });
});

describe('Active chart timeframe visualization: concise-label policy is intact for chart-local content', () => {
  it('every chart-local text label stays short -- never a long diagnostic sentence', () => {
    const richEvidence = {
      regime: 'BULL_TREND',
      structure: { state: 'BULLISH', lastEvent: { type: 'CHOCH', direction: 'BULLISH', level: 2010 }, lastSweep: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2000, label: 'HL' }, pivots: [], rangeHigh: 2060, rangeLow: 1980 },
      correction: { state: 'NONE' }, eligibility: { regime: 'BULL_TREND', eligible: [], blocked_reason: null },
      candlestickPatterns: [], classicalPatterns: [],
      breakoutState: { state: 'BREAKOUT_CONFIRMED', evidence: {} },
      liquidityContext: { equalHighs: [{ price: 2058, touch_count: 3 }], equalLows: [], sweepReclaim: { swept: false } },
      levelsContext: { levels: [], nearestResistance: { price: 2055, fresh: true, touch_count: 2 }, nearestSupport: { price: 1995, fresh: false, touch_count: 3 }, supplyDemandZones: [{ direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH', origin_bar_index: 0 }] },
      volatilityContext: { atrValue: 5, state: 'NORMAL' }, sessionContext: { current: { session: 'LONDON', last_close: 2020 } }, dailyWeeklyContext: {},
    };
    const { intents } = buildChartLocalVisualizationIntents({ evidence: richEvidence, symbol: 'OANDA:XAUUSD', timeframe: '4H', time: START_TIME });
    const textIntents = intents.filter((i) => i.text);
    assert.ok(textIntents.length > 0, 'expected at least one text label to check');
    for (const i of textIntents) {
      assert.ok(i.text.length <= 60, `label "${i.text}" exceeds the short-display budget`);
      assert.ok(!i.text.includes('|'), `label "${i.text}" contains a raw diagnostic separator`);
    }
  });
});

describe('Active chart timeframe visualization: signal/trade display is unaffected', () => {
  it('a confirmed BUY card/lines survive a chart-local reconciliation pass run against the SAME registry, and chart-local never produces a trade/status role', async () => {
    const decision = {
      status: 'OK', action: 'BUY', reason: null, symbol: 'OANDA:XAUUSD', setup: 'TC', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78,
      timeframes: { '15m': { last_confirmed_bar_time: START_TIME } }, market_data_times: { '15m': START_TIME }, diagnostics: { source_timeframe: '15m' },
      evidence: null, confluence: null, anticipation: null,
    };
    const openSignal = { signal_id: 'sig1', symbol: 'OANDA:XAUUSD', timeframe: '15m', model: 'TC', side: 'BUY', origin_bar: START_TIME, signal_bar_time: START_TIME, entry: 2030, stop_loss: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78, status: 'OPEN', created_at: '2025-01-01T00:00:00.000Z', resolution_bar_time: null, realized_r: null };
    const deps = sharedDeps({ resolution: '240', bars: swingBarsFor(14400) });
    deps._deps.loadSignalStore = () => ({ signals: [openSignal] });

    const decisionResult = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps: deps._deps });
    assert.ok(decisionResult.visualization.active_roles.includes('trade_entry'));
    assert.ok(decisionResult.visualization.active_roles.includes('trade_card'));

    const chartResult = await visualizeActiveChartContext({ _deps: deps._deps });
    // Chart-local never produces a trade/status_box/trade_card role -- BUY/SELL authority stays exclusively decision-TF.
    for (const i of chartResult.mapping.intents) {
      assert.ok(!i.role.includes('trade_'));
      assert.ok(!i.role.includes('status_box'));
    }
    // The confirmed trade's own entities are still registered, never removed.
    const registry = deps.getRegistry();
    assert.ok(Object.values(registry.entries).some((e) => e.role === 'trade_entry'));
    assert.ok(Object.values(registry.entries).some((e) => e.role === 'trade_card'));
  });
});
