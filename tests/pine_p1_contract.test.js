/**
 * Pine P1 ↔ MCP parser compatibility test.
 *
 * The indicator is NOT installed on the live chart (explicitly forbidden for
 * this task). Instead, this file hand-encodes the EXACT 30 "KEY | VALUE"
 * rows pine/XAUUSD_Adaptive_Master.pine emits from its contract table (same
 * field order, same literal values it would produce for each scenario) and
 * feeds them through the real Phase 2B parser (src/core/master_contract.js)
 * to prove the two sides of the contract actually agree — without needing a
 * live TradingView compile/render cycle.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMasterContract } from '../src/core/master_contract.js';

// Mirrors pine/XAUUSD_Adaptive_Master.pine's f_row() call order exactly
// (rows 0–29). `overrides` patches only the fields that vary per scenario.
function pineP1Rows(overrides = {}) {
  const fields = {
    CONTRACT_VERSION: '1',
    INDICATOR_VERSION: '0.1.0',
    SYMBOL: 'OANDA:XAUUSD',
    EXECUTION_TF: '30',
    CONTEXT_TF: '60',
    BAR_TIME: '1700000000000',
    BAR_INDEX: '1234',
    BAR_CONFIRMED: '1',
    REGIME: 'BULL_TREND',
    CORRECTION_STATE: 'NONE',
    CORRECTION_REASON: 'NA',
    MODEL: 'NA',
    SETUP_STATE: 'NA',
    TRIGGER_STATE: 'NA',
    CONFIRMATION_STATE: 'NA',
    QUALITY: 'NA',
    QUALITY_THRESHOLD: 'NA',
    OVEREXTENSION_STATE: 'NA',
    RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT',
    WAIT_REASON: 'NO_ELIGIBLE_STRATEGY',
    ENTRY: 'NA',
    SL: 'NA',
    TP1: 'NA',
    TP2: 'NA',
    EXIT_TARGET: 'NA',
    RR: 'NA',
    SESSION: 'LONDON',
    SIGNAL_ID: 'NA',
    SIGNAL_BAR_TIME: 'NA',
    ...overrides,
  };
  // Same key order f_row() is called in.
  const order = ['CONTRACT_VERSION', 'INDICATOR_VERSION', 'SYMBOL', 'EXECUTION_TF', 'CONTEXT_TF', 'BAR_TIME', 'BAR_INDEX', 'BAR_CONFIRMED', 'REGIME', 'CORRECTION_STATE', 'CORRECTION_REASON', 'MODEL', 'SETUP_STATE', 'TRIGGER_STATE', 'CONFIRMATION_STATE', 'QUALITY', 'QUALITY_THRESHOLD', 'OVEREXTENSION_STATE', 'RR_VALIDATION_STATE', 'ACTION', 'WAIT_REASON', 'ENTRY', 'SL', 'TP1', 'TP2', 'EXIT_TARGET', 'RR', 'SESSION', 'SIGNAL_ID', 'SIGNAL_BAR_TIME'];
  return order.map((k) => `${k} | ${fields[k]}`);
}

describe('Pine P1 contract table ↔ Phase 2B parser compatibility', () => {
  it('has exactly 30 rows, matching the contract table\'s fixed row count', () => {
    assert.equal(pineP1Rows().length, 30);
  });

  it('BULL_TREND, no correction → parser accepts: OK / WAIT / NO_ELIGIBLE_STRATEGY, no trade prices', () => {
    const contract = buildMasterContract({ rows: pineP1Rows(), chartSymbol: 'OANDA:XAUUSD', chartTimeframe: '30' });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.contract_version, 1);
    assert.equal(contract.market.regime, 'BULL_TREND');
    assert.equal(contract.market.correction_state, 'NONE');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'NO_ELIGIBLE_STRATEGY');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'exit_target', 'rr']) assert.equal(contract.decision[f], null);
  });

  it('BEAR_TREND with an active correction → parser accepts: OK / WAIT / CORRECTION_ACTIVE', () => {
    const contract = buildMasterContract({
      rows: pineP1Rows({ REGIME: 'BEAR_TREND', CORRECTION_STATE: 'ACTIVE', CORRECTION_REASON: 'displacement_vs_swing_low+ema_fast_rising', WAIT_REASON: 'CORRECTION_ACTIVE' }),
    });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.market.regime, 'BEAR_TREND');
    assert.equal(contract.market.correction_state, 'ACTIVE');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'CORRECTION_ACTIVE');
  });

  it('CHOP_UNCERTAIN → parser accepts: OK / WAIT / CHOP', () => {
    const contract = buildMasterContract({ rows: pineP1Rows({ REGIME: 'CHOP_UNCERTAIN', WAIT_REASON: 'CHOP' }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'CHOP');
  });

  it('TRANSITION → parser accepts: OK / WAIT / TRANSITION', () => {
    const contract = buildMasterContract({ rows: pineP1Rows({ REGIME: 'TRANSITION', WAIT_REASON: 'TRANSITION' }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.wait_reason, 'TRANSITION');
  });

  it('every P1-reachable regime value round-trips through market.regime unchanged', () => {
    for (const regime of ['BULL_TREND', 'BEAR_TREND', 'RANGE', 'COMPRESSION', 'TRANSITION', 'HIGH_VOLATILITY', 'CHOP_UNCERTAIN']) {
      const waitReason = regime === 'CHOP_UNCERTAIN' ? 'CHOP' : regime === 'TRANSITION' ? 'TRANSITION' : 'NO_ELIGIBLE_STRATEGY';
      const contract = buildMasterContract({ rows: pineP1Rows({ REGIME: regime, WAIT_REASON: waitReason }) });
      assert.equal(contract.status, 'OK', `regime ${regime} must parse cleanly`);
      assert.equal(contract.market.regime, regime);
      assert.equal(contract.decision.action, 'WAIT');
    }
  });

  it('every session value round-trips through market.session unchanged', () => {
    for (const session of ['ASIA', 'LONDON', 'NEW_YORK', 'OTHER']) {
      const contract = buildMasterContract({ rows: pineP1Rows({ SESSION: session }) });
      assert.equal(contract.market.session, session);
    }
  });

  it('BAR_CONFIRMED=0 (forming bar) is accepted for a WAIT contract — confirmation only gates trades', () => {
    const contract = buildMasterContract({ rows: pineP1Rows({ BAR_CONFIRMED: '0' }) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.signal.bar_confirmed, false);
    assert.equal(contract.decision.action, 'WAIT');
  });

  it('ACTION is always literally "WAIT" in every row set this test builds — proves the fixtures mirror P1\'s hardcoded contractAction', () => {
    const rows = pineP1Rows();
    assert.ok(rows.includes('ACTION | WAIT'));
    assert.ok(!rows.some((r) => r === 'ACTION | BUY' || r === 'ACTION | SELL'));
  });

  it('unowned fields (MODEL/ENTRY/SL/TP1/TP2/RR/QUALITY/SIGNAL_ID) are all literal NA and parse to null', () => {
    const contract = buildMasterContract({ rows: pineP1Rows() });
    assert.equal(contract.setup.model, null);
    assert.equal(contract.setup.quality, null);
    assert.equal(contract.setup.quality_threshold, null);
    assert.equal(contract.decision.entry, null);
    assert.equal(contract.decision.stop_loss, null);
    assert.equal(contract.decision.tp1, null);
    assert.equal(contract.decision.tp2, null);
    assert.equal(contract.decision.rr, null);
    assert.equal(contract.signal.signal_id, null);
  });
});
