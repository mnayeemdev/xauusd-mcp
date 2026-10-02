/**
 * V14 NO-EDGE TRADE GATE (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code; the gate is not an edge generator).
 * No setup, setup without trigger, trigger without direction, invalid location / SL / RR, entry quality, risk rejection (unresolved,
 * minimum lot, margin), stale data, broker rejection, safety breakers, strategy conflict, restart, duplicate prevention,
 * same-input same-decision, no-lookahead, risk firewall, forward-shadow adapter, invariants.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, PRODUCTION_BREAKERS, EXISTING_PRIORITY, fromReplayRow, fromShadowRecord, initGate, decideGate, applyClose, invariantViolations } from '../research/trade_gate_v14/scripts/gate.mjs';
import { entryFromRow, entryHash } from '../research/entry_risk_integration_v11/scripts/integrate.mjs';
import { assessRealLot } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V14 = join(ROOT, 'research', 'trade_gate_v14');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, currency_profit: 'USD', account_currency: 'USD', platform_tick_value: null });
const T0 = Date.UTC(2026, 0, 6, 9) / 1000;
// stage strings: one digit per model, order MC PB BO SR MR (0 none, 1 pattern, 2 setup, 3 trigger)
const sig = (o = {}) => ({ i: 1000, t: T0, act: 'BUY', mdl: 'BO', cs: 'BUY', wr: null, stB: '00300', stS: '00000', b15: 'BULLISH', trig: 'BOB', anc: 3998, g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 1.0, src: 'candidate_anchor' }, ...o });
const wait = (wr, o = {}) => sig({ act: 'WAIT', mdl: null, cs: null, wr, g: undefined, ...o });
const PRIMARY = { riskModel: 'UNRESOLVED', breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC };
const PCT = (r = 0.005, extra = {}) => ({ riskModel: { model: 'PCT', riskPct: r }, breakers: null, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC, ...extra });
const run = (row, cfg = PRIMARY, st = initGate()) => decideGate(st, fromReplayRow(row), cfg);

describe('WAIT states (every WAIT carries a deterministic reason)', () => {
  it('no setup: no pattern / pattern only', () => { assert.equal(run(wait('NO_ELIGIBLE_STRATEGY', { stB: '00000', stS: '00000', trig: '' })).record.decision, 'WAIT_NO_SETUP'); const r = run(wait('NO_ELIGIBLE_STRATEGY', { stB: '11000', stS: '01000', trig: '' })).record; assert.deepEqual([r.decision, r.reason], ['WAIT_NO_SETUP', 'PATTERN_ONLY']); });
  it('setup without trigger', () => { const r = run(wait('NO_ELIGIBLE_STRATEGY', { stB: '02200', trig: '' })).record; assert.deepEqual([r.decision, r.reason], ['WAIT_NO_TRIGGER', 'SETUP_WITHOUT_TRIGGER']); });
  it('trigger without direction: no eligible candidate, CHOP, HTF / ENTRY conflict', () => { for (const wr of ['NO_ELIGIBLE_STRATEGY', 'CHOP', 'HTF_CONFLICT', 'ENTRY_CONFLICT']) { const r = run(wait(wr, { trig: '' })).record; assert.deepEqual([r.decision, r.reason], ['WAIT_DIRECTION_UNCLEAR', wr]); } });
  it('invalid location / SL / RR and entry quality (engine rules, never repaired)', () => {
    assert.equal(run(wait('OVEREXTENDED')).record.decision, 'WAIT_INVALID_LOCATION'); assert.equal(run(wait('INVALID_GEOMETRY')).record.decision, 'WAIT_INVALID_SL');
    assert.equal(run(wait('RR_NOT_ACCEPTABLE')).record.decision, 'WAIT_INVALID_RR'); assert.equal(run(wait('VOLATILITY_INSUFFICIENT')).record.decision, 'WAIT_INVALID_RR'); assert.equal(run(wait('NO_GOOD_ENTRY')).record.decision, 'WAIT_ENTRY_QUALITY');
    assert.equal(run(sig({ anc: 3980 })).record.decision, 'WAIT_INVALID_LOCATION'); assert.equal(run(sig({ g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 0.3 } })).record.decision, 'WAIT_INVALID_SL'); assert.equal(run(sig({ g: { e: 4000, sl: 3995, tp2: 4008, rr: 1.6, ra: 1 } })).record.decision, 'WAIT_INVALID_RR');
  });
  it('stale data: engine stale, missing stages, late signal, out-of-order or duplicate bar', () => {
    assert.deepEqual([run(wait('DATA_UNAVAILABLE_STALE')).record.decision, run(wait('DATA_UNAVAILABLE_STALE')).record.reason], ['WAIT_STALE_DATA', 'DATA_UNAVAILABLE_STALE']);
    assert.equal(run(sig({ stB: undefined, stS: undefined })).record.reason, 'STAGES_UNAVAILABLE');
    const g1 = run(sig()); assert.equal(decideGate(g1.state, fromReplayRow(sig()), PRIMARY).record.reason, 'OUT_OF_ORDER_OR_DUPLICATE_BAR'); assert.equal(decideGate(g1.state, fromReplayRow(sig({ t: T0 - 300 })), PRIMARY).record.reason, 'OUT_OF_ORDER_OR_DUPLICATE_BAR');
    const live = fromShadowRecord({ symbol: 'XAUUSDm', timeframe: '5m', bar_time: T0, latency_sec: 900, engine_action: 'WAIT', stages: { BUY: '00300', SELL: '00000' }, bias: { direction: 'BULLISH' } }); assert.equal(decideGate(initGate(), live, PRIMARY).record.reason, 'SIGNAL_AGE_ABOVE_LIMIT');
  });
  it('unknown engine state fails closed', () => { const r = run(wait('SOMETHING_NEW')).record; assert.equal(r.decision, 'WAIT_SAFETY_BREAKER'); assert.match(r.reason, /UNKNOWN_ENGINE_STATE/); });
});

describe('risk firewall (valid entry + unsafe risk = VALID_ENTRY + RISK_REJECTED, never modified)', () => {
  it('risk percentage UNRESOLVED: every valid entry is RISK_REJECTED; nothing is eligible', () => { const r = run(sig()).record; assert.deepEqual([r.decision, r.reason, r.valid_entry, r.risk], ['WAIT_RISK_UNSAFE', 'RISK_PERCENTAGE_UNRESOLVED', true, 'REJECTED:RISK_PERCENTAGE_UNRESOLVED']); assert.equal(r.entry_hash, entryHash(entryFromRow(sig()))); });
  it('minimum lot rejection and margin rejection stay VALID_ENTRY', () => {
    const ml = run(sig(), PCT(0.0001)).record; assert.deepEqual([ml.decision, ml.reason, ml.valid_entry], ['WAIT_RISK_UNSAFE', 'RISK_BELOW_MIN_LOT', true]);
    const mg = run(sig(), PCT(0.005, { spec: { ...SPEC, leverage: 0.5 } })).record; assert.deepEqual([mg.decision, mg.reason, mg.valid_entry], ['WAIT_RISK_UNSAFE', 'MARGIN_ABOVE_CAP', true]);
  });
  it('risk accepted -> TRADE_ELIGIBLE with every invariant satisfied; the entry hash is unchanged', () => { const r = run(sig(), PCT()).record; assert.equal(r.decision, 'TRADE_ELIGIBLE'); assert.deepEqual(invariantViolations(r), []); assert.equal(r.entry_hash, entryHash(entryFromRow(sig()))); assert.equal(r.lots, 0.06); });
  it('broker rejection, broker order rules and unsafe broker data -> WAIT_BROKER_UNSAFE (no retry, no resize)', () => {
    assert.deepEqual([run(sig(), PCT(0.005, { faults: { brokerReject: 'TRADE_RETCODE_INVALID_STOPS' } })).record.decision, run(sig(), PCT(0.005, { faults: { brokerReject: 'X' } })).record.reason], ['WAIT_BROKER_UNSAFE', 'REJECTED_BY_BROKER']);
    assert.equal(run(sig(), PCT(0.005, { spec: { ...SPEC, stops_level_points: 1e9 } })).record.decision, 'WAIT_BROKER_UNSAFE'); assert.equal(run(sig(), PCT(0.005, { spec: { ...SPEC, volume_step: null } })).record.decision, 'WAIT_BROKER_UNSAFE');
    assert.equal(run(sig(), PCT(0.005, { maxEntryDriftUsd: 2, entryDriftUsd: 2.5 })).record.reason, 'ENTRY_DRIFT');
  });
  it('the CURRENT production model goes through the production margin veto', () => { const cfg = { riskModel: { model: 'CURRENT' }, breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC, assessCurrent: assessRealLot }; assert.equal(run(sig(), cfg).record.decision, 'TRADE_ELIGIBLE'); assert.equal(decideGate(initGate({ equity: 40 }), fromReplayRow(sig()), cfg).record.reason, 'CURRENT_MARGIN_SAFETY_VETO'); });
});

describe('safety breakers, exposure, conflict', () => {
  it('production consecutive-loss limit (REAL 2 per UTC day) and daily ceiling; reset on the next UTC day; kill switch; recorded news block', () => {
    assert.deepEqual(PRODUCTION_BREAKERS, { maxConsecutiveLosses: 2, maxTradesPerDay: 10 }); const cfg = PCT(0.005, { breakers: PRODUCTION_BREAKERS });
    let st = run(sig(), cfg).state; st = applyClose(st, { exitT: T0 + 900, exitBar: 1003, pnlUsd: -40, cfg }); st = decideGate(st, fromReplayRow(sig({ i: 1010, t: T0 + 3000, anc: 3999 })), cfg).state; st = applyClose(st, { exitT: T0 + 3600, exitBar: 1015, pnlUsd: -40, cfg });
    assert.equal(decideGate(st, fromReplayRow(sig({ i: 1030, t: T0 + 6000, anc: 3997 })), cfg).record.reason, 'CONSECUTIVE_LOSS_LIMIT'); assert.equal(decideGate(st, fromReplayRow(sig({ i: 1300, t: T0 + 86400, anc: 3996 })), cfg).record.decision, 'TRADE_ELIGIBLE');
    const full = { ...initGate(), daily: { day: new Date(T0 * 1000).toISOString().slice(0, 10), completed: 10, consecutive_losses: 0 } }; assert.equal(decideGate(full, fromReplayRow(sig()), cfg).record.reason, 'DAILY_TRADE_CEILING');
    assert.equal(run(sig(), { ...cfg, killSwitch: true }).record.reason, 'KILL_SWITCH');
    const rec = { symbol: 'XAUUSDm', timeframe: '5m', bar_time: T0, latency_sec: 10, engine_action: 'BUY', model: 'BO', candidate_side: 'BUY', stages: { BUY: '00300', SELL: '00000' }, bias: { direction: 'BULLISH' }, candidate: { entry: 4000, stop_loss: 3995, anchor: 3998, risk_atr: 1, rr_engine: 2, tp2_engine: 4010 }, safety: { block: { category: 'NEWS_BLOCK' } }, spread_usd: 0.24 };
    assert.deepEqual([decideGate(initGate(), fromShadowRecord(rec), PRIMARY).record.decision, decideGate(initGate(), fromShadowRecord(rec), PRIMARY).record.reason], ['WAIT_SAFETY_BREAKER', 'NEWS_BLOCK']);
  });
  it('single exposure: a valid entry while a position is open is RISK_REJECTED (never stacked)', () => { const cfg = PCT(); const a = run(sig(), cfg); const b = decideGate(a.state, fromReplayRow(sig({ i: 1002, t: T0 + 600, anc: 3999 })), cfg).record; assert.deepEqual([b.decision, b.reason, b.valid_entry], ['WAIT_RISK_UNSAFE', 'POSITION_OPEN_MAX_SIMULTANEOUS_1', true]); });
  it('strategy conflict: recorded; follows the existing priority chain when defined, WAIT_CONFLICT when no resolution is defined; never a new vote', () => {
    const row = sig({ stB: '00300', stS: '00003', trig: 'BOB,MRS' }); const a = run(row, PCT()).record; assert.equal(a.conflict.resolution, EXISTING_PRIORITY); assert.deepEqual(a.conflict.opposite, ['MRS']); assert.equal(a.decision, 'TRADE_ELIGIBLE');
    const b = run(row, { ...PCT(), conflictResolution: null }).record; assert.deepEqual([b.decision, b.reason], ['WAIT_CONFLICT', 'STRATEGY_CONFLICT_NO_DEFINED_RESOLUTION']);
  });
});

describe('determinism, restart, duplicates, no-lookahead, no forced entry', () => {
  it('same input + same state = same decision (1,000 repeats)', () => { const st = initGate(); const ref = JSON.stringify(decideGate(st, fromReplayRow(sig()), PCT())); for (let k = 0; k < 1000; k++) assert.equal(JSON.stringify(decideGate(st, fromReplayRow(sig()), PCT())), ref); });
  it('decideGate never mutates its inputs; a serialized state resumes identically (restart)', () => { const st = initGate(); const before = JSON.stringify(st); const out = decideGate(st, fromReplayRow(sig()), PCT()); assert.equal(JSON.stringify(st), before); const restored = JSON.parse(JSON.stringify(out.state)); const next = fromReplayRow(sig({ i: 1300, t: T0 + 90000, anc: 3995 })); assert.deepEqual(decideGate(restored, next, PCT()).record, decideGate(out.state, next, PCT()).record); });
  it('duplicate signal delivery is rejected (also after restart)', () => { const a = run(sig(), PCT()); const again = decideGate(JSON.parse(JSON.stringify(a.state)), fromReplayRow(sig()), PCT()).record; assert.equal(again.decision, 'WAIT_STALE_DATA'); assert.equal(again.reason, 'OUT_OF_ORDER_OR_DUPLICATE_BAR'); });
  it('no lookahead: a decision depends only on the current input and prior state (later inputs never change it)', () => { const rows = [wait('NO_ELIGIBLE_STRATEGY', { stB: '01000', trig: '' }), sig({ i: 1001, t: T0 + 300 }), wait('RR_NOT_ACCEPTABLE', { i: 1002, t: T0 + 600 })]; const go = (rs) => { let st = initGate(); return rs.map((r) => { const o = decideGate(st, fromReplayRow(r), PRIMARY); st = o.state; return o.record; }); }; const full = go(rows); const prefix = go(rows.slice(0, 2)); assert.deepEqual(prefix, full.slice(0, 2)); const corrupted = go([rows[0], rows[1], { ...rows[2], stB: '33333', act: 'SELL', mdl: 'MR', cs: 'SELL', wr: null }]); assert.deepEqual(corrupted.slice(0, 2), full.slice(0, 2)); });
  it('no forced entry or direction: the gate is never eligible when the engine waits, and never picks a side', () => { for (const wr of ['NO_ELIGIBLE_STRATEGY', 'CHOP', 'RR_NOT_ACCEPTABLE', 'NO_GOOD_ENTRY', 'OVEREXTENDED', 'HTF_CONFLICT']) { const r = run(wait(wr, { stB: '33333', stS: '33333', trig: 'MCB,PBS' }), PCT()).record; assert.notEqual(r.decision, 'TRADE_ELIGIBLE'); assert.ok(r.direction === 'N/A' || r.direction.startsWith('UNCLEAR')); } });
  it('engine signal without a verified trigger or outside the bias-aware triggers fails closed (discrepancy flagged)', () => { assert.equal(run(sig({ stB: '00200' }), PCT()).record.discrepancy, 'ENGINE_SIGNAL_WITHOUT_VERIFIED_TRIGGER'); assert.equal(run(sig({ trig: 'MCB' , stB: '30300' }), PCT()).record.discrepancy, 'ENGINE_SIGNAL_NOT_IN_BIAS_TRIGGERS'); });
  it('invariants catch any eligible record that is missing a precondition', () => { const ok = run(sig(), PCT()).record; assert.deepEqual(invariantViolations(ok), []); assert.ok(invariantViolations({ ...ok, trigger: 'NONE' }).includes('NO_TRIGGER')); assert.ok(invariantViolations({ ...ok, engine_action: 'WAIT' }).includes('ENTRY_NOT_GENERATED_BY_ENGINE')); assert.ok(invariantViolations({ ...ok, decision: 'WAIT_NO_SETUP', reason: null }).includes('WAIT_WITHOUT_REASON')); assert.equal(STATES.length, 13); });
});

describe('forward-shadow adapter and research boundaries', () => {
  it('a live record without quote age fails closed under a risk model (missing field), but is fully determined under the unresolved risk model', () => {
    const rec = { symbol: 'XAUUSDm', timeframe: '5m', bar_time: T0, latency_sec: 30, engine_action: 'BUY', model: 'BO', candidate_side: 'BUY', stages: { BUY: '00300', SELL: '00000' }, bias: { direction: 'BULLISH' }, candidate: { entry: 4000, stop_loss: 3995, anchor: 3998, risk_atr: 1, rr_engine: 2, tp2_engine: 4010 }, safety: { block: null }, spread_usd: 0.24 };
    assert.equal(decideGate(initGate(), fromShadowRecord(rec), PRIMARY).record.reason, 'RISK_PERCENTAGE_UNRESOLVED'); assert.equal(decideGate(initGate(), fromShadowRecord(rec), PCT()).record.reason, 'DATA_STALE_QUOTE');
    assert.equal(decideGate(initGate(), fromShadowRecord({ symbol: 'XAUUSDm', timeframe: '5m', bar_time: T0, engine_action: 'WAIT', wait_category: 'DATA_UNAVAILABLE' }), PRIMARY).record.decision, 'WAIT_STALE_DATA');
  });
  it('no execution code, no new indicators / filters / scores', () => { for (const f of ['gate.mjs', 'v14_study.mjs', 'write_reports.mjs']) { const p = join(V14, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'watcher.js', 'child_process', 'REAL_ACCOUNT', 'REAL_ARM', 'capitalHarvest = true']) assert.ok(!s.includes(bad), `${f}: ${bad}`); } });
  it('replay results (local, skipped when absent): no failure condition, V11 parity, zero eligible under PRIMARY, status consistent', { skip: !existsSync(join(V14, 'results', 'v14_results.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'); const r = JSON.parse(readFileSync(join(V14, 'results', 'v14_results.json'), 'utf8')); assert.equal(r.prereg_sha, sha(join(V14, 'V14_PREREGISTRATION.md'))); assert.equal(r.gate_sha, sha(join(V14, 'scripts', 'gate.mjs')));
    for (const v of Object.values(r.decision.failure_conditions)) assert.ok(v === false || v === 0); for (const S of ['DEV', 'HOLD']) { assert.equal(r.splits[S].v11_parity.same, true); assert.equal(r.splits[S].configs.PRIMARY.trade_eligible, 0); assert.equal(r.splits[S].configs.PRIMARY.risk_rejected_valid_entries, r.splits[S].configs.PRIMARY.valid_entries); }
    assert.ok(['GATE_VALIDATED', 'GATE_PARTIALLY_VALIDATED', 'GATE_INCONCLUSIVE', 'GATE_FAILED'].includes(r.decision.TRADE_GATE_STATUS));
  });
});
