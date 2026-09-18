/**
 * Pre-entry / anticipation engine (Stage 1 + Stage 2 of the ANTICIPATION +
 * VISUAL MARKET INTELLIGENCE UPGRADE — see docs/XAUUSD_ANTICIPATION.md).
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. `decision` is
 * the already-computed, already-gated result of calculateEntry()
 * (src/core/xauusd_calculate.js) — the single protected authority. This
 * module only RELABELS and ANNOTATES fields that already exist on
 * `decision` and on the evidence layers already computed by
 * src/core/xauusd_analyze_market.js (regime/structure/correction/
 * eligibility/candlesticks/patterns/breakout/liquidity/levels/volatility/
 * session). It recomputes nothing, fetches nothing, persists nothing,
 * mutates nothing.
 *
 * PURE FUNCTION CONTRACT: no CDP calls, no file writes, no notifications,
 * no TradingView mutation, no signal-store access, no network I/O. Every
 * input is a plain already-computed object; every output is derived
 * deterministically from those inputs alone. No lookahead is possible
 * here by construction — this module never sees raw bars, only the
 * confirmed-bar evidence objects the protected pipeline already produced.
 *
 * STATELESS (Stage 1/2): this module has no memory of any previous call.
 * `improving_or_deteriorating` is therefore always 'UNKNOWN_WITHOUT_HISTORY'
 * and INVALIDATED is only ever reported when the CURRENT snapshot itself
 * already contains an objective invalidation signal (e.g. a classical
 * pattern's own completion_state === 'INVALIDATED', or a breakout that has
 * already reversed back through its level). No prior-state history is
 * fabricated or assumed. Persistence, transition tracking, and the
 * opportunity-observability log are explicitly NOT part of this stage.
 *
 * NO PROBABILITIES: nothing in this module's output is a confidence score,
 * a win-rate estimate, or a price prediction. Every field is an objective,
 * currently-observable precondition (or the absence of one).
 */
import { classifyModelFamilies } from './strategies/eligibility.js';
import { distanceInAtr } from './volatility.js';
import { BREAKOUT_PARAMS } from './breakout.js';
import { CORRECTION_PARAMS } from './correction.js';
import { RISK_PARAMS } from './risk.js';
import { QUALITY_PARAMS } from './quality.js';

// ── Public vocabulary ───────────────────────────────────────────────────
export const ANTICIPATION_STATES = Object.freeze([
  'WAIT',
  'DEVELOPING',
  'APPROACHING_ZONE',
  'RETEST_PENDING',
  'RECLAIM_PENDING',
  'CONFIRMATION_PENDING',
  'ARMED',
  'CONFIRMED',
  'MISSED',
  'INVALIDATED',
]);

// 14 named strategy families, per the approved audit (Part F). B = alias/
// extension of one of the five protected models (TC/PB/BO/MR/SR); C/D =
// evidence/eligibility-only today, no code path can independently trigger
// BUY/SELL for these — this module must never let them do so either.
export const EVIDENCE_ONLY_FAMILIES = Object.freeze([
  'momentum_continuation',
  'range_trading',
  'compression_expansion',
  'structural_reversal',
]);

const UNKNOWN_WITHOUT_HISTORY = 'UNKNOWN_WITHOUT_HISTORY';

// Reused verbatim from breakout.js's own "how close counts as touching a
// level" convention (already used identically by models.js's BO retest
// check and breakout.js's own retest check) — not a new threshold invented
// for this module.
const APPROACHING_ZONE_ATR_TOL = BREAKOUT_PARAMS.retestAtrTol;

function round2(n) { return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; }

/** First mapped family for a protected model code, or null. Never invents a family for an unknown code. */
function primaryFamilyForModel(model) {
  if (!model) return null;
  const families = classifyModelFamilies(model);
  return families.length ? families[0] : null;
}

/**
 * The primary timeframe's own raw pipeline model, read directly from
 * `decision.timeframes` (entryTimeframeSummary — always populated from
 * pipelineByTf regardless of what combineTimeframes()'s mtf-level gates
 * did to the top-level `decision.setup`). This recovers the real
 * triggered model for ENTRY_CONFLICT, where combineTimeframes() itself
 * drops `model` from its WAIT return — never a guess, just reading a
 * field that was already computed and already exposed.
 */
function primaryTimeframeModel(decision) {
  const tf = decision?.diagnostics?.source_timeframe ?? '15m';
  return decision?.timeframes?.[tf]?.model ?? null;
}

function primaryTimeframeAction(decision) {
  const tf = decision?.diagnostics?.source_timeframe ?? '15m';
  return decision?.timeframes?.[tf]?.action ?? null;
}

// ── Direction resolution (deterministic, priority-ordered, never guessed) ──
function resolveDirection({ decision, evidence }) {
  if (decision.action === 'BUY') return 'BULLISH';
  if (decision.action === 'SELL') return 'BEARISH';
  const htfBlocked = decision.diagnostics?.htf_conflict?.blocked_action;
  if (htfBlocked === 'BUY') return 'BULLISH';
  if (htfBlocked === 'SELL') return 'BEARISH';
  const disagreementAction = decision.engine_disagreement?.mcp_action;
  if (disagreementAction === 'BUY') return 'BULLISH';
  if (disagreementAction === 'SELL') return 'BEARISH';
  const tfAction = primaryTimeframeAction(decision);
  if (tfAction === 'BUY') return 'BULLISH';
  if (tfAction === 'SELL') return 'BEARISH';
  const breakoutDirection = evidence?.breakoutState?.evidence?.direction;
  if (breakoutDirection === 'BULLISH' || breakoutDirection === 'BEARISH') return breakoutDirection;
  if (evidence?.structure?.state === 'BULLISH' || evidence?.structure?.state === 'BEARISH') return evidence.structure.state;
  return null;
}

// ── RR/quality-gate-blocked classification (RR_NOT_ACCEPTABLE / NO_GOOD_ENTRY) ──
// Deliberately conservative: the actual RR number and quality margin are
// NOT exposed anywhere in `decision`/`evidence` for a blocked WAIT (only
// the pass/fail gate result is), so this never invents a numeric
// closeness threshold. It classifies ONLY from the breakout lifecycle's
// own already-computed discrete state, per the approved correction:
// "if existing data cannot deterministically distinguish the case, use
// the more conservative pending/WAIT classification rather than inventing
// ARMED."
// FAILED_BREAKOUT/FALSE_BREAKOUT (a genuine reversal back through the
// level, not merely a stale one) are handled by the top-level
// resolvePreEntryState() breakout-lifecycle override, independent of
// `reason` -- by the time this function runs, that case is already ruled
// out.
function classifyGateBlocked({ breakoutState }) {
  const state = breakoutState?.state;
  if (state === 'RETEST_HOLD' || state === 'BREAKOUT_CONFIRMED') return 'CONFIRMATION_PENDING';
  return 'DEVELOPING';
}

/** True only when a classical pattern sharing the CURRENT structural bias has already, explicitly, reported its own completion_state as INVALIDATED. Never inferred from price action directly -- patterns.js already computed this. */
function hasDirectionMatchedInvalidatedPattern(classicalPatterns, structureState) {
  if (!Array.isArray(classicalPatterns) || (structureState !== 'BULLISH' && structureState !== 'BEARISH')) return false;
  return classicalPatterns.some((p) => p.completion_state === 'INVALIDATED' && p.bias === structureState);
}

// ── No-candidate classification (NO_ELIGIBLE_STRATEGY) — evidence only ──
function classifyNoCandidateEvidence({ eligibility, breakoutState, liquidityContext, levelsContext, volatilityContext, sessionContext, classicalPatterns, structureState }) {
  if (breakoutState?.state === 'RETEST_TESTING') return 'RECLAIM_PENDING';
  if (liquidityContext?.sweepReclaim?.swept && liquidityContext.sweepReclaim.reclaimed === false) return 'RECLAIM_PENDING';
  if (breakoutState?.state === 'BREAKOUT_FORMING' || breakoutState?.state === 'BREAKOUT_RETEST_PENDING') return 'RETEST_PENDING';
  if (isApproachingFreshLevel({ levelsContext, volatilityContext, sessionContext })) return 'APPROACHING_ZONE';
  if (hasDirectionMatchedInvalidatedPattern(classicalPatterns, structureState)) return 'INVALIDATED';
  if (eligibility?.eligible?.length > 0) return 'DEVELOPING';
  return 'WAIT';
}

function isApproachingFreshLevel({ levelsContext, volatilityContext, sessionContext }) {
  const atrValue = volatilityContext?.atrValue;
  const currentPrice = sessionContext?.current?.last_close;
  if (!Number.isFinite(atrValue) || atrValue <= 0 || !Number.isFinite(currentPrice)) return false;
  for (const level of [levelsContext?.nearestResistance, levelsContext?.nearestSupport]) {
    if (!level || !level.fresh) continue;
    const dist = distanceInAtr(currentPrice, level.price, atrValue);
    if (dist !== null && dist <= APPROACHING_ZONE_ATR_TOL) return true;
  }
  return false;
}

function nearestFreshLevel({ levelsContext, volatilityContext, sessionContext }) {
  const atrValue = volatilityContext?.atrValue;
  const currentPrice = sessionContext?.current?.last_close;
  let best = null;
  let bestDist = null;
  for (const level of [levelsContext?.nearestResistance, levelsContext?.nearestSupport]) {
    if (!level || !level.fresh) continue;
    const dist = Number.isFinite(atrValue) && atrValue > 0 && Number.isFinite(currentPrice) ? distanceInAtr(currentPrice, level.price, atrValue) : null;
    if (best === null || (dist !== null && (bestDist === null || dist < bestDist))) { best = level; bestDist = dist; }
  }
  return best ? { level: best, atrMultiple: bestDist } : null;
}

// ── Top-level pre-entry state resolution ────────────────────────────────
/**
 * WAIT-reason precedence mirrors decision.reason exactly — this function
 * never re-derives or overrides which reason is authoritative, only
 * relabels the ALREADY-CHOSEN reason into a pre-entry state.
 */
function resolvePreEntryState({ decision, evidence }) {
  if (decision.action === 'BUY' || decision.action === 'SELL') return 'CONFIRMED';
  if (decision.status !== 'OK') return 'WAIT'; // DATA_UNAVAILABLE / SYMBOL_NOT_APPROVED -- nothing to anticipate

  const reason = decision.reason;
  const breakoutState = evidence?.breakoutState ?? null;

  // INVALIDATED — the breakout lifecycle itself already reports a genuine
  // reversal back through the level (not merely stale). This is checked
  // independent of `reason` since it can be true regardless of which
  // protected gate is currently cited (NO_ELIGIBLE_STRATEGY,
  // RR_NOT_ACCEPTABLE, NO_GOOD_ENTRY can all coexist with a since-failed
  // breakout on this same anchor). Stateless by construction: this reads
  // the CURRENT snapshot's own already-computed FAILED_BREAKOUT/
  // FALSE_BREAKOUT classification, never a comparison to a prior call.
  if (breakoutState?.state === 'FAILED_BREAKOUT' || breakoutState?.state === 'FALSE_BREAKOUT') return 'INVALIDATED';

  // MISSED — the protected engine already identified this anchor as an
  // already-passed entry opportunity. OVEREXTENDED is the reason the JS
  // engine (src/engine/risk.js) actually emits today; ENTRY_LATE is
  // reserved in the Pine-side contract vocabulary (master_contract.js's
  // WAIT_REASONS) and is handled here too for forward compatibility and
  // vocabulary consistency, even though this engine does not currently
  // produce it (see docs/XAUUSD_ANTICIPATION.md). The breakout
  // lifecycle's own OVEREXTENDED_BREAKOUT state is an objectively-
  // equivalent already-passed-entry condition per the approved
  // correction, and is checked independently of `reason` since it can
  // apply even when the blocking reason is NO_ELIGIBLE_STRATEGY.
  if (reason === 'OVEREXTENDED' || reason === 'ENTRY_LATE') return 'MISSED';
  if (breakoutState?.state === 'OVEREXTENDED_BREAKOUT') return 'MISSED';

  // ARMED — a candidate that already cleared EVERY protected gate
  // (correction resolved, model triggered, RR >= minRR, quality >=
  // threshold — combineTimeframes() only reaches these three WAIT
  // reasons AFTER its own primaryAction was already BUY/SELL) and is
  // blocked by exactly one additional, already-named, confirmatory
  // condition: 1H HTF regime alignment (HTF_CONFLICT), the 30m/5m
  // mtf-level alignment gate (ENTRY_CONFLICT), or Pine/MCP cross-engine
  // agreement (ENGINE_DISAGREEMENT). None of these represent the entry
  // having gone bad — they represent one remaining confirmatory check.
  if (reason === 'HTF_CONFLICT' || reason === 'ENTRY_CONFLICT' || reason === 'ENGINE_DISAGREEMENT') return 'ARMED';

  // RR/quality gate blocked — never automatically ARMED (see approved
  // correction §2). Classified conservatively from the breakout
  // lifecycle's own discrete, already-computed state only.
  if (reason === 'RR_NOT_ACCEPTABLE' || reason === 'NO_GOOD_ENTRY') return classifyGateBlocked({ breakoutState });

  // CORRECTION_ACTIVE — a real, protected, bar-counted confirmatory
  // condition (corrResolveConfirmBars) is the only thing remaining.
  if (reason === 'CORRECTION_ACTIVE') return 'CONFIRMATION_PENDING';

  // HTF_CONTEXT_UNCLEAR — a 15m candidate exists but the higher-timeframe
  // data needed to evaluate the mtf gate is itself unresolved (not a
  // known single condition like HTF_CONFLICT) -- conservative pending,
  // never ARMED.
  if (reason === 'HTF_CONTEXT_UNCLEAR') return 'CONFIRMATION_PENDING';

  // NO_ELIGIBLE_STRATEGY — no candidate triggered at all; classify purely
  // from evidence (breakout/liquidity/levels/eligibility), never from a
  // fabricated "closest" guess.
  if (reason === 'NO_ELIGIBLE_STRATEGY') {
    return classifyNoCandidateEvidence({
      eligibility: evidence?.eligibility, breakoutState, liquidityContext: evidence?.liquidityContext,
      levelsContext: evidence?.levelsContext, volatilityContext: evidence?.volatilityContext, sessionContext: evidence?.sessionContext,
      classicalPatterns: evidence?.classicalPatterns, structureState: evidence?.structure?.state,
    });
  }

  // CHOP / TRANSITION / INSUFFICIENT_DATA / anything else unrecognized —
  // the regime itself is restrictive (eligibility.js already mirrors this
  // with an empty eligible list); nothing objective is developing.
  return 'WAIT';
}

// ── Developing strategy family (informational only, never a trigger) ────
function resolveDevelopingFamily({ decision, evidence, state }) {
  const explicitModel = decision.setup ?? primaryTimeframeModel(decision);
  if (explicitModel) return primaryFamilyForModel(explicitModel);

  if (state === 'CONFIRMATION_PENDING' && decision.reason === 'CORRECTION_ACTIVE') {
    // pipeline.js only reaches the correction check once regime is
    // BULL_TREND/BEAR_TREND and structure.state is resolved -- the
    // family that would trigger once correction resolves is PB's own
    // pullback family (models.js's PB branch fires immediately on
    // correction.state === 'RESOLVED').
    return primaryFamilyForModel('PB');
  }

  const breakoutState = evidence?.breakoutState;
  if (breakoutState && breakoutState.state !== 'NO_BREAKOUT') return primaryFamilyForModel('BO');

  if (evidence?.liquidityContext?.sweepReclaim?.swept && evidence?.regime === 'RANGE') return classifyModelFamilies('MR')[1] ?? classifyModelFamilies('MR')[0] ?? null;

  if (state === 'APPROACHING_ZONE' && evidence?.eligibility?.eligible?.includes('sr_reaction')) return 'sr_reaction';

  return null;
}

// ── waiting_for / invalidated_if text builders (objective, no fabricated counts) ──
// Dispatches off `state` FIRST (matching resolvePreEntryState()'s own
// priority exactly), with `reason` used only for detail WITHIN that
// state -- never re-derives which state applies, so this can never drift
// from resolvePreEntryState()'s own precedence (e.g. an INVALIDATED
// breakout-override always wins there before CORRECTION_ACTIVE/
// RR_NOT_ACCEPTABLE reason text would otherwise be shown here).
function buildWaitingFor({ state, decision, evidence }) {
  const out = [];
  const reason = decision.reason;

  if (state === 'MISSED') { out.push("a fresh setup with new valid entry geometry (this anchor's entry window has passed)"); return out; }
  if (state === 'INVALIDATED') { out.push('a fresh objective setup to form (this anchor already reversed)'); return out; }

  if (state === 'ARMED') {
    if (reason === 'HTF_CONFLICT') out.push(`1H regime to stop opposing the ${decision.diagnostics?.htf_conflict?.blocked_action ?? 'triggered'} direction`);
    else if (reason === 'ENTRY_CONFLICT') out.push(decision.diagnostics?.conflict ?? 'the opposing multi-timeframe condition to clear');
    else if (reason === 'ENGINE_DISAGREEMENT') out.push('Pine and MCP engines to agree on direction');
    return out;
  }

  if (state === 'CONFIRMATION_PENDING') {
    if (reason === 'CORRECTION_ACTIVE') {
      out.push('protected correction resolution (momentum closing back on the trend side of the fast EMA)');
      out.push(`${CORRECTION_PARAMS.corrResolveConfirmBars}-consecutive-confirmed-bar momentum requirement`);
      out.push('a structural/model trigger once the correction resolves');
    } else if (reason === 'RR_NOT_ACCEPTABLE') {
      out.push(`risk/reward to clear the protected minimum (${RISK_PARAMS.minRR})`);
      out.push('the held retest/structure to translate into acceptable target room');
    } else if (reason === 'HTF_CONTEXT_UNCLEAR') {
      out.push('higher-timeframe (1H+) data to become available for the mtf alignment check');
    } else {
      out.push('a confirmed reclaim beyond the held breakout/retest level');
    }
    return out;
  }

  if (state === 'DEVELOPING') {
    if (reason === 'RR_NOT_ACCEPTABLE') out.push(`risk/reward to clear the protected minimum (${RISK_PARAMS.minRR})`);
    else if (reason === 'NO_GOOD_ENTRY') out.push(`quality score to clear the protected threshold (${QUALITY_PARAMS.qualityThreshold})`);
    else {
      const eligible = evidence?.eligibility?.eligible ?? [];
      out.push(eligible.length ? `a model trigger within regime-eligible families: ${eligible.join(', ')}` : 'a regime-eligible strategy family to emerge');
    }
    return out;
  }

  if (state === 'RETEST_PENDING') { out.push('a confirmed retest of the breakout level'); return out; }
  if (state === 'RECLAIM_PENDING') { out.push('a confirmed reclaim beyond the sweep/retest level'); return out; }
  if (state === 'APPROACHING_ZONE') {
    const nearest = nearestFreshLevel({ levelsContext: evidence?.levelsContext, volatilityContext: evidence?.volatilityContext, sessionContext: evidence?.sessionContext });
    out.push(nearest ? `price to reach and react at ${nearest.level.type} ${nearest.level.price}` : 'price to reach a fresh support/resistance zone');
    return out;
  }

  return out; // WAIT -- nothing objective is developing
}

function buildInvalidatedIf({ state, decision, evidence }) {
  const out = [];
  if (state === 'CONFIRMED' || state === 'MISSED' || state === 'WAIT') return out;

  const structure = evidence?.structure;
  if (structure?.state && (structure.lastSwingLow || structure.lastSwingHigh)) {
    const relevantSwing = structure.state === 'BULLISH' ? structure.lastSwingLow : structure.lastSwingHigh;
    if (relevantSwing) out.push(`structure direction flips against the current ${structure.state} trend (confirmed close beyond ${relevantSwing.label} at ${relevantSwing.price})`);
  }
  if (decision.reason === 'CORRECTION_ACTIVE') out.push('the pullback extends beyond the structural anchor without resuming momentum');
  return out;
}

// ── Primary scenario ─────────────────────────────────────────────────────
function classifyRrFeasibility({ decision, state }) {
  if (state === 'ARMED') return 'LIKELY_ACCEPTABLE'; // RR already cleared the protected gate for this candidate
  if (decision.reason === 'RR_NOT_ACCEPTABLE' || decision.reason === 'OVEREXTENDED' || decision.reason === 'ENTRY_LATE') return 'UNLIKELY'; // protected gate already rejected this candidate's geometry
  return 'UNKNOWN'; // no candidate has been risk-evaluated yet -- never guessed
}

function classifyLateOverextensionRisk({ state, breakoutState }) {
  if (state === 'INVALIDATED') return 'NONE'; // the scenario already failed outright -- overextension risk is moot, not "at risk"
  if (state === 'MISSED') return 'MISSED';
  if (breakoutState?.state === 'OVEREXTENDED_BREAKOUT') return 'MISSED';
  if (!breakoutState || breakoutState.evidence?.overextended_ratio == null) return breakoutState ? 'NONE' : 'UNKNOWN';
  if (breakoutState.evidence.overextended === true) return 'AT_RISK'; // overextended by distance but held/retested, not yet MISSED
  return 'NONE';
}

function buildLocation({ state, evidence }) {
  const breakoutState = evidence?.breakoutState;
  if (breakoutState?.state && breakoutState.state !== 'NO_BREAKOUT') {
    return { type: 'breakout_level', price: evidence.structure?.lastEvent?.level ?? null, source: 'structure.lastEvent / breakout.js' };
  }
  if (state === 'APPROACHING_ZONE') {
    const nearest = nearestFreshLevel({ levelsContext: evidence?.levelsContext, volatilityContext: evidence?.volatilityContext, sessionContext: evidence?.sessionContext });
    if (nearest) return { type: nearest.level.type, price: nearest.level.price, source: 'levels.js' };
  }
  if (evidence?.liquidityContext?.sweepReclaim?.swept) {
    return { type: 'liquidity_sweep_level', price: evidence.liquidityContext.sweepReclaim.level ?? null, source: 'liquidity.js' };
  }
  return null;
}

function buildTriggerRequirements({ state, decision, evidence }) {
  const out = [];
  const breakoutState = evidence?.breakoutState?.state;
  if (breakoutState === 'BREAKOUT_FORMING' || breakoutState === 'BREAKOUT_RETEST_PENDING') out.push('a confirmed retest of the breakout level within the model\'s recency window');
  if (breakoutState === 'RETEST_TESTING' || breakoutState === 'RETEST_HOLD') out.push('a confirmed close reclaiming beyond the breakout level');
  if (decision.reason === 'CORRECTION_ACTIVE') out.push(`${CORRECTION_PARAMS.corrResolveConfirmBars} confirmed bars closing on the trend side of the fast EMA`);
  if (state === 'APPROACHING_ZONE') out.push('price to reach the identified fresh level and react (rejection or reclaim)');
  if (state === 'ARMED') out.push('the single remaining confirmatory condition named in waiting_for');
  return out;
}

function buildConfirmationRequirements({ state, decision }) {
  const out = [];
  if (decision.reason === 'RR_NOT_ACCEPTABLE') out.push(`risk/reward at or above the protected minimum (${RISK_PARAMS.minRR})`);
  if (decision.reason === 'NO_GOOD_ENTRY') out.push(`quality score at or above the protected threshold (${QUALITY_PARAMS.qualityThreshold})`);
  if (state === 'ARMED') out.push('confirmation on the next confirmed bar of the single remaining gate');
  return out;
}

function buildInvalidation({ evidence }) {
  const structure = evidence?.structure;
  if (!structure?.state) return null;
  const relevantSwing = structure.state === 'BULLISH' ? structure.lastSwingLow : structure.lastSwingHigh;
  if (!relevantSwing) return null;
  return { level: relevantSwing.price, condition: `confirmed close beyond ${relevantSwing.label} at ${relevantSwing.price}` };
}

function buildTargetRoom({ direction, evidence }) {
  const structure = evidence?.structure;
  const atrValue = evidence?.volatilityContext?.atrValue;
  const currentPrice = evidence?.sessionContext?.current?.last_close;
  if (!structure || !Number.isFinite(atrValue) || atrValue <= 0 || !Number.isFinite(currentPrice)) return { structural_objective: null, atr_multiple: null };
  const objective = direction === 'BULLISH' ? structure.rangeHigh : direction === 'BEARISH' ? structure.rangeLow : null;
  if (!Number.isFinite(objective)) return { structural_objective: null, atr_multiple: null };
  const inFavorableDirection = direction === 'BULLISH' ? objective > currentPrice : objective < currentPrice;
  if (!inFavorableDirection) return { structural_objective: null, atr_multiple: null };
  return { structural_objective: round2(objective), atr_multiple: round2(distanceInAtr(currentPrice, objective, atrValue)) };
}

function buildDistanceToTrigger({ state, evidence }) {
  const breakoutState = evidence?.breakoutState;
  if (breakoutState?.evidence?.distance_from_level != null) {
    return { absolute: round2(breakoutState.evidence.distance_from_level), atr_multiple: round2(breakoutState.evidence.overextended_ratio) };
  }
  if (state === 'APPROACHING_ZONE') {
    const nearest = nearestFreshLevel({ levelsContext: evidence?.levelsContext, volatilityContext: evidence?.volatilityContext, sessionContext: evidence?.sessionContext });
    if (nearest) return { absolute: round2(nearest.level.distance_from_current), atr_multiple: round2(nearest.atrMultiple) };
  }
  return null;
}

function buildSupportingOpposing({ direction, evidence }) {
  if (!direction) return { supporting: [], opposing: [] };
  const supporting = [];
  const opposing = [];
  const classify = (bias) => (!bias || bias === 'NEUTRAL' ? null : bias === direction ? 'supporting' : 'opposing');
  for (const p of evidence?.candlestickPatterns ?? []) {
    const bucket = classify(p.bias);
    if (bucket === 'supporting') supporting.push({ type: 'candlestick', pattern: p.pattern });
    else if (bucket === 'opposing') opposing.push({ type: 'candlestick', pattern: p.pattern });
  }
  for (const p of evidence?.classicalPatterns ?? []) {
    const bucket = classify(p.bias);
    if (bucket === 'supporting') supporting.push({ type: 'classical_pattern', pattern: p.pattern_type, completion_state: p.completion_state });
    else if (bucket === 'opposing') opposing.push({ type: 'classical_pattern', pattern: p.pattern_type, completion_state: p.completion_state });
  }
  return { supporting, opposing };
}

function buildPrimaryScenario({ state, decision, evidence, direction, developingFamily }) {
  if (state === 'WAIT' || state === 'CONFIRMED') return null;

  const { supporting, opposing } = buildSupportingOpposing({ direction, evidence });
  const model = decision.setup ?? primaryTimeframeModel(decision);
  const targetRoom = buildTargetRoom({ direction, evidence });

  return {
    direction,
    strategy_family: developingFamily,
    mapped_model_code: model,
    state,
    timeframe: decision.diagnostics?.source_timeframe ?? null,
    location: buildLocation({ state, evidence }),
    trigger_requirements: buildTriggerRequirements({ state, decision, evidence }),
    confirmation_requirements: buildConfirmationRequirements({ state, decision }),
    invalidation: buildInvalidation({ evidence }),
    supporting_evidence: supporting,
    opposing_evidence: opposing,
    distance_to_trigger: buildDistanceToTrigger({ state, evidence }),
    target_room: targetRoom,
    potential_rr_feasibility: classifyRrFeasibility({ decision, state }),
    late_overextension_risk: classifyLateOverextensionRisk({ state, breakoutState: evidence?.breakoutState }),
  };
}

// ── Alternate scenario — only when structure.js gives an objective opposing path ──
function buildAlternateScenario({ primaryDirection, evidence }) {
  const structure = evidence?.structure;
  if (!primaryDirection || !structure?.state) return null;
  const relevantSwing = primaryDirection === 'BULLISH' ? structure.lastSwingLow : structure.lastSwingHigh;
  if (!relevantSwing) return null;

  const altDirection = primaryDirection === 'BULLISH' ? 'BEARISH' : 'BULLISH';
  return {
    direction: altDirection,
    strategy_family: 'structural_reversal', // evidence-only family -- see EVIDENCE_ONLY_FAMILIES; never an independent trigger
    mapped_model_code: null,
    state: 'DEVELOPING',
    basis: 'objective opposing structural break of the relevant swing (structure.js CHoCH definition)',
    location: { type: relevantSwing.label, price: relevantSwing.price, source: 'structure.js' },
    trigger_requirements: [`confirmed close beyond ${relevantSwing.label} at ${relevantSwing.price} (would register as a CHoCH against the current ${primaryDirection.toLowerCase()} structure)`],
    invalidation: { level: relevantSwing.price, condition: `price continues to hold on the ${primaryDirection.toLowerCase()} side of ${relevantSwing.price}` },
  };
}

// ── No-trade / neutral context ────────────────────────────────────────────
function buildNoTradeNeutral({ decision, evidence }) {
  return {
    mandatory_gates: {
      status: decision.status,
      wait_reason: decision.reason ?? null,
      htf_conflict: decision.diagnostics?.htf_conflict ?? null,
      engine_disagreement: decision.engine_disagreement ?? null,
    },
    regime: evidence?.regime ?? null,
    why: evidence?.eligibility?.blocked_reason ?? decision.reason ?? 'no actionable setup evidence currently present',
  };
}

/**
 * Computes the additive `anticipation` object for an already-computed
 * `decision` (calculateEntry() result) plus the evidence layers already
 * assembled by xauusd_analyze_market.js's computeEvidence(). Returns null
 * only if `decision` itself is missing (defensive; callers should never
 * hit this in practice).
 */
export function computeAnticipation({ decision, evidence = null } = {}) {
  if (!decision) return null;

  const state = resolvePreEntryState({ decision, evidence });
  const direction = resolveDirection({ decision, evidence });
  const developingFamily = resolveDevelopingFamily({ decision, evidence, state });
  const primaryScenario = buildPrimaryScenario({ state, decision, evidence, direction, developingFamily });
  const alternateScenario = state === 'WAIT' || state === 'CONFIRMED' ? null : buildAlternateScenario({ primaryDirection: direction, evidence });
  const isWaitLike = state !== 'CONFIRMED';

  return {
    state,
    direction,
    developing_strategy_family: developingFamily,
    timeframe: decision.diagnostics?.source_timeframe ?? null,
    authoritative_wait_reason: isWaitLike ? (decision.reason ?? null) : null,
    waiting_for: isWaitLike ? buildWaitingFor({ state, decision, evidence }) : [],
    invalidated_if: isWaitLike ? buildInvalidatedIf({ state, decision, evidence }) : [],
    // Stage 1/2 is stateless -- no prior snapshot exists to compare
    // against, so this is always UNKNOWN_WITHOUT_HISTORY (see module doc).
    improving_or_deteriorating: UNKNOWN_WITHOUT_HISTORY,
    // primaryScenario/alternateScenario are already null for WAIT/CONFIRMED
    // (buildPrimaryScenario's own guard; the ternary computing
    // alternateScenario above) -- assigned directly, not re-checked.
    primary_scenario: primaryScenario,
    alternate_scenario: alternateScenario,
    no_trade_neutral: state === 'WAIT' ? buildNoTradeNeutral({ decision, evidence }) : null,
  };
}
