/**
 * Parameters for the intraday_5m engine profile (src/engine/intraday/).
 *
 * These are 5m-scale calibrations of the reference engine's 15m values,
 * NOT a global loosening of the reference engine (whose own constants in
 * src/engine/{models,risk,quality,correction}.js are untouched and still
 * the locked P7/C4 research reference). The two values the redesign
 * proposal committed to keeping are kept verbatim: qualityThreshold 65
 * and minRR 1.7. What changes is WHERE quality/RR are measured (the 5m
 * entry candle with objective-aware target selection) and WHICH gates
 * are hard vetoes (see docs/XAUUSD_MCP_ENGINE.md, "intraday_5m profile").
 */

export const INTRADAY_PARAMS = Object.freeze({
  entryTimeframe: '5',
  biasTimeframe: '15',

  // Momentum Continuation (MC): N consecutive 5m closes on the bias side
  // of the 5m EMA20, each progressing, with expanding volatility, and a
  // confirmed close beyond the prior 5m swing within the last few bars.
  mcConfirmBars: 3,
  mcMinAtrRatio: 1.0, // 5m ATR14 vs its 100-bar average: expansion, not contraction
  mcMaxEntryLateBars: 3, // bars since the swing break -- later than this is chasing
  mcLegBaseLookback: 2, // SL anchor = lowest low/highest high of the momentum leg (breakout bar - this .. now)

  // Pullback Continuation (PB): 5m correction measured AGAINST THE 15m
  // BIAS DIRECTION (not 5m structure, which flips during every pullback).
  pbSwingLookback: 20,
  pbCorrAtrMultiplier: 1.0, // 5m pullback depth in 5m ATR (15m reference uses 1.2 x 15m ATR)
  pbResolveConfirmBars: 2, // consecutive 5m closes back on the bias side of EMA20
  pbMaxEntryLateBars: 3, // bars since resolution -- later than this is chasing

  // Breakout / Retest (BO): same rule as the reference model, on 5m.
  boRetestAtrTol: 0.3,
  boMaxEntryLateBars: 10,

  // Structure / Rejection (SR): a real rejection candle at a 15m or 5m
  // swing level, not merely "a swing exists nearby".
  srLevelTouchAtr: 0.3, // wick must reach within this many ATR of the level
  srLevelPierceAtr: 0.6, // ...and not pierce it by more than this
  srMinWickRatio: 0.5, // rejection wick >= 50% of the bar's range
  srCloseLocation: 1 / 3, // close within the top (BUY) / bottom (SELL) third of the bar
  srSweepMaxAgeBars: 3, // counter-structure SR: a confirmed 5m liquidity sweep at the level within this many bars

  // Controlled Mean Reversion (MR): 15m RANGE only, 30m not trending,
  // fresh 5m sweep + reclaim, target = 15m range midpoint.
  mrSweepMaxAgeBars: 3,

  // Risk / objective selection.
  overextendAtrMult: 2.5,
  slAtrBuffer: 0.25,
  slAtrFallback: 1.5,
  minRiskAtr: 0.5, // never place the engine stop inside 5m noise
  tp1RMultiple: 1.0,
  objectiveMinR: 1.0, // structural objectives closer than this are "minor" and skipped
  objectiveLookbackPivots5m: 10,
  objectiveLookbackPivots15m: 6,
  tp2RMultipleDefault: 2.0,
  tp2RMultipleCap: 3.0,
  minRR: 1.7, // kept verbatim from the reference engine
  minAtrUsd: 2.0, // volatility sufficiency: the +3 USD overlay target must be <= ~1.5 x 5m ATR

  // Quality.
  qualityThreshold: 65, // kept verbatim from the reference engine
  neutralBiasQualityThreshold: 70, // trades taken without a 15m directional bias need more
  htfOpposedQualityPenalty: 5, // 1H regime opposed but not a hard veto (aligned continuation)

  // Bias.
  freshChochMaxAgeBars: 3, // a 15m CHoCH this recent vetoes trades against it
});
