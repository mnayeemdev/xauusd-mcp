/**
 * Watcher <-> MT5 executor hook (src/engine/watcher.js, additive
 * `executeSignal` dep). Proves the hook is OFF by default, fires only
 * AFTER the existing alert gate has already alerted a NEW BUY/SELL,
 * receives that SAME result, and can never alter the alert decision or
 * watcher state -- even when it throws.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runWatcherCycle, createCycleDeps } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';

function state(over = {}) { return { ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: 1000, ...over }; }
function buy(signalId = 'sig-1', isNew = true) {
  return { status: 'OK', action: 'BUY', reason: null, entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2, quality: 80, setup: 'PB', calculated_at: '2026-09-25T10:00:00.000Z', diagnostics: { source_timeframe: '15m' }, signal: { signal_id: signalId, is_new_event: isNew }, regime: 'BULL_TREND' };
}
function deps(over = {}) {
  return { isCdpReachable: async () => true, peekLatest5mCandle: async () => ({ time: 1300 }), analyzeMarket: async () => buy(), notify: () => {}, ...over };
}

describe('watcher MT5 hook: default off', () => {
  it('createCycleDeps() has no executeSignal unless explicitly injected', () => {
    assert.equal(createCycleDeps({}).executeSignal, undefined);
    const fn = () => {};
    assert.equal(createCycleDeps({ executeSignal: fn }).executeSignal, fn);
  });
  it('without the dep, an ALERTED cycle carries no execution field and behaves exactly as before', async () => {
    const r = await runWatcherCycle({ state: state(), deps: deps(), log: () => {} });
    assert.equal(r.action, 'ALERTED'); assert.equal('execution' in r, false); assert.equal(r.state.last_alerted_signal_id, 'sig-1');
  });
});

describe('watcher MT5 hook: fires only after the existing alert gate', () => {
  it('called exactly once with {alert, signalId, result} after notify, and the outcome is attached', async () => {
    const order = [];
    let received = null;
    const d = deps({
      notify: () => order.push('notify'),
      executeSignal: async (ev) => { order.push('execute'); received = ev; return { executed: true, ticket: 5001 }; },
    });
    const r = await runWatcherCycle({ state: state(), deps: d, log: () => {} });
    assert.deepEqual(order, ['notify', 'execute']);
    assert.equal(received.signalId, 'sig-1'); assert.equal(received.alert.action, 'BUY'); assert.equal(received.alert.entry, 2000); assert.equal(received.result.regime, 'BULL_TREND');
    assert.deepEqual(r.execution, { executed: true, ticket: 5001 });
    assert.equal(r.action, 'ALERTED'); assert.equal(r.state.last_alerted_signal_id, 'sig-1');
  });
  it('NOT called on WAIT', async () => {
    let calls = 0;
    const d = deps({ analyzeMarket: async () => ({ ...buy(), action: 'WAIT', reason: 'CHOP', entry: null, signal: null }), executeSignal: async () => { calls++; } });
    const r = await runWatcherCycle({ state: state(), deps: d, log: () => {} });
    assert.equal(r.action, 'WAIT'); assert.equal(calls, 0);
  });
  it('NOT called on a duplicate signal (engine store is_new_event:false or watcher last_alerted_signal_id)', async () => {
    let calls = 0;
    const d1 = deps({ analyzeMarket: async () => buy('sig-1', false), executeSignal: async () => { calls++; } });
    assert.equal((await runWatcherCycle({ state: state(), deps: d1, log: () => {} })).action, 'DUPLICATE_SIGNAL');
    const d2 = deps({ executeSignal: async () => { calls++; } });
    assert.equal((await runWatcherCycle({ state: state({ last_alerted_signal_id: 'sig-1' }), deps: d2, log: () => {} })).action, 'DUPLICATE_SIGNAL');
    assert.equal(calls, 0);
  });
  it('NOT called when trade geometry is malformed (existing fail-closed validation)', async () => {
    let calls = 0;
    const d = deps({ analyzeMarket: async () => ({ ...buy(), sl: null }), executeSignal: async () => { calls++; } });
    assert.equal((await runWatcherCycle({ state: state(), deps: d, log: () => {} })).action, 'VALIDATION_FAILED'); assert.equal(calls, 0);
  });
  it('NOT called on the baseline cycle, on reconnect re-baseline, or when no new candle appeared', async () => {
    let calls = 0;
    const ex = async () => { calls++; };
    assert.equal((await runWatcherCycle({ state: state({ baseline_established: false }), deps: deps({ executeSignal: ex }), log: () => {} })).action, 'BASELINE_ESTABLISHED');
    assert.equal((await runWatcherCycle({ state: state({ last_connection_ok: false }), deps: deps({ executeSignal: ex }), log: () => {} })).action, 'RECONNECTED_REBASELINE');
    assert.equal((await runWatcherCycle({ state: state({ last_processed_5m_time: 1300 }), deps: deps({ executeSignal: ex }), log: () => {} })).action, 'NO_NEW_CANDLE');
    assert.equal(calls, 0);
  });
});

describe('watcher MT5 hook: failure isolation', () => {
  it('a throwing executor never alters the alert, the ALERTED action, or the persisted watcher state', async () => {
    let notified = null;
    const logs = [];
    const d = deps({ notify: (a) => { notified = a; }, executeSignal: async () => { throw new Error('bridge exploded'); } });
    const r = await runWatcherCycle({ state: state(), deps: d, log: (m) => logs.push(m) });
    assert.equal(r.action, 'ALERTED'); assert.equal(r.alerted, true); assert.equal(r.state.last_alerted_signal_id, 'sig-1'); assert.equal(notified.action, 'BUY');
    assert.deepEqual(r.execution, { executed: false, reason: 'EXECUTOR_THREW', detail: 'bridge exploded' });
    assert.ok(logs.some((l) => /non-fatal, alert\/decision unaffected/.test(l)));
  });
  it('a skipping executor is reported, not treated as an error', async () => {
    const d = deps({ executeSignal: async () => ({ executed: false, reason: 'ALGO_TRADING_DISABLED' }) });
    const r = await runWatcherCycle({ state: state(), deps: d, log: () => {} });
    assert.equal(r.action, 'ALERTED'); assert.equal(r.execution.reason, 'ALGO_TRADING_DISABLED');
  });
});

describe('watcher MT5 hook: source audit -- decision engine untouched', () => {
  it('no core decision module imports or references the MT5 layer', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    for (const f of ['src/engine/pipeline.js', 'src/engine/mtf.js', 'src/engine/risk.js', 'src/engine/quality.js', 'src/engine/regime.js', 'src/engine/structure.js', 'src/engine/correction.js', 'src/engine/models.js', 'src/engine/htf.js', 'src/engine/signalStore.js', 'src/core/xauusd_calculate.js', 'src/core/xauusd_analyze_market.js']) {
      const src = readFileSync(root + f, 'utf8');
      assert.equal(/mt5/i.test(src), false, `${f} must not reference MT5`);
    }
  });
  it('the watcher imports nothing from the MT5 layer (hook is injection-only)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/engine/watcher.js', import.meta.url)), 'utf8');
    assert.equal(/from ['"]\.\/mt5/i.test(src), false);
  });
});
