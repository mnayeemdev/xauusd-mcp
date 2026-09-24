/**
 * Runtime Live Sync, Part B/L — watcher tick() overlap guard.
 *
 * setInterval() fires on a fixed wall-clock cadence regardless of how long
 * the PREVIOUS tick's own work took. Without a guard, a slow tick (a full
 * 10-TF analysis cycle plus a chart-context visualization pass) and the
 * next scheduled tick could run concurrently in the SAME process, racing
 * the watcher's own plain-JS `state` variable (read-modify-write, no lock
 * protects it -- the CDP lock only protects the CHART, not this variable).
 * These tests prove: (1) an overlapping tick is skipped, never queued or
 * run concurrently; (2) a later, non-overlapping tick still runs normally
 * (the guard never permanently wedges the watcher); (3) skipping an
 * overlapping tick never touches `state`/saveState (no partial/racy
 * write).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startWatcher } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function overlapDeps(overrides = {}) {
  const signalHandlers = {};
  let capturedTick = null;
  const saveCalls = [];
  const base = {
    statePath: '/fake/state.json', lockPath: '/fake/lock',
    loadState: () => freshState({ baseline_established: true, last_processed_5m_time: 42 }),
    saveState: (_p, s) => { saveCalls.push(s); },
    acquireLock: () => ({ acquired: true, holderPid: 123 }),
    releaseLock: () => {},
    setInterval: (fn) => { capturedTick = fn; return 'TIMER'; },
    clearInterval: () => {},
    onSignal: (sig, fn) => { signalHandlers[sig] = fn; },
    offSignal: () => {},
    log: () => {},
    cycle: { isCdpReachable: async () => false },
    visualizeActiveChartContext: async () => ({}),
    ...overrides,
  };
  return { base, signalHandlers, saveCalls, getTick: () => capturedTick };
}

describe('watcher: tick() overlap guard', () => {
  it('skips a tick that fires while the previous tick is still running (no concurrent runCycle calls)', async () => {
    let runCycleCalls = 0;
    let maxConcurrent = 0;
    let concurrent = 0;
    let releaseFirst;
    const gate = new Promise((r) => { releaseFirst = r; });

    const { base, signalHandlers, getTick } = overlapDeps({
      runCycle: async ({ state }) => {
        runCycleCalls++;
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        if (runCycleCalls === 1) await gate; // hold the first tick open
        concurrent--;
        return { state };
      },
    });

    const promise = startWatcher({ _deps: base });
    // Let the immediate first tick() call start and enter runCycle (which
    // is now blocked on `gate`).
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(runCycleCalls, 1);

    // Simulate the interval firing again while the first tick is still
    // in-flight -- this must be SKIPPED, not run concurrently.
    const tick = getTick();
    await tick();
    assert.equal(runCycleCalls, 1, 'overlapping tick must not call runCycle a second time');
    assert.equal(maxConcurrent, 1, 'runCycle must never be entered concurrently');

    // Release the first tick's work and let it finish.
    releaseFirst();
    await new Promise((r) => setTimeout(r, 0));

    signalHandlers.SIGINT();
    await promise;
  });

  it('a later, non-overlapping tick still runs normally once the previous one has finished', async () => {
    let runCycleCalls = 0;
    const { base, signalHandlers, getTick } = overlapDeps({
      runCycle: async ({ state }) => { runCycleCalls++; return { state }; },
    });

    const promise = startWatcher({ _deps: base });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(runCycleCalls, 1);

    const tick = getTick();
    await tick(); // previous tick already resolved -- this one must run
    assert.equal(runCycleCalls, 2);

    await tick();
    assert.equal(runCycleCalls, 3);

    signalHandlers.SIGINT();
    await promise;
  });

  it('a skipped overlapping tick never calls saveState (no racy partial write of `state`)', async () => {
    let releaseFirst;
    const gate = new Promise((r) => { releaseFirst = r; });
    let runCycleCalls = 0;

    const { base, signalHandlers, saveCalls, getTick } = overlapDeps({
      runCycle: async ({ state }) => {
        runCycleCalls++;
        if (runCycleCalls === 1) await gate;
        return { state: { ...state, last_processed_5m_time: state.last_processed_5m_time + 1 } };
      },
    });

    const promise = startWatcher({ _deps: base });
    await new Promise((r) => setTimeout(r, 0));
    const savesBeforeOverlap = saveCalls.length;

    const tick = getTick();
    await tick(); // skipped: first tick still holds the gate
    assert.equal(saveCalls.length, savesBeforeOverlap, 'a skipped tick must not call saveState');

    releaseFirst();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(saveCalls.length, savesBeforeOverlap + 1, 'the first tick still saves once it completes');

    signalHandlers.SIGINT();
    await promise;
  });
});
