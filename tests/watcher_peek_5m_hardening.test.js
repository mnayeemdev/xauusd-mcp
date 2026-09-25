/**
 * Live-incident hardening for peekLatest5mCandle() (src/engine/watcher.js).
 *
 * Root cause (confirmed live against the real TradingView Desktop CDP
 * connection): chart.resolution() -- and setTimeframe()'s own internal
 * waitForChartReady() wait (src/wait.js) -- can already correctly report
 * the NEW resolution before the underlying bar series has actually
 * finished being torn down and rebuilt for it. Reading OHLCV in that exact
 * window either throws "Could not extract OHLCV data. The chart may still
 * be loading." (src/core/data.js, when mainSeries().bars() isn't populated
 * yet) or returns a stale/cached snapshot for the PREVIOUS resolution.
 * Previously, a THROWN getOhlcv() escaped peekLatest5mCandle()'s retry
 * loop immediately (zero retries) -- this is what the live watcher hit six
 * consecutive 60s-spaced ticks in a row. The fix folds a thrown extraction
 * error into the SAME bounded retry/backoff budget a stale-but-successful
 * read already used, adds an explicit bar-spacing verification (the
 * returned series must genuinely be 5-minute bars, not just "recent-
 * looking"), and wraps the whole peek in the SAME shared cross-process CDP
 * lock every other chart-mutating/-reading sequence uses.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { peekLatest5mCandle, runWatcherCycle } from '../src/engine/watcher.js';

function baseCalcResult(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', calculated_at: '2026-09-24T00:00:00.000Z', diagnostics: { source_timeframe: '15m' },
    evidence: { regime: 'BULL_TREND' }, anticipation: { state: 'DEVELOPING' }, confluence: { action: 'WAIT' },
    candidates: { '5m': { blocked_by: 'RR_NOT_ACCEPTABLE' } },
    ...overrides,
  };
}

function freshState(overrides = {}) {
  return { baseline_established: false, last_processed_5m_time: null, last_alerted_signal_id: null, last_connection_ok: null, ...overrides };
}

const REAL_NOW_SEC = 1_790_300_000;
const bars5m = (nowSec) => ({ bars: [{ time: nowSec - 300, open: 1, high: 2, low: 0, close: 1 }, { time: nowSec, open: 1, high: 2, low: 0, close: 1 }] });
// Simulates a stale snapshot still serving the OLD (15m) resolution's
// series: 900s spacing instead of the expected 300s for a genuine 5m bar.
const bars15mStale = (nowSec) => ({ bars: [{ time: nowSec - 900, open: 1, high: 2, low: 0, close: 1 }, { time: nowSec, open: 1, high: 2, low: 0, close: 1 }] });

describe('peekLatest5mCandle: hardened switch/readiness retry', () => {
  it('1. switch reports the OLD timeframe\'s series initially, then genuinely becomes 5m -- retries through the mismatch and succeeds', async () => {
    let call = 0;
    const setTimeframeCalls = [];
    const deps = {
      getState: async () => ({ success: true, resolution: '15' }),
      setTimeframe: async ({ timeframe }) => { setTimeframeCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => { call++; return call < 3 ? bars15mStale(REAL_NOW_SEC) : bars5m(REAL_NOW_SEC); },
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
    };
    const candle = await peekLatest5mCandle(deps);
    assert.equal(candle.time, REAL_NOW_SEC - 300);
    assert.ok(call >= 3, 'must have retried past the wrong-spacing (old-timeframe) reads');
    assert.equal(setTimeframeCalls.at(-1), '15', 'must restore the original chart resolution on success');
  });

  it('2. 5m selected but OHLCV temporarily unavailable (throws), then succeeds', async () => {
    let call = 0;
    const deps = {
      getState: async () => ({ success: true, resolution: '15' }),
      setTimeframe: async () => ({ success: true }),
      getOhlcv: async () => {
        call++;
        if (call <= 2) throw new Error('Could not extract OHLCV data. The chart may still be loading.');
        return bars5m(REAL_NOW_SEC);
      },
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
    };
    const candle = await peekLatest5mCandle(deps);
    assert.equal(candle.time, REAL_NOW_SEC - 300);
    assert.ok(call >= 3, 'a thrown extraction error must be retried, not propagated immediately');
  });

  it('3. timeout/attempt-budget exhaustion fails closed -- never returns a candle, even when the SAME error persists throughout', async () => {
    let call = 0;
    const deps = {
      getState: async () => ({ success: true, resolution: '15' }),
      setTimeframe: async () => ({ success: true }),
      getOhlcv: async () => { call++; throw new Error('Could not extract OHLCV data. The chart may still be loading.'); },
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
    };
    await assert.rejects(() => peekLatest5mCandle(deps), (err) => err.code === 'STALE_5M_DATA' && /could not obtain a fresh, verified 5m candle/.test(err.message));
    assert.ok(call > 1, 'must have retried within the bounded budget before giving up');
  });

  it('4. original chart TF is always restored -- on success after retries, AND on total failure', async () => {
    const successCalls = [];
    let c1 = 0;
    const successDeps = {
      getState: async () => ({ success: true, resolution: '30' }),
      setTimeframe: async ({ timeframe }) => { successCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => { c1++; if (c1 < 2) throw new Error('still loading'); return bars5m(REAL_NOW_SEC); },
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
    };
    await peekLatest5mCandle(successDeps);
    assert.equal(successCalls.at(-1), '30');

    const failCalls = [];
    const failDeps = {
      getState: async () => ({ success: true, resolution: '60' }),
      setTimeframe: async ({ timeframe }) => { failCalls.push(timeframe); return { success: true }; },
      getOhlcv: async () => { throw new Error('still loading'); },
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
    };
    await assert.rejects(() => peekLatest5mCandle(failDeps));
    assert.equal(failCalls.at(-1), '60');
  });

  it('5. the shared CDP lock is always acquired and released, on both success and failure (via the real lock file)', async () => {
    const { withCdpLock, releaseCdpLock } = await import('../src/engine/cdpLock.js');
    const { existsSync } = await import('node:fs');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'xauusd-peek-lock-'));
    const lockPath = join(dir, 'cdp.lock');
    try {
      let call = 0;
      const okDeps = {
        getState: async () => ({ success: true, resolution: '15' }),
        setTimeframe: async () => ({ success: true }),
        getOhlcv: async () => bars5m(REAL_NOW_SEC),
        now: () => new Date(REAL_NOW_SEC * 1000),
        sleep: async () => {},
        cdpLockPath: lockPath,
        withCdpLock,
      };
      await peekLatest5mCandle(okDeps);
      assert.equal(existsSync(lockPath), false, 'lock must be released after a successful peek');

      const failDeps = { ...okDeps, getOhlcv: async () => { call++; throw new Error('still loading'); } };
      await assert.rejects(() => peekLatest5mCandle(failDeps));
      assert.equal(existsSync(lockPath), false, 'lock must be released after a failed peek too');
      assert.ok(call > 0);
    } finally {
      releaseCdpLock(lockPath);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('5b. peekLatest5mCandle routes through withCdpLock exactly once per call (never bypassed, never nested)', async () => {
    let lockCalls = 0;
    const spyWithCdpLock = async (path, fn) => { lockCalls++; assert.equal(path, '/fake/cdp.lock'); return fn(); };
    const deps = {
      getState: async () => ({ success: true, resolution: '15' }),
      setTimeframe: async () => ({ success: true }),
      getOhlcv: async () => bars5m(REAL_NOW_SEC),
      now: () => new Date(REAL_NOW_SEC * 1000),
      sleep: async () => {},
      cdpLockPath: '/fake/cdp.lock',
      withCdpLock: spyWithCdpLock,
    };
    await peekLatest5mCandle(deps);
    assert.equal(lockCalls, 1);
  });
});

describe('runWatcherCycle: recovery + duplicate-analysis prevention around the hardened peek', () => {
  it('6. a transient peek failure followed by a genuinely new confirmed 5m candle is recognized once CDP/data recovers', async () => {
    let calcCalls = 0;
    const log = () => {};
    let peekMode = 'fail';
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => {
        if (peekMode === 'fail') { const e = new Error('Could not extract OHLCV data. The chart may still be loading.'); e.code = 'STALE_5M_DATA'; throw e; }
        return { time: 2000 };
      },
      analyzeMarket: async () => { calcCalls++; return baseCalcResult(); },
      notify: () => {},
    };

    // Cycle 1: peek fails (matches the live incident) -- fails closed, no engine call.
    const r1 = await runWatcherCycle({ state: freshState(), deps, log });
    assert.equal(r1.action, 'CANDLE_READ_FAILED');
    assert.equal(calcCalls, 0);
    assert.equal(r1.state.baseline_established, false);

    // Cycle 2: still not yet baselined, peek now recovers with a genuinely new candle.
    peekMode = 'ok';
    const r2 = await runWatcherCycle({ state: r1.state, deps, log });
    assert.equal(r2.action, 'BASELINE_ESTABLISHED');
    assert.equal(r2.state.last_processed_5m_time, 2000);
    assert.equal(calcCalls, 0, 'establishing the baseline itself never calls the engine');

    // Cycle 3: a LATER, genuinely new confirmed candle now triggers exactly one analysis.
    deps.peekLatest5mCandle = async () => ({ time: 2300 });
    const r3 = await runWatcherCycle({ state: r2.state, deps, log });
    assert.equal(r3.action, 'WAIT');
    assert.equal(calcCalls, 1, 'exactly one analysis for the new confirmed candle after recovery');
    assert.equal(r3.state.last_processed_5m_time, 2300);
  });

  it('7. the SAME confirmed 5m candle (even after the hardened peek needed retries to obtain it) never triggers a duplicate full analysis', async () => {
    let calcCalls = 0;
    const log = () => {};
    let peekTime = 5000;
    const deps = {
      isCdpReachable: async () => true,
      // as if obtained after internal retries -- the caller only ever sees the final resolved time.
      peekLatest5mCandle: async () => ({ time: peekTime }),
      analyzeMarket: async () => { calcCalls++; return baseCalcResult(); },
      notify: () => {},
    };
    // Baseline establishment itself never analyzes.
    const r1 = await runWatcherCycle({ state: freshState(), deps, log });
    assert.equal(r1.action, 'BASELINE_ESTABLISHED');
    assert.equal(calcCalls, 0);

    // A genuinely NEW confirmed candle -- exactly one analysis.
    peekTime = 5300;
    const r2 = await runWatcherCycle({ state: r1.state, deps, log });
    assert.equal(r2.action, 'WAIT');
    assert.equal(calcCalls, 1);

    // Same confirmed candle time again (e.g. the watcher polled again before
    // a new 5m bar had formed) -- must NOT analyze a second time.
    const r3 = await runWatcherCycle({ state: r2.state, deps, log });
    assert.equal(r3.action, 'NO_NEW_CANDLE');
    assert.equal(calcCalls, 1, 'no duplicate analysis for the same confirmed 5m candle');
  });
});
