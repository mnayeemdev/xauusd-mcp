/**
 * Operational feed-stall alert (src/engine/watcher.js trackFeedHealth,
 * src/engine/notifier.js notifyOps/formatOpsAlert) -- deterministic tests
 * with fully injected deps. No CDP, no timers, no OS signals, no real
 * state files.
 *
 * Proves: the alert is one-shot on a prolonged run of polls that could
 * not obtain a confirmed 5m candle, one-shot on recovery, counts BOTH
 * CONNECTION_UNAVAILABLE and CANDLE_READ_FAILED, never fires the trade
 * notifier, and never alters the cycle's action, candle gating or
 * re-baseline behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runWatcherCycle,
  trackFeedHealth,
  createCycleDeps,
  DEFAULT_FEED_STALL_ALERT_AFTER_POLLS,
  FEED_FAILURE_ACTIONS,
} from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE, loadWatcherState, saveWatcherState } from '../src/engine/watcherState.js';
import { formatOpsAlert, notifyOps } from '../src/engine/notifier.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function makeLog() {
  const lines = [];
  const log = (msg) => lines.push(msg);
  log.lines = lines;
  return log;
}

function readFailingDeps({ ops, trade, threshold, mode = 'read' } = {}) {
  let t = 1_000_000;
  return {
    isCdpReachable: async () => mode !== 'down',
    peekLatest5mCandle: async () => { const e = new Error('could not obtain a fresh, verified 5m candle after 8 attempt(s): Could not extract OHLCV data'); e.code = 'STALE_5M_DATA'; throw e; },
    analyzeMarket: async () => { throw new Error('engine must not be called while the feed is failing'); },
    notify: () => { trade?.push('TRADE'); },
    notifyOps: (p) => { ops?.push(p); },
    feedStallAlertAfterPolls: threshold,
    now: () => new Date((t += 60_000)),
  };
}

describe('feed-stall alert: defaults and constants', () => {
  it('defaults to five consecutive failed polls (one whole 5m bar) and counts both failure kinds', () => {
    assert.equal(DEFAULT_FEED_STALL_ALERT_AFTER_POLLS, 5);
    assert.deepEqual([...FEED_FAILURE_ACTIONS], ['CONNECTION_UNAVAILABLE', 'CANDLE_READ_FAILED']);
    const deps = createCycleDeps({ isCdpReachable: async () => false });
    assert.equal(typeof deps.notifyOps, 'function');
    assert.equal(deps.feedStallAlertAfterPolls, 5);
  });

  it('watcher state carries the streak fields with safe defaults and they survive a save/load round trip', async () => {
    assert.equal(DEFAULT_WATCHER_STATE.feed_failure_streak, 0);
    assert.equal(DEFAULT_WATCHER_STATE.feed_failure_since, null);
    assert.equal(DEFAULT_WATCHER_STATE.feed_stall_alerted_at, null);
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'xauusd-feed-stall-'));
    try {
      const path = join(dir, 'state.json');
      saveWatcherState(path, freshState({ feed_failure_streak: 3, feed_failure_since: '2026-09-25T13:29:00.000Z' }));
      const loaded = loadWatcherState(path);
      assert.equal(loaded.feed_failure_streak, 3);
      assert.equal(loaded.feed_failure_since, '2026-09-25T13:29:00.000Z');
      assert.equal(loaded.feed_stall_alerted_at, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('feed-stall alert: CANDLE_READ_FAILED streak', () => {
  it('below the threshold: streak is tracked, no operational alert, cycle action unchanged', async () => {
    const ops = [];
    const trade = [];
    const deps = readFailingDeps({ ops, trade, threshold: 3 });
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: true });
    for (let i = 1; i <= 2; i++) {
      const r = await runWatcherCycle({ state, deps, log: () => {} });
      assert.equal(r.action, 'CANDLE_READ_FAILED');
      assert.equal(r.alerted, false);
      state = r.state;
      assert.equal(state.feed_failure_streak, i);
      assert.equal(typeof state.feed_failure_since, 'string');
      assert.equal(state.feed_stall_alerted_at, null);
    }
    assert.equal(ops.length, 0);
    assert.equal(trade.length, 0);
    // Decision-relevant fields untouched by a read failure.
    assert.equal(state.last_processed_5m_time, 1000);
    assert.equal(state.last_connection_ok, true);
  });

  it('reaching the threshold raises exactly ONE FEED_STALLED alert, not one per poll', async () => {
    const ops = [];
    const trade = [];
    const log = makeLog();
    const deps = readFailingDeps({ ops, trade, threshold: 3 });
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1790342400, last_connection_ok: true });
    for (let i = 1; i <= 7; i++) {
      const r = await runWatcherCycle({ state, deps, log });
      state = r.state;
    }
    assert.equal(ops.length, 1, 'one-shot: a 7-poll streak must produce a single FEED_STALLED alert');
    assert.equal(ops[0].kind, 'FEED_STALLED');
    assert.equal(ops[0].consecutive_failures, 3);
    assert.equal(ops[0].last_reason, 'CANDLE_READ_FAILED');
    assert.equal(ops[0].last_processed_5m_time, 1790342400);
    assert.equal(typeof ops[0].since, 'string');
    assert.equal(state.feed_failure_streak, 7);
    assert.equal(state.feed_stall_alerted_at, ops[0].at);
    assert.equal(trade.length, 0, 'operational alert must never go through the trade notifier');
    assert.equal(log.lines.filter((l) => l.includes('FEED STALLED')).length, 1);
  });

  it('uses the default threshold when none is injected', async () => {
    const ops = [];
    const deps = readFailingDeps({ ops });
    delete deps.feedStallAlertAfterPolls;
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: true });
    for (let i = 1; i <= DEFAULT_FEED_STALL_ALERT_AFTER_POLLS - 1; i++) state = (await runWatcherCycle({ state, deps, log: () => {} })).state;
    assert.equal(ops.length, 0);
    state = (await runWatcherCycle({ state, deps, log: () => {} })).state;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].consecutive_failures, DEFAULT_FEED_STALL_ALERT_AFTER_POLLS);
  });
});

describe('feed-stall alert: CONNECTION_UNAVAILABLE counts too', () => {
  it('a CDP-down streak raises the same one-shot alert and keeps the existing re-baseline semantics', async () => {
    const ops = [];
    const deps = readFailingDeps({ ops, threshold: 2, mode: 'down' });
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: true });
    const r1 = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(r1.action, 'CONNECTION_UNAVAILABLE');
    assert.equal(r1.state.last_connection_ok, false, 'existing disconnect bookkeeping must be preserved');
    state = r1.state;
    const r2 = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'FEED_STALLED');
    assert.equal(ops[0].last_reason, 'CONNECTION_UNAVAILABLE');
    state = r2.state;
    // Recovery: CDP back -> the existing silent re-baseline fires, plus one FEED_RECOVERED.
    deps.isCdpReachable = async () => true;
    deps.peekLatest5mCandle = async () => ({ time: 2000 });
    const r3 = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(r3.action, 'RECONNECTED_REBASELINE');
    assert.equal(r3.alerted, false);
    assert.equal(r3.state.last_processed_5m_time, 2000, 're-baseline to the latest confirmed candle, no historical replay');
    assert.equal(ops.length, 2);
    assert.equal(ops[1].kind, 'FEED_RECOVERED');
    assert.equal(ops[1].recovered_action, 'RECONNECTED_REBASELINE');
    assert.equal(r3.state.feed_failure_streak, 0);
    assert.equal(r3.state.feed_failure_since, null);
    assert.equal(r3.state.feed_stall_alerted_at, null);
  });
});

describe('feed-stall alert: recovery', () => {
  it('after a stall alert, the first successful candle read raises ONE FEED_RECOVERED and resets the streak; later polls stay silent', async () => {
    const ops = [];
    const trade = [];
    const log = makeLog();
    const deps = readFailingDeps({ ops, trade, threshold: 2 });
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: true });
    for (let i = 1; i <= 4; i++) state = (await runWatcherCycle({ state, deps, log })).state;
    assert.equal(ops.length, 1);
    // Feed back: CDP was reachable throughout (CANDLE_READ_FAILED never flips
    // last_connection_ok), so the existing behaviour is a plain new-candle
    // evaluation of the LATEST confirmed candle -- exactly once, never a
    // replay of the bars missed during the stall.
    let engineCalls = 0;
    deps.peekLatest5mCandle = async () => ({ time: 1900 });
    deps.analyzeMarket = async () => { engineCalls++; return { status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY' }; };
    const r = await runWatcherCycle({ state, deps, log });
    assert.equal(r.action, 'WAIT');
    assert.equal(engineCalls, 1);
    assert.equal(r.state.last_processed_5m_time, 1900);
    assert.equal(ops.length, 2);
    assert.equal(ops[1].kind, 'FEED_RECOVERED');
    assert.equal(ops[1].consecutive_failures, 4);
    assert.equal(ops[1].recovered_action, 'WAIT');
    assert.equal(r.state.feed_failure_streak, 0);
    assert.equal(r.state.feed_stall_alerted_at, null);
    state = r.state;
    const r2 = await runWatcherCycle({ state, deps, log });
    assert.equal(r2.action, 'NO_NEW_CANDLE');
    assert.equal(ops.length, 2, 'no further operational alerts while healthy');
    assert.equal(trade.length, 0);
    assert.equal(log.lines.filter((l) => l.includes('FEED RECOVERED')).length, 1);
  });

  it('a short blip below the threshold recovers silently (no FEED_RECOVERED without a prior FEED_STALLED)', async () => {
    const ops = [];
    const deps = readFailingDeps({ ops, threshold: 5 });
    let state = freshState({ baseline_established: true, last_processed_5m_time: 1000, last_connection_ok: true });
    for (let i = 1; i <= 2; i++) state = (await runWatcherCycle({ state, deps, log: () => {} })).state;
    deps.peekLatest5mCandle = async () => ({ time: 1000 });
    const r = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(r.action, 'NO_NEW_CANDLE');
    assert.equal(ops.length, 0);
    assert.equal(r.state.feed_failure_streak, 0);
    assert.equal(r.state.feed_failure_since, null);
  });
});

describe('feed-stall alert: isolation', () => {
  it('a missing or throwing notifyOps never changes the outcome', () => {
    const outcome = { state: freshState({ feed_failure_streak: 4 }), action: 'CANDLE_READ_FAILED', alerted: false };
    const silent = trackFeedHealth({ outcome, deps: { feedStallAlertAfterPolls: 5 } });
    assert.equal(silent.action, 'CANDLE_READ_FAILED');
    assert.equal(silent.state.feed_failure_streak, 5);
    assert.equal(typeof silent.state.feed_stall_alerted_at, 'string');
    const log = makeLog();
    const thrown = trackFeedHealth({ outcome, deps: { feedStallAlertAfterPolls: 5, notifyOps: () => { throw new Error('toast broke'); } }, log });
    assert.equal(thrown.action, 'CANDLE_READ_FAILED');
    assert.equal(thrown.state.feed_failure_streak, 5);
    assert.ok(log.lines.some((l) => l.includes('Operational notification failed')));
  });

  it('a healthy outcome with no streak history is returned untouched (identity)', () => {
    const outcome = { state: freshState({ baseline_established: true, last_processed_5m_time: 1000 }), action: 'NO_NEW_CANDLE', alerted: false };
    assert.equal(trackFeedHealth({ outcome, deps: {} }), outcome);
  });
});

describe('feed-stall alert: notifier format', () => {
  it('FEED_STALLED / FEED_RECOVERED render with the OPS header and the NOT A TRADE SIGNAL footer, never trade geometry', () => {
    const stalled = formatOpsAlert({ kind: 'FEED_STALLED', consecutive_failures: 5, since: '2026-09-25T13:29:19.000Z', last_reason: 'CANDLE_READ_FAILED', last_processed_5m_time: 1790342400, at: '2026-09-25T13:34:20.000Z' });
    assert.ok(stalled.startsWith('XAUUSD WATCHER OPS — FEED_STALLED'));
    assert.ok(stalled.includes('5 consecutive poll(s)'));
    assert.ok(stalled.includes('Last reason: CANDLE_READ_FAILED'));
    assert.ok(stalled.includes('Last processed 5m bar: 1790342400'));
    assert.ok(stalled.endsWith('NOT A TRADE SIGNAL'));
    assert.ok(!/Entry|SL|TP1|TP2|RR/.test(stalled));
    const recovered = formatOpsAlert({ kind: 'FEED_RECOVERED', consecutive_failures: 28, since: '2026-09-25T13:29:19.000Z', recovered_action: 'WAIT', at: '2026-09-25T13:57:15.000Z' });
    assert.ok(recovered.startsWith('XAUUSD WATCHER OPS — FEED_RECOVERED'));
    assert.ok(recovered.includes('after 28 failed poll(s)'));
    assert.ok(recovered.endsWith('NOT A TRADE SIGNAL'));
  });

  it('notifyOps delivers to console and spawns the desktop toast best-effort', () => {
    const logged = [];
    const spawned = [];
    const spawnImpl = (cmd, args) => { spawned.push({ cmd, args }); return { on() {}, unref() {} }; };
    notifyOps({ kind: 'FEED_STALLED', consecutive_failures: 5, since: 's', last_reason: 'CANDLE_READ_FAILED', last_processed_5m_time: 1, at: 't' }, { _deps: { log: (m) => logged.push(m), spawnImpl } });
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes('FEED_STALLED'));
    if (process.platform === 'win32') {
      assert.equal(spawned.length, 1);
      assert.ok(spawned[0].args.join(' ').includes('XAUUSD WATCHER OPS'));
    }
    notifyOps({ kind: 'FEED_RECOVERED', consecutive_failures: 5, since: 's', recovered_action: 'WAIT', at: 't' }, { channels: ['console'], _deps: { log: (m) => logged.push(m), spawnImpl } });
    assert.equal(logged.length, 2);
    assert.equal(spawned.length, process.platform === 'win32' ? 1 : 0, 'console-only channel must not spawn a toast');
  });
});
