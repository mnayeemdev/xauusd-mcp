/**
 * Deterministic correction/pullback detection and resolution.
 *
 * correction_confirmation_bars = 3 is the locked research reference from
 * the P7 candidate (C4's corrResolveConfirmBars) -- reused here for
 * continuity, not re-derived or re-optimized in this implementation run.
 */
import { ema, atr } from './math.js';

export const CORRECTION_PARAMS = {
  swingLookback: 20,
  corrAtrMultiplier: 1.2,
  corrMomentumLookback: 3,
  corrResolveConfirmBars: 3, // locked C4 reference value
  emaFastLen: 20,
};

/**
 * `structureDirection`: 'BULLISH' | 'BEARISH' | null, from computeStructure().
 * Returns { state: 'NONE'|'ACTIVE'|'RESOLVED', reason, evidence }.
 */
export function computeCorrection(bars, structureDirection, params = CORRECTION_PARAMS) {
  const p = params;
  if (!structureDirection || bars.length < p.swingLookback + p.emaFastLen) {
    return { state: 'NONE', reason: 'no established trend direction to correct against', evidence: {} };
  }
  const closes = bars.map((b) => b.close);
  const emaFast = ema(closes, p.emaFastLen);
  const atrVal = atr(bars, 14);
  const i = bars.length - 1;
  if (atrVal[i] === null || emaFast[i] === null) return { state: 'NONE', reason: 'insufficient data', evidence: {} };

  const window = bars.slice(Math.max(0, i - p.swingLookback + 1), i + 1);
  const extreme = structureDirection === 'BULLISH' ? Math.max(...window.map((b) => b.high)) : Math.min(...window.map((b) => b.low));
  const pullback = structureDirection === 'BULLISH' ? extreme - bars[i].close : bars[i].close - extreme;
  const pullbackAtr = pullback / atrVal[i];
  const evidence = { extreme, pullback, pullbackAtr, atr: atrVal[i], emaFast: emaFast[i], close: closes[i] };

  const isPulledBack = pullbackAtr >= p.corrAtrMultiplier;

  // Resolution: `corrResolveConfirmBars` consecutive confirmed bars where
  // price has closed back on the trend side of emaFast (momentum resumed).
  const momentumWindow = bars.slice(Math.max(0, i - p.corrResolveConfirmBars + 1), i + 1);
  const resumed = momentumWindow.length === p.corrResolveConfirmBars && momentumWindow.every((b, idx) => {
    const barIdx = i - p.corrResolveConfirmBars + 1 + idx;
    if (emaFast[barIdx] === null) return false;
    return structureDirection === 'BULLISH' ? b.close > emaFast[barIdx] : b.close < emaFast[barIdx];
  });

  if (isPulledBack && !resumed) return { state: 'ACTIVE', reason: `price pulled back ${pullbackAtr.toFixed(2)}x ATR against ${structureDirection} structure`, evidence };
  if (isPulledBack && resumed) return { state: 'RESOLVED', reason: `momentum resumed for ${p.corrResolveConfirmBars} confirmed bars after a pullback`, evidence };
  return { state: 'NONE', reason: 'no material pullback detected', evidence };
}
