/**
 * src/core/xauusd_visualize.js's `ownsRole` ownership-domain scoping --
 * surgical fix for a real, live-proof-discovered defect (see
 * docs/XAUUSD_LIVE_RUNTIME.md §14): when the active chart timeframe
 * equals the decision timeframe, decision-TF visualization
 * (src/core/xauusd_visualize_market.js) and active-chart-TF-local
 * visualization (src/core/xauusd_visualize_chart_context.js) share the
 * identical (symbol, timeframe) registry scope. Before this fix, either
 * reconciliation's stale-cleanup pass would delete the OTHER's still-
 * valid, still-desired drawings, since Stage 4's cleanup only ever
 * scoped by (symbol, timeframe), never by which caller actually owns a
 * role.
 *
 * These tests reproduce the exact live defect deterministically, then
 * prove the fix: a caller's stale-cleanup pass now NEVER inspects,
 * stages, or reports a registered role outside its own declared
 * ownership domain -- while still being able to legitimately clean up
 * ITS OWN stale roles exactly as before.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileVisualization, buildReconciliationPlan } from '../src/core/xauusd_visualize.js';
import { makeDrawingIntent } from '../src/engine/visualization.js';
import { CHART_LOCAL_ROLE_PREFIX } from '../src/engine/marketVisualization.js';
import { computeIntentSignature } from '../src/engine/drawingRegistry.js';

const SYMBOL = 'OANDA:XAUUSD';
const TF_15M = '15m';
const TF_4H = '4H';

const ownsDecisionRole = (role) => typeof role === 'string' && !role.startsWith(CHART_LOCAL_ROLE_PREFIX);
const ownsChartRole = (role) => typeof role === 'string' && role.startsWith(CHART_LOCAL_ROLE_PREFIX);

function intent(overrides = {}) {
  return makeDrawingIntent({
    role: 'nearest_support', primitive: 'horizontal_line', point: { time: 1700000000, price: 2000 },
    symbol: SYMBOL, timeframe: TF_15M,
    ...overrides,
  });
}

function registeredEntry({ role, timeframe = TF_15M, entityId, matchingIntent = null }) {
  const intent_signature = matchingIntent ? computeIntentSignature(matchingIntent) : 'sig';
  return { role, entity_id: entityId, symbol: SYMBOL, timeframe, primitive: 'horizontal_line', intent_signature, created_at: '2025-01-01T00:00:00.000Z' };
}

function memoryDeps({ registryEntries = {}, chartShapeIds = [], drawShapeImpl = null, removeOneImpl = null } = {}) {
  let registry = { schema_version: 1, entries: { ...registryEntries } };
  const drawCalls = [];
  const removeCalls = [];
  let nextId = 1;
  return {
    _deps: {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: chartShapeIds.length, shapes: chartShapeIds.map((id) => ({ id, name: 'horizontal_line' })) }),
      drawShape: drawShapeImpl ?? (async () => { const id = `new_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; }),
      removeOne: removeOneImpl ?? (async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; }),
      now: () => new Date('2025-01-01T00:00:00.000Z'),
    },
    getRegistry: () => registry,
    drawCalls, removeCalls,
  };
}

describe('cross-scope drawing ownership: backward compatibility (ownsRole defaults to "owns everything")', () => {
  it('omitting ownsRole behaves byte-identical to the pre-fix implementation', () => {
    const registry = {
      entries: {
        [`${SYMBOL}|${TF_15M}|nearest_support|0`]: registeredEntry({ role: 'nearest_support', entityId: 'e1' }),
      },
    };
    const currentChartIds = new Set(['e1']);
    const plan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action, 'REMOVE_REGISTERED');
  });
});

describe('cross-scope drawing ownership: SAME-TF 15m regression (reproduces the exact live defect)', () => {
  function seedRegistry() {
    return {
      entries: {
        [`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`]: registeredEntry({ role: 'plan_candidate_zone', entityId: 'plan_zone_1' }),
        [`${SYMBOL}|${TF_15M}|plan_provisional_invalidation|0`]: registeredEntry({ role: 'plan_provisional_invalidation', entityId: 'plan_inv_1' }),
        [`${SYMBOL}|${TF_15M}|structure_primary|0`]: registeredEntry({ role: 'structure_primary', entityId: 'struct_1' }),
        [`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`]: registeredEntry({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, entityId: 'chart_struct_1' }),
        [`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}sr_support|0`]: registeredEntry({ role: `${CHART_LOCAL_ROLE_PREFIX}sr_support`, entityId: 'chart_sr_1' }),
      },
    };
  }
  const allCurrentIds = new Set(['plan_zone_1', 'plan_inv_1', 'struct_1', 'chart_struct_1', 'chart_sr_1']);

  it('chart-local reconciliation (desired: only chart_structure_primary) never touches plan_*/structure_primary, and legitimately removes its OWN stale chart_sr_support', () => {
    const registry = seedRegistry();
    const desiredIntents = [intent({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, price: 2050 })];
    const plan = buildReconciliationPlan({ desiredIntents, registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds: allCurrentIds, ownsRole: ownsChartRole });

    const byRole = Object.fromEntries(plan.map((s) => [s.role, s.action]));
    assert.equal(byRole['plan_candidate_zone'], undefined, 'plan_candidate_zone must not even appear in the plan');
    assert.equal(byRole['plan_provisional_invalidation'], undefined);
    assert.equal(byRole['structure_primary'], undefined);
    assert.equal(byRole[`${CHART_LOCAL_ROLE_PREFIX}sr_support`], 'REMOVE_REGISTERED', 'legitimately stale chart_ role, IN the chart-local domain, must still be cleaned up');
  });

  it('decision/market reconciliation (desired: plan_candidate_zone + structure_primary) never touches chart_*, and legitimately removes its OWN stale plan_provisional_invalidation', () => {
    const registry = seedRegistry();
    const desiredIntents = [
      intent({ role: 'plan_candidate_zone', price: 2010 }),
      intent({ role: 'structure_primary', price: 2020 }),
    ];
    const plan = buildReconciliationPlan({ desiredIntents, registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds: allCurrentIds, ownsRole: ownsDecisionRole });

    const byRole = Object.fromEntries(plan.map((s) => [s.role, s.action]));
    assert.equal(byRole[`${CHART_LOCAL_ROLE_PREFIX}structure_primary`], undefined, 'chart_structure_primary must not even appear in the plan');
    assert.equal(byRole[`${CHART_LOCAL_ROLE_PREFIX}sr_support`], undefined);
    assert.equal(byRole['plan_provisional_invalidation'], 'REMOVE_REGISTERED', 'legitimately stale decision role, IN the decision domain, must still be cleaned up');
  });

  it('end-to-end execution: chart-local reconciliation never calls removeOne on a decision-owned entity_id', async () => {
    const deps = memoryDeps({ registryEntries: seedRegistry().entries, chartShapeIds: [...allCurrentIds] });
    const desiredIntents = [intent({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, price: 2050 })];
    await reconcileVisualization({ intents: desiredIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsChartRole, _deps: deps._deps });

    assert.ok(!deps.removeCalls.includes('plan_zone_1'));
    assert.ok(!deps.removeCalls.includes('plan_inv_1'));
    assert.ok(!deps.removeCalls.includes('struct_1'));
    // Its own stale chart_sr_support IS legitimately removed.
    assert.ok(deps.removeCalls.includes('chart_sr_1'));
    const finalRegistry = deps.getRegistry();
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`], 'plan_candidate_zone entry survives in the registry');
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|structure_primary|0`], 'structure_primary entry survives in the registry');
  });

  it('end-to-end execution: decision reconciliation never calls removeOne on a chart-owned entity_id', async () => {
    const deps = memoryDeps({ registryEntries: seedRegistry().entries, chartShapeIds: [...allCurrentIds] });
    const desiredIntents = [intent({ role: 'plan_candidate_zone', price: 2010 }), intent({ role: 'structure_primary', price: 2020 })];
    await reconcileVisualization({ intents: desiredIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsDecisionRole, _deps: deps._deps });

    assert.ok(!deps.removeCalls.includes('chart_struct_1'));
    assert.ok(!deps.removeCalls.includes('chart_sr_1'));
    assert.ok(deps.removeCalls.includes('plan_inv_1'), 'its own stale plan_provisional_invalidation IS legitimately removed');
    const finalRegistry = deps.getRegistry();
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`], 'chart_structure_primary entry survives');
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}sr_support|0`], 'chart_sr_support entry survives');
  });
});

describe('cross-scope drawing ownership: different-TF regression (existing behavior unaffected)', () => {
  it('decision TF (15m) and active chart TF (4H) never share a registry scope at all -- scopedKeys() already isolates them, independent of ownsRole', () => {
    const registry = {
      entries: {
        [`${SYMBOL}|${TF_15M}|structure_primary|0`]: registeredEntry({ role: 'structure_primary', timeframe: TF_15M, entityId: 'struct_15m' }),
        [`${SYMBOL}|${TF_4H}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`]: registeredEntry({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, timeframe: TF_4H, entityId: 'chart_struct_4h' }),
      },
    };
    const currentChartIds = new Set(['struct_15m', 'chart_struct_4h']);

    // Chart-local reconciliation scoped to 4H must never even look at the 15m decision entry.
    const chartPlan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: SYMBOL, timeframe: TF_4H, currentChartIds, ownsRole: ownsChartRole });
    assert.ok(chartPlan.every((s) => s.role !== 'structure_primary'));

    // Decision reconciliation scoped to 15m must never even look at the 4H chart-local entry.
    const decisionPlan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsDecisionRole });
    assert.ok(decisionPlan.every((s) => s.role !== `${CHART_LOCAL_ROLE_PREFIX}structure_primary`));
  });
});

describe('cross-scope drawing ownership: plan lifecycle regression -- fix must not make plan drawings immortal', () => {
  it('a legitimately stale plan_* role (NO_PLAN / superseded) is still removed by the decision reconciliation\'s OWN cleanup', () => {
    const registry = {
      entries: {
        [`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`]: registeredEntry({ role: 'plan_candidate_zone', entityId: 'plan_zone_1' }),
        [`${SYMBOL}|${TF_15M}|plan_provisional_invalidation|0`]: registeredEntry({ role: 'plan_provisional_invalidation', entityId: 'plan_inv_1' }),
        [`${SYMBOL}|${TF_15M}|structure_primary|0`]: registeredEntry({ role: 'structure_primary', entityId: 'struct_1', matchingIntent: intent({ role: 'structure_primary', price: 2020 }) }),
      },
    };
    const currentChartIds = new Set(['plan_zone_1', 'plan_inv_1', 'struct_1']);
    // Cycle 2: pre_entry_plan became NO_PLAN -- only structure_primary remains desired.
    const desiredIntents = [intent({ role: 'structure_primary', price: 2020 })];
    const plan = buildReconciliationPlan({ desiredIntents, registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsDecisionRole });

    const byRole = Object.fromEntries(plan.map((s) => [s.role, s.action]));
    assert.equal(byRole['plan_candidate_zone'], 'REMOVE_REGISTERED');
    assert.equal(byRole['plan_provisional_invalidation'], 'REMOVE_REGISTERED');
    assert.equal(byRole['structure_primary'], 'KEEP');
  });
});

describe('cross-scope drawing ownership: confirmed trade regression', () => {
  it('confirmed trade roles replace plan_* roles via the decision reconciliation\'s own cleanup; chart-local reconciliation never touches trade_* roles', () => {
    const registry = {
      entries: {
        [`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`]: registeredEntry({ role: 'plan_candidate_zone', entityId: 'plan_zone_1' }),
        [`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`]: registeredEntry({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, entityId: 'chart_struct_1', matchingIntent: intent({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, price: 2050 }) }),
      },
    };
    const currentChartIds = new Set(['plan_zone_1', 'chart_struct_1', 'trade_entry_1']);
    const decisionDesired = [intent({ role: 'trade_entry', price: 2005 })];
    registry.entries[`${SYMBOL}|${TF_15M}|trade_entry|0`] = registeredEntry({ role: 'trade_entry', entityId: 'trade_entry_1', matchingIntent: decisionDesired[0] });

    // Decision domain: pre_entry_plan superseded by a confirmed trade -- only trade_entry desired now.
    const decisionPlan = buildReconciliationPlan({ desiredIntents: decisionDesired, registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsDecisionRole });
    const decisionByRole = Object.fromEntries(decisionPlan.map((s) => [s.role, s.action]));
    assert.equal(decisionByRole['plan_candidate_zone'], 'REMOVE_REGISTERED');
    assert.equal(decisionByRole['trade_entry'], 'KEEP');
    assert.equal(decisionByRole[`${CHART_LOCAL_ROLE_PREFIX}structure_primary`], undefined);

    // Chart-local domain: must never touch trade_entry even though it's in the same (symbol, timeframe) scope.
    const chartDesired = [intent({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, price: 2050 })];
    const chartPlan = buildReconciliationPlan({ desiredIntents: chartDesired, registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsChartRole });
    const chartByRole = Object.fromEntries(chartPlan.map((s) => [s.role, s.action]));
    assert.equal(chartByRole['trade_entry'], undefined);
    assert.equal(chartByRole[`${CHART_LOCAL_ROLE_PREFIX}structure_primary`], 'KEEP');
  });
});

describe('cross-scope drawing ownership: unknown/user drawing preserved', () => {
  it('an unregistered chart shape is invisible to both ownership domains -- never staged for removal by either', () => {
    const registry = {
      entries: {
        [`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`]: registeredEntry({ role: 'plan_candidate_zone', entityId: 'plan_zone_1' }),
        [`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`]: registeredEntry({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, entityId: 'chart_struct_1' }),
      },
    };
    // 'user_drawing_1' is on the chart but was never registered by anything.
    const currentChartIds = new Set(['plan_zone_1', 'chart_struct_1', 'user_drawing_1']);

    const decisionPlan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsDecisionRole });
    const chartPlan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: SYMBOL, timeframe: TF_15M, currentChartIds, ownsRole: ownsChartRole });
    assert.ok(decisionPlan.every((s) => s.entity_id !== 'user_drawing_1'));
    assert.ok(chartPlan.every((s) => s.entity_id !== 'user_drawing_1'));
  });
});

describe('cross-scope drawing ownership: watcher decision->chart same-TF sequence', () => {
  it('running decision reconciliation THEN chart-local reconciliation (as the watcher tick does) leaves every role from both domains intact', async () => {
    const deps = memoryDeps({ chartShapeIds: [] });

    const decisionIntents = [intent({ role: 'plan_candidate_zone', price: 2010 }), intent({ role: 'structure_primary', price: 2020 })];
    const r1 = await reconcileVisualization({ intents: decisionIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsDecisionRole, _deps: deps._deps });
    const decisionIds = r1.executed.filter((s) => s.applied && s.entity_id).map((s) => s.entity_id);
    deps._deps.listDrawings = async () => ({ success: true, count: decisionIds.length, shapes: decisionIds.map((id) => ({ id, name: 'horizontal_line' })) });

    const chartIntents = [intent({ role: `${CHART_LOCAL_ROLE_PREFIX}structure_primary`, price: 2050 })];
    const r2 = await reconcileVisualization({ intents: chartIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsChartRole, _deps: deps._deps });
    const chartIds = r2.executed.filter((s) => s.applied && s.entity_id).map((s) => s.entity_id);

    const finalRegistry = deps.getRegistry();
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|plan_candidate_zone|0`], 'decision role survives the chart-local cycle that ran after it');
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|structure_primary|0`]);
    assert.ok(finalRegistry.entries[`${SYMBOL}|${TF_15M}|${CHART_LOCAL_ROLE_PREFIX}structure_primary|0`]);

    // Repeat the UNCHANGED cycle for both -- must be 100% KEEP, zero churn.
    deps._deps.listDrawings = async () => ({ success: true, count: decisionIds.length + chartIds.length, shapes: [...decisionIds, ...chartIds].map((id) => ({ id, name: 'horizontal_line' })) });
    const r1b = await reconcileVisualization({ intents: decisionIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsDecisionRole, _deps: deps._deps });
    const r2b = await reconcileVisualization({ intents: chartIntents, symbol: SYMBOL, timeframe: TF_15M, dryRun: false, ownsRole: ownsChartRole, _deps: deps._deps });
    assert.ok(r1b.executed.every((s) => s.action === 'KEEP'));
    assert.ok(r2b.executed.every((s) => s.action === 'KEEP'));
  });
});
