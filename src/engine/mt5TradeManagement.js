/**
 * ADAPTIVE TRADE MANAGEMENT for an open MCP position. PURE functions.
 *
 * Runs once per newly CONFIRMED entry-timeframe candle with that cycle's
 * analyzeMarket() result (intraday_5m profile: 5m confirmed bars, 5m
 * structure, 15m bias). Every decision is deterministic and reproducible
 * from that evidence; no free-text judgement decides a REAL close.
 *
 * States (strategy authorities, earliest valid wins):
 *   HOLD
 *   THESIS_INVALIDATION_CLOSE  -- src/engine/mt5Policy.js evaluateThesisInvalidation() (unchanged)
 *   THESIS_DETERIORATION_CLOSE -- multi-factor confirmed deterioration of a losing/flat trade
 *   PROFIT_PROTECT_CLOSE       -- meaningful R progress AND confirmed reversal evidence
 * Monetary / broker / emergency authorities live in the executor's actual-P&L
 * monitor, the broker SL/TP and the kill switch:
 *   MONETARY_PROFIT_CLOSE, MONETARY_MAX_LOSS_CLOSE, BROKER_PROTECTIVE_CLOSE, EMERGENCY_CLOSE.
 *
 * EXACT RULES (BUY; SELL is the mirror):
 *   progress_r   = (highest confirmed HIGH since entry - fill) / initial_risk
 *   retrace      = (best - last confirmed CLOSE) / (best - fill)
 *   opposite_event_after_entry = 5m lastEvent is BEARISH and its bar closed after the fill
 *   htf_against  = 15m bias BEARISH, or 15m fresh opposing CHoCH, or 15m structure BEARISH
 *   regime_against = 5m regime BEAR_TREND
 *   momentum_against = last 3 confirmed closes each lower than the previous
 *                      AND last close <= fill - 0.5 x initial_risk
 *   opposite_signal = result.action === 'SELL' with signal.is_new_event === true (actionable, never a candidate)
 *
 *   PROFIT_PROTECT_CLOSE  iff  progress_r >= 1.0  AND  last close > fill (earned profit at risk)
 *                         AND ( opposite_event_after_entry OR opposite_signal OR 15m fresh opposing CHoCH
 *                               OR retrace >= 0.5 )
 *   THESIS_DETERIORATION_CLOSE iff last close < fill (losing on a confirmed basis)
 *                         AND at least 2 of { opposite_event_after_entry, htf_against, regime_against, momentum_against, opposite_signal }
 *                         AND at least 1 of those is a POST-ENTRY development
 *                             { opposite_event_after_entry, momentum_against, opposite_signal, 15m fresh opposing CHoCH }
 *                         (static context that already existed at entry -- 5m regime, 15m structure/bias --
 *                          can support but never by itself constitute deterioration)
 *   otherwise HOLD.
 *
 * Never fires on: ticks, spread, unconfirmed bars, one opposite candle, one
 * wick, planner/WATCH states, opposite candidates that were not actionable,
 * or stale evidence (the caller gates staleness; see isEvidenceFresh()).
 */
import { evaluateThesisInvalidation } from './mt5Policy.js';

export const TRADE_STATES = Object.freeze(['HOLD', 'THESIS_INVALIDATION_CLOSE', 'THESIS_DETERIORATION_CLOSE', 'PROFIT_PROTECT_CLOSE', 'MONETARY_PROFIT_CLOSE', 'MONETARY_MAX_LOSS_CLOSE', 'BROKER_PROTECTIVE_CLOSE', 'EMERGENCY_CLOSE']);

export const TRADE_MANAGEMENT_PARAMS = Object.freeze({
  profitProtectMinProgressR: 1.0,
  profitProtectRetraceFraction: 0.5,
  deteriorationMinFactors: 2,
  deteriorationMomentumBars: 3,
  deteriorationMomentumMinAdverseR: 0.5,
  maxEvidenceAgeSec: 900, // analysis older than this, or a last confirmed bar older than 2 bars + this, is stale
});

const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** Confirmed evidence must be recent: the analysis itself and its last confirmed bar. */
export function isEvidenceFresh({ result, now, tfSec = 300, params = TRADE_MANAGEMENT_PARAMS }) {
  const nowSec = (now instanceof Date ? now : new Date(now)).getTime() / 1000;
  const calcSec = Date.parse(result?.calculated_at ?? '') / 1000;
  const bars = Array.isArray(result?.primary_confirmed_bars) ? result.primary_confirmed_bars : null;
  const lastSec = bars?.at(-1)?.time;
  if (!Number.isFinite(calcSec) || nowSec - calcSec > params.maxEvidenceAgeSec) return { fresh: false, reason: 'ANALYSIS_STALE', analysis_age_sec: Number.isFinite(calcSec) ? Math.round(nowSec - calcSec) : null };
  if (!Number.isFinite(lastSec) || nowSec - (lastSec + tfSec) > 2 * tfSec + params.maxEvidenceAgeSec) return { fresh: false, reason: 'CONFIRMED_BAR_STALE', bar_age_sec: Number.isFinite(lastSec) ? Math.round(nowSec - lastSec) : null };
  return { fresh: true, reason: 'OK' };
}

/** Maps an executor exit reason to the adaptive state vocabulary (audit only). */
export function exitStateFor(exitReason) {
  const r = String(exitReason ?? '');
  if (r.startsWith('THESIS_STOP_CLOSE') || r.startsWith('THESIS_OPPOSITE')) return 'THESIS_INVALIDATION_CLOSE';
  if (r === 'THESIS_DETERIORATION') return 'THESIS_DETERIORATION_CLOSE';
  if (r === 'PROFIT_PROTECT') return 'PROFIT_PROTECT_CLOSE';
  if (r === 'TAKE_PROFIT_BUDGET') return 'MONETARY_PROFIT_CLOSE';
  if (r === 'STOP_LOSS_BUDGET') return 'MONETARY_MAX_LOSS_CLOSE';
  if (r.startsWith('BROKER_') || r === 'CLOSED_BY_BROKER_BEFORE_OUR_CLOSE') return 'BROKER_PROTECTIVE_CLOSE';
  return 'EMERGENCY_CLOSE'; // kill switch, manual, fill-geometry safety close, reconcile-found closes
}

function progressFromBars({ side, fill, risk, bars, openSec, tfSec }) {
  const after = bars.filter((b) => Number.isFinite(b?.time) && b.time + tfSec > openSec);
  if (!after.length || !(risk > 0)) return { bars_after_entry: after.length, best: null, progress_r: null, retrace: null, last_close: after.at(-1)?.close ?? null, closes: [] };
  const best = side === 'BUY' ? Math.max(...after.map((b) => b.high)) : Math.min(...after.map((b) => b.low));
  const lastClose = after.at(-1).close;
  const favorable = side === 'BUY' ? best - fill : fill - best;
  const progressR = favorable / risk;
  const earned = side === 'BUY' ? best - fill : fill - best;
  const givenBack = side === 'BUY' ? best - lastClose : lastClose - best;
  const retrace = earned > 0 ? givenBack / earned : null;
  return { bars_after_entry: after.length, best: r2(best), progress_r: r2(progressR), retrace: retrace == null ? null : r2(retrace), last_close: lastClose, closes: after.map((b) => b.close) };
}

/**
 * position: the executor's position record (needs side, open_price,
 * open_time, engine.{structural_stop, setup_level, planned_entry}).
 * result: this cycle's analyzeMarket() output (intraday profile).
 */
export function evaluateTradeManagement({ position, result, params = TRADE_MANAGEMENT_PARAMS, tfSec = 300 }) {
  const side = position?.side;
  if (!position || (side !== 'BUY' && side !== 'SELL')) return { state: 'HOLD', reason: 'NO_POSITION' };
  const bars = Array.isArray(result?.primary_confirmed_bars) ? result.primary_confirmed_bars : null;
  if (!bars || !bars.length) return { state: 'HOLD', reason: 'NO_CONFIRMED_EVIDENCE' };

  // 1. Structural / thesis invalidation (existing, authoritative).
  const inv = evaluateThesisInvalidation({ position, result });
  if (inv.invalidated) return { state: 'THESIS_INVALIDATION_CLOSE', reason: inv.reason, evidence: inv.detail ?? null };

  const fill = Number(position.open_price);
  const stop = Number(position.engine?.structural_stop ?? position.engine?.engine_sl);
  const risk = Number.isFinite(position.initial_structural_risk) && position.initial_structural_risk > 0 ? Number(position.initial_structural_risk) : Math.abs(fill - stop);
  const openSec = Date.parse(position.open_time ?? '') / 1000;
  if (!Number.isFinite(fill) || !Number.isFinite(openSec) || !(risk > 0)) return { state: 'HOLD', reason: 'GEOMETRY_UNAVAILABLE' };

  const prog = progressFromBars({ side, fill, risk, bars, openSec, tfSec });
  if (!prog.bars_after_entry) return { state: 'HOLD', reason: 'NO_CANDLE_AFTER_ENTRY', progress: prog };
  const lastClose = prog.last_close;
  const winningOnClose = side === 'BUY' ? lastClose > fill : lastClose < fill;
  const losingOnClose = side === 'BUY' ? lastClose < fill : lastClose > fill;

  // Confirmed evidence factors.
  const opposite = side === 'BUY' ? 'SELL' : 'BUY';
  const oppDir = side === 'BUY' ? 'BEARISH' : 'BULLISH';
  const ev = result?.evidence?.structure?.lastEvent ?? null;
  const evBar = ev && Number.isInteger(ev.bar) ? bars[ev.bar] : null;
  const opposite_event_after_entry = !!(ev && ev.direction === oppDir && Number.isFinite(evBar?.time) && evBar.time + tfSec > openSec);
  const bias = result?.bias ?? null;
  const freshChochAgainst = !!(bias?.fresh_opposing_choch && bias.fresh_opposing_choch.direction === oppDir);
  const htf_against = !!(bias && (bias.direction === oppDir || freshChochAgainst || bias.structure_state === oppDir || bias?.structure?.state === oppDir || result?.timeframes?.['15m']?.structure_state === oppDir));
  const regime5 = result?.evidence?.regime ?? result?.timeframes?.['5m']?.regime ?? result?.regime ?? null;
  const regime_against = (side === 'BUY' && regime5 === 'BEAR_TREND') || (side === 'SELL' && regime5 === 'BULL_TREND');
  const n = params.deteriorationMomentumBars;
  const closes = prog.closes.slice(-n);
  const stepwiseAgainst = closes.length === n && closes.every((c, i) => i === 0 || (side === 'BUY' ? c < closes[i - 1] : c > closes[i - 1]));
  const adverseR = side === 'BUY' ? (fill - lastClose) / risk : (lastClose - fill) / risk;
  const momentum_against = stepwiseAgainst && adverseR >= params.deteriorationMomentumMinAdverseR;
  const opposite_signal = result?.action === opposite && result?.signal?.is_new_event === true;

  const factors = { opposite_event_after_entry, htf_against, regime_against, momentum_against, opposite_signal };
  const factorCount = Object.values(factors).filter(Boolean).length;
  const developing = opposite_event_after_entry || momentum_against || opposite_signal || freshChochAgainst;
  const base = { progress: prog, factors, factor_count: factorCount, post_entry_development: developing, adverse_r: r2(adverseR), last_close: lastClose, fill, initial_risk: r2(risk) };

  // 2. Profit protection: meaningful progress AND confirmed reversal evidence.
  if (prog.progress_r != null && prog.progress_r >= params.profitProtectMinProgressR && winningOnClose) {
    const reversal = opposite_event_after_entry || opposite_signal || freshChochAgainst || (prog.retrace != null && prog.retrace >= params.profitProtectRetraceFraction);
    if (reversal) {
      const trigger = opposite_event_after_entry ? 'OPPOSITE_STRUCTURE_EVENT' : opposite_signal ? 'OPPOSITE_ACTIONABLE_SIGNAL' : freshChochAgainst ? 'HTF_FRESH_OPPOSING_CHOCH' : 'RETRACE_OF_EARNED_PROGRESS';
      return { state: 'PROFIT_PROTECT_CLOSE', reason: 'PROFIT_PROTECT', trigger, evidence: base };
    }
  }

  // 3. Deterioration: losing on a confirmed basis AND >= 2 independent confirmed factors.
  if (losingOnClose && factorCount >= params.deteriorationMinFactors && developing) {
    return { state: 'THESIS_DETERIORATION_CLOSE', reason: 'THESIS_DETERIORATION', evidence: base };
  }

  return { state: 'HOLD', reason: winningOnClose ? 'HEALTHY' : losingOnClose ? 'WEAK_EVIDENCE' : 'FLAT', evidence: base };
}
