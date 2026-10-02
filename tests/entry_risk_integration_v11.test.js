/**
 * V11 ENTRY + RISK INTEGRATION (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code).
 * Entry preservation; risk can never modify entry validity; valid entry + risk rejection stays visible; structural SL and RR 1.70
 * preserved; percentage risk, sizing, broker rounding, minimum lot, actual risk (independent tick-value path); margin; exposure;
 * cost / slippage / swap / gap; restart; duplicate delivery; broker rejection; missing SL; stale data; every fail-closed path;
 * production limits read from production; research boundaries; frozen results.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RR, ENGINE_LIMITS, SAFETY_LIMITS, entryFromRow, entryHash, target170, checkEntryGeometry, loadPlatformSpec, specMissing, resolveTickValue, lossPerLotViaTicks, validateBrokerOrder, integrateEntry, deepFreeze } from '../research/entry_risk_integration_v11/scripts/integrate.mjs';
import { initState, openPosition, serialize, deserialize, lossPerLot } from '../research/risk_capital_v10/scripts/risk.mjs';
import { simulateTrade, features, SWAP_PER_NIGHT } from '../research/capital_harvest_v9/scripts/harvest.mjs';
import { REAL_DEFAULTS, assessRealLot } from '../src/engine/mt5RealPolicy.js';
import { INTRADAY_PARAMS } from '../src/engine/intraday/params.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V11 = join(ROOT, 'research', 'entry_risk_integration_v11');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, margin_currency: 'XAU', currency_profit: 'USD', account_currency: 'USD', platform_tick_value: null, tick_size: 0.001, tick_value_per_lot: 0.1 });
const T0 = Date.UTC(2026, 0, 6, 9) / 1000;
const row = (over = {}) => ({ i: 1000, t: T0, act: 'BUY', mdl: 'BO', cs: 'BUY', anc: 3998, trig: 'BOB', g: { e: 4000, sl: 3995, tp1: 4005, tp2: 4010, rr: 2, ra: 1.0 }, ...over });
const E = (over) => entryFromRow(row(over));
const PCT = (r, extra = {}) => ({ model: 'PCT', riskPct: r, marginCapPct: 0.5, dailyLimitPct: null, pauseAfter: null, weeklyLimitPct: null, slipAllowance: 0.10, ...extra });
const CUR = { model: 'CURRENT', marginCapPct: 0.5, slipAllowance: 0.10, assessCurrent: assessRealLot };
const ctxOf = (over = {}) => ({ equity: 10000, spread: 0.24, quoteAgeSec: 0, signalAgeSec: 0, nowT: T0 + 300, spec: SPEC, cfg: PCT(0.005), ...over });
const run = (e, over, st = initState(over?.equity ?? 10000)) => integrateEntry(st, e, ctxOf(over));

describe('entry validity is upstream and immutable', () => {
  it('the entry record is deep-frozen; any mutation throws; the hash covers every entry field', () => {
    const e = E(); assert.ok(Object.isFrozen(e)); assert.throws(() => { e.sl = 3990; }, TypeError); assert.throws(() => { e.side = 'SELL'; }, TypeError);
    for (const k of ['side', 'entry', 'sl', 'model', 'trigger', 'anchor']) { const f = { ...row() }; if (k === 'entry' || k === 'sl') f.g = { ...f.g, [k === 'entry' ? 'e' : 'sl']: f.g[k === 'entry' ? 'e' : 'sl'] + 1 }; else if (k === 'side') f.act = 'SELL'; else if (k === 'model') f.mdl = 'PB'; else if (k === 'trigger') f.trig = 'X'; else f.anc = 1; assert.notEqual(entryHash(entryFromRow(f)), entryHash(E()), k); }
  });
  it('risk can never modify entry validity: across 400 risk / account / spec scenarios the entry hash is unchanged and valid_entry stays true', () => {
    const e = E(); const h = entryHash(e); let n = 0;
    for (const r of [0.0001, 0.001, 0.0025, 0.005, 0.01]) for (const eq of [50, 250, 1000, 10000, 1e6]) for (const lev of [1, 50, 200, 2000]) for (const sp of [0, 0.24, 0.6, 0.9]) { const out = run(e, { equity: eq, cfg: PCT(r), spec: { ...SPEC, leverage: lev }, spread: sp }); assert.equal(out.record.entry_hash_after, h); assert.equal(out.record.valid_entry, true); assert.equal(out.record.entry_id, e.id); n++; }
    assert.equal(n, 400); assert.equal(entryHash(e), h);
    const src = readFileSync(join(V11, 'scripts', 'integrate.mjs'), 'utf8'); assert.ok(!/\b(entry|e)\.(sl|entry|side|model|i|t|anchor|trigger)\s*=[^=]/.test(src), 'no assignment to an entry field');
  });
  it('a valid entry that risk cannot support is REJECTED and stays visible as VALID_ENTRY + RISK_REJECTED (never altered to fit)', () => {
    const out = run(E(), { equity: 100, cfg: PCT(0.0025) }); assert.equal(out.record.valid_entry, true); assert.equal(out.record.outcome, 'RISK_REJECTED'); assert.equal(out.record.reason, 'RISK_BELOW_MIN_LOT'); assert.ok(out.record.min_lot_risk_pct > 0.0025);
    assert.equal(out.record.entry_hash_after, entryHash(E())); assert.ok(!('lots' in out.record));
  });
  it('structural SL preserved; RR fixed at 1.70; the broker SL is the hard fail-safe 1.5 R + spread outside the structural SL', () => {
    const e = E(); const out = run(e); assert.equal(out.record.outcome, 'RISK_ACCEPTED'); assert.equal(e.sl, 3995); assert.equal(RR, 1.70);
    assert.ok(Math.abs(out.record.target_170 - (4000 + 1.7 * 5)) < 1e-9); assert.ok(Math.abs(out.record.broker_sl - (4000 - (7.5 + 0.24))) < 1e-9); assert.ok(out.record.broker_sl < e.sl);
    const s = E({ act: 'SELL', cs: 'SELL', anc: 4002, g: { e: 4000, sl: 4005, tp1: 3995, tp2: 3990, rr: 2, ra: 1 } }); assert.ok(Math.abs(target170(s) - (4000 - 8.5)) < 1e-9); assert.equal(run(s).record.outcome, 'RISK_ACCEPTED');
  });
  it('entry geometry is verified against the engine rules (never repaired); a defect fails closed with the entry unchanged', () => {
    assert.deepEqual(checkEntryGeometry(E()), { ok: true, defects: [] });
    assert.ok(checkEntryGeometry(E({ g: { e: 4000, sl: 4005, tp2: 4010, rr: 2, ra: 1 } })).defects.includes('SL_WRONG_SIDE'));
    assert.ok(checkEntryGeometry(E({ g: { e: 4000, sl: 3995, tp2: 4008, rr: 1.6, ra: 1 } })).defects.includes('ENGINE_RR_BELOW_MIN'));
    assert.ok(checkEntryGeometry(E({ g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 0.4 } })).defects.includes('R_BELOW_MIN_ATR'));
    assert.ok(checkEntryGeometry(E({ cs: 'SELL' })).defects.includes('SIDE_MISMATCH')); assert.ok(checkEntryGeometry(E({ anc: 3980 })).defects.includes('OVEREXTENDED'));
    const bad = E({ g: { e: 4000, sl: 3995, tp2: 4008, rr: 1.6, ra: 1 } }); const out = run(bad); assert.equal(out.record.outcome, 'FAIL_CLOSED'); assert.equal(out.record.reason, 'ENTRY_GEOMETRY_DEFECT'); assert.equal(out.record.entry_hash_after, entryHash(bad));
    assert.deepEqual(ENGINE_LIMITS, { minRiskAtr: INTRADAY_PARAMS.minRiskAtr, overextendAtrMult: INTRADAY_PARAMS.overextendAtrMult, minRR: INTRADAY_PARAMS.minRR });
  });
});

describe('risk translation, broker rules, margin, exposure', () => {
  it('percentage risk -> size rounded down -> actual risk <= approved; the independent tick-value path agrees exactly', () => {
    const out = run(E()); const r = out.record; assert.equal(r.lots, 0.06); assert.ok(Math.abs(r.planned_risk_usd - 47.04) < 1e-9); assert.equal(r.approved_cash_usd, 50); assert.ok(r.planned_risk_usd <= r.approved_cash_usd);
    const viaTicks = lossPerLotViaTicks({ R: 5, spread: 0.24, slipAllowance: 0.10, spec: SPEC, tickValue: 0.1 }); const viaContract = lossPerLot({ entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC }); assert.ok(Math.abs(viaTicks - viaContract) < 1e-9);
    for (const eq of [2000, 7777, 25000, 99999]) { const x = run(E(), { equity: eq }).record; assert.ok(Math.abs(x.lots / 0.01 - Math.round(x.lots / 0.01)) < 1e-9); assert.ok(x.planned_risk_usd <= eq * 0.005 + 1e-9); }
  });
  it('broker validation: step multiple, min / max, SL side, stops and freeze level; never resizes', () => {
    assert.equal(validateBrokerOrder({ lots: 0.06, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: SPEC }).ok, true);
    assert.ok(validateBrokerOrder({ lots: 0.065, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: SPEC }).reasons.includes('LOT_NOT_STEP_MULTIPLE'));
    assert.ok(validateBrokerOrder({ lots: 0.005, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: SPEC }).reasons.includes('LOT_BELOW_MIN'));
    assert.ok(validateBrokerOrder({ lots: 300, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: SPEC }).reasons.includes('LOT_ABOVE_MAX'));
    assert.ok(validateBrokerOrder({ lots: 0.06, side: 'SELL', entry: 4000, sl: 3995, spread: 0.24, spec: SPEC }).reasons.includes('STRUCTURAL_SL_WRONG_SIDE'));
    assert.ok(validateBrokerOrder({ lots: 0.06, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: { ...SPEC, stops_level_points: 6000 } }).reasons.includes('STRUCTURAL_SL_INSIDE_STOPS_LEVEL'));
    assert.ok(validateBrokerOrder({ lots: 0.06, side: 'BUY', entry: 4000, sl: 3995, spread: 0.24, spec: { ...SPEC, freeze_level_points: 5000 } }).reasons.includes('STRUCTURAL_SL_INSIDE_FREEZE_LEVEL'));
    const rej = run(E(), { spec: { ...SPEC, stops_level_points: 1e9 } }).record; assert.equal(rej.outcome, 'RISK_REJECTED'); assert.equal(rej.reason, 'BROKER_STRUCTURAL_SL_INSIDE_STOPS_LEVEL'); assert.ok(!('lots' in rej));
  });
  it('margin insufficient -> RISK_REJECTED; margin availability never increases the size', () => {
    const lev = (0.01 * 100 * 4000) / (2 * 0.5 * 10000); const r = run(E(), { spec: { ...SPEC, leverage: lev } }).record; assert.equal(r.outcome, 'RISK_REJECTED'); assert.equal(r.reason, 'MARGIN_ABOVE_CAP');
    assert.equal(run(E(), { spec: { ...SPEC, leverage: 2000 } }).record.lots, run(E()).record.lots);
  });
  it('single exposure: an entry arriving while a position is open is EXPOSURE_BLOCKED and still recorded', () => {
    const a = run(E()); const st = openPosition(a.state, { id: 'x' }, { lots: a.record.lots, actual_risk: a.record.planned_risk_usd }); const b = integrateEntry(st, E({ i: 1001 }), ctxOf()); assert.equal(b.record.outcome, 'EXPOSURE_BLOCKED'); assert.equal(b.record.valid_entry, true);
  });
  it('CURRENT model: fixed 0.01 lot through the production margin veto; planned risk cross-checked independently', () => {
    const r = run(E(), { cfg: CUR }).record; assert.equal(r.outcome, 'RISK_ACCEPTED'); assert.equal(r.lots, 0.01); assert.ok(Math.abs(r.planned_risk_usd - 7.84) < 1e-9);
    assert.equal(run(E(), { equity: 40, cfg: CUR }).record.reason, 'CURRENT_MARGIN_SAFETY_VETO');
  });
});

describe('fail closed (no trade, entry unchanged)', () => {
  const cases = [
    ['equity unavailable', { equity: null }, 'EQUITY_UNAVAILABLE'], ['equity zero', { equity: 0 }, 'EQUITY_UNAVAILABLE'], ['equity NaN', { equity: NaN }, 'EQUITY_UNAVAILABLE'],
    ['broker spec unavailable', { spec: null }, 'BROKER_SPEC_UNAVAILABLE'], ['spec field missing', { spec: { ...SPEC, volume_step: undefined } }, 'BROKER_SPEC_UNAVAILABLE'], ['spec contract zero', { spec: { ...SPEC, contract_size: 0 } }, 'BROKER_SPEC_UNAVAILABLE'],
    ['tick value unavailable', { spec: { ...SPEC, currency_profit: 'EUR' } }, 'TICK_VALUE_UNAVAILABLE'], ['tick value inconsistent', { spec: { ...SPEC, platform_tick_value: 0.2 } }, 'TICK_VALUE_INCONSISTENT'],
    ['quote stale', { quoteAgeSec: 91 }, 'DATA_STALE_QUOTE'], ['quote age unknown', { quoteAgeSec: undefined }, 'DATA_STALE_QUOTE'], ['signal stale', { signalAgeSec: 601 }, 'DATA_STALE_SIGNAL'],
    ['spread above limit', { spread: 0.61 }, 'SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT'], ['spread unknown', { spread: NaN }, 'SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT'],
    ['position size invalid', { faults: { tamperLots: true } }, 'POSITION_SIZE_INVALID'], ['risk calculation inconsistent', { faults: { tamperRisk: true } }, 'RISK_CALCULATION_INCONSISTENT'],
  ];
  for (const [name, over, reason] of cases) it(name, () => { const e = E(); const out = run(e, over); assert.equal(out.record.outcome, 'FAIL_CLOSED'); assert.equal(out.record.reason, reason); assert.ok(!('lots' in out.record)); assert.equal(out.record.entry_hash_after, entryHash(e)); });
  it('limits at the boundary pass (quote 90 s, signal 600 s, spread 0.60)', () => { assert.equal(run(E(), { quoteAgeSec: 90, signalAgeSec: 600, spread: 0.6 }).record.outcome, 'RISK_ACCEPTED'); });
  it('missing SL in the delivered record fails closed (SL_UNAVAILABLE)', () => { const out = run(deepFreeze({ ...E(), sl: null })); assert.equal(out.record.outcome, 'FAIL_CLOSED'); assert.equal(out.record.reason, 'SL_UNAVAILABLE'); });
  it('minimum lot exceeds risk -> RISK_REJECTED; broker rejection -> recorded, no retry, no resize, no position', () => {
    assert.equal(run(E(), { faults: { riskPct: 1e-6 } }).record.reason, 'RISK_BELOW_MIN_LOT');
    const b = run(E(), { faults: { brokerReject: 'TRADE_RETCODE_INVALID_STOPS' } }); assert.equal(b.record.reason, 'REJECTED_BY_BROKER'); assert.equal(b.record.retry, false); assert.equal(b.record.size_change, false); assert.equal(b.state.open, null);
    assert.equal(integrateEntry(b.state, E(), ctxOf()).record.outcome, 'DUPLICATE_DELIVERY');
  });
  it('production safety limits are read from production (not assumed)', () => { assert.deepEqual(SAFETY_LIMITS, { maxQuoteAgeSec: REAL_DEFAULTS.maxQuoteAgeSec, maxSignalAgeSec: REAL_DEFAULTS.maxSignalAgeSec, maxSpreadUsd: REAL_DEFAULTS.maxSpreadUsd }); });
});

describe('platform spec and tick value', () => {
  it('reads profit / account currency from the platform record; derives tick value only for same-currency; cross-checks a platform value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v11spec-')); const p = join(dir, 'log.jsonl');
    writeFileSync(p, JSON.stringify({ timestamp: '2026-10-02T00:00:00Z', snapshot: { symbol: { name: 'XAUUSDm', trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, trade_stops_level: 0, trade_freeze_level: 0, currency_profit: 'USD' }, account: { leverage: 200, margin_so_call: 60, currency: 'USD', trade_mode_is_real: false } } }) + '\n');
    const s = loadPlatformSpec(p); assert.equal(s.currency_profit, 'USD'); assert.equal(s.account_currency, 'USD'); assert.deepEqual(specMissing(s), []); assert.deepEqual(resolveTickValue(s), { ok: true, value: 0.1, source: 'derived_same_currency' });
    assert.equal(resolveTickValue({ ...s, platform_tick_value: 0.1 }).source, 'platform'); assert.equal(resolveTickValue({ ...s, platform_tick_value: 0.5 }).reason, 'TICK_VALUE_INCONSISTENT'); assert.equal(resolveTickValue({ ...s, account_currency: 'EUR' }).reason, 'TICK_VALUE_UNAVAILABLE');
    assert.throws(() => loadPlatformSpec(join(dir, 'none.jsonl')));
  });
});

describe('restart, duplicate delivery, costs (slippage, swap, gap)', () => {
  it('restart: a serialized controller state reproduces the same decision; a duplicate delivery is rejected, also after restart', () => {
    const a = run(E()); const restored = deserialize(serialize(a.state)); const e2 = E({ i: 1100, t: T0 + 3600 });
    assert.deepEqual(integrateEntry(a.state, e2, ctxOf({ nowT: T0 + 3900 })).record, integrateEntry(restored, e2, ctxOf({ nowT: T0 + 3900 })).record);
    assert.equal(integrateEntry(a.state, E(), ctxOf()).record.outcome, 'DUPLICATE_DELIVERY'); assert.equal(integrateEntry(restored, E(), ctxOf()).record.outcome, 'DUPLICATE_DELIVERY');
  });
  it('a BUY held across the daily rollover is charged the swap; the planned worst case excludes it (realized can exceed planned)', () => {
    const start = Date.UTC(2026, 0, 6, 20, 0) / 1000; const bars = Array.from({ length: 80 }, (_, k) => { const c = 100 + Math.sin(k) * 0.05; return { time: start + 300 * k, open: c, high: c + 0.1, low: c - 0.1, close: c }; });
    const f = features(bars); const i = 40; const t = { i, side: 'BUY', entry: bars[i].close, sl: bars[i].close - 1 };
    for (let k = i + 1; k < 80; k++) { bars[k] = { ...bars[k], low: k === 79 ? bars[i].close - 3 : bars[k].low }; }
    const o = simulateTrade(bars, f, t, { kind: 'BASELINE' }, { spread: 0.24, slip: 0.10 }); assert.equal(o.exit, 'BROKER_SL'); const planned = 1.5 * 1 + 0.24 + 0.10;
    assert.ok(Math.abs(-o.pnl_usd - (planned + SWAP_PER_NIGHT)) < 1e-6, `loss ${-o.pnl_usd} = planned ${planned} + one night swap`);
  });
  it('slippage above the allowance raises the realized loss one-for-one at the hard stop', () => {
    const start = Date.UTC(2026, 0, 6, 9) / 1000; const bars = Array.from({ length: 60 }, (_, k) => ({ time: start + 300 * k, open: 100, high: 100.1, low: k === 59 ? 97 : 99.9, close: 100 })); const f = features(bars); const t = { i: 40, side: 'BUY', entry: 100, sl: 99 };
    const n = simulateTrade(bars, f, t, { kind: 'BASELINE' }, { spread: 0.24, slip: 0.10 }); const s = simulateTrade(bars, f, t, { kind: 'BASELINE' }, { spread: 0.24, slip: 0.60 }); assert.ok(Math.abs((n.pnl_usd - s.pnl_usd) - 0.5) < 1e-9);
  });
});

describe('research boundaries and frozen results', () => {
  it('no execution code; production imported only for limits, params and the pure CURRENT veto; no credential reference', () => {
    for (const f of ['integrate.mjs', 'v11_study.mjs', 'write_reports.mjs']) { const p = join(V11, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8');
      for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'watcher.js', 'child_process', 'REAL_ACCOUNT', 'REAL_ARM', 'login', 'capitalHarvest = true', 'AUTO_SCALING = ON']) assert.ok(!s.includes(bad), `${f}: ${bad}`); }
  });
  it('frozen study (local, skipped when absent): hashes, identity, entry preservation, parity, fail-closed, decision consistent', { skip: !existsSync(join(V11, 'results', 'v11_results_FULL.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'); assert.equal(sha(join(V11, 'V11_PREREGISTRATION.md')), readFileSync(join(V11, 'V11_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]);
    const r = JSON.parse(readFileSync(join(V11, 'results', 'v11_results_FULL.json'), 'utf8')); assert.equal(r.freeze.integrate_sha, sha(join(V11, 'scripts', 'integrate.mjs'))); assert.equal(r.freeze.study_sha, sha(join(V11, 'scripts', 'v11_study.mjs')));
    const v8 = JSON.parse(readFileSync(join(ROOT, 'research', 'core_pattern_audit_v8', 'results', 'v8_results_FULL.json'), 'utf8'));
    for (const S of ['DEV', 'HOLD']) { const d = r.splits[S]; assert.equal(d.geometry.ok, d.entries); assert.equal(d.v10_parity.all_same, true); assert.equal(d.entry_only.normal.n, v8.variants.ALL[S].fixed_170r.n); assert.ok(Math.abs(d.entry_only.normal.expectancy_r - v8.variants.ALL[S].fixed_170r.expectancy_r) < 0.001);
      for (const g of Object.values(d.grid)) for (const [m, c] of Object.entries(g)) for (const x of Object.values(c)) { assert.equal(x.identity_ok, true); assert.equal(x.entry_hash_mismatches, 0); assert.equal(x.broker_invalid_accepted, 0); if (m.startsWith('PCT_')) assert.equal(x.pct_above_approved, 0); } }
    assert.equal(r.integrity.fault_injection.faults_accepted, 0); assert.equal(r.integrity.replay_deterministic, true); assert.equal(r.integrity.restart_equals_uninterrupted, true); assert.equal(r.integrity.duplicate_delivery.ok, true);
    assert.ok(r.integrity.fault_injection_prereg_harness.accepted_details.every((x) => x.margin_rule_satisfied), 'trades accepted under the pre-registered leverage-1 injection did satisfy the margin rule');
    assert.ok(['INTEGRATION_VALIDATED', 'INTEGRATION_PARTIALLY_VALIDATED', 'INTEGRATION_INCONCLUSIVE', 'INTEGRATION_FAILED'].includes(r.decision.INTEGRATION_STATUS)); assert.notEqual(r.decision.INTEGRATION_STATUS, 'PROFITABLE');
    if (r.decision.supported_risk_percentage === 'UNRESOLVED') assert.notEqual(r.decision.INTEGRATION_STATUS, 'INTEGRATION_VALIDATED');
  });
});
