/**
 * V11 ENTRY + RISK INTEGRATION -- pure integration layer (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED; no order code).
 * Spec: ../V11_PREREGISTRATION.md. Entry validity comes ONLY from the frozen V8 corrected engine. The entry record is deep-frozen
 * and hashed; this layer is strictly downstream and can only ACCEPT or REJECT. It never changes pattern, setup, trigger,
 * direction, entry location or structural SL, and it never creates an entry. Every valid entry yields exactly one record.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadBrokerSpec, decide, onBrokerRejection } from '../../risk_capital_v10/scripts/risk.mjs';
import { REAL_DEFAULTS } from '../../../src/engine/mt5RealPolicy.js';
import { INTRADAY_PARAMS } from '../../../src/engine/intraday/params.js';

export const RR = 1.70;
export const ENGINE_LIMITS = Object.freeze({ minRiskAtr: INTRADAY_PARAMS.minRiskAtr, overextendAtrMult: INTRADAY_PARAMS.overextendAtrMult, minRR: INTRADAY_PARAMS.minRR });
export const SAFETY_LIMITS = Object.freeze({ maxQuoteAgeSec: REAL_DEFAULTS.maxQuoteAgeSec, maxSignalAgeSec: REAL_DEFAULTS.maxSignalAgeSec, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd });
export const ENTRY_FIELDS = Object.freeze(['id', 'i', 't', 'model', 'side', 'candidate_side', 'entry', 'sl', 'anchor', 'engine_tp2', 'engine_rr', 'risk_atr', 'trigger']);
export const OUTCOMES = Object.freeze(['RISK_ACCEPTED', 'RISK_REJECTED', 'EXPOSURE_BLOCKED', 'FAIL_CLOSED', 'DUPLICATE_DELIVERY', 'NOT_EVALUABLE']);
const SPEC_FIELDS = ['contract_size', 'volume_min', 'volume_max', 'volume_step', 'point', 'digits', 'leverage', 'margin_call_pct', 'stops_level_points', 'freeze_level_points'];
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }
/** Immutable entry record from a frozen V8 engine replay row (act BUY/SELL). Nothing is computed that could alter validity. */
export function entryFromRow(r) {
  return deepFreeze({ id: `${r.i}|${r.act}`, i: r.i, t: r.t, model: r.mdl, side: r.act, candidate_side: r.cs ?? null, entry: r.g?.e ?? null, sl: r.g?.sl ?? null, anchor: r.anc ?? r.g?.e ?? null, engine_tp2: r.g?.tp2 ?? null, engine_rr: r.g?.rr ?? null, risk_atr: r.g?.ra ?? null, trigger: r.trig ?? null });
}
export const entryHash = (e) => sha(JSON.stringify(ENTRY_FIELDS.map((k) => e[k] ?? null)));
/** The research objective at exactly RR 1.70 from the frozen entry and structural SL (derived, never fed back into the entry). */
export const target170 = (e) => (e.side === 'BUY' ? e.entry + RR * Math.abs(e.entry - e.sl) : e.entry - RR * Math.abs(e.entry - e.sl));

/** Verifies the frozen entry geometry against the engine's own rules. Reports defects; never repairs anything. */
export function checkEntryGeometry(e) {
  const d = []; const R = Math.abs(e.entry - e.sl);
  if (e.side !== 'BUY' && e.side !== 'SELL') d.push('SIDE_INVALID');
  if (e.candidate_side != null && e.candidate_side !== e.side) d.push('SIDE_MISMATCH');
  if (!Number.isFinite(e.entry) || !Number.isFinite(e.sl)) d.push('PRICE_MISSING');
  else {
    if (!(R > 0)) d.push('R_NONPOSITIVE');
    if (e.side === 'BUY' ? !(e.sl < e.entry) : !(e.sl > e.entry)) d.push('SL_WRONG_SIDE');
    if (Number.isFinite(e.risk_atr) && e.risk_atr < ENGINE_LIMITS.minRiskAtr - 0.005) d.push('R_BELOW_MIN_ATR');
    if (Number.isFinite(e.risk_atr) && e.risk_atr > 0 && Number.isFinite(e.anchor)) { const atr = R / e.risk_atr; if (Math.abs(e.entry - e.anchor) / atr > ENGINE_LIMITS.overextendAtrMult * 1.02 + 1e-9) d.push('OVEREXTENDED'); }
    if (!(e.engine_rr >= ENGINE_LIMITS.minRR - 1e-9)) d.push('ENGINE_RR_BELOW_MIN');
    if (Number.isFinite(e.engine_tp2) && R > 0 && Math.abs(Math.abs(e.engine_tp2 - e.entry) / R - e.engine_rr) > 0.02 + 0.01 / R) d.push('ENGINE_RR_INCONSISTENT');
    if (Number.isFinite(e.engine_tp2) && (e.side === 'BUY' ? !(e.engine_tp2 > e.entry) : !(e.engine_tp2 < e.entry))) d.push('TP_WRONG_SIDE');
  }
  return { ok: d.length === 0, defects: d };
}

/** Platform spec: the V10 loader (fails closed) plus profit / account currency and any platform tick value from the same record. */
export function loadPlatformSpec(logPath) {
  const base = loadBrokerSpec(logPath); if (!existsSync(logPath)) throw new Error('platform record missing');
  let rec = null; for (const l of readFileSync(logPath, 'utf8').split('\n')) { if (!l.includes('"volume_step"') || !l.includes('XAUUSDm')) continue; try { rec = JSON.parse(l); } catch { /* skip */ } }
  const find = (o, k) => { let v; JSON.stringify(o, (key, val) => { if (key === k && v === undefined && val != null && typeof val !== 'object') v = val; return val; }); return v; };
  return { ...base, currency_profit: find(rec, 'currency_profit') ?? null, account_currency: find(rec, 'currency') ?? null, platform_tick_value: find(rec, 'trade_tick_value') ?? null, account_is_real: find(rec, 'trade_mode_is_real') ?? null };
}
export function specMissing(spec) { if (!spec || typeof spec !== 'object') return ['spec']; return SPEC_FIELDS.filter((k) => !Number.isFinite(Number(spec[k])) || (['contract_size', 'volume_min', 'volume_max', 'volume_step', 'point', 'leverage'].includes(k) && !(Number(spec[k]) > 0))); }
/** Tick value per lot: the platform value if recorded (cross-checked), else tick size x contract only when profit currency = account currency. */
export function resolveTickValue(spec) {
  const derived = Number(spec.point) * Number(spec.contract_size); const same = spec.currency_profit != null && spec.currency_profit === spec.account_currency;
  if (Number(spec.platform_tick_value) > 0) { if (same && Math.abs(Number(spec.platform_tick_value) - derived) / derived > 0.01) return { ok: false, reason: 'TICK_VALUE_INCONSISTENT' }; return { ok: true, value: Number(spec.platform_tick_value), source: 'platform' }; }
  if (same && derived > 0) return { ok: true, value: derived, source: 'derived_same_currency' };
  return { ok: false, reason: 'TICK_VALUE_UNAVAILABLE' };
}
/** Independent worst-case loss per 1.0 lot through the tick value (a different path from the V10 contract-size formula). */
export const lossPerLotViaTicks = ({ R, spread, slipAllowance, spec, tickValue }) => ((1.5 * R + spread + slipAllowance) / spec.point) * tickValue;

/** Broker order validation for an accepted size. Never resizes; any failure rejects. The broker SL is the hard fail-safe 1.5 R + spread. */
export function validateBrokerOrder({ lots, side, entry, sl, spread, spec }) {
  const reasons = []; const step = spec.volume_step; const k = lots / step;
  if (!(Number.isFinite(lots) && lots > 0)) reasons.push('LOT_INVALID');
  else { if (Math.abs(k - Math.round(k)) > 1e-6) reasons.push('LOT_NOT_STEP_MULTIPLE'); if (lots < spec.volume_min - 1e-12) reasons.push('LOT_BELOW_MIN'); if (lots > spec.volume_max + 1e-12) reasons.push('LOT_ABOVE_MAX'); }
  const R = Math.abs(entry - sl); const brokerSl = side === 'BUY' ? entry - (1.5 * R + spread) : entry + (1.5 * R + spread);
  for (const [tag, level] of [['STRUCTURAL', sl], ['BROKER', brokerSl]]) { if (side === 'BUY' ? !(level < entry) : !(level > entry)) reasons.push(`${tag}_SL_WRONG_SIDE`); const dist = Math.abs(entry - level) / spec.point; if (dist < spec.stops_level_points) reasons.push(`${tag}_SL_INSIDE_STOPS_LEVEL`); if (dist <= spec.freeze_level_points && spec.freeze_level_points > 0) reasons.push(`${tag}_SL_INSIDE_FREEZE_LEVEL`); }
  return { ok: reasons.length === 0, reasons, broker_sl: brokerSl };
}

/**
 * One valid entry through the integrated pipeline.
 * ctx: { equity, spread, quoteAgeSec, signalAgeSec, nowT, spec, cfg (V10 config), faults? } -> { state, record }.
 * `faults` is used ONLY by the fault-injection replay and tests (simulated defects of data, platform or sizing code).
 */
export function integrateEntry(state, entry, ctx) {
  const h0 = entryHash(entry); const f = ctx.faults ?? {}; const base = { entry_id: entry.id, entry_hash: h0, valid_entry: true, model: entry.model, side: entry.side };
  const geometry = checkEntryGeometry(entry); const close = (outcome, reason, extra = {}) => ({ state, record: { ...base, outcome, reason, geometry_defects: geometry.defects, entry_hash_after: entryHash(entry), ...extra } });
  if (!(Number.isFinite(ctx.equity) && ctx.equity > 0)) return close('FAIL_CLOSED', 'EQUITY_UNAVAILABLE');
  if (!Number.isFinite(entry.sl)) return close('FAIL_CLOSED', 'SL_UNAVAILABLE');
  const missing = specMissing(ctx.spec); if (missing.length) return close('FAIL_CLOSED', 'BROKER_SPEC_UNAVAILABLE', { missing });
  const tick = resolveTickValue(ctx.spec); if (!tick.ok) return close('FAIL_CLOSED', tick.reason);
  if (!(Number.isFinite(ctx.quoteAgeSec) && ctx.quoteAgeSec >= 0 && ctx.quoteAgeSec <= SAFETY_LIMITS.maxQuoteAgeSec)) return close('FAIL_CLOSED', 'DATA_STALE_QUOTE');
  if (!(Number.isFinite(ctx.signalAgeSec) && ctx.signalAgeSec >= 0 && ctx.signalAgeSec <= SAFETY_LIMITS.maxSignalAgeSec)) return close('FAIL_CLOSED', 'DATA_STALE_SIGNAL');
  if (!(Number.isFinite(ctx.spread) && ctx.spread >= 0 && ctx.spread <= SAFETY_LIMITS.maxSpreadUsd + 1e-12)) return close('FAIL_CLOSED', 'SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT');
  if (!geometry.ok) return close('FAIL_CLOSED', 'ENTRY_GEOMETRY_DEFECT');
  // ---- risk translation (V10 library, unchanged); the platform equity is authoritative ----
  const cfg = f.riskPct != null ? { ...ctx.cfg, riskPct: f.riskPct } : ctx.cfg; const spec = ctx.spec;
  const sig = { id: entry.id, t: ctx.nowT, side: entry.side, entry: entry.entry, sl: entry.sl, spread: ctx.spread };
  const d = decide({ ...state, equity: ctx.equity }, sig, { ...cfg, spec }); const st = d.state; const dec = { ...d.decision };
  if (dec.action !== 'ACCEPT') { const outcome = dec.reason === 'DUPLICATE_SIGNAL' ? 'DUPLICATE_DELIVERY' : dec.reason === 'POSITION_OPEN_MAX_SIMULTANEOUS_1' ? 'EXPOSURE_BLOCKED' : 'RISK_REJECTED'; return { state: st, record: { ...base, outcome, reason: dec.reason, geometry_defects: [], entry_hash_after: entryHash(entry), min_lot_risk_pct: dec.min_lot_risk_pct ?? null } }; }
  if (f.tamperRisk) dec.actual_risk *= 0.9; if (f.tamperLots) dec.lots = NaN; // simulated sizing-module defects
  // ---- risk consistency (independent recomputation through the tick value) ----
  const R = Math.abs(entry.entry - entry.sl); const lpl = lossPerLotViaTicks({ R, spread: ctx.spread, slipAllowance: cfg.slipAllowance, spec, tickValue: tick.value });
  if (!(Number.isFinite(dec.lots) && dec.lots > 0)) return { state: st, record: { ...base, outcome: 'FAIL_CLOSED', reason: 'POSITION_SIZE_INVALID', geometry_defects: [], entry_hash_after: entryHash(entry) } };
  const indep = cfg.model === 'CURRENT' ? Math.min(dec.lots * lpl, 50 + ctx.spread) : dec.lots * lpl;
  if (Math.abs(indep - dec.actual_risk) > 1e-6) return { state: st, record: { ...base, outcome: 'FAIL_CLOSED', reason: 'RISK_CALCULATION_INCONSISTENT', geometry_defects: [], entry_hash_after: entryHash(entry), independent_risk: indep, reported_risk: dec.actual_risk } };
  if (cfg.model === 'PCT' && dec.actual_risk > ctx.equity * cfg.riskPct + 1e-9) return { state: st, record: { ...base, outcome: 'FAIL_CLOSED', reason: 'RISK_ABOVE_APPROVED', geometry_defects: [], entry_hash_after: entryHash(entry) } };
  // ---- broker validation (never resizes) ----
  const bv = validateBrokerOrder({ lots: dec.lots, side: entry.side, entry: entry.entry, sl: entry.sl, spread: ctx.spread, spec });
  if (!bv.ok) return { state: st, record: { ...base, outcome: 'RISK_REJECTED', reason: `BROKER_${bv.reasons[0]}`, broker_reasons: bv.reasons, geometry_defects: [], entry_hash_after: entryHash(entry) } };
  if (f.brokerReject) { const r = onBrokerRejection(st, sig, f.brokerReject); return { state: r.state, record: { ...base, outcome: 'RISK_REJECTED', reason: 'REJECTED_BY_BROKER', broker_code: f.brokerReject, retry: r.decision.retry, size_change: r.decision.size_change, geometry_defects: [], entry_hash_after: entryHash(entry) } }; }
  return { state: st, record: { ...base, outcome: 'RISK_ACCEPTED', reason: 'ELIGIBLE', geometry_defects: [], entry_hash_after: entryHash(entry), lots: dec.lots, planned_risk_usd: dec.actual_risk, planned_risk_pct: dec.actual_risk_pct, approved_cash_usd: cfg.model === 'PCT' ? ctx.equity * cfg.riskPct : null, margin_pct: dec.margin_pct ?? (dec.lots * spec.contract_size * entry.entry / spec.leverage) / ctx.equity, broker_sl: bv.broker_sl, target_170: target170(entry), tick_value_source: tick.source } };
}
