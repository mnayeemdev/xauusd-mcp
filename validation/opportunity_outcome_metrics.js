/**
 * Stage 7 Step 2 -- pure, deterministic arithmetic over ALREADY-RESOLVED
 * Opportunity Outcome records (the JSONL rows
 * src/engine/opportunityOutcomeResolver.js's recordOpportunityOutcome()
 * writes). Mirrors validation/opportunity_metrics.js's own precedent
 * exactly: no I/O here (the caller loads records via
 * opportunityOutcomeResolver.js's own loadOutcomeLog() and passes the
 * array in), nothing here generates, infers, repairs, or reorders an
 * outcome record -- everything below is a count or a distribution over
 * facts the resolver already established forward-only.
 *
 * ============================================================
 * THIS MODULE NEVER COMPUTES ACCURACY, WIN RATE, PROFITABILITY, OR
 * EXPECTED RETURN, AND NEVER MAKES A TRADING-PERFORMANCE CLAIM.
 * ============================================================
 * A candidate opportunity is not a trade. "TP1 reached before
 * invalidation" measures whether an OBJECTIVE PRICE LEVEL from an
 * already-recorded, already-labeled candidate zone was later touched --
 * it says nothing about what a real trade placed at that geometry would
 * have returned after spread/slippage/execution. Every ratio below
 * returns `null`, never a fabricated 0, when its denominator is zero.
 *
 * ============================================================
 * OBSERVATION-LEVEL vs. INDEPENDENT-OPPORTUNITY-LEVEL (Stage 7 Step 2
 * hardening -- read before using ANY count below).
 * ============================================================
 * outcome_source_id (src/engine/opportunityOutcomeResolver.js) links to
 * the EXACT Opportunity Ledger observation -- (opportunity_id,
 * confirmed_bar_time, opportunity_state). A single opportunity_id can
 * legitimately produce MANY such observations across its own lifecycle
 * (DEVELOPING -> APPROACHING_ZONE -> ... -> ARMED, etc.), each with its
 * OWN independent outcome record. EVERY count and distribution in this
 * module except `independent_opportunity_count` itself is therefore at
 * the OBSERVATION level, NOT the independent-opportunity level -- do not
 * read `observation_count` as "N opportunities," and do not read any
 * ratio below as "N% of opportunities." There is currently NO defensible,
 * non-arbitrary rule for collapsing several observations of the same
 * opportunity_id into one opportunity-level terminal verdict (which
 * observation's outcome should "count" -- the first ARMED one? the
 * latest? any-touch-wins? all are judgment calls this module refuses to
 * make up), so opportunity-level success/failure classification is
 * DELIBERATELY DEFERRED -- see `opportunity_level_aggregation` below.
 * Never call an observation count a "trade," "opportunity won,"
 * "accuracy," "win rate," or "profitability."
 */

function countBy(records, keyFn) {
  const counts = {};
  for (const r of records) {
    const k = keyFn(r);
    if (k == null) continue;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** Nested count: outer key from groupFn, inner key from valueFn. Records with a null outer or inner key are excluded from that axis, never bucketed as "null". */
function nestedCountBy(records, groupFn, valueFn) {
  const result = {};
  for (const r of records) {
    const group = groupFn(r);
    const value = valueFn(r);
    if (group == null || value == null) continue;
    result[group] = result[group] ?? {};
    result[group][value] = (result[group][value] ?? 0) + 1;
  }
  return result;
}

/** Same as nestedCountBy, but groupFn returns an ARRAY of outer keys (a record can belong to more than one group -- e.g. multiple blocking_conditions on the same record). */
function nestedCountByArrayGroup(records, arrayGroupFn, valueFn) {
  const result = {};
  for (const r of records) {
    const value = valueFn(r);
    if (value == null) continue;
    for (const group of arrayGroupFn(r) ?? []) {
      result[group] = result[group] ?? {};
      result[group][value] = (result[group][value] ?? 0) + 1;
    }
  }
  return result;
}

function ratio(numerator, denominator) {
  if (!denominator) return null;
  return +(numerator / denominator).toFixed(4);
}

// Fixed, purely descriptive histogram edges for zone-width/ATR bucketing.
// NEVER a gate, NEVER a threshold read anywhere else in this codebase --
// changing these bucket edges can only change how this report's own
// histogram groups numbers, never any trading decision.
const ZONE_WIDTH_ATR_BUCKET_EDGES = Object.freeze([0.1, 0.25, 0.5, 1, 2, 5]);
function bucketZoneWidthAtr(multiple) {
  if (!Number.isFinite(multiple)) return null;
  for (const edge of ZONE_WIDTH_ATR_BUCKET_EDGES) if (multiple < edge) return `<${edge}`;
  return `>=${ZONE_WIDTH_ATR_BUCKET_EDGES.at(-1)}`;
}

/**
 * The non-authoritative planning RR (opportunityPlanner.js's
 * computeCandidateRr()) is read under its renamed field
 * (`planning_rr_illustrative`, OUTCOME_LOG_SCHEMA_VERSION 2+), falling
 * back to the legacy `candidate_rr` name for outcome records persisted
 * before the rename -- so this module reads OLD and NEW records
 * identically without rewriting anything on disk. The metric field names
 * below (`candidate_rr_distribution` etc.) are UNCHANGED to avoid
 * breaking existing consumers of this module's own output shape.
 */
function readPlanningRr(record) {
  return Number.isFinite(record.planning_rr_illustrative) ? record.planning_rr_illustrative : record.candidate_rr;
}

/**
 * Computes the full Stage 7 Step 2 outcome observability summary from an
 * already-loaded array of outcome log records. Purely factual counts and
 * distributions -- see the module header for what this deliberately never
 * claims.
 */
export function computeOpportunityOutcomeMetrics(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');

  const terminal = records.filter((r) => r.terminal === true);
  const tp1Reached = terminal.filter((r) => r.tp1?.touched === true);
  const tp2Reached = terminal.filter((r) => r.status === 'TP1_THEN_TP2');
  const invalidationReached = terminal.filter((r) => r.invalidation?.touched === true);
  const independentOpportunityIds = new Set(records.map((r) => r.opportunity_id).filter((id) => id != null));

  return {
    // ── Counting-unit disclosure -- see the module header. Read this
    // block before any count/ratio further down. ──
    observation_count: records.length,
    independent_opportunity_count: independentOpportunityIds.size,
    // Deliberately NOT computed -- see the module header for why
    // inventing a per-opportunity terminal verdict would be a favorable-
    // outcome-selection rule, not a measurement. Every field below this
    // point is observation-level only.
    opportunity_level_aggregation: 'DEFERRED_NOT_YET_DEFENSIBLE',

    resolved_count: terminal.length,
    unresolved_count: records.length - terminal.length,

    // Observation-level status counts (NOT independent-opportunity counts).
    status_counts: countBy(records, (r) => r.status),

    // Requested counts (mission Stage 7 Step 2, G5) -- all OBSERVATION-level.
    tp1_before_invalidation_count: tp1Reached.length,
    tp2_reached_count: tp2Reached.length,
    invalidation_before_tp1_count: terminal.filter((r) => r.status === 'INVALIDATED_BEFORE_TP1').length,
    ambiguous_same_bar_count: terminal.filter((r) => r.status === 'AMBIGUOUS_SAME_BAR').length,

    // Observation-level outcome counts grouped by direction / source
    // timeframe / opportunity
    // lifecycle state at observation / blocking condition -- generic and
    // unbounded, like validation/opportunity_metrics.js's own counters:
    // never a hard-coded status/condition list.
    outcome_status_by_direction: nestedCountBy(records, (r) => r.direction, (r) => r.status),
    outcome_status_by_source_timeframe: nestedCountBy(records, (r) => r.source_timeframe, (r) => r.status),
    outcome_status_by_observation_state: nestedCountBy(records, (r) => r.observation_opportunity_state, (r) => r.status),
    outcome_status_by_blocking_condition: nestedCountByArrayGroup(records, (r) => r.blocking_conditions, (r) => r.status),

    // Raw distributions (never aggregated into a claim of accuracy/
    // performance) -- the caller decides how to summarize/plot these.
    bars_to_tp1_distribution: tp1Reached.map((r) => r.tp1.bars_elapsed),
    bars_to_invalidation_distribution: invalidationReached.map((r) => r.invalidation.bars_elapsed),
    candidate_rr_distribution: records.map(readPlanningRr).filter((v) => Number.isFinite(v)),
    zone_width_atr_distribution: records.map((r) => r.zone_width_atr_multiple).filter((v) => Number.isFinite(v)),

    // Candidate RR validation support (mission Stage 7 Step 2): buckets
    // every recorded candidate_rr by the SAME zone's own width relative to
    // ATR at observation time -- read-only measurement sufficient to LATER
    // distinguish (A) plausible, (B) narrow-zone-driven and potentially
    // misleading, or (C) a repeated pattern worth planner review. This
    // module makes none of those three judgments itself -- it only exposes
    // the distribution a human/Step 3 review would need to make one.
    zone_width_atr_bucket_counts: countBy(records, (r) => bucketZoneWidthAtr(r.zone_width_atr_multiple)),
    candidate_rr_by_zone_width_atr_bucket: (() => {
      const buckets = {};
      for (const r of records) {
        const bucket = bucketZoneWidthAtr(r.zone_width_atr_multiple);
        const planningRr = readPlanningRr(r);
        if (bucket == null || !Number.isFinite(planningRr)) continue;
        (buckets[bucket] ??= []).push(planningRr);
      }
      return buckets;
    })(),

    // Progression ratios ONLY -- see the module header. A zero denominator
    // returns null, never a fabricated percentage.
    tp1_reach_ratio: ratio(tp1Reached.length, terminal.length),
    tp2_reach_ratio: ratio(tp2Reached.length, tp1Reached.length),
  };
}
