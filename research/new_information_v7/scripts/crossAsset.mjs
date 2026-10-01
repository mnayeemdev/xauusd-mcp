/**
 * NEW INFORMATION V7 -- pure cross-asset ingestion helpers (RESEARCH ONLY; no src/ import).
 * Timestamp rule: a bar with open time T and timeframe tf is COMPLETE at T + tf and may be used at a decision time tClose only if T + tf <= tClose.
 * All series are Exness MT5 bars on the same broker clock, indexed by open time (seconds UTC).
 */
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
export const PARITY_TOL = Object.freeze({ close: 1e-6, ret: 1e-4, z: 0.05 });

/** Simple 14-bar ATR per bar (null for the first 14). */
export function atr14Series(bars) { const out = new Array(bars.length).fill(null); let sum = 0; const tr = []; for (let k = 1; k < bars.length; k++) { const t = Math.max(bars[k].high - bars[k].low, Math.abs(bars[k].high - bars[k - 1].close), Math.abs(bars[k].low - bars[k - 1].close)); tr.push(t); sum += t; if (tr.length > 14) sum -= tr[tr.length - 15]; if (tr.length >= 14) out[k] = sum / 14; } return out; }

/** Sorted open-time array for binary search + a map open-time -> index. */
export function alignIndex(bars, tf) { const times = bars.map((b) => b.time); const byTime = new Map(times.map((t, i) => [t, i])); return { times, byTime, tf }; }

/** Index of the LAST bar complete at tClose (open + tf <= tClose), or -1. Rejects bars whose completion is more than 2 x tf before tClose (stale) when `maxStaleSec` is given. */
export function lastCompleteIndex(align, tClose, maxStaleSec = null) { const { times, tf } = align; let lo = 0, hi = times.length - 1, ans = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] + tf <= tClose) { ans = mid; lo = mid + 1; } else hi = mid - 1; } if (ans < 0) return -1; if (maxStaleSec != null && tClose - (times[ans] + tf) > maxStaleSec) return -1; return ans; }

/** Relative tick volume: bar volume / mean of the previous 48 bars. */
export function relVolume(bars, i) { if (i < 48) return null; let s = 0; for (let q = 1; q <= 48; q++) s += bars[i - q].volume; return s ? bars[i].volume / (s / 48) : null; }

/**
 * Cross-asset features at a gold decision time. Everything uses bars complete at tClose only.
 *  silver_mom6 (XAG 5m, same-time bar), silver_act, dxy_mom6 (5m, else 15m fallback), dxy_range_mult (shock), ustec_mom2 (15m).
 */
export function crossFeatures({ tClose, series, align, atr }) {
  const out = { silver_mom6: null, silver_act: null, xag5_bar_close: null, dxy_mom6: null, dxy_source: null, dxy_range_mult: null, dxy_bar_close: null, ustec_mom2: null, ustec_bar_close: null };
  const iX = lastCompleteIndex(align.XAG5, tClose, 600); if (iX >= 20 && atr.XAG5[iX]) { const S = series.XAG5; out.silver_mom6 = r3((S[iX].close - S[iX - 6].close) / atr.XAG5[iX]); out.silver_act = r3(relVolume(S, iX)); out.xag5_bar_close = S[iX].time + 300; }
  const iD = lastCompleteIndex(align.DXY5, tClose, 600); if (iD >= 20 && atr.DXY5[iD]) { const S = series.DXY5; out.dxy_mom6 = r3((S[iD].close - S[iD - 6].close) / atr.DXY5[iD]); out.dxy_source = '5m'; let mult = 0; for (let q = 0; q < 3; q++) mult = Math.max(mult, (S[iD - q].high - S[iD - q].low) / atr.DXY5[iD]); out.dxy_range_mult = r3(mult); out.dxy_bar_close = S[iD].time + 300; }
  else { const iD15 = lastCompleteIndex(align.DXY15, tClose, 1800); if (iD15 >= 20 && atr.DXY15[iD15]) { const S = series.DXY15; out.dxy_mom6 = r3((S[iD15].close - S[iD15 - 2].close) / atr.DXY15[iD15]); out.dxy_source = '15m'; out.dxy_range_mult = r3((S[iD15].high - S[iD15].low) / atr.DXY15[iD15]); out.dxy_bar_close = S[iD15].time + 900; } }
  const iU = lastCompleteIndex(align.UST15, tClose, 1800); if (iU >= 20 && atr.UST15[iU]) { const S = series.UST15; out.ustec_mom2 = r3((S[iU].close - S[iU - 2].close) / atr.UST15[iU]); out.ustec_bar_close = S[iU].time + 900; }
  return out;
}

/** Deterministic data-quality report for a bar series inside [from, to]. */
export function dataQuality(bars, tf, from, to) { let dup = 0, nonmono = 0, badgeo = 0, zero = 0, gaps = 0, outliers = 0; const seen = new Set(); let prev = null; const rets = []; const inRange = []; for (const b of bars) { if (seen.has(b.time)) dup++; seen.add(b.time); if (prev && b.time <= prev.time) nonmono++; if (!(b.high >= b.low && b.high >= b.open && b.high >= b.close && b.low <= b.open && b.low <= b.close)) badgeo++; if (b.high === b.low) zero++; if (prev && b.time - prev.time > tf && b.time - prev.time < 3 * 3600) gaps++; if (prev && prev.close > 0) rets.push(Math.abs(Math.log(b.close / prev.close))); if (b.time >= from && b.time <= to) inRange.push(b); prev = b; } const sorted = [...rets].sort((a, b) => a - b); const p999 = sorted[Math.floor(0.999 * sorted.length)] ?? 0; outliers = rets.filter((r) => r > 10 * p999).length; return { bars: bars.length, in_range: inRange.length, first: bars[0]?.time ?? null, last: bars[bars.length - 1]?.time ?? null, duplicates: dup, non_monotonic: nonmono, bad_geometry: badgeo, zero_range: zero, intraday_gaps: gaps, return_outliers_gt_10x_p999: outliers, spread_pts_median: inRange.length ? [...inRange.map((b) => b.spread_pts)].sort((a, b) => a - b)[Math.floor(inRange.length / 2)] : null, pass: dup === 0 && nonmono === 0 && badgeo === 0 && outliers === 0 }; }
