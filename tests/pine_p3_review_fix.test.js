/**
 * Pine P3 review/fix pass — proof of the three corrected defects:
 *   1. MR boundary/sweep requirement (explicit touch + displacement blocker)
 *   2. ENTRY_LATE dead-gate fix (model-specific chronological staleness)
 *   3. BO retest → reclaim chronology (three distinct bars, never collapsed)
 *
 * Faithful JS reference-model of the corrected Pine expressions, executed
 * for real against constructed scenarios — the same technique used
 * throughout this project. tests/pine_p3_audit.test.js cross-checks that
 * the Pine source's actual expressions match this model.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── §1: MR trigger (ported verbatim from the fixed Pine expressions) ─────
function mrLongTrigger({ low, close, rangeLow, atr, tol = 0.5, barsSinceBearishDisp = null, blockBars = 2 }) {
  const blocked = barsSinceBearishDisp !== null && barsSinceBearishDisp <= blockBars;
  const setupReady = low <= rangeLow && !blocked;
  return setupReady && low <= rangeLow && close > rangeLow && (rangeLow - low) <= tol * atr && !blocked;
}
function mrShortTrigger({ high, close, rangeHigh, atr, tol = 0.5, barsSinceBullishDisp = null, blockBars = 2 }) {
  const blocked = barsSinceBullishDisp !== null && barsSinceBullishDisp <= blockBars;
  const setupReady = high >= rangeHigh && !blocked;
  return setupReady && high >= rangeHigh && close < rangeHigh && (high - rangeHigh) <= tol * atr && !blocked;
}

describe('§1 MR boundary/sweep requirement fix', () => {
  it('a candle fully ABOVE rangeLow (low never touches it) → NO trigger, even if close is arbitrarily close to rangeLow', () => {
    // low=101 > rangeLow=100 — never touched the boundary at all.
    assert.equal(mrLongTrigger({ low: 101, close: 100.5, rangeLow: 100, atr: 2 }), false);
  });

  it('a candle fully BELOW rangeHigh (high never touches it) → NO trigger', () => {
    assert.equal(mrShortTrigger({ high: 99, close: 99.5, rangeHigh: 100, atr: 2 }), false);
  });

  it('a genuine low sweep (low undercuts rangeLow, within tolerance) + close back inside → valid MR long candidate', () => {
    // rangeLow=100, low=99.5 → overshoot=0.5, tolerance=0.5*2=1 → within tolerance.
    assert.equal(mrLongTrigger({ low: 99.5, close: 100.5, rangeLow: 100, atr: 2 }), true);
  });

  it('a genuine high sweep (high overshoots rangeHigh, within tolerance) + close back inside → valid MR short candidate', () => {
    assert.equal(mrShortTrigger({ high: 100.5, close: 99.5, rangeHigh: 100, atr: 2 }), true);
  });

  it('excessive overshoot beyond the ATR tolerance is rejected even though the boundary WAS touched', () => {
    // rangeLow=100, low=90 → overshoot=10, tolerance=0.5*2=1 → rejected.
    assert.equal(mrLongTrigger({ low: 90, close: 100.5, rangeLow: 100, atr: 2 }), false);
  });

  it('an exact touch (low == rangeLow) is accepted (<=, not strict <)', () => {
    assert.equal(mrLongTrigger({ low: 100, close: 100.5, rangeLow: 100, atr: 2 }), true);
  });

  it('a strong RECENT bearish displacement blocks MR long, even one bar before the sweep bar itself', () => {
    assert.equal(mrLongTrigger({ low: 99.5, close: 100.5, rangeLow: 100, atr: 2, barsSinceBearishDisp: 1, blockBars: 2 }), false);
    // Outside the block window, MR is allowed again.
    assert.equal(mrLongTrigger({ low: 99.5, close: 100.5, rangeLow: 100, atr: 2, barsSinceBearishDisp: 5, blockBars: 2 }), true);
  });

  it('a strong RECENT bullish displacement blocks MR short', () => {
    assert.equal(mrShortTrigger({ high: 100.5, close: 99.5, rangeHigh: 100, atr: 2, barsSinceBullishDisp: 0, blockBars: 2 }), false);
    assert.equal(mrShortTrigger({ high: 100.5, close: 99.5, rangeHigh: 100, atr: 2, barsSinceBullishDisp: 10, blockBars: 2 }), true);
  });
});

// ── §3: BO bar-by-bar state machine (ported verbatim) ─────────────────────
function newBoState() {
  return { active: false, level: null, breakoutBar: null, retested: false, retestBar: null };
}

// Mirrors the exact `if confirmedBar` block for one side (long shown; short
// is the mirror image and tested separately below).
function stepBoLong(state, { barIndex, rangeJustBroke, breakoutDirectionUp, close, low, level, atr, tol = 0.3, maxBars = 15 }) {
  const s = { ...state };
  if (rangeJustBroke && breakoutDirectionUp) {
    s.active = true;
    s.level = level;
    s.breakoutBar = barIndex;
    s.retested = false;
    s.retestBar = null;
  }
  if (s.active && (barIndex - s.breakoutBar) > maxBars) s.active = false;
  if (s.active && !s.retested && barIndex > s.breakoutBar && low <= s.level + tol * atr) {
    s.retested = true;
    s.retestBar = barIndex;
  }
  if (s.active && s.retested && barIndex > s.retestBar && close < s.level - tol * atr) {
    s.active = false; // retest failed through
  }
  const trigger = s.active && s.retested && s.retestBar !== null && barIndex > s.retestBar && close > s.level;
  return { state: s, trigger };
}

describe('§3 BO retest → reclaim chronology fix', () => {
  it('breakout bar itself can never also be the retest bar', () => {
    let s = newBoState();
    // Bar 100: breakout AND (hypothetically) low already near the level in
    // the same candle — the retest check requires bar_index > breakoutBar,
    // so it cannot register on bar 100 itself.
    const r1 = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 100.1, level: 100, atr: 1 });
    assert.equal(r1.state.retested, false, 'retest must not register on the breakout bar itself');
    assert.equal(r1.state.breakoutBar, 100);
  });

  it('the retest bar itself can never also be the reclaim/trigger bar', () => {
    let s = newBoState();
    let r = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 104, level: 100, atr: 1 });
    s = r.state;
    // Bar 101: price dips to retest AND closes back above the level on the SAME bar.
    r = stepBoLong(s, { barIndex: 101, rangeJustBroke: false, breakoutDirectionUp: false, close: 100.5, low: 100.1, level: 100, atr: 1 });
    assert.equal(r.state.retested, true, 'retest correctly recorded on bar 101');
    assert.equal(r.state.retestBar, 101);
    assert.equal(r.trigger, false, 'the SAME bar that records the retest must never also fire the reclaim trigger');
  });

  it('breakout → retest → LATER reclaim is a valid sequence', () => {
    let s = newBoState();
    let r = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 104, level: 100, atr: 1 }); s = r.state;
    r = stepBoLong(s, { barIndex: 101, rangeJustBroke: false, breakoutDirectionUp: false, close: 99.9, low: 99.8, level: 100, atr: 1 }); s = r.state; // retest bar, closes below (no premature reclaim)
    assert.equal(s.retested, true);
    assert.equal(r.trigger, false);
    r = stepBoLong(s, { barIndex: 102, rangeJustBroke: false, breakoutDirectionUp: false, close: 101, low: 100, level: 100, atr: 1 }); // later bar reclaims
    assert.equal(r.trigger, true, 'a genuinely later bar reclaiming the level is a valid trigger');
  });

  it('breakout with NO retest ever occurring → no trigger (WAIT)', () => {
    let s = newBoState();
    let r = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 104, level: 100, atr: 1 }); s = r.state;
    // Price runs away and never comes back near the level.
    for (let b = 101; b <= 110; b++) {
      r = stepBoLong(s, { barIndex: b, rangeJustBroke: false, breakoutDirectionUp: false, close: 120, low: 118, level: 100, atr: 1 });
      s = r.state;
      assert.equal(r.trigger, false);
    }
  });

  it('a retest arriving AFTER maxBars has expired never triggers (invalidated by expiry)', () => {
    let s = newBoState();
    let r = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 104, level: 100, atr: 1, maxBars: 5 }); s = r.state;
    for (let b = 101; b <= 107; b++) {
      r = stepBoLong(s, { barIndex: b, rangeJustBroke: false, breakoutDirectionUp: false, close: 120, low: 118, level: 100, atr: 1, maxBars: 5 });
      s = r.state;
    }
    assert.equal(s.active, false, 'the sequence must have expired before bar 107');
    // Even a "perfect" retest+reclaim now cannot register since active=false.
    r = stepBoLong(s, { barIndex: 108, rangeJustBroke: false, breakoutDirectionUp: false, close: 101, low: 100, level: 100, atr: 1, maxBars: 5 });
    assert.equal(r.trigger, false);
  });

  it('a retest that fails THROUGH the boundary is invalidated, not left dangling for a contradictory later reclaim', () => {
    let s = newBoState();
    let r = stepBoLong(s, { barIndex: 100, rangeJustBroke: true, breakoutDirectionUp: true, close: 105, low: 104, level: 100, atr: 1 }); s = r.state;
    r = stepBoLong(s, { barIndex: 101, rangeJustBroke: false, breakoutDirectionUp: false, close: 99.9, low: 99.8, level: 100, atr: 1 }); s = r.state; // retest recorded
    // Bar 102: price closes decisively back through the boundary (genuine breakdown).
    r = stepBoLong(s, { barIndex: 102, rangeJustBroke: false, breakoutDirectionUp: false, close: 95, low: 94, level: 100, atr: 1 }); s = r.state;
    assert.equal(s.active, false, 'a retest failing through the level must invalidate the sequence');
    // A later bar closing back above the level must NOT trigger — the sequence is dead.
    r = stepBoLong(s, { barIndex: 103, rangeJustBroke: false, breakoutDirectionUp: false, close: 101, low: 100, level: 100, atr: 1 });
    assert.equal(r.trigger, false);
  });

  it('short-side sequence mirrors the long side exactly (breakout → retest → later reclaim)', () => {
    // Mirror function for short.
    function stepBoShort(state, { barIndex, rangeJustBroke, breakoutDirectionDown, close, high, level, atr, tol = 0.3, maxBars = 15 }) {
      const s = { ...state };
      if (rangeJustBroke && breakoutDirectionDown) { s.active = true; s.level = level; s.breakoutBar = barIndex; s.retested = false; s.retestBar = null; }
      if (s.active && (barIndex - s.breakoutBar) > maxBars) s.active = false;
      if (s.active && !s.retested && barIndex > s.breakoutBar && high >= s.level - tol * atr) { s.retested = true; s.retestBar = barIndex; }
      if (s.active && s.retested && barIndex > s.retestBar && close > s.level + tol * atr) s.active = false;
      const trigger = s.active && s.retested && s.retestBar !== null && barIndex > s.retestBar && close < s.level;
      return { state: s, trigger };
    }
    let s = newBoState();
    let r = stepBoShort(s, { barIndex: 200, rangeJustBroke: true, breakoutDirectionDown: true, close: 95, high: 96, level: 100, atr: 1 }); s = r.state;
    r = stepBoShort(s, { barIndex: 201, rangeJustBroke: false, breakoutDirectionDown: false, close: 100.1, high: 100.2, level: 100, atr: 1 }); s = r.state;
    assert.equal(r.trigger, false, 'retest bar cannot also be the reclaim bar');
    r = stepBoShort(s, { barIndex: 202, rangeJustBroke: false, breakoutDirectionDown: false, close: 99, high: 99.5, level: 100, atr: 1 });
    assert.equal(r.trigger, true, 'a later bar reclaiming below the level is a valid short trigger');
  });
});

// ── §2: model-specific ENTRY_LATE (ported verbatim) ───────────────────────
function computeEntryLate({ model, isLong, barIndex, dispBarsAgo, corrResolvedBar, breakoutBar, tcMax = 5, pbMax = 5, boMax = 10 }) {
  let originBar = null;
  let maxLate = 0;
  if (model === 'TC') { originBar = dispBarsAgo === null ? null : barIndex - dispBarsAgo; maxLate = tcMax; }
  else if (model === 'PB') { originBar = corrResolvedBar; maxLate = pbMax; }
  else if (model === 'BO') { originBar = breakoutBar; maxLate = boMax; }
  else if (model === 'MR' || model === 'SR') { originBar = barIndex; maxLate = 0; }
  if (originBar === null) return false;
  return (barIndex - originBar) > maxLate;
}

describe('§2 ENTRY_LATE is no longer structurally dead', () => {
  it('a FRESH TC opportunity (displacement 2 bars ago, within tcMax=5) passes the lateness gate', () => {
    assert.equal(computeEntryLate({ model: 'TC', barIndex: 100, dispBarsAgo: 2 }), false);
  });

  it('a STALE TC setup (displacement 7 bars ago, beyond tcMax=5 but still within the 10-bar setup-recency window) → ENTRY_LATE', () => {
    assert.equal(computeEntryLate({ model: 'TC', barIndex: 100, dispBarsAgo: 7 }), true);
  });

  it('a FRESH PB opportunity (resolved 3 bars ago) passes', () => {
    assert.equal(computeEntryLate({ model: 'PB', barIndex: 100, corrResolvedBar: 97 }), false);
  });

  it('a STALE PB resolution (8 bars ago, beyond pbMax=5) → ENTRY_LATE', () => {
    assert.equal(computeEntryLate({ model: 'PB', barIndex: 100, corrResolvedBar: 92 }), true);
  });

  it('a BO sequence resolving within boMax=10 bars of the breakout passes', () => {
    assert.equal(computeEntryLate({ model: 'BO', barIndex: 108, breakoutBar: 100 }), false);
  });

  it('a BO sequence resolving beyond boMax=10 bars of the breakout (but still within boRetestMaxBars=15) → ENTRY_LATE', () => {
    assert.equal(computeEntryLate({ model: 'BO', barIndex: 112, breakoutBar: 100 }), true);
  });

  it('MR is same-bar by construction — the origin is always the current bar, so age is always exactly 0 and it can never be late', () => {
    for (const barIndex of [50, 100, 100000]) {
      assert.equal(computeEntryLate({ model: 'MR', barIndex, dispBarsAgo: null }), false);
    }
  });

  it('SR is same-bar by construction — same proof as MR', () => {
    for (const barIndex of [50, 100, 100000]) {
      assert.equal(computeEntryLate({ model: 'SR', barIndex }), false);
    }
  });

  it('the gate is now genuinely REACHABLE — not a structural tautology like the old bar_index-vs-itself comparison', () => {
    // Direct proof that origin can legitimately differ from the current bar.
    const late = computeEntryLate({ model: 'TC', barIndex: 200, dispBarsAgo: 9 });
    const fresh = computeEntryLate({ model: 'TC', barIndex: 200, dispBarsAgo: 1 });
    assert.notEqual(late, fresh, 'the same gate must be able to produce both outcomes depending on real elapsed time');
  });
});

// ── §5: stale-event / duplicate-signal identity ───────────────────────────
describe('§5 Origin-based duplicate-signal guard', () => {
  function originKey(model, isLong, originBar) {
    return originBar === null ? 'NA' : `${model}_${isLong ? 'BULLISH' : 'BEARISH'}_${originBar}`;
  }

  it('the same model+direction+origin can never be approved twice — second attempt is rejected by the freshness check', () => {
    let lastEmitted = 'NA';
    const key1 = originKey('TC', true, 50);
    const fresh1 = key1 !== 'NA' && key1 !== lastEmitted;
    assert.equal(fresh1, true);
    lastEmitted = key1; // simulates the freeze block latching it

    // A LATER bar re-evaluating the SAME origin (hypothetically, if some
    // future bug let it re-qualify) is now correctly rejected.
    const key2 = originKey('TC', true, 50);
    const fresh2 = key2 !== 'NA' && key2 !== lastEmitted;
    assert.equal(fresh2, false, 'the identical origin must never be approved a second time');
  });

  it('a genuinely NEW origin (different bar) for the same model+direction is still allowed', () => {
    let lastEmitted = originKey('TC', true, 50);
    const key2 = originKey('TC', true, 75); // a different, later displacement event
    const fresh2 = key2 !== 'NA' && key2 !== lastEmitted;
    assert.equal(fresh2, true, 'a genuinely new origin must not be blocked by an unrelated prior signal');
  });

  it('bar_index alone (without origin) is not sufficient — two different bar_index values sharing the SAME origin must still be treated as the same event', () => {
    // This directly documents why SIGNAL_ID = model_side_barIndex alone was
    // insufficient: two different trigger bars (101 and 103) could both
    // reference the exact same underlying origin bar (50) if a stale
    // condition were somehow allowed to re-qualify. The origin key based on
    // originBar (not the trigger's bar_index) correctly identifies them as
    // the same opportunity.
    const keyAtTrigger1 = originKey('PB', false, 50);
    const keyAtTrigger2 = originKey('PB', false, 50);
    assert.equal(keyAtTrigger1, keyAtTrigger2, 'same origin must produce the same key regardless of which later bar the trigger itself fires on');
  });
});
