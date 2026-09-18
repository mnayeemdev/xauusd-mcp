/**
 * Deterministic candlestick-pattern evidence from confirmed OHLCV bars.
 *
 * No lookahead: detectCandlestickPatterns(bars, i) only ever reads
 * bars[0..i] -- it never inspects bars[j] for j > i. Prior-trend context
 * (used by the Hammer/Hanging Man/Inverted Hammer/Shooting Star family)
 * is derived from bars[0..i-1] only, so the CURRENT candle's own shape
 * never contaminates the "prior trend" it is being judged against.
 *
 * A candlestick pattern is EVIDENCE, never trade authority -- this module
 * returns structured observations only; nothing here decides BUY/SELL.
 *
 * Multiple patterns may legitimately co-occur on the same bar (e.g. a
 * Dragonfly Doji is also a Doji). Patterns are made mutually exclusive
 * only where their own numeric thresholds are inherently disjoint (Doji
 * vs Marubozu: dojiBodyToRangeMax=0.1 vs marubozuMinBodyToRange=0.9 never
 * overlap) or where sharing would be geometrically incoherent (Hammer
 * requires a DOWN prior trend and Hanging Man requires UP, from the exact
 * same candle shape, so at most one of the two ever fires for a given
 * bar).
 */
import { ema } from './math.js';

export const CANDLESTICK_PARAMS = {
  // --- prior-trend context (Hammer/Hanging Man/Inverted Hammer/Shooting Star) ---
  trendLookback: 5, // bars back to compare EMA(5) against, using bars[0..i-1] only
  trendEmaLen: 5,
  trendMinSlopeAbsPct: 0.0015, // |slope| below this -> FLAT (no trend context, those 4 patterns do not fire)

  // --- doji family ---
  dojiBodyToRangeMax: 0.1, // body/range <= this -> Doji
  longLeggedWickMin: 0.35, // both wicks/range >= this -> Long-Legged Doji
  dragonflyUpperWickMax: 0.1, // upper wick/range <= this (+ large lower wick) -> Dragonfly Doji
  dragonflyLowerWickMin: 0.6,
  gravestoneLowerWickMax: 0.1, // lower wick/range <= this (+ large upper wick) -> Gravestone Doji
  gravestoneUpperWickMin: 0.6,

  // --- marubozu / spinning top ---
  marubozuMinBodyToRange: 0.9, // body/range >= this -> Marubozu (disjoint from dojiBodyToRangeMax)
  marubozuWickMax: 0.05, // each wick/range <= this
  spinningBodyToRangeMax: 0.3, // body/range in (dojiBodyToRangeMax, this] -> Spinning Top candidate
  spinningWickMin: 0.25, // each wick/range >= this
  spinningWickBalanceTol: 0.15, // |upperWickRatio - lowerWickRatio| <= this ("roughly similar")

  // --- hammer family (wick-to-BODY dominance + trend context) ---
  hammerMaxBodyToRange: 0.35,
  hammerDominantWickToBodyMin: 2.0, // dominant wick >= this * body
  hammerOppositeWickRatioMax: 0.15, // the non-dominant wick/range must stay small

  // --- pin bar / rejection (wick-to-RANGE dominance, trend-independent) ---
  pinBarWickRatioMin: 0.6, // dominant wick/range >= this
  pinBarClosePositionMin: 0.66, // close within the outer third of the range, on the rejection side

  // --- two-candle ---
  tweezerTolerancePct: 0.001, // |high_i - high_{i-1}| / avgHigh <= this (0.1%) -> "equal" highs/lows
  haramiMaxBodyRatio: 0.5, // body_i / body_{i-1} <= this -> bar i is "meaningfully smaller"

  // --- multi-candle (star family) ---
  starLargeBodyMin: 0.6, // body/range >= this -> "large" first/third candle
  starSmallBodyMax: 0.3, // body/range <= this -> "small/indecisive" middle candle
  starPenetrationMin: 0.5, // third candle must close >= this fraction into the first candle's body

  // --- three soldiers / crows ---
  soldiersMinBodyToRange: 0.6,
  soldiersMaxWickRatio: 0.15, // the wick opposing the move must stay small on every candle
};

function isFiniteBar(b) {
  return !!b && [b.open, b.high, b.low, b.close].every(Number.isFinite)
    && b.high >= b.low && b.high >= b.open && b.high >= b.close && b.low <= b.open && b.low <= b.close;
}

function geom(b) {
  const range = b.high - b.low;
  const body = Math.abs(b.close - b.open);
  const upperWick = b.high - Math.max(b.open, b.close);
  const lowerWick = Math.min(b.open, b.close) - b.low;
  const closePosition = range > 0 ? (b.close - b.low) / range : 0.5;
  return {
    range, body, upperWick, lowerWick, closePosition,
    bodyToRange: range > 0 ? body / range : 0,
    upperWickRatio: range > 0 ? upperWick / range : 0,
    lowerWickRatio: range > 0 ? lowerWick / range : 0,
    isBullish: b.close > b.open,
    isBearish: b.close < b.open,
  };
}

/** Prior-trend direction from bars[0..i-1] only -- never sees bar i itself. */
function computePriorTrend(bars, i, params) {
  const upToPrev = bars.slice(0, i);
  if (upToPrev.length < params.trendEmaLen + params.trendLookback) return 'UNKNOWN';
  const closes = upToPrev.map((b) => b.close);
  const emaSeries = ema(closes, params.trendEmaLen);
  const lastIdx = emaSeries.length - 1;
  const prevIdx = lastIdx - params.trendLookback;
  const last = emaSeries[lastIdx];
  const prev = prevIdx >= 0 ? emaSeries[prevIdx] : null;
  if (last === null || prev === null || prev === 0) return 'UNKNOWN';
  const slope = (last - prev) / Math.abs(prev);
  if (Math.abs(slope) < params.trendMinSlopeAbsPct) return 'FLAT';
  return slope > 0 ? 'UP' : 'DOWN';
}

function pushIf(out, cond, entry) {
  if (cond) out.push(entry);
}

function detectSingleCandle(bars, i, params, out) {
  const b = bars[i];
  const g = geom(b);
  if (g.range <= 0) return; // degenerate flat bar -- no shape can be assessed

  const isDoji = g.bodyToRange <= params.dojiBodyToRangeMax;
  pushIf(out, isDoji, {
    pattern: 'DOJI', family: 'single_candle', bias: 'NEUTRAL', bar_index: i, bar_time: b.time,
    evidence: { bodyToRange: g.bodyToRange },
  });
  pushIf(out, isDoji && g.upperWickRatio >= params.longLeggedWickMin && g.lowerWickRatio >= params.longLeggedWickMin, {
    pattern: 'LONG_LEGGED_DOJI', family: 'single_candle', bias: 'NEUTRAL', bar_index: i, bar_time: b.time,
    evidence: { upperWickRatio: g.upperWickRatio, lowerWickRatio: g.lowerWickRatio },
  });
  pushIf(out, isDoji && g.upperWickRatio <= params.dragonflyUpperWickMax && g.lowerWickRatio >= params.dragonflyLowerWickMin, {
    pattern: 'DRAGONFLY_DOJI', family: 'single_candle', bias: 'BULLISH', bar_index: i, bar_time: b.time,
    evidence: { upperWickRatio: g.upperWickRatio, lowerWickRatio: g.lowerWickRatio },
  });
  pushIf(out, isDoji && g.lowerWickRatio <= params.gravestoneLowerWickMax && g.upperWickRatio >= params.gravestoneUpperWickMin, {
    pattern: 'GRAVESTONE_DOJI', family: 'single_candle', bias: 'BEARISH', bar_index: i, bar_time: b.time,
    evidence: { upperWickRatio: g.upperWickRatio, lowerWickRatio: g.lowerWickRatio },
  });

  const isMarubozu = g.bodyToRange >= params.marubozuMinBodyToRange && g.upperWickRatio <= params.marubozuWickMax && g.lowerWickRatio <= params.marubozuWickMax;
  pushIf(out, isMarubozu, {
    pattern: 'MARUBOZU', family: 'single_candle', bias: g.isBullish ? 'BULLISH' : 'BEARISH', bar_index: i, bar_time: b.time,
    evidence: { bodyToRange: g.bodyToRange, upperWickRatio: g.upperWickRatio, lowerWickRatio: g.lowerWickRatio },
  });

  const isSpinning = !isDoji && g.bodyToRange <= params.spinningBodyToRangeMax
    && g.upperWickRatio >= params.spinningWickMin && g.lowerWickRatio >= params.spinningWickMin
    && Math.abs(g.upperWickRatio - g.lowerWickRatio) <= params.spinningWickBalanceTol;
  pushIf(out, isSpinning, {
    pattern: 'SPINNING_TOP', family: 'single_candle', bias: 'NEUTRAL', bar_index: i, bar_time: b.time,
    evidence: { bodyToRange: g.bodyToRange, upperWickRatio: g.upperWickRatio, lowerWickRatio: g.lowerWickRatio },
  });

  // Hammer family: wick-to-BODY dominance + prior-trend context. A small
  // (even doji-sized) body is fine here -- a hammer-shaped Dragonfly Doji
  // in a downtrend is a legitimate co-occurrence, not a conflict (only
  // g.body > 0 is required, to keep the wick/body RATIO meaningful).
  if (g.body > 0) {
    const lowerDominant = g.lowerWick >= params.hammerDominantWickToBodyMin * g.body
      && g.upperWickRatio <= params.hammerOppositeWickRatioMax && g.bodyToRange <= params.hammerMaxBodyToRange;
    const upperDominant = g.upperWick >= params.hammerDominantWickToBodyMin * g.body
      && g.lowerWickRatio <= params.hammerOppositeWickRatioMax && g.bodyToRange <= params.hammerMaxBodyToRange;

    if (lowerDominant || upperDominant) {
      const trend = computePriorTrend(bars, i, params);
      if (lowerDominant && trend === 'DOWN') {
        out.push({ pattern: 'HAMMER', family: 'single_candle', bias: 'BULLISH', bar_index: i, bar_time: b.time, evidence: { lowerWick: g.lowerWick, body: g.body, priorTrend: trend } });
      }
      if (lowerDominant && trend === 'UP') {
        out.push({ pattern: 'HANGING_MAN', family: 'single_candle', bias: 'BEARISH', bar_index: i, bar_time: b.time, evidence: { lowerWick: g.lowerWick, body: g.body, priorTrend: trend } });
      }
      if (upperDominant && trend === 'DOWN') {
        out.push({ pattern: 'INVERTED_HAMMER', family: 'single_candle', bias: 'BULLISH', bar_index: i, bar_time: b.time, evidence: { upperWick: g.upperWick, body: g.body, priorTrend: trend } });
      }
      if (upperDominant && trend === 'UP') {
        out.push({ pattern: 'SHOOTING_STAR', family: 'single_candle', bias: 'BEARISH', bar_index: i, bar_time: b.time, evidence: { upperWick: g.upperWick, body: g.body, priorTrend: trend } });
      }
    }

    // Pin bar / rejection: wick-to-RANGE dominance, trend-independent.
    pushIf(out, g.lowerWickRatio >= params.pinBarWickRatioMin && g.closePosition >= params.pinBarClosePositionMin, {
      pattern: 'BULLISH_PIN_BAR', family: 'single_candle', bias: 'BULLISH', bar_index: i, bar_time: b.time,
      evidence: { lowerWickRatio: g.lowerWickRatio, closePosition: g.closePosition },
    });
    pushIf(out, g.upperWickRatio >= params.pinBarWickRatioMin && g.closePosition <= 1 - params.pinBarClosePositionMin, {
      pattern: 'BEARISH_PIN_BAR', family: 'single_candle', bias: 'BEARISH', bar_index: i, bar_time: b.time,
      evidence: { upperWickRatio: g.upperWickRatio, closePosition: g.closePosition },
    });
  }
}

function detectTwoCandle(bars, i, params, out) {
  if (i < 1 || !isFiniteBar(bars[i - 1])) return;
  const b0 = bars[i - 1];
  const b1 = bars[i];
  const g0 = geom(b0);
  const g1 = geom(b1);
  if (g0.range <= 0 || g1.range <= 0) return;

  const lo0 = Math.min(b0.open, b0.close);
  const hi0 = Math.max(b0.open, b0.close);
  const lo1 = Math.min(b1.open, b1.close);
  const hi1 = Math.max(b1.open, b1.close);

  pushIf(out, g0.isBearish && g1.isBullish && lo1 < lo0 && hi1 > hi0, {
    pattern: 'BULLISH_ENGULFING', family: 'two_candle', bias: 'BULLISH', bar_index: i, bar_time: b1.time,
    evidence: { prevBody: [lo0, hi0], body: [lo1, hi1] },
  });
  pushIf(out, g0.isBullish && g1.isBearish && lo1 < lo0 && hi1 > hi0, {
    pattern: 'BEARISH_ENGULFING', family: 'two_candle', bias: 'BEARISH', bar_index: i, bar_time: b1.time,
    evidence: { prevBody: [lo0, hi0], body: [lo1, hi1] },
  });

  const insideStrict = b1.high <= b0.high && b1.low >= b0.low && (b1.high < b0.high || b1.low > b0.low);
  pushIf(out, insideStrict, { pattern: 'INSIDE_BAR', family: 'two_candle', bias: 'NEUTRAL', bar_index: i, bar_time: b1.time, evidence: { prevHigh: b0.high, prevLow: b0.low, high: b1.high, low: b1.low } });

  const outsideStrict = b1.high >= b0.high && b1.low <= b0.low && (b1.high > b0.high || b1.low < b0.low);
  pushIf(out, outsideStrict, { pattern: 'OUTSIDE_BAR', family: 'two_candle', bias: 'NEUTRAL', bar_index: i, bar_time: b1.time, evidence: { prevHigh: b0.high, prevLow: b0.low, high: b1.high, low: b1.low } });

  const avgHigh = (b0.high + b1.high) / 2;
  const avgLow = (b0.low + b1.low) / 2;
  const tweezerTop = avgHigh > 0 && Math.abs(b1.high - b0.high) / avgHigh <= params.tweezerTolerancePct && !g1.isBullish;
  pushIf(out, tweezerTop, { pattern: 'TWEEZER_TOP', family: 'two_candle', bias: 'BEARISH', bar_index: i, bar_time: b1.time, evidence: { prevHigh: b0.high, high: b1.high } });
  const tweezerBottom = avgLow > 0 && Math.abs(b1.low - b0.low) / avgLow <= params.tweezerTolerancePct && !g1.isBearish;
  pushIf(out, tweezerBottom, { pattern: 'TWEEZER_BOTTOM', family: 'two_candle', bias: 'BULLISH', bar_index: i, bar_time: b1.time, evidence: { prevLow: b0.low, low: b1.low } });

  const bodyInside = lo1 >= lo0 && hi1 <= hi0;
  const meaningfullySmaller = g0.body > 0 && g1.body / g0.body <= params.haramiMaxBodyRatio;
  pushIf(out, bodyInside && meaningfullySmaller && g0.isBearish, {
    pattern: 'BULLISH_HARAMI', family: 'two_candle', bias: 'BULLISH', bar_index: i, bar_time: b1.time, evidence: { prevBody: [lo0, hi0], body: [lo1, hi1] },
  });
  pushIf(out, bodyInside && meaningfullySmaller && g0.isBullish, {
    pattern: 'BEARISH_HARAMI', family: 'two_candle', bias: 'BEARISH', bar_index: i, bar_time: b1.time, evidence: { prevBody: [lo0, hi0], body: [lo1, hi1] },
  });

  const midpoint0 = (b0.open + b0.close) / 2;
  pushIf(out, g0.isBearish && b1.open < b0.low && b1.close > midpoint0 && b1.close < b0.open, {
    pattern: 'PIERCING_PATTERN', family: 'two_candle', bias: 'BULLISH', bar_index: i, bar_time: b1.time, evidence: { prevMidpoint: midpoint0, open: b1.open, close: b1.close },
  });
  pushIf(out, g0.isBullish && b1.open > b0.high && b1.close < midpoint0 && b1.close > b0.open, {
    pattern: 'DARK_CLOUD_COVER', family: 'two_candle', bias: 'BEARISH', bar_index: i, bar_time: b1.time, evidence: { prevMidpoint: midpoint0, open: b1.open, close: b1.close },
  });
}

function detectMultiCandle(bars, i, params, out) {
  if (i < 2 || !isFiniteBar(bars[i - 1]) || !isFiniteBar(bars[i - 2])) return;
  const b2 = bars[i - 2];
  const b1 = bars[i - 1];
  const b0 = bars[i];
  const g2 = geom(b2);
  const g1 = geom(b1);
  const g0 = geom(b0);
  if (g2.range <= 0 || g1.range <= 0 || g0.range <= 0) return;

  const body2Lo = Math.min(b2.open, b2.close);
  const body2Hi = Math.max(b2.open, b2.close);

  if (g2.isBearish && g2.bodyToRange >= params.starLargeBodyMin && g1.bodyToRange <= params.starSmallBodyMax && g0.isBullish && g0.bodyToRange >= params.starLargeBodyMin) {
    const penetration = g2.body > 0 ? (b0.close - body2Lo) / g2.body : 0;
    pushIf(out, penetration >= params.starPenetrationMin, {
      pattern: 'MORNING_STAR', family: 'multi_candle', bias: 'BULLISH', bar_index: i, bar_time: b0.time, evidence: { penetration },
    });
  }
  if (g2.isBullish && g2.bodyToRange >= params.starLargeBodyMin && g1.bodyToRange <= params.starSmallBodyMax && g0.isBearish && g0.bodyToRange >= params.starLargeBodyMin) {
    const penetration = g2.body > 0 ? (body2Hi - b0.close) / g2.body : 0;
    pushIf(out, penetration >= params.starPenetrationMin, {
      pattern: 'EVENING_STAR', family: 'multi_candle', bias: 'BEARISH', bar_index: i, bar_time: b0.time, evidence: { penetration },
    });
  }

  const soldiers = [b2, b1, b0].every((b, idx, arr) => {
    const g = geom(b);
    if (!g.isBullish || g.bodyToRange < params.soldiersMinBodyToRange || g.upperWickRatio > params.soldiersMaxWickRatio) return false;
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    return b.close > prev.close && b.open >= Math.min(prev.open, prev.close) && b.open <= Math.max(prev.open, prev.close);
  });
  pushIf(out, soldiers, { pattern: 'THREE_WHITE_SOLDIERS', family: 'multi_candle', bias: 'BULLISH', bar_index: i, bar_time: b0.time, evidence: {} });

  const crows = [b2, b1, b0].every((b, idx, arr) => {
    const g = geom(b);
    if (!g.isBearish || g.bodyToRange < params.soldiersMinBodyToRange || g.lowerWickRatio > params.soldiersMaxWickRatio) return false;
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    return b.close < prev.close && b.open >= Math.min(prev.open, prev.close) && b.open <= Math.max(prev.open, prev.close);
  });
  pushIf(out, crows, { pattern: 'THREE_BLACK_CROWS', family: 'multi_candle', bias: 'BEARISH', bar_index: i, bar_time: b0.time, evidence: {} });
}

/**
 * Detects all objectively-defined candlestick patterns at confirmed bar
 * index `i`. `bars` must be confirmed OHLCV, oldest-first; the caller is
 * responsible for excluding the currently-forming bar. Never reads
 * bars[j] for j > i.
 */
export function detectCandlestickPatterns(bars, i, params = CANDLESTICK_PARAMS) {
  if (!Array.isArray(bars) || i == null || i < 0 || i >= bars.length) return [];
  if (!isFiniteBar(bars[i])) return [];
  const out = [];
  detectSingleCandle(bars, i, params, out);
  detectTwoCandle(bars, i, params, out);
  detectMultiCandle(bars, i, params, out);
  return out;
}
