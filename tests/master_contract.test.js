/**
 * Phase 2B: XAUUSD Adaptive Master ↔ MCP contract parser/validator tests.
 *
 * These are pure unit tests against src/core/master_contract.js using
 * deterministic fixtures — no CDP/TradingView connection, and NOT pretending
 * a live Pine indicator was tested (it doesn't exist yet; see
 * docs/XAUUSD_ADAPTIVE_MASTER.md "Pine transport design"). Every fixture
 * below is a hand-built array of "KEY | VALUE" strings, exactly the shape
 * core/data.js:getPineTables() produces from a two-column Pine table.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMasterContract, parseTableRows, WAIT_REASONS, ACTIONS, SUPPORTED_CONTRACT_VERSIONS } from '../src/core/master_contract.js';

// ── Fixture builder ──────────────────────────────────────────────────────
// Builds "KEY | VALUE" rows from an object, in a fixed sensible order.
// `NA` (or omitting a key) represents "not supplied" for that field.
function rows(fields) {
  return Object.entries(fields).map(([k, v]) => `${k} | ${v ?? 'NA'}`);
}

function baseWaitFields(overrides = {}) {
  return {
    CONTRACT_VERSION: 1,
    INDICATOR_VERSION: '0.1.0',
    EXECUTION_TF: '30',
    CONTEXT_TF: '60',
    BAR_TIME: 1700000000,
    BAR_INDEX: 1234,
    BAR_CONFIRMED: 1,
    REGIME: 'BULL_TREND',
    CORRECTION_STATE: 'NONE',
    CORRECTION_REASON: 'NA',
    MODEL: 'PB',
    SETUP_STATE: 'NONE',
    TRIGGER_STATE: 'NONE',
    CONFIRMATION_STATE: 'NONE',
    QUALITY: 'NA',
    QUALITY_THRESHOLD: 70,
    OVEREXTENSION_STATE: 'NONE',
    RR_VALIDATION_STATE: 'NA',
    ACTION: 'WAIT',
    WAIT_REASON: 'NO_GOOD_ENTRY',
    ENTRY: 'NA', SL: 'NA', TP1: 'NA', TP2: 'NA', EXIT_TARGET: 'NA', RR: 'NA',
    SESSION: 'LONDON',
    SIGNAL_ID: 'NA',
    SIGNAL_BAR_TIME: 'NA',
    STATE_REASON: 'NA',
    ...overrides,
  };
}

function baseTradeFields(action, overrides = {}) {
  return {
    ...baseWaitFields(),
    REGIME: action === 'BUY' ? 'BULL_TREND' : 'BEAR_TREND',
    CORRECTION_STATE: 'NONE',
    SETUP_STATE: 'CONFIRMED',
    TRIGGER_STATE: 'CONFIRMED',
    CONFIRMATION_STATE: 'CONFIRMED',
    QUALITY: 85,
    OVEREXTENSION_STATE: 'NONE',
    RR_VALIDATION_STATE: 'ACCEPTABLE',
    ACTION: action,
    WAIT_REASON: 'NA',
    ENTRY: action === 'BUY' ? 100 : 200,
    SL: action === 'BUY' ? 95 : 205,
    TP1: action === 'BUY' ? 110 : 190,
    TP2: action === 'BUY' ? 120 : 180,
    EXIT_TARGET: 'NA',
    RR: 2.0,
    SIGNAL_ID: 'sig-001',
    SIGNAL_BAR_TIME: 1700000000,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Parser primitives
// ═══════════════════════════════════════════════════════════════════════

describe('parseTableRows', () => {
  it('parses well-formed KEY | VALUE rows', () => {
    const { fields, duplicateKeys, malformedRows } = parseTableRows(['ACTION | WAIT', 'ENTRY | NA']);
    assert.deepEqual(fields, { ACTION: 'WAIT', ENTRY: 'NA' });
    assert.deepEqual(duplicateKeys, []);
    assert.deepEqual(malformedRows, []);
  });

  it('detects duplicate keys', () => {
    const { duplicateKeys } = parseTableRows(['ACTION | WAIT', 'ACTION | BUY']);
    assert.deepEqual(duplicateKeys, ['ACTION']);
  });

  it('detects malformed rows (wrong column count)', () => {
    const { malformedRows } = parseTableRows(['ACTION', 'A | B | C', 'ENTRY | 100']);
    assert.equal(malformedRows.length, 2);
  });

  it('is case-insensitive on keys (normalizes to uppercase)', () => {
    const { fields } = parseTableRows(['action | WAIT']);
    assert.equal(fields.ACTION, 'WAIT');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 15: WAIT must be first-class — every reserved reason stays WAIT
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §15: WAIT is first-class for every reserved reason', () => {
  const waitReasonsToTest = WAIT_REASONS.filter((r) => r !== 'UNKNOWN');
  assert.equal(waitReasonsToTest.length, 13, 'expected exactly the 13 named reasons plus UNKNOWN');

  for (const reason of waitReasonsToTest) {
    it(`WAIT_REASON=${reason} → status OK, decision.action=WAIT, no trade prices invented`, () => {
      const contract = buildMasterContract({ rows: rows(baseWaitFields({ WAIT_REASON: reason })), chartSymbol: 'OANDA:XAUUSD', chartTimeframe: '30' });
      assert.equal(contract.status, 'OK');
      assert.equal(contract.decision.action, 'WAIT');
      assert.equal(contract.decision.wait_reason, reason);
      for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'exit_target', 'rr']) {
        assert.equal(contract.decision[f], null, `${f} must be null for a WAIT decision`);
      }
    });
  }

  it('WAIT with an unspecified reason defaults to UNKNOWN, not fabricated', () => {
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ WAIT_REASON: 'NA' })) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'UNKNOWN');
  });

  it('an unrecognized WAIT_REASON string is rejected as MALFORMED_CONTRACT, never silently accepted', () => {
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ WAIT_REASON: 'SOMETHING_MADE_UP' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('WAIT_REASON'));
  });

  it('stray leftover trade prices in the table are ignored/nulled when action is WAIT', () => {
    // Simulates a Pine table that still has stale numeric cells from a
    // previous BUY signal even though ACTION has since reverted to WAIT.
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ ENTRY: 100, SL: 95, TP1: 110 })) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.entry, null, 'stale ENTRY must never leak through on a WAIT decision');
    assert.equal(contract.decision.stop_loss, null);
    assert.equal(contract.decision.tp1, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 16: valid BUY/SELL fixtures + adversarial cases
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §16: valid BUY/SELL fixtures', () => {
  for (const action of ['BUY', 'SELL']) {
    it(`valid ${action} reproduces every Pine value exactly`, () => {
      const fields = baseTradeFields(action);
      const contract = buildMasterContract({ rows: rows(fields), chartSymbol: 'OANDA:XAUUSD', chartTimeframe: '30' });
      assert.equal(contract.status, 'OK');
      assert.equal(contract.decision.action, action);
      assert.equal(contract.decision.entry, fields.ENTRY);
      assert.equal(contract.decision.stop_loss, fields.SL);
      assert.equal(contract.decision.tp1, fields.TP1);
      assert.equal(contract.decision.tp2, fields.TP2);
      assert.equal(contract.decision.rr, fields.RR);
      assert.equal(contract.setup.model, fields.MODEL);
      assert.equal(contract.market.regime, fields.REGIME);
      assert.equal(contract.setup.quality, fields.QUALITY);
      assert.equal(contract.signal.signal_id, fields.SIGNAL_ID);
      assert.equal(contract.signal.signal_bar_time, fields.SIGNAL_BAR_TIME);
      assert.equal(contract.signal.bar_confirmed, true);
      assert.equal(contract.market.symbol, 'OANDA:XAUUSD', 'symbol comes from chart_get_state, not Pine\'s own SYMBOL field');
    });

    it(`valid ${action} with EXIT_TARGET instead of TP2 is also accepted`, () => {
      const fields = baseTradeFields(action, { TP2: 'NA', EXIT_TARGET: action === 'BUY' ? 130 : 170 });
      const contract = buildMasterContract({ rows: rows(fields) });
      assert.equal(contract.status, 'OK');
      assert.equal(contract.decision.exit_target, fields.EXIT_TARGET);
      assert.equal(contract.decision.tp2, null);
    });

    it(`${action} includes an informational rr_check without overwriting Pine's own rr`, () => {
      const fields = baseTradeFields(action);
      const contract = buildMasterContract({ rows: rows(fields) });
      assert.ok(contract.rr_check);
      assert.equal(contract.rr_check.pine_reported_rr, fields.RR, 'Pine\'s RR value must never be overwritten');
      assert.equal(typeof contract.rr_check.mcp_calculated_rr, 'number');
      assert.equal(contract.decision.rr, fields.RR);
    });
  }

  const adversarial = [
    ['missing SL', (f) => { f.SL = 'NA'; }],
    ['missing ENTRY', (f) => { f.ENTRY = 'NA'; }],
    ['missing TP1', (f) => { f.TP1 = 'NA'; }],
    ['missing both TP2 and EXIT_TARGET', (f) => { f.TP2 = 'NA'; f.EXIT_TARGET = 'NA'; }],
    ['missing RR', (f) => { f.RR = 'NA'; }],
    ['missing MODEL', (f) => { f.MODEL = 'NA'; }],
    ['missing REGIME', (f) => { f.REGIME = 'NA'; }],
    ['missing QUALITY', (f) => { f.QUALITY = 'NA'; }],
    ['missing SIGNAL_ID', (f) => { f.SIGNAL_ID = 'NA'; }],
    ['missing SIGNAL_BAR_TIME', (f) => { f.SIGNAL_BAR_TIME = 'NA'; }],
    ['on unconfirmed bar', (f) => { f.BAR_CONFIRMED = 0; }],
    ['while correction active', (f) => { f.CORRECTION_STATE = 'ACTIVE'; }],
    ['while overextended', (f) => { f.OVEREXTENSION_STATE = 'OVEREXTENDED'; }],
    ['while entry late', (f) => { f.OVEREXTENSION_STATE = 'ENTRY_LATE'; }],
    ['with unacceptable RR', (f) => { f.RR_VALIDATION_STATE = 'RR_NOT_ACCEPTABLE'; }],
    ['below quality threshold', (f) => { f.QUALITY = 50; f.QUALITY_THRESHOLD = 70; }],
  ];

  for (const action of ['BUY', 'SELL']) {
    for (const [label, mutate] of adversarial) {
      it(`${action} ${label} → never becomes a valid trade`, () => {
        const fields = baseTradeFields(action);
        mutate(fields);
        const contract = buildMasterContract({ rows: rows(fields) });
        assert.notEqual(contract.status, 'OK', `${action} ${label} must not produce status OK`);
        assert.notEqual(contract.decision.action, 'BUY');
        assert.notEqual(contract.decision.action, 'SELL');
        assert.equal(contract.decision.action, 'UNKNOWN');
        for (const f of ['entry', 'stop_loss', 'tp1', 'tp2', 'rr']) {
          assert.equal(contract.decision[f], null, `${f} must not leak through on a rejected ${action}`);
        }
      });
    }
  }

  it('NaN literal in a numeric field → MALFORMED_CONTRACT', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { ENTRY: 'NaN' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('ENTRY'));
  });

  it('Infinity literal in a numeric field → MALFORMED_CONTRACT', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { TP1: 'Infinity' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('TP1'));
  });

  it('wrong numeric type (non-numeric garbage string) → MALFORMED_CONTRACT', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { RR: 'two-point-oh' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('RR'));
  });

  it('duplicate conflicting key → MALFORMED_CONTRACT (never picks either value)', () => {
    const goodRows = rows(baseTradeFields('BUY'));
    const withDuplicate = [...goodRows, 'ACTION | SELL'];
    const contract = buildMasterContract({ rows: withDuplicate });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('unknown ACTION enum value → MALFORMED_CONTRACT', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { ACTION: 'STRONG_BUY' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.ok(contract.invalid_fields.includes('ACTION'));
  });

  // ── Regression: found while validating Pine P1's contract emitter against
  // this parser. A field ROW ENTIRELY OMITTED (not even "NA") used to fall
  // through to Number('') === 0 in JS, silently turning a missing ENTRY
  // into a fabricated `entry: 0` on an otherwise "valid" BUY — exactly the
  // fabrication this contract exists to prevent. Fixed in normalizeNA().
  it('omitted ENTRY row (not "NA", entirely absent) on a BUY is rejected, never becomes entry: 0', () => {
    const fields = baseTradeFields('BUY');
    delete fields.ENTRY;
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.notEqual(contract.status, 'OK');
    assert.ok(contract.invalid_fields.includes('ENTRY'));
    assert.equal(contract.decision.entry, null, 'must never silently become 0');
    assert.notEqual(contract.decision.action, 'BUY');
  });

  it('omitted TP2 and EXIT_TARGET rows (both entirely absent) on a BUY are rejected, never satisfy the exit-target requirement via 0', () => {
    const fields = baseTradeFields('BUY');
    delete fields.TP2;
    delete fields.EXIT_TARGET;
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.notEqual(contract.status, 'OK');
    assert.ok(contract.invalid_fields.includes('TP2_OR_EXIT_TARGET'));
    assert.equal(contract.decision.tp2, null);
    assert.equal(contract.decision.exit_target, null);
  });

  it('an omitted WAIT_REASON row on a WAIT contract behaves identically to an explicit "NA" (defaults to UNKNOWN, never MALFORMED)', () => {
    const fields = baseWaitFields();
    delete fields.WAIT_REASON;
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.decision.wait_reason, 'UNKNOWN');
  });

  it('an omitted BAR_CONFIRMED row on a BUY is treated as NOT confirmed, same as explicit "NA" (fail-safe)', () => {
    const fields = baseTradeFields('BUY');
    delete fields.BAR_CONFIRMED;
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.equal(contract.status, 'SOURCE_UNCONFIRMED');
  });

  it('a present-but-empty value ("ENTRY | ") is treated identically to an omitted row and an explicit "NA"', () => {
    const goodRows = rows(baseTradeFields('BUY'));
    const withEmptyEntry = goodRows.map((r) => (r.startsWith('ENTRY |') ? 'ENTRY | ' : r));
    const contract = buildMasterContract({ rows: withEmptyEntry });
    assert.notEqual(contract.status, 'OK');
    assert.ok(contract.invalid_fields.includes('ENTRY'));
    assert.equal(contract.decision.entry, null);
  });

  it('unsupported contract version → UNSUPPORTED_CONTRACT_VERSION, no field parsing attempted', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { CONTRACT_VERSION: 99 })) });
    assert.equal(contract.status, 'UNSUPPORTED_CONTRACT_VERSION');
    assert.equal(contract.contract_version, 99);
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('missing CONTRACT_VERSION entirely → MALFORMED_CONTRACT', () => {
    const fields = baseTradeFields('BUY');
    delete fields.CONTRACT_VERSION;
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
  });

  it('SUPPORTED_CONTRACT_VERSIONS currently contains exactly [1]', () => {
    assert.deepEqual([...SUPPORTED_CONTRACT_VERSIONS], [1]);
  });

  it('ACTIONS enum is exactly WAIT/BUY/SELL/UNKNOWN', () => {
    assert.deepEqual([...ACTIONS].sort(), ['BUY', 'SELL', 'UNKNOWN', 'WAIT'].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 6/7/8/10: correction, confirmed-bar, overextension, quality
// invariants — explicit, isolated tests beyond the adversarial matrix above
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §6: correction safety', () => {
  it('correction_state=ACTIVE with a WAIT action is perfectly valid (not a contradiction)', () => {
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ CORRECTION_STATE: 'ACTIVE', WAIT_REASON: 'CORRECTION_ACTIVE' })) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
    assert.equal(contract.market.correction_state, 'ACTIVE');
  });

  it('correction_state=ACTIVE with BUY is flagged as a contradiction, never surfaced as a trade', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { CORRECTION_STATE: 'ACTIVE' })) });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
    assert.ok(contract.contradictions.some((c) => c.includes('correction')));
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('bullish/bearish raw data cannot be used to declare a correction finished — the parser never looks at OHLCV at all', () => {
    // The parser's only inputs are the table rows and chart symbol/timeframe;
    // there is no code path here that could even receive OHLCV data.
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ CORRECTION_STATE: 'ACTIVE' })) });
    assert.equal(contract.market.correction_state, 'ACTIVE');
    assert.equal(contract.decision.action, 'WAIT');
  });
});

describe('Phase 2B §7: confirmed-bar / non-repaint provenance', () => {
  it('BAR_CONFIRMED=0 with BUY → SOURCE_UNCONFIRMED, trade never surfaced', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { BAR_CONFIRMED: 0 })) });
    assert.equal(contract.status, 'SOURCE_UNCONFIRMED');
    assert.equal(contract.decision.action, 'UNKNOWN');
    assert.equal(contract.decision.entry, null);
  });

  it('BAR_CONFIRMED=NA (missing) with BUY → treated as NOT confirmed, fail safe', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { BAR_CONFIRMED: 'NA' })) });
    assert.equal(contract.status, 'SOURCE_UNCONFIRMED');
  });

  it('BAR_CONFIRMED=0 with WAIT is fine — confirmation only gates trades', () => {
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ BAR_CONFIRMED: 0 })) });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.decision.action, 'WAIT');
  });
});

describe('Phase 2B §8: entry-late / overextension contract', () => {
  for (const state of ['OVEREXTENDED', 'ENTRY_LATE']) {
    it(`overextension_state=${state} with BUY → contradiction, forced UNKNOWN, never a recalculated entry`, () => {
      const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { OVEREXTENSION_STATE: state })) });
      assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
      assert.equal(contract.decision.action, 'UNKNOWN');
      assert.equal(contract.decision.entry, null, 'MCP must not chase price or invent a new entry');
    });
  }

  it('overextension_state=NONE with BUY is unaffected', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { OVEREXTENSION_STATE: 'NONE' })) });
    assert.equal(contract.status, 'OK');
  });
});

describe('Phase 2B §10: quality contract', () => {
  it('quality below threshold with BUY → CONTRACT_CONTRADICTION, not silently fixed', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { QUALITY: 40, QUALITY_THRESHOLD: 70 })) });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
    assert.equal(contract.decision.action, 'UNKNOWN');
  });

  it('quality exactly at threshold is accepted (not below)', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { QUALITY: 70, QUALITY_THRESHOLD: 70 })) });
    assert.equal(contract.status, 'OK');
  });

  it('quality is transported as a plain number, never relabeled as a probability/confidence claim by this module', () => {
    const path = new URL('../src/core/master_contract.js', import.meta.url);
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['confidence', 'probability', 'win rate', 'winning', 'guaranteed']) {
      assert.ok(!source.toLowerCase().includes(forbidden), `master_contract.js must not use the term "${forbidden}"`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 9: RR contract
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §9: RR contract', () => {
  it('RR_NOT_ACCEPTABLE with BUY → contradiction', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { RR_VALIDATION_STATE: 'RR_NOT_ACCEPTABLE' })) });
    assert.equal(contract.status, 'CONTRACT_CONTRADICTION');
  });

  it('missing RR for a BUY → contract validation failure (MALFORMED_CONTRACT), not an invented RR', () => {
    const contract = buildMasterContract({ rows: rows(baseTradeFields('BUY', { RR: 'NA' })) });
    assert.equal(contract.status, 'MALFORMED_CONTRACT');
    assert.equal(contract.decision.rr, null);
  });

  it('distinguishes PINE_REPORTED_RR from MCP_VALIDATED_RR and never overwrites Pine\'s value', () => {
    // Entry 100, SL 95 (risk 5), TP1 110 (reward 10) → MCP-calculated RR = 2.0
    // Pine claims RR = 2.0 as well → consistent.
    const consistent = buildMasterContract({ rows: rows(baseTradeFields('BUY', { ENTRY: 100, SL: 95, TP1: 110, RR: 2.0 })) });
    assert.equal(consistent.rr_check.pine_reported_rr, 2.0);
    assert.equal(consistent.rr_check.mcp_calculated_rr, 2.0);
    assert.equal(consistent.rr_check.consistent, true);
    assert.equal(consistent.decision.rr, 2.0, 'decision.rr is always Pine\'s reported value');

    // Pine claims RR = 5.0 despite the prices implying 2.0 — MCP flags the
    // mismatch via rr_check but still reports Pine's own value in decision.rr
    // (arithmetic mismatch alone is not a contradiction gate in this phase —
    // it's surfaced for research/debugging, not used to block the trade).
    const inconsistent = buildMasterContract({ rows: rows(baseTradeFields('BUY', { ENTRY: 100, SL: 95, TP1: 110, RR: 5.0 })) });
    assert.equal(inconsistent.rr_check.pine_reported_rr, 5.0);
    assert.equal(inconsistent.rr_check.mcp_calculated_rr, 2.0);
    assert.equal(inconsistent.rr_check.consistent, false);
    assert.equal(inconsistent.decision.rr, 5.0, 'MCP must never silently overwrite Pine\'s RR value, even when its own arithmetic disagrees');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 17: no-fabrication adversarial test (contract-parser level)
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §17: no-fabrication invariant', () => {
  it('extremely bullish-looking WAIT contract still returns WAIT (parser has no OHLCV input to begin with)', () => {
    // The parser only ever receives table rows — there is no parameter for
    // OHLCV/indicator data, so "injecting" bullish market data has no
    // mechanism to reach this function at all. This test documents that
    // structural guarantee explicitly.
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ REGIME: 'BULL_TREND', QUALITY_THRESHOLD: 70 })) });
    assert.equal(contract.decision.action, 'WAIT');
  });

  it('function signature accepts no OHLCV/indicator parameters at all (source audit)', () => {
    const source = readFileSync(new URL('../src/core/master_contract.js', import.meta.url), 'utf8');
    const sig = source.match(/export function buildMasterContract\(([^)]*)\)/)[1];
    assert.ok(!/ohlcv|bars|rsi|macd|ema|indicator_values/i.test(sig), 'buildMasterContract must not accept raw market-data parameters');
  });

  it('removing ACTION entirely (Pine emits no action) → UNKNOWN, never BUY/SELL, even with otherwise "perfect" trade fields', () => {
    const fields = baseTradeFields('BUY');
    fields.ACTION = 'NA';
    const contract = buildMasterContract({ rows: rows(fields) });
    assert.equal(contract.decision.action, 'UNKNOWN');
    assert.notEqual(contract.status, 'OK' && contract.decision.action === 'BUY');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 18: 5m/15m/30m timeframe preservation
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2B §18: timeframe handling', () => {
  for (const tf of ['5', '15', '30']) {
    it(`preserves timeframe "${tf}" exactly, from chart context, not from Pine's own EXECUTION_TF echo`, () => {
      const contract = buildMasterContract({ rows: rows(baseWaitFields({ EXECUTION_TF: tf })), chartTimeframe: tf });
      assert.equal(contract.market.timeframe, tf);
    });
  }

  it('does not aggregate or cross-reference multiple timeframes into a single derived decision', () => {
    const source = readFileSync(new URL('../src/core/master_contract.js', import.meta.url), 'utf8');
    assert.ok(!/aggregate|combine.*timeframe|multi.?timeframe|mtf/i.test(source), 'master_contract.js must not implement any MTF aggregation logic — that belongs to Pine');
  });

  it('a mismatched EXECUTION_TF vs chart context_timeframe does not itself invalidate the contract (informational only)', () => {
    const contract = buildMasterContract({ rows: rows(baseWaitFields({ EXECUTION_TF: '5', CONTEXT_TF: '60' })), chartTimeframe: '5' });
    assert.equal(contract.status, 'OK');
    assert.equal(contract.market.timeframe, '5');
  });
});
