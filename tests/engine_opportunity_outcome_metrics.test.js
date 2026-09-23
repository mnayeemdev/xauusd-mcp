/**
 * validation/opportunity_outcome_metrics.js -- Stage 7 Step 2 pure outcome
 * metrics. Proves: correct counting/bucketing over already-resolved
 * outcome records, null (never a fabricated 0/percentage) on an empty or
 * zero-denominator input, and that no forbidden performance-claim
 * vocabulary (accuracy/win rate/profitability/expected return) appears
 * anywhere in the module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeOpportunityOutcomeMetrics } from '../validation/opportunity_outcome_metrics.js';

function record(overrides = {}) {
  return {
    opportunity_id: 'opp-1',
    status: 'TP1_THEN_TP2', terminal: true, direction: 'BULLISH', source_timeframe: '15m',
    observation_opportunity_state: 'CONFIRMATION_PENDING', blocking_conditions: ['RR_NOT_ACCEPTABLE'],
    planning_rr_illustrative: 3, zone_width_atr_multiple: 0.4,
    tp1: { touched: true, bar_time: 100, bars_elapsed: 2 },
    tp2: { touched: true, bar_time: 200, bars_elapsed: 5 },
    invalidation: null, ambiguous_event: null,
    ...overrides,
  };
}

/** Strips block/line comments so a source-audit regex checks actual CODE (field names/labels), never the module's own doc comments explaining what it deliberately does NOT compute -- same convention as tests/engine_opportunity_ledger.test.js's stripComments(). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('computeOpportunityOutcomeMetrics: never claims accuracy/win-rate/profitability', () => {
  it('no CODE (field name/label, outside doc comments) claims accuracy/win-rate/profitability/expected-return', () => {
    const code = stripComments(readFileSync(new URL('../validation/opportunity_outcome_metrics.js', import.meta.url), 'utf8'));
    assert.ok(!/win.?rate/i.test(code));
    assert.ok(!/\baccuracy\b/i.test(code));
    assert.ok(!/profitab/i.test(code));
    assert.ok(!/expected.?return/i.test(code));
  });

  it('throws on non-array input rather than silently coercing', () => {
    assert.throws(() => computeOpportunityOutcomeMetrics(null), TypeError);
  });

  it('an empty input returns zeroed counts and null ratios, never a fabricated percentage', () => {
    const m = computeOpportunityOutcomeMetrics([]);
    assert.equal(m.observation_count, 0);
    assert.equal(m.independent_opportunity_count, 0);
    assert.equal(m.resolved_count, 0);
    assert.equal(m.tp1_reach_ratio, null);
    assert.equal(m.tp2_reach_ratio, null);
    assert.deepEqual(m.candidate_rr_distribution, []);
  });
});

describe('computeOpportunityOutcomeMetrics: observation-level vs. independent-opportunity-level counting (Item 2 hardening)', () => {
  it('observation_count counts every record, independent_opportunity_count counts unique opportunity_id values', () => {
    const m = computeOpportunityOutcomeMetrics([
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'DEVELOPING' }),
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'APPROACHING_ZONE' }),
      record({ opportunity_id: 'opp-2', observation_opportunity_state: 'DEVELOPING' }),
    ]);
    assert.equal(m.observation_count, 3);
    assert.equal(m.independent_opportunity_count, 2);
  });

  it('multiple lifecycle observations from ONE opportunity do not inflate independent_opportunity_count', () => {
    const m = computeOpportunityOutcomeMetrics([
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'DEVELOPING' }),
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'APPROACHING_ZONE' }),
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'CONFIRMATION_PENDING' }),
      record({ opportunity_id: 'opp-1', observation_opportunity_state: 'ARMED' }),
    ]);
    assert.equal(m.observation_count, 4);
    assert.equal(m.independent_opportunity_count, 1);
  });

  it('explicitly reports opportunity-level aggregation as deferred, never inventing a favorable-outcome-selection rule', () => {
    const m = computeOpportunityOutcomeMetrics([record()]);
    assert.equal(m.opportunity_level_aggregation, 'DEFERRED_NOT_YET_DEFENSIBLE');
  });

  it('a record with no opportunity_id is never counted toward independent_opportunity_count', () => {
    const m = computeOpportunityOutcomeMetrics([record({ opportunity_id: null }), record({ opportunity_id: 'opp-1' })]);
    assert.equal(m.observation_count, 2);
    assert.equal(m.independent_opportunity_count, 1);
  });
});

describe('computeOpportunityOutcomeMetrics: counting and bucketing correctness', () => {
  it('counts resolved vs unresolved correctly', () => {
    const m = computeOpportunityOutcomeMetrics([record({ opportunity_id: 'opp-1' }), record({ opportunity_id: 'opp-2', status: 'PENDING', terminal: false, tp1: null, tp2: null })]);
    assert.equal(m.observation_count, 2);
    assert.equal(m.resolved_count, 1);
    assert.equal(m.unresolved_count, 1);
  });

  it('tp1_before_invalidation_count / tp2_reached_count / invalidation_before_tp1_count / ambiguous_same_bar_count', () => {
    const records = [
      record(), // TP1 then TP2
      record({ status: 'TP1_THEN_INVALIDATED', tp2: null, invalidation: { touched: true, bar_time: 300, bars_elapsed: 3, stage: 'AFTER_TP1' } }),
      record({ status: 'INVALIDATED_BEFORE_TP1', tp1: null, tp2: null, invalidation: { touched: true, bar_time: 50, bars_elapsed: 1, stage: 'BEFORE_TP1' } }),
      record({ status: 'AMBIGUOUS_SAME_BAR', tp1: null, tp2: null, ambiguous_event: { stage: 'TP1_VS_INVALIDATION', bar_time: 10 } }),
    ];
    const m = computeOpportunityOutcomeMetrics(records);
    assert.equal(m.tp1_before_invalidation_count, 2); // records 1 and 2 both have tp1.touched === true
    assert.equal(m.tp2_reached_count, 1);
    assert.equal(m.invalidation_before_tp1_count, 1);
    assert.equal(m.ambiguous_same_bar_count, 1);
  });

  it('nested counts by direction/timeframe/observation-state/blocking-condition', () => {
    const records = [record(), record({ direction: 'BEARISH', source_timeframe: '5m', blocking_conditions: ['NO_GOOD_ENTRY'] })];
    const m = computeOpportunityOutcomeMetrics(records);
    assert.equal(m.outcome_status_by_direction.BULLISH.TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_direction.BEARISH.TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_source_timeframe['15m'].TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_source_timeframe['5m'].TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_blocking_condition.RR_NOT_ACCEPTABLE.TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_blocking_condition.NO_GOOD_ENTRY.TP1_THEN_TP2, 1);
  });

  it('a record contributing to multiple blocking conditions is counted under each, without double-counting the total', () => {
    const m = computeOpportunityOutcomeMetrics([record({ blocking_conditions: ['RR_NOT_ACCEPTABLE', 'NO_GOOD_ENTRY'] })]);
    assert.equal(m.outcome_status_by_blocking_condition.RR_NOT_ACCEPTABLE.TP1_THEN_TP2, 1);
    assert.equal(m.outcome_status_by_blocking_condition.NO_GOOD_ENTRY.TP1_THEN_TP2, 1);
    assert.equal(m.observation_count, 1);
  });

  it('candidate_rr and zone_width_atr distributions include only finite recorded values, never fabricated', () => {
    const m = computeOpportunityOutcomeMetrics([record(), record({ planning_rr_illustrative: null, zone_width_atr_multiple: null })]);
    assert.deepEqual(m.candidate_rr_distribution, [3]);
    assert.deepEqual(m.zone_width_atr_distribution, [0.4]);
  });

  it('candidate_rr_by_zone_width_atr_bucket groups an extreme narrow-zone RR under a low bucket without altering the value', () => {
    const m = computeOpportunityOutcomeMetrics([record({ planning_rr_illustrative: 188.87, zone_width_atr_multiple: 0.02 })]);
    assert.deepEqual(m.candidate_rr_by_zone_width_atr_bucket['<0.1'], [188.87]);
  });

  it('backward compatibility: a legacy outcome record (schema_version 1, field name candidate_rr, no planning_rr_illustrative key) is still read correctly', () => {
    const legacyRecord = record({ planning_rr_illustrative: undefined, candidate_rr: 188.87 });
    const m = computeOpportunityOutcomeMetrics([legacyRecord]);
    assert.deepEqual(m.candidate_rr_distribution, [188.87]);
  });

  it('bars_to_tp1_distribution and bars_to_invalidation_distribution reflect only touched cases', () => {
    const m = computeOpportunityOutcomeMetrics([
      record(),
      record({ status: 'INVALIDATED_BEFORE_TP1', tp1: null, tp2: null, invalidation: { touched: true, bar_time: 50, bars_elapsed: 4, stage: 'BEFORE_TP1' } }),
    ]);
    assert.deepEqual(m.bars_to_tp1_distribution, [2]);
    assert.deepEqual(m.bars_to_invalidation_distribution, [4]);
  });

  it('tp1_reach_ratio and tp2_reach_ratio are correct fractions, null when their denominator is zero', () => {
    const m = computeOpportunityOutcomeMetrics([record(), record({ status: 'INVALIDATED_BEFORE_TP1', tp1: null, tp2: null, invalidation: { touched: true, bar_time: 1, bars_elapsed: 1, stage: 'BEFORE_TP1' } })]);
    assert.equal(m.tp1_reach_ratio, 0.5);
    assert.equal(m.tp2_reach_ratio, 1); // of the ones that reached TP1, all reached TP2 in this fixture

    const noneResolved = computeOpportunityOutcomeMetrics([record({ status: 'PENDING', terminal: false, tp1: null, tp2: null })]);
    assert.equal(noneResolved.tp1_reach_ratio, null);
    assert.equal(noneResolved.tp2_reach_ratio, null);
  });
});
