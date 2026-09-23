/**
 * RR naming-ambiguity regression (forensic audit finding, see
 * docs/XAUUSD_LIVE_RUNTIME.md). Before this fix, TWO unrelated values were
 * both persisted/returned under the same name `candidate_rr`:
 *
 *   1. src/engine/opportunityPlanner.js's own zone-edge-based, explicitly
 *      non-authoritative "planning" RR (now `planning_rr_illustrative`).
 *   2. src/engine/risk.js's real, protected RR -- the exact value the
 *      RR_NOT_ACCEPTABLE gate itself evaluates -- surfaced for
 *      observability via src/core/xauusd_analyze_market.js's
 *      extractCandidateObservability() (now `authoritative_candidate_rr`).
 *
 * This test reproduces the real forensic-audit case (opportunity #1's
 * planning RR of 188.87, and the current PB candidate's real RR of 0.79)
 * end to end, from the actual protected/planning functions, and proves:
 *   - the two values genuinely diverge for the SAME underlying rejection
 *   - only `authoritative_candidate_rr` matches what the real RR gate saw
 *   - `planning_rr_illustrative` never gates/alters anything
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRisk, RISK_PARAMS } from '../src/engine/risk.js';
import { extractCandidateObservability } from '../src/core/xauusd_analyze_market.js';
import { computeOpportunityPlan } from '../src/engine/opportunityPlanner.js';

describe('RR naming regression: planning_rr_illustrative vs authoritative_candidate_rr must never be confused', () => {
  it('reproduces the real audit divergence: planning RR 188.87 (>> minRR, looks fine) vs authoritative RR 0.79 (< minRR, the real rejection)', () => {
    // ---- Authoritative side: a real SELL PB candidate risk.js rejects for RR ----
    // entry close to structure.rangeLow (small reward room) while the SL
    // anchors to a distant last swing high (large risk) -- exactly the
    // mechanism the forensic audit identified for the live 0.79 case.
    const bars = [{ time: 0, open: 4320, high: 4321, low: 4319, close: 4320 }];
    const candidate = { model: 'PB', side: 'SELL', anchor: 4320 };
    const structure = { lastSwingHigh: { price: 4350, label: 'LH' }, lastSwingLow: { price: 4260, label: 'LL' }, rangeHigh: 4420, rangeLow: 4295 };
    const risk = computeRisk({ candidate, bars, atrVal: 6, structure }, RISK_PARAMS);

    assert.equal(risk.gate, 'RR_NOT_ACCEPTABLE');
    assert.equal(risk.rr, 0.79);
    assert.ok(risk.rr < RISK_PARAMS.minRR);
    // Observability-only fields are still populated even though this candidate was rejected.
    assert.equal(risk.entry, 4320);
    assert.equal(risk.stop_loss, 4351.5);

    const pipelineResult = {
      status: 'OK', regime: 'BEAR_TREND', model: 'PB', quality: null,
      evidence: { candidate, risk },
      decision: { action: 'WAIT', wait_reason: 'RR_NOT_ACCEPTABLE' },
    };
    const observability = extractCandidateObservability(pipelineResult);
    assert.equal(observability.authoritative_candidate_rr, 0.79);
    assert.equal(observability.authoritative_rr_gate, 'RR_NOT_ACCEPTABLE');
    assert.equal(observability.blocked_by, 'RR_NOT_ACCEPTABLE');
    assert.equal(observability.authoritative_candidate_entry, 4320);
    assert.equal(observability.authoritative_candidate_sl, 4351.5);
    assert.ok(!('candidate_rr' in observability), 'the ambiguous name must never reappear');

    // ---- Planning side: opportunityPlanner's OWN, separate, non-authoritative RR ----
    // Reproduces the real audit's opportunity #1 fixture exactly: a 0.31-wide
    // demand zone used as "risk" against a distant target used as "reward".
    const decision = { action: 'WAIT', reason: 'RR_NOT_ACCEPTABLE', symbol: 'OANDA:XAUUSD', diagnostics: { source_timeframe: '15m' }, setup: 'BO' };
    const evidence = {
      regime: 'RANGE',
      structure: { state: 'BULLISH', lastSwingHigh: { price: 4400, label: 'HH' }, lastSwingLow: { price: 4330, label: 'HL' }, rangeHigh: 4420, rangeLow: 4300, lastEvent: null },
      sessionContext: { current: { last_close: 4341 } },
      volatilityContext: { atrValue: 9 },
      levelsContext: {
        nearestSupport: null,
        nearestResistance: { price: 4399.67, type: 'resistance', fresh: true },
        supplyDemandZones: [{ direction: 'demand', zone_low: 4340.81, zone_high: 4341.12, state: 'FRESH' }],
      },
      liquidityContext: { equalHighs: [], equalLows: [] },
      candlestickPatterns: [], classicalPatterns: [],
    };
    const anticipation = {
      state: 'DEVELOPING', direction: 'BULLISH', developing_strategy_family: 'breakout', authoritative_wait_reason: 'RR_NOT_ACCEPTABLE',
      primary_scenario: {
        direction: 'BULLISH', mapped_model_code: 'BO', state: 'DEVELOPING',
        trigger_requirements: [], confirmation_requirements: [],
        supporting_evidence: [], opposing_evidence: [],
        target_room: { structural_objective: null, atr_multiple: null },
      },
      alternate_scenario: null,
    };
    const plan = computeOpportunityPlan({ decision, evidence, anticipation, primaryBars: [{ time: 1000, open: 4339, high: 4343, low: 4338, close: 4341 }] });

    assert.equal(plan.status, 'PLAN');
    assert.equal(plan.planning_rr_illustrative, 188.87);
    assert.ok(!('candidate_rr' in plan), 'the ambiguous name must never reappear');

    // ---- The core regression: same forensic scenario, two unrelated numbers ----
    assert.ok(plan.planning_rr_illustrative >= RISK_PARAMS.minRR, 'planning RR looks "fine" if misread as the real gate');
    assert.ok(observability.authoritative_candidate_rr < RISK_PARAMS.minRR, 'only the authoritative RR reflects the real rejection');
    assert.notEqual(plan.planning_rr_illustrative, observability.authoritative_candidate_rr);

    // Only authoritative_candidate_rr/authoritative_rr_gate correspond to the
    // protected RR gate's own verdict; planning_rr_illustrative never does.
    assert.equal(observability.authoritative_rr_gate === 'RR_NOT_ACCEPTABLE', true);
  });

  it('minRR is unchanged at 1.7 (this fix never touches the threshold)', () => {
    assert.equal(RISK_PARAMS.minRR, 1.7);
  });
});
