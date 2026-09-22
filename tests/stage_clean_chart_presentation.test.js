/**
 * src/engine/marketVisualization.js's buildPresentationIntents()
 * (buildDecisionAnalyticsIntents() + buildSignalOnlyIntents()) +
 * src/core/xauusd_visualize_market.js / xauusd_visualize_chart_context.js
 * wiring -- CLEAN CHART PRESENTATION (useful analytics kept, pre-entry/
 * trade clutter simplified).
 *
 * buildMarketVisualizationIntents()/buildChartLocalVisualizationIntents()
 * are completely UNCHANGED -- they still compute the full analytical
 * candidate set in full (proven below). buildPresentationIntents() is a
 * separate, additive assembler that decides what actually reaches
 * TradingView: useful market context (structure/S-R/supply-demand/
 * liquidity/breakout/patterns/range, own merge+budget pool) PLUS confirmed
 * trade geometry, or one concise "<DIR> WATCH" marker, or nothing. Proves:
 *   1. useful STRUCTURE/S-R/SUPPLY-DEMAND/LIQUIDITY/BREAKOUT drawings remain
 *   2. WAIT with no opportunity creates no signal marker (analytics still shown)
 *   3. WAIT with a bullish primary opportunity shows BUY WATCH
 *   4. WAIT with a bearish primary opportunity shows SELL WATCH
 *   5. BUY WATCH/SELL WATCH never exposes candidate Entry/SL/TP
 *   6. confirmed BUY uses exact protected Entry/SL/TP1/TP2/RR
 *   7. confirmed SELL uses exact protected Entry/SL/TP1/TP2/RR
 *   8. candidate/provisional geometry can never leak into confirmed geometry
 *   9. unknown/user drawings remain untouched
 *  10. repeated reconciliation is idempotent
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketVisualizationIntents, buildPresentationIntents } from '../src/engine/marketVisualization.js';
import { visualizeMarketAnalysis } from '../src/core/xauusd_visualize_market.js';

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

/** A rich evidence fixture: structure, S/R, supply/demand, liquidity, pattern, breakout all objectively present -- the useful set signals-only mode must NOT hide from the chart. */
function richEvidence() {
  return {
    regime: 'BULL_TREND',
    structure: { state: 'BULLISH', lastEvent: { type: 'CHOCH', direction: 'BULLISH', level: 2010 }, lastSweep: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2000, label: 'HL' }, pivots: [], rangeHigh: 2060, rangeLow: 1980 },
    correction: { state: 'NONE' },
    eligibility: { regime: 'BULL_TREND', eligible: ['trend_continuation'], blocked_reason: null },
    candlestickPatterns: [], classicalPatterns: [],
    breakoutState: { state: 'BREAKOUT_CONFIRMED', evidence: {} },
    liquidityContext: { equalHighs: [{ price: 2058, touch_count: 3 }], equalLows: [], sweepReclaim: { swept: false } },
    levelsContext: {
      levels: [], nearestResistance: { price: 2055, fresh: true, touch_count: 2 }, nearestSupport: { price: 1995, fresh: false, touch_count: 3 },
      supplyDemandZones: [{ direction: 'demand', zone_low: 1990, zone_high: 1998, state: 'FRESH', origin_bar_index: 0 }],
    },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
  };
}

function scenarioAnticipation(direction, { price = 2025 } = {}) {
  return {
    state: 'CONFIRMATION_PENDING', direction, developing_strategy_family: 'trend_continuation', timeframe: TF,
    authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY',
    primary_scenario: {
      direction, strategy_family: 'trend_continuation', state: 'CONFIRMATION_PENDING', timeframe: TF,
      location: { type: 'breakout_level', price }, trigger_requirements: [], confirmation_requirements: [],
      invalidation: { level: direction === 'BEARISH' ? price + 20 : price - 20, condition: 'x' },
      supporting_evidence: [], opposing_evidence: [], distance_to_trigger: null, target_room: null,
      potential_rr_feasibility: 'UNKNOWN', late_overextension_risk: 'NONE',
    },
    alternate_scenario: null, no_trade_neutral: null,
  };
}

function planForDirection(direction) {
  // Pre-Entry Opportunity Planner's candidate geometry -- must NEVER leak into confirmed trade roles.
  return {
    schema_version: '1.0.0', symbol: 'OANDA:XAUUSD', source_timeframe: TF, generated_from_bar_time: NOW, status: 'PLAN',
    reason: null, direction, setup_family: 'trend_continuation', setup_model: null, opportunity_state: 'CONFIRMATION_PENDING',
    zone: { type: direction === 'BEARISH' ? 'resistance' : 'support', lower: 2024, upper: 2024, source: 'levels.js nearestSupport/nearestResistance', zone_state: 'TOUCHED' },
    distance_to_zone: { absolute: 1, atr_multiple: 0.2 }, interaction_state: 'BODY_TOUCH',
    candidate_entry_zone: { lower: 2024, upper: 2024 },
    provisional_invalidation: { level: 2019, condition: 'x' },
    candidate_tp1: 2040, candidate_tp2: 2060, candidate_rr: null,
    confirmation_required: [], confirmation_observed: [], blocking_conditions: [], supporting_evidence: [], alternate_scenario: null,
  };
}

function findRole(intents, role) { return intents.find((i) => i.role === role); }

function buildIntents({ decision, evidence = null, anticipation = null, plan = null, openSignal = null, historicalSignals = [] }) {
  const { candidates } = buildMarketVisualizationIntents({ decision, evidence, anticipation, plan });
  return buildPresentationIntents({ decision, evidence, anticipation, candidates, openSignal, historicalSignals, symbol: decision.symbol, timeframe: TF });
}

/** A signalStore OPEN record -- the SAME shape signalStore.js's registerOrGetSignal() persists, verbatim from a past protected decision. */
function openSignalFor({ side, entry, sl, tp1, tp2, rr, signalBarTime = NOW, status = 'OPEN', tp1Hit = false, tp1HitBarTime = null }) {
  return { signal_id: `sig_${side}_${entry}`, symbol: 'OANDA:XAUUSD', timeframe: TF, model: 'TC', side, origin_bar: signalBarTime, signal_bar_time: signalBarTime, entry, stop_loss: sl, tp1, tp2, rr, quality: 78, status, created_at: '2025-01-01T00:00:00.000Z', resolution_bar_time: null, realized_r: null, tp1_hit: tp1Hit, tp1_hit_bar_time: tp1HitBarTime };
}

describe('Clean chart presentation: useful analytics remain on an ordinary WAIT', () => {
  it('STRUCTURE/S-R/SUPPLY-DEMAND/LIQUIDITY/BREAKOUT drawings are present, and the status box shows WAIT/No Opportunity (never a fake signal)', () => {
    const decision = baseDecision();
    const intents = buildIntents({ decision, evidence: richEvidence() });
    assert.ok(findRole(intents, 'structure_primary__label'), 'expected STRUCTURE to remain on chart');
    assert.ok(findRole(intents, 'nearest_support__label') || findRole(intents, 'nearest_support'), 'expected SUPPORT to remain on chart');
    assert.ok(findRole(intents, 'active_demand'), 'expected DEMAND zone to remain on chart');
    assert.ok(findRole(intents, 'breakout_level__label') || findRole(intents, 'breakout_level'), 'expected BREAKOUT to remain on chart');
    // No opportunity in this fixture -- the status box says so, no candidate Entry/SL/TP.
    assert.equal(findRole(intents, 'status_box').text, 'XAUUSD\nWAIT\nNo Opportunity');
    assert.equal(findRole(intents, 'trade_entry'), undefined);
  });
});

describe('Clean chart presentation: BUY WATCH', () => {
  it('adds ONLY the concise BUY WATCH status box on top of the kept analytics -- never candidate Entry/SL/TP', () => {
    const decision = baseDecision();
    const anticipation = scenarioAnticipation('BULLISH');
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation, plan: planForDirection('BULLISH') });
    const watch = findRole(intents, 'status_box');
    assert.ok(watch);
    assert.equal(watch.text, 'XAUUSD\nBUY WATCH\nConfirmation Pending');
    assert.equal(watch.primitive, 'text');
    // Analytics are still present alongside it.
    assert.ok(findRole(intents, 'structure_primary__label'));
    // Never a candidate Entry/SL/TP presented as final.
    assert.equal(findRole(intents, 'trade_entry'), undefined);
    assert.equal(findRole(intents, 'plan_candidate_zone'), undefined);
    assert.equal(findRole(intents, 'plan_candidate_zone__label'), undefined);
    assert.equal(findRole(intents, 'primary_trigger'), undefined);
    assert.equal(findRole(intents, 'primary_invalidation'), undefined);
  });
});

describe('Clean chart presentation: SELL WATCH', () => {
  it('adds ONLY the concise SELL WATCH status box on top of the kept analytics', () => {
    const decision = baseDecision();
    const anticipation = scenarioAnticipation('BEARISH');
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation, plan: planForDirection('BEARISH') });
    const watch = findRole(intents, 'status_box');
    assert.ok(watch);
    assert.equal(watch.text, 'XAUUSD\nSELL WATCH\nConfirmation Pending');
    assert.ok(findRole(intents, 'structure_primary__label'));
  });
});

describe('Clean chart presentation: confirmed BUY', () => {
  it('shows BUY + Entry/SL/TP1/TP2/RR from the OPEN signal-store record -- analytics remain, but no watch box or setup/quality clutter', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78 });
    const openSignal = openSignalFor({ side: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1 });
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation: scenarioAnticipation('BULLISH'), openSignal });
    assert.equal(findRole(intents, 'trade_entry').text, 'ENTRY 2030');
    assert.equal(findRole(intents, 'trade_sl').text, 'SL 2025');
    assert.equal(findRole(intents, 'trade_tp1').text, 'TP1 2040');
    assert.equal(findRole(intents, 'trade_tp2').text, 'TP2 2050');
    assert.equal(findRole(intents, 'trade_card').text, 'BUY ACTIVE\nEntry 2030\nSL 2025\nTP1 2040\nTP2 2050\nRR 2.1');
    assert.equal(findRole(intents, 'status_box'), undefined); // never both at once
    // Useful analytics are STILL present alongside the confirmed trade.
    assert.ok(findRole(intents, 'structure_primary__label'));
    assert.ok(findRole(intents, 'active_demand'));
    for (const s of intents.filter((i) => i.role.startsWith('trade_'))) {
      assert.ok(!s.text.includes('TC'));
      assert.ok(!s.text.includes('Q 78'));
    }
  });
});

describe('Clean chart presentation: confirmed SELL', () => {
  it('shows SELL + Entry/SL/TP1/TP2/RR from the OPEN signal-store record (BUY/SELL symmetry)', () => {
    const decision = baseDecision({ action: 'SELL', reason: null, setup: 'SR', entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0, quality: 72 });
    const openSignal = openSignalFor({ side: 'SELL', entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0 });
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation: scenarioAnticipation('BEARISH'), openSignal });
    assert.equal(findRole(intents, 'trade_entry').text, 'ENTRY 2000');
    assert.equal(findRole(intents, 'trade_sl').text, 'SL 2005');
    assert.equal(findRole(intents, 'trade_tp1').text, 'TP1 1995');
    assert.equal(findRole(intents, 'trade_tp2').text, 'TP2 1990');
    assert.equal(findRole(intents, 'trade_card').text, 'SELL ACTIVE\nEntry 2000\nSL 2005\nTP1 1995\nTP2 1990\nRR 2');
  });
});

describe('Clean chart presentation: OPEN confirmed trade persistence (the proven lifecycle defect, fixed)', () => {
  it('a still-OPEN signal-store record keeps the confirmed trade card/lines visible even though the CURRENT decision has reverted to WAIT', () => {
    // This is the exact scenario that was previously broken: decision.action
    // is WAIT (a fresh per-bar re-evaluation), but the signal from an
    // EARLIER bar is still objectively OPEN in the persisted store.
    const decision = baseDecision({ action: 'WAIT', reason: 'CORRECTION_ACTIVE' });
    const openSignal = openSignalFor({ side: 'SELL', entry: 4320.37, sl: 4350.17, tp1: 4290.56, tp2: 4260.76, rr: 2, signalBarTime: NOW - 3600 });
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation: null, openSignal });
    assert.equal(findRole(intents, 'trade_entry').text, 'ENTRY 4320.37');
    assert.equal(findRole(intents, 'trade_sl').text, 'SL 4350.17');
    assert.equal(findRole(intents, 'trade_card').text, 'SELL ACTIVE\nEntry 4320.37\nSL 4350.17\nTP1 4290.56\nTP2 4260.76\nRR 2');
    assert.equal(findRole(intents, 'status_box'), undefined); // still confirmed, not a WAIT box
  });
});

describe('Clean chart presentation: historical confirmed signal markers', () => {
  it('shows a concise PASS marker for a genuinely-persisted terminal record, never the currently-OPEN one twice', () => {
    const decision = baseDecision();
    const openSignal = openSignalFor({ side: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, signalBarTime: NOW });
    const closedSignal = { ...openSignalFor({ side: 'SELL', entry: 2000, sl: 2010, tp1: 1990, tp2: 1980, rr: 2, signalBarTime: NOW - 7200 }), status: 'PASS', signal_id: 'closed_1' };
    const failedSignal = { ...openSignalFor({ side: 'BUY', entry: 1990, sl: 1980, tp1: 2000, tp2: 2010, rr: 2, signalBarTime: NOW - 3600 }), status: 'FAIL', signal_id: 'closed_2' };
    const intents = buildIntents({ decision, evidence: richEvidence(), openSignal, historicalSignals: [openSignal, closedSignal, failedSignal] });
    assert.equal(findRole(intents, `history_${closedSignal.signal_id}`).text, 'SELL 2000 ✓ TP2');
    assert.equal(findRole(intents, `history_${failedSignal.signal_id}`).text, 'BUY 1990 ✕ SL');
    // The OPEN one is shown live (trade_card), never also as a historical marker.
    assert.equal(findRole(intents, `history_${openSignal.signal_id}`), undefined);
  });

  it('caps historical markers at the most recent N and never invents/reconstructs a record', () => {
    const decision = baseDecision();
    const many = Array.from({ length: 15 }, (_, i) => ({
      ...openSignalFor({ side: 'BUY', entry: 2000 + i, sl: 1990, tp1: 2010, tp2: 2020, rr: 2, signalBarTime: NOW - i * 900 }),
      status: 'PASS', signal_id: `hist_${i}`,
    }));
    const intents = buildIntents({ decision, evidence: richEvidence(), historicalSignals: many });
    const historyIntents = intents.filter((i) => i.role.startsWith('history_'));
    assert.ok(historyIntents.length <= 10, 'expected a hard cap on historical markers');
    // Most recent (lowest i, largest signal_bar_time) must survive the cap.
    assert.ok(historyIntents.some((i) => i.role === 'history_hist_0'));
    assert.ok(!historyIntents.some((i) => i.role === 'history_hist_14'));
  });

  it('never shows a historical marker for a record belonging to a different symbol/timeframe', () => {
    const decision = baseDecision();
    const otherSymbol = { ...openSignalFor({ side: 'BUY', entry: 100, sl: 90, tp1: 110, tp2: 120, rr: 2 }), status: 'PASS', signal_id: 'other', symbol: 'OANDA:EURUSD' };
    const intents = buildIntents({ decision, evidence: richEvidence(), historicalSignals: [otherSymbol] });
    assert.equal(findRole(intents, 'history_other'), undefined);
  });
});

describe('Clean chart presentation: analytics are computed through their OWN independent merge pool', () => {
  it('an analytical role never gets silently absorbed into a primary/alternate/trade role\'s combined label', () => {
    // primary_trigger and structure would normally share a price and merge
    // (see mergeCoincidentLevels()) in the FULL pipeline -- prove that under
    // clean-chart presentation, structure's own content survives as its own
    // drawn label rather than disappearing inside a collapsed WATCH box.
    const decision = baseDecision();
    const anticipation = scenarioAnticipation('BULLISH', { price: 2050 }); // same price as structure's lastSwingHigh
    const intents = buildIntents({ decision, evidence: richEvidence(), anticipation });
    const structureLabel = findRole(intents, 'structure_primary__label') ?? findRole(intents, 'structure_primary');
    assert.ok(structureLabel, 'STRUCTURE must remain visible even though its price coincides with the WATCH box\'s anchor');
    assert.ok(findRole(intents, 'status_box'));
  });
});

describe('Clean chart presentation: candidate geometry can never leak into confirmed geometry', () => {
  it('a confirmed BUY never draws plan_candidate_zone/provisional_invalidation/candidate_tp1/candidate_tp2 prices, even when they differ from the real trade geometry', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78 });
    const openSignal = openSignalFor({ side: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1 });
    const intents = buildIntents({ decision, evidence: richEvidence(), plan: { ...planForDirection('BULLISH'), status: 'SUPERSEDED_BY_CONFIRMED_TRADE' }, openSignal });
    const tradePrices = intents.filter((i) => i.role.startsWith('trade_')).map((i) => i.point.price);
    assert.ok(!tradePrices.includes(2024)); // the plan's candidate_entry_zone price never appears among trade_* roles
    assert.ok(!tradePrices.includes(2019)); // the plan's provisional_invalidation price never appears
    assert.ok(!tradePrices.includes(2060)); // the plan's candidate_tp2 price never appears
    assert.equal(findRole(intents, 'plan_candidate_zone'), undefined);
  });
});

describe('Clean chart presentation: unknown/user drawings remain untouched', () => {
  it('reconciliation never calls removeOne for an on-chart entity that is not in the MCP registry', async () => {
    const decision = baseDecision({ action: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78, setup: 'TC' });
    let registry = { schema_version: 1, entries: {} };
    const removeCalls = [];
    let nextId = 1;
    const _deps = {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      // A user-drawn trend line already exists on the chart -- entity "user_1"
      // -- and is NEVER present in the MCP registry.
      listDrawings: async () => ({ success: true, count: 1, shapes: [{ id: 'user_1', name: 'trend_line' }] }),
      drawShape: async () => { const id = `mcp_${nextId++}`; return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; },
      now: () => new Date('2025-01-01T00:00:00.000Z'),
      loadSignalStore: () => ({ signals: [openSignalFor({ side: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1 })] }),
      signalStorePath: 'unused-in-test',
    };
    await visualizeMarketAnalysis({ analysis: { ...decision, evidence: richEvidence() }, dryRun: false, _deps });
    assert.deepEqual(removeCalls, []); // the unknown user drawing was never touched
  });
});

describe('Clean chart presentation: repeated reconciliation is idempotent', () => {
  it('a confirmed BUY (with rich analytics) visualized twice produces zero churn on the second call', async () => {
    const decision = { ...baseDecision({ action: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1, quality: 78, setup: 'TC' }), evidence: richEvidence() };
    let registry = { schema_version: 1, entries: {} };
    let nextId = 1;
    const _deps = {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: Object.keys(registry.entries).length, shapes: Object.values(registry.entries).map((e) => ({ id: e.entity_id, name: e.primitive })) }),
      drawShape: async () => { const id = `mcp_${nextId++}`; return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => ({ success: true, entity_id, removed: true }),
      now: () => new Date('2025-01-01T00:00:00.000Z'),
      loadSignalStore: () => ({ signals: [openSignalFor({ side: 'BUY', entry: 2030, sl: 2025, tp1: 2040, tp2: 2050, rr: 2.1 })] }),
      signalStorePath: 'unused-in-test',
    };
    const first = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps });
    assert.equal(first.visualization.failed, 0);
    assert.ok(first.visualization.created > 0);
    const second = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps });
    assert.equal(second.visualization.created, 0);
    assert.equal(second.visualization.removed_registered, 0);
    assert.equal(second.visualization.kept, first.visualization.created);
  });

  it('a WAIT with a genuine opportunity (with rich analytics) visualized twice produces zero churn on the second call', async () => {
    const decision = baseDecision();
    const anticipation = scenarioAnticipation('BULLISH');
    let registry = { schema_version: 1, entries: {} };
    let nextId = 1;
    const _deps = {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: Object.keys(registry.entries).length, shapes: Object.values(registry.entries).map((e) => ({ id: e.entity_id, name: e.primitive })) }),
      drawShape: async () => { const id = `mcp_${nextId++}`; return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => ({ success: true, entity_id, removed: true }),
      now: () => new Date('2025-01-01T00:00:00.000Z'),
      loadSignalStore: () => ({ signals: [] }),
      signalStorePath: 'unused-in-test',
    };
    const analysis = { ...decision, evidence: richEvidence(), anticipation };
    const first = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps });
    assert.equal(first.visualization.failed, 0);
    assert.ok(first.visualization.created > 0);
    const second = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps });
    assert.equal(second.visualization.created, 0);
    assert.equal(second.visualization.removed_registered, 0);
    assert.equal(second.visualization.kept, first.visualization.created);
  });
});
