/**
 * src/core/xauusd_visualize_chart_context.js -- Stage 6, Part 7-15
 * active-chart-timeframe visualization orchestrator. Proves:
 *   - a non-OK chart context (symbol mismatch / unknown TF / insufficient
 *     data / read error) makes ZERO drawing calls of any kind
 *   - a valid context draws chart_-prefixed intents scoped to the active
 *     chart timeframe via the SAME protected reconcileVisualization()
 *   - stale cross-timeframe chart_-prefixed registry entries (from a
 *     PREVIOUSLY active timeframe) get cleaned up once the active TF
 *     changes, using the same registry-checked removeOne() path -- never
 *     draw_clear
 *   - the cleanup pass NEVER touches a decision-TF (non-chart_) role or a
 *     different symbol's entries
 *   - dry-run performs zero mutation calls anywhere in the pipeline
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  visualizeActiveChartContext, cleanupStaleChartLocalScopes, findStaleChartLocalEntries,
} from '../src/core/xauusd_visualize_chart_context.js';

const START_TIME = 1700000000;
const TF_SECONDS = 3600;

/** A near-flat baseline (tiny drift avoids spurious ties in pivot detection) with a few injected swings, so computeStructure()/buildLevels() produce REAL pivots/levels -- same technique tests/engine_levels.test.js uses. A pure monotonic drift (no injected swings) produces NO pivots at all and would make every visualization candidate empty. */
function makeSwingBars(n, overrides = {}) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i * 0.001;
    const bar = { time: START_TIME + i * TF_SECONDS, open: 1985 + drift, close: 1985 + drift, high: 1990 + drift, low: 1980 + drift, volume: 100 };
    if (overrides[i]) Object.assign(bar, overrides[i]);
    bars.push(bar);
  }
  return bars;
}

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

const SWING_BARS = makeSwingBars(510, {
  400: { open: 1985.4, high: 2050, low: 1985, close: 2045 },
  440: { open: 1955, high: 1960, low: 1950, close: 1955 },
  480: { open: 2050, high: 2060, low: 2049, close: 2058 },
  505: { open: 2054, close: 2055, high: 2056, low: 2054 },
});

function memoryDeps({ symbol = 'OANDA:XAUUSD', resolution = '60', bars = makeTrendBars(510), registryEntries = {}, chartShapeIds = [] } = {}) {
  let registry = { schema_version: 1, entries: { ...registryEntries } };
  const drawCalls = [];
  const removeCalls = [];
  const listCalls = [];
  let nextId = 1;
  return {
    _deps: {
      getState: async () => ({ success: true, symbol, resolution }),
      getOhlcv: async () => ({ bars }),
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => { listCalls.push(1); return { success: true, count: chartShapeIds.length, shapes: chartShapeIds.map((id) => ({ id, name: 'horizontal_line' })) }; },
      drawShape: async () => { const id = `new_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; },
      now: () => new Date('2025-01-01T00:00:00.000Z'),
    },
    getRegistry: () => registry,
    drawCalls, removeCalls, listCalls,
  };
}

function chartLocalEntry({ symbol = 'OANDA:XAUUSD', timeframe, role = 'chart_structure_primary', entity_id }) {
  return { role, entity_id, symbol, timeframe, primitive: 'horizontal_line', intent_signature: 'sig', created_at: '2025-01-01T00:00:00.000Z' };
}

describe('xauusd_visualize_chart_context: non-OK context -> zero drawing calls', () => {
  it('SYMBOL_MISMATCH makes no listDrawings/drawShape/removeOne calls', async () => {
    const deps = memoryDeps({ symbol: 'NASDAQ:AAPL' });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.context.status, 'SYMBOL_MISMATCH');
    assert.equal(result.reconciliation, null);
    assert.equal(result.cleanup, null);
    assert.deepEqual(deps.drawCalls, []);
    assert.deepEqual(deps.removeCalls, []);
    assert.deepEqual(deps.listCalls, []);
  });

  it('UNKNOWN_TIMEFRAME makes no drawing calls', async () => {
    const deps = memoryDeps({ resolution: '3' });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.context.status, 'UNKNOWN_TIMEFRAME');
    assert.deepEqual(deps.drawCalls, []);
  });

  it('INSUFFICIENT_DATA makes no drawing calls', async () => {
    const deps = memoryDeps({ bars: makeTrendBars(5) });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.context.status, 'INSUFFICIENT_DATA');
    assert.deepEqual(deps.drawCalls, []);
  });
});

describe('xauusd_visualize_chart_context: a valid context reconciles chart_-prefixed intents', () => {
  it('draws only chart_-prefixed roles, scoped to the active chart timeframe label', async () => {
    const deps = memoryDeps({ resolution: '240', bars: SWING_BARS });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.context.status, 'OK');
    assert.ok(result.mapping.intents.length > 0);
    for (const i of result.mapping.intents) {
      assert.ok(i.role.startsWith('chart_'));
      assert.equal(i.timeframe, '4H');
    }
    assert.equal(result.reconciliation.dry_run, false);
    assert.ok(deps.drawCalls.length > 0);
  });

  it('dry_run:true performs zero drawShape/removeOne calls anywhere in the pipeline', async () => {
    const deps = memoryDeps({ resolution: '240', bars: SWING_BARS });
    const result = await visualizeActiveChartContext({ dryRun: true, _deps: deps._deps });
    assert.equal(result.reconciliation.dry_run, true);
    assert.equal(result.cleanup.dry_run, true);
    assert.deepEqual(deps.drawCalls, []);
    assert.deepEqual(deps.removeCalls, []);
  });
});

describe('xauusd_visualize_chart_context: cross-timeframe stale cleanup', () => {
  it('findStaleChartLocalEntries only matches chart_-prefixed roles for the SAME symbol on a DIFFERENT timeframe', () => {
    const registry = {
      entries: {
        k1: chartLocalEntry({ timeframe: '4H', entity_id: 'e1' }),
        k2: chartLocalEntry({ timeframe: '1H', entity_id: 'e2' }), // current TF -- must NOT be flagged
        k3: { role: 'structure_primary', entity_id: 'e3', symbol: 'OANDA:XAUUSD', timeframe: '4H' }, // decision-TF role, no chart_ prefix -- must NOT be flagged
        k4: chartLocalEntry({ symbol: 'OANDA:EURUSD', timeframe: '4H', entity_id: 'e4' }), // different symbol -- must NOT be flagged
      },
    };
    const stale = findStaleChartLocalEntries(registry, { symbol: 'OANDA:XAUUSD', currentTimeframe: '1H' });
    assert.equal(stale.length, 1);
    assert.equal(stale[0].key, 'k1');
  });

  it('cleanupStaleChartLocalScopes removes a stale entry that is still on the chart via removeOne, and updates the registry', async () => {
    const deps = memoryDeps({
      resolution: '60', // active TF = 1H
      registryEntries: { k1: chartLocalEntry({ timeframe: '4H', entity_id: 'e1' }) },
      chartShapeIds: ['e1'],
    });
    const result = await cleanupStaleChartLocalScopes({ symbol: 'OANDA:XAUUSD', currentTimeframe: '1H', _deps: deps._deps });
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].action, 'REMOVE_REGISTERED');
    assert.deepEqual(deps.removeCalls, ['e1']);
    assert.equal(deps.getRegistry().entries.k1, undefined);
  });

  it('drops a stale registry entry whose entity is already gone from the chart, without calling removeOne', async () => {
    const deps = memoryDeps({
      resolution: '60',
      registryEntries: { k1: chartLocalEntry({ timeframe: '4H', entity_id: 'e1' }) },
      chartShapeIds: [], // e1 no longer actually on the chart
    });
    const result = await cleanupStaleChartLocalScopes({ symbol: 'OANDA:XAUUSD', currentTimeframe: '1H', _deps: deps._deps });
    assert.equal(result.removed[0].action, 'DROP_STALE_REGISTRY');
    assert.deepEqual(deps.removeCalls, []);
  });

  it('never touches an entry for the CURRENT active timeframe', async () => {
    const deps = memoryDeps({
      resolution: '60',
      registryEntries: { k1: chartLocalEntry({ timeframe: '1H', entity_id: 'e1' }) },
      chartShapeIds: ['e1'],
    });
    const result = await cleanupStaleChartLocalScopes({ symbol: 'OANDA:XAUUSD', currentTimeframe: '1H', _deps: deps._deps });
    assert.deepEqual(result.removed, []);
    assert.deepEqual(deps.removeCalls, []);
    assert.ok(deps.getRegistry().entries.k1);
  });

  it('never touches a decision-TF (non chart_-prefixed) role, even on a stale timeframe', async () => {
    const deps = memoryDeps({
      resolution: '60',
      registryEntries: { k1: { role: 'structure_primary', entity_id: 'e1', symbol: 'OANDA:XAUUSD', timeframe: '4H' } },
      chartShapeIds: ['e1'],
    });
    const result = await cleanupStaleChartLocalScopes({ symbol: 'OANDA:XAUUSD', currentTimeframe: '1H', _deps: deps._deps });
    assert.deepEqual(result.removed, []);
    assert.deepEqual(deps.removeCalls, []);
  });

  it('a full visualizeActiveChartContext() cycle cleans up a stale prior-TF entry alongside creating the new TF\'s own intents', async () => {
    const deps = memoryDeps({
      resolution: '240', // switched TO 4H
      bars: SWING_BARS,
      registryEntries: { k1: chartLocalEntry({ timeframe: '1H', entity_id: 'e1' }) }, // stale FROM 1H
      chartShapeIds: ['e1'],
    });
    const result = await visualizeActiveChartContext({ _deps: deps._deps });
    assert.equal(result.cleanup.removed.length, 1);
    assert.equal(result.cleanup.removed[0].timeframe, '1H');
    assert.ok(deps.removeCalls.includes('e1'));
    assert.ok(deps.drawCalls.length > 0); // still created the new 4H intents
  });
});
