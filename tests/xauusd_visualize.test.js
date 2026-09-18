/**
 * src/core/xauusd_visualize.js -- Stage 4 safe drawing orchestrator.
 * Proves: the ownership registry is the ONLY authority for removal, an
 * unknown entity is never touched, draw_clear/removeAllShapes are never
 * called or even referenced, dry-run performs zero mutation calls,
 * fail-soft crash safety on remove/create/persist failures, and the
 * orchestrator has no dependency on the decision/anticipation/confluence
 * stack or on CDP OHLCV/timeframe reads.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileVisualization, buildReconciliationPlan, PLAN_ACTIONS } from '../src/core/xauusd_visualize.js';
import { makeDrawingIntent } from '../src/engine/visualization.js';
import { computeIntentSignature, DEFAULT_REGISTRY_PATH } from '../src/engine/drawingRegistry.js';
import { PROHIBITED_MUTATING_TOOLS, APPROVED_RESEARCH_TOOLS, APPROVED_DEVELOPMENT_EXTRA_TOOLS } from '../src/profiles.js';

function intent(overrides = {}) {
  return makeDrawingIntent({
    role: 'nearest_support', primitive: 'horizontal_line', point: { time: 1700000000, price: 2000 },
    symbol: 'OANDA:XAUUSD', timeframe: '15m',
    ...overrides,
  });
}

function memoryDeps({ registryEntries = {}, chartShapeIds = [], drawShapeImpl = null, removeOneImpl = null } = {}) {
  let registry = { schema_version: 1, entries: { ...registryEntries } };
  const drawCalls = [];
  const removeCalls = [];
  const listCalls = [];
  const saveCalls = [];
  let nextId = 1;
  return {
    _deps: {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { saveCalls.push(1); registry = r; },
      listDrawings: async () => { listCalls.push(1); return { success: true, count: chartShapeIds.length, shapes: chartShapeIds.map((id) => ({ id, name: 'horizontal_line' })) }; },
      drawShape: drawShapeImpl ?? (async () => { const id = `new_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; }),
      removeOne: removeOneImpl ?? (async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; }),
      now: () => new Date('2025-01-01T00:00:00.000Z'),
    },
    getRegistry: () => registry,
    drawCalls, removeCalls, listCalls, saveCalls,
  };
}

/** Strips block/line comments so a source-audit regex checks actual CODE, never prose in a doc comment explaining what the module does NOT do (this module's own header deliberately documents the hard safety rule by name). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('xauusd_visualize: source audit -- no decision engine, no CDP mutation shortcuts', () => {
  it('never imports xauusd_calculate.js, anticipation.js, confluence.js, or core/chart.js|data.js', () => {
    const code = stripComments(readFileSync(new URL('../src/core/xauusd_visualize.js', import.meta.url), 'utf8'));
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(code));
    assert.ok(!/from ['"].*\/anticipation\.js['"]/.test(code));
    assert.ok(!/from ['"].*confluence\.js['"]/.test(code));
    assert.ok(!/from ['"].*core\/chart\.js['"]/.test(code));
    assert.ok(!/from ['"].*core\/data\.js['"]/.test(code));
  });

  it('NEVER calls clearAll/removeAllShapes/draw_clear in actual code (comments explaining the invariant are allowed to name them)', () => {
    const code = stripComments(readFileSync(new URL('../src/core/xauusd_visualize.js', import.meta.url), 'utf8'));
    assert.ok(!/removeAllShapes/.test(code));
    assert.ok(!/clearAll/.test(code));
    assert.ok(!/draw_clear/.test(code));
  });

  it('the same hard rule holds for the registry and visualization schema modules', () => {
    for (const file of ['../src/engine/drawingRegistry.js', '../src/engine/visualization.js']) {
      const code = stripComments(readFileSync(new URL(file, import.meta.url), 'utf8'));
      assert.ok(!/removeAllShapes/.test(code));
      assert.ok(!/clearAll/.test(code));
      assert.ok(!/draw_clear/.test(code));
    }
  });
});

describe('xauusd_visualize: profile capability boundary (status quo, unmodified in Stage 4)', () => {
  it('draw_clear remains excluded from every XAUUSD profile allowlist', () => {
    assert.ok(!APPROVED_RESEARCH_TOOLS.includes('draw_clear'));
    assert.ok(!APPROVED_DEVELOPMENT_EXTRA_TOOLS.includes('draw_clear'));
    assert.ok(PROHIBITED_MUTATING_TOOLS.includes('draw_clear'));
  });

  it('no drawing tool at all is currently exposed by either XAUUSD profile (Stage 4 did not change this)', () => {
    const drawingTools = ['draw_shape', 'draw_list', 'draw_remove_one', 'draw_get_properties', 'draw_clear'];
    for (const t of drawingTools) {
      assert.ok(!APPROVED_RESEARCH_TOOLS.includes(t), `${t} must not be in APPROVED_RESEARCH_TOOLS`);
      assert.ok(!APPROVED_DEVELOPMENT_EXTRA_TOOLS.includes(t), `${t} must not be in APPROVED_DEVELOPMENT_EXTRA_TOOLS`);
    }
  });
});

describe('xauusd_visualize: registry runtime path', () => {
  it('DEFAULT_REGISTRY_PATH lives under the already-gitignored state/ directory', () => {
    assert.ok(/[\\/]state[\\/]/.test(DEFAULT_REGISTRY_PATH), `expected a state/ path, got ${DEFAULT_REGISTRY_PATH}`);
  });
});

describe('xauusd_visualize: plan building -- role -> entity ownership', () => {
  it('a brand-new role produces CREATE', () => {
    const plan = buildReconciliationPlan({ desiredIntents: [intent()], registry: { entries: {} }, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set() });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].action, 'CREATE');
  });

  it('an unchanged, still-present registered intent is KEEP', () => {
    const i = intent();
    const key = 'OANDA:XAUUSD|15m|nearest_support|0';
    const registry = { entries: { [key]: { role: 'nearest_support', entity_id: 'existing_1', intent_signature: computeIntentSignature(i) } } };
    const plan = buildReconciliationPlan({ desiredIntents: [i], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['existing_1']) });
    assert.deepEqual(plan, [{ action: 'KEEP', key, role: 'nearest_support', entity_id: 'existing_1' }]);
  });
});

describe('xauusd_visualize: plan building -- change/staleness detection', () => {
  it('a changed intent for an existing role produces REMOVE_REGISTERED then CREATE', () => {
    const key = 'OANDA:XAUUSD|15m|nearest_support|0';
    const registry = { entries: { [key]: { role: 'nearest_support', entity_id: 'existing_1', intent_signature: computeIntentSignature(intent()) } } };
    const changed = intent({ point: { time: 1700000000, price: 2050 } }); // different price -> different signature
    const plan = buildReconciliationPlan({ desiredIntents: [changed], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['existing_1']) });
    assert.deepEqual(plan.map((s) => s.action), ['REMOVE_REGISTERED', 'CREATE']);
    assert.equal(plan[0].entity_id, 'existing_1');
  });

  it('a registered entity no longer present on the chart produces DROP_STALE_REGISTRY then CREATE -- never a similarity-based deletion of something else', () => {
    const i = intent();
    const key = 'OANDA:XAUUSD|15m|nearest_support|0';
    const registry = { entries: { [key]: { role: 'nearest_support', entity_id: 'gone_1', intent_signature: computeIntentSignature(i) } } };
    // currentChartIds does NOT contain 'gone_1' -- but DOES contain an unrelated ID
    // that happens to be a horizontal_line too; it must never be treated as a match.
    const plan = buildReconciliationPlan({ desiredIntents: [i], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['some_unrelated_user_drawing']) });
    assert.deepEqual(plan.map((s) => s.action), ['DROP_STALE_REGISTRY', 'CREATE']);
    assert.equal(plan[0].entity_id, 'gone_1');
  });

  it('a registered role no longer in the desired intents, but still on the chart, is an obsolete REMOVE_REGISTERED', () => {
    const key = 'OANDA:XAUUSD|15m|nearest_resistance|0';
    const registry = { entries: { [key]: { role: 'nearest_resistance', entity_id: 'obsolete_1' } } };
    const plan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['obsolete_1']) });
    assert.deepEqual(plan, [{ action: 'REMOVE_REGISTERED', key, role: 'nearest_resistance', entity_id: 'obsolete_1' }]);
  });

  it('a registered obsolete role that is ALSO already gone from the chart is DROP_STALE_REGISTRY, not REMOVE_REGISTERED', () => {
    const key = 'OANDA:XAUUSD|15m|nearest_resistance|0';
    const registry = { entries: { [key]: { role: 'nearest_resistance', entity_id: 'obsolete_gone_1' } } };
    const plan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set() });
    assert.deepEqual(plan, [{ action: 'DROP_STALE_REGISTRY', key, role: 'nearest_resistance', entity_id: 'obsolete_gone_1' }]);
  });

  it('never touches a registered entry for a DIFFERENT symbol/timeframe scope', () => {
    const otherKey = 'OANDA:EURUSD|15m|nearest_resistance|0';
    const registry = { entries: { [otherKey]: { role: 'nearest_resistance', entity_id: 'other_scope_1' } } };
    const plan = buildReconciliationPlan({ desiredIntents: [], registry, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['other_scope_1']) });
    assert.deepEqual(plan, []);
  });

  it('an unknown entity (not in the registry at all) is never a candidate for removal', () => {
    const plan = buildReconciliationPlan({ desiredIntents: [], registry: { entries: {} }, symbol: 'OANDA:XAUUSD', timeframe: '15m', currentChartIds: new Set(['some_random_user_drawing_123']) });
    assert.deepEqual(plan, []); // nothing registered -> nothing to reconcile, regardless of what exists on the chart
  });

  it('PLAN_ACTIONS enumerates exactly the vocabulary used', () => {
    assert.deepEqual([...PLAN_ACTIONS].sort(), ['CREATE', 'DROP_STALE_REGISTRY', 'KEEP', 'REMOVE_REGISTERED', 'SKIP_INVALID'].sort());
  });
});

describe('xauusd_visualize: dry-run performs ZERO mutation calls', () => {
  it('dry-run reads (listDrawings) but never calls drawShape, removeOne, or saveRegistry', async () => {
    const { _deps, drawCalls, removeCalls, saveCalls, listCalls } = memoryDeps({ chartShapeIds: ['x1'] });
    const result = await reconcileVisualization({ intents: [intent()], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: true, _deps });
    assert.equal(result.dry_run, true);
    assert.ok(result.plan.length > 0);
    assert.equal(result.executed.length, 0);
    assert.equal(drawCalls.length, 0);
    assert.equal(removeCalls.length, 0);
    assert.equal(saveCalls.length, 0);
    assert.equal(listCalls.length, 1); // exactly one read-only listDrawings call
  });
});

describe('xauusd_visualize: real execution -- ownership-safe create/remove', () => {
  it('creates a new drawing for a brand-new role and registers its entity_id', async () => {
    const { _deps, drawCalls, getRegistry } = memoryDeps();
    const result = await reconcileVisualization({ intents: [intent()], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.equal(result.dry_run, false);
    assert.equal(drawCalls.length, 1);
    const key = 'OANDA:XAUUSD|15m|nearest_support|0';
    assert.ok(getRegistry().entries[key]);
    assert.equal(getRegistry().entries[key].entity_id, drawCalls[0]);
  });

  it('removes ONLY the exact registered entity for an obsolete role -- no other entity is touched', async () => {
    const key = 'OANDA:XAUUSD|15m|nearest_resistance|0';
    const { _deps, removeCalls, getRegistry } = memoryDeps({ registryEntries: { [key]: { role: 'nearest_resistance', entity_id: 'obsolete_1' } }, chartShapeIds: ['obsolete_1', 'user_drawing_A', 'user_drawing_B'] });
    const result = await reconcileVisualization({ intents: [], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.deepEqual(removeCalls, ['obsolete_1']);
    assert.equal(getRegistry().entries[key], undefined);
    assert.equal(result.executed[0].applied, true);
  });

  it('a failed removeOne is fail-soft: no cascade, entry left in the registry, no other call made', async () => {
    const key = 'OANDA:XAUUSD|15m|nearest_resistance|0';
    const { _deps, getRegistry, removeCalls } = memoryDeps({
      registryEntries: { [key]: { role: 'nearest_resistance', entity_id: 'flaky_1' } },
      chartShapeIds: ['flaky_1'],
      removeOneImpl: async () => { throw new Error('Shape not found: flaky_1'); },
    });
    const result = await reconcileVisualization({ intents: [], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.equal(removeCalls.length, 0); // the mock itself throws before recording -- confirm via registry instead
    assert.ok(getRegistry().entries[key]); // ownership NOT lost on an ambiguous failure
    assert.equal(result.executed[0].applied, false);
    assert.ok(result.warnings.some((w) => w.includes('removeOne failed')));
  });

  it('a failed drawShape never corrupts the registry', async () => {
    const { _deps, getRegistry } = memoryDeps({ drawShapeImpl: async () => { throw new Error('CDP timeout'); } });
    const result = await reconcileVisualization({ intents: [intent()], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.deepEqual(getRegistry().entries, {});
    assert.equal(result.executed[0].applied, false);
  });

  it('drawShape returning no discoverable entity_id is never registered', async () => {
    const { _deps, getRegistry } = memoryDeps({ drawShapeImpl: async () => ({ success: true, entity_id: null }) });
    const result = await reconcileVisualization({ intents: [intent()], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.deepEqual(getRegistry().entries, {});
    assert.equal(result.executed[0].error, 'NO_ENTITY_ID_DISCOVERED');
  });

  it('a registry save failure after a successful create surfaces an explicit ORPHAN RISK warning and halts further mutation this cycle', async () => {
    let saveAttempts = 0;
    const { _deps, drawCalls } = memoryDeps();
    _deps.saveRegistry = () => { saveAttempts += 1; throw new Error('disk full'); };
    const twoIntents = [intent({ role: 'nearest_support' }), intent({ role: 'nearest_resistance', point: { time: 1700000000, price: 2100 } })];
    const result = await reconcileVisualization({ intents: twoIntents, symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.equal(drawCalls.length, 1); // second CREATE never attempted after the halt
    assert.equal(saveAttempts, 1);
    assert.ok(result.warnings.some((w) => w.includes('ORPHAN RISK')));
    assert.equal(result.executed[0].orphaned, true);
    assert.equal(result.executed[1].skipped, true);
  });

  it('listDrawings failure changes nothing rather than guessing every registered entity is stale', async () => {
    const key = 'OANDA:XAUUSD|15m|nearest_resistance|0';
    const { _deps, removeCalls, getRegistry } = memoryDeps({ registryEntries: { [key]: { role: 'nearest_resistance', entity_id: 'real_1' } } });
    _deps.listDrawings = async () => { throw new Error('CDP unreachable'); };
    const result = await reconcileVisualization({ intents: [], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.equal(result.plan.length, 0);
    assert.equal(removeCalls.length, 0);
    assert.ok(getRegistry().entries[key]); // untouched
    assert.ok(result.warnings.some((w) => w.includes('draw_list failed')));
  });
});

describe('xauusd_visualize: unchanged intent is kept, not delete/recreated', () => {
  it('a KEEP step never calls drawShape or removeOne', async () => {
    const i = intent();
    const key = 'OANDA:XAUUSD|15m|nearest_support|0';
    const { _deps, drawCalls, removeCalls, saveCalls } = memoryDeps({
      registryEntries: { [key]: { role: 'nearest_support', entity_id: 'stable_1', intent_signature: computeIntentSignature(i) } },
      chartShapeIds: ['stable_1'],
    });
    const result = await reconcileVisualization({ intents: [i], symbol: 'OANDA:XAUUSD', timeframe: '15m', dryRun: false, _deps });
    assert.equal(drawCalls.length, 0);
    assert.equal(removeCalls.length, 0);
    assert.equal(saveCalls.length, 0); // KEEP performs no persistence write at all
    assert.equal(result.executed[0].action, 'KEEP');
    assert.equal(result.executed[0].applied, true);
  });
});
