/**
 * Stage 4 — safe drawing orchestrator.
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. It receives
 * ALREADY-COMPUTED visualization intents (src/engine/visualization.js's
 * schema) and reconciles them against the MCP-owned drawing registry
 * (src/engine/drawingRegistry.js). It never imports
 * src/core/xauusd_calculate.js, src/engine/anticipation.js, or
 * src/engine/confluence.js -- it cannot call calculateEntry(), fetch
 * OHLCV, run a 10-TF sweep, or alter the decision/anticipation/confluence
 * outputs, because it never references them at all.
 *
 * HARD SAFETY RULE: this module NEVER calls, imports, or references
 * clearAll()/removeAllShapes()/draw_clear, and never will. The ONLY
 * removal primitive used anywhere in this file is `removeOne`, and it is
 * ALWAYS called with an `entity_id` that this module's OWN registry
 * already recorded as MCP-owned -- never inferred from shape type,
 * coordinates, text similarity, or proximity to a computed level. An
 * entity_id absent from the registry is NEVER removed, full stop.
 *
 * Reconciliation is a two-phase PLAN + EXECUTE design (mission Part 12):
 * `buildReconciliationPlan()` is pure and read-only (given the registry
 * and the current chart's actual entity IDs, from one `listDrawings()`
 * call) and can be used standalone for a mutation-free dry-run preview.
 * `reconcileVisualization({dryRun:false})` executes that SAME plan,
 * fail-soft per step -- a failed remove/create never cascades into a
 * global clear or touches any other entity, and a registry persistence
 * failure halts further mutation for the rest of that cycle rather than
 * risk an inconsistent ownership record (see the CREATE branch below for
 * the one unavoidable orphan-drawing risk this can still leave, which is
 * surfaced in `warnings`, never hidden).
 *
 * OWNERSHIP-DOMAIN SCOPING (`ownsRole`, additive): two INDEPENDENT
 * callers can share the identical (symbol, timeframe) registry scope --
 * this happens for real whenever the user's active chart timeframe
 * equals the decision timeframe, since decision-TF visualization
 * (src/core/xauusd_visualize_market.js) and active-chart-TF-local
 * visualization (src/core/xauusd_visualize_chart_context.js) both then
 * reconcile against `OANDA:XAUUSD|15m|...` keys. Without a way to say
 * "which registered roles are even mine to judge," each caller's own
 * stale-cleanup pass would see the OTHER caller's still-valid, still-
 * desired roles as "not in my desired set" and remove them -- a real
 * defect found via live proof (see docs/XAUUSD_LIVE_RUNTIME.md §14). The
 * optional `ownsRole(role) => boolean` predicate bounds the stale-
 * cleanup pass to ONLY the caller's own declared domain; a registered
 * role outside that domain is never inspected, staged, or reported --
 * see `buildReconciliationPlan()`'s own doc comment for the exact
 * mechanics. Defaults to "owns everything," so every pre-existing call
 * site's behavior is byte-identical unless it explicitly opts in.
 */
import * as _drawingCore from './drawing.js';
import { loadRegistry, saveRegistry, buildRegistryKey, scopedKeys, computeIntentSignature, DEFAULT_REGISTRY_PATH } from '../engine/drawingRegistry.js';
import { validateDrawingIntent } from '../engine/visualization.js';

export const PLAN_ACTIONS = Object.freeze(['KEEP', 'CREATE', 'REMOVE_REGISTERED', 'DROP_STALE_REGISTRY', 'SKIP_INVALID']);

function resolveDeps(_deps) {
  return {
    registryPath: _deps?.registryPath ?? DEFAULT_REGISTRY_PATH,
    loadRegistry: _deps?.loadRegistry ?? loadRegistry,
    saveRegistry: _deps?.saveRegistry ?? saveRegistry,
    drawShape: _deps?.drawShape ?? _drawingCore.drawShape,
    listDrawings: _deps?.listDrawings ?? _drawingCore.listDrawings,
    removeOne: _deps?.removeOne ?? _drawingCore.removeOne,
    now: _deps?.now ?? (() => new Date()),
  };
}

/**
 * Pure, read-only plan builder. `currentChartIds` (a Set of entity IDs
 * actually present on the chart right now, from ONE listDrawings() call)
 * is what makes DROP_STALE_REGISTRY detection honest instead of guessed.
 * Never mutates `registry` -- callers that execute the plan operate on
 * their own loaded copy.
 *
 * `ownsRole` (optional, defaults to "owns everything" -- byte-identical
 * to every pre-existing caller's behavior): a predicate the CALLER uses
 * to declare which registered *roles* belong to its own ownership
 * domain. Only used to bound the trailing stale-cleanup pass below (for
 * a role the caller's own `desiredIntents` explicitly names, ownership
 * is already implicit -- this predicate is never consulted for those).
 * A registered entry whose role fails this predicate is a DIFFERENT
 * caller's drawing -- it is never inspected further, never staged for
 * removal, and never reported as stale; the plan simply does not
 * mention it at all. This is what makes it safe for two independent
 * reconciliation calls (e.g. decision-TF visualization and active-chart-
 * TF-local visualization, src/core/xauusd_visualize_market.js and
 * src/core/xauusd_visualize_chart_context.js) to share the exact same
 * (symbol, timeframe) registry scope -- which happens whenever the
 * user's active chart timeframe equals the decision timeframe -- without
 * one caller's cleanup pass deleting the other's still-valid drawings.
 */
/**
 * `cleanupScope` (optional, default 'timeframe' -- byte-identical to every
 * pre-existing caller): bounds ONLY the trailing stale-cleanup pass.
 *   'timeframe' -> registered entries of this exact (symbol, timeframe).
 *   'symbol'    -> registered entries of this symbol under ANY timeframe
 *                  key. Used by the decision-timeframe visualizer so that,
 *                  after an engine-profile switch (reference_15m ->
 *                  intraday_5m), obsolete planner drawings registered under
 *                  the previous decision timeframe are removed by the
 *                  current plan instead of lingering on the chart forever.
 * ownsRole() still applies in both scopes, so another caller's roles
 * (e.g. chart-local `chart_*` roles) are never touched.
 */
export function buildReconciliationPlan({ desiredIntents = [], registry, symbol, timeframe, currentChartIds, ownsRole = () => true, cleanupScope = 'timeframe' }) {
  const steps = [];
  const desiredKeys = new Set();

  for (const intent of desiredIntents) {
    const { valid, errors } = validateDrawingIntent(intent);
    if (!valid) { steps.push({ action: 'SKIP_INVALID', role: intent?.role ?? null, errors }); continue; }

    const key = buildRegistryKey({ symbol: intent.symbol, timeframe: intent.timeframe, role: intent.role, index: intent.index ?? 0 });
    desiredKeys.add(key);
    const registered = registry.entries[key] ?? null;
    const signature = computeIntentSignature(intent);

    if (!registered) {
      steps.push({ action: 'CREATE', key, role: intent.role, intent });
    } else if (!currentChartIds.has(registered.entity_id)) {
      // Registered, but no longer actually on the chart -- session-
      // specific/stale ID (chart reload, restart, manual deletion). Drop
      // the stale bookkeeping and recreate; never search for a "similar"
      // shape to reclaim.
      steps.push({ action: 'DROP_STALE_REGISTRY', key, role: intent.role, entity_id: registered.entity_id });
      steps.push({ action: 'CREATE', key, role: intent.role, intent });
    } else if (registered.intent_signature !== signature) {
      // Genuinely changed content for this role -- remove the exact
      // registered entity, then create its replacement (mission Part 10's
      // "remove -> create -> register" ordering).
      steps.push({ action: 'REMOVE_REGISTERED', key, role: intent.role, entity_id: registered.entity_id });
      steps.push({ action: 'CREATE', key, role: intent.role, intent });
    } else {
      // Unchanged intent, entity still exists -- avoid delete/recreate.
      steps.push({ action: 'KEEP', key, role: intent.role, entity_id: registered.entity_id });
    }
  }

  // Registered entries for THIS (symbol, timeframe) scope that are no
  // longer desired at all -- scopedKeys() guarantees this never touches a
  // different symbol/timeframe's entries. ownsRole() additionally
  // guarantees this never touches a DIFFERENT CALLER's roles within the
  // SAME (symbol, timeframe) scope -- see this function's own doc
  // comment above for why that matters.
  const cleanupKeys = cleanupScope === 'symbol'
    ? Object.keys(registry.entries ?? {}).filter((k) => k.startsWith(`${symbol ?? 'UNKNOWN_SYMBOL'}|`))
    : scopedKeys(registry, { symbol, timeframe });
  for (const key of cleanupKeys) {
    if (desiredKeys.has(key)) continue;
    const registered = registry.entries[key];
    if (!ownsRole(registered.role)) continue;
    if (currentChartIds.has(registered.entity_id)) {
      steps.push({ action: 'REMOVE_REGISTERED', key, role: registered.role ?? null, entity_id: registered.entity_id });
    } else {
      steps.push({ action: 'DROP_STALE_REGISTRY', key, role: registered.role ?? null, entity_id: registered.entity_id });
    }
  }

  return steps;
}

/**
 * Reconciles already-computed visualization intents against the MCP
 * drawing registry. `dryRun: true` returns the plan only -- `listDrawings`
 * (read-only) may still be called to make DROP_STALE_REGISTRY detection
 * accurate, but drawShape/removeOne/saveRegistry are NEVER called in that
 * branch, structurally (the execution loop below is simply never reached).
 */
export async function reconcileVisualization({ intents = [], symbol, timeframe, dryRun = false, ownsRole = () => true, cleanupScope = 'timeframe', _deps } = {}) {
  const deps = resolveDeps(_deps);
  const warnings = [];

  const registry = deps.loadRegistry(deps.registryPath);

  let currentChartIds;
  try {
    const listed = await deps.listDrawings();
    currentChartIds = new Set((listed?.shapes ?? []).map((s) => s.id));
  } catch (err) {
    // Fail closed on the READ side too: with no reliable chart-state read,
    // an EMPTY currentChartIds would make every registered entry look
    // "gone", forcing bogus DROP_STALE_REGISTRY entries and masking real,
    // still-present drawings as stale. Change nothing instead.
    warnings.push(`draw_list failed -- no reconciliation plan can be safely built this cycle: ${err.message}`);
    return { dry_run: !!dryRun, plan: [], executed: [], warnings, symbol, timeframe };
  }

  const plan = buildReconciliationPlan({ desiredIntents: intents, registry, symbol, timeframe, currentChartIds, ownsRole, cleanupScope });

  if (dryRun) {
    return { dry_run: true, plan, executed: [], warnings, symbol, timeframe };
  }

  const executed = [];
  let haltedOnPersistFailure = false;

  for (const step of plan) {
    if (haltedOnPersistFailure) { executed.push({ ...step, applied: false, skipped: true, reason: 'HALTED_AFTER_PERSIST_FAILURE' }); continue; }

    if (step.action === 'SKIP_INVALID' || step.action === 'KEEP') { executed.push({ ...step, applied: step.action === 'KEEP' }); continue; }

    if (step.action === 'DROP_STALE_REGISTRY') {
      delete registry.entries[step.key];
      try {
        deps.saveRegistry(deps.registryPath, registry);
        executed.push({ ...step, applied: true });
      } catch (err) {
        warnings.push(`registry save failed while dropping a stale entry for role "${step.role}" -- halting further mutation this cycle: ${err.message}`);
        executed.push({ ...step, applied: false, error: err.message });
        haltedOnPersistFailure = true;
      }
      continue;
    }

    if (step.action === 'REMOVE_REGISTERED') {
      try {
        await deps.removeOne({ entity_id: step.entity_id });
        delete registry.entries[step.key];
        deps.saveRegistry(deps.registryPath, registry);
        executed.push({ ...step, applied: true });
      } catch (err) {
        // Fail soft: never a global clear, never touches any OTHER entity.
        // The registry entry is deliberately LEFT IN PLACE on an ambiguous
        // failure -- ownership is never guessed away. If the shape was in
        // fact already gone, the next cycle's listDrawings-based check
        // will correctly reclassify this as DROP_STALE_REGISTRY.
        warnings.push(`removeOne failed for role "${step.role}" (entity ${step.entity_id}) -- registry entry left in place: ${err.message}`);
        executed.push({ ...step, applied: false, error: err.message });
      }
      continue;
    }

    if (step.action === 'CREATE') {
      let result;
      try {
        result = await deps.drawShape({
          shape: step.intent.primitive, point: step.intent.point, point2: step.intent.point2 ?? undefined,
          overrides: step.intent.overrides ?? undefined, text: step.intent.text ?? undefined,
        });
      } catch (err) {
        warnings.push(`draw_shape failed for role "${step.role}": ${err.message}`);
        executed.push({ ...step, applied: false, error: err.message });
        continue;
      }
      if (!result?.entity_id) {
        // core/drawing.js discovers the new ID by diffing getAllShapes()
        // before/after -- a null result means no new shape was actually
        // discovered. Never register a null/undefined ID as owned.
        warnings.push(`draw_shape for role "${step.role}" returned no discoverable entity_id -- not registered`);
        executed.push({ ...step, applied: false, error: 'NO_ENTITY_ID_DISCOVERED' });
        continue;
      }
      registry.entries[step.key] = {
        role: step.role, entity_id: result.entity_id, symbol: step.intent.symbol, timeframe: step.intent.timeframe,
        primitive: step.intent.primitive, intent_signature: computeIntentSignature(step.intent), created_at: deps.now().toISOString(),
      };
      try {
        deps.saveRegistry(deps.registryPath, registry);
        executed.push({ ...step, applied: true, entity_id: result.entity_id });
      } catch (err) {
        // UNAVOIDABLE ORPHAN-DRAWING RISK, never hidden: the shape now
        // genuinely exists on the live chart, but local ownership could
        // not be persisted, so a future reconciliation cycle (which
        // reloads the registry from disk) will not know this entity is
        // MCP-owned. No further mutating step runs this cycle so the risk
        // cannot compound into more untracked shapes.
        warnings.push(`ORPHAN RISK: draw_shape for role "${step.role}" succeeded (entity ${result.entity_id}) but the registry could not be persisted -- this drawing exists on the chart but is NOT tracked as MCP-owned: ${err.message}`);
        executed.push({ ...step, applied: true, entity_id: result.entity_id, orphaned: true, error: err.message });
        haltedOnPersistFailure = true;
      }
      continue;
    }
  }

  return { dry_run: false, plan, executed, warnings, symbol, timeframe };
}
