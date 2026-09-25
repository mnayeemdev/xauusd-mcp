/**
 * MT5 DEMO executor (src/engine/mt5Executor.js) -- deterministic tests
 * with a scripted fake bridge, in-memory state/log, fixed clock, no
 * timers. No Python process, no MT5 terminal, no real filesystem.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMt5Executor, loadMt5State, saveMt5State, readKillSwitch, summarizeOverlayStats, summarizeEngineSignalStats } from '../src/engine/mt5Executor.js';
import { resolveExecutorConfig } from '../src/engine/mt5Policy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const T0 = new Date('2026-09-25T10:00:00.000Z');
const SIG = '979c1e71c587928d';

function hello({ demo = true, algo = true, connected = true, login = 480236873, server = 'Exness-MT5Trial11', tradeMode = 0 } = {}) {
  return {
    demo_verified: demo,
    checks: { account_readable: true, trade_mode_is_demo: demo, login_matches_bridge: demo, server_matches_bridge: demo, login_matches_request: demo, server_matches_request: demo, terminal_connected: connected, terminal_algo_trading_enabled: algo, symbol_available: true, symbol_matches_request: true },
    account: { login, server, trade_mode: tradeMode, currency: 'USD', balance: 10000, equity: 10000 },
    terminal: { connected, trade_allowed: algo, build: 6182, path: 'C:\\MT5' },
    symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 },
  };
}
function tick(clock, over = {}) {
  return { symbol: 'XAUUSDm', bid: 4265.158, ask: 4265.418, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over };
}
function livePosition({ ticket = 5001, type = 0, price_open = 4265.418, profit = 0, swap = 0, comment = `MCP:${SIG}`, magic = 88051501, sl = 4260.418, tp = 4268.418, time = T0.getTime() / 1000 } = {}) {
  return { ticket, time, type, magic, identifier: ticket, reason: 3, volume: 0.01, price_open, sl, tp, price_current: price_open + profit, swap, profit, symbol: 'XAUUSDm', comment };
}
function entryDeal({ ticket = 9001, position_id = 5001, price = 4265.418, time = T0.getTime() / 1000, comment = `MCP:${SIG}`, commission = 0 } = {}) {
  return { ticket, order: ticket, time, type: 0, entry: 0, magic: 88051501, position_id, reason: 3, volume: 0.01, price, commission, swap: 0, profit: 0, fee: 0, symbol: 'XAUUSDm', comment };
}
function exitDeal({ ticket = 9002, position_id = 5001, price = 4268.5, profit = 3.08, time = T0.getTime() / 1000 + 600, reason = 3, commission = 0, swap = 0 } = {}) {
  return { ticket, order: ticket, time, type: 1, entry: 1, magic: 88051501, position_id, reason, volume: 0.01, price, commission, swap, profit, fee: 0, symbol: 'XAUUSDm', comment: 'MCP close' };
}

class FakeBridge {
  constructor(script = {}) { this.script = script; this.calls = []; }
  set(cmd, fn) { this.script[cmd] = fn; }
  async request(cmd, params) {
    this.calls.push({ cmd, params });
    const fn = this.script[cmd];
    if (!fn) throw new Mt5BridgeError('UNSCRIPTED', `no script for ${cmd}`);
    const r = fn(params, this);
    if (r instanceof Error) throw r;
    return r;
  }
  count(cmd) { return this.calls.filter((c) => c.cmd === cmd).length; }
  last(cmd) { return this.calls.filter((c) => c.cmd === cmd).at(-1)?.params; }
}

function makeClock(start = T0) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }

function makeStore(initial = null) {
  const store = { state: initial, log: [], kill: { active: false, close: false } };
  store.deps = {
    loadState: () => (store.state ? JSON.parse(JSON.stringify(store.state)) : loadMt5State('/nonexistent/path.json')),
    saveState: (_p, s) => { store.state = JSON.parse(JSON.stringify(s)); },
    appendLog: (_p, e) => store.log.push(e),
    readKillSwitch: () => store.kill,
    setInterval: () => 'timer', clearInterval: () => {}, sleep: async () => {},
  };
  store.events = (type) => store.log.filter((e) => e.type === type);
  return store;
}

function healthyBridge(clock, { positions = () => ({ positions: [] }) } = {}) {
  const b = new FakeBridge();
  b.set('hello', () => hello());
  b.set('positions', positions);
  b.set('tick', () => tick(clock));
  b.set('history', () => ({ deals: [] }));
  b.set('deals', () => ({ deals: [] }));
  return b;
}

function buildExecutor({ bridge, store, clock, env = {} }) {
  const config = resolveExecutorConfig(env, { mode: 'demo' });
  return createMt5Executor({ config, bridge, statePath: 'mem', logPath: 'mem', killSwitchPath: 'mem', log: () => {}, now: clock.now, _deps: store.deps });
}

function signalEvent(clock, over = {}) {
  const calculated_at = new Date(clock.now().getTime() - 20_000).toISOString();
  return {
    signalId: SIG,
    alert: { action: 'BUY', entry: 4265.0, sl: 4234.0, tp1: 4296.0, tp2: 4327.0, rr: 2, quality: 83, timeframe: '15m', setup: 'PB', time: calculated_at, ...over.alert },
    result: { status: 'OK', action: 'BUY', regime: 'BULL_TREND', correction_state: 'NONE', confirmation_state: 'OK', calculated_at, schema_version: '1.1.0', signal: { signal_id: SIG, is_new_event: true }, ...over.result },
  };
}

function scriptOpen(bridge, { positionId = 5001, price = 4265.418 } = {}) {
  bridge.set('open', (p) => ({ result: { retcode: 10009, deal: 9001, order: positionId, volume: p.volume, price, comment: 'Request executed' }, entry_deal: entryDeal({ position_id: positionId, price }), position_id: positionId, position: livePosition({ ticket: positionId, price_open: price, sl: p.sl, tp: p.tp }), requested_price: price }));
}

describe('mt5Executor: DEMO-only hard protection', () => {
  it('start() on a non-demo account halts; executeSignal never calls open', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('hello', () => hello({ demo: false, tradeMode: 2, server: 'Exness-MT5Real7' }));
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.halted.reason, 'DEMO_VERIFICATION_FAILED');
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.executed, false); assert.equal(r.reason, 'HALTED'); assert.equal(bridge.count('open'), 0);
  });
  it('switching to a real account AFTER a healthy start is caught by the per-trade re-verification', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = buildExecutor({ bridge, store, clock });
    assert.equal((await ex.start()).halted, null);
    bridge.set('hello', () => hello({ demo: false, tradeMode: 2 }));
    scriptOpen(bridge);
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'DEMO_NOT_VERIFIED'); assert.equal(bridge.count('open'), 0);
    assert.equal(store.events('SKIPPED')[0].reason, 'DEMO_NOT_VERIFIED');
  });
  it('Algo Trading OFF (the current terminal state) skips with ALGO_TRADING_DISABLED and sends nothing', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('hello', () => hello({ algo: false }));
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'ALGO_TRADING_DISABLED'); assert.equal(bridge.count('open'), 0);
    assert.equal(store.state.executed_signals[SIG].status, 'SKIPPED');
  });
  it('bridge unavailable at start halts (fail closed), no crash', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = new FakeBridge();
    bridge.set('hello', () => new Mt5BridgeError('BRIDGE_SPAWN_FAILED', 'no python'));
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.halted.reason, 'BRIDGE_UNAVAILABLE');
  });
});

describe('mt5Executor: happy path and duplicate prevention', () => {
  it('opens exactly one 0.01 BUY with budget stops, magic and signal comment; logs INTENT then OPENED', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.executed, true); assert.equal(r.ticket, 5001);
    assert.equal(bridge.count('open'), 1);
    const open = bridge.last('open');
    assert.equal(open.side, 'BUY'); assert.equal(open.volume, 0.01); assert.equal(open.magic, 88051501); assert.equal(open.comment, `MCP:${SIG}`);
    assert.equal(open.sl, 4260.418); assert.equal(open.tp, 4268.418); assert.equal(open.expected_login, 480236873); assert.equal(open.expected_server, 'Exness-MT5Trial11');
    assert.equal(store.state.position.ticket, 5001); assert.equal(store.state.position.side, 'BUY'); assert.equal(store.state.intent.status, 'FILLED');
    assert.equal(store.state.executed_signals[SIG].status, 'EXECUTED');
    assert.deepEqual(store.log.map((e) => e.type), ['STARTED', 'DAILY_REBUILT', 'INTENT', 'OPENED']);
    const opened = store.events('OPENED')[0];
    for (const k of ['timestamp', 'signal_id', 'decision_id', 'action', 'regime', 'setup', 'engine_entry', 'execution_price', 'entry_drift', 'spread', 'lot_size', 'trade_budget_usd', 'take_profit_percent', 'stop_loss_percent', 'profit_target_usd', 'maximum_loss_usd', 'broker_sl', 'mt5_order_id', 'deal_id', 'position_id', 'magic']) {
      assert.ok(k in opened, `OPENED event missing ${k}`);
    }
    assert.equal(opened.profit_target_usd, 3); assert.equal(opened.maximum_loss_usd, -5); assert.equal(opened.entry_drift, 0.42);
  });
  it('the same signal_id is never executed twice (duplicate event / replay)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [] })); // even if the broker showed nothing open
    store.state.position = null; // and even if local position bookkeeping were empty
    const ex2 = buildExecutor({ bridge, store, clock }); // restart
    await ex2.start();
    const r = await ex2.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 1);
  });
  it('a skipped signal (ENTRY_DRIFT) is recorded and never retried later even when drift is back inside limits', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('tick', () => tick(clock, { bid: 4268.0, ask: 4268.26 }));
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r1 = await ex.executeSignal(signalEvent(clock));
    assert.equal(r1.reason, 'ENTRY_DRIFT');
    assert.equal(store.events('SKIPPED')[0].entry_drift, 3.26);
    bridge.set('tick', () => tick(clock));
    const r2 = await ex.executeSignal(signalEvent(clock));
    assert.equal(r2.reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 0);
  });
  it('one position at a time: a second, different signal is skipped while the first is open', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition()] }));
    const r = await ex.executeSignal({ ...signalEvent(clock), signalId: 'ffff000011112222' });
    assert.equal(r.reason, 'POSITION_ALREADY_OPEN'); assert.equal(bridge.count('open'), 1);
  });
  it('definitive broker rejection marks the signal REJECTED and is not retried', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('open', () => new Mt5BridgeError('ORDER_REJECTED', 'retcode 10018 market closed', { result: { retcode: 10018 } }));
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'ORDER_REJECTED'); assert.equal(store.state.intent.status, 'REJECTED'); assert.equal(store.state.position, null);
    assert.equal(store.events('REJECTED')[0].broker_result.retcode, 10018);
    const r2 = await ex.executeSignal(signalEvent(clock));
    assert.equal(r2.reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 1);
  });
  it('ambiguous send (timeout) halts new entries and leaves the intent PENDING for restart reconciliation', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('open', () => new Mt5BridgeError('TRADE_REQUEST_TIMEOUT', 'timed out'));
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'AMBIGUOUS_ORDER_STATE'); assert.equal(store.state.intent.status, 'PENDING'); assert.equal(store.state.halted.reason, 'AMBIGUOUS_ORDER_STATE');
    const r2 = await ex.executeSignal({ ...signalEvent(clock), signalId: 'ffff000011112222' });
    assert.equal(r2.reason, 'HALTED'); assert.equal(bridge.count('open'), 1);
  });
  it('slipped fill re-aligns broker stops to the real execution price', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge, { price: 4265.618 });
    let modify = null;
    bridge.set('modify', (p) => { modify = p; return { result: { retcode: 10009 } }; });
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    await ex.executeSignal(signalEvent(clock));
    assert.equal(modify.sl, 4260.618); assert.equal(modify.tp, 4268.618); assert.equal(modify.ticket, 5001); assert.equal(modify.magic, 88051501);
    assert.equal(store.state.position.slippage, 0.2); assert.equal(store.state.position.broker_sl, 4260.618);
    assert.equal(store.events('STOPS_REALIGNED').length, 1);
  });
});

describe('mt5Executor: actual-P&L exit monitor', () => {
  async function openOne(clock, store, bridge) {
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    await ex.executeSignal(signalEvent(clock));
    return ex;
  }
  it('holds below +3, tracks MFE/MAE, then closes at >= +3 net (TAKE_PROFIT_BUDGET) and counts the day', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = await openOne(clock, store, bridge);
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 1.2 })] }));
    assert.equal((await ex.monitorOnce()).action, 'HOLD');
    bridge.set('positions', () => ({ positions: [livePosition({ profit: -0.7 })] }));
    assert.equal((await ex.monitorOnce()).action, 'HOLD');
    assert.equal(store.state.position.mfe_usd, 1.2); assert.equal(store.state.position.mae_usd, -0.7);
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 2.95, swap: -0.05 })] }));
    assert.equal((await ex.monitorOnce()).action, 'HOLD'); // 2.95 - 0.05 swap = 2.90 net < 3.00
    assert.equal(bridge.count('close'), 0);
    assert.equal(store.state.position.last_net_pnl, 2.9);
  });
  it('closes exactly when net (gross+swap+commission) reaches the target, not on gross alone', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    bridge.set('open', (p) => ({ result: { retcode: 10009, deal: 9001, order: 5001, volume: p.volume, price: 4265.418 }, entry_deal: entryDeal({ commission: -0.1 }), position_id: 5001, position: livePosition() }));
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    await ex.executeSignal(signalEvent(clock));
    let closeCalls = 0;
    bridge.set('close', () => { closeCalls++; return { result: { retcode: 10009, deal: 9002 } }; });
    bridge.set('deals', () => ({ deals: [entryDeal({ commission: -0.1 }), exitDeal({ profit: 3.25, commission: -0.1 })] }));
    // gross 3.1 with -0.1 entry and -0.1 estimated exit commission = 2.9 net -> hold
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 3.1 })] }));
    assert.equal((await ex.monitorOnce()).action, 'HOLD'); assert.equal(closeCalls, 0);
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 3.25 })] }));
    const r = await ex.monitorOnce();
    assert.equal(r.action, 'CLOSED'); assert.equal(r.reason, 'TAKE_PROFIT_BUDGET'); assert.equal(closeCalls, 1);
    const closed = store.events('CLOSED')[0];
    assert.equal(closed.net_pnl, 3.05); assert.equal(closed.gross_pnl, 3.25); assert.equal(closed.commission, -0.2); assert.equal(closed.exit_reason, 'TAKE_PROFIT_BUDGET');
    assert.equal(store.state.position, null); assert.equal(store.state.daily.completed, 1); assert.equal(store.state.daily.wins, 1);
    assert.ok(store.state.last_close_at);
  });
  it('closes at <= -5 net (STOP_LOSS_BUDGET) and increments consecutive losses', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = await openOne(clock, store, bridge);
    bridge.set('close', () => ({ result: { retcode: 10009, deal: 9002 } }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: -5.1, price: 4260.3 })] }));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: -5.0 })] }));
    const r = await ex.monitorOnce();
    assert.equal(r.reason, 'STOP_LOSS_BUDGET');
    assert.equal(store.state.daily.consecutive_losses, 1); assert.equal(store.state.daily.realized_net_usd, -5.1);
  });
  it('broker-side SL hit while monitoring: finalised from deals with BROKER_SL, no close order sent', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = await openOne(clock, store, bridge);
    bridge.set('positions', () => ({ positions: [] }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: -5.0, reason: 4 })] }));
    const r = await ex.monitorOnce();
    assert.equal(r.action, 'CLOSED_BY_BROKER'); assert.equal(bridge.count('close'), 0);
    assert.equal(store.events('CLOSED')[0].exit_reason, 'BROKER_SL'); assert.equal(store.events('CLOSED')[0].broker_exit_reason, 'SL');
  });
  it('after a close, a signal calculated BEFORE the close is refused (fresh decision required); a later new signal is allowed', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = await openOne(clock, store, bridge);
    bridge.set('close', () => ({ result: { retcode: 10009, deal: 9002 } }));
    clock.advance(600_000);
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ time: clock.now().getTime() / 1000 })] }));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 3.5 })] }));
    await ex.monitorOnce();
    bridge.set('positions', () => ({ positions: [] }));
    const stale = { ...signalEvent(clock), signalId: 'aaaa111122223333' };
    stale.result.calculated_at = new Date(clock.now().getTime() - 120_000).toISOString(); stale.alert.time = stale.result.calculated_at;
    assert.equal((await ex.executeSignal(stale)).reason, 'SIGNAL_PREDATES_LAST_CLOSE');
    clock.advance(300_000);
    const fresh = { ...signalEvent(clock), signalId: 'bbbb111122223333' };
    scriptOpen(bridge, { positionId: 5002 });
    assert.equal((await ex.executeSignal(fresh)).executed, true);
    assert.equal(bridge.count('open'), 2);
  });
  it('kill switch: presence blocks new entries; "close" content closes the open position', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = await openOne(clock, store, bridge);
    store.kill = { active: true, close: true, raw: 'close' };
    bridge.set('close', () => ({ result: { retcode: 10009, deal: 9002 } }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: 0.4 })] }));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 0.4 })] }));
    assert.equal((await ex.monitorOnce()).reason, 'KILL_SWITCH_CLOSE');
    bridge.set('positions', () => ({ positions: [] }));
    clock.advance(900_000);
    assert.equal((await ex.executeSignal({ ...signalEvent(clock), signalId: 'cccc111122223333' })).reason, 'KILL_SWITCH');
  });
  it('daily ceiling of 150 completed trades blocks the 151st and never forces trades', async () => {
    const clock = makeClock(); const store = makeStore({ ...loadMt5State('/nonexistent'), daily: { day: '2026-09-25', completed: 150, realized_net_usd: 10, consecutive_losses: 0, wins: 100, losses: 50 } });
    const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'DAILY_TRADE_CEILING'); assert.equal(bridge.count('open'), 0);
  });
});

describe('mt5Executor: restart / reconnect recovery', () => {
  it('resumes monitoring a persisted position that the broker still holds; never re-sends', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 0.5 })] }));
    const ex2 = buildExecutor({ bridge, store, clock });
    const st = await ex2.start();
    assert.equal(st.position.ticket, 5001); assert.equal(st.halted, null);
    assert.equal(store.events('RESUMED_POSITION').length, 1); assert.equal(bridge.count('open'), 1);
    assert.equal((await ex2.monitorOnce()).action, 'HOLD');
  });
  it('position closed by the broker while the executor was down is finalised from history and counted', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [] }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: 3.0, reason: 5 })] }));
    bridge.set('history', () => ({ deals: [entryDeal(), exitDeal({ profit: 3.0, reason: 5 })] }));
    const ex2 = buildExecutor({ bridge, store, clock });
    const st = await ex2.start();
    assert.equal(st.position, null); assert.equal(st.halted, null);
    const closed = store.events('CLOSED')[0];
    assert.equal(closed.exit_reason, 'CLOSED_WHILE_EXECUTOR_DOWN'); assert.equal(closed.broker_exit_reason, 'TP'); assert.equal(closed.net_pnl, 3);
    assert.equal(st.daily.completed, 1);
  });
  it('PENDING intent whose order DID fill is adopted from history (no resend)', async () => {
    const clock = makeClock();
    const intentAt = new Date(clock.now().getTime() - 60_000).toISOString();
    const store = makeStore({ ...loadMt5State('/nonexistent'), intent: { intent_id: 'i1', decision_id: 'd1', signal_id: SIG, side: 'BUY', status: 'PENDING', created_at: intentAt }, executed_signals: { [SIG]: { status: 'INTENT' } } });
    const bridge = healthyBridge(clock, { positions: () => ({ positions: [livePosition()] }) });
    bridge.set('history', () => ({ deals: [entryDeal()] }));
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.intent.status, 'RESOLVED_FILLED'); assert.equal(st.position.ticket, 5001); assert.equal(st.position.signal_id, SIG); assert.equal(st.halted, null);
    assert.equal((await ex.executeSignal(signalEvent(clock))).reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 0);
  });
  it('PENDING intent with no fill in history is ABANDONED and the signal is never resent', async () => {
    const clock = makeClock();
    const store = makeStore({ ...loadMt5State('/nonexistent'), intent: { intent_id: 'i1', decision_id: 'd1', signal_id: SIG, side: 'BUY', status: 'PENDING', created_at: new Date(clock.now().getTime() - 60_000).toISOString() }, executed_signals: { [SIG]: { status: 'INTENT' } } });
    const bridge = healthyBridge(clock);
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.intent.status, 'ABANDONED'); assert.equal(st.halted, null);
    assert.equal(store.state.executed_signals[SIG].status, 'ABANDONED_UNCONFIRMED');
    assert.equal((await ex.executeSignal(signalEvent(clock))).reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 0);
  });
  it('PENDING intent but history unreadable => halted (fail closed), nothing sent', async () => {
    const clock = makeClock();
    const store = makeStore({ ...loadMt5State('/nonexistent'), intent: { intent_id: 'i1', decision_id: 'd1', signal_id: SIG, side: 'BUY', status: 'PENDING', created_at: new Date(clock.now().getTime() - 60_000).toISOString() } });
    const bridge = healthyBridge(clock);
    bridge.set('history', () => new Mt5BridgeError('BRIDGE_TIMEOUT', 'slow'));
    scriptOpen(bridge);
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.halted.reason, 'RECONCILE_FAILED');
    assert.equal((await ex.executeSignal(signalEvent(clock))).reason, 'HALTED'); assert.equal(bridge.count('open'), 0);
  });
  it('adopts an unknown MCP-magic position from the broker and rebuilds the daily count from history', async () => {
    const clock = makeClock(); const store = makeStore();
    const dayStart = Date.parse('2026-09-25T00:00:00Z') / 1000;
    const bridge = healthyBridge(clock, { positions: () => ({ positions: [livePosition({ ticket: 7777, comment: 'MCP:1111222233334444' })] }) });
    bridge.set('history', () => ({ deals: [exitDeal({ position_id: 1, time: dayStart + 100, profit: -5 }), exitDeal({ position_id: 2, time: dayStart + 200, profit: 3 }), entryDeal({ position_id: 7777 })] }));
    const ex = buildExecutor({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.position.ticket, 7777); assert.equal(st.position.adopted, true); assert.equal(st.position.signal_id, '1111222233334444');
    assert.equal(st.daily.completed, 2); assert.equal(st.daily.realized_net_usd, -2);
    assert.equal(store.events('ADOPTED_EXISTING_POSITION').length, 1);
  });
  it('two MCP-magic positions on the broker => halted (never manages ambiguity)', async () => {
    const clock = makeClock(); const store = makeStore();
    const bridge = healthyBridge(clock, { positions: () => ({ positions: [livePosition({ ticket: 1 }), livePosition({ ticket: 2 })] }) });
    const ex = buildExecutor({ bridge, store, clock });
    assert.equal((await ex.start()).halted.reason, 'MULTIPLE_MCP_POSITIONS');
  });
  it('positions carrying another magic are never seen: the bridge is always asked with our magic', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyBridge(clock);
    const ex = buildExecutor({ bridge, store, clock });
    await ex.start();
    for (const c of bridge.calls.filter((x) => x.cmd === 'positions' || x.cmd === 'history')) assert.equal(c.params.magic, 88051501);
  });
});

describe('mt5Executor: persistence helpers and statistics', () => {
  it('state round-trips atomically and a corrupt file halts new entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mt5-exec-'));
    try {
      const p = join(dir, 'state.json');
      saveMt5State(p, { ...loadMt5State(p), daily: { day: 'x', completed: 3 } });
      assert.equal(loadMt5State(p).daily.completed, 3);
      writeFileSync(p, '{not json');
      assert.equal(loadMt5State(p).halted.reason, 'STATE_FILE_CORRUPT');
      const k = join(dir, 'kill');
      assert.deepEqual(readKillSwitch(k), { active: false, close: false });
      writeFileSync(k, 'CLOSE');
      assert.equal(readKillSwitch(k).close, true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('overlay statistics are reported separately from engine signal statistics', () => {
    const overlay = summarizeOverlayStats([{ type: 'OPENED' }, { type: 'CLOSED', net_pnl: 3, exit_reason: 'TAKE_PROFIT_BUDGET' }, { type: 'CLOSED', net_pnl: -5, exit_reason: 'STOP_LOSS_BUDGET' }, { type: 'SKIPPED', reason: 'ENTRY_DRIFT' }]);
    assert.equal(overlay.closed_trades, 2); assert.equal(overlay.net_pnl_usd, -2); assert.equal(overlay.skipped_by_reason.ENTRY_DRIFT, 1);
    assert.match(overlay.label, /does NOT measure engine TP\/SL/);
    const engine = summarizeEngineSignalStats({ signals: [{ status: 'PASS' }, { status: 'FAIL' }, { status: 'OPEN', tp1_hit: true }] });
    assert.equal(engine.pass, 1); assert.equal(engine.fail, 1); assert.equal(engine.open, 1);
  });
});
