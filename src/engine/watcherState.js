/**
 * Local persistence for the XAUUSD auto signal watcher (src/engine/watcher.js).
 *
 * This is orchestration/bookkeeping state only -- NOT a trading ledger. It
 * never stores a computed decision, only enough identity to (a) know
 * whether a given confirmed 5m candle has already triggered a calculation
 * and (b) know whether a given engine signal has already been alerted, so
 * a watcher restart never repeats an alert or re-processes a candle it
 * already handled. Writes are atomic (temp file + rename) so a process
 * kill mid-write can never leave a torn/partial state file.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_STATE_PATH = fileURLToPath(new URL('../../state/xauusd_watcher_state.json', import.meta.url));
export const DEFAULT_LOCK_PATH = fileURLToPath(new URL('../../state/xauusd_watcher.lock', import.meta.url));

export const DEFAULT_WATCHER_STATE = Object.freeze({
  version: 1,
  last_processed_5m_time: null,
  baseline_established: false,
  last_alerted_signal_id: null,
  last_connection_ok: null,
  updated_at: null,
});

export function loadWatcherState(path) {
  if (!existsSync(path)) return { ...DEFAULT_WATCHER_STATE };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { ...DEFAULT_WATCHER_STATE, ...parsed };
  } catch {
    // Corrupt/unreadable state file -- fail closed to a fresh baseline
    // rather than crash the watcher or fabricate prior state.
    return { ...DEFAULT_WATCHER_STATE };
  }
}

export function saveWatcherState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2) + '\n';
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, payload);
  renameSync(tmpPath, path); // atomic on the same filesystem
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but owned by another user -- treat as alive
  }
}

/**
 * Single-instance lock: a PID file. A lock whose recorded PID is no longer
 * a live process is a stale lock left by a crashed/killed prior run, and is
 * safely reclaimed rather than blocking the watcher forever.
 */
export function acquireLock(path, { isAlive = defaultIsAlive } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim();
    const holderPid = Number(raw);
    if (Number.isInteger(holderPid) && holderPid > 0 && isAlive(holderPid)) {
      return { acquired: false, holderPid };
    }
  }
  writeFileSync(path, String(process.pid));
  return { acquired: true, holderPid: process.pid };
}

export function releaseLock(path) {
  try {
    if (existsSync(path) && Number(readFileSync(path, 'utf8').trim()) === process.pid) unlinkSync(path);
  } catch { /* best-effort -- never let lock release crash shutdown */ }
}
