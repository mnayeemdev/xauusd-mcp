/**
 * Runtime Live Sync upgrade, Part B — single-CDP-chart serialization.
 *
 * TradingView Desktop's CDP connection exposes ONE shared chart. Multiple
 * Node processes (the long-running watcher, a one-off `xauusd:check`/
 * `xauusd calculate` CLI invocation, an on-demand MCP tool call) can each
 * independently decide to switch that chart's timeframe (fetchMultiTimeframeBars())
 * or read whatever timeframe is currently active (getActiveChartContext()).
 * If two such operations overlap, one process's setTimeframe() can fire
 * mid-way through another process's own multi-timeframe sweep, corrupting
 * both reads. This module provides ONE simple, deterministic, file-based
 * mutex so at most one chart-mutating/-reading operation sequence runs at
 * a time, ACROSS processes -- not just within one.
 *
 * Deliberately NOT a distributed-locking system: a single lock FILE
 * (state/xauusd_cdp_chart.lock, gitignored alongside every other runtime
 * state file in this project), atomic temp-file+rename writes (the SAME
 * discipline watcherState.js's own single-instance watcher lock already
 * uses), PID-liveness-based stale-lock reclaim (the SAME
 * process.kill(pid,0) technique, reused verbatim in spirit, not copied
 * verbatim in code since the semantics differ -- see below), PLUS a
 * max-age fallback (a live-but-stuck holder still releases the lock to a
 * waiter eventually -- "no permanent stale lock").
 *
 * Blocking acquisition (acquireCdpLock/withCdpLock) is the key difference
 * from watcherState.js's acquireLock() (which fails immediately if busy,
 * appropriate for "only one watcher instance may exist"): here, a busy
 * lock means "wait your turn" ("if manual check waits behind watcher,
 * that is acceptable"), bounded by a timeout so nothing can hang forever.
 *
 * REENTRANCY: this module does NOT support nested acquisition by the SAME
 * process (acquireCdpLock() while that same process already holds the
 * lock). Rather than silently polling for a lock it will never see
 * released (a guaranteed deadlock), a reentrant attempt throws
 * immediately (CDP_LOCK_REENTRANT) -- fail loud and fast, not hang.
 * Verified against the current call graph: fetchMultiTimeframeBars()
 * (xauusd_calculate.js) and getActiveChartContext()
 * (xauusd_chart_context.js) are always top-level entry points from the
 * CLI/watcher layer, never called from within one another in the same
 * process -- see tests/cdp_lock.test.js's own source-audit test.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CDP_LOCK_PATH = fileURLToPath(new URL('../../state/xauusd_cdp_chart.lock', import.meta.url));

// Generous vs. the slowest realistic real sweep (10 timeframes x a few
// seconds each, well under a minute in practice) -- an abandoned lock
// (e.g. a crashed operation that somehow skipped its own release) is
// reclaimed by a waiter after this long even if the holder PID is
// somehow still technically alive. Presentation/runtime-only constant,
// never read by any trading-decision code.
export const CDP_LOCK_MAX_AGE_MS = 5 * 60 * 1000;
// How long acquireCdpLock() will poll before giving up and throwing.
export const CDP_LOCK_DEFAULT_TIMEOUT_MS = 90 * 1000;
export const CDP_LOCK_POLL_INTERVAL_MS = 250;

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but owned by another user -- treat as alive
  }
}

function readLockHolder(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    if (!raw || !Number.isInteger(raw.pid) || !Number.isFinite(raw.acquired_at)) return null;
    return raw;
  } catch {
    return null; // corrupt/torn lock file -- treat as absent, never crash the caller
  }
}

function isLockStale(holder, { isAlive, maxAgeMs }) {
  if (!holder) return true;
  if (Date.now() - holder.acquired_at > maxAgeMs) return true;
  return !isAlive(holder.pid);
}

/**
 * Single non-blocking acquisition attempt. Returns `{acquired: true}` or
 * `{acquired: false, holder}`. Throws CDP_LOCK_REENTRANT if the CURRENT
 * process already holds the lock (see module doc -- never silently
 * allowed, never silently polled into a deadlock).
 */
export function tryAcquireCdpLock(path, { isAlive = defaultIsAlive, maxAgeMs = CDP_LOCK_MAX_AGE_MS } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const holder = readLockHolder(path);
  if (holder && holder.pid === process.pid) {
    const err = new Error('CDP chart lock re-entrancy detected: this process already holds the lock. Nested locked operations are not supported (would deadlock waiting for a lock only this SAME process could release). Fix the caller to not nest locked operations.');
    err.code = 'CDP_LOCK_REENTRANT';
    throw err;
  }
  if (holder && !isLockStale(holder, { isAlive, maxAgeMs })) return { acquired: false, holder };
  // Two processes can race this exact same "no holder / stale holder"
  // window and both attempt to claim the lock at once. On Windows in
  // particular, a losing racer's own rename() can throw EPERM/EBUSY
  // (POSIX-style atomic-rename-always-wins semantics do not hold the same
  // way there) rather than simply overwriting -- treat ANY failure here
  // as "did not win the race" (not acquired), never an uncaught
  // exception; the caller's own polling loop (acquireCdpLock) retries.
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    writeFileSync(tmpPath, JSON.stringify({ pid: process.pid, acquired_at: Date.now() }));
    renameSync(tmpPath, path); // atomic on the same filesystem (POSIX); best-effort race-safe on Windows
    return { acquired: true };
  } catch {
    try { unlinkSync(tmpPath); } catch { /* best-effort cleanup of our own losing temp file */ }
    return { acquired: false, holder: readLockHolder(path) };
  }
}

/**
 * Blocking (polling) acquisition -- waits up to `timeoutMs` for the lock
 * to free up, then throws CDP_LOCK_TIMEOUT. Never hangs forever ("no
 * deadlock").
 */
export async function acquireCdpLock(path, { timeoutMs = CDP_LOCK_DEFAULT_TIMEOUT_MS, pollIntervalMs = CDP_LOCK_POLL_INTERVAL_MS, isAlive, maxAgeMs, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = tryAcquireCdpLock(path, { isAlive, maxAgeMs });
    if (result.acquired) return result;
    if (Date.now() >= deadline) {
      const err = new Error(`CDP chart lock busy (held by pid ${result.holder?.pid ?? 'unknown'}) -- timed out after ${timeoutMs}ms waiting for it to free up`);
      err.code = 'CDP_LOCK_TIMEOUT';
      throw err;
    }
    await sleep(pollIntervalMs);
  }
}

/** Best-effort, never throws. Only ever removes a lock file this SAME process actually holds (never another holder's, even a stale one -- a waiter that just reclaimed a stale lock owns it now, not the original holder). */
export function releaseCdpLock(path) {
  try {
    const holder = readLockHolder(path);
    if (holder && holder.pid === process.pid) unlinkSync(path);
  } catch { /* best-effort -- never let lock release crash the caller */ }
}

/**
 * Runs `fn` (async) while holding the CDP chart lock, ALWAYS releasing it
 * afterward -- on success, on a WAIT-shaped result, on a thrown error, or
 * on a timeout acquiring in the first place (nothing to release then).
 * This is the primitive fetchMultiTimeframeBars()/getActiveChartContext()
 * wrap their own chart-mutating/-reading sequence in.
 */
export async function withCdpLock(path, fn, opts = {}) {
  await acquireCdpLock(path, opts);
  try {
    return await fn();
  } finally {
    releaseCdpLock(path);
  }
}
