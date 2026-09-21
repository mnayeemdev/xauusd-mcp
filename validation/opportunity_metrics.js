/**
 * Stage 3 opportunity/WAIT observability metrics -- pure, deterministic
 * arithmetic over ALREADY-OBSERVED anticipation records (the JSONL rows
 * src/engine/anticipationStore.js's recordAnticipationObservation()
 * writes). Mirrors this file's own validation/metrics.js precedent: no
 * I/O here (the caller loads records via anticipationStore.js's
 * loadObservationLog() and passes the array in), nothing here generates,
 * infers, or repairs an observation.
 *
 * ============================================================
 * THIS MODULE NEVER COMPUTES A WIN RATE, ACCURACY, PROFIT FACTOR, OR
 * EXPECTANCY, AND NEVER MAKES A PROFITABILITY CLAIM.
 * ============================================================
 * Opportunity progression is NOT trade success. An ARMED -> CONFIRMED
 * ratio measures how often a fully gate-cleared candidate also cleared
 * the ONE remaining confirmatory condition (HTF alignment / mtf alignment
 * / Pine-MCP agreement) -- it says nothing about whether the resulting
 * trade would have won or lost. That question belongs to a genuine
 * completed-trade outcome ledger (e.g. src/engine/signalStore.js's own
 * OPEN/PASS/FAIL resolution, or the P6/P7/P8 validation ledgers), which
 * is explicitly outside this Stage 3 mission. Every ratio below returns
 * `null` rather than a fabricated 0% when its denominator is zero.
 */

/** Generic non-null-key counter. Records with a null/undefined value for `keyFn` are excluded, never bucketed as "null". */
function countBy(records, keyFn) {
  const counts = {};
  for (const r of records) {
    const k = keyFn(r);
    if (k == null) continue;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/**
 * Ratio of transitions FROM `fromState` that landed ON `toState`, among
 * every observed transition that started at `fromState` (regardless of
 * where it ended up). Never divides by zero: returns `null` when no
 * transition starting at `fromState` was ever observed.
 */
function transitionRatio(records, fromState, toState) {
  const denominator = records.filter((r) => r.previous_pre_entry_state === fromState).length;
  if (denominator === 0) return null;
  const count = records.filter((r) => r.previous_pre_entry_state === fromState && r.pre_entry_state === toState).length;
  return { from: fromState, to: toState, count, denominator, ratio: +(count / denominator).toFixed(4) };
}

/** Per-HTF-tier ALIGNED/CONFLICTED/UNAVAILABLE counts, flattened from each record's own `htf_alignment` object (confluence.js's htf_structure_alignment, already computed, never recomputed here). */
function computeHtfAlignmentCounts(records) {
  const counts = {};
  for (const r of records) {
    const alignment = r.htf_alignment;
    if (!alignment || typeof alignment !== 'object') continue;
    for (const [tf, value] of Object.entries(alignment)) {
      if (value == null) continue;
      counts[tf] = counts[tf] ?? {};
      counts[tf][value] = (counts[tf][value] ?? 0) + 1;
    }
  }
  return counts;
}

/** Unique/confirmed/invalidated/missed setup counts, by distinct setup_id -- a setup counts as "confirmed"/"invalidated"/"missed" if ANY of its observed records ever reached that pre_entry_state. */
function computeSetupCounts(records) {
  const statesBySetup = new Map();
  for (const r of records) {
    if (!r.setup_id) continue;
    if (!statesBySetup.has(r.setup_id)) statesBySetup.set(r.setup_id, new Set());
    statesBySetup.get(r.setup_id).add(r.pre_entry_state);
  }
  let confirmed = 0, invalidated = 0, missed = 0;
  for (const states of statesBySetup.values()) {
    if (states.has('CONFIRMED')) confirmed += 1;
    if (states.has('INVALIDATED')) invalidated += 1;
    if (states.has('MISSED')) missed += 1;
  }
  return { unique_setups: statesBySetup.size, confirmed_setups: confirmed, invalidated_setups: invalidated, missed_setups: missed };
}

/**
 * Stage 6, Part 4-6: per-entry-timeframe candidate-blocked-by counts,
 * from each record's OPTIONAL, additive `candidates` object (see
 * src/engine/anticipationStore.js's recordAnticipationObservation()).
 * Records with no `candidates` (pre-Stage-6 rows, or a caller that never
 * passed candidate data) are simply excluded -- never bucketed as a fake
 * "unknown" timeframe. Generic/unbounded over whatever timeframe keys and
 * `blocked_by` reason strings actually appear, exactly like every other
 * counter in this module -- never a hard-coded reason list.
 */
function computeCandidateBlockedByCounts(records) {
  const counts = {};
  for (const r of records) {
    if (!r.candidates || typeof r.candidates !== 'object') continue;
    for (const [tf, c] of Object.entries(r.candidates)) {
      const reason = c?.blocked_by;
      if (reason == null) continue;
      counts[tf] = counts[tf] ?? {};
      counts[tf][reason] = (counts[tf][reason] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Computes the full Stage 3 observability summary from an already-loaded
 * array of observation records. Purely factual counts -- see the module
 * header for what this deliberately never claims.
 */
export function computeOpportunityMetrics(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');

  const waitRecords = records.filter((r) => r.authoritative_action === 'WAIT');

  return {
    total_observations: records.length,
    action_counts: countBy(records, (r) => r.authoritative_action),
    // Real reasons exactly as emitted by the protected engine -- never
    // renamed, and never restricted to a hard-coded list. A brand-new
    // reason string the engine has never produced before is counted the
    // same as any other -- see countBy()'s generic, unbounded keying.
    authoritative_wait_reason_counts: countBy(waitRecords, (r) => r.authoritative_wait_reason),
    pre_entry_state_counts: countBy(records, (r) => r.pre_entry_state),
    transition_counts: countBy(records, (r) => r.transition),
    strategy_family_counts: countBy(records, (r) => r.developing_strategy_family),
    model_coverage_counts: countBy(records, (r) => r.model_coverage),
    regime_counts: countBy(records, (r) => r.regime),
    session_counts: countBy(records, (r) => r.session),
    volatility_state_counts: countBy(records, (r) => r.volatility_state),
    htf_alignment_counts: computeHtfAlignmentCounts(records),
    setup_counts: computeSetupCounts(records),
    // Stage 6, Part 4-6: per-timeframe candidate-blocked-by counts --
    // absent/empty for records with no `candidates` data (see doc above).
    candidate_blocked_by_counts: computeCandidateBlockedByCounts(records),
    // Progression ratios ONLY -- see the module header. Any denominator
    // of zero returns null, never a fabricated percentage.
    transition_ratios: {
      developing_to_armed: transitionRatio(records, 'DEVELOPING', 'ARMED'),
      armed_to_confirmed: transitionRatio(records, 'ARMED', 'CONFIRMED'),
      armed_to_invalidated: transitionRatio(records, 'ARMED', 'INVALIDATED'),
      armed_to_missed: transitionRatio(records, 'ARMED', 'MISSED'),
    },
  };
}
