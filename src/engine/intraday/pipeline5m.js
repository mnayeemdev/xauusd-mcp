/**
 * intraday_5m profile: the 5m ENTRY pipeline and the cross-timeframe
 * combiner.
 *
 *   runIntradayPipeline()  5m regime -> 5m structure -> models (gated by
 *                          the 15m bias) -> risk/objective gate -> quality
 *                          gate -> WAIT or BUY/SELL, in the SAME result
 *                          shape src/engine/pipeline.js returns so every
 *                          downstream observability layer keeps working.
 *   combineIntraday()      applies the only three cross-timeframe vetoes:
 *                          15m fresh opposing CHoCH, 30m two-factor
 *                          opposition (regime AND structure), and the 1H
 *                          regime gate restricted to counter-trend /
 *                          unaligned trades.
 *
 * WAIT-reason precedence (first match wins):
 *   INSUFFICIENT_DATA, BIAS_UNAVAILABLE, CHOP, NO_ELIGIBLE_STRATEGY,
 *   VOLATILITY_INSUFFICIENT, OVEREXTENDED, INVALID_GEOMETRY,
 *   RR_NOT_ACCEPTABLE, NO_GOOD_ENTRY, then ENTRY_CONFLICT / HTF_CONFLICT
 *   from combineIntraday().
 *
 * There is no TRANSITION or CORRECTION_ACTIVE WAIT here: on 5m those are
 * bias inputs, not vetoes (see docs/XAUUSD_MCP_ENGINE.md).
 */
import { classifyRegime, REGIME_PARAMS } from '../regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../structure.js';
import { scoreQuality, classifySession } from '../quality.js';
import { MIN_BARS_REQUIRED } from '../pipeline.js';
import { atr, adxDi, ema } from '../math.js';
import { detectHtfConflict } from '../htf.js';
import { evaluateIntradayModels } from './models5m.js';
import { computeIntradayRisk } from './risk5m.js';
import { vetoedByFreshChoch, alignedWithBias } from './bias.js';
import { INTRADAY_PARAMS } from './params.js';

/**
 * True when the 1H context supports `side` (regime or structure agrees and
 * neither opposes). Used ONLY to pick which quality bar applies under a
 * NEUTRAL 15m bias: a trade that has no directional context at all needs
 * neutralBiasQualityThreshold; one the 1H tier already supports has
 * directional context and uses the normal qualityThreshold. It never
 * enables a model, never changes RR, and never overrides a veto.
 */
export function htfSupportsSide(ctx1H, side) {
  if (!ctx1H || ctx1H.status !== 'OK') return false;
  if (detectHtfConflict(side, ctx1H)) return false;
  // Audit 2026-09-25 (PART 7): only a DIRECTIONAL 1H regime is support. Structure
  // that merely exists inside a 1H RANGE/TRANSITION is context, not directional
  // support, and never lowers the NEUTRAL-bias quality bar.
  if (side === 'BUY') return ctx1H.regime === 'BULL_TREND';
  if (side === 'SELL') return ctx1H.regime === 'BEAR_TREND';
  return false;
}

/** Which quality bar applies, and why (observability). */
export function resolveQualityThreshold({ bias, side, ctx1H, params = INTRADAY_PARAMS }) {
  if (bias?.direction === 'BULLISH' || bias?.direction === 'BEARISH') return { threshold: params.qualityThreshold, basis: 'directional_bias' };
  if (htfSupportsSide(ctx1H, side)) return { threshold: params.qualityThreshold, basis: 'neutral_bias_htf_supported' };
  return { threshold: params.neutralBiasQualityThreshold, basis: 'neutral_bias_unsupported' };
}

function emptyDecision(wait_reason) {
  return { action: 'WAIT', wait_reason, entry: null, stop_loss: null, tp1: null, tp2: null, rr: null };
}

function waitResult({ status = 'OK', regime = null, structure = null, correction = { state: 'NONE' }, model = null, wait_reason, quality = null, evidence = {} }) {
  return { status, regime, structure, correction, model, decision: emptyDecision(wait_reason), quality, evidence };
}

/**
 * bars5: confirmed 5m bars. bias: computeBias() on 15m. m30Regime: the
 * 30m regime string (reference runPipeline on 30m) or null. ctx1H: the
 * computeHtfContext() result for 1H, or null (used only for the quality
 * penalty here; the hard veto lives in combineIntraday()).
 */
export function runIntradayPipeline({ bars5, bias, m30Regime = null, ctx1H = null, params = INTRADAY_PARAMS }) {
  const p = params;
  if (!Array.isArray(bars5) || bars5.length < MIN_BARS_REQUIRED) {
    return waitResult({ status: 'INSUFFICIENT_DATA', wait_reason: 'INSUFFICIENT_DATA', evidence: { bars_available: bars5?.length ?? 0, bars_required: MIN_BARS_REQUIRED } });
  }
  if (!bias || bias.status !== 'OK') {
    return waitResult({ wait_reason: 'BIAS_UNAVAILABLE', evidence: { bias_status: bias?.status ?? null } });
  }

  const { regime, evidence: regimeEvidence } = classifyRegime(bars5, REGIME_PARAMS);
  if (!regime) return waitResult({ status: 'INSUFFICIENT_DATA', wait_reason: 'INSUFFICIENT_DATA', evidence: regimeEvidence });

  const structure = computeStructure(bars5, STRUCTURE_PARAMS);
  if (!structure.state && structure.evidence?.insufficient_data) {
    return waitResult({ status: 'INSUFFICIENT_DATA', regime, wait_reason: 'INSUFFICIENT_DATA', evidence: structure.evidence });
  }

  const baseEvidence = { bias_direction: bias.direction, bias_regime: bias.regime, eligible_models: bias.eligible_models, atrRatio: regimeEvidence.atrRatio ?? null };

  if (regime === 'CHOP_UNCERTAIN' || bias.eligible_models.length === 0) {
    return waitResult({ regime, structure, wait_reason: 'CHOP', evidence: { ...baseEvidence, chop_source: regime === 'CHOP_UNCERTAIN' ? '5m' : '15m' } });
  }

  const atrVal = atr(bars5, 14).at(-1);
  const ema20 = ema(bars5.map((b) => b.close), 20);
  const { adx, diPlus, diMinus } = adxDi(bars5, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const atrRatio = regimeEvidence.atrRatio ?? 1;

  const candidate = evaluateIntradayModels({ bars: bars5, regime, structure, atrVal, atrRatio, ema20, bias, m30Regime }, p);
  const correction = candidate?.correction ?? { state: 'NONE' };
  if (!candidate) {
    return waitResult({ regime, structure, correction, wait_reason: 'NO_ELIGIBLE_STRATEGY', evidence: baseEvidence });
  }

  const risk = computeIntradayRisk({ candidate, bars: bars5, atrVal, structure5: structure, structure15: bias.structure }, p);
  if (risk.gate !== 'OK') {
    return waitResult({ regime, structure, correction, model: candidate.model, wait_reason: risk.gate, evidence: { ...baseEvidence, candidate, risk } });
  }

  const lastBar = bars5.at(-1);
  const session = classifySession(lastBar.time);
  const overextensionRatio = Math.abs(lastBar.close - candidate.anchor) / (atrVal * p.overextendAtrMult);
  const quality = scoreQuality({
    candidate: { ...candidate, overextensionRatio },
    structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold,
    atrRatio, htfRegime: m30Regime, session, rr: risk.rr, minRR: p.minRR,
  });
  // 1H opposed but not a hard veto for an aligned continuation trade -> quality penalty.
  const htfOpposed = detectHtfConflict(candidate.side, ctx1H);
  const penalised = htfOpposed ? Math.max(0, quality.score - p.htfOpposedQualityPenalty) : quality.score;
  // Replay of 2026-09-25: NEUTRAL-bias SELL candidates at quality 65-67
  // with RR >= 1.7 and BOTH 1H and 4H bearish were rejected by the
  // "no directional context" bar of 70. The 1H tier IS directional
  // context, so the 70 bar now applies only when nothing supports the side.
  const { threshold, basis: threshold_basis } = resolveQualityThreshold({ bias, side: candidate.side, ctx1H, params: p });
  const finalQuality = { ...quality, score: penalised, breakdown: { ...quality.breakdown, qHtfPenalty: htfOpposed ? -p.htfOpposedQualityPenalty : 0 }, threshold, threshold_basis };

  if (penalised < threshold) {
    return waitResult({ regime, structure, correction, model: candidate.model, wait_reason: 'NO_GOOD_ENTRY', quality: finalQuality, evidence: { ...baseEvidence, candidate, risk } });
  }

  return {
    status: 'OK',
    regime, structure, correction, model: candidate.model,
    decision: { action: candidate.side, wait_reason: null, entry: risk.entry, stop_loss: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2, rr: risk.rr, originBar: candidate.originBar },
    quality: finalQuality,
    evidence: { ...baseEvidence, candidate, risk, session, diPlus: diPlus.at(-1), diMinus: diMinus.at(-1), htf_opposed: htfOpposed },
  };
}

function opposes(regime, side) {
  return (regime === 'BEAR_TREND' && side === 'BUY') || (regime === 'BULL_TREND' && side === 'SELL');
}
function structureOpposes(state, side) {
  return (state === 'BEARISH' && side === 'BUY') || (state === 'BULLISH' && side === 'SELL');
}

/**
 * intraday: runIntradayPipeline() result. bias: computeBias() result.
 * m30: reference runPipeline() result for 30m (or null). ctx1H:
 * computeHtfContext() for 1H (or null).
 */
export function combineIntraday({ intraday, bias, m30 = null, ctx1H = null }) {
  const per_timeframe = { '5m': intraday, '15m_bias': bias, '30m': m30 };
  const base = { source_timeframe: '5m', bias_timeframe: '15m', per_timeframe };

  if (!bias || bias.status !== 'OK') return { ...base, action: 'WAIT', wait_reason: 'BIAS_UNAVAILABLE' };
  if (!intraday || intraday.status !== 'OK') return { ...base, action: 'WAIT', wait_reason: intraday?.status ?? 'INSUFFICIENT_DATA' };

  const action = intraday.decision.action;
  if (action !== 'BUY' && action !== 'SELL') return { ...base, action: 'WAIT', wait_reason: intraday.decision.wait_reason };

  if (vetoedByFreshChoch(bias, action)) {
    return { ...base, action: 'WAIT', wait_reason: 'ENTRY_CONFLICT', conflict: `15m shows a fresh opposing CHoCH (${bias.fresh_opposing_choch.direction}, ${bias.fresh_opposing_choch.bars_ago} bar(s) ago) against a ${action}` };
  }

  if (m30 && m30.status === 'OK' && opposes(m30.regime, action) && structureOpposes(m30.structure?.state, action)) {
    return { ...base, action: 'WAIT', wait_reason: 'ENTRY_CONFLICT', conflict: `30m regime ${m30.regime} AND 30m structure ${m30.structure.state} both oppose a ${action} (two-factor conflict)` };
  }

  const htfOpposed = detectHtfConflict(action, ctx1H);
  if (htfOpposed && (intraday.model === 'MR' || !alignedWithBias(bias, action))) {
    return { ...base, action: 'WAIT', wait_reason: 'HTF_CONFLICT', conflict: `1H regime ${ctx1H.regime} opposes a ${intraday.model} ${action} that is not an aligned continuation of the 15m bias` };
  }

  return { ...base, action, wait_reason: null, decision: intraday.decision, model: intraday.model, quality: intraday.quality, regime: intraday.regime, bias_direction: bias.direction, htf_penalised: htfOpposed };
}
