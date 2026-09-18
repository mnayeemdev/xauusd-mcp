/**
 * Hierarchical Evidence Fusion (Part 12 / mission Part G).
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. `decision` is
 * an already-computed, already-gated result from
 * src/core/xauusd_calculate.js's calculateEntry() (the single protected
 * authority: regime -> structure -> correction -> model -> risk/RR ->
 * quality -> HTF conflict -> WAIT/BUY/SELL). This function only:
 *   1. Republishes that decision's action/entry/sl/tp1/tp2/rr/quality
 *      VERBATIM -- never recomputed, never overridden, never averaged.
 *   2. Classifies the NEW evidence layers (candlestick/classical
 *      patterns, breakout state, liquidity sweeps) as supporting,
 *      opposing, or purely informational relative to the ALREADY-DECIDED
 *      action -- for explainability only.
 *   3. Restates the mandatory gates the decision already passed/failed,
 *      for visibility -- it does not re-evaluate them.
 *
 * This is explicitly NOT majority voting: supporting/opposing evidence
 * counts are exposed for transparency, but nothing here sums, weights,
 * or thresholds them to flip WAIT into BUY/SELL or vice versa. A WAIT
 * decision surrounded by many "bullish" candlestick/pattern hits stays
 * WAIT; a BUY decision surrounded by some opposing evidence stays BUY,
 * with that opposing evidence preserved and visible, not hidden.
 */

function classify(bias, direction) {
  if (!direction || !bias || bias === 'NEUTRAL') return 'informational';
  return bias === direction ? 'supporting' : 'opposing';
}

function pushClassified(buckets, bucket, item) {
  if (bucket === 'supporting') buckets.supporting.push(item);
  else if (bucket === 'opposing') buckets.opposing.push(item);
}

// Cross-timeframe structure ALIGNMENT is informational only (Part 3's
// "cross-timeframe structure alignment" requirement) -- it restates
// structure_direction values the protected computeHtfContext() already
// put on `decision.timeframes` (never recomputed), it never gates or
// votes. An unavailable HTF tier is reported honestly, never guessed.
const HTF_ALIGNMENT_TIERS = ['1H', '4H', '1D'];
function computeHtfStructureAlignment(primaryStructureState, decisionTimeframes) {
  if (!primaryStructureState || !decisionTimeframes) return null;
  const alignment = {};
  for (const tf of HTF_ALIGNMENT_TIERS) {
    const dir = decisionTimeframes[tf]?.structure_direction;
    alignment[tf] = dir == null ? 'UNAVAILABLE' : dir === primaryStructureState ? 'ALIGNED' : 'CONFLICTED';
  }
  return alignment;
}

// HTF level overlap: does a primary-timeframe S/R level (from levels.js)
// sit near a higher-timeframe range boundary the protected
// computeHtfContext() already reports? Purely descriptive confluence
// evidence -- a coincidence worth surfacing, never a gate.
const HTF_LEVEL_OVERLAP_TOLERANCE_PCT = 0.2;
function computeHtfLevelOverlap(levelsContext, decisionTimeframes) {
  if (!levelsContext || !decisionTimeframes) return null;
  const htfLevels = [];
  for (const tf of HTF_ALIGNMENT_TIERS) {
    const ctx = decisionTimeframes[tf];
    if (Number.isFinite(ctx?.range_high)) htfLevels.push({ tf, boundary: 'range_high', price: ctx.range_high });
    if (Number.isFinite(ctx?.range_low)) htfLevels.push({ tf, boundary: 'range_low', price: ctx.range_low });
  }
  const overlapsFor = (level) => (level ? htfLevels.filter((h) => (Math.abs(h.price - level.price) / h.price) * 100 <= HTF_LEVEL_OVERLAP_TOLERANCE_PCT) : []);
  return {
    nearest_resistance_overlap: overlapsFor(levelsContext.nearestResistance),
    nearest_support_overlap: overlapsFor(levelsContext.nearestSupport),
  };
}

function bucketQuality(quality, qualityThreshold = 65) {
  if (!Number.isFinite(quality)) return null;
  if (quality < qualityThreshold) return 'BELOW_THRESHOLD'; // never actually reaches BUY/SELL -- kept for WAIT/NO_GOOD_ENTRY visibility
  if (quality < 80) return 'GOOD';
  return 'HIGH';
}

function bucketRr(rr, minRR = 1.7) {
  if (!Number.isFinite(rr)) return null;
  if (rr < minRR) return 'BELOW_MIN'; // never actually reaches BUY/SELL -- kept for WAIT/RR_NOT_ACCEPTABLE visibility
  if (rr < 2.0) return 'MIN_TO_2R';
  if (rr < 3.0) return 'TWO_TO_THREE_R';
  return 'THREE_R_PLUS';
}

export function buildConfluenceReport({
  decision, regime = null, structure = null, correction = null, eligibility = null,
  candlestickPatterns = [], classicalPatterns = [], breakoutState = null,
  liquidityContext = null, levelsContext = null, volatilityContext = null,
  sessionContext = null, dailyWeeklyContext = null, decisionTimeframes = null,
}) {
  const action = decision.action;
  const direction = action === 'BUY' ? 'BULLISH' : action === 'SELL' ? 'BEARISH' : null;
  const buckets = { supporting: [], opposing: [] };

  for (const p of candlestickPatterns) {
    pushClassified(buckets, classify(p.bias, direction), { type: 'candlestick', pattern: p.pattern, bias: p.bias, bar_time: p.bar_time });
  }
  for (const p of classicalPatterns) {
    pushClassified(buckets, classify(p.bias, direction), { type: 'classical_pattern', pattern: p.pattern_type, bias: p.bias, completion_state: p.completion_state });
  }
  if (breakoutState?.state && breakoutState.state !== 'NO_BREAKOUT') {
    const bias = breakoutState.evidence?.direction ?? 'NEUTRAL';
    pushClassified(buckets, classify(bias, direction), { type: 'breakout', state: breakoutState.state, bias });
  }
  if (liquidityContext?.sweepReclaim?.swept) {
    const sr = liquidityContext.sweepReclaim;
    const bias = sr.sweepType === 'SWEEP_HIGH' ? 'BEARISH' : sr.sweepType === 'SWEEP_LOW' ? 'BULLISH' : 'NEUTRAL';
    pushClassified(buckets, classify(bias, direction), { type: 'liquidity_sweep', sweep_type: sr.sweepType, reclaimed: sr.reclaimed, bias });
  }

  const mandatory_gates = {
    status: decision.status,
    action: decision.action,
    wait_reason: decision.reason ?? null,
    regime_restrictive: regime === 'CHOP_UNCERTAIN' || regime === 'TRANSITION' ? regime : null,
    correction_active: correction?.state === 'ACTIVE',
    strategy_eligible: eligibility ? eligibility.eligible.length > 0 : null,
    mean_reversion_blocked: eligibility?.mean_reversion_blocked ?? null,
    htf_conflict: decision.diagnostics?.htf_conflict ?? null,
    engine_disagreement: decision.engine_disagreement ?? null,
  };

  const liquidityState = liquidityContext?.sweepReclaim?.swept
    ? (liquidityContext.sweepReclaim.reclaimed ? 'SWEPT_RECLAIMED' : 'SWEPT_PENDING')
    : 'NONE';

  return {
    // Republished verbatim from the protected decision -- never recomputed here.
    action: decision.action,
    reason: decision.reason ?? null,
    entry: decision.entry, sl: decision.sl, tp1: decision.tp1, tp2: decision.tp2, rr: decision.rr, quality: decision.quality,
    setup: decision.setup, timeframe: decision.diagnostics?.source_timeframe ?? null,

    regime, structure_state: structure?.state ?? null, correction_state: correction?.state ?? null,
    strategy_eligibility: eligibility,
    htf_structure_alignment: computeHtfStructureAlignment(structure?.state ?? null, decisionTimeframes),
    htf_level_overlap: computeHtfLevelOverlap(levelsContext, decisionTimeframes),

    mandatory_gates,
    supporting_evidence: buckets.supporting,
    opposing_evidence: buckets.opposing,

    informational_context: {
      classical_patterns: classicalPatterns,
      candlestick_patterns: candlestickPatterns,
      breakout_state: breakoutState,
      liquidity: liquidityContext,
      levels: levelsContext,
      volatility: volatilityContext,
      session: sessionContext,
      daily_weekly: dailyWeeklyContext,
    },

    // Part 17/M -- structured metadata so a COMPLETED signal (once
    // resolved by the existing PASS/FAIL ledger in signalStore.js) could
    // later be grouped/measured along these dimensions. This is schema
    // only: it is NOT wired into any persisted store by this change (see
    // the final report's "FUTURE MEASUREMENT REQUIRED" note) -- computing
    // it here, on every call, never invents a win rate or accuracy claim.
    performance_metadata: {
      strategy: decision.setup ?? null,
      regime,
      timeframe: decision.diagnostics?.source_timeframe ?? null,
      classical_patterns: classicalPatterns.map((p) => p.pattern_type),
      candlestick_patterns: candlestickPatterns.map((p) => p.pattern),
      breakout_state: breakoutState?.state ?? null,
      liquidity_state: liquidityState,
      session: sessionContext?.current?.session ?? null,
      volatility_state: volatilityContext?.state ?? null,
      quality_bucket: bucketQuality(decision.quality),
      rr_bucket: bucketRr(decision.rr),
    },
  };
}
