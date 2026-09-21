/**
 * P9 — Claude-readable decision presentation layer.
 *
 * This module is PURE TRANSPORT/FORMATTING. It never computes a trading
 * decision, never derives/repairs ENTRY/SL/TP/RR, never turns WAIT into
 * BUY/SELL, and never recalculates regime/model/quality. It only reads
 * fields that `getMasterState()` (src/core/xauusd.js, backed by the
 * already fail-closed `buildMasterContract()` in src/core/master_contract.js)
 * has ALREADY validated, and renders them into a concise human-readable
 * string plus a small structured summary for programmatic use.
 *
 * If the underlying master state is not `status: 'OK'`, this layer
 * always returns a non-trading "DATA UNAVAILABLE" response — it never
 * guesses a decision from a degraded/ambiguous/malformed state.
 */

const NON_OK_REASON_TEXT = {
  NOT_FOUND: 'The XAUUSD Adaptive Master indicator is not present on the current chart.',
  AMBIGUOUS: 'Multiple candidate indicator instances or contract tables were found — refusing to guess which is authoritative.',
  READ_ERROR: 'The chart or Pine table could not be read (connection or CDP-level failure).',
  NO_CONTRACT: 'The indicator is present but has not produced a contract table yet.',
  MALFORMED_CONTRACT: 'The contract table did not parse into valid, complete data.',
  UNSUPPORTED_CONTRACT_VERSION: 'The contract table reports a CONTRACT_VERSION this reader does not support.',
  SOURCE_UNCONFIRMED: 'A BUY/SELL was reported but not on a confirmed (non-repainting) bar — refusing to present it as tradeable.',
  CONTRACT_CONTRADICTION: 'The contract reported BUY/SELL alongside an internal contradiction (e.g. correction active, overextended, RR not acceptable, or invalid geometry) — refusing to present it as tradeable.',
};

function fmtNum(n) {
  return n === null || n === undefined ? 'NA' : String(n);
}

/**
 * Formats an already-validated xauusd_master_state result for direct
 * display to the end user. Returns { headline, lines, structured }.
 *
 * `structured.tradeable` is true only when status === 'OK' and
 * decision.action is BUY or SELL; every other case is a non-trading
 * response, including WAIT and every failure/degraded status.
 */
export function formatDecision(masterState) {
  if (!masterState || masterState.status !== 'OK') {
    const status = masterState?.status ?? 'UNKNOWN';
    const reason = NON_OK_REASON_TEXT[status] ?? `Unrecognized status: ${status}`;
    return {
      headline: 'DATA UNAVAILABLE — NO TRADE DECISION',
      lines: [
        'DATA UNAVAILABLE — NO TRADE DECISION',
        `Status: ${status}`,
        `Reason: ${reason}`,
      ],
      structured: { tradeable: false, action: null, status, reason },
    };
  }

  const tf = masterState.market?.timeframe ?? 'NA';
  const regime = masterState.market?.regime ?? 'NA';
  const action = masterState.decision?.action ?? 'UNKNOWN';

  if (action !== 'BUY' && action !== 'SELL') {
    const waitReason = masterState.decision?.wait_reason ?? 'UNKNOWN';
    return {
      headline: 'WAIT — NO TRADE',
      lines: [
        'WAIT — NO TRADE',
        `Reason: ${waitReason}`,
        `TF: ${tf}`,
        `Regime: ${regime}`,
      ],
      structured: { tradeable: false, action: 'WAIT', status: 'OK', wait_reason: waitReason, timeframe: tf, regime },
    };
  }

  // action is BUY or SELL, and getMasterState() already guarantees this
  // only happens when status === 'OK' -- i.e. every gate (structural
  // completeness, BAR_CONFIRMED, contradiction/geometry checks) already
  // passed inside buildMasterContract(). This branch only formats
  // already-validated values; it never re-derives or re-checks them.
  const d = masterState.decision;
  return {
    headline: action,
    lines: [
      action,
      `Entry: ${fmtNum(d.entry)}`,
      `SL: ${fmtNum(d.stop_loss)}`,
      `TP1: ${fmtNum(d.tp1)}`,
      `TP2/Exit: ${fmtNum(d.tp2 ?? d.exit_target)}`,
      `RR: ${fmtNum(d.rr)}`,
      `TF: ${tf}`,
      `Setup: ${masterState.setup?.model ?? 'NA'}`,
      `Quality: ${masterState.setup?.quality ?? 'NA'}`,
      `Regime: ${regime}`,
    ],
    structured: {
      tradeable: true,
      action,
      status: 'OK',
      entry: d.entry, stop_loss: d.stop_loss, tp1: d.tp1, tp2: d.tp2, exit_target: d.exit_target, rr: d.rr,
      timeframe: tf, model: masterState.setup?.model ?? null, quality: masterState.setup?.quality ?? null, regime,
    },
  };
}

/** Renders formatDecision()'s lines as a single joined string, for convenience. */
export function formatDecisionText(masterState) {
  return formatDecision(masterState).lines.join('\n');
}

/**
 * Formats an already-computed calculateEntry() result (src/core/xauusd_calculate.js,
 * the independent MCP engine) for direct display. Same non-inventive rule
 * as formatDecision(): every value is read from the already-validated
 * calculation result, never recomputed or guessed here.
 */
export function formatEngineDecision(calcResult) {
  if (!calcResult || calcResult.status !== 'OK') {
    const status = calcResult?.status ?? 'UNKNOWN';
    return {
      headline: 'DATA UNAVAILABLE — NO TRADE DECISION',
      lines: ['DATA UNAVAILABLE — NO TRADE DECISION', `Status: ${status}`, `Reason: ${calcResult?.reason ?? 'unknown'}`],
      structured: { tradeable: false, action: null, status },
    };
  }

  if (calcResult.action !== 'BUY' && calcResult.action !== 'SELL') {
    const tf = calcResult.timeframes ?? {};
    return {
      headline: 'WAIT — NO TRADE',
      lines: [
        'WAIT — NO TRADE',
        `Reason: ${calcResult.reason ?? 'UNKNOWN'}`,
        `30m: ${tf['30m']?.regime ?? 'NA'}`,
        `15m: ${tf['15m']?.action ?? 'NA'}${tf['15m']?.wait_reason ? ` (${tf['15m'].wait_reason})` : ''}`,
        `5m: ${tf['5m']?.action ?? 'NA'}${tf['5m']?.wait_reason ? ` (${tf['5m'].wait_reason})` : ''}`,
      ],
      structured: { tradeable: false, action: 'WAIT', status: 'OK', wait_reason: calcResult.reason, per_timeframe: tf },
    };
  }

  return {
    headline: calcResult.action,
    lines: [
      calcResult.action,
      `Entry: ${fmtNum(calcResult.entry)}`,
      `SL: ${fmtNum(calcResult.sl)}`,
      `TP1: ${fmtNum(calcResult.tp1)}`,
      `TP2: ${fmtNum(calcResult.tp2)}`,
      `RR: ${fmtNum(calcResult.rr)}`,
      `TF: ${calcResult.diagnostics?.source_timeframe ?? 'NA'}`,
      `Setup: ${calcResult.setup ?? 'NA'}`,
      `Quality: ${fmtNum(calcResult.quality)}/100`,
    ],
    structured: {
      tradeable: true, action: calcResult.action, status: 'OK',
      entry: calcResult.entry, stop_loss: calcResult.sl, tp1: calcResult.tp1, tp2: calcResult.tp2, rr: calcResult.rr,
      setup: calcResult.setup, quality: calcResult.quality, regime: calcResult.regime,
    },
  };
}

/** One concise line describing a primary/alternate anticipation scenario. Never prints a null field as literal "null" noise. */
function describeScenario(s) {
  if (!s) return null;
  const parts = [s.direction ?? 'DIRECTION UNKNOWN', s.strategy_family ?? s.mapped_model_code ?? 'setup', `(${s.state})`];
  if (s.location?.price != null) parts.push(`near ${s.location.type ?? 'level'} ${s.location.price}`);
  return parts.join(' ');
}

/**
 * Formats an already-computed analyzeMarket() result (src/core/xauusd_analyze_market.js,
 * the Full Market Analysis Engine) for direct display. Reuses
 * formatEngineDecision()'s exact BUY/SELL/DATA-UNAVAILABLE rendering
 * verbatim (the decision fields are identical -- analyzeMarket() never
 * changes them, and this function never touches them) and adds, ONLY for
 * a WAIT result, informational lines drawn from the confluence evidence
 * and the anticipation object already computed -- never a new decision
 * field, never a probability/accuracy claim, never an Entry/SL/TP1/TP2/RR
 * for an unconfirmed scenario. The existing "WAIT — NO TRADE" / "Reason:
 * ..." lines (the authoritative wait reason) are preserved byte-for-byte
 * from formatEngineDecision() and never rewritten here.
 */
export function formatMarketAnalysis(analysisResult) {
  const base = formatEngineDecision(analysisResult);
  if (analysisResult?.action !== 'WAIT') return base;

  const lines = [...base.lines];
  const structuredExtra = {};

  const c = analysisResult.confluence;
  if (c) {
    const breakoutState = c.informational_context?.breakout_state?.state;
    const contextParts = [];
    if (breakoutState && breakoutState !== 'NO_BREAKOUT') contextParts.push(`Breakout: ${breakoutState}`);
    if (c.strategy_eligibility?.eligible?.length === 0 && c.strategy_eligibility?.blocked_reason) {
      contextParts.push(c.regime ?? 'restrictive regime');
    }
    if (contextParts.length > 0) {
      lines.push(`Context: ${contextParts.join(', ')}`);
      structuredExtra.context = contextParts;
    }
  }

  const a = analysisResult.anticipation;
  if (a) {
    lines.push(`Pre-entry: ${a.state}`);
    if (a.developing_strategy_family) lines.push(`Developing: ${a.developing_strategy_family}`);
    if (a.waiting_for?.length) lines.push(`Waiting for: ${a.waiting_for.join('; ')}`);
    if (a.invalidated_if?.length) lines.push(`Invalidated if: ${a.invalidated_if.join('; ')}`);
    if (a.primary_scenario) {
      lines.push('Primary scenario:');
      lines.push(describeScenario(a.primary_scenario));
    }
    if (a.alternate_scenario) {
      lines.push('Alternate scenario:');
      lines.push(describeScenario(a.alternate_scenario));
    }
  }

  // Pre-Entry Opportunity Planner (additive) -- src/engine/opportunityPlanner.js's
  // already-computed `pre_entry_plan`, never recomputed here. Every
  // "Candidate"/"Provisional" value is printed verbatim; this never adds
  // an Entry/SL/TP1/TP2 line (those only ever appear above, in the
  // BUY/SELL branch of formatEngineDecision(), and only for a
  // genuinely confirmed action).
  const plan = analysisResult.pre_entry_plan;
  if (plan?.status === 'PLAN') {
    const action = plan.direction === 'BULLISH' ? 'BUY' : plan.direction === 'BEARISH' ? 'SELL' : 'UNKNOWN';
    lines.push(`Opportunity: ${action} ${plan.opportunity_state}`);
    if (plan.candidate_entry_zone) {
      const z = plan.candidate_entry_zone;
      lines.push(`Candidate Entry Zone: ${z.lower === z.upper ? fmtNum(z.lower) : `${fmtNum(z.lower)} - ${fmtNum(z.upper)}`}`);
    }
    if (plan.provisional_invalidation) lines.push(`Provisional Invalidation: ${fmtNum(plan.provisional_invalidation.level)}`);
    if (plan.candidate_tp1 != null) lines.push(`Candidate TP1: ${fmtNum(plan.candidate_tp1)}`);
    if (plan.candidate_tp2 != null) lines.push(`Candidate TP2: ${fmtNum(plan.candidate_tp2)}`);
    if (plan.candidate_rr != null) lines.push(`Candidate RR: ${fmtNum(plan.candidate_rr)}`);
    if (plan.confirmation_required?.length) lines.push(`Waiting for (opportunity plan): ${plan.confirmation_required.join('; ')}`);
    if (plan.alternate_scenario) lines.push(`Alternative: ${plan.alternate_scenario.direction === 'BULLISH' ? 'BUY' : 'SELL'} — ${plan.alternate_scenario.zone?.type ?? 'N/A'}`);
    structuredExtra.pre_entry_plan = plan;
  } else if (plan?.status === 'NO_PLAN') {
    lines.push(`Primary Opportunity: NONE (${plan.reason ?? 'no objective plan currently available'})`);
    structuredExtra.pre_entry_plan = plan;
  }

  if (lines.length === base.lines.length) return base;

  return {
    ...base,
    lines,
    structured: { ...base.structured, ...structuredExtra, anticipation: a ?? null },
  };
}
