/**
 * STAGE 12D — FORWARD EDGE EVALUATION (evidence evaluator, NOT an optimiser). PURE given loaded trades.
 * Applies the frozen rules (rules.js) to gate-eligible forward trades and reports every metric the protocol
 * lists, marking anything unsupported by evidence as NOT_AVAILABLE. Statuses:
 *   INSUFFICIENT_EVIDENCE | EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED | EVIDENCE_COMPLETE_EDGE_SUPPORTED
 * EDGE_SUPPORTED requires EVERY gate; POINT_ESTIMATE_POSITIVE is reported separately from
 * EDGE_STATISTICALLY_SUPPORTED (CI lower bound > 0).
 */
import { EVALUATION_RULE_VERSION, MINIMUMS, ROBUSTNESS, COST_SCENARIOS, RESAMPLING, STAGE12D_STATUS, R_DEFINITION, GATE_ELIGIBLE_PROVENANCE, NEVER_GATE_PROVENANCE } from './rules.js';
import { summarize, bootstrapMeanCI, withoutTopWinners, breakdown, median, mean, r4, profitFactor, maxDrawdown } from './stats.js';
import { gateEligible, splitByProvenance } from './evidence.js';

const NA = 'NOT_AVAILABLE';

/** Cost-adjusted R for a trade: extra USD cost converted with the trade's own initial risk. */
function stressedR(t, scenario) { if (t.r_net == null || !t.initial_risk_usd) return null; const extra = (scenario.extra_round_trip_usd + scenario.extra_slippage_usd) * (R_DEFINITION.lot / 0.01); return +((t.net_usd - extra) / t.initial_risk_usd).toFixed(4); }

export function evaluateCostScenarios(trades) {
  return COST_SCENARIOS.map((sc) => { const rs = trades.map((t) => stressedR(t, sc)).filter(Number.isFinite); const s = summarize(rs); return { id: sc.id, gate: sc.gate, extra_usd_per_trade: r4(sc.extra_round_trip_usd + sc.extra_slippage_usd), n: rs.length, mean_r: s.mean ?? null, net_r: s.net ?? null, profit_factor: s.profit_factor?.value ?? null, profit_factor_status: s.profit_factor?.status ?? NA, positive: s.mean != null ? s.mean > 0 : null, note: sc.note }; });
}

export function winnerDependence(rs) {
  return ROBUSTNESS.winner_dependence_report_levels.map((k) => ({ removed_top: k, ...withoutTopWinners(rs, k) }));
}

export function executionReliability({ trades, executions = [], demo }) {
  const opened = executions.filter((e) => e.event_type === 'OPENED'); const rejected = executions.filter((e) => e.event_type === 'SKIPPED' && /BROKER|REJECT|RETCODE|ORDER_FAILED|EXECUTOR_THREW|AMBIGUOUS/.test(e.reason ?? ''));
  const dup = executions.filter((e) => /DUPLICATE_ORDER|DUPLICATE_SIGNAL/.test(e.reason ?? '') && e.event_type !== 'SKIPPED'); const anomalies = executions.filter((e) => e.event_type === 'ANOMALY');
  const slips = trades.map((t) => t.entry_slippage_usd).filter(Number.isFinite); const attempts = opened.length + rejected.length;
  const fillFailure = attempts ? rejected.length / attempts : null; const medSlip = slips.length ? median(slips) : null;
  const ok = attempts === 0 ? null : (fillFailure <= ROBUSTNESS.execution.max_fill_failure_share && (medSlip == null || medSlip <= ROBUSTNESS.execution.max_median_entry_slippage_usd) && anomalies.length <= ROBUSTNESS.execution.max_unreconciled_events && dup.length <= ROBUSTNESS.execution.max_duplicate_attempts);
  return { attempts, opened: opened.length, rejected: rejected.length, fill_failure_share: r4(fillFailure), median_entry_slippage_usd: r4(medSlip), max_entry_slippage_usd: slips.length ? r4(Math.max(...slips)) : null, unreconciled_events: anomalies.length, duplicate_attempts: dup.length, thresholds: ROBUSTNESS.execution, ok, status: ok == null ? NA : ok ? 'OK' : 'EXECUTION_RELIABILITY_ISSUE', source: demo ? 'DEMO evidence EXECUTION records' : 'n/a' };
}

/**
 * Evaluate one dataset (already provenance-filtered by the caller or here). `label` names the dataset
 * (PRIMARY_FORWARD_DEMO, INDEPENDENT_VALIDATION, SUPPLEMENTARY_REAL). Gates are applied only when `applyGates`.
 */
export function evaluateDataset({ label, trades, executions = [], blocked_signals = [], nowSec = Date.now() / 1000, applyGates = true, open_trades = [] }) {
  // COMPLETED = realized net P&L known. R-based statistics use only trades whose initial risk is known; the share
  // without R is the missing-data metric (never imputed). Open/unresolved trades are never counted.
  const completedAll = trades.filter((t) => t.net_usd != null); const completed = completedAll.filter((t) => t.r_net != null); const noPnl = trades.length - completedAll.length; const noR = completedAll.length - completed.length;
  const rs = completed.map((t) => t.r_net); const usd = completedAll.map((t) => t.net_usd);
  const sessions = new Set(completed.map((t) => t.session_day).filter(Boolean)).size;
  const times = completed.map((t) => Date.parse(t.decision_time_utc)).filter(Number.isFinite); const first = times.length ? Math.min(...times) : null; const last = times.length ? Math.max(...times) : null;
  const calendarDays = first ? r4((nowSec * 1000 - first) / 86400000) : 0; const spanDays = first && last ? r4((last - first) / 86400000) : 0;
  const models = breakdown(completed, (t) => t.model, (t) => t.r_net); const modelsCovered = models.filter((m) => m.key !== 'UNKNOWN').length;
  const months = breakdown(completed, (t) => t.month, (t) => t.r_net); const monthsWith10 = months.filter((m) => m.n >= 10);
  const sR = rs.length ? summarize(rs) : null; const sUsd = usd.length ? summarize(usd) : null;
  const ci = rs.length >= MINIMUMS.min_trades_for_any_statistic ? bootstrapMeanCI(rs, { seed: RESAMPLING.bootstrap_seed, resamples: RESAMPLING.bootstrap_resamples, level: RESAMPLING.ci_level }) : null;
  const cost = evaluateCostScenarios(completed); const stress = cost.find((c) => c.gate);
  const winners = rs.length ? winnerDependence(rs) : [];
  const noTop5 = winners.find((w) => w.removed_top === ROBUSTNESS.top_winner_removal);
  const sides = breakdown(completed, (t) => t.side, (t) => t.r_net); const negSide = sides.find((s) => (s.mean ?? 0) < 0); const buySellOk = completed.length ? (!negSide || negSide.n / completed.length < ROBUSTNESS.buy_sell_negative_side_max_share) : null;
  const monthOk = monthsWith10.length >= MINIMUMS.min_months_with_10_trades ? monthsWith10.filter((m) => (m.net ?? 0) > 0).length / monthsWith10.length >= ROBUSTNESS.monthly_positive_share_min : null;
  const familyFail = models.filter((m) => m.n >= ROBUSTNESS.model_family_fail_min_trades && (m.mean ?? 0) < ROBUSTNESS.model_family_fail_expectancy_R);
  const exec = executionReliability({ trades: completed, executions, demo: label !== 'SUPPLEMENTARY_REAL' });
  const missingShare = trades.length ? r4((noPnl + noR) / trades.length) : 0;
  const blockedReasons = breakdown(blocked_signals, (b) => b.reason, () => 0).map((b) => ({ reason: b.key, n: b.n }));
  const pineSplit = { reference_read: completed.filter((t) => t.pine_reference_status === 'OK').length, reference_unavailable: completed.filter((t) => t.pine_reference_status && t.pine_reference_status !== 'OK').length, unknown: completed.filter((t) => !t.pine_reference_status).length };
  const exitReasons = breakdown(completedAll, (t) => t.exit_reason, (t) => t.net_usd ?? 0).map((x) => ({ reason: x.key, n: x.n, net_usd: x.net }));
  const holding = completedAll.map((t) => t.holding_minutes).filter(Number.isFinite);
  const mfe = completedAll.map((t) => t.mfe_usd).filter(Number.isFinite), mae = completedAll.map((t) => t.mae_usd).filter(Number.isFinite);

  const minimums = { completed_trades: { value: completedAll.length, min: MINIMUMS.min_completed_trades, ok: completedAll.length >= MINIMUMS.min_completed_trades }, sessions: { value: sessions, min: MINIMUMS.min_sessions, ok: sessions >= MINIMUMS.min_sessions }, calendar_days: { value: calendarDays, min: MINIMUMS.min_calendar_days, ok: calendarDays >= MINIMUMS.min_calendar_days }, models_covered: { value: modelsCovered, min: MINIMUMS.min_models_covered, ok: modelsCovered >= MINIMUMS.min_models_covered }, months_with_10_trades: { value: monthsWith10.length, min: MINIMUMS.min_months_with_10_trades, ok: monthsWith10.length >= MINIMUMS.min_months_with_10_trades } };
  const evidenceComplete = Object.values(minimums).every((m) => m.ok);
  const gates = {
    expectancy_ci_lower_gt_0: { value: ci?.lower ?? null, ok: ci ? ci.lower > ROBUSTNESS.ci_lower_bound_gt : null },
    profit_factor_min: { value: sR?.profit_factor?.value ?? null, status: sR?.profit_factor?.status ?? NA, min: ROBUSTNESS.profit_factor_min, ok: sR?.profit_factor?.status === 'OK' ? sR.profit_factor.value >= ROBUSTNESS.profit_factor_min : null },
    without_top5_positive: { value: noTop5?.mean ?? null, ok: noTop5 && noTop5.mean != null ? noTop5.mean > 0 : null },
    cost_stress_positive: { scenario: stress?.id ?? null, value: stress?.mean_r ?? null, ok: stress && stress.mean_r != null ? stress.mean_r > 0 : null },
    buy_sell_stability: { ok: buySellOk, sides: sides.map((s) => ({ side: s.key, n: s.n, mean_r: s.mean })) },
    monthly_stability: { ok: monthOk, months_with_10: monthsWith10.length, positive_share: monthsWith10.length ? r4(monthsWith10.filter((m) => (m.net ?? 0) > 0).length / monthsWith10.length) : null },
    model_family_stability: { ok: completed.length ? familyFail.length === 0 : null, failing_families: familyFail.map((m) => m.key) },
    execution_reliability: { ok: exec.ok, status: exec.status },
    missing_data: { value: missingShare, max: ROBUSTNESS.missing_data_max_share, ok: missingShare <= ROBUSTNESS.missing_data_max_share },
    max_drawdown: { policy: ROBUSTNESS.max_drawdown_policy, observed_r: sR?.drawdown?.max_drawdown ?? null, observed_usd: sUsd?.drawdown?.max_drawdown ?? null, ok: 'REVIEW_REQUIRED' },
  };
  const gateKeys = ['expectancy_ci_lower_gt_0', 'profit_factor_min', 'without_top5_positive', 'cost_stress_positive', 'buy_sell_stability', 'monthly_stability', 'model_family_stability', 'execution_reliability', 'missing_data'];
  const allGatesPass = gateKeys.every((k) => gates[k].ok === true);
  let status = STAGE12D_STATUS.INSUFFICIENT_EVIDENCE; let reason = 'minimums not met';
  if (applyGates && evidenceComplete) { status = allGatesPass ? STAGE12D_STATUS.EDGE_SUPPORTED : STAGE12D_STATUS.EDGE_NOT_SUPPORTED; reason = allGatesPass ? 'every frozen gate satisfied' : `failed gates: ${gateKeys.filter((k) => gates[k].ok !== true).join(',')}`; }
  return {
    label, rule_version: EVALUATION_RULE_VERSION, r_definition: R_DEFINITION.formula, generated_at: new Date(nowSec * 1000).toISOString(),
    counts: { trades_total: trades.length, completed: completedAll.length, completed_with_r: completed.length, completed_without_r: noR, completed_without_pnl: noPnl, open_not_completed: open_trades.length, wins: sR?.wins ?? 0, losses: sR?.losses ?? 0, breakeven: sR?.breakeven ?? 0, sessions, calendar_days_since_first: calendarDays, span_days_first_to_last: spanDays, first_decision_utc: first ? new Date(first).toISOString() : null, last_decision_utc: last ? new Date(last).toISOString() : null, models_covered: modelsCovered, blocked_signals: blocked_signals.length },
    expectancy: { point_estimate_r: sR?.mean ?? null, point_estimate_positive: sR?.mean != null ? sR.mean > 0 : null, ci95: ci, standard_error_r: sR?.standard_error ?? null, statistically_supported: ci ? ci.lower > 0 : null, interpretation: ci ? `95% bootstrap interval of the mean R is [${ci.lower}, ${ci.upper}] from ${completed.length} trades; "supported" means the interval excludes zero, not certainty` : NA, median_r: sR?.median ?? null, win_rate: sR?.win_rate ?? null },
    r_summary: sR ?? { status: NA }, usd_summary: sUsd ?? { status: NA },
    profit_factor: sR?.profit_factor ?? { value: null, status: NA },
    drawdown: { max_drawdown_r: sR?.drawdown?.max_drawdown ?? null, max_drawdown_usd: sUsd?.drawdown?.max_drawdown ?? null, max_consecutive_losses: sR?.max_consecutive_losses ?? null, max_consecutive_wins: sR?.max_consecutive_wins ?? null },
    payoff: { average_win_r: sR?.average_win ?? null, average_loss_r: sR?.average_loss ?? null, payoff_ratio: sR?.payoff_ratio ?? null },
    excursions: { mfe_usd_mean: mfe.length ? r4(mean(mfe)) : NA, mae_usd_mean: mae.length ? r4(mean(mae)) : NA, n_with_mfe: mfe.length, n_with_mae: mae.length },
    holding: { median_minutes: holding.length ? r4(median(holding)) : NA, mean_minutes: holding.length ? r4(mean(holding)) : NA, n: holding.length },
    execution_costs: { commission_usd_total: r4(completedAll.map((t) => t.commission_usd ?? 0).reduce((a, b) => a + b, 0)), swap_usd_total: r4(completedAll.map((t) => t.swap_usd ?? 0).reduce((a, b) => a + b, 0)), spread_usd_median: (() => { const s = completed.map((t) => t.spread_usd).filter(Number.isFinite); return s.length ? r4(median(s)) : NA; })(), entry_slippage_usd_median: exec.median_entry_slippage_usd ?? NA, signal_to_fill_drift_usd_median: (() => { const d = completed.map((t) => t.entry_drift_usd).filter(Number.isFinite); return d.length ? r4(median(d)) : NA; })() },
    cost_scenarios: cost, winner_dependence: winners, execution_reliability: exec,
    models, sessions_by_bucket: breakdown(completed, (t) => t.session_bucket, (t) => t.r_net), months, sides, regimes: breakdown(completed, (t) => t.regime, (t) => t.r_net), news_proximity: breakdown(completed, (t) => t.news_state, (t) => t.r_net), shock_state: breakdown(completed, (t) => t.shock_state, (t) => t.r_net), exit_reasons: exitReasons,
    blocked_signal_reasons: blockedReasons, pine_parity: { ...pineSplit, disclosure: 'Production may veto an actionable signal on an OPPOSING Pine reference (WAIT/ENGINE_DISAGREEMENT). DEMO evidence has no chart reference (pine_reference_status NOT_FOUND on every DEMO signal); trades below may include signals production would have vetoed. Reconcile against production decisions by signal time before comparing outcomes.' },
    minimums, evidence_complete: evidenceComplete, gates, all_gates_pass: allGatesPass, status, status_reason: reason,
  };
}

/** Builds the Stage 12D evaluation from loaded DEMO (primary) and REAL (supplementary) evidence. */
export function buildStage12D({ demo, real, nowSec = Date.now() / 1000, strategyFingerprint = null, validationStartUtc = null }) {
  const startMs = validationStartUtc ? Date.parse(validationStartUtc) : null;
  const eligibleAll = demo ? gateEligible(demo.trades) : [];
  // When an independent validation window is declared, the PRIMARY dataset ends at its start; later trades belong to 12E.
  const eligible = Number.isFinite(startMs) ? eligibleAll.filter((t) => Date.parse(t.decision_time_utc) < startMs) : eligibleAll;
  const postWindow = eligibleAll.length - eligible.length;
  const nonEligible = demo ? demo.trades.filter((t) => !eligibleAll.includes(t)) : [];
  const cohortOk = eligible.every((t) => !t.strategy_fingerprint || !strategyFingerprint || t.strategy_fingerprint === strategyFingerprint);
  const sameCohort = strategyFingerprint ? eligible.filter((t) => !t.strategy_fingerprint || t.strategy_fingerprint === strategyFingerprint) : eligible;
  const otherCohort = eligible.length - sameCohort.length;
  const before = (iso) => !Number.isFinite(startMs) || Date.parse(iso) < startMs;
  const primary = evaluateDataset({ label: 'PRIMARY_FORWARD_DEMO', trades: sameCohort, executions: (demo?.executions ?? []).filter((e) => e.provenance === 'FORWARD_LIVE_DEMO' && before(e.event_time_utc)), blocked_signals: (demo?.blocked_signals ?? []).filter((b) => b.provenance === 'FORWARD_LIVE_DEMO' && before(b.decision_time_utc)), open_trades: (demo?.open_trades ?? []).filter((o) => o.provenance === 'FORWARD_LIVE_DEMO'), nowSec });
  const supplementary = real ? evaluateDataset({ label: 'SUPPLEMENTARY_REAL', trades: real.trades, executions: [], blocked_signals: real.blocked_signals, open_trades: real.open_trades, nowSec, applyGates: false }) : null;
  // Gate integrity = the PRIMARY (DEMO) evidence + cohort purity. The supplementary REAL cohort's integrity is
  // reported separately (its quarantined rows never enter any statistic) and cannot block or pass a DEMO gate.
  const integrityOk = (demo?.integrity?.ok ?? true) && cohortOk;
  let status = primary.status; if (!integrityOk && status === STAGE12D_STATUS.EDGE_SUPPORTED) status = STAGE12D_STATUS.EDGE_NOT_SUPPORTED;
  return {
    stage: '12D', rule_version: EVALUATION_RULE_VERSION, generated_at: new Date(nowSec * 1000).toISOString(),
    accepted_evidence: { gate_eligible_provenance: GATE_ELIGIBLE_PROVENANCE, never_gate_provenance: NEVER_GATE_PROVENANCE, demo_records_by_provenance: demo ? splitByProvenance([...demo.signals, ...demo.executions, ...demo.outcomes]) : {}, demo_trades_by_provenance: demo ? splitByProvenance(demo.trades) : {}, gate_eligible_trades: eligible.length, gate_eligible_after_validation_window: postWindow, validation_window_start_utc: validationStartUtc, excluded_non_forward_trades: nonEligible.length, excluded_other_fingerprint_cohort: otherCohort, strategy_fingerprint_cohort: strategyFingerprint, cohorts_seen: demo?.cohorts ?? [] },
    integrity: { demo: demo?.integrity ?? null, real: real?.integrity ?? null, real_ok: real?.integrity?.ok ?? null, cohort_ok: cohortOk, ok: integrityOk },
    primary, supplementary_real: supplementary,
    status, edge_demonstrated: status === STAGE12D_STATUS.EDGE_SUPPORTED, point_estimate_positive: primary.expectancy.point_estimate_positive, edge_statistically_supported: primary.expectancy.statistically_supported === true && status === STAGE12D_STATUS.EDGE_SUPPORTED,
  };
}
