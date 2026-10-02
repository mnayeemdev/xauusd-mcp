/**
 * V16 SIGNAL REVALIDATION -- the original V8 entry conditions re-checked at execution time (RESEARCH ONLY; no order code).
 * VALID SIGNAL + AGE <= 6 s + CURRENT ORIGINAL CONDITIONS STILL VALID + RISK SAFE + BROKER SAFE + SAFETY SAFE = TRADE ELIGIBLE;
 * anything else is WAIT / REJECT. Age alone never produces a trade. Every limit used here is an existing frozen-engine or
 * production rule; the only new parameter is the owner's 6 s execution tolerance (timing.mjs). Pure: same input = same decision.
 */
import { createHash } from 'node:crypto';
import { decideGate, initGate, fromShadowRecord, STATES as V14_STATES, PRODUCTION_BREAKERS } from '../../trade_gate_v14/scripts/gate.mjs';
import { RR } from '../../entry_risk_integration_v11/scripts/integrate.mjs';
import { evaluateExecutableGeometry } from '../../../src/engine/mt5Policy.js';
import { REAL_DEFAULTS } from '../../../src/engine/mt5RealPolicy.js';
import { INTRADAY_PARAMS as ENGINE_PARAMS } from '../../core_pattern_audit_v8/engines/ALL/engine/intraday/params.js';
import { safetyStage } from '../../v8_forward_shadow/scripts/lib.mjs';
import { checkTiming, executionPrice, CONTRACT, MAX_EXECUTION_SIGNAL_AGE_MS } from './timing.mjs';

export const STATES = Object.freeze([...V14_STATES, 'WAIT_SIGNAL_EXPIRED', 'WAIT_SIGNAL_CHANGED']);
export const ENGINE_RULES = Object.freeze({ minRiskAtr: ENGINE_PARAMS.minRiskAtr, overextendAtrMult: ENGINE_PARAMS.overextendAtrMult, minRR: ENGINE_PARAMS.minRR });
export const PRODUCTION_RULES = Object.freeze({ maxEntryDriftUsd: REAL_DEFAULTS.maxEntryDriftUsd, minEffectiveRr: REAL_DEFAULTS.minEffectiveRr, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd });
// The frozen engine rounds its stop to 2 decimals AFTER applying minRiskAtr (risk5m.js geometry.stop_loss = round2(sl)); the recorded stop
// can therefore sit up to half a cent inside 0.5 ATR at the engine's own entry. That output precision is the only tolerance applied.
export const ENGINE_SL_ROUNDING_USD = 0.005;
export const CONFIGS = Object.freeze({
  PRIMARY: { riskModel: 'UNRESOLVED', breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY' },
  ILLUSTRATIVE_PCT_0_50_10K: { riskModel: { model: 'PCT', riskPct: 0.005 }, breakers: null, conflictResolution: 'EXISTING_PRIORITY' }, // research illustration, NOT an approved risk %
});
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const isSig = (a) => a === 'BUY' || a === 'SELL';
const r3 = (x) => (fin(x) ? Math.round(x * 1000) / 1000 : null);
const sha = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

/** The engine fields a revalidation needs (from a forward-shadow evaluateEngine() output); nothing is recomputed. */
export function engineSnapshot(d, barTime, { atrExact = null } = {}) {
  const c = d?.candidate ?? null;
  return { bar_time: barTime, engine_action: d?.engine_action ?? 'WAIT', engine_wait_reason: d?.engine_wait_reason ?? null, wait_category: d?.wait_category ?? null, wait_detail: d?.wait_detail ?? null, model: d?.model ?? null, candidate_side: d?.candidate_side ?? null,
    candidate: c ? { model: c.model, side: c.side, anchor: c.anchor, entry: c.entry, stop_loss: c.stop_loss, tp2_engine: c.tp2_engine, rr_engine: c.rr_engine, risk_atr: c.risk_atr, sl_source: c.sl_source ?? null, origin_bar_time: c.origin_bar_time ?? null, tp_170r: c.tp_170r ?? null } : null,
    stages: d?.stages ? { BUY: d.stages.BUY, SELL: d.stages.SELL } : null, bias: { direction: d?.bias?.direction ?? null }, input_stale: d?.input_stale ?? null, data_integrity: d?.data_integrity ?? null, atr_exact: fin(atrExact) ? atrExact : null };
}
/** Identity of the original signal (what may never change between observation and execution). */
export const signalIdentity = (s) => ({ bar_time: s.bar_time, side: s.engine_action, model: s.model, anchor: s.candidate?.anchor ?? null, stop_loss: s.candidate?.stop_loss ?? null, engine_entry: s.candidate?.entry ?? null, objective_tp2: s.candidate?.tp2_engine ?? null });
export const identityHash = (s) => sha(signalIdentity(s));

/** Existing rules at the execution price with the ORIGINAL structural SL (never moved) and the engine's objective. */
export function executionGeometry({ side, price, sl, anchor, atr, engineEntry, tp2 }) {
  const out = { price, sl, anchor, atr: r3(atr), engine_entry: engineEntry, objective_tp2: tp2 };
  if (![price, sl, anchor, atr, engineEntry, tp2].every(fin) || !(atr > 0) || !isSig(side)) return { ...out, valid: false, state: 'WAIT_INVALID_SL', reason: 'EXECUTION_GEOMETRY_UNAVAILABLE' };
  const risk = side === 'BUY' ? price - sl : sl - price; const drift = Math.abs(price - engineEntry); const ext = Math.abs(price - anchor) / atr;
  Object.assign(out, { risk: r3(risk), risk_atr: r3(risk / atr), distance_from_anchor_atr: r3(ext), drift_usd: r3(drift) });
  if (!(risk > 0)) return { ...out, valid: false, state: 'WAIT_INVALID_SL', reason: 'PRICE_BEYOND_STRUCTURAL_STOP' };
  if (risk < ENGINE_RULES.minRiskAtr * atr - ENGINE_SL_ROUNDING_USD) return { ...out, valid: false, state: 'WAIT_INVALID_SL', reason: 'RISK_BELOW_ENGINE_MIN_AT_EXECUTION' };
  if (ext > ENGINE_RULES.overextendAtrMult) return { ...out, valid: false, state: 'WAIT_INVALID_LOCATION', reason: 'OVEREXTENDED_AT_EXECUTION' };
  if (drift > PRODUCTION_RULES.maxEntryDriftUsd) return { ...out, valid: false, state: 'WAIT_BROKER_UNSAFE', reason: 'ENTRY_DRIFT' };
  const reward = side === 'BUY' ? tp2 - price : price - tp2; const rrObjective = reward / risk; out.effective_rr_to_objective = r3(rrObjective);
  const geo = evaluateExecutableGeometry({ side, price, engineSl: sl, engineTp2: tp2, minRr: PRODUCTION_RULES.minEffectiveRr }); out.production_executable_geometry = geo.valid ? 'VALID' : geo.reason;
  if (!geo.valid) return { ...out, valid: false, state: geo.reason === 'PRICE_BEYOND_STRUCTURAL_STOP' ? 'WAIT_INVALID_SL' : 'WAIT_INVALID_RR', reason: `EXECUTABLE_GEOMETRY:${geo.reason}` };
  if (!(rrObjective >= ENGINE_RULES.minRR - 1e-9)) return { ...out, valid: false, state: 'WAIT_INVALID_RR', reason: 'EFFECTIVE_RR_BELOW_ENGINE_MIN' };
  const tp = side === 'BUY' ? price + RR * risk : price - RR * risk; const rr = Math.abs(tp - price) / risk;
  return { ...out, valid: true, state: null, reason: 'OK', tp_170: tp, rr_170: rr, rr_verified: Math.abs(rr - RR) < 1e-9 };
}

/**
 * One execution-time decision for an observed signal.
 * inputs: { original, current (engine snapshot at the decision, or null), quote (quoteSnapshot), signal: { observed_mono, observed_wall_ms },
 *           decision: { mono, wallMs }, bars: { last_closed_open, latest_open }, news, shock, spec, configName, faults?, state? }
 */
export function revalidate(inp) {
  const { original, current, quote, decision, bars, news = null, shock = null, spec = null, configName = 'PRIMARY', faults = null } = inp;
  const config = { ...CONFIGS[configName], spec, ...(faults ? { faults } : {}) };
  const gateState = inp.state ?? initGate({ equity: 10_000 });
  const idBefore = identityHash(original);
  const signal = { observed_mono: inp.signal?.observed_mono, observed_wall_ms: inp.signal?.observed_wall_ms, bar_time: original.bar_time };
  const tc = checkTiming({ signal, quote, decision, bars, maxAgeMs: MAX_EXECUTION_SIGNAL_AGE_MS });
  const side = original.engine_action; const ep = executionPrice(side, quote);
  const rec = { contract: CONTRACT, symbol: 'XAUUSDm', timeframe: '5m', config: configName, signal_timestamp: { bar_close_utc: fin(original.bar_time) ? new Date((original.bar_time + 300) * 1000).toISOString() : null, observed_wall_utc: fin(signal.observed_wall_ms) ? new Date(signal.observed_wall_ms).toISOString() : null, observed_mono_ms: signal.observed_mono ?? null },
    quote_timestamp_ms: quote?.quote_timestamp_ms ?? null, quote_timestamp_utc: quote?.quote_timestamp_utc ?? null, decision_timestamp: { wall_utc: fin(decision?.wallMs) ? new Date(decision.wallMs).toISOString() : null, mono_ms: decision?.mono ?? null },
    signal_age_ms: tc.signal_age_ms, signal_age_seconds: fin(tc.signal_age_ms) ? r3(tc.signal_age_ms / 1000) : null, quote_age_ms: tc.quote_age_ms, quote_age_lower_ms: tc.quote_age_lower_ms, bid: quote?.bid ?? null, ask: quote?.ask ?? null, spread: quote?.spread ?? null,
    side, entry_price: ep.price, entry_price_source: ep.source, engine_entry: original.candidate?.entry ?? null, sl: original.candidate?.stop_loss ?? null, tp_170: null, rr: null, risk: 'N/A', timing: { ok: tc.ok, reasons: tc.reasons }, clock_monitor: tc.clock_monitor,
    original_identity: signalIdentity(original), current_identity: current ? signalIdentity(current) : null, entry_revalidated: false, fresh_evaluation: null, decision: null, reason: null, firewall: null };
  const finish = (decisionState, reason, extra = {}) => { Object.assign(rec, extra, { decision: decisionState, reason }); const idAfter = identityHash(original); rec.firewall = { original_identity_hash: idBefore, after: idAfter, ok: idBefore === idAfter }; if (!rec.firewall.ok) throw new Error('original signal modified'); return rec; };
  if (!isSig(side) || !original.candidate) return finish('WAIT_NO_TRIGGER', 'NO_ORIGINAL_SIGNAL');
  // T1-T3: genuine timestamp problems fail closed first
  if (tc.primary && tc.gate_state === 'WAIT_STALE_DATA' && /^(MISSING|CLOCK_OR_DATA_ERROR)/.test(tc.primary)) return finish('WAIT_STALE_DATA', tc.primary);
  // T4: beyond the execution tolerance the original is never carried forward; only a fresh evaluation on newer data can create a NEW signal
  if (tc.primary === 'SIGNAL_AGE_ABOVE_EXECUTION_TOLERANCE') return finish('WAIT_SIGNAL_EXPIRED', tc.primary, { fresh_evaluation: current && current.bar_time > original.bar_time && isSig(current.engine_action) ? 'NEW_SIGNAL_AVAILABLE' : 'NO_NEW_SIGNAL' });
  // T5-T6: quote freshness and integrity
  if (tc.primary) return finish(tc.gate_state, tc.primary);
  // E1: the same frozen engine re-evaluated on the latest closed bars
  if (!current) return finish('WAIT_STALE_DATA', 'CURRENT_ENGINE_STATE_UNAVAILABLE');
  const cur = { ...fromShadowRecord({ ...current, symbol: 'XAUUSDm', timeframe: '5m', safety: null, spread_usd: quote.spread }) };
  if (current.bar_time !== original.bar_time) return finish('WAIT_SIGNAL_CHANGED', 'NEW_BAR_CLOSED');
  if (!isSig(current.engine_action)) { const g = decideGate(gateState, { ...cur, signalAgeSec: tc.signal_age_ms / 1000, quoteAgeSec: tc.quote_age_ms / 1000, spread: quote.spread }, config); return finish(g.record.decision === 'TRADE_ELIGIBLE' ? 'WAIT_SIGNAL_CHANGED' : g.record.decision, `ORIGINAL_SIGNAL_INVALIDATED:${g.record.reason}`); }
  const a = signalIdentity(original), b = signalIdentity(current);
  const changed = a.side !== b.side ? 'DIRECTION_CHANGED' : a.model !== b.model ? 'MODEL_CHANGED' : a.anchor !== b.anchor ? 'ANCHOR_CHANGED' : a.stop_loss !== b.stop_loss ? 'STRUCTURAL_SL_CHANGED' : a.engine_entry !== b.engine_entry ? 'ENTRY_REFERENCE_CHANGED' : a.objective_tp2 !== b.objective_tp2 ? 'OBJECTIVE_CHANGED' : null;
  if (changed) return finish('WAIT_SIGNAL_CHANGED', changed);
  // X1-X5: existing rules at the execution price, original structural SL
  const atr = fin(original.atr_exact) ? original.atr_exact : null;
  const xg = executionGeometry({ side, price: ep.price, sl: original.candidate.stop_loss, anchor: original.candidate.anchor, atr, engineEntry: original.candidate.entry, tp2: original.candidate.tp2_engine });
  rec.execution_geometry = xg; if (!xg.valid) return finish(xg.state, xg.reason);
  rec.tp_170 = r3(xg.tp_170); rec.rr = xg.rr_verified ? RR : r3(xg.rr_170);
  // G1: the unchanged V14 gate with the execution entry (safety, breakers, conflict, trigger, risk, broker)
  const safety = safetyStage({ spread: quote.spread, news, shock, candidate: original.candidate });
  const exRow = cur.row ? { ...cur.row, g: { e: ep.price, sl: original.candidate.stop_loss, tp2: original.candidate.tp2_engine, rr: Math.abs(original.candidate.tp2_engine - ep.price) / Math.abs(ep.price - original.candidate.stop_loss), ra: Math.abs(ep.price - original.candidate.stop_loss) / atr, src: original.candidate.sl_source } } : null;
  const g = decideGate(gateState, { ...cur, row: exRow, safety: { block: safety.block ? safety.block.category : null }, signalAgeSec: tc.signal_age_ms / 1000, quoteAgeSec: tc.quote_age_ms / 1000, spread: quote.spread }, config);
  rec.risk = g.record.risk; rec.broker = g.record.broker; rec.safety = { block: safety.block, spread_ok: safety.checks.spread_ok, news_state: safety.checks.news_state, shock_state: safety.checks.shock_state }; rec.gate = { decision: g.record.decision, reason: g.record.reason, lots: g.record.lots ?? null, planned_risk_usd: g.record.planned_risk_usd ?? null };
  const revalidated = g.record.valid_entry === true; // every entry condition (V16 T/E/X + V14 steps 1-7) held; risk / broker may still reject
  Object.defineProperty(rec, 'next_state', { value: g.state, enumerable: false }); // gate state after this decision (not serialized)
  return finish(g.record.decision, g.record.reason, { entry_revalidated: revalidated, eligible_side: g.record.decision === 'TRADE_ELIGIBLE' ? side : null });
}

/** V16 invariants on one record (checked independently of the decision path). */
export function invariantViolations(rec) {
  const v = []; if (!STATES.includes(rec.decision)) v.push('UNKNOWN_STATE'); if (!rec.reason) v.push('DECISION_WITHOUT_REASON');
  if (rec.decision === 'TRADE_ELIGIBLE') {
    if (!rec.entry_revalidated) v.push('ELIGIBLE_WITHOUT_REVALIDATION'); if (!rec.timing?.ok) v.push('ELIGIBLE_WITH_TIMING_FAILURE');
    if (!(rec.signal_age_ms >= 0 && rec.signal_age_ms <= MAX_EXECUTION_SIGNAL_AGE_MS)) v.push('ELIGIBLE_SIGNAL_AGE_INVALID'); if (!(rec.quote_age_ms >= 0 && rec.quote_age_ms <= MAX_EXECUTION_SIGNAL_AGE_MS)) v.push('ELIGIBLE_QUOTE_AGE_INVALID');
    if (!rec.execution_geometry?.valid || !rec.execution_geometry?.rr_verified || rec.rr !== RR) v.push('ELIGIBLE_RR_NOT_1_70');
    if (rec.entry_price !== (rec.side === 'BUY' ? rec.ask : rec.bid)) v.push('ELIGIBLE_NOT_AT_SIDE_PRICE');
    if (rec.sl !== rec.original_identity?.stop_loss) v.push('ELIGIBLE_SL_MOVED'); if (!String(rec.risk).startsWith('ACCEPTED')) v.push('ELIGIBLE_RISK_NOT_ACCEPTED');
    if (JSON.stringify(rec.original_identity) !== JSON.stringify(rec.current_identity)) v.push('ELIGIBLE_SIGNAL_CHANGED');
  }
  if (rec.firewall && !rec.firewall.ok) v.push('FIREWALL_BREACH');
  return v;
}
