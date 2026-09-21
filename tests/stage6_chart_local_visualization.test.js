/**
 * Stage 6, Part 7-15 -- buildChartLocalVisualizationIntents() in
 * src/engine/marketVisualization.js. Proves:
 *   - every emitted role is prefixed with CHART_LOCAL_ROLE_PREFIX ('chart_'),
 *     so it can never collide with a decision-TF role in the same
 *     (symbol, timeframe) registry scope even when active chart TF ===
 *     decision TF
 *   - trade/primary/alternate categories are NEVER produced (no decision,
 *     no anticipation -- those are decision-timeframe-only concepts)
 *   - every emitted intent uses the SAME (symbol, timeframe) the caller
 *     passed in -- never a fabricated or decision-TF value
 *   - no objective anchor time -> empty result, never a fabricated one
 *   - every emitted intent is schema-valid
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChartLocalVisualizationIntents, CHART_LOCAL_ROLE_PREFIX } from '../src/engine/marketVisualization.js';
import { validateDrawingIntent } from '../src/engine/visualization.js';

const TF = '1H';
const NOW = 1700000000;

function baseEvidence(overrides = {}) {
  return {
    regime: 'BULL_TREND',
    structure: {
      state: 'BULLISH', lastEvent: { type: 'CHOCH', direction: 'BULLISH', level: 2010 }, lastSweep: null,
      lastSwingHigh: { price: 2050, label: 'HH', index: 90 },
      lastSwingLow: { price: 2000, label: 'HL', index: 80 },
      pivots: [], rangeHigh: 2060, rangeLow: 1980,
    },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: ['trend_continuation'], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'NO_BREAKOUT', evidence: {} },
    liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } },
    levelsContext: {
      levels: [],
      nearestResistance: { price: 2055, fresh: true, touch_count: 2 },
      nearestSupport: { price: 1995, fresh: false, touch_count: 3 },
      supplyDemandZones: [],
    },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
    ...overrides,
  };
}

describe('marketVisualization: buildChartLocalVisualizationIntents() -- Stage 6 active-chart-TF-local mapping', () => {
  it('every emitted role is prefixed with chart_, never a bare decision-TF-style role', () => {
    const { intents, candidates } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    assert.ok(intents.length > 0, 'expected at least one intent from this rich fixture');
    for (const i of intents) assert.ok(i.role.startsWith(CHART_LOCAL_ROLE_PREFIX), `role "${i.role}" must start with "${CHART_LOCAL_ROLE_PREFIX}"`);
    for (const c of candidates) assert.ok(c.role.startsWith(CHART_LOCAL_ROLE_PREFIX));
  });

  it('never emits a trade/primary/alternate category -- those are decision-timeframe-only concepts', () => {
    const { candidates } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    for (const c of candidates) assert.ok(!['trade', 'primary', 'alternate'].includes(c.category), `category "${c.category}" must never appear in chart-local output`);
  });

  it('every emitted intent carries the EXACT (symbol, timeframe) the caller passed in', () => {
    const { intents } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    for (const i of intents) {
      assert.equal(i.symbol, 'OANDA:XAUUSD');
      assert.equal(i.timeframe, TF);
    }
  });

  it('a DIFFERENT active chart timeframe than the decision TF produces intents scoped to that different timeframe', () => {
    const { intents } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: '4H', time: NOW });
    for (const i of intents) assert.equal(i.timeframe, '4H');
  });

  it('the SAME timeframe as a hypothetical decision TF (15m) still only ever emits chart_-prefixed roles -- no bare "structure_primary"/"nearest_support" role appears', () => {
    const { intents } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: '15m', time: NOW });
    const bareRoles = ['structure_primary', 'nearest_support', 'nearest_resistance', 'active_demand', 'active_supply', 'liquidity_primary', 'pattern_primary', 'breakout_level'];
    for (const i of intents) assert.ok(!bareRoles.includes(i.role), `unprefixed role "${i.role}" would collide with a decision-TF role at the same (symbol, timeframe)`);
  });

  it('no objective anchor time available -> empty result, never a fabricated one', () => {
    const result = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: TF, time: null });
    assert.deepEqual(result.intents, []);
    assert.equal(result.summary.reason, 'NO_OBJECTIVE_ANCHOR_TIME_AVAILABLE');
  });

  it('missing symbol/timeframe also produces an empty, non-throwing result', () => {
    const result = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: null, timeframe: TF, time: NOW });
    assert.deepEqual(result.intents, []);
  });

  it('null/absent evidence never throws, just yields fewer/no intents', () => {
    const result = buildChartLocalVisualizationIntents({ evidence: null, symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    assert.deepEqual(result.intents, []);
  });

  it('every emitted intent is schema-valid', () => {
    const { intents } = buildChartLocalVisualizationIntents({ evidence: baseEvidence(), symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    for (const i of intents) assert.equal(validateDrawingIntent(i).valid, true, JSON.stringify(validateDrawingIntent(i).errors));
  });

  it('respects the same clutter budget as decision-TF visualization -- never an unbounded dump', () => {
    // A structure with both a lastSwingLow/High AND a lastEvent AND resistance/support AND a breakout AND liquidity all present.
    const richEvidence = baseEvidence({
      breakoutState: { state: 'BREAKOUT_CONFIRMED', evidence: {} },
      liquidityContext: { equalHighs: [{ price: 2070, touch_count: 3 }], equalLows: [], sweepReclaim: { swept: false } },
      classicalPatterns: [{ pattern_id: 'p1', pattern_type: 'DOUBLE_TOP', completion_state: 'CONFIRMED', end_time: NOW, breakout_level: 2040, pivot_points: [] }],
    });
    const { intents } = buildChartLocalVisualizationIntents({ evidence: richEvidence, symbol: 'OANDA:XAUUSD', timeframe: TF, time: NOW });
    assert.ok(intents.length <= 12);
  });
});
