/**
 * V14 NO-EDGE TRADE GATE -- pure, deterministic top-level decision gate (RESEARCH ONLY; no order code; not an edge generator).
 * Spec: ../V14_PREREGISTRATION.md. decideGate(state, input, config) -> { state, record }: same input + same state = same decision.
 * The gate NEVER creates an entry the frozen engine did not generate, never chooses a direction, never modifies an entry.
 * It only maps the existing rules and existing production safety limits to TRADE_ELIGIBLE or a WAIT state with a reason.
 */
import { stageOf, triggerValid, triggersOf, MODELS } from '../../entry_edge_risk_v12/scripts/isolation.mjs';
import { entryFromRow, entryHash, checkEntryGeometry, integrateEntry, SAFETY_LIMITS } from '../../entry_risk_integration_v11/scripts/integrate.mjs';
import { initState, openPosition, settle } from '../../risk_capital_v10/scripts/risk.mjs';
import { canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { REAL_DEFAULTS } from '../../../src/engine/mt5RealPolicy.js';

export const STATES = Object.freeze(['WAIT_STALE_DATA', 'WAIT_SAFETY_BREAKER', 'WAIT_NO_SETUP', 'WAIT_NO_TRIGGER', 'WAIT_DIRECTION_UNCLEAR', 'WAIT_CONFLICT', 'WAIT_INVALID_LOCATION', 'WAIT_INVALID_SL', 'WAIT_INVALID_RR', 'WAIT_ENTRY_QUALITY', 'WAIT_RISK_UNSAFE', 'WAIT_BROKER_UNSAFE', 'TRADE_ELIGIBLE']);
export const PRODUCTION_BREAKERS = Object.freeze({ maxConsecutiveLosses: REAL_DEFAULTS.maxConsecutiveLosses, maxTradesPerDay: REAL_DEFAULTS.maxTradesPerDay });
export const EXISTING_PRIORITY = 'EXISTING_PRIORITY_MC>PB>BO>SR>MR';
const ENGINE_STALE = new Set(['DATA_UNAVAILABLE_STALE', 'INSUFFICIENT_DATA', 'BIAS_UNAVAILABLE']);
const ENGINE_DIRECTION = new Set(['NO_ELIGIBLE_STRATEGY', 'CHOP', 'HTF_CONFLICT', 'ENTRY_CONFLICT']);
const ENGINE_MAP = { OVEREXTENDED: 'WAIT_INVALID_LOCATION', INVALID_GEOMETRY: 'WAIT_INVALID_SL', RR_NOT_ACCEPTABLE: 'WAIT_INVALID_RR', VOLATILITY_INSUFFICIENT: 'WAIT_INVALID_RR', NO_GOOD_ENTRY: 'WAIT_ENTRY_QUALITY' };
const V11_MAP = { EQUITY_UNAVAILABLE: 'WAIT_BROKER_UNSAFE', SL_UNAVAILABLE: 'WAIT_INVALID_SL', BROKER_SPEC_UNAVAILABLE: 'WAIT_BROKER_UNSAFE', TICK_VALUE_UNAVAILABLE: 'WAIT_BROKER_UNSAFE', TICK_VALUE_INCONSISTENT: 'WAIT_BROKER_UNSAFE', DATA_STALE_QUOTE: 'WAIT_STALE_DATA', DATA_STALE_SIGNAL: 'WAIT_STALE_DATA', SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT: 'WAIT_BROKER_UNSAFE', POSITION_SIZE_INVALID: 'WAIT_RISK_UNSAFE', RISK_CALCULATION_INCONSISTENT: 'WAIT_RISK_UNSAFE', RISK_ABOVE_APPROVED: 'WAIT_RISK_UNSAFE', DUPLICATE_SIGNAL: 'WAIT_SAFETY_BREAKER' };
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------- adapters (time-ordered inputs; nothing beyond the bar is read) ----------------
/** V8 corrected-core replay row -> normalized gate input (decision at the bar close: signal age 0, quote age 0 by construction). */
export function fromReplayRow(row, { spread = 0.24 } = {}) {
  return { source: 'V8_REPLAY_ROW', t: row.t, i: row.i, symbol: 'XAUUSDm', timeframe: '5m', stale: ENGINE_STALE.has(row.wr) ? row.wr : row.stB ? null : 'STAGES_UNAVAILABLE', stages: row.stB ? { BUY: row.stB, SELL: row.stS } : null, bias: row.b15 ?? null, trig: row.trig != null ? [...triggersOf(row)] : [],
    engine: { action: row.act, wait_reason: row.act === 'WAIT' ? row.wr ?? null : null, model: row.mdl ?? null, candidate_side: row.cs ?? null }, row: row.act === 'BUY' || row.act === 'SELL' ? row : null, safety: { block: null }, signalAgeSec: 0, quoteAgeSec: 0, spread };
}
/** Forward-shadow decision record (live, read-only) -> normalized gate input. Fields the record does not carry stay null (fail closed). */
export function fromShadowRecord(rec) {
  const c = rec.candidate ?? null; const sig = (rec.engine_action === 'BUY' || rec.engine_action === 'SELL') && c;
  const integrityFail = rec.data_integrity && Object.values(rec.data_integrity).some((v) => v === 'FAIL');
  const stale = rec.input_stale ? `INPUT_STALE:${rec.input_stale}` : rec.wait_category === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : integrityFail ? 'DATA_INTEGRITY_FAIL' : !rec.stages ? 'STAGES_UNAVAILABLE' : ENGINE_STALE.has(rec.engine_wait_reason) ? rec.engine_wait_reason : null;
  const row = sig ? { i: rec.bar_time, t: rec.bar_time, act: rec.engine_action, mdl: rec.model, cs: rec.candidate_side, anc: c.anchor, trig: null, g: { e: c.entry, sl: c.stop_loss, tp2: c.tp2_engine, rr: c.rr_engine, ra: c.risk_atr, src: c.sl_source } } : null;
  return { source: 'V8_FORWARD_SHADOW', t: rec.bar_time, i: null, symbol: rec.symbol, timeframe: rec.timeframe, stale, stages: rec.stages ? { BUY: rec.stages.BUY, SELL: rec.stages.SELL } : null, bias: rec.bias?.direction ?? null, trig: null,
    engine: { action: rec.engine_action ?? 'WAIT', wait_reason: rec.engine_wait_reason ?? null, model: rec.model ?? null, candidate_side: rec.candidate_side ?? null }, row, safety: { block: rec.safety?.block ? rec.safety.block.category ?? 'SAFETY_BLOCK' : null }, signalAgeSec: Number.isFinite(rec.latency_sec) ? rec.latency_sec : null, quoteAgeSec: null, spread: Number.isFinite(rec.spread_usd) ? rec.spread_usd : null };
}

// ---------------- state ----------------
/** riskModel: 'UNRESOLVED' (default) | { model: 'PCT', riskPct } | { model: 'CURRENT' }. breakers: PRODUCTION_BREAKERS | null. */
export function initGate({ equity = 10000 } = {}) { return { last_t: null, position: null, daily: { day: null, completed: 0, consecutive_losses: 0 }, walk: { exitBar: -1, last: null, lastLoss: false }, ctrl: initState(equity), decided: 0 }; }
const rollDaily = (s, t) => { const d = day(t); if (s.daily.day !== d) s.daily = { day: d, completed: 0, consecutive_losses: 0 }; };
/** Market event fed by the driver when a hypothetical position has closed (its exit bar is in the past). Pure. */
export function applyClose(state, { exitT, exitBar, pnlUsd, cfg }) {
  const s = clone(state); if (!s.position) return s; rollDaily(s, exitT); s.daily.completed += 1; if (pnlUsd < 0) s.daily.consecutive_losses += 1; else s.daily.consecutive_losses = 0;
  s.ctrl = settle(s.ctrl, { pnlUsd, exitT }, cfg ?? {}); s.walk = { exitBar, last: { i: s.position.i, model: s.position.model, side: s.position.side, anchor: s.position.anchor }, lastLoss: pnlUsd <= 0 }; s.position = null; return s;
}

// ---------------- the gate ----------------
/**
 * config: { riskModel, breakers, conflictResolution ('EXISTING_PRIORITY' | null), spec, equity?, killSwitch?, maxEntryDriftUsd?, entryDriftUsd? }
 * Returns { state, record }. The record is the audit-log line (every WAIT carries a deterministic reason).
 */
export function decideGate(state, input, config) {
  const s = clone(state); const rowLike = { stB: input.stages?.BUY, stS: input.stages?.SELL, b15: input.bias };
  const obs = Object.fromEntries(MODELS.map((m) => [m, input.stages ? `${stageOf(rowLike, m, 'BUY')}${stageOf(rowLike, m, 'SELL')}` : '--']));
  const stagesAll = input.stages ? MODELS.flatMap((m) => ['BUY', 'SELL'].map((sd) => stageOf(rowLike, m, sd) ?? 0)) : [];
  const trigs = input.stages ? MODELS.flatMap((m) => ['BUY', 'SELL'].filter((sd) => triggerValid(rowLike, m, sd)).map((sd) => `${m}${sd[0]}`)) : [];
  const rec = { ts: new Date(input.t * 1000).toISOString(), bar_time: input.t, symbol: input.symbol, timeframe: input.timeframe, source: input.source, obs, pattern: !input.stages ? 'UNKNOWN' : stagesAll.some((v) => v >= 1) ? 'PRESENT' : 'ABSENT', setup: !input.stages ? 'UNKNOWN' : stagesAll.some((v) => v >= 2) ? 'PRESENT' : 'ABSENT', trigger: trigs.length ? trigs.join(',') : 'NONE',
    direction: 'N/A', conflict: null, location: 'N/A', sl: 'N/A', rr: 'N/A', quality: 'N/A', risk: 'N/A', broker: 'N/A', engine_action: input.engine.action, engine_wait_reason: input.engine.wait_reason, valid_entry: false, entry_id: null, entry_hash: null, discrepancy: null, decision: null, reason: null };
  const done = (decision, reason, extra = {}) => { Object.assign(rec, extra, { decision, reason }); if (decision !== 'WAIT_STALE_DATA' || reason !== 'OUT_OF_ORDER_OR_DUPLICATE_BAR') { s.last_t = input.t; s.decided += 1; } return { state: s, record: rec }; };
  // 1. stale / ordering
  if (s.last_t != null && !(input.t > s.last_t)) return done('WAIT_STALE_DATA', 'OUT_OF_ORDER_OR_DUPLICATE_BAR');
  if (input.stale) return done('WAIT_STALE_DATA', input.stale);
  if (input.signalAgeSec != null && input.signalAgeSec > SAFETY_LIMITS.maxSignalAgeSec) return done('WAIT_STALE_DATA', 'SIGNAL_AGE_ABOVE_LIMIT');
  // 2. safety breakers (existing production limits / recorded production safety state)
  rollDaily(s, input.t);
  if (config.killSwitch) return done('WAIT_SAFETY_BREAKER', 'KILL_SWITCH');
  if (input.safety?.block) return done('WAIT_SAFETY_BREAKER', input.safety.block);
  if (config.breakers && s.daily.consecutive_losses >= config.breakers.maxConsecutiveLosses) return done('WAIT_SAFETY_BREAKER', 'CONSECUTIVE_LOSS_LIMIT');
  if (config.breakers && s.daily.completed >= config.breakers.maxTradesPerDay) return done('WAIT_SAFETY_BREAKER', 'DAILY_TRADE_CEILING');
  // 3. setup, 4. trigger
  if (rec.setup !== 'PRESENT') return done('WAIT_NO_SETUP', rec.pattern === 'PRESENT' ? 'PATTERN_ONLY' : 'NO_PATTERN');
  if (!trigs.length) return input.engine.action === 'BUY' || input.engine.action === 'SELL' ? done('WAIT_NO_TRIGGER', 'ENGINE_SIGNAL_WITHOUT_VERIFIED_TRIGGER', { discrepancy: 'ENGINE_SIGNAL_WITHOUT_VERIFIED_TRIGGER' }) : done('WAIT_NO_TRIGGER', 'SETUP_WITHOUT_TRIGGER');
  // 5. direction (existing engine direction rules; the gate never picks a side)
  const e = input.engine;
  if (e.action !== 'BUY' && e.action !== 'SELL') {
    if (ENGINE_DIRECTION.has(e.wait_reason)) return done('WAIT_DIRECTION_UNCLEAR', e.wait_reason, { direction: `UNCLEAR:${e.wait_reason}` });
    if (ENGINE_MAP[e.wait_reason]) { const st = ENGINE_MAP[e.wait_reason]; return done(st, e.wait_reason, { direction: e.candidate_side ?? 'N/A', location: st === 'WAIT_INVALID_LOCATION' ? 'INVALID' : 'N/A', sl: st === 'WAIT_INVALID_SL' ? 'INVALID' : 'N/A', rr: st === 'WAIT_INVALID_RR' ? 'INVALID' : 'N/A', quality: st === 'WAIT_ENTRY_QUALITY' ? 'BELOW_THRESHOLD' : 'N/A' }); }
    return done('WAIT_SAFETY_BREAKER', `UNKNOWN_ENGINE_STATE:${e.wait_reason}`); // fail closed on anything unrecognised
  }
  const side = e.action, model = e.model; const ownTrigger = triggerValid(rowLike, model, side);
  if (!ownTrigger) return done('WAIT_NO_TRIGGER', 'ENGINE_SIGNAL_WITHOUT_VERIFIED_TRIGGER', { discrepancy: 'ENGINE_SIGNAL_WITHOUT_VERIFIED_TRIGGER' });
  if (input.trig && input.trig.length && !input.trig.includes(`${model}${side[0]}`)) return done('WAIT_DIRECTION_UNCLEAR', 'ENGINE_SIGNAL_NOT_IN_BIAS_TRIGGERS', { discrepancy: 'ENGINE_SIGNAL_NOT_IN_BIAS_TRIGGERS' });
  if (e.candidate_side != null && e.candidate_side !== side) return done('WAIT_DIRECTION_UNCLEAR', 'CANDIDATE_SIDE_MISMATCH', { discrepancy: 'CANDIDATE_SIDE_MISMATCH' });
  rec.direction = side;
  // 6. strategy conflict (opposite-side valid triggers of other strategies); resolution only if the existing architecture defines one
  const pool = input.trig && input.trig.length ? input.trig : trigs; const opposite = pool.filter((k) => k.slice(0, 2) !== model && k[2] !== side[0]);
  if (opposite.length) { rec.conflict = { opposite, basis: input.trig && input.trig.length ? 'BIAS_AWARE_TRIGGERS' : 'BIAS_AGNOSTIC_TRIGGERS', resolution: config.conflictResolution === 'EXISTING_PRIORITY' ? EXISTING_PRIORITY : 'NONE' }; if (config.conflictResolution !== 'EXISTING_PRIORITY') return done('WAIT_CONFLICT', 'STRATEGY_CONFLICT_NO_DEFINED_RESOLUTION'); }
  // 7. location / SL / RR (frozen entry record, verified, never repaired)
  const entry = entryFromRow(input.row); const h = entryHash(entry); Object.assign(rec, { valid_entry: true, entry_id: entry.id, entry_hash: h });
  const d = checkEntryGeometry(entry).defects; rec.location = d.includes('OVEREXTENDED') ? 'INVALID' : 'VALID'; rec.sl = d.some((x) => ['SL_WRONG_SIDE', 'R_NONPOSITIVE', 'R_BELOW_MIN_ATR', 'PRICE_MISSING'].includes(x)) ? 'INVALID' : 'VALID'; rec.rr = d.some((x) => ['ENGINE_RR_BELOW_MIN', 'ENGINE_RR_INCONSISTENT', 'TP_WRONG_SIDE'].includes(x)) ? 'INVALID' : 'VALID'; rec.quality = 'OK';
  if (rec.location === 'INVALID') return done('WAIT_INVALID_LOCATION', 'GEOMETRY_OVEREXTENDED', { valid_entry: false });
  if (rec.sl === 'INVALID') return done('WAIT_INVALID_SL', `GEOMETRY_${d.join('+')}`, { valid_entry: false });
  if (rec.rr === 'INVALID') return done('WAIT_INVALID_RR', `GEOMETRY_${d.join('+')}`, { valid_entry: false });
  if (d.length) return done('WAIT_DIRECTION_UNCLEAR', `GEOMETRY_${d.join('+')}`, { valid_entry: false });
  // 8. risk (V11 firewall; risk can only reject; an unresolved risk percentage can never approve)
  if (s.position) return done('WAIT_RISK_UNSAFE', 'POSITION_OPEN_MAX_SIMULTANEOUS_1', { risk: 'REJECTED:POSITION_OPEN_MAX_SIMULTANEOUS_1' });
  const re = canReenter({ signal: { i: input.i ?? entry.i, model, side, anchor: entry.anchor }, exitBar: s.walk.exitBar, lastTrade: s.walk.last, lastExitWasLoss: s.walk.lastLoss }); if (!re.ok) return done('WAIT_SAFETY_BREAKER', re.reason, { risk: 'N/A' });
  if (!config.riskModel || config.riskModel === 'UNRESOLVED') return done('WAIT_RISK_UNSAFE', 'RISK_PERCENTAGE_UNRESOLVED', { risk: 'REJECTED:RISK_PERCENTAGE_UNRESOLVED' });
  if (config.maxEntryDriftUsd != null && config.entryDriftUsd != null && config.entryDriftUsd > config.maxEntryDriftUsd) return done('WAIT_BROKER_UNSAFE', 'ENTRY_DRIFT', { risk: 'N/A', broker: 'UNSAFE:ENTRY_DRIFT' });
  const cfg = config.riskModel.model === 'CURRENT' ? { model: 'CURRENT', marginCapPct: 0.5, slipAllowance: 0.10, assessCurrent: config.assessCurrent } : { model: 'PCT', riskPct: config.riskModel.riskPct, marginCapPct: 0.5, dailyLimitPct: null, pauseAfter: null, weeklyLimitPct: null, slipAllowance: 0.10 };
  const out = integrateEntry(s.ctrl, entry, { equity: s.ctrl.equity, spread: input.spread, quoteAgeSec: input.quoteAgeSec, signalAgeSec: input.signalAgeSec, nowT: input.t + 300, spec: config.spec, cfg, faults: config.faults }); s.ctrl = out.state; const r = out.record;
  if (r.entry_hash_after !== h) throw new Error('entry modified by risk layer'); // the firewall must hold; never reached
  if (r.outcome === 'RISK_ACCEPTED') { s.ctrl = openPosition(s.ctrl, { id: entry.id }, { lots: r.lots, actual_risk: r.planned_risk_usd }); s.position = { id: entry.id, i: input.i ?? entry.i, model, side, anchor: entry.anchor, lots: r.lots }; return done('TRADE_ELIGIBLE', 'ALL_CHECKS_PASSED', { risk: `ACCEPTED:${r.lots}`, broker: 'OK', lots: r.lots, planned_risk_usd: r.planned_risk_usd }); }
  if (r.outcome === 'DUPLICATE_DELIVERY') return done('WAIT_SAFETY_BREAKER', 'DUPLICATE_SIGNAL', { risk: 'N/A' });
  if (r.outcome === 'EXPOSURE_BLOCKED') return done('WAIT_RISK_UNSAFE', r.reason, { risk: `REJECTED:${r.reason}` });
  if (r.outcome === 'RISK_REJECTED') { const broker = String(r.reason).startsWith('BROKER_') || r.reason === 'REJECTED_BY_BROKER'; return broker ? done('WAIT_BROKER_UNSAFE', r.reason, { risk: 'SIZED', broker: `UNSAFE:${r.reason}` }) : done('WAIT_RISK_UNSAFE', r.reason, { risk: `REJECTED:${r.reason}` }); }
  const st = V11_MAP[r.reason] ?? 'WAIT_SAFETY_BREAKER'; return done(st, r.reason, st === 'WAIT_RISK_UNSAFE' ? { risk: `REJECTED:${r.reason}` } : st === 'WAIT_BROKER_UNSAFE' ? { broker: `UNSAFE:${r.reason}` } : {});
}

/** §19 invariants checked on one audit record (independent of the decision code path). Returns the list of violations. */
export function invariantViolations(rec) {
  const v = []; if (!STATES.includes(rec.decision)) v.push('UNKNOWN_STATE'); if (rec.decision !== 'TRADE_ELIGIBLE' && !rec.reason) v.push('WAIT_WITHOUT_REASON');
  if (rec.decision === 'TRADE_ELIGIBLE') {
    if (rec.setup !== 'PRESENT') v.push('NO_SETUP'); if (rec.trigger === 'NONE') v.push('NO_TRIGGER'); if (rec.direction !== 'BUY' && rec.direction !== 'SELL') v.push('DIRECTION_UNCLEAR');
    if (rec.engine_action !== rec.direction) v.push('ENTRY_NOT_GENERATED_BY_ENGINE'); if (rec.location !== 'VALID') v.push('INVALID_LOCATION'); if (rec.sl !== 'VALID') v.push('INVALID_SL'); if (rec.rr !== 'VALID') v.push('INVALID_RR');
    if (!String(rec.risk).startsWith('ACCEPTED')) v.push('RISK_NOT_ACCEPTED'); if (rec.broker !== 'OK') v.push('BROKER_NOT_OK'); if (rec.conflict && rec.conflict.resolution === 'NONE') v.push('UNRESOLVED_CONFLICT'); if (!rec.valid_entry || !rec.entry_hash) v.push('NO_VALID_ENTRY');
  }
  if (String(rec.risk).startsWith('REJECTED') && rec.decision === 'WAIT_RISK_UNSAFE' && !rec.valid_entry) v.push('RISK_REJECTION_MARKED_INVALID_ENTRY');
  return v;
}
