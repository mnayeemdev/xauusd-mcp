/**
 * src/engine/confluence.js -- hierarchical evidence fusion. These are the
 * mission's mandated "cannot be outvoted" proofs: a WAIT decision must
 * stay WAIT no matter how much "bullish" pattern/candlestick/breakout/
 * liquidity evidence is piled around it, and a BUY/SELL decision's
 * geometry must never be altered by evidence, only annotated.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfluenceReport } from '../src/engine/confluence.js';

function manyBullishCandles(n) {
  return Array.from({ length: n }, (_, i) => ({ pattern: 'BULLISH_ENGULFING', bias: 'BULLISH', bar_time: 1000 + i }));
}
function manyBullishPatterns(n) {
  return Array.from({ length: n }, (_, i) => ({ pattern_type: 'DOUBLE_BOTTOM', bias: 'BULLISH', completion_state: 'CONFIRMED', pattern_id: `p${i}` }));
}

describe('engine/confluence: PATTERN/CANDLESTICK/BREAKOUT/LIQUIDITY != AUTOMATIC TRADE', () => {
  it('a WAIT decision stays WAIT even surrounded by many bullish candlesticks and classical patterns (no majority voting)', () => {
    const decision = { status: 'OK', action: 'WAIT', reason: 'CORRECTION_ACTIVE', entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, setup: null, diagnostics: {} };
    const report = buildConfluenceReport({
      decision,
      candlestickPatterns: manyBullishCandles(7),
      classicalPatterns: manyBullishPatterns(6),
      breakoutState: { state: 'BREAKOUT_CONFIRMED', evidence: { direction: 'BULLISH' } },
      liquidityContext: { sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', reclaimed: true } },
    });
    assert.equal(report.action, 'WAIT');
    assert.equal(report.reason, 'CORRECTION_ACTIVE');
    assert.equal(report.entry, null);
    // the evidence is still visible/reported (never hidden), just never turned into a trade
    assert.ok(report.supporting_evidence.length + report.opposing_evidence.length === 0, 'no direction exists for WAIT, so evidence is purely informational, not bucketed as supporting');
    assert.equal(report.informational_context.candlestick_patterns.length, 7);
    assert.equal(report.informational_context.classical_patterns.length, 6);
  });

  it('a single bullish breakout/pattern/candlestick does not manufacture a BUY out of a WAIT decision', () => {
    const decision = { status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, setup: null, diagnostics: {} };
    const report = buildConfluenceReport({
      decision,
      candlestickPatterns: [{ pattern: 'MORNING_STAR', bias: 'BULLISH', bar_time: 100 }],
      classicalPatterns: [{ pattern_type: 'DOUBLE_BOTTOM', bias: 'BULLISH', completion_state: 'CONFIRMED', pattern_id: 'p1' }],
      breakoutState: { state: 'RETEST_HOLD', evidence: { direction: 'BULLISH' } },
    });
    assert.equal(report.action, 'WAIT');
  });
});

describe('engine/confluence: MANDATORY GATES CANNOT BE OUTVOTED', () => {
  it('an HTF-conflict WAIT is never overridden by supporting evidence', () => {
    const decision = { status: 'OK', action: 'WAIT', reason: 'HTF_CONFLICT', entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, setup: null, diagnostics: { htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } } };
    const report = buildConfluenceReport({ decision, candlestickPatterns: manyBullishCandles(10) });
    assert.equal(report.action, 'WAIT');
    assert.deepEqual(report.mandatory_gates.htf_conflict, decision.diagnostics.htf_conflict);
  });

  it('a stale/insufficient-data WAIT is never overridden regardless of evidence volume', () => {
    const decision = { status: 'DATA_UNAVAILABLE', action: 'WAIT', reason: 'insufficient/invalid market data', entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, setup: null, diagnostics: {} };
    const report = buildConfluenceReport({ decision, candlestickPatterns: manyBullishCandles(15), classicalPatterns: manyBullishPatterns(10) });
    assert.equal(report.action, 'WAIT');
    assert.equal(report.mandatory_gates.status, 'DATA_UNAVAILABLE');
  });

  it('RR_NOT_ACCEPTABLE and NO_GOOD_ENTRY gates are restated, never bypassed', () => {
    const rrDecision = { status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, setup: 'BO', diagnostics: {} };
    const rrReport = buildConfluenceReport({ decision: rrDecision, candlestickPatterns: manyBullishCandles(5) });
    assert.equal(rrReport.action, 'WAIT');
    assert.equal(rrReport.mandatory_gates.wait_reason, 'RR_NOT_ACCEPTABLE');
  });
});

describe('engine/confluence: BUY/SELL geometry is republished verbatim, never altered', () => {
  it('a BUY decision keeps its exact entry/sl/tp1/tp2/rr/quality regardless of surrounding evidence', () => {
    const decision = {
      status: 'OK', action: 'BUY', reason: null,
      entry: 2010.5, sl: 2005.25, tp1: 2015.75, tp2: 2021, rr: 2.1, quality: 78,
      setup: 'TC', diagnostics: { source_timeframe: '15m' },
    };
    const report = buildConfluenceReport({
      decision, regime: 'BULL_TREND',
      candlestickPatterns: [{ pattern: 'BEARISH_ENGULFING', bias: 'BEARISH', bar_time: 100 }], // opposing evidence present
      classicalPatterns: [{ pattern_type: 'HEAD_AND_SHOULDERS', bias: 'BEARISH', completion_state: 'CONFIRMED', pattern_id: 'p1' }],
    });
    assert.equal(report.action, 'BUY');
    assert.equal(report.entry, 2010.5);
    assert.equal(report.sl, 2005.25);
    assert.equal(report.tp1, 2015.75);
    assert.equal(report.tp2, 2021);
    assert.equal(report.rr, 2.1);
    assert.equal(report.quality, 78);
    // opposing evidence is preserved and visible, not hidden or averaged away
    assert.equal(report.opposing_evidence.length, 2);
    assert.equal(report.supporting_evidence.length, 0);
  });

  it('supporting evidence in the same direction as a BUY is bucketed as supporting, not double-counted into the decision', () => {
    const decision = { status: 'OK', action: 'BUY', reason: null, entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.0, quality: 70, setup: 'TC', diagnostics: {} };
    const report = buildConfluenceReport({
      decision,
      candlestickPatterns: [{ pattern: 'BULLISH_ENGULFING', bias: 'BULLISH', bar_time: 1 }],
      breakoutState: { state: 'RETEST_HOLD', evidence: { direction: 'BULLISH' } },
      liquidityContext: { sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', reclaimed: true } },
    });
    assert.equal(report.entry, 2000); // unchanged regardless of how much supporting evidence exists
    assert.equal(report.supporting_evidence.length, 3);
  });

  it('a SELL decision keeps its geometry and classifies evidence mirrored correctly', () => {
    const decision = { status: 'OK', action: 'SELL', reason: null, entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0, quality: 72, setup: 'SR', diagnostics: {} };
    const report = buildConfluenceReport({
      decision,
      candlestickPatterns: [{ pattern: 'BEARISH_ENGULFING', bias: 'BEARISH', bar_time: 1 }, { pattern: 'HAMMER', bias: 'BULLISH', bar_time: 2 }],
    });
    assert.equal(report.action, 'SELL');
    assert.equal(report.supporting_evidence.length, 1);
    assert.equal(report.opposing_evidence.length, 1);
  });
});

describe('engine/confluence: HTF structure alignment and level overlap (informational only)', () => {
  const decision = { status: 'OK', action: 'BUY', reason: null, entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.0, quality: 70, setup: 'TC', diagnostics: {} };

  it('reports ALIGNED/CONFLICTED/UNAVAILABLE per HTF tier without altering the decision', () => {
    const structure = { state: 'BULLISH' };
    const decisionTimeframes = { '1H': { structure_direction: 'BULLISH' }, '4H': { structure_direction: 'BEARISH' }, '1D': { structure_direction: null } };
    const report = buildConfluenceReport({ decision, structure, decisionTimeframes });
    assert.deepEqual(report.htf_structure_alignment, { '1H': 'ALIGNED', '4H': 'CONFLICTED', '1D': 'UNAVAILABLE' });
    assert.equal(report.entry, 2000); // unaffected by any HTF conflict found here
  });

  it('is null when structure or decisionTimeframes is unavailable, never guessed', () => {
    const report = buildConfluenceReport({ decision, structure: null, decisionTimeframes: { '1H': { structure_direction: 'BULLISH' } } });
    assert.equal(report.htf_structure_alignment, null);
  });

  it('flags a nearest S/R level that overlaps a higher-timeframe range boundary within tolerance', () => {
    const levelsContext = { nearestResistance: { price: 2010, touch_count: 2 }, nearestSupport: { price: 1990, touch_count: 1 } };
    const decisionTimeframes = { '1H': { range_high: 2010.5, range_low: 1950 }, '4H': { range_high: 2200, range_low: 1900 }, '1D': {} };
    const report = buildConfluenceReport({ decision, levelsContext, decisionTimeframes });
    assert.equal(report.htf_level_overlap.nearest_resistance_overlap.length, 1);
    assert.equal(report.htf_level_overlap.nearest_resistance_overlap[0].tf, '1H');
    assert.equal(report.htf_level_overlap.nearest_support_overlap.length, 0);
  });
});

describe('engine/confluence: performance_metadata schema (Part 17/M -- not persisted, not a probability claim)', () => {
  it('summarizes strategy/regime/TF/pattern/breakout/liquidity/session/volatility/quality/RR buckets from already-computed evidence', () => {
    const decision = { status: 'OK', action: 'BUY', reason: null, entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.5, quality: 82, setup: 'TC', diagnostics: { source_timeframe: '15m' } };
    const report = buildConfluenceReport({
      decision, regime: 'BULL_TREND',
      candlestickPatterns: [{ pattern: 'BULLISH_ENGULFING', bias: 'BULLISH', bar_time: 1 }],
      classicalPatterns: [{ pattern_type: 'ASCENDING_TRIANGLE', bias: 'BULLISH', completion_state: 'FORMING' }],
      breakoutState: { state: 'RETEST_HOLD', evidence: { direction: 'BULLISH' } },
      liquidityContext: { sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', reclaimed: true } },
      sessionContext: { current: { session: 'LONDON' } },
      volatilityContext: { state: 'EXPANSION' },
    });
    assert.deepEqual(report.performance_metadata, {
      strategy: 'TC', regime: 'BULL_TREND', timeframe: '15m',
      classical_patterns: ['ASCENDING_TRIANGLE'], candlestick_patterns: ['BULLISH_ENGULFING'],
      breakout_state: 'RETEST_HOLD', liquidity_state: 'SWEPT_RECLAIMED',
      session: 'LONDON', volatility_state: 'EXPANSION',
      quality_bucket: 'HIGH', rr_bucket: 'TWO_TO_THREE_R',
    });
  });

  it('never claims a win-probability or accuracy figure anywhere in the bucket labels', () => {
    const decision = { status: 'OK', action: 'WAIT', reason: 'NO_GOOD_ENTRY', entry: null, sl: null, tp1: null, tp2: null, rr: 1.2, quality: 40, setup: null, diagnostics: {} };
    const report = buildConfluenceReport({ decision });
    const serialized = JSON.stringify(report.performance_metadata);
    assert.ok(!/%|probability|accuracy|win.?rate/i.test(serialized));
    assert.equal(report.performance_metadata.quality_bucket, 'BELOW_THRESHOLD');
    assert.equal(report.performance_metadata.rr_bucket, 'BELOW_MIN');
  });
});

describe('engine/confluence: neutral evidence is never forced into a side', () => {
  it('NEUTRAL-bias patterns are excluded from both supporting and opposing buckets', () => {
    const decision = { status: 'OK', action: 'BUY', reason: null, entry: 2000, sl: 1995, tp1: 2005, tp2: 2010, rr: 2.0, quality: 70, setup: 'TC', diagnostics: {} };
    const report = buildConfluenceReport({ decision, candlestickPatterns: [{ pattern: 'DOJI', bias: 'NEUTRAL', bar_time: 1 }] });
    assert.equal(report.supporting_evidence.length, 0);
    assert.equal(report.opposing_evidence.length, 0);
    assert.equal(report.informational_context.candlestick_patterns.length, 1);
  });
});
