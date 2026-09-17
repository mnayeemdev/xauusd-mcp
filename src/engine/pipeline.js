/**
 * Single-timeframe deterministic decision pipeline:
 *   regime -> structure -> correction -> model eligibility/trigger ->
 *   overextension/RR gate -> quality gate -> WAIT or BUY/SELL.
 *
 * WAIT-reason precedence (checked in this exact order, first match wins
 * -- mirrors the frozen Pine engine's own documented precedence):
 *   1. INSUFFICIENT_DATA
 *   2. CHOP / TRANSITION regime
 *   3. CORRECTION_ACTIVE
 *   4. NO_ELIGIBLE_STRATEGY (no model triggered)
 *   5. OVEREXTENDED / ENTRY_LATE
 *   6. RR_NOT_ACCEPTABLE
 *   7. NO_GOOD_ENTRY (quality below threshold)
 *   otherwise -> BUY/SELL
 */
import { classifyRegime, REGIME_PARAMS } from './regime.js';
import { computeStructure, STRUCTURE_PARAMS } from './structure.js';
import { computeCorrection, CORRECTION_PARAMS } from './correction.js';
import { evaluateModels, MODEL_PARAMS } from './models.js';
import { computeRisk, RISK_PARAMS } from './risk.js';
import { scoreQuality, classifySession, QUALITY_PARAMS } from './quality.js';
import { atr, adxDi } from './math.js';

export const MIN_BARS_REQUIRED = Math.max(REGIME_PARAMS.bbWidthAvgLen, REGIME_PARAMS.atrAvgLen) + REGIME_PARAMS.emaSlowLen;

function emptyDecision(wait_reason) {
  return { action: 'WAIT', wait_reason, entry: null, stop_loss: null, tp1: null, tp2: null, rr: null };
}

/**
 * confirmedBars: array of confirmed OHLCV bars, oldest first (the caller
 * must have already stripped the currently-forming bar).
 * htfRegime: regime string of a higher timeframe, or null if unavailable.
 */
export function runPipeline({ confirmedBars, htfRegime = null }) {
  if (!Array.isArray(confirmedBars) || confirmedBars.length < MIN_BARS_REQUIRED) {
    return {
      status: 'INSUFFICIENT_DATA',
      regime: null, structure: null, correction: null, model: null,
      decision: emptyDecision('INSUFFICIENT_DATA'),
      quality: null,
      evidence: { bars_available: confirmedBars?.length ?? 0, bars_required: MIN_BARS_REQUIRED },
    };
  }

  const { regime, evidence: regimeEvidence } = classifyRegime(confirmedBars, REGIME_PARAMS);
  if (!regime) {
    return { status: 'INSUFFICIENT_DATA', regime: null, structure: null, correction: null, model: null, decision: emptyDecision('INSUFFICIENT_DATA'), quality: null, evidence: regimeEvidence };
  }

  if (regime === 'CHOP_UNCERTAIN' || regime === 'TRANSITION') {
    return { status: 'OK', regime, structure: null, correction: { state: 'NONE' }, model: null, decision: emptyDecision(regime === 'CHOP_UNCERTAIN' ? 'CHOP' : 'TRANSITION'), quality: null, evidence: regimeEvidence };
  }

  const structure = computeStructure(confirmedBars, STRUCTURE_PARAMS);
  if (!structure.state && structure.evidence?.insufficient_data) {
    return { status: 'INSUFFICIENT_DATA', regime, structure, correction: null, model: null, decision: emptyDecision('INSUFFICIENT_DATA'), quality: null, evidence: structure.evidence };
  }

  const correction = computeCorrection(confirmedBars, structure.state, CORRECTION_PARAMS);
  if (correction.state === 'ACTIVE') {
    return { status: 'OK', regime, structure, correction, model: null, decision: emptyDecision('CORRECTION_ACTIVE'), quality: null, evidence: {} };
  }

  const atrVal = atr(confirmedBars, 14).at(-1);
  const { adx, diPlus, diMinus } = adxDi(confirmedBars, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const candidate = evaluateModels({ bars: confirmedBars, regime, structure, correction, atrVal }, MODEL_PARAMS);
  if (!candidate) {
    return { status: 'OK', regime, structure, correction, model: null, decision: emptyDecision('NO_ELIGIBLE_STRATEGY'), quality: null, evidence: {} };
  }

  const risk = computeRisk({ candidate, bars: confirmedBars, atrVal, structure }, RISK_PARAMS);
  if (risk.gate !== 'OK') {
    return { status: 'OK', regime, structure, correction, model: candidate.model, decision: emptyDecision(risk.gate), quality: null, evidence: { candidate, risk } };
  }

  const lastBar = confirmedBars.at(-1);
  const session = classifySession(lastBar.time);
  const overextensionRatio = Math.abs(lastBar.close - candidate.anchor) / (atrVal * RISK_PARAMS.overextendAtrMult);
  const quality = scoreQuality({
    candidate: { ...candidate, overextensionRatio },
    structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold,
    atrRatio: regimeEvidence.atrRatio ?? 1, htfRegime, session, rr: risk.rr, minRR: RISK_PARAMS.minRR,
  }, QUALITY_PARAMS);

  if (quality.score < QUALITY_PARAMS.qualityThreshold) {
    return { status: 'OK', regime, structure, correction, model: candidate.model, decision: emptyDecision('NO_GOOD_ENTRY'), quality, evidence: { candidate, risk } };
  }

  return {
    status: 'OK',
    regime, structure, correction, model: candidate.model,
    decision: { action: candidate.side, wait_reason: null, entry: risk.entry, stop_loss: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr },
    quality,
    evidence: { candidate, risk, session, diPlus: diPlus.at(-1), diMinus: diMinus.at(-1) },
  };
}
