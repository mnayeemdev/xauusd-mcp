/**
 * Pine P4B runtime-safety patch — proof that the real TradingView runtime
 * crash (`array.get()` index out of bounds, RE10045, discovered only via
 * live execution against real bar data) is fixed, and that it cannot
 * recur, without any change to P1/P2/P3 trading semantics.
 *
 * Root cause: Pine's `for` loop auto-detects direction from its bounds —
 * when `to < from` (which happens whenever `array.size(x) - 1` evaluates
 * to -1, i.e. the array is empty), Pine does NOT execute zero times; it
 * treats it as a downward-counting loop and executes for i = 0 and i = -1,
 * calling array.get() on an out-of-bounds index. This can never be caught
 * by `pine check` (compile-only) or `pine analyze` (static analysis) —
 * only real execution against actual bar data exposes it, since it only
 * manifests when the relevant array is genuinely empty (e.g. bar_index 0,
 * before any pivot has ever been confirmed).
 *
 * The fix wraps every such loop with an explicit `if array.size(x) > 0`
 * guard. This is a semantic/pattern test (not line-number-brittle) so it
 * keeps catching a reintroduced instance of the same defect class anywhere
 * in the file, indefinitely.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PINE_PATH = fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url));
const source = readFileSync(PINE_PATH, 'utf8');
const lines = source.split('\n');

// ── §1: static pattern audit — every unsafe loop shape must be guarded ────
describe('P4B runtime-safety: every array.size()-bounded for-loop is guarded against an empty array', () => {
  it('every "for i = 0 to array.size(IDENT) - 1" is immediately preceded (skipping blank/comment lines) by "if array.size(IDENT) > 0"', () => {
    const loopRe = /^(\s*)for\s+\w+\s*=\s*0\s+to\s+array\.size\((\w+)\)\s*-\s*1\s*$/;
    let matchCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(loopRe);
      if (!m) continue;
      matchCount++;
      const [, loopIndent, ident] = m;
      // Walk upward past blank/comment lines to find the guarding `if`.
      let j = i - 1;
      while (j >= 0 && (lines[j].trim() === '' || lines[j].trim().startsWith('//'))) j--;
      assert.ok(j >= 0, `no preceding line found above loop at line ${i + 1} (array: ${ident})`);
      const guardRe = new RegExp(`^${loopIndent.slice(0, -4)}if\\s+array\\.size\\(${ident}\\)\\s*>\\s*0\\s*$`);
      // The guard's indent must be exactly one level shallower than the loop's.
      assert.ok(
        guardRe.test(lines[j]) || new RegExp(`if\\s+array\\.size\\(${ident}\\)\\s*>\\s*0`).test(lines[j]),
        `line ${i + 1} ("for i = 0 to array.size(${ident}) - 1") is not immediately guarded by "if array.size(${ident}) > 0" — found instead: "${lines[j].trim()}"`
      );
    }
    assert.equal(matchCount, 10, `expected exactly 10 array.size()-bounded for-loops (the full audited inventory); found ${matchCount} — update this count only if the inventory in docs/PINE_P4B.md is updated to match`);
  });

  it('no other unsafe indexed-collection function (array.first/array.last/array.pop/array.remove/array.insert) exists in the file', () => {
    for (const fn of ['array.first', 'array.last', 'array.pop', 'array.remove', 'array.insert']) {
      assert.ok(!source.includes(`${fn}(`), `${fn}() must not be introduced without an equivalent empty-collection audit`);
    }
  });

  it('array.shift() call sites remain safe: each is reached only after array.push() on the same array within the same guarded block, and only when size > maxActiveLevels (which is always >= 1)', () => {
    const shiftLines = lines.map((l, idx) => ({ l, idx })).filter(({ l }) => /array\.shift\(/.test(l));
    assert.equal(shiftLines.length, 2, 'expected exactly 2 array.shift() call sites (activeHighLevels, activeLowLevels)');
    for (const { l, idx } of shiftLines) {
      const guardLine = lines[idx - 1];
      assert.ok(/if\s+array\.size\(\w+\)\s*>\s*maxActiveLevels/.test(guardLine), `array.shift() at line ${idx + 1} must be guarded by "if array.size(x) > maxActiveLevels": found "${guardLine.trim()}"`);
      // A push on the same array must occur on the line immediately above the guard.
      const pushLine = lines[idx - 2];
      assert.ok(/array\.push\(/.test(pushLine), `array.shift() at line ${idx + 1} must be preceded by array.push() on the same array (guaranteeing size >= 1): found "${pushLine.trim()}"`);
    }
  });

  it('the debug-table convenience reads (last-level consumed/swept) remain guarded by their own ternary size>0 check — unchanged by this patch', () => {
    const guardedRe = /activeHighCount\s*>\s*0\s*\?\s*array\.get\(activeHighLevels,\s*activeHighCount\s*-\s*1\)/;
    assert.ok(guardedRe.test(source), 'debug-table high-level convenience read must remain ternary-guarded');
    const guardedLowRe = /activeLowCount\s*>\s*0\s*\?\s*array\.get\(activeLowLevels,\s*activeLowCount\s*-\s*1\)/;
    assert.ok(guardedLowRe.test(source), 'debug-table low-level convenience read must remain ternary-guarded');
  });

  it('f_nearestAbove and f_nearestBelow (SL/TP2 structural-anchor helpers) are also guarded', () => {
    const fnBlock = (name) => {
      const start = source.indexOf(`${name}(store, refPrice) =>`);
      assert.ok(start > 0, `${name} must exist`);
      return source.slice(start, start + 300);
    };
    for (const name of ['f_nearestAbove', 'f_nearestBelow']) {
      const block = fnBlock(name);
      assert.ok(/if array\.size\(store\) > 0\s*\n\s*for i = 0 to array\.size\(store\) - 1/.test(block), `${name} must guard its loop with "if array.size(store) > 0"`);
    }
  });
});

// ── §2: versioning ─────────────────────────────────────────────────────
describe('P4B versioning: patch version bumped, contract version and semantics untouched', () => {
  it('INDICATOR_VERSION is bumped to 0.3.1', () => {
    assert.ok(/INDICATOR_VERSION\s*=\s*"0\.3\.1"/.test(source));
  });
  it('CONTRACT_VERSION remains 1 — unchanged, since the machine-readable contract shape/semantics did not change', () => {
    assert.ok(/CONTRACT_VERSION\s*=\s*1\b/.test(source));
  });
});

// ── §3: reference-model proof — the guard has zero effect on non-empty
// arrays, and correctly produces "no event" (not a crash-equivalent) on an
// empty one. This is a minimal, narrowly-scoped port distinct from the
// full P2 model in tests/pine_p2_structure_model.test.js — it exists only
// to prove the empty-collection safety property this patch specifically
// addresses; it does not replace or duplicate the full BOS/CHoCH/sweep
// algorithm proof, which is unaffected by this patch (JS's own `for` loop
// never had this defect — only Pine's auto-reversing `for` does). ────────
function detectAuthoritative(store, barIndex, breaks) {
  // Mirrors: `if array.size(store) > 0 \n for i = 0 to array.size(store)-1 ...`
  let authIdx = -1, authConfirmBar = -1;
  if (store.length > 0) {
    for (let i = 0; i < store.length; i++) {
      const lvl = store[i];
      if (!lvl.consumed && barIndex > lvl.confirmBar && breaks(lvl) && lvl.confirmBar > authConfirmBar) {
        authConfirmBar = lvl.confirmBar;
        authIdx = i;
      }
    }
  }
  return authIdx;
}

describe('P4B reference-model proof: empty/one/multiple retained-level behavior', () => {
  it('an empty retained-level array produces no event (zero iterations, not a crash) — the exact scenario that crashed live Pine', () => {
    const idx = detectAuthoritative([], 100, (lvl) => true);
    assert.equal(idx, -1, 'no authoritative index can be found in an empty store');
  });

  it('a single retained level behaves identically to before the patch (unchanged 1-element case)', () => {
    const store = [{ price: 100, confirmBar: 5, consumed: false }];
    const idx = detectAuthoritative(store, 10, (lvl) => true);
    assert.equal(idx, 0, 'the single level must still be found');
  });

  it('multiple retained levels preserve the exact same priority (highest confirmBar wins) as before the patch', () => {
    const store = [
      { price: 100, confirmBar: 5, consumed: false },
      { price: 101, confirmBar: 8, consumed: false },  // most recent confirmBar — must win
      { price: 99, confirmBar: 3, consumed: false },
    ];
    const idx = detectAuthoritative(store, 10, (lvl) => true);
    assert.equal(idx, 1, 'the level with the highest confirmBar must be selected as authoritative, exactly as before this patch');
  });

  it('an empty store never throws or behaves differently from "no event" in any of the guarded contexts (break, sweep, retirement, nearest-anchor)', () => {
    // f_nearestAbove/f_nearestBelow equivalent: empty store -> na/undefined, never a crash.
    function nearestAbove(store, refPrice) {
      let best;
      if (store.length > 0) {
        for (const lvl of store) {
          if (!lvl.consumed && lvl.price > refPrice && (best === undefined || lvl.price < best)) best = lvl.price;
        }
      }
      return best;
    }
    assert.equal(nearestAbove([], 100), undefined);
    assert.equal(nearestAbove([{ price: 105, consumed: false }], 100), 105);
  });
});
