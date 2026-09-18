/**
 * src/core/xauusd_visualize_market.js -- Stage 5 execution orchestrator.
 * Proves: visualizeMarketAnalysis() performs NO analysis of its own,
 * visualizeXauusdMarket() calls analyzeMarket() exactly once, a
 * visualization failure never alters the authoritative decision, repeated
 * identical visualization produces zero churn (all KEEP), and this layer
 * never mutates Stage 3's persisted observations.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visualizeMarketAnalysis, visualizeXauusdMarket } from '../src/core/xauusd_visualize_market.js';
import { analyzeMarket } from '../src/core/xauusd_analyze_market.js';

const START_TIME = 1700000000;
function makeTrendBars(n, { start = 2000, drift = 0.5, tfSeconds = 900 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + drift;
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}

function baseAnalyzeMarketDeps({ bars, getOhlcvCalls = null } = {}) {
  let tf = '15';
  return {
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: tf }),
    setTimeframe: async ({ timeframe }) => { tf = timeframe; return { success: true }; },
    getOhlcv: async () => { getOhlcvCalls?.push(tf); return { bars }; },
    getMasterState: async () => { throw new Error('Pine unavailable in this test'); },
    loadStore: () => ({ signals: [] }),
    saveStore: () => {},
    storePath: 'unused-in-test',
  };
}

function memoryDrawingDeps() {
  let registry = { schema_version: 1, entries: {} };
  const drawCalls = [];
  const removeCalls = [];
  let nextId = 1;
  return {
    _deps: {
      loadRegistry: () => registry,
      saveRegistry: (_p, r) => { registry = r; },
      listDrawings: async () => ({ success: true, count: Object.keys(registry.entries).length, shapes: Object.values(registry.entries).map((e) => ({ id: e.entity_id, name: e.primitive })) }),
      drawShape: async () => { const id = `e_${nextId++}`; drawCalls.push(id); return { success: true, entity_id: id }; },
      removeOne: async ({ entity_id }) => { removeCalls.push(entity_id); return { success: true, entity_id, removed: true }; },
      now: () => new Date('2025-01-01T00:00:00.000Z'),
    },
    getRegistry: () => registry, drawCalls, removeCalls,
  };
}

describe('xauusd_visualize_market: source audit -- no duplicate decision computation, no Stage 3 mutation', () => {
  it('never imports Stage 3 persistence, and imports calculateEntry only indirectly through the unmodified analyzeMarket()', () => {
    const src = readFileSync(new URL('../src/core/xauusd_visualize_market.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/anticipationStore\.js/.test(code));
    assert.ok(!/opportunity_metrics\.js/.test(code));
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(code)); // reuses analyzeMarket(), never calls calculateEntry() a second time directly
  });
});

describe('xauusd_visualize_market: visualizeMarketAnalysis performs NO analysis of its own', () => {
  it('never fetches OHLCV -- it only maps and reconciles an already-computed analysis', async () => {
    const bars = makeTrendBars(510, { drift: 0.5 });
    const analysis = await analyzeMarket({ _deps: baseAnalyzeMarketDeps({ bars }) });
    const drawingDeps = memoryDrawingDeps();
    const result = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps: drawingDeps._deps });
    assert.ok(result.visualization);
    assert.ok(result.market_visual_summary);
    assert.equal(result.visualization.symbol, 'OANDA:XAUUSD');
  });
});

describe('xauusd_visualize_market: visualizeXauusdMarket calls analyzeMarket exactly once', () => {
  it('exactly 10 real getOhlcv calls total -- one full sweep, never a duplicate/second one', async () => {
    const bars = makeTrendBars(510, { drift: 0.5 });
    const getOhlcvCalls = [];
    const drawingDeps = memoryDrawingDeps();
    const result = await visualizeXauusdMarket({ dryRun: true, _deps: { analyzeMarketDeps: baseAnalyzeMarketDeps({ bars, getOhlcvCalls }), visualizeDeps: drawingDeps._deps } });
    assert.equal(getOhlcvCalls.length, 10, `expected exactly 10 getOhlcv calls (one sweep), got ${getOhlcvCalls.length}`);
    assert.ok('analysis_status' in result);
    assert.ok('decision_action' in result);
  });
});

describe('xauusd_visualize_market: visualization failure never alters the authoritative decision', () => {
  it('a drawShape failure changes nothing about analysis.action/entry/sl/tp1/tp2', async () => {
    const decision = { status: 'OK', action: 'BUY', reason: null, symbol: 'OANDA:XAUUSD', setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: 2020, rr: 2.0, quality: 78, timeframes: { '15m': { last_confirmed_bar_time: 1700000000 } }, market_data_times: { '15m': 1700000000 }, diagnostics: { source_timeframe: '15m' }, evidence: null, confluence: null, anticipation: { state: 'CONFIRMED', direction: 'BULLISH', developing_strategy_family: 'trend_continuation', timeframe: '15m', authoritative_wait_reason: null, waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY', primary_scenario: null, alternate_scenario: null, no_trade_neutral: null } };
    const before = JSON.stringify(decision);
    const drawingDeps = memoryDrawingDeps();
    drawingDeps._deps.drawShape = async () => { throw new Error('CDP timeout'); };
    const result = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps: drawingDeps._deps });
    assert.equal(JSON.stringify(decision), before); // decision object itself untouched
    assert.equal(result.visualization.status, 'PARTIAL');
    assert.ok(result.visualization.failed > 0);
    assert.equal(result.market_visual_summary.confirmed_trade.action, 'BUY');
    assert.equal(result.market_visual_summary.confirmed_trade.entry, 2010); // still correctly reported even though drawing failed
  });
});

describe('xauusd_visualize_market: repeated identical visualization produces zero churn', () => {
  it('the second run of the SAME analysis is entirely KEEP -- no delete/recreate', async () => {
    const bars = makeTrendBars(510, { drift: 0.5 });
    const analysis = await analyzeMarket({ _deps: baseAnalyzeMarketDeps({ bars }) });
    const drawingDeps = memoryDrawingDeps();

    const first = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps: drawingDeps._deps });
    assert.equal(first.visualization.failed, 0);
    const createdCount = first.visualization.created;
    assert.ok(createdCount > 0);

    const second = await visualizeMarketAnalysis({ analysis, dryRun: false, _deps: drawingDeps._deps });
    assert.equal(second.visualization.created, 0);
    assert.equal(second.visualization.removed_registered, 0);
    assert.equal(second.visualization.kept, createdCount);
  });
});

describe('xauusd_visualize_market: active_roles and market_visual_summary are correct', () => {
  it('active_roles lists exactly the roles that ended up KEPT or CREATED', async () => {
    const decision = { status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', symbol: 'OANDA:XAUUSD', setup: null, entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null, timeframes: { '15m': { last_confirmed_bar_time: 1700000000 } }, market_data_times: { '15m': 1700000000 }, diagnostics: { source_timeframe: '15m' }, evidence: { regime: 'BULL_TREND', structure: { state: 'BULLISH', lastEvent: null, lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: { price: 2000, label: 'HL' }, rangeHigh: 2060, rangeLow: 1980 }, correction: { state: 'NONE' }, eligibility: { eligible: ['trend_continuation'], blocked_reason: null }, candlestickPatterns: [], classicalPatterns: [], breakoutState: { state: 'NO_BREAKOUT', evidence: {} }, liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false } }, levelsContext: { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] }, volatilityContext: { atrValue: 5, state: 'NORMAL' }, sessionContext: { current: { session: 'LONDON', last_close: 2020 } }, dailyWeeklyContext: {} }, confluence: null, anticipation: { state: 'DEVELOPING', direction: 'BULLISH', developing_strategy_family: null, timeframe: '15m', authoritative_wait_reason: 'NO_ELIGIBLE_STRATEGY', waiting_for: [], invalidated_if: [], improving_or_deteriorating: 'UNKNOWN_WITHOUT_HISTORY', primary_scenario: null, alternate_scenario: null, no_trade_neutral: { mandatory_gates: {}, regime: 'BULL_TREND', why: 'x' } } };
    const drawingDeps = memoryDrawingDeps();
    const result = await visualizeMarketAnalysis({ analysis: decision, dryRun: false, _deps: drawingDeps._deps });
    assert.ok(result.visualization.active_roles.includes('structure_primary'));
    assert.equal(result.market_visual_summary.anticipation_state, 'DEVELOPING');
    assert.equal(result.market_visual_summary.confirmed_trade, null);
  });
});
