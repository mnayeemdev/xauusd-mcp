/**
 * P6 validation-metrics library — pure, deterministic arithmetic over
 * ALREADY-OBSERVED signal records. This module computes measurements; it
 * never generates, infers, or repairs a trading signal or outcome. Every
 * function here operates on data that must already have been produced by
 * the frozen, unmodified P5 engine (or, in tests, synthetic fixtures that
 * exercise the arithmetic in isolation).
 *
 * Nothing in this file is a "must-pass" trading-performance assertion. A
 * bad historical result computed by these functions is not a bug; an
 * incorrect CALCULATION is.
 */

/** Chronological (time-ascending) split boundary. Never shuffles. */
export function chronologicalSplit(sortedAscending, isFraction = 0.7) {
  if (!Array.isArray(sortedAscending)) throw new TypeError('sortedAscending must be an array');
  for (let i = 1; i < sortedAscending.length; i++) {
    if (sortedAscending[i].time < sortedAscending[i - 1].time) {
      throw new Error('chronologicalSplit requires already time-ascending-sorted input — sorting/shuffling is not performed here');
    }
  }
  const boundaryIndex = Math.floor(sortedAscending.length * isFraction);
  return {
    boundaryIndex,
    boundaryTime: sortedAscending.length > 0 ? (sortedAscending[boundaryIndex]?.time ?? sortedAscending[sortedAscending.length - 1].time) : null,
    is: sortedAscending.slice(0, boundaryIndex),
    oos: sortedAscending.slice(boundaryIndex),
  };
}

/** Wilson score interval for a binomial proportion (pass out of closed). */
export function wilsonInterval(pass, closed, z = 1.96) {
  if (closed <= 0) return null;
  const p = pass / closed;
  const denom = 1 + (z * z) / closed;
  const center = (p + (z * z) / (2 * closed)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / closed + (z * z) / (4 * closed * closed))) / denom;
  return { low: +(100 * (center - margin)).toFixed(1), high: +(100 * (center + margin)).toFixed(1) };
}

/** PASS rate — OPEN is never in the denominator. */
export function passRate(pass, fail) {
  const closed = pass + fail;
  return closed > 0 ? +((pass / closed) * 100).toFixed(1) : null;
}

export function meanR(records) {
  const closed = records.filter((r) => r.status !== 'OPEN');
  if (closed.length === 0) return null;
  return +(closed.reduce((s, r) => s + r.r, 0) / closed.length).toFixed(4);
}

export function medianR(records) {
  const closed = records.filter((r) => r.status !== 'OPEN').map((r) => r.r).sort((a, b) => a - b);
  if (closed.length === 0) return null;
  const mid = Math.floor(closed.length / 2);
  return closed.length % 2 === 0 ? (closed[mid - 1] + closed[mid]) / 2 : closed[mid];
}

export function cumulativeR(records) {
  return +records.filter((r) => r.status !== 'OPEN').reduce((s, r) => s + r.r, 0).toFixed(4);
}

/** sum(positive R) / abs(sum(negative R)). Explicit zero-denominator handling. */
export function profitFactor(records) {
  const closed = records.filter((r) => r.status !== 'OPEN');
  const pos = closed.filter((r) => r.r > 0).reduce((s, r) => s + r.r, 0);
  const neg = Math.abs(closed.filter((r) => r.r < 0).reduce((s, r) => s + r.r, 0));
  if (neg === 0) return pos > 0 ? Infinity : null; // no losses: undefined ratio if also no wins, else "infinite" (explicitly labeled, never silently 0 or NaN)
  return +(pos / neg).toFixed(4);
}

/** Chronological cumulative-R drawdown over CLOSED records only, in time order. */
export function drawdown(recordsChronological) {
  const closed = recordsChronological.filter((r) => r.status !== 'OPEN');
  let cum = 0, peak = 0, peakIndex = -1, maxDD = 0, ddStartIndex = -1, troughIndex = -1;
  const equity = [];
  for (let i = 0; i < closed.length; i++) {
    cum += closed[i].r;
    equity.push(cum);
    if (cum >= peak) { peak = cum; peakIndex = i; }
    const dd = peak - cum;
    if (dd > maxDD) { maxDD = dd; ddStartIndex = peakIndex; troughIndex = i; }
  }
  let recoveryIndex = null;
  if (troughIndex >= 0) {
    const peakValue = equity[ddStartIndex] ?? 0;
    for (let i = troughIndex + 1; i < equity.length; i++) {
      if (equity[i] >= peakValue) { recoveryIndex = i; break; }
    }
  }
  return {
    maxDrawdownR: +maxDD.toFixed(4),
    drawdownStartIndex: ddStartIndex,
    troughIndex,
    recoveryIndex,
    durationClosedSignals: troughIndex >= 0 && ddStartIndex >= 0 ? troughIndex - ddStartIndex : 0,
    equityCurve: equity,
  };
}

export function streaks(recordsChronological) {
  const closed = recordsChronological.filter((r) => r.status !== 'OPEN');
  let curType = null, curLen = 0, maxPass = 0, maxFail = 0;
  for (const r of closed) {
    if (r.status === curType) curLen += 1; else { curType = r.status; curLen = 1; }
    if (r.status === 'PASS') maxPass = Math.max(maxPass, curLen);
    else if (r.status === 'FAIL') maxFail = Math.max(maxFail, curLen);
  }
  return { currentType: curType, currentLength: curLen, maxPassStreak: maxPass, maxFailStreak: maxFail };
}

export function percentiles(records) {
  const rs = records.filter((r) => r.status !== 'OPEN').map((r) => r.r).sort((a, b) => a - b);
  if (rs.length === 0) return null;
  const at = (p) => rs[Math.min(rs.length - 1, Math.floor(p * (rs.length - 1)))];
  return { min: rs[0], p25: at(0.25), median: at(0.5), p75: at(0.75), max: rs[rs.length - 1] };
}

/** Groups records by a key function; each group carries total/pass/fail/open/cumR. */
export function groupBy(records, keyFn) {
  const groups = {};
  for (const r of records) {
    const key = keyFn(r);
    if (!groups[key]) groups[key] = { key, total: 0, pass: 0, fail: 0, open: 0, cumR: 0 };
    const g = groups[key];
    g.total += 1;
    if (r.status === 'PASS') { g.pass += 1; g.cumR += r.r; }
    else if (r.status === 'FAIL') { g.fail += 1; g.cumR += r.r; }
    else g.open += 1;
  }
  for (const g of Object.values(groups)) g.cumR = +g.cumR.toFixed(4);
  return groups;
}

export function sampleSizeLabel(n) {
  if (n < 20) return 'VERY LIMITED SAMPLE';
  if (n < 50) return 'LIMITED SAMPLE';
  if (n < 100) return 'MODERATE SAMPLE';
  return 'LARGER SAMPLE';
}

/** Deterministic-seed pseudo-random generator (mulberry32) for reproducible bootstrap, if ever run on a sufficient sample. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMeanR(records, iterations, seed) {
  const closed = records.filter((r) => r.status !== 'OPEN').map((r) => r.r);
  if (closed.length === 0) return null;
  const rng = seededRng(seed);
  const means = [];
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    for (let i = 0; i < closed.length; i++) sum += closed[Math.floor(rng() * closed.length)];
    means.push(sum / closed.length);
  }
  means.sort((a, b) => a - b);
  return {
    iterations, seed, n: closed.length,
    meanOfMeans: +(means.reduce((s, m) => s + m, 0) / means.length).toFixed(4),
    ci95: [+means[Math.floor(0.025 * means.length)].toFixed(4), +means[Math.floor(0.975 * means.length)].toFixed(4)],
  };
}
