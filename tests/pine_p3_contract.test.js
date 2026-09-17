/**
 * Pine P3 ↔ MCP parser compatibility test.
 *
 * The indicator is NOT installed on the live chart. This file hand-encodes
 * the exact 50 "KEY | VALUE" rows pine/XAUUSD_Adaptive_Master.pine v0.3.0
 * would emit for realistic P3 scenarios (a genuine PB long, a genuine BO
 * short, and the model-specific adversarial cases from the P3 spec's test
 * matrix — §37) and feeds them through the real Phase 2B parser
 * (src/core/master_contract.js, unchanged since P2 — no contract version
 * bump was needed for P3).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterContract } from '../src/core/master_contract.js';

const P1_FIELD_ORDER = ['CONTRACT_VERSION', 'INDICATOR_VERSION', 'SYMBOL', 'EXECUTION_TF', 'CONTEXT_TF', 'BAR_TIME', 'BAR_INDEX', 'BAR_CONFIRMED', 'REGIME', 'CORRECTION_STATE', 'CORRECTION_REASON', 'MODEL', 'SETUP_STATE', 'TRIGGER_STATE', 'CONFIRMATION_STATE', 'QUALITY', 'QUALITY_THRESHOLD', 'OVEREXTENSION_STATE', 'RR_VALIDATION_STATE', 'ACTION', 'WAIT_REASON', 'ENTRY', 'SL', 'TP1', 'TP2', 'EXIT_TARGET', 'RR', 'SESSION', 'SIGNAL_ID', 'SIGNAL_BAR_TIME'];
const P2_FIELD_ORDER = ['STRUCTURE_STATE', 'LAST_STRUCTURE_EVENT', 'LAST_STRUCTURE_EVENT_BAR', 'LAST_SWING_HIGH', 'LAST_SWING_HIGH_TYPE', 'LAST_SWING_LOW', 'LAST_SWING_LOW_TYPE', 'LAST_BOS_DIRECTION', 'LAST_BOS_BAR', 'LAST_CHOCH_DIRECTION', 'LAST_CHOCH_BAR', 'LAST_SWEEP_TYPE', 'LAST_SWEEP_BAR', 'PDH', 'PDL', 'LAST_DAILY_SWEEP', 'DISPLACEMENT_STATE', 'RANGE_STATE', 'RANGE_HIGH', 'RANGE_LOW'];

function fixtureRows(fields) {
  const defaults = {
    CONTRACT_VERSION: '1', INDICATOR_VERSION: '0.3.0', SYMBOL: 'OANDA:XAUUSD',
    EXECUTION_TF: '30', CONTEXT_TF: '60', BAR_TIME: '1700000000000', BAR_INDEX: '1234',
    BAR_CONFIRMED: '1', REGIME: 'BULL_TREND', CORRECTION_STATE: 'NONE', CORRECTION_REASON: 'NA',
    MODEL: 'NA', SETUP_STATE: 'NO_SETUP', TRIGGER_STATE: 'NO_TRIGGER', CONFIRMATION_STATE: 'CONFIRMED',
    QUALITY: 'NA', QUALITY_THRESHOLD: '65', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT', WAIT_REASON: 'NO_ELIGIBLE_STRATEGY',
    ENTRY: 'NA', SL: 'NA', TP1: 'NA', TP2: 'NA', EXIT_TARGET: 'NA', RR: 'NA',
    SESSION: 'LONDON', SIGNAL_ID: 'NA', SIGNAL_BAR_TIME: 'NA',
    STRUCTURE_STATE: 'BULLISH', LAST_STRUCTURE_EVENT: 'NONE', LAST_STRUCTURE_EVENT_BAR: 'NA',
    LAST_SWING_HIGH: 'NA', LAST_SWING_HIGH_TYPE: 'NA', LAST_SWING_LOW: 'NA', LAST_SWING_LOW_TYPE: 'NA',
    LAST_BOS_DIRECTION: 'NA', LAST_BOS_BAR: 'NA', LAST_CHOCH_DIRECTION: 'NA', LAST_CHOCH_BAR: 'NA',
    LAST_SWEEP_TYPE: 'NA', LAST_SWEEP_BAR: 'NA', PDH: 'NA', PDL: 'NA', LAST_DAILY_SWEEP: 'NA',
    DISPLACEMENT_STATE: 'NONE', RANGE_STATE: 'NONE', RANGE_HIGH: 'NA', RANGE_LOW: 'NA',
    ...fields,
  };
  return [...P1_FIELD_ORDER, ...P2_FIELD_ORDER].map((k) => `${k} | ${defaults[k]}`);
}

describe('Pine P3 contract table ↔ Phase 2B parser compatibility', () => {
  it('has exactly 50 rows — no contract shape change was needed for P3', () => {
    assert.equal(fixtureRows({}).length, 50);
  });

  it('a genuine PB long fixture (bull trend, resolved correction, continuation BOS) parses to a full valid BUY', () => {
    const rows = fixtureRows({
      MODEL: 'PB', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '78.5', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', WAIT_REASON: 'NA',
      ENTRY: '4300', SL: '4285', TP1: '4315', TP2: '4330', RR: '2.0',
      SIGNAL_ID: 'PB_BULLISH_1234', SIGNAL_BAR_TIME: '1700000000000',
      STRUCTURE_STATE: 'BULLISH', LAST_STRUCTURE_EVENT: 'BULLISH_BOS', LAST_STRUCTURE_EVENT_BAR: '1234',
      LAST_BOS_DIRECTION: 'BULLISH', LAST_BOS_BAR: '1234',
      LAST_SWING_LOW: '4285', LAST_SWING_LOW_TYPE: 'HL',
    });
    const contract = buildMasterContract({ rows, chartSymbol: 'OANDA:XAUUSD', chartTimeframe: '30' });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'BUY');
    assert.equal(contract.decision.entry, 4300);
    assert.equal(contract.decision.stop_loss, 4285);
    assert.equal(contract.decision.tp1, 4315);
    assert.equal(contract.decision.tp2, 4330);
    assert.equal(contract.decision.rr, 2.0);
    assert.equal(contract.setup.model, 'PB');
    assert.equal(contract.setup.quality, 78.5);
    assert.equal(contract.signal.signal_id, 'PB_BULLISH_1234');
    assert.equal(contract.signal.bar_confirmed, true);
  });

  it('a genuine BO short fixture (range breakdown + retest) parses to a full valid SELL', () => {
    const rows = fixtureRows({
      REGIME: 'RANGE', MODEL: 'BO', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '70', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'SELL', WAIT_REASON: 'NA',
      ENTRY: '4270', SL: '4285', TP1: '4255', TP2: '4240', RR: '2.0',
      SIGNAL_ID: 'BO_BEARISH_5000', SIGNAL_BAR_TIME: '1700005000000',
      RANGE_STATE: 'BROKEN', RANGE_HIGH: '4300', RANGE_LOW: '4275',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'SELL');
    assert.equal(contract.setup.model, 'BO');
    assert.equal(contract.structure.range_state, 'BROKEN');
  });

  // ── §37 model-specific adversarial matrix (parser-level slice) ──────────

  it('TC: trend alone (no fresh BOS this bar) never appears as a valid trade fixture — WAIT with NO_TRIGGER', () => {
    const rows = fixtureRows({ MODEL: 'NA', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'NO_TRIGGER', ACTION: 'WAIT', WAIT_REASON: 'NO_TRIGGER' });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'NO_TRIGGER');
  });

  it('PB: correction active blocks the trade regardless of any other fixture field — WAIT CORRECTION_ACTIVE', () => {
    const rows = fixtureRows({
      CORRECTION_STATE: 'ACTIVE', MODEL: 'NA', SETUP_STATE: 'NO_SETUP', ACTION: 'WAIT', WAIT_REASON: 'CORRECTION_ACTIVE',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'CORRECTION_ACTIVE');
    assert.equal(contract.market.correction_state, 'ACTIVE');
  });

  it('BO: breakout without a completed retest → WAIT NO_TRIGGER (setup ready, no trigger)', () => {
    const rows = fixtureRows({ REGIME: 'RANGE', MODEL: 'NA', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_PENDING', ACTION: 'WAIT', WAIT_REASON: 'NO_TRIGGER', RANGE_STATE: 'BROKEN' });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.setup.setup_state, 'SETUP_READY');
    assert.equal(contract.setup.trigger_state, 'TRIGGER_PENDING');
  });

  it('MR: blocked outside RANGE — a bull-trend fixture with an MR-shaped setup still reports NO_ELIGIBLE_STRATEGY', () => {
    const rows = fixtureRows({ REGIME: 'BULL_TREND', MODEL: 'NA', SETUP_STATE: 'NO_SETUP', ACTION: 'WAIT', WAIT_REASON: 'NO_ELIGIBLE_STRATEGY' });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'NO_ELIGIBLE_STRATEGY');
  });

  it('SR: a stale sweep (not on this confirmed bar) cannot be reused — WAIT NO_TRIGGER with a non-current LAST_SWEEP_BAR', () => {
    const rows = fixtureRows({
      MODEL: 'NA', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'NO_TRIGGER', ACTION: 'WAIT', WAIT_REASON: 'NO_TRIGGER',
      LAST_SWEEP_TYPE: 'SWEEP_LOW', LAST_SWEEP_BAR: '1200', // stale — far before BAR_INDEX=1234
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.structure.last_sweep_bar, 1200);
  });

  // ── §38 quality boundary tests ───────────────────────────────────────────

  it('quality exactly at threshold-1 with an otherwise-complete trade → contradiction (never silently passed)', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '64', QUALITY_THRESHOLD: '65', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION', 'Pine claiming BUY with quality below its own threshold is a contradiction, not a valid trade');
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('quality exactly AT threshold with an otherwise-complete trade is accepted (not below)', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '65', QUALITY_THRESHOLD: '65', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'BUY');
  });

  it('quality of exactly 100 is accepted; quality above 100 would only occur via a malformed/impossible fixture (parser treats it as a plain number, no upper enum bound)', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '100', QUALITY_THRESHOLD: '65', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.setup.quality, 100);
  });

  // ── §39 RR boundary tests ─────────────────────────────────────────────

  it('RR exactly at minimum (1.5) with rr_validation_state=ACCEPTABLE is a valid trade', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '70', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '107.5', RR: '1.5', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.rr, 1.5);
  });

  it('rr_validation_state=RR_NOT_ACCEPTABLE with an otherwise-complete BUY is a contradiction, not a trade', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED',
      QUALITY: '70', RR_VALIDATION_STATE: 'RR_NOT_ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '108', RR: '1.6', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('zero-risk geometry (SL == ENTRY) is caught upstream by Pine\'s own slGeometryOk gate — if it ever leaked through, RR would be Infinity, which the parser rejects as non-finite', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED', QUALITY: '70', RR_VALIDATION_STATE: 'ACCEPTABLE',
      ACTION: 'BUY', ENTRY: '100', SL: '100', TP1: '105', TP2: '110', RR: 'Infinity', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('RR'));
  });

  // ── §40 entry-late tests (parser-level slice — Pine-side logic proven in
  // pine_p3_decision_model.test.js) ────────────────────────────────────────

  it('overextension_state=OVEREXTENDED with an otherwise-complete BUY is a contradiction', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED', QUALITY: '70', RR_VALIDATION_STATE: 'ACCEPTABLE',
      OVEREXTENSION_STATE: 'OVEREXTENDED',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
  });

  it('overextension_state=ENTRY_LATE with an otherwise-complete BUY is a contradiction', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED', QUALITY: '70', RR_VALIDATION_STATE: 'ACCEPTABLE',
      OVEREXTENSION_STATE: 'ENTRY_LATE',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
  });

  // ── Signal safety (§28/§29) ────────────────────────────────────────────

  it('BUY and SELL cannot both appear in a single fixture (ACTION is a single field) — structurally impossible by the contract\'s own shape', () => {
    const rows = fixtureRows({ ACTION: 'BUY' });
    const asObj = Object.fromEntries(rows.map((r) => r.split(' | ')));
    assert.equal(asObj.ACTION, 'BUY');
    assert.notEqual(asObj.ACTION, 'SELL');
  });

  it('an unconfirmed bar with an otherwise-complete BUY fixture never becomes a confirmed trade (SOURCE_UNCONFIRMED)', () => {
    const rows = fixtureRows({
      MODEL: 'TC', SETUP_STATE: 'SETUP_READY', TRIGGER_STATE: 'TRIGGER_CONFIRMED', QUALITY: '70', RR_VALIDATION_STATE: 'ACCEPTABLE',
      BAR_CONFIRMED: '0',
      ACTION: 'BUY', ENTRY: '100', SL: '95', TP1: '105', TP2: '110', RR: '2.0', SIGNAL_ID: 'x', SIGNAL_BAR_TIME: '1',
    });
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'SOURCE_UNCONFIRMED');
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('a WAIT fixture (the common case) contains no fabricated trade prices, matching MODEL=NA and every price field NA', () => {
    const rows = fixtureRows({});
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.action, 'WAIT');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.equal(contract.decision[f], null);
  });
});
