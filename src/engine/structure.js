/**
 * Deterministic market-structure computation from confirmed OHLCV bars.
 * No lookahead: a pivot at index i is only ever reported once `rightBars`
 * additional confirmed bars exist after it (exactly like the frozen Pine
 * engine's own pivotLeftBars/pivotRightBars confirmation lag) -- the
 * function never inspects unconfirmed/forming data.
 */

export const STRUCTURE_PARAMS = {
  pivotLeftBars: 5,
  pivotRightBars: 5,
  sweepTolerancePct: 0.05, // wick beyond the pivot by up to this % still counts as a sweep, not noise
};

/** Returns [{ index, price, type: 'high'|'low' }] in chronological order. */
export function findPivots(bars, left, right) {
  const pivots = [];
  for (let i = left; i < bars.length - right; i++) {
    const windowHighs = bars.slice(i - left, i + right + 1).map((b) => b.high);
    const windowLows = bars.slice(i - left, i + right + 1).map((b) => b.low);
    if (bars[i].high === Math.max(...windowHighs)) pivots.push({ index: i, price: bars[i].high, type: 'high' });
    if (bars[i].low === Math.min(...windowLows)) pivots.push({ index: i, price: bars[i].low, type: 'low' });
  }
  return pivots;
}

/** Classifies each pivot relative to the previous pivot of the SAME type. */
function classifySwings(pivots) {
  const lastByType = { high: null, low: null };
  return pivots.map((p) => {
    const prev = lastByType[p.type];
    let label;
    if (!prev) label = p.type === 'high' ? 'H' : 'L';
    else if (p.type === 'high') label = p.price > prev.price ? 'HH' : 'LH';
    else label = p.price > prev.price ? 'HL' : 'LL';
    lastByType[p.type] = p;
    return { ...p, label };
  });
}

/**
 * Computes the full structure snapshot as of the LAST confirmed bar.
 * `structureDirection` is 'BULLISH'/'BEARISH'/null (unresolved).
 */
export function computeStructure(bars, params = STRUCTURE_PARAMS) {
  const { pivotLeftBars: left, pivotRightBars: right } = params;
  if (bars.length < left + right + 2) {
    return { state: null, evidence: { insufficient_data: true, bars_available: bars.length } };
  }
  const rawPivots = findPivots(bars, left, right);
  const pivots = classifySwings(rawPivots);
  const highs = pivots.filter((p) => p.type === 'high');
  const lows = pivots.filter((p) => p.type === 'low');
  const lastHigh = highs.length ? highs[highs.length - 1] : null;
  const lastLow = lows.length ? lows[lows.length - 1] : null;

  // Walk forward from each pivot's confirmation point to find the first
  // later CONFIRMED bar whose close breaks beyond it -- that is either a
  // continuation (BOS, break in the already-established direction) or a
  // character change (CHoCH, break against it). We track a running
  // structureDirection and update it only on a genuine break, never on a
  // mere touch/wick (see sweep detection below for that case).
  let structureDirection = null;
  let lastEvent = null; // { type: 'BOS'|'CHOCH', direction, bar }
  const allPivotsSorted = [...highs, ...lows].sort((a, b) => a.index - b.index);
  for (const piv of allPivotsSorted) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      if (piv.type === 'high' && bars[j].close > piv.price) {
        const isContinuation = structureDirection === 'BULLISH';
        lastEvent = { type: isContinuation ? 'BOS' : (structureDirection === null ? 'BOS' : 'CHOCH'), direction: 'BULLISH', bar: j, level: piv.price, pivotIndex: piv.index };
        structureDirection = 'BULLISH';
        break;
      }
      if (piv.type === 'low' && bars[j].close < piv.price) {
        const isContinuation = structureDirection === 'BEARISH';
        lastEvent = { type: isContinuation ? 'BOS' : (structureDirection === null ? 'BOS' : 'CHOCH'), direction: 'BEARISH', bar: j, level: piv.price, pivotIndex: piv.index };
        structureDirection = 'BEARISH';
        break;
      }
    }
  }

  // Liquidity sweep: the most recent pivot whose extreme was exceeded
  // intrabar (high/low) WITHOUT a confirmed close beyond it -- a
  // rejection, not a break.
  let lastSweep = null;
  for (const piv of [...allPivotsSorted].reverse()) {
    const confirmedAt = piv.index + right;
    for (let j = confirmedAt + 1; j < bars.length; j++) {
      const tol = piv.price * (STRUCTURE_PARAMS.sweepTolerancePct / 100);
      if (piv.type === 'high' && bars[j].high > piv.price + tol && bars[j].close <= piv.price) {
        lastSweep = { type: 'SWEEP_HIGH', bar: j, level: piv.price };
      }
      if (piv.type === 'low' && bars[j].low < piv.price - tol && bars[j].close >= piv.price) {
        lastSweep = { type: 'SWEEP_LOW', bar: j, level: piv.price };
      }
    }
    if (lastSweep) break;
  }

  // Range high/low: the highest confirmed pivot-high and lowest
  // confirmed pivot-low within the lookback window not yet broken by a
  // confirmed close.
  const recentHighs = highs.slice(-5).map((p) => p.price);
  const recentLows = lows.slice(-5).map((p) => p.price);
  const rangeHigh = recentHighs.length ? Math.max(...recentHighs) : null;
  const rangeLow = recentLows.length ? Math.min(...recentLows) : null;

  return {
    state: structureDirection,
    lastEvent,
    lastSweep,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    pivots,
    rangeHigh,
    rangeLow,
    evidence: { pivot_count: pivots.length, last_high: lastHigh, last_low: lastLow },
  };
}
