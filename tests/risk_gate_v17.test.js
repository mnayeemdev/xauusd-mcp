/**
 * V17 RISK GATE HARDENING (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code).
 * normal risk, minimum / maximum lot, lot step, broker rounding, structural SL, margin, existing exposure, commission, swap,
 * normal / moderate / severe slippage, normal / moderate / severe gap, missing broker data, missing / stale / invalid quote,
 * restart, duplicate prevention, replay, no-lookahead, fail-closed, entry firewall, PRIMARY unresolved, no loss-based sizing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sizePosition, checkVolume, validateBrokerData, swapRates, rolloverCharges, boundaryCharges, decideRisk, settleRisk, initRiskState, realizedComponents, classifyExceedance, exposurePerOz, specFromCapture, RULES, RISK_CANDIDATES, REJECTS, RR } from '../research/risk_gate_v17/scripts/riskgate.mjs';
import { checkTiming } from '../research/execution_timing_v16/scripts/timing.mjs';
import { scenario } from '../research/execution_timing_v16/scripts/scenarios.mjs';
import { REAL_DEFAULTS } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V17 = join(ROOT, 'research', 'risk_gate_v17');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, tick_size: 0.001, tick_value_per_lot: 0.1, point: 0.001, digits: 3, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, currency_profit: 'USD', swap_mode: 1, swap_long_points: -513.2, swap_short_points: 0, swap_rollover3days: 3 });
const base = (o = {}) => ({ equity: 10_000, riskPct: 0.005, side: 'SELL', execPrice: 4134.85, entry: 4134.85, sl: 4139.35, spread: 0.24, spec: SPEC, basis: 'PLANNED', ...o });
const sig = (o = {}) => ({ id: '100|SELL', i: 100, t: 1790950000, side: 'SELL', model: 'BO', entry: 4134.85, sl: 4139.35, anchor: 4136, execPrice: 4134.85, spread: 0.24, quote_ok: true, ...o });

describe('position sizing (owner §4): equity -> risk % -> cash -> price -> SL -> size -> rounding -> actual exposure', () => {
  it('normal risk: size rounded DOWN to the step; actual exposure recalculated after rounding and never above the cash risk', () => {
    const z = sizePosition(base()); assert.ok(z.ok); const perOz = exposurePerOz({ R: 4.5, spread: 0.24 }); assert.ok(Math.abs(z.exposure_per_oz - perOz) < 1e-9); assert.ok(Math.abs(perOz - (1.5 * 4.5 + 0.24 + 0.10)) < 1e-9);
    const raw = 50 / (perOz * 100); assert.ok(Math.abs(z.lots_raw - raw) < 1e-9); assert.equal(z.lots, Math.round(Math.floor(raw / 0.01 + 1e-9) * 0.01 * 1e6) / 1e6);
    assert.ok(Math.abs(z.actual_stop_exposure - z.lots * perOz * 100) < 1e-9); assert.ok(z.actual_stop_exposure <= z.cash_risk); assert.ok(z.lots <= z.lots_raw); assert.ok(Math.abs(z.rr - RR) < 1e-9);
  });
  it('deterministic: the same inputs give the same size and record', () => { assert.equal(JSON.stringify(sizePosition(base())), JSON.stringify(sizePosition(base()))); });
  it('research risk % are comparison scenarios only (0.10 / 0.25 / 0.50 / 1.00)', () => { assert.deepEqual([...RISK_CANDIDATES], [0.001, 0.0025, 0.005, 0.01]); });
  it('minimum lot: rejected when the minimum lot would exceed the risk; never rounded up, SL and entry untouched', () => {
    const z = sizePosition(base({ equity: 250, riskPct: 0.001 })); assert.equal(z.ok, false); assert.equal(z.reason, 'RISK_REJECTED_MINIMUM_LOT'); assert.ok(z.min_lot_risk_pct > 0.001); assert.ok(z.lots_raw < 0.01);
  });
  it('maximum lot: rejected (RISK_REJECTED_BROKER_LIMIT); the size is never silently capped', () => { const z = sizePosition(base({ equity: 1e9, riskPct: 0.01, sl: 4135.35 })); assert.equal(z.reason, 'RISK_REJECTED_BROKER_LIMIT'); assert.ok(z.lots > 200); });
  it('lot step: an off-grid volume is RISK_REJECTED_INVALID_SIZE; a broker step / minimum mismatch is broker-data invalid', () => {
    assert.equal(checkVolume(0.015, SPEC), 'RISK_REJECTED_INVALID_SIZE'); assert.equal(checkVolume(0.02, SPEC), null); assert.equal(checkVolume(0.005, SPEC), 'RISK_REJECTED_MINIMUM_LOT'); assert.equal(checkVolume(201, SPEC), 'RISK_REJECTED_BROKER_LIMIT'); assert.equal(checkVolume(NaN, SPEC), 'RISK_REJECTED_INVALID_SIZE');
    assert.equal(validateBrokerData({ ...SPEC, volume_min: 0.015 }).ok, false); assert.equal(sizePosition(base({ spec: { ...SPEC, volume_step: 0 } })).reason, 'RISK_REJECTED_BROKER_DATA');
  });
  it('broker rounding: across many sizes the rounded exposure is never above the approved cash risk (no BROKER_ROUNDING_EXCEEDANCE)', () => {
    for (let eq = 1000; eq <= 50_000; eq += 997) for (const rp of RISK_CANDIDATES) { const z = sizePosition(base({ equity: eq, riskPct: rp })); if (!z.ok) { assert.equal(z.reason, 'RISK_REJECTED_MINIMUM_LOT'); continue; } assert.ok(z.actual_stop_exposure <= z.cash_risk + 1e-9); assert.equal(checkVolume(z.lots, SPEC), null); }
  });
});

describe('structural SL, RR, entry firewall, PRIMARY', () => {
  it('structural SL is an input only: never widened, tightened or moved; the hard broker stop = fill -/+ (1.5 x structural distance + spread)', () => {
    const z = sizePosition(base()); assert.equal(z.structural_sl, 4139.35); assert.ok(Math.abs(z.broker_sl - (4134.85 + 1.5 * 4.5 + 0.24)) < 1e-9); assert.equal(RULES.structuralMultiple, 1.5);
    assert.equal(sizePosition(base({ sl: 4130 })).reason, 'RISK_REJECTED_SL_INVALID'); assert.equal(sizePosition(base({ sl: null })).reason, 'RISK_REJECTED_SL_INVALID'); assert.equal(sizePosition(base({ side: 'BUY', sl: 4140 })).reason, 'RISK_REJECTED_SL_INVALID');
  });
  it('risk never modifies the entry: the signal is unchanged and its hash recorded; a rejection keeps VALID_ENTRY', () => {
    const s = sig(); const copy = JSON.stringify(s); const d = decideRisk(initRiskState(250), s, { riskPct: 0.001, spec: SPEC }); assert.equal(JSON.stringify(s), copy); assert.equal(d.decision.decision, 'RISK_REJECTED_MINIMUM_LOT'); assert.equal(d.decision.valid_entry, true); assert.match(d.decision.entry_hash, /^[0-9a-f]{64}$/);
  });
  it('PRIMARY (risk % unresolved): every valid entry is VALID_ENTRY + RISK_PERCENTAGE_UNRESOLVED, never accepted', () => { const d = decideRisk(initRiskState(10_000), sig(), { riskPct: 'UNRESOLVED', spec: SPEC }); assert.equal(d.decision.decision, 'RISK_PERCENTAGE_UNRESOLVED'); assert.equal(d.decision.valid_entry, true); assert.equal(d.state.open, null); });
});

describe('margin, exposure, duplicates, breakers, no loss-based sizing', () => {
  it('margin: required = lots x contract x price / leverage; insufficient / above cap / low level after loss -> MARGIN_REJECTED', () => {
    const z = sizePosition(base()); assert.ok(Math.abs(z.margin_required - (z.lots * 100 * 4134.85) / 200) < 1e-9);
    assert.equal(sizePosition(base({ spec: { ...SPEC, leverage: 1 } })).reason, 'MARGIN_REJECTED'); const lowLev = sizePosition(base({ spec: { ...SPEC, leverage: 5 } })); assert.equal(lowLev.reason, 'MARGIN_REJECTED'); assert.ok(['MARGIN_ABOVE_CAP', 'MARGIN_INSUFFICIENT', 'MARGIN_LEVEL_AFTER_LOSS_TOO_LOW'].includes(lowLev.margin_reason));
  });
  it('existing exposure: MAX_SIMULTANEOUS_TRADES = 1 (a second signal while a position is open is rejected)', () => { let s = initRiskState(10_000); s = decideRisk(s, sig(), { riskPct: 0.005, spec: SPEC }).state; assert.ok(s.open); assert.equal(decideRisk(s, sig({ id: '101|SELL', i: 101 }), { riskPct: 0.005, spec: SPEC }).decision.decision, 'RISK_REJECTED_EXPOSURE'); assert.equal(RULES.maxSimultaneous, 1); });
  it('duplicate prevention: the same signal id is decided once', () => { let s = initRiskState(10_000); s = decideRisk(s, sig(), { riskPct: 'UNRESOLVED', spec: SPEC }).state; assert.equal(decideRisk(s, sig(), { riskPct: 0.005, spec: SPEC }).decision.decision, 'RISK_REJECTED_DUPLICATE'); });
  it('no martingale / recovery sizing: after a loss the next cash risk is the same % of the (lower) equity', () => {
    let s = initRiskState(10_000); const a = decideRisk(s, sig(), { riskPct: 0.005, spec: SPEC }); s = settleRisk(a.state, { pnlUsd: -48, exitT: 1790950600, exitBar: 102 });
    const b = decideRisk(s, sig({ id: '200|BUY', i: 200, side: 'BUY', entry: 4140, sl: 4135.5, execPrice: 4140.24, anchor: 4141 }), { riskPct: 0.005, spec: SPEC }); assert.ok(b.decision.sizing.cash_risk < a.decision.sizing.cash_risk); assert.ok(Math.abs(b.decision.sizing.cash_risk - (10_000 - 48) * 0.005) < 1e-9);
  });
  it('breakers: production 2 consecutive losses per day; daily loss policy stays unresolved (production disabled)', () => {
    assert.equal(RULES.maxConsecutiveLosses, REAL_DEFAULTS.maxConsecutiveLosses); assert.equal(RULES.dailyLossLimitUsd, null);
    let s = initRiskState(10_000); s.day = new Date(1790950000 * 1000).toISOString().slice(0, 10); s.daily.consecutive_losses = 2; assert.equal(decideRisk(s, sig(), { riskPct: 0.005, spec: SPEC }).decision.decision, 'WAIT_SAFETY_BREAKER');
  });
});

describe('realized risk: stop loss, commission, swap, slippage, gap -- planned SL is not the guaranteed loss', () => {
  const planned = 50; const k = 0.11 * 100; const slOz = 50 / k - 0.10; // a hard-stop exit at exactly the broker level
  const rc = (o) => realizedComponents({ stopLossLossOz: slOz, slippageOz: 0.10, gapOz: 0, swapRatePerOz: 0, chargedNights: 0, lots: 0.11, spec: SPEC, planned, ...o });
  it('commission: production estimate 0 per side, recorded separately', () => { assert.equal(RULES.commissionPerSideUsd, 0); assert.equal(rc({}).commission, 0); });
  it('normal slippage (allowance 0.10) stays WITHIN_RISK; moderate (0.30) and severe exceed as SLIPPAGE_EXCEEDANCE', () => {
    assert.equal(rc({}).exceedance, 'WITHIN_RISK'); assert.ok(Math.abs(rc({}).risk_multiplier - 1) < 1e-9);
    assert.equal(rc({ slippageOz: 0.30 }).exceedance, 'SLIPPAGE_EXCEEDANCE'); assert.ok(rc({ slippageOz: 0.30 }).risk_multiplier > 1); assert.equal(rc({ slippageOz: 9.608 }).exceedance, 'SLIPPAGE_EXCEEDANCE');
  });
  it('swap measured separately: a BUY held over rollovers pays -swap_long x point per oz per charged night (triple on Wednesday)', () => {
    const sw = swapRates(SPEC); assert.ok(sw.ok); assert.ok(Math.abs(sw.long + 0.5132) < 1e-9); assert.equal(sw.short, 0); assert.equal(swapRates({ ...SPEC, swap_mode: 2 }).ok, false);
    const r = rc({ swapRatePerOz: sw.long, chargedNights: 3 }); assert.ok(Math.abs(r.swap - 3 * 0.5132 * k) < 1e-9); assert.equal(r.exceedance, 'SWAP_EXCEEDANCE');
  });
  it('rollover calendar: intraday 0; Mon->Tue 1; Wed->Thu triple 3; Fri->Mon 1 (Sat / Sun rollovers not charged)', () => {
    const at = (iso) => Date.parse(iso) / 1000;
    assert.equal(rolloverCharges(at('2026-09-28T10:00:00Z'), at('2026-09-28T20:00:00Z'), 3).category, 'INTRADAY');
    assert.equal(rolloverCharges(at('2026-09-28T10:00:00Z'), at('2026-09-29T10:00:00Z'), 3).charged_nights, 1);
    const w = rolloverCharges(at('2026-09-30T10:00:00Z'), at('2026-10-01T10:00:00Z'), 3); assert.equal(w.charged_nights, 3); assert.equal(w.category, 'TRIPLE_ROLLOVER');
    assert.equal(rolloverCharges(at('2026-10-02T15:00:00Z'), at('2026-10-05T10:00:00Z'), 3).charged_nights, 1);
    const bars = [{ time: 0 }, { time: 300 }, { time: 300 + 3900 }]; assert.equal(boundaryCharges(bars, 0, 2, 3).boundaries, 1);
  });
  it('gap: normal / moderate / severe reopen gaps through the stop are GAP_EXCEEDANCE; the stop is not a guaranteed loss', () => {
    for (const g of [1.535, 4.85, 9.017]) { const r = rc({ gapOz: g }); assert.equal(r.exceedance, 'GAP_EXCEEDANCE'); assert.ok(Math.abs(r.risk_multiplier - (planned + g * k) / planned) < 1e-9); assert.ok(r.total_realized > planned); }
    assert.equal(classifyExceedance({ planned: 50, sl: 49, commission: 0, swap: 0, slip: 1, gap: 0, allowanceUsd: 1.1 }), 'WITHIN_RISK');
  });
});

describe('broker data and quote integrity fail closed', () => {
  it('missing or invalid broker data -> RISK_REJECTED_BROKER_DATA (every required field)', () => {
    for (const f of ['contract_size', 'tick_size', 'tick_value_per_lot', 'point', 'volume_min', 'volume_max', 'volume_step', 'leverage', 'margin_call_pct', 'stops_level_points', 'freeze_level_points']) { const s = { ...SPEC }; delete s[f]; assert.equal(sizePosition(base({ spec: s })).reason, 'RISK_REJECTED_BROKER_DATA', f); }
    assert.equal(validateBrokerData({ ...SPEC, tick_value_per_lot: 0.2 }).invalid.includes('tick_value_inconsistent'), true);
  });
  it('the live read-only capture (when present) validates and its margin equals the MT5 calculation', (t) => {
    const p = join(V17, 'results', 'broker_spec_live.json'); if (!existsSync(p)) { t.skip('no live capture'); return; } const c = JSON.parse(readFileSync(p, 'utf8')); const s = specFromCapture(c); assert.ok(validateBrokerData(s).ok);
    assert.ok(Math.abs((0.01 * s.contract_size * c.tick.ask) / s.leverage - c.terminal_calculations['margin_buy_0.01']) <= 0.5); assert.ok(!/login|server/i.test(JSON.stringify(c.account))); assert.ok(!/46014|48023|Exness-MT5/.test(JSON.stringify(c)));
  });
  it('missing / stale / invalid quote (V16 timing) -> RISK_REJECTED_QUOTE; a 1-6 s delay is not a quote failure', () => {
    for (const v of ['MISSING_QUOTE', 'STALE_QUOTE', 'BID_INVALID', 'QUOTE_RECEIVED_AFTER_DECISION', 'OUT_OF_ORDER_TICK']) { const s = scenario(v, 2); const tc = checkTiming({ signal: s.signal, quote: s.quote, decision: s.decision, bars: s.bars }); assert.equal(tc.ok, false, v); assert.equal(decideRisk(initRiskState(10_000), sig({ quote_ok: tc.ok }), { riskPct: 0.005, spec: SPEC }).decision.decision, 'RISK_REJECTED_QUOTE'); }
    for (const k of [1, 6]) { const s = scenario('UNCHANGED', k); assert.equal(checkTiming({ signal: s.signal, quote: s.quote, decision: s.decision, bars: s.bars }).ok, true); }
  });
  it('fail closed: equity unavailable, invalid risk, invalid SL, inconsistent inputs', () => {
    assert.equal(sizePosition(base({ equity: 0 })).reason, 'RISK_REJECTED_EQUITY_UNAVAILABLE'); assert.equal(sizePosition(base({ equity: undefined })).reason, 'RISK_REJECTED_EQUITY_UNAVAILABLE');
    assert.equal(sizePosition(base({ riskPct: NaN })).reason, 'RISK_REJECTED_INVALID_RISK'); assert.equal(sizePosition(base({ spread: -1 })).reason, 'RISK_REJECTED_INVALID_RISK'); assert.equal(sizePosition(base({ maxSwapCostPerOz: -1 })).reason, 'RISK_REJECTED_INVALID_RISK');
    assert.equal(sizePosition(base({ execPrice: NaN })).reason, 'RISK_REJECTED_SL_INVALID'); for (const r of ['RISK_REJECTED_MINIMUM_LOT', 'MARGIN_REJECTED', 'RISK_REJECTED_QUOTE', 'RISK_REJECTED_BROKER_DATA']) assert.ok(REJECTS.includes(r));
  });
});

describe('replay, restart, no-lookahead', () => {
  it('restart: a serialized state resumes with identical decisions', () => {
    const list = [sig(), sig({ id: '300|BUY', i: 300, side: 'BUY', entry: 4140, sl: 4135.5, execPrice: 4140.24, anchor: 4141 })]; const cfg = { riskPct: 0.005, spec: SPEC };
    let a = initRiskState(10_000); const outA = []; for (const s of list) { const d = decideRisk(a, s, cfg); a = d.state.open ? settleRisk(d.state, { pnlUsd: -10, exitT: s.t + 600, exitBar: s.i + 2 }) : d.state; outA.push(d.decision); }
    let b = initRiskState(10_000); const d0 = decideRisk(b, list[0], cfg); b = JSON.parse(JSON.stringify(settleRisk(d0.state, { pnlUsd: -10, exitT: list[0].t + 600, exitBar: list[0].i + 2 }))); const d1 = decideRisk(b, list[1], cfg);
    assert.equal(JSON.stringify([d0.decision, d1.decision]), JSON.stringify(outA));
  });
  it('no-lookahead: sizing reads only entry-time inputs (an outcome field on the input changes nothing)', () => {
    const a = sizePosition(base()); const b = sizePosition({ ...base(), exit: 'BROKER_SL', gapOz: 40, futureBars: [1, 2, 3] }); assert.equal(JSON.stringify(a), JSON.stringify(b));
    const d1 = decideRisk(initRiskState(10_000), sig(), { riskPct: 0.005, spec: SPEC }), d2 = decideRisk(initRiskState(10_000), { ...sig(), exitBar: 999, pnl: -500 }, { riskPct: 0.005, spec: SPEC }); assert.equal(JSON.stringify(d1.decision.sizing), JSON.stringify(d2.decision.sizing));
  });
});

describe('research boundaries', () => {
  it('no order / position-modification code; the broker capture is read-only and records no identity', () => {
    for (const f of ['scripts/riskgate.mjs', 'scripts/v17_study.mjs', 'scripts/broker_spec_capture.py']) { const code = readFileSync(join(V17, f), 'utf8'); assert.ok(!/order_send|order_check|positions_get|orders_get|position_modify|TRADE_ACTION|placeOrder/.test(code), f); }
    const py = readFileSync(join(V17, 'scripts', 'broker_spec_capture.py'), 'utf8'); assert.ok(!/"login"|"server"|ai\.login|ai\.server/.test(py));
  });
  it('results (when present): no over-risk after rounding, RR 1.70, PRIMARY never accepted, replay parity', (t) => {
    const p = join(V17, 'results', 'v17_results.json'); if (!existsSync(p)) { t.skip('results not generated'); return; } const R = JSON.parse(readFileSync(p, 'utf8'));
    assert.equal(R.invariants.rounding_violations, 0); assert.equal(R.invariants.rr_violations, 0); assert.equal(R.invariants.broker_rounding_exceedance, 0); assert.equal(R.invariants.primary_accepted, 0); for (const S of ['DEV', 'HOLD']) assert.ok(R.replay[S].deterministic && R.replay[S].restart_equals_uninterrupted);
    assert.ok(['RISK_GATE_VALIDATED', 'RISK_GATE_PARTIALLY_VALIDATED', 'RISK_GATE_INCONCLUSIVE', 'RISK_GATE_FAILED'].includes(R.decision.RISK_GATE_STATUS));
  });
});
