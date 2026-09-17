/**
 * Deterministic trade QUALITY score (0-100), NOT a win-probability or
 * confidence estimate. Component weights mirror the already-documented
 * P1-P3 quality-score allocation for continuity (qStructure 15,
 * qTrigger 15, qEntryLocation 15, qMomentum 10, qVolatility 10,
 * qMtf 15, qSession 10, qRr 10 = 100), reused as a structural template,
 * not re-derived from historical outcomes in this implementation run.
 *
 * qualityThreshold = 65 is the locked C4 reference value.
 */

export const QUALITY_PARAMS = { qualityThreshold: 65 };

export function classifySession(unixSeconds) {
  const hourUtc = new Date(unixSeconds * 1000).getUTCHours();
  if (hourUtc >= 8 && hourUtc < 13) return 'LONDON';
  if (hourUtc >= 13 && hourUtc < 21) return 'NEW_YORK';
  if (hourUtc >= 0 && hourUtc < 8) return 'ASIA';
  return 'OTHER';
}

/**
 * candidate: from evaluateModels(). structure/regime/atr/adx: context.
 * htfRegime: the higher-timeframe regime string (or null if unavailable).
 * rr: already-computed RR from computeRisk().
 */
export function scoreQuality({ candidate, structure, regime, adxVal, adxThreshold, atrRatio, htfRegime, session, rr, minRR }) {
  const isLong = candidate.side === 'BUY';

  const relevantSwing = structure.state === 'BULLISH' ? structure.lastSwingHigh : structure.lastSwingLow;
  const qStructure = relevantSwing ? (relevantSwing.label === 'HH' || relevantSwing.label === 'LL' ? 15 : relevantSwing.label?.length === 2 ? 10 : 5) : 5;

  const qTrigger = candidate.model === 'BO' || (structure.lastEvent?.type === 'BOS') ? 15
    : structure.lastEvent?.type === 'CHOCH' ? 12
    : ['MR', 'SR'].includes(candidate.model) ? 10 : 0;

  const qEntryLocation = candidate.overextensionRatio !== undefined
    ? Math.max(0, 15 - 15 * (candidate.overextensionRatio / 1))
    : 10;

  const qMomentum = adxThreshold > 0 ? Math.min(10, 10 * (adxVal / adxThreshold)) : 0;

  const qVolatility = atrRatio >= 0.7 && atrRatio <= 1.3 ? 10 : Math.max(0, 10 - 10 * Math.abs(atrRatio - 1.0));

  let qMtf = 7.5;
  if (htfRegime) {
    const htfBull = htfRegime === 'BULL_TREND';
    const htfBear = htfRegime === 'BEAR_TREND';
    if ((isLong && htfBull) || (!isLong && htfBear)) qMtf = 15;
    else if ((isLong && htfBear) || (!isLong && htfBull)) qMtf = 0;
    else qMtf = 7.5;
  }

  const qSession = session === 'LONDON' || session === 'NEW_YORK' ? 10 : session === 'ASIA' ? 6 : 2;

  const qRr = minRR > 0 ? Math.min(10, Math.max(0, (10 * (rr - minRR)) / minRR)) : 0;

  const raw = qStructure + qTrigger + qEntryLocation + qMomentum + qVolatility + qMtf + qSession + qRr;
  const score = Math.min(100, Math.max(0, Math.round(raw)));

  return {
    score,
    breakdown: { qStructure, qTrigger, qEntryLocation: Math.round(qEntryLocation), qMomentum: Math.round(qMomentum), qVolatility: Math.round(qVolatility), qMtf, qSession, qRr: Math.round(qRr) },
  };
}
