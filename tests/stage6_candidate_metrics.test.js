/**
 * Stage 6, Part 4-6 -- additive candidate observability recorded onto
 * Stage 3's anticipation records, and aggregated into
 * validation/opportunity_metrics.js's candidate_blocked_by_counts.
 *
 * Proves:
 *   - recordAnticipationObservation()'s optional `candidates` param is
 *     stored verbatim on the record, defaulting to null when omitted
 *     (every pre-Stage-6 call site keeps byte-identical behavior)
 *   - computeOpportunityMetrics() aggregates per-timeframe blocked_by
 *     counts generically (unbounded reason strings, no hard-coded list)
 *     and simply excludes records with no candidate data -- never
 *     fabricates a bucket for them
 *   - none of this ever claims a win rate, accuracy, or profitability
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordAnticipationObservation, STORE_SCHEMA_VERSION } from '../src/engine/anticipationStore.js';
import { computeOpportunityMetrics } from '../validation/opportunity_metrics.js';

function baseDecision(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY',
    symbol: 'OANDA:XAUUSD', timeframes: { '15m': { last_confirmed_bar_time: 1700000000 } }, setup: null,
    diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: null },
    engine_disagreement: null,
    ...overrides,
  };
}

function baseEvidence(overrides = {}) {
  return {
    regime: 'BULL_TREND',
    structure: {
      state: 'BULLISH', lastEvent: null, lastSweep: null,
      lastSwingHigh: { price: 2050, label: 'HH', index: 90 },
      lastSwingLow: { price: 2000, label: 'HL', index: 80 },
      pivots: [], rangeHigh: 2060, rangeLow: 1980,
    },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: ['trend_continuation'], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'NO_BREAKOUT', evidence: {} },
    liquidityContext: { sweepReclaim: { swept: false } },
    levelsContext: { nearestResistance: null, nearestSupport: null },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
    ...overrides,
  };
}

function baseAnticipation(overrides = {}) {
  return {
    schema_version: '1.0.0', direction: 'BULLISH', timeframe: '15m', state: 'DEVELOPING',
    primary_scenario: null, alternate_scenario: null, authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY',
    waiting_for: [], invalidated_if: [], developing_strategy_family: null,
    ...overrides,
  };
}

function memoryDeps(nowIso = '2025-01-01T00:00:00.000Z') {
  let store = { schema_version: STORE_SCHEMA_VERSION, setups: {} };
  const log = [];
  return {
    _deps: {
      loadStore: () => store,
      saveStore: (_p, s) => { store = s; },
      appendLogLine: (_p, record) => { log.push(record); },
      now: () => new Date(nowIso),
    },
    getLog: () => log,
  };
}

const SAMPLE_CANDIDATES = {
  '5m': { status: 'OK', regime: 'BULL_TREND', candidate_action: null, candidate_model: null, candidate_quality: null, authoritative_candidate_rr: null, authoritative_rr_gate: null, blocked_by: 'NO_ELIGIBLE_STRATEGY' },
  '15m': { status: 'OK', regime: 'BULL_TREND', candidate_action: 'BUY', candidate_model: 'TC', candidate_quality: 58, authoritative_candidate_rr: 1.4, authoritative_rr_gate: 'RR_NOT_ACCEPTABLE', blocked_by: 'RR_NOT_ACCEPTABLE' },
  '30m': { status: 'OK', regime: 'BULL_TREND', candidate_action: null, candidate_model: null, candidate_quality: null, authoritative_candidate_rr: null, authoritative_rr_gate: null, blocked_by: 'NO_ELIGIBLE_STRATEGY' },
};

describe('Stage 6 Part 4-6: recordAnticipationObservation() candidates passthrough', () => {
  it('defaults candidates to null when the caller omits it (pre-Stage-6 call sites unchanged)', () => {
    const { _deps, getLog } = memoryDeps();
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: baseDecision(), evidence: baseEvidence(), anticipation: baseAnticipation(), confirmedBarTime: 1700000000, _deps });
    assert.equal(getLog()[0].candidates, null);
  });

  it('stores the caller-supplied candidates object verbatim, never recomputing it', () => {
    const { _deps, getLog } = memoryDeps();
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: baseDecision(), evidence: baseEvidence(), anticipation: baseAnticipation(), candidates: SAMPLE_CANDIDATES, confirmedBarTime: 1700000000, _deps });
    assert.deepEqual(getLog()[0].candidates, SAMPLE_CANDIDATES);
  });
});

describe('Stage 6 Part 4-6: computeOpportunityMetrics().candidate_blocked_by_counts', () => {
  it('is empty for records with no candidates data (never fabricates a bucket)', () => {
    const metrics = computeOpportunityMetrics([{ authoritative_action: 'WAIT', candidates: null }]);
    assert.deepEqual(metrics.candidate_blocked_by_counts, {});
  });

  it('counts blocked_by reasons per timeframe, generically, across records', () => {
    const records = [
      { authoritative_action: 'WAIT', candidates: SAMPLE_CANDIDATES },
      { authoritative_action: 'WAIT', candidates: SAMPLE_CANDIDATES },
      { authoritative_action: 'WAIT', candidates: { '5m': { blocked_by: 'A_NEVER_SEEN_REASON' } } },
    ];
    const metrics = computeOpportunityMetrics(records);
    assert.equal(metrics.candidate_blocked_by_counts['5m'].NO_ELIGIBLE_STRATEGY, 2);
    assert.equal(metrics.candidate_blocked_by_counts['5m'].A_NEVER_SEEN_REASON, 1);
    assert.equal(metrics.candidate_blocked_by_counts['15m'].RR_NOT_ACCEPTABLE, 2);
    assert.equal(metrics.candidate_blocked_by_counts['30m'].NO_ELIGIBLE_STRATEGY, 2);
  });

  it('never counts a confirmed (blocked_by:null) candidate toward any reason bucket', () => {
    const confirmedCandidate = { '15m': { blocked_by: null, candidate_action: 'BUY' } };
    const metrics = computeOpportunityMetrics([{ authoritative_action: 'BUY', candidates: confirmedCandidate }]);
    assert.deepEqual(metrics.candidate_blocked_by_counts, {});
  });

  it('the full output never contains a win-rate/accuracy/profit-factor/expectancy claim', () => {
    const metrics = computeOpportunityMetrics([{ authoritative_action: 'WAIT', candidates: SAMPLE_CANDIDATES }]);
    const serialized = JSON.stringify(metrics).toLowerCase();
    for (const forbidden of ['win_rate', 'winrate', 'accuracy', 'profit_factor', 'expectancy']) {
      assert.ok(!serialized.includes(forbidden), `must not contain "${forbidden}"`);
    }
  });
});
