/**
 * Pre-Entry Opportunity Planner (additive upgrade on top of the frozen
 * Stage 1+2 anticipation engine, Stage 6).
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION AND NEVER
 * PRODUCES BUY/SELL. `decision` is calculateEntry()'s already-computed,
 * already-gated result (the single protected authority); `anticipation`
 * is Stage 1+2's already-computed pre-entry relabeling
 * (src/engine/anticipation.js, UNCHANGED, PROTECTED). This module
 * REUSES both verbatim wherever they already answer a question (direction,
 * strategy family, model, trigger/confirmation requirements, supporting/
 * opposing evidence, target room) and only ADDS what neither of them
 * currently computes: an objective candidate ENTRY ZONE (a price range,
 * not a single point), the current bar's objective INTERACTION with that
 * zone (approaching/touched/rejected/broken), and PROVISIONAL (never
 * final) candidate risk geometry (entry zone / invalidation / TP1 / TP2 /
 * RR) so a genuinely-developing-but-not-yet-acceptable candidate (e.g. a
 * real 15m SELL blocked by RR_NOT_ACCEPTABLE) can be asked "where could
 * this become favorable?" without ever answering that question by
 * loosening a protected gate.
 *
 * PURE FUNCTION CONTRACT, same as anticipation.js: no CDP calls, no file
 * I/O, no persistence, no notifications, no TradingView mutation. Every
 * input is a plain already-computed object (or the SAME confirmed-bars
 * array xauusd_analyze_market.js's computeEvidence() already consumed --
 * `primaryBars`, used here ONLY to read the single latest confirmed bar's
 * OHLC for interaction classification, never a second sweep, never a
 * bar beyond what the caller's own snapshot already contains). This
 * structurally guarantees NO FUTURE LEAKAGE: the same `primaryBars`
 * snapshot (whatever length it is) always produces the identical plan,
 * regardless of what happens to any other bars array elsewhere -- see
 * tests/engine_opportunity_planner.test.js's "no future leakage" suite.
 *
 * NEVER a second trade-decision engine: `computeOpportunityPlan()` never
 * converts its own provisional geometry into `decision.entry/sl/tp1/tp2`.
 * When `decision.action` is already BUY/SELL, this returns
 * `status: 'SUPERSEDED_BY_CONFIRMED_TRADE'` with NO candidate geometry at
 * all -- the caller must use `decision`'s own exact fields, never this
 * module's.
 */
import { RISK_PARAMS } from './risk.js';
import { BREAKOUT_PARAMS } from './breakout.js';
import { distanceInAtr } from './volatility.js';

// 1.1.0: renamed the non-authoritative planning RR field from
// `candidate_rr` to `planning_rr_illustrative` (RR naming-ambiguity fix,
// see docs/XAUUSD_LIVE_RUNTIME.md) -- no other field, no calculation.
export const OPPORTUNITY_PLAN_SCHEMA_VERSION = '1.1.0';

// Planner-owned lifecycle vocabulary (additive -- Stage 1+2's own
// ANTICIPATION_STATES in anticipation.js is NEVER modified or reused as
// this module's own state names; a couple of names overlap on purpose
// where the concept is genuinely identical -- ARMED/CONFIRMED/MISSED/
// INVALIDATED -- but CONFIRMATION_PENDING there and here can diverge in
// meaning slightly since this module also folds in objective zone-
// interaction evidence Stage 1+2 does not compute at all).
export const OPPORTUNITY_STATES = Object.freeze([
  'DEVELOPING',
  'APPROACHING_ZONE',
  'ZONE_TOUCHED',
  'REACTION_PENDING',
  'CONFIRMATION_PENDING',
  'ARMED',
  'CONFIRMED',
  'MISSED',
  'INVALIDATED',
]);

// NO_LONGER_RELEVANT is intentionally NOT emitted by this implementation
// pass -- every state transition above is derived from an objective,
// already-computed signal (anticipation.state or a zone interaction).
// "No longer relevant" would require a subjective judgment call this
// module has no objective evidence to make yet (e.g. "the setup is still
// technically alive but nobody cares anymore"); left as a documented,
// deliberately deferred vocabulary member rather than fabricated.
export const RESERVED_UNUSED_STATES = Object.freeze(['NO_LONGER_RELEVANT']);

export const INTERACTION_STATES = Object.freeze(['APPROACHING', 'WICK_TOUCH', 'BODY_TOUCH', 'REJECTION', 'BROKEN']);

// Reused verbatim from the SAME constant anticipation.js already uses for
// its own "how close counts as approaching" threshold -- never a second,
// divergent tolerance invented for this module.
const APPROACH_ZONE_ATR_TOL = BREAKOUT_PARAMS.retestAtrTol;

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

function emptyGeometry() {
  return {
    setup_family: null, setup_model: null, opportunity_state: null,
    zone: null, distance_to_zone: null, interaction_state: null,
    candidate_entry_zone: null, provisional_invalidation: null,
    candidate_tp1: null, candidate_tp2: null, planning_rr_illustrative: null,
    confirmation_required: [], confirmation_observed: [], blocking_conditions: [],
    supporting_evidence: [], alternate_scenario: null,
  };
}

/**
 * Objective zone ranking (mission Section 8): supply/demand zone (most
 * specific "area" evidence) > nearest fresh support/resistance > opposing
 * structural swing (retest target) > nearest liquidity pool. Every
 * candidate is filtered to the correct SIDE of current price for the
 * requested direction (overhead for a SELL/BEARISH plan, below for a
 * BUY/BULLISH plan) -- a zone entirely already passed through is never
 * selected. Returns the single nearest valid candidate at the
 * highest-priority tier that has one, or null (never invents a zone).
 */
function selectOpportunityZone({ direction, evidence, currentPrice }) {
  if ((direction !== 'BULLISH' && direction !== 'BEARISH') || !Number.isFinite(currentPrice)) return null;
  const isSell = direction === 'BEARISH';
  const sideValid = (low, high) => (isSell ? high >= currentPrice : low <= currentPrice);
  const nearDistance = (low, high) => (isSell ? Math.max(0, low - currentPrice) : Math.max(0, currentPrice - high));

  // Tier 1: supply/demand zone.
  const wantSdDirection = isSell ? 'supply' : 'demand';
  const sdZones = (evidence?.levelsContext?.supplyDemandZones ?? [])
    .filter((z) => z.direction === wantSdDirection && z.state !== 'INVALIDATED' && sideValid(z.zone_low, z.zone_high));
  if (sdZones.length) {
    const nearest = sdZones.reduce((best, z) => {
      const dist = nearDistance(z.zone_low, z.zone_high);
      return !best || dist < best.dist ? { z, dist } : best;
    }, null);
    return { type: `${wantSdDirection}_zone`, lower: round2(nearest.z.zone_low), upper: round2(nearest.z.zone_high), source: 'levels.js supplyDemandZones', zone_state: nearest.z.state };
  }

  // Tier 2: nearest fresh support/resistance (point-precision -- exposed as a zero-width zone, never fabricated width).
  const srCandidate = isSell ? evidence?.levelsContext?.nearestResistance : evidence?.levelsContext?.nearestSupport;
  if (srCandidate && Number.isFinite(srCandidate.price) && sideValid(srCandidate.price, srCandidate.price)) {
    return { type: srCandidate.type ?? (isSell ? 'resistance' : 'support'), lower: round2(srCandidate.price), upper: round2(srCandidate.price), source: 'levels.js nearestSupport/nearestResistance', zone_state: srCandidate.fresh ? 'FRESH' : 'TOUCHED' };
  }

  // Tier 3: opposing structural swing (retest target) -- same swing anticipation.js's own buildAlternateScenario() reads, reused for consistency.
  const swing = isSell ? evidence?.structure?.lastSwingHigh : evidence?.structure?.lastSwingLow;
  if (swing && Number.isFinite(swing.price) && sideValid(swing.price, swing.price)) {
    return { type: `structural_${swing.label ?? 'swing'}`, lower: round2(swing.price), upper: round2(swing.price), source: 'structure.js lastSwingHigh/lastSwingLow', zone_state: 'STRUCTURAL' };
  }

  // Tier 4: nearest liquidity pool (equal highs/lows).
  const pools = isSell ? evidence?.liquidityContext?.equalHighs : evidence?.liquidityContext?.equalLows;
  if (Array.isArray(pools) && pools.length) {
    const valid = pools.filter((p) => Number.isFinite(p.price) && sideValid(p.price, p.price));
    if (valid.length) {
      const nearest = valid.reduce((best, p) => {
        const dist = nearDistance(p.price, p.price);
        return !best || dist < best.dist ? { p, dist } : best;
      }, null);
      return { type: 'liquidity_pool', lower: round2(nearest.p.price), upper: round2(nearest.p.price), source: 'liquidity.js equalHighs/equalLows', zone_state: 'POOL' };
    }
  }

  return null;
}

/** ATR-relative distance from current price to the zone's NEAR edge (the edge price reaches first). Never a fixed dollar distance. */
function computeDistanceToZone({ zone, direction, currentPrice, atrValue }) {
  if (!zone || !Number.isFinite(currentPrice)) return null;
  const nearEdge = direction === 'BEARISH' ? zone.lower : zone.upper;
  return { absolute: round2(Math.abs(nearEdge - currentPrice)), atr_multiple: round2(distanceInAtr(currentPrice, nearEdge, atrValue)) };
}

/**
 * Objective interaction classification (mission Section 11) from the
 * SINGLE latest confirmed bar's own OHLC against the selected zone --
 * never a subjective "looks bullish" judgment. `hasSupportingEvidence`
 * (already-computed candlestick/pattern bias matching the plan's
 * direction, from anticipation.js's own buildSupportingOpposing() output
 * -- reused verbatim, never recomputed) is what distinguishes an
 * unconfirmed WICK_TOUCH from an evidenced REJECTION.
 */
function classifyInteraction({ zone, direction, latestBar, hasSupportingEvidence }) {
  if (!zone || !latestBar) return null;
  const { lower, upper } = zone;
  const touched = latestBar.high >= lower && latestBar.low <= upper;
  if (!touched) return 'APPROACHING';
  const brokenThrough = direction === 'BEARISH' ? latestBar.close > upper : latestBar.close < lower;
  if (brokenThrough) return 'BROKEN';
  const bodyLow = Math.min(latestBar.open, latestBar.close);
  const bodyHigh = Math.max(latestBar.open, latestBar.close);
  const bodyInZone = bodyHigh >= lower && bodyLow <= upper;
  if (bodyInZone) return 'BODY_TOUCH';
  return hasSupportingEvidence ? 'REJECTION' : 'WICK_TOUCH';
}

/**
 * Planner-owned lifecycle state (mission Section 9/23). Defers to
 * anticipation.state (Stage 1+2, the protected engine's own gate
 * proximity) for the advanced states it already computes precisely
 * (CONFIRMATION_PENDING/ARMED/CONFIRMED/MISSED/INVALIDATED) -- this
 * module never second-guesses those. Below that, this module's OWN
 * zone-interaction evidence resolves the earlier states, since
 * anticipation.js currently has no concept of supply/demand-zone
 * interaction at all.
 */
function resolveOpportunityState({ anticipationState, interactionState, withinApproachAtr }) {
  if (anticipationState === 'CONFIRMED') return 'CONFIRMED';
  if (anticipationState === 'ARMED') return 'ARMED';
  if (anticipationState === 'CONFIRMATION_PENDING') return 'CONFIRMATION_PENDING';
  if (anticipationState === 'MISSED') return 'MISSED';
  if (anticipationState === 'INVALIDATED') return 'INVALIDATED';
  if (interactionState === 'BROKEN') return 'INVALIDATED';
  if (interactionState === 'REJECTION') return 'REACTION_PENDING';
  if (interactionState === 'BODY_TOUCH' || interactionState === 'WICK_TOUCH') return 'ZONE_TOUCHED';
  if (withinApproachAtr) return 'APPROACHING_ZONE';
  return 'DEVELOPING';
}

/** Beyond the zone's FAR edge (mission Section 17) -- never a fabricated stop distance. */
function computeProvisionalInvalidation({ zone, direction }) {
  if (!zone) return null;
  const level = direction === 'BEARISH' ? zone.upper : zone.lower;
  const side = direction === 'BEARISH' ? 'above' : 'below';
  return { level, condition: `confirmed close ${side} ${level} (beyond the ${zone.type} zone)` };
}

/** candidate_tp1 = nearest opposing level (fresh, objective); candidate_tp2 = anticipation's OWN already-computed target_room.structural_objective, reused verbatim (mission Section 18 -- never recomputed, never fabricated). */
function computeCandidateTargets({ direction, evidence, anticipation }) {
  const nearLevel = direction === 'BEARISH' ? evidence?.levelsContext?.nearestSupport : evidence?.levelsContext?.nearestResistance;
  const candidate_tp1 = Number.isFinite(nearLevel?.price) ? round2(nearLevel.price) : null;
  const structuralObjective = anticipation?.primary_scenario?.target_room?.structural_objective;
  const candidate_tp2 = Number.isFinite(structuralObjective) ? structuralObjective : null;
  return { candidate_tp1, candidate_tp2 };
}

/**
 * Planning-only RR (mission Section 19): reward/risk using the zone's NEAR
 * edge as the reference entry, candidate_tp1 as reward, provisional_
 * invalidation as risk. Never authoritative; never used to gate/alter the
 * protected decision.
 *
 * NAMING (RR forensic audit, see docs/XAUUSD_LIVE_RUNTIME.md): this value
 * is persisted as `planning_rr_illustrative`, deliberately distinct from
 * `xauusd_analyze_market.js`'s `authoritative_candidate_rr` (risk.js's own
 * real RR). Both were previously named `candidate_rr`, which made them
 * indistinguishable in the persisted logs -- do not reintroduce that name
 * for either value.
 */
function computeCandidateRr({ zone, direction, candidateTp1, provisionalInvalidation }) {
  if (!zone || !Number.isFinite(candidateTp1) || !provisionalInvalidation || !Number.isFinite(provisionalInvalidation.level)) return null;
  const nearEdge = direction === 'BEARISH' ? zone.lower : zone.upper;
  const risk = Math.abs(nearEdge - provisionalInvalidation.level);
  if (risk === 0) return null;
  const reward = Math.abs(candidateTp1 - nearEdge);
  return round2(reward / risk);
}

/**
 * Alternate opportunity (mission Section 21): only built when
 * anticipation.js's OWN alternate_scenario is already objectively
 * non-null AND an objective zone exists for that alternate direction --
 * never forced. Deliberately lighter than the primary (direction + zone
 * + basis only) -- the primary already carries the full candidate
 * geometry depth this module exists to add.
 */
function buildAlternatePlan({ anticipationAlternate, evidence, currentPrice }) {
  if (!anticipationAlternate?.direction) return null;
  const zone = selectOpportunityZone({ direction: anticipationAlternate.direction, evidence, currentPrice });
  if (!zone) return null;
  return { direction: anticipationAlternate.direction, zone, basis: anticipationAlternate.basis ?? null };
}

/**
 * Computes the additive `pre_entry_plan` object. `primaryBars` is the
 * SAME confirmed-bars array xauusd_analyze_market.js's computeEvidence()
 * already received -- passed through only to read the single latest
 * confirmed bar's OHLC (see module header on no-future-leakage).
 */
export function computeOpportunityPlan({ decision, evidence, anticipation, primaryBars } = {}) {
  const symbol = decision?.symbol ?? null;
  const source_timeframe = decision?.diagnostics?.source_timeframe ?? null;
  const latestBar = Array.isArray(primaryBars) && primaryBars.length ? primaryBars[primaryBars.length - 1] : null;
  const generated_from_bar_time = latestBar?.time ?? null;
  const base = { schema_version: OPPORTUNITY_PLAN_SCHEMA_VERSION, symbol, source_timeframe, generated_from_bar_time };

  if (!decision || !anticipation) {
    return { ...base, status: 'NO_PLAN', reason: 'MISSING_INPUT', direction: null, ...emptyGeometry() };
  }

  if (decision.action === 'BUY' || decision.action === 'SELL') {
    return {
      ...base, status: 'SUPERSEDED_BY_CONFIRMED_TRADE', reason: null,
      direction: decision.action === 'BUY' ? 'BULLISH' : 'BEARISH',
      ...emptyGeometry(),
      setup_family: anticipation.developing_strategy_family ?? null,
      setup_model: decision.setup ?? null,
      opportunity_state: 'CONFIRMED',
      note: "Authoritative trade already confirmed -- use decision.entry/sl/tp1/tp2/rr verbatim, never this planner's own geometry.",
    };
  }

  const scenario = anticipation.primary_scenario;
  const direction = anticipation.direction;
  if (!scenario || !direction) {
    return { ...base, status: 'NO_PLAN', reason: anticipation.authoritative_wait_reason ?? decision.reason ?? 'NO_OBJECTIVE_SETUP', direction: null, ...emptyGeometry() };
  }

  const currentPrice = evidence?.sessionContext?.current?.last_close ?? latestBar?.close ?? null;
  const atrValue = evidence?.volatilityContext?.atrValue ?? null;

  const zone = selectOpportunityZone({ direction, evidence, currentPrice });
  if (!zone) {
    return {
      ...base, status: 'NO_PLAN', reason: 'NO_OBJECTIVE_ZONE_AVAILABLE', direction, ...emptyGeometry(),
      setup_family: anticipation.developing_strategy_family ?? null, setup_model: scenario.mapped_model_code ?? null,
    };
  }

  const distance_to_zone = computeDistanceToZone({ zone, direction, currentPrice, atrValue });
  const withinApproachAtr = distance_to_zone?.atr_multiple != null && distance_to_zone.atr_multiple <= APPROACH_ZONE_ATR_TOL;
  const hasSupportingEvidence = (scenario.supporting_evidence?.length ?? 0) > 0;
  const interaction_state = classifyInteraction({ zone, direction, latestBar, hasSupportingEvidence });
  const opportunity_state = resolveOpportunityState({ anticipationState: anticipation.state, interactionState: interaction_state, withinApproachAtr });

  const provisional_invalidation = computeProvisionalInvalidation({ zone, direction });
  const { candidate_tp1, candidate_tp2 } = computeCandidateTargets({ direction, evidence, anticipation });
  const planning_rr_illustrative = computeCandidateRr({ zone, direction, candidateTp1: candidate_tp1, provisionalInvalidation: provisional_invalidation });

  const blocking_conditions = [];
  if (anticipation.authoritative_wait_reason) blocking_conditions.push(anticipation.authoritative_wait_reason);
  if (Number.isFinite(planning_rr_illustrative) && planning_rr_illustrative < RISK_PARAMS.minRR) blocking_conditions.push(`planning-only RR (${planning_rr_illustrative}) below the protected minimum (${RISK_PARAMS.minRR}) -- illustrative, not the authoritative RR gate`);

  const confirmation_observed = [];
  if (interaction_state === 'BODY_TOUCH' || interaction_state === 'REJECTION') confirmation_observed.push(`price has interacted with the ${zone.type} zone (${interaction_state})`);
  if (interaction_state === 'REJECTION') {
    for (const e of scenario.supporting_evidence ?? []) confirmation_observed.push(`objective rejection evidence: ${e.type} ${e.pattern ?? e.pattern_type ?? ''}`.trim());
  }

  const confirmation_required = [...(scenario.trigger_requirements ?? []), ...(scenario.confirmation_requirements ?? [])];

  const alternate_scenario = buildAlternatePlan({ anticipationAlternate: anticipation.alternate_scenario, evidence, currentPrice });

  return {
    ...base, status: 'PLAN', reason: null, direction,
    setup_family: anticipation.developing_strategy_family ?? null,
    setup_model: scenario.mapped_model_code ?? null,
    opportunity_state,
    zone, distance_to_zone, interaction_state,
    candidate_entry_zone: { lower: zone.lower, upper: zone.upper },
    provisional_invalidation,
    candidate_tp1, candidate_tp2, planning_rr_illustrative,
    confirmation_required, confirmation_observed, blocking_conditions,
    supporting_evidence: scenario.supporting_evidence ?? [],
    alternate_scenario,
  };
}
