/**
 * Full Market Analysis Engine orchestrator (Parts B-M of the XAUUSD MCP
 * analysis-engine upgrade), plus Stage 6 additive candidate observability.
 * This module is called BOTH on-demand (the `xauusd_analyze_market`/
 * `xauusd_visualize_market` MCP tools, always with `persistSignals: false`)
 * AND by the watcher's own cadence (src/engine/watcher.js, Stage 6, always
 * with `persistSignals: true`) -- see the `persistSignals` doc below for
 * why the two callers deliberately use different signal-store modes.
 *
 * DESIGN: the authoritative trading decision comes from ONE call to the
 * existing, unmodified calculateEntry() (src/core/xauusd_calculate.js).
 * This module never recomputes or second-guesses that decision -- it
 * only:
 *   1. Fetches all timeframes' OHLCV ONCE (fetchMultiTimeframeBars,
 *      re-exported unchanged from xauusd_calculate.js) and feeds that
 *      SAME data into calculateEntry() via an in-memory "prefetched"
 *      deps shim, so this analysis never causes a SECOND live
 *      chart-timeframe sweep beyond the one it already needed for its
 *      own evidence layers.
 *   2. Runs calculateEntry() against an EPHEMERAL, in-memory signal
 *      store (never the real validation/mcp_engine_signals.json) so an
 *      on-demand full-analysis call can NEVER mark a signal as
 *      "already seen" and suppress a real alert the watcher would
 *      otherwise independently raise on its own next poll. This is the
 *      mechanism that satisfies "no duplicate watcher behavior
 *      introduced" (mission Part 18 / Part 21).
 *   3. Computes the new evidence layers (candlesticks, classical
 *      patterns, breakout state, liquidity, levels, volatility, session,
 *      strategy eligibility) from the EXACT SAME confirmed 15m bars
 *      calculateEntry() itself used for its own regime/structure/
 *      correction computation -- same pure functions, same data, so
 *      this can never diverge from what the protected pipeline computed.
 *   4. Passes decision + evidence into buildConfluenceReport()
 *      (src/engine/confluence.js), which republishes the decision
 *      verbatim and only annotates it with evidence -- never alters it.
 *   5. Passes the SAME decision + evidence into computeAnticipation()
 *      (src/engine/anticipation.js, Stage 1+2 of the anticipation
 *      upgrade), which relabels already-computed fields into a pre-entry
 *      state/scenario for explainability -- also never alters the
 *      decision or the confluence report, and never adds a second
 *      calculateEntry() call or OHLCV sweep.
 */
import { calculateEntry, fetchMultiTimeframeBars, validateAndSplit, resolveDeps, ALL_TIMEFRAMES, ENTRY_TIMEFRAMES, TF_LABEL, TF_MINUTES } from './xauusd_calculate.js';
import { classifyRegime, REGIME_PARAMS } from '../engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../engine/structure.js';
import { computeCorrection, CORRECTION_PARAMS } from '../engine/correction.js';
import { runPipeline } from '../engine/pipeline.js';
import { computeMarketEvidence } from '../engine/marketEvidence.js';
import { buildEvidenceSnapshot } from '../engine/evidenceSnapshot.js';
import { attachEvidenceSnapshot } from '../engine/signalStore.js';
import { computeDailyWeeklyContext } from '../engine/session.js';
import { buildConfluenceReport } from '../engine/confluence.js';
import { computeAnticipation } from '../engine/anticipation.js';
import { computeOpportunityPlan } from '../engine/opportunityPlanner.js';

const PRIMARY_TIMEFRAME = '15'; // matches combineTimeframes()'s own source_timeframe (15m is the decision timeframe)

/** In-memory shim so calculateEntry() reuses the SAME already-fetched bars instead of re-sweeping the chart. */
function buildPrefetchedDeps(byTf, originalSymbol, originalResolution) {
  let current = originalResolution;
  return {
    getState: async () => ({ success: true, symbol: originalSymbol, resolution: current }),
    setTimeframe: async ({ timeframe }) => { current = timeframe; return { success: true }; },
    getOhlcv: async () => ({ bars: byTf[current] ?? null }),
  };
}

// Exported additively (Stage 6) so src/core/xauusd_chart_context.js can
// reuse the EXACT SAME evidence computation for the active chart
// timeframe's own local intelligence, which may differ from the primary
// (15m) decision timeframe -- never a second, divergent implementation.
// `primaryPipeline` (EI-1, additive, optional): the ALREADY-COMPUTED
// runPipeline() result (src/engine/pipeline.js, UNCHANGED, PROTECTED) for
// this EXACT confirmed-bar set, when the caller has one -- analyzeMarket()
// below always supplies it (from the SAME pipelineByTf every Stage 6
// candidate-observability call already computes, never a second/third
// independent run). When supplied, its `regime`/`structure` are reused
// VERBATIM -- this function no longer recomputes them itself, closing the
// architectural duplication the EI-1 design audit identified. `correction`
// is likewise reused verbatim when present.
//
// Falls back to an independent computation -- BYTE-IDENTICAL to this
// function's pre-EI-1 behavior -- only when no pipeline result is
// available at all: a timeframe whose own data failed validation (no
// pipeline result exists to reuse), or a caller analyzing a timeframe
// outside the 3 protected entry timeframes (src/core/xauusd_chart_context.js,
// which has no calculateEntry()-driven pipeline for its own, possibly
// non-entry timeframe -- see that file's own call site).
export function computeEvidence(primaryBars, split, selectedModel, primaryPipeline = null) {
  const regime = primaryPipeline?.regime ?? classifyRegime(primaryBars, REGIME_PARAMS).regime;
  const structure = primaryPipeline?.structure ?? computeStructure(primaryBars, STRUCTURE_PARAMS);
  const correction = primaryPipeline?.correction ?? (regime && structure.state ? computeCorrection(primaryBars, structure.state, CORRECTION_PARAMS) : { state: 'NONE' });
  const lastIndex = primaryBars.length - 1;

  const dailyWeeklyContext = computeDailyWeeklyContext({
    dailyBars: split.D?.confirmed ?? [],
    weeklyBars: split.W?.confirmed ?? [],
    currentDayBar: split.D?.forming ?? null,
    currentWeekBar: split.W?.forming ?? null,
    currentPrice: primaryBars[lastIndex].close,
  });

  const marketEvidence = computeMarketEvidence({
    confirmedBars: primaryBars, regime, structure, selectedModel,
    priorDayHigh: dailyWeeklyContext.previousDayHigh, priorDayLow: dailyWeeklyContext.previousDayLow,
    priorWeekHigh: dailyWeeklyContext.previousWeekHigh, priorWeekLow: dailyWeeklyContext.previousWeekLow,
  });

  return { regime, structure, correction, dailyWeeklyContext, ...marketEvidence };
}

/**
 * Stage 6 — CANDIDATE (not authoritative) observability per entry
 * timeframe. Consumes a single already-computed runPipeline() result
 * (src/engine/pipeline.js, UNCHANGED, PROTECTED) -- pure, deterministic,
 * zero-I/O, so this can NEVER diverge from what the protected pipeline
 * already computed (identical inputs -> identical outputs, by
 * construction). This exists ONLY to surface intermediate values
 * calculateEntry()'s own public return shape does not expose (a
 * candidate's `side`/RR even when the final action is WAIT) -- it is
 * never fed back into any decision, never used to gate/alter
 * `decision.action`, and never itself produces BUY/SELL. Exported
 * additively so tests can verify this directly against synthetic
 * pipeline results (e.g. a confirmed 15m BUY candidate coexisting with
 * an overall WAIT forced by mtf.js's own HTF-conflict gate) without
 * needing a full, realistic 500-bar fixture. See
 * docs/XAUUSD_LIVE_RUNTIME.md's "Candidate vs Authoritative" section.
 */
// NAMING (RR forensic audit, see docs/XAUUSD_LIVE_RUNTIME.md): every RR-ish
// value returned here is prefixed `authoritative_` because it is read
// straight from `risk.js`'s own computeRisk() return value (via
// pipelineResult.evidence.risk) -- byte-identical to what the protected
// RR gate itself evaluated. This is deliberately distinct from
// src/engine/opportunityPlanner.js's `planning_rr_illustrative` (a
// separate, explicitly non-authoritative zone-edge approximation) -- the
// two must never be confused, which is exactly what happened before this
// rename (both were previously named `candidate_rr`).
export function extractCandidateObservability(pipelineResult) {
  if (!pipelineResult) {
    return {
      status: 'UNAVAILABLE', regime: null, candidate_action: null, candidate_model: null, candidate_quality: null,
      authoritative_candidate_rr: null, authoritative_candidate_entry: null, authoritative_candidate_sl: null,
      authoritative_candidate_tp1: null, authoritative_candidate_tp2: null, authoritative_rr_gate: null, blocked_by: null,
    };
  }
  const candidate = pipelineResult.evidence?.candidate ?? null;
  const risk = pipelineResult.evidence?.risk ?? null;
  const isConfirmed = pipelineResult.decision?.action === 'BUY' || pipelineResult.decision?.action === 'SELL';
  return {
    status: pipelineResult.status,
    regime: pipelineResult.regime ?? null,
    candidate_action: candidate?.side ?? null, // 'BUY' | 'SELL' | null -- the CANDIDATE's own side, never the final authoritative action
    candidate_model: pipelineResult.model ?? null,
    candidate_quality: pipelineResult.quality?.score ?? null,
    // Authoritative: risk.js's own computed RR/entry/SL/TP1/TP2 for this
    // timeframe's candidate, exposed for observability only -- never fed
    // back into any decision, gate, or score. entry/sl/tp1/tp2 are only
    // present when risk.js's computeRisk() itself returned them (the OK
    // and RR_NOT_ACCEPTABLE branches); other rejection branches
    // (OVEREXTENDED/INVALID_GEOMETRY/no candidate at all) correctly
    // surface as null rather than a fabricated value.
    authoritative_candidate_rr: risk?.rr ?? null,
    authoritative_candidate_entry: risk?.entry ?? null,
    authoritative_candidate_sl: risk?.stop_loss ?? null,
    authoritative_candidate_tp1: risk?.tp1 ?? null,
    authoritative_candidate_tp2: risk?.tp2 ?? null,
    // The exact risk.js gate this candidate hit ('OK' | 'RR_NOT_ACCEPTABLE'
    // | 'OVEREXTENDED' | 'INVALID_GEOMETRY' | null when risk.js was never
    // reached, e.g. NO_ELIGIBLE_STRATEGY). Distinct from `blocked_by`
    // below, which mirrors the pipeline's own overall wait_reason.
    authoritative_rr_gate: risk?.gate ?? null,
    // The exact protected gate/reason this timeframe's OWN candidate is
    // currently blocked by, or null when it is itself a confirmed
    // BUY/SELL at this timeframe (still subject to the mtf/htf gates in
    // combineTimeframes()/detectHtfConflict() before becoming authoritative).
    blocked_by: isConfirmed ? null : (pipelineResult.decision?.wait_reason ?? null),
  };
}

/**
 * Runs runPipeline() for every ENTRY_TIMEFRAMES member on already-fetched
 * confirmed bars, mirroring calculateEntry()'s OWN internal sequencing
 * exactly (30m first -- its regime feeds 15m/5m's htfRegime, since 30m is
 * the designated HTF-context source for the entry timeframes). Returns
 * the RAW per-timeframe runPipeline() results.
 *
 * EI-1: this is the SINGLE place analyzeMarket() re-runs the entry-tier
 * pipeline (Stage 6 candidate observability already required exactly this
 * one additional run, deterministically identical to calculateEntry()'s
 * own internal one -- see extractCandidateObservability()'s own doc
 * comment). computeEvidence() now REUSES this SAME result for its
 * regime/structure/correction instead of independently recomputing them a
 * third time -- see computeEvidence()'s own doc comment above.
 */
function computeEntryPipelineByTf(split) {
  const pipelineByTf = {};
  const m30 = split[30]?.error ? null : runPipeline({ confirmedBars: split[30].confirmed });
  pipelineByTf[30] = m30;
  for (const tf of ENTRY_TIMEFRAMES) {
    if (tf === '30' || Number(tf) === 30) continue;
    pipelineByTf[tf] = split[tf]?.error ? null : runPipeline({ confirmedBars: split[tf].confirmed, htfRegime: m30?.regime ?? null });
  }
  return pipelineByTf;
}

/** Candidate observability only -- see extractCandidateObservability(). Maps the ALREADY-COMPUTED pipelineByTf (computeEntryPipelineByTf()); never runs a pipeline itself. */
function computeCandidateObservability(pipelineByTf) {
  const result = {};
  for (const tf of ENTRY_TIMEFRAMES) result[TF_LABEL[tf]] = extractCandidateObservability(pipelineByTf[tf]);
  return result;
}

/**
 * EI-2 -- persists a compact, immutable src/engine/evidenceSnapshot.js
 * record onto the just-registered signal, when ALL of:
 *   - `persistSignals` is true (the SAME real-vs-ephemeral store
 *     discipline calculateEntry() itself already used for this call --
 *     an on-demand read, persistSignals:false, must NEVER touch the real
 *     store, exactly as before EI-2 existed);
 *   - `evidence` is available (MarketEvidence, EI-1, was actually computed
 *     for this cycle);
 *   - `decision.signal?.is_new_event === true` -- a blocked same-thesis
 *     duplicate or an exact signal_id repeat must NEVER attach evidence
 *     here, since that would silently overwrite the ORIGINAL signal's own
 *     contemporaneous snapshot with a LATER attempt's evidence.
 * This performs a second, small, additive load+save of the SAME store
 * calculateEntry() already wrote to -- no new storage system, no change
 * to signal_id/thesis_id/status/entry/SL/TP/RR/quality/concurrency
 * semantics. Exported additively so tests can verify this directly
 * against a hand-built decision/evidence pair (mirroring
 * extractCandidateObservability()'s own precedent) without needing a
 * full organic 500-bar fixture to coax a real BUY/SELL out of the
 * protected pipeline. Never throws -- a snapshot failure must never
 * affect the authoritative decision already returned by analyzeMarket().
 */
export function maybePersistEvidenceSnapshot({ decision, evidence, primarySplit, deps, persistSignals }) {
  if (!persistSignals || !evidence || decision.signal?.is_new_event !== true) return { attached: false, reason: 'NOT_APPLICABLE' };
  try {
    const snapshot = buildEvidenceSnapshot({
      symbol: decision.signal.symbol, timeframe: decision.signal.timeframe,
      capturedBarTime: primarySplit?.confirmed?.at(-1)?.time ?? null,
      signalBarTime: decision.signal.signal_bar_time, originBar: decision.signal.origin_bar,
      thesisId: decision.signal.thesis_id ?? null,
      regime: evidence.regime, structure: evidence.structure, correction: evidence.correction,
      currentPrice: primarySplit?.confirmed?.at(-1)?.close ?? null,
      qualityComponents: decision.diagnostics?.quality_breakdown ?? null,
      marketEvidence: evidence,
    });
    const snapshotStore = deps.loadStore(deps.storePath);
    const attachResult = attachEvidenceSnapshot(snapshotStore, decision.signal.signal_id, snapshot);
    if (attachResult.attached) deps.saveStore(deps.storePath, snapshotStore);
    return attachResult;
  } catch (err) {
    return { attached: false, reason: 'ERROR', error: err.message };
  }
}

/**
 * Runs the full market analysis: authoritative decision (unchanged
 * calculateEntry()) + new evidence layers + confluence fusion. Never
 * places trades, always restores the chart's original timeframe
 * (inherited from fetchMultiTimeframeBars()'s own restore-on-completion
 * discipline).
 *
 * `persistSignals` (Stage 6, default `false` -- UNCHANGED behavior for
 * every existing caller): when `false` (the default), uses an EPHEMERAL,
 * in-memory signal store exactly as before, so an on-demand call (the
 * `xauusd_analyze_market`/`xauusd_visualize_market` MCP tools) can never
 * mark a signal "already seen" and suppress a real alert the watcher
 * would otherwise independently raise. When `true`, uses the SAME real,
 * persisted store `calculateEntry()` itself defaults to
 * (`deps.loadStore`/`deps.saveStore`/`deps.storePath` from
 * `resolveDeps()`) -- this is an explicit opt-in ONLY for
 * src/engine/watcher.js's own cycle, which is itself the single
 * authoritative consumer of that persisted dedup state and therefore
 * must use the real store, not a throwaway one.
 */
export async function analyzeMarket({ _deps, persistSignals = false } = {}) {
  const deps = resolveDeps(_deps);
  const { byTf, fetchErrors } = await fetchMultiTimeframeBars(deps);

  const split = {};
  for (const tf of ALL_TIMEFRAMES) split[tf] = validateAndSplit(byTf[tf], TF_MINUTES[tf]);

  const original = await deps.getState();
  const prefetched = buildPrefetchedDeps(byTf, original.symbol, original.resolution);
  let ephemeralStore = { signals: [] }; // used unless persistSignals:true -- see doc above

  const decision = await calculateEntry({
    _deps: {
      getState: prefetched.getState,
      setTimeframe: prefetched.setTimeframe,
      getOhlcv: prefetched.getOhlcv,
      // Forwarded from the SAME outer deps as the rest of this call (real
      // getMasterState by default, or a test's injected mock) -- must
      // never silently fall back to calculateEntry()'s own real default,
      // which would attempt a live CDP connection this orchestrator has
      // no reason to make twice.
      getMasterState: deps.getMasterState,
      loadStore: persistSignals ? deps.loadStore : () => ephemeralStore,
      saveStore: persistSignals ? deps.saveStore : (_path, s) => { ephemeralStore = s; },
      storePath: deps.storePath,
    },
  });

  // EI-1: computed ONCE, before evidence, so computeEvidence() below can
  // reuse this SAME regime/structure/correction for the primary (15m)
  // timeframe instead of independently recomputing them -- see
  // computeEntryPipelineByTf()'s own doc comment.
  const pipelineByTf = computeEntryPipelineByTf(split);

  const primarySplit = split[PRIMARY_TIMEFRAME];
  const evidence = !primarySplit?.error && primarySplit?.confirmed?.length > 0
    ? computeEvidence(primarySplit.confirmed, split, decision.setup ?? null, pipelineByTf[PRIMARY_TIMEFRAME])
    : null;

  // EI-2, additive, narrow, observability only -- see
  // maybePersistEvidenceSnapshot()'s own doc comment for the full gating
  // rationale (persistSignals / is_new_event / immutability).
  maybePersistEvidenceSnapshot({ decision, evidence, primarySplit, deps, persistSignals });

  const confluence = evidence ? buildConfluenceReport({ decision, decisionTimeframes: decision.timeframes ?? null, ...evidence }) : null;

  // Additive, informational only -- computeAnticipation() never recomputes
  // or overrides `decision`/`confluence`; it only relabels fields both
  // already expose. Runs after the authoritative decision and the
  // confluence report are already finalized, and consumes the SAME
  // `decision` + `evidence` -- no second calculateEntry() call, no
  // additional OHLCV/timeframe sweep. See src/engine/anticipation.js.
  const anticipation = computeAnticipation({ decision, evidence });

  // Stage 6, additive, observability only -- see extractCandidateObservability().
  const candidates = computeCandidateObservability(pipelineByTf);

  // Pre-Entry Opportunity Planner (additive upgrade on Stage 6): consumes
  // the SAME already-computed decision/evidence/anticipation, plus the
  // SAME primarySplit.confirmed bars computeEvidence() itself already
  // used (never a second sweep, never a fetch) -- see
  // src/engine/opportunityPlanner.js. Never a second decision engine;
  // returns { status: 'NO_PLAN', ... } whenever nothing objective is
  // developing (never fabricates one), and never converts its own
  // candidate geometry into `decision`'s authoritative fields above.
  const pre_entry_plan = computeOpportunityPlan({ decision, evidence, anticipation, primaryBars: primarySplit?.confirmed ?? null });

  return {
    ...decision,
    evidence_available: !!evidence,
    evidence_unavailable_reason: evidence ? null : (primarySplit?.error ?? 'insufficient confirmed bars on the primary (15m) timeframe'),
    // Additive (Stage 5): the SAME evidence object already used to build
    // confluence/anticipation above, exposed verbatim so a visualization
    // mapper (src/engine/marketVisualization.js) can read real structure/
    // breakout/liquidity/level/pattern geometry without a second, separate
    // evidence computation. confluence.informational_context carries a
    // lossy SUBSET of this (e.g. structure_state as a bare string, not the
    // full structure object with lastEvent/lastSwingHigh/lastSwingLow) --
    // this field is the authoritative, complete one. Never recomputed,
    // never diverges from what confluence/anticipation themselves saw.
    evidence,
    confluence,
    anticipation,
    // Stage 6: per-entry-timeframe CANDIDATE observability -- see
    // extractCandidateObservability()'s own doc comment. Never authoritative.
    candidates,
    // Pre-Entry Opportunity Planner: candidate/provisional geometry only
    // -- see opportunityPlanner.js's own doc comment. Never authoritative.
    pre_entry_plan,
    // Stage 7 Step 2, additive: the SAME confirmed 15m bars computeEvidence()/
    // computeOpportunityPlan() already consumed above, exposed verbatim so
    // src/engine/opportunityOutcomeResolver.js can measure what happened
    // AFTER an already-recorded Opportunity Ledger observation without a
    // second OHLCV fetch or timeframe sweep. Read-only passthrough -- never
    // itself computed from or fed back into any decision.
    primary_confirmed_bars: primarySplit?.confirmed ?? null,
    fetch_errors: fetchErrors,
  };
}
