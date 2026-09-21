/**
 * Stage 6, Part 7-15 — ACTIVE CHART TIMEFRAME intelligence.
 *
 * THIS MODULE NEVER PRODUCES A TRADING DECISION AND NEVER FEEDS INTO ONE.
 * It reads whatever symbol/timeframe the user's chart is CURRENTLY
 * showing (a single getState() call) and, when that is an approved
 * XAUUSD symbol on a recognized timeframe, fetches ONLY that timeframe's
 * own bars (a single getOhlcv() call) to build a TF-LOCAL evidence
 * snapshot via the SAME `computeEvidence()` xauusd_analyze_market.js's
 * own decision-timeframe path already uses (exported additively for
 * exactly this reuse) -- never a second, divergent evidence
 * implementation.
 *
 * ZERO CHART MUTATION: this module NEVER calls setTimeframe()/setSymbol()
 * -- by definition, the chart is already sitting on whatever TF/symbol is
 * "active", so reading it requires no switch at all. This structurally
 * eliminates the mission's Part 14 race condition ("MCP mid-sweep,
 * user manually changes TF, final chart must reflect the user's newer
 * choice") for this code path: there is nothing here to race, since this
 * path never changes the chart's timeframe in the first place. (The
 * SEPARATE, existing decision-analysis sweep in
 * fetchMultiTimeframeBars()/calculateEntry() still switches timeframes
 * and restores afterward, exactly as before -- unchanged, untouched.)
 *
 * ACTIVE CHART TF vs DECISION TF vs CONTEXT TFs (mission Part 7): this
 * module reports ONLY the active chart TF's own identity and (when
 * available) its own local evidence. It never sets, overrides, or even
 * reads the DECISION timeframe (always the protected engine's own 15m,
 * from decision.diagnostics.source_timeframe) -- viewing a 1D chart while
 * the decision timeframe stays 15m is valid and expected; this module
 * simply describes what is ACTUALLY on screen right now.
 */
import { validateAndSplit, resolveDeps, TF_LABEL, TF_MINUTES } from './xauusd_calculate.js';
import { computeEvidence } from './xauusd_analyze_market.js';
import { checkXauusdSymbol } from '../xauusd_guard.js';

export const CHART_CONTEXT_SCHEMA_VERSION = '1.0.0';

const OHLCV_REQUEST_COUNT = 500;

// TradingView resolution identifiers this module recognizes, mapped to the
// SAME timeframe codes TF_LABEL/TF_MINUTES already use (xauusd_calculate.js)
// -- never a separate/parallel vocabulary. Minutes are plain numeric-string
// minutes; 'D'/'W'/'M' accept both TradingView's own bare form and the
// common "1D"/"1W"/"1M" spelling. Deliberately closed/explicit (mission
// Part 7: "normalize 5m/15m/30m/1H/2H/4H/8H/1D/1W/1M, fail safe on
// unknown") -- an unrecognized resolution (e.g. a 1-minute or 3-minute
// chart, which this project's engine has never operated on) is reported
// as UNKNOWN_TIMEFRAME rather than silently coerced to the nearest known
// value.
const RESOLUTION_ALIASES = {
  5: '5', 15: '15', 30: '30', 60: '60', 120: '120', 240: '240', 480: '480',
  D: 'D', '1D': 'D', W: 'W', '1W': 'W', M: 'M', '1M': 'M',
};

/** Normalizes a raw TradingView chart.resolution() string into one of TF_LABEL's own codes, or null (fail-safe) when unrecognized. Never guesses/rounds to the "nearest" known timeframe. */
export function normalizeChartResolution(rawResolution) {
  if (rawResolution == null) return null;
  const key = String(rawResolution).trim().toUpperCase();
  return RESOLUTION_ALIASES[key] ?? null;
}

/**
 * Reads the currently active chart's symbol + timeframe + (when eligible)
 * TF-local evidence. Never mutates the chart. Returns one of these
 * `status` values:
 *
 *   - 'OK'                     -- symbol approved, timeframe recognized,
 *                                  sufficient data; `evidence` populated
 *   - 'SYMBOL_MISMATCH'        -- chart symbol is not an approved XAUUSD
 *                                  alias (mission Part 15's safe paused
 *                                  state -- see VISUALIZATION_PAUSED_SYMBOL_MISMATCH
 *                                  below); never force-switches the symbol
 *   - 'UNKNOWN_TIMEFRAME'      -- chart.resolution() is not one of the
 *                                  recognized codes; fails safe, no
 *                                  evidence, no drawing decision made here
 *   - 'INSUFFICIENT_DATA'      -- symbol/timeframe both fine, but too few/
 *                                  invalid bars were returned
 *   - 'READ_ERROR'             -- getState()/getOhlcv() itself threw
 *     (e.g. CDP unavailable) -- fails closed, never fabricates a TF
 */
export async function getActiveChartContext({ _deps } = {}) {
  const deps = resolveDeps(_deps);

  let state;
  try {
    state = await deps.getState();
  } catch (err) {
    return { schema_version: CHART_CONTEXT_SCHEMA_VERSION, status: 'READ_ERROR', reason: err.message, symbol: null, timeframe: null, timeframe_label: null };
  }

  const symbol = state?.symbol ?? null;
  const rawResolution = state?.resolution ?? null;

  const guard = checkXauusdSymbol(symbol, { _deps });
  if (!guard.approved) {
    return {
      schema_version: CHART_CONTEXT_SCHEMA_VERSION,
      status: 'SYMBOL_MISMATCH',
      // Mission Part 15's exact requested paused-state label.
      visualization_state: 'VISUALIZATION_PAUSED_SYMBOL_MISMATCH',
      reason: `chart symbol "${symbol}" is not an approved XAUUSD alias`,
      symbol, raw_resolution: rawResolution, timeframe: null, timeframe_label: null,
      evidence: null,
    };
  }

  const tfCode = normalizeChartResolution(rawResolution);
  if (!tfCode) {
    return {
      schema_version: CHART_CONTEXT_SCHEMA_VERSION,
      status: 'UNKNOWN_TIMEFRAME',
      reason: `chart resolution "${rawResolution}" is not a recognized timeframe`,
      symbol, raw_resolution: rawResolution, timeframe: null, timeframe_label: null,
      evidence: null,
    };
  }
  const timeframeLabel = TF_LABEL[tfCode];

  let raw;
  try {
    raw = await deps.getOhlcv({ count: OHLCV_REQUEST_COUNT });
  } catch (err) {
    return { schema_version: CHART_CONTEXT_SCHEMA_VERSION, status: 'READ_ERROR', reason: err.message, symbol, raw_resolution: rawResolution, timeframe: tfCode, timeframe_label: timeframeLabel, evidence: null };
  }

  const split = validateAndSplit(raw?.bars, TF_MINUTES[tfCode]);
  if (split.error || !split.confirmed?.length) {
    return {
      schema_version: CHART_CONTEXT_SCHEMA_VERSION,
      status: 'INSUFFICIENT_DATA',
      reason: split.error ?? 'no confirmed bars available',
      symbol, raw_resolution: rawResolution, timeframe: tfCode, timeframe_label: timeframeLabel,
      evidence: null,
    };
  }

  // computeEvidence()'s second param (`split`) is only ever read for
  // daily/weekly cross-reference (split.D/split.W) -- see
  // xauusd_analyze_market.js's own computeEvidence() doc. This module
  // deliberately fetches ONLY the single active timeframe (zero chart
  // mutation, see module header), so that cross-reference is simply
  // unavailable here and degrades gracefully (computeDailyWeeklyContext
  // already handles empty arrays without throwing) -- never fabricated.
  const minimalSplit = { [tfCode]: split };
  const evidence = computeEvidence(split.confirmed, minimalSplit, null);

  return {
    schema_version: CHART_CONTEXT_SCHEMA_VERSION,
    status: 'OK',
    symbol, raw_resolution: rawResolution, timeframe: tfCode, timeframe_label: timeframeLabel,
    last_confirmed_bar_time: split.confirmed.at(-1)?.time ?? null,
    evidence,
  };
}
