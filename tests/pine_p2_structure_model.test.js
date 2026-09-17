/**
 * Pine P2 review-fix: structural-level retention/selection algorithm proof.
 *
 * There is no Pine execution/bar-replay harness outside TradingView's own
 * runtime. The chronology GUARDS (confirmed-bar gating, bar_index >
 * confirmBar, etc.) are already proven by static source audit
 * (tests/pine_p2_chronology_audit.test.js) — regex proof is adequate for
 * "does this guard clause exist." But the born-consumed WINDOW CALCULATION
 * and the bounded-retention/authoritative-level-SELECTION algorithm are
 * genuine data-flow logic that static pattern matching cannot actually
 * execute or verify against constructed scenarios.
 *
 * This file is therefore a FAITHFUL JAVASCRIPT TRANSLITERATION of that exact
 * Pine algorithm (same variable roles, same two-pass find-authoritative-
 * then-retire-all-crossed structure, same field names on the level record),
 * executed for real in Node against constructed multi-level scenarios. It
 * is not a claim that the .pine file itself was executed — a companion
 * source-audit test below cross-checks that the Pine file's own key
 * expressions match what this model asserts, so the two can't silently
 * drift apart.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Faithful reference model of pine/XAUUSD_Adaptive_Master.pine's
// StructLevel + activeHighLevels/activeLowLevels + detection block ────────

function makeLevel({ price, kind = 'HH', locationBar, confirmBar, bornCloseConsumed = false, bornWickInteracted = false }) {
  return {
    price, kind, locationBar, confirmBar,
    bornCloseConsumed, bornWickInteracted,
    consumed: bornCloseConsumed,   // mirrors Pine: lastSwingHighConsumed-equivalent field init
    swept: bornWickInteracted,
  };
}

function pushLevel(store, level, maxActiveLevels) {
  store.push(level);
  if (store.length > maxActiveLevels) store.shift(); // FIFO eviction — mirrors array.shift()
}

/**
 * Mirrors the Pine detection block for ONE side.
 * @param {'high'|'low'} side
 * @param {{close:number, high:number, low:number}} bar
 */
function detectSide(store, barIndex, bar, side) {
  const breaks = (lvl) => side === 'high' ? bar.close > lvl.price : bar.close < lvl.price;
  const wicks = (lvl) => side === 'high' ? bar.high > lvl.price : bar.low < lvl.price;

  let authIdx = -1, authConfirmBar = -1;
  for (let i = 0; i < store.length; i++) {
    const lvl = store[i];
    if (!lvl.consumed && barIndex > lvl.confirmBar && breaks(lvl) && lvl.confirmBar > authConfirmBar) {
      authConfirmBar = lvl.confirmBar;
      authIdx = i;
    }
  }
  if (authIdx >= 0) {
    for (const lvl of store) {
      if (!lvl.consumed && barIndex > lvl.confirmBar && breaks(lvl)) lvl.consumed = true;
    }
    return { type: 'BREAK', authIdx, authLevel: store[authIdx] };
  }

  let sweepIdx = -1, sweepConfirmBar = -1;
  for (let i = 0; i < store.length; i++) {
    const lvl = store[i];
    if (!lvl.consumed && !lvl.swept && barIndex > lvl.confirmBar && wicks(lvl) && lvl.confirmBar > sweepConfirmBar) {
      sweepConfirmBar = lvl.confirmBar;
      sweepIdx = i;
    }
  }
  if (sweepIdx >= 0) {
    for (const lvl of store) {
      if (!lvl.consumed && !lvl.swept && barIndex > lvl.confirmBar && wicks(lvl)) lvl.swept = true;
    }
    return { type: 'SWEEP', sweepIdx, sweepLevel: store[sweepIdx] };
  }

  return { type: 'NONE' };
}

// Mirrors the Pine born-consumed window calculation (gap = bars strictly
// between pivot location and confirmation).
function computeBornFlags(pivotVal, side, gapBars) {
  if (gapBars.length === 0) return { bornWickInteracted: false, bornCloseConsumed: false };
  if (side === 'high') {
    const maxHigh = Math.max(...gapBars.map((b) => b.high));
    const maxClose = Math.max(...gapBars.map((b) => b.close));
    return { bornWickInteracted: maxHigh > pivotVal, bornCloseConsumed: maxClose > pivotVal };
  }
  const minLow = Math.min(...gapBars.map((b) => b.low));
  const minClose = Math.min(...gapBars.map((b) => b.close));
  return { bornWickInteracted: minLow < pivotVal, bornCloseConsumed: minClose < pivotVal };
}

// ── §1: born-consumed — close vs wick, both sides ─────────────────────────

describe('Born-consumed: CLOSE vs WICK, computed and wired separately', () => {
  it('pivot HIGH: a gap bar whose WICK (high) exceeds the pivot but whose CLOSE does not → wick-interacted=true, close-consumed=false', () => {
    const flags = computeBornFlags(100, 'high', [{ high: 101, low: 98, close: 99 }]);
    assert.equal(flags.bornWickInteracted, true);
    assert.equal(flags.bornCloseConsumed, false);
  });

  it('pivot HIGH: a gap bar whose CLOSE exceeds the pivot → both wick-interacted and close-consumed true (close implies wick)', () => {
    const flags = computeBornFlags(100, 'high', [{ high: 102, low: 99, close: 101 }]);
    assert.equal(flags.bornWickInteracted, true);
    assert.equal(flags.bornCloseConsumed, true);
  });

  it('pivot HIGH: no gap bar touches the level → both false', () => {
    const flags = computeBornFlags(100, 'high', [{ high: 95, low: 90, close: 92 }]);
    assert.equal(flags.bornWickInteracted, false);
    assert.equal(flags.bornCloseConsumed, false);
  });

  it('pivot HIGH: empty gap (pivotRightBars=1, no bars physically exist between location and confirmation) → both false', () => {
    const flags = computeBornFlags(100, 'high', []);
    assert.equal(flags.bornWickInteracted, false);
    assert.equal(flags.bornCloseConsumed, false);
  });

  it('pivot LOW: a gap bar whose WICK (low) undercuts the pivot but whose CLOSE does not → wick-interacted=true, close-consumed=false', () => {
    const flags = computeBornFlags(100, 'low', [{ high: 103, low: 99, close: 101 }]);
    assert.equal(flags.bornWickInteracted, true);
    assert.equal(flags.bornCloseConsumed, false);
  });

  it('pivot LOW: a gap bar whose CLOSE undercuts the pivot → both true', () => {
    const flags = computeBornFlags(100, 'low', [{ high: 102, low: 97, close: 98 }]);
    assert.equal(flags.bornWickInteracted, true);
    assert.equal(flags.bornCloseConsumed, true);
  });

  it('a born-wick-interacted level is created with swept=true, so it can never later masquerade as a "first fresh sweep"', () => {
    const flags = computeBornFlags(100, 'high', [{ high: 101, low: 98, close: 99 }]);
    const level = makeLevel({ price: 100, locationBar: 10, confirmBar: 15, bornCloseConsumed: flags.bornCloseConsumed, bornWickInteracted: flags.bornWickInteracted });
    assert.equal(level.swept, true, 'level must be born already-swept');
    // Confirm detectSide never reports a fresh sweep for it later.
    const store = [level];
    const result = detectSide(store, 16, { close: 90, high: 100.5, low: 89 }, 'high'); // wick touches again, but already swept
    assert.notEqual(result.type, 'SWEEP');
  });

  it('a born-close-consumed level is created with consumed=true, so it can never later fake a BOS/CHoCH', () => {
    const flags = computeBornFlags(100, 'high', [{ high: 102, low: 99, close: 101 }]);
    const level = makeLevel({ price: 100, locationBar: 10, confirmBar: 15, bornCloseConsumed: flags.bornCloseConsumed, bornWickInteracted: flags.bornWickInteracted });
    assert.equal(level.consumed, true, 'level must be born already-consumed');
    const store = [level];
    const result = detectSide(store, 16, { close: 105, high: 106, low: 104 }, 'high'); // genuinely closes above, but already consumed
    assert.notEqual(result.type, 'BREAK', 'a born-consumed level must never fire a break event');
  });
});

// ── §2: bounded retention — older level survives a newer pivot ───────────

describe('Bounded active-level retention', () => {
  it('an older, still-unbroken high level survives a newer pivot confirming (not silently discarded)', () => {
    const store = [];
    const A = makeLevel({ price: 100, kind: 'HH', locationBar: 5, confirmBar: 10 });
    pushLevel(store, A, 3);
    const B = makeLevel({ price: 105, kind: 'HH', locationBar: 15, confirmBar: 20 });
    pushLevel(store, B, 3);
    assert.equal(store.length, 2);
    assert.ok(store.includes(A), 'A must still be present after B confirms');
    assert.equal(A.consumed, false);
  });

  it('the older level can still generate its own legitimate break after a newer pivot has been retained alongside it', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    const B = makeLevel({ price: 110, confirmBar: 20 }); // newer, higher, still unbroken
    pushLevel(store, A, 3);
    pushLevel(store, B, 3);
    // A bar that breaks ONLY A (102 > 100 but not > 110).
    const result = detectSide(store, 21, { close: 102, high: 103, low: 99 }, 'high');
    assert.equal(result.type, 'BREAK');
    assert.equal(result.authLevel, A);
    assert.equal(A.consumed, true);
    assert.equal(B.consumed, false, 'B must remain untouched — this bar never crossed it');
  });

  it('documented supersession: capacity eviction (FIFO) removes exactly the oldest level when the cap is exceeded', () => {
    const store = [];
    const levels = [10, 20, 30, 40].map((cb) => makeLevel({ price: 100 + cb, confirmBar: cb }));
    for (const lvl of levels) pushLevel(store, lvl, 3);
    assert.equal(store.length, 3, 'store must never exceed maxActiveLevels');
    assert.ok(!store.includes(levels[0]), 'the OLDEST (confirmBar=10) must be the one evicted');
    assert.ok(store.includes(levels[1]) && store.includes(levels[2]) && store.includes(levels[3]));
  });

  it('bounded level storage cannot grow without limit even under sustained pivot formation', () => {
    const store = [];
    for (let i = 0; i < 500; i++) {
      pushLevel(store, makeLevel({ price: 100 + i, confirmBar: i }), 3);
    }
    assert.equal(store.length, 3);
  });

  it('the mirror low-side retention behaves identically (older low survives a newer pivot low)', () => {
    const store = [];
    const A = makeLevel({ price: 100, kind: 'HL', confirmBar: 10 });
    const B = makeLevel({ price: 95, kind: 'HL', confirmBar: 20 });
    pushLevel(store, A, 3);
    pushLevel(store, B, 3);
    assert.ok(store.includes(A) && store.includes(B));
    const result = detectSide(store, 21, { close: 98, high: 99, low: 97 }, 'low'); // breaks only A (98<100, not <95)
    assert.equal(result.type, 'BREAK');
    assert.equal(result.authLevel, A);
    assert.equal(B.consumed, false);
  });
});

// ── §3/§4: deterministic authoritative event when multiple levels cross ──

describe('Deterministic level-selection priority (one authoritative event per bar per side)', () => {
  it('one bar closing above MULTIPLE active high levels fires exactly one event, for the MOST RECENTLY CONFIRMED level, and retires every level actually crossed', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });  // oldest
    const B = makeLevel({ price: 105, confirmBar: 20 });  // middle
    const C = makeLevel({ price: 110, confirmBar: 30 });  // most recent, still highest price
    pushLevel(store, A, 5); pushLevel(store, B, 5); pushLevel(store, C, 5);
    // A bar that closes above ALL three (e.g. a large displacement bar).
    const result = detectSide(store, 31, { close: 115, high: 116, low: 108 }, 'high');
    assert.equal(result.type, 'BREAK');
    assert.equal(result.authLevel, C, 'the most-recently-confirmed crossed level must be authoritative');
    assert.equal(A.consumed, true, 'A was genuinely crossed too — retired, but did not fire its own event');
    assert.equal(B.consumed, true);
    assert.equal(C.consumed, true);
  });

  it('one bar closing below MULTIPLE active low levels mirrors the same priority rule', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    const B = makeLevel({ price: 95, confirmBar: 20 });
    const C = makeLevel({ price: 90, confirmBar: 30 });
    pushLevel(store, A, 5); pushLevel(store, B, 5); pushLevel(store, C, 5);
    const result = detectSide(store, 31, { close: 85, high: 92, low: 84 }, 'low');
    assert.equal(result.type, 'BREAK');
    assert.equal(result.authLevel, C);
    assert.equal(A.consumed, true);
    assert.equal(B.consumed, true);
  });

  it('a level that is not actually crossed by this bar is left untouched even when a different level fires', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    const farAway = makeLevel({ price: 500, confirmBar: 20 }); // far above, never crossed
    pushLevel(store, A, 5); pushLevel(store, farAway, 5);
    const result = detectSide(store, 21, { close: 102, high: 103, low: 99 }, 'high');
    assert.equal(result.authLevel, A);
    assert.equal(farAway.consumed, false);
  });

  it('the same retained level cannot fire BOS/CHoCH twice — once consumed, later bars skip it entirely', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    pushLevel(store, A, 5);
    const first = detectSide(store, 11, { close: 102, high: 103, low: 99 }, 'high');
    assert.equal(first.type, 'BREAK');
    assert.equal(A.consumed, true);
    // Price stays above the level for several more bars — must never re-fire.
    for (const barIndex of [12, 13, 14]) {
      const again = detectSide(store, barIndex, { close: 104, high: 105, low: 101 }, 'high');
      assert.notEqual(again.type, 'BREAK', `bar ${barIndex} must not re-fire BOS for an already-consumed level`);
    }
  });

  it('the same retained level cannot fire a sweep twice', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    pushLevel(store, A, 5);
    const first = detectSide(store, 11, { close: 99, high: 101, low: 98 }, 'high'); // wick only, no close-break
    assert.equal(first.type, 'SWEEP');
    assert.equal(A.swept, true);
    for (const barIndex of [12, 13]) {
      const again = detectSide(store, barIndex, { close: 99, high: 101, low: 98 }, 'high');
      assert.notEqual(again.type, 'SWEEP', `bar ${barIndex} must not re-fire a sweep for an already-swept level`);
    }
  });

  it('a level can sweep once and remain eligible for a LATER genuine close-based break (documented lifecycle)', () => {
    const store = [];
    const A = makeLevel({ price: 100, confirmBar: 10 });
    pushLevel(store, A, 5);
    const sweep = detectSide(store, 11, { close: 99, high: 101, low: 98 }, 'high');
    assert.equal(sweep.type, 'SWEEP');
    assert.equal(A.consumed, false, 'a sweep must not consume the level');
    const laterBreak = detectSide(store, 12, { close: 103, high: 104, low: 100 }, 'high');
    assert.equal(laterBreak.type, 'BREAK');
    assert.equal(laterBreak.authLevel, A);
  });
});

// ── Cross-check: the Pine source's key expressions match this model ──────

describe('Model-to-source cross-check', () => {
  const source = readFileSync(fileURLToPath(new URL('../pine/XAUUSD_Adaptive_Master.pine', import.meta.url)), 'utf8');

  it('Pine source uses the same "most recent confirmBar wins" authoritative-selection comparison this model implements', () => {
    assert.ok(/lvl\.confirmBar\s*>\s*auth\w*ConfirmBar/.test(source), 'expected a max-confirmBar tracking comparison matching the model\'s priority rule');
  });

  it('Pine source retires (marks consumed/swept) every crossed level, not just the authoritative one', () => {
    const consumedRetirementLoops = [...source.matchAll(/lvl2\.consumed\s*:=\s*true/g)];
    const sweptRetirementLoops = [...source.matchAll(/lvl2\.swept\s*:=\s*true/g)];
    assert.equal(consumedRetirementLoops.length, 2, 'expected exactly 2 (high side + low side) "retire all crossed" consumed assignments');
    assert.equal(sweptRetirementLoops.length, 2, 'expected exactly 2 (high side + low side) "retire all crossed" swept assignments');
  });

  it('Pine source initializes a new level\'s consumed/swept fields directly from its born-flags (StructLevel.new call)', () => {
    assert.ok(/StructLevel\.new\(pivotHighVal,\s*newHighType,.*bornCloseConsumedHigh,\s*bornWickInteractedHigh,\s*bornCloseConsumedHigh,\s*bornWickInteractedHigh\)/.test(source));
    assert.ok(/StructLevel\.new\(pivotLowVal,\s*newLowType,.*bornCloseConsumedLow,\s*bornWickInteractedLow,\s*bornCloseConsumedLow,\s*bornWickInteractedLow\)/.test(source));
  });

  it('Pine source computes the gap window EXCLUDING the pivot\'s own location bar (length = pivotRightBars - 1)', () => {
    assert.ok(/gapLen\s*=\s*math\.max\(pivotRightBars\s*-\s*1,\s*1\)/.test(source));
    assert.ok(/hasConfirmGap\s*=\s*pivotRightBars\s*>\s*1/.test(source));
  });

  it('Pine source bounds storage with array.shift on overflow (FIFO), matching the model\'s pushLevel', () => {
    const shifts = [...source.matchAll(/array\.shift\(active(High|Low)Levels\)/g)];
    assert.equal(shifts.length, 2, 'expected exactly one FIFO eviction call per side');
  });
});
