/**
 * Visualizer-only fix: after an engine-profile switch (reference_15m ->
 * intraday_5m) the decision-timeframe plan is keyed by 5m, so planner
 * drawings registered under the old 15m key were never removed by the
 * stale-cleanup pass (which was bounded to the exact (symbol, timeframe)).
 * `cleanupScope: 'symbol'` lets the current plan remove obsolete drawings
 * for the SAME symbol under ANY timeframe key, while `ownsRole` still keeps
 * other callers' roles (chart_*) untouched and other symbols are never seen.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileVisualization, buildReconciliationPlan } from '../src/core/xauusd_visualize.js';
import { makeDrawingIntent } from '../src/engine/visualization.js';
import { CHART_LOCAL_ROLE_PREFIX } from '../src/engine/marketVisualization.js';
import { computeIntentSignature } from '../src/engine/drawingRegistry.js';

const SYMBOL = 'OANDA:XAUUSD';
const OTHER = 'OANDA:XAGUSD';
const ownsDecisionRole = (role) => typeof role === 'string' && !role.startsWith(CHART_LOCAL_ROLE_PREFIX);

function intent(overrides = {}) {
  return makeDrawingIntent({ role: 'nearest_support', primitive: 'horizontal_line', point: { time: 1790000000, price: 4260 }, symbol: SYMBOL, timeframe: '5m', ...overrides });
}
function entry({ role, timeframe, entityId, symbol = SYMBOL, matchingIntent = null }) {
  return { role, entity_id: entityId, symbol, timeframe, primitive: 'horizontal_line', intent_signature: matchingIntent ? computeIntentSignature(matchingIntent) : 'sig', created_at: '2026-09-24T00:00:00.000Z' };
}
function memoryDeps({ registryEntries = {}, chartShapeIds = [] } = {}) {
  let registry = { schema_version: 1, entries: { ...registryEntries } };
  const removeCalls = []; const drawCalls = []; let nextId = 1;
  return {
    _deps: {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: chartShapeIds.length, shapes: chartShapeIds.map((id) => ({ id, name: 'horizontal_line' })) }),
      drawShape: async () => { const id = `new_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; },
      now: () => new Date('2026-09-25T00:00:00.000Z'),
    },
    getRegistry: () => registry, removeCalls, drawCalls,
  };
}

const current5m = intent({ role: 'nearest_support', timeframe: '5m' });
const REGISTRY = {
  [`${SYMBOL}|15m|breakout_level|0`]: entry({ role: 'breakout_level', timeframe: '15m', entityId: 'old15_a' }),
  [`${SYMBOL}|15m|plan_zone|0`]: entry({ role: 'plan_zone', timeframe: '15m', entityId: 'old15_b' }),
  [`${SYMBOL}|15m|chart_nearest_support|0`]: entry({ role: 'chart_nearest_support', timeframe: '15m', entityId: 'chart15' }),
  [`${SYMBOL}|5m|nearest_support|0`]: entry({ role: 'nearest_support', timeframe: '5m', entityId: 'cur5', matchingIntent: current5m }),
  [`${SYMBOL}|5m|status_box|0`]: entry({ role: 'status_box', timeframe: '5m', entityId: 'old5_gone' }),
  [`${OTHER}|15m|breakout_level|0`]: entry({ role: 'breakout_level', timeframe: '15m', entityId: 'silver15', symbol: OTHER }),
};
const ON_CHART = ['old15_a', 'old15_b', 'chart15', 'cur5', 'silver15'];

describe('visualizer: symbol-scoped stale cleanup after a decision-timeframe switch', () => {
  it('1. obsolete same-symbol 15m planner drawings are removed by the current 5m plan', async () => {
    const m = memoryDeps({ registryEntries: REGISTRY, chartShapeIds: ON_CHART });
    const r = await reconcileVisualization({ intents: [current5m], symbol: SYMBOL, timeframe: '5m', ownsRole: ownsDecisionRole, cleanupScope: 'symbol', _deps: m._deps });
    assert.deepEqual(m.removeCalls.sort(), ['old15_a', 'old15_b']);
    const reg = m.getRegistry().entries;
    assert.equal(reg[`${SYMBOL}|15m|breakout_level|0`], undefined);
    assert.equal(reg[`${SYMBOL}|15m|plan_zone|0`], undefined);
    assert.ok(r.plan.some((s) => s.action === 'DROP_STALE_REGISTRY' && s.entity_id === 'old5_gone'), 'a 5m entry whose drawing already vanished is dropped from bookkeeping');
  });
  it('2. valid current 5m drawings remain (KEEP, never removed, never recreated)', async () => {
    const m = memoryDeps({ registryEntries: REGISTRY, chartShapeIds: ON_CHART });
    const r = await reconcileVisualization({ intents: [current5m], symbol: SYMBOL, timeframe: '5m', ownsRole: ownsDecisionRole, cleanupScope: 'symbol', _deps: m._deps });
    assert.ok(r.plan.some((s) => s.action === 'KEEP' && s.entity_id === 'cur5'));
    assert.ok(!m.removeCalls.includes('cur5'));
    assert.equal(m.drawCalls.length, 0);
    assert.equal(m.getRegistry().entries[`${SYMBOL}|5m|nearest_support|0`].entity_id, 'cur5');
  });
  it('3. another symbol and another caller\'s chart_* roles are untouched', async () => {
    const m = memoryDeps({ registryEntries: REGISTRY, chartShapeIds: ON_CHART });
    const r = await reconcileVisualization({ intents: [current5m], symbol: SYMBOL, timeframe: '5m', ownsRole: ownsDecisionRole, cleanupScope: 'symbol', _deps: m._deps });
    assert.ok(!m.removeCalls.includes('silver15'));
    assert.ok(!m.removeCalls.includes('chart15'));
    assert.ok(!r.plan.some((s) => s.entity_id === 'silver15' || s.entity_id === 'chart15'), 'never even mentioned in the plan');
    assert.equal(m.getRegistry().entries[`${OTHER}|15m|breakout_level|0`].entity_id, 'silver15');
    assert.equal(m.getRegistry().entries[`${SYMBOL}|15m|chart_nearest_support|0`].entity_id, 'chart15');
  });
  it('default cleanupScope stays timeframe-bounded (byte-identical to the pre-fix behaviour)', () => {
    const plan = buildReconciliationPlan({ desiredIntents: [current5m], registry: { entries: REGISTRY }, symbol: SYMBOL, timeframe: '5m', currentChartIds: new Set(ON_CHART), ownsRole: ownsDecisionRole });
    assert.ok(!plan.some((s) => s.entity_id === 'old15_a' || s.entity_id === 'old15_b'), '15m entries are outside a timeframe-scoped cleanup');
  });
});
