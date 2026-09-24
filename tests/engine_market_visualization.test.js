/**
 * src/engine/marketVisualization.js -- Stage 5 pure market -> drawing
 * intent mapper. Proves: WAIT never gets trade geometry, BUY/SELL get
 * EXACT protected values (never recalculated/adjusted), no fabricated
 * geometry anywhere, deterministic selection for every category, the
 * clutter budget/priority suppression, and that the mapper has zero
 * dependency on the decision engine, CDP, or Stage 4's registry.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMarketVisualizationIntents, CLUTTER_BUDGET } from '../src/engine/marketVisualization.js';
import { computeAnticipation } from '../src/engine/anticipation.js';

const TF = '15m';
const NOW = 1700000000;

function baseDecision(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY',
    symbol: 'OANDA:XAUUSD', timeframes: { [TF]: { last_confirmed_bar_time: NOW } }, setup: null,
    entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
    market_data_times: { [TF]: NOW },
    diagnostics: { source_timeframe: TF, conflict: null, quality_breakdown: null, htf_conflict: null },
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
    eligibility: { regime: 'BULL_TREND', eligible: ['trend_continuation', 'pullback_continuation', 'breakout'], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'NO_BREAKOUT', evidence: {} },
    liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } },
    levelsContext: { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
    ...overrides,
  };
}

function findIntent(intents, role) { return intents.find((i) => i.role === role); }
function findCandidate(candidates, role) { return candidates.find((c) => c.role === role); }
/** Content is drawn SOMEWHERE on the chart -- robust to the coincident-level merge legitimately relabeling it under a higher-priority role. */
function findIntentByText(intents, substring) { return intents.find((i) => i.text?.includes(substring)); }
/** A horizontal_line's own label is decoupled into a separate, independently lane-adjustable `<role>__label` text companion (label-readability upgrade) -- the line itself keeps its exact price/time but its `text` is null. */
function findLabelText(intents, role) { return findIntent(intents, `${role}__label`)?.text ?? null; }

describe('marketVisualization: source audit -- pure, no decision/CDP/registry dependency', () => {
  it('never imports xauusd_calculate.js, connection.js, core/chart|data.js, or drawingRegistry.js', () => {
    const src = readFileSync(new URL('../src/engine/marketVisualization.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(code));
    assert.ok(!/from ['"].*connection\.js['"]/.test(code));
    assert.ok(!/from ['"].*core\/(chart|data)\.js['"]/.test(code));
    assert.ok(!/from ['"].*drawingRegistry\.js['"]/.test(code));
    assert.ok(!/evaluate\(/.test(code));
    assert.ok(!/writeFileSync|readFileSync|fs\./.test(code));
  });
});

describe('marketVisualization: WAIT never emits trade geometry', () => {
  it('no trade_entry/trade_sl/trade_tp1/trade_tp2 for any WAIT reason', () => {
    for (const reason of ['NO_ELIGIBLE_STRATEGY', 'CORRECTION_ACTIVE', 'RR_NOT_ACCEPTABLE', 'OVEREXTENDED', 'HTF_CONFLICT']) {
      const decision = baseDecision({ reason, setup: reason === 'HTF_CONFLICT' ? 'TC' : null, diagnostics: { source_timeframe: TF, conflict: null, quality_breakdown: null, htf_conflict: reason === 'HTF_CONFLICT' ? { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } : null } });
      const evidence = baseEvidence();
      const anticipation = computeAnticipation({ decision, evidence });
      const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
      for (const role of ['trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2']) {
        assert.equal(findIntent(intents, role), undefined, `${role} must not be emitted for WAIT/${reason}`);
      }
    }
  });
});

describe('marketVisualization: BUY/SELL emit EXACT protected geometry, never recalculated', () => {
  it('BUY emits exact entry/sl/tp1/tp2', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010.25, sl: 2005.5, tp1: 2015.75, tp2: 2020.1, rr: 2.1, quality: 78 });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'trade_entry').point.price, 2010.25);
    assert.equal(findIntent(intents, 'trade_sl').point.price, 2005.5);
    assert.equal(findIntent(intents, 'trade_tp1').point.price, 2015.75);
    assert.equal(findIntent(intents, 'trade_tp2').point.price, 2020.1);
  });

  it('SELL emits exact entry/sl/tp1/tp2', () => {
    const decision = baseDecision({ action: 'SELL', reason: null, setup: 'SR', entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0, quality: 72 });
    const evidence = baseEvidence({ structure: { ...baseEvidence().structure, state: 'BEARISH' } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'trade_entry').point.price, 2000);
    assert.equal(findIntent(intents, 'trade_sl').point.price, 2005);
    assert.equal(findIntent(intents, 'trade_tp1').point.price, 1995);
    assert.equal(findIntent(intents, 'trade_tp2').point.price, 1990);
  });

  it('missing trade geometry (a null field) is never fabricated', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: null, rr: 2.1, quality: 78 });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'trade_tp2'), undefined);
    assert.equal(findCandidate(candidates, 'trade_tp2').reason_excluded, 'MISSING_PROTECTED_TRADE_GEOMETRY');
  });

  it('quality is never rendered as a probability/percentage', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: 2020, rr: 2.1, quality: 78 });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const status = findIntent(intents, 'trade_status');
    assert.ok(status);
    assert.ok(!/%/.test(status.text));
    assert.ok(!/probability|chance|accuracy/i.test(status.text));
    assert.ok(status.text.includes('Q 78'));
  });
});

describe('marketVisualization: support/resistance selection is deterministic', () => {
  it('draws nearest_support/nearest_resistance using the exact existing level values', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ levelsContext: { levels: [], supplyDemandZones: [], nearestSupport: { price: 1995.5, touch_count: 3, fresh: true }, nearestResistance: { price: 2035.25, touch_count: 1, fresh: false } } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'nearest_support').point.price, 1995.5);
    assert.equal(findIntent(intents, 'nearest_resistance').point.price, 2035.25);
  });

  it('skips a side with no nearest level rather than fabricating one', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ levelsContext: { levels: [], supplyDemandZones: [], nearestSupport: null, nearestResistance: { price: 2035, touch_count: 1, fresh: true } } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'nearest_support'), undefined);
    assert.equal(findCandidate(candidates, 'nearest_support').reason_excluded, 'NO_NEAREST_SUPPORT');
    assert.ok(findIntent(intents, 'nearest_resistance'));
  });
});

describe('marketVisualization: supply/demand requires objective bounds', () => {
  it('selects the nearest active zone per side using zone_low/zone_high exactly', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: {
        levels: [], nearestSupport: null, nearestResistance: null,
        supplyDemandZones: [
          { origin_bar_index: 10, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' },
          { origin_bar_index: 5, direction: 'demand', zone_low: 1950, zone_high: 1960, state: 'FRESH' }, // farther -- must not be selected
          { origin_bar_index: 20, direction: 'supply', zone_low: 2025, zone_high: 2035, state: 'MITIGATED' },
        ],
      },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const demand = findIntent(intents, 'active_demand');
    assert.equal(demand.point.price, 1998); // zone_high (edge nearest current price 2010, since 2010 >= 1998)
    const supply = findIntent(intents, 'active_supply');
    assert.equal(supply.point.price, 2025); // zone_low (edge nearest current price 2010, since 2010 <= 2025)
  });

  it('an INVALIDATED zone is never selected', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: 1, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'INVALIDATED' }] },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'active_demand'), undefined);
    assert.equal(findCandidate(candidates, 'active_demand').reason_excluded, 'NO_ACTIVE_DEMAND_ZONE');
  });

  it('incomplete zone geometry (no current price to compare) is skipped, not guessed', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: {} }, // no last_close
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: 1, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'active_demand'), undefined);
  });
});

describe('marketVisualization: liquidity selection is deterministic, FVGs never drawn', () => {
  it('prioritizes an active sweep/reclaim over an equal-highs/lows pool', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      liquidityContext: { equalHighs: [{ price: 2040, touch_count: 2, indices: [1, 2] }], equalLows: [], sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', level: 1985, reclaimed: false }, fairValueGaps: [{ index: 5, direction: 'BULLISH', gapLow: 2001, gapHigh: 2004, filled: false }] },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // anticipation.primary_scenario's own trigger location also resolves to
    // this SAME sweep level (a real, not incidental, coincidence -- both
    // ultimately derive from the same liquidityContext.sweepReclaim), so the
    // coincident-level merge may legitimately relabel this under
    // primary_trigger instead of liquidity_primary -- assert on CONTENT
    // actually reaching the chart, not on which role won the merge. The
    // chart-facing label is now short ("LIQUIDITY SWEEP • PENDING"); the
    // specific sweepType ("SWEEP_LOW") lives in the audit-trail diagnostic.
    const liq = findIntentByText(intents, 'LIQUIDITY SWEEP');
    assert.ok(liq, 'expected the sweep level to be drawn somewhere on the chart');
    assert.equal(liq.point.price, 1985);
    assert.ok(candidates.some((c) => c.diagnostic?.includes('SWEEP_LOW')), 'the specific sweepType must survive in the diagnostic audit trail');
  });

  it('falls back to the nearest EQH/EQL pool when no sweep is active', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      liquidityContext: { equalHighs: [{ price: 2040, touch_count: 2, indices: [] }], equalLows: [{ price: 2012, touch_count: 3, indices: [] }], sweepReclaim: { swept: false } },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'liquidity_primary').point.price, 2012); // nearer to 2010 than 2040
  });

  it('never emits a role for a fair value gap under any circumstance', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false }, fairValueGaps: [{ index: 5, direction: 'BULLISH', gapLow: 2001, gapHigh: 2004, filled: false }] } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'liquidity_primary'), undefined);
    assert.equal(findCandidate(candidates, 'liquidity_primary').reason_excluded, 'NO_RELEVANT_SWEEP_OR_POOL');
    assert.ok(!candidates.some((c) => /fvg|fair.?value/i.test(c.role)));
  });
});

describe('marketVisualization: classical pattern selection is deterministic, never fabricated', () => {
  it('prefers CONFIRMED over FORMING, and uses the real pattern-supplied timestamps/prices', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      classicalPatterns: [
        { pattern_id: 'p1', pattern_type: 'ASCENDING_TRIANGLE', bias: 'BULLISH', completion_state: 'FORMING', end_time: NOW - 900, neckline: null, breakout_level: null, pivot_points: [{ time: NOW - 1800, price: 2005 }, { time: NOW - 900, price: 2008 }] },
        { pattern_id: 'p2', pattern_type: 'DOUBLE_BOTTOM', bias: 'BULLISH', completion_state: 'CONFIRMED', end_time: NOW - 300, neckline: 2018.5, breakout_level: 2018.5, pivot_points: [{ time: NOW - 1200, price: 2001 }, { time: NOW - 300, price: 2001.5 }] },
      ],
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // Pattern Visual Proof (Part E): DOUBLE_BOTTOM now draws truthful
    // two-part geometry -- a trend_line through the actual peak/valley
    // touches (pattern_primary_touches, carrying the pattern-type label)
    // PLUS the objective neckline as its own horizontal_line
    // (pattern_primary, labeled NECKLINE) -- never a single fabricated
    // reference line standing in for both.
    const touches = findIntent(intents, 'pattern_primary_touches');
    const neckline = findIntent(intents, 'pattern_primary');
    assert.ok(touches, 'expected a touches trend_line through the real pivot_points');
    assert.equal(touches.primitive, 'trend_line');
    // Short chart label: underscores become spaces ("DOUBLE BOTTOM"), never
    // the raw enum ("DOUBLE_BOTTOM") or the completion_state -- both remain
    // available via the diagnostic audit trail. A trend_line's own text
    // (unlike a horizontal_line's) is not decoupled into a separate
    // `__label` companion, so it is asserted directly on the intent.
    assert.ok(touches.text.includes('DOUBLE BOTTOM'));
    assert.ok(!touches.text.includes('_'));
    assert.ok(findCandidate(candidates, 'pattern_primary_touches').diagnostic.includes('DOUBLE_BOTTOM'));
    assert.ok(neckline, 'expected the objective neckline as its own horizontal_line');
    assert.equal(neckline.point.price, 2018.5);
    assert.equal(neckline.point.time, NOW - 300); // the pattern's OWN real end_time, never the current bar time
    assert.equal(findLabelText(intents, 'pattern_primary'), 'NECKLINE');
  });

  it('falls back to a text-only annotation at the last pivot when no neckline/breakout_level exists', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      classicalPatterns: [{ pattern_id: 'p3', pattern_type: 'SYMMETRICAL_TRIANGLE', bias: 'NEUTRAL', completion_state: 'CONFIRMED', end_time: NOW - 300, neckline: null, breakout_level: null, pivot_points: [{ time: NOW - 900, price: 2010 }, { time: NOW - 300, price: 2012 }] }],
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const p = findIntent(intents, 'pattern_primary');
    assert.equal(p.primitive, 'text');
    assert.equal(p.point.price, 2012);
  });

  it('incomplete pattern geometry (no timestamp) is skipped, never fabricated', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ classicalPatterns: [{ pattern_id: 'p4', pattern_type: 'RECTANGLE', bias: 'NEUTRAL', completion_state: 'CONFIRMED', end_time: null, neckline: null, breakout_level: null, pivot_points: [] }] });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'pattern_primary'), undefined);
    assert.equal(findCandidate(candidates, 'pattern_primary').reason_excluded, 'NO_OBJECTIVE_PATTERN_GEOMETRY');
  });
});

describe('marketVisualization: breakout lifecycle mapping', () => {
  it('maps RETEST_PENDING/RETEST_HOLD to an informative, non-entry-implying label', () => {
    const decision = baseDecision();
    // breakoutState is always derived FROM structure.lastEvent in real evidence -- a
    // realistic fixture includes both, matching classifyBreakoutState()'s own contract.
    const evidence = baseEvidence({ breakoutState: { state: 'BREAKOUT_RETEST_PENDING', evidence: { direction: 'BULLISH' } }, structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 10, level: 2030 } } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // anticipation.primary_scenario's own trigger location resolves to this
    // SAME breakout level (both genuinely derive from structure.lastEvent.level),
    // so the coincident-level merge may legitimately relabel this under
    // primary_trigger -- assert on CONTENT reaching the chart, not the role.
    // The chart-facing label is now short ("BREAKOUT • RETEST"); the full
    // "RETEST PENDING" lifecycle wording lives in the diagnostic.
    assert.ok(findIntentByText(intents, 'RETEST'));
    assert.ok(candidates.some((c) => c.diagnostic?.includes('RETEST PENDING')));
  });

  it('OVEREXTENDED_BREAKOUT is shown but never implies a new entry opportunity', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ breakoutState: { state: 'OVEREXTENDED_BREAKOUT', evidence: { direction: 'BULLISH' } }, structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 10, level: 2030 } } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // Chart-facing label is now short ("BREAKOUT (LATE)") -- it never claims
    // a new entry either way, so the negation-wording check moves to the
    // diagnostic audit trail, which still carries the full explicit sentence.
    const b = findIntentByText(intents, 'BREAKOUT (LATE)');
    assert.ok(b);
    assert.ok(!/buy here|sell here|new entry opportunity/i.test(b.text));
    const diag = candidates.find((c) => c.diagnostic?.includes('OVEREXTENDED'))?.diagnostic;
    assert.ok(diag);
    assert.ok(diag.includes('not a new entry'));
    assert.ok(!/buy here|sell here|new entry opportunity(?!.{0,3}$)/i.test(diag.replace('not a new entry', '')));
    // MISSED anticipation state also never gets trade geometry
    assert.equal(anticipation.state, 'MISSED');
    assert.equal(findIntent(intents, 'trade_entry'), undefined);
  });

  it('a FAILED breakout is suppressed unless anticipation is currently INVALIDATED for the same reason', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ breakoutState: { state: 'FAILED_BREAKOUT', evidence: { direction: 'BULLISH' } }, structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 10, level: 2030 } } });
    const anticipation = computeAnticipation({ decision, evidence });
    assert.equal(anticipation.state, 'INVALIDATED'); // Stage 1/2 itself reports this from the same evidence
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // Since anticipation IS INVALIDATED here, the breakout level is relevant and shown
    // (possibly merged under primary_trigger/primary_invalidation -- same real level).
    assert.ok(intents.some((i) => i.point.price === 2030));
    void candidates;
  });
});

describe('marketVisualization: anticipation primary scenario', () => {
  it('maps a real primary_scenario into a conditional (never predictive) label', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    const evidence = baseEvidence({ correction: { state: 'ACTIVE' } });
    const anticipation = computeAnticipation({ decision, evidence });
    assert.equal(anticipation.state, 'CONFIRMATION_PENDING');
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // primary_scenario is a 'text' role and may now legitimately merge into a
    // coincident-price horizontal_line (e.g. primary_trigger) -- see the
    // Zone-Based Market Map upgrade's label-collision merge. The chart-facing
    // label is now short ("<BUY|SELL> WATCH • CONFIRMATION"); the raw
    // "CONFIRMATION_PENDING" state name lives in the diagnostic audit trail.
    const scenario = findIntentByText(intents, 'CONFIRMATION');
    assert.ok(scenario);
    assert.ok(!/will rise|will fall|guaranteed|certain|price will/i.test(scenario.text));
    assert.ok(candidates.some((c) => c.diagnostic?.includes('CONFIRMATION_PENDING')));
  });

  it('primary_trigger is only emitted when objective trigger geometry exists', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence(); // no breakout/liquidity/level evidence -> DEVELOPING with no location
    const anticipation = computeAnticipation({ decision, evidence });
    assert.equal(anticipation.primary_scenario?.location, null);
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'primary_trigger'), undefined);
    assert.equal(findCandidate(candidates, 'primary_trigger').reason_excluded, 'NO_OBJECTIVE_TRIGGER_GEOMETRY');
  });

  it('primary_invalidation is textually and semantically distinct from a trade SL', () => {
    const decision = baseDecision({
      reason: 'HTF_CONFLICT', setup: 'TC',
      diagnostics: { source_timeframe: TF, conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } },
    });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const inv = findIntent(intents, 'primary_invalidation');
    assert.ok(inv);
    assert.equal(inv.text, null); // always decoupled into its own __label companion
    const invLabel = findLabelText(intents, 'primary_invalidation');
    assert.ok(!/\bSL\b/.test(invLabel.replace('not SL', ''))); // "not SL" is the ONLY allowed occurrence of "SL"
    assert.ok(invLabel.toLowerCase().includes('invalidation'));
  });
});

describe('marketVisualization: alternate scenario is never fabricated', () => {
  it('is entirely absent (no roles at all) when anticipation.alternate_scenario is null', () => {
    const decision = baseDecision({ reason: 'CHOP' });
    const evidence = baseEvidence({ structure: { state: null, lastSwingHigh: null, lastSwingLow: null, pivots: [], rangeHigh: null, rangeLow: null, lastEvent: null } });
    const anticipation = computeAnticipation({ decision, evidence });
    assert.equal(anticipation.alternate_scenario, null);
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.equal(findIntent(intents, 'alternate_scenario'), undefined);
    assert.equal(findIntent(intents, 'alternate_trigger'), undefined);
    assert.equal(findIntent(intents, 'alternate_invalidation'), undefined);
  });

  it('is populated only from the engine-produced objective opposing path, never a forced mirror of primary', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    assert.ok(anticipation.alternate_scenario);
    const { candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // alternate_scenario is a 'text' role and may now legitimately merge into
    // a coincident-price horizontal_line (e.g. alternate_invalidation) -- see
    // the Zone-Based Market Map upgrade's label-collision merge -- and its
    // short chart label can even be dropped by the display-length budget in
    // a sufficiently dense coincidence. Its full, real, engine-produced
    // content is never lost either way: it always survives in the
    // diagnostic audit trail, which is what this test verifies.
    const altCandidate = findCandidate(candidates, 'alternate_scenario');
    assert.ok(altCandidate.diagnostic.includes(anticipation.alternate_scenario.direction));
    assert.ok(altCandidate.diagnostic.includes(anticipation.alternate_scenario.strategy_family.toUpperCase()));
  });
});

describe('marketVisualization: clutter budget and priority suppression', () => {
  it('never exceeds CLUTTER_BUDGET.MAX_TOTAL intents even when every category has data', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({
      levelsContext: {
        levels: [], nearestSupport: { price: 1995, touch_count: 2, fresh: true }, nearestResistance: { price: 2040, touch_count: 2, fresh: true },
        supplyDemandZones: [{ origin_bar_index: 1, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }, { origin_bar_index: 2, direction: 'supply', zone_low: 2030, zone_high: 2038, state: 'FRESH' }],
      },
      liquidityContext: { equalHighs: [{ price: 2045, touch_count: 2, indices: [] }], equalLows: [], sweepReclaim: { swept: false } },
      classicalPatterns: [{ pattern_id: 'p1', pattern_type: 'DOUBLE_TOP', bias: 'BEARISH', completion_state: 'CONFIRMED', end_time: NOW - 300, neckline: 2005, breakout_level: 2005, pivot_points: [{ time: NOW - 900, price: 2040 }] }],
      breakoutState: { state: 'BREAKOUT_RETEST_PENDING', evidence: { direction: 'BULLISH' } },
      structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 5, level: 2010 } },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, summary } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    // CLUTTER_BUDGET.MAX_TOTAL bounds distinct PIECES OF INFORMATION, not
    // raw draw calls -- a line/rectangle plus its own decoupled label
    // companion (see splitLineLabels()) count as ONE such piece even
    // though each renders via its own draw call (label-readability fix:
    // a line's own inline label can never be moved without moving the
    // line, so the label needs an independent, lane-adjustable object).
    assert.ok(summary.total_included <= CLUTTER_BUDGET.MAX_TOTAL, `expected <= ${CLUTTER_BUDGET.MAX_TOTAL} groups, got ${summary.total_included}`);
    assert.ok(intents.length <= CLUTTER_BUDGET.MAX_TOTAL * 2, `expected <= ${CLUTTER_BUDGET.MAX_TOTAL * 2} raw draw calls, got ${intents.length}`);
  });

  it('P1 (trade geometry) is never suppressed by lower-priority P2/P3 candidates', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: 2020, rr: 2.1, quality: 78 });
    const evidence = baseEvidence({
      levelsContext: { levels: [], nearestSupport: { price: 1995, touch_count: 2, fresh: true }, nearestResistance: { price: 2040, touch_count: 2, fresh: true }, supplyDemandZones: [] },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    for (const role of ['trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2', 'trade_status']) assert.ok(findIntent(intents, role), `${role} must survive the clutter budget`);
  });
});

describe('marketVisualization: no HTF dump -- single primary timeframe only', () => {
  it('every emitted intent uses the SAME decision timeframe, never a different one per object', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ levelsContext: { levels: [], nearestSupport: { price: 1995, touch_count: 1, fresh: true }, nearestResistance: { price: 2040, touch_count: 1, fresh: true }, supplyDemandZones: [] } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.ok(intents.length > 0);
    assert.ok(intents.every((i) => i.timeframe === TF));
  });

  it('returns no intents at all when no objective anchor time is available (never fabricates one)', () => {
    const decision = { ...baseDecision(), market_data_times: {}, timeframes: {} };
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents, summary } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    assert.deepEqual(intents, []);
    assert.equal(summary.reason, 'NO_OBJECTIVE_ANCHOR_TIME_AVAILABLE');
  });
});

describe('marketVisualization: coincident-level merge -- never multiple overlapping lines at the identical price', () => {
  it('never emits two horizontal_line intents at the exact same (symbol, timeframe, price)', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      breakoutState: { state: 'BREAKOUT_RETEST_PENDING', evidence: { direction: 'BULLISH' } },
      structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 10, level: 2030 } },
      classicalPatterns: [{ pattern_id: 'p1', pattern_type: 'DOUBLE_TOP', bias: 'BEARISH', completion_state: 'CONFIRMED', end_time: NOW - 300, neckline: 2030, breakout_level: 2030, pivot_points: [{ time: NOW - 900, price: 2040 }] }],
      liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } },
    });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const lineIntents = intents.filter((i) => i.primitive === 'horizontal_line');
    const prices = lineIntents.map((i) => `${i.symbol}|${i.timeframe}|${i.point.price}`);
    assert.equal(prices.length, new Set(prices).size, 'no two horizontal_line intents should share the exact same (symbol, timeframe, price)');
    // The 2030 level is real, covered exactly once. The merged line's own
    // text is always decoupled into an independently-positionable `__label`
    // companion (see splitLineLabels()), so the combined label lives there.
    const at2030 = lineIntents.filter((i) => i.point.price === 2030);
    assert.equal(at2030.length, 1);
    assert.equal(at2030[0].text, null);
    const label2030 = intents.find((i) => i.point.price === 2030 && i.text?.includes('•'));
    assert.ok(label2030, 'a genuinely merged level should combine multiple labels');
  });

  it('confirmed trade geometry (ENTRY/SL/TP1/TP2) is NEVER merged, even if it coincides with another level', () => {
    // Contrived: a support level at the exact same price as the entry.
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: 2020, rr: 2.0, quality: 78 });
    const evidence = baseEvidence({ levelsContext: { levels: [], supplyDemandZones: [], nearestSupport: { price: 2010, touch_count: 2, fresh: true }, nearestResistance: null } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const entry = findIntent(intents, 'trade_entry');
    assert.ok(entry);
    assert.equal(entry.text, 'ENTRY 2010'); // exact protected label, never combined with "SUPPORT..."
    assert.ok(!entry.text.includes('|'));
  });

  it('a unique price is never altered by the merge step', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ levelsContext: { levels: [], supplyDemandZones: [], nearestSupport: { price: 1995, touch_count: 1, fresh: true }, nearestResistance: { price: 2040, touch_count: 1, fresh: true } } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const support = findIntent(intents, 'nearest_support');
    assert.equal(support.point.price, 1995); // the line's own exact analytical price is untouched
    const labelText = findLabelText(intents, 'nearest_support');
    assert.equal(labelText, 'SUPPORT x1');
    assert.ok(!labelText.includes('|'));
  });
});

describe('marketVisualization: every emitted intent is schema-valid', () => {
  it('all intents pass the Stage 4 visualization schema (role/primitive/symbol/timeframe/point present)', () => {
    const decision = baseDecision({ action: 'SELL', reason: null, setup: 'SR', entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0, quality: 72 });
    const evidence = baseEvidence({ structure: { ...baseEvidence().structure, state: 'BEARISH' } });
    const anticipation = computeAnticipation({ decision, evidence });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    for (const intent of intents) {
      assert.ok(intent.role);
      assert.ok(['horizontal_line', 'vertical_line', 'trend_line', 'rectangle', 'text'].includes(intent.primitive));
      assert.equal(intent.symbol, 'OANDA:XAUUSD');
      assert.equal(intent.timeframe, TF);
      assert.ok(Number.isFinite(intent.point.time));
      assert.ok(Number.isFinite(intent.point.price));
    }
  });
});
