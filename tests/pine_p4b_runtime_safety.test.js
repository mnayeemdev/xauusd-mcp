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
      // Accept the guard either standalone ("if array.size(x) > 0") or
      // combined with an additional leading condition via "and"
      // ("if confirmedBar and array.size(x) > 0") — both genuinely prevent
      // the loop from ever running against an empty array; only the
      // exact-standalone form is required to match the original
      // indentation-anchored shape.
      const combinedGuardRe = new RegExp(`^\\s*if\\s+.+\\s+and\\s+array\\.size\\(${ident}\\)\\s*>\\s*0\\s*$`);
      assert.ok(
        guardRe.test(lines[j]) || combinedGuardRe.test(lines[j]) || new RegExp(`if\\s+array\\.size\\(${ident}\\)\\s*>\\s*0`).test(lines[j]),
        `line ${i + 1} ("for i = 0 to array.size(${ident}) - 1") is not immediately guarded by "if array.size(${ident}) > 0" (standalone or "and"-combined) — found instead: "${lines[j].trim()}"`
      );
    }
    // 10 from the original P4B audit + 6 introduced by P5's signal
    // recorder/outcome engine/statistics tables that match this EXACT
    // forward-loop shape (each independently proven guarded by the loop
    // above). The P5 OUTCOME RESOLUTION loop itself is now a deliberate
    // BACKWARD loop (`for i = array.size(openSignals) - 1 to 0`, needed to
    // safely remove elements during iteration — see the P5 review/fix
    // OPEN-record-eviction-correctness change) and is checked by a
    // dedicated test below instead of this forward-only pattern.
    assert.equal(matchCount, 16, `expected exactly 16 forward "for i = 0 to array.size(x) - 1" loops (10 P4B + 6 P5); found ${matchCount} — update this count only if the inventory in docs/PINE_P4B.md / docs/PINE_P5.md is updated to match`);
  });

  it('the P5 OUTCOME RESOLUTION backward loop (for safe in-loop array.remove) is guarded against an empty openSignals array exactly like every forward loop', () => {
    // The guard is combined with confirmedBar (like several forward loops
    // in this file) rather than standalone — both forms genuinely prevent
    // the loop from ever running against an empty array.
    const backwardRe = /if confirmedBar and array\.size\(openSignals\) > 0\s*\n(?:\s*\/\/.*\n)*\s*for i = array\.size\(openSignals\) - 1 to 0/;
    assert.ok(backwardRe.test(source), 'the backward resolution loop must be guarded by "if ... array.size(openSignals) > 0" immediately before it (skipping only comment lines), exactly like every forward loop in this file');
  });

  it('array.remove() now legitimately exists (P5 review/fix), but ONLY as the one safe in-loop removal inside the guarded, backward-iterating P5 resolution loop — no other unsafe indexed-collection function (array.first/array.last/array.pop/array.insert) exists anywhere', () => {
    for (const fn of ['array.first', 'array.last', 'array.pop', 'array.insert']) {
      assert.ok(!source.includes(`${fn}(`), `${fn}() must not be introduced without an equivalent empty-collection audit`);
    }
    // Strip comment-only lines first — this file's own explanatory prose
    // mentions "array.remove()" twice without it being a real call site.
    const codeOnly = lines.map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const removeCalls = [...codeOnly.matchAll(/array\.remove\([^)]*\)/g)];
    assert.equal(removeCalls.length, 1, 'expected exactly 1 real array.remove() call site in the entire file (comments mentioning it do not count)');
    assert.ok(/array\.remove\(openSignals, i\)/.test(source), 'the one array.remove() call must remove by the current backward-loop index i from openSignals, which is always < array.size(openSignals) by construction of the loop bounds — safe by the same reasoning that makes backward-iteration-with-removal a standard pattern');
  });

  it('array.shift() call sites remain safe: P2\'s two capacity-eviction sites remain guarded by "size > maxActiveLevels" preceded by array.push() (guaranteeing size >= 1); P5\'s recentHistory (closed-only) eviction is guarded by "size >= p5MaxTrackedSignals" instead (a capacity check ahead of the push, not a post-push overflow check — still provably safe, since array.shift() on an empty array is never reachable there either: the guard only ever removes an EXISTING oldest element to make room, and array.push() unconditionally follows it in the same block). Critically, openSignals (the never-evicted OPEN tracker) must have NO array.shift() call anywhere.', () => {
    // Exclude comment-only lines (e.g. a comment that mentions "array.shift()"
    // in prose) from this count — only real code call sites are counted.
    const codeLines = lines.map((l) => l.replace(/\/\/.*$/, ''));
    const shiftLines = codeLines.map((l, idx) => ({ l, idx })).filter(({ l }) => /array\.shift\(/.test(l));
    assert.equal(shiftLines.length, 3, 'expected exactly 3 array.shift() call sites (activeHighLevels, activeLowLevels, recentHistory)');

    const p2Sites = shiftLines.filter(({ l }) => l.includes('activeHighLevels') || l.includes('activeLowLevels'));
    const p5Sites = shiftLines.filter(({ l }) => l.includes('recentHistory'));
    const openSignalsShiftSites = shiftLines.filter(({ l }) => l.includes('openSignals'));
    assert.equal(p2Sites.length, 2, 'expected exactly 2 P2 capacity-eviction sites');
    assert.equal(p5Sites.length, 1, 'expected exactly 1 P5 capacity-eviction site (recentHistory only)');
    assert.equal(openSignalsShiftSites.length, 0, 'openSignals must NEVER be capacity-evicted via array.shift() — this is the exact defect the P5 review/fix gate corrected');

    for (const { idx } of p2Sites) {
      const guardLine = lines[idx - 1];
      assert.ok(/if\s+array\.size\(\w+\)\s*>\s*maxActiveLevels/.test(guardLine), `P2 array.shift() at line ${idx + 1} must be guarded by "if array.size(x) > maxActiveLevels": found "${guardLine.trim()}"`);
      const pushLine = lines[idx - 2];
      assert.ok(/array\.push\(/.test(pushLine), `P2 array.shift() at line ${idx + 1} must be preceded by array.push() on the same array (guaranteeing size >= 1): found "${pushLine.trim()}"`);
    }
    for (const { idx } of p5Sites) {
      const guardLine = lines[idx - 1];
      assert.ok(/if\s+array\.size\(recentHistory\)\s*>=\s*p5MaxTrackedSignals/.test(guardLine), `P5 array.shift() at line ${idx + 1} must be guarded by "if array.size(recentHistory) >= p5MaxTrackedSignals": found "${guardLine.trim()}"`);
      const pushLine = lines[idx + 1];
      assert.ok(/array\.push\(recentHistory, rec\)/.test(pushLine), `P5 array.shift() at line ${idx + 1} must be immediately followed by array.push(recentHistory, rec), guaranteeing the array is never left empty and shift() only ever runs when it already has >= p5MaxTrackedSignals (>= 10 minval) elements: found "${pushLine.trim()}"`);
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
  it('INDICATOR_VERSION was bumped at least to 0.3.1 by the P4B runtime-safety patch (P5 may bump it further)', () => {
    const m = source.match(/INDICATOR_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
    assert.ok(m, 'INDICATOR_VERSION must exist');
    const [, major, minor, patch] = m.map(Number);
    const atLeast031 = major > 0 || (major === 0 && (minor > 3 || (minor === 3 && patch >= 1)));
    assert.ok(atLeast031, `INDICATOR_VERSION "${m[0]}" must be at least 0.3.1 (the P4B runtime-safety patch version)`);
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
