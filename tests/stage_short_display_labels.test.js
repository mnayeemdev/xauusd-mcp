/**
 * src/engine/marketVisualization.js -- SHORT CHART LABELS + diagnostic
 * preservation (final visual-polish upgrade). The dense-cluster and
 * label-lane fixes (stage_label_readability.test.js, stage_zone_market_map
 * .test.js) solved VERTICAL collision; this upgrade solves the remaining
 * HORIZONTAL problem -- labels that ran through candles/other information
 * because they were built from full diagnostic sentences. Proves:
 *   - every on-chart `intent.text` is a short, presentation-only label,
 *     never a long diagnostic sentence
 *   - every on-chart label stays within the DISPLAY_LABEL_MAX_LENGTH budget
 *   - a dense same-price merge of many roles drops the lowest-priority
 *     tail whole-item(s) rather than truncating mid-word or leaving a
 *     dangling separator
 *   - nothing is silently destroyed: every dropped item's full diagnostic
 *     sentence survives in the `candidates[].diagnostic` audit trail
 *   - the underlying analytical prices are byte-identical to before
 *   - BUY/SELL symmetry holds for the new short vocabulary
 *   - confirmed trade geometry (ENTRY/SL/TP1/TP2/status) is completely
 *     unaffected -- it was already short and stays exactly as protected
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketVisualizationIntents } from '../src/engine/marketVisualization.js';

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

/**
 * A deliberately extreme fixture: SEVEN independent, genuinely distinct
 * roles (active_demand, primary_trigger, nearest_support,
 * nearest_resistance, structure_primary, range_equilibrium,
 * primary_scenario) all resolve to the EXACT same price (2030) -- forcing
 * mergeCoincidentLevels() to combine far more content than fits inside
 * DISPLAY_LABEL_MAX_LENGTH, which is exactly the failure mode this upgrade
 * targets (dense real confluence, not a contrived edge case).
 */
function denseMergeEvidence() {
  return {
    regime: 'BULL_TREND',
    structure: { state: 'BULLISH', lastEvent: null, lastSweep: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2030, label: 'HL' }, pivots: [], rangeHigh: 2040, rangeLow: 2020 },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: [], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'NO_BREAKOUT', evidence: {} },
    liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } },
    levelsContext: {
      levels: [],
      nearestSupport: { price: 2030, touch_count: 3, fresh: true },
      nearestResistance: { price: 2030, touch_count: 3, fresh: true },
      supplyDemandZones: [{ origin_bar_index: 1, direction: 'demand', zone_low: 2030, zone_high: 2035, state: 'FRESH' }],
    },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
  };
}

function denseMergeAnticipation(direction = 'BULLISH') {
  return {
    state: 'DEVELOPING', direction, developing_strategy_family: 'trend_continuation', timeframe: TF,
    authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY',
    primary_scenario: { direction, strategy_family: 'trend_continuation', state: 'DEVELOPING', location: { price: 2030 }, invalidation: null },
    alternate_scenario: null,
    no_trade_neutral: null,
  };
}

function findIntent(intents, role) { return intents.find((i) => i.role === role); }
function textPrimitivesAndLabels(intents) { return intents.filter((i) => i.text); }
/** A merged horizontal_line's own combined text is always decoupled into an independently-positionable `<role>__label` companion (see splitLineLabels(), which now runs AFTER mergeCoincidentLevels() precisely so a merged label gets this treatment too). */
function findLabelText(intents, role) { return findIntent(intents, `${role}__label`)?.text ?? null; }

describe('Short display labels: no long diagnostic sentence ever reaches the chart', () => {
  it('none of the verbose diagnostic phrases these roles used to render appear anywhere in intents[].text', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() });
    const allText = intents.map((i) => i.text).filter(Boolean).join(' | ');
    for (const longPhrase of [
      'demand zone 2030', 'TRIGGER (conditional)', 'SUPPORT (fresh)', 'RESISTANCE (fresh)',
      'BULLISH TREND_CONTINUATION', 'WAIT — DEVELOPING (NO_ELIGIBLE_STRATEGY)',
    ]) {
      assert.ok(!allText.includes(longPhrase), `long diagnostic phrase "${longPhrase}" must never reach the chart, found in: "${allText}"`);
    }
  });

  it('every non-empty intent.text stays within the short display-label budget', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() });
    for (const t of textPrimitivesAndLabels(intents)) {
      assert.ok(t.text.length <= 60, `label for role ${t.role} exceeds the short display budget: "${t.text}" (${t.text.length} chars)`);
    }
  });
});

describe('Short display labels: dense same-price merge drops whole tail items, never truncates mid-word', () => {
  it('the combined label is a clean, whole-item concatenation with no dangling separator', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() });
    // The merged horizontal_line's own text is null -- the combined label is
    // decoupled into its own independently lane-positionable __label
    // companion, exactly like any single-role line (mergeCoincidentLevels()
    // now runs BEFORE splitLineLabels(), see marketVisualization.js).
    const merged = findIntent(intents, 'active_demand');
    assert.ok(merged);
    assert.equal(merged.text, null);
    const label = findLabelText(intents, 'active_demand');
    assert.equal(label, 'DEMAND — FRESH • TRIGGER • SUPPORT x3 • RESISTANCE x3');
    assert.ok(!/[•]\s*$/.test(label), 'must not end with a dangling separator');
    assert.ok(!/^\s*[•]/.test(label), 'must not start with a dangling separator');
    const KNOWN_WHOLE_LABELS = new Set(['DEMAND — FRESH', 'BUY WATCH', 'TRIGGER', 'SUPPORT x3', 'RESISTANCE x3', 'STRUCTURE HL', 'EQUILIBRIUM']);
    for (const token of label.split(' • ')) {
      assert.ok(KNOWN_WHOLE_LABELS.has(token), `token "${token}" is not a known complete label -- looks truncated`);
    }
    // The budget genuinely bound here -- fewer tokens survived than were offered.
    assert.ok(label.split(' • ').length < 7);
  });

  it('every item dropped from the chart text is fully preserved in the diagnostic audit trail', () => {
    const { candidates } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() });
    const winner = candidates.find((c) => c.included && c.role === 'active_demand');
    assert.ok(winner);
    for (const fullPhrase of [
      'demand zone 2030-2035 (FRESH)', 'TRIGGER (conditional) — DEVELOPING', 'SUPPORT (fresh) x3',
      'RESISTANCE (fresh) x3', 'STRUCTURE HL', 'EQUILIBRIUM', 'BULLISH TREND_CONTINUATION',
    ]) {
      assert.ok(winner.diagnostic.includes(fullPhrase), `diagnostic audit trail must still contain "${fullPhrase}"`);
    }
    // Also verify each individually-excluded candidate keeps its OWN full diagnostic, not just the winner's combined one.
    const structure = candidates.find((c) => c.role === 'structure_primary' && !c.included);
    assert.equal(structure.diagnostic, 'STRUCTURE HL');
    const equilibrium = candidates.find((c) => c.role === 'range_equilibrium' && !c.included);
    assert.equal(equilibrium.diagnostic, 'EQUILIBRIUM');
  });

  it('is deterministic -- repeated calls with identical input produce an identical combined label', () => {
    const first = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() }).intents;
    const second = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() }).intents;
    assert.deepEqual(first, second);
  });

  it('the underlying analytical prices are byte-identical to the raw evidence, regardless of the label text redesign', () => {
    const { intents } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation() });
    assert.equal(findIntent(intents, 'active_demand').point.price, 2030); // zone_low, exact
    assert.equal(findIntent(intents, 'range_high').point.price, 2040); // structure.rangeHigh, exact
    assert.equal(findIntent(intents, 'range_low').point.price, 2020); // structure.rangeLow, exact
  });
});

describe('Short display labels: BUY/SELL symmetry under the same dense-merge mechanics', () => {
  it('a mirrored bearish fixture produces the same merge/drop behavior (the direction-bearing item is not part of THIS particular merge group)', () => {
    const { intents, candidates } = buildMarketVisualizationIntents({ decision: baseDecision(), evidence: denseMergeEvidence(), anticipation: denseMergeAnticipation('BEARISH') });
    const label = findLabelText(intents, 'active_demand');
    assert.equal(label, 'DEMAND — FRESH • TRIGGER • SUPPORT x3 • RESISTANCE x3');
    assert.ok(label.length <= 60);
    // The direction itself is symmetric where it actually renders: primary_scenario's own diagnostic/short label.
    const scenarioCandidate = candidates.find((c) => c.role === 'primary_scenario');
    assert.equal(scenarioCandidate.intent.text, 'SELL WATCH');
  });
});

describe('Short display labels: confirmed trade geometry is completely unaffected', () => {
  it('a confirmed BUY keeps its exact protected ENTRY/SL/TP1/TP2/status text, never shortened or merged', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78 });
    const { intents } = buildMarketVisualizationIntents({ decision, evidence: denseMergeEvidence() });
    assert.equal(findIntent(intents, 'trade_entry').text, 'ENTRY 2030');
    assert.equal(findIntent(intents, 'trade_sl').text, 'SL 2025');
    assert.equal(findIntent(intents, 'trade_tp1').text, 'TP1 2040');
    assert.equal(findIntent(intents, 'trade_tp2').text, 'TP2 2050');
    const status = findIntent(intents, 'trade_status');
    assert.ok(status.text.includes('Q 78'));
    assert.ok(!status.text.includes('|'));
  });
});
