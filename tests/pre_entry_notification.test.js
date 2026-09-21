/**
 * Pre-Entry Opportunity Planner upgrade -- low-noise pre-entry watch
 * notification (mission Section 32).
 *
 * Proves:
 *   - formatPreEntryWatchAlert() always carries a distinct header and an
 *     explicit "NOT A CONFIRMED TRADE" footer -- structurally impossible
 *     to confuse with formatSignalAlert()'s confirmed-trade format
 *   - the watcher fires it ONLY on a genuine transition into ARMED --
 *     never on DEVELOPING/APPROACHING_ZONE/etc., never repeated while an
 *     opportunity simply remains ARMED across later confirmed bars, and
 *     never when the ledger recorded nothing (e.g. NO_PLAN, duplicate)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPreEntryWatchAlert, formatSignalAlert } from '../src/engine/notifier.js';
import { runWatcherCycle } from '../src/engine/watcher.js';
import { DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { CALCULATE_SCHEMA_VERSION } from '../src/core/xauusd_calculate.js';

function freshState(overrides = {}) {
  return { ...DEFAULT_WATCHER_STATE, ...overrides };
}

function waitResult(overrides = {}) {
  return {
    schema_version: CALCULATE_SCHEMA_VERSION, status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', calculated_at: '2026-09-19T00:00:00.000Z', diagnostics: { source_timeframe: '15m' },
    pre_entry_plan: { status: 'PLAN', direction: 'BEARISH', source_timeframe: '15m', opportunity_state: 'DEVELOPING', zone: { type: 'supply_zone' }, interaction_state: 'APPROACHING' },
    ...overrides,
  };
}

describe('notifier: formatPreEntryWatchAlert() -- distinct, never confusable with a confirmed trade', () => {
  it('always includes the NOT A CONFIRMED TRADE footer', () => {
    const text = formatPreEntryWatchAlert({ direction: 'BEARISH', source_timeframe: '15m', zone: { type: 'supply_zone' }, interaction_state: 'REJECTION', opportunity_state: 'REACTION_PENDING' });
    assert.ok(text.endsWith('NOT A CONFIRMED TRADE'));
    assert.ok(text.startsWith('PRE-ENTRY WATCH — SELL'));
  });

  it('BUY direction uses PRE-ENTRY WATCH — BUY', () => {
    const text = formatPreEntryWatchAlert({ direction: 'BULLISH', source_timeframe: '15m', zone: { type: 'demand_zone' }, opportunity_state: 'ARMED' });
    assert.ok(text.startsWith('PRE-ENTRY WATCH — BUY'));
  });

  it('the format is structurally distinct from formatSignalAlert() -- different header, no Entry/SL/TP fields', () => {
    const preEntry = formatPreEntryWatchAlert({ direction: 'BEARISH', source_timeframe: '15m', zone: { type: 'supply_zone' }, opportunity_state: 'ARMED' });
    const confirmed = formatSignalAlert({ action: 'SELL', entry: 2000, sl: 2010, tp1: 1990, tp2: 1980, rr: 2, quality: 80, timeframe: '15m', setup: 'PB', time: 'x' });
    assert.notEqual(preEntry.split('\n')[0], confirmed.split('\n')[0]);
    assert.ok(!preEntry.includes('Entry:'));
    assert.ok(!preEntry.includes('SL:'));
  });
});

describe('watcher: pre-entry watch notification gating -- fires ONLY on a genuine transition into ARMED', () => {
  function depsWithLedger(ledgerResult) {
    let watchCalls = 0;
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => waitResult(),
      recordOpportunityObservation: () => ledgerResult,
      notifyPreEntryWatch: () => { watchCalls++; },
      notify: () => {},
    };
    return { deps, getWatchCalls: () => watchCalls };
  }

  it('fires when the ledger reports a fresh transition into ARMED', async () => {
    const { deps, getWatchCalls } = depsWithLedger({ recorded: true, record: { opportunity_state: 'ARMED', previous_opportunity_state: 'CONFIRMATION_PENDING' } });
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(getWatchCalls(), 1);
  });

  it('never fires for a DEVELOPING/APPROACHING_ZONE/REACTION_PENDING transition', async () => {
    for (const s of ['DEVELOPING', 'APPROACHING_ZONE', 'ZONE_TOUCHED', 'REACTION_PENDING', 'CONFIRMATION_PENDING']) {
      const { deps, getWatchCalls } = depsWithLedger({ recorded: true, record: { opportunity_state: s, previous_opportunity_state: 'DEVELOPING' } });
      const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
      await runWatcherCycle({ state, deps, log: () => {} });
      assert.equal(getWatchCalls(), 0, `must not fire for ${s}`);
    }
  });

  it('never re-fires while an opportunity simply REMAINS ARMED across a later confirmed bar', async () => {
    const { deps, getWatchCalls } = depsWithLedger({ recorded: true, record: { opportunity_state: 'ARMED', previous_opportunity_state: 'ARMED' } });
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(getWatchCalls(), 0);
  });

  it('never fires when the ledger recorded nothing (e.g. DUPLICATE_OBSERVATION or NO_PLAN)', async () => {
    const { deps, getWatchCalls } = depsWithLedger({ recorded: false, reason: 'DUPLICATE_OBSERVATION' });
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(getWatchCalls(), 0);
  });

  it('never fires for a CONFIRMED transition (that path is the protected BUY/SELL alert instead)', async () => {
    const { deps, getWatchCalls } = depsWithLedger({ recorded: true, record: { opportunity_state: 'CONFIRMED', previous_opportunity_state: 'ARMED' } });
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(getWatchCalls(), 0);
  });

  it('a throwing notifyPreEntryWatch never blocks the cycle or the decision', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => waitResult(),
      recordOpportunityObservation: () => ({ recorded: true, record: { opportunity_state: 'ARMED', previous_opportunity_state: 'CONFIRMATION_PENDING' } }),
      notifyPreEntryWatch: () => { throw new Error('desktop toast failed'); },
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'WAIT');
  });

  it('is entirely OPTIONAL -- omitting notifyPreEntryWatch never throws even on a real ARMED transition', async () => {
    const deps = {
      isCdpReachable: async () => true,
      peekLatest5mCandle: async () => ({ time: 1300 }),
      analyzeMarket: async () => waitResult(),
      recordOpportunityObservation: () => ({ recorded: true, record: { opportunity_state: 'ARMED', previous_opportunity_state: 'CONFIRMATION_PENDING' } }),
      notify: () => {},
    };
    const state = freshState({ baseline_established: true, last_processed_5m_time: 1000 });
    const result = await runWatcherCycle({ state, deps, log: () => {} });
    assert.equal(result.action, 'WAIT');
  });
});
