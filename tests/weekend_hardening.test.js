/**
 * WEEKEND PRE-MARKET HARDENING (2026-09-26): crash/restart, broker-truth,
 * bridge robustness, market-reopen gate, alert one-shots, Pine veto parity,
 * python bridge fail-closed semantics. Offline only (fake bridges, fake
 * MetaTrader5 module, temp files). Never touches a terminal or a chart.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMt5Executor, loadMt5State, appendTradeLog, readTradeLog, saveMt5State, OPS_ALERT_EVENTS } from '../src/engine/mt5Executor.js';
import { Mt5Bridge, Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { buildDemoParityConfig, DEMO_MAGIC_STAGE12 } from '../src/demo/config.js';
import { permissiveNewsMonitor, memoryProvider } from './fixtures/news_test_monitor.js';
import { createNewsMonitor } from '../src/engine/newsMonitor.js';
import { acquireLock, releaseLock, lockHeldByLiveProcess } from '../src/engine/watcherState.js';
import { trackCycleErrors, DEFAULT_CYCLE_ERROR_ALERT_AFTER } from '../src/engine/watcher.js';
import { calculateEntry, ALL_TIMEFRAMES, detectMaterialDisagreement } from '../src/core/xauusd_calculate.js';
import { buildSignalRecord, DEMO_PROVENANCE } from '../src/demo/evidence.js';
import { DEMO_IDENTITY } from '../src/demo/identityGuard.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const T0 = new Date('2026-09-28T07:00:00.000Z'); // Monday after the weekend
const BID = 4265.158, ASK = 4265.418;

// ---- shared fakes (same shapes as tests/demo_forward_validation.test.js) ----
function demoHello() { return { demo_verified: true, checks: { account_readable: true, trade_mode_is_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true }, account: { login: 480236873, server: 'Exness-MT5Trial11', trade_mode: 0, currency: 'USD', balance: 10000, equity: 10000, margin: 0, margin_free: 10000, leverage: 2000 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5-DEMO' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } }; }
function tick(clock, over = {}) { return { symbol: 'XAUUSDm', bid: BID, ask: ASK, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over }; }
function live(clock, { profit = 0, sl = 4257.658, tp = 4295.418, price_open = ASK, ticket = 7001, magic = DEMO_MAGIC_STAGE12 } = {}) { return { ticket, time: clock.now().getTime() / 1000, type: 0, magic, identifier: ticket, reason: 3, volume: 0.01, price_open, sl, tp, price_current: price_open + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: 'MCP:x' }; }
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } async stop() {} start() {} }
function makeClock(start = T0) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false }, ops: [] }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {}, onOps: (o) => st.ops.push(o) }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function bridgeOk(clock, { tickFn = () => tick(clock), open = null } = {}) { const b = new FakeBridge(); b.set('hello', () => demoHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', tickFn); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] })); b.set('open', open ?? ((p) => { const price = p.side === 'SELL' ? tickFn().bid : tickFn().ask; return { result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: p.magic, position_id: 7001, volume: p.volume, price, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:x' }, position_id: 7001, position: live(clock, { price_open: price, sl: p.sl, tp: p.tp, magic: p.magic }), requested_price: price }; })); return b; }
function build({ bridge, store, clock }) { return createMt5Executor({ config: buildDemoParityConfig({}), bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); }
function sig(clock, id = 'aaaaaaaaaaaaaaaa', over = {}) { const calculated_at = over.calculated_at ?? new Date(clock.now().getTime() - 20_000).toISOString(); const entry = over.entry ?? 4265.0; return { signalId: id, alert: { action: 'BUY', entry, sl: entry - 5, tp1: entry + 5, tp2: entry + 11, rr: 2.2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: 'BUY', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: id, is_new_event: true, thesis_id: `th-${id}`, signal_bar_time: T0 }, diagnostics: { candidate: { model: 'BO', side: 'BUY', anchor: entry - 3 }, objective: { price: entry + 11, source: '5m_pivot' } }, market_data_times: { '5m': clock.now().getTime() / 1000 - 300 } } }; }
const bars5m = ({ count = 60, endSec, halfRange = 0.5 } = {}) => Array.from({ length: count }, (_, i) => ({ time: endSec - (count - i) * 300, open: 4265, high: 4265 + halfRange, low: 4265 - halfRange, close: 4265 }));
async function warm(ex, clock, passes = 60) { await ex.reviewThesis({ result: { primary_confirmed_bars: bars5m({ endSec: clock.now().getTime() / 1000 - 60 }) } }); for (let i = 0; i < passes; i++) { clock.advance(3000); await ex.monitorOnce(); } }

describe('A. broker truth wins: ambiguous sends halt, never resend; halts are audited when a restart clears them', () => {
  it('ORDER_STATE_AMBIGUOUS and POST_SEND_EXCEPTION from the bridge => ORDER_AMBIGUOUS + HALT, intent stays PENDING, no second open, ops alert fired', async () => {
    for (const code of ['ORDER_STATE_AMBIGUOUS', 'POST_SEND_EXCEPTION']) {
      const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock, { open: () => new Mt5BridgeError(code, `bridge says ${code}`, { result: { retcode: 10008 } }) });
      const ex = build({ bridge, store, clock }); await ex.start(); await warm(ex, clock);
      const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'AMBIGUOUS_ORDER_STATE', code);
      assert.equal(store.events('ORDER_AMBIGUOUS').length, 1); assert.equal(store.state.halted.reason, 'AMBIGUOUS_ORDER_STATE'); assert.equal(store.state.intent.status, 'PENDING');
      const r2 = await ex.executeSignal(sig(clock, 'bbbbbbbbbbbbbbbb')); assert.equal(r2.reason, 'HALTED'); assert.equal(bridge.count('open'), 1, 'never resent');
      assert.ok(store.ops.some((o) => o.event_type === 'HALTED' && o.kind === 'MT5_DEMO_HALTED'), 'HALTED reaches the ops hook');
      assert.ok(store.ops.some((o) => o.event_type === 'ORDER_AMBIGUOUS'));
    }
  });
  it('a persisted halt is cleared by the restart AND audited as HALT_CLEARED_BY_RESTART (with the prior reason) + ops alert', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex1 = build({ bridge, store, clock }); await ex1.start(); store.state.halted = { reason: 'AMBIGUOUS_ORDER_STATE', at: clock.now().toISOString(), signal_id: 'x' };
    const ex2 = build({ bridge, store, clock }); await ex2.start();
    const ev = store.events('HALT_CLEARED_BY_RESTART'); assert.equal(ev.length, 1); assert.equal(ev[0].reason, 'AMBIGUOUS_ORDER_STATE'); assert.equal(store.state.halted, null);
    assert.ok(store.ops.some((o) => o.event_type === 'HALT_CLEARED_BY_RESTART'));
  });
  it('REJECTED is surfaced ONCE per reason (no spam); OPENED always; unknown event types never', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock, { open: () => new Mt5BridgeError('ORDER_REJECTED', 'requote', { result: { retcode: 10004 } }) });
    const ex = build({ bridge, store, clock }); await ex.start(); await warm(ex, clock);
    await ex.executeSignal(sig(clock, 'a1a1a1a1a1a1a1a1')); await ex.executeSignal(sig(clock, 'a2a2a2a2a2a2a2a2'));
    assert.equal(store.events('REJECTED').length, 2); assert.equal(store.ops.filter((o) => o.event_type === 'REJECTED').length, 1);
    assert.ok(OPS_ALERT_EVENTS.always.includes('OPENED') && OPS_ALERT_EVENTS.once.includes('REJECTED'));
    assert.equal(store.ops.filter((o) => o.event_type === 'STARTED' || o.event_type === 'SKIPPED').length, 0);
  });
  it('POSITION_GONE_NO_EXIT_DEAL_YET is audited once per position while the monitor keeps waiting (fail-closed, no spam)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock }); await ex.start(); await warm(ex, clock);
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'OPENED');
    bridge.set('positions', () => ({ positions: [] })); bridge.set('deals', () => ({ deals: [] }));
    for (let i = 0; i < 4; i++) { clock.advance(3000); const m = await ex.monitorOnce(); assert.equal(m.action, 'AWAITING_EXIT_DEAL'); }
    assert.equal(store.events('ANOMALY').length, 1); assert.ok(store.state.position, 'position kept until the exit deal is visible');
    assert.equal((await ex.executeSignal(sig(clock, 'cccccccccccccccc'))).reason, 'POSITION_ALREADY_OPEN');
  });
});

describe('B. market-reopen gate: stale feed blocks, fresh tick clears, only a signal computed AFTER the clear may execute', () => {
  it('weekend-stale tick => FEED_STALE block; fresh Monday tick => normalized; pre-clear signal SIGNAL_PREDATES_NORMALIZATION; post-clear signal executes', async () => {
    const clock = makeClock(); const store = makeStore(); let tickAge = 1;
    const bridge = bridgeOk(clock, { tickFn: () => tick(clock, { time: clock.now().getTime() / 1000 - tickAge }) });
    const ex = build({ bridge, store, clock }); await ex.start(); await warm(ex, clock);
    assert.equal(store.state.protection?.blocking ?? false, false);
    tickAge = 50_000; clock.advance(3000); await ex.monitorOnce(); // Friday's last tick, seen on Monday
    assert.equal(store.state.protection.blocking, true); assert.ok(store.state.protection.block_reasons.includes('FEED_STALE'));
    const preClear = sig(clock, 'dddddddddddddddd'); assert.notEqual((await ex.executeSignal(preClear)).reason, 'OPENED'); assert.equal(bridge.count('open'), 0);
    tickAge = 1; clock.advance(3000); await ex.monitorOnce(); // market reopened: fresh tick
    assert.equal(store.state.protection.blocking, false); const clearedAt = store.state.protection.last_block_cleared_at; assert.ok(clearedAt);
    const stale = sig(clock, 'eeeeeeeeeeeeeeee', { calculated_at: new Date(Date.parse(clearedAt) - 10_000).toISOString() });
    assert.equal((await ex.executeSignal(stale)).reason, 'SIGNAL_PREDATES_NORMALIZATION'); assert.equal(bridge.count('open'), 0);
    clock.advance(2000); const fresh = sig(clock, 'ffffffffffffffff', { calculated_at: new Date(Date.parse(clearedAt) + 1000).toISOString() });
    assert.equal((await ex.executeSignal(fresh)).reason, 'OPENED'); assert.equal(bridge.count('open'), 1);
  });
  it('a Friday signal older than maxSignalAgeSec can never execute on Monday (STALE_SIGNAL) and a PENDING intent blocks new entries (PENDING_INTENT_UNRESOLVED)', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock); const ex = build({ bridge, store, clock }); await ex.start(); await warm(ex, clock);
    const friday = sig(clock, '1111111111111111', { calculated_at: new Date(clock.now().getTime() - 60 * 3600 * 1000).toISOString() });
    assert.equal((await ex.executeSignal(friday)).reason, 'STALE_SIGNAL');
    store.state.intent = { status: 'PENDING', signal_id: 'zz', created_at: clock.now().toISOString() };
    const ex2 = build({ bridge, store, clock }); await ex2.start(); // reconcile: no fill in history => ABANDONED, never resent
    assert.equal(store.state.intent.status, 'ABANDONED'); assert.equal(bridge.count('open'), 0);
  });
});

describe('C. persistence robustness', () => {
  it('appendTradeLog never glues an event onto a torn line; readTradeLog recovers every intact event', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    try {
      const p = join(dir, 'audit.jsonl');
      appendTradeLog(p, { type: 'A' }); writeFileSync(p, readFileSync(p, 'utf8') + '{"type":"TORN', { flag: 'a' }); // simulate a crash mid-write
      writeFileSync(p, readFileSync(p, 'utf8').replace(/\n\{"type":"TORN$/, '{"type":"TORN')); // ensure no trailing newline
      appendTradeLog(p, { type: 'B' });
      const rows = readTradeLog(p); assert.deepEqual(rows.map((r) => r.type), ['A', 'B']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a corrupt state file halts STATE_FILE_CORRUPT and the corrupt bytes are preserved as a side copy before any overwrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'state-'));
    try {
      const p = join(dir, 'state.json'); writeFileSync(p, '{"version":1,"executed_signals":{"x":1}, CORRUPT');
      const s = loadMt5State(p); assert.equal(s.halted.reason, 'STATE_FILE_CORRUPT'); assert.ok(s.halted.preserved_copy && existsSync(s.halted.preserved_copy));
      assert.equal(readFileSync(s.halted.preserved_copy, 'utf8'), '{"version":1,"executed_signals":{"x":1}, CORRUPT');
      saveMt5State(p, s); assert.equal(JSON.parse(readFileSync(p, 'utf8')).halted.reason, 'STATE_FILE_CORRUPT');
      assert.ok(readdirSync(dir).some((f) => f.startsWith('state.json.corrupt-')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('signal store writes are atomic (temp + rename) so a crash cannot leave a truncated production store', () => {
    const s = readFileSync(join(ROOT, 'src/engine/signalStore.js'), 'utf8');
    assert.ok(/writeFileSync\(tmp,/.test(s) && /renameSync\(tmp, path\)/.test(s));
  });
});

describe('D. single-instance lock semantics', () => {
  it('re-entrant for the same pid, refused for a live foreign holder, reclaimed for a dead holder; lockHeldByLiveProcess never writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lock-'));
    try {
      const p = join(dir, 'w.lock'); const alive = new Set([111]); const isAlive = (pid) => alive.has(pid);
      assert.equal(acquireLock(p, { isAlive, pid: 111 }).acquired, true);
      assert.deepEqual(acquireLock(p, { isAlive, pid: 111 }), { acquired: true, holderPid: 111, reentrant: true });
      assert.deepEqual(acquireLock(p, { isAlive, pid: 222 }), { acquired: false, holderPid: 111 });
      assert.deepEqual(lockHeldByLiveProcess(p, { isAlive, pid: 222 }), { held: true, holderPid: 111 });
      assert.deepEqual(lockHeldByLiveProcess(p, { isAlive, pid: 111 }), { held: false, holderPid: 111 });
      assert.equal(readFileSync(p, 'utf8'), '111', 'the read-only probe never rewrote the lock');
      alive.clear(); assert.equal(acquireLock(p, { isAlive, pid: 333 }).acquired, true); assert.equal(readFileSync(p, 'utf8'), '333');
      releaseLock(p); // not our pid => untouched
      assert.equal(existsSync(p), true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('E. watcher cycle-error alerting (one-shot + recovery, observability only)', () => {
  it('alerts once after the threshold, once on recovery, and leaves a clean state untouched', () => {
    const ops = []; const deps = { cycleDeps: { notifyOps: (o) => ops.push(o) }, now: () => T0 };
    let s = { last_processed_5m_time: 1 };
    assert.equal(trackCycleErrors({ state: s, error: null, deps }), s, 'no streak => identical state object');
    for (let i = 0; i < DEFAULT_CYCLE_ERROR_ALERT_AFTER + 2; i++) s = trackCycleErrors({ state: s, error: new Error('store corrupt'), deps });
    assert.equal(ops.filter((o) => o.kind === 'WATCHER_CYCLE_ERRORS').length, 1); assert.equal(s.cycle_error_streak, DEFAULT_CYCLE_ERROR_ALERT_AFTER + 2); assert.equal(s.last_processed_5m_time, 1);
    s = trackCycleErrors({ state: s, error: null, deps }); assert.equal(ops.filter((o) => o.kind === 'WATCHER_CYCLE_RECOVERED').length, 1); assert.equal(s.cycle_error_streak, 0); assert.equal(s.cycle_error_alerted_at, null);
    const boom = { cycleDeps: { notifyOps: () => { throw new Error('toast down'); } } };
    assert.doesNotThrow(() => { let t = {}; for (let i = 0; i < 5; i++) t = trackCycleErrors({ state: t, error: new Error('x'), deps: boom }); });
  });
});

describe('F. News V2 calendar: an empty or unusable calendar can never fail OPEN', () => {
  const good = [{ title: 'CPI m/m', country: 'USD', impact: 'High', date: '2026-09-29T12:30:00+00:00' }, { title: 'Bank Holiday', country: 'JPY', impact: 'Holiday', date: '2026-09-29T00:00:00+00:00' }];
  it('empty payload and all-unschedulable payload are rejected as failures: last good events kept, consecutive_failures grows, then a good fetch recovers', async () => {
    let t = T0.getTime(); const now = () => new Date(t);
    const provider = memoryProvider([{ ok: true, raw: good }, { ok: true, raw: [] }, { ok: true, raw: [{ title: 'NFP', country: 'USD', impact: 'High', date: '8:30am' }] }, { ok: true, raw: good }]);
    const m = createNewsMonitor({ provider, now, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    await m.refresh({ now: now(), force: true }); assert.equal(m.events().length, 2); assert.equal(m.status().calendar.status, 'OK');
    t += 1000; await m.refresh({ now: now(), force: true }); assert.equal(m.events().length, 2, 'empty payload did not wipe the cache'); assert.equal(m.status().calendar.error, 'CALENDAR_EMPTY'); assert.equal(m.status().calendar.consecutive_failures, 1);
    t += 1000; await m.refresh({ now: now(), force: true }); assert.equal(m.events().length, 2); assert.equal(m.status().calendar.error, 'CALENDAR_UNUSABLE'); assert.equal(m.status().calendar.consecutive_failures, 2);
    t += 1000; await m.refresh({ now: now(), force: true }); assert.equal(m.status().calendar.error, null); assert.equal(m.status().calendar.consecutive_failures, 0);
  });
  it('with NO cache, an empty calendar leaves status ERROR => DATA_UNAVAILABLE (entries blocked under the REAL BLOCK policy), never NORMAL', async () => {
    const provider = memoryProvider([{ ok: true, raw: [] }]);
    const m = createNewsMonitor({ provider, now: () => T0, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    await m.refresh({ now: T0, force: true }); assert.equal(m.status().calendar.status, 'ERROR');
    const ev = m.evaluate({ now: T0, scheduleRefresh: false }); assert.equal(ev.state, 'DATA_UNAVAILABLE');
  });
});

describe('G. Mt5Bridge sidecar robustness (fake spawn)', () => {
  function fakeChild() { const c = new EventEmitter(); c.stdin = new EventEmitter(); c.stdin.write = (line) => { c.written.push(line); return true; }; c.written = []; c.stdout = new PassThrough(); c.stderr = null; c.exitCode = null; c.killed = false; c.kill = () => { c.killed = true; c.exitCode = -1; setImmediate(() => c.emit('exit', null, 'SIGTERM')); return true; }; return c; }
  it('an async stdin error is caught (no crash), in-flight requests fail BRIDGE_DOWN (ambiguous), onDown fires, the next request respawns', async () => {
    const children = []; const downs = [];
    const b = new Mt5Bridge({ spawnImpl: () => { const c = fakeChild(); children.push(c); setImmediate(() => c.stdout.write(JSON.stringify({ event: 'ready' }) + '\n')); return c; }, requestTimeoutMs: 2000, tradeTimeoutMs: 2000, onDown: (r, d) => downs.push([r, d]) });
    const p = b.request('open', { volume: 0.01 });
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    children[0].stdin.emit('error', new Error('EPIPE'));
    await assert.rejects(p, (e) => e.code === 'BRIDGE_DOWN');
    assert.equal(children[0].killed, true); assert.deepEqual(downs[0][0], 'STDIN_ERROR'); assert.equal(b.status().alive, false);
    const q = b.request('ping'); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    assert.equal(children.length, 2, 'lazily respawned'); children[1].stdout.write(JSON.stringify({ id: JSON.parse(children[1].written[0]).id, ok: true, result: { pong: 1 } }) + '\n');
    assert.deepEqual(await q, { pong: 1 }); assert.equal(b.restarts, 2); await b.stop();
  });
  it('a sidecar that never reports ready is killed on the start timeout; a hung command retires the sidecar on its timeout (kill + BRIDGE_DOWN for the queue)', async () => {
    const children = [];
    const b = new Mt5Bridge({ spawnImpl: () => { const c = fakeChild(); children.push(c); return c; }, requestTimeoutMs: 30, tradeTimeoutMs: 30 });
    await assert.rejects(b.request('ping'), (e) => ['BRIDGE_START_TIMEOUT', 'BRIDGE_DOWN'].includes(e.code));
    await new Promise((r) => setTimeout(r, 10)); assert.equal(children[0].killed, true); assert.equal(b.status().last_down.reason, 'START_TIMEOUT');
    const b2 = new Mt5Bridge({ spawnImpl: () => { const c = fakeChild(); children.push(c); setImmediate(() => c.stdout.write(JSON.stringify({ event: 'ready' }) + '\n')); return c; }, requestTimeoutMs: 40, tradeTimeoutMs: 40 });
    const hung = b2.request('open', {}); const queued = b2.request('tick', {});
    await assert.rejects(hung, (e) => e.code === 'TRADE_REQUEST_TIMEOUT'); await assert.rejects(queued, (e) => ['BRIDGE_DOWN', 'BRIDGE_TIMEOUT'].includes(e.code));
    await new Promise((r) => setTimeout(r, 10)); assert.equal(children.at(-1).killed, true); assert.equal(b2.status().last_down.reason, 'REQUEST_TIMEOUT'); await b2.stop();
  });
});

describe('H. Pine reference veto parity (production authority pinned; DEMO evidence flags the limitation)', () => {
  const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/xauusd_intraday_session_2026-09-25.json'), 'utf8'));
  const CUT = 11; // an end index where the recorded session yields an actionable engine decision (deterministic)
  function byTfAt(cut) { const keys = Object.keys(fx.bars); const pick = (tf) => fx.bars[tf] ?? fx.bars[keys.at(-1)]; const base = {}; for (const tf of ALL_TIMEFRAMES) base[tf] = pick(tf); const n5 = base['5'].length; const out = { ...base, 5: base['5'].slice(0, n5 - cut) }; const endT = out['5'].at(-1).time; for (const tf of ALL_TIMEFRAMES) if (tf !== '5') out[tf] = base[tf].filter((b) => b.time <= endT); return out; }
  function deps(byTf, master) { let cur = '5'; return { getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: cur }), setTimeframe: async ({ timeframe }) => { cur = String(timeframe); return { success: true }; }, getOhlcv: async ({ count }) => ({ bars: byTf[cur].slice(-(count ?? 500)) }), getMasterState: async () => master, loadStore: () => ({ signals: [] }), saveStore: () => {}, storePath: 'mem', withCdpLock: (_p, fn) => fn(), cdpLockPath: 'x', env: {} }; }
  const run = (master) => calculateEntry({ engineProfile: 'intraday_5m', _deps: deps(byTfAt(CUT), master) });
  it('the fixture yields an actionable decision with the Pine reference NOT_FOUND (DEMO validator condition)', async () => {
    const r = await run({ status: 'NOT_FOUND' }); assert.ok(r.action === 'BUY' || r.action === 'SELL', `expected actionable, got ${r.action}/${r.reason}`); assert.equal(r.pine_reference.status, 'NOT_FOUND'); assert.equal(r.engine_disagreement, null);
  });
  it('an OPPOSING actionable Pine reference vetoes to WAIT / ENGINE_DISAGREEMENT with null geometry (production authority); same direction, WAIT or READ_ERROR never change the decision', async () => {
    const base = await run({ status: 'NOT_FOUND' }); const opposite = base.action === 'BUY' ? 'SELL' : 'BUY';
    const veto = await run({ status: 'OK', decision: { action: opposite }, market: { regime: 'X' } });
    assert.equal(veto.action, 'WAIT'); assert.equal(veto.reason, 'ENGINE_DISAGREEMENT'); assert.equal(veto.entry, null); assert.equal(veto.sl, null); assert.equal(veto.engine_disagreement.type, 'ENGINE_DISAGREEMENT'); assert.equal(veto.engine_disagreement.pine_action, opposite);
    assert.equal(detectMaterialDisagreement(base.action, opposite), true);
    const same = await run({ status: 'OK', decision: { action: base.action }, market: {} }); assert.equal(same.action, base.action); assert.equal(same.entry, base.entry);
    const wait = await run({ status: 'OK', decision: { action: 'WAIT' }, market: {} }); assert.equal(wait.action, base.action); assert.equal(wait.engine_disagreement?.type, 'ENGINE_DISAGREEMENT', 'informational only');
    const err = await calculateEntry({ engineProfile: 'intraday_5m', _deps: { ...deps(byTfAt(CUT), null), getMasterState: async () => { throw new Error('chart gone'); } } }); assert.equal(err.action, base.action); assert.equal(err.pine_reference.status, 'READ_ERROR');
  });
  it('DEMO SIGNAL evidence carries the parity flag so production-vs-validator divergence can be reconciled later', () => {
    const rec = buildSignalRecord({ nowSec: 1790500000, signalId: 'abcdefabcdefabcd', result: { status: 'OK', action: 'BUY', pine_reference: { status: 'NOT_FOUND' }, calculated_at: '2026-09-28T07:00:00.000Z' }, alert: { action: 'BUY', entry: 1, sl: 0.5, tp1: 2, tp2: 3, rr: 2 }, exec: { executed: false, reason: 'X' }, provenance: DEMO_PROVENANCE.FORWARD_LIVE_DEMO ?? 'FORWARD_LIVE_DEMO', identity: DEMO_IDENTITY });
    assert.equal(rec.pine_reference_status, 'NOT_FOUND'); assert.equal(rec.pine_parity, 'REFERENCE_UNAVAILABLE_PRODUCTION_MAY_VETO');
  });
});

describe('I. python bridges (offline fake MetaTrader5): unknown is never empty, ambiguous is never rejected, magic allowlist, stop removal refused', () => {
  const python = process.env.XAUUSD_MT5_PYTHON?.split(/\s+/)[0] ?? (process.platform === 'win32' ? 'python' : 'python3');
  const available = spawnSync(python, ['--version'], { encoding: 'utf8' }).status === 0;
  const scenarios = (profile) => { const r = spawnSync(python, [join(ROOT, 'tests/fixtures/fake_mt5_bridge_harness.py'), profile], { encoding: 'utf8', env: { ...process.env, OPENBLAS_NUM_THREADS: '1' }, timeout: 60_000 }); assert.equal(r.status, 0, `harness failed: ${r.stderr}`); const out = {}; for (const l of r.stdout.split('\n').filter(Boolean)) { const o = JSON.parse(l); out[o.scenario] = o; } return out; };
  for (const profile of ['real', 'demo']) {
    it(`${profile} bridge`, { skip: available ? false : 'python not available' }, () => {
      const s = scenarios(profile);
      const expect = { positions_none_is_error: 'POSITIONS_UNAVAILABLE', deals_none_is_error: 'HISTORY_UNAVAILABLE', history_none_is_error: 'HISTORY_UNAVAILABLE', open_wrong_magic: 'MAGIC_NOT_ALLOWED', open_retcode_10008_ambiguous: 'ORDER_STATE_AMBIGUOUS', open_retcode_10012_ambiguous: 'ORDER_STATE_AMBIGUOUS', open_retcode_10004_rejected: 'ORDER_REJECTED', open_post_send_exception: 'POST_SEND_EXCEPTION', open_wrong_volume: 'VOLUME_NOT_ALLOWED', close_positions_none_is_error: 'POSITIONS_UNAVAILABLE', close_wrong_magic: 'MAGIC_NOT_ALLOWED', close_ambiguous_10012: 'CLOSE_STATE_AMBIGUOUS', modify_sl_zero_rejected: 'MODIFY_INVALID_SL', modify_noop_rejected: 'MODIFY_NOOP', modify_wrong_magic: 'MAGIC_NOT_ALLOWED' };
      for (const [k, code] of Object.entries(expect)) { assert.ok(s[k], `missing scenario ${k}`); assert.equal(s[k].ok, false, k); assert.equal(s[k].code, code, k); }
      for (const k of ['open_wrong_magic', 'open_wrong_volume', 'close_wrong_magic', 'modify_sl_zero_rejected', 'modify_noop_rejected', 'modify_wrong_magic', 'positions_none_is_error', 'close_positions_none_is_error']) assert.equal(s[k].orders_sent, 0, `${k} must not send`);
      assert.equal(s.positions_empty_is_empty.ok, true); assert.deepEqual(s.positions_empty_is_empty.result.positions, []);
      assert.equal(s.open_ok.ok, true); assert.equal(s.open_ok.result.position_id, 555); assert.equal(s.close_already_closed.result.already_closed, true); assert.equal(s.modify_ok.ok, true);
      assert.equal(s.hello_reattaches_when_terminal_info_none.ok, true); assert.equal(s.reinit_count.inits_delta, 1); assert.ok(s.reinit_count.shutdowns >= 1);
    });
  }
});
