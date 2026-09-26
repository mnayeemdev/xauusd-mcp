/**
 * STAGE 12F — CAPITAL READINESS DECISION. READ-ONLY. NEVER a lot-sizing activation.
 *
 * Answers "is there sufficient evidence to CONSIDER a capital review?" The strongest possible result is
 * ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW, which changes nothing: production stays at lot 0.01 USER_FIXED,
 * AUTO_SCALING OFF, until a separate explicit owner-approved change is implemented. The ladder below is a
 * PROPOSAL_ONLY / NOT_EXECUTION_AUTHORITY / OWNER_APPROVAL_REQUIRED illustration and can never be consumed
 * by execution code (this module is outside src/ and is reachable by no executor; static-tested).
 */
import { EVALUATION_RULE_VERSION, STAGE12F_STATUS, STAGE12D_STATUS, STAGE12E_STATUS, CAPITAL_PREREQUISITES, CAPITAL_LADDER_LABELS, CAPITAL_LADDER_RULE, RESAMPLING } from './rules.js';
import { summarize, monteCarloDrawdown, percentile, r4, breakdown } from './stats.js';
import { assessRealLot, REAL_FIXED_LOT, resolveRealExecutorConfig } from '../../src/engine/mt5RealPolicy.js';

const NA = 'NOT_AVAILABLE';

export function capitalRiskAnalysis({ trades, account = null, market = null, cfg = null }) {
  const completed = trades.filter((t) => t.r_net != null); const rs = completed.map((t) => t.r_net); const usd = completed.map((t) => t.net_usd);
  const sR = rs.length ? summarize(rs) : null; const sU = usd.length ? summarize(usd) : null;
  const mcR = rs.length >= 5 ? monteCarloDrawdown(rs, { seed: RESAMPLING.monte_carlo_seed, paths: RESAMPLING.monte_carlo_paths }) : null;
  const mcU = usd.length >= 5 ? monteCarloDrawdown(usd, { seed: RESAMPLING.monte_carlo_seed, paths: RESAMPLING.monte_carlo_paths }) : null;
  const worst5 = [...usd].sort((a, b) => a - b).slice(0, 5).map(r4); const tail10 = usd.length >= 10 ? r4(usd.filter((x) => x <= percentile(usd, 0.1)).reduce((a, b) => a + b, 0) / Math.max(1, usd.filter((x) => x <= percentile(usd, 0.1)).length)) : NA;
  const conc = (items, key) => { const b = breakdown(items, key, (t) => t.net_usd); const top = b[0]; return top ? { top_key: top.key, top_share_of_net: top.share_of_total, groups: b.length } : NA; };
  const slips = completed.map((t) => t.entry_slippage_usd).filter(Number.isFinite);
  let margin = NA;
  if (account && market && cfg) { try { margin = assessRealLot({ lot: REAL_FIXED_LOT, price: Number(market.ask ?? market.bid), contractSize: 100, leverage: Number(account.leverage), equity: Number(account.equity), freeMargin: Number(account.margin_free ?? account.equity), spreadUsd: Number(market.spread_price ?? 0.26), profitTargetUsd: cfg.profitTargetUsd, maximumLossUsd: cfg.maximumLossUsd, marginCallLevelPct: Number(account.margin_so_call ?? 60), stopOutLevelPct: Number(account.margin_so_so ?? 0), marginBudgetPctOfEquity: cfg.marginBudgetPctOfEquity, marginCallBufferPct: cfg.marginCallBufferPct, lotCeiling: REAL_FIXED_LOT }); } catch (err) { margin = { error: err.message }; } }
  return {
    n: completed.length, r_distribution: sR ? { mean: sR.mean, median: sR.median, stdev: sR.stdev, worst: sR.worst, best: sR.best, p10: r4(percentile(rs, 0.1)), p90: r4(percentile(rs, 0.9)) } : NA,
    usd_distribution: sU ? { mean: sU.mean, net: sU.net, worst: sU.worst, best: sU.best } : NA,
    observed_drawdown: sR ? { max_r: sR.drawdown.max_drawdown, max_usd: sU.drawdown.max_drawdown, max_consecutive_losses: sR.max_consecutive_losses } : NA,
    monte_carlo_r: mcR ?? NA, monte_carlo_usd: mcU ?? NA, tail_losses: { worst_5_usd: worst5, cvar10_usd: tail10 },
    execution_cost_sensitivity: 'see stage12d.primary.cost_scenarios (frozen scenarios; the STAGE12_STRESS scenario is the gate)',
    margin_at_fixed_lot: margin, free_margin_impact: margin && margin.margin_required_usd != null ? { margin_required_usd: margin.margin_required_usd, margin_pct_of_equity: margin.margin_pct_of_equity, margin_level_at_max_loss_pct: margin.margin_level_at_max_loss_pct, equity_at_max_loss: margin.equity_at_max_loss } : NA,
    risk_concentration: { by_model: conc(completed, (t) => t.model), by_session_bucket: conc(completed, (t) => t.session_bucket), by_month: conc(completed, (t) => t.month) },
    gap_slippage_risk: slips.length ? { max_entry_slippage_usd: r4(Math.max(...slips)), p95_entry_slippage_usd: r4(percentile(slips, 0.95)), n: slips.length } : NA,
    extended_losing_sequences: mcR ? { observed_max_consecutive_losses: sR.max_consecutive_losses, monte_carlo_losing_streak_percentiles: mcR.losing_streak_percentiles, probability_of_streak_ge_breaker_2_in_a_day: 'NOT_MODELLED (breaker is per UTC day; requires per-day trade counts)' } : NA,
    assumptions: ['Monte Carlo = i.i.d. resampling of observed trade results (no regime dependence, no autocorrelation)', 'lot fixed at 0.01 throughout', 'costs as recorded (see cost scenarios for stress)', 'nothing here forecasts the future or authorises any exposure change'],
  };
}

/** Hypothetical fixed-lot tiers by equity under the frozen ladder rule. PROPOSAL_ONLY; the system never progresses automatically. */
export function capitalLadderProposal({ equity = null } = {}) {
  const tiers = CAPITAL_LADDER_RULE.tiers_lots.map((lot) => { const maxLoss = CAPITAL_LADDER_RULE.max_loss_usd_per_001_lot * (lot / 0.01); const minEquity = maxLoss / CAPITAL_LADDER_RULE.max_loss_share_of_equity; return { lot, max_loss_usd_per_trade: maxLoss, minimum_equity_usd: minEquity, current_equity_qualifies: equity != null ? equity >= minEquity : null, labels: CAPITAL_LADDER_LABELS, is_current_production_lot: lot === REAL_FIXED_LOT }; });
  return { rule: CAPITAL_LADDER_RULE, current_production_lot: REAL_FIXED_LOT, current_equity_usd: equity, tiers, disclaimer: 'PROPOSAL_ONLY. NOT_EXECUTION_AUTHORITY. OWNER_APPROVAL_REQUIRED. Even when every prerequisite passes, the production lot remains exactly 0.01 until a separate explicit owner-approved change is implemented, tested and re-frozen.' };
}

export function buildStage12F({ stage12d, stage12e, trades, account = null, market = null, fingerprintOk = null, unresolvedP0 = 0, nowSec = Date.now() / 1000 }) {
  let cfg = null, cfgError = null; try { cfg = resolveRealExecutorConfig({}); } catch (err) { cfgError = err.message; }
  const p = stage12d?.primary; const exec = p?.execution_reliability;
  const checks = {
    STAGE12D_EVIDENCE_COMPLETE: p?.evidence_complete === true,
    STAGE12D_EDGE_SUPPORTED: stage12d?.status === STAGE12D_STATUS.EDGE_SUPPORTED,
    STAGE12E_INDEPENDENT_VALIDATION_SUPPORTED: stage12e?.status === STAGE12E_STATUS.SUPPORTED,
    EXECUTION_RELIABILITY_OK: exec?.ok === true,
    DRAWDOWN_KNOWN: p?.drawdown?.max_drawdown_r != null && (p?.counts?.completed ?? 0) >= 60,
    COST_STRESS_OK: p?.gates?.cost_stress_positive?.ok === true,
    WINNER_DEPENDENCE_OK: p?.gates?.without_top5_positive?.ok === true,
    NO_UNRESOLVED_P0: unresolvedP0 === 0,
    STRATEGY_FINGERPRINT_UNCHANGED: fingerprintOk === true,
    REAL_CONFIG_KNOWN: !!cfg && cfg.exactLot === 0.01 && cfg.sizingMode === 'fixed_user_lot' && cfg.computeSizing === undefined,
    EVIDENCE_INTEGRITY_OK: stage12d?.integrity?.ok === true,
  };
  const missing = CAPITAL_PREREQUISITES.filter((k) => checks[k] !== true);
  let status = STAGE12F_STATUS.ELIGIBLE;
  if (!checks.STAGE12D_EVIDENCE_COMPLETE) status = STAGE12F_STATUS.INSUFFICIENT_EVIDENCE;
  else if (!checks.STAGE12D_EDGE_SUPPORTED || !checks.COST_STRESS_OK || !checks.WINNER_DEPENDENCE_OK) status = STAGE12F_STATUS.EDGE_NOT_SUPPORTED;
  else if (!checks.STAGE12E_INDEPENDENT_VALIDATION_SUPPORTED) status = STAGE12F_STATUS.INDEPENDENT_VALIDATION;
  else if (!checks.EXECUTION_RELIABILITY_OK) status = STAGE12F_STATUS.EXECUTION_RELIABILITY;
  else if (missing.length) status = STAGE12F_STATUS.SAFETY;
  const risk = capitalRiskAnalysis({ trades, account, market, cfg });
  return {
    stage: '12F', rule_version: EVALUATION_RULE_VERSION, generated_at: new Date(nowSec * 1000).toISOString(),
    current_capital_policy: { real_lot: REAL_FIXED_LOT, lot_authority: 'USER_FIXED', auto_scaling: 'OFF', sizing_hook_present: cfg ? cfg.computeSizing !== undefined : null, config_error: cfgError, note: 'unchanged by any Stage 12F result' },
    prerequisites: CAPITAL_PREREQUISITES.map((k) => ({ id: k, ok: checks[k] === true })), missing_prerequisites: missing,
    status, capital_scaling_ready: false, owner_capital_review_eligible: status === STAGE12F_STATUS.ELIGIBLE,
    capital_risk_analysis: risk, capital_ladder_proposal: capitalLadderProposal({ equity: account?.equity ?? null }),
    hard_rule: 'CAPITAL_SCALING_READY is never set by software; it can only be considered by the owner after ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW, and even then the production lot stays 0.01 until a separate approved change is implemented.',
  };
}
