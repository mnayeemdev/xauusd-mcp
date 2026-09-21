/**
 * src/engine/watcher.js -- Opportunity Ledger wiring (Pre-Entry
 * Opportunity Planner upgrade, mission Section 30 / 47). Proves:
 *   - recordOpportunityObservation is called with the SAME analyzeMarket()
 *     result's `pre_entry_plan` -- no second sweep, no independent
 *     planner computation
 *   - it is OPTIONAL (omitting it preserves pre-upgrade behavior)
 *   - a throwing ledger recorder never blocks the alert decision or
 *     crashes the cycle (failure isolation)
 *   - no duplicate pre-entry alerts are introduced (BUY/SELL alerting
 *     behavior is completely unchanged by this wiring)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWatcherCycle } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { CALCULATE_SCHEMA_VERSION } from '../src/core/xauusd_calculate.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function baseCalcResult(overrides = {}) {
  return {
    schema_version: CALCULATE_SCHEMA_VERSION, status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', calculated_at: '2026-09-19T00:00:00.000Z', diagnostics: { source_timeframe: '15m' },
    pre_entry_plan: { status: 'PLAN', direction: 'BEARISH', opportunity_state: 'DEVELOPING', zone: { type: 'supply_zone', lower: 4378, upper: 4386 } },
    ...overrides,
  };
}

function buyResult(overrides = {}) {
  return baseCalcResult({
    action: 'BUY', reason: null, entry: 2000, sl: 1990, tp1: 2010, tp2: 2020, rr: 2, quality: 80, setup: 'PB',
    signal: { signal_id: 'buy-1', is_new_event: true },
    pre_entry_plan: { status: 'SUPERSEDED_BY_CONFIRMED_TRADE', direction: 'BULLISH', opportunity_state: 'CONFIRMED' },
    ...overrides,
  });
}

describe('watcher: Opportunity Ledger wiring', () => {
  it('recordOpportunityObservation is called with decision + the SAME pre_entry_plan from analyzeMarket()', async () => {
    let observed = null;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      recordOpportunityObservation: (args) => { observed = args; },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.ok(observed);
    assert.deepEqual(observed.plan, baseCalcResult().pre_entry_plan);
    assert.equal(observed.plan.status, 'PLAN');
    assert.equal(observed.plan.opportunity_state, 'DEVELOPING');
    assert.equal(observed.confirmedBarTime, 1300);
    assert.equal(observed.decision.action, 'WAIT');
  });

  it('is OPTIONAL -- omitting it preserves behavior, no throw', async () => {
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

  it('a throwing recordOpportunityObservation never blocks a BUY alert (failure isolation)', async () => {
    let notified = null;
    const log = [];
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      recordOpportunityObservation: () => { throw new Error('ledger disk full'); },
      notify: (alert) => { notified = alert; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: (msg) => log.push(msg) });
    assert.equal(result.alerted, true);
    assert.ok(notified);
    assert.equal(notified.action, 'BUY');
    assert.ok(log.some((l) => l.includes('Opportunity Ledger recording failed')));
  });

  it('a throwing recordOpportunityObservation never blocks a WAIT cycle from completing cleanly', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => baseCalcResult(),
      recordOpportunityObservation: () => { throw new Error('boom'); },
      notify: () => { throw new Error('must not be called for WAIT'); },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'WAIT');
    assert.equal(result.alerted, false);
  });

  it('no duplicate pre-entry alerts: notify() is still called exactly once per genuinely new BUY/SELL signal, unaffected by ledger wiring', async () => {
    let notifyCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => buyResult(),
      recordOpportunityObservation: () => {},
      notify: () => { notifyCalls++; },
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(notifyCalls, 1);
  });

  it('analyzeMarket is still called exactly once per new candle -- the ledger never triggers a second sweep', async () => {
    let calls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => { calls++; return baseCalcResult(); },
      recordOpportunityObservation: () => {},
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(calls, 1);
  });
});
