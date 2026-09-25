/**
 * Entry / SL / TP / RR for the intraday_5m engine profile, with
 * objective-aware TP2 selection.
 *
 * Differences from the reference src/engine/risk.js (which is untouched):
 *   - VOLATILITY_INSUFFICIENT gate: refuses to trade when the 5m ATR is
 *     too small for the intraday target horizon.
 *   - SL uses the candidate's own `slAnchor` (pullback extreme, momentum
 *     leg base, rejection wick, sweep extreme) when present, and never
 *     sits closer than minRiskAtr x ATR to the entry.
 *   - TP2 = the NEAREST genuine structural objective (5m/15m pivots, 15m
 *     range extreme) that lies at least objectiveMinR x risk beyond the
 *     entry. Closer "minor" objectives are skipped (and reported), the
 *     chosen one is capped at tp2RMultipleCap, and the default R-multiple
 *     applies only when no structural objective exists at all.
 *   - minRR (1.7) and the RR gate itself are kept verbatim.
 */
import { INTRADAY_PARAMS } from './params.js';

function round2(n) { return n === null || n === undefined ? null : Math.round(n * 100) / 100; }

function collectObjectives({ isLong, structure5, structure15, params }) {
  const out = [];
  const wantType = isLong ? 'high' : 'low';
  for (const piv of (structure5?.pivots ?? []).slice(-params.objectiveLookbackPivots5m)) {
    if (piv.type === wantType) out.push({ price: piv.price, source: '5m_pivot', label: piv.label ?? null });
  }
  for (const piv of (structure15?.pivots ?? []).slice(-params.objectiveLookbackPivots15m)) {
    if (piv.type === wantType) out.push({ price: piv.price, source: '15m_pivot', label: piv.label ?? null });
  }
  const rangeExtreme = isLong ? structure15?.rangeHigh : structure15?.rangeLow;
  if (rangeExtreme !== null && rangeExtreme !== undefined) out.push({ price: rangeExtreme, source: '15m_range', label: null });
  return out;
}

/**
 * candidate: from evaluateIntradayModels(). bars: confirmed 5m bars.
 * structure5 / structure15: computeStructure() results for 5m and 15m.
 */
export function computeIntradayRisk({ candidate, bars, atrVal, structure5 = null, structure15 = null }, params = INTRADAY_PARAMS) {
  const p = params;
  const i = bars.length - 1;
  const entry = bars[i].close;
  const isLong = candidate.side === 'BUY';

  if (!(atrVal > 0)) return { gate: 'INVALID_GEOMETRY', reason: 'ATR unavailable or non-positive' };
  if (atrVal < p.minAtrUsd) {
    return { gate: 'VOLATILITY_INSUFFICIENT', reason: `5m ATR ${atrVal.toFixed(2)} USD is below the ${p.minAtrUsd} USD minimum for the intraday target horizon` };
  }

  const distanceFromAnchor = Math.abs(entry - candidate.anchor);
  if (distanceFromAnchor / atrVal > p.overextendAtrMult) {
    return { gate: 'OVEREXTENDED', reason: `entry is ${(distanceFromAnchor / atrVal).toFixed(2)}x ATR from the setup anchor (max ${p.overextendAtrMult}x) -- refusing to chase` };
  }

  // Stop: candidate-specific anchor, else the reference structural rule.
  const slBase = candidate.slAnchor !== null && candidate.slAnchor !== undefined
    ? candidate.slAnchor
    : isLong
      ? Math.min(candidate.anchor, structure5?.lastSwingLow?.price ?? candidate.anchor)
      : Math.max(candidate.anchor, structure5?.lastSwingHigh?.price ?? candidate.anchor);
  let sl = isLong ? slBase - p.slAtrBuffer * atrVal : slBase + p.slAtrBuffer * atrVal;
  let slSource = candidate.slAnchor !== null && candidate.slAnchor !== undefined ? 'candidate_anchor' : 'structural';
  if (isLong ? sl >= entry : sl <= entry) {
    sl = isLong ? entry - p.slAtrFallback * atrVal : entry + p.slAtrFallback * atrVal;
    slSource = 'atr_fallback';
  }
  const minRisk = p.minRiskAtr * atrVal;
  if (Math.abs(entry - sl) < minRisk) {
    sl = isLong ? entry - minRisk : entry + minRisk;
    slSource = `${slSource}+min_risk`;
  }
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return { gate: 'INVALID_GEOMETRY', reason: 'computed risk distance is zero or negative' };

  const tp1 = isLong ? entry + p.tp1RMultiple * risk : entry - p.tp1RMultiple * risk;

  // TP2: objective-aware selection.
  let tp2;
  let objective;
  const skipped = [];
  const override = candidate.objectiveOverride;
  if (override !== null && override !== undefined && (isLong ? override > entry : override < entry)) {
    const r = Math.abs(override - entry) / risk;
    const cappedR = Math.min(r, p.tp2RMultipleCap);
    tp2 = isLong ? entry + cappedR * risk : entry - cappedR * risk;
    objective = { price: round2(override), source: 'model_override', r: +r.toFixed(2), capped: r > p.tp2RMultipleCap };
  } else {
    const all = collectObjectives({ isLong, structure5, structure15, params: p })
      .filter((o) => (isLong ? o.price > entry : o.price < entry))
      .map((o) => ({ ...o, r: Math.abs(o.price - entry) / risk }))
      .sort((a, b) => a.r - b.r);
    const eligible = all.filter((o) => o.r >= p.objectiveMinR);
    for (const o of all) if (o.r < p.objectiveMinR) skipped.push({ price: round2(o.price), source: o.source, r: +o.r.toFixed(2) });
    if (eligible.length) {
      const chosen = eligible[0];
      const cappedR = Math.min(chosen.r, p.tp2RMultipleCap);
      tp2 = isLong ? entry + cappedR * risk : entry - cappedR * risk;
      objective = { price: round2(chosen.price), source: chosen.source, label: chosen.label, r: +chosen.r.toFixed(2), capped: chosen.r > p.tp2RMultipleCap };
    } else {
      tp2 = isLong ? entry + p.tp2RMultipleDefault * risk : entry - p.tp2RMultipleDefault * risk;
      objective = { price: round2(tp2), source: 'default_r_multiple', r: p.tp2RMultipleDefault, capped: false };
    }
  }

  const rr = +(Math.abs(tp2 - entry) / risk).toFixed(2);
  const geometry = { entry: round2(entry), stop_loss: round2(sl), tp1: round2(tp1), tp2: round2(tp2), rr, objective, skipped_minor_objectives: skipped, sl_source: slSource, risk_atr: +(risk / atrVal).toFixed(2) };

  if (rr < p.minRR) {
    return { gate: 'RR_NOT_ACCEPTABLE', reason: `calculated RR ${rr} to the ${objective.source} objective is below the minimum ${p.minRR}`, ...geometry };
  }
  return { gate: 'OK', ...geometry };
}
