/**
 * Pine P4A review/fix pass — proof of the two corrected defects:
 *   1. BAR_CONFIRMED strict single-token contract (only the literal "1",
 *      the frozen Pine source's exclusive true encoding, authorizes a trade)
 *   2. MCP-side price-geometry contract validation (BUY/SELL levels must be
 *      directionally self-consistent; never derived/repaired/moved by MCP)
 *
 * All tests drive the REAL production pipeline (getMasterState →
 * buildMasterContract), the same pattern established in
 * tests/pine_p4a_integration.test.js — never a reimplementation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMasterState } from '../src/core/xauusd.js';
import { buildMasterContract } from '../src/core/master_contract.js';

const MASTER_NAME = 'XAUUSD Adaptive Master';

const BASE_FIELDS = [
  ['CONTRACT_VERSION', '1'], ['INDICATOR_VERSION', '0.3.0'], ['SYMBOL', 'OANDA:XAUUSD'],
  ['EXECUTION_TF', '15'], ['CONTEXT_TF', '60'], ['BAR_TIME', '1700000000000'], ['BAR_INDEX', '500'],
  ['BAR_CONFIRMED', '1'], ['REGIME', 'BULL_TREND'], ['CORRECTION_STATE', 'NONE'], ['CORRECTION_REASON', 'NA'],
  ['MODEL', 'TC'], ['SETUP_STATE', 'SETUP_READY'], ['TRIGGER_STATE', 'TRIGGER_CONFIRMED'], ['CONFIRMATION_STATE', 'CONFIRMED'],
  ['QUALITY', '78.5'], ['QUALITY_THRESHOLD', '65'], ['OVEREXTENSION_STATE', 'NONE'], ['RR_VALIDATION_STATE', 'ACCEPTABLE'],
  ['ACTION', 'BUY'], ['WAIT_REASON', 'NA'],
  ['ENTRY', '2650.25'], ['SL', '2645.00'], ['TP1', '2664.90'], ['TP2', '2675.00'], ['EXIT_TARGET', 'NA'], ['RR', '2.79'],
  ['SESSION', 'NEW_YORK'], ['SIGNAL_ID', 'TC_BULLISH_O495_T500'], ['SIGNAL_BAR_TIME', '1700000000000'],
  ['STRUCTURE_STATE', 'BULLISH'], ['LAST_STRUCTURE_EVENT', 'BULLISH_BOS'], ['LAST_STRUCTURE_EVENT_BAR', '500'],
  ['LAST_SWING_HIGH', '2648.00'], ['LAST_SWING_HIGH_TYPE', 'HH'], ['LAST_SWING_LOW', '2640.00'], ['LAST_SWING_LOW_TYPE', 'HL'],
  ['LAST_BOS_DIRECTION', 'BULLISH'], ['LAST_BOS_BAR', '500'], ['LAST_CHOCH_DIRECTION', 'NA'], ['LAST_CHOCH_BAR', 'NA'],
  ['LAST_SWEEP_TYPE', 'NA'], ['LAST_SWEEP_BAR', 'NA'], ['PDH', '2660.00'], ['PDL', '2630.00'], ['LAST_DAILY_SWEEP', 'NA'],
  ['DISPLACEMENT_STATE', 'NONE'], ['RANGE_STATE', 'NONE'], ['RANGE_HIGH', 'NA'], ['RANGE_LOW', 'NA'],
];

function buildRows(overrides = {}, omit = []) {
  const map = new Map(BASE_FIELDS);
  for (const [k, v] of Object.entries(overrides)) { if (v === undefined) map.delete(k); else map.set(k, v); }
  for (const k of omit) map.delete(k);
  return [...map.entries()].map(([k, v]) => `${k} | ${v}`);
}

function sellRows(overrides = {}, omit = []) {
  return buildRows({
    REGIME: 'BEAR_TREND', STRUCTURE_STATE: 'BEARISH', LAST_STRUCTURE_EVENT: 'BEARISH_BOS', LAST_BOS_DIRECTION: 'BEARISH',
    ACTION: 'SELL', SIGNAL_ID: 'TC_BEARISH_O495_T500',
    ENTRY: '2650.25', SL: '2655.50', TP1: '2635.60', TP2: '2625.00', RR: '2.79',
    ...overrides,
  }, omit);
}

function waitRows(overrides = {}, omit = []) {
  return buildRows({
    MODEL: 'NA', SETUP_STATE: 'NO_SETUP', TRIGGER_STATE: 'NO_TRIGGER', CONFIRMATION_STATE: 'PENDING',
    QUALITY: 'NA', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT', WAIT_REASON: 'NO_SETUP',
    ENTRY: 'NA', SL: 'NA', TP1: 'NA', TP2: 'NA', RR: 'NA', SIGNAL_ID: 'NA', SIGNAL_BAR_TIME: 'NA',
    ...overrides,
  }, omit);
}

function depsFor(rows, { studyName = MASTER_NAME } = {}) {
  return {
    getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: [{ id: 's1', name: MASTER_NAME }] }),
    getPineTables: async () => ({ success: true, studies: [{ name: studyName, tables: [{ rows }] }] }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// §1 STRICT BAR_CONFIRMED CONTRACT
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §1: strict BAR_CONFIRMED — only the frozen Pine literal "1" authorizes a trade', () => {
  it('BAR_CONFIRMED="1" (canonical, frozen Pine\'s exclusive true encoding) → BUY proceeds when all other gates pass', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '1' })) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="0" → no actionable trade (SOURCE_UNCONFIRMED)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '0' })) });
    assert.equal(result.status, 'SOURCE_UNCONFIRMED');
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="TRUE" (previously accepted; not the frozen Pine wire value) → no longer authorizes a trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: 'TRUE' })) });
    assert.notEqual(result.status, 'OK');
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="true" (lowercase) → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: 'true' })) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="yes" → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: 'yes' })) });
    assert.notEqual(result.decision.action, 'BUY');
    assert.notEqual(result.status, 'OK');
  });

  it('BAR_CONFIRMED="on" → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: 'on' })) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="2" (a non-empty, non-"1" numeric string) → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '2' })) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED empty string → no actionable trade (missing, not fabricated as true)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '' })) });
    assert.notEqual(result.decision.action, 'BUY');
    assert.notEqual(result.status, 'OK');
  });

  it('BAR_CONFIRMED whitespace-only → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '   ' })) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED omitted entirely → no actionable trade', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['BAR_CONFIRMED'])) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED=" 1 " (canonical token with surrounding whitespace, trimmed per the documented normalizeNA rule) → still authorizes, since trimming is the one documented normalization applied to every field', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: ' 1 ' })) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED="TRUE" with surrounding whitespace still does not authorize — trimming does not turn "TRUE" into "1"', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '  TRUE  ' })) });
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('source proof: parseBarConfirmed only accepts the exact string "1" — direct unit-level proof via buildMasterContract', () => {
    for (const bad of ['0', 'true', 'TRUE', 'yes', 'on', '2', '', '  ', 'YES', 'confirmed']) {
      const contract = buildMasterContract({ rows: buildRows({ BAR_CONFIRMED: bad }) });
      assert.notEqual(contract.decision.action, 'BUY', `BAR_CONFIRMED="${bad}" must not authorize BUY`);
    }
    const good = buildMasterContract({ rows: buildRows({ BAR_CONFIRMED: '1' }) });
    assert.equal(good.decision.action, 'BUY');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §2/§7 MCP CONTRACT GEOMETRY VALIDATION — BUY
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §2/§7: BUY price-geometry validation — full pipeline', () => {
  it('SL < ENTRY → structurally valid (baseline passes)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ SL: '2645.00' })) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'BUY');
  });
  it('SL == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ SL: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
    assert.notEqual(result.decision.action, 'BUY');
  });
  it('SL > ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ SL: '2655.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('TP1 > ENTRY → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP1: '2664.90' })) });
    assert.equal(result.status, 'OK');
  });
  it('TP1 == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP1: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('TP1 < ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP1: '2640.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('TP2 > ENTRY (when present) → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2675.00' })) });
    assert.equal(result.status, 'OK');
  });
  it('TP2 == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('TP2 < ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2600.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('EXIT_TARGET > ENTRY (when present instead of TP2) → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: undefined, EXIT_TARGET: '2680.00' }, ['TP2'])) });
    assert.equal(result.status, 'OK');
  });
  it('EXIT_TARGET == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ EXIT_TARGET: '2650.25' }, ['TP2'])) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('EXIT_TARGET < ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ EXIT_TARGET: '2600.00' }, ['TP2'])) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('both TP2 and EXIT_TARGET present and valid → OK (both validated, neither discarded)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2675.00', EXIT_TARGET: '2680.00' })) });
    assert.equal(result.status, 'OK');
  });
  it('TP2 valid but EXIT_TARGET invalid (both present) → CONTRACT_CONTRADICTION — EXIT_TARGET is not silently discarded because TP2 passed', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2675.00', EXIT_TARGET: '2600.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('EXIT_TARGET valid but TP2 invalid (both present) → CONTRACT_CONTRADICTION — TP2 is not silently discarded because EXIT_TARGET passed', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ TP2: '2600.00', EXIT_TARGET: '2680.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §2/§7 MCP CONTRACT GEOMETRY VALIDATION — SELL (symmetric, independent fixture)
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §2/§7: SELL price-geometry validation — full pipeline, no shared BUY assumptions', () => {
  it('SL > ENTRY → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ SL: '2655.50' })) });
    assert.equal(result.status, 'OK');
  });
  it('SL == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ SL: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('SL < ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ SL: '2645.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('TP1 < ENTRY → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP1: '2635.60' })) });
    assert.equal(result.status, 'OK');
  });
  it('TP1 == ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP1: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('TP1 > ENTRY → CONTRACT_CONTRADICTION', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP1: '2660.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('TP2 < ENTRY (when present) → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP2: '2625.00' })) });
    assert.equal(result.status, 'OK');
  });
  it('TP2 >= ENTRY → CONTRACT_CONTRADICTION (equal case)', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP2: '2650.25' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('TP2 >= ENTRY → CONTRACT_CONTRADICTION (greater case)', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP2: '2700.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });

  it('EXIT_TARGET < ENTRY (when present instead of TP2) → valid', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP2: undefined, EXIT_TARGET: '2620.00' }, ['TP2'])) });
    assert.equal(result.status, 'OK');
  });
  it('EXIT_TARGET >= ENTRY → CONTRACT_CONTRADICTION (equal case)', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ EXIT_TARGET: '2650.25' }, ['TP2'])) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
  it('EXIT_TARGET >= ENTRY → CONTRACT_CONTRADICTION (greater case)', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ EXIT_TARGET: '2700.00' }, ['TP2'])) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §5 WAIT must remain unaffected
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §5: WAIT with all-NA trade fields is unaffected by geometry validation', () => {
  it('valid WAIT with ENTRY/SL/TP1/TP2/EXIT_TARGET/RR all NA → status OK, action WAIT, nothing fabricated', async () => {
    const result = await getMasterState({ _deps: depsFor(waitRows()) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'WAIT');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) assert.equal(result.decision[f], null);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §6 No-fabrication re-audit (geometry-specific)
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §6: no-fabrication re-audit — geometry violations are never repaired', () => {
  it('invalid BUY geometry (SL above entry) is reported as a contradiction, never silently corrected to a valid SL', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ SL: '2655.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
    // The rejected contract carries no decision prices at all — MCP never
    // substitutes a "corrected" SL value.
    assert.equal(result.decision.stop_loss, null);
    assert.ok(result.contradictions.some((c) => c.includes('2655')), 'the exact offending parsed value must be visible in the contradiction message, not silently replaced');
  });

  it('invalid SELL geometry (TP1 above entry) is reported, never repaired', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows({ TP1: '2660.00' })) });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
    assert.equal(result.decision.tp1, null);
  });

  it('missing SL on an otherwise-valid BUY is never inferred from ENTRY/ATR/OHLCV — remains MALFORMED_CONTRACT, not a geometry contradiction', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['SL'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing TP1/TP2/EXIT_TARGET cannot be synthesized from RR + ENTRY + SL', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['TP1', 'TP2', 'EXIT_TARGET'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
    assert.equal(result.decision.tp1, null);
  });

  it('RR is never used to back-calculate a missing target even when ENTRY/SL are present and RR is present', async () => {
    // ENTRY, SL, RR all present; TP1/TP2/EXIT_TARGET all missing — RR alone
    // must never be used to derive what TP1 "should" be.
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['TP1', 'TP2', 'EXIT_TARGET'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('current OHLCV/market data is never consulted to repair or override geometry (getMasterState never calls OHLCV/quote deps at all)', async () => {
    const spyDeps = {
      ...depsFor(buildRows({ SL: '2655.00' })),
      getOhlcv: async () => { throw new Error('must never be called'); },
      getQuote: async () => { throw new Error('must never be called'); },
    };
    const result = await getMasterState({ _deps: spyDeps });
    assert.equal(result.status, 'CONTRACT_CONTRADICTION');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §3 RR consistency — audit-only proof (no new RR formula was added)
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §3: RR consistency audit proof (documented behavior, unchanged by this review)', () => {
  it('RR is required to be present/finite (structural completeness) — a BUY missing RR is MALFORMED_CONTRACT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['RR'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('RR is ALSO cross-checked against supplied geometry via rr_check, but this is informational only — a mismatch does not by itself change status away from OK', async () => {
    // ENTRY 2650.25, SL 2645.00 (risk 5.25), TP1 2664.90 (reward 14.65) →
    // mcp_calculated_rr ≈ 2.79, matching the reported RR closely (consistent).
    // Now report a wildly different RR while keeping geometry itself valid —
    // this must NOT become a geometry contradiction (geometry only checks
    // directional sign, never Pine's numeric RR claim), and must not change
    // `status` away from OK; it only affects the informational rr_check.
    const result = await getMasterState({ _deps: depsFor(buildRows({ RR: '99.0' })) });
    assert.equal(result.status, 'OK', 'a numeric RR mismatch is informational-only, not a gating contradiction — unchanged Phase 2B behavior');
    assert.equal(result.rr_check.pine_reported_rr, 99.0);
    assert.equal(result.rr_check.consistent, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §8 Preserve P4A study/table hardening — regression proof
// ═══════════════════════════════════════════════════════════════════════
describe('P4A review §8: study/table hardening regression (must not regress the prior P4A fixes)', () => {
  it('no fallback to first study: a table-read response under an unrelated study name is never read as the contract', async () => {
    const deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: [{ id: 's1', name: MASTER_NAME }] }),
      getPineTables: async () => ({ success: true, studies: [{ name: 'Unrelated Indicator', tables: [{ rows: buildRows() }] }] }),
    };
    const result = await getMasterState({ _deps: deps });
    assert.notEqual(result.status, 'OK');
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('multiple candidate contract tables in the same study → AMBIGUOUS, never guesses the first', async () => {
    const deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: [{ id: 's1', name: MASTER_NAME }] }),
      getPineTables: async () => ({ success: true, studies: [{ name: MASTER_NAME, tables: [{ rows: buildRows() }, { rows: buildRows({ ACTION: 'SELL' }) }] }] }),
    };
    const result = await getMasterState({ _deps: deps });
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.candidate_table_count, 2);
  });

  it('0 exact study-name matches → fails closed (NOT_FOUND), never a partial/fuzzy match', async () => {
    const deps = { getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: [{ id: 's1', name: 'XAUUSD Adaptive Master Pro' }] }) };
    const result = await getMasterState({ _deps: deps });
    assert.equal(result.status, 'NOT_FOUND');
  });
});
