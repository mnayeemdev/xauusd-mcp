/**
 * Pine P4A — real Pine ↔ MCP integration foundation.
 *
 * Exercises the REAL production pipeline end-to-end:
 *
 *   raw TradingView-shaped table rows (exactly what src/core/data.js's
 *   getPineTables() returns: { studies: [{ name, tables: [{ rows: [...] }] }] })
 *   → getMasterState() [src/core/xauusd.js: discovery, exact-match study/table
 *     selection, no-fabrication]
 *   → buildMasterContract() [src/core/master_contract.js: normalize/parse/validate]
 *   → the final xauusd_master_state-shaped payload.
 *
 * These tests import and call the actual production functions — they do not
 * reimplement the parser or the discovery logic. A faithful JS reference
 * model is used ONLY where noted, purely for an independent expected-value
 * cross-check, never as the thing under test.
 *
 * Fixtures mirror the frozen P3 Pine source's actual contract table
 * (pine/XAUUSD_Adaptive_Master.pine, rows 0–49) field-for-field and in the
 * same order Pine emits them, per the field inventory in docs/PINE_P4A.md.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getMasterState } from '../src/core/xauusd.js';
import { buildMasterContract, parseTableRows } from '../src/core/master_contract.js';

const MASTER_NAME = 'XAUUSD Adaptive Master';

// ── Fixture builder: exact field order/casing the frozen Pine source emits ──
const BASE_FIELDS = [
  ['CONTRACT_VERSION', '1'],
  ['INDICATOR_VERSION', '0.3.0'],
  ['SYMBOL', 'OANDA:XAUUSD'],
  ['EXECUTION_TF', '15'],
  ['CONTEXT_TF', '60'],
  ['BAR_TIME', '1700000000000'],
  ['BAR_INDEX', '500'],
  ['BAR_CONFIRMED', '1'],
  ['REGIME', 'BULL_TREND'],
  ['CORRECTION_STATE', 'NONE'],
  ['CORRECTION_REASON', 'NA'],
  ['MODEL', 'TC'],
  ['SETUP_STATE', 'SETUP_READY'],
  ['TRIGGER_STATE', 'TRIGGER_CONFIRMED'],
  ['CONFIRMATION_STATE', 'CONFIRMED'],
  ['QUALITY', '78.5'],
  ['QUALITY_THRESHOLD', '65'],
  ['OVEREXTENSION_STATE', 'NONE'],
  ['RR_VALIDATION_STATE', 'ACCEPTABLE'],
  ['ACTION', 'BUY'],
  ['WAIT_REASON', 'NA'],
  ['ENTRY', '2650.25'],
  ['SL', '2645.00'],
  ['TP1', '2664.90'],
  ['TP2', '2675.00'],
  ['EXIT_TARGET', 'NA'],
  ['RR', '2.79'],
  ['SESSION', 'NEW_YORK'],
  ['SIGNAL_ID', 'TC_BULLISH_O495_T500'],
  ['SIGNAL_BAR_TIME', '1700000000000'],
  ['STRUCTURE_STATE', 'BULLISH'],
  ['LAST_STRUCTURE_EVENT', 'BULLISH_BOS'],
  ['LAST_STRUCTURE_EVENT_BAR', '500'],
  ['LAST_SWING_HIGH', '2648.00'],
  ['LAST_SWING_HIGH_TYPE', 'HH'],
  ['LAST_SWING_LOW', '2640.00'],
  ['LAST_SWING_LOW_TYPE', 'HL'],
  ['LAST_BOS_DIRECTION', 'BULLISH'],
  ['LAST_BOS_BAR', '500'],
  ['LAST_CHOCH_DIRECTION', 'NA'],
  ['LAST_CHOCH_BAR', 'NA'],
  ['LAST_SWEEP_TYPE', 'NA'],
  ['LAST_SWEEP_BAR', 'NA'],
  ['PDH', '2660.00'],
  ['PDL', '2630.00'],
  ['LAST_DAILY_SWEEP', 'NA'],
  ['DISPLACEMENT_STATE', 'NONE'],
  ['RANGE_STATE', 'NONE'],
  ['RANGE_HIGH', 'NA'],
  ['RANGE_LOW', 'NA'],
];

function buildRows(overrides = {}, omit = []) {
  const map = new Map(BASE_FIELDS);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) map.delete(k); else map.set(k, v);
  }
  for (const k of omit) map.delete(k);
  return [...map.entries()].map(([k, v]) => `${k} | ${v}`);
}

function waitRows(overrides = {}, omit = []) {
  return buildRows({
    MODEL: 'NA', SETUP_STATE: 'NO_SETUP', TRIGGER_STATE: 'NO_TRIGGER', CONFIRMATION_STATE: 'PENDING',
    QUALITY: 'NA', OVEREXTENSION_STATE: 'NONE', RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT', WAIT_REASON: 'NO_SETUP',
    ENTRY: 'NA', SL: 'NA', TP1: 'NA', TP2: 'NA', RR: 'NA',
    SIGNAL_ID: 'NA', SIGNAL_BAR_TIME: 'NA',
    ...overrides,
  }, omit);
}

function sellRows(overrides = {}, omit = []) {
  return buildRows({
    REGIME: 'BEAR_TREND', STRUCTURE_STATE: 'BEARISH',
    LAST_STRUCTURE_EVENT: 'BEARISH_BOS', LAST_BOS_DIRECTION: 'BEARISH',
    ACTION: 'SELL', SIGNAL_ID: 'TC_BEARISH_O495_T500',
    ENTRY: '2650.25', SL: '2655.50', TP1: '2635.60', TP2: '2625.00', RR: '2.79',
    ...overrides,
  }, omit);
}

// ── Transport helper: wraps rows into the exact shape getPineTables()
// returns, and getState() into the exact shape chart_get_state returns —
// this is the real wire shape, not a shortcut. ─────────────────────────────
function depsFor(rows, { studyName = MASTER_NAME, extraTables = [], multiStudy = false } = {}) {
  return {
    getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: multiStudy
      ? [{ id: 's1', name: MASTER_NAME }]
      : [{ id: 's1', name: studyName }] }),
    getPineTables: async () => ({
      success: true,
      studies: [{ name: studyName, tables: [{ rows }, ...extraTables] }],
    }),
  };
}

describe('P4A §26 WAIT contract — full pipeline (raw rows → getMasterState)', () => {
  it('a complete, realistic WAIT fixture: status OK, action WAIT, no numeric trade field fabricated, context preserved', async () => {
    const result = await getMasterState({ _deps: depsFor(waitRows()) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'WAIT');
    assert.equal(result.decision.wait_reason, 'NO_SETUP');
    for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) {
      assert.equal(result.decision[f], null, `${f} must not be fabricated on a WAIT`);
    }
    assert.equal(result.market.regime, 'BULL_TREND');
    assert.equal(result.structure.last_bos_direction, 'BULLISH');
    assert.equal(result.contract_version, 1);
  });
});

describe('P4A §27 BUY contract — full pipeline, exact-equality proof (no recalculation, no repair)', () => {
  it('a complete, realistic BUY fixture passes every raw Pine value through unchanged', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows()) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'BUY');
    assert.equal(result.decision.entry, 2650.25);
    assert.equal(result.decision.stop_loss, 2645.00);
    assert.equal(result.decision.tp1, 2664.90);
    assert.equal(result.decision.tp2, 2675.00);
    assert.equal(result.decision.rr, 2.79);
    assert.equal(result.setup.model, 'TC');
    assert.equal(result.market.regime, 'BULL_TREND');
    assert.equal(result.setup.quality, 78.5);
    assert.equal(result.signal.signal_id, 'TC_BULLISH_O495_T500');
    assert.equal(result.signal.signal_bar_time, 1700000000000);
    assert.equal(result.market.timeframe, '15', 'chart-derived timeframe (from getState), not the Pine EXECUTION_TF row');
  });
});

describe('P4A §28 SELL contract — same pipeline, no shared BUY assumptions, correct geometry', () => {
  it('a complete, realistic SELL fixture passes through with SELL-side geometry (SL above entry, TP below)', async () => {
    const result = await getMasterState({ _deps: depsFor(sellRows()) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'SELL');
    assert.equal(result.decision.entry, 2650.25);
    assert.equal(result.decision.stop_loss, 2655.50, 'SELL stop must be above entry');
    assert.equal(result.decision.tp1, 2635.60, 'SELL target must be below entry');
    assert.ok(result.decision.stop_loss > result.decision.entry);
    assert.ok(result.decision.tp1 < result.decision.entry);
    assert.equal(result.market.regime, 'BEAR_TREND');
  });
});

describe('P4A §29 contradiction adversarial tests — full pipeline, fail closed, never downgraded to a different trade', () => {
  const cases = [
    ['CORRECTION_STATE=ACTIVE blocks BUY', { CORRECTION_STATE: 'ACTIVE' }],
    ['OVEREXTENSION_STATE=OVEREXTENDED blocks BUY', { OVEREXTENSION_STATE: 'OVEREXTENDED' }],
    ['OVEREXTENSION_STATE=ENTRY_LATE blocks BUY', { OVEREXTENSION_STATE: 'ENTRY_LATE' }],
    ['RR_VALIDATION_STATE=RR_NOT_ACCEPTABLE blocks BUY', { RR_VALIDATION_STATE: 'RR_NOT_ACCEPTABLE' }],
    ['QUALITY below QUALITY_THRESHOLD blocks BUY', { QUALITY: '64.9' }],
  ];
  for (const [label, overrides] of cases) {
    it(label, async () => {
      const result = await getMasterState({ _deps: depsFor(buildRows(overrides)) });
      assert.equal(result.status, 'CONTRACT_CONTRADICTION');
      assert.notEqual(result.decision.action, 'BUY');
      assert.notEqual(result.decision.action, 'SELL');
      assert.ok(result.contradictions.length > 0);
    });
  }

  it('BAR_CONFIRMED=0 (false) blocks BUY with SOURCE_UNCONFIRMED, not a contradiction or a silent WAIT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: '0' })) });
    assert.equal(result.status, 'SOURCE_UNCONFIRMED');
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('BAR_CONFIRMED malformed ("yes") cannot become an actionable trade (parses to false, still SOURCE_UNCONFIRMED — never ambiguous-truthy)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ BAR_CONFIRMED: 'yes' })) });
    assert.notEqual(result.status, 'OK');
    assert.notEqual(result.decision.action, 'BUY');
  });
});

describe('P4A §25/§30 malformed-table / no-fabrication adversarial tests — full pipeline', () => {
  it('table not found (indicator present, zero tables) → NO_CONTRACT, action UNKNOWN', async () => {
    const result = await getMasterState({ _deps: depsFor([]) });
    assert.equal(result.status, 'NO_CONTRACT');
    assert.equal(result.decision.action, 'UNKNOWN');
  });

  it('multiple candidate contract tables in the same study → fails closed (AMBIGUOUS), never guesses the first', async () => {
    const deps = depsFor(buildRows(), { extraTables: [{ rows: buildRows({ ACTION: 'SELL', SIGNAL_ID: 'DIFFERENT_SIGNAL' }) }] });
    const result = await getMasterState({ _deps: deps });
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.candidate_table_count, 2);
    assert.notEqual(result.decision.action, 'BUY');
    assert.notEqual(result.decision.action, 'SELL');
  });

  it('wrong study (table read returns a study under a different name than the confirmed discovery match) is never read as the contract — NOT a "first study" fallback', async () => {
    // Discovery confirms "XAUUSD Adaptive Master" exists on the chart, but
    // the table-read response comes back naming a DIFFERENT study (e.g. a
    // CDP/study_filter quirk). The production code must not fall back to
    // reading it as if it were the confirmed indicator.
    const deps = {
      getState: async () => ({ symbol: 'OANDA:XAUUSD', resolution: '15', studies: [{ id: 's1', name: MASTER_NAME }] }),
      getPineTables: async () => ({ success: true, studies: [{ name: 'Some Unrelated Indicator', tables: [{ rows: buildRows({ ACTION: 'BUY' }) }] }] }),
    };
    const result = await getMasterState({ _deps: deps });
    assert.notEqual(result.status, 'OK');
    assert.notEqual(result.decision.action, 'BUY');
    assert.notEqual(result.decision.action, 'SELL');
  });

  it('duplicate key in the raw table → MALFORMED_CONTRACT through the full pipeline, never picks one silently', async () => {
    const rows = [...buildRows(), 'ACTION | SELL']; // ACTION appears twice
    const result = await getMasterState({ _deps: depsFor(rows) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
    assert.notEqual(result.decision.action, 'BUY');
    assert.notEqual(result.decision.action, 'SELL');
  });

  it('blank key in the raw table → MALFORMED_CONTRACT', async () => {
    const rows = [...buildRows(), ' | 123'];
    const result = await getMasterState({ _deps: depsFor(rows) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing CONTRACT_VERSION anchor row → NO_CONTRACT through getMasterState (the table can\'t even be identified as the contract table without its anchor row — this is the discovery layer\'s CONTRACT_TABLE_ANCHOR mechanism working as designed, not a parser defect)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['CONTRACT_VERSION'])) });
    assert.equal(result.status, 'NO_CONTRACT');
    assert.notEqual(result.decision.action, 'BUY');
  });

  it('missing CONTRACT_VERSION KEY, when rows reach the parser directly (bypassing the anchor-based table selection) → MALFORMED_CONTRACT — proves the parser itself still independently requires it', () => {
    const rows = buildRows({}, ['CONTRACT_VERSION']);
    const contract = buildMasterContract({ rows });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
  });

  it('unsupported CONTRACT_VERSION → UNSUPPORTED_CONTRACT_VERSION, never coerced to the supported one', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ CONTRACT_VERSION: '2' })) });
    assert.equal(result.status, 'UNSUPPORTED_CONTRACT_VERSION');
  });

  it('blank numeric field (ENTRY | ) on a BUY → MALFORMED_CONTRACT, not fabricated as 0', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ ENTRY: '' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
    assert.ok(result.invalid_fields.includes('ENTRY') || result.warnings.some((w) => w.includes('ENTRY')));
  });

  it('whitespace-only numeric field on a BUY → MALFORMED_CONTRACT, not fabricated as 0', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ ENTRY: '   ' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('NaN-producing numeric field (garbage text) on a BUY → MALFORMED_CONTRACT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ QUALITY: 'abc' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('Infinity-producing numeric field on a BUY → MALFORMED_CONTRACT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ RR: 'Infinity' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('malformed QUALITY on a BUY → MALFORMED_CONTRACT (locale separators rejected, never mis-parsed)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({ QUALITY: '1,234.56' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing SIGNAL_ID on a BUY → MALFORMED_CONTRACT (required trade field)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['SIGNAL_ID'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing SIGNAL_BAR_TIME on a BUY → MALFORMED_CONTRACT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['SIGNAL_BAR_TIME'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing ENTRY on a BUY → MALFORMED_CONTRACT (never inferred from current price)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['ENTRY'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing SL on a BUY → MALFORMED_CONTRACT (never calculated)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['SL'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing TP1 on a BUY → MALFORMED_CONTRACT', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['TP1'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing both TP2 and EXIT_TARGET on a BUY → MALFORMED_CONTRACT (no exit objective at all)', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['TP2', 'EXIT_TARGET'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('unknown WAIT_REASON string → MALFORMED_CONTRACT, never substituted with a valid one', async () => {
    const result = await getMasterState({ _deps: depsFor(waitRows({ WAIT_REASON: 'MADE_UP_REASON' })) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });

  it('missing WAIT_REASON on an otherwise-valid WAIT still resolves (WAIT_REASON defaults to UNKNOWN, never fabricated as a specific reason)', async () => {
    const result = await getMasterState({ _deps: depsFor(waitRows({}, ['WAIT_REASON'])) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'WAIT');
    assert.equal(result.decision.wait_reason, 'UNKNOWN');
  });

  it('no-fabrication proof: missing MODEL on a BUY is never inferred from REGIME', async () => {
    const result = await getMasterState({ _deps: depsFor(buildRows({}, ['MODEL'])) });
    assert.equal(result.status, 'MALFORMED_CONTRACT');
  });
});

describe('P4A §31 table order independence / duplicate-key robustness', () => {
  it('a BUY fixture with rows in RANDOM order produces the identical parsed result as the canonical order', async () => {
    const canonical = await getMasterState({ _deps: depsFor(buildRows()) });
    const rows = buildRows();
    // Deterministic shuffle (reverse + interleave) — not relying on Math.random
    // so a failure is always reproducible.
    const shuffled = rows.slice().sort((a, b) => (a.charCodeAt(3) || 0) - (b.charCodeAt(3) || 0));
    const shuffledResult = await getMasterState({ _deps: depsFor(shuffled) });
    assert.deepEqual(shuffledResult.decision, canonical.decision, 'row order must never affect the parsed decision');
    assert.deepEqual(shuffledResult.market, canonical.market, 'row order must never affect parsed market context');
    assert.equal(shuffledResult.status, canonical.status);
  });

  it('duplicate keys still fail regardless of row order (duplicate at the start vs. the end)', async () => {
    const dupAtEnd = [...buildRows(), 'MODEL | PB'];
    const dupAtStart = ['MODEL | PB', ...buildRows()];
    const r1 = await getMasterState({ _deps: depsFor(dupAtEnd) });
    const r2 = await getMasterState({ _deps: depsFor(dupAtStart) });
    assert.equal(r1.status, 'MALFORMED_CONTRACT');
    assert.equal(r2.status, 'MALFORMED_CONTRACT');
  });

  it('an unknown additive context key never overrides a known key and is otherwise harmlessly ignored', async () => {
    const rows = [...buildRows(), 'SOME_FUTURE_FIELD | whatever'];
    const result = await getMasterState({ _deps: depsFor(rows) });
    assert.equal(result.status, 'OK');
    assert.equal(result.decision.action, 'BUY');
    assert.equal(result.decision.entry, 2650.25, 'a genuinely unknown key must never shadow/override ENTRY');
  });
});

describe('P4A normalizer/parser layer — direct production-function proof (parseTableRows)', () => {
  it('parseTableRows is the actual normalizer used by buildMasterContract — proven by re-deriving the same fields map', () => {
    const rows = buildRows();
    const { fields, duplicateKeys, malformedRows } = parseTableRows(rows);
    assert.equal(duplicateKeys.length, 0);
    assert.equal(malformedRows.length, 0);
    assert.equal(fields.ACTION, 'BUY');
    assert.equal(fields.ENTRY, '2650.25');
    // Cross-check: buildMasterContract, given the SAME rows, produces a
    // decision consistent with this exact fields map (proves the two
    // production functions are not out of sync with each other).
    const contract = buildMasterContract({ rows });
    assert.equal(contract.decision.entry, Number(fields.ENTRY));
  });
});
