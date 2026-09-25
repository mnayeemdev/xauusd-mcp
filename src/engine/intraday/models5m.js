/**
 * 5m entry models for the intraday_5m engine profile.
 *
 * Priority (first eligible + triggered wins, exactly one candidate per
 * confirmed 5m bar):  MC > PB > BO > SR > MR
 *
 * Every model is gated by the 15m bias (src/engine/intraday/bias.js):
 * a model must be in `bias.eligible_models` AND its side must be allowed
 * by the bias direction. A model that does not trigger returns null --
 * there is no "closest" fallback and no forced candidate; a flat tape
 * yields null every bar.
 *
 * Candidate shape:
 *   { model, side, anchor, slAnchor, originBar, objectiveOverride?, reason }
 *   - anchor:     the setup level the overextension gate measures from
 *   - slAnchor:   the price the engine stop is placed beyond (buffer added
 *                 in risk5m.js); null -> structural fallback
 *   - originBar:  INDEX into `bars` of the bar that created the setup
 *                 (used for signal identity via that bar's time)
 */
import { computeCorrection, CORRECTION_PARAMS } from '../correction.js';
import { sideAllowedByBias } from './bias.js';
import { INTRADAY_PARAMS } from './params.js';

export const INTRADAY_MODELS = Object.freeze(['MC', 'PB', 'BO', 'SR', 'MR']);

function allowed(bias, model, side) {
  return Array.isArray(bias?.eligible_models) && bias.eligible_models.includes(model) && sideAllowedByBias(bias, side);
}

function beyond(side, price, level) {
  return side === 'BUY' ? price > level : price < level;
}

/** Number of consecutive bars (ending at i) whose close sits on the bias side of ema20. */
function trendSideRunLength(bars, ema20, side, i) {
  let run = 0;
  for (let k = i; k >= 0; k--) {
    if (ema20[k] === null || ema20[k] === undefined) break;
    const onSide = side === 'BUY' ? bars[k].close > ema20[k] : bars[k].close < ema20[k];
    if (!onSide) break;
    run++;
  }
  return run;
}

// ── MC: Momentum Continuation ──────────────────────────────────────────
export function evaluateMomentumContinuation({ bars, structure, atrRatio, ema20, bias, params = INTRADAY_PARAMS }) {
  const p = params;
  const i = bars.length - 1;
  if (!bias || bias.direction === 'NEUTRAL') return null;
  const side = bias.direction === 'BULLISH' ? 'BUY' : 'SELL';
  if (!allowed(bias, 'MC', side)) return null;
  if (!(atrRatio >= p.mcMinAtrRatio)) return null;
  if (i < p.mcConfirmBars + 1) return null;

  // N consecutive closes on the bias side of EMA20, each progressing.
  for (let k = 0; k < p.mcConfirmBars; k++) {
    const idx = i - k;
    if (ema20[idx] === null || ema20[idx] === undefined) return null;
    const c = bars[idx].close;
    if (side === 'BUY' ? c <= ema20[idx] : c >= ema20[idx]) return null;
    if (k < p.mcConfirmBars - 1) {
      const prev = bars[idx - 1].close;
      if (side === 'BUY' ? c <= prev : c >= prev) return null;
    }
  }

  // A confirmed close beyond the prior 5m swing, recently.
  const swing = side === 'BUY' ? structure?.lastSwingHigh : structure?.lastSwingLow;
  if (!swing) return null;
  if (!beyond(side, bars[i].close, swing.price)) return null;
  let breakoutBar = i;
  while (breakoutBar - 1 > swing.index && beyond(side, bars[breakoutBar - 1].close, swing.price)) breakoutBar--;
  if (i - breakoutBar > p.mcMaxEntryLateBars) return null;

  // SL anchor: the base of the momentum leg.
  const legStart = Math.max(0, breakoutBar - p.mcLegBaseLookback);
  const leg = bars.slice(legStart, i + 1);
  const slAnchor = side === 'BUY' ? Math.min(...leg.map((b) => b.low)) : Math.max(...leg.map((b) => b.high));

  return {
    model: 'MC', side, anchor: swing.price, slAnchor, originBar: breakoutBar,
    reason: `${p.mcConfirmBars} progressing 5m closes on the ${bias.direction} side of EMA20 with expanding ATR, confirmed break of the prior 5m swing ${i - breakoutBar} bar(s) ago`,
  };
}

// ── PB: Pullback Continuation (5m correction vs the 15m bias) ──────────
export function evaluatePullbackContinuation({ bars, ema20, bias, params = INTRADAY_PARAMS }) {
  const p = params;
  const i = bars.length - 1;
  if (!bias || bias.direction === 'NEUTRAL') return null;
  const side = bias.direction === 'BULLISH' ? 'BUY' : 'SELL';
  if (!allowed(bias, 'PB', side)) return null;

  const corr = computeCorrection(bars, bias.direction, {
    ...CORRECTION_PARAMS,
    swingLookback: p.pbSwingLookback,
    corrAtrMultiplier: p.pbCorrAtrMultiplier,
    corrResolveConfirmBars: p.pbResolveConfirmBars,
  });
  if (corr.state !== 'RESOLVED') return null;

  // Freshness: resolution happened when the trend-side run reached N bars.
  const run = trendSideRunLength(bars, ema20, side, i);
  const barsSinceResolved = run - p.pbResolveConfirmBars;
  if (barsSinceResolved < 0 || barsSinceResolved > p.pbMaxEntryLateBars) return null;

  // Pullback extreme: from the 20-bar extreme to now.
  const windowStart = Math.max(0, i - p.pbSwingLookback + 1);
  let extremeIdx = windowStart;
  for (let k = windowStart; k <= i; k++) {
    if (side === 'BUY' ? bars[k].high > bars[extremeIdx].high : bars[k].low < bars[extremeIdx].low) extremeIdx = k;
  }
  const pullbackLeg = bars.slice(extremeIdx, i + 1);
  const pullbackExtreme = side === 'BUY' ? Math.min(...pullbackLeg.map((b) => b.low)) : Math.max(...pullbackLeg.map((b) => b.high));

  return {
    model: 'PB', side, anchor: pullbackExtreme, slAnchor: pullbackExtreme, originBar: i - barsSinceResolved,
    reason: `5m pullback of ${corr.evidence?.pullbackAtr?.toFixed(2) ?? '?'}x ATR against the ${bias.direction} 15m bias resolved ${barsSinceResolved} bar(s) ago`,
    correction: corr,
  };
}

// ── BO: Breakout + Retest + Reclaim (reference rule, on 5m) ────────────
export function evaluateBreakoutRetest({ bars, regime, structure, atrVal, bias, params = INTRADAY_PARAMS }) {
  const p = params;
  const i = bars.length - 1;
  if (!structure?.lastEvent || regime === 'CHOP_UNCERTAIN') return null;
  const { bar: breakoutBar, level, direction } = structure.lastEvent;
  const side = direction === 'BULLISH' ? 'BUY' : 'SELL';
  if (!allowed(bias, 'BO', side)) return null;
  if (!(breakoutBar < i && i - breakoutBar <= p.boMaxEntryLateBars)) return null;
  const tol = atrVal * p.boRetestAtrTol;
  let retested = false;
  for (let j = breakoutBar + 1; j <= i; j++) {
    if (Math.abs(bars[j].close - level) <= tol || (direction === 'BULLISH' ? bars[j].low <= level + tol : bars[j].high >= level - tol)) { retested = true; break; }
  }
  const reclaimed = beyond(side, bars[i].close, level);
  if (!(retested && reclaimed)) return null;
  // Stop anchor: the RETEST EXTREME (highest high after the breakout for a
  // SELL, lowest low for a BUY) -- "invalid if price trades back through
  // the retest". Replay of 2026-09-25 showed that the structural fallback
  // (prior 5m swing) put the stop 3-6 ATR away on every BO SELL and turned
  // legitimate objectives into RR 1.0-1.4 rejections; the objective
  // selection itself was correct. risk5m.js still applies its buffer,
  // min-risk floor and wrong-side fallback on top of this anchor.
  const afterBreak = bars.slice(breakoutBar + 1, i + 1);
  const retestExtreme = side === 'BUY' ? Math.min(...afterBreak.map((b) => b.low)) : Math.max(...afterBreak.map((b) => b.high));
  return { model: 'BO', side, anchor: level, slAnchor: retestExtreme, originBar: breakoutBar, reason: '5m breakout, retest, and reclaim confirmed (stop beyond the retest extreme)' };
}

// ── SR: Structure / Rejection at a 15m or 5m swing level ───────────────
function rejectionAt({ bar, level, side, atrVal, p }) {
  const range = bar.high - bar.low;
  if (!(range > 0) || !(atrVal > 0)) return false;
  if (side === 'BUY') {
    const touched = bar.low <= level + p.srLevelTouchAtr * atrVal && bar.low >= level - p.srLevelPierceAtr * atrVal;
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    return touched && bar.close > level && lowerWick / range >= p.srMinWickRatio && bar.close >= bar.high - range * p.srCloseLocation;
  }
  const touched = bar.high >= level - p.srLevelTouchAtr * atrVal && bar.high <= level + p.srLevelPierceAtr * atrVal;
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  return touched && bar.close < level && upperWick / range >= p.srMinWickRatio && bar.close <= bar.low + range * p.srCloseLocation;
}

/** Deterministic reversal basis for a counter-5m-structure SR entry (see the call site). */
export function counterStructureConfirmed({ bias, structure, level, side, i, atrVal, p = INTRADAY_PARAMS }) {
  const biasSupports = (side === 'SELL' && bias?.direction === 'BEARISH') || (side === 'BUY' && bias?.direction === 'BULLISH');
  if (biasSupports) return true;
  const sweep = structure?.lastSweep;
  if (!sweep) return false;
  const rightType = (side === 'SELL' && sweep.type === 'SWEEP_HIGH') || (side === 'BUY' && sweep.type === 'SWEEP_LOW');
  const fresh = Number.isInteger(sweep.bar) && i - sweep.bar >= 0 && i - sweep.bar <= p.srSweepMaxAgeBars;
  const atLevel = Number.isFinite(sweep.level) && Math.abs(sweep.level - level) <= p.srLevelTouchAtr * (atrVal || 0);
  return rightType && fresh && atLevel;
}

export function evaluateStructureRejection({ bars, structure, atrVal, bias, params = INTRADAY_PARAMS }) {
  const p = params;
  const i = bars.length - 1;
  const bar = bars[i];
  const levels = [];
  const push = (swing, source, side) => { if (swing?.price !== undefined && swing?.price !== null) levels.push({ price: swing.price, source, side, label: swing.label ?? null }); };
  push(bias?.structure?.lastSwingLow, '15m_swing_low', 'BUY');
  push(bias?.structure?.lastSwingHigh, '15m_swing_high', 'SELL');
  push(structure?.lastSwingLow, '5m_swing_low', 'BUY');
  push(structure?.lastSwingHigh, '5m_swing_high', 'SELL');
  for (const lvl of levels) {
    if (!allowed(bias, 'SR', lvl.side)) continue;
    if (!rejectionAt({ bar, level: lvl.price, side: lvl.side, atrVal, p })) continue;
    // Audit 2026-09-25 (PART 6): an SR trade AGAINST the current 5m structure is
    // not allowed merely because the 15m bias is NEUTRAL. It needs a confirmed,
    // testable reversal basis: a directional 15m bias in its favour, or a fresh
    // confirmed 5m liquidity sweep at this level in its favour (structure.js's
    // own sweep definition). A supporting 5m BOS/CHoCH would already have
    // flipped 5m structure, so that case is not counter-structure at all.
    const opposesStructure = (lvl.side === 'SELL' && structure?.state === 'BULLISH') || (lvl.side === 'BUY' && structure?.state === 'BEARISH');
    if (opposesStructure && !counterStructureConfirmed({ bias, structure, level: lvl.price, side: lvl.side, i, atrVal, p })) continue;
    return {
      model: 'SR', side: lvl.side, anchor: lvl.price, slAnchor: lvl.side === 'BUY' ? bar.low : bar.high, originBar: i,
      reason: `rejection candle (wick >= ${Math.round(p.srMinWickRatio * 100)}% of range, close in the ${lvl.side === 'BUY' ? 'top' : 'bottom'} third) at the ${lvl.source.replace(/_/g, ' ')} ${lvl.price}`,
      level_source: lvl.source,
    };
  }
  return null;
}

// ── MR: Controlled Mean Reversion (15m RANGE only) ─────────────────────
export function evaluateMeanReversion({ bars, regime, structure, bias, m30Regime, params = INTRADAY_PARAMS }) {
  const p = params;
  const i = bars.length - 1;
  if (bias?.regime !== 'RANGE') return null;
  if (m30Regime === 'BULL_TREND' || m30Regime === 'BEAR_TREND') return null;
  if (regime === 'HIGH_VOLATILITY') return null;
  const sweep = structure?.lastSweep;
  if (!sweep || i - sweep.bar > p.mrSweepMaxAgeBars || i - sweep.bar < 0) return null;
  const side = sweep.type === 'SWEEP_HIGH' ? 'SELL' : 'BUY';
  if (!allowed(bias, 'MR', side)) return null;
  const rh = bias.structure?.rangeHigh ?? null;
  const rl = bias.structure?.rangeLow ?? null;
  const objectiveOverride = rh !== null && rl !== null ? (rh + rl) / 2 : null;
  const sweepBar = bars[sweep.bar];
  return {
    model: 'MR', side, anchor: sweep.level, slAnchor: side === 'BUY' ? sweepBar.low : sweepBar.high, originBar: sweep.bar, objectiveOverride,
    reason: `5m liquidity sweep + reclaim at a 15m range boundary ${i - sweep.bar} bar(s) ago; target = 15m range midpoint`,
  };
}

/**
 * Runs every model in priority order and returns the first candidate, or
 * null. `ema20`/`atrRatio` are the 5m EMA20 series and 5m ATR expansion
 * ratio the pipeline already computed.
 */
export function evaluateIntradayModels(ctx, params = INTRADAY_PARAMS) {
  const { bias } = ctx;
  if (!bias || bias.status !== 'OK' || !Array.isArray(bias.eligible_models) || bias.eligible_models.length === 0) return null;
  if (!ctx.bars || ctx.bars.length < 2 || !ctx.structure?.state) return null;
  return evaluateMomentumContinuation({ ...ctx, params })
    ?? evaluatePullbackContinuation({ ...ctx, params })
    ?? evaluateBreakoutRetest({ ...ctx, params })
    ?? evaluateStructureRejection({ ...ctx, params })
    ?? evaluateMeanReversion({ ...ctx, params })
    ?? null;
}
