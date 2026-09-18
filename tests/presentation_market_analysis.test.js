/**
 * src/core/presentation.js's formatMarketAnalysis() -- concise
 * explainability output for the Full Market Analysis Engine (Part 19/J).
 * Must reuse formatEngineDecision()'s BUY/SELL/DATA-UNAVAILABLE rendering
 * verbatim and only add an informational Context line for WAIT.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarketAnalysis, formatEngineDecision } from '../src/core/presentation.js';

describe('presentation: formatMarketAnalysis', () => {
  it('renders BUY/SELL identically to formatEngineDecision (never adds a Context line)', () => {
    const result = { status: 'OK', action: 'BUY', entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.0, setup: 'TC', quality: 78, diagnostics: { source_timeframe: '15m' }, confluence: { informational_context: { breakout_state: { state: 'BREAKOUT_CONFIRMED' } } } };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });

  it('adds a Context line for WAIT when a meaningful breakout state is present', () => {
    const result = {
      status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', timeframes: {},
      confluence: { informational_context: { breakout_state: { state: 'BREAKOUT_RETEST_PENDING' } }, strategy_eligibility: { eligible: ['range_trading'], blocked_reason: null }, regime: 'RANGE' },
    };
    const formatted = formatMarketAnalysis(result);
    assert.equal(formatted.lines.at(-1), 'Context: Breakout: BREAKOUT_RETEST_PENDING');
    assert.equal(formatted.lines[0], 'WAIT — NO TRADE');
  });

  it('adds a restrictive-regime Context line when no strategy is eligible', () => {
    const result = {
      status: 'OK', action: 'WAIT', reason: 'CHOP', timeframes: {},
      confluence: { informational_context: { breakout_state: { state: 'NO_BREAKOUT' } }, strategy_eligibility: { eligible: [], blocked_reason: 'CHOP_UNCERTAIN regime: no strategy family is eligible' }, regime: 'CHOP_UNCERTAIN' },
    };
    const formatted = formatMarketAnalysis(result);
    assert.equal(formatted.lines.at(-1), 'Context: CHOP_UNCERTAIN');
  });

  it('does not add a Context line when there is nothing informative to add', () => {
    const result = { status: 'OK', action: 'WAIT', reason: 'CORRECTION_ACTIVE', timeframes: {}, confluence: { informational_context: { breakout_state: { state: 'NO_BREAKOUT' } }, strategy_eligibility: { eligible: ['trend_continuation'] } } };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });

  it('falls back to formatEngineDecision exactly when no confluence report is available', () => {
    const result = { status: 'OK', action: 'WAIT', reason: 'DATA_UNAVAILABLE', timeframes: {}, confluence: null };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });

  it('handles a non-OK status the same as formatEngineDecision', () => {
    const result = { status: 'DATA_UNAVAILABLE', reason: 'insufficient bars' };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });
});
