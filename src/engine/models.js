/**
 * Setup-model eligibility + trigger evaluation.
 *
 * Model priority (checked in this order, first eligible+triggered wins,
 * exactly one candidate per bar -- mirrors the "no simultaneous
 * multi-model signal on one bar" duplicate-prevention principle):
 *   BO (Breakout+Retest) > TC (Trend Continuation) > PB (Pullback) >
 *   MR (Mean Reversion) > SR (Structure Rejection)
 *
 * Regime eligibility is enforced explicitly per model -- e.g. MR is
 * hard-blocked outside RANGE, matching the explicit safety requirement
 * that mean reversion must never fire freely inside a strong trend.
 */

export const MODEL_PARAMS = {
  boRetestAtrTol: 0.3,
  boMaxEntryLateBars: 10,
  tcMaxEntryLateBars: 5,
  pbMaxEntryLateBars: 5,
  freshEventLookbackBars: 3,
};

function isFreshEvent(barIndexOfEvent, currentIndex, lookback) {
  return barIndexOfEvent !== undefined && currentIndex - barIndexOfEvent <= lookback && currentIndex - barIndexOfEvent >= 0;
}

/**
 * Evaluates all models against the LAST confirmed bar and returns either
 * null (no eligible/triggered setup) or a candidate:
 * { model, side: 'BUY'|'SELL', anchor, originBar, reason }
 */
export function evaluateModels({ bars, regime, structure, correction, atrVal }, params = MODEL_PARAMS) {
  const p = params;
  const i = bars.length - 1;
  if (!regime || !structure?.state) return null;

  // --- BO: Breakout + Retest + Reclaim ---
  if (regime !== 'CHOP_UNCERTAIN' && regime !== 'TRANSITION' && structure.lastEvent) {
    const breakoutBar = structure.lastEvent.bar;
    const level = structure.lastEvent.level;
    const direction = structure.lastEvent.direction;
    if (breakoutBar < i && i - breakoutBar <= p.boMaxEntryLateBars) {
      // retest: some bar after breakout traded back within tolerance of the level
      const tol = atrVal * p.boRetestAtrTol;
      let retested = false;
      for (let j = breakoutBar + 1; j <= i; j++) {
        if (Math.abs(bars[j].close - level) <= tol || (direction === 'BULLISH' ? bars[j].low <= level + tol : bars[j].high >= level - tol)) { retested = true; break; }
      }
      const reclaimed = direction === 'BULLISH' ? bars[i].close > level : bars[i].close < level;
      if (retested && reclaimed) {
        return { model: 'BO', side: direction === 'BULLISH' ? 'BUY' : 'SELL', anchor: level, originBar: breakoutBar, reason: 'breakout, retest, and reclaim confirmed' };
      }
    }
  }

  // --- TC: Trend Continuation ---
  if ((regime === 'BULL_TREND' || regime === 'BEAR_TREND') && correction.state === 'NONE' && structure.lastEvent?.type === 'BOS') {
    const wantDirection = regime === 'BULL_TREND' ? 'BULLISH' : 'BEARISH';
    if (structure.lastEvent.direction === wantDirection && isFreshEvent(structure.lastEvent.bar, i, p.tcMaxEntryLateBars)) {
      return { model: 'TC', side: wantDirection === 'BULLISH' ? 'BUY' : 'SELL', anchor: structure.lastEvent.level, originBar: structure.lastEvent.bar, reason: 'fresh continuation BOS in an established trend with no active correction' };
    }
  }

  // --- PB: Pullback resolution in a trend ---
  if ((regime === 'BULL_TREND' || regime === 'BEAR_TREND') && correction.state === 'RESOLVED') {
    const side = regime === 'BULL_TREND' ? 'BUY' : 'SELL';
    return { model: 'PB', side, anchor: correction.evidence?.emaFast ?? bars[i].close, originBar: i, reason: 'trend pullback just resolved (momentum resumed)' };
  }

  // --- MR: Mean Reversion -- RANGE regime only, hard-blocked elsewhere ---
  if (regime === 'RANGE' && structure.lastSweep && isFreshEvent(structure.lastSweep.bar, i, p.freshEventLookbackBars)) {
    const side = structure.lastSweep.type === 'SWEEP_HIGH' ? 'SELL' : 'BUY';
    return { model: 'MR', side, anchor: structure.lastSweep.level, originBar: structure.lastSweep.bar, reason: 'liquidity sweep + rejection at a range boundary' };
  }

  // --- SR: Structure Rejection at a swing level (no fresh BOS required) ---
  if (['BULL_TREND', 'BEAR_TREND', 'RANGE'].includes(regime)) {
    const relevantSwing = structure.state === 'BULLISH' ? structure.lastSwingLow : structure.lastSwingHigh;
    if (relevantSwing && isFreshEvent(relevantSwing.index, i, p.freshEventLookbackBars + MODEL_PARAMS.freshEventLookbackBars)) {
      const side = structure.state === 'BULLISH' ? 'BUY' : 'SELL';
      return { model: 'SR', side, anchor: relevantSwing.price, originBar: relevantSwing.index, reason: `rejection off a recent ${relevantSwing.label} in line with existing structure` };
    }
  }

  return null;
}
