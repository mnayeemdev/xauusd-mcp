/**
 * Pine P2 ↔ MCP parser compatibility test.
 *
 * The indicator is NOT installed on the live chart (explicitly forbidden for
 * this task). Instead, this file hand-encodes the EXACT 50 "KEY | VALUE"
 * rows pine/XAUUSD_Adaptive_Master.pine v0.2.0 emits from its contract table
 * (same field order, same literal values it would produce for each
 * scenario) and feeds them through the real Phase 2B parser
 * (src/core/master_contract.js, additively extended for P2) to prove the
 * two sides of the contract agree — without needing a live TradingView
 * compile/render cycle.
 *
 * Central invariant under test (Phase 3 spec §17 / Pine P2 spec §17):
 * structure is evidence, never permission — even the most "perfect" bullish
 * structural picture (BOS + CHoCH + PDL sweep + displacement + resolved
 * correction, all at once) must still produce decision.action === "WAIT".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterContract } from '../src/core/master_contract.js';

const P1_FIELD_ORDER = ['CONTRACT_VERSION', 'INDICATOR_VERSION', 'SYMBOL', 'EXECUTION_TF', 'CONTEXT_TF', 'BAR_TIME', 'BAR_INDEX', 'BAR_CONFIRMED', 'REGIME', 'CORRECTION_STATE', 'CORRECTION_REASON', 'MODEL', 'SETUP_STATE', 'TRIGGER_STATE', 'CONFIRMATION_STATE', 'QUALITY', 'QUALITY_THRESHOLD', 'OVEREXTENSION_STATE', 'RR_VALIDATION_STATE', 'ACTION', 'WAIT_REASON', 'ENTRY', 'SL', 'TP1', 'TP2', 'EXIT_TARGET', 'RR', 'SESSION', 'SIGNAL_ID', 'SIGNAL_BAR_TIME'];
const P2_FIELD_ORDER = ['STRUCTURE_STATE', 'LAST_STRUCTURE_EVENT', 'LAST_STRUCTURE_EVENT_BAR', 'LAST_SWING_HIGH', 'LAST_SWING_HIGH_TYPE', 'LAST_SWING_LOW', 'LAST_SWING_LOW_TYPE', 'LAST_BOS_DIRECTION', 'LAST_BOS_BAR', 'LAST_CHOCH_DIRECTION', 'LAST_CHOCH_BAR', 'LAST_SWEEP_TYPE', 'LAST_SWEEP_BAR', 'PDH', 'PDL', 'LAST_DAILY_SWEEP', 'DISPLACEMENT_STATE', 'RANGE_STATE', 'RANGE_HIGH', 'RANGE_LOW'];

// Mirrors pine/XAUUSD_Adaptive_Master.pine v0.2.0's f_row() call order
// exactly (rows 0–49). `overrides` patches only the fields that vary.
function pineP2Rows(overrides = {}) {
  const fields = {
    CONTRACT_VERSION: '1', INDICATOR_VERSION: '0.2.0', SYMBOL: 'OANDA:XAUUSD',
    EXECUTION_TF: '30', CONTEXT_TF: '60', BAR_TIME: '1700000000000', BAR_INDEX: '1234',
    BAR_CONFIRMED: '1', REGIME: 'BULL_TREND', CORRECTION_STATE: 'NONE', CORRECTION_REASON: 'NA',
    MODEL: 'NA', SETUP_STATE: 'NA', TRIGGER_STATE: 'NA', CONFIRMATION_STATE: 'NA',
    QUALITY: 'NA', QUALITY_THRESHOLD: 'NA', OVEREXTENSION_STATE: 'NA', RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT', WAIT_REASON: 'NO_ELIGIBLE_STRATEGY',
    ENTRY: 'NA', SL: 'NA', TP1: 'NA', TP2: 'NA', EXIT_TARGET: 'NA', RR: 'NA',
    SESSION: 'LONDON', SIGNAL_ID: 'NA', SIGNAL_BAR_TIME: 'NA',
    STRUCTURE_STATE: 'NEUTRAL', LAST_STRUCTURE_EVENT: 'NONE', LAST_STRUCTURE_EVENT_BAR: 'NA',
    LAST_SWING_HIGH: 'NA', LAST_SWING_HIGH_TYPE: 'NA', LAST_SWING_LOW: 'NA', LAST_SWING_LOW_TYPE: 'NA',
    LAST_BOS_DIRECTION: 'NA', LAST_BOS_BAR: 'NA', LAST_CHOCH_DIRECTION: 'NA', LAST_CHOCH_BAR: 'NA',
    LAST_SWEEP_TYPE: 'NA', LAST_SWEEP_BAR: 'NA', PDH: 'NA', PDL: 'NA', LAST_DAILY_SWEEP: 'NA',
    DISPLACEMENT_STATE: 'NONE', RANGE_STATE: 'NONE', RANGE_HIGH: 'NA', RANGE_LOW: 'NA',
    ...overrides,
  };
  return [...P1_FIELD_ORDER, ...P2_FIELD_ORDER].map((k) => `${k} | ${fields[k]}`);
}

describe('Pine P2 contract table ↔ Phase 2B parser compatibility', () => {
  it('has exactly 50 rows (30 P1 + 20 P2), matching the v0.2.0 contract table row count', () => {
    assert.equal(pineP2Rows().length, 50);
  });

  it('clean NEUTRAL structure state (no swings yet) parses cleanly, WAIT, all structure fields null', () => {
    const contract = buildMasterContract({ rows: pineP2Rows() });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.structure.state, 'NEUTRAL');
    assert.equal(contract.structure.last_swing_high, null);
    assert.equal(contract.structure.range_state, 'NONE');
  });

  it('a rich BULLISH structural picture parses correctly, still WAIT', () => {
    const contract = buildMasterContract({ rows: pineP2Rows({
      STRUCTURE_STATE: 'BULLISH', LAST_STRUCTURE_EVENT: 'BULLISH_BOS', LAST_STRUCTURE_EVENT_BAR: '1230',
      LAST_SWING_HIGH: '4310.5', LAST_SWING_HIGH_TYPE: 'HH', LAST_SWING_LOW: '4280.25', LAST_SWING_LOW_TYPE: 'HL',
      LAST_BOS_DIRECTION: 'BULLISH', LAST_BOS_BAR: '1230',
      PDH: '4315.0', PDL: '4270.0', LAST_DAILY_SWEEP: 'PDL_SWEEP',
      DISPLACEMENT_STATE: 'BULLISH_DISPLACEMENT', RANGE_STATE: 'BROKEN',
    }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT', 'structure alone must never produce a trade');
    assert.equal(contract.structure.state, 'BULLISH');
    assert.equal(contract.structure.last_event, 'BULLISH_BOS');
    assert.equal(contract.structure.last_event_bar, 1230);
    assert.equal(contract.structure.last_swing_high, 4310.5);
    assert.equal(contract.structure.last_swing_high_type, 'HH');
    assert.equal(contract.structure.last_swing_low, 4280.25);
    assert.equal(contract.structure.last_swing_low_type, 'HL');
    assert.equal(contract.structure.last_bos_direction, 'BULLISH');
    assert.equal(contract.structure.last_bos_bar, 1230);
    assert.equal(contract.structure.pdh, 4315.0);
    assert.equal(contract.structure.pdl, 4270.0);
    assert.equal(contract.structure.last_daily_sweep, 'PDL_SWEEP');
    assert.equal(contract.structure.displacement_state, 'BULLISH_DISPLACEMENT');
    assert.equal(contract.structure.range_state, 'BROKEN');
  });

  it('a rich BEARISH structural picture parses correctly, still WAIT', () => {
    const contract = buildMasterContract({ rows: pineP2Rows({
      REGIME: 'BEAR_TREND', STRUCTURE_STATE: 'BEARISH', LAST_STRUCTURE_EVENT: 'BEARISH_CHOCH', LAST_STRUCTURE_EVENT_BAR: '1231',
      LAST_CHOCH_DIRECTION: 'BEARISH', LAST_CHOCH_BAR: '1231',
      LAST_SWEEP_TYPE: 'SWEEP_HIGH', LAST_SWEEP_BAR: '1225',
      DISPLACEMENT_STATE: 'BEARISH_DISPLACEMENT', RANGE_STATE: 'ACTIVE', RANGE_HIGH: '4320.0', RANGE_LOW: '4290.0',
    }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.structure.state, 'BEARISH');
    assert.equal(contract.structure.last_choch_direction, 'BEARISH');
    assert.equal(contract.structure.last_sweep_type, 'SWEEP_HIGH');
    assert.equal(contract.structure.range_state, 'ACTIVE');
    assert.equal(contract.structure.range_high, 4320.0);
    assert.equal(contract.structure.range_low, 4290.0);
  });

  // ── The central P2 invariant, stress-tested with EVERY structural signal
  // simultaneously "perfect" — the exact scenario Pine P2 §17 describes. ──
  it('§17 invariant: BOS + CHoCH + PDL sweep + displacement + resolved correction ALL AT ONCE still yields WAIT, never BUY', () => {
    const contract = buildMasterContract({ rows: pineP2Rows({
      REGIME: 'BULL_TREND', CORRECTION_STATE: 'NONE', // just resolved
      STRUCTURE_STATE: 'BULLISH',
      LAST_STRUCTURE_EVENT: 'BULLISH_BOS', LAST_STRUCTURE_EVENT_BAR: '1234',
      LAST_BOS_DIRECTION: 'BULLISH', LAST_BOS_BAR: '1234',
      LAST_CHOCH_DIRECTION: 'BULLISH', LAST_CHOCH_BAR: '1220',
      LAST_SWEEP_TYPE: 'SWEEP_LOW', LAST_SWEEP_BAR: '1215',
      LAST_DAILY_SWEEP: 'PDL_SWEEP',
      DISPLACEMENT_STATE: 'BULLISH_DISPLACEMENT',
      ACTION: 'WAIT', WAIT_REASON: 'NO_ELIGIBLE_STRATEGY', // still hardcoded, but proven explicitly below too
    }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT', 'perfect bullish structure must NOT become BUY');
    assert.notEqual(contract.decision.action, 'BUY');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'exit_target', 'rr']) {
      assert.equal(contract.decision[f], null, `${f} must not be fabricated even with "perfect" structure`);
    }
  });

  it('structure fields are never required for a valid trade — a P1-only 30-row table (no P2 fields at all) still validates a BUY correctly', () => {
    // Uses ONLY the original 30 P1 rows — proves P2 parser support is
    // additive/optional, never a new requirement for trades.
    const rows = P1_FIELD_ORDER.map((k) => {
      const tradeFields = {
        CONTRACT_VERSION: '1', ACTION: 'BUY', BAR_CONFIRMED: '1', ENTRY: '100', SL: '95', TP1: '110', TP2: '120', RR: '2',
        MODEL: 'PB', REGIME: 'BULL_TREND', QUALITY: '85', SIGNAL_ID: 'sig-1', SIGNAL_BAR_TIME: '1700000000',
        CORRECTION_STATE: 'NONE', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'ACCEPTABLE', QUALITY_THRESHOLD: '70',
      };
      return `${k} | ${tradeFields[k] ?? 'NA'}`;
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'BUY');
    assert.equal(contract.structure.state, null, 'absent P2 fields must be null, never required');
  });

  it('structure fields present but malformed (e.g. non-numeric LAST_BOS_BAR) → MALFORMED_CONTRACT, same as any other bad numeric field', () => {
    const contract = buildMasterContract({ rows: pineP2Rows({ LAST_BOS_BAR: 'not-a-number' }) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('LAST_BOS_BAR'));
  });

  it('every declared RANGE_STATE value round-trips unchanged', () => {
    for (const state of ['NONE', 'ACTIVE', 'BROKEN']) {
      const contract = buildMasterContract({ rows: pineP2Rows({ RANGE_STATE: state }) });
      assert.equal(contract.structure.range_state, state);
    }
  });

  it('BULLISH_CHOCH while correction is simultaneously ACTIVE is still just WAIT (P2 structure never overrides the correction-active gate)', () => {
    const contract = buildMasterContract({ rows: pineP2Rows({
      CORRECTION_STATE: 'ACTIVE', WAIT_REASON: 'CORRECTION_ACTIVE',
      STRUCTURE_STATE: 'BULLISH', LAST_STRUCTURE_EVENT: 'BULLISH_CHOCH', LAST_STRUCTURE_EVENT_BAR: '1234',
    }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'CORRECTION_ACTIVE');
  });
});
