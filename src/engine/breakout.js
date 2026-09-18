/**
 * Breakout / False-Break / Retest intelligence (Part 6 / mission Part F).
 *
 * Builds ENTIRELY on structure.js's existing `lastEvent` (BOS/CHoCH,
 * already close-confirmed, no lookahead) -- this module never redetects
 * a breakout itself, it only classifies the RICH lifecycle state of the
 * one breakout structure.js already reports, plus displacement/
 * compression/overextension evidence around it. It NEVER produces
 * BUY/SELL: src/engine/models.js's BO model already independently
 * requires retest+reclaim before it will ever trigger a candidate (see
 * evaluateModels() in models.js) -- that gate is untouched and remains
 * authoritative. This module is descriptive evidence for the confluence
 * report only.
 */
import { trueRange } from './math.js';

export const BREAKOUT_PARAMS = {
  retestAtrTol: 0.3, // same convention as models.js's boRetestAtrTol -- distance (in ATR) still counted as "touching" the level
  retestMaxBars: 10, // matches models.js's boMaxEntryLateBars -- window within which a retest is still considered timely
  falseBreakoutMaxBars: 3, // reversal back through the level within this many bars, with no retest ever having occurred, = a quick fakeout
  displacementAtrMult: 1.2, // breakout candle body >= this many ATR = strong displacement
  compressionLookback: 10, // bars immediately before the breakout used to measure pre-breakout compression
  compressionBaselineMult: 3, // the "normal" baseline window is this many times longer than compressionLookback
  compressionRatioMax: 0.7, // (avg TR in lookback) / (avg TR in baseline) <= this => compressed before the breakout
  overextendAtrMult: 2.5, // same convention as risk.js's overextendAtrMult
};

function averageTrueRange(bars, fromIndex, toIndexInclusive) {
  if (fromIndex < 0 || toIndexInclusive < fromIndex) return null;
  const tr = trueRange(bars.slice(0, toIndexInclusive + 1));
  const window = tr.slice(fromIndex, toIndexInclusive + 1);
  if (window.length === 0) return null;
  return window.reduce((a, b) => a + b, 0) / window.length;
}

/**
 * `bars`: confirmed OHLCV, oldest-first. `structure`: computeStructure()
 * result for the SAME bars. `atrVal`: current ATR (e.g. from
 * math.js's atr(bars,14).at(-1)), used for retest tolerance and
 * overextension distance -- never recomputed here.
 */
export function classifyBreakoutState({ bars, structure, atrVal }, params = BREAKOUT_PARAMS) {
  const p = params;
  if (!structure?.lastEvent || !Array.isArray(bars) || bars.length === 0) {
    return { state: 'NO_BREAKOUT', evidence: {} };
  }

  const { direction, bar: eventBar, level, type } = structure.lastEvent;
  const i = bars.length - 1;
  const isBullish = direction === 'BULLISH';
  const breakoutBar = bars[eventBar];
  const barsSinceEvent = i - eventBar;

  const bodySize = Math.abs(breakoutBar.close - breakoutBar.open);
  const displacement = Number.isFinite(atrVal) && atrVal > 0 ? bodySize / atrVal : null;
  const strongDisplacement = displacement !== null && displacement >= p.displacementAtrMult;

  const shortAvgTr = averageTrueRange(bars, eventBar - p.compressionLookback, eventBar - 1);
  const baselineAvgTr = averageTrueRange(bars, eventBar - p.compressionLookback * p.compressionBaselineMult, eventBar - 1);
  const compressionRatio = shortAvgTr !== null && baselineAvgTr ? shortAvgTr / baselineAvgTr : null;
  const compressedBeforeBreakout = compressionRatio !== null && compressionRatio <= p.compressionRatioMax;

  // Retest touch: unlike models.js's looser BO-candidate check (which only
  // cares whether the FINAL bar reclaimed beyond the level), this needs to
  // distinguish a genuine retest -- a wick/close near the level that still
  // HOLDS beyond it -- from a bar that has simply broken back through
  // (which is a failure/reversal, not a retest). Requiring the touching
  // bar's own close to remain beyond the level (or within tolerance of it)
  // is what makes that distinction possible.
  const tol = Number.isFinite(atrVal) ? atrVal * p.retestAtrTol : 0;
  let retested = false;
  let retestBarIndex = null;
  for (let j = eventBar + 1; j <= i; j++) {
    const closeNearLevel = Math.abs(bars[j].close - level) <= tol;
    const heldWickTouch = isBullish ? (bars[j].low <= level + tol && bars[j].close > level) : (bars[j].high >= level - tol && bars[j].close < level);
    if (closeNearLevel || heldWickTouch) { retested = true; retestBarIndex = j; break; }
  }

  const currentBeyond = isBullish ? bars[i].close > level : bars[i].close < level;
  const currentBackInside = !currentBeyond;

  const distanceFromLevel = Math.abs(bars[i].close - level);
  const overextendedRatio = Number.isFinite(atrVal) && atrVal > 0 ? distanceFromLevel / atrVal : null;
  const overextended = overextendedRatio !== null && overextendedRatio >= p.overextendAtrMult;

  const evidence = {
    direction, level, event_type: type, event_bar: eventBar, bars_since_event: barsSinceEvent,
    displacement, strong_displacement: strongDisplacement,
    compression_ratio: compressionRatio, compressed_before_breakout: compressedBeforeBreakout,
    retested, retest_bar_index: retestBarIndex, retest_held: retested && currentBeyond && retestBarIndex !== i,
    distance_from_level: distanceFromLevel, overextended_ratio: overextendedRatio,
  };

  let state;
  if (currentBackInside) {
    if (retested) state = 'FAILED_BREAKOUT';
    else if (barsSinceEvent <= p.falseBreakoutMaxBars) state = 'FALSE_BREAKOUT';
    else state = 'BREAKOUT_RECLAIMED';
  } else if (retested && retestBarIndex === i) {
    // the retest touch IS the current bar -- still unresolved either way
    state = 'RETEST_TESTING';
  } else if (overextended && !retested) {
    state = 'OVEREXTENDED_BREAKOUT';
  } else if (retested) {
    state = 'RETEST_HOLD';
  } else if (barsSinceEvent === 0) {
    state = 'BREAKOUT_FORMING';
  } else if (barsSinceEvent <= p.retestMaxBars) {
    state = 'BREAKOUT_RETEST_PENDING';
  } else {
    state = 'BREAKOUT_CONFIRMED';
  }

  return { state, evidence };
}
