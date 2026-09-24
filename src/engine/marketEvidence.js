/**
 * EI-1 -- Shared Market Evidence foundation (Entry Intelligence Integration,
 * Stage 1). See docs/XAUUSD_LIVE_RUNTIME.md's Entry Intelligence design
 * audit for the full authority boundary this module exists inside.
 *
 * THIS MODULE NEVER COMPUTES OR CHANGES A TRADING DECISION. It NEVER
 * produces BUY/SELL, NEVER gates, and is NEVER read by models.js, risk.js,
 * quality.js, mtf.js, htf.js, or signalStore.js's concurrency guard.
 * `regime`/`structure` are ALREADY-COMPUTED inputs the caller must supply
 * (the SAME regime.js/structure.js output the protected pipeline itself
 * produced for the exact same confirmed-bar set) -- this module NEVER
 * recomputes them, closing the architectural duplication the EI-1 design
 * audit identified (xauusd_analyze_market.js previously called
 * classifyRegime()/computeStructure() a second, independent time on the
 * same bars runPipeline() had already processed).
 *
 * Every detector below is the SAME, unmodified, pre-existing
 * implementation (candlesticks.js/patterns.js/breakout.js/levels.js/
 * liquidity.js/volatility.js/session.js/strategies/eligibility.js) --
 * this module only assembles their calls, it never copies or re-derives
 * their algorithms, thresholds, or definitions.
 *
 * PURE: no network/fetch, no AI, no state mutation, no persistence.
 * NO LOOKAHEAD: `confirmedBars` must already exclude the forming bar
 * (the same discipline every detector it calls already enforces
 * independently) -- this module adds no new bar-selection logic of its
 * own, it only forwards the same array to each detector, exactly as
 * xauusd_analyze_market.js's pre-EI-1 computeEvidence() already did.
 */
import { atr } from './math.js';
import { detectCandlestickPatterns } from './candlesticks.js';
import { detectClassicalPatterns } from './patterns.js';
import { classifyBreakoutState } from './breakout.js';
import { computeLiquidityContext } from './liquidity.js';
import { buildLevels } from './levels.js';
import { computeVolatilityContext } from './volatility.js';
import { computeSessionContext } from './session.js';
import { computeStrategyEligibility } from './strategies/eligibility.js';

/**
 * `confirmedBars`: confirmed OHLCV for the timeframe being analyzed
 * (oldest-first, forming bar already excluded by the caller).
 * `regime`/`structure`: ALREADY-COMPUTED protected-pipeline outputs for
 * this SAME confirmed-bar set (regime.js:classifyRegime() /
 * structure.js:computeStructure()) -- required, never recomputed here.
 * `selectedModel`: the model code the protected pipeline actually
 * triggered (if any), passed through only for eligibility's own
 * informational consistency cross-check -- never re-derived.
 * `priorDayHigh`/`priorDayLow`/`priorWeekHigh`/`priorWeekLow`: optional
 * cross-timeframe context for liquidity.js's prior-period sweep check;
 * `null` degrades that one field gracefully, exactly as before.
 */
export function computeMarketEvidence({
  confirmedBars, regime, structure, selectedModel = null,
  priorDayHigh = null, priorDayLow = null, priorWeekHigh = null, priorWeekLow = null,
}) {
  const lastIndex = confirmedBars.length - 1;
  const atrSeries = atr(confirmedBars, 14);
  const atrVal = atrSeries.at(-1);

  return {
    eligibility: computeStrategyEligibility({ regime, structure, selectedModel }),
    candlestickPatterns: detectCandlestickPatterns(confirmedBars, lastIndex),
    classicalPatterns: detectClassicalPatterns(confirmedBars, structure, atrVal),
    breakoutState: classifyBreakoutState({ bars: confirmedBars, structure, atrVal }),
    volatilityContext: computeVolatilityContext(confirmedBars),
    levelsContext: buildLevels(confirmedBars, structure),
    sessionContext: computeSessionContext(confirmedBars),
    liquidityContext: computeLiquidityContext({
      bars: confirmedBars, structure, atrSeries,
      priorDayHigh, priorDayLow, priorWeekHigh, priorWeekLow,
    }),
  };
}
