/**
 * 15m BIAS layer for the intraday_5m engine profile.
 *
 * The 15m timeframe no longer decides trades. It produces:
 *   - direction: BULLISH / BEARISH / NEUTRAL (from the 15m regime)
 *   - the 15m regime, structure and correction phase (context)
 *   - the set of 5m entry models that are eligible under that bias
 *   - at most ONE veto: a fresh opposing 15m CHoCH (a confirmed structure
 *     flip against the proposed side within the last few 15m bars)
 *
 * It never produces geometry and never itself returns WAIT: TRANSITION,
 * RANGE, COMPRESSION and HIGH_VOLATILITY all map to NEUTRAL bias with a
 * restricted model set instead of a hard WAIT. CHOP_UNCERTAIN keeps an
 * EMPTY model set, so the 5m pipeline fails closed to WAIT/CHOP.
 *
 * Built ONLY from the reference engine's own pure primitives
 * (classifyRegime / computeStructure / computeCorrection) so the bias can
 * never diverge from what the reference engine would see on 15m.
 */
import { classifyRegime, REGIME_PARAMS } from '../regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../structure.js';
import { computeCorrection, CORRECTION_PARAMS } from '../correction.js';
import { MIN_BARS_REQUIRED } from '../pipeline.js';
import { INTRADAY_PARAMS } from './params.js';

export const BIAS_DIRECTIONS = Object.freeze(['BULLISH', 'BEARISH', 'NEUTRAL']);

function unavailable(status, evidence = {}) {
  return { status, direction: 'NEUTRAL', regime: null, structure: null, correction: { state: 'NONE' }, fresh_opposing_choch: null, eligible_models: [], evidence };
}

/** Which 5m entry models may run under a given 15m regime/direction. */
export function eligibleModelsFor({ regime, direction }) {
  if (!regime || regime === 'CHOP_UNCERTAIN') return [];
  if (direction === 'BULLISH' || direction === 'BEARISH') return ['MC', 'PB', 'BO', 'SR'];
  if (regime === 'RANGE') return ['BO', 'SR', 'MR'];
  if (regime === 'COMPRESSION' || regime === 'HIGH_VOLATILITY') return ['BO'];
  return ['BO', 'SR']; // TRANSITION: no directional bias, level-based models only (higher quality bar applies)
}

/**
 * confirmedBars: confirmed 15m bars, oldest first (forming bar already stripped).
 */
export function computeBias({ confirmedBars, params = INTRADAY_PARAMS }) {
  if (!Array.isArray(confirmedBars) || confirmedBars.length < MIN_BARS_REQUIRED) {
    return unavailable('INSUFFICIENT_DATA', { bars_available: confirmedBars?.length ?? 0, bars_required: MIN_BARS_REQUIRED });
  }
  const { regime, evidence: regimeEvidence } = classifyRegime(confirmedBars, REGIME_PARAMS);
  if (!regime) return unavailable('INSUFFICIENT_DATA', regimeEvidence);

  const structure = computeStructure(confirmedBars, STRUCTURE_PARAMS);
  const correction = structure.state ? computeCorrection(confirmedBars, structure.state, CORRECTION_PARAMS) : { state: 'NONE', reason: 'no structure direction', evidence: {} };

  const direction = regime === 'BULL_TREND' ? 'BULLISH' : regime === 'BEAR_TREND' ? 'BEARISH' : 'NEUTRAL';

  const i = confirmedBars.length - 1;
  const ev = structure.lastEvent;
  const fresh_opposing_choch = ev && ev.type === 'CHOCH' && i - ev.bar <= params.freshChochMaxAgeBars
    ? { direction: ev.direction, level: ev.level, bars_ago: i - ev.bar, bar_time: confirmedBars[ev.bar]?.time ?? null }
    : null;

  return {
    status: 'OK',
    direction,
    regime,
    structure,
    correction,
    fresh_opposing_choch,
    eligible_models: eligibleModelsFor({ regime, direction }),
    evidence: { atrRatio: regimeEvidence?.atrRatio ?? null, adx: regimeEvidence?.adx ?? null, structure_state: structure.state ?? null },
  };
}

/** A directional bias only permits trades on its own side; NEUTRAL permits both. */
export function sideAllowedByBias(bias, side) {
  if (!bias || bias.status !== 'OK') return false;
  if (bias.direction === 'BULLISH') return side === 'BUY';
  if (bias.direction === 'BEARISH') return side === 'SELL';
  return side === 'BUY' || side === 'SELL';
}

/** True when a fresh 15m CHoCH points against `side`. The single 15m veto. */
export function vetoedByFreshChoch(bias, side) {
  const c = bias?.fresh_opposing_choch;
  if (!c) return false;
  return (side === 'BUY' && c.direction === 'BEARISH') || (side === 'SELL' && c.direction === 'BULLISH');
}

/** True when `side` agrees with a directional bias (NEUTRAL is never "aligned"). */
export function alignedWithBias(bias, side) {
  return (bias?.direction === 'BULLISH' && side === 'BUY') || (bias?.direction === 'BEARISH' && side === 'SELL');
}
