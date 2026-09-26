/**
 * Deterministic statistics for Stage 12 D/E/F. PURE, no I/O, no randomness other than seeded PRNGs.
 * Every function returns null (NOT_AVAILABLE) instead of inventing a number when the input cannot support it.
 */
export const r4 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(4));
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const stdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export const standardError = (a) => { const s = stdev(a); return s == null ? null : s / Math.sqrt(a.length); };
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const percentile = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1)))); return s[idx]; };

/** mulberry32: small, fast, fully deterministic for a given seed. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Seeded bootstrap CI of the mean. Returns { lower, upper, resamples, seed, level } or null below `minN`. */
export function bootstrapMeanCI(values, { seed, resamples, level = 0.95, minN = 5 } = {}) {
  if (!Array.isArray(values) || values.length < minN) return null;
  const rnd = seededRandom(seed); const n = values.length; const means = new Array(resamples);
  for (let k = 0; k < resamples; k++) { let s = 0; for (let i = 0; i < n; i++) s += values[Math.floor(rnd() * n)]; means[k] = s / n; }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor(((1 - level) / 2) * resamples)]; const hi = means[Math.min(resamples - 1, Math.floor((1 - (1 - level) / 2) * resamples))];
  return { lower: r4(lo), upper: r4(hi), resamples, seed, level, method: 'seeded bootstrap of the sample mean (percentile interval)' };
}

/** Profit factor = gross wins / |gross losses| with explicit edge cases (never Infinity, never a silent 0). */
export function profitFactor(values) {
  const wins = values.filter((v) => v > 0); const losses = values.filter((v) => v < 0);
  if (!values.length) return { value: null, status: 'NOT_AVAILABLE_NO_TRADES', gross_win: 0, gross_loss: 0 };
  const gw = sum(wins), gl = -sum(losses);
  if (!losses.length && !wins.length) return { value: null, status: 'NOT_AVAILABLE_ALL_BREAKEVEN', gross_win: 0, gross_loss: 0 };
  if (!losses.length) return { value: null, status: 'UNDEFINED_NO_LOSSES', gross_win: r4(gw), gross_loss: 0 };
  if (!wins.length) return { value: 0, status: 'ZERO_NO_WINS', gross_win: 0, gross_loss: r4(gl) };
  return { value: r4(gw / gl), status: 'OK', gross_win: r4(gw), gross_loss: r4(gl) };
}

/** Peak-to-trough drawdown on the cumulative sum, in the unit of `values`. */
export function maxDrawdown(values) {
  if (!values.length) return { max_drawdown: null, peak_index: null, trough_index: null };
  let peak = 0, eq = 0, dd = 0, peakI = -1, troughI = -1, curPeakI = -1;
  values.forEach((v, i) => { eq += v; if (eq > peak) { peak = eq; curPeakI = i; } const d = eq - peak; if (d < dd) { dd = d; peakI = curPeakI; troughI = i; } });
  return { max_drawdown: r4(dd), peak_index: peakI, trough_index: troughI, final_equity: r4(eq) };
}

export function streaks(values) {
  let maxW = 0, maxL = 0, w = 0, l = 0;
  for (const v of values) { if (v > 0) { w++; l = 0; } else if (v < 0) { l++; w = 0; } else { w = 0; l = 0; } maxW = Math.max(maxW, w); maxL = Math.max(maxL, l); }
  return { max_consecutive_wins: maxW, max_consecutive_losses: maxL };
}

/** Core distribution summary of R values (or USD). */
export function summarize(values) {
  const n = values.length; if (!n) return { n: 0, status: 'NOT_AVAILABLE_NO_TRADES' };
  const wins = values.filter((v) => v > 0), losses = values.filter((v) => v < 0), be = values.filter((v) => v === 0);
  const avgWin = wins.length ? mean(wins) : null, avgLoss = losses.length ? mean(losses) : null;
  return { n, wins: wins.length, losses: losses.length, breakeven: be.length, win_rate: r4(wins.length / n), gross_positive: r4(sum(wins)), gross_negative: r4(sum(losses)), net: r4(sum(values)), mean: r4(mean(values)), median: r4(median(values)), stdev: r4(stdev(values)), standard_error: r4(standardError(values)), average_win: r4(avgWin), average_loss: r4(avgLoss), payoff_ratio: avgWin != null && avgLoss != null && avgLoss !== 0 ? r4(avgWin / Math.abs(avgLoss)) : null, profit_factor: profitFactor(values), drawdown: maxDrawdown(values), ...streaks(values), worst: r4(Math.min(...values)), best: r4(Math.max(...values)) };
}

/** Removes the top-k winners (largest values) and re-summarises. */
export function withoutTopWinners(values, k) {
  if (values.length <= k) return { removed: values.length, n: 0, status: 'NOT_AVAILABLE_SAMPLE_TOO_SMALL' };
  const sorted = [...values].sort((a, b) => b - a); const rest = sorted.slice(k);
  const pf = profitFactor(rest);
  return { removed: k, n: rest.length, mean: r4(mean(rest)), net: r4(sum(rest)), profit_factor: pf.value, profit_factor_status: pf.status, removed_share_of_gross_positive: sum(values.filter((v) => v > 0)) > 0 ? r4(sum(sorted.slice(0, k).filter((v) => v > 0)) / sum(values.filter((v) => v > 0))) : null };
}

/**
 * Seeded Monte Carlo over the OBSERVED R (or USD) values: i.i.d. resampling of `pathLength` trades, `paths` times.
 * Assumptions are explicit in the result; it never claims the future is guaranteed.
 */
export function monteCarloDrawdown(values, { seed, paths, pathLength = null } = {}) {
  if (!values.length) return null;
  const rnd = seededRandom(seed); const L = pathLength ?? values.length; const dds = [], streaksL = [], finals = [];
  for (let p = 0; p < paths; p++) {
    let eq = 0, peak = 0, dd = 0, l = 0, maxL = 0;
    for (let i = 0; i < L; i++) { const v = values[Math.floor(rnd() * values.length)]; eq += v; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); if (v < 0) { l++; maxL = Math.max(maxL, l); } else l = 0; }
    dds.push(dd); streaksL.push(maxL); finals.push(eq);
  }
  return { paths, path_length: L, seed, assumptions: ['i.i.d. resampling of the observed values', 'no regime dependence', 'fixed lot 0.01', 'not a forecast'], drawdown_percentiles: { p50: r4(percentile(dds, 0.5)), p90: r4(percentile(dds, 0.1)), p95: r4(percentile(dds, 0.05)), p99: r4(percentile(dds, 0.01)) }, losing_streak_percentiles: { p50: percentile(streaksL, 0.5), p90: percentile(streaksL, 0.9), p99: percentile(streaksL, 0.99) }, final_equity_percentiles: { p05: r4(percentile(finals, 0.05)), p50: r4(percentile(finals, 0.5)), p95: r4(percentile(finals, 0.95)) }, probability_final_negative: r4(finals.filter((f) => f < 0).length / paths) };
}

/** Groups by a key function and summarises each group. */
export function breakdown(items, keyFn, valueFn) {
  const groups = new Map();
  for (const it of items) { const k = keyFn(it) ?? 'UNKNOWN'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(valueFn(it)); }
  const total = sum(items.map(valueFn));
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([key, vals]) => { const s = summarize(vals.filter(Number.isFinite)); return { key, n: vals.length, mean: s.mean ?? null, net: s.net ?? null, wins: s.wins ?? 0, losses: s.losses ?? 0, profit_factor: s.profit_factor?.value ?? null, max_drawdown: s.drawdown?.max_drawdown ?? null, share_of_total: total ? r4(sum(vals.filter(Number.isFinite)) / total) : null }; });
}
