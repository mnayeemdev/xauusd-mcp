/**
 * CAPITAL HARVEST MASTER -- percentage-of-equity capital eligibility (PURE, no I/O, no broker calls).
 *
 * Replaces the fixed "-50 USD must be survivable" assumption with the OWNER'S rule:
 *   percentage-of-equity risk budget  +  ACTUAL governed exposure (the protective broker SL that
 *   production really sends: structural stop x 1.5 + spread, plus slippage)  +  margin safety.
 * The lot is NEVER resized (0.01 fixed; AUTO_SCALING OFF). If the minimum lot itself exceeds the
 * budget the answer is NO TRADE -- a valid structural stop is never tightened to make a trade fit.
 *
 * NOT wired into REAL execution. Research (research/capital_harvest_master) and the future
 * CAPITAL_HARVEST_SHADOW consume it; production keeps mt5RealPolicy.assessRealLot until an
 * explicit owner-approved promotion (handoff/CAPITAL_HARVEST_MASTER/REAL_PROMOTION_SPEC.md).
 */
export const RISK_POLICIES_PCT = Object.freeze([1, 2, 3, 5, 7.5, 10]);
export const CAPITAL_DEFAULTS = Object.freeze({ lot: 0.01, contractSize: 100, leverage: 200, structuralMultiple: 1.5, marginBudgetPct: 50, spread: 0.24, slippage: 0.10 });

const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);

/** Governed exposure in USD at the fixed lot: protective SL distance (structural x multiple + spread) plus exit slippage. */
export function governedExposure({ entry, sl, lot = CAPITAL_DEFAULTS.lot, contractSize = CAPITAL_DEFAULTS.contractSize, structuralMultiple = CAPITAL_DEFAULTS.structuralMultiple, spread = CAPITAL_DEFAULTS.spread, slippage = CAPITAL_DEFAULTS.slippage }) {
  const d = Math.abs(Number(entry) - Number(sl));
  const oz = lot * contractSize; // 0.01 lot = 1 oz => 1 USD per 1.00 move
  const structuralLossUsd = d * oz;
  const brokerSlDistance = d * structuralMultiple + spread;
  const brokerSlLossUsd = brokerSlDistance * oz;
  return { stopDistance: r4(d), structuralLossUsd: r2(structuralLossUsd), brokerSlDistance: r4(brokerSlDistance), brokerSlLossUsd: r2(brokerSlLossUsd), exposureUsd: r2(brokerSlLossUsd + slippage * oz) };
}

/**
 * Eligibility of ONE trade at the CURRENT equity under a percentage policy.
 * ELIGIBLE iff exposure <= riskPct% x equity AND margin <= marginBudgetPct% x equity AND
 * (equity - exposure) >= margin (still >= 100 % margin level if the protective stop is hit) AND margin <= free margin.
 */
export function assessCapitalEligibility({ equity, freeMargin = null, price, entry, sl, riskPct, lot = CAPITAL_DEFAULTS.lot, contractSize = CAPITAL_DEFAULTS.contractSize, leverage = CAPITAL_DEFAULTS.leverage, structuralMultiple = CAPITAL_DEFAULTS.structuralMultiple, marginBudgetPct = CAPITAL_DEFAULTS.marginBudgetPct, spread = CAPITAL_DEFAULTS.spread, slippage = CAPITAL_DEFAULTS.slippage }) {
  const reasons = [];
  const E = Number(equity);
  if (!(Number.isFinite(E) && E > 0)) reasons.push('EQUITY_UNKNOWN');
  if (!(Number.isFinite(Number(riskPct)) && riskPct > 0)) reasons.push('RISK_POLICY_UNKNOWN');
  const px = Number(price ?? entry);
  const exp = governedExposure({ entry, sl, lot, contractSize, structuralMultiple, spread, slippage });
  if (!(exp.stopDistance > 0)) reasons.push('INVALID_STOP');
  const margin = Number.isFinite(px) && leverage > 0 ? (px * contractSize * lot) / leverage : null;
  if (margin == null) reasons.push('LEVERAGE_OR_PRICE_UNKNOWN');
  const budget = Number.isFinite(E) ? (E * riskPct) / 100 : null;
  if (reasons.length === 0) {
    if (exp.exposureUsd > budget + 1e-9) reasons.push('CAPITAL_RISK_TOO_HIGH');
    if (margin > (E * marginBudgetPct) / 100 + 1e-9) reasons.push('MARGIN_EXCEEDS_BUDGET');
    if (E - exp.exposureUsd < margin - 1e-9) reasons.push('MARGIN_LEVEL_BELOW_100_AT_STOP');
    if (freeMargin != null && Number.isFinite(Number(freeMargin)) && margin > Number(freeMargin) + 1e-9) reasons.push('MARGIN_EXCEEDS_FREE_MARGIN');
  }
  return {
    eligible: reasons.length === 0, reasons, lot, risk_pct_policy: riskPct, equity: r2(E), risk_budget_usd: r2(budget),
    structural_loss_usd: exp.structuralLossUsd, broker_sl_loss_usd: exp.brokerSlLossUsd, exposure_usd: exp.exposureUsd, stop_distance: exp.stopDistance, broker_sl_distance: exp.brokerSlDistance,
    risk_pct_of_equity: Number.isFinite(E) && E > 0 ? r4((exp.exposureUsd / E) * 100) : null, structural_risk_pct_of_equity: Number.isFinite(E) && E > 0 ? r4((exp.structuralLossUsd / E) * 100) : null,
    margin_required_usd: r2(margin), margin_pct_of_equity: margin != null && E > 0 ? r4((margin / E) * 100) : null, free_margin_after_entry_usd: margin != null ? r2(E - margin) : null,
    margin_level_at_stop_pct: margin ? r2(((E - exp.exposureUsd) / margin) * 100) : null,
    minimum_lot_constraint: reasons.includes('CAPITAL_RISK_TOO_HIGH') ? 'BINDING: 0.01 lot cannot be reduced; NO TRADE' : 'not binding',
  };
}

/** Current production veto (mt5RealPolicy.assessRealLot arithmetic) for side-by-side reporting only. */
export function productionMonetaryVeto({ equity, price, lot = CAPITAL_DEFAULTS.lot, contractSize = CAPITAL_DEFAULTS.contractSize, leverage = CAPITAL_DEFAULTS.leverage, maximumLossUsd = -50, marginCallLevelPct = 60, marginCallBufferPct = 10, marginBudgetPct = 50 }) {
  const margin = (Number(price) * contractSize * lot) / leverage;
  const eAtMax = Number(equity) + maximumLossUsd;
  const lvl = (eAtMax / margin) * 100;
  const reasons = [];
  if (margin / equity > marginBudgetPct / 100) reasons.push('MARGIN_EXCEEDS_BUDGET');
  if (!(eAtMax > 0)) reasons.push('EQUITY_EXHAUSTED_BEFORE_MAX_LOSS');
  if (lvl < 100) reasons.push('MARGIN_LEVEL_AT_MAX_LOSS_BELOW_100');
  if (lvl < marginCallLevelPct + marginCallBufferPct) reasons.push('MARGIN_CALL_BEFORE_MAX_LOSS');
  return { executable: reasons.length === 0, reasons, margin_required_usd: r2(margin), margin_level_at_max_loss_pct: r2(lvl), minimum_equity_usd: r2(Math.abs(maximumLossUsd) + margin) };
}
