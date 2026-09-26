/**
 * STAGE 12 D/E/F — FROZEN EVALUATION RULES (rule version stage12-def-1.0, frozen 2026-09-26 BEFORE any
 * qualifying forward outcome existed). PURE. Read-only. No execution authority.
 *
 * Authority of the gate numbers: the already frozen Stage 12 protocol (src/demo/report.js STAGE12_GATES,
 * docs/XAUUSD_STAGE12_DEMO_FORWARD_PROTOCOL.md §3) and the Stage 11C forward gates (src/shadow/report.js
 * FORWARD_GATES). This module IMPORTS them; it never restates a weaker number. Anything added here only
 * adds a requirement, a disclosure or a measurement; nothing here can lower a threshold.
 *
 * Changing any value in this file is a rule change: bump EVALUATION_RULE_VERSION and record the reason in
 * docs/XAUUSD_STAGE12_FORWARD_EDGE_EVALUATION.md. Thresholds are never tuned after seeing outcomes.
 */
import { STAGE12_GATES } from '../../src/demo/report.js';
import { FORWARD_GATES as SHADOW_FORWARD_GATES } from '../../src/shadow/report.js';

export const EVALUATION_RULE_VERSION = 'stage12-def-1.0';
export const RULES_FROZEN_AT = '2026-09-26T12:30:00.000Z';

/** Provenance vocabularies (closed). Only the FORWARD ones may satisfy a production edge gate. */
export const DEMO_PROVENANCE_FORWARD = 'FORWARD_LIVE_DEMO';
export const SHADOW_PROVENANCE_FORWARD = 'FORWARD_LIVE';
export const REAL_PROVENANCE_FORWARD = 'FORWARD_LIVE_REAL'; // derived label for REAL executor audit rows (supplementary cohort, never mixed with DEMO)
export const GATE_ELIGIBLE_PROVENANCE = Object.freeze([DEMO_PROVENANCE_FORWARD]); // the Stage 12 protocol declares DEMO forward trades as the primary gate evidence
export const NEVER_GATE_PROVENANCE = Object.freeze(['BACKFILL', 'HISTORICAL_REPLAY', 'TEST']);

/** Authoritative minimums (imported, not restated). */
export const MINIMUMS = Object.freeze({
  min_completed_trades: STAGE12_GATES.min_completed_trades, // 60
  min_sessions: STAGE12_GATES.min_sessions, // 40 (UTC days with >= 1 forward signal)
  min_calendar_days: STAGE12_GATES.min_calendar_days, // 90
  min_models_covered: STAGE12_GATES.min_models_covered, // 2
  min_months_with_10_trades: 3, // from the frozen monthly-stability rule (>= 3 months with >= 10 trades)
  min_trades_for_any_statistic: 5, // below this no CI/PF is computed at all (NOT_AVAILABLE)
});

/** Authoritative robustness gates (imported where the protocol declared a number). */
export const ROBUSTNESS = Object.freeze({
  profit_factor_min: STAGE12_GATES.profit_factor_min, // 1.15
  ci_lower_bound_gt: 0, // bootstrap 95% CI lower bound of mean R > 0
  top_winner_removal: STAGE12_GATES.top_winner_removal, // 5 -> mean R without the top 5 winners > 0
  winner_dependence_report_levels: Object.freeze([1, 3, 5]),
  cost_stress_round_trip_usd: STAGE12_GATES.cost_stress_usd, // 0.40 additional round-trip cost
  cost_stress_slippage_usd: 0.10, // additional slippage (protocol §3)
  buy_sell_rule: STAGE12_GATES.buy_sell,
  buy_sell_negative_side_max_share: 0.25,
  monthly_positive_share_min: 0.6,
  model_family_fail_expectancy_R: -0.3, // no family with >= 15 trades and expectancy < -0.3 R
  model_family_fail_min_trades: 15,
  missing_data_max_share: STAGE12_GATES.missing_data_max_share, // 0.10
  execution: STAGE12_GATES.execution, // fill failure <= 5%, median slippage <= 0.30 USD, 0 unreconciled, 0 duplicates
  max_drawdown_policy: STAGE12_GATES.max_drawdown_R, // PREDECLARED_REVIEW_REQUIRED: reported, no number until >= 60 trades exist
});

/** Deterministic cost scenarios. OBSERVED = recorded costs only. STAGE12_STRESS is the frozen gate scenario. ADVERSE is reported, never a gate. */
export const COST_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'OBSERVED', extra_round_trip_usd: 0, extra_slippage_usd: 0, gate: false, note: 'recorded net P&L (broker commission/swap already inside net)' }),
  Object.freeze({ id: 'STAGE12_STRESS', extra_round_trip_usd: ROBUSTNESS.cost_stress_round_trip_usd, extra_slippage_usd: ROBUSTNESS.cost_stress_slippage_usd, gate: true, note: 'frozen Stage 12 cost stress: +0.40 USD round trip +0.10 USD slippage per trade at lot 0.01 (x100 oz)' }),
  Object.freeze({ id: 'ADVERSE', extra_round_trip_usd: 0.80, extra_slippage_usd: 0.20, gate: false, note: 'twice the frozen stress; disclosure only' }),
]);

/** Reproducible resampling. */
export const RESAMPLING = Object.freeze({ bootstrap_seed: 20260926, bootstrap_resamples: 2000, ci_level: 0.95, monte_carlo_seed: 12061926, monte_carlo_paths: 2000 });

/** Evaluation conventions (not trading rules): session buckets by decision hour UTC; UTC day = independent session unit (protocol). */
export const SESSION_BUCKETS = Object.freeze([
  { id: 'ASIA', from_hour: 0, to_hour: 7 }, { id: 'LONDON', from_hour: 7, to_hour: 13 }, { id: 'NEW_YORK', from_hour: 13, to_hour: 21 }, { id: 'LATE', from_hour: 21, to_hour: 24 },
]);
export const NEWS_PROXIMITY_STATES = Object.freeze(['NORMAL', 'PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'DATA_UNAVAILABLE', 'DISABLED', 'UNKNOWN']);

/** R definition (frozen protocol): R = realized NET P&L (USD) / initial broker risk (USD) where risk = |fill - structural stop| x contract 100 x lot 0.01. */
export const R_DEFINITION = Object.freeze({ contract_size: 100, lot: 0.01, formula: 'net_usd / (|fill - structural_stop| * 100 * 0.01)' });

/** Stage 12D statuses. */
export const STAGE12D_STATUS = Object.freeze({ INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE', EDGE_NOT_SUPPORTED: 'EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED', EDGE_SUPPORTED: 'EVIDENCE_COMPLETE_EDGE_SUPPORTED' });
/** Stage 12E statuses. */
export const STAGE12E_STATUS = Object.freeze({ NOT_ELIGIBLE_YET: 'NOT_ELIGIBLE_YET', RUNNING: 'INDEPENDENT_VALIDATION_RUNNING', FAILED: 'INDEPENDENT_VALIDATION_FAILED', SUPPORTED: 'INDEPENDENT_VALIDATION_SUPPORTED' });
/** Stage 12F statuses. The strongest automated conclusion is ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW; it changes no lot. */
export const STAGE12F_STATUS = Object.freeze({ INSUFFICIENT_EVIDENCE: 'NOT_READY_INSUFFICIENT_EVIDENCE', EDGE_NOT_SUPPORTED: 'NOT_READY_EDGE_NOT_SUPPORTED', INDEPENDENT_VALIDATION: 'NOT_READY_INDEPENDENT_VALIDATION', EXECUTION_RELIABILITY: 'NOT_READY_EXECUTION_RELIABILITY', SAFETY: 'NOT_READY_SAFETY_OR_FINGERPRINT', ELIGIBLE: 'ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW' });

/** Stage 11C candidate minimums (imported from the frozen shadow report; repository truth). */
export const SHADOW_GATES = SHADOW_FORWARD_GATES;

/**
 * INDEPENDENCE RULE (12E, frozen): the PRIMARY (development) forward evidence is every FORWARD_LIVE_DEMO trade
 * from the validator start. The INDEPENDENT validation dataset is the set of FORWARD_LIVE_DEMO (or FORWARD_LIVE_REAL,
 * reported separately) trades whose decision time is >= VALIDATION_START_UTC, where VALIDATION_START_UTC is declared
 * ONCE by the owner in validation/stage12/validation_window.frozen.json only AFTER Stage 12D reaches
 * EVIDENCE_COMPLETE_* on the primary dataset, is strictly later than the last primary trade, and is never moved.
 * The independent dataset must itself satisfy the same minimums and gates without any retuning. Stage 11C SC2
 * measures the same production signals as the DEMO validator: it is a cross-check, NOT an independent dataset.
 * SC1 validates its own (non-production) hypothesis under its own frozen gates.
 */
export const INDEPENDENCE = Object.freeze({ window_registry: 'validation/stage12/validation_window.frozen.json', same_minimums_as_primary: true, same_gates_as_primary: true, sc2_is_independent: false });

/** Capital readiness prerequisites (all must hold). Never a lot change. */
export const CAPITAL_PREREQUISITES = Object.freeze(['STAGE12D_EVIDENCE_COMPLETE', 'STAGE12D_EDGE_SUPPORTED', 'STAGE12E_INDEPENDENT_VALIDATION_SUPPORTED', 'EXECUTION_RELIABILITY_OK', 'DRAWDOWN_KNOWN', 'COST_STRESS_OK', 'WINNER_DEPENDENCE_OK', 'NO_UNRESOLVED_P0', 'STRATEGY_FINGERPRINT_UNCHANGED', 'REAL_CONFIG_KNOWN', 'EVIDENCE_INTEGRITY_OK']);
export const CAPITAL_LADDER_LABELS = Object.freeze(['PROPOSAL_ONLY', 'NOT_EXECUTION_AUTHORITY', 'OWNER_APPROVAL_REQUIRED']);
/** Hypothetical ladder rule for the PROPOSAL generator only: the frozen maximum loss per trade (-50 USD at lot 0.01) may not exceed 5% of equity at the proposed fixed lot. */
export const CAPITAL_LADDER_RULE = Object.freeze({ max_loss_share_of_equity: 0.05, max_loss_usd_per_001_lot: 50, tiers_lots: Object.freeze([0.01, 0.02, 0.03, 0.05, 0.10]) });

export function ruleFingerprintInputs() {
  return { EVALUATION_RULE_VERSION, RULES_FROZEN_AT, MINIMUMS, ROBUSTNESS, COST_SCENARIOS, RESAMPLING, SESSION_BUCKETS, R_DEFINITION, INDEPENDENCE, CAPITAL_PREREQUISITES, CAPITAL_LADDER_RULE, SHADOW_GATES, STAGE12_GATES };
}
