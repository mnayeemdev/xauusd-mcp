/**
 * XAUUSD auto signal watcher (src/engine/watcher.js, src/engine/watcherState.js,
 * src/engine/notifier.js) — deterministic tests using fully injected deps.
 *
 * No real CDP/TradingView connection, no real timers, no real OS signals.
 * These tests prove the watcher's OWN orchestration/dedup/persistence
 * logic; tests/engine_calculation.test.js and tests/engine_htf_context.test.js
 * remain the source of truth for the calculation engine itself, which
 * this file never re-implements or retunes.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_POLL_INTERVAL_MS,
  runWatcherCycle,
  peekLatest5mCandle,
  startWatcher,
} from '../src/engine/watcher.js';
import {
  DEFAULT_WATCHER_STATE,
  loadWatcherState,
  saveWatcherState,
  acquireLock,
  releaseLock,
} from '../src/engine/watcherState.js';
import { formatSignalAlert } from '../src/engine/notifier.js';
import { CALCULATE_SCHEMA_VERSION } from '../src/core/xauusd_calculate.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function makeLog() {
  const lines = [];
  const log = (msg) => lines.push(msg);
  log.lines = lines;
  return log;
}

function baseCalcResult(overrides = {}) {
  return {
    schema_version: CALCULATE_SCHEMA_VERSION,
    status: 'OK',
    action: 'WAIT',
    reason: 'RR_NOT_ACCEPTABLE',
    calculated_at: '2026-09-17T15:40:29.062Z',
    diagnostics: { source_timeframe: '15m' },
    ...overrides,
  };
}

function buyResult({ signalId = 'abc123', isNew = true, overrides = {} } = {}) {
  return baseCalcResult({
    action: 'BUY',
    reason: null,
    entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2, quality: 80, setup: 'PB',
    signal: { signal_id: signalId, is_new_event: isNew },
    ...overrides,
  });
}

describe('watcher: polling configuration', () => {
  it('defaults to a 60-second poll interval', () => {
    assert.equal(DEFAULT_POLL_INTERVAL_MS, 60_000);
  });
});

describe('watcher: startup baseline', () => {
  it('does not call the engine and does not alert on the very first cycle, even if an actionable signal would have been returned', async () => {
    let calcCalls = 0;
    const log = makeLog();
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1000 }),
      calculateEntry: async () => { calcCalls++; return buyResult(); },
      notify: () => { throw new Error('must not be called on baseline'); },
    };
    const { state, action, alerted } = await runWatcherCycle({ state: freshState(), deps, log: log });
    assert.equal(action, 'BASELINE_ESTABLISHED');
    assert.equal(alerted, false);
    assert.equal(calcCalls, 0, 'engine must not be called while establishing baseline');
    assert.equal(state.baseline_established, true);
    assert.equal(state.last_processed_5m_time, 1000);
  });
});

describe('watcher: candle-gated calculation', () => {
  it('no new confirmed 5m candle -> no calculation', async () => {
    let calcCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1000 }),
      calculateEntry: async () => { calcCalls++; return buyResult(); },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'NO_NEW_CANDLE');
    assert.equal(calcCalls, 0);
  });

  it('new confirmed 5m candle -> exactly one calculation', async () => {
    let calcCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => { calcCalls++; return baseCalcResult(); },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(calcCalls, 1);
    assert.equal(result.state.last_processed_5m_time, 1300);
  });
});

describe('watcher: WAIT never alerts', () => {
  it('WAIT result -> no notify call, technical log only', async () => {
    let notifyCalls = 0;
    const log = makeLog();
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => baseCalcResult({ action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE' }),
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log });
    assert.equal(result.action, 'WAIT');
    assert.equal(result.alerted, false);
    assert.equal(notifyCalls, 0);
    assert.ok(log.lines.some((l) => l.includes('WAIT / RR_NOT_ACCEPTABLE')));
  });
});

describe('watcher: BUY/SELL alerting', () => {
  it('BUY -> exactly one alert with fields taken verbatim from the engine result', async () => {
    let notified = null;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => buyResult({ signalId: 'buy-1' }),
      notify: (alert) => { notified = alert; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'ALERTED');
    assert.equal(result.alerted, true);
    assert.equal(result.state.last_alerted_signal_id, 'buy-1');
    assert.deepEqual(notified, {
      action: 'BUY', entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2,
      quality: 80, timeframe: '15m', setup: 'PB', time: '2026-09-17T15:40:29.062Z',
    });
  });

  it('SELL -> exactly one alert', async () => {
    let notifyCalls = 0;
    const sellResult = baseCalcResult({
      action: 'SELL', reason: null, entry: 2000, sl: 2010, tp1: 1990, tp2: 1980, rr: 2, quality: 70, setup: 'BO',
      signal: { signal_id: 'sell-1', is_new_event: true },
    });
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => sellResult,
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'ALERTED');
    assert.equal(notifyCalls, 1);
    assert.equal(result.state.last_alerted_signal_id, 'sell-1');
  });

  it('malformed BUY geometry (null entry) fails closed — no alert', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => buyResult({ overrides: { entry: null } }),
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'VALIDATION_FAILED');
    assert.equal(notifyCalls, 0);
  });

  it('malformed SELL geometry (NaN rr) fails closed — no alert', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => baseCalcResult({
        action: 'SELL', entry: 2000, sl: 2010, tp1: 1990, tp2: 1980, rr: NaN, quality: 70, setup: 'BO',
        signal: { signal_id: 'sell-bad', is_new_event: true },
      }),
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'VALIDATION_FAILED');
    assert.equal(notifyCalls, 0);
  });

  it('actionable result with no signal identity fails closed — no alert', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => buyResult({ overrides: { signal: null } }),
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'VALIDATION_FAILED');
    assert.equal(notifyCalls, 0);
  });
});

describe('watcher: duplicate protection', () => {
  it('engine-store is_new_event: false -> no duplicate alert even on a genuinely new candle', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => buyResult({ signalId: 'dup-1', isNew: false }),
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'DUPLICATE_SIGNAL');
    assert.equal(notifyCalls, 0);
  });

  it('watcher restart (state already recorded this signal_id as alerted) -> no duplicate alert, even if the engine reports is_new_event: true', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      calculateEntry: async () => buyResult({ signalId: 'restart-1', isNew: true }),
      notify: () => { notifyCalls++; },
    };
    // Simulates a fresh process that reloaded persisted state from a prior run.
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_alerted_signal_id: 'restart-1' });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'DUPLICATE_SIGNAL');
    assert.equal(notifyCalls, 0);
  });
});

describe('watcher: connection failure handling', () => {
  it('CDP unreachable -> cycle survives (no throw), logs once, and repeated failures do not re-log', async () => {
    const log = makeLog();
    const deps = {
      isCdpReachable: async () => false,
      peekLatest5mCandle: async () => { throw new Error('must not be called while disconnected'); },
      calculateEntry: async () => { throw new Error('must not be called while disconnected'); },
      notify: () => {},
    };
    let state = freshState();
    const r1 = await runWatcherCycle({ state, deps, log });
    assert.equal(r1.action, 'CONNECTION_UNAVAILABLE');
    assert.equal(r1.state.last_connection_ok, false);
    assert.equal(log.lines.length, 1);

    const r2 = await runWatcherCycle({ state: r1.state, deps, log });
    assert.equal(r2.action, 'CONNECTION_UNAVAILABLE');
    assert.equal(log.lines.length, 1, 'must not repeat the identical connection warning every poll');
  });

  it('reconnect resumes safely: re-baselines without calling the engine (no historical replay) and logs recovery once', async () => {
    const log = makeLog();
    let calcCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 5000 }),
      calculateEntry: async () => { calcCalls++; return buyResult(); },
      notify: () => { throw new Error('must not alert on a reconnect rebaseline'); },
    };
    const disconnectedState = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: false });
    const result = await runWatcherCycle({ state: disconnectedState, deps, log });
    assert.equal(result.action, 'RECONNECTED_REBASELINE');
    assert.equal(calcCalls, 0);
    assert.equal(result.state.last_processed_5m_time, 5000);
    assert.equal(result.state.last_connection_ok, true);
    assert.equal(log.lines.filter((l) => l.includes('connection restored')).length, 1);

    // Next poll, same candle -> ordinary no-op, never replays the gap.
    const next = await runWatcherCycle({ state: result.state, deps, log });
    assert.equal(next.action, 'NO_NEW_CANDLE');
    assert.equal(calcCalls, 0);
  });
});

describe('watcher: chart restoration', () => {
  it('peekLatest5mCandle switches to 5m only when needed and always restores the original resolution', async () => {
    const setTimeframeCalls = [];
    const deps = {
      getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: '15' }),
      setTimeframe: async ({ timeframe }) => { setTimeframeCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => ({ bars: [{ time: 100, open: 1, high: 2, low: 0, close: 1 }, { time: 400, open: 1, high: 2, low: 0, close: 1 }] }),
    };
    const candle = await peekLatest5mCandle(deps);
    assert.equal(candle.time, 100); // confirmed = second-to-last bar; last bar is forming
    assert.deepEqual(setTimeframeCalls, ['5', '15']);
  });

  it('restores the original resolution even when getOhlcv throws', async () => {
    const setTimeframeCalls = [];
    const deps = {
      getState: async () => ({ success: true, resolution: '30' }),
      setTimeframe: async ({ timeframe }) => { setTimeframeCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => { throw new Error('chart still loading'); },
    };
    await assert.rejects(() => peekLatest5mCandle(deps));
    assert.deepEqual(setTimeframeCalls, ['5', '30']);
  });

  it('does not switch timeframe at all if the chart is already on 5m', async () => {
    const setTimeframeCalls = [];
    const deps = {
      getState: async () => ({ success: true, resolution: '5' }),
      setTimeframe: async ({ timeframe }) => { setTimeframeCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => ({ bars: [{ time: 100 }, { time: 400 }] }),
    };
    await peekLatest5mCandle(deps);
    assert.deepEqual(setTimeframeCalls, []);
  });
});

describe('watcher: single-instance lock', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xauusd-watcher-lock-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('a second acquire fails while the first holder is alive', () => {
    const lockPath = join(dir, 'watcher.lock');
    const first = acquireLock(lockPath, { isAlive: () => true });
    assert.equal(first.acquired, true);
    const second = acquireLock(lockPath, { isAlive: () => true });
    assert.equal(second.acquired, false);
    assert.equal(second.holderPid, first.holderPid);
  });

  it('a stale lock (holder process no longer alive) is safely reclaimed', () => {
    const lockPath = join(dir, 'watcher.lock');
    acquireLock(lockPath, { isAlive: () => true });
    const second = acquireLock(lockPath, { isAlive: () => false });
    assert.equal(second.acquired, true);
  });

  it('releaseLock only removes a lock this process owns', () => {
    const lockPath = join(dir, 'watcher.lock');
    acquireLock(lockPath);
    releaseLock(lockPath);
    assert.equal(existsSync(lockPath), false);
  });
});

describe('watcher: state persistence', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xauusd-watcher-state-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loadWatcherState returns fresh defaults when no file exists yet', () => {
    const state = loadWatcherState(join(dir, 'missing.json'));
    assert.equal(state.baseline_established, false);
    assert.equal(state.last_processed_5m_time, null);
  });

  it('round-trips last_processed_5m_time and last_alerted_signal_id atomically, leaving no temp file behind', () => {
    const statePath = join(dir, 'state.json');
    saveWatcherState(statePath, freshState({ baseline_established: true, last_processed_5m_time: 1300, last_alerted_signal_id: 'sig-1' }));
    const reloaded = loadWatcherState(statePath);
    assert.equal(reloaded.last_processed_5m_time, 1300);
    assert.equal(reloaded.last_alerted_signal_id, 'sig-1');
    const leftoverTemp = readdirSync(dir).some((f) => f.includes('.tmp-'));
    assert.equal(leftoverTemp, false);
  });

  it('a corrupt state file fails closed to fresh defaults instead of crashing', () => {
    const statePath = join(dir, 'corrupt.json');
    writeFileSync(statePath, '{ not valid json');
    const state = loadWatcherState(statePath);
    assert.equal(state.baseline_established, false);
  });
});

describe('watcher: notifier formatting', () => {
  it('formats the exact required alert layout, using NA for any field the engine did not supply', () => {
    const text = formatSignalAlert({
      action: 'BUY', entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2,
      quality: 80, timeframe: '15m', setup: 'PB', time: '2026-09-17T15:40:29.062Z',
    });
    assert.match(text, /^XAUUSD SIGNAL\n\nAction: BUY\nEntry: 2000\nSL: 1990\nTP1: 2010\nTP2: 2020\nRR: 2\nQuality: 80\nTF: 15m\nSetup: PB\nTime: 2026-09-17T15:40:29\.062Z$/);
  });

  it('never invents a missing field', () => {
    const text = formatSignalAlert({ action: 'SELL', entry: 2000, sl: null, tp1: null, tp2: null, rr: null, quality: null, timeframe: null, setup: null, time: null });
    assert.match(text, /SL: NA/);
    assert.match(text, /Quality: NA/);
  });
});

describe('watcher: graceful shutdown', () => {
  it('SIGINT triggers a clean stop: clears the interval, saves state, releases the lock, never touches TradingView', async () => {
    const signalHandlers = {};
    let cleared = null;
    let savedState = null;
    let released = false;
    const deps = {
      statePath: '/fake/state.json',
      lockPath: '/fake/lock',
      loadState: () => freshState({ baseline_established: true, last_processed_5m_time: 42 }),
      saveState: (_p, s) => { savedState = s; },
      acquireLock: () => ({ acquired: true, holderPid: 123 }),
      releaseLock: () => { released = true; },
      setInterval: (fn) => { void fn; return 'TIMER'; },
      clearInterval: (t) => { cleared = t; },
      onSignal: (sig, fn) => { signalHandlers[sig] = fn; },
      offSignal: () => {},
      log: () => {},
      runCycle: async ({ state }) => ({ state }),
      cycle: {},
    };
    const promise = startWatcher({ _deps: deps });
    // Let the immediate first tick's microtasks flush before shutting down.
    await new Promise((r) => setTimeout(r, 0));
    signalHandlers.SIGINT();
    const result = await promise;
    assert.equal(result.success, true);
    assert.equal(result.stopped_reason, 'SIGINT');
    assert.equal(cleared, 'TIMER');
    assert.equal(released, true);
    assert.ok(savedState);
  });

  it('a lock conflict exits cleanly without registering timers or signal handlers', async () => {
    let intervalCalls = 0;
    let signalCalls = 0;
    const deps = {
      acquireLock: () => ({ acquired: false, holderPid: 999 }),
      setInterval: () => { intervalCalls++; return 'T'; },
      onSignal: () => { signalCalls++; },
      log: () => {},
    };
    const result = await startWatcher({ _deps: deps });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'ALREADY_RUNNING');
    assert.equal(result.holder_pid, 999);
    assert.equal(intervalCalls, 0);
    assert.equal(signalCalls, 0);
  });
});

describe('watcher: never duplicates the calculation engine', () => {
  it('source audit — watcher.js only ever imports the decision engine from core/xauusd_calculate.js, never the regime/structure/correction/model/risk/quality/pipeline/mtf/htf primitives directly', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/engine/watcher.js', import.meta.url)), 'utf8');
    assert.match(source, /from '\.\.\/core\/xauusd_calculate\.js'/);
    for (const forbidden of ['./regime.js', './structure.js', './correction.js', './models.js', './risk.js', './quality.js', './pipeline.js', './mtf.js', './htf.js']) {
      assert.ok(!source.includes(forbidden), `watcher.js must not import ${forbidden} directly — it must call the existing engine, never re-implement it`);
    }
  });

  it('regression guard — importing the watcher never changed the engine schema version', () => {
    assert.equal(CALCULATE_SCHEMA_VERSION, '1.1.0');
  });
});
