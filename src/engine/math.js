/**
 * Pure numeric building blocks for the MCP XAUUSD calculation engine.
 * No I/O, no TradingView/Pine dependency, fully deterministic.
 * All functions operate on plain arrays of numbers (oldest first) unless
 * noted otherwise, and never look ahead — index i only ever uses data
 * at indices <= i.
 */

export function sma(values, len) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= len) sum -= values[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

export function ema(values, len) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (len + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      if (i >= len - 1) {
        const seed = values.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0) / len;
        out[i] = seed;
        prev = seed;
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's smoothing (RMA), used for ADX/DI/ATR to match standard TA convention. */
export function rma(values, len) {
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (prev === null) {
      if (i >= len - 1) {
        const seed = values.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0) / len;
        out[i] = seed;
        prev = seed;
      }
    } else {
      prev = (prev * (len - 1) + values[i]) / len;
      out[i] = prev;
    }
  }
  return out;
}

export function trueRange(bars) {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const prevClose = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
  });
}

export function atr(bars, len) {
  return rma(trueRange(bars), len);
}

/** Standard Wilder DI+/DI-/ADX. Returns { diPlus, diMinus, adx } arrays. */
export function adxDi(bars, diLen, adxSmoothing) {
  const n = bars.length;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const tr = trueRange(bars);
  const trRma = rma(tr, diLen);
  const plusDmRma = rma(plusDM, diLen);
  const minusDmRma = rma(minusDM, diLen);
  const diPlus = new Array(n).fill(null);
  const diMinus = new Array(n).fill(null);
  const dx = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (trRma[i] && trRma[i] > 0) {
      diPlus[i] = 100 * (plusDmRma[i] / trRma[i]);
      diMinus[i] = 100 * (minusDmRma[i] / trRma[i]);
      const sum = diPlus[i] + diMinus[i];
      dx[i] = sum > 0 ? (100 * Math.abs(diPlus[i] - diMinus[i])) / sum : 0;
    }
  }
  const adx = rma(dx.map((v) => v ?? 0), adxSmoothing);
  return { diPlus, diMinus, adx };
}

export function stdev(values, len) {
  const out = new Array(values.length).fill(null);
  for (let i = len - 1; i < values.length; i++) {
    const slice = values.slice(i - len + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / len;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / len;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

/** Bollinger Bands. Returns { basis, upper, lower, width } arrays (width = (upper-lower)/basis). */
export function bollingerBands(values, len, mult) {
  const basis = sma(values, len);
  const dev = stdev(values, len);
  const upper = values.map((_, i) => (basis[i] !== null && dev[i] !== null ? basis[i] + mult * dev[i] : null));
  const lower = values.map((_, i) => (basis[i] !== null && dev[i] !== null ? basis[i] - mult * dev[i] : null));
  const width = values.map((_, i) => (basis[i] !== null && basis[i] !== 0 && upper[i] !== null ? (upper[i] - lower[i]) / basis[i] : null));
  return { basis, upper, lower, width };
}

/** Simple rolling average of an already-computed series, ignoring nulls. */
export function rollingAverage(values, len) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - len + 1);
    const slice = values.slice(start, i + 1).filter((v) => v !== null && v !== undefined);
    if (slice.length >= Math.min(len, i + 1)) out[i] = slice.reduce((a, b) => a + b, 0) / slice.length;
  }
  return out;
}

export function last(arr) { return arr.length ? arr[arr.length - 1] : null; }
export function at(arr, i) { return i >= 0 && i < arr.length ? arr[i] : null; }
