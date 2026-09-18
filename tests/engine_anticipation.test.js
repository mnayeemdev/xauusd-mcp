/**
 * src/engine/anticipation.js -- Stage 1+2 pre-entry state machine +
 * scenario derivation. Every test here proves the anticipation layer is
 * a pure relabeling of already-computed decision/evidence fields: it
 * never mutates its inputs, never fabricates trade geometry for an
 * unconfirmed scenario, and never lets an evidence-only strategy family
 * masquerade as an independent trigger.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnticipation, ANTICIPATION_STATES, EVIDENCE_ONLY_FAMILIES } from '../src/engine/anticipation.js';
import { RISK_PARAMS } from '../src/engine/risk.js';
import { QUALITY_PARAMS } from '../src/engine/quality.js';
import { CORRECTION_PARAMS } from '../src/engine/correction.js';

function baseDecision(overrides = {}) {
  return {
    schema_version: '1.1.0', status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY',
    symbol: 'OANDA:XAUUSD', timeframes: {}, regime: 'BULL_TREND', direction: null, setup: null,
    entry: null, sl: null, tp1: null, tp2: null, rr: null, quality: null,
    correction_state: null, confirmation_state: 'OK', overextension_state: 'NONE',
    signal: null, calculated_at: '2025-01-01T00:00:00.000Z', pine_reference: null, engine_disagreement: null,
    diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: null },
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
    eligibility: {
      regime: 'BULL_TREND', eligible: ['trend_continuation', 'pullback_continuation', 'breakout'],
      blocked_reason: null, mean_reversion_blocked: true, selected_model: null, selected_families: [], selected_model_consistent_with_eligibility: null,
    },
    candlestickPatterns: [],
    classicalPatterns: [],
    breakoutState: { state: 'NO_BREAKOUT', evidence: {} },
    liquidityContext: { equalHighs: [], equalLows: [], sweepReclaim: { swept: false }, priorDaySweep: { high: 'NONE', low: 'NONE' }, priorWeekSweep: { high: 'NONE', low: 'NONE' }, fairValueGaps: [], premiumDiscount: { zone: null, pct: null } },
    levelsContext: { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] },
    volatilityContext: { atrValue: 5, atrPct: 0.2, atrPercentile: 50, rollingAtrPctAvg: 0.2, ratio: 1, state: 'NORMAL' },
    sessionContext: { current: { session: 'LONDON', last_close: 2020 }, previous: null, breakout: null, sweep: null, expansion: null },
    dailyWeeklyContext: {},
    ...overrides,
  };
}

describe('engine/anticipation: state vocabulary', () => {
  it('exports exactly the 10 required states', () => {
    assert.deepEqual([...ANTICIPATION_STATES].sort(), [
      'APPROACHING_ZONE', 'ARMED', 'CONFIRMATION_PENDING', 'CONFIRMED', 'DEVELOPING',
      'INVALIDATED', 'MISSED', 'RECLAIM_PENDING', 'RETEST_PENDING', 'WAIT',
    ].sort());
  });
  it('exports the 4 evidence-only families', () => {
    assert.deepEqual([...EVIDENCE_ONLY_FAMILIES].sort(), ['compression_expansion', 'momentum_continuation', 'range_trading', 'structural_reversal'].sort());
  });
});

describe('engine/anticipation: WAIT default', () => {
  it('CHOP regime with no evidence produces WAIT with no scenario', () => {
    const decision = baseDecision({ reason: 'CHOP' });
    const evidence = baseEvidence({ eligibility: { regime: 'CHOP_UNCERTAIN', eligible: [], blocked_reason: 'CHOP_UNCERTAIN regime: no strategy family is eligible, WAIT is the only valid outcome' } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'WAIT');
    assert.equal(a.primary_scenario, null);
    assert.equal(a.alternate_scenario, null);
    assert.ok(a.no_trade_neutral);
    assert.equal(a.no_trade_neutral.why, 'CHOP_UNCERTAIN regime: no strategy family is eligible, WAIT is the only valid outcome');
  });

  it('DATA_UNAVAILABLE (non-OK status) with no evidence produces WAIT', () => {
    const decision = { status: 'DATA_UNAVAILABLE', action: 'WAIT', reason: 'insufficient/invalid market data' };
    const a = computeAnticipation({ decision, evidence: null });
    assert.equal(a.state, 'WAIT');
    assert.equal(a.primary_scenario, null);
  });
});

describe('engine/anticipation: DEVELOPING', () => {
  it('NO_ELIGIBLE_STRATEGY with regime-eligible families and no specific breakout/level evidence', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'DEVELOPING');
    assert.equal(a.primary_scenario.state, 'DEVELOPING');
    assert.ok(a.waiting_for.length > 0);
  });
});

describe('engine/anticipation: APPROACHING_ZONE', () => {
  it('price is within the reused retest-ATR tolerance of a fresh S/R level', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({
      levelsContext: {
        levels: [], supplyDemandZones: [],
        nearestResistance: { price: 2021, type: 'resistance', touch_count: 2, fresh: true, distance_from_current: 1 },
        nearestSupport: null,
      },
    });
    // atrValue=5, distance=1 -> 0.2 ATR, within retestAtrTol=0.3
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'APPROACHING_ZONE');
    assert.equal(a.primary_scenario.location.type, 'resistance');
    assert.equal(a.primary_scenario.distance_to_trigger.atr_multiple, 0.2);
  });

  it('a level beyond the tolerance does NOT trigger APPROACHING_ZONE', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({
      levelsContext: { levels: [], supplyDemandZones: [], nearestResistance: { price: 2050, type: 'resistance', touch_count: 2, fresh: true, distance_from_current: 30 }, nearestSupport: null },
    });
    const a = computeAnticipation({ decision, evidence });
    assert.notEqual(a.state, 'APPROACHING_ZONE');
  });
});

describe('engine/anticipation: RETEST_PENDING', () => {
  it('breakout forming with no candidate yet', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ breakoutState: { state: 'BREAKOUT_FORMING', evidence: { direction: 'BULLISH', distance_from_level: 0, overextended_ratio: 0 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'RETEST_PENDING');
    assert.equal(a.direction, 'BULLISH');
  });
});

describe('engine/anticipation: RECLAIM_PENDING', () => {
  it('breakout retest is currently being tested', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ breakoutState: { state: 'RETEST_TESTING', evidence: { direction: 'BULLISH', distance_from_level: 0.5, overextended_ratio: 0.1 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'RECLAIM_PENDING');
  });

  it('a liquidity sweep occurred but has not yet been reclaimed', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ liquidityContext: { ...baseEvidence().liquidityContext, sweepReclaim: { swept: true, sweepType: 'SWEEP_LOW', level: 1990, reclaimed: false } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'RECLAIM_PENDING');
  });
});

describe('engine/anticipation: CONFIRMATION_PENDING', () => {
  it('CORRECTION_ACTIVE maps to CONFIRMATION_PENDING with a pullback_continuation family', () => {
    const decision = baseDecision({ reason: 'CORRECTION_ACTIVE' });
    const evidence = baseEvidence({ correction: { state: 'ACTIVE' } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'CONFIRMATION_PENDING');
    assert.equal(a.developing_strategy_family, 'pullback_continuation');
    assert.ok(a.waiting_for.some((w) => w.includes(String(CORRECTION_PARAMS.corrResolveConfirmBars))));
  });

  it('a retest that already held (RETEST_HOLD) while blocked by RR_NOT_ACCEPTABLE is CONFIRMATION_PENDING, not ARMED', () => {
    const decision = baseDecision({ reason: 'RR_NOT_ACCEPTABLE', setup: 'BO' });
    const evidence = baseEvidence({ breakoutState: { state: 'RETEST_HOLD', evidence: { direction: 'BULLISH', distance_from_level: 0.2, overextended_ratio: 0.3 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'CONFIRMATION_PENDING');
    assert.notEqual(a.state, 'ARMED');
  });
});

describe('engine/anticipation: ARMED (corrected definition -- never OVEREXTENDED/ENTRY_LATE, never a bare RR/quality block)', () => {
  it('HTF_CONFLICT: a fully gate-cleared candidate blocked only by 1H alignment', () => {
    const decision = baseDecision({
      reason: 'HTF_CONFLICT', setup: 'TC',
      diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } },
    });
    const evidence = baseEvidence();
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'ARMED');
    assert.equal(a.direction, 'BULLISH');
    assert.equal(a.primary_scenario.potential_rr_feasibility, 'LIKELY_ACCEPTABLE');
  });

  it('ENTRY_CONFLICT recovers the model from decision.timeframes when decision.setup is null', () => {
    const decision = baseDecision({
      reason: 'ENTRY_CONFLICT', setup: null,
      timeframes: { '15m': { status: 'OK', regime: 'BULL_TREND', model: 'PB', action: 'BUY', wait_reason: null } },
      diagnostics: { source_timeframe: '15m', conflict: '30m regime is BEAR_TREND, which materially opposes a BUY on 15m', quality_breakdown: null, htf_conflict: null },
    });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.equal(a.state, 'ARMED');
    assert.equal(a.primary_scenario.mapped_model_code, 'PB');
    assert.equal(a.developing_strategy_family, 'pullback_continuation');
  });

  it('ENGINE_DISAGREEMENT is ARMED', () => {
    const decision = baseDecision({ reason: 'ENGINE_DISAGREEMENT', setup: 'SR', engine_disagreement: { type: 'ENGINE_DISAGREEMENT', pine_action: 'SELL', mcp_action: 'BUY', note: 'opposing' } });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.equal(a.state, 'ARMED');
    assert.equal(a.direction, 'BULLISH');
  });
});

describe('engine/anticipation: CONFIRMED', () => {
  it('BUY reflects the authoritative decision, no scenario objects', () => {
    const decision = baseDecision({ action: 'BUY', reason: null, setup: 'TC', entry: 2010, sl: 2005, tp1: 2015, tp2: 2020, rr: 2.0, quality: 78 });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.equal(a.state, 'CONFIRMED');
    assert.equal(a.authoritative_wait_reason, null);
    assert.equal(a.primary_scenario, null);
    assert.equal(a.alternate_scenario, null);
    assert.deepEqual(a.waiting_for, []);
  });

  it('SELL reflects the authoritative decision', () => {
    const decision = baseDecision({ action: 'SELL', reason: null, setup: 'SR', entry: 2000, sl: 2005, tp1: 1995, tp2: 1990, rr: 2.0, quality: 72 });
    const a = computeAnticipation({ decision, evidence: baseEvidence({ structure: { ...baseEvidence().structure, state: 'BEARISH' } }) });
    assert.equal(a.state, 'CONFIRMED');
    assert.equal(a.direction, 'BEARISH');
  });
});

describe('engine/anticipation: MISSED', () => {
  it('reason === OVEREXTENDED', () => {
    const decision = baseDecision({ reason: 'OVEREXTENDED', setup: 'TC' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.equal(a.state, 'MISSED');
    assert.equal(a.primary_scenario.late_overextension_risk, 'MISSED');
    assert.equal(a.primary_scenario.potential_rr_feasibility, 'UNLIKELY');
  });

  it('reason === ENTRY_LATE (reserved Pine-side vocabulary, handled for forward compatibility)', () => {
    const decision = baseDecision({ reason: 'ENTRY_LATE', setup: 'BO' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.equal(a.state, 'MISSED');
  });

  it('breakout lifecycle itself already reports OVEREXTENDED_BREAKOUT, independent of `reason`', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ breakoutState: { state: 'OVEREXTENDED_BREAKOUT', evidence: { direction: 'BULLISH', overextended: true, overextended_ratio: 3.1, distance_from_level: 15 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'MISSED');
  });
});

describe('engine/anticipation: INVALIDATED (stateless -- only from explicit current invalidation evidence)', () => {
  it('a FAILED_BREAKOUT reported by the current snapshot is INVALIDATED', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ breakoutState: { state: 'FAILED_BREAKOUT', evidence: { direction: 'BULLISH', overextended: false, overextended_ratio: 0.4, distance_from_level: 2 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'INVALIDATED');
    assert.equal(a.primary_scenario.late_overextension_risk, 'NONE');
  });

  it('a FALSE_BREAKOUT reported by the current snapshot is INVALIDATED', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ breakoutState: { state: 'FALSE_BREAKOUT', evidence: { direction: 'BEARISH', overextended: false, overextended_ratio: 0.1, distance_from_level: 1 } } });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'INVALIDATED');
  });

  it('a direction-matched INVALIDATED classical pattern, with no other pending evidence, is INVALIDATED', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence({ classicalPatterns: [{ pattern_type: 'DOUBLE_TOP', bias: 'BULLISH', completion_state: 'INVALIDATED', pattern_id: 'p1' }] });
    const a = computeAnticipation({ decision, evidence });
    assert.equal(a.state, 'INVALIDATED');
  });

  it('does NOT report INVALIDATED merely because a WAIT exists with no invalidation evidence', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.notEqual(a.state, 'INVALIDATED');
  });
});

describe('engine/anticipation: RR_NOT_ACCEPTABLE never automatically becomes ARMED', () => {
  it('RR_NOT_ACCEPTABLE with no structural corroboration is DEVELOPING', () => {
    const decision = baseDecision({ reason: 'RR_NOT_ACCEPTABLE', setup: 'TC' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.notEqual(a.state, 'ARMED');
    assert.equal(a.state, 'DEVELOPING');
  });

  it('NO_GOOD_ENTRY with no structural corroboration is DEVELOPING, never ARMED', () => {
    const decision = baseDecision({ reason: 'NO_GOOD_ENTRY', setup: 'PB' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.notEqual(a.state, 'ARMED');
  });
});

describe('engine/anticipation: alternate scenario is never fabricated', () => {
  it('is null when there is no primary direction at all', () => {
    const decision = baseDecision({ reason: 'CHOP' });
    const a = computeAnticipation({ decision, evidence: baseEvidence({ structure: { state: null, lastSwingHigh: null, lastSwingLow: null, pivots: [], rangeHigh: null, rangeLow: null, lastEvent: null } }) });
    assert.equal(a.alternate_scenario, null);
  });

  it('is null when structure has no relevant swing pivot to anchor an opposing break', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const a = computeAnticipation({ decision, evidence: baseEvidence({ structure: { state: 'BULLISH', lastSwingHigh: { price: 2050, label: 'HH' }, lastSwingLow: null, pivots: [], rangeHigh: 2060, rangeLow: 1980, lastEvent: null } }) });
    assert.equal(a.alternate_scenario, null);
  });

  it('is populated with an objective opposing CHoCH-style path when a relevant swing exists, and is never the forced opposite of primary without one', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const a = computeAnticipation({ decision, evidence: baseEvidence() });
    assert.ok(a.alternate_scenario);
    assert.equal(a.alternate_scenario.direction, 'BEARISH');
    assert.equal(a.alternate_scenario.strategy_family, 'structural_reversal');
    assert.equal(a.alternate_scenario.mapped_model_code, null); // evidence-only family -- can never independently trigger
  });
});

describe('engine/anticipation: no fabricated trade geometry on unconfirmed scenarios', () => {
  it('primary_scenario never contains entry/sl/tp1/tp2 keys', () => {
    for (const reason of ['NO_ELIGIBLE_STRATEGY', 'CORRECTION_ACTIVE', 'RR_NOT_ACCEPTABLE', 'HTF_CONFLICT']) {
      const decision = baseDecision({ reason, setup: reason === 'HTF_CONFLICT' ? 'TC' : null, diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: reason === 'HTF_CONFLICT' ? { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } : null } });
      const a = computeAnticipation({ decision, evidence: baseEvidence({ correction: reason === 'CORRECTION_ACTIVE' ? { state: 'ACTIVE' } : { state: 'NONE' } }) });
      if (a.primary_scenario) {
        for (const key of ['entry', 'sl', 'stop_loss', 'tp1', 'tp2']) assert.equal(key in a.primary_scenario, false, `primary_scenario must never contain ${key} (reason=${reason})`);
      }
    }
  });
});

describe('engine/anticipation: evidence-only strategy families cannot create BUY/SELL', () => {
  it('EVIDENCE_ONLY_FAMILIES are never emitted as mapped_model_code anywhere', () => {
    const cases = [
      { decision: baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' }), evidence: baseEvidence() },
      { decision: baseDecision({ reason: 'CORRECTION_ACTIVE' }), evidence: baseEvidence({ correction: { state: 'ACTIVE' } }) },
    ];
    for (const { decision, evidence } of cases) {
      const a = computeAnticipation({ decision, evidence });
      if (a.primary_scenario?.mapped_model_code) assert.equal(EVIDENCE_ONLY_FAMILIES.includes(a.primary_scenario.mapped_model_code), false);
      if (a.alternate_scenario?.mapped_model_code) assert.equal(EVIDENCE_ONLY_FAMILIES.includes(a.alternate_scenario.mapped_model_code), false);
    }
  });
});

describe('engine/anticipation: purity -- never mutates its inputs', () => {
  it('the decision object passed in is byte-identical before and after computeAnticipation()', () => {
    const decision = baseDecision({ reason: 'HTF_CONFLICT', setup: 'TC', diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } } });
    const evidence = baseEvidence();
    const before = JSON.stringify(decision);
    computeAnticipation({ decision, evidence });
    assert.equal(JSON.stringify(decision), before);
  });

  it('the evidence object passed in is byte-identical before and after computeAnticipation()', () => {
    const decision = baseDecision({ reason: 'NO_ELIGIBLE_STRATEGY' });
    const evidence = baseEvidence();
    const before = JSON.stringify(evidence);
    computeAnticipation({ decision, evidence });
    assert.equal(JSON.stringify(evidence), before);
  });
});

describe('engine/anticipation: improving_or_deteriorating is honest about statelessness', () => {
  it('is always UNKNOWN_WITHOUT_HISTORY in Stage 1/2', () => {
    for (const reason of ['NO_ELIGIBLE_STRATEGY', 'CORRECTION_ACTIVE', 'OVEREXTENDED', 'HTF_CONFLICT']) {
      const decision = baseDecision({ reason, setup: reason === 'HTF_CONFLICT' ? 'TC' : null, diagnostics: { source_timeframe: '15m', conflict: null, quality_breakdown: null, htf_conflict: reason === 'HTF_CONFLICT' ? { gate_timeframe: '1H', gate_regime: 'BEAR_TREND', blocked_action: 'BUY' } : null } });
      const a = computeAnticipation({ decision, evidence: baseEvidence({ correction: reason === 'CORRECTION_ACTIVE' ? { state: 'ACTIVE' } : { state: 'NONE' } }) });
      assert.equal(a.improving_or_deteriorating, 'UNKNOWN_WITHOUT_HISTORY');
    }
  });
});

describe('engine/anticipation: protected constants are unchanged', () => {
  it('minRR, qualityThreshold, corrResolveConfirmBars remain at their locked values', () => {
    assert.equal(RISK_PARAMS.minRR, 1.7);
    assert.equal(QUALITY_PARAMS.qualityThreshold, 65);
    assert.equal(CORRECTION_PARAMS.corrResolveConfirmBars, 3);
  });
});
