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

describe('presentation: formatMarketAnalysis -- Stage 1+2 anticipation enrichment (additive)', () => {
  it('adds Pre-entry/Developing/Waiting for lines for a WAIT with an anticipation object, preserving the authoritative "WAIT — NO TRADE"/"Reason:" lines byte-for-byte', () => {
    const result = {
      status: 'OK', action: 'WAIT', reason: 'CORRECTION_ACTIVE', timeframes: {},
      confluence: null,
      anticipation: {
        state: 'CONFIRMATION_PENDING', developing_strategy_family: 'pullback_continuation',
        waiting_for: ['protected correction resolution', '3-consecutive-confirmed-bar momentum requirement'],
        invalidated_if: ['the pullback extends beyond the structural anchor without resuming momentum'],
        primary_scenario: null, alternate_scenario: null,
      },
    };
    const formatted = formatMarketAnalysis(result);
    assert.equal(formatted.lines[0], 'WAIT — NO TRADE');
    assert.equal(formatted.lines[1], 'Reason: CORRECTION_ACTIVE');
    assert.ok(formatted.lines.includes('Pre-entry: CONFIRMATION_PENDING'));
    assert.ok(formatted.lines.includes('Developing: pullback_continuation'));
    assert.ok(formatted.lines.some((l) => l.startsWith('Waiting for:')));
    assert.ok(formatted.lines.some((l) => l.startsWith('Invalidated if:')));
    assert.equal(formatted.structured.anticipation, result.anticipation);
  });

  it('adds Primary/Alternate scenario lines only when objectively present, with no null noise', () => {
    const result = {
      status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', timeframes: {},
      confluence: null,
      anticipation: {
        state: 'DEVELOPING', developing_strategy_family: null, waiting_for: [], invalidated_if: [],
        primary_scenario: { direction: 'BULLISH', strategy_family: 'trend_continuation', mapped_model_code: null, state: 'DEVELOPING', location: null },
        alternate_scenario: null,
      },
    };
    const formatted = formatMarketAnalysis(result);
    assert.ok(formatted.lines.includes('Primary scenario:'));
    assert.ok(formatted.lines.some((l) => l.includes('BULLISH') && l.includes('trend_continuation')));
    assert.ok(!formatted.lines.includes('Alternate scenario:'));
    assert.ok(!formatted.lines.some((l) => l === 'Developing: null'));
    assert.ok(!formatted.lines.some((l) => l === 'Waiting for: '));
  });

  it('never adds anticipation lines for BUY/SELL and never touches Entry/SL/TP1/TP2/RR/Quality', () => {
    const result = {
      status: 'OK', action: 'BUY', entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.0, setup: 'TC', quality: 78,
      diagnostics: { source_timeframe: '15m' },
      anticipation: { state: 'CONFIRMED', primary_scenario: null, alternate_scenario: null, waiting_for: [], invalidated_if: [] },
    };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });

  it('falls back to the unenriched output when anticipation is absent, even for WAIT', () => {
    const result = { status: 'OK', action: 'WAIT', reason: 'CHOP', timeframes: {}, confluence: null };
    assert.deepEqual(formatMarketAnalysis(result), formatEngineDecision(result));
  });
});
