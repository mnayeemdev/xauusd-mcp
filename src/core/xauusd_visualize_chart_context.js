/**
 * Stage 6, Part 7-15 — ACTIVE CHART TIMEFRAME visualization orchestrator.
 *
 * Combines (in this exact order):
 *   1. src/core/xauusd_chart_context.js's getActiveChartContext() --
 *      ZERO chart mutation, reads the currently active symbol/timeframe
 *      and (when eligible) computes TF-local evidence.
 *   2. src/engine/marketVisualization.js's
 *      buildChartLocalVisualizationIntents() -- pure mapping into
 *      chart_-namespaced drawing intents (never colliding with the
 *      decision-TF's own roles).
 *   3. src/core/xauusd_visualize.js's reconcileVisualization() (Stage 4,
 *      UNCHANGED, PROTECTED) -- the SAME safe reconciliation used for
 *      decision-TF visualization; never a second/parallel drawing
 *      primitive.
 *   4. An ADDITIVE cross-timeframe cleanup pass (below) that removes
 *      chart_-prefixed registry entries left behind from a PREVIOUSLY
 *      active timeframe now that the user has switched to a different
 *      one. Stage 4's reconcileVisualization() intentionally only ever
 *      touches its OWN (symbol, timeframe) scope (a hard safety
 *      guarantee against ever touching another scope's entries by
 *      accident) -- it therefore has no way to know "the user moved on
 *      from 4H to 1H" by itself. This module supplies that ONE additional
 *      explicit, narrowly-scoped pass: only `chart_`-prefixed roles,
 *      only the SAME symbol, only timeframe != the current active one --
 *      using the exact same registry-checked removeOne() path (never
 *      draw_clear, never a role/coordinate/text-similarity guess).
 *
 * NEVER mutates the chart's timeframe/symbol (inherited from
 * getActiveChartContext()'s own zero-mutation guarantee) -- only ever
 * calls drawing primitives (drawShape/removeOne/listDrawings), exactly
 * like Stage 4/5's own orchestrators.
 *
 * SYMBOL MISMATCH (mission Part 15): when the active chart is not an
 * approved XAUUSD alias, this module does NOT reconcile or clean up
 * anything -- it returns the paused context verbatim and makes zero
 * drawing calls. Cleaning up a non-XAUUSD chart's drawing scope is
 * explicitly out of scope (this registry only ever tracks XAUUSD-scoped
 * entries in the first place; see src/engine/drawingRegistry.js).
 */
import { getActiveChartContext } from './xauusd_chart_context.js';
import { buildChartLocalVisualizationIntents, CHART_LOCAL_ROLE_PREFIX } from '../engine/marketVisualization.js';
import { reconcileVisualization } from './xauusd_visualize.js';
import * as _drawingCore from './drawing.js';
import { loadRegistry, saveRegistry, DEFAULT_REGISTRY_PATH } from '../engine/drawingRegistry.js';

function resolveCleanupDeps(_deps) {
  return {
    registryPath: _deps?.registryPath ?? DEFAULT_REGISTRY_PATH,
    loadRegistry: _deps?.loadRegistry ?? loadRegistry,
    saveRegistry: _deps?.saveRegistry ?? saveRegistry,
    listDrawings: _deps?.listDrawings ?? _drawingCore.listDrawings,
    removeOne: _deps?.removeOne ?? _drawingCore.removeOne,
  };
}

/** Registry keys for chart_-prefixed roles belonging to `symbol` but a DIFFERENT timeframe than `currentTimeframe`. Never touches a decision-TF role (no chart_ prefix) or another symbol's entries. */
export function findStaleChartLocalEntries(registry, { symbol, currentTimeframe }) {
  return Object.entries(registry?.entries ?? {})
    .filter(([, entry]) => entry.symbol === symbol && entry.timeframe !== currentTimeframe && (entry.role ?? '').startsWith(CHART_LOCAL_ROLE_PREFIX))
    .map(([key, entry]) => ({ key, entry }));
}

/**
 * Removes stale cross-timeframe chart-local registry entries. Uses the
 * SAME safe pattern as xauusd_visualize.js's reconcileVisualization():
 * `removeOne` is only ever called with a registry-known entity_id, and a
 * registry entry whose entity_id is no longer actually on the chart
 * (per one listDrawings() read) is simply dropped from the registry
 * rather than force-removed from the chart.
 */
export async function cleanupStaleChartLocalScopes({ symbol, currentTimeframe, dryRun = false, _deps } = {}) {
  const deps = resolveCleanupDeps(_deps);
  const warnings = [];
  const registry = deps.loadRegistry(deps.registryPath);
  const stale = findStaleChartLocalEntries(registry, { symbol, currentTimeframe });

  if (!stale.length) return { removed: [], warnings, dry_run: !!dryRun };
  if (dryRun) return { removed: stale.map((s) => ({ key: s.key, entity_id: s.entry.entity_id, timeframe: s.entry.timeframe, planned: true })), warnings, dry_run: true };

  let currentChartIds;
  try {
    const listed = await deps.listDrawings();
    currentChartIds = new Set((listed?.shapes ?? []).map((s) => s.id));
  } catch (err) {
    warnings.push(`stale chart-local cleanup skipped this cycle -- draw_list failed: ${err.message}`);
    return { removed: [], warnings, dry_run: false };
  }

  const removed = [];
  for (const { key, entry } of stale) {
    if (!currentChartIds.has(entry.entity_id)) {
      delete registry.entries[key];
      try {
        deps.saveRegistry(deps.registryPath, registry);
        removed.push({ key, entity_id: entry.entity_id, timeframe: entry.timeframe, action: 'DROP_STALE_REGISTRY' });
      } catch (err) {
        warnings.push(`registry save failed while dropping stale cross-TF chart-local entry "${key}": ${err.message}`);
      }
      continue;
    }
    try {
      await deps.removeOne({ entity_id: entry.entity_id });
      delete registry.entries[key];
      deps.saveRegistry(deps.registryPath, registry);
      removed.push({ key, entity_id: entry.entity_id, timeframe: entry.timeframe, action: 'REMOVE_REGISTERED' });
    } catch (err) {
      warnings.push(`removeOne failed for stale cross-TF chart-local entry "${key}" (entity ${entry.entity_id}) -- registry entry left in place: ${err.message}`);
    }
  }
  return { removed, warnings, dry_run: false };
}

/**
 * Full active-chart-timeframe visualization cycle: read context -> map
 * intents -> reconcile (Stage 4) -> clean up stale cross-TF chart-local
 * entries. Every non-OK context status (SYMBOL_MISMATCH/UNKNOWN_TIMEFRAME/
 * INSUFFICIENT_DATA/READ_ERROR) short-circuits with zero drawing calls --
 * failure isolation per mission Part 31 ("CDP unavailable -> fail closed,
 * never invent a TF or generate a drawing").
 */
export async function visualizeActiveChartContext({ dryRun = false, _deps } = {}) {
  const context = await getActiveChartContext({ _deps });
  if (context.status !== 'OK') {
    return { context, mapping: null, reconciliation: null, cleanup: null };
  }

  const mapping = buildChartLocalVisualizationIntents({
    evidence: context.evidence, symbol: context.symbol, timeframe: context.timeframe_label, time: context.last_confirmed_bar_time,
  });

  const reconciliation = await reconcileVisualization({
    // ownsRole (see xauusd_visualize.js's own doc comment): this
    // orchestrator's stale-cleanup pass must ONLY ever consider
    // chart_-prefixed registry entries -- never the decision-TF's own
    // roles, which may legitimately share this exact (symbol, timeframe)
    // scope when the active chart TF equals the decision TF.
    intents: mapping.intents, symbol: context.symbol, timeframe: context.timeframe_label, dryRun,
    ownsRole: (role) => typeof role === 'string' && role.startsWith(CHART_LOCAL_ROLE_PREFIX),
    _deps,
  });

  const cleanup = await cleanupStaleChartLocalScopes({
    symbol: context.symbol, currentTimeframe: context.timeframe_label, dryRun, _deps,
  });

  return { context, mapping, reconciliation, cleanup };
}
