/**
 * src/engine/watcher.js -- Stage 6, Part 16-19 watcher integration.
 * Proves:
 *   - the trade-analysis cadence calls analyzeMarket({persistSignals:true})
 *     (not bare calculateEntry()) on a fresh confirmed candle
 *   - Stage 3 observation recording and Stage 5 visualization refresh are
 *     called with the SAME already-computed analysis result -- never a
 *     second sweep -- and are OPTIONAL (a caller/test that omits them
 *     keeps pre-Stage-6 behavior)
 *   - a thrown/failing Stage 3 or Stage 5 step NEVER blocks the alert
 *     decision or crashes the cycle (failure isolation, mission Part 31)
 *   - the chart-visualization tick only runs when CDP is reachable, and
 *     is independent of (never blocks/is blocked by) the trade-analysis
 *     cadence
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWatcherCycle, startWatcher, createCycleDeps } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { CALCULATE_SCHEMA_VERSION } from '../src/core/xauusd_calculate.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function baseCalcResult(overrides = {}) {
  return {
    schema_version: CALCULATE_SCHEMA_VERSION, status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', calculated_at: '2026-09-17T15:40:29.062Z', diagnostics: { source_timeframe: '15m' },
    evidence: { regime: 'BULL_TREND' }, anticipation: { state: 'DEVELOPING' }, confluence: { action: 'WAIT' },
    candidates: { '5m': { blocked_by: 'RR_NOT_ACCEPTABLE' } },
    ...overrides,
  };
}

function buyResult(overrides = {}) {
  return baseCalcResult({
    action: 'BUY', reason: null, entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2, quality: 80, setup: 'PB',
    signal: { signal_id: 'buy-1', is_new_event: true },
    ...overrides,
  });
}

describe('Stage 6 Part 16-19: trade-analysis cadence calls analyzeMarket({persistSignals:true})', () => {
  it('calls analyzeMarket exactly once per new confirmed candle, with persistSignals:true', async () => {
    const calls = [];
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async (opts) => { calls.push(opts); return baseCalcResult(); },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].persistSignals, true);
  });
});

describe('Stage 6 Part 16-19: Stage 3 / Stage 5 post-analysis steps', () => {
  it('recordAnticipationObservation is called with the SAME analysis result, on every fresh candle (WAIT included)', async () => {
    let observed = null;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      recordAnticipationObservation: (args) => { observed = args; },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.ok(observed);
    assert.equal(observed.decision.action, 'WAIT');
    assert.equal(observed.evidence.regime, 'BULL_TREND');
    assert.equal(observed.anticipation.state, 'DEVELOPING');
    assert.equal(observed.candidates['5m'].blocked_by, 'RR_NOT_ACCEPTABLE');
    assert.equal(observed.confirmedBarTime, 1300);
  });

  it('visualizeMarketAnalysis is called with the analyzeMarket() result as `analysis`, dryRun:false -- never a second sweep', async () => {
    let visualizedAnalysis = null;
    let dryRunSeen = null;
    const analysisResult = buyResult();
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => analysisResult,
      visualizeMarketAnalysis: async ({ analysis, dryRun }) => { visualizedAnalysis = analysis; dryRunSeen = dryRun; return {}; },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.strictEqual(visualizedAnalysis, analysisResult);
    assert.equal(dryRunSeen, false);
  });

  it('both steps are OPTIONAL -- omitting them entirely preserves pre-Stage-6 behavior (no throw)', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.alerted, true);
  });
});

describe('Stage 6 Part 16-19 / Part 31: failure isolation -- Stage 3/Stage 5 failures never block the alert decision', () => {
  it('a throwing recordAnticipationObservation still lets a BUY alert fire', async () => {
    let notified = null;
    const log = [];
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      recordAnticipationObservation: () => { throw new Error('Stage 3 store unavailable'); },
      notify: (alert) => { notified = alert; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: (msg) => log.push(msg) });
    assert.equal(result.alerted, true);
    assert.ok(notified);
    assert.equal(notified.action, 'BUY');
    assert.ok(log.some((l) => l.includes('Stage 3 observation recording failed')));
  });

  it('a rejecting visualizeMarketAnalysis still lets a BUY alert fire', async () => {
    let notified = null;
    const log = [];
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      visualizeMarketAnalysis: async () => { throw new Error('CDP unreachable mid-draw'); },
      notify: (alert) => { notified = alert; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: (msg) => log.push(msg) });
    assert.equal(result.alerted, true);
    assert.ok(notified);
    assert.ok(log.some((l) => l.includes('Visualization refresh failed')));
  });

  it('a throwing Stage 3 step never suppresses a WAIT cycle from completing cleanly', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      recordAnticipationObservation: () => { throw new Error('boom'); },
      visualizeMarketAnalysis: async () => { throw new Error('boom2'); },
      notify: () => { throw new Error('must not be called for WAIT'); },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'WAIT');
    assert.equal(result.alerted, false);
  });
});

describe('Stage 6 Part 16: chart-visualization tick', () => {
  function shutdownDeps(overrides = {}) {
    const signalHandlers = {};
    return {
      base: {
        statePath: '/fake/state.json', lockPath: '/fake/lock',
        loadState: () => freshState({ baseline_established: true, last_processed_5m_time: 42 }),
        saveState: () => {},
        acquireLock: () => ({ acquired: true, holderPid: 123 }),
        releaseLock: () => {},
        setInterval: (fn) => { void fn; return 'TIMER'; },
        clearInterval: () => {},
        onSignal: (sig, fn) => { signalHandlers[sig] = fn; },
        offSignal: () => {},
        log: () => {},
        runCycle: async ({ state }) => ({ state }),
        cycle: { isCdpReachable: async () => false },
        ...overrides,
      },
      signalHandlers,
    };
  }

  it('never calls visualizeActiveChartContext when CDP is unreachable (uses the same fast isCdpReachable probe)', async () => {
    let visualizeCalls = 0;
    const { base, signalHandlers } = shutdownDeps({
      cycle: { isCdpReachable: async () => false },
      visualizeActiveChartContext: async () => { visualizeCalls++; return {}; },
    });
    const promise = startWatcher({ _deps: base });
    await new Promise((r) => setTimeout(r, 10));
    signalHandlers.SIGINT();
    await promise;
    assert.equal(visualizeCalls, 0);
  });

  it('calls visualizeActiveChartContext when CDP IS reachable', async () => {
    let visualizeCalls = 0;
    const { base, signalHandlers } = shutdownDeps({
      cycle: { isCdpReachable: async () => true },
      visualizeActiveChartContext: async () => { visualizeCalls++; return {}; },
    });
    const promise = startWatcher({ _deps: base });
    await new Promise((r) => setTimeout(r, 10));
    signalHandlers.SIGINT();
    await promise;
    assert.equal(visualizeCalls, 1);
  });

  it('a throwing visualizeActiveChartContext never crashes the watcher tick', async () => {
    const { base, signalHandlers } = shutdownDeps({
      cycle: { isCdpReachable: async () => true },
      visualizeActiveChartContext: async () => { throw new Error('draw failed'); },
    });
    const promise = startWatcher({ _deps: base });
    await new Promise((r) => setTimeout(r, 10));
    signalHandlers.SIGINT();
    const result = await promise;
    assert.equal(result.success, true);
  });
});

describe('Stage 6 Part 16: createCycleDeps() wires the new Stage 6 deps', () => {
  it('exposes analyzeMarket, recordAnticipationObservation, visualizeMarketAnalysis by default', () => {
    const deps = createCycleDeps({});
    assert.equal(typeof deps.analyzeMarket, 'function');
    assert.equal(typeof deps.recordAnticipationObservation, 'function');
    assert.equal(typeof deps.visualizeMarketAnalysis, 'function');
  });

  it('an injected override replaces the default implementation', () => {
    const marker = async () => {};
    const deps = createCycleDeps({ analyzeMarket: marker });
    assert.strictEqual(deps.analyzeMarket, marker);
  });
});
