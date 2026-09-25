/**
 * REAL policy change (2026-09-25): continuous market monitoring, no
 * calendar-day entry lock after a realised loss. The daily-loss lock is
 * disabled for the REAL profile (dailyLossLimitUsd = null); the
 * consecutive-loss breaker (2), kill switch, one-position, fresh-signal,
 * dedup, thesis, lot and structural-exit protections are unchanged. DEMO's
 * own daily-loss limit (25) still applies to DEMO.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { resolveExecutorConfig, evaluateEntry, rollDaily } from '../src/engine/mt5Policy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { runWatcherCycle } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { registerOrGetSignal } from '../src/engine/signalStore.js';
import { permissiveNewsMonitor } from './fixtures/news_test_monitor.js';

const T0 = new Date('2026-09-25T12:00:00.000Z'); // same UTC day as the recorded -50 loss
function realHello({ equity = 71.94, algo = true } = {}) {
  return { real_verified: true, checks: { account_readable: true, trade_mode_is_real: true, server_not_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: algo, symbol_available: true, symbol_matches_request: true },
    account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2, currency: 'USD', balance: equity, equity, margin: 0, margin_free: equity, leverage: 200, margin_so_call: 60, margin_so_so: 0 }, terminal: { connected: true, trade_allowed: algo, build: 6182, path: 'C:\\MT5' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
function tick(clock) { return { symbol: 'XAUUSDm', bid: 4265.158, ask: 4265.418, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0 }; }
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } }
function makeClock(start = T0) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function bridgeOk(clock) { const b = new FakeBridge(); b.set('hello', () => realHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', () => tick(clock)); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] })); b.set('open', (p) => ({ result: { retcode: 10009, deal: 9201, order: 7101, volume: p.volume, price: 4265.418 }, entry_deal: { ticket: 9201, order: 7101, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7101, volume: p.volume, price: 4265.418, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:x' }, position_id: 7101, position: { ticket: 7101, time: clock.now().getTime() / 1000, type: 0, magic: REAL_MAGIC, identifier: 7101, reason: 3, volume: p.volume, price_open: 4265.418, sl: p.sl, tp: p.tp, price_current: 4265.418, swap: 0, profit: 0, symbol: 'XAUUSDm', comment: 'MCP:x' }, requested_price: 4265.418 })); return b; }
function build({ bridge, store, clock }) { return createMt5Executor({ config: resolveRealExecutorConfig({}), bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); }
function sig(clock, id, { ageMs = 20_000 } = {}) { const calculated_at = new Date(clock.now().getTime() - ageMs).toISOString(); return { signalId: id, alert: { action: 'BUY', entry: 4265.0, sl: 4260.0, tp1: 4270.0, tp2: 4275.0, rr: 2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: 'BUY', calculated_at, schema_version: '1.2.0', signal: { signal_id: id, is_new_event: true, thesis_id: 'thesisNew' }, diagnostics: { candidate: { model: 'BO', side: 'BUY', anchor: 4262.0 }, objective: { price: 4275, source: '5m_pivot' } } } }; }

// The recorded state after the audited loss: one completed trade today, -50 realised, 1 consecutive loss, last close 10:08:34Z.
const AFTER_LOSS = () => ({ ...loadMt5State('/nonexistent'), last_close_at: '2026-09-25T10:08:34.000Z', executed_signals: { '3f7f5be75b35983c': { status: 'EXECUTED', ticket: 12983072, at: '2026-09-25T07:41:17.832Z' } }, daily: { day: '2026-09-25', completed: 1, realized_net_usd: -50, consecutive_losses: 1, wins: 0, losses: 1 } });

describe('REAL policy: no calendar-day entry lock after a realised loss', () => {
  it('config: REAL dailyLossLimitUsd is disabled (null); DEMO keeps its own 25', () => {
    assert.equal(resolveRealExecutorConfig({}).dailyLossLimitUsd, null);
    assert.equal(resolveExecutorConfig({}, { mode: 'demo' }).dailyLossLimitUsd, 25);
    assert.equal(resolveRealExecutorConfig({ XAUUSD_MT5_REAL_DAILY_LOSS_LIMIT_USD: '120' }).dailyLossLimitUsd, 120, 'an explicit positive limit may be re-enabled by the user');
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_DAILY_LOSS_LIMIT_USD: '0' }), /positive/);
  });
  it('B/C. after today\'s -50 a genuinely NEW independent valid signal reaches normal evaluation and opens 0.01 (no UTC-day wait)', async () => {
    const clock = makeClock(); const store = makeStore(AFTER_LOSS()); const bridge = bridgeOk(clock);
    bridge.set('history', () => ({ deals: [{ ticket: 12623878, entry: 1, magic: REAL_MAGIC, profit: -50, commission: 0, swap: 0, fee: 0, time: Date.parse('2026-09-25T10:08:34Z') / 1000, position_id: 12983072 }] }));
    const ex = build({ bridge, store, clock }); await ex.start();
    assert.equal(store.state.daily.realized_net_usd, -50); assert.equal(store.state.daily.consecutive_losses, 1, 'history preserved, count truthful');
    const r = await ex.executeSignal(sig(clock, 'newsig0000000001'));
    assert.equal(r.executed, true, JSON.stringify(r));
    assert.equal(bridge.last('open').volume, 0.01);
    assert.ok(!store.events('SKIPPED').some((e) => e.reason === 'DAILY_LOSS_LIMIT'));
  });
  it('D. a signal calculated BEFORE the last close is refused (SIGNAL_PREDATES_LAST_CLOSE), and E. the losing signal id cannot re-enter (DUPLICATE_SIGNAL)', async () => {
    const clock = makeClock(new Date('2026-09-25T10:09:00.000Z')); const store = makeStore(AFTER_LOSS()); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    const stale = sig(clock, 'staleSig00000001', { ageMs: 60_000 }); // calculated 10:08:00, i.e. before the 10:08:34 close, but not yet STALE
    assert.equal((await ex.executeSignal(stale)).reason, 'SIGNAL_PREDATES_LAST_CLOSE');
    assert.equal((await ex.executeSignal(sig(clock, '3f7f5be75b35983c'))).reason, 'DUPLICATE_SIGNAL');
    assert.equal(bridge.count('open'), 0);
  });
  it('E. same thesis cannot immediately re-register while its first signal is OPEN (engine signal store guard unchanged)', () => {
    const store = { signals: [] };
    const first = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '5m', model: 'SR', side: 'SELL', originBar: 1, signalBarTime: 1, entry: 4276, stop_loss: 4281, tp1: 4271, tp2: 4267, rr: 1.75, quality: 68, thesisId: '83fdc96e289232e2' });
    const second = registerOrGetSignal(store, { symbol: 'OANDA:XAUUSD', timeframe: '5m', model: 'SR', side: 'SELL', originBar: 2, signalBarTime: 2, entry: 4276, stop_loss: 4281, tp1: 4271, tp2: 4267, rr: 1.75, quality: 68, thesisId: '83fdc96e289232e2' });
    assert.equal(first.isNew, true); assert.equal(second.isNew, false); assert.equal(second.blockedByOpenThesis, true);
  });
  it('F. the consecutive-loss breaker still stops entries at 2; a win resets the count', async () => {
    const twoLosses = { ...AFTER_LOSS(), daily: { day: '2026-09-25', completed: 2, realized_net_usd: -100, consecutive_losses: 2, wins: 0, losses: 2 } };
    const clock = makeClock(); const store = makeStore(twoLosses); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    const r = await ex.executeSignal(sig(clock, 'afterTwoLosses01'));
    assert.equal(r.reason, 'CONSECUTIVE_LOSS_LIMIT'); assert.equal(bridge.count('open'), 0);
    const cfg = resolveRealExecutorConfig({});
    const base = { config: cfg, signal: { signal_id: 'q', action: 'BUY', entry: 4265, calculated_at: new Date(T0.getTime() - 1000).toISOString() }, market: { ...tick(makeClock()), tick_time: T0.getTime() / 1000 - 1, now_sec: T0.getTime() / 1000 }, broker: { real_verified: true, connected: true, algo_trading_enabled: true }, brokerPositions: [], killSwitch: { active: false }, now: T0 };
    assert.equal(evaluateEntry({ ...base, state: { executed_signals: {}, daily: { day: '2026-09-25', completed: 3, realized_net_usd: -70, consecutive_losses: 0, wins: 1, losses: 2 } } }).allowed, true, 'a win in between resets the streak; -70 realised is not a lock');
  });
  it('G. kill switch still blocks entries and can force a close', async () => {
    const clock = makeClock(); const store = makeStore(AFTER_LOSS()); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    store.kill = { active: true, close: false };
    assert.equal((await ex.executeSignal(sig(clock, 'killswitchtest01'))).reason, 'KILL_SWITCH');
    assert.equal(bridge.count('open'), 0);
  });
  it('H. one MCP position at a time still holds after the change', async () => {
    const clock = makeClock(); const store = makeStore(AFTER_LOSS()); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start();
    assert.equal((await ex.executeSignal(sig(clock, 'first00000000001'))).executed, true);
    clock.advance(60_000);
    assert.equal((await ex.executeSignal(sig(clock, 'second0000000001'))).reason, 'POSITION_ALREADY_OPEN');
    assert.equal(bridge.count('open'), 1);
  });
  it('K. DEMO isolation: a DEMO config at -25 realised is still locked by ITS daily limit (DEMO semantics untouched)', () => {
    const demo = resolveExecutorConfig({}, { mode: 'demo' });
    const v = evaluateEntry({ config: demo, state: { executed_signals: {}, daily: { day: '2026-09-25', completed: 1, realized_net_usd: -25, consecutive_losses: 1, wins: 0, losses: 1 } }, signal: { signal_id: 'd', action: 'BUY', entry: 4265, calculated_at: new Date(T0.getTime() - 1000).toISOString() }, market: { ...tick(makeClock()), tick_time: T0.getTime() / 1000 - 1, now_sec: T0.getTime() / 1000 }, broker: { demo_verified: true, connected: true, algo_trading_enabled: true }, brokerPositions: [], killSwitch: { active: false }, now: T0 });
    assert.equal(v.reason, 'DAILY_LOSS_LIMIT');
  });
  it('daily counters roll at the UTC day change exactly as before (existing semantics, reported not changed)', () => {
    const d = { day: '2026-09-25', completed: 1, realized_net_usd: -50, consecutive_losses: 1, wins: 0, losses: 1 };
    assert.deepEqual(rollDaily(d, new Date('2026-09-25T23:59:59Z')), d);
    assert.equal(rollDaily(d, new Date('2026-09-26T00:00:01Z')).consecutive_losses, 0);
  });
});

describe('REAL policy: market analysis never stops after a loss (watcher level)', () => {
  it('A. a skipped/losing execution leaves the watcher analysing every later confirmed candle', async () => {
    let analyses = 0;
    const mk = (t) => ({ status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', calculated_at: new Date().toISOString(), diagnostics: { source_timeframe: '5m' }, primary_confirmed_bars: [{ time: t, open: 1, high: 1, low: 1, close: 1 }] });
    let candleTime = 5300;
    const deps = { isCdpReachable: async () => true, peekLatest5mCandle: async () => ({ time: candleTime }), analyzeMarket: async () => { analyses += 1; return mk(candleTime); }, notify: () => {}, reviewOpenPosition: async () => ({ action: 'NO_POSITION' }), executeSignal: async () => ({ executed: false, reason: 'CONSECUTIVE_LOSS_LIMIT' }) };
    let state = { ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: 5000, last_connection_ok: true };
    for (let k = 0; k < 4; k++) { const r = await runWatcherCycle({ state, deps, log: () => {} }); state = r.state; candleTime += 300; }
    assert.equal(analyses, 4, 'four new confirmed candles -> four full analyses');
  });
});
