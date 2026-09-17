/**
 * Entry/SL/TP/RR calculation and the overextension/late-entry gate.
 *
 * minRR = 1.7 is the locked P7 research candidate (C4) reference value,
 * kept explicitly configurable but NOT retuned in this implementation
 * run (see docs/XAUUSD_MCP_ENGINE.md).
 */

export const RISK_PARAMS = {
  overextendAtrMult: 2.5,
  slAtrBuffer: 0.25,
  slAtrFallback: 1.5,
  tp1RMultiple: 1.0,
  tp2RMultipleDefault: 2.0,
  tp2RMultipleCap: 3.0,
  minRR: 1.7, // locked C4 reference
};

function round2(n) { return n === null || n === undefined ? null : Math.round(n * 100) / 100; }

/**
 * candidate: { model, side, anchor, originBar } from evaluateModels().
 * bars: confirmed bars (last one is the signal/entry bar).
 * structure: computeStructure() result, used only to look for a genuine
 * structural TP2 objective -- never fabricated if none exists.
 */
export function computeRisk({ candidate, bars, atrVal, structure }, params = RISK_PARAMS) {
  const p = params;
  const i = bars.length - 1;
  const entry = bars[i].close;
  const isLong = candidate.side === 'BUY';

  const distanceFromAnchor = Math.abs(entry - candidate.anchor);
  if (atrVal > 0 && distanceFromAnchor / atrVal > p.overextendAtrMult) {
    return { gate: 'OVEREXTENDED', reason: `entry is ${(distanceFromAnchor / atrVal).toFixed(2)}x ATR from the setup anchor (max ${p.overextendAtrMult}x) -- refusing to chase` };
  }

  const structuralAnchor = isLong
    ? Math.min(candidate.anchor, structure?.lastSwingLow?.price ?? candidate.anchor)
    : Math.max(candidate.anchor, structure?.lastSwingHigh?.price ?? candidate.anchor);
  let sl = isLong ? structuralAnchor - p.slAtrBuffer * atrVal : structuralAnchor + p.slAtrBuffer * atrVal;
  if (isLong ? sl >= entry : sl <= entry) {
    // structural anchor was on the wrong side (too close/behind entry) -- fall back to a pure ATR stop.
    sl = isLong ? entry - p.slAtrFallback * atrVal : entry + p.slAtrFallback * atrVal;
  }

  const risk = Math.abs(entry - sl);
  if (risk <= 0) return { gate: 'INVALID_GEOMETRY', reason: 'computed risk distance is zero or negative' };

  const tp1 = isLong ? entry + p.tp1RMultiple * risk : entry - p.tp1RMultiple * risk;

  // TP2: prefer a genuine structural objective (opposite-side range/swing
  // extreme beyond entry) capped at tp2RMultipleCap*R; otherwise the
  // default R-multiple. Never invented beyond what structure/ATR supports.
  const structuralObjective = isLong ? (structure?.rangeHigh ?? null) : (structure?.rangeLow ?? null);
  let tp2;
  if (structuralObjective !== null && (isLong ? structuralObjective > entry : structuralObjective < entry)) {
    const objectiveR = Math.abs(structuralObjective - entry) / risk;
    const cappedR = Math.min(objectiveR, p.tp2RMultipleCap);
    tp2 = isLong ? entry + cappedR * risk : entry - cappedR * risk;
  } else {
    tp2 = isLong ? entry + p.tp2RMultipleDefault * risk : entry - p.tp2RMultipleDefault * risk;
  }

  const reward = Math.abs(tp2 - entry);
  const rr = +(reward / risk).toFixed(2);

  if (rr < p.minRR) {
    return { gate: 'RR_NOT_ACCEPTABLE', reason: `calculated RR ${rr} is below the minimum ${p.minRR}`, rr };
  }

  return {
    gate: 'OK',
    entry: round2(entry), stop_loss: round2(sl), tp1: round2(tp1), tp2: round2(tp2), rr,
  };
}
