/**
 * src/engine/strategies/eligibility.js -- regime-gated strategy eligibility.
 * Purely informational classification; must never trigger/veto a trade.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getEligibleStrategies, classifyModelFamilies, computeStrategyEligibility } from '../src/engine/strategies/eligibility.js';

describe('engine/strategies/eligibility: regime table', () => {
  it('TREND regimes allow continuation/pullback/momentum/breakout families', () => {
    for (const regime of ['BULL_TREND', 'BEAR_TREND']) {
      const eligible = getEligibleStrategies(regime);
      assert.ok(eligible.includes('trend_continuation'));
      assert.ok(eligible.includes('pullback_continuation'));
      assert.ok(eligible.includes('momentum_continuation'));
      assert.ok(eligible.includes('breakout'));
      assert.ok(!eligible.includes('mean_reversion'), 'mean reversion must remain blocked in a strong trend');
    }
  });

  it('RANGE allows range/S&R/mean-reversion/liquidity-sweep families', () => {
    const eligible = getEligibleStrategies('RANGE');
    assert.ok(eligible.includes('range_trading'));
    assert.ok(eligible.includes('sr_reaction'));
    assert.ok(eligible.includes('mean_reversion'));
    assert.ok(eligible.includes('liquidity_sweep_reversal'));
    assert.ok(!eligible.includes('trend_continuation'));
  });

  it('COMPRESSION only allows breakout/expansion-preparation families', () => {
    const eligible = getEligibleStrategies('COMPRESSION');
    assert.ok(eligible.includes('compression_expansion'));
    assert.ok(eligible.includes('breakout'));
    assert.ok(!eligible.includes('mean_reversion'));
    assert.ok(!eligible.includes('trend_continuation'));
  });

  it('TRANSITION and CHOP_UNCERTAIN are restrictive (empty)', () => {
    assert.deepEqual(getEligibleStrategies('TRANSITION'), []);
    assert.deepEqual(getEligibleStrategies('CHOP_UNCERTAIN'), []);
  });

  it('an unknown/null regime returns no eligible strategies rather than guessing', () => {
    assert.deepEqual(getEligibleStrategies(null), []);
    assert.deepEqual(getEligibleStrategies('NOT_A_REGIME'), []);
  });
});

describe('engine/strategies/eligibility: model-to-family mapping', () => {
  it('maps each existing model code to its named families', () => {
    assert.deepEqual(classifyModelFamilies('BO'), ['breakout', 'breakout_retest']);
    assert.deepEqual(classifyModelFamilies('MR'), ['mean_reversion', 'liquidity_sweep_reversal']);
    assert.deepEqual(classifyModelFamilies('SR'), ['sr_reaction', 'rejection_reclaim']);
    assert.deepEqual(classifyModelFamilies('TC'), ['trend_continuation', 'structure_break_continuation']);
    assert.deepEqual(classifyModelFamilies('PB'), ['pullback_continuation', 'trend_pullback_confirmation']);
  });
  it('returns empty for an unknown model rather than guessing', () => {
    assert.deepEqual(classifyModelFamilies('NOT_A_MODEL'), []);
  });
});

describe('engine/strategies/eligibility: computeStrategyEligibility', () => {
  it('reports a blocked_reason and mean_reversion_blocked for CHOP_UNCERTAIN', () => {
    const report = computeStrategyEligibility({ regime: 'CHOP_UNCERTAIN' });
    assert.equal(report.eligible.length, 0);
    assert.ok(report.blocked_reason.includes('CHOP_UNCERTAIN'));
    assert.equal(report.mean_reversion_blocked, true);
  });

  it('adds structural_reversal dynamically only when a fresh CHoCH is present', () => {
    const withChoch = computeStrategyEligibility({ regime: 'RANGE', structure: { lastEvent: { type: 'CHOCH' } } });
    assert.ok(withChoch.eligible.includes('structural_reversal'));
    const withoutChoch = computeStrategyEligibility({ regime: 'RANGE', structure: { lastEvent: { type: 'BOS' } } });
    assert.ok(!withoutChoch.eligible.includes('structural_reversal'));
  });

  it('cross-checks a selected model against eligibility without altering it', () => {
    const consistent = computeStrategyEligibility({ regime: 'BULL_TREND', selectedModel: 'TC' });
    assert.equal(consistent.selected_model, 'TC');
    assert.equal(consistent.selected_model_consistent_with_eligibility, true);

    // MR selected while regime is BULL_TREND would be inconsistent (should never
    // actually happen given evaluateModels()'s own regime guards, but this
    // module must report the mismatch rather than silently hiding it).
    const inconsistent = computeStrategyEligibility({ regime: 'BULL_TREND', selectedModel: 'MR' });
    assert.equal(inconsistent.selected_model_consistent_with_eligibility, false);
  });

  it('reports null consistency when no model was selected', () => {
    const report = computeStrategyEligibility({ regime: 'RANGE', selectedModel: null });
    assert.equal(report.selected_model_consistent_with_eligibility, null);
  });
});
