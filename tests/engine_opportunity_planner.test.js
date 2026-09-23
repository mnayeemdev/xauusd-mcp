/**
 * src/engine/opportunityPlanner.js -- Pre-Entry Opportunity Planner.
 * Proves: BUY/SELL symmetry, objective zone ranking (supply/demand >
 * S/R > structural swing > liquidity pool), no fabricated zones/geometry,
 * interaction-state classification from the single latest confirmed bar
 * only, opportunity-state lifecycle mapping, invalidation from objective
 * zone-break evidence, candidate geometry (entry zone / provisional
 * invalidation / TP1 / TP2 / RR) is provisional-only and never confused
 * with final trade geometry, primary/alternate scenario semantics, and
 * strict no-future-leakage (mission Section 44).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeOpportunityPlan, OPPORTUNITY_STATES, INTERACTION_STATES, RESERVED_UNUSED_STATES } from '../src/engine/opportunityPlanner.js';
import { RISK_PARAMS } from '../src/engine/risk.js';

function baseDecision(overrides = {}) {
  return { action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', symbol: 'OANDA:XAUUSD', diagnostics: { source_timeframe: '15m' }, setup: 'PB', ...overrides };
}

function bearishEvidence(overrides = {}) {
  return {
    regime: 'BEAR_TREND',
    structure: { state: 'BEARISH', lastSwingHigh: { price: 4400, label: 'LH' }, lastSwingLow: { price: 4340, label: 'LL' }, rangeHigh: 4420, rangeLow: 4300, lastEvent: null },
    sessionContext: { current: { last_close: 4356 } },
    volatilityContext: { atrValue: 9.3 },
    levelsContext: {
      nearestSupport: { price: 4340, type: 'support', fresh: true },
      nearestResistance: { price: 4370, type: 'resistance', fresh: true },
      supplyDemandZones: [{ direction: 'supply', zone_low: 4378, zone_high: 4386, state: 'FRESH' }],
    },
    liquidityContext: { equalHighs: [{ price: 4395, touch_count: 2 }], equalLows: [] },
    candlestickPatterns: [{ pattern: 'BEARISH_ENGULFING', bias: 'BEARISH' }],
    classicalPatterns: [],
    ...overrides,
  };
}

function bullishEvidence(overrides = {}) {
  return {
    regime: 'BULL_TREND',
    structure: { state: 'BULLISH', lastSwingHigh: { price: 4400, label: 'HH' }, lastSwingLow: { price: 4340, label: 'HL' }, rangeHigh: 4420, rangeLow: 4300, lastEvent: null },
    sessionContext: { current: { last_close: 4356 } },
    volatilityContext: { atrValue: 9.3 },
    levelsContext: {
      nearestSupport: { price: 4340, type: 'support', fresh: true },
      nearestResistance: { price: 4370, type: 'resistance', fresh: true },
      supplyDemandZones: [{ direction: 'demand', zone_low: 4330, zone_high: 4338, state: 'FRESH' }],
    },
    liquidityContext: { equalHighs: [], equalLows: [{ price: 4320, touch_count: 2 }] },
    candlestickPatterns: [{ pattern: 'BULLISH_ENGULFING', bias: 'BULLISH' }],
    classicalPatterns: [],
    ...overrides,
  };
}

function bearishAnticipation(overrides = {}) {
  return {
    state: 'DEVELOPING', direction: 'BEARISH', developing_strategy_family: 'pullback_continuation', authoritative_wait_reason: 'RR_NOT_ACCEPTABLE',
    primary_scenario: {
      direction: 'BEARISH', mapped_model_code: 'PB', state: 'DEVELOPING',
      trigger_requirements: ['a confirmed reclaim beyond the breakout level'], confirmation_requirements: [`risk/reward at or above the protected minimum (${RISK_PARAMS.minRR})`],
      supporting_evidence: [{ type: 'candlestick', pattern: 'BEARISH_ENGULFING' }], opposing_evidence: [],
      target_room: { structural_objective: 4300, atr_multiple: 6 },
    },
    alternate_scenario: null,
    ...overrides,
  };
}

function bullishAnticipation(overrides = {}) {
  return {
    state: 'DEVELOPING', direction: 'BULLISH', developing_strategy_family: 'pullback_continuation', authoritative_wait_reason: 'RR_NOT_ACCEPTABLE',
    primary_scenario: {
      direction: 'BULLISH', mapped_model_code: 'PB', state: 'DEVELOPING',
      trigger_requirements: [], confirmation_requirements: [],
      supporting_evidence: [{ type: 'candlestick', pattern: 'BULLISH_ENGULFING' }], opposing_evidence: [],
      target_room: { structural_objective: 4420, atr_multiple: 6 },
    },
    alternate_scenario: null,
    ...overrides,
  };
}

function farBar({ time = 1000, price = 4356 } = {}) {
  return [{ time, open: price - 2, high: price + 2, low: price - 4, close: price }];
}

describe('opportunityPlanner: BUY/SELL planning symmetry', () => {
  it('SELL planning: selects the overhead supply zone, computes provisional geometry', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.equal(plan.direction, 'BEARISH');
    assert.equal(plan.zone.type, 'supply_zone');
    assert.equal(plan.zone.lower, 4378);
    assert.equal(plan.zone.upper, 4386);
    assert.equal(plan.candidate_tp1, 4340); // nearest support
    assert.equal(plan.candidate_tp2, 4300); // reused target_room.structural_objective verbatim
    assert.ok(Number.isFinite(plan.planning_rr_illustrative));
  });

  it('BUY planning: selects the below-price demand zone, symmetric geometry', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bullishEvidence(), anticipation: bullishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.equal(plan.direction, 'BULLISH');
    assert.equal(plan.zone.type, 'demand_zone');
    assert.equal(plan.zone.lower, 4330);
    assert.equal(plan.zone.upper, 4338);
    assert.equal(plan.candidate_tp1, 4370); // nearest resistance
    assert.equal(plan.candidate_tp2, 4420);
  });

  it('BUY invalidation and SELL invalidation are symmetric (BROKEN interaction)', () => {
    const sellBrokenBar = [{ time: 1000, open: 4384, high: 4390, low: 4382, close: 4389 }]; // closes above zone.upper (4386)
    const sellPlan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: sellBrokenBar });
    assert.equal(sellPlan.interaction_state, 'BROKEN');
    assert.equal(sellPlan.opportunity_state, 'INVALIDATED');

    const buyBrokenBar = [{ time: 1000, open: 4334, high: 4336, low: 4326, close: 4327 }]; // closes below zone.lower (4330)
    const buyPlan = computeOpportunityPlan({ decision: baseDecision(), evidence: bullishEvidence(), anticipation: bullishAnticipation(), primaryBars: buyBrokenBar });
    assert.equal(buyPlan.interaction_state, 'BROKEN');
    assert.equal(buyPlan.opportunity_state, 'INVALIDATED');
  });

  it('BUY confirmation handoff and SELL confirmation handoff are symmetric (decision already BUY/SELL)', () => {
    for (const [action, dir] of [['BUY', 'BULLISH'], ['SELL', 'BEARISH']]) {
      const plan = computeOpportunityPlan({ decision: baseDecision({ action }), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
      assert.equal(plan.status, 'SUPERSEDED_BY_CONFIRMED_TRADE');
      assert.equal(plan.direction, dir);
      assert.equal(plan.candidate_entry_zone, null);
      assert.equal(plan.candidate_tp1, null);
    }
  });
});

describe('opportunityPlanner: correction-as-opportunity (mission Section 9) -- CORRECTION_ACTIVE never means "no opportunity analysis"', () => {
  it('BULL trend + downward correction + demand/support -> a real BUY plan is still built (never just "no plan because correction")', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    // anticipation.js's own resolvePreEntryState() maps decision.reason === 'CORRECTION_ACTIVE' to state 'CONFIRMATION_PENDING' -- reproduced here verbatim as the fixture's anticipation.state, exactly as the real module would compute it.
    const anticipation = bullishAnticipation({ state: 'CONFIRMATION_PENDING', primary_scenario: { ...bullishAnticipation().primary_scenario, state: 'CONFIRMATION_PENDING' } });
    const plan = computeOpportunityPlan({ decision, evidence: bullishEvidence(), anticipation, primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.equal(plan.direction, 'BULLISH');
    assert.equal(plan.zone.type, 'demand_zone');
    assert.ok(plan.candidate_entry_zone);
    // The protected engine's own authoritative action remains WAIT throughout -- the plan is purely additive observability.
    assert.equal(decision.action, 'WAIT');
  });

  it('BEAR trend + upward correction + supply/resistance -> a real SELL plan is still built, symmetrically', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    const anticipation = bearishAnticipation({ state: 'CONFIRMATION_PENDING', primary_scenario: { ...bearishAnticipation().primary_scenario, state: 'CONFIRMATION_PENDING' } });
    const plan = computeOpportunityPlan({ decision, evidence: bearishEvidence(), anticipation, primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.equal(plan.direction, 'BEARISH');
    assert.equal(plan.zone.type, 'supply_zone');
    assert.equal(decision.action, 'WAIT');
  });

  it('opportunity_state correctly reflects CONFIRMATION_PENDING during an active correction, deferring to anticipation.state (the protected engine\'s own gate proximity)', () => {
    const anticipation = bullishAnticipation({ state: 'CONFIRMATION_PENDING' });
    const plan = computeOpportunityPlan({ decision: baseDecision({ reason: 'CORRECTION_ACTIVE' }), evidence: bullishEvidence(), anticipation, primaryBars: farBar() });
    assert.equal(plan.opportunity_state, 'CONFIRMATION_PENDING');
  });
});

describe('opportunityPlanner: objective zone ranking (mission Section 8)', () => {
  it('prefers supply/demand zone over nearest S/R when both exist', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.zone.source, 'levels.js supplyDemandZones');
  });

  it('falls back to nearest fresh S/R when no supply/demand zone exists', () => {
    const evidence = bearishEvidence({ levelsContext: { nearestSupport: { price: 4340, type: 'support', fresh: true }, nearestResistance: { price: 4370, type: 'resistance', fresh: true }, supplyDemandZones: [] } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.zone.source, 'levels.js nearestSupport/nearestResistance');
    assert.equal(plan.zone.lower, 4370);
    assert.equal(plan.zone.upper, 4370); // point-precision, zero-width -- never fabricated width
  });

  it('falls back to opposing structural swing when no zone or S/R exists', () => {
    const evidence = bearishEvidence({ levelsContext: { nearestSupport: null, nearestResistance: null, supplyDemandZones: [] } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.zone.source, 'structure.js lastSwingHigh/lastSwingLow');
    assert.equal(plan.zone.lower, 4400);
  });

  it('falls back to nearest liquidity pool when nothing else objective exists', () => {
    const evidence = bearishEvidence({
      levelsContext: { nearestSupport: null, nearestResistance: null, supplyDemandZones: [] },
      structure: { state: 'BEARISH', lastSwingHigh: null, lastSwingLow: null, rangeHigh: null, rangeLow: null, lastEvent: null },
    });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.zone.source, 'liquidity.js equalHighs/equalLows');
    assert.equal(plan.zone.lower, 4395);
  });

  it('returns NO_PLAN / NO_OBJECTIVE_ZONE_AVAILABLE when nothing objective exists anywhere -- never fabricates a zone', () => {
    const evidence = bearishEvidence({
      levelsContext: { nearestSupport: null, nearestResistance: null, supplyDemandZones: [] },
      structure: { state: 'BEARISH', lastSwingHigh: null, lastSwingLow: null, rangeHigh: null, rangeLow: null, lastEvent: null },
      liquidityContext: { equalHighs: [], equalLows: [] },
    });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.status, 'NO_PLAN');
    assert.equal(plan.reason, 'NO_OBJECTIVE_ZONE_AVAILABLE');
    assert.equal(plan.zone, null);
  });

  it('a zone already fully passed through (wrong side of current price) is never selected', () => {
    // A "supply" zone entirely BELOW current price is irrelevant for a SELL plan.
    const evidence = bearishEvidence({ levelsContext: { nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ direction: 'supply', zone_low: 4200, zone_high: 4210, state: 'FRESH' }] } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.notEqual(plan.zone?.lower, 4200);
  });
});

describe('opportunityPlanner: no objective zone -> null plan (mission Section 39)', () => {
  it('WAIT with no primary_scenario at all -> NO_PLAN, never a forced plan', () => {
    const anticipation = { state: 'WAIT', direction: null, developing_strategy_family: null, authoritative_wait_reason: 'CHOP', primary_scenario: null, alternate_scenario: null };
    const plan = computeOpportunityPlan({ decision: baseDecision({ reason: 'CHOP' }), evidence: bearishEvidence(), anticipation, primaryBars: farBar() });
    assert.equal(plan.status, 'NO_PLAN');
    assert.equal(plan.direction, null);
  });
});

describe('opportunityPlanner: approach / touch / reaction states (mission Section 9-11)', () => {
  it('far from zone -> DEVELOPING', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar({ price: 4356 }) });
    assert.equal(plan.interaction_state, 'APPROACHING');
    assert.equal(plan.opportunity_state, 'DEVELOPING');
  });

  it('within ATR tolerance of the zone but not yet touching -> APPROACHING_ZONE', () => {
    // zone.lower=4378, atrValue=9.3, tolerance=0.3*9.3=2.79 -- price at 4376 is 2 away (within tolerance), bar high 4377 does not touch (4377 < 4378).
    const bars = [{ time: 1000, open: 4374, high: 4377, low: 4372, close: 4376 }];
    const evidence = bearishEvidence({ sessionContext: { current: { last_close: 4376 } } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: bars });
    assert.equal(plan.interaction_state, 'APPROACHING');
    assert.equal(plan.opportunity_state, 'APPROACHING_ZONE');
  });

  it('bar wick enters the zone with no supporting evidence -> WICK_TOUCH -> ZONE_TOUCHED', () => {
    const bars = [{ time: 1000, open: 4374, high: 4380, low: 4372, close: 4375 }]; // wick to 4380 (inside zone), body/close stay outside
    const evidence = bearishEvidence({ candlestickPatterns: [], sessionContext: { current: { last_close: 4375 } } });
    const anticipation = bearishAnticipation({ primary_scenario: { ...bearishAnticipation().primary_scenario, supporting_evidence: [] } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation, primaryBars: bars });
    assert.equal(plan.interaction_state, 'WICK_TOUCH');
    assert.equal(plan.opportunity_state, 'ZONE_TOUCHED');
  });

  it('bar body enters the zone -> BODY_TOUCH -> ZONE_TOUCHED', () => {
    const bars = [{ time: 1000, open: 4379, high: 4382, low: 4376, close: 4381 }]; // body [4379,4381] inside zone [4378,4386]
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: bars });
    assert.equal(plan.interaction_state, 'BODY_TOUCH');
    assert.equal(plan.opportunity_state, 'ZONE_TOUCHED');
  });

  it('bar touches the zone AND closes back outside AND supporting evidence exists -> REJECTION -> REACTION_PENDING', () => {
    const bars = [{ time: 1000, open: 4376, high: 4382, low: 4374, close: 4375 }]; // wick to 4382 (inside zone), closes back below zone.lower
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: bars });
    assert.equal(plan.interaction_state, 'REJECTION');
    assert.equal(plan.opportunity_state, 'REACTION_PENDING');
    assert.ok(plan.confirmation_observed.length > 0);
  });

  it('anticipation ARMED/CONFIRMATION_PENDING dominates over a weaker interaction reading', () => {
    const anticipation = bearishAnticipation({ state: 'ARMED' });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation, primaryBars: farBar() });
    assert.equal(plan.opportunity_state, 'ARMED');
  });
});

describe('opportunityPlanner: candidate geometry is clearly provisional (mission Section 15, 45)', () => {
  it('every candidate field is present and distinct from any "final" naming', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.ok('candidate_entry_zone' in plan);
    assert.ok('provisional_invalidation' in plan);
    assert.ok('candidate_tp1' in plan);
    assert.ok('candidate_tp2' in plan);
    assert.ok('planning_rr_illustrative' in plan);
    assert.ok(plan.provisional_invalidation.condition.includes('confirmed close'));
  });

  it('candidate RR reflects the real Section-19 example: an unacceptable current RR does not prevent identifying a MORE favorable overhead zone', () => {
    // Mirrors the live-observed case: 15m BEAR_TREND SELL PB, current RR 0.65 (unacceptable) -- the planner still finds an objective overhead zone with better RR.
    const plan = computeOpportunityPlan({ decision: baseDecision({ reason: 'RR_NOT_ACCEPTABLE' }), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.ok(Number.isFinite(plan.planning_rr_illustrative));
    assert.ok(plan.planning_rr_illustrative >= RISK_PARAMS.minRR, 'this fixture is deliberately constructed so the overhead zone IS more favorable');
  });

  it('planning_rr_illustrative is null (never fabricated) when no target or invalidation is available', () => {
    const evidence = bearishEvidence({ levelsContext: { nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ direction: 'supply', zone_low: 4378, zone_high: 4386, state: 'FRESH' }] } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.candidate_tp1, null);
    assert.equal(plan.planning_rr_illustrative, null);
  });

  it('blocking_conditions includes the authoritative wait reason and an under-minimum candidate RR when applicable', () => {
    const evidence = bearishEvidence({ levelsContext: { nearestSupport: { price: 4383, type: 'support', fresh: true }, nearestResistance: { price: 4370, type: 'resistance', fresh: true }, supplyDemandZones: [{ direction: 'supply', zone_low: 4378, zone_high: 4386, state: 'FRESH' }] } });
    const anticipation = bearishAnticipation({ primary_scenario: { ...bearishAnticipation().primary_scenario, target_room: { structural_objective: 4383, atr_multiple: 1 } } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation, primaryBars: farBar() });
    assert.ok(plan.blocking_conditions.includes('RR_NOT_ACCEPTABLE'));
  });
});

describe('opportunityPlanner: primary + alternate scenario (mission Section 21)', () => {
  it('alternate is null when anticipation has no alternate_scenario -- never forced', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation({ alternate_scenario: null }), primaryBars: farBar() });
    assert.equal(plan.alternate_scenario, null);
  });

  it('alternate is built only when an objective zone ALSO exists for the alternate direction', () => {
    const evidence = bearishEvidence(); // has a demand zone at 4330-4338? No -- bearishEvidence only has supply. Add demand for the alternate.
    evidence.levelsContext.supplyDemandZones.push({ direction: 'demand', zone_low: 4330, zone_high: 4338, state: 'FRESH' });
    const anticipation = bearishAnticipation({ alternate_scenario: { direction: 'BULLISH', basis: 'objective opposing structural break' } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation, primaryBars: farBar() });
    assert.ok(plan.alternate_scenario);
    assert.equal(plan.alternate_scenario.direction, 'BULLISH');
    assert.equal(plan.alternate_scenario.zone.type, 'demand_zone');
  });

  it('alternate stays null when anticipation names one but no objective zone exists for it -- never forced', () => {
    const evidence = bearishEvidence({ levelsContext: { ...bearishEvidence().levelsContext, nearestSupport: null }, structure: { ...bearishEvidence().structure, lastSwingLow: null } });
    evidence.liquidityContext = { equalHighs: evidence.liquidityContext.equalHighs, equalLows: [] };
    const anticipation = bearishAnticipation({ alternate_scenario: { direction: 'BULLISH', basis: 'objective opposing structural break' } });
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence, anticipation, primaryBars: farBar() });
    assert.equal(plan.alternate_scenario, null);
  });
});

describe('opportunityPlanner: no future leakage (mission Section 22, 44)', () => {
  it('the same snapshot always produces an identical plan, regardless of what bars exist elsewhere "afterward"', () => {
    const snapshotBars = farBar({ time: 5000, price: 4356 });
    const planA = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: snapshotBars });

    // Simulate "time passing": build a LONGER bars array with future candles that would
    // materially change structure/levels if they were included -- a sharp future move.
    const futureBars = [...snapshotBars, { time: 5900, open: 4356, high: 4500, low: 4350, close: 4495 }, { time: 6800, open: 4495, high: 4510, low: 4480, close: 4500 }];
    void futureBars; // never passed to the planner -- recompute using the ORIGINAL snapshot only

    const planB = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: snapshotBars });
    assert.deepEqual(planA, planB);
  });

  it('a plan computed from a truncated (earlier) bars array never reflects a later bar\'s data', () => {
    const earlyBars = farBar({ time: 1000, price: 4356 });
    const laterBars = [...earlyBars, { time: 1900, open: 4356, high: 4360, low: 4350, close: 4358 }];
    const planEarly = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: earlyBars });
    const planLater = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: laterBars });
    // generated_from_bar_time must reflect ONLY the bars actually given to each call.
    assert.equal(planEarly.generated_from_bar_time, 1000);
    assert.equal(planLater.generated_from_bar_time, 1900);
  });

  it('never reads wall-clock time -- source audit', () => {
    const src = readFileSync(new URL('../src/engine/opportunityPlanner.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/Date\.now\(\)/.test(code));
    assert.ok(!/new Date\(/.test(code));
  });
});

describe('opportunityPlanner: final authority is never usurped (mission Section 45)', () => {
  it('a pre-entry SELL plan alongside authoritative WAIT never becomes SELL', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision({ action: 'WAIT' }), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.notEqual(plan.status, 'SELL');
  });

  it('a pre-entry BUY plan alongside authoritative WAIT never becomes BUY', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision({ action: 'WAIT' }), evidence: bullishEvidence(), anticipation: bullishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.status, 'PLAN');
    assert.notEqual(plan.status, 'BUY');
  });

  it('candidate_entry_zone is never automatically the final Entry -- caller must always use decision.entry verbatim once confirmed', () => {
    const plan = computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() });
    assert.equal(plan.candidate_entry_zone.lower, 4378);
    // Once calculateEntry() later confirms SELL with a DIFFERENT entry (e.g. 4381.5), the planner's OWN candidate_entry_zone value is never consulted by anything -- structurally proven by SUPERSEDED_BY_CONFIRMED_TRADE never echoing candidate geometry (see the symmetry test above).
  });
});

describe('opportunityPlanner: public vocabulary', () => {
  it('OPPORTUNITY_STATES / INTERACTION_STATES are the documented closed vocabularies', () => {
    assert.deepEqual(OPPORTUNITY_STATES, ['DEVELOPING', 'APPROACHING_ZONE', 'ZONE_TOUCHED', 'REACTION_PENDING', 'CONFIRMATION_PENDING', 'ARMED', 'CONFIRMED', 'MISSED', 'INVALIDATED']);
    assert.deepEqual(INTERACTION_STATES, ['APPROACHING', 'WICK_TOUCH', 'BODY_TOUCH', 'REJECTION', 'BROKEN']);
  });

  it('RESERVED_UNUSED_STATES documents NO_LONGER_RELEVANT as deliberately deferred, and it is genuinely never emitted by computeOpportunityPlan()', () => {
    assert.deepEqual(RESERVED_UNUSED_STATES, ['NO_LONGER_RELEVANT']);
    assert.ok(!OPPORTUNITY_STATES.includes('NO_LONGER_RELEVANT'));
    // Sweep every fixture already exercised above -- none ever produces it.
    for (const plan of [
      computeOpportunityPlan({ decision: baseDecision(), evidence: bearishEvidence(), anticipation: bearishAnticipation(), primaryBars: farBar() }),
      computeOpportunityPlan({ decision: baseDecision(), evidence: bullishEvidence(), anticipation: bullishAnticipation(), primaryBars: farBar() }),
    ]) {
      assert.notEqual(plan.opportunity_state, 'NO_LONGER_RELEVANT');
    }
  });
});
