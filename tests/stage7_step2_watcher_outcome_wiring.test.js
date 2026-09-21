/**
 * src/engine/watcher.js -- Stage 7 Step 2 wiring of the (optional,
 * observational) Opportunity Outcome Resolver. Proves:
 *   - createCycleDeps() exposes resolveOpportunityOutcomes by default
 *   - it is called with the SAME bars analyzeMarket() already fetched
 *     (result.primary_confirmed_bars) -- never a second sweep
 *   - it is OPTIONAL (omitting it preserves prior behavior)
 *   - a throwing/rejecting resolveOpportunityOutcomes NEVER alters the
 *     watcher's BUY/SELL/WAIT decision, never suppresses/generates an
 *     alert, and never crashes the cycle (failure isolation)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWatcherCycle, createCycleDeps } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { CALCULATE_SCHEMA_VERSION } from '../src/core/xauusd_calculate.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

const FAKE_BARS = [{ time: 1, open: 1, high: 1, low: 1, close: 1 }];

function baseCalcResult(overrides = {}) {
  return {
    schema_version: CALCULATE_SCHEMA_VERSION, status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', calculated_at: '2026-09-17T15:40:29.062Z', diagnostics: { source_timeframe: '15m' },
    evidence: { regime: 'BULL_TREND' }, anticipation: { state: 'DEVELOPING' }, confluence: { action: 'WAIT' },
    candidates: { '5m': { blocked_by: 'RR_NOT_ACCEPTABLE' } },
    primary_confirmed_bars: FAKE_BARS,
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

describe('createCycleDeps: wires resolveOpportunityOutcomes by default', () => {
  it('exposes a function by default', () => {
    const deps = createCycleDeps({});
    assert.equal(typeof deps.resolveOpportunityOutcomes, 'function');
  });

  it('an injected override replaces the default implementation', () => {
    const marker = async () => {};
    const deps = createCycleDeps({ resolveOpportunityOutcomes: marker });
    assert.strictEqual(deps.resolveOpportunityOutcomes, marker);
  });
});

describe('runWatcherCycle: resolveOpportunityOutcomes wiring', () => {
  it('is called with the SAME bars analyzeMarket() already fetched -- never a second sweep', async () => {
    let seenArgs = null;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      resolveOpportunityOutcomes: async (args) => { seenArgs = args; return { evaluated: 0, resolved: 0, unresolved: 0 }; },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.ok(seenArgs);
    assert.strictEqual(seenArgs.confirmedBars, FAKE_BARS);
  });

  it('is OPTIONAL -- omitting it preserves prior behavior (no throw)', async () => {
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

  it('a throwing resolveOpportunityOutcomes never blocks a BUY alert', async () => {
    let notified = null;
    const log = [];
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      resolveOpportunityOutcomes: async () => { throw new Error('outcome store unavailable'); },
      notify: (alert) => { notified = alert; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: (msg) => log.push(msg) });
    assert.equal(result.alerted, true);
    assert.equal(notified.action, 'BUY');
    assert.ok(log.some((l) => l.includes('Opportunity outcome resolution failed')));
  });

  it('a throwing resolveOpportunityOutcomes never turns a WAIT cycle into an alert, and never crashes it', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      resolveOpportunityOutcomes: async () => { throw new Error('boom'); },
      notify: () => { throw new Error('must not be called for WAIT'); },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'WAIT');
    assert.equal(result.alerted, false);
  });

  it('runs AFTER Stage 3/Ledger/visualization -- their own results are unaffected by its presence or failure', async () => {
    let anticipationObserved = false;
    let ledgerObserved = false;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      recordAnticipationObservation: () => { anticipationObserved = true; },
      recordOpportunityObservation: () => { ledgerObserved = true; return { recorded: false }; },
      resolveOpportunityOutcomes: async () => { throw new Error('boom'); },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(anticipationObserved, true);
    assert.equal(ledgerObserved, true);
  });
});
