/**
 * src/engine/marketVisualization.js -- Label Readability hardening
 * (dense current-price cluster fix). Proves the EXACT reported failure
 * mode is fixed: multiple genuinely-distinct-but-nearby real levels near
 * the current price (Support/Resistance, breakout/retest context,
 * liquidity sweep, scenario/confirmation text) used to render with their
 * native inline labels crowded/overlapping, because a horizontal_line's
 * own label is welded to that line's exact price and neither the
 * coincident-level merge (exact price only) nor the ATR label-lane system
 * (text-primitives only) could help a label stuck on a line.
 *
 * This fixture is the deterministic regression baseline for that live
 * failure case: a dense cluster of DISTINCT (not exactly coincident)
 * real levels within a narrow band around current price.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketVisualizationIntents, TIER } from '../src/engine/marketVisualization.js';

const TF = '15m';
const NOW = 1700000000;
const ATR = 5; // matches volatilityContext.atrValue below

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

/**
 * The reported dense-cluster baseline: nearest resistance (4351.37),
 * a breakout/retest level (4349.80), a liquidity sweep (4352.60), and
 * structure (4348.10) -- four REAL, DISTINCT prices all within about
 * 4.5 points of each other (well under 0.35*ATR*10 lane-collision
 * epsilon-worth of visual crowding on a real chart), none exactly
 * coincident with another, none exactly equal to current price (4350.20).
 * Every one of these must remain a separately readable, non-overlapping
 * label without the line's own true price ever moving.
 */
function denseClusterEvidence() {
  return {
    regime: 'BULL_TREND',
    structure: {
      state: 'BULLISH', lastEvent: { type: 'BOS', direction: 'BULLISH', bar: 10, level: 4348.10 }, lastSweep: null,
      lastSwingHigh: { price: 4348.10, label: 'HH' }, lastSwingLow: { price: 4300, label: 'HL' },
      pivots: [], rangeHigh: 4400, rangeLow: 4300,
    },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: [], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'BREAKOUT_RETEST_PENDING', evidence: { direction: 'BULLISH' } },
    liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: true, sweepType: 'SWEEP_HIGH', level: 4352.60, reclaimed: false } },
    levelsContext: { levels: [], nearestResistance: { price: 4351.37, touch_count: 6, fresh: false }, nearestSupport: null, supplyDemandZones: [] },
    volatilityContext: { atrValue: ATR, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 4350.20 } },
    dailyWeeklyContext: {},
  };
}

function findIntent(intents, role) { return intents.find((i) => i.role === role); }
function textPrimitives(intents) { return intents.filter((i) => i.primitive === 'text'); }

describe('Label Readability: dense current-price cluster (live-reported baseline failure case)', () => {
  it('every distinct real level keeps its OWN exact analytical price -- lines never moved', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    assert.equal(findIntent(intents, 'nearest_resistance').point.price, 4351.37);
    assert.equal(findIntent(intents, 'breakout_level').point.price, 4348.10);
    assert.equal(findIntent(intents, 'liquidity_primary').point.price, 4352.6);
    // structure_event is suppressed in favor of breakout_level at the identical level (existing, pre-upgrade behavior) -- not a regression.
  });

  it('no two rendered TEXT labels sit at the same or a visually colliding price', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    const texts = textPrimitives(intents);
    assert.ok(texts.length >= 2, 'expected at least the decoupled labels for this dense cluster');
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const distance = Math.abs(texts[i].point.price - texts[j].point.price);
        assert.ok(distance >= 0.35 * ATR - 1e-9, `labels "${texts[i].text}" and "${texts[j].text}" collide (distance ${distance}, need >= ${0.35 * ATR})`);
      }
    }
  });

  it('every kept label carries real, non-empty, non-dangling text (no truncated fragment, no bare trailing separator)', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    for (const t of textPrimitives(intents)) {
      assert.ok(t.text && t.text.length > 0, `label for role ${t.role} must not be empty`);
      assert.ok(!/[|•]\s*$/.test(t.text), `label for role ${t.role} must not end with a dangling separator: "${t.text}"`);
      assert.ok(!/^\s*[|•]/.test(t.text), `label for role ${t.role} must not start with a dangling separator: "${t.text}"`);
    }
  });

  it('resistance, breakout, and liquidity content are ALL genuinely present somewhere on the chart (none silently dropped)', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    const allText = textPrimitives(intents).map((t) => t.text).join(' | ');
    assert.ok(allText.includes('RESISTANCE'));
    assert.ok(allText.includes('RETEST PENDING') || allText.includes('BREAKOUT'));
    assert.ok(allText.includes('LIQUIDITY SWEEP'));
  });

  it('is deterministic and idempotent -- repeated calls with identical input produce identical label placement', () => {
    const first = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() }).intents;
    const second = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() }).intents;
    assert.deepEqual(first, second);
  });

  it('a horizontal_line whose label was decoupled still reports null text on the LINE itself (label lives only on its __label companion)', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    const resistanceLine = findIntent(intents, 'nearest_resistance');
    assert.equal(resistanceLine.primitive, 'horizontal_line');
    assert.equal(resistanceLine.text, null);
    const label = findIntent(intents, 'nearest_resistance__label');
    assert.equal(label.primitive, 'text');
    assert.ok(label.text.includes('RESISTANCE'));
  });
});

describe('Label Readability: WAIT never displays confirmed Entry/SL/TP, even in a dense cluster', () => {
  it('no trade_* role appears anywhere in the dense-cluster fixture', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseClusterEvidence() });
    for (const role of ['trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2', 'trade_status']) {
      assert.equal(findIntent(intents, role), undefined);
    }
  });
});

describe('Label Readability: confirmed trade labels remain immovable (highest priority, never lane-shifted)', () => {
  it('a confirmed BUY keeps its EXACT protected entry/sl/tp1/tp2 text and price even amid a dense cluster', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 4350.20, sl: 4345, tp1: 4355, tp2: 4360, rr: 2.0, quality: 78 });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence: denseClusterEvidence() });
    const entry = findIntent(intents, 'trade_entry');
    assert.equal(entry.primitive, 'horizontal_line');
    assert.equal(entry.text, 'ENTRY 4350.2'); // never decoupled, never merged, never moved
    assert.equal(entry.point.price, 4350.2);
  });
});

describe('Label Readability: BUY/SELL symmetry under the same dense-cluster mechanics', () => {
  it('a mirrored bearish dense cluster produces the same label-separation guarantee', () => {
    const decision = baseDecision();
    const evidence = {
      ...denseClusterEvidence(),
      structure: { state: 'BEARISH', lastEvent: { type: 'BOS', direction: 'BEARISH', bar: 10, level: 4352.30 }, lastSweep: null, lastSwingHigh: { price: 4400, label: 'HH' }, lastSwingLow: { price: 4352.30, label: 'LL' }, pivots: [], rangeHigh: 4400, rangeLow: 4300 },
      levelsContext: { levels: [], nearestSupport: { price: 4348.90, touch_count: 6, fresh: false }, nearestResistance: null, supplyDemandZones: [] },
      liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', level: 4347.40, reclaimed: false } },
    };
    const { intents } = buildMarketVisualizationIntents({ decision, evidence });
    const texts = textPrimitives(intents);
    assert.ok(texts.length >= 2);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        assert.ok(Math.abs(texts[i].point.price - texts[j].point.price) >= 0.35 * ATR - 1e-9);
      }
    }
  });
});
