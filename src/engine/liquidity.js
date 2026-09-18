/**
 * Deterministic liquidity/sweep analytics (Part 7 of the XAUUSD MCP
 * analysis-engine upgrade). Reuses structure.js's pivots/lastSweep
 * (never recomputes pivot detection) and adds: equal-high/low liquidity
 * pools, sweep+reclaim confirmation, prior-day/week liquidity sweeps,
 * objectively-defined 3-candle fair value gaps, and premium/discount
 * classification within an existing valid dealing range. This module
 * NEVER produces BUY/SELL -- it is evidence only, consumed by the
 * confluence layer.
 *
 * No lookahead: every detector here only reads `bars[0..i]` for the
 * evaluation point `i` it is given (or the full confirmed series when the
 * caller intends "as of the last confirmed bar").
 */

export const LIQUIDITY_PARAMS = {
  equalLevelTolerancePct: 0.1, // % price tolerance to cluster same-type pivots into one liquidity pool
  minClusterSize: 2, // minimum pivot touches to call a cluster a genuine liquidity pool
  sweepReclaimLookback: 5, // bars after a sweep within which a reclaim must occur to count
  fvgMinGapAtrRatio: 0.1, // minimum gap size (as a fraction of that bar's ATR) to count as a valid FVG, filters noise
  premiumThresholdPct: 55, // % position within the dealing range at/above which price is in "premium"
  discountThresholdPct: 45, // % position within the dealing range at/below which price is in "discount"
};

/** Clusters same-type pivots (already filtered to 'high' or 'low' by the caller) into liquidity pools by price proximity. */
export function findEqualLevels(pivots, params = LIQUIDITY_PARAMS) {
  if (!Array.isArray(pivots) || pivots.length === 0) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const avg = current.reduce((s, p) => s + p.price, 0) / current.length;
    const tol = avg * (params.equalLevelTolerancePct / 100);
    if (Math.abs(sorted[k].price - avg) <= tol) current.push(sorted[k]);
    else { clusters.push(current); current = [sorted[k]]; }
  }
  clusters.push(current);
  return clusters
    .filter((c) => c.length >= params.minClusterSize)
    .map((c) => ({ price: c.reduce((s, p) => s + p.price, 0) / c.length, touch_count: c.length, indices: c.map((p) => p.index) }));
}

/**
 * Confirms whether structure.js's most recent liquidity sweep has been
 * followed by genuine reversal follow-through -- not just the initial
 * rejection (which computeStructure() already requires to call it a
 * sweep at all), but a later CONFIRMED close beyond the sweep bar's OWN
 * opposite extreme, within `sweepReclaimLookback` bars.
 */
export function detectSweepReclaim(bars, structure, params = LIQUIDITY_PARAMS) {
  if (!structure?.lastSweep || !Array.isArray(bars) || bars.length === 0) return { swept: false };
  const { type, bar: sweepBarIndex, level } = structure.lastSweep;
  const lastIndex = bars.length - 1;
  const lookbackEnd = Math.min(lastIndex, sweepBarIndex + params.sweepReclaimLookback);
  let reclaimed = false;
  let reclaimBarIndex = null;
  for (let j = sweepBarIndex + 1; j <= lookbackEnd; j++) {
    if (type === 'SWEEP_HIGH' && bars[j].close < bars[sweepBarIndex].low) { reclaimed = true; reclaimBarIndex = j; break; }
    if (type === 'SWEEP_LOW' && bars[j].close > bars[sweepBarIndex].high) { reclaimed = true; reclaimBarIndex = j; break; }
  }
  return {
    swept: true, sweepType: type, level, sweepBarIndex, reclaimed, reclaimBarIndex,
    withinLookback: lastIndex - sweepBarIndex <= params.sweepReclaimLookback,
  };
}

/**
 * Generic prior-period (day/week) liquidity sweep check: did the given
 * bars' realized high/low trade beyond a prior period's high/low, and did
 * the LAST bar close back inside it (SWEPT_REJECTED) or hold beyond it
 * (BROKEN)? `bars` should be the entry-timeframe confirmed series; prior
 * high/low come from the higher-timeframe (D/W) context already fetched
 * elsewhere -- never recomputed here.
 */
export function detectPriorPeriodSweep({ bars, priorHigh, priorLow, tolerancePct = LIQUIDITY_PARAMS.equalLevelTolerancePct }) {
  if (!Array.isArray(bars) || bars.length === 0 || priorHigh == null || priorLow == null) return { high: 'NONE', low: 'NONE' };
  const last = bars[bars.length - 1];
  const highExtreme = Math.max(...bars.map((b) => b.high));
  const lowExtreme = Math.min(...bars.map((b) => b.low));
  const tolHigh = priorHigh * (tolerancePct / 100);
  const tolLow = priorLow * (tolerancePct / 100);
  const sweptHigh = highExtreme > priorHigh + tolHigh;
  const sweptLow = lowExtreme < priorLow - tolLow;
  return {
    high: sweptHigh ? (last.close <= priorHigh ? 'SWEPT_REJECTED' : 'BROKEN') : 'NONE',
    low: sweptLow ? (last.close >= priorLow ? 'SWEPT_REJECTED' : 'BROKEN') : 'NONE',
  };
}

/**
 * Classic objective 3-candle Fair Value Gap: a gap between candle i-2's
 * extreme and candle i's opposite extreme that candle i-1 never filled.
 * `atrSeries[i]` (same-length array aligned to `bars`, e.g. from
 * math.js's atr()) filters out gaps too small to be meaningful noise.
 */
export function detectFairValueGaps(bars, atrSeries, params = LIQUIDITY_PARAMS) {
  const gaps = [];
  if (!Array.isArray(bars) || !Array.isArray(atrSeries)) return gaps;
  for (let i = 2; i < bars.length; i++) {
    const atrVal = atrSeries[i];
    if (!Number.isFinite(atrVal) || atrVal <= 0) continue;
    if (bars[i].low > bars[i - 2].high) {
      const gapLow = bars[i - 2].high;
      const gapHigh = bars[i].low;
      if ((gapHigh - gapLow) / atrVal < params.fvgMinGapAtrRatio) continue;
      gaps.push({ index: i, direction: 'BULLISH', gapLow, gapHigh, filled: isGapFilled(bars, i, gapLow, gapHigh) });
    } else if (bars[i].high < bars[i - 2].low) {
      const gapLow = bars[i].high;
      const gapHigh = bars[i - 2].low;
      if ((gapHigh - gapLow) / atrVal < params.fvgMinGapAtrRatio) continue;
      gaps.push({ index: i, direction: 'BEARISH', gapLow, gapHigh, filled: isGapFilled(bars, i, gapLow, gapHigh) });
    }
  }
  return gaps;
}

function isGapFilled(bars, formedAtIndex, gapLow, gapHigh) {
  for (let j = formedAtIndex + 1; j < bars.length; j++) {
    if (bars[j].low <= gapHigh && bars[j].high >= gapLow) return true;
  }
  return false;
}

/** Premium/discount position within an existing valid dealing range (structure.rangeHigh/rangeLow). Never fabricates a range. */
export function computePremiumDiscount(currentPrice, rangeHigh, rangeLow, params = LIQUIDITY_PARAMS) {
  if (!Number.isFinite(currentPrice) || !Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow) || rangeHigh <= rangeLow) {
    return { zone: null, pct: null };
  }
  const pct = ((currentPrice - rangeLow) / (rangeHigh - rangeLow)) * 100;
  const zone = pct >= params.premiumThresholdPct ? 'PREMIUM' : pct <= params.discountThresholdPct ? 'DISCOUNT' : 'EQUILIBRIUM';
  return { zone, pct: Math.round(pct * 100) / 100 };
}

/** Assembles the full liquidity evidence set for the last confirmed bar. */
export function computeLiquidityContext({ bars, structure, atrSeries = null, priorDayHigh = null, priorDayLow = null, priorWeekHigh = null, priorWeekLow = null }, params = LIQUIDITY_PARAMS) {
  const highs = (structure?.pivots ?? []).filter((p) => p.type === 'high');
  const lows = (structure?.pivots ?? []).filter((p) => p.type === 'low');
  const last = Array.isArray(bars) && bars.length ? bars[bars.length - 1] : null;
  return {
    equalHighs: findEqualLevels(highs, params),
    equalLows: findEqualLevels(lows, params),
    sweepReclaim: detectSweepReclaim(bars, structure, params),
    priorDaySweep: detectPriorPeriodSweep({ bars, priorHigh: priorDayHigh, priorLow: priorDayLow, tolerancePct: params.equalLevelTolerancePct }),
    priorWeekSweep: detectPriorPeriodSweep({ bars, priorHigh: priorWeekHigh, priorLow: priorWeekLow, tolerancePct: params.equalLevelTolerancePct }),
    fairValueGaps: atrSeries ? detectFairValueGaps(bars, atrSeries, params) : [],
    premiumDiscount: last && structure?.rangeHigh != null && structure?.rangeLow != null
      ? computePremiumDiscount(last.close, structure.rangeHigh, structure.rangeLow, params)
      : { zone: null, pct: null },
  };
}
