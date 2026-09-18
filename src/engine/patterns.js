/**
 * Classical chart-pattern detection (Part 4 / mission Part D). Built
 * entirely on structure.js's existing pivots (never recomputes pivot
 * detection) plus simple least-squares trendline fitting over recent
 * pivots. Every detector is a deterministic geometry/tolerance test, no
 * visual curve-fitting. PATTERN DETECTED != TRADE: this module never
 * produces BUY/SELL, only structured evidence for the confluence layer.
 *
 * No lookahead: patterns are built only from `bars[0..last]` (confirmed
 * bars) and `structure.pivots`, which structure.js itself already
 * computes without lookahead (a pivot at index i is only reported once
 * `pivotRightBars` later confirmed bars exist).
 *
 * Cup & Handle / Inverse Cup & Handle are intentionally NOT implemented:
 * distinguishing a genuine rounding "cup" from an arbitrary irregular
 * recovery requires a curve/shape-similarity heuristic beyond the
 * objective pivot/trendline-tolerance tests used everywhere else in this
 * module, and would effectively be visual curve-fitting -- exactly what
 * the mission says not to force.
 */

export const PATTERN_PARAMS = {
  topBottomTolerancePct: 0.25, // % price tolerance for two/three tops or bottoms to count as "comparable height"
  minPullbackAtrMult: 1.0, // minimum neckline pullback depth (in ATR) between tops/bottoms, filters noise
  shoulderTolerancePct: 0.5, // % tolerance for H&S shoulders to count as "comparable" to each other
  headMinExcessPct: 0.15, // % the head must exceed both shoulders by, minimum
  trendlineLookbackPivots: 4, // how many of the most recent same-type pivots to fit a trendline through
  flatSlopePctPerBar: 0.01, // |slope| below this (as % of price per bar) counts as "flat"
  convergingMinShrinkPct: 20, // the gap between upper/lower lines must shrink by at least this % end-to-start to count as "converging"
  parallelMaxShrinkPct: 15, // the gap must shrink by LESS than this % to count as "parallel" (channel, not wedge/triangle)
  poleMinAtrMult: 3.0, // minimum net displacement (in ATR) over the pole window to qualify as an impulsive flag/pennant pole
  poleMaxBars: 8, // maximum bars the pole move may take
  flagWindowBars: 10, // bars examined for the consolidation after the pole
  flagMaxRetraceRatio: 0.5, // the consolidation's own range must stay within this fraction of the pole's range
};

function pct(a, b) { return b === 0 ? Infinity : Math.abs(a - b) / Math.abs(b) * 100; }

/** Ordinary least squares fit over [{x,y}]. Returns { slope, intercept, r2 }. */
function linreg(points) {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0; let den = 0;
  for (const p of points) { num += (p.x - meanX) * (p.y - meanY); den += (p.x - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0; let ssTot = 0;
  for (const p of points) {
    const pred = slope * p.x + intercept;
    ssRes += (p.y - pred) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

function lineValueAt(line, x) { return line.slope * x + line.intercept; }

let patternCounter = 0;
function makePatternId(type, startTime) { patternCounter += 1; return `${type}_${startTime}_${patternCounter}`; }

function basePattern({ type, family, bias, pivotPoints, neckline = null, boundary = null, breakoutLevel = null, invalidationLevel = null, completionState, confirmationState, evidence = {}, confirmed = true }) {
  const start = pivotPoints[0];
  const end = pivotPoints[pivotPoints.length - 1];
  return {
    pattern_id: makePatternId(type, start?.time ?? 0),
    pattern_type: type,
    family,
    bias,
    start_time: start?.time ?? null,
    end_time: end?.time ?? null,
    pivot_points: pivotPoints,
    neckline, boundary,
    breakout_level: breakoutLevel,
    invalidation_level: invalidationLevel,
    completion_state: completionState, // FORMING | COMPLETE_UNCONFIRMED | CONFIRMED | INVALIDATED
    confirmation_state: confirmationState,
    confirmed,
    evidence,
  };
}

function pivotPoint(bars, p) { return { time: bars[p.index]?.time ?? null, price: p.price, index: p.index, label: p.label }; }

/** Double/Triple Top and Bottom. */
function detectTopBottomPatterns(bars, structure, params) {
  const patterns = [];
  const highs = (structure.pivots ?? []).filter((p) => p.type === 'high');
  const lows = (structure.pivots ?? []).filter((p) => p.type === 'low');
  const lastClose = bars[bars.length - 1].close;

  function scanPeaks(peaks, valleys, isTop) {
    if (peaks.length < 2) return;
    // Triple first (more specific), then double, using the most recent peaks.
    for (const count of [3, 2]) {
      if (peaks.length < count) continue;
      const recent = peaks.slice(-count);
      const prices = recent.map((p) => p.price);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const withinTol = prices.every((pr) => pct(pr, avg) <= params.topBottomTolerancePct);
      if (!withinTol) continue;
      // The intervening valleys/peaks (opposite type) between the first and last of the group form the neckline candidates.
      const between = valleys.filter((v) => v.index > recent[0].index && v.index < recent[recent.length - 1].index);
      if (between.length === 0) continue;
      const necklinePrice = isTop ? Math.min(...between.map((v) => v.price)) : Math.max(...between.map((v) => v.price));
      const pullbackPct = pct(recent[0].price, necklinePrice);
      if (pullbackPct < params.topBottomTolerancePct) continue; // essentially no pullback -- not a real pattern
      const brokeNeckline = isTop ? lastClose < necklinePrice : lastClose > necklinePrice;
      const invalidated = isTop ? lastClose > Math.max(...prices) * 1.001 : lastClose < Math.min(...prices) * 0.999;
      const type = count === 3 ? (isTop ? 'TRIPLE_TOP' : 'TRIPLE_BOTTOM') : (isTop ? 'DOUBLE_TOP' : 'DOUBLE_BOTTOM');
      patterns.push(basePattern({
        type, family: 'reversal', bias: isTop ? 'BEARISH' : 'BULLISH',
        pivotPoints: recent.map((p) => pivotPoint(bars, p)),
        neckline: necklinePrice,
        breakoutLevel: necklinePrice,
        invalidationLevel: isTop ? Math.max(...prices) : Math.min(...prices),
        completionState: invalidated ? 'INVALIDATED' : brokeNeckline ? 'CONFIRMED' : 'COMPLETE_UNCONFIRMED',
        confirmationState: brokeNeckline ? 'CONFIRMED_BREAK' : 'AWAITING_NECKLINE_BREAK',
        evidence: { peak_prices: prices, avg, necklinePrice, pullbackPct: Math.round(pullbackPct * 100) / 100 },
      }));
      return; // don't also report the double when the triple already matched on the same peaks
    }
  }

  scanPeaks(highs, lows, true);
  scanPeaks(lows, highs, false);
  return patterns;
}

/** Head & Shoulders / Inverse Head & Shoulders. */
function detectHeadAndShoulders(bars, structure, params) {
  const patterns = [];
  const highs = (structure.pivots ?? []).filter((p) => p.type === 'high');
  const lows = (structure.pivots ?? []).filter((p) => p.type === 'low');
  const lastClose = bars[bars.length - 1].close;

  function scan(peaks, valleys, isTop) {
    if (peaks.length < 3) return;
    const [leftShoulder, head, rightShoulder] = peaks.slice(-3);
    const shouldersComparable = pct(leftShoulder.price, rightShoulder.price) <= params.shoulderTolerancePct;
    const headExceedsLeft = isTop ? head.price > leftShoulder.price * (1 + params.headMinExcessPct / 100) : head.price < leftShoulder.price * (1 - params.headMinExcessPct / 100);
    const headExceedsRight = isTop ? head.price > rightShoulder.price * (1 + params.headMinExcessPct / 100) : head.price < rightShoulder.price * (1 - params.headMinExcessPct / 100);
    if (!shouldersComparable || !headExceedsLeft || !headExceedsRight) return;
    const between = valleys.filter((v) => v.index > leftShoulder.index && v.index < rightShoulder.index);
    if (between.length < 2) return;
    const necklinePoints = [between[0], between[between.length - 1]];
    const necklineLine = linreg(necklinePoints.map((v) => ({ x: v.index, y: v.price })));
    const lastIndex = bars.length - 1;
    const necklineAtLast = necklineLine ? lineValueAt(necklineLine, lastIndex) : (necklinePoints[0].price + necklinePoints[1].price) / 2;
    const brokeNeckline = isTop ? lastClose < necklineAtLast : lastClose > necklineAtLast;
    const invalidated = isTop ? lastClose > head.price : lastClose < head.price;
    patterns.push(basePattern({
      type: isTop ? 'HEAD_AND_SHOULDERS' : 'INVERSE_HEAD_AND_SHOULDERS', family: 'reversal', bias: isTop ? 'BEARISH' : 'BULLISH',
      pivotPoints: [leftShoulder, head, rightShoulder].map((p) => pivotPoint(bars, p)),
      neckline: Math.round(necklineAtLast * 100) / 100,
      breakoutLevel: Math.round(necklineAtLast * 100) / 100,
      invalidationLevel: head.price,
      completionState: invalidated ? 'INVALIDATED' : brokeNeckline ? 'CONFIRMED' : 'COMPLETE_UNCONFIRMED',
      confirmationState: brokeNeckline ? 'CONFIRMED_BREAK' : 'AWAITING_NECKLINE_BREAK',
      evidence: { leftShoulder: leftShoulder.price, head: head.price, rightShoulder: rightShoulder.price, necklineAtLast },
    }));
  }

  scan(highs, lows, true);
  scan(lows, highs, false);
  return patterns;
}

/** Triangles, Wedges, Channels, and Rectangle/Consolidation via trendline-slope classification. */
function detectTrendlinePatterns(bars, structure, params) {
  const p = params;
  const highs = (structure.pivots ?? []).filter((pt) => pt.type === 'high').slice(-p.trendlineLookbackPivots);
  const lows = (structure.pivots ?? []).filter((pt) => pt.type === 'low').slice(-p.trendlineLookbackPivots);
  if (highs.length < 2 || lows.length < 2) return [];

  const upper = linreg(highs.map((pt) => ({ x: pt.index, y: pt.price })));
  const lower = linreg(lows.map((pt) => ({ x: pt.index, y: pt.price })));
  if (!upper || !lower) return [];

  const refPrice = bars[bars.length - 1].close;
  const flatThreshold = refPrice * (p.flatSlopePctPerBar / 100);
  const upperFlat = Math.abs(upper.slope) < flatThreshold;
  const lowerFlat = Math.abs(lower.slope) < flatThreshold;
  const upperRising = upper.slope >= flatThreshold;
  const upperFalling = upper.slope <= -flatThreshold;
  const lowerRising = lower.slope >= flatThreshold;
  const lowerFalling = lower.slope <= -flatThreshold;

  const allIndices = [...highs, ...lows].map((pt) => pt.index);
  const startX = Math.min(...allIndices);
  const endX = Math.max(...allIndices);
  const startGap = lineValueAt(upper, startX) - lineValueAt(lower, startX);
  const endGap = lineValueAt(upper, endX) - lineValueAt(lower, endX);
  if (startGap <= 0 || endGap <= 0) return []; // degenerate/crossed lines -- not a coherent channel shape

  const shrinkPct = ((startGap - endGap) / startGap) * 100;
  const converging = shrinkPct >= p.convergingMinShrinkPct;
  const parallel = Math.abs(shrinkPct) <= p.parallelMaxShrinkPct;

  const pivotPts = [...highs, ...lows].sort((a, b) => a.index - b.index).map((pt) => pivotPoint(bars, pt));
  const lastClose = bars[bars.length - 1].close;
  const upperAtLast = lineValueAt(upper, bars.length - 1);
  const lowerAtLast = lineValueAt(lower, bars.length - 1);

  function make(type, family, bias, breakoutLevel, invalidationLevel) {
    const brokenUp = lastClose > upperAtLast;
    const brokenDown = lastClose < lowerAtLast;
    const completionState = (brokenUp || brokenDown) ? 'CONFIRMED' : 'FORMING';
    return basePattern({
      type, family, bias, pivotPoints: pivotPts,
      boundary: { upper: Math.round(upperAtLast * 100) / 100, lower: Math.round(lowerAtLast * 100) / 100 },
      breakoutLevel, invalidationLevel,
      completionState, confirmationState: brokenUp ? 'BROKE_UPPER' : brokenDown ? 'BROKE_LOWER' : 'AWAITING_BREAK',
      evidence: { upperSlope: upper.slope, lowerSlope: lower.slope, shrinkPct: Math.round(shrinkPct * 100) / 100, upperR2: upper.r2, lowerR2: lower.r2 },
    });
  }

  const patterns = [];
  if (converging) {
    if (upperFlat && lowerRising) patterns.push(make('ASCENDING_TRIANGLE', 'continuation', 'BULLISH', upperAtLast, lowerAtLast));
    else if (lowerFlat && upperFalling) patterns.push(make('DESCENDING_TRIANGLE', 'continuation', 'BEARISH', lowerAtLast, upperAtLast));
    else if (upperFalling && lowerRising) patterns.push(make('SYMMETRICAL_TRIANGLE', 'continuation', 'NEUTRAL', null, null));
    else if (upperRising && lowerRising) patterns.push(make('RISING_WEDGE', 'continuation', 'BEARISH', lowerAtLast, upperAtLast));
    else if (upperFalling && lowerFalling) patterns.push(make('FALLING_WEDGE', 'continuation', 'BULLISH', upperAtLast, lowerAtLast));
  } else if (parallel) {
    // A flat/parallel channel IS a "Horizontal Channel" -- reported here
    // as RECTANGLE rather than as a second, identically-shaped pattern
    // type, so the same geometry is never double-counted as two
    // independent detections (mirrors the mission's own "do not treat
    // different names for the same thing as independent votes" rule,
    // extended to pattern naming).
    if (upperFlat && lowerFlat) patterns.push(make('RECTANGLE', 'continuation', 'NEUTRAL', null, null));
    else if (upperRising && lowerRising) patterns.push(make('ASCENDING_CHANNEL', 'continuation', 'BULLISH', upperAtLast, lowerAtLast));
    else if (upperFalling && lowerFalling) patterns.push(make('DESCENDING_CHANNEL', 'continuation', 'BEARISH', lowerAtLast, upperAtLast));
  }
  return patterns;
}

/** Bull/Bear Flag and Pennant: an impulsive pole followed by a brief, shallow consolidation. */
function detectFlagsAndPennants(bars, atrVal, params) {
  const p = params;
  if (!Number.isFinite(atrVal) || atrVal <= 0 || bars.length < p.poleMaxBars + p.flagWindowBars + 1) return [];
  const i = bars.length - 1;
  const consolidation = bars.slice(i - p.flagWindowBars + 1, i + 1);
  const consolidationHigh = Math.max(...consolidation.map((b) => b.high));
  const consolidationLow = Math.min(...consolidation.map((b) => b.low));
  const consolidationRange = consolidationHigh - consolidationLow;

  const poleStart = i - p.flagWindowBars - p.poleMaxBars + 1;
  const poleEnd = i - p.flagWindowBars;
  if (poleStart < 0 || poleEnd < poleStart) return [];
  const poleBars = bars.slice(poleStart, poleEnd + 1);
  const poleMove = poleBars[poleBars.length - 1].close - poleBars[0].open;
  const poleDisplacement = Math.abs(poleMove) / atrVal;
  if (poleDisplacement < p.poleMinAtrMult) return [];
  const isBullishPole = poleMove > 0;
  const poleRange = Math.max(...poleBars.map((b) => b.high)) - Math.min(...poleBars.map((b) => b.low));
  if (poleRange <= 0 || consolidationRange / poleRange > p.flagMaxRetraceRatio) return [];

  // Converging (first half range wider than second half) => pennant; otherwise a parallel-channel flag.
  const mid = Math.floor(consolidation.length / 2);
  const firstHalfRange = Math.max(...consolidation.slice(0, mid).map((b) => b.high)) - Math.min(...consolidation.slice(0, mid).map((b) => b.low));
  const secondHalfRange = Math.max(...consolidation.slice(mid).map((b) => b.high)) - Math.min(...consolidation.slice(mid).map((b) => b.low));
  const isPennant = firstHalfRange > 0 && secondHalfRange / firstHalfRange <= 0.6;

  const type = isPennant ? 'PENNANT' : (isBullishPole ? 'BULL_FLAG' : 'BEAR_FLAG');
  const bias = isBullishPole ? 'BULLISH' : 'BEARISH';
  const breakoutLevel = isBullishPole ? consolidationHigh : consolidationLow;
  const invalidationLevel = isBullishPole ? consolidationLow : consolidationHigh;
  const lastClose = bars[i].close;
  const broke = isBullishPole ? lastClose > breakoutLevel : lastClose < breakoutLevel;

  return [basePattern({
    type, family: 'continuation', bias,
    pivotPoints: [
      { time: poleBars[0].time, price: poleBars[0].open, index: poleStart, label: 'POLE_START' },
      { time: poleBars[poleBars.length - 1].time, price: poleBars[poleBars.length - 1].close, index: poleEnd, label: 'POLE_END' },
      { time: consolidation[consolidation.length - 1].time, price: lastClose, index: i, label: 'CONSOLIDATION_END' },
    ],
    boundary: { high: consolidationHigh, low: consolidationLow },
    breakoutLevel, invalidationLevel,
    completionState: broke ? 'CONFIRMED' : 'FORMING',
    confirmationState: broke ? 'CONFIRMED_BREAK' : 'AWAITING_BREAK',
    evidence: { poleDisplacementAtr: Math.round(poleDisplacement * 100) / 100, consolidationRange, poleRange, isPennant },
  })];
}

/**
 * Detects all implemented classical chart patterns as of the LAST
 * confirmed bar. `structure`: computeStructure() result for the same
 * `bars`. `atrVal`: current ATR (for flag/pennant pole sizing only).
 */
export function detectClassicalPatterns(bars, structure, atrVal = null, params = PATTERN_PARAMS) {
  if (!Array.isArray(bars) || bars.length === 0 || !structure?.pivots) return [];
  return [
    ...detectTopBottomPatterns(bars, structure, params),
    ...detectHeadAndShoulders(bars, structure, params),
    ...detectTrendlinePatterns(bars, structure, params),
    ...detectFlagsAndPennants(bars, atrVal, params),
  ];
}
