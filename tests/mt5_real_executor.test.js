/**
 * REAL stage-1 executor: the DEMO executor logic (src/engine/mt5Executor.js)
 * driven by the REAL policy config, with a scripted fake REAL bridge.
 * No Python, no terminal, no real filesystem, no orders.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { resolveExecutorConfig } from '../src/engine/mt5Policy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { permissiveNewsMonitor } from './fixtures/news_test_monitor.js';

const T0 = new Date('2026-09-25T10:00:00.000Z');
const SIG = '979c1e71c587928d';
const REAL_LOGIN = 460149329, REAL_SERVER = 'Exness-MT5Real51';

function realHello({ real = true, algo = true, connected = true, login = REAL_LOGIN, server = REAL_SERVER, tradeMode = 2, balance = 100, equity = 100 } = {}) {
  return {
    real_verified: real, profile: 'real',
    checks: { account_readable: true, trade_mode_is_real: real, server_not_demo: real, login_matches_bridge: real, server_matches_bridge: real, login_matches_request: real, server_matches_request: real, terminal_connected: connected, terminal_algo_trading_enabled: algo, symbol_available: true, symbol_matches_request: true },
    account: { login, server, trade_mode: tradeMode, currency: 'USD', balance, equity, margin: 0, margin_free: equity, leverage: 500 },
    terminal: { connected, trade_allowed: algo, build: 6182, path: 'C:\\MT5-REAL' },
    symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 },
  };
}
function demoHello() {
  return { demo_verified: true, checks: { account_readable: true, trade_mode_is_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true },
    account: { login: 480236873, server: 'Exness-MT5Trial11', trade_mode: 0, currency: 'USD', balance: 10000, equity: 10000 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
function tick(clock, over = {}) { return { symbol: 'XAUUSDm', bid: 4265.158, ask: 4265.418, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over }; }
function livePosition({ ticket = 7001, type = 0, price_open = 4265.418, profit = 0, swap = 0, comment = `MCP:${SIG}`, magic = REAL_MAGIC, sl = 4257.658, tp = 4295.418, time = T0.getTime() / 1000, volume = 0.01 } = {}) {
  return { ticket, time, type, magic, identifier: ticket, reason: 3, volume, price_open, sl, tp, price_current: price_open + profit, swap, profit, symbol: 'XAUUSDm', comment };
}
function entryDeal({ ticket = 9101, position_id = 7001, price = 4265.418, time = T0.getTime() / 1000, comment = `MCP:${SIG}`, commission = 0 } = {}) {
  return { ticket, order: ticket, time, type: 0, entry: 0, magic: REAL_MAGIC, position_id, reason: 3, volume: 0.01, price, commission, swap: 0, profit: 0, fee: 0, symbol: 'XAUUSDm', comment };
}
function exitDeal({ ticket = 9102, position_id = 7001, price = 4295.5, profit = 30.08, time = T0.getTime() / 1000 + 600, reason = 3 } = {}) {
  return { ticket, order: ticket, time, type: 1, entry: 1, magic: REAL_MAGIC, position_id, reason, volume: 0.01, price, commission: 0, swap: 0, profit, fee: 0, symbol: 'XAUUSDm', comment: 'MCP close' };
}
class FakeBridge {
  constructor() { this.script = {}; this.calls = []; }
  set(cmd, fn) { this.script[cmd] = fn; }
  async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', `no script for ${cmd}`); const r = fn(params, this); if (r instanceof Error) throw r; return r; }
  count(cmd) { return this.calls.filter((c) => c.cmd === cmd).length; }
  last(cmd) { return this.calls.filter((c) => c.cmd === cmd).at(-1)?.params; }
}
function makeClock(start = T0) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) {
  const store = { state: initial, log: [], kill: { active: false, close: false } };
  store.deps = { loadState: () => (store.state ? JSON.parse(JSON.stringify(store.state)) : loadMt5State('/nonexistent/real.json')), saveState: (_p, s) => { store.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => store.log.push(e), readKillSwitch: () => store.kill, setInterval: () => 'timer', clearInterval: () => {}, sleep: async () => {} };
  store.events = (type) => store.log.filter((e) => e.type === type);
  return store;
}
function healthyRealBridge(clock, { positions = () => ({ positions: [] }) } = {}) {
  const b = new FakeBridge();
  b.set('hello', () => realHello()); b.set('positions', positions); b.set('tick', () => tick(clock)); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] }));
  return b;
}
function buildReal({ bridge, store, clock, env = {} }) {
  const config = resolveRealExecutorConfig(env);
  return createMt5Executor({ config, bridge, statePath: 'mem-real', logPath: 'mem-real', killSwitchPath: 'mem-real', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps });
}
function signalEvent(clock, over = {}) {
  const calculated_at = new Date(clock.now().getTime() - 20_000).toISOString();
  return { signalId: over.signalId ?? SIG, alert: { action: 'BUY', entry: 4265.0, sl: 4260.0, tp1: 4270.0, tp2: 4275.0, rr: 2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at, ...over.alert }, result: { status: 'OK', action: 'BUY', regime: 'BULL_TREND', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: SIG, is_new_event: true }, ...over.result } };
}
function scriptOpen(bridge, { positionId = 7001, price = 4265.418 } = {}) {
  bridge.set('open', (p) => ({ result: { retcode: 10009, deal: 9101, order: positionId, volume: p.volume, price, comment: 'Request executed' }, entry_deal: entryDeal({ position_id: positionId, price }), position_id: positionId, position: livePosition({ ticket: positionId, price_open: price, sl: p.sl, tp: p.tp }), requested_price: price }));
}

describe('REAL executor: account verification is REAL-only', () => {
  it('a DEMO handshake (the currently running terminal) halts the REAL executor: REAL_VERIFICATION_FAILED, no order', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    bridge.set('hello', () => demoHello());
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.mode, 'real');
    assert.equal(st.halted.reason, 'REAL_VERIFICATION_FAILED');
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.executed, false); assert.equal(r.reason, 'HALTED'); assert.equal(bridge.count('open'), 0);
  });
  it('wrong login / wrong server / demo trade mode on an otherwise real-looking handshake all fail closed', async () => {
    for (const bad of [{ login: 480236873 }, { server: 'Exness-MT5Real7' }, { tradeMode: 0 }]) {
      const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
      bridge.set('hello', () => realHello({ real: false, ...bad }));
      const st = await buildReal({ bridge, store, clock }).start();
      assert.equal(st.halted.reason, 'REAL_VERIFICATION_FAILED', JSON.stringify(bad));
    }
  });
  it('the REAL account is rejected by the DEMO executor (existing DEMO protection intact)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    const demo = createMt5Executor({ config: resolveExecutorConfig({}, { mode: 'demo' }), bridge, statePath: 'mem', logPath: 'mem', killSwitchPath: 'mem', log: () => {}, now: clock.now, _deps: store.deps });
    const st = await demo.start();
    assert.equal(st.mode, 'demo');
    assert.equal(st.halted.reason, 'DEMO_VERIFICATION_FAILED');
  });
  it('switching the terminal to demo AFTER a healthy real start is caught per trade', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    const ex = buildReal({ bridge, store, clock });
    assert.equal((await ex.start()).halted, null);
    bridge.set('hello', () => demoHello()); scriptOpen(bridge);
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'REAL_NOT_VERIFIED'); assert.equal(bridge.count('open'), 0);
  });
  it('a config not produced by the REAL policy (mode real without the profile marker) is refused', () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    assert.throws(() => createMt5Executor({ config: { ...resolveRealExecutorConfig({}), real_profile: false }, bridge, log: () => {}, now: clock.now, _deps: store.deps }), /resolveRealExecutorConfig/);
  });
});

describe('REAL executor: order shape, +30/-50 exits, one position, fresh signal, dedup', () => {
  it('opens exactly one 0.01 BUY (user-fixed lot) with REAL magic, a STRUCTURAL broker SL 7.76 below the fill and the +30 monetary TP; persistent intent before send; equity audited', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.executed, true);
    const open = bridge.last('open');
    assert.equal(open.volume, 0.01); assert.equal(open.magic, REAL_MAGIC);
    assert.equal(open.expected_login, REAL_LOGIN); assert.equal(open.expected_server, REAL_SERVER); assert.equal(open.symbol, 'XAUUSDm');
    assert.equal(open.sl, 4257.658); assert.equal(open.tp, 4295.418);
    assert.equal(store.events('INTENT').length, 1); assert.equal(store.events('OPENED').length, 1);
    assert.equal(store.log.findIndex((e) => e.type === 'INTENT') < store.log.findIndex((e) => e.type === 'OPENED'), true);
    const opened = store.events('OPENED')[0];
    assert.equal(opened.mode, 'real'); assert.equal(opened.lot_size, 0.01);
    assert.equal(opened.profit_target_usd, 30); assert.equal(opened.maximum_loss_usd, -50);
    assert.equal(store.events('INTENT')[0].stops_meta.sl_basis, 'STRUCTURAL'); assert.equal(store.events('INTENT')[0].margin_safety.executable, true);
    assert.equal(store.state.position.profit_target_usd, 30); assert.equal(store.state.position.maximum_loss_usd, -50); assert.equal(store.state.position.equity_before_trade, 100); assert.equal(store.state.position.volume, 0.01);
  });
  it('the lot is 0.01 at every equity (500, 71.94, 1e9): no growth scaling, no decline scaling, no broker-safe maximum', async () => {
    for (const equity of [500, 71.94, 1e9]) {
      const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
      bridge.set('hello', () => realHello({ balance: equity, equity })); scriptOpen(bridge);
      const ex = buildReal({ bridge, store, clock });
      await ex.start();
      const r = await ex.executeSignal(signalEvent(clock));
      assert.equal(r.executed, true, `equity ${equity}`);
      assert.equal(bridge.last('open').volume, 0.01); assert.equal(store.state.position.profit_target_usd, 30); assert.equal(store.state.position.maximum_loss_usd, -50);
    }
  });
  it('insufficient margin refuses the trade with MARGIN_SAFETY_VETO (lot never resized) and sends nothing', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    bridge.set('hello', () => ({ ...realHello({ equity: 100, balance: 100 }), account: { ...realHello().account, equity: 100, balance: 100, margin_free: 3, leverage: 200 } })); scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.executed, false); assert.equal(r.reason, 'MARGIN_SAFETY_VETO'); assert.equal(bridge.count('open'), 0);
    assert.equal(store.events('SKIPPED')[0].reason, 'MARGIN_SAFETY_VETO'); assert.equal(r.details.lot, 0.01);
  });
  it('0.02 / 0.03 / 0.10 cannot be configured, and a tampered 0.02 config is refused by the executor', async () => {
    for (const v of ['0.02', '0.03', '0.10']) assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_LOT_SIZE: v }), /user-locked to exactly 0.01/);
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock); scriptOpen(bridge);
    const ex = createMt5Executor({ config: { ...resolveRealExecutorConfig({}), lotSize: 0.02 }, bridge, statePath: 'mem-real', logPath: 'mem-real', killSwitchPath: 'mem-real', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'LOT_ABOVE_HARD_CAP', 'the cap gate refuses first'); assert.equal(bridge.count('open'), 0);
    // Even with BOTH lotSize and maxLotSize tampered, the exact-lot gate refuses.
    const ex2 = createMt5Executor({ config: { ...resolveRealExecutorConfig({}), lotSize: 0.02, maxLotSize: 0.02 }, bridge, statePath: 'mem-real', logPath: 'mem-real', killSwitchPath: 'mem-real', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: makeStore().deps });
    await ex2.start();
    const r2 = await ex2.executeSignal(signalEvent(clock));
    assert.equal(r2.reason, 'LOT_NOT_USER_APPROVED'); assert.equal(bridge.count('open'), 0);
  });
  it('the CLOSED audit carries realised P&L, equity before the trade and equity after the close', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 30.2 })] }));
    bridge.set('hello', () => realHello({ balance: 130.2, equity: 130.2 }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: exitDeal({ profit: 30.2 }) }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: 30.2 })] }));
    await ex.monitorOnce();
    const closed = store.events('CLOSED')[0];
    assert.equal(closed.realised_pnl, 30.2); assert.equal(closed.equity_before_trade, 100); assert.equal(closed.equity_after_close, 130.2); assert.equal(closed.approved_lot, 0.01);
  });
  it('monitor closes at ACTUAL P&L >= +30 (TAKE_PROFIT_BUDGET)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 30.2 })] }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: exitDeal({ profit: 30.2 }) }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: 30.2 })] }));
    const m = await ex.monitorOnce();
    assert.equal(m.action, 'CLOSED'); assert.equal(m.reason, 'TAKE_PROFIT_BUDGET');
    assert.equal(bridge.last('close').magic, REAL_MAGIC);
    assert.equal(store.events('CLOSED')[0].net_pnl, 30.2);
  });
  it('monitor closes at ACTUAL P&L <= -50 (STOP_LOSS_BUDGET) and holds in between', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: -49.9 })] }));
    assert.equal((await ex.monitorOnce()).action, 'HOLD');
    bridge.set('positions', () => ({ positions: [livePosition({ profit: -50.3 })] }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: exitDeal({ profit: -50.3, price: 4215.1 }) }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: -50.3, price: 4215.1 })] }));
    const m = await ex.monitorOnce();
    assert.equal(m.action, 'CLOSED'); assert.equal(m.reason, 'STOP_LOSS_BUDGET');
    assert.equal(store.state.daily.losses, 1);
  });
  it('one MCP position at a time: a second signal is skipped while a position is open (local and broker checks)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    clock.advance(60_000);
    const r = await ex.executeSignal(signalEvent(clock, { signalId: 'deadbeefdeadbeef', result: { signal: { signal_id: 'deadbeefdeadbeef', is_new_event: true } } }));
    assert.equal(r.executed, false); assert.equal(r.reason, 'POSITION_ALREADY_OPEN'); assert.equal(bridge.count('open'), 1);
  });
  it('fresh signal after close: a signal calculated before the last close is refused; a later one is accepted', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [livePosition({ profit: 31 })] }));
    bridge.set('close', () => ({ result: { retcode: 10009 }, exit_deal: exitDeal({ profit: 31, time: clock.now().getTime() / 1000 + 300 }) }));
    bridge.set('deals', () => ({ deals: [entryDeal(), exitDeal({ profit: 31, time: clock.now().getTime() / 1000 + 300 })] }));
    await ex.monitorOnce();
    bridge.set('positions', () => ({ positions: [] }));
    const stale = signalEvent(clock, { signalId: 'aaaaaaaaaaaaaaaa', result: { signal: { signal_id: 'aaaaaaaaaaaaaaaa', is_new_event: true } } }); // calculated_at = now-20s < last_close_at (now+300s)
    const r1 = await ex.executeSignal({ ...stale, signalId: 'aaaaaaaaaaaaaaaa' });
    assert.equal(r1.reason, 'SIGNAL_PREDATES_LAST_CLOSE');
    clock.advance(10 * 60_000);
    const fresh = signalEvent(clock, { signalId: 'bbbbbbbbbbbbbbbb', result: { signal: { signal_id: 'bbbbbbbbbbbbbbbb', is_new_event: true } } });
    scriptOpen(bridge, { positionId: 7002 });
    const r2 = await ex.executeSignal({ ...fresh, signalId: 'bbbbbbbbbbbbbbbb' });
    assert.equal(r2.executed, true);
  });
  it('duplicate / replayed signal id is never executed twice', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = healthyRealBridge(clock);
    scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start(); await ex.executeSignal(signalEvent(clock));
    bridge.set('positions', () => ({ positions: [] }));
    store.state.position = null;
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'DUPLICATE_SIGNAL'); assert.equal(bridge.count('open'), 1);
  });
  it('circuit breakers: two consecutive losses halt new entries for the day', async () => {
    const clock = makeClock(); const store = makeStore({ ...loadMt5State('/nonexistent'), daily: { day: '2026-09-25', completed: 2, realized_net_usd: -100, consecutive_losses: 2, wins: 0, losses: 2 } });
    const bridge = healthyRealBridge(clock); scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    const r = await ex.executeSignal(signalEvent(clock));
    assert.ok(['DAILY_LOSS_LIMIT', 'CONSECUTIVE_LOSS_LIMIT'].includes(r.reason)); assert.equal(bridge.count('open'), 0);
  });
});

describe('REAL executor: restart reconciliation and manual-position isolation', () => {
  it('a PENDING intent left by a crash is resolved from broker history on restart (never resent)', async () => {
    const clock = makeClock();
    const pending = { ...loadMt5State('/nonexistent'), intent: { intent_id: 'i1', decision_id: 'd1', signal_id: SIG, side: 'BUY', status: 'PENDING', created_at: new Date(T0.getTime() - 30_000).toISOString(), requested_price: 4265.418 }, executed_signals: { [SIG]: { status: 'INTENT' } } };
    const store = makeStore(pending); const bridge = healthyRealBridge(clock, { positions: () => ({ positions: [livePosition()] }) });
    bridge.set('history', () => ({ deals: [entryDeal()] })); scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    const st = await ex.start();
    assert.equal(st.halted, null);
    assert.equal(store.state.intent.status, 'RESOLVED_FILLED'); assert.equal(store.state.position.ticket, 7001);
    assert.equal(bridge.count('open'), 0);
    const r = await ex.executeSignal(signalEvent(clock));
    assert.equal(r.reason, 'DUPLICATE_SIGNAL');
  });
  it('a PENDING intent with no fill in history is ABANDONED and never resent', async () => {
    const clock = makeClock();
    const pending = { ...loadMt5State('/nonexistent'), intent: { intent_id: 'i1', decision_id: 'd1', signal_id: SIG, side: 'BUY', status: 'PENDING', created_at: new Date(T0.getTime() - 30_000).toISOString() }, executed_signals: { [SIG]: { status: 'INTENT' } } };
    const store = makeStore(pending); const bridge = healthyRealBridge(clock);
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    assert.equal(store.state.intent.status, 'ABANDONED');
    assert.equal(store.state.executed_signals[SIG].status, 'ABANDONED_UNCONFIRMED');
  });
  it('manual/unrelated positions are never touched: positions are queried by REAL magic only, and a foreign-magic position is not adopted or closed', async () => {
    const clock = makeClock(); const store = makeStore();
    // The bridge filters by magic; simulate a correctly-filtered empty answer while a foreign position exists elsewhere.
    const bridge = healthyRealBridge(clock, { positions: (p) => ({ positions: Number(p.magic) === REAL_MAGIC ? [] : [livePosition({ magic: 12345, comment: 'manual' })] }) });
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    assert.equal(bridge.last('positions').magic, REAL_MAGIC);
    assert.equal(store.state.position, null);
    assert.equal(bridge.count('close'), 0);
  });
  it('an MCP-owned REAL position found on the broker after a restart is adopted (never a second one opened)', async () => {
    const clock = makeClock(); const store = makeStore();
    const bridge = healthyRealBridge(clock, { positions: () => ({ positions: [livePosition()] }) }); scriptOpen(bridge);
    const ex = buildReal({ bridge, store, clock });
    await ex.start();
    assert.equal(store.state.position.ticket, 7001); assert.equal(store.events('ADOPTED_EXISTING_POSITION').length, 1);
    const r = await ex.executeSignal(signalEvent(clock, { signalId: 'cccccccccccccccc', result: { signal: { signal_id: 'cccccccccccccccc', is_new_event: true } } }));
    assert.equal(r.reason, 'POSITION_ALREADY_OPEN'); assert.equal(bridge.count('open'), 0);
  });
  it('DEMO and REAL executors keep independent state even when driven by the same signal', async () => {
    const clock = makeClock();
    const demoStore = makeStore(); const realStore = makeStore();
    const demoBridge = new FakeBridge(); demoBridge.set('hello', () => demoHello()); demoBridge.set('positions', () => ({ positions: [] })); demoBridge.set('tick', () => tick(clock)); demoBridge.set('history', () => ({ deals: [] })); demoBridge.set('deals', () => ({ deals: [] }));
    demoBridge.set('open', (p) => ({ result: { retcode: 10009, deal: 1, order: 5001, volume: p.volume, price: 4265.418 }, entry_deal: { ...entryDeal({ position_id: 5001 }), magic: 88051501 }, position_id: 5001, position: livePosition({ ticket: 5001, magic: 88051501, sl: p.sl, tp: p.tp }), requested_price: 4265.418 }));
    const realBridge = healthyRealBridge(clock); scriptOpen(realBridge);
    const demo = createMt5Executor({ config: resolveExecutorConfig({}, { mode: 'demo' }), bridge: demoBridge, statePath: 'mem-demo', logPath: 'mem-demo', killSwitchPath: 'mem-demo', log: () => {}, now: clock.now, _deps: demoStore.deps });
    const real = buildReal({ bridge: realBridge, store: realStore, clock });
    await demo.start(); await real.start();
    const ev = signalEvent(clock);
    const rd = await demo.executeSignal(ev); const rr = await real.executeSignal(ev);
    assert.equal(rd.executed, true); assert.equal(rr.executed, true);
    assert.equal(demoBridge.last('open').magic, 88051501); assert.equal(realBridge.last('open').magic, REAL_MAGIC);
    assert.equal(demoBridge.last('open').sl, 4260.418, 'demo -5 USD monetary stop (DEMO path unchanged)'); assert.equal(realBridge.last('open').sl, 4257.658, 'real STRUCTURAL fail-safe stop (5 x 1.5 + spread below fill)');
    assert.equal(demoBridge.last('open').volume, 0.01); assert.equal(realBridge.last('open').volume, 0.01);
    assert.equal(demoStore.state.position.ticket, 5001); assert.equal(realStore.state.position.ticket, 7001);
    assert.equal(demoStore.events('OPENED')[0].mode, 'demo'); assert.equal(realStore.events('OPENED')[0].mode, 'real');
  });
});
