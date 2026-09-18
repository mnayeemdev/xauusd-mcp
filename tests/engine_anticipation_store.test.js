/**
 * src/engine/anticipationStore.js -- Stage 3 persistence/observability.
 * Proves: safe load/save (including malformed input), atomic writes,
 * stable setup identity, deterministic dedup, transition detection,
 * historical invalidation only from objective evidence, the explicit
 * improving/deteriorating semantics table, model-coverage classification,
 * verbatim WAIT-reason capture, and that no CDP/TradingView call is ever
 * made from this module.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadStore, saveStore, appendLogLine, loadObservationLog,
  computeSetupId, resolveStructuralAnchorPrice, classifyProgression,
  checkHistoricalInvalidation, classifyModelCoverage, MODEL_COVERAGE_CLASSES,
  recordAnticipationObservation, STORE_SCHEMA_VERSION,
} from '../src/engine/anticipationStore.js';
import { computeAnticipation, EVIDENCE_ONLY_FAMILIES } from '../src/engine/anticipation.js';

function baseDecision(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY',
    symbol: 'OANDA:XAUUSD', timeframes: { '15m': { last_confirmed_bar_time: 1700000000 } }, setup: null,
    diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: null },
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
    liquidityContext: { sweepReclaim: { swept: false } },
    levelsContext: { nearestResistance: null, nearestSupport: null },
    volatilityContext: { atrValue: 5, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 } },
    dailyWeeklyContext: {},
    ...overrides,
  };
}

function memoryDeps(nowIso = '2025-01-01T00:00:00.000Z') {
  let store = { schema_version: STORE_SCHEMA_VERSION, setups: {} };
  const log = [];
  return {
    _deps: {
      loadStore: () => store,
      saveStore: (_p, s) => { store = s; },
      appendLogLine: (_p, record) => { log.push(record); },
      now: () => new Date(nowIso),
    },
    getStore: () => store,
    getLog: () => log,
  };
}

describe('anticipationStore: source audit -- no CDP/TradingView call anywhere in this module', () => {
  it('never references evaluate(), getChartApi(), or connection.js', () => {
    const src = readFileSync(new URL('../src/engine/anticipationStore.js', import.meta.url), 'utf8');
    assert.ok(!/evaluate\(/.test(src));
    assert.ok(!/getChartApi/.test(src));
    assert.ok(!/from ['"].*connection\.js['"]/.test(src));
    // Structural proof, not a word-ban: this module never imports the
    // calculation engine or the chart/data core at all, so it cannot call
    // calculateEntry() or any CDP primitive regardless of what its doc
    // comments say about them.
    assert.ok(!/from ['"].*xauusd_calculate\.js['"]/.test(src));
    assert.ok(!/from ['"].*core\/(chart|data)\.js['"]/.test(src));
  });
});

describe('anticipationStore: store load/save safety', () => {
  it('missing store file initializes safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-store-'));
    try {
      const path = join(dir, 'does-not-exist.json');
      const store = loadStore(path);
      assert.deepEqual(store, { schema_version: STORE_SCHEMA_VERSION, setups: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('malformed store file fails safely to an empty store, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-store-'));
    try {
      const path = join(dir, 'corrupt.json');
      writeFileSync(path, '{ this is not valid json ][');
      const store = loadStore(path);
      assert.deepEqual(store, { schema_version: STORE_SCHEMA_VERSION, setups: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a store file that is valid JSON but the wrong shape also fails safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-store-'));
    try {
      const path = join(dir, 'wrong-shape.json');
      writeFileSync(path, JSON.stringify(['not', 'an', 'object']));
      const store = loadStore(path);
      assert.deepEqual(store, { schema_version: STORE_SCHEMA_VERSION, setups: {} });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('saveStore writes atomically -- content round-trips and no leftover .tmp file remains', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-store-'));
    try {
      const path = join(dir, 'store.json');
      saveStore(path, { setups: { abc: { setup_id: 'abc', pre_entry_state: 'DEVELOPING' } } });
      const reloaded = loadStore(path);
      assert.equal(reloaded.setups.abc.pre_entry_state, 'DEVELOPING');
      const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'));
      assert.deepEqual(leftovers, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('loadObservationLog skips a malformed/torn last line instead of throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-log-'));
    try {
      const path = join(dir, 'log.jsonl');
      writeFileSync(path, `${JSON.stringify({ a: 1 })}\n${JSON.stringify({ a: 2 })}\n{"a": 3, torn`);
      const records = loadObservationLog(path);
      assert.deepEqual(records, [{ a: 1 }, { a: 2 }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('appendLogLine + loadObservationLog round-trip multiple records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'anticipation-log-'));
    try {
      const path = join(dir, 'log.jsonl');
      appendLogLine(path, { a: 1 });
      appendLogLine(path, { a: 2 });
      assert.deepEqual(loadObservationLog(path), [{ a: 1 }, { a: 2 }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('anticipationStore: setup identity', () => {
  it('is stable across repeated calls with the same inputs', () => {
    const id1 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000.123, regime: 'BULL_TREND' });
    const id2 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000.123, regime: 'BULL_TREND' });
    assert.equal(id1, id2);
  });

  it('a different structural anchor price produces a different setup_id', () => {
    const id1 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000, regime: 'BULL_TREND' });
    const id2 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2010, regime: 'BULL_TREND' });
    assert.notEqual(id1, id2);
  });

  it('a different direction produces a different setup_id for the same anchor', () => {
    const id1 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000, regime: 'BULL_TREND' });
    const id2 = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BEARISH', structuralAnchorPrice: 2000, regime: 'BULL_TREND' });
    assert.notEqual(id1, id2);
  });

  it('quality/RR/ATR/session/wall-clock-time are never part of identity (not accepted parameters at all)', () => {
    const id = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000, regime: 'BULL_TREND', quality: 99, rr: 5, atr: 100, session: 'LONDON', observedAt: Date.now() });
    const idWithoutExtras = computeSetupId({ symbol: 'OANDA:XAUUSD', timeframe: '15m', direction: 'BULLISH', structuralAnchorPrice: 2000, regime: 'BULL_TREND' });
    assert.equal(id, idWithoutExtras);
  });

  it('resolveStructuralAnchorPrice reads the swing on the current structure-state side', () => {
    assert.equal(resolveStructuralAnchorPrice(baseEvidence()), 2000); // BULLISH -> lastSwingLow
    assert.equal(resolveStructuralAnchorPrice(baseEvidence({ structure: { ...baseEvidence().structure, state: 'BEARISH' } })), 2050); // BEARISH -> lastSwingHigh
    assert.equal(resolveStructuralAnchorPrice(baseEvidence({ structure: { state: null } })), null);
    assert.equal(resolveStructuralAnchorPrice(null), null);
  });
});

describe('anticipationStore: recordAnticipationObservation -- dedup, append, transitions', () => {
  it('records a genuinely new observation', () => {
    const { _deps, getLog } = memoryDeps();
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision, evidence, anticipation, confirmedBarTime: 1700000000, _deps });
    assert.equal(result.recorded, true);
    assert.equal(getLog().length, 1);
    assert.equal(getLog()[0].pre_entry_state, 'DEVELOPING');
    assert.equal(getLog()[0].previous_pre_entry_state, null);
    assert.equal(getLog()[0].transition, null);
  });

  it('rejects an exact duplicate observation (same setup_id + confirmed_bar_time + action/state)', () => {
    const { _deps, getLog } = memoryDeps();
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision, evidence, anticipation, confirmedBarTime: 1700000000, _deps });
    const second = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision, evidence, anticipation, confirmedBarTime: 1700000000, _deps });
    assert.equal(second.recorded, false);
    assert.equal(second.reason, 'DUPLICATE_OBSERVATION');
    assert.equal(getLog().length, 1); // not double-recorded
  });

  it('a new confirmed bar for the same setup appends a new observation and detects the transition', () => {
    const { _deps, getLog } = memoryDeps();
    const decisionDeveloping = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const anticipationDeveloping = computeAnticipation({ decision: decisionDeveloping, evidence });
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionDeveloping, evidence, anticipation: anticipationDeveloping, confirmedBarTime: 1700000000, _deps });

    // SAME symbol/timeframe/direction/structural anchor (evidence.structure unchanged) -- a later
    // confirmed bar where a TC candidate has now triggered but is HTF-blocked (ARMED).
    const decisionArmed = baseDecision({
      reason: 'HTF_CONFLICT', setup: 'TC',
      timeframes: { '15m': { last_confirmed_bar_time: 1700000900 } },
      diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } },
    });
    const anticipationArmed = computeAnticipation({ decision: decisionArmed, evidence });
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionArmed, evidence, anticipation: anticipationArmed, confirmedBarTime: 1700000900, _deps });

    assert.equal(result.recorded, true);
    assert.equal(getLog().length, 2);
    assert.equal(result.record.pre_entry_state, 'ARMED');
    assert.equal(result.record.previous_pre_entry_state, 'DEVELOPING');
    assert.equal(result.record.transition, 'DEVELOPING -> ARMED');
    assert.equal(result.record.improving_or_deteriorating, 'IMPROVING');
    // same setup_id -- identity survived the DEVELOPING -> ARMED transition
    assert.equal(getLog()[0].setup_id, getLog()[1].setup_id);

    // Now the SAME structural anchor clears its last remaining condition and
    // the protected engine reports a real BUY -- CONFIRMED. mapped_model_code
    // was null on the first observation and only became known on the second
    // (ARMED); the setup_id must still be the SAME across all three, proving
    // family/model becoming known never mints a new identity.
    const decisionConfirmed = baseDecision({
      action: 'BUY', reason: null, setup: 'TC',
      entry: 2015, sl: 2005, tp1: 2025, tp2: 2035, rr: 2.0, quality: 78,
      timeframes: { '15m': { last_confirmed_bar_time: 1700001800 } },
    });
    const anticipationConfirmed = computeAnticipation({ decision: decisionConfirmed, evidence });
    const confirmedResult = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionConfirmed, evidence, anticipation: anticipationConfirmed, confirmedBarTime: 1700001800, _deps });

    assert.equal(confirmedResult.recorded, true);
    assert.equal(getLog().length, 3);
    assert.equal(confirmedResult.record.pre_entry_state, 'CONFIRMED');
    assert.equal(confirmedResult.record.previous_pre_entry_state, 'ARMED');
    assert.equal(confirmedResult.record.transition, 'ARMED -> CONFIRMED');
    assert.equal(confirmedResult.record.improving_or_deteriorating, 'IMPROVING');
    // the FULL DEVELOPING -> ARMED -> CONFIRMED chain shares one identity
    assert.equal(getLog()[0].setup_id, getLog()[2].setup_id);
    assert.equal(getLog()[1].setup_id, getLog()[2].setup_id);
  });

  it('a completely different setup (different structural anchor) does not inherit the old setup state', () => {
    const { _deps, getLog } = memoryDeps();
    const decision1 = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence1 = baseEvidence();
    const anticipation1 = computeAnticipation({ decision: decision1, evidence: evidence1 });
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decision1, evidence: evidence1, anticipation: anticipation1, confirmedBarTime: 1700000000, _deps });

    const decision2 = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence2 = baseEvidence({ structure: { ...baseEvidence().structure, lastSwingLow: { price: 1900, label: 'HL', index: 80 } } }); // different anchor
    const anticipation2 = computeAnticipation({ decision: decision2, evidence: evidence2 });
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decision2, evidence: evidence2, anticipation: anticipation2, confirmedBarTime: 1700000000, _deps });

    assert.notEqual(result.setup_id, getLog()[0].setup_id);
    assert.equal(result.record.previous_pre_entry_state, null);
    assert.equal(result.record.transition, null);
  });

  it('WAIT reasons are preserved verbatim, including an unfamiliar/unknown reason string', () => {
    const { _deps, getLog } = memoryDeps();
    const decision = baseDecision({ reason: 'SOME_BRAND_NEW_REASON_NEVER_SEEN_BEFORE' });
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision, evidence, anticipation, confirmedBarTime: 1700000000, _deps });
    assert.equal(getLog()[0].authoritative_wait_reason, 'SOME_BRAND_NEW_REASON_NEVER_SEEN_BEFORE');
  });

  it('never calls calculateEntry or fetches OHLCV -- pure data in, fs I/O out (asserted via memory deps only)', () => {
    const { _deps, getLog } = memoryDeps();
    const decision = baseDecision();
    const evidence = baseEvidence();
    const anticipation = computeAnticipation({ decision, evidence });
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision, evidence, anticipation, confirmedBarTime: 1700000000, _deps });
    assert.equal(result.recorded, true);
    assert.equal(getLog().length, 1); // no hidden extra recordings from a phantom second sweep
  });
});

describe('anticipationStore: historical invalidation (Stage 3 additive layer)', () => {
  it('is INVALIDATED when a later confirmed close objectively violates the previously stored anchor', () => {
    const { _deps, getLog } = memoryDeps();
    // First observation: ARMED, BULLISH, invalidation anchor at the swing low (2000).
    const decisionArmed = baseDecision({
      reason: 'HTF_CONFLICT', setup: 'TC',
      diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } },
    });
    const evidence1 = baseEvidence();
    const anticipation1 = computeAnticipation({ decision: decisionArmed, evidence: evidence1 });
    assert.equal(anticipation1.state, 'ARMED');
    assert.equal(anticipation1.primary_scenario.invalidation.level, 2000);
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionArmed, evidence: evidence1, anticipation: anticipation1, confirmedBarTime: 1700000000, _deps });

    // Later confirmed bar: price has now closed BELOW 2000 -- objectively violates the stored anchor.
    // Stage 1/2 itself (stateless) would just report NO_ELIGIBLE_STRATEGY/DEVELOPING or similar for
    // this snapshot -- Stage 3's historical layer is what recognizes the violation.
    const decisionLater = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidenceLater = baseEvidence({ sessionContext: { current: { session: 'LONDON', last_close: 1995 } } });
    const anticipationLater = computeAnticipation({ decision: decisionLater, evidence: evidenceLater });
    assert.notEqual(anticipationLater.state, 'INVALIDATED'); // Stage 1/2 alone does not know this
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionLater, evidence: evidenceLater, anticipation: anticipationLater, confirmedBarTime: 1700000900, _deps });

    assert.equal(result.record.pre_entry_state, 'INVALIDATED');
    assert.equal(result.record.previous_pre_entry_state, 'ARMED');
    assert.equal(getLog().length, 2);
  });

  it('remains NOT invalidated when price has not objectively crossed the stored anchor', () => {
    const { _deps } = memoryDeps();
    const decisionArmed = baseDecision({
      reason: 'HTF_CONFLICT', setup: 'TC',
      diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } },
    });
    const evidence1 = baseEvidence();
    const anticipation1 = computeAnticipation({ decision: decisionArmed, evidence: evidence1 });
    recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionArmed, evidence: evidence1, anticipation: anticipation1, confirmedBarTime: 1700000000, _deps });

    const decisionLater = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidenceLater = baseEvidence({ sessionContext: { current: { session: 'LONDON', last_close: 2030 } } }); // still above 2000
    const anticipationLater = computeAnticipation({ decision: decisionLater, evidence: evidenceLater });
    const result = recordAnticipationObservation({ symbol: 'OANDA:XAUUSD', decision: decisionLater, evidence: evidenceLater, anticipation: anticipationLater, confirmedBarTime: 1700000900, _deps });

    assert.notEqual(result.record.pre_entry_state, 'INVALIDATED');
  });

  it('remains NOT invalidated when the current price cannot be objectively evaluated (ambiguous -> non-invalidated)', () => {
    assert.equal(checkHistoricalInvalidation({ pre_entry_state: 'ARMED', direction: 'BULLISH', invalidation_level: 2000 }, { sessionContext: { current: {} } }), false);
    assert.equal(checkHistoricalInvalidation(null, baseEvidence()), false);
    assert.equal(checkHistoricalInvalidation({ pre_entry_state: 'CONFIRMED', direction: 'BULLISH', invalidation_level: 2000 }, baseEvidence({ sessionContext: { current: { last_close: 1900 } } })), false); // terminal state, never re-checked
  });
});

describe('anticipationStore: improving/deteriorating semantics table', () => {
  it('IMPROVING: progression toward confirmation', () => {
    assert.equal(classifyProgression('DEVELOPING', 'APPROACHING_ZONE'), 'IMPROVING');
    assert.equal(classifyProgression('CONFIRMATION_PENDING', 'ARMED'), 'IMPROVING');
    assert.equal(classifyProgression('ARMED', 'CONFIRMED'), 'IMPROVING');
    assert.equal(classifyProgression('WAIT', 'DEVELOPING'), 'IMPROVING');
  });

  it('DETERIORATING: regression toward MISSED/INVALIDATED or a lower tier', () => {
    assert.equal(classifyProgression('ARMED', 'INVALIDATED'), 'DETERIORATING');
    assert.equal(classifyProgression('ARMED', 'MISSED'), 'DETERIORATING');
    assert.equal(classifyProgression('CONFIRMATION_PENDING', 'DEVELOPING'), 'DETERIORATING');
    assert.equal(classifyProgression('DEVELOPING', 'WAIT'), 'DETERIORATING');
  });

  it('UNCHANGED: lateral movement within the same tier, or an identical state', () => {
    assert.equal(classifyProgression('RETEST_PENDING', 'RECLAIM_PENDING'), 'UNCHANGED');
    assert.equal(classifyProgression('ARMED', 'ARMED'), 'UNCHANGED');
    assert.equal(classifyProgression('MISSED', 'INVALIDATED'), 'UNCHANGED'); // both terminal-negative rank
  });

  it('UNKNOWN: no previous observation, or an unrecognized state', () => {
    assert.equal(classifyProgression(null, 'DEVELOPING'), 'UNKNOWN');
    assert.equal(classifyProgression('DEVELOPING', 'NOT_A_REAL_STATE'), 'UNKNOWN');
  });

  it('does NOT blindly assume every enum movement is improvement (not simple current!=previous)', () => {
    assert.notEqual(classifyProgression('ARMED', 'MISSED'), 'IMPROVING');
    assert.notEqual(classifyProgression('CONFIRMATION_PENDING', 'DEVELOPING'), 'IMPROVING');
  });
});

describe('anticipationStore: model-coverage observability classification', () => {
  it('NO_OBJECTIVE_SETUP for a bare WAIT with nothing developing', () => {
    assert.equal(classifyModelCoverage({ preEntryState: 'WAIT', developingStrategyFamily: null, mappedModelCode: null }), 'NO_OBJECTIVE_SETUP');
  });

  it('EVIDENCE_ONLY_FAMILY_DEVELOPING for a family with no independent trigger path', () => {
    for (const family of EVIDENCE_ONLY_FAMILIES) {
      assert.equal(classifyModelCoverage({ preEntryState: 'DEVELOPING', developingStrategyFamily: family, mappedModelCode: null }), 'EVIDENCE_ONLY_FAMILY_DEVELOPING');
    }
  });

  it('PROTECTED_MODEL_TRIGGER_NOT_COMPLETE for a protected-model family developing with no candidate yet', () => {
    assert.equal(classifyModelCoverage({ preEntryState: 'RETEST_PENDING', developingStrategyFamily: 'breakout', mappedModelCode: null }), 'PROTECTED_MODEL_TRIGGER_NOT_COMPLETE');
  });

  it('PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE when a real candidate triggered but action is still not BUY/SELL', () => {
    assert.equal(classifyModelCoverage({ preEntryState: 'ARMED', developingStrategyFamily: 'trend_continuation', mappedModelCode: 'TC' }), 'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE');
    assert.equal(classifyModelCoverage({ preEntryState: 'MISSED', developingStrategyFamily: 'trend_continuation', mappedModelCode: 'TC' }), 'PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE');
  });

  it('PROTECTED_MODEL_CONFIRMED for a CONFIRMED state', () => {
    assert.equal(classifyModelCoverage({ preEntryState: 'CONFIRMED', developingStrategyFamily: 'trend_continuation', mappedModelCode: 'TC' }), 'PROTECTED_MODEL_CONFIRMED');
  });

  it('classification is never used to alter decision.action -- observability only (documented, structurally enforced by never being an input to anticipation.js/calculateEntry)', () => {
    assert.ok(MODEL_COVERAGE_CLASSES.includes('PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE'));
    const src = readFileSync(new URL('../src/engine/anticipation.js', import.meta.url), 'utf8');
    assert.ok(!/anticipationStore/.test(src), 'anticipation.js must never import from anticipationStore.js -- the pure Stage 1/2 function must not depend on persistence');
  });
});
