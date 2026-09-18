/**
 * Full Market Analysis Engine orchestrator (Parts B-M of the XAUUSD MCP
 * analysis-engine upgrade). This is a NEW, separate, on-demand entry
 * point -- it is NOT called by the 60-second watcher loop
 * (src/engine/watcher.js is completely untouched by this file and keeps
 * calling calculateEntry() directly, exactly as before).
 *
 * DESIGN: the authoritative trading decision comes from ONE call to the
 * existing, unmodified calculateEntry() (src/core/xauusd_calculate.js).
 * This module never recomputes or second-guesses that decision -- it
 * only:
 *   1. Fetches all timeframes' OHLCV ONCE (fetchMultiTimeframeBars,
 *      re-exported unchanged from xauusd_calculate.js) and feeds that
 *      SAME data into calculateEntry() via an in-memory "prefetched"
 *      deps shim, so this analysis never causes a SECOND live
 *      chart-timeframe sweep beyond the one it already needed for its
 *      own evidence layers.
 *   2. Runs calculateEntry() against an EPHEMERAL, in-memory signal
 *      store (never the real validation/mcp_engine_signals.json) so an
 *      on-demand full-analysis call can NEVER mark a signal as
 *      "already seen" and suppress a real alert the watcher would
 *      otherwise independently raise on its own next poll. This is the
 *      mechanism that satisfies "no duplicate watcher behavior
 *      introduced" (mission Part 18 / Part 21).
 *   3. Computes the new evidence layers (candlesticks, classical
 *      patterns, breakout state, liquidity, levels, volatility, session,
 *      strategy eligibility) from the EXACT SAME confirmed 15m bars
 *      calculateEntry() itself used for its own regime/structure/
 *      correction computation -- same pure functions, same data, so
 *      this can never diverge from what the protected pipeline computed.
 *   4. Passes decision + evidence into buildConfluenceReport()
 *      (src/engine/confluence.js), which republishes the decision
 *      verbatim and only annotates it with evidence -- never alters it.
 */
import { calculateEntry, fetchMultiTimeframeBars, validateAndSplit, resolveDeps, ALL_TIMEFRAMES, TF_MINUTES } from './xauusd_calculate.js';
import { classifyRegime, REGIME_PARAMS } from '../engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../engine/structure.js';
import { computeCorrection, CORRECTION_PARAMS } from '../engine/correction.js';
import { atr } from '../engine/math.js';
import { detectCandlestickPatterns } from '../engine/candlesticks.js';
import { detectClassicalPatterns } from '../engine/patterns.js';
import { classifyBreakoutState } from '../engine/breakout.js';
import { computeLiquidityContext } from '../engine/liquidity.js';
import { buildLevels } from '../engine/levels.js';
import { computeVolatilityContext } from '../engine/volatility.js';
import { computeSessionContext, computeDailyWeeklyContext } from '../engine/session.js';
import { computeStrategyEligibility } from '../engine/strategies/eligibility.js';
import { buildConfluenceReport } from '../engine/confluence.js';

const PRIMARY_TIMEFRAME = '15'; // matches combineTimeframes()'s own source_timeframe (15m is the decision timeframe)

/** In-memory shim so calculateEntry() reuses the SAME already-fetched bars instead of re-sweeping the chart. */
function buildPrefetchedDeps(byTf, originalSymbol, originalResolution) {
  let current = originalResolution;
  return {
    getState: async () => ({ success: true, symbol: originalSymbol, resolution: current }),
    setTimeframe: async ({ timeframe }) => { current = timeframe; return { success: true }; },
    getOhlcv: async () => ({ bars: byTf[current] ?? null }),
  };
}

function computeEvidence(primaryBars, split, selectedModel) {
  const { regime } = classifyRegime(primaryBars, REGIME_PARAMS);
  const structure = computeStructure(primaryBars, STRUCTURE_PARAMS);
  const correction = regime && structure.state ? computeCorrection(primaryBars, structure.state, CORRECTION_PARAMS) : { state: 'NONE' };
  const atrSeries = atr(primaryBars, 14);
  const atrVal = atrSeries.at(-1);
  const lastIndex = primaryBars.length - 1;

  const dailyWeeklyContext = computeDailyWeeklyContext({
    dailyBars: split.D?.confirmed ?? [],
    weeklyBars: split.W?.confirmed ?? [],
    currentDayBar: split.D?.forming ?? null,
    currentWeekBar: split.W?.forming ?? null,
    currentPrice: primaryBars[lastIndex].close,
  });

  return {
    regime, structure, correction,
    eligibility: computeStrategyEligibility({ regime, structure, selectedModel }),
    candlestickPatterns: detectCandlestickPatterns(primaryBars, lastIndex),
    classicalPatterns: detectClassicalPatterns(primaryBars, structure, atrVal),
    breakoutState: classifyBreakoutState({ bars: primaryBars, structure, atrVal }),
    volatilityContext: computeVolatilityContext(primaryBars),
    levelsContext: buildLevels(primaryBars, structure),
    sessionContext: computeSessionContext(primaryBars),
    dailyWeeklyContext,
    liquidityContext: computeLiquidityContext({
      bars: primaryBars, structure, atrSeries,
      priorDayHigh: dailyWeeklyContext.previousDayHigh, priorDayLow: dailyWeeklyContext.previousDayLow,
      priorWeekHigh: dailyWeeklyContext.previousWeekHigh, priorWeekLow: dailyWeeklyContext.previousWeekLow,
    }),
  };
}

/**
 * Runs the full market analysis: authoritative decision (unchanged
 * calculateEntry()) + new evidence layers + confluence fusion. Never
 * places trades, never mutates the persistent signal store, always
 * restores the chart's original timeframe (inherited from
 * fetchMultiTimeframeBars()'s own restore-on-completion discipline).
 */
export async function analyzeMarket({ _deps } = {}) {
  const deps = resolveDeps(_deps);
  const { byTf, fetchErrors } = await fetchMultiTimeframeBars(deps);

  const split = {};
  for (const tf of ALL_TIMEFRAMES) split[tf] = validateAndSplit(byTf[tf], TF_MINUTES[tf]);

  const original = await deps.getState();
  const prefetched = buildPrefetchedDeps(byTf, original.symbol, original.resolution);
  let ephemeralStore = { signals: [] }; // never persisted -- see module doc

  const decision = await calculateEntry({
    _deps: {
      getState: prefetched.getState,
      setTimeframe: prefetched.setTimeframe,
      getOhlcv: prefetched.getOhlcv,
      // Forwarded from the SAME outer deps as the rest of this call (real
      // getMasterState by default, or a test's injected mock) -- must
      // never silently fall back to calculateEntry()'s own real default,
      // which would attempt a live CDP connection this orchestrator has
      // no reason to make twice.
      getMasterState: deps.getMasterState,
      loadStore: () => ephemeralStore,
      saveStore: (_path, s) => { ephemeralStore = s; },
    },
  });

  const primarySplit = split[PRIMARY_TIMEFRAME];
  const evidence = !primarySplit?.error && primarySplit?.confirmed?.length > 0
    ? computeEvidence(primarySplit.confirmed, split, decision.setup ?? null)
    : null;

  const confluence = evidence ? buildConfluenceReport({ decision, decisionTimeframes: decision.timeframes ?? null, ...evidence }) : null;

  return {
    ...decision,
    evidence_available: !!evidence,
    evidence_unavailable_reason: evidence ? null : (primarySplit?.error ?? 'insufficient confirmed bars on the primary (15m) timeframe'),
    confluence,
    fetch_errors: fetchErrors,
  };
}
