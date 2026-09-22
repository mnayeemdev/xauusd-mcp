/**
 * src/engine/marketVisualization.js -- Pre-Entry Opportunity Planner
 * visualization (mission Section 33-34). Proves:
 *   - a WAIT with an objective plan draws a CANDIDATE ENTRY ZONE and a
 *     PROVISIONAL INVALIDATION, both clearly labeled, never confusable
 *     with confirmed trade geometry (trade_entry/trade_sl)
 *   - nothing is drawn when the plan is NO_PLAN or SUPERSEDED_BY_CONFIRMED_TRADE
 *   - a zero-width (point-precision) zone never fabricates a range in the label
 *   - the total intent count still respects the clutter budget
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketVisualizationIntents, CLUTTER_BUDGET } from '../src/engine/marketVisualization.js';

const TF = '15m';
const NOW = 1700000000;

function baseDecision(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE',
    symbol: 'OANDA:XAUUSD', timeframes: { [TF]: { last_confirmed_bar_time: NOW } }, setup: null,
    entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
    market_data_times: { [TF]: NOW },
    diagnostics: { source_timeframe: TF, conflict: null, quality_breakdown: null, htf_conflict: null },
    engine_disagreement: null,
    ...overrides,
  };
}

function planFixture(overrides = {}) {
  return {
    status: 'PLAN', direction: 'BEARISH', source_timeframe: TF, opportunity_state: 'DEVELOPING',
    zone: { type: 'supply_zone', lower: 4378, upper: 4386 },
    candidate_entry_zone: { lower: 4378, upper: 4386 },
    provisional_invalidation: { level: 4386, condition: 'confirmed close above 4386' },
    candidate_tp1: 4340, candidate_tp2: 4300, candidate_rr: 4.75,
    ...overrides,
  };
}

function findIntent(intents, role) { return intents.find((i) => i.role === role); }
/** plan_candidate_zone/plan_provisional_invalidation are `horizontal_line`s in the no-primaryBars (fallback) path used throughout this file, so their label is decoupled into a separate `<role>__label` text companion -- see marketVisualization.js's splitLineLabels(). */
function findLabelText(intents, role) { return findIntent(intents, `${role}__label`)?.text ?? null; }

describe('marketVisualization: Pre-Entry Opportunity Planner candidates', () => {
  it('draws a short SELL WATCH candidate zone and INVALIDATION label for an objective plan, with full detail preserved as diagnostic', () => {
    const { intents, candidates } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture() });
    const zoneIntent = findIntent(intents, 'plan_candidate_zone');
    const zoneLabel = findLabelText(intents, 'plan_candidate_zone');
    const invIntent = findIntent(intents, 'plan_provisional_invalidation');
    const invLabel = findLabelText(intents, 'plan_provisional_invalidation');
    assert.ok(zoneIntent);
    // Short chart label: direction + lifecycle word only -- numeric zone
    // bounds are deliberately omitted (the line's own price already shows
    // them) and DEVELOPING is the "nothing more specific yet" bare state.
    assert.equal(zoneLabel, 'SELL WATCH');
    const zoneCandidate = candidates.find((c) => c.role === 'plan_candidate_zone');
    assert.ok(zoneCandidate.diagnostic.includes('CANDIDATE ENTRY'));
    assert.ok(zoneCandidate.diagnostic.includes('4378'));
    assert.ok(zoneCandidate.diagnostic.includes('4386'));
    assert.ok(invIntent);
    assert.equal(invLabel, 'INVALIDATION');
    const invCandidate = candidates.find((c) => c.role === 'plan_provisional_invalidation');
    assert.equal(invCandidate.diagnostic, 'PROVISIONAL INVALIDATION (not SL)');
    assert.equal(invIntent.point.price, 4386);
  });

  it('never uses "ENTRY"/"SL" as a bare label -- structurally distinct from confirmed trade geometry', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture() });
    for (const i of intents) {
      assert.notEqual(i.text, 'ENTRY');
      assert.notEqual(i.text, 'SL');
    }
  });

  it('draws nothing for the plan when status is NO_PLAN', () => {
    const { candidates } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: { status: 'NO_PLAN', reason: 'NO_OBJECTIVE_ZONE_AVAILABLE' } });
    const zoneCandidate = candidates.find((c) => c.role === 'plan_candidate_zone');
    assert.equal(zoneCandidate.included, false);
    assert.equal(zoneCandidate.reason_excluded, 'NO_OBJECTIVE_PLAN');
  });

  it('draws nothing for the plan when the decision is already confirmed (SUPERSEDED_BY_CONFIRMED_TRADE)', () => {
    const decision = baseDecision({ action: 'SELL', entry: 4356, sl: 4370, tp1: 4340, tp2: 4300, rr: 2, quality: 80, setup: 'PB' });
    const { candidates, intents } = buildMarketVisualizationIntents({ decision, plan: { status: 'SUPERSEDED_BY_CONFIRMED_TRADE', direction: 'BEARISH', opportunity_state: 'CONFIRMED' } });
    const zoneCandidate = candidates.find((c) => c.role === 'plan_candidate_zone');
    assert.equal(zoneCandidate.included, false);
    assert.equal(zoneCandidate.reason_excluded, 'DECISION_CONFIRMED_NO_PRE_ENTRY_SCENARIO');
    // The confirmed trade's own geometry is what's drawn instead.
    assert.ok(findIntent(intents, 'trade_entry'));
  });

  it('draws nothing when plan is omitted entirely (backward compatible, never throws)', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision() });
    assert.equal(findIntent(intents, 'plan_candidate_zone'), undefined);
  });

  it('a zero-width (point-precision) zone never fabricates a range, on-chart or in the diagnostic', () => {
    const { intents, candidates } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture({ candidate_entry_zone: { lower: 4370, upper: 4370 } }) });
    assert.equal(findLabelText(intents, 'plan_candidate_zone'), 'SELL WATCH');
    const diagnostic = candidates.find((c) => c.role === 'plan_candidate_zone').diagnostic;
    assert.equal(diagnostic, 'CANDIDATE ENTRY — DEVELOPING 4370');
  });

  it('BULLISH direction anchors the zone line at the near (upper) edge', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture({ direction: 'BULLISH', zone: { type: 'demand_zone', lower: 4330, upper: 4338 }, candidate_entry_zone: { lower: 4330, upper: 4338 } }) });
    const zoneIntent = findIntent(intents, 'plan_candidate_zone');
    assert.equal(zoneIntent.point.price, 4338);
  });

  it('the total kept intent count never exceeds the clutter budget', () => {
    const { intents, summary } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture() });
    // MAX_TOTAL bounds distinct information groups (a line + its own
    // decoupled label counts as one) -- see engine_market_visualization.test.js.
    assert.ok(summary.total_included <= CLUTTER_BUDGET.MAX_TOTAL);
    assert.ok(intents.length <= CLUTTER_BUDGET.MAX_TOTAL * 2);
  });

  it('every emitted intent (including the new plan roles) is schema-valid', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), plan: planFixture() });
    for (const i of intents) {
      assert.ok(i.role);
      assert.ok(i.primitive);
      assert.ok(Number.isFinite(i.point.time));
      assert.ok(Number.isFinite(i.point.price));
    }
  });
});
