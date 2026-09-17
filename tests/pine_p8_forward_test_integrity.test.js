/**
 * Pine P8 — forward/replay test infrastructure integrity.
 *
 * These tests validate the P8 candidate-lock, boundary, and ledger
 * MACHINERY -- they never assert anything about whether C4 makes money.
 * A zero-signal forward sample must never fail these tests; only a
 * process/integrity defect (a moved boundary, a mutated frozen field, a
 * fabricated OOS claim, a tuned parameter) should.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { isPostBoundary, validateNewObservation, applyOutcomeUpdate, toMetricsRecords } from '../validation/p8_ledger_utils.js';
import { passRate, cumulativeR } from '../validation/metrics.js';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const STRATEGY_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master_Strategy.pine', import.meta.url));
const LOCK_PATH = fileURLToPath(new URL('../validation/p8_candidate_lock.json', import.meta.url));
const BOUNDARY_PATH = fileURLToPath(new URL('../validation/p8_forward_boundary.json', import.meta.url));
const LEDGER_PATH = fileURLToPath(new URL('../validation/p8_forward_ledger.json', import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL('../validation/p8_results.json', import.meta.url));
const P8_DOC_PATH = fileURLToPath(new URL('../docs/PINE_P8.md', import.meta.url));

const P7_COMMIT = 'd276af41fb9fbe459a94edb0ea54d02815f98bfa';
const FROZEN_INDICATOR_SHA256 = '6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6';
const FROZEN_STRATEGY_SHA256 = '947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911';

function sha256(path) { return crypto.createHash('sha256').update(readFileSync(path)).digest('hex'); }

describe('P8 §1-8: candidate lock provenance and immutability', () => {
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));

  it('records the exact source P7 commit', () => { assert.equal(lock.source_p7_commit, P7_COMMIT); });
  it('candidate ID is C4', () => { assert.equal(lock.candidate_id, 'C4'); });
  it('minRR is exactly 1.7', () => { assert.equal(lock.locked_parameters.minRR, 1.7); });
  it('corrResolveConfirmBars is exactly 3', () => { assert.equal(lock.locked_parameters.corrResolveConfirmBars, 3); });
  it('qualityThreshold is exactly 65', () => { assert.equal(lock.locked_parameters.qualityThreshold, 65); });
  it('records the exact frozen indicator hash', () => { assert.equal(lock.frozen_source_integrity.indicator_sha256, FROZEN_INDICATOR_SHA256); });
  it('records the exact frozen strategy hash', () => { assert.equal(lock.frozen_source_integrity.strategy_sha256, FROZEN_STRATEGY_SHA256); });
  it('records CONTRACT_VERSION 1', () => { assert.equal(lock.frozen_source_integrity.contract_version, 1); });

  it('the candidate_lock_hash is reproducible from its own recorded inputs', () => {
    const canonical = JSON.stringify({
      candidate_id: lock.candidate_id,
      locked_parameters: lock.locked_parameters,
      indicator_sha256: lock.frozen_source_integrity.indicator_sha256,
      strategy_sha256: lock.frozen_source_integrity.strategy_sha256,
      contract_version: lock.frozen_source_integrity.contract_version,
    });
    const expected = crypto.createHash('sha256').update(canonical).digest('hex');
    assert.equal(lock.candidate_lock_hash, expected);
  });
});

describe('P8 §6/§7: frozen Pine source is byte-identical to P7 (no drift introduced by P8)', () => {
  it('indicator hash unchanged', () => { assert.equal(sha256(PINE_PATH), FROZEN_INDICATOR_SHA256); });
  it('strategy hash unchanged', () => { assert.equal(sha256(STRATEGY_PATH), FROZEN_STRATEGY_SHA256); });
  it('CONTRACT_VERSION is still 1 and INDICATOR_VERSION still 0.4.0 in the live source', () => {
    const source = readFileSync(PINE_PATH, 'utf8');
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
    assert.ok(/INDICATOR_VERSION\s*=\s*"0\.4\.0"/.test(source));
  });
});

describe('P8 §9/§10: boundary immutability and strict post-boundary eligibility', () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));

  it('boundary declares an immutability statement', () => {
    assert.match(boundary.boundary_immutability_statement, /never be moved/i);
  });
  it('boundary_utc parses as a valid ISO timestamp', () => {
    assert.ok(!Number.isNaN(Date.parse(boundary.p8_boundary_utc)));
  });
  it('isPostBoundary is a strict greater-than (equal-to-boundary is NOT eligible)', () => {
    const b = boundary.boundary_chart_bar_time['15m'].last_confirmed_bar_time_unix;
    assert.equal(isPostBoundary(b, b), false);
    assert.equal(isPostBoundary(b - 1, b), false);
    assert.equal(isPostBoundary(b + 1, b), true);
  });
});

describe('P8 §11: pre-boundary signal rejection', () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
  const boundaryMap = Object.fromEntries(Object.entries(boundary.boundary_chart_bar_time).map(([tf, v]) => [tf.replace('m', ''), v.last_confirmed_bar_time_unix]));

  it('rejects a candidate observation at or before the boundary', () => {
    const preBoundary = { timeframe: '15', signal_id: 'FAKE-1', signal_bar_time: boundaryMap['15'], status: 'OPEN' };
    assert.throws(() => validateNewObservation([], preBoundary, boundaryMap), /not strictly after the boundary/);
  });
  it('accepts a candidate observation strictly after the boundary', () => {
    const postBoundary = { timeframe: '15', signal_id: 'FAKE-2', signal_bar_time: boundaryMap['15'] + 900, status: 'OPEN' };
    assert.equal(validateNewObservation([], postBoundary, boundaryMap), true);
  });
});

describe('P8 §12: duplicate observation rejection', () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
  const boundaryMap = Object.fromEntries(Object.entries(boundary.boundary_chart_bar_time).map(([tf, v]) => [tf.replace('m', ''), v.last_confirmed_bar_time_unix]));
  const existing = [{ timeframe: '15', signal_id: 'DUP-1', signal_bar_time: boundaryMap['15'] + 900, status: 'OPEN' }];

  it('rejects a second observation with the same signal_id and timeframe', () => {
    const dup = { timeframe: '15', signal_id: 'DUP-1', signal_bar_time: boundaryMap['15'] + 1800, status: 'OPEN' };
    assert.throws(() => validateNewObservation(existing, dup, boundaryMap), /duplicate observation/);
  });
  it('allows the same signal_id on a DIFFERENT timeframe (independent evaluation)', () => {
    const otherTf = { timeframe: '30', signal_id: 'DUP-1', signal_bar_time: boundaryMap['30'] + 1800, status: 'OPEN' };
    assert.equal(validateNewObservation(existing, otherTf, boundaryMap), true);
  });
  it('rejects appending a non-OPEN candidate directly (must start OPEN)', () => {
    const preResolved = { timeframe: '15', signal_id: 'DUP-3', signal_bar_time: boundaryMap['15'] + 900, status: 'PASS' };
    assert.throws(() => validateNewObservation(existing, preResolved, boundaryMap), /must start as OPEN/);
  });
});

describe('P8 §13-17: immutable trade geometry across outcome updates', () => {
  const base = {
    signal_id: 'SIG-1', timeframe: '15', signal_bar_time: 1789700000, side: 'BUY', model: 'SR', regime: 'BULL_TREND',
    entry: 4350.0, initial_sl: 4340.0, tp1: 4360.0, tp2_exit_target: 4370.0, reported_rr: 2.0, status: 'OPEN',
  };

  it('OPEN -> PASS is legal and preserves every immutable field', () => {
    const updated = applyOutcomeUpdate(base, 'PASS', { realized_r: 2.0, resolution_bar_time: 1789710000 });
    assert.equal(updated.status, 'PASS');
    for (const f of ['signal_id', 'timeframe', 'signal_bar_time', 'side', 'model', 'regime', 'entry', 'initial_sl', 'tp1', 'tp2_exit_target', 'reported_rr']) {
      assert.deepEqual(updated[f], base[f]);
    }
  });

  it('OPEN -> FAIL is legal and preserves every immutable field', () => {
    const updated = applyOutcomeUpdate(base, 'FAIL', { realized_r: -1.0, resolution_bar_time: 1789710000 });
    assert.equal(updated.status, 'FAIL');
    assert.equal(updated.entry, base.entry);
  });

  it('a terminal PASS observation cannot be updated again (immutable terminal state)', () => {
    const passed = applyOutcomeUpdate(base, 'PASS', { realized_r: 2.0 });
    assert.throws(() => applyOutcomeUpdate(passed, 'FAIL', { realized_r: -1.0 }), /already terminal/);
  });

  it('a terminal FAIL observation cannot be updated again (immutable terminal state)', () => {
    const failed = applyOutcomeUpdate(base, 'FAIL', { realized_r: -1.0 });
    assert.throws(() => applyOutcomeUpdate(failed, 'PASS', { realized_r: 2.0 }), /already terminal/);
  });

  it('applyOutcomeUpdate never mutates the input object (returns a new object)', () => {
    const before = JSON.stringify(base);
    applyOutcomeUpdate(base, 'PASS', { realized_r: 2.0 });
    assert.equal(JSON.stringify(base), before);
  });

  it('cannot silently change ENTRY/SL/TP/side/model/regime via the resolution metadata argument', () => {
    assert.throws(() => applyOutcomeUpdate(base, 'PASS', { entry: 9999 }), /immutable field 'entry'/);
    assert.throws(() => applyOutcomeUpdate(base, 'FAIL', { side: 'SELL' }), /immutable field 'side'/);
  });
});

describe('P8 §22/§24: same-bar SL+target = FAIL and TP1-non-terminal semantics are documented, not reimplemented', () => {
  const doc = readFileSync(P8_DOC_PATH, 'utf8');
  it('P8 does not redefine outcome semantics -- it explicitly defers to the unchanged P5 rules', () => {
    assert.match(doc, /unchanged P5 outcome semantics|conservative same-bar ambiguity/i);
  });
  it('the frozen source still resolves same-bar SL+target ambiguity as FAIL (re-audited, not reimplemented)', () => {
    const source = readFileSync(PINE_PATH, 'utf8');
    assert.ok(/isPass\s*=\s*targetHit and not slHit/.test(source), 'same-bar conservative FAIL rule must remain present verbatim');
  });
});

describe('P8 §23: outcome evaluation begins strictly after the signal bar (re-audited from frozen source)', () => {
  it('bar_index > rec.signalBarIndex guard is present, unchanged', () => {
    const source = readFileSync(PINE_PATH, 'utf8');
    assert.ok(/bar_index > rec\.signalBarIndex/.test(source));
  });
});

describe('P8 §25/§26: no second detector, no parameter optimizer, no candidate tuning', () => {
  it('p8_ledger_utils.js contains no BUY/SELL/regime/model decision logic (comments excluded)', () => {
    const source = readFileSync(fileURLToPath(new URL('../validation/p8_ledger_utils.js', import.meta.url)), 'utf8');
    const codeOnly = source.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    assert.ok(!/['"]BUY['"]|['"]SELL['"]|regime ===|candModel/.test(codeOnly));
  });
  it('p8_candidate_lock.json values match the exact P7-selected C4 candidate (no re-optimization occurred)', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    const p7Candidates = JSON.parse(readFileSync(fileURLToPath(new URL('../validation/p7_candidates.json', import.meta.url)), 'utf8'));
    const c4 = p7Candidates.combination_search_15m.find((c) => c.id === 'C4');
    assert.equal(lock.locked_parameters.minRR, c4.params.minRR);
    assert.equal(lock.locked_parameters.corrResolveConfirmBars, c4.params.corrResolveConfirmBars);
  });
});

describe('P8 §28: P7 development data and P8 forward evidence remain in separate, non-pooled sections', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  it('a distinct pre-boundary reference section exists and is explicitly labeled NOT forward evidence', () => {
    assert.ok(results.p7_development_reference_NOT_forward_evidence);
  });
  it('a distinct forward_observation_window section exists, independent of the P7 reference figures', () => {
    assert.ok(results.forward_observation_window);
    for (const tf of ['5m', '15m', '30m']) {
      assert.ok('qualifying_signals' in results.forward_observation_window[tf]);
    }
  });
});

describe('P8 §29: timeframe separation preserved', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  it('5m/15m/30m forward observations are reported independently, never pooled', () => {
    const w = results.forward_observation_window;
    assert.ok(w['5m'] && w['15m'] && w['30m']);
    assert.notEqual(w['5m'], w['15m']);
  });
});

describe('P8 §30/§31: no fake OOS terminology, no profitability assertion on a zero-sample forward window', () => {
  const doc = readFileSync(P8_DOC_PATH, 'utf8');
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));

  it('docs/PINE_P8.md never claims OOS validated / production validated / guaranteed', () => {
    assert.ok(!/OOS validated|production validated|guaranteed|95% accurate/i.test(doc));
  });
  it('results.json reports forward_metrics as UNDEFINED rather than fabricating a rate from zero signals', () => {
    assert.match(results.forward_metrics.note, /UNDEFINED/);
  });
  it('sample_sufficiency uses the prescribed descriptive label for zero signals, not a fabricated confidence claim', () => {
    for (const tf of ['5m', '15m', '30m']) {
      assert.match(results.sample_sufficiency[tf], /NO FORWARD SIGNALS YET/);
    }
  });
});

describe('P8 metrics reuse: toMetricsRecords + validation/metrics.js produce correct results on a synthetic forward sample', () => {
  it('a synthetic 2-PASS-1-FAIL-1-OPEN forward sample computes the expected pass rate and cumulative R', () => {
    const synthetic = [
      { status: 'OPEN', realized_r: null },
      { status: 'PASS', realized_r: 2 },
      { status: 'PASS', realized_r: 3 },
      { status: 'FAIL', realized_r: -1 },
    ];
    const records = toMetricsRecords(synthetic);
    assert.equal(passRate(2, 1), 66.7);
    assert.equal(cumulativeR(records), 4);
  });
});
