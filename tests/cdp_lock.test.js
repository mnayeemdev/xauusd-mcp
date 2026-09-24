/**
 * Runtime Live Sync, Part B/L -- CDP chart lock (src/engine/cdpLock.js).
 *
 * Covers Part L's minimum-required lock tests:
 *   1. CDP serialization: two overlapping operations on the SAME lock path
 *      cannot run concurrently (proxy for "watcher + manual check cannot
 *      race" -- the real watcher/manual-check integration is exercised
 *      elsewhere via fetchMultiTimeframeBars()/getActiveChartContext()'s
 *      own existing test suites, which now both route through this SAME
 *      primitive; this file proves the primitive itself is race-safe).
 *   2. Lock releases after an exception inside the locked function.
 *   3. No nested-lock deadlock -- reentrant acquisition fails FAST
 *      (throws) rather than hanging.
 *   plus: stale-lock reclaim (by age, by dead PID), corrupt-lock-file
 *   fail-open, acquireCdpLock() timing out rather than hanging forever,
 *   and a source-audit test proving neither fetchMultiTimeframeBars() nor
 *   getActiveChartContext() nests a SECOND locked call inside the first
 *   (the precondition the module's own re-entrancy design relies on).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  tryAcquireCdpLock,
  acquireCdpLock,
  releaseCdpLock,
  withCdpLock,
} from '../src/engine/cdpLock.js';

function tmpDir() {
  return mkdtempSync(join(tmpdir(), 'xauusd-cdp-lock-'));
}

describe('cdpLock: tryAcquireCdpLock() basic acquire/release', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('acquires a free lock, writing a pid+timestamp lock file', () => {
    const path = join(dir, 'cdp.lock');
    const result = tryAcquireCdpLock(path);
    assert.equal(result.acquired, true);
    assert.equal(existsSync(path), true);
    const holder = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(holder.pid, process.pid);
    assert.equal(typeof holder.acquired_at, 'number');
  });

  it('a second acquisition attempt fails while a live, fresh holder exists (simulated as a different pid)', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() }));
    const result = tryAcquireCdpLock(path, { isAlive: () => true });
    assert.equal(result.acquired, false);
    assert.equal(result.holder.pid, process.pid + 1);
  });

  it('releaseCdpLock only removes a lock this SAME process holds', () => {
    const path = join(dir, 'cdp.lock');
    tryAcquireCdpLock(path);
    releaseCdpLock(path);
    assert.equal(existsSync(path), false);
  });

  it('releaseCdpLock never removes another process\'s lock, even a stale one it did not itself reclaim', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: 0 }));
    releaseCdpLock(path); // not our lock -- must be a no-op
    assert.equal(existsSync(path), true);
  });

  it('releaseCdpLock never throws even if the lock file is already gone', () => {
    const path = join(dir, 'missing.lock');
    assert.doesNotThrow(() => releaseCdpLock(path));
  });
});

describe('cdpLock: stale-lock reclaim', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reclaims a lock whose holder process is no longer alive', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: 999999, acquired_at: Date.now() }));
    const result = tryAcquireCdpLock(path, { isAlive: () => false });
    assert.equal(result.acquired, true);
  });

  it('reclaims a lock older than maxAgeMs even if the holder PID still reports alive ("no permanent stale lock")', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() - 10_000 }));
    const result = tryAcquireCdpLock(path, { isAlive: () => true, maxAgeMs: 1_000 });
    assert.equal(result.acquired, true);
  });

  it('does NOT reclaim a fresh lock from a still-alive holder', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() }));
    const result = tryAcquireCdpLock(path, { isAlive: () => true, maxAgeMs: 60_000 });
    assert.equal(result.acquired, false);
  });

  it('treats a corrupt/torn lock file as absent (fails open to acquisition, never crashes)', () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, '{ not valid json');
    const result = tryAcquireCdpLock(path);
    assert.equal(result.acquired, true);
  });
});

describe('cdpLock: re-entrancy -- fails fast, never deadlocks', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('tryAcquireCdpLock throws CDP_LOCK_REENTRANT if the CURRENT process already holds the lock', () => {
    const path = join(dir, 'cdp.lock');
    tryAcquireCdpLock(path);
    assert.throws(() => tryAcquireCdpLock(path), (err) => err.code === 'CDP_LOCK_REENTRANT');
  });

  it('withCdpLock rejects with CDP_LOCK_REENTRANT (not a hang) if fn() tries to re-acquire the SAME lock nested inside itself', async () => {
    const path = join(dir, 'cdp.lock');
    await assert.rejects(
      () => withCdpLock(path, async () => withCdpLock(path, async () => 'never')),
      (err) => err.code === 'CDP_LOCK_REENTRANT',
    );
    // The outer withCdpLock's own finally{} must still release the lock
    // despite the nested rejection -- no permanent stale lock left behind.
    assert.equal(existsSync(path), false);
  });
});

describe('cdpLock: acquireCdpLock() polling + timeout', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('polls until a busy lock frees up, then acquires it (proves serialization: a second "operation" WAITS its turn rather than racing)', async () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() }));
    const order = [];
    let released = false;
    const waiter = acquireCdpLock(path, {
      isAlive: () => !released,
      pollIntervalMs: 5,
      timeoutMs: 2_000,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    }).then(() => order.push('acquired'));
    await new Promise((r) => setTimeout(r, 20));
    order.push('still-waiting-check');
    released = true; // simulate the holder's process dying / lock going stale
    await waiter;
    assert.deepEqual(order, ['still-waiting-check', 'acquired']);
  });

  it('throws CDP_LOCK_TIMEOUT rather than hanging forever if the lock never frees up', async () => {
    const path = join(dir, 'cdp.lock');
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() }));
    await assert.rejects(
      () => acquireCdpLock(path, {
        isAlive: () => true,
        timeoutMs: 30,
        pollIntervalMs: 5,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      }),
      (err) => err.code === 'CDP_LOCK_TIMEOUT',
    );
  });
});

describe('cdpLock: withCdpLock() always releases', () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('releases after fn() resolves successfully', async () => {
    const path = join(dir, 'cdp.lock');
    const result = await withCdpLock(path, async () => 'ok');
    assert.equal(result, 'ok');
    assert.equal(existsSync(path), false);
  });

  it('releases after fn() throws (a WAIT-shaped/error result never leaves the lock held)', async () => {
    const path = join(dir, 'cdp.lock');
    await assert.rejects(
      () => withCdpLock(path, async () => { throw new Error('boom'); }),
      /boom/,
    );
    assert.equal(existsSync(path), false);
  });

  it('two sequential withCdpLock() calls on the SAME path never see each other\'s lock (serialized, not deadlocked)', async () => {
    const path = join(dir, 'cdp.lock');
    const first = await withCdpLock(path, async () => 'first');
    const second = await withCdpLock(path, async () => 'second');
    assert.equal(first, 'first');
    assert.equal(second, 'second');
    assert.equal(existsSync(path), false);
  });

  it('proves cross-process mutual exclusion via a simulated different-pid holder: a competing acquisition never wins while the (other-process) holder is live and fresh, and wins immediately once it is not', async () => {
    // A true two-OS-process race can't be simulated in-process (the lock
    // is keyed on process.pid, and two calls from THIS same process are,
    // by design, reentrant -- see the two tests below). This proves the
    // actual cross-process guarantee the watcher/manual-check race relies
    // on: tryAcquireCdpLock() never lets a second acquirer in while a
    // DIFFERENT pid's lock is live+fresh, and lets it in the instant that
    // changes -- exactly what acquireCdpLock()'s polling loop depends on.
    const path = join(dir, 'cdp.lock');
    let otherProcessAlive = true;
    writeFileSync(path, JSON.stringify({ pid: process.pid + 1, acquired_at: Date.now() }));
    for (let i = 0; i < 5; i++) {
      const attempt = tryAcquireCdpLock(path, { isAlive: () => otherProcessAlive });
      assert.equal(attempt.acquired, false, 'must not acquire while the other process holds a live, fresh lock');
    }
    otherProcessAlive = false; // the other process's lock is now stale
    const finalAttempt = tryAcquireCdpLock(path, { isAlive: () => otherProcessAlive });
    assert.equal(finalAttempt.acquired, true);
    releaseCdpLock(path);
  });

  it('within the SAME process, a second (non-nested but concurrent) withCdpLock() call on the SAME path fails fast with CDP_LOCK_REENTRANT rather than hanging or double-entering fn()', async () => {
    // Documented design limitation (see cdpLock.js module header): the
    // lock is keyed on process.pid alone, so it cannot distinguish a truly
    // NESTED call from an independent CONCURRENT call made by the same
    // process. Either way it fails fast rather than deadlocking or
    // silently letting two fn() bodies run at once -- this is the actual
    // "no nested-lock deadlock" guarantee for the in-process case.
    const path = join(dir, 'cdp.lock');
    let concurrentEntries = 0;
    const first = withCdpLock(path, async () => {
      concurrentEntries++;
      await new Promise((r) => setTimeout(r, 20));
      concurrentEntries--;
      return 'first';
    });
    await new Promise((r) => setTimeout(r, 5)); // let `first` actually acquire
    await assert.rejects(
      () => withCdpLock(path, async () => { concurrentEntries++; return 'second'; }),
      (err) => err.code === 'CDP_LOCK_REENTRANT',
    );
    assert.equal(await first, 'first');
    assert.equal(concurrentEntries, 0, 'the rejected second call must never have entered its fn() body');
  });

  it('leaves no leftover .tmp- files behind after normal sequential use (Windows-race hardening cleans up its own losing temp files)', async () => {
    const path = join(dir, 'cdp.lock');
    await withCdpLock(path, async () => new Promise((r) => setTimeout(r, 5)), { pollIntervalMs: 5, timeoutMs: 5_000 });
    await withCdpLock(path, async () => new Promise((r) => setTimeout(r, 5)), { pollIntervalMs: 5, timeoutMs: 5_000 });
    await withCdpLock(path, async () => new Promise((r) => setTimeout(r, 5)), { pollIntervalMs: 5, timeoutMs: 5_000 });
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
  });
});

function extractTopLevelFunction(src, startMarker) {
  const startIdx = src.indexOf(startMarker);
  assert.notEqual(startIdx, -1, `expected to find "${startMarker}"`);
  // Line-ending agnostic (checked-out line endings can be LF or CRLF
  // depending on git's autocrlf handling) -- looks for a line containing
  // only a closing brace.
  const closeMatch = /\r?\n\}\r?\n/.exec(src.slice(startIdx));
  assert.ok(closeMatch, `expected to find the closing brace of "${startMarker}"`);
  return src.slice(startIdx, startIdx + closeMatch.index);
}

describe('cdpLock: source audit -- no call site nests a second locked operation inside the first', () => {
  it('fetchMultiTimeframeBars() (xauusd_calculate.js) wraps its ENTIRE body in withCdpLock and does not call getActiveChartContext() or itself from inside it', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/core/xauusd_calculate.js', import.meta.url)), 'utf8');
    const fn = extractTopLevelFunction(src, 'export async function fetchMultiTimeframeBars(deps) {');
    assert.match(fn, /return deps\.withCdpLock\(deps\.cdpLockPath, async \(\) => \{/);
    const bodyOnly = fn.slice(fn.indexOf('async () => {'));
    assert.doesNotMatch(bodyOnly, /getActiveChartContext|fetchMultiTimeframeBars\(|\.withCdpLock\(/);
  });

  it('getActiveChartContext() (xauusd_chart_context.js) delegates to a lock-wrapped body that does not call fetchMultiTimeframeBars() or itself', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/core/xauusd_chart_context.js', import.meta.url)), 'utf8');
    const outer = extractTopLevelFunction(src, 'export async function getActiveChartContext({ _deps } = {}) {');
    assert.match(outer, /return deps\.withCdpLock\(deps\.cdpLockPath, async \(\) => getActiveChartContextLocked\(/);
    const locked = extractTopLevelFunction(src, 'async function getActiveChartContextLocked(deps, _deps) {');
    assert.doesNotMatch(locked, /fetchMultiTimeframeBars|getActiveChartContext\(|\.withCdpLock\(/);
  });
});
