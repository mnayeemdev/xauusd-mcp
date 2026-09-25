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
import { buildMarketVisualizationIntents, buildPresentationIntents, CHART_LOCAL_ROLE_PREFIX } from '../engine/marketVisualization.js';
import { reconcileVisualization } from './xauusd_visualize.js';
import { loadStore as loadSignalStore, DEFAULT_STORE_PATH as DEFAULT_SIGNAL_STORE_PATH } from '../engine/signalStore.js';

// This orchestrator's own ownership domain (see xauusd_visualize.js's
// `ownsRole` doc comment): every role this module ever generates is a
// decision-TF role, NEVER chart_-prefixed -- so its stale-cleanup pass
// must never even consider a chart_*-prefixed registry entry, which
// belongs to xauusd_visualize_chart_context.js's own separate domain and
// may legitimately share the identical (symbol, timeframe) scope when
// the active chart TF equals the decision TF.
const ownsDecisionRole = (role) => typeof role === 'string' && !role.startsWith(CHART_LOCAL_ROLE_PREFIX);

const PLAN_ACTION_KEYS = ['KEEP', 'CREATE', 'REMOVE_REGISTERED', 'DROP_STALE_REGISTRY', 'SKIP_INVALID'];

/**
 * Read-only signal-store access (OPEN-trade persistence + historical
 * markers, mission items 4/5). This module NEVER writes to the store --
 * registration (registerOrGetSignal) and resolution (resolveOpenSignals)
 * remain exclusively calculateEntry()'s own job (src/core/xauusd_calculate.js);
 * visualization only ever reads the SAME already-persisted, already-
 * protected-decision-derived records it produces.
 */
function resolveSignalStoreDeps(_deps) {
  return {
    signalStorePath: _deps?.signalStorePath ?? DEFAULT_SIGNAL_STORE_PATH,
    loadSignalStore: _deps?.loadSignalStore ?? loadSignalStore,
  };
}

/** The single most-recently-confirmed OPEN record for this exact (symbol, timeframe), or null. Picking the most recent is a deliberate, documented simplification for the rare case of more than one simultaneously-open record -- never an attempt to display more than one confirmed-trade card at once. */
function findMostRecentOpenSignal(signals, { symbol, timeframe }) {
  const open = signals.filter((r) => r.symbol === symbol && r.timeframe === timeframe && r.status === 'OPEN');
  if (!open.length) return null;
  return open.reduce((best, r) => (!best || r.signal_bar_time > best.signal_bar_time ? r : best), null);
}

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

  const { candidates, summary } = buildMarketVisualizationIntents({
    decision: analysis, evidence: analysis.evidence ?? null, anticipation: analysis.anticipation ?? null, confluence: analysis.confluence ?? null,
    plan: analysis.pre_entry_plan ?? null,
    // Zone-Based Market Map upgrade: the SAME confirmed 15m bars Stage 7's
    // opportunityOutcomeResolver.js already reuses (analyzeMarket()'s own
    // additive `primary_confirmed_bars` field) -- never a second fetch --
    // lets Supply/Demand zones resolve a REAL bar-time span for a
    // translucent rectangle instead of a single-edge line. Presentation
    // only; never read by any decision/measurement code.
    primaryBars: analysis.primary_confirmed_bars ?? null,
  });

  // CLEAN CHART PRESENTATION (presentation-only): the full analytical
  // intent set above is still computed in full -- unchanged -- and its
  // audit trail is still returned below via `mapping`. What actually
  // reaches TradingView is this separately-assembled set: useful market
  // context (structure/S-R/supply-demand/liquidity/breakout/patterns/
  // range, each own merge+budget pool) plus the current signal/status box
  // or confirmed trade card, plus concise historical markers -- see
  // buildPresentationIntents()'s own doc comment. This is what keeps the
  // live chart useful AND clean without touching a single analytical
  // computation.
  //
  // Read-only signal-store access (never writes -- see resolveSignalStoreDeps()'s
  // own doc comment): finds the current OPEN record (persistence fix, mission
  // item 5) and the full signal list for historical markers (mission item 4).
  const storeDeps = resolveSignalStoreDeps(_deps);
  const signalStore = storeDeps.loadSignalStore(storeDeps.signalStorePath);
  const openSignal = findMostRecentOpenSignal(signalStore.signals ?? [], { symbol: summary.symbol, timeframe: summary.timeframe });

  const presentationIntents = buildPresentationIntents({
    decision: analysis, evidence: analysis.evidence ?? null, anticipation: analysis.anticipation ?? null,
    candidates, primaryBars: analysis.primary_confirmed_bars ?? null,
    openSignal, historicalSignals: signalStore.signals ?? [],
    symbol: summary.symbol, timeframe: summary.timeframe,
  });

  // A visualization failure (below, inside reconcileVisualization) is
  // reported in `reconciliation` only -- `analysis` itself, already fully
  // computed before this line, is never touched or re-derived here.
  // cleanupScope 'symbol': the decision-timeframe plan owns its roles for
  // this symbol under ANY timeframe key, so drawings registered by a
  // previous decision timeframe (e.g. 15m before the intraday_5m switch)
  // are removed once the current plan no longer wants them. Chart-local
  // `chart_*` roles remain excluded via ownsDecisionRole.
  const reconciliation = await reconcileVisualization({ intents: presentationIntents, symbol: summary.symbol, timeframe: summary.timeframe, dryRun, ownsRole: ownsDecisionRole, cleanupScope: 'symbol', _deps });

  return {
    visualization: summarizeReconciliation(reconciliation, presentationIntents.length),
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
