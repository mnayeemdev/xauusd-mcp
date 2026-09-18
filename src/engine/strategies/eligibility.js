/**
 * Strategy Eligibility Engine (Part 2 / mission Part C).
 *
 * This module NEVER selects a trade or overrides src/engine/models.js's
 * evaluateModels() (the single, protected, priority-ordered trigger
 * authority: BO > TC > PB > MR > SR, unchanged). It is a purely
 * INFORMATIONAL classification of which named strategy FAMILIES are
 * theoretically eligible given the current regime/structure -- evidence
 * for the confluence report, never a second decision path. Multiple
 * eligible families are reported side by side; this is explicitly NOT
 * majority voting (see confluence.js), just a coarse regime-gated
 * eligibility list mirroring the mission's documented table.
 *
 * Existing model codes (TC/PB/BO/MR/SR) are mapped onto named families
 * for continuity/reporting -- they are not re-derived or re-triggered
 * here, only labeled.
 */

// Mirrors evaluateModels()'s OWN actual regime gates exactly (src/engine/models.js):
//   BO: eligible everywhere except CHOP_UNCERTAIN/TRANSITION (so also in RANGE/HIGH_VOLATILITY)
//   TC/PB: BULL_TREND/BEAR_TREND only
//   MR: RANGE only
//   SR: BULL_TREND/BEAR_TREND/RANGE only (NOT COMPRESSION/HIGH_VOLATILITY)
// This table must stay a faithful restatement of those gates -- it is
// informational eligibility, but it must never contradict what the
// protected model can actually trigger, or computeStrategyEligibility()'s
// own consistency cross-check below would misreport a legitimate trigger
// as "inconsistent".
export const ELIGIBILITY_TABLE = {
  BULL_TREND: ['trend_continuation', 'pullback_continuation', 'trend_pullback_confirmation', 'momentum_continuation', 'breakout', 'breakout_retest', 'structure_break_continuation', 'sr_reaction', 'rejection_reclaim'],
  BEAR_TREND: ['trend_continuation', 'pullback_continuation', 'trend_pullback_confirmation', 'momentum_continuation', 'breakout', 'breakout_retest', 'structure_break_continuation', 'sr_reaction', 'rejection_reclaim'],
  RANGE: ['range_trading', 'sr_reaction', 'mean_reversion', 'liquidity_sweep_reversal', 'rejection_reclaim', 'breakout', 'breakout_retest'],
  COMPRESSION: ['compression_expansion', 'breakout', 'breakout_retest'],
  // TRANSITION and CHOP_UNCERTAIN are intentionally restrictive/empty --
  // this mirrors src/engine/pipeline.js's own existing WAIT-first
  // precedence for these two regimes (checked before any model runs).
  TRANSITION: [],
  CHOP_UNCERTAIN: [],
  // HIGH_VOLATILITY is not in the mission's literal TREND/RANGE/
  // COMPRESSION/TRANSITION table; treated restrictively by design
  // (mean reversion and range strategies are unsafe in abnormal
  // volatility) -- only momentum/breakout families remain eligible.
  HIGH_VOLATILITY: ['momentum_continuation', 'breakout'],
};

const MODEL_TO_FAMILIES = {
  TC: ['trend_continuation', 'structure_break_continuation'],
  PB: ['pullback_continuation', 'trend_pullback_confirmation'],
  BO: ['breakout', 'breakout_retest'],
  MR: ['mean_reversion', 'liquidity_sweep_reversal'],
  SR: ['sr_reaction', 'rejection_reclaim'],
};

export function getEligibleStrategies(regime) {
  return ELIGIBILITY_TABLE[regime] ?? [];
}

export function classifyModelFamilies(model) {
  return MODEL_TO_FAMILIES[model] ?? [];
}

function blockedReasonFor(regime) {
  if (regime == null) return 'regime not yet resolved (insufficient data)';
  if (regime === 'CHOP_UNCERTAIN') return 'CHOP_UNCERTAIN regime: no strategy family is eligible, WAIT is the only valid outcome';
  if (regime === 'TRANSITION') return 'TRANSITION regime: restrictive, no strategy family cleared for entry';
  if (!ELIGIBILITY_TABLE[regime]) return `no eligibility rule defined for regime ${regime}`;
  return null;
}

/**
 * Full eligibility report for the current bar. `selectedModel` (if any)
 * is the model code evaluateModels() ACTUALLY triggered -- passed in only
 * to cross-check consistency for reporting; this function never changes
 * or vetoes it.
 */
export function computeStrategyEligibility({ regime, structure = null, selectedModel = null }) {
  let eligible = [...getEligibleStrategies(regime)];

  // structural_reversal is inherently event-triggered (a genuine
  // character change), not a static regime-bucket family -- added
  // dynamically only when computeStructure() actually reports a fresh
  // CHoCH, on top of whatever the regime table already allows.
  if (structure?.lastEvent?.type === 'CHOCH' && !eligible.includes('structural_reversal')) {
    eligible = [...eligible, 'structural_reversal'];
  }

  const selectedFamilies = selectedModel ? classifyModelFamilies(selectedModel) : [];
  const selectedModelConsistentWithEligibility = selectedModel ? selectedFamilies.some((f) => eligible.includes(f)) : null;

  return {
    regime,
    eligible,
    blocked_reason: eligible.length === 0 ? blockedReasonFor(regime) : null,
    mean_reversion_blocked: !eligible.includes('mean_reversion'),
    selected_model: selectedModel,
    selected_families: selectedFamilies,
    selected_model_consistent_with_eligibility: selectedModelConsistentWithEligibility,
  };
}
