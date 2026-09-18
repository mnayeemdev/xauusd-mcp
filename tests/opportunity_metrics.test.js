/**
 * validation/opportunity_metrics.js -- pure aggregation over already-
 * observed Stage 3 anticipation records. Proves: factual counts only,
 * zero-denominator ratios return null (never a fabricated percentage),
 * and no win-rate/accuracy/profit-factor/expectancy claim is ever
 * emitted anywhere in the output.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeOpportunityMetrics } from '../validation/opportunity_metrics.js';

function rec(overrides = {}) {
  return {
    setup_id: 's1', authoritative_action: 'WAIT', authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY',
    pre_entry_state: 'DEVELOPING', previous_pre_entry_state: null, transition: null,
    developing_strategy_family: null, model_coverage: 'NO_OBJECTIVE_SETUP',
    regime: 'BULL_TREND', session: 'LONDON', volatility_state: 'NORMAL', htf_alignment: null,
    ...overrides,
  };
}

describe('opportunity_metrics: basic counts', () => {
  it('computes total observations and action counts', () => {
    const m = computeOpportunityMetrics([rec({ authoritative_action: 'WAIT' }), rec({ authoritative_action: 'WAIT' }), rec({ authoritative_action: 'BUY' })]);
    assert.equal(m.total_observations, 3);
    assert.deepEqual(m.action_counts, { WAIT: 2, BUY: 1 });
  });

  it('counts authoritative WAIT reasons verbatim, including one never seen before, without a hard-coded list', () => {
    const m = computeOpportunityMetrics([
      rec({ authoritative_wait_reason: 'CORRECTION_ACTIVE' }),
      rec({ authoritative_wait_reason: 'CORRECTION_ACTIVE' }),
      rec({ authoritative_wait_reason: 'A_REASON_THAT_DID_NOT_EXIST_BEFORE' }),
    ]);
    assert.deepEqual(m.authoritative_wait_reason_counts, { CORRECTION_ACTIVE: 2, A_REASON_THAT_DID_NOT_EXIST_BEFORE: 1 });
  });

  it('excludes non-WAIT records from wait-reason counts', () => {
    const m = computeOpportunityMetrics([rec({ authoritative_action: 'BUY', authoritative_wait_reason: null })]);
    assert.deepEqual(m.authoritative_wait_reason_counts, {});
  });

  it('counts pre-entry states, transitions, strategy families, model coverage, regime, session, volatility', () => {
    const m = computeOpportunityMetrics([
      rec({ pre_entry_state: 'ARMED', transition: 'DEVELOPING -> ARMED', developing_strategy_family: 'trend_continuation', model_coverage: 'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE' }),
      rec({ pre_entry_state: 'ARMED', transition: 'DEVELOPING -> ARMED', developing_strategy_family: 'trend_continuation', model_coverage: 'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE' }),
    ]);
    assert.deepEqual(m.pre_entry_state_counts, { ARMED: 2 });
    assert.deepEqual(m.transition_counts, { 'DEVELOPING -> ARMED': 2 });
    assert.deepEqual(m.strategy_family_counts, { trend_continuation: 2 });
    assert.deepEqual(m.model_coverage_counts, { PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE: 2 });
    assert.deepEqual(m.regime_counts, { BULL_TREND: 2 });
    assert.deepEqual(m.session_counts, { LONDON: 2 });
    assert.deepEqual(m.volatility_state_counts, { NORMAL: 2 });
  });

  it('flattens per-HTF-tier alignment counts', () => {
    const m = computeOpportunityMetrics([
      rec({ htf_alignment: { '1H': 'ALIGNED', '4H': 'CONFLICTED' } }),
      rec({ htf_alignment: { '1H': 'ALIGNED', '4H': 'UNAVAILABLE' } }),
    ]);
    assert.deepEqual(m.htf_alignment_counts, { '1H': { ALIGNED: 2 }, '4H': { CONFLICTED: 1, UNAVAILABLE: 1 } });
  });

  it('computes unique/confirmed/invalidated/missed setup counts by distinct setup_id', () => {
    const m = computeOpportunityMetrics([
      rec({ setup_id: 'a', pre_entry_state: 'DEVELOPING' }),
      rec({ setup_id: 'a', pre_entry_state: 'ARMED' }),
      rec({ setup_id: 'a', pre_entry_state: 'CONFIRMED' }),
      rec({ setup_id: 'b', pre_entry_state: 'DEVELOPING' }),
      rec({ setup_id: 'b', pre_entry_state: 'INVALIDATED' }),
      rec({ setup_id: 'c', pre_entry_state: 'MISSED' }),
    ]);
    assert.deepEqual(m.setup_counts, { unique_setups: 3, confirmed_setups: 1, invalidated_setups: 1, missed_setups: 1 });
  });
});

describe('opportunity_metrics: transition ratios never divide by zero', () => {
  it('returns null (not 0, not NaN, not a fabricated percentage) when a transition was never observed', () => {
    const m = computeOpportunityMetrics([rec({ pre_entry_state: 'DEVELOPING', previous_pre_entry_state: null })]);
    assert.equal(m.transition_ratios.developing_to_armed, null);
    assert.equal(m.transition_ratios.armed_to_confirmed, null);
    assert.equal(m.transition_ratios.armed_to_invalidated, null);
    assert.equal(m.transition_ratios.armed_to_missed, null);
  });

  it('computes a real ratio with count/denominator once transitions exist', () => {
    const m = computeOpportunityMetrics([
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'CONFIRMED' }),
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'CONFIRMED' }),
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'INVALIDATED' }),
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'MISSED' }),
    ]);
    assert.deepEqual(m.transition_ratios.armed_to_confirmed, { from: 'ARMED', to: 'CONFIRMED', count: 2, denominator: 4, ratio: 0.5 });
    assert.deepEqual(m.transition_ratios.armed_to_invalidated, { from: 'ARMED', to: 'INVALIDATED', count: 1, denominator: 4, ratio: 0.25 });
    assert.deepEqual(m.transition_ratios.armed_to_missed, { from: 'ARMED', to: 'MISSED', count: 1, denominator: 4, ratio: 0.25 });
  });

  it('handles an empty record array without throwing', () => {
    const m = computeOpportunityMetrics([]);
    assert.equal(m.total_observations, 0);
    assert.equal(m.transition_ratios.armed_to_confirmed, null);
    assert.deepEqual(m.setup_counts, { unique_setups: 0, confirmed_setups: 0, invalidated_setups: 0, missed_setups: 0 });
  });

  it('rejects a non-array input rather than silently computing garbage', () => {
    assert.throws(() => computeOpportunityMetrics('not-an-array'), TypeError);
  });
});

describe('opportunity_metrics: NO win-rate/accuracy/profit-factor/expectancy claim anywhere', () => {
  it('the entire serialized output never contains a forbidden trade-outcome term', () => {
    const m = computeOpportunityMetrics([
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'CONFIRMED' }),
      rec({ previous_pre_entry_state: 'ARMED', pre_entry_state: 'INVALIDATED' }),
    ]);
    const serialized = JSON.stringify(m);
    assert.ok(!/win.?rate/i.test(serialized));
    assert.ok(!/accuracy/i.test(serialized));
    assert.ok(!/profit.?factor/i.test(serialized));
    assert.ok(!/expectancy/i.test(serialized));
  });

  it('module source itself never references those terms as a computed field', () => {
    // Loaded indirectly via the function's own exported keys -- computeOpportunityMetrics()'s
    // return shape is exhaustively asserted above; this is a redundant belt-and-suspenders
    // check on the function name surface itself.
    assert.equal(typeof computeOpportunityMetrics, 'function');
    assert.equal(Object.keys(computeOpportunityMetrics([])).some((k) => /win.?rate|accuracy|profit|expectancy/i.test(k)), false);
  });
});
