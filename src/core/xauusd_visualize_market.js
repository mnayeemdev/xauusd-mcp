/**
 * Stage 5 — market visualization execution orchestrator.
 *
 * Ties together (in this exact one-way order): the already-frozen
 * analysis stack (src/core/xauusd_analyze_market.js -- itself an
 * unmodified single calculateEntry() call + one evidence computation),
 * the Stage 5 pure mapper (src/engine/marketVisualization.js), and
 * Stage 4's safe reconciler (src/core/xauusd_visualize.js). It never
 * computes a decision itself, never alters `decision`/`confluence`/
 * `anticipation`, and never mutates Stage 3's persisted observations.
 *
 * TWO ENTRY POINTS, by design:
 *
 *   - `visualizeMarketAnalysis({ analysis, ... })` takes an
 *     ALREADY-COMPUTED analyzeMarket() result and visualizes it --
 *     performs ZERO analysis of its own (no calculateEntry(), no OHLCV
 *     fetch). This is the "analysis -> visualize same analysis" path
 *     (mission Part 26) for a future caller that already has an analysis
 *     result in hand and wants to avoid a second sweep.
 *
 *   - `visualizeXauusdMarket({ ... })` is the standalone entry point: it
 *     calls `analyzeMarket()` itself, exactly ONCE, because no analysis
 *     object exists in-process between separate MCP tool invocations in
 *     this stateless request architecture -- there is no shared session
 *     state to reuse. This is intentionally documented, not a silent
 *     duplicate sweep: it is the ONLY sweep this call performs.
 *
 * FAIL-SOFT BOUNDARY: a visualization failure (a failed draw/remove, a
 * registry persistence failure, an unreachable CDP) is reported in the
 * result's `reconciliation.warnings`/`failed` fields -- it NEVER alters
 * `analysis.action`/`analysis.decision`. See tests for the explicit proof
 * that a broken drawing path leaves the authoritative decision untouched.
 */
import { analyzeMarket } from './xauusd_analyze_market.js';
import { buildMarketVisualizationIntents } from '../engine/marketVisualization.js';
import { reconcileVisualization } from './xauusd_visualize.js';

const PLAN_ACTION_KEYS = ['KEEP', 'CREATE', 'REMOVE_REGISTERED', 'DROP_STALE_REGISTRY', 'SKIP_INVALID'];

function summarizeReconciliation(reconciliation, desiredCount) {
  const counts = Object.fromEntries(PLAN_ACTION_KEYS.map((k) => [k, 0]));
  const activeRoles = [];
  let failed = 0;
  const steps = reconciliation.dry_run ? reconciliation.plan : reconciliation.executed;
  for (const step of steps) {
    if (counts[step.action] !== undefined) counts[step.action] += 1;
    if (step.action !== 'SKIP_INVALID' && step.applied === false) failed += 1;
    if ((step.action === 'CREATE' || step.action === 'KEEP') && step.applied !== false) activeRoles.push(step.role);
  }
  return {
    status: failed > 0 ? 'PARTIAL' : 'OK',
    symbol: reconciliation.symbol,
    timeframe: reconciliation.timeframe,
    dry_run: reconciliation.dry_run,
    desired_count: desiredCount,
    kept: counts.KEEP,
    created: counts.CREATE,
    removed_registered: counts.REMOVE_REGISTERED,
    stale_registry_dropped: counts.DROP_STALE_REGISTRY,
    failed,
    active_roles: activeRoles,
    warnings: reconciliation.warnings,
  };
}

function findCandidateText(candidates, role) {
  const c = candidates.find((x) => x.role === role);
  return c?.included ? c.intent.text ?? null : null;
}
function findCandidatePrice(candidates, role) {
  const c = candidates.find((x) => x.role === role);
  return c?.included ? c.intent.point.price : null;
}

/** Concise summary (mission Part 28) -- never the entire analysis payload. */
function buildMarketVisualSummary({ analysis, candidates }) {
  const isConfirmed = analysis.action === 'BUY' || analysis.action === 'SELL';
  return {
    structure: findCandidateText(candidates, 'structure_primary'),
    nearest_support: findCandidatePrice(candidates, 'nearest_support'),
    nearest_resistance: findCandidatePrice(candidates, 'nearest_resistance'),
    active_zone: { demand: findCandidatePrice(candidates, 'active_demand'), supply: findCandidatePrice(candidates, 'active_supply') },
    liquidity: findCandidateText(candidates, 'liquidity_primary'),
    pattern: findCandidateText(candidates, 'pattern_primary'),
    breakout: findCandidateText(candidates, 'breakout_level'),
    anticipation_state: analysis.anticipation?.state ?? null,
    primary_scenario: findCandidateText(candidates, 'primary_scenario'),
    alternate_scenario: findCandidateText(candidates, 'alternate_scenario'),
    confirmed_trade: isConfirmed ? { action: analysis.action, entry: analysis.entry, sl: analysis.sl, tp1: analysis.tp1, tp2: analysis.tp2, rr: analysis.rr, quality: analysis.quality } : null,
  };
}

/**
 * Visualizes an ALREADY-COMPUTED analyzeMarket() result. Performs no
 * analysis of its own -- see module header.
 */
export async function visualizeMarketAnalysis({ analysis, dryRun = false, _deps } = {}) {
  if (!analysis) throw new Error('visualizeMarketAnalysis requires an already-computed `analysis` (an analyzeMarket() result)');

  const { intents, candidates, summary } = buildMarketVisualizationIntents({
    decision: analysis, evidence: analysis.evidence ?? null, anticipation: analysis.anticipation ?? null, confluence: analysis.confluence ?? null,
  });

  // A visualization failure (below, inside reconcileVisualization) is
  // reported in `reconciliation` only -- `analysis` itself, already fully
  // computed before this line, is never touched or re-derived here.
  const reconciliation = await reconcileVisualization({ intents, symbol: summary.symbol, timeframe: summary.timeframe, dryRun, _deps });

  return {
    visualization: summarizeReconciliation(reconciliation, summary.total_included),
    market_visual_summary: buildMarketVisualSummary({ analysis, candidates }),
    mapping: { candidates, summary },
  };
}

/**
 * Standalone entry point: one fresh analyzeMarket() call (the existing,
 * unmodified orchestrator), then visualizes it. Exactly one 10-TF sweep
 * per call -- see module header for why a second, cached sweep is not
 * architecturally possible here.
 */
export async function visualizeXauusdMarket({ dryRun = false, _deps } = {}) {
  const analysis = await analyzeMarket({ _deps: _deps?.analyzeMarketDeps });
  const result = await visualizeMarketAnalysis({ analysis, dryRun, _deps: _deps?.visualizeDeps });
  return {
    analysis_status: analysis.status,
    decision_action: analysis.action,
    decision_reason: analysis.reason ?? null,
    ...result,
  };
}
