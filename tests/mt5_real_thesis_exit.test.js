/**
 * Audit corrections of 2026-09-25 (REAL SELL 3f7f5be75b35983c):
 *   - post-entry THESIS INVALIDATION exit on confirmed evidence (PART 3/4)
 *   - protective broker SL derived from the structural stop (PART 5)
 *   - SR counter-structure hardening (PART 6) and 1H RANGE is not support (PART 7)
 *   - RR quality mapping documented (PART 8)
 *   - executable-geometry / fill recheck (PART 9)
 *   - exact 0.01 lot at the executor (PART 1)
 *   - watcher ordering: thesis review runs BEFORE the alert/execute path
 * Pure functions + scripted fake bridge; no python, no terminal, no orders.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateThesisInvalidation, evaluateExecutableGeometry, computeProtectiveStops, computeBrokerStops } from '../src/engine/mt5Policy.js';
import { RISK_PARAMS } from '../src/engine/risk.js';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { runWatcherCycle } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { evaluateStructureRejection, counterStructureConfirmed } from '../src/engine/intraday/models5m.js';
import { htfSupportsSide, resolveQualityThreshold } from '../src/engine/intraday/pipeline5m.js';
import { scoreQuality as scoreQ } from '../src/engine/quality.js';
import { permissiveNewsMonitor } from './fixtures/news_test_monitor.js';

// ── The audited trade, as recorded ─────────────────────────────────────
const AUD = { signalId: '3f7f5be75b35983c', thesisId: '83fdc96e289232e2', side: 'SELL', model: 'SR', plannedEntry: 4276.34, structuralStop: 4281.27, tp1: 4271.4, tp2: 4267.69, rr: 1.75, quality: 68, setupLevel: 4280.48, fill: 4275.022, bid: 4275.022, ask: 4275.282, spread: 0.26, openTime: '2026-09-25T07:41:18.000Z' };
const bar = (time, close, over = {}) => ({ time, open: close, high: close + 0.5, low: close - 0.5, close, ...over });
function position(over = {}) {
  return { ticket: 12983072, position_id: 12983072, signal_id: AUD.signalId, side: 'SELL', volume: 0.01, open_price: AUD.fill, open_time: AUD.openTime, broker_sl: 4300.022, broker_tp: 4260.022, profit_target_usd: 30, maximum_loss_usd: -50, last_net_pnl: -3.4,
    engine: { thesis_id: AUD.thesisId, direction: 'SELL', model: 'SR', planned_entry: AUD.plannedEntry, structural_stop: AUD.structuralStop, setup_level: AUD.setupLevel, engine_sl: AUD.structuralStop, engine_tp2: AUD.tp2, engine_rr: AUD.rr, quality: AUD.quality, timeframe: '5m' }, ...over };
}
function analysis({ bars, lastEvent = null, action = 'WAIT', entry = null, isNew = true, signalId = 'zzzz', setup = null } = {}) {
  return { status: 'OK', action, entry, setup, reason: action === 'WAIT' ? 'NO_ELIGIBLE_STRATEGY' : null, calculated_at: '2026-09-25T10:00:30.000Z', primary_confirmed_bars: bars, evidence: { structure: { state: 'BULLISH', lastEvent } }, signal: action === 'WAIT' ? null : { signal_id: signalId, is_new_event: isNew }, anticipation: { state: 'ARMED' }, pre_entry_plan: { status: 'PLAN', opportunity_state: 'CONFIRMED' } };
}
// Confirmed 5m bars: the entry bar (07:35), then post-entry bars.
const B_0735 = bar(1790321700, 4276.335, { high: 4280.15, low: 4275.7 });
const B_0740 = bar(1790322000, 4276.795), B_0745 = bar(1790322300, 4279.0), B_0805 = bar(1790323500, 4278.325);
const B_0810 = bar(1790323800, 4281.785, { high: 4282.5 }); // closes above the structural stop 4281.27 AND above the setup level

describe('PART 3/4: post-entry thesis invalidation on CONFIRMED evidence', () => {
  it('A. a confirmed candle close beyond the structural stop invalidates the SELL (the audited 08:10 candle)', () => {
    const v = evaluateThesisInvalidation({ position: position(), result: analysis({ bars: [B_0735, B_0740, B_0745, B_0805, B_0810] }) });
    assert.equal(v.invalidated, true); assert.equal(v.reason, 'THESIS_STOP_CLOSE'); assert.equal(v.detail.confirmed_close, 4281.785);
  });
  it('B. a confirmed opposite BOS/CHoCH through the setup level invalidates, even if the close is back below the stop', () => {
    const bars = [B_0735, B_0740, B_0745, B_0805, bar(1790323800, 4280.9)]; // close below 4281.27
    const v = evaluateThesisInvalidation({ position: position(), result: analysis({ bars, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 4, level: 4280.48 } }) });
    assert.equal(v.invalidated, true); assert.equal(v.reason, 'THESIS_OPPOSITE_STRUCTURE_BREAK'); assert.equal(v.detail.level, 4280.48);
  });
  it('C. a genuine NEW opposite actionable signal in the same market area invalidates', () => {
    const bars = [B_0735, B_0740, B_0745, B_0805, bar(1790323800, 4280.5)];
    const v = evaluateThesisInvalidation({ position: position(), result: analysis({ bars, action: 'BUY', entry: 4281.22, setup: 'BO', signalId: '68a4e099f6af463c' }) });
    assert.equal(v.invalidated, true); assert.equal(v.reason, 'THESIS_OPPOSITE_SIGNAL'); assert.equal(v.detail.signal_id, '68a4e099f6af463c');
  });
  it('noise does NOT exit: closes below the stop, wicks above it, old events, non-actionable opposite candidates, far-away opposite signals', () => {
    const hold = (res) => assert.equal(evaluateThesisInvalidation({ position: position(), result: res }).invalidated, false);
    hold(analysis({ bars: [B_0735, B_0740, B_0745, bar(1790322600, 4279.755, { high: 4283.0 })] })); // wick through the stop only
    hold(analysis({ bars: [B_0735, B_0740, B_0745, B_0805] })); // ordinary movement below the stop
    hold(analysis({ bars: [B_0735, B_0740, B_0745], lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 0, level: 4275.805 } })); // the PRE-entry bullish BOS from 06:15 area, not a new break
    hold(analysis({ bars: [B_0735, B_0740, B_0745], action: 'WAIT' })); // ARMED / planner states are not signals
    hold(analysis({ bars: [B_0735, B_0740, B_0745], action: 'BUY', entry: 4262.0, signalId: 'far' })); // opposite signal far below the setup area
    hold(analysis({ bars: [B_0735, B_0740, B_0745], action: 'BUY', entry: 4281.0, isNew: false, signalId: 'dup' })); // not a NEW event
    hold({ status: 'OK', action: 'WAIT', primary_confirmed_bars: [] });
  });
  it('the entry candle itself (closed before the fill) never invalidates; BUY logic is symmetric', () => {
    const early = evaluateThesisInvalidation({ position: position(), result: analysis({ bars: [bar(1790321400, 4290)] }) });
    assert.equal(early.invalidated, false); assert.equal(early.reason, 'CANDLE_PREDATES_ENTRY');
    const buyPos = position({ side: 'BUY', open_price: 4265.4, engine: { direction: 'BUY', planned_entry: 4265.0, structural_stop: 4260.0, setup_level: 4262.0, engine_tp2: 4275.0 } });
    assert.equal(evaluateThesisInvalidation({ position: buyPos, result: analysis({ bars: [B_0735, bar(1790322300, 4259.5)] }) }).reason, 'THESIS_STOP_CLOSE');
    assert.equal(evaluateThesisInvalidation({ position: buyPos, result: analysis({ bars: [B_0735, bar(1790322300, 4261.0)], lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 1, level: 4262.0 } }) }).reason, 'THESIS_OPPOSITE_STRUCTURE_BREAK');
    assert.equal(evaluateThesisInvalidation({ position: buyPos, result: analysis({ bars: [B_0735, bar(1790322300, 4263.0)] }) }).invalidated, false);
  });
});

describe('PART 5: protective broker SL from the structural stop (monetary boundary stays the outer limit)', () => {
  const base = { side: 'SELL', fillPrice: AUD.fill, lot: 0.01, contractSize: 100, digits: 3, profitTargetUsd: 30, maximumLossUsd: -50, spread: AUD.spread };
  it('audited SELL at 0.01: monetary SL would be 50 USD away; structural SL is 4.93 x 1.5 + spread = 7.66 USD away, TP stays at +30', () => {
    const monetary = computeBrokerStops({ ...base });
    const s = computeProtectiveStops({ ...base, structuralStop: AUD.structuralStop, plannedEntry: AUD.plannedEntry, structuralMultiple: 1.5 });
    assert.equal(monetary.lossDistance, 50); assert.equal(s.sl_basis, 'STRUCTURAL'); assert.equal(s.lossDistance, 7.655);
    assert.equal(s.sl, 4282.677); assert.equal(s.tp, monetary.tp); assert.equal(s.monetary_distance, 50);
    assert.ok(s.sl < monetary.sl, 'never wider than the monetary boundary');
  });
  it('without a structural stop, or when the structural distance is wider than the monetary one, the monetary stop applies; never closer than 4 spreads / stops level', () => {
    assert.equal(computeProtectiveStops({ ...base }).sl_basis, 'MONETARY');
    const wide = computeProtectiveStops({ ...base, structuralStop: 4400, plannedEntry: 4276, structuralMultiple: 1.5 });
    assert.equal(wide.sl_basis, 'MONETARY'); assert.equal(wide.lossDistance, 50);
    const tight = computeProtectiveStops({ ...base, structuralStop: 4276.4, plannedEntry: 4276.34, structuralMultiple: 1.0, spread: 0.5, stopsLevelPrice: 3 });
    assert.equal(tight.lossDistance, 3, 'floored at the broker stops level');
    const buy = computeProtectiveStops({ ...base, side: 'BUY', structuralStop: 4260, plannedEntry: 4265, structuralMultiple: 1.5 });
    assert.ok(buy.sl < AUD.fill && buy.sl_basis === 'STRUCTURAL');
  });
});

describe('PART 6/7: SR counter-structure hardening and 1H RANGE is not support', () => {
  const bars = Array.from({ length: 20 }, (_, k) => ({ time: 1790316000 + k * 300, open: 4276, high: 4276.5, low: 4275.5, close: 4276 }));
  bars[19] = { time: bars[19].time, open: 4275.77, high: 4280.15, low: 4275.7, close: 4276.335 }; // the audited rejection candle
  const s5Bullish = { state: 'BULLISH', lastSwingHigh: { price: 4280.48, index: 12, label: 'LH' }, lastSwingLow: { price: 4256.355, index: 5, label: 'LL' }, lastSweep: null };
  const neutralRange = { status: 'OK', direction: 'NEUTRAL', regime: 'RANGE', structure: { state: 'BEARISH', lastSwingHigh: { price: 4295.895 }, lastSwingLow: { price: 4256.355 } }, correction: { state: 'ACTIVE' }, fresh_opposing_choch: null, eligible_models: ['BO', 'SR', 'MR'] };
  it('the audited counter-structure SR SELL (5m BULLISH, 15m NEUTRAL/RANGE, no sweep) no longer produces a candidate', () => {
    assert.equal(evaluateStructureRejection({ bars, structure: s5Bullish, atrVal: 4.47, bias: neutralRange }), null);
    assert.equal(counterStructureConfirmed({ bias: neutralRange, structure: s5Bullish, level: 4280.48, side: 'SELL', i: 19, atrVal: 4.47 }), false);
  });
  it('the same rejection IS allowed with a directional BEARISH 15m bias, or with a fresh confirmed 5m sweep of the level', () => {
    const bearish = { ...neutralRange, direction: 'BEARISH', regime: 'BEAR_TREND', eligible_models: ['MC', 'PB', 'BO', 'SR'] };
    assert.equal(evaluateStructureRejection({ bars, structure: s5Bullish, atrVal: 4.47, bias: bearish })?.model, 'SR');
    const swept = { ...s5Bullish, lastSweep: { type: 'SWEEP_HIGH', bar: 18, level: 4280.48 } };
    assert.equal(evaluateStructureRejection({ bars, structure: swept, atrVal: 4.47, bias: neutralRange })?.model, 'SR');
    const staleSweep = { ...s5Bullish, lastSweep: { type: 'SWEEP_HIGH', bar: 10, level: 4280.48 } };
    assert.equal(evaluateStructureRejection({ bars, structure: staleSweep, atrVal: 4.47, bias: neutralRange }), null);
    const wrongSweep = { ...s5Bullish, lastSweep: { type: 'SWEEP_LOW', bar: 18, level: 4280.48 } };
    assert.equal(evaluateStructureRejection({ bars, structure: wrongSweep, atrVal: 4.47, bias: neutralRange }), null);
  });
  it('an SR trade WITH 5m structure is unchanged (no extra requirement)', () => {
    const bearishStructure = { ...s5Bullish, state: 'BEARISH' };
    assert.equal(evaluateStructureRejection({ bars, structure: bearishStructure, atrVal: 4.47, bias: neutralRange })?.side, 'SELL');
  });
  it('1H RANGE with bearish structure is NOT directional support: the audited setup keeps the 70 bar (68 fails)', () => {
    const range1H = { status: 'OK', regime: 'RANGE', structure_direction: 'BEARISH' };
    assert.equal(htfSupportsSide(range1H, 'SELL'), false);
    assert.deepEqual(resolveQualityThreshold({ bias: neutralRange, side: 'SELL', ctx1H: range1H }), { threshold: 70, basis: 'neutral_bias_unsupported' });
    assert.ok(AUD.quality < 70);
    assert.equal(htfSupportsSide({ status: 'OK', regime: 'BEAR_TREND', structure_direction: 'BEARISH' }, 'SELL'), true);
    assert.equal(htfSupportsSide({ status: 'OK', regime: 'TRANSITION', structure_direction: 'BULLISH' }, 'BUY'), false);
  });
});

describe('PART 8: RR quality contribution is deterministic and documented', () => {
  it('qRr = 10 x (rr - 1.7) / 1.7, clamped to [0, 10]: exactly the minimum contributes 0, RR 1.75 rounds to 0, RR 2.55 gives 5, RR >= 3.4 gives 10', () => {
    const q = (rr) => scoreQ({ candidate: { side: 'SELL', model: 'SR', overextensionRatio: 0.4 }, structure: { state: 'BULLISH', lastSwingHigh: { label: 'LH' }, lastEvent: { type: 'BOS' } }, regime: 'COMPRESSION', adxVal: 25, adxThreshold: 20, atrRatio: 1.25, htfRegime: 'RANGE', session: 'ASIA', rr, minRR: RISK_PARAMS.minRR }).breakdown.qRr;
    assert.equal(q(1.7), 0); assert.equal(q(1.75), 0); assert.equal(q(2.55), 5); assert.equal(q(3.4), 10); assert.equal(q(5), 10);
    assert.equal(RISK_PARAMS.minRR, 1.7, 'the hard minimum is unchanged');
  });
});

describe('PART 9: executable-geometry recheck at the live price / fill', () => {
  it('the audited SELL executed 1.32 below its planned entry: effective RR 1.17 < 1.7, so it is now refused before order_send', () => {
    const g = evaluateExecutableGeometry({ side: 'SELL', price: AUD.bid, engineSl: AUD.structuralStop, engineTp2: AUD.tp2, minRr: 1.7 });
    assert.equal(g.valid, false); assert.equal(g.reason, 'EFFECTIVE_RR_BELOW_MINIMUM'); assert.equal(g.rr, 1.17); assert.equal(g.risk, 6.25); assert.equal(g.reward, 7.33);
  });
  it('a fill at the planned entry passes; a price beyond the structural stop or beyond the objective fails', () => {
    assert.equal(evaluateExecutableGeometry({ side: 'SELL', price: AUD.plannedEntry, engineSl: AUD.structuralStop, engineTp2: AUD.tp2, minRr: 1.7 }).valid, true);
    assert.equal(evaluateExecutableGeometry({ side: 'SELL', price: 4282, engineSl: AUD.structuralStop, engineTp2: AUD.tp2, minRr: 1.7 }).reason, 'PRICE_BEYOND_STRUCTURAL_STOP');
    assert.equal(evaluateExecutableGeometry({ side: 'BUY', price: 4276, engineSl: 4260, engineTp2: 4275, minRr: 1.7 }).reason, 'PRICE_BEYOND_OBJECTIVE');
    assert.equal(evaluateExecutableGeometry({ side: 'BUY', price: 4265.418, engineSl: 4260, engineTp2: 4275, minRr: 1.7 }).rr, 1.77);
  });
});

// ── Executor integration with a scripted REAL bridge ───────────────────
const T0 = new Date('2026-09-25T10:00:00.000Z');
function realHello({ equity = 121.94, algo = true } = {}) {
  return { real_verified: true, checks: { account_readable: true, trade_mode_is_real: true, server_not_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: algo, symbol_available: true, symbol_matches_request: true },
    account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2, currency: 'USD', balance: equity, equity, margin: 0, margin_free: equity, leverage: 200, margin_so_call: 60, margin_so_so: 0 }, terminal: { connected: true, trade_allowed: algo, build: 6182, path: 'C:\\MT5' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
function tick(clock, over = {}) { return { symbol: 'XAUUSDm', bid: 4265.158, ask: 4265.418, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over }; }
function live({ ticket = 7001, price_open = 4265.418, profit = 0, volume = 0.01, sl = 4257.658, tp = 4295.418 } = {}) { return { ticket, time: T0.getTime() / 1000, type: 0, magic: REAL_MAGIC, identifier: ticket, reason: 3, volume, price_open, sl, tp, price_current: price_open + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: 'MCP:aaaaaaaaaaaaaaaa' }; }
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } }
function makeClock(start = T0) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function bridgeOk(clock) { const b = new FakeBridge(); b.set('hello', () => realHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', () => tick(clock)); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] })); b.set('open', (p) => ({ result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price: 4265.418 }, entry_deal: { ticket: 9101, order: 7001, time: T0.getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7001, volume: p.volume, price: 4265.418, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:aaaaaaaaaaaaaaaa' }, position_id: 7001, position: live({ sl: p.sl, tp: p.tp }), requested_price: 4265.418 })); return b; }
function build({ bridge, store, clock, config = resolveRealExecutorConfig({}) }) { return createMt5Executor({ config, bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); }
function buySignal(clock, over = {}) { const calculated_at = new Date(clock.now().getTime() - 20_000).toISOString(); return { signalId: over.signalId ?? 'aaaaaaaaaaaaaaaa', alert: { action: 'BUY', entry: 4265.0, sl: 4260.0, tp1: 4270.0, tp2: 4275.0, rr: 2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at, ...over.alert }, result: { status: 'OK', action: 'BUY', regime: 'BULL_TREND', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: 'aaaaaaaaaaaaaaaa', is_new_event: true, thesis_id: 'thesisX' }, diagnostics: { candidate: { model: 'BO', side: 'BUY', anchor: 4262.0 }, objective: { price: 4275, source: '5m_pivot' } }, ...over.result } }; }

describe('PART 1 at the executor: exactly 0.01 or nothing', () => {
  it('opens 0.01 with REAL magic, a STRUCTURAL broker SL (7.76 below fill) and the +30 monetary TP; thesis metadata persisted', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    const r = await ex.executeSignal(buySignal(clock));
    assert.equal(r.executed, true);
    const o = bridge.last('open');
    assert.equal(o.volume, 0.01); assert.equal(o.magic, REAL_MAGIC); assert.equal(o.sl, 4257.658); assert.equal(o.tp, 4295.418);
    const pos = store.state.position;
    assert.equal(pos.engine.thesis_id, 'thesisX'); assert.equal(pos.engine.structural_stop, 4260); assert.equal(pos.engine.setup_level, 4262); assert.equal(pos.engine.planned_entry, 4265); assert.equal(pos.engine.direction, 'BUY'); assert.equal(pos.engine.model, 'BO');
    const intent = store.events('INTENT')[0];
    assert.equal(intent.stops_meta.sl_basis, 'STRUCTURAL'); assert.equal(intent.executable_geometry.rr, 1.77); assert.equal(intent.margin_safety.executable, true); assert.equal(intent.thesis.structural_stop, 4260);
  });
  it('a tampered config lot (0.02) is refused by the executor with LOT_NOT_USER_APPROVED; broker-safe equity never changes the lot', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    bridge.set('hello', () => realHello({ equity: 1_000_000 }));
    const ex = build({ bridge, store, clock, config: { ...resolveRealExecutorConfig({}), lotSize: 0.02 } }); await ex.start();
    const r = await ex.executeSignal(buySignal(clock));
    assert.equal(r.reason, 'LOT_ABOVE_HARD_CAP'); assert.equal(bridge.count('open'), 0);
    const exB = build({ bridge, store: makeStore(), clock, config: { ...resolveRealExecutorConfig({}), lotSize: 0.02, maxLotSize: 0.02 } }); await exB.start();
    assert.equal((await exB.executeSignal(buySignal(clock))).reason, 'LOT_NOT_USER_APPROVED'); assert.equal(bridge.count('open'), 0);
    const clock2 = makeClock(); const store2 = makeStore(); const bridge2 = bridgeOk(clock2); bridge2.set('hello', () => realHello({ equity: 1_000_000 }));
    const ex2 = build({ bridge: bridge2, store: store2, clock: clock2 }); await ex2.start(); await ex2.executeSignal(buySignal(clock2));
    assert.equal(bridge2.last('open').volume, 0.01, 'huge equity still trades exactly 0.01');
  });
  it('margin safety veto refuses the trade (no resize) when 0.01 is unsafe', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    bridge.set('hello', () => ({ ...realHello(), account: { ...realHello().account, equity: 100, margin_free: 4 } }));
    const ex = build({ bridge, store, clock }); await ex.start();
    const r = await ex.executeSignal(buySignal(clock));
    assert.equal(r.reason, 'MARGIN_SAFETY_VETO'); assert.equal(bridge.count('open'), 0); assert.equal(r.details.lot, 0.01);
  });
  it('the audited fill geometry (planned 4276.34, live 4275.022, SL 4281.27, TP2 4267.69) is refused before order_send', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    bridge.set('tick', () => tick(clock, { bid: 4275.022, ask: 4275.282 }));
    const ex = build({ bridge, store, clock }); await ex.start();
    const r = await ex.executeSignal({ signalId: '3f7f5be75b35983c', alert: { action: 'SELL', entry: 4276.34, sl: 4281.27, tp1: 4271.4, tp2: 4267.69, rr: 1.75, quality: 68, timeframe: '5m', setup: 'SR', time: new Date(clock.now().getTime() - 6000).toISOString() }, result: { status: 'OK', action: 'SELL', calculated_at: new Date(clock.now().getTime() - 6000).toISOString(), schema_version: '1.2.0', signal: { signal_id: '3f7f5be75b35983c', is_new_event: true }, diagnostics: { candidate: { anchor: 4280.48 } } } });
    assert.equal(r.executed, false); assert.equal(r.reason, 'EXECUTABLE_GEOMETRY_INVALID'); assert.equal(r.details.rr, 1.17); assert.equal(bridge.count('open'), 0);
  });
  it('a broker fill that breaks the geometry is closed through the governed path right after OPENED', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    bridge.set('open', (p) => ({ result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price: 4272.0 }, entry_deal: { ticket: 9101, order: 7001, time: T0.getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7001, volume: p.volume, price: 4272.0, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:aaaaaaaaaaaaaaaa' }, position_id: 7001, position: live({ price_open: 4272.0, sl: p.sl, tp: p.tp }), requested_price: 4265.418 }));
    bridge.set('modify', () => ({ result: { retcode: 10009 } }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: { ticket: 9102, entry: 1, price: 4272.1, profit: 0.1, time: T0.getTime() / 1000 + 5 } }));
    bridge.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: 4272.0, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4272.1, profit: 0.1, commission: 0, swap: 0, fee: 0, reason: 3, time: T0.getTime() / 1000 + 5 }] }));
    const ex = build({ bridge, store, clock }); await ex.start();
    const r = await ex.executeSignal(buySignal(clock));
    assert.equal(r.reason, 'OPENED_THEN_CLOSED_FILL_GEOMETRY_INVALID'); assert.equal(store.events('FILL_GEOMETRY_INVALID').length, 1); assert.equal(store.events('CLOSED')[0].exit_reason, 'FILL_GEOMETRY_INVALID'); assert.equal(store.state.position, null);
  });
});

describe('PART 3/4 at the executor: structural exit fires before the -50 boundary; exit authorities coexist', () => {
  async function openBuy() {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start(); await ex.executeSignal(buySignal(clock));
    bridge.set('positions', () => ({ positions: [live({ profit: -6.0 })] })); // -6 USD: far from -50
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: { ticket: 9102, entry: 1, price: 4259.4, profit: -6.0, time: T0.getTime() / 1000 + 900, reason: 3 } }));
    bridge.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: 4265.418, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4259.4, profit: -6.0, commission: 0, swap: 0, fee: 0, reason: 3, time: T0.getTime() / 1000 + 900 }] }));
    return { clock, store, bridge, ex };
  }
  it('a confirmed close below the BUY structural stop closes the trade at -6, not at -50; the monetary monitor alone would have held', async () => {
    const { clock, store, bridge, ex } = await openBuy();
    assert.equal((await ex.monitorOnce()).action, 'HOLD', 'monetary monitor holds at -6');
    const bars = [bar(T0.getTime() / 1000 - 300, 4265.0), bar(T0.getTime() / 1000 + 600, 4259.4)];
    const rv = await ex.reviewThesis({ result: analysis({ bars }) });
    assert.equal(rv.action, 'CLOSED'); assert.equal(rv.reason, 'THESIS_STOP_CLOSE');
    assert.equal(store.events('THESIS_INVALIDATED').length, 1); assert.equal(store.events('CLOSED')[0].exit_source, 'THESIS_MONITOR'); assert.equal(store.events('CLOSED')[0].exit_reason, 'THESIS_STOP_CLOSE');
    assert.equal(store.state.position, null); assert.equal(bridge.last('close').magic, REAL_MAGIC);
    clock.advance(1000);
    const again = await ex.executeSignal(buySignal(clock, { signalId: 'bbbbbbbbbbbbbbbb', result: { signal: { signal_id: 'bbbbbbbbbbbbbbbb', is_new_event: true } } }));
    assert.equal(again.reason, 'SIGNAL_PREDATES_LAST_CLOSE', 'no automatic re-entry: a signal calculated before the close is refused');
  });
  it('confirmed noise (wick through the stop, close above it) keeps the trade; the monetary boundaries still work', async () => {
    const { store, bridge, ex } = await openBuy();
    const bars = [bar(T0.getTime() / 1000 + 600, 4261.0, { low: 4258.0 })];
    const rv = await ex.reviewThesis({ result: analysis({ bars }) });
    assert.equal(rv.action, 'THESIS_HOLD'); assert.equal(store.state.position.ticket, 7001); assert.equal(bridge.count('close'), 0);
    bridge.set('positions', () => ({ positions: [live({ profit: -50.4 })] }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: { ticket: 9102, entry: 1, price: 4215.0, profit: -50.4, time: T0.getTime() / 1000 + 1200, reason: 3 } }));
    bridge.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: 4265.418, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4215.0, profit: -50.4, commission: 0, swap: 0, fee: 0, reason: 3, time: T0.getTime() / 1000 + 1200 }] }));
    const m = await ex.monitorOnce();
    assert.equal(m.action, 'CLOSED'); assert.equal(m.reason, 'STOP_LOSS_BUDGET');
  });
  it('thesis review is a no-op without a position and for a DEMO-style config without thesisExit', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    assert.equal((await ex.reviewThesis({ result: analysis({ bars: [B_0810] }) })).action, 'NO_POSITION');
  });
});

describe('watcher ordering: thesis review runs on every processed candle BEFORE the alert/execute path', () => {
  it('reviewOpenPosition receives the analysis first; executeSignal (if any) runs after it', async () => {
    const order = [];
    const result = { status: 'OK', action: 'BUY', entry: 1, sl: 0.5, tp1: 1.5, tp2: 2, rr: 2, quality: 80, calculated_at: '2026-09-25T10:00:00.000Z', signal: { signal_id: 'sig1', is_new_event: true }, diagnostics: { source_timeframe: '5m' }, primary_confirmed_bars: [bar(1790323800, 1)] };
    const deps = { isCdpReachable: async () => true, peekLatest5mCandle: async () => ({ time: 5300 }), analyzeMarket: async () => result, notify: () => { order.push('notify'); }, reviewOpenPosition: async () => { order.push('review'); return { action: 'THESIS_HOLD' }; }, executeSignal: async () => { order.push('execute'); return { executed: false, reason: 'test' }; } };
    const state = { ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: 5000, last_connection_ok: true };
    const r = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(r.action, 'ALERTED');
    assert.deepEqual(order, ['review', 'notify', 'execute']);
  });
  it('a throwing review never alters the decision', async () => {
    const result = { status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', calculated_at: '2026-09-25T10:00:00.000Z', diagnostics: { source_timeframe: '5m' } };
    const deps = { isCdpReachable: async () => true, peekLatest5mCandle: async () => ({ time: 5300 }), analyzeMarket: async () => result, notify: () => {}, reviewOpenPosition: async () => { throw new Error('boom'); } };
    const state = { ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: 5000, last_connection_ok: true };
    const r = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(r.action, 'WAIT');
  });
});
