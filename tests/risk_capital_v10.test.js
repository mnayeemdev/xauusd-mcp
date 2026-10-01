/**
 * V10 RISK + CAPITAL CONTROL (2026-10-01) -- deterministic tests for the research risk layer (RESEARCH ONLY; no order code).
 * Percentage risk, position sizing from the structural SL, broker rounding (down, never up), actual-risk recalculation, minimum-lot
 * rejection, broker spec read from the platform log, margin limits, daily loss, consecutive-loss pause, weekly halt, single
 * exposure, no martingale / no profit escalation, gap / slippage fail-safe, restart determinism, duplicate prevention, broker
 * rejection, missing / wrong-side / loosened SL, the CURRENT production margin veto, research boundaries and the frozen results.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrokerSpec, lossPerLot, sizePosition, marginCheck, initState, decide, openPosition, settle, serialize, deserialize, checkFillExposure, auditBrokerSl, onBrokerRejection, weekKey, RISK_CANDIDATES } from '../research/risk_capital_v10/scripts/risk.mjs';
import { walk, cfgOf, COSTS, streakDD } from '../research/risk_capital_v10/scripts/sim.mjs';
import { assessRealLot } from '../src/engine/mt5RealPolicy.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V10 = join(ROOT, 'research', 'risk_capital_v10');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, margin_currency: 'XAU', tick_size: 0.001, tick_value_per_lot: 0.1 });
const D0 = Date.UTC(2026, 0, 6, 9) / 1000; // Tuesday 2026-01-06 09:00 UTC
const PCT = (r, extra = {}) => ({ model: 'PCT', riskPct: r, marginCapPct: 0.5, dailyLimitPct: null, pauseAfter: null, weeklyLimitPct: null, slipAllowance: 0.10, spec: SPEC, ...extra });
const sig = (id, t, entry = 4000, sl = 3995, side = 'BUY') => ({ id, t, side, entry, sl, spread: 0.24 });
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

describe('percentage risk, structural SL distance and position size', () => {
  it('equity -> risk % -> cash risk -> worst-case loss per lot at the hard stop -> lots', () => {
    const z = sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    assert.equal(z.eligible, true); assert.equal(z.cash_risk, 50); assert.ok(Math.abs(z.loss_per_lot - 784) < 1e-9); // (1.5 x 5 + 0.24 + 0.10) x 100
    assert.equal(z.lots, 0.06); assert.ok(Math.abs(z.actual_risk - 47.04) < 1e-9); assert.ok(Math.abs(z.actual_risk_pct - 0.004704) < 1e-12); assert.equal(z.structural_distance, 5);
  });
  it('a wider structural SL gives a smaller size at the same risk; the SL itself is never moved', () => {
    const near = sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    const wide = sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 3990, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    assert.ok(wide.lots < near.lots); assert.equal(wide.lots, 0.03); assert.ok(wide.actual_risk <= 50);
    const s = sig('A', D0, 4000, 3990); const d = decide(initState(10000), s, PCT(0.005)); assert.equal(d.decision.action, 'ACCEPT'); assert.equal(s.sl, 3990); assert.ok(!('sl' in d.decision), 'the risk layer never outputs a new stop');
    assert.equal(sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 4000, spread: 0.24, slipAllowance: 0.10, spec: SPEC }).reason, 'INVALID_STRUCTURAL_SL');
  });
  it('risk candidates are the five pre-registered percentages; the streak drawdown maths is 1 - (1 - r)^k', () => {
    assert.deepEqual([...RISK_CANDIDATES], [0.001, 0.0025, 0.005, 0.0075, 0.01]);
    assert.equal(streakDD(0.01, 20), Math.round((1 - 0.99 ** 20) * 1e4) / 1e4); assert.equal(streakDD(0.0025, 10), Math.round((1 - 0.9975 ** 10) * 1e4) / 1e4);
  });
});

describe('broker rounding and actual-risk recalculation', () => {
  it('rounds DOWN to the volume step, never up; exact multiples are kept; the maximum volume caps the size', () => {
    const lpl = lossPerLot({ entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    assert.equal(sizePosition({ equity: (0.0699 * lpl) / 0.01, riskPct: 0.01, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC }).lots, 0.06);
    assert.equal(sizePosition({ equity: (0.07 * lpl) / 0.01, riskPct: 0.01, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC }).lots, 0.07);
    assert.equal(sizePosition({ equity: 1e9, riskPct: 0.01, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC }).lots, 200);
  });
  it('property: over 5,000 random cases the lot is a step multiple and the actual risk never exceeds the approved cash risk', () => {
    const rnd = lcg(20261001); for (let k = 0; k < 5000; k++) { const equity = 50 + rnd() * 50000; const r = RISK_CANDIDATES[Math.floor(rnd() * 5)]; const R = 0.5 + rnd() * 60; const z = sizePosition({ equity, riskPct: r, entry: 4000, sl: 4000 - R, spread: 0.24 + rnd() * 0.4, slipAllowance: 0.10, spec: SPEC });
      if (!z.eligible) { assert.equal(z.reason, 'RISK_BELOW_MIN_LOT'); assert.ok(z.min_lot_risk_pct > r); continue; }
      assert.ok(Math.abs(z.lots / 0.01 - Math.round(z.lots / 0.01)) < 1e-9); assert.ok(z.lots >= 0.01); assert.ok(z.actual_risk <= equity * r + 1e-9); assert.ok(z.actual_risk_pct <= r + 1e-12); }
  });
  it('below the broker minimum the trade is REJECTED (RISK_BELOW_MIN_LOT), never rounded up to 0.01', () => {
    const z = sizePosition({ equity: 100, riskPct: 0.0025, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    assert.equal(z.eligible, false); assert.equal(z.reason, 'RISK_BELOW_MIN_LOT'); assert.ok(Math.abs(z.min_lot_risk_pct - 0.0784) < 1e-12);
    const d = decide(initState(100), sig('S', D0), PCT(0.0025)); assert.equal(d.decision.action, 'REJECT'); assert.equal(d.decision.reason, 'RISK_BELOW_MIN_LOT');
  });
});

describe('broker specification is read from the platform, never assumed', () => {
  it('parses the latest XAUUSDm record of a bridge log; missing file or field fails closed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'v10spec-')); const p = join(dir, 'log.jsonl');
    const rec = (step, ts) => JSON.stringify({ timestamp: ts, snapshot: { symbol: { name: 'XAUUSDm', trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: step, point: 0.001, digits: 3, trade_stops_level: 0, trade_freeze_level: 0, spread: 240, swap_long: -560, currency_margin: 'XAU' }, account: { leverage: 200, margin_so_call: 60 } } });
    writeFileSync(p, `${rec(0.01, '2026-09-25T00:00:00Z')}\nnot json\n${rec(0.02, '2026-09-26T00:00:00Z')}\n`);
    const s = loadBrokerSpec(p); assert.equal(s.volume_step, 0.02); assert.equal(s.contract_size, 100); assert.equal(s.leverage, 200); assert.equal(s.margin_call_pct, 60); assert.ok(Math.abs(s.tick_value_per_lot - 0.1) < 1e-12); assert.equal(s.recorded_at, '2026-09-26T00:00:00Z');
    assert.throws(() => loadBrokerSpec(join(dir, 'missing.jsonl')), /missing/);
    const q = join(dir, 'bad.jsonl'); writeFileSync(q, JSON.stringify({ symbol: { name: 'XAUUSDm', volume_step: 0.01, volume_min: 0.01, volume_max: 200, point: 0.001 } }) + '\n'); assert.throws(() => loadBrokerSpec(q), /field missing/);
  });
  it('the production bridge log (local, skipped when absent) yields the recorded XAUUSDm contract and no credentials', { skip: !existsSync(join(ROOT, 'state', 'xauusd_mt5_real_trade_log.jsonl')) }, () => {
    const s = loadBrokerSpec(join(ROOT, 'state', 'xauusd_mt5_real_trade_log.jsonl')); for (const k of ['contract_size', 'volume_min', 'volume_step', 'leverage']) assert.ok(s[k] > 0, k);
    for (const k of Object.keys(s)) assert.ok(!/login|password|server|token/i.test(k), `no credential field: ${k}`);
  });
});

describe('margin protection', () => {
  it('margin = lots x contract x price / leverage; a cap and a margin-level-after-loss buffer (60 % + 40) are enforced', () => {
    const m = marginCheck({ lots: 1, price: 4000, equity: 10000, capPct: 0.10, worstLossUsd: 100, spec: SPEC }); assert.equal(m.margin_usd, 2000); assert.equal(m.ok, false); assert.deepEqual(m.reasons, ['MARGIN_ABOVE_CAP']);
    assert.equal(marginCheck({ lots: 1, price: 4000, equity: 10000, capPct: 0.5, worstLossUsd: 100, spec: SPEC }).ok, true);
    assert.equal(marginCheck({ lots: 1, price: 4000, equity: 2500, capPct: 1, worstLossUsd: 500, spec: SPEC }).ok, true); // level after loss exactly 100 %
    assert.ok(marginCheck({ lots: 1, price: 4000, equity: 2500, capPct: 1, worstLossUsd: 600, spec: SPEC }).reasons.includes('MARGIN_LEVEL_AFTER_LOSS_TOO_LOW'));
    assert.ok(marginCheck({ lots: 1, price: 4000, equity: 500, capPct: 10, worstLossUsd: 600, spec: SPEC }).reasons.includes('EQUITY_EXHAUSTED_AT_STOP'));
  });
  it('margin availability is not risk permission: more leverage never increases the size', () => {
    const a = sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: SPEC });
    const b = sizePosition({ equity: 10000, riskPct: 0.005, entry: 4000, sl: 3995, spread: 0.24, slipAllowance: 0.10, spec: { ...SPEC, leverage: 2000 } }); assert.equal(a.lots, b.lots);
    const d = decide(initState(10000), sig('M', D0), PCT(0.005, { marginCapPct: 0.0001 })); assert.equal(d.decision.reason, 'MARGIN_ABOVE_CAP');
  });
});

describe('daily loss limit, consecutive-loss pause, weekly halt', () => {
  it('daily: no new trade once realized loss reaches the limit or the next planned risk would exceed the remaining capacity; resets next UTC day', () => {
    const cfg = PCT(0.005, { dailyLimitPct: 0.01 }); let st = initState(10000); let d = decide(st, sig('d1', D0), cfg); st = settle(openPosition(d.state, sig('d1', D0), d.decision), { pnlUsd: -60, exitT: D0 + 600 }, cfg);
    d = decide(st, sig('d2', D0 + 900), cfg); assert.equal(d.decision.reason, 'DAILY_CAPACITY_INSUFFICIENT'); // 60 + 47.04 > 100
    st = settle(openPosition(st, sig('x', D0), { lots: 0.01, actual_risk: 1 }), { pnlUsd: -40, exitT: D0 + 1200 }, cfg); d = decide(st, sig('d3', D0 + 1500), cfg); assert.equal(d.decision.reason, 'DAILY_LOSS_LIMIT_REACHED');
    d = decide(st, sig('d4', D0 + 86400), cfg); assert.equal(d.decision.action, 'ACCEPT'); assert.equal(d.state.day_start_equity, 9900); assert.equal(d.state.day_realized, 0);
  });
  it('pause: after N consecutive losses no new trade until the next UTC day; a win resets the streak', () => {
    const cfg = PCT(0.005, { pauseAfter: 3 }); let st = initState(10000); const loss = (s, k, pnl = -40) => settle(openPosition(s, sig(`p${k}`, D0), { lots: 0.06, actual_risk: 47 }), { pnlUsd: pnl, exitT: D0 + 600 * k }, cfg);
    st = loss(st, 1); st = loss(st, 2); st = loss(st, 3, 10); assert.equal(st.streak, 0); st = loss(st, 4); st = loss(st, 5); assert.equal(decide(st, sig('q1', D0 + 4000), cfg).decision.action, 'ACCEPT');
    st = loss(st, 6); assert.equal(decide(st, sig('q2', D0 + 4500), cfg).decision.reason, 'LOSS_STREAK_PAUSE'); assert.equal(decide(st, sig('q3', D0 + 86400), cfg).decision.action, 'ACCEPT');
  });
  it('weekly: a 5 % loss from the week-start equity halts until the next ISO week (HALTED state)', () => {
    const cfg = PCT(0.005, { weeklyLimitPct: 0.05 }); let st = decide(initState(10000), sig('w0', D0), cfg).state; st = settle(openPosition(st, sig('w0', D0), { lots: 1, actual_risk: 600 }), { pnlUsd: -500, exitT: D0 + 600 }, cfg);
    assert.equal(st.halted_week, weekKey(D0)); assert.equal(decide(st, sig('w1', D0 + 2 * 86400), cfg).decision.reason, 'WEEKLY_HALTED');
    const next = decide(st, sig('w2', D0 + 7 * 86400), cfg); assert.equal(next.decision.action, 'ACCEPT'); assert.equal(next.state.halted_week, null); assert.equal(weekKey(D0), '2026-01-05');
  });
});

describe('exposure, martingale prohibition, restart, duplicates, broker rejection', () => {
  it('MAX_SIMULTANEOUS_TRADES = 1: a second decision while a position is open is rejected', () => {
    const cfg = PCT(0.005); const d = decide(initState(10000), sig('e1', D0), cfg); const st = openPosition(d.state, sig('e1', D0), d.decision);
    assert.equal(decide(st, sig('e2', D0 + 300), cfg).decision.reason, 'POSITION_OPEN_MAX_SIMULTANEOUS_1'); assert.equal(decide(settle(st, { pnlUsd: 5, exitT: D0 + 600 }, cfg), sig('e3', D0 + 900), cfg).decision.action, 'ACCEPT');
  });
  it('no martingale and no profit escalation: cash risk is always equity x r, independent of the streak or the last result', () => {
    const cfg = PCT(0.005); let st = initState(10000); const rnd = lcg(7);
    for (let k = 0; k < 200; k++) { const d = decide(st, sig(`m${k}`, D0 + k * 900), cfg); if (d.decision.action !== 'ACCEPT') { st = d.state; continue; } assert.ok(Math.abs(d.decision.cash_risk - d.state.equity * 0.005) < 1e-9);
      const twin = decide({ ...st, streak: 0, seen: [] }, sig(`m${k}`, D0 + k * 900), cfg); assert.equal(twin.decision.lots, d.decision.lots, 'the loss streak never changes the size');
      st = settle(openPosition(d.state, sig(`m${k}`, D0), d.decision), { pnlUsd: (rnd() < 0.6 ? -1 : 1.7) * d.decision.actual_risk, exitT: D0 + k * 900 + 600 }, cfg); }
    const src = readFileSync(join(V10, 'scripts', 'risk.mjs'), 'utf8'); assert.ok(!/streak\s*\*|\*\s*s\.streak|martingale\s*=|recovery_size/i.test(src));
  });
  it('restart from serialized state equals an uninterrupted chronological walk; replay is deterministic', () => {
    const N = 60; const sigs = Array.from({ length: N }, (_, k) => ({ id: `${k * 4}|${k % 3 ? 'BUY' : 'SELL'}`, i: k * 4, t: D0 + k * 6 * 3600, side: k % 3 ? 'BUY' : 'SELL', entry: 4000, sl: k % 3 ? 3995 - (k % 5) : 4005 + (k % 5), model: ['MC', 'PB', 'BO'][k % 3], anchor: 3990 + k }));
    const rnd = lcg(20260930); const O = new Map(sigs.map((s, k) => { const R = Math.abs(s.entry - s.sl); const win = rnd() < 0.4; return [s.id, { pnl_oz: win ? 1.7 * R - 0.34 : -(1.5 * R + 0.34), r: win ? 1.66 : -1.57, exitBar: s.i + 1 + (k % 3), exitT: s.t + 600 }]; })); // signals 6 h apart: several UTC days and an ISO-week boundary
    const cfg = cfgOf('PCT', 0.005, 'normal', SPEC, { dailyLimitPct: 0.02, pauseAfter: 3 }); const a = walk(sigs, O, cfg, 10000, { keepState: true }); const b = walk(sigs, O, cfg, 10000, { keepState: true });
    assert.deepEqual(a._trades, b._trades); assert.ok(a.trades > 10);
    const half = 30; const first = walk(sigs.slice(0, half), O, cfg, 10000, { keepState: true }); const restored = deserialize(serialize(first._state)); const second = walk(sigs, O, cfg, 10000, { keepState: true, startState: restored, from: half });
    assert.deepEqual([...first._trades, ...second._trades].map((x) => [x.id, x.lots, x.pnl]), a._trades.map((x) => [x.id, x.lots, x.pnl])); assert.equal(second._state.equity, a._state.equity);
  });
  it('decide is pure (input state never mutated) and a duplicate signal is rejected, also after a restart', () => {
    const cfg = PCT(0.005); const st = initState(10000); const before = serialize(st); const d1 = decide(st, sig('dup', D0), cfg); assert.equal(serialize(st), before);
    assert.equal(decide(d1.state, sig('dup', D0), cfg).decision.reason, 'DUPLICATE_SIGNAL'); assert.equal(decide(deserialize(serialize(d1.state)), sig('dup', D0), cfg).decision.reason, 'DUPLICATE_SIGNAL');
  });
  it('broker rejection: recorded, no retry, no size change, no open position; the same signal cannot be resubmitted', () => {
    const cfg = PCT(0.005); const d = decide(initState(10000), sig('rj', D0), cfg); const r = onBrokerRejection(openPosition(d.state, sig('rj', D0), d.decision), sig('rj', D0), 'TRADE_RETCODE_INVALID_VOLUME');
    assert.deepEqual([r.decision.action, r.decision.retry, r.decision.size_change], ['REJECTED_BY_BROKER', false, false]); assert.equal(r.state.open, null); assert.equal(decide(r.state, sig('rj', D0), cfg).decision.reason, 'DUPLICATE_SIGNAL');
  });
});

describe('execution fail-safes: missing SL, wrong side, gap / slippage excess, connection', () => {
  it('a fill whose real SL exposure exceeds the approved risk beyond tolerance fails safe; within tolerance is OK', () => {
    assert.equal(checkFillExposure({ lots: 0.06, side: 'BUY', fill: 4000.24, brokerSl: 3992.5, spread: 0.24, approvedCash: 50, spec: SPEC }).action, 'OK');
    const x = checkFillExposure({ lots: 0.06, side: 'BUY', fill: 4001.5, brokerSl: 3992.5, spread: 0.24, approvedCash: 50, spec: SPEC }); assert.equal(x.action, 'FAIL_SAFE_CLOSE'); assert.equal(x.reason, 'ACTUAL_EXPOSURE_ABOVE_APPROVED');
  });
  it('missing broker SL, wrong-side SL, loosened SL and lost connection each fail closed; a tighter SL is accepted', () => {
    assert.equal(checkFillExposure({ lots: 0.06, side: 'BUY', fill: 4000, brokerSl: null, spread: 0.24, approvedCash: 50, spec: SPEC }).reason, 'BROKER_SL_MISSING');
    assert.equal(checkFillExposure({ lots: 0.06, side: 'SELL', fill: 4000, brokerSl: 3990, spread: 0.24, approvedCash: 50, spec: SPEC }).reason, 'BROKER_SL_WRONG_SIDE');
    assert.equal(auditBrokerSl({ side: 'BUY', expectedSl: 3992.5, currentSl: null }).action, 'FAIL_SAFE_CLOSE'); assert.equal(auditBrokerSl({ side: 'BUY', expectedSl: 3992.5, currentSl: null, marketOpen: false }).action, 'CLOSE_AT_REOPEN');
    assert.equal(auditBrokerSl({ side: 'SELL', expectedSl: 4007.5, currentSl: 4010 }).reason, 'BROKER_SL_LOOSENED'); assert.equal(auditBrokerSl({ side: 'SELL', expectedSl: 4007.5, currentSl: 4006 }).action, 'OK');
    assert.equal(auditBrokerSl({ side: 'BUY', expectedSl: 3992.5, currentSl: 3992.5, connected: false }).action, 'NO_NEW_TRADES_RECONNECT_THEN_AUDIT');
  });
  it('stress costs are ordered and SEVERE carries the deterministic gap on every 10th stop-out', () => {
    assert.ok(COSTS.normal.spread < COSTS.moderate.spread && COSTS.moderate.spread < COSTS.severe.spread); assert.ok(COSTS.normal.slip < COSTS.moderate.slip && COSTS.moderate.slip < COSTS.severe.slip);
    assert.equal(COSTS.severe.gapEvery, 10); assert.equal(COSTS.severe.gapR, 0.5);
  });
});

describe('CURRENT production model (fixed 0.01 lot) through the real margin veto', () => {
  it('assessRealLot vetoes a tiny account; a large account accepts 0.01 lot and the planned risk is reported as % of equity', () => {
    const cur = { model: 'CURRENT', marginCapPct: 0.5, slipAllowance: 0.10, spec: SPEC, assessCurrent: assessRealLot };
    assert.equal(decide(initState(40), sig('c0', D0), cur).decision.reason, 'CURRENT_MARGIN_SAFETY_VETO');
    const d = decide(initState(10000), sig('c1', D0), cur); assert.equal(d.decision.action, 'ACCEPT'); assert.equal(d.decision.lots, 0.01); assert.ok(Math.abs(d.decision.actual_risk - 7.84) < 1e-9); assert.ok(Math.abs(d.decision.actual_risk_pct - 0.000784) < 1e-12);
    const small = decide(initState(250), sig('c2', D0, 4000, 3960), cur); assert.equal(small.decision.lots, 0.01); assert.ok(small.decision.actual_risk_pct > 0.01, 'the fixed lot is oversized in % terms at a small account');
  });
});

describe('research boundaries and frozen results', () => {
  it('no execution code; production is imported only for the pure CURRENT margin veto; AUTO_SCALING stays OFF', () => {
    for (const f of ['risk.mjs', 'sim.mjs', 'v10_study.mjs', 'v10_descriptive.mjs', 'write_reports.mjs']) { const p = join(V10, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8');
      for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'watcher.js', 'child_process', 'autoScaling = true', 'AUTO_SCALING = ON']) assert.ok(!s.includes(bad), `${f}: ${bad}`);
      if (s.includes('mt5RealPolicy')) assert.match(s, /import \{ assessRealLot \} from '..\/..\/..\/src\/engine\/mt5RealPolicy\.js'/); }
  });
  it('frozen study (local, skipped when absent): hashes, freeze, never above approved, replay / restart, decision consistent', { skip: !existsSync(join(V10, 'results', 'v10_results_FULL.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(sha(join(V10, 'V10_PREREGISTRATION.md')), readFileSync(join(V10, 'V10_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]);
    const fz = JSON.parse(readFileSync(join(V10, 'configs', 'v10_freeze.json'), 'utf8')); assert.equal(fz.risk_sha, sha(join(V10, 'scripts', 'risk.mjs'))); assert.equal(fz.selection_sha, sha(join(V10, 'configs', 'selection.json')));
    const r = JSON.parse(readFileSync(join(V10, 'results', 'v10_results_FULL.json'), 'utf8')); assert.equal(r.integrity.pct_never_above_approved, true); for (const v of Object.values(r.integrity.replay)) assert.equal(v, true);
    assert.ok(['DEMONSTRATED', 'INCONCLUSIVE'].includes(r.decision.RISK_MODEL)); assert.equal(r.decision.PROPOSED_RISK_SPEC, r.decision.RISK_MODEL === 'DEMONSTRATED' ? 'YES' : 'NO');
    if (r.selection.approved_risk_pct == null) assert.equal(r.decision.RISK_MODEL, 'INCONCLUSIVE');
    for (const S of ['DEV', 'HOLD']) for (const g of Object.values(r.splits[S].grid)) for (const [m, c] of Object.entries(g)) if (m.startsWith('PCT_')) for (const x of Object.values(c)) assert.ok(x.max_planned_risk_pct <= Number(m.slice(4)) + 1e-9, `${S} ${m}`);
  });
});
