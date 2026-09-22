/**
 * src/engine/marketVisualization.js -- Zone-Based Market Map + Label
 * Collision upgrade. Proves:
 *   - active Supply/Demand render as translucent rectangles with REAL
 *     bar-time bounds when primaryBars is available, and gracefully fall
 *     back to the pre-upgrade horizontal_line when it is not
 *   - invalidated zones never render as active
 *   - the zone price is currently inside gets elevated priority (CURRENT)
 *   - zone analytical boundaries (lower/upper) are never altered by
 *     rectangle rendering or by label-lane text offsets
 *   - a blocked Pre-Entry plan is visually distinct (BUY/SELL PLAN —
 *     BLOCKED) from an unblocked one
 *   - deterministic label-lane separation for colliding text labels,
 *     never touching a coincident line/rectangle's own price
 *   - repeated reconciliation of a rectangle produces zero churn
 *   - BUY/SELL symmetry
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketVisualizationIntents, CLUTTER_BUDGET, TIER } from '../src/engine/marketVisualization.js';
import { visualizeMarketAnalysis } from '../src/core/xauusd_visualize_market.js';
import { computeIntentSignature } from '../src/engine/drawingRegistry.js';

const TF = '15m';
const NOW = 1_700_000_000;
const STEP = 900; // 15m bars

function makeBars(n, { start = 2000 } = {}) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const t = NOW - (n - 1 - i) * STEP;
    bars.push({ time: t, open: start, high: start + 1, low: start - 1, close: start });
  }
  return bars;
}

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
    structure: { state: 'BULLISH', lastEvent: null, lastSweep: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2000, label: 'HL' }, pivots: [], rangeHigh: 2060, rangeLow: 1980 },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: [], blocked_reason: null },
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
/** A horizontal_line's own label is decoupled into a separate `<role>__label` text companion (label-readability upgrade). Only applies when the role fell back to a horizontal_line (e.g. no primaryBars/no real origin zone) -- a rectangle keeps its own inline text. */
function findLabelText(intents, role) { return findIntent(intents, `${role}__label`)?.text ?? null; }

const PRIMARY_BARS = makeBars(100);
const ORIGIN_INDEX = 40; // a real bar well within the array

describe('Zone Market Map: Supply/Demand render as rectangles with real bar-time bounds', () => {
  it('an active demand zone becomes a rectangle spanning its real origin bar to a later real bar', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const demand = findIntent(intents, 'active_demand');
    assert.equal(demand.primitive, 'rectangle');
    assert.equal(demand.point.price, 1990); // zone_low, exact, unaltered
    assert.equal(demand.point2.price, 1998); // zone_high, exact, unaltered
    assert.equal(demand.point.time, PRIMARY_BARS[ORIGIN_INDEX].time); // the REAL origin bar
    assert.ok(demand.point2.time > demand.point.time);
    assert.ok(demand.text.includes('DEMAND'));
    assert.ok(demand.text.includes('FRESH'));
  });

  it('an active supply zone becomes a rectangle, visually distinct (different fill color) from demand', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'supply', zone_low: 2025, zone_high: 2035, state: 'MITIGATED' }] },
    });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const supply = findIntent(intents, 'active_supply');
    assert.equal(supply.primitive, 'rectangle');
    assert.equal(supply.point.price, 2025);
    assert.equal(supply.point2.price, 2035);
    assert.ok(supply.text.includes('SUPPLY'));
    assert.ok(supply.text.includes('MITIGATED'));
  });

  it('falls back to the pre-upgrade single-edge horizontal_line when no primaryBars is supplied -- never fabricates a time span', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence }); // no primaryBars
    const demand = findIntent(intents, 'active_demand');
    assert.equal(demand.primitive, 'horizontal_line');
    assert.equal(demand.point.price, 1998);
  });

  it('an INVALIDATED zone never renders as active, rectangle or otherwise', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'INVALIDATED' }] },
    });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    assert.equal(findIntent(intents, 'active_demand'), undefined);
    assert.equal(findCandidate(candidates, 'active_demand').reason_excluded, 'NO_ACTIVE_DEMAND_ZONE');
  });

  it('the zone price is currently INSIDE receives CURRENT_ZONE priority and a "CURRENT" label; a distant zone does not', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 1994 } }, // inside [1990,1998]
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const demand = findIntent(intents, 'active_demand');
    assert.ok(demand.text.startsWith('CURRENT DEMAND'));
    assert.equal(findCandidate(candidates, 'active_demand').tier, TIER.CURRENT_ZONE);
  });

  it('a nearest-but-not-current zone gets NEAREST_ZONE priority, no "CURRENT" prefix', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } }, // outside [1990,1998]
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const { candidates } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const demandCandidate = findCandidate(candidates, 'active_demand');
    assert.equal(demandCandidate.tier, TIER.NEAREST_ZONE);
    assert.ok(!demandCandidate.intent.text.startsWith('CURRENT'));
  });
});

describe('Zone Market Map: overlapping zone dedup -- the SAME real zone drawn by two roles merges into one rectangle', () => {
  it('plan_candidate_zone and active_demand referencing the identical zone merge, never two overlapping rectangles', () => {
    const decision = baseDecision({ reason: 'RR_NOT_ACCEPTABLE' });
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 1994 } },
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'MITIGATED' }] },
    });
    const plan = {
      status: 'PLAN', direction: 'BULLISH', opportunity_state: 'CONFIRMATION_PENDING',
      zone: { type: 'demand_zone', lower: 1990, upper: 1998, source: 'levels.js supplyDemandZones', zone_state: 'MITIGATED' },
      candidate_entry_zone: { lower: 1990, upper: 1998 },
      provisional_invalidation: { level: 1990, condition: 'confirmed close below 1990' },
      candidate_tp1: 2040, candidate_tp2: 2060, candidate_rr: 5, blocking_conditions: [],
    };
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, plan, primaryBars: PRIMARY_BARS });
    const rectangles = intents.filter((i) => i.primitive === 'rectangle' && i.point.price === 1990 && i.point2.price === 1998);
    assert.equal(rectangles.length, 1, 'the same real zone must never be drawn as two overlapping rectangles');
    assert.ok(rectangles[0].text.includes('CANDIDATE ENTRY') || rectangles[0].text.includes('DEMAND'));
  });
});

describe('Zone Market Map: Pre-Entry plan blocked-state visualization', () => {
  it('a blocked plan with a known direction shows a short "BUY WATCH • BLOCKED" label, full reason in the diagnostic', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    const plan = {
      status: 'PLAN', direction: 'BULLISH', opportunity_state: 'CONFIRMATION_PENDING',
      zone: { type: 'support', lower: 1995, upper: 1995, source: 'levels.js nearestSupport/nearestResistance', zone_state: 'FRESH' },
      candidate_entry_zone: { lower: 1995, upper: 1995 },
      provisional_invalidation: { level: 1990, condition: 'confirmed close below 1990' },
      candidate_tp1: 2040, candidate_tp2: 2060, candidate_rr: 5, blocking_conditions: ['CORRECTION_ACTIVE'],
    };
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, plan });
    assert.equal(findLabelText(intents, 'plan_candidate_zone'), 'BUY WATCH • BLOCKED');
    assert.ok(candidates.find((c) => c.role === 'plan_candidate_zone').diagnostic.includes('BUY PLAN — BLOCKED (CORRECTION_ACTIVE)'));
  });

  it('a SELL-direction blocked plan shows a short "SELL WATCH • BLOCKED" label, full reason in the diagnostic', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    const plan = {
      status: 'PLAN', direction: 'BEARISH', opportunity_state: 'CONFIRMATION_PENDING',
      zone: { type: 'resistance', lower: 2035, upper: 2035, source: 'levels.js nearestSupport/nearestResistance', zone_state: 'FRESH' },
      candidate_entry_zone: { lower: 2035, upper: 2035 },
      provisional_invalidation: { level: 2040, condition: 'confirmed close above 2040' },
      candidate_tp1: 1990, candidate_tp2: 1970, candidate_rr: 5, blocking_conditions: ['CORRECTION_ACTIVE'],
    };
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, plan });
    assert.equal(findLabelText(intents, 'plan_candidate_zone'), 'SELL WATCH • BLOCKED');
    assert.ok(candidates.find((c) => c.role === 'plan_candidate_zone').diagnostic.includes('SELL PLAN — BLOCKED (CORRECTION_ACTIVE)'));
  });

  it('an unblocked plan shows the opportunity_state instead, never "BLOCKED", on-chart or in the diagnostic', () => {
    const decision = baseDecision({ reason: 'RR_NOT_ACCEPTABLE' });
    const plan = {
      status: 'PLAN', direction: 'BULLISH', opportunity_state: 'ARMED',
      zone: { type: 'support', lower: 1995, upper: 1995, source: 'levels.js nearestSupport/nearestResistance', zone_state: 'FRESH' },
      candidate_entry_zone: { lower: 1995, upper: 1995 },
      provisional_invalidation: { level: 1990, condition: 'confirmed close below 1990' },
      candidate_tp1: 2040, candidate_tp2: 2060, candidate_rr: 5, blocking_conditions: [],
    };
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, plan });
    const zoneLabel = findLabelText(intents, 'plan_candidate_zone');
    assert.equal(zoneLabel, 'BUY WATCH • CONFIRMATION');
    assert.ok(!zoneLabel.includes('BLOCKED'));
    const diagnostic = candidates.find((c) => c.role === 'plan_candidate_zone').diagnostic;
    assert.ok(diagnostic.includes('CANDIDATE ENTRY — ARMED'));
    assert.ok(!diagnostic.includes('BLOCKED'));
  });
});

describe('Zone Market Map: label lanes -- deterministic separation, analytical price never moved', () => {
  it('two text-primitive labels landing within the ATR collision epsilon are separated into distinct lanes', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    // Contrived: force two DIFFERENT text intents to land close together by
    // using anticipation with a scenario anchored near currentPrice, plus a
    // real alternate scenario anchored at a nearby-but-different price.
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
      volatilityContext: { atrValue: 10, state: 'NORMAL' },
      // rangeHigh/rangeLow deliberately null here -- isolates label-lane
      // behavior from the (separately tested) range/equilibrium feature,
      // whose midpoint could otherwise coincidentally land on 2018-2022.
      structure: { state: 'BULLISH', lastEvent: null, lastSwingHigh: { price: 2022, label: 'HH' }, lastSwingLow: { price: 2018, label: 'HL' }, pivots: [], rangeHigh: null, rangeLow: null },
    });
    const anticipation = {
      state: 'DEVELOPING', direction: 'BULLISH', developing_strategy_family: 'trend_continuation', timeframe: TF,
      authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY',
      primary_scenario: { direction: 'BULLISH', strategy_family: 'trend_continuation', state: 'DEVELOPING', location: null, invalidation: null },
      alternate_scenario: { direction: 'BEARISH', strategy_family: 'reversal', state: 'DEVELOPING', location: { price: 2021 }, invalidation: null },
      no_trade_neutral: null,
    };
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, anticipation });
    const primary = intents.find((i) => i.role === 'primary_scenario');
    const alternate = intents.find((i) => i.role === 'alternate_scenario');
    assert.ok(primary && alternate);
    // Both anchor near 2020/2021 (well within 0.35*ATR=3.5 of each other) --
    // after lane separation they must no longer collide.
    assert.ok(Math.abs(primary.point.price - alternate.point.price) >= 0.35 * 10 - 0.01);
  });

  it('label-lane separation never alters a coincident rectangle/line\'s own point/point2', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 1994 } },
      volatilityContext: { atrValue: 5, state: 'NORMAL' },
      levelsContext: { levels: [], nearestSupport: { price: 1990.2, touch_count: 1, fresh: true }, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const demand = findIntent(intents, 'active_demand');
    // Even though other labels may have been offset, the zone's own real
    // analytical boundaries are always exactly zone_low/zone_high.
    assert.equal(demand.point.price, 1990);
    assert.equal(demand.point2.price, 1998);
  });

  it('repeated identical analysis produces IDENTICAL label placement (deterministic, no drift)', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ sessionContext: { current: { session: 'LONDON', last_close: 2020 } }, volatilityContext: { atrValue: 10, state: 'NORMAL' } });
    const anticipation = {
      state: 'DEVELOPING', direction: 'BULLISH', developing_strategy_family: 'trend_continuation', timeframe: TF,
      authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY',
      primary_scenario: { direction: 'BULLISH', strategy_family: 'trend_continuation', state: 'DEVELOPING', location: null, invalidation: null },
      alternate_scenario: { direction: 'BEARISH', strategy_family: 'reversal', state: 'DEVELOPING', location: { price: 2021 }, invalidation: null },
      no_trade_neutral: null,
    };
    const first = buildMarketVisualizationIntents({ decision, evidence, anticipation }).intents;
    const second = buildMarketVisualizationIntents({ decision, evidence, anticipation }).intents;
    assert.deepEqual(first, second);
  });
});

describe('Zone Market Map: BUY/SELL symmetry', () => {
  it('demand (bullish-context) and supply (bearish-context) zones use the SAME rendering logic, mirrored', () => {
    const decisionBuy = baseDecision();
    const decisionSell = baseDecision();
    const demandEvidence = baseEvidence({ sessionContext: { current: { last_close: 1994 } }, levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] } });
    const supplyEvidence = baseEvidence({ sessionContext: { current: { last_close: 2030 } }, levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'supply', zone_low: 2025, zone_high: 2035, state: 'FRESH' }] } });
    const demandIntents = buildMarketVisualizationIntents({ decision: decisionBuy, evidence: demandEvidence, primaryBars: PRIMARY_BARS }).intents;
    const supplyIntents = buildMarketVisualizationIntents({ decision: decisionSell, evidence: supplyEvidence, primaryBars: PRIMARY_BARS }).intents;
    const demand = findIntent(demandIntents, 'active_demand');
    const supply = findIntent(supplyIntents, 'active_supply');
    assert.equal(demand.primitive, 'rectangle');
    assert.equal(supply.primitive, 'rectangle');
    assert.notEqual(demand.overrides.linecolor, supply.overrides.linecolor); // visually distinct
    assert.ok(demand.text.startsWith('CURRENT DEMAND'));
    assert.ok(supply.text.startsWith('CURRENT SUPPLY'));
  });
});

describe('Zone Market Map: safety -- repeated reconciliation of a rectangle produces zero churn', () => {
  it('the same zone across two identical calls produces an IDENTICAL intent signature', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
    });
    const first = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const second = buildMarketVisualizationIntents({ decision, evidence, primaryBars: PRIMARY_BARS });
    const sigA = computeIntentSignature(findIntent(first.intents, 'active_demand'));
    const sigB = computeIntentSignature(findIntent(second.intents, 'active_demand'));
    assert.equal(sigA, sigB);
  });

  it('a full visualizeMarketAnalysis() run twice against the SAME analysis is entirely KEEP even with a real supply/demand zone present', async () => {
    // Signals-only chart mode (presentation-only): the zone rectangle itself
    // is never drawn to TradingView on a bare WAIT (see
    // buildSignalOnlyIntents()) -- it is still fully computed internally
    // (asserted below via `mapping.candidates`, with a stable signature
    // across both calls, proving the underlying zone geometry itself is
    // churn-free). To exercise an end-to-end zero-churn reconciliation this
    // fixture also carries a genuine primary opportunity (matching the
    // demand zone's own BULLISH direction), which IS drawn as the single
    // concise signal_watch marker.
    const analysis = {
      status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', symbol: 'OANDA:XAUUSD',
      setup: null, entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
      timeframes: { [TF]: { last_confirmed_bar_time: NOW } }, market_data_times: { [TF]: NOW },
      diagnostics: { source_timeframe: TF },
      evidence: baseEvidence({
        sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
        levelsContext: { levels: [], nearestSupport: null, nearestResistance: null, supplyDemandZones: [{ origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' }] },
      }),
      confluence: null,
      anticipation: {
        state: 'CONFIRMATION_PENDING', direction: 'BULLISH', developing_strategy_family: 'trend_continuation', timeframe: TF, authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY',
        primary_scenario: { direction: 'BULLISH', strategy_family: 'trend_continuation', state: 'CONFIRMATION_PENDING', timeframe: TF, location: { type: 'breakout_level', price: 2005 }, trigger_requirements: [], confirmation_requirements: [], invalidation: { level: 1985, condition: 'x' }, supporting_evidence: [], opposing_evidence: [], distance_to_trigger: null, target_room: null, potential_rr_feasibility: 'UNKNOWN', late_overextension_risk: 'NONE' },
        alternate_scenario: null, no_trade_neutral: null,
      },
      primary_confirmed_bars: PRIMARY_BARS,
    };

    let registry = { schema_version: 1, entries: {} };
    let nextId = 1;
    const _deps = {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: Object.keys(registry.entries).length, shapes: Object.values(registry.entries).map((e) => ({ id: e.entity_id, name: e.primitive })) }),
      drawShape: async () => ({ success: true, entity_id: `e_${nextId++}` }),
      removeOne: async ({ entity_id }) => ({ success: true, entity_id, removed: true }),
      now: () => new Date('2025-01-01T00:00:00.000Z'),
      // Hermetic -- never touches the REAL validation/mcp_engine_signals.json.
      loadSignalStore: () => ({ signals: [] }),
      signalStorePath: 'unused-in-test',
    };

    const first = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps });
    assert.equal(first.visualization.failed, 0);
    assert.ok(first.visualization.created > 0);
    assert.ok(first.visualization.active_roles.includes('status_box'));
    // The zone rectangle is a useful analytical drawing (clean chart
    // presentation keeps it) -- both fully computed AND actually drawn.
    assert.ok(first.visualization.active_roles.includes('active_demand'));
    const zoneCandidate = first.mapping.candidates.find((c) => c.role === 'active_demand');
    assert.equal(zoneCandidate.included, true);
    assert.equal(zoneCandidate.intent.primitive, 'rectangle');
    const zoneSignatureFirst = computeIntentSignature(zoneCandidate.intent);

    const second = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps });
    assert.equal(second.visualization.created, 0, 'no unnecessary remove+recreate churn for the drawn signal marker or zone rectangle');
    assert.equal(second.visualization.removed_registered, 0);
    assert.equal(second.visualization.kept, first.visualization.created);
    // The zone rectangle's own signature is unchanged across calls too.
    const zoneCandidateSecond = second.mapping.candidates.find((c) => c.role === 'active_demand');
    assert.equal(computeIntentSignature(zoneCandidateSecond.intent), zoneSignatureFirst);
  });
});

describe('Zone Market Map: clutter budget still respected with rectangles present', () => {
  it('never exceeds CLUTTER_BUDGET.MAX_TOTAL even with Supply, Demand, and a candidate zone all present', () => {
    const decision = baseDecision({ reason: 'RR_NOT_ACCEPTABLE' });
    const evidence = baseEvidence({
      sessionContext: { current: { session: 'LONDON', last_close: 2010 } },
      levelsContext: {
        levels: [], nearestSupport: { price: 1995, touch_count: 2, fresh: true }, nearestResistance: { price: 2040, touch_count: 2, fresh: true },
        supplyDemandZones: [
          { origin_bar_index: ORIGIN_INDEX, direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH' },
          { origin_bar_index: ORIGIN_INDEX - 10, direction: 'supply', zone_low: 2025, zone_high: 2035, state: 'FRESH' },
        ],
      },
      liquidityContext: { equalHighs: [{ price: 2045, touch_count: 2, indices: [] }], equalLows: [], sweepReclaim: { swept: false } },
      breakoutState: { state: 'BREAKOUT_RETEST_PENDING', evidence: { direction: 'BULLISH' } },
      structure: { ...baseEvidence().structure, lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 5, level: 2010 } },
    });
    const plan = {
      status: 'PLAN', direction: 'BULLISH', opportunity_state: 'DEVELOPING',
      zone: { type: 'support', lower: 1995, upper: 1995, source: 'levels.js nearestSupport/nearestResistance', zone_state: 'FRESH' },
      candidate_entry_zone: { lower: 1995, upper: 1995 },
      provisional_invalidation: { level: 1990, condition: 'confirmed close below 1990' },
      candidate_tp1: 2040, candidate_tp2: 2060, candidate_rr: 5, blocking_conditions: ['RR_NOT_ACCEPTABLE'],
    };
    const { intents, summary } = buildMarketVisualizationIntents({ decision, evidence, plan, primaryBars: PRIMARY_BARS });
    // MAX_TOTAL bounds distinct information groups (a line/rectangle + its
    // own decoupled label counts as one) -- see engine_market_visualization.test.js.
    assert.ok(summary.total_included <= CLUTTER_BUDGET.MAX_TOTAL, `expected <= ${CLUTTER_BUDGET.MAX_TOTAL} groups, got ${summary.total_included}`);
    assert.ok(intents.length <= CLUTTER_BUDGET.MAX_TOTAL * 2, `expected <= ${CLUTTER_BUDGET.MAX_TOTAL * 2} raw draw calls, got ${intents.length}`);
  });
});

describe('Zone Market Map: range/equilibrium (optional, low priority)', () => {
  it('draws RANGE HIGH/LOW/EQUILIBRIUM from the objective structure range when present', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ structure: { ...baseEvidence().structure, rangeHigh: 2100, rangeLow: 1900 } });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence });
    const high = findIntent(intents, 'range_high');
    const low = findIntent(intents, 'range_low');
    assert.ok(high);
    assert.ok(low);
    assert.equal(high.point.price, 2100);
    assert.equal(low.point.price, 1900);
    // Equilibrium (2000) genuinely coincides with structure's own lastSwingLow
    // (also 2000 in this fixture) -- the coincident-level merge may legitimately
    // fold it into structure_primary's label rather than a separate role.
    assert.ok(intents.some((i) => i.text?.includes('EQUILIBRIUM')));
  });

  it('never fabricates a range when structure has no objective rangeHigh/rangeLow', () => {
    const decision = baseDecision();
    const evidence = baseEvidence({ structure: { ...baseEvidence().structure, rangeHigh: null, rangeLow: null } });
    const { intents, candidates } = buildMarketVisualizationIntents({ decision, evidence });
    assert.equal(findIntent(intents, 'range_high'), undefined);
    assert.equal(findCandidate(candidates, 'range_high').reason_excluded, 'NO_OBJECTIVE_RANGE');
  });
});
