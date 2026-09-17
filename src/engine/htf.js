/**
 * Higher-timeframe (HTF) context and single-layer conflict gate.
 *
 * Context timeframes (1H/2H/4H/8H/1D/1W/1M) are read-only context/filtering
 * layers for the entry pipeline (src/engine/pipeline.js, unchanged). They
 * reuse the SAME regime/structure/correction primitives the entry pipeline
 * already uses -- classifyRegime/computeStructure/computeCorrection, same
 * REGIME_PARAMS/STRUCTURE_PARAMS/CORRECTION_PARAMS, not retuned -- but never
 * run model eligibility, quality scoring, or risk computation, and never
 * themselves produce a BUY/SELL candidate. 1M/1W are macro context only and
 * are never read by detectHtfConflict.
 *
 * detectHtfConflict() is a single additional gate one rung above the
 * existing 30m -> 15m gate in src/engine/mtf.js: the EXACT SAME
 * regime-opposition rule, applied at the next HTF tier (1H). This is one
 * authoritative context layer, not majority voting and not "every
 * timeframe must align" -- an unavailable/unclear HTF context never blocks.
 */
import { classifyRegime, REGIME_PARAMS } from './regime.js';
import { computeStructure, STRUCTURE_PARAMS } from './structure.js';
import { computeCorrection, CORRECTION_PARAMS } from './correction.js';

const EMPTY_CONTEXT = Object.freeze({
  status: 'INSUFFICIENT_DATA',
  regime: null,
  structure_direction: null,
  correction_state: null,
  last_event: null,
  last_swing_high: null,
  last_swing_low: null,
  range_high: null,
  range_low: null,
});

/**
 * confirmedBars: confirmed OHLCV bars for one higher timeframe (oldest
 * first, caller has already stripped the forming bar).
 * includeCorrection: true for the intermediate tier (1H/2H) -- the
 * hierarchy spec calls out correction/pullback state there specifically;
 * false for the daily/higher-intraday and macro tiers, which report
 * regime/structure only.
 */
export function computeHtfContext(confirmedBars, { includeCorrection = false } = {}) {
  if (!Array.isArray(confirmedBars) || confirmedBars.length === 0) return { ...EMPTY_CONTEXT };

  const { regime } = classifyRegime(confirmedBars, REGIME_PARAMS);
  if (!regime) return { ...EMPTY_CONTEXT };

  const structure = computeStructure(confirmedBars, STRUCTURE_PARAMS);
  let correctionState = null;
  if (includeCorrection && structure.state) {
    correctionState = computeCorrection(confirmedBars, structure.state, CORRECTION_PARAMS).state;
  }

  return {
    status: 'OK',
    regime,
    structure_direction: structure.state,
    correction_state: correctionState,
    last_event: structure.lastEvent
      ? { type: structure.lastEvent.type, direction: structure.lastEvent.direction, level: structure.lastEvent.level }
      : null,
    last_swing_high: structure.lastSwingHigh ? { price: structure.lastSwingHigh.price, label: structure.lastSwingHigh.label } : null,
    last_swing_low: structure.lastSwingLow ? { price: structure.lastSwingLow.price, label: structure.lastSwingLow.label } : null,
    range_high: structure.rangeHigh ?? null,
    range_low: structure.rangeLow ?? null,
  };
}

/**
 * Single-layer HTF conflict gate: true only when `action` (BUY/SELL) is
 * directly opposed by a CLEARLY AVAILABLE higher-timeframe regime -- the
 * exact same rule src/engine/mtf.js already applies for 30m -> 15m, one
 * tier higher. An unavailable/unclear HTF context never blocks
 * (informational only) -- "do not WAIT merely because every timeframe is
 * not perfectly aligned".
 */
export function detectHtfConflict(action, htfContext) {
  if (action !== 'BUY' && action !== 'SELL') return false;
  if (!htfContext || htfContext.status !== 'OK' || !htfContext.regime) return false;
  if (htfContext.regime === 'BEAR_TREND' && action === 'BUY') return true;
  if (htfContext.regime === 'BULL_TREND' && action === 'SELL') return true;
  return false;
}
