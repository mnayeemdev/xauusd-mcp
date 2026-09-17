/**
 * P8 forward-ledger integrity utilities — pure, deterministic functions
 * that enforce the append-only, immutable-entry rules of the P8 forward
 * ledger. This module contains NO trading logic: it never decides
 * BUY/SELL/WAIT, never computes ENTRY/SL/TP, and never authorizes a
 * signal. It only validates and (for metrics) measures records that
 * already came from the frozen Pine engine's own contract table.
 *
 * Forward performance metrics (PASS rate, mean R, cumulative R, profit
 * factor, drawdown, streaks) intentionally REUSE validation/metrics.js
 * rather than reimplementing them, so P8 never becomes a second
 * measurement engine either.
 */

/** Strict post-boundary eligibility check. */
export function isPostBoundary(signalBarTimeUnix, boundaryBarTimeUnix) {
  return signalBarTimeUnix > boundaryBarTimeUnix;
}

const IMMUTABLE_FIELDS = ['signal_id', 'timeframe', 'signal_bar_time', 'side', 'model', 'regime', 'entry', 'initial_sl', 'tp1', 'tp2_exit_target', 'reported_rr'];

/**
 * Validates a candidate observation against the existing ledger and the
 * locked boundary before it may be appended. Throws on any violation.
 */
export function validateNewObservation(ledgerObservations, candidate, boundaryBarTimeByTf) {
  const boundary = boundaryBarTimeByTf[candidate.timeframe];
  if (boundary == null) throw new Error(`no boundary declared for timeframe ${candidate.timeframe}`);
  if (!isPostBoundary(candidate.signal_bar_time, boundary)) {
    throw new Error(`REJECTED: signal_bar_time ${candidate.signal_bar_time} is not strictly after the boundary ${boundary} for ${candidate.timeframe} -- pre-boundary signals are historical, not P8 forward evidence`);
  }
  const duplicate = ledgerObservations.find((o) => o.signal_id === candidate.signal_id && o.timeframe === candidate.timeframe);
  if (duplicate) {
    throw new Error(`REJECTED: duplicate observation for signal_id=${candidate.signal_id} timeframe=${candidate.timeframe}`);
  }
  if (candidate.status !== 'OPEN') {
    throw new Error('REJECTED: a newly appended observation must start as OPEN -- terminal status may only be reached via applyOutcomeUpdate');
  }
  return true;
}

/**
 * Applies a PASS/FAIL/OPEN outcome transition to an existing observation,
 * returning a NEW object (never mutates the input) with immutable fields
 * verified unchanged. Throws on any illegal transition or field mutation.
 */
export function applyOutcomeUpdate(observation, newStatus, resolutionMeta = {}) {
  if (observation.status === 'PASS' || observation.status === 'FAIL') {
    throw new Error(`REJECTED: observation ${observation.signal_id} is already terminal (${observation.status}) -- terminal status is immutable`);
  }
  if (observation.status === 'OPEN' && !['PASS', 'FAIL', 'OPEN'].includes(newStatus)) {
    throw new Error(`REJECTED: illegal status transition OPEN -> ${newStatus}`);
  }
  const updated = { ...observation, status: newStatus, ...resolutionMeta };
  for (const field of IMMUTABLE_FIELDS) {
    if (JSON.stringify(updated[field]) !== JSON.stringify(observation[field])) {
      throw new Error(`REJECTED: attempted to mutate immutable field '${field}' during an outcome update`);
    }
  }
  return updated;
}

/** Converts P8 ledger observations into the {status, r} shape validation/metrics.js expects. */
export function toMetricsRecords(observations) {
  return observations.map((o) => ({ status: o.status, r: o.status === 'OPEN' ? null : o.realized_r }));
}
