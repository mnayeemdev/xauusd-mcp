/**
 * Deterministic regime classification from confirmed OHLCV bars.
 *
 * Reuses the SAME reference constants the frozen Pine engine used
 * (EMA 20/50, ADX(14)/DI(14), ATR(14) with a 100-bar rolling average,
 * Bollinger(20, x2) width with a 100-bar rolling average, DI-balance
 * threshold 6.0, ADX trend threshold 20, high-vol ATR-ratio 1.5,
 * compression BB-width-ratio 0.6) for continuity/defensibility, NOT as
 * a re-optimization. All thresholds are named constants, easy to review.
 *
 * bars: confirmed candles only (oldest first). The caller is
 * responsible for excluding the currently-forming bar.
 */
import { ema, adxDi, atr, rollingAverage, bollingerBands } from './math.js';

export const REGIME_PARAMS = {
  emaFastLen: 20,
  emaSlowLen: 50,
  emaSlopeLookback: 5,
  adxDiLen: 14,
  adxSmoothing: 14,
  adxTrendThreshold: 20.0,
  atrLen: 14,
  atrAvgLen: 100,
  highVolMultiplier: 1.5,
  bbLen: 20,
  bbMult: 2.0,
  bbWidthAvgLen: 100,
  compressionRatioMax: 0.6,
  diBalanceThreshold: 6.0,
  flipLookback: 10,
  flipCountThreshold: 4,
};

export const REGIMES = ['BULL_TREND', 'BEAR_TREND', 'RANGE', 'COMPRESSION', 'TRANSITION', 'HIGH_VOLATILITY', 'CHOP_UNCERTAIN'];

function directionFlips(emaFast, emaSlow, lookback) {
  let flips = 0;
  let prevSign = null;
  const start = Math.max(1, emaFast.length - lookback);
  for (let i = start; i < emaFast.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) continue;
    const sign = emaFast[i] >= emaSlow[i] ? 1 : -1;
    if (prevSign !== null && sign !== prevSign) flips++;
    prevSign = sign;
  }
  return flips;
}

/**
 * Returns { regime, evidence } for the LAST confirmed bar in `bars`.
 * `evidence` exposes every intermediate value so the decision is fully
 * auditable, never a black box.
 */
export function classifyRegime(bars, params = REGIME_PARAMS) {
  const p = params;
  if (bars.length < Math.max(p.emaSlowLen, p.atrAvgLen, p.bbWidthAvgLen) + 5) {
    return { regime: null, evidence: { insufficient_data: true, bars_available: bars.length } };
  }
  const closes = bars.map((b) => b.close);
  const emaFast = ema(closes, p.emaFastLen);
  const emaSlow = ema(closes, p.emaSlowLen);
  const { adx } = adxDi(bars, p.adxDiLen, p.adxSmoothing);
  const atrVal = atr(bars, p.atrLen);
  const atrPct = atrVal.map((v, i) => (v !== null && closes[i] ? (v / closes[i]) * 100 : null));
  const atrPctAvg = rollingAverage(atrPct, p.atrAvgLen);
  const { width } = bollingerBands(closes, p.bbLen, p.bbMult);
  const widthAvg = rollingAverage(width, p.bbWidthAvgLen);
  const diBal = adxDi(bars, p.adxDiLen, p.adxSmoothing);

  const i = bars.length - 1;
  const iSlope = i - p.emaSlopeLookback;
  const emaSlowRising = iSlope >= 0 && emaSlow[i] !== null && emaSlow[iSlope] !== null ? emaSlow[i] > emaSlow[iSlope] : null;
  const emaSlowFalling = iSlope >= 0 && emaSlow[i] !== null && emaSlow[iSlope] !== null ? emaSlow[i] < emaSlow[iSlope] : null;
  const atrRatio = atrPct[i] !== null && atrPctAvg[i] ? atrPct[i] / atrPctAvg[i] : null;
  const compressionRatio = width[i] !== null && widthAvg[i] ? width[i] / widthAvg[i] : null;
  const diBalance = diBal.diPlus[i] !== null && diBal.diMinus[i] !== null ? Math.abs(diBal.diPlus[i] - diBal.diMinus[i]) : null;
  const flips = directionFlips(emaFast, emaSlow, p.flipLookback);

  const evidence = {
    close: closes[i], emaFast: emaFast[i], emaSlow: emaSlow[i], adx: adx[i],
    atrPct: atrPct[i], atrRatio, bbWidth: width[i], compressionRatio, diPlus: diBal.diPlus[i], diMinus: diBal.diMinus[i],
    diBalance, emaSlowRising, emaSlowFalling, directionFlips: flips,
  };

  if ([emaFast[i], emaSlow[i], adx[i], atrRatio, compressionRatio, diBalance].some((v) => v === null || v === undefined)) {
    return { regime: null, evidence: { ...evidence, insufficient_data: true } };
  }

  // Priority order mirrors the frozen Pine engine's own precedence
  // (volatility/chop/compression checked before trend/range, so a
  // genuinely chaotic or compressed tape is never mislabeled as trending).
  let regime;
  if (flips >= p.flipCountThreshold) regime = 'CHOP_UNCERTAIN';
  else if (atrRatio >= p.highVolMultiplier) regime = 'HIGH_VOLATILITY';
  else if (compressionRatio <= p.compressionRatioMax) regime = 'COMPRESSION';
  else if (adx[i] >= p.adxTrendThreshold && emaFast[i] > emaSlow[i] && emaSlowRising) regime = 'BULL_TREND';
  else if (adx[i] >= p.adxTrendThreshold && emaFast[i] < emaSlow[i] && emaSlowFalling) regime = 'BEAR_TREND';
  else if (adx[i] < p.adxTrendThreshold && diBalance <= p.diBalanceThreshold) regime = 'RANGE';
  else regime = 'TRANSITION';

  return { regime, evidence };
}
