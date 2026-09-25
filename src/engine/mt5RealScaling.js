/**
 * DYNAMIC CAPITAL SCALING for the REAL XAUUSD MCP executor. PURE functions.
 *
 * Runs before EVERY new trade on CURRENT equity:
 *   equity -> risk tier (loss % of equity) -> dollar loss budget
 *          -> lot from the fixed PRICE envelope (rounded DOWN to the broker step)
 *          -> profit target / max loss for THAT lot
 *          -> broker safety (margin, projected margin level at max loss,
 *             margin call, stop-out, spread) with lot stepped DOWN until safe
 *          -> approved sizing, or SIZING_UNSAFE (no trade).
 *
 * Formula (derived from the live-approved ~100 USD baseline: +30 / -50 at
 * lot 0.02 on XAUUSDm, contract 100):
 *   lossPct(E)   = clamp( baselineLossPct * (baselineEquity / E) ^ decay , minLossPct, maxLossPct )
 *                  baselineLossPct = 50 / 100 = 0.50, decay = 0.5 (square-root: risk %
 *                  falls as equity grows -> controlled compounding, never linear leverage-up)
 *   lossBudget   = E * lossPct(E)
 *   lossDistance = baselineMaxLoss / (baselineLot * contract) = 25 USD of price (FIXED)
 *   targetDist   = baselineTarget / (baselineLot * contract) = 15 USD of price (FIXED)
 *   rawLot       = lossBudget / (lossDistance * contract)
 *   lot          = floor(rawLot / step) * step, capped by broker max, config cap, absolute ceiling
 *   maxLoss      = lot * lossDistance * contract     (so -maxLoss == a 25 USD adverse move)
 *   target       = lot * targetDist * contract       (so +target == a 15 USD favourable move)
 *
 * Properties: lot is a NON-DECREASING function of equity, so a loss can only
 * shrink or keep the next lot (no martingale by construction); equity growth
 * scales up sub-linearly; the price envelope stays constant so the 5m engine's
 * trade thesis horizon is unchanged; below the broker minimum lot the system
 * refuses to trade instead of over-risking the remaining equity.
 */

export const SCALING_PARAMS = Object.freeze({
  baselineEquityUsd: 100,
  baselineMaxLossUsd: 50,
  baselineProfitTargetUsd: 30,
  baselineLot: 0.02,
  decayExponent: 0.5,
  minLossPctOfEquity: 0.02,
  maxLossPctOfEquity: 0.50,
  marginBudgetPctOfEquity: 50, // required margin may not exceed this % of equity
  minMarginLevelAtMaxLossPct: 100, // still fully margined when the -maxLoss exit fires
  marginCallBufferPct: 10, // projected margin level must clear margin-call level + this
  minLossDistanceSpreads: 4,
  absoluteLotCeiling: 1.0, // software/math error guard; config may only LOWER it
});

const round2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Floors `lot` to the broker volume step (never rounds up). */
export function floorToStep(lot, step) {
  if (!(step > 0)) return lot;
  const n = Math.floor(lot / step + 1e-9);
  return Math.round(n * step * 1e6) / 1e6;
}

/** Risk tier for a given equity: loss % of equity and the derived dollar budgets. */
export function riskTierForEquity(equity, params = SCALING_PARAMS) {
  const p = params;
  const baselineLossPct = p.baselineMaxLossUsd / p.baselineEquityUsd;
  const rawPct = baselineLossPct * Math.pow(p.baselineEquityUsd / equity, p.decayExponent);
  const lossPct = clamp(rawPct, p.minLossPctOfEquity, p.maxLossPctOfEquity);
  const rewardRatio = p.baselineProfitTargetUsd / p.baselineMaxLossUsd;
  return {
    equity: round2(equity),
    loss_pct_of_equity: Math.round(lossPct * 10000) / 10000,
    raw_loss_pct_unclamped: Math.round(rawPct * 10000) / 10000,
    loss_budget_usd: round2(equity * lossPct),
    target_budget_usd: round2(equity * lossPct * rewardRatio),
    reward_to_risk: rewardRatio,
    formula: `lossPct = clamp(${baselineLossPct} * (${p.baselineEquityUsd}/equity)^${p.decayExponent}, ${p.minLossPctOfEquity}, ${p.maxLossPctOfEquity}); lot = floor(equity*lossPct / (lossDistance*contract), step)`,
  };
}

/** The fixed price envelope implied by the baseline (25 / 15 USD of price at contract 100). */
export function priceEnvelope(contractSize, params = SCALING_PARAMS) {
  return {
    loss_distance_usd: params.baselineMaxLossUsd / (params.baselineLot * contractSize),
    target_distance_usd: params.baselineProfitTargetUsd / (params.baselineLot * contractSize),
  };
}

/**
 * Full sizing decision. All inputs are CURRENT broker facts:
 *   equity, freeMargin, leverage (account), price (ask for BUY / bid for SELL,
 *   any current price is fine for margin), contractSize, volumeMin/Max/Step,
 *   spreadUsd, marginCallLevelPct, stopOutLevelPct (account), lotCap (config).
 */
export function computeDynamicSizing({ equity, freeMargin, price, contractSize = 100, leverage, volumeMin = 0.01, volumeMax = 200, volumeStep = 0.01, spreadUsd = 0, marginCallLevelPct = 60, stopOutLevelPct = 0, lotCap = null, params = SCALING_PARAMS }) {
  const p = params;
  const bad = [];
  for (const [k, v] of Object.entries({ equity, price, contractSize, leverage, volumeMin, volumeStep })) if (!(Number.isFinite(v) && v > 0)) bad.push(k);
  if (!Number.isFinite(freeMargin)) bad.push('freeMargin');
  if (bad.length) return { approved: false, reason: 'SIZING_INPUTS_INVALID', invalid_inputs: bad };

  const tier = riskTierForEquity(equity, p);
  const env = priceEnvelope(contractSize, p);
  const rawLot = (equity * tier.loss_pct_of_equity) / (env.loss_distance_usd * contractSize);
  const ceiling = Math.min(p.absoluteLotCeiling, volumeMax ?? Infinity, lotCap ?? Infinity);
  let lot = floorToStep(Math.min(rawLot, ceiling), volumeStep);
  const cappedBy = rawLot > ceiling ? (ceiling === p.absoluteLotCeiling ? 'ABSOLUTE_CEILING' : ceiling === lotCap ? 'CONFIG_LOT_CAP' : 'BROKER_MAX') : null;

  const base = {
    equity: round2(equity), tier, price_envelope: { loss_distance_usd: round2(env.loss_distance_usd), target_distance_usd: round2(env.target_distance_usd) },
    raw_lot: Math.round(rawLot * 1e4) / 1e4, ceiling_applied: cappedBy, volume_step: volumeStep, volume_min: volumeMin,
  };
  if (lot < volumeMin - 1e-9) {
    return { approved: false, reason: 'LOT_BELOW_BROKER_MIN', detail: `equity ${round2(equity)} supports only ${base.raw_lot} lots at the ${round2(env.loss_distance_usd)} USD loss envelope; broker minimum is ${volumeMin} -- refusing to over-risk`, ...base, step_downs: 0 };
  }

  let stepDowns = 0;
  let lastChecks = null;
  while (lot >= volumeMin - 1e-9) {
    const maximumLossUsd = -round2(lot * env.loss_distance_usd * contractSize);
    const profitTargetUsd = round2(lot * env.target_distance_usd * contractSize);
    const requiredMargin = (lot * contractSize * price) / leverage;
    const marginPct = (requiredMargin / equity) * 100;
    const equityAtMaxLoss = equity + maximumLossUsd;
    const marginLevel = requiredMargin > 0 ? (equityAtMaxLoss / requiredMargin) * 100 : Infinity;
    const checks = {
      margin_within_free_margin: requiredMargin <= freeMargin + 1e-9,
      margin_within_budget: marginPct <= p.marginBudgetPctOfEquity + 1e-9,
      equity_survives_max_loss: equityAtMaxLoss > 0,
      margin_level_at_max_loss_ok: marginLevel >= p.minMarginLevelAtMaxLossPct,
      clears_margin_call: marginLevel >= marginCallLevelPct + p.marginCallBufferPct,
      clears_stop_out: marginLevel > stopOutLevelPct,
      loss_distance_vs_spread: env.loss_distance_usd >= p.minLossDistanceSpreads * (spreadUsd || 0),
      within_absolute_ceiling: lot <= p.absoluteLotCeiling + 1e-9,
    };
    lastChecks = checks;
    if (Object.values(checks).every(Boolean)) {
      return {
        approved: true, reason: 'OK', lot: Math.round(lot * 1e6) / 1e6, profitTargetUsd, maximumLossUsd,
        lossDistanceUsd: round2(env.loss_distance_usd), targetDistanceUsd: round2(env.target_distance_usd),
        requiredMarginUsd: round2(requiredMargin), marginPctOfEquity: round2(marginPct), equityAtMaxLoss: round2(equityAtMaxLoss),
        projectedMarginLevelAtMaxLossPct: round2(marginLevel), step_downs: stepDowns, checks, ...base,
      };
    }
    lot = floorToStep(lot - volumeStep, volumeStep);
    stepDowns += 1;
  }
  return { approved: false, reason: 'SIZING_UNSAFE', detail: 'no lot at or above the broker minimum passes the margin/stop-out safety checks for the current equity', ...base, step_downs: stepDowns, failed_checks: Object.entries(lastChecks ?? {}).filter(([, v]) => !v).map(([k]) => k) };
}

/** Env overrides may only make the model MORE conservative than SCALING_PARAMS. */
export function resolveScalingParams(env = {}, base = SCALING_PARAMS) {
  const p = { ...base };
  const num = (k) => (env[k] === undefined || env[k] === '' ? null : Number(env[k]));
  const maxLoss = num('XAUUSD_MT5_REAL_MAX_LOSS_PCT_OF_EQUITY');
  if (maxLoss != null) { if (!(maxLoss > 0 && maxLoss <= base.maxLossPctOfEquity)) throw new Error(`XAUUSD_MT5_REAL_MAX_LOSS_PCT_OF_EQUITY must be in (0, ${base.maxLossPctOfEquity}]`); p.maxLossPctOfEquity = maxLoss; if (p.minLossPctOfEquity > maxLoss) p.minLossPctOfEquity = maxLoss; }
  const ceiling = num('XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING');
  if (ceiling != null) { if (!(ceiling > 0 && ceiling <= base.absoluteLotCeiling)) throw new Error(`XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING must be in (0, ${base.absoluteLotCeiling}]`); p.absoluteLotCeiling = ceiling; }
  const marginBudget = num('XAUUSD_MT5_REAL_MARGIN_BUDGET_PCT');
  if (marginBudget != null) { if (!(marginBudget > 0 && marginBudget <= base.marginBudgetPctOfEquity)) throw new Error(`XAUUSD_MT5_REAL_MARGIN_BUDGET_PCT must be in (0, ${base.marginBudgetPctOfEquity}]`); p.marginBudgetPctOfEquity = marginBudget; }
  return Object.freeze(p);
}
