/**
 * Deterministic volatility context from confirmed OHLCV bars.
 *
 * Reuses `atr`/`trueRange` from ./math.js -- no reimplementation of the
 * underlying ATR math. This module only classifies/contextualizes an
 * already-computed ATR series (percentile rank, rolling-average ratio,
 * contraction/expansion/high/low state) for use as EVIDENCE by other
 * layers (breakout, quality, geometry-sanity checks) -- it never itself
 * produces a trading decision and never retunes the protected risk/regime
 * parameters that already use ATR (src/engine/regime.js, src/engine/risk.js).
 *
 * No lookahead: computeVolatilityContext(bars) only ever uses `bars` up to
 * its own last element; a caller that wants the state "as of" some
 * historical index i must pass `bars.slice(0, i + 1)`.
 */
import { atr } from './math.js';

export const VOLATILITY_PARAMS = {
  atrLen: 14,
  percentileLookback: 100,
  expansionRatio: 1.3,
  contractionRatio: 0.7,
  highVolPercentile: 85,
  lowVolPercentile: 15,
};

const UNKNOWN_RESULT = Object.freeze({
  atrValue: null,
  atrPct: null,
  atrPercentile: null,
  rollingAtrPctAvg: null,
  ratio: null,
  state: 'UNKNOWN',
});

/**
 * Percentile rank (0-100) of the last value of `series` within the
 * trailing `lookback` window of `series` (inclusive of the current value).
 * Returns null if fewer than `lookback` non-null values are available.
 */
function trailingPercentileRank(series, lookback) {
  const n = series.length;
  if (n < lookback) return null;
  const window = series.slice(n - lookback, n);
  if (window.some((v) => v === null || v === undefined || !Number.isFinite(v))) return null;
  const current = window[window.length - 1];
  const lowerOrEqualCount = window.filter((v) => v <= current).length;
  return (lowerOrEqualCount / window.length) * 100;
}

export function computeVolatilityContext(bars, params = VOLATILITY_PARAMS) {
  const p = params;
  if (!Array.isArray(bars) || bars.length < p.atrLen + 1) {
    return { ...UNKNOWN_RESULT };
  }

  const atrSeries = atr(bars, p.atrLen);
  const atrPctSeries = bars.map((b, i) => (atrSeries[i] !== null && b.close ? (atrSeries[i] / b.close) * 100 : null));

  const i = bars.length - 1;
  const atrValue = atrSeries[i];
  const atrPct = atrPctSeries[i];

  if (atrValue === null || atrPct === null) return { ...UNKNOWN_RESULT };

  const atrPercentile = trailingPercentileRank(atrPctSeries, p.percentileLookback);

  // Simple rolling average of atrPct over percentileLookback bars, ignoring nulls.
  const windowStart = Math.max(0, i - p.percentileLookback + 1);
  const window = atrPctSeries.slice(windowStart, i + 1).filter((v) => v !== null && v !== undefined);
  const rollingAtrPctAvg = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : null;

  const ratio = rollingAtrPctAvg && rollingAtrPctAvg !== 0 ? atrPct / rollingAtrPctAvg : null;

  let state;
  if (ratio === null) state = 'UNKNOWN';
  else if (atrPercentile !== null && atrPercentile >= p.highVolPercentile) state = 'HIGH';
  else if (atrPercentile !== null && atrPercentile <= p.lowVolPercentile) state = 'LOW';
  else if (ratio >= p.expansionRatio) state = 'EXPANSION';
  else if (ratio <= p.contractionRatio) state = 'CONTRACTION';
  else state = 'NORMAL';

  return { atrValue, atrPct, atrPercentile, rollingAtrPctAvg, ratio, state };
}

/** Distance between two prices expressed in units of ATR. Null-safe. */
export function distanceInAtr(priceA, priceB, atrValue) {
  if (!Number.isFinite(priceA) || !Number.isFinite(priceB) || !Number.isFinite(atrValue) || atrValue === 0) return null;
  return Math.abs(priceA - priceB) / atrValue;
}
