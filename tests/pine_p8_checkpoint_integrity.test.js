/**
 * Pine P8 — forward boundary checkpoint provenance.
 *
 * Narrow, additive to tests/pine_p8_forward_test_integrity.test.js: this
 * file exists only to catch silent drift of the exact, already-locked
 * checkpoint values (the boundary timestamp, the ledger's internal
 * consistency, and the P8 status label) that the broader integrity
 * suite does not pin to a literal expected value. No trading logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isPostBoundary } from '../validation/p8_ledger_utils.js';

const BOUNDARY_PATH = fileURLToPath(new URL('../validation/p8_forward_boundary.json', import.meta.url));
const LEDGER_PATH = fileURLToPath(new URL('../validation/p8_forward_ledger.json', import.meta.url));
const RESULTS_PATH = fileURLToPath(new URL('../validation/p8_results.json', import.meta.url));

const LOCKED_BOUNDARY_UTC = '2026-09-17T13:47:01Z';

describe('P8 checkpoint: boundary cannot silently drift', () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));

  it('p8_boundary_utc is exactly the locked checkpoint value', () => {
    assert.equal(boundary.p8_boundary_utc, LOCKED_BOUNDARY_UTC);
  });
  it('per-timeframe reference bar times are exactly the locked checkpoint values', () => {
    assert.equal(boundary.boundary_chart_bar_time['5m'].last_confirmed_bar_time_unix, 1789652700);
    assert.equal(boundary.boundary_chart_bar_time['15m'].last_confirmed_bar_time_unix, 1789652700);
    assert.equal(boundary.boundary_chart_bar_time['30m'].last_confirmed_bar_time_unix, 1789651800);
  });
});

describe('P8 checkpoint: initial ledger is internally consistent with the locked boundary', () => {
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));

  it('every observation currently in the ledger (if any) is genuinely post-boundary for its timeframe', () => {
    for (const obs of ledger.observations) {
      const tfKey = `${obs.timeframe}m`;
      const ref = boundary.boundary_chart_bar_time[tfKey];
      assert.ok(ref, `no boundary reference for timeframe ${obs.timeframe}`);
      assert.equal(isPostBoundary(obs.signal_bar_time, ref.last_confirmed_bar_time_unix), true, `observation ${obs.signal_id} is not genuinely post-boundary`);
    }
  });
  it('the initial checkpoint ledger contains zero observations, matching the P8 master report finding', () => {
    assert.equal(ledger.observations.length, 0);
  });
});

describe('P8 checkpoint: status remains an honest FORWARD OBSERVATION OPEN, not a completion claim', () => {
  const results = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));

  it('status is exactly FORWARD OBSERVATION OPEN', () => {
    assert.equal(results.status, 'FORWARD OBSERVATION OPEN');
  });
  it('status is never any completion/validation claim', () => {
    assert.ok(!/PASSED|VALIDATED|COMPLETE|PRODUCTION READY/i.test(results.status));
  });
});
