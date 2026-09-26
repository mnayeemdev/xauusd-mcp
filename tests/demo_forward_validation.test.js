/**
 * STAGE 12 — CONTROLLED DEMO FORWARD VALIDATION (12A/12B/12C). src/demo/*. No network, no MT5, no orders.
 * Covers: DEMO identity guard (REAL login/server, non-demo account, wrong symbol, wrong lot, missing identity
 * all hard-blocked), strategy/config parity, decision parity of the injected feed deps, evidence schema /
 * provenance / append-only / dedup / restart / delayed outcomes / no future fields, executor parity gates
 * (news, shock, spread, stale quote, breaker, stale signal, duplicate, fresh-signal-after-news), blocked-signal
 * evidence, reconciliation, static isolation (no shadow<->demo import, no production import of src/demo, no
 * trading function in the feed reader), REAL configuration untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_IDENTITY, TRADE_COMMANDS, verifyDemoIdentity, createGuardedBridge, DemoIdentityError } from '../src/demo/identityGuard.js';
import { buildDemoParityConfig, parityReport, DEMO_MAGIC_STAGE12, PARITY_FIELDS } from '../src/demo/config.js';
import { DEMO_SCHEMA_VERSION, DEMO_PROVENANCE, FORWARD_DEMO, provenanceFor, buildSignalRecord, buildExecutionRecord, labelSignalOutcome, validateRecord, createDemoEvidenceStore, recordId, OUTCOME_HORIZONS } from '../src/demo/evidence.js';
import { createEngineFeedDeps, FEED_COMMANDS, ENGINE_TIMEFRAMES, createFeedReader } from '../src/demo/feed.js';
import { buildDemoValidator, createValidatorCycle, preStartGate, DEMO_PATHS } from '../src/demo/validator.js';
import { buildDemoReport, STAGE12_STATUSES, STAGE12_GATES } from '../src/demo/report.js';
import { analyzeMarket } from '../src/core/xauusd_analyze_market.js';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { resolveRealExecutorConfig } from '../src/engine/mt5RealPolicy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { scriptedNewsMonitor, permissiveNewsMonitor } from './fixtures/news_test_monitor.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const T0 = 1790337600; // 2026-09-25T12:00:00Z
const BID = 4265.158, ASK = 4265.418, SPREAD = 0.26;
const tmp = () => { const d = join(tmpdir(), `demo_fwd_test_${process.pid}_${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); return d; };
function demoHello(over = {}) { return { demo_verified: true, checks: { account_readable: true, trade_mode_is_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true }, account: { login: 480236873, server: 'Exness-MT5Trial11', trade_mode: 0, currency: 'USD', balance: 10000, equity: 10000, margin: 0, margin_free: 10000, leverage: 2000, ...(over.account ?? {}) }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5-DEMO' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, ...(over.symbol ?? {}) }, ...(over.top ?? {}) }; }
const realLike = () => demoHello({ account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2 }, top: { demo_verified: false } });
const tick = (clock, over = {}) => ({ symbol: 'XAUUSDm', bid: BID, ask: ASK, time: clock.now().getTime() / 1000 - 1, spread_price: SPREAD, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over });
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } async stop() {} start() {} }
function makeClock(start = new Date('2026-09-25T10:00:00.000Z')) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function live(clock, { profit = 0, sl = 4257.658, tp = 4295.418, price_open = ASK, ticket = 7001, magic = DEMO_MAGIC_STAGE12 } = {}) { return { ticket, time: clock.now().getTime() / 1000, type: 0, magic, identifier: ticket, reason: 3, volume: 0.01, price_open, sl, tp, price_current: price_open + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: 'MCP:x' }; }
function bridgeOk(clock, { hello = () => demoHello(), tickFn = () => tick(clock) } = {}) { const b = new FakeBridge(); b.set('hello', hello); b.set('positions', () => ({ positions: [] })); b.set('tick', tickFn); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] })); b.set('open', (p) => { const price = p.side === 'SELL' ? tickFn().bid : tickFn().ask; return { result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: p.magic, position_id: 7001, volume: p.volume, price, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:x' }, position_id: 7001, position: live(clock, { price_open: price, sl: p.sl, tp: p.tp, magic: p.magic }), requested_price: price }; }); return b; }
function build({ bridge, store, clock, env = {}, newsMonitor = permissiveNewsMonitor() }) { const config = buildDemoParityConfig(env); return createMt5Executor({ config, bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor, _deps: store.deps }); }
function sig(clock, id = 'aaaaaaaaaaaaaaaa', over = {}) { const calculated_at = over.calculated_at ?? new Date(clock.now().getTime() - 20_000).toISOString(); const entry = over.entry ?? 4265.0; return { signalId: id, alert: { action: over.action ?? 'BUY', entry, sl: entry - 5, tp1: entry + 5, tp2: entry + 11, rr: 2.2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: over.action ?? 'BUY', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: id, is_new_event: true, thesis_id: `th-${id}`, signal_bar_time: T0 }, diagnostics: { candidate: { model: 'BO', side: over.action ?? 'BUY', anchor: entry - 3 }, objective: { price: entry + 11, source: '5m_pivot' } }, market_data_times: { '5m': clock.now().getTime() / 1000 - 300 } } }; }
const bars5m = ({ count = 60, endSec, halfRange = 0.5 } = {}) => Array.from({ length: count }, (_, i) => ({ time: endSec - (count - i) * 300, open: 4265, high: 4265 + halfRange, low: 4265 - halfRange, close: 4265 }));
async function warm(ex, clock, passes = 60) { await ex.reviewThesis({ result: { primary_confirmed_bars: bars5m({ endSec: clock.now().getTime() / 1000 - 60 }) } }); for (let i = 0; i < passes; i++) { clock.advance(3000); await ex.monitorOnce(); } }

describe('A. DEMO account identity guard: fail closed on any mismatch', () => {
  it('accepts the exact DEMO identity; rejects REAL login, REAL server, non-demo trade mode, wrong symbol, non-0.01 lot and missing identity', () => {
    assert.equal(verifyDemoIdentity(demoHello(), { params: { symbol: 'XAUUSDm', volume: 0.01 } }).ok, true);
    assert.deepEqual(DEMO_IDENTITY, { login: 480236873, server: 'Exness-MT5Trial11', symbol: 'XAUUSDm', lot: 0.01, trade_mode_demo: 0, account_class: 'DEMO' }); assert.deepEqual([...TRADE_COMMANDS], ['open', 'close', 'modify']);
    const rl = verifyDemoIdentity(demoHello({ account: { login: 460149329 } })); assert.equal(rl.ok, false); assert.ok(rl.reasons.some((r) => r.startsWith('LOGIN_MISMATCH')));
    assert.ok(verifyDemoIdentity(demoHello({ account: { server: 'Exness-MT5Real51' } })).reasons.some((r) => r.startsWith('SERVER_MISMATCH')));
    assert.ok(verifyDemoIdentity(demoHello({ account: { trade_mode: 2 } })).reasons.some((r) => r.startsWith('ACCOUNT_NOT_DEMO')));
    assert.ok(verifyDemoIdentity(demoHello({ symbol: { name: 'XAUUSD' } })).reasons.some((r) => r.startsWith('SYMBOL_MISMATCH')));
    assert.ok(verifyDemoIdentity(demoHello(), { params: { volume: 0.02 } }).reasons.some((r) => r.startsWith('LOT_NOT_EXACT'))); assert.ok(verifyDemoIdentity(demoHello(), { params: { volume: 0.1 } }).reasons.some((r) => r.startsWith('LOT_NOT_EXACT')));
    assert.ok(verifyDemoIdentity(demoHello(), { params: { symbol: 'XAUUSD' } }).reasons.some((r) => r.startsWith('ORDER_SYMBOL_MISMATCH')));
    const missing = verifyDemoIdentity({ demo_verified: true, symbol: { name: 'XAUUSDm' } }); assert.ok(missing.reasons.includes('ACCOUNT_IDENTITY_MISSING')); assert.ok(verifyDemoIdentity(null).reasons.includes('ACCOUNT_IDENTITY_MISSING'));
    const real = verifyDemoIdentity(realLike()); assert.equal(real.ok, false); assert.ok(real.reasons.length >= 4, 'a REAL hello fails on login, server, trade mode and bridge verification simultaneously');
  });
  it('guarded bridge: every trade command is preceded by a FRESH hello; a REAL/mismatched identity blocks the order with no fallback; read-only commands pass without a hello; blocks are counted and reported', async () => {
    let helloReturns = demoHello(); const b = new FakeBridge(); b.set('hello', () => helloReturns); b.set('tick', () => ({ ok: true })); b.set('open', (p) => ({ result: { retcode: 10009 }, params: p })); b.set('close', () => ({ ok: true })); b.set('modify', () => ({ ok: true }));
    const blocks = []; const g = createGuardedBridge(b, { onBlock: (x) => blocks.push(x) });
    await g.request('tick', {}); assert.equal(b.count('hello'), 0, 'read-only commands never trigger identity hello');
    const r = await g.request('open', { symbol: 'XAUUSDm', volume: 0.01, expected_login: 480236873, expected_server: 'Exness-MT5Trial11' }); assert.equal(r.result.retcode, 10009); assert.equal(b.count('hello'), 1);
    await assert.rejects(g.request('open', { symbol: 'XAUUSDm', volume: 0.02 }), DemoIdentityError); assert.equal(b.count('open'), 1, 'no order was sent for the wrong lot');
    helloReturns = realLike(); await assert.rejects(g.request('open', { symbol: 'XAUUSDm', volume: 0.01 }), /DEMO_ACCOUNT_MISMATCH/); await assert.rejects(g.request('close', { ticket: 1 }), /DEMO_ACCOUNT_MISMATCH/); await assert.rejects(g.request('modify', { ticket: 1 }), /DEMO_ACCOUNT_MISMATCH/);
    assert.equal(b.count('open'), 1); assert.equal(b.count('close'), 0); assert.equal(b.count('modify'), 0); assert.equal(g.stats.blocked, 4); assert.equal(blocks.length, 4); assert.ok(blocks.at(-1).reasons.some((x) => x.startsWith('LOGIN_MISMATCH')));
    b.set('hello', () => { throw new Error('bridge down'); }); await assert.rejects(g.request('open', { symbol: 'XAUUSDm', volume: 0.01 }), /HELLO_FAILED/); assert.equal(b.count('open'), 1, 'an unverifiable identity is a block, never a retry into the unknown');
    assert.equal(b.count('hello') >= 5, true, 'hello is fresh for every trade command');
  });
});

describe('B. strategy parity: DEMO config equals the REAL envelope except identity/destination; decision path identical for identical input', () => {
  it('parity fields equal REAL defaults; identity/magic differ; lot exactly 0.01 even if env tries otherwise; REAL env never leaks; no REAL-only sizing markers', () => {
    const c = buildDemoParityConfig({ XAUUSD_MT5_LOT_SIZE: '0.05', XAUUSD_MT5_MAX_LOT_SIZE: '1', XAUUSD_MT5_REAL_LOGIN: '460149329', XAUUSD_MT5_MAX_CONSECUTIVE_LOSSES: '5', XAUUSD_MT5_TRADE_BUDGET_USD: '10' });
    assert.equal(c.mode, 'demo'); assert.equal(c.login, 480236873); assert.equal(c.server, 'Exness-MT5Trial11'); assert.equal(c.symbol, 'XAUUSDm'); assert.equal(c.lotSize, 0.01); assert.equal(c.maxLotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(c.magic, DEMO_MAGIC_STAGE12);
    const real = resolveRealExecutorConfig({}); assert.notEqual(c.magic, real.magic); assert.notEqual(c.login, real.login); assert.notEqual(c.server, real.server);
    assert.equal(c.profitTargetUsd, 30); assert.equal(c.maximumLossUsd, -50); assert.equal(c.maxConsecutiveLosses, 2); assert.equal(c.maxTradesPerDay, real.maxTradesPerDay); assert.equal(c.minEffectiveRr, 1.7); assert.equal(c.thesisExit, true); assert.equal(c.brokerStructuralSlMultiple, real.brokerStructuralSlMultiple); assert.equal(c.newsProtection, true); assert.deepEqual(c.newsRiskParams, real.newsRiskParams); assert.deepEqual(c.shockParams, real.shockParams); assert.equal(c.newsDataUnavailablePolicy, 'BLOCK');
    assert.equal(c.computeSizing, undefined); assert.equal(c.real_profile, undefined); assert.equal(c.account_class, 'DEMO'); assert.ok(Object.isFrozen(c));
    const p = parityReport(c); assert.equal(p.all_parity_fields_equal, true); assert.ok(PARITY_FIELDS.includes('minEffectiveRr')); assert.equal(p.identity.login.must_differ, true);
  });
  it('the feed-backed engine deps produce the SAME decision as chart-style prefetched deps for identical bars; the sweep never touches a chart', async () => {
    let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; const mk = (tfSec, n) => { let px = 4200; return Array.from({ length: n }, (_, i) => { const t = T0 - (n - i) * tfSec; const o = px; px += (rnd() - 0.5) * 4; const c = px; return { time: t, open: o, high: Math.max(o, c) + rnd(), low: Math.min(o, c) - rnd(), close: c, volume: 100 + Math.floor(rnd() * 50) }; }); };
    const byTf = Object.fromEntries(ENGINE_TIMEFRAMES.map((tf) => [tf, mk({ 5: 300, 15: 900, 30: 1800, 60: 3600, 120: 7200, 240: 14400, 480: 28800, D: 86400, W: 604800, M: 2592000 }[tf], 500)]));
    const calls = []; const feed = { rates: async (sym, tf, count) => { calls.push([sym, tf, count]); return { ok: true, bars: byTf[tf] }; }, tick: async () => ({ ok: true, tick: { time: T0, bid: 4200, ask: 4200.26 } }), ping: async () => ({ ok: true, connected: true }) };
    const fd = createEngineFeedDeps({ feed, storePath: join(tmp(), 'store.json'), now: () => new Date(T0 * 1000), env: {} }); await fd.sweep();
    assert.deepEqual(calls.map((c) => c[1]), [...ENGINE_TIMEFRAMES]); assert.ok(calls.every((c) => c[0] === 'XAUUSDm' && c[2] === 500));
    let cur = '5'; const chartStyle = { getState: async () => ({ success: true, symbol: 'XAUUSDm', resolution: cur }), setTimeframe: async ({ timeframe }) => { cur = String(timeframe); return { success: true }; }, getOhlcv: async ({ count }) => ({ bars: byTf[cur].slice(-count) }), withCdpLock: (_p, fn) => fn(), cdpLockPath: 'x', storePath: join(tmp(), 'store2.json'), env: { XAUUSD_ALLOWED_SYMBOLS: 'XAUUSDm' }, getMasterState: fd.deps.getMasterState };
    const a = await analyzeMarket({ _deps: fd.deps, persistSignals: false, engineProfile: 'intraday_5m' }); const b = await analyzeMarket({ _deps: chartStyle, persistSignals: false, engineProfile: 'intraday_5m' });
    const strip = (r) => { const { calculated_at, ...rest } = r; void calculated_at; return JSON.stringify(rest).replace(/"pattern_id":"([A-Z_]+_\d+)_\d+"/g, '"pattern_id":"$1"'); }; // the classical-pattern detector keeps a process-wide id counter; ids are labels, not decisions
    assert.equal(strip(a), strip(b), 'identical bars => identical decision object (only the wall-clock stamp differs)'); assert.notEqual(a.status, 'SYMBOL_NOT_APPROVED', 'the broker symbol is an approved alias for the validator process'); assert.equal(a.engine_profile ?? 'intraday_5m', 'intraday_5m');
    const ms = await fd.deps.getMasterState(); assert.equal(ms.status, 'NOT_FOUND', 'the validator never reads the Pine reference from the chart'); assert.ok(!('connect' in fd.deps));
    assert.equal(fd.deps.cdpLockPath, 'unused-by-demo-feed');
  });
});

describe('C. evidence: schema, provenance, append-only, dedup, restart, delayed outcomes, no future fields', () => {
  const ex = { executed: false, reason: 'NEWS_ENTRY_BLOCK', details: { guard: 'news' } };
  const mkSig = (nowSec, over = {}) => buildSignalRecord({ nowSec, signalId: over.id ?? 'sig-1', result: { calculated_at: new Date((T0 + 300 + 20) * 1000).toISOString(), signal: { signal_id: over.id ?? 'sig-1', thesis_id: 't1', signal_bar_time: T0 }, symbol: 'OANDA:XAUUSD', engine_profile: 'intraday_5m' }, alert: { action: over.side ?? 'BUY', entry: 4000, sl: 3995, tp1: 4011, tp2: 4020, rr: 2.2, quality: 70, setup: 'BO' }, exec: over.exec ?? ex, ctx: { news: { state: 'PRE_NEWS' }, news_tier: 'B', shock_state: 'NORMAL', breaker: { consecutive_losses: 0 } }, provenance: over.prov ?? provenanceFor({ decisionSec: T0 + 320, nowSec }), identity: DEMO_IDENTITY });
  it('SIGNAL records are FORWARD_LIVE_DEMO only within 15 min of the decision time, carry the DEMO identity and lot 0.01, and can never contain future fields', () => {
    const s = mkSig(T0 + 400); assert.equal(s.provenance, FORWARD_DEMO); assert.equal(validateRecord(s).ok, true); assert.equal(s.account_class, 'DEMO'); assert.equal(s.lot, 0.01); assert.equal(s.execution_status, 'BLOCKED:NEWS_ENTRY_BLOCK'); assert.equal(s.block_guard, 'news'); assert.equal(s.news_tier, 'B');
    assert.equal(provenanceFor({ decisionSec: T0, nowSec: T0 + 901 }), 'BACKFILL'); assert.equal(provenanceFor({ decisionSec: T0, nowSec: T0 + 86401 }), null); assert.equal(provenanceFor({ decisionSec: T0, nowSec: T0, mode: 'REPLAY' }), 'HISTORICAL_REPLAY'); assert.equal(provenanceFor({ decisionSec: T0, nowSec: T0, mode: 'TEST' }), 'TEST');
    assert.ok(validateRecord({ ...s, provenance: FORWARD_DEMO, created_at_utc: new Date((T0 + 320 + 901) * 1000).toISOString() }).errors.includes('FORWARD_FRESHNESS')); assert.ok(validateRecord({ ...s, realized_pnl: 3 }).errors.includes('FUTURE_FIELD:realized_pnl')); assert.ok(validateRecord({ ...s, lot: 0.02 }).errors.includes('LOT')); assert.ok(validateRecord({ ...s, account_class: 'REAL' }).errors.includes('ACCOUNT_CLASS')); assert.ok(validateRecord({ ...s, provenance: 'LIVE' }).errors.includes('PROVENANCE'));
    assert.deepEqual([...DEMO_PROVENANCE], ['FORWARD_LIVE_DEMO', 'BACKFILL', 'HISTORICAL_REPLAY', 'TEST']); assert.equal(DEMO_SCHEMA_VERSION, 'demo-forward-1.0');
  });
  it('store: append-only newline records, duplicate rejected, restart rebuilds the index, malformed trailing line skipped and counted, no update/delete', () => {
    const files = {}; const deps = { append: (p, l) => { files[p] = (files[p] ?? '') + l; }, read: (p) => files[p] ?? '', mkdir: () => {}, write: (p, s) => { files[p] = s; } };
    const st = createDemoEvidenceStore({ dir: 'mem', deps }); const s = mkSig(T0 + 400); assert.deepEqual(st.append(s), { ok: true }); assert.equal(st.append(s).reason, 'DUPLICATE'); assert.equal(st.append({ ...s, provenance: 'X' }).reason, 'INVALID');
    files[st.path] += '{"schema_version":"demo-forward-1.0","kind":"SIG'; const st2 = createDemoEvidenceStore({ dir: 'mem', deps }); assert.equal(st2.append(s).reason, 'DUPLICATE'); assert.equal(st2.stats().malformed_lines, 1); assert.equal(st2.readAll().length, 1); assert.equal(st2.update, undefined); assert.equal(st2.delete, undefined);
  });
  it('outcomes: null before the horizon, only bars inside (decision, horizon end], INCOMPLETE when bars are missing, TP1/SL first-touch geometry, R multiples; provenance inherited from the signal', () => {
    const s = mkSig(T0 + 400, { exec: { executed: true } }); const up = (n) => Array.from({ length: n }, (_, i) => ({ time: T0 + 300 + i * 300, open: 4000 + i * 0.5, high: 4000 + i * 0.5 + 0.6, low: 4000 + i * 0.5 - 0.3, close: 4000 + (i + 1) * 0.5 }));
    assert.equal(labelSignalOutcome({ signal: s, horizonKey: 'h12', bars5: up(60), nowSec: T0 + 300 + 12 * 300 - 1, provenance: s.provenance }), null);
    const o = labelSignalOutcome({ signal: s, horizonKey: 'h12', bars5: up(60), nowSec: T0 + 300 + 12 * 300, provenance: s.provenance }); assert.equal(o.status, 'LABELED'); assert.equal(validateRecord(o).ok, true); assert.equal(o.last_bar_time_used, T0 + 300 + 11 * 300); assert.ok(o.side_signed_move_usd > 0); assert.equal(o.provenance, FORWARD_DEMO);
    const g = labelSignalOutcome({ signal: s, horizonKey: 'h48', bars5: up(60), nowSec: T0 + 300 + 48 * 300, provenance: s.provenance }); assert.equal(g.geometry.touch, 'TP1'); assert.equal(g.geometry.r_multiple, 2.2);
    const inc = labelSignalOutcome({ signal: s, horizonKey: 'h24', bars5: up(5), nowSec: T0 + 300 + 24 * 300, provenance: s.provenance }); assert.equal(inc.status, 'INCOMPLETE_PATH'); assert.equal(inc.bars_found, 5); assert.equal(validateRecord(inc).ok, true);
    assert.ok(validateRecord({ ...o, labeled_at_utc: new Date((o.horizon_end_time - 1) * 1000).toISOString() }).errors.includes('LABELED_BEFORE_HORIZON')); assert.equal(o.record_id, recordId('OUTCOME', 'sig-1', 'h12')); assert.deepEqual(Object.keys(OUTCOME_HORIZONS), ['h12', 'h24', 'h48']);
  });
  it('EXECUTION records mirror executor audit rows with broker identifiers and identity, never a fabricated fill', () => {
    const e = buildExecutionRecord({ nowSec: T0 + 500, auditRecord: { timestamp: new Date((T0 + 450) * 1000).toISOString(), type: 'OPENED', signal_id: 'sig-1', ticket: 7001, account_login: 480236873, account_server: 'Exness-MT5Trial11', side: 'BUY', lot_size: 0.01, requested_price: 4000, price: 4000.12, broker_response: { retcode: 10009, deal: 9101, order: 7001, price: 4000.12 } }, provenance: FORWARD_DEMO });
    assert.equal(validateRecord(e).ok, true); assert.equal(e.retcode, 10009); assert.equal(e.deal, 9101); assert.equal(e.fill_price, 4000.12); assert.equal(e.account_login, 480236873);
    const noFill = buildExecutionRecord({ nowSec: T0 + 500, auditRecord: { timestamp: new Date((T0 + 450) * 1000).toISOString(), type: 'SKIPPED', signal_id: 'sig-2', reason: 'NEWS_ENTRY_BLOCK' }, provenance: FORWARD_DEMO }); assert.equal(noFill.fill_price, null); assert.equal(noFill.requested_price, null);
  });
});

describe('D. executor parity on the DEMO account: every production gate applies; a guarded REAL identity can never receive an order', () => {
  it('a fresh genuine signal executes on DEMO at exactly 0.01 with the Stage 12 magic after a fresh identity hello; the same signal id is then a DUPLICATE; a stale signal is rejected', async () => {
    const clock = makeClock(); const store = makeStore(); const raw = bridgeOk(clock); const g = createGuardedBridge(raw); const ex = createMt5Executor({ config: buildDemoParityConfig({}), bridge: g, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps });
    const st = await ex.start(); assert.equal(st.halted, null); assert.equal(store.events('PROTECTION_STARTED').length, 1, 'News Protection V2 layer is active on DEMO');
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.executed, true, r.reason); assert.equal(raw.last('open').volume, 0.01); assert.equal(raw.last('open').magic, DEMO_MAGIC_STAGE12); assert.equal(raw.last('open').symbol, 'XAUUSDm'); assert.equal(raw.last('open').expected_login, 480236873);
    const helloIdx = raw.calls.findIndex((c, i) => c.cmd === 'hello' && raw.calls.slice(i + 1).some((x) => x.cmd === 'open')); assert.ok(helloIdx >= 0, 'identity hello precedes the order');
    assert.equal((await ex.executeSignal(sig(clock))).reason, 'DUPLICATE_SIGNAL');
    raw.set('positions', () => ({ positions: [] })); const c2 = makeClock(); const s2 = makeStore(); const ex2 = build({ bridge: bridgeOk(c2), store: s2, clock: c2 }); await ex2.start(); assert.equal((await ex2.executeSignal(sig(c2, 'bbbbbbbbbbbbbbbb', { calculated_at: new Date(c2.now().getTime() - 700_000).toISOString() }))).reason, 'STALE_SIGNAL');
  });
  it('REAL identity hard block: if the broker hello ever reports the REAL account, no order is sent even though every strategy gate passed; the failure is audited, never retried into REAL', async () => {
    const clock = makeClock(); const store = makeStore(); let hello = demoHello(); const raw = bridgeOk(clock, { hello: () => hello }); const g = createGuardedBridge(raw); const ex = createMt5Executor({ config: buildDemoParityConfig({}), bridge: g, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); await ex.start();
    hello = realLike(); const r = await ex.executeSignal(sig(clock)); assert.equal(r.executed, false); assert.equal(raw.count('open'), 0, 'NO order reached the bridge'); assert.ok(g.stats.blocked >= 1 || /VERIF|DEMO|ACCOUNT/i.test(r.reason), `blocked by the executor verification or the identity guard: ${r.reason}`);
  });
  it('News V2 PRE_NEWS blocks; a signal calculated before the block cleared is rejected after clearance (fresh-signal-after-news); VOLATILITY_SHOCK blocks; abnormal spread blocks; stale quote blocks; consecutive-loss breaker (2) blocks', async () => {
    const clock = makeClock(); const store = makeStore(); let phase = 'PRE_NEWS'; const nm = scriptedNewsMonitor(() => (phase === 'NORMAL' ? {} : { state: phase, reason: `${phase}:CPI m/m`, event: { event_id: 'e1', event_name: 'CPI m/m', currency: 'USD', impact: 'HIGH', minutes_to_event: 5, tier: 'B' } }));
    const raw = bridgeOk(clock); const ex = createMt5Executor({ config: buildDemoParityConfig({}), bridge: createGuardedBridge(raw), statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: nm, _deps: store.deps }); await ex.start();
    const stale = sig(clock, 'cccccccccccccccc'); assert.equal((await ex.executeSignal(stale)).reason, 'NEWS_ENTRY_BLOCK');
    clock.advance(5000); phase = 'NORMAL'; await ex.monitorOnce(); assert.equal(store.state.protection.blocking, false); assert.equal((await ex.executeSignal({ ...stale, signalId: 'dddddddddddddddd', result: { ...stale.result, signal: { ...stale.result.signal, signal_id: 'dddddddddddddddd' } } })).reason, 'SIGNAL_PREDATES_NORMALIZATION'); assert.equal(raw.count('open'), 0);
    // shock
    let bid = BID; const raw2 = bridgeOk(clock, { tickFn: () => tick(clock, { bid, ask: bid + SPREAD }) }); const s2 = makeStore(); const ex2 = createMt5Executor({ config: buildDemoParityConfig({}), bridge: createGuardedBridge(raw2), statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: s2.deps }); await ex2.start(); await warm(ex2, clock); bid += 2.0; clock.advance(3000); await ex2.monitorOnce(); clock.advance(3000); await ex2.monitorOnce(); assert.equal(ex2.status().news_protection.shock.state, 'VOLATILITY_SHOCK'); assert.equal((await ex2.executeSignal(sig(clock, 'eeeeeeeeeeeeeeee', { entry: bid + SPREAD }))).reason, 'VOLATILITY_SHOCK_ENTRY_BLOCK');
    // spread
    let spread = SPREAD; const raw3 = bridgeOk(clock, { tickFn: () => tick(clock, { spread_price: spread, ask: BID + spread }) }); const s3 = makeStore(); const ex3 = build({ bridge: raw3, store: s3, clock }); await ex3.start(); await warm(ex3, clock); spread = 0.55; assert.equal((await ex3.executeSignal(sig(clock, 'ffffffffffffffff'))).reason, 'SPREAD_ABNORMAL'); spread = 0.7; assert.equal((await ex3.executeSignal(sig(clock, '1111111111111111'))).reason, 'SPREAD_TOO_WIDE');
    // stale quote / feed
    const raw4 = bridgeOk(clock, { tickFn: () => tick(clock, { time: clock.now().getTime() / 1000 - 200 }) }); const s4 = makeStore(); const ex4 = build({ bridge: raw4, store: s4, clock }); await ex4.start(); assert.equal((await ex4.executeSignal(sig(clock, '2222222222222222'))).reason, 'STALE_QUOTE');
    // breaker at 2 (REAL parity), same UTC day
    const s5 = makeStore({ ...loadMt5State('/nonexistent'), daily: { day: '2026-09-25', completed: 2, realized_net_usd: -60, consecutive_losses: 2, wins: 0, losses: 2 } }); const ex5 = build({ bridge: bridgeOk(clock), store: s5, clock }); await ex5.start(); const rb = await ex5.executeSignal(sig(clock, '3333333333333333')); assert.equal(rb.reason, 'CONSECUTIVE_LOSS_LIMIT'); assert.equal(rb.details.limit, 2);
  });
  it('a governed open position never receives a second entry from the same or another signal (one position); news never closes it', async () => {
    const clock = makeClock(); const store = makeStore(); const raw = bridgeOk(clock); let phase = 'NORMAL'; const nm = scriptedNewsMonitor(() => (phase === 'NORMAL' ? {} : { state: phase, reason: `${phase}:NFP`, event: { event_id: 'n', event_name: 'Non-Farm Employment Change', currency: 'USD', impact: 'HIGH', minutes_to_event: 1, tier: 'B' } }));
    const ex = createMt5Executor({ config: buildDemoParityConfig({}), bridge: createGuardedBridge(raw), statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: nm, _deps: store.deps }); await ex.start();
    assert.equal((await ex.executeSignal(sig(clock))).executed, true); raw.set('positions', () => ({ positions: [live(clock, { profit: 2 })] }));
    assert.equal((await ex.executeSignal(sig(clock))).reason, 'DUPLICATE_SIGNAL'); assert.equal((await ex.executeSignal(sig(clock, '4444444444444444'))).reason, 'POSITION_ALREADY_OPEN'); assert.equal(raw.count('open'), 1);
    for (const p of ['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']) { phase = p; clock.advance(3000); assert.equal((await ex.monitorOnce()).action, 'HOLD'); } assert.equal(raw.count('close'), 0);
  });
  it('restart reconciliation: a PENDING intent is resolved from broker history (broker truth wins); unreadable history HALTS the executor so nothing new can execute', async () => {
    const clock = makeClock(); const base = loadMt5State('/nonexistent'); const intent = { intent_id: 'i1', decision_id: 'd1', signal_id: 'sig-p', side: 'BUY', status: 'PENDING', created_at: new Date(clock.now().getTime() - 60_000).toISOString(), requested_price: ASK, sl: ASK - 5, tp: ASK + 30, volume: 0.01 };
    const filled = bridgeOk(clock); filled.set('history', () => ({ deals: [{ ticket: 9101, order: 7001, time: clock.now().getTime() / 1000 - 30, type: 0, entry: 0, magic: DEMO_MAGIC_STAGE12, position_id: 7001, volume: 0.01, price: ASK, commission: 0, swap: 0, profit: 0, fee: 0, symbol: 'XAUUSDm', comment: 'MCP:sig-p' }] })); filled.set('positions', () => ({ positions: [live(clock, { ticket: 7001 })] }));
    const s1 = makeStore({ ...base, intent }); const ex1 = build({ bridge: filled, store: s1, clock }); const st1 = await ex1.start(); assert.equal(st1.halted, null); assert.ok(s1.events('INTENT_RESOLVED').length >= 1 || s1.state.intent?.status !== 'PENDING', 'pending intent resolved from broker truth');
    const broken = bridgeOk(clock); broken.set('history', () => new Mt5BridgeError('HISTORY_UNAVAILABLE', 'no history')); const s2 = makeStore({ ...base, intent }); const ex2 = build({ bridge: broken, store: s2, clock }); const st2 = await ex2.start(); assert.ok(st2.halted, 'ambiguous order state halts'); assert.equal((await ex2.executeSignal(sig(clock))).executed, false); assert.equal(broken.count('open'), 0);
  });
});

describe('E. validator cycle: blocked and executed signals become decision-time evidence; audit mirrored; outcomes delayed; restart-safe', () => {
  const fakeFeed = (bars5) => ({ rates: async (sym, tf) => ({ ok: true, bars: tf === '5' ? bars5 : bars5 }), tick: async () => ({ ok: true, tick: { time: T0 + 300, bid: 4000, ask: 4000.26 } }), ping: async () => ({ ok: true, connected: true }) });
  it('executeSignal records a FORWARD_LIVE_DEMO SIGNAL with the block reason and context; the executor audit is mirrored as EXECUTION records; a second cycle/restart adds no duplicates', async () => {
    const dir = tmp(); const clock = makeClock(new Date((T0 + 330) * 1000)); const store = makeStore(); const raw = bridgeOk(clock); const nm = scriptedNewsMonitor(() => ({ state: 'PRE_NEWS', reason: 'PRE_NEWS:CPI m/m', event: { event_id: 'e', event_name: 'CPI m/m', currency: 'USD', impact: 'HIGH', minutes_to_event: 10, tier: 'B' } }));
    const parts = buildDemoValidator({ paths: { ...DEMO_PATHS, dir, executorLog: join(dir, 'executor_audit.jsonl'), executorState: join(dir, 'executor_state.json'), killSwitch: join(dir, 'kill'), signalStore: join(dir, 'store.json') }, env: {}, feed: fakeFeed([]), bridge: raw, newsMonitor: nm, now: clock.now, ops: () => {} });
    // use the in-memory executor deps for determinism: swap the executor for one built on the same guarded bridge
    parts.executor = createMt5Executor({ config: parts.config, bridge: parts.bridge, statePath: 'm', logPath: join(dir, 'executor_audit.jsonl'), killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: nm, _deps: { ...store.deps, appendLog: (p, e) => { store.log.push(e); appendFileSync(p, JSON.stringify(e) + '\n'); } } });
    await parts.executor.start(); const cycle = createValidatorCycle({ parts, paths: { ...DEMO_PATHS, dir, executorLog: join(dir, 'executor_audit.jsonl') }, now: clock.now, log: () => {} });
    const s = sig(clock, 'sig-block', { calculated_at: new Date((T0 + 310) * 1000).toISOString() }); const r = await cycle.executeSignal(s); assert.equal(r.reason, 'NEWS_ENTRY_BLOCK');
    const recs = parts.store.readAll(); const sr = recs.find((x) => x.kind === 'SIGNAL'); assert.ok(sr); assert.equal(sr.provenance, FORWARD_DEMO); assert.equal(sr.block_reason, 'NEWS_ENTRY_BLOCK'); assert.equal(sr.execution_eligibility, 'BLOCKED'); assert.equal(sr.news?.state, 'PRE_NEWS'); assert.equal(sr.account_class, 'DEMO'); assert.equal(sr.expected_login, 480236873); assert.equal(sr.signal_candle_time, T0);
    await new Promise((res) => setTimeout(res, 50)); cycle.mirrorAudit(); const execs = parts.store.readAll().filter((x) => x.kind === 'EXECUTION'); assert.ok(execs.some((e) => e.event_type === 'SKIPPED' && e.signal_id === 'sig-block'));
    const before = parts.store.readAll().length; await cycle.executeSignal(s); cycle.mirrorAudit(); assert.equal(parts.store.readAll().length, before + 0 + parts.store.readAll().filter((x) => x.kind === 'EXECUTION' && x.reason === 'DUPLICATE_SIGNAL').length, 'the duplicate attempt adds only its own audit mirror, never a second SIGNAL');
    const st2 = createDemoEvidenceStore({ dir }); assert.equal(st2.append(sr).reason, 'DUPLICATE', 'restart: index rebuilt from disk');
    const late = sig(clock, 'sig-old', { calculated_at: new Date((T0 - 3600) * 1000).toISOString() }); await cycle.executeSignal(late); const old = parts.store.readAll().find((x) => x.kind === 'SIGNAL' && x.signal_id === 'sig-old'); assert.ok(!old || old.provenance === 'BACKFILL', 'a signal decided long ago can never be FORWARD_LIVE_DEMO');
    rmSync(dir, { recursive: true, force: true });
  });
  it('outcomes are labeled only after the horizon from feed bars and never re-labeled; the report separates provenance and applies the gates (COLLECTING on a tiny sample)', async () => {
    const dir = tmp(); const clock = makeClock(new Date((T0 + 330) * 1000)); const store = makeStore(); const raw = bridgeOk(clock);
    const up = (n) => Array.from({ length: n }, (_, i) => ({ time: T0 + 300 + i * 300, open: 4265 + i * 0.5, high: 4265 + i * 0.5 + 0.6, low: 4265 + i * 0.5 - 0.3, close: 4265 + (i + 1) * 0.5, volume: 1 }));
    const parts = buildDemoValidator({ paths: { ...DEMO_PATHS, dir, executorLog: join(dir, 'executor_audit.jsonl'), executorState: join(dir, 'executor_state.json'), killSwitch: join(dir, 'kill'), signalStore: join(dir, 'store.json') }, env: {}, feed: fakeFeed(up(60)), bridge: raw, newsMonitor: permissiveNewsMonitor(), now: clock.now, ops: () => {} });
    parts.executor = createMt5Executor({ config: parts.config, bridge: parts.bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); await parts.executor.start();
    const cycle = createValidatorCycle({ parts, paths: { ...DEMO_PATHS, dir, executorLog: join(dir, 'nope.jsonl') }, now: clock.now, log: () => {} }); await parts.feedDeps.sweep();
    const r = await cycle.executeSignal(sig(clock, 'sig-exec', { calculated_at: new Date((T0 + 310) * 1000).toISOString() })); assert.equal(r.executed, true, r.reason);
    cycle.labelOutcomes(); assert.equal(parts.store.readAll().filter((x) => x.kind === 'OUTCOME').length, 0, 'nothing before the horizon');
    clock.advance(49 * 300 * 1000); cycle.labelOutcomes(); const outs = parts.store.readAll().filter((x) => x.kind === 'OUTCOME'); assert.equal(outs.length, 3); assert.ok(outs.every((o) => o.status === 'LABELED' && o.provenance === FORWARD_DEMO)); cycle.labelOutcomes(); assert.equal(parts.store.readAll().filter((x) => x.kind === 'OUTCOME').length, 3);
    const rep = buildDemoReport({ dir, nowSec: clock.now().getTime() / 1000 }); assert.equal(rep.stage12_status, 'COLLECTING'); assert.equal(rep.forward.signals, 1); assert.equal(rep.forward.executed_signals, 1); assert.equal(rep.by_provenance.forward_live_demo, 4); assert.deepEqual([...STAGE12_STATUSES], ['COLLECTING', 'INSUFFICIENT_FORWARD_EVIDENCE', 'EXECUTION_RELIABILITY_ISSUE', 'PROMISING_UNPROVEN', 'FAILED_FORWARD_GATE', 'ELIGIBLE_FOR_INDEPENDENT_VALIDATION']); assert.equal(STAGE12_STATUSES.includes('PRODUCTION_APPROVED'), false); assert.equal(STAGE12_GATES.min_completed_trades, 60);
    rmSync(dir, { recursive: true, force: true });
  });
  it('pre-start gate: REAL identity or a halted executor refuses to start; a verified DEMO identity passes without sending any order', async () => {
    const clock = makeClock(); const s = makeStore(); const ok = bridgeOk(clock); const ex = build({ bridge: ok, store: s, clock }); const g1 = await preStartGate({ executor: ex, bridge: ok }); assert.equal(g1.ok, true); assert.equal(g1.verified.login, 480236873); assert.equal(ok.count('open'), 0);
    const bad = bridgeOk(clock, { hello: () => realLike() }); const g2 = await preStartGate({ executor: build({ bridge: bad, store: makeStore(), clock }), bridge: bad }); assert.equal(g2.ok, false); assert.match(g2.blocker, /DEMO_IDENTITY_MISMATCH/); assert.equal(g2.hello_login, 460149329);
  });
});

describe('F. isolation: no shadow<->demo import, no production import of src/demo, feed reader has no trading call, REAL config untouched, no REAL identifiers in Stage 12 source', () => {
  const src = (p) => readFileSync(join(ROOT, p), 'utf8'); const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  it('static isolation holds', () => {
    for (const f of ['identityGuard.js', 'config.js', 'evidence.js', 'feed.js', 'validator.js', 'report.js']) { const s = src(`src/demo/${f}`); assert.ok(!s.includes('/shadow/'), `${f} imports Stage 11C`); assert.ok(!/460149329|Exness-MT5Real51|mt5_bridge_real/.test(s), `${f} references the REAL identity`); }
    for (const f of walk('src/shadow')) assert.ok(!src(f).includes('/demo/'), `${f} imports src/demo`);
    for (const f of walk('src').filter((x) => !x.startsWith('src/demo/') && !x.startsWith('src/shadow/') && x.endsWith('.js'))) assert.ok(!src(f).includes('/demo/'), `${f} imports src/demo`);
    const py = src('mt5/mt5_feed_reader.py'); for (const bad of ['order_send', 'order_check', 'order_calc', 'positions_close', 'TRADE_ACTION', 'Close(', 'Buy(', 'Sell(']) assert.ok(!py.includes(bad), `feed reader contains ${bad}`);
    assert.deepEqual([...FEED_COMMANDS], ['rates', 'tick', 'select', 'ping', 'quit']); const fr = createFeedReader({ python: 'nonexistent' }); return assert.rejects(fr.request('open', {}), /FEED_CMD_NOT_ALLOWED|FEED_NOT_RUNNING/);
  });
  it('REAL configuration defaults are unchanged by Stage 12; the DEMO bridge script still targets the DEMO expected identity; the demo bridge gained only a terminal-path attach (no login/password switch)', () => {
    const c = resolveRealExecutorConfig({}); assert.equal(c.lotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(c.maxConsecutiveLosses, 2); assert.equal(c.minEffectiveRr, 1.7); assert.equal(c.newsProtection, true); assert.equal(c.newsTierBCooldownMin, 55); assert.equal(c.newsNormalizationMaxExtensionMin, 0); assert.equal(c.computeSizing, undefined); assert.equal(c.magic, 88052001);
    const py = src('mt5/mt5_bridge.py'); assert.ok(py.includes('"XAUUSD_MT5_LOGIN", "480236873"')); assert.ok(py.includes('XAUUSD_MT5_TERMINAL_PATH')); assert.ok(!/initialize\([^)]*login\s*=|password\s*=/.test(py), 'no credential-based initialize anywhere in the demo bridge');
    const real = src('mt5/mt5_bridge_real.py'); assert.ok(real.includes('XAUUSD_MT5_REAL_TERMINAL_PATH'), 'REAL bridge untouched (still its own env namespace)');
  });
});
