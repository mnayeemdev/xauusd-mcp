/**
 * Adaptive trade management (src/engine/mt5TradeManagement.js) and its
 * executor integration, plus the capital-aware architecture
 * (src/engine/mt5CapitalPolicy.js). Pure functions + scripted REAL bridge.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTradeManagement, isEvidenceFresh, exitStateFor, TRADE_STATES, TRADE_MANAGEMENT_PARAMS } from '../src/engine/mt5TradeManagement.js';
import { computeLotSizingPolicy, computeCapitalState, computeStructuralRisk, capitalSnapshot, LOT_AUTHORITY } from '../src/engine/mt5CapitalPolicy.js';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { resolveExecutorConfig } from '../src/engine/mt5Policy.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { permissiveNewsMonitor } from './fixtures/news_test_monitor.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const T = (m) => 1790337600 + m * 60; // 12:00:00Z + minutes
const bar = (time, close, over = {}) => ({ time, open: close, high: close + 0.3, low: close - 0.3, close, ...over });
const res = ({ bars, lastEvent = null, action = 'WAIT', entry = null, isNew = true, bias = { direction: 'NEUTRAL', regime: 'RANGE', structure: { state: null }, fresh_opposing_choch: null }, regime5 = 'RANGE', calcAt = null }) => ({
  status: 'OK', action, entry, reason: action === 'WAIT' ? 'NO_ELIGIBLE_STRATEGY' : null, calculated_at: (calcAt ?? new Date(NOW.getTime() - 30_000)).toISOString(),
  primary_confirmed_bars: bars, evidence: { structure: { state: 'BULLISH', lastEvent }, regime: regime5 }, bias, regime: regime5,
  signal: action === 'WAIT' ? null : { signal_id: 'oppsig', is_new_event: isNew }, market_data_times: { '5m': bars.at(-1)?.time ?? null }, anticipation: { state: 'ARMED' }, pre_entry_plan: { status: 'PLAN', opportunity_state: 'DEVELOPING' },
});
// BUY at 4265.418 with structural stop 4260.0 (risk 5.418) opened 11:30Z; SELL mirror.
const OPEN_TIME = '2026-09-25T11:30:18.000Z';
const buy = (over = {}) => ({ ticket: 7001, side: 'BUY', volume: 0.01, open_price: 4265.418, open_time: OPEN_TIME, initial_structural_risk: 5.418, last_net_pnl: 0, mfe_usd: 0, mae_usd: 0, engine: { thesis_id: 't1', model: 'BO', direction: 'BUY', planned_entry: 4265.0, structural_stop: 4260.0, setup_level: 4262.0, engine_tp2: 4275.0 }, ...over });
const sell = (over = {}) => ({ ticket: 7002, side: 'SELL', volume: 0.01, open_price: 4275.022, open_time: OPEN_TIME, initial_structural_risk: 6.25, last_net_pnl: 0, mfe_usd: 0, mae_usd: 0, engine: { thesis_id: 't2', model: 'SR', direction: 'SELL', planned_entry: 4276.34, structural_stop: 4281.27, setup_level: 4280.48, engine_tp2: 4267.69 }, ...over });
// bars strictly AFTER the 11:30 entry (first bar 11:35 closes 11:40)
const after = (...closes) => closes.map((c, i) => (typeof c === 'number' ? bar(T(-25 + i * 5), c) : { ...bar(T(-25 + i * 5), c.close), ...c }));

describe('adaptive management: healthy trades HOLD', () => {
  it('1. healthy profitable BUY (steady progress, no reversal evidence) -> HOLD', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4266.5, 4268.0, 4269.5, 4271.0, 4272.5) }) });
    assert.equal(v.state, 'HOLD'); assert.equal(v.reason, 'HEALTHY'); assert.ok(v.evidence.progress.progress_r > 1.0, 'progress beyond 1R alone never closes');
  });
  it('2. healthy profitable SELL -> HOLD', () => {
    const v = evaluateTradeManagement({ position: sell(), result: res({ bars: after(4273.5, 4271.0, 4269.0, 4267.5), bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null }, regime5: 'BEAR_TREND' }) });
    assert.equal(v.state, 'HOLD'); assert.equal(v.reason, 'HEALTHY');
  });
  it('3. +$1 / +$2 alone -> HOLD (progress below 1R and no evidence)', () => {
    const v = evaluateTradeManagement({ position: buy({ last_net_pnl: 2 }), result: res({ bars: after(4266.4, 4267.4) }) });
    assert.equal(v.state, 'HOLD');
  });
  it('4. one opposite candle -> HOLD; 5. temporary wick through the stop -> HOLD; 6. unfinished candle is never evidence (only confirmed bars are passed)', () => {
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: after(4267.0, 4268.5, 4267.2) }) }).state, 'HOLD');
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: after(4266.0, { close: 4264.0, low: 4258.5 }) }) }).state, 'HOLD', 'wick below 4260 without a close below it');
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: [] }) }).reason, 'NO_CONFIRMED_EVIDENCE');
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: [bar(T(-60), 4250)] }) }).reason, 'NO_CANDLE_AFTER_ENTRY', 'the entry candle itself is not evidence');
  });
  it('13. weak deterioration (one factor) while losing -> HOLD', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4264.0, 4263.5), regime5: 'BEAR_TREND' }) });
    assert.equal(v.state, 'HOLD'); assert.equal(v.reason, 'WEAK_EVIDENCE'); assert.equal(v.evidence.factor_count, 1);
  });
});

describe('adaptive management: profit protection', () => {
  it('8. meaningful BUY progress (>=1R) + confirmed bearish 5m event after entry -> PROFIT_PROTECT_CLOSE', () => {
    const bars = after(4267.0, 4269.5, 4272.0, 4271.0);
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars, lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 3, level: 4270.0 } }) });
    assert.equal(v.state, 'PROFIT_PROTECT_CLOSE'); assert.equal(v.trigger, 'OPPOSITE_STRUCTURE_EVENT'); assert.ok(v.evidence.progress.progress_r >= 1);
  });
  it('9. meaningful SELL progress + confirmed bullish reversal (retrace of earned progress >= 50%) -> PROFIT_PROTECT_CLOSE', () => {
    const bars = after(4272.0, 4268.0, 4266.0, 4270.8); // best 4265.7 low -> earned 9.3; last close gave back 5.1 (55%)
    const v = evaluateTradeManagement({ position: sell(), result: res({ bars }) });
    assert.equal(v.state, 'PROFIT_PROTECT_CLOSE'); assert.equal(v.trigger, 'RETRACE_OF_EARNED_PROGRESS');
  });
  it('a 30% giveback after 1R is a normal pullback -> HOLD', () => {
    const bars = after(4267.0, 4270.0, 4272.0, 4270.5); // earned 6.9 (best 4272.3), giveback 1.8 (26%)
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars }) }).state, 'HOLD');
  });
  it('an opposite actionable signal protects profit only after >=1R; a non-actionable opposite candidate never does', () => {
    const bars = after(4267.0, 4270.0, 4272.0, 4271.5);
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars, action: 'SELL', entry: 4271.5 }) }).state, 'PROFIT_PROTECT_CLOSE');
    assert.equal(evaluateTradeManagement({ position: buy(), result: { ...res({ bars }), diagnostics: { candidate: { model: 'SR', side: 'SELL' } } } }).state, 'HOLD');
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: after(4266.0, 4267.0), action: 'SELL', entry: 4290.0 }) }).state, 'HOLD', 'below 1R progress an opposite signal far ABOVE the setup area (not an invalidation of a BUY) is neither profit protection nor, while winning, deterioration');
  });
});

describe('adaptive management: thesis deterioration and invalidation', () => {
  it('12. exact strong multi-factor deterioration (losing on close + confirmed bearish 5m event after entry + 15m bias against) -> THESIS_DETERIORATION_CLOSE', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4264.5, 4263.8, 4263.0), lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 2, level: 4270.0 }, bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null } }) }); // bearish event ABOVE the setup area: not an invalidation, but a post-entry development
    assert.equal(v.state, 'THESIS_DETERIORATION_CLOSE'); assert.ok(v.evidence.factor_count >= 2); assert.equal(v.evidence.post_entry_development, true); assert.deepEqual(Object.keys(v.evidence.factors), ['opposite_event_after_entry', 'htf_against', 'regime_against', 'momentum_against', 'opposite_signal']);
  });
  it('two STATIC context factors that already existed at entry (5m regime + 15m structure against) do not by themselves cut a losing trade -> HOLD', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4264.5, 4264.0), regime5: 'BEAR_TREND', bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null } }) });
    assert.equal(v.state, 'HOLD'); assert.equal(v.evidence.factor_count, 2); assert.equal(v.evidence.post_entry_development, false);
  });
  it('momentum factor needs 3 stepwise adverse closes AND >= 0.5R under water', () => {
    const three = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4264.0, 4263.4, 4262.5), bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null } }) });
    assert.equal(three.evidence.factors.momentum_against, true); assert.equal(three.state, 'THESIS_DETERIORATION_CLOSE');
    const shallow = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4265.0, 4264.8, 4264.6), bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null } }) });
    assert.equal(shallow.evidence.factors.momentum_against, false); assert.equal(shallow.state, 'HOLD');
  });
  it('the same deterioration evidence while the trade is WINNING on close does not cut it (deterioration is a loss-cut)', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4266.0, 4266.5), regime5: 'BEAR_TREND', bias: { direction: 'BEARISH', regime: 'BEAR_TREND', structure: { state: 'BEARISH' }, fresh_opposing_choch: null } }) });
    assert.equal(v.state, 'HOLD');
  });
  it('10/11. confirmed structural invalidation (close beyond the stop) -> THESIS_INVALIDATION_CLOSE for BUY and SELL', () => {
    assert.equal(evaluateTradeManagement({ position: buy(), result: res({ bars: after(4263.0, 4259.6) }) }).state, 'THESIS_INVALIDATION_CLOSE');
    assert.equal(evaluateTradeManagement({ position: sell(), result: res({ bars: after(4278.0, 4281.8) }) }).state, 'THESIS_INVALIDATION_CLOSE');
  });
  it('invalidation takes precedence over deterioration and profit protection', () => {
    const v = evaluateTradeManagement({ position: buy(), result: res({ bars: after(4270.0, 4259.5), lastEvent: { type: 'BOS', direction: 'BEARISH', bar: 1, level: 4262 } }) });
    assert.equal(v.state, 'THESIS_INVALIDATION_CLOSE');
  });
});

describe('adaptive management: freshness, states, audit mapping', () => {
  it('14. stale analysis or stale confirmed bar -> not fresh', () => {
    assert.equal(isEvidenceFresh({ result: res({ bars: after(4266), calcAt: new Date(NOW.getTime() - 3600_000) }), now: NOW }).reason, 'ANALYSIS_STALE');
    assert.equal(isEvidenceFresh({ result: { calculated_at: NOW.toISOString(), primary_confirmed_bars: [bar(T(-180), 1)] }, now: NOW }).reason, 'CONFIRMED_BAR_STALE');
    assert.equal(isEvidenceFresh({ result: res({ bars: after(4266) }), now: NOW }).fresh, true);
  });
  it('exit state vocabulary and mapping', () => {
    assert.deepEqual(TRADE_STATES, ['HOLD', 'THESIS_INVALIDATION_CLOSE', 'THESIS_DETERIORATION_CLOSE', 'PROFIT_PROTECT_CLOSE', 'MONETARY_PROFIT_CLOSE', 'MONETARY_MAX_LOSS_CLOSE', 'BROKER_PROTECTIVE_CLOSE', 'EMERGENCY_CLOSE']);
    assert.equal(exitStateFor('THESIS_STOP_CLOSE'), 'THESIS_INVALIDATION_CLOSE'); assert.equal(exitStateFor('THESIS_DETERIORATION'), 'THESIS_DETERIORATION_CLOSE'); assert.equal(exitStateFor('PROFIT_PROTECT'), 'PROFIT_PROTECT_CLOSE');
    assert.equal(exitStateFor('TAKE_PROFIT_BUDGET'), 'MONETARY_PROFIT_CLOSE'); assert.equal(exitStateFor('STOP_LOSS_BUDGET'), 'MONETARY_MAX_LOSS_CLOSE'); assert.equal(exitStateFor('BROKER_SL'), 'BROKER_PROTECTIVE_CLOSE'); assert.equal(exitStateFor('KILL_SWITCH_CLOSE'), 'EMERGENCY_CLOSE');
    assert.equal(TRADE_MANAGEMENT_PARAMS.profitProtectMinProgressR, 1.0); assert.equal(TRADE_MANAGEMENT_PARAMS.deteriorationMinFactors, 2);
  });
});

// ── Executor integration ───────────────────────────────────────────────
function realHello({ equity = 71.94 } = {}) {
  return { real_verified: true, checks: { account_readable: true, trade_mode_is_real: true, server_not_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true },
    account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2, currency: 'USD', balance: equity, equity, margin: 0, margin_free: equity, leverage: 200, margin_so_call: 60, margin_so_so: 0 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
function tick(clock) { return { symbol: 'XAUUSDm', bid: 4265.158, ask: 4265.418, time: clock.now().getTime() / 1000 - 1, spread_price: 0.26, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0 }; }
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } }
function makeClock(start) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function live(clock, { profit = 0 } = {}) { return { ticket: 7001, time: clock.now().getTime() / 1000, type: 0, magic: REAL_MAGIC, identifier: 7001, reason: 3, volume: 0.01, price_open: 4265.418, sl: 4257.658, tp: 4295.418, price_current: 4265.418 + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: 'MCP:aaaaaaaaaaaaaaaa' }; }
function bridgeOk(clock) { const b = new FakeBridge(); b.set('hello', () => realHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', () => tick(clock)); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] })); b.set('open', (p) => ({ result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price: 4265.418 }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7001, volume: p.volume, price: 4265.418, commission: 0, swap: 0, profit: 0, fee: 0, comment: 'MCP:aaaaaaaaaaaaaaaa' }, position_id: 7001, position: live(clock), requested_price: 4265.418 })); return b; }
function build({ bridge, store, clock }) { return createMt5Executor({ config: resolveRealExecutorConfig({}), bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor: permissiveNewsMonitor(), _deps: store.deps }); }
function buySig(clock, id = 'aaaaaaaaaaaaaaaa') { const calculated_at = new Date(clock.now().getTime() - 20_000).toISOString(); return { signalId: id, alert: { action: 'BUY', entry: 4265.0, sl: 4260.0, tp1: 4270.0, tp2: 4275.0, rr: 2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: 'BUY', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: id, is_new_event: true, thesis_id: 'thesisX' }, diagnostics: { candidate: { model: 'BO', side: 'BUY', anchor: 4262.0 }, objective: { price: 4275, source: '5m_pivot' } }, market_data_times: { '5m': clock.now().getTime() / 1000 - 300 } } }; }
async function openedBuy() {
  const clock = makeClock(new Date('2026-09-25T11:30:00.000Z')); const store = makeStore(); const bridge = bridgeOk(clock);
  const ex = build({ bridge, store, clock }); await ex.start(); await ex.executeSignal(buySig(clock));
  bridge.set('positions', () => ({ positions: [live(clock, { profit: 1.5 })] }));
  bridge.set('close', () => ({ result: { retcode: 10009, deal: 9102, order: 7001 }, exit_deal: { ticket: 9102, entry: 1, price: 4271.0, profit: 5.58, time: clock.now().getTime() / 1000 + 5, reason: 3 } }));
  bridge.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: 4265.418, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4271.0, profit: 5.58, commission: 0, swap: 0, fee: 0, reason: 3, time: clock.now().getTime() / 1000 + 5 }] }));
  return { clock, store, bridge, ex };
}
const resAt = (clock, bars, extra = {}) => ({ ...res({ bars, ...extra }), calculated_at: new Date(clock.now().getTime() - 10_000).toISOString() });

describe('executor: adaptive management integration', () => {
  it('9. state persisted at open: signal candle, initial structural risk, initial effective RR, thesis, adaptive block; MFE/MAE tracked by the monitor', async () => {
    const { store, ex, clock } = await openedBuy();
    const p = store.state.position;
    assert.equal(p.initial_structural_risk, 5.42); assert.equal(p.initial_effective_rr, 1.77); assert.ok(p.signal_candle_time); assert.equal(p.engine.thesis_id, 'thesisX');
    assert.deepEqual(Object.keys(p.adaptive), ['last_evaluated_bar_time', 'evaluations', 'last_state', 'last_reason', 'last_factors', 'progress', 'profit_protect_armed', 'market_context']);
    await ex.monitorOnce();
    assert.equal(store.state.position.mfe_usd, 1.5); assert.equal(store.state.position.best_net_pnl, 1.5);
    const opened = store.events('OPENED')[0];
    assert.equal(opened.capital.lot_policy.authority, LOT_AUTHORITY.USER_FIXED); assert.equal(opened.capital.lot_policy.executed_lot, 0.01); assert.equal(opened.capital.lot_policy.enabled_scaling, false);
    clock.advance(1);
  });
  it('7/15. duplicate confirmed candle cannot duplicate a close; the close executes exactly once with a full audit (exit_state, evidence, MFE/MAE, broker response)', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(30 * 60_000); // 12:00Z
    const bars = after(4267.0, 4269.5, 4272.0, 4271.0); // >=1R + bearish CHoCH after entry
    const r1 = await ex.reviewThesis({ result: resAt(clock, bars, { lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 3, level: 4270.0 } }) });
    assert.equal(r1.action, 'CLOSED'); assert.equal(r1.state, 'PROFIT_PROTECT_CLOSE');
    const r2 = await ex.reviewThesis({ result: resAt(clock, bars, { lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 3, level: 4270.0 } }) });
    assert.equal(r2.action, 'NO_POSITION'); assert.equal(bridge.count('close'), 1);
    const closed = store.events('CLOSED')[0];
    assert.equal(closed.exit_state, 'PROFIT_PROTECT_CLOSE'); assert.equal(closed.exit_source, 'ADAPTIVE_MONITOR'); assert.equal(closed.exit_evidence.trigger, 'OPPOSITE_STRUCTURE_EVENT'); assert.ok(closed.exit_evidence.market_context); assert.ok(closed.broker_response);
    assert.equal(store.events('ADAPTIVE_EXIT_TRIGGERED').length, 1);
  });
  it('the same confirmed bar delivered twice is evaluated once (no duplicate close attempt even if the first close failed)', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(30 * 60_000);
    bridge.set('close', () => new Mt5BridgeError('CLOSE_REJECTED', 'requote'));
    const bars = after(4263.0, 4259.6);
    const r1 = await ex.reviewThesis({ result: resAt(clock, bars) });
    assert.equal(r1.action, 'CLOSE_FAILED');
    const r2 = await ex.reviewThesis({ result: resAt(clock, bars) });
    assert.equal(r2.reason, 'ALREADY_EVALUATED_BAR'); assert.equal(bridge.count('close'), 1);
    assert.equal(store.state.position.exit_evidence.state, 'THESIS_INVALIDATION_CLOSE', 'exit evidence retained for the retry on the next bar');
  });
  it('14. stale evidence never closes: logged once per bar, HOLD, broker protection untouched', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(30 * 60_000);
    const stale = { ...resAt(clock, after(4263.0, 4259.6)), calculated_at: new Date(clock.now().getTime() - 3600_000).toISOString() };
    assert.equal((await ex.reviewThesis({ result: stale })).reason, 'ANALYSIS_STALE');
    assert.equal((await ex.reviewThesis({ result: stale })).reason, 'ANALYSIS_STALE');
    assert.equal(store.events('ADAPTIVE_EVIDENCE_STALE').length, 1); assert.equal(bridge.count('close'), 0); assert.equal(bridge.count('modify'), 0);
  });
  it('16. restart keeps the thesis and adaptive state (position adopted with its persisted record)', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(10 * 60_000);
    await ex.reviewThesis({ result: resAt(clock, after(4266.0)) });
    const persisted = JSON.parse(JSON.stringify(store.state));
    const store2 = makeStore(persisted); const bridge2 = bridgeOk(clock);
    bridge2.set('positions', () => ({ positions: [live(clock, { profit: 0.6 })] }));
    const ex2 = build({ bridge: bridge2, store: store2, clock }); const st = await ex2.start();
    assert.equal(st.halted, null); assert.equal(store2.state.position.ticket, 7001); assert.equal(store2.state.position.engine.thesis_id, 'thesisX'); assert.equal(store2.state.position.adaptive.evaluations, 1);
    clock.advance(5 * 60_000);
    bridge2.set('close', () => ({ result: { retcode: 10009 }, exit_deal: { ticket: 9102, entry: 1, price: 4259.5, profit: -5.9, time: clock.now().getTime() / 1000, reason: 3 } }));
    bridge2.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: 4265.418, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4259.5, profit: -5.9, commission: 0, swap: 0, fee: 0, reason: 3, time: clock.now().getTime() / 1000 }] }));
    const r = await ex2.reviewThesis({ result: resAt(clock, after(4266.0, 4259.5)) });
    assert.equal(r.state, 'THESIS_INVALIDATION_CLOSE');
    assert.ok(!bridge2.calls.some((c) => c.cmd === 'open'));
  });
  it('17/18/19. after an adaptive close: the stale signal cannot re-enter, the same signal id is a duplicate, a later genuinely new signal is eligible', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(30 * 60_000);
    await ex.reviewThesis({ result: resAt(clock, after(4267.0, 4269.5, 4272.0, 4271.0), { lastEvent: { type: 'CHOCH', direction: 'BEARISH', bar: 3, level: 4270.0 } }) });
    assert.equal(store.state.position, null); assert.ok(store.state.last_close_at);
    bridge.set('positions', () => ({ positions: [] }));
    const stale = buySig(clock, 'bbbbbbbbbbbbbbbb'); stale.result.calculated_at = new Date(clock.now().getTime() - 60_000).toISOString(); stale.alert.time = stale.result.calculated_at;
    assert.equal((await ex.executeSignal(stale)).reason, 'SIGNAL_PREDATES_LAST_CLOSE');
    assert.equal((await ex.executeSignal(buySig(clock))).reason, 'DUPLICATE_SIGNAL');
    clock.advance(10 * 60_000);
    assert.equal((await ex.executeSignal(buySig(clock, 'cccccccccccccccc'))).executed, true);
  });
  it('24. one-position rule under management; 22. kill switch close is EMERGENCY_CLOSE', async () => {
    const { clock, store, bridge, ex } = await openedBuy();
    clock.advance(60_000);
    assert.equal((await ex.executeSignal(buySig(clock, 'dddddddddddddddd'))).reason, 'POSITION_ALREADY_OPEN');
    store.kill = { active: true, close: true };
    const m = await ex.monitorOnce();
    assert.equal(m.action, 'CLOSED'); assert.equal(store.events('CLOSED')[0].exit_state, 'EMERGENCY_CLOSE'); assert.equal(bridge.count('close'), 1);
  });
  it('status() reports adaptive management and the exit-state vocabulary', async () => {
    const { ex } = await openedBuy();
    const st = ex.status();
    assert.equal(st.config.adaptive_management, true); assert.equal(st.config.exit_states.length, 8);
  });
});

describe('capital-aware architecture: separate concerns, no lot authority', () => {
  const account = { balance: 71.94, equity: 71.94, margin: 0, margin_free: 71.94, leverage: 200, margin_so_call: 60, margin_so_so: 0, currency: 'USD' };
  const market = { ask: 4306.17, bid: 4305.91, contract_size: 100, spread_price: 0.26, volume_min: 0.01, volume_max: 200, volume_step: 0.01 };
  it('29. compounding projection is reported but the executed lot is the user-fixed 0.01; 30. no loss-recovery sizing (projection depends on equity only and is non-decreasing)', () => {
    const cfg = resolveRealExecutorConfig({});
    const p = computeLotSizingPolicy({ config: cfg, account, market });
    assert.equal(p.authority, 'USER_FIXED'); assert.equal(p.enabled_scaling, false); assert.equal(p.executed_lot, 0.01); assert.equal(p.max_lot, 0.01);
    assert.ok(p.approved_scaling_projection);
    const big = computeLotSizingPolicy({ config: cfg, account: { ...account, equity: 10000, margin_free: 10000, balance: 10000 }, market });
    assert.equal(big.executed_lot, 0.01, 'a large projection changes nothing about execution');
    const afterLoss = computeLotSizingPolicy({ config: cfg, account: { ...account, equity: 50, margin_free: 50 }, market }).approved_scaling_projection?.lot ?? 0;
    const before = p.approved_scaling_projection?.lot ?? 0;
    assert.ok(afterLoss <= before, 'lower equity never projects a larger lot');
  });
  it('capital state, monetary policy and structural risk are reported separately', () => {
    const cfg = resolveRealExecutorConfig({});
    const snap = capitalSnapshot({ config: cfg, account, market, position: { side: 'SELL', open_price: 4275.022, volume: 0.01, engine: { structural_stop: 4281.27 } } });
    assert.equal(computeCapitalState({ account }).equity, 71.94);
    assert.deepEqual([snap.monetary_policy.profit_target_usd, snap.monetary_policy.maximum_loss_usd], [30, -50]);
    assert.deepEqual(computeStructuralRisk({ side: 'SELL', fill: 4275.022, structuralStop: 4281.27, lot: 0.01 }), { risk_price: 6.248, risk_usd: 6.25 });
    assert.equal(snap.lot_policy.executed_lot, 0.01);
  });
  it('31. DEMO config has no adaptive management or exact lot (isolation intact)', () => {
    const demo = resolveExecutorConfig({}, { mode: 'demo' });
    assert.equal(demo.thesisExit, undefined); assert.equal(demo.exactLot, undefined); assert.equal(demo.dailyLossLimitUsd, 25);
  });
});
