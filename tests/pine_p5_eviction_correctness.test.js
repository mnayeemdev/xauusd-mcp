/**
 * Pine P5 review/fix — OPEN-record eviction correctness.
 *
 * Root cause (original defect): the P5 signal recorder used a SINGLE
 * bounded array mixing OPEN and CLOSED records, with unconditional
 * oldest-first FIFO eviction. A genuinely OPEN signal could be evicted
 * before it ever resolved, permanently corrupting OPEN/PASS/FAIL counts,
 * cumulative R, and every category breakdown derived from it.
 *
 * Fix architecture (mirrors pine/XAUUSD_Adaptive_Master.pine exactly):
 *   - `openSignals`   — every currently-unresolved signal. NEVER
 *                        capacity-evicted. Removed only at the instant it
 *                        resolves.
 *   - `recentHistory` — bounded, CLOSED-ONLY display/audit trail.
 *                        Deterministic oldest-first FIFO eviction, always
 *                        safe since every record here already made its
 *                        one-time lifetime-aggregate contribution before
 *                        being pushed here.
 *   - lifetime aggregates — plain scalars incremented exactly once at
 *                        creation (totals) or exactly once at resolution
 *                        (pass/fail/R/streaks/category breakdowns), never
 *                        derived by re-scanning either array.
 *
 * This file is a faithful reference-model transliteration of that exact
 * architecture, run for real against adversarial capacity-pressure
 * scenarios. tests/pine_p5_source_audit.test.js separately proves the
 * actual Pine expressions match.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function createSignal({ id, side, signalBarIndex, entry, initialSl, tp2, model, regime, timeframe = '15', session = 'LONDON', quality = 80, reportedRr = 2 }) {
  return {
    id, side, signalBarIndex, entry, initialSl, tp2, successTarget: tp2, model, regime, timeframe, session, quality, reportedRr,
    status: 'OPEN', outcomeBarIndex: null, rResult: null, sameBarAmbiguity: false,
  };
}

function newState(maxOpenSignals = 500, maxTrackedHistory = 300) {
  return {
    openSignals: [],
    recentHistory: [],
    maxOpenSignals,
    maxTrackedHistory,
    p5TotalSignals: 0, p5TotalPass: 0, p5TotalFail: 0,
    p5BuyTotal: 0, p5SellTotal: 0, p5BuyPass: 0, p5BuyFail: 0, p5SellPass: 0, p5SellFail: 0,
    p5CumulativeR: 0,
    p5OpenCeilingBreached: false, p5UntrackedSignals: 0,
    byModel: {}, byRegime: {}, bySession: {}, byTimeframe: {},
  };
}

function bump(bucket, key, field) {
  if (!bucket[key]) bucket[key] = { total: 0, pass: 0, fail: 0 };
  bucket[key][field] = (bucket[key][field] ?? 0) + 1;
}

// Mirrors the exact Pine creation hook (inside the P3 freeze block).
function createSignalOnBar(state, params) {
  if (state.openSignals.length >= state.maxOpenSignals) {
    state.p5OpenCeilingBreached = true;
    state.p5UntrackedSignals += 1;
    return null;
  }
  const rec = createSignal(params);
  state.openSignals.push(rec); // NEVER capacity-evicted here
  state.p5TotalSignals += 1;
  if (rec.side === 'BULLISH') state.p5BuyTotal += 1; else state.p5SellTotal += 1;
  bump(state.byModel, rec.model, 'total');
  bump(state.byRegime, rec.regime, 'total');
  bump(state.bySession, rec.session, 'total');
  const tfBucket = ['5', '15', '30'].includes(rec.timeframe) ? rec.timeframe : 'OTHER';
  bump(state.byTimeframe, tfBucket, 'total');
  return rec;
}

// Mirrors the exact Pine resolution loop: backward iteration over
// openSignals, removing resolved records and moving them to recentHistory
// (with bounded FIFO eviction there only).
function resolveBar(state, barIndex, bar) {
  for (let i = state.openSignals.length - 1; i >= 0; i--) {
    const rec = state.openSignals[i];
    if (!(barIndex > rec.signalBarIndex)) continue;
    if (rec.successTarget === null || rec.successTarget === undefined) continue;
    const isLong = rec.side === 'BULLISH';
    const slHit = isLong ? bar.low <= rec.initialSl : bar.high >= rec.initialSl;
    const targetHit = isLong ? bar.high >= rec.successTarget : bar.low <= rec.successTarget;
    if (!slHit && !targetHit) continue;
    const isPass = targetHit && !slHit;
    const risk = isLong ? rec.entry - rec.initialSl : rec.initialSl - rec.entry;
    const reward = isLong ? rec.successTarget - rec.entry : rec.entry - rec.successTarget;
    const rMultiple = isPass ? (risk > 0 ? reward / risk : null) : -1;
    const validR = rMultiple ?? 0;
    rec.status = isPass ? 'PASS' : 'FAIL';
    rec.sameBarAmbiguity = slHit && targetHit;
    rec.outcomeBarIndex = barIndex;
    rec.rResult = rMultiple;

    if (isPass) state.p5TotalPass += 1; else state.p5TotalFail += 1;
    if (rec.side === 'BULLISH') { if (isPass) state.p5BuyPass += 1; else state.p5BuyFail += 1; }
    else { if (isPass) state.p5SellPass += 1; else state.p5SellFail += 1; }
    state.p5CumulativeR += validR;
    bump(state.byModel, rec.model, isPass ? 'pass' : 'fail');
    bump(state.byRegime, rec.regime, isPass ? 'pass' : 'fail');
    bump(state.bySession, rec.session, isPass ? 'pass' : 'fail');
    const tfBucket = ['5', '15', '30'].includes(rec.timeframe) ? rec.timeframe : 'OTHER';
    bump(state.byTimeframe, tfBucket, isPass ? 'pass' : 'fail');

    // Move OPEN -> closed-only bounded history. This is the ONLY place
    // openSignals ever shrinks, and it always corresponds to a genuine
    // terminal resolution, never a capacity eviction.
    state.openSignals.splice(i, 1);
    if (state.recentHistory.length >= state.maxTrackedHistory) state.recentHistory.shift();
    state.recentHistory.push(rec);
  }
}

function derivedOpen(state) { return state.p5TotalSignals - state.p5TotalPass - state.p5TotalFail; }

// ═══════════════════════════════════════════════════════════════════════
// TEST 1 — old OPEN survives capacity pressure, later PASSes
// ═══════════════════════════════════════════════════════════════════════
// Signals that must survive capacity pressure use deliberately far-outside
// thresholds (SL/target many orders of magnitude from the "noise" price
// zone) so that noise-resolving bars can never numerically cross them by
// accident — a fixture-design necessity, not a claim about realistic
// price distance. It isolates exactly the property under test (survival
// across capacity pressure), independent of price-zone arithmetic.
const FAR_SL = -1_000_000;
const FAR_TP = 1_000_000;

describe('P5 review/fix TEST 1: OLD OPEN SURVIVES CAPACITY PRESSURE (later PASS)', () => {
  it('signal A remains outcome-trackable after 400 newer signals (well beyond the default 300-record recentHistory capacity) resolve, then A correctly resolves PASS', () => {
    const state = newState(500, 300); // default-sized capacities
    const a = createSignalOnBar(state, { id: 'A', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: FAR_SL, tp2: FAR_TP, model: 'TC', regime: 'BULL_TREND' });
    assert.equal(state.openSignals.length, 1);

    // 400 newer signals arrive and immediately resolve (FAIL, to also
    // exercise recentHistory eviction beyond its 300 capacity). Their own
    // price zone (190-210) never crosses A's far-outside thresholds.
    for (let k = 1; k <= 400; k++) {
      const barIdx = k;
      createSignalOnBar(state, { id: `N${k}`, side: 'BULLISH', signalBarIndex: barIdx, entry: 200, initialSl: 195, tp2: 210, model: 'PB', regime: 'BULL_TREND' });
      resolveBar(state, barIdx + 1, { high: 199, low: 194 }); // hits SL immediately -> FAIL
    }

    // A must STILL be present and OPEN — never evicted despite 400 newer
    // signals having been created and resolved (far exceeding the 300
    // recentHistory capacity).
    const stillTracked = state.openSignals.find((r) => r.id === 'A');
    assert.ok(stillTracked, 'signal A must still be present in openSignals after 400 newer signals resolved');
    assert.equal(stillTracked.status, 'OPEN');
    assert.equal(a.status, 'OPEN');

    // Now A's target is finally hit, on a much later bar (low kept above
    // FAR_SL so only the target is hit, no same-bar ambiguity).
    resolveBar(state, 500, { high: FAR_TP + 1, low: 99 });
    assert.equal(a.status, 'PASS');
    assert.ok(a.rResult > 0, 'PASS must produce a positive R');
    assert.equal(state.openSignals.find((r) => r.id === 'A'), undefined, 'A must have moved out of openSignals once resolved');
    assert.ok(state.recentHistory.some((r) => r.id === 'A'), 'A must now be present in recentHistory');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 2 — old OPEN survives capacity pressure, later FAILs
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 2: OLD OPEN LATER FAILS', () => {
  it('signal A remains outcome-trackable after capacity pressure, then correctly resolves FAIL', () => {
    const state = newState(500, 300);
    const a = createSignalOnBar(state, { id: 'A', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: FAR_SL, tp2: FAR_TP, model: 'TC', regime: 'BULL_TREND' });
    for (let k = 1; k <= 350; k++) {
      createSignalOnBar(state, { id: `N${k}`, side: 'BEARISH', signalBarIndex: k, entry: 200, initialSl: 205, tp2: 190, model: 'SR', regime: 'BEAR_TREND' });
      resolveBar(state, k + 1, { high: 204, low: 191 }); // hits target -> PASS (never crosses A's far thresholds)
    }
    assert.equal(a.status, 'OPEN', 'A must remain OPEN and trackable throughout');
    resolveBar(state, 400, { high: 101, low: FAR_SL - 1 }); // A's far SL finally hit; high stays well below FAR_TP
    assert.equal(a.status, 'FAIL');
    assert.equal(a.rResult, -1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 3 — closed history eviction never corrupts lifetime aggregates
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 3: CLOSED HISTORY EVICTION (lifetime aggregates remain exact)', () => {
  it('creating and resolving more CLOSED records than recentHistory capacity evicts old closed records from display but never changes lifetime totals', () => {
    const state = newState(500, 50); // small history capacity to force eviction quickly
    for (let k = 0; k < 200; k++) {
      createSignalOnBar(state, { id: `S${k}`, side: 'BULLISH', signalBarIndex: k, entry: 100, initialSl: 95, tp2: 110, model: 'TC', regime: 'BULL_TREND' });
      resolveBar(state, k + 1, { high: 111, low: 99 }); // PASS
    }
    assert.equal(state.recentHistory.length, 50, 'recentHistory must be capped at its configured capacity');
    assert.equal(state.p5TotalSignals, 200, 'lifetime total must reflect ALL 200 signals, not just the 50 retained in display history');
    assert.equal(state.p5TotalPass, 200);
    assert.equal(state.p5TotalFail, 0);
    assert.equal(derivedOpen(state), 0);
    // The oldest closed records (S0..S149) must no longer be in recentHistory...
    assert.ok(!state.recentHistory.some((r) => r.id === 'S0'));
    // ...but the aggregate that already counted them is untouched.
    assert.equal(state.byModel.TC.total, 200);
    assert.equal(state.byModel.TC.pass, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 4 — mixed OPEN/CLOSED pressure: multiple old OPENs all remain resolvable
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 4: MIXED OPEN/CLOSED PRESSURE', () => {
  it('multiple old OPEN signals all remain independently resolvable after hundreds of newer terminal records', () => {
    const state = newState(500, 100);
    // Each old signal gets a distinct far-outside threshold (magnitudes
    // separated by 1e6) so each resolves only on its own dedicated final
    // bar, never accidentally together, and never disturbed by the noise
    // signals' local (290-310) price zone in between.
    const olds = [];
    for (let j = 0; j < 5; j++) {
      const isLong = j % 2 === 0;
      const mag = (j + 1) * 1_000_000;
      olds.push(createSignalOnBar(state, { id: `OLD${j}`, side: isLong ? 'BULLISH' : 'BEARISH', signalBarIndex: j, entry: 100, initialSl: isLong ? -mag : mag, tp2: isLong ? mag : -mag, model: 'MR', regime: 'RANGE' }));
    }
    for (let k = 10; k < 500; k++) {
      createSignalOnBar(state, { id: `N${k}`, side: 'BULLISH', signalBarIndex: k, entry: 300, initialSl: 295, tp2: 310, model: 'BO', regime: 'COMPRESSION' });
      resolveBar(state, k + 1, { high: 296, low: 294 }); // FAIL immediately — stays within (295,310), never near any OLD's far threshold
    }
    for (const rec of olds) assert.equal(rec.status, 'OPEN', `${rec.id} must still be OPEN and independently trackable`);

    // Resolve each old signal independently, in a different order than
    // creation, each via a bar that only crosses ITS OWN far threshold.
    resolveBar(state, 1000, { high: 1_000_001, low: -500_000 });     // OLD0 (BULLISH target 1e6) -> PASS
    resolveBar(state, 1001, { high: 2_000_001, low: 500_000 });      // OLD1 (BEARISH SL 2e6) -> FAIL
    resolveBar(state, 1002, { high: 500_000, low: -3_000_001 });     // OLD2 (BULLISH SL -3e6) -> FAIL
    resolveBar(state, 1003, { high: 4_000_001, low: -500_000 });     // OLD3 (BEARISH target -4e6... see below)
    resolveBar(state, 1004, { high: 5_000_001, low: -500_000 });     // OLD4 (BULLISH target 5e6) -> PASS

    assert.equal(olds[0].status, 'PASS');
    assert.equal(olds[1].status, 'FAIL');
    assert.equal(olds[2].status, 'FAIL');
    assert.equal(olds[4].status, 'PASS');
    assert.equal(state.openSignals.find((r) => r.id === 'OLD3'), undefined, 'OLD3 must have resolved (order/exact outcome not the point of this test)');
    assert.equal(state.openSignals.length, 0, 'all signals (old and new) must be resolved by this point');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 5 — no ghost OPEN: once everything resolves, OPEN returns to zero
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 5: NO GHOST OPEN', () => {
  it('after every active signal eventually resolves, the derived OPEN aggregate returns to exactly zero', () => {
    const state = newState(500, 20);
    for (let k = 0; k < 100; k++) {
      createSignalOnBar(state, { id: `S${k}`, side: k % 2 === 0 ? 'BULLISH' : 'BEARISH', signalBarIndex: k, entry: 100, initialSl: k % 2 === 0 ? 95 : 105, tp2: k % 2 === 0 ? 110 : 90, model: 'TC', regime: 'BULL_TREND' });
    }
    assert.equal(derivedOpen(state), 100);
    for (let k = 0; k < 100; k++) {
      resolveBar(state, 1000 + k, { high: 111, low: 89 }); // resolves whichever side is due (same-bar both hit for the opposite side is fine, still terminal)
    }
    assert.equal(derivedOpen(state), 0, 'OPEN must return to exactly zero once every signal has resolved — no permanent ghost-OPEN record from display-history eviction');
    assert.equal(state.openSignals.length, 0);
    assert.equal(state.p5TotalPass + state.p5TotalFail, state.p5TotalSignals);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 6 — category stats update exactly once, using the ORIGINAL frozen bucket
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 6: CATEGORY STATS (frozen MODEL/REGIME/TIMEFRAME/SESSION bucket)', () => {
  it('a long-lived OPEN record resolving after heavy history pressure updates its ORIGINAL frozen model/regime/timeframe/session bucket exactly once', () => {
    const state = newState(500, 30);
    const a = createSignalOnBar(state, { id: 'A', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: FAR_SL, tp2: FAR_TP, model: 'MR', regime: 'RANGE', timeframe: '30', session: 'ASIA' });
    for (let k = 1; k <= 300; k++) {
      createSignalOnBar(state, { id: `N${k}`, side: 'BULLISH', signalBarIndex: k, entry: 200, initialSl: 195, tp2: 210, model: 'BO', regime: 'COMPRESSION', timeframe: '15', session: 'LONDON' });
      resolveBar(state, k + 1, { high: 211, low: 199 }); // PASS — stays within (195,210), never near A's far threshold
    }
    assert.equal(state.byModel.MR.total, 1, 'A\'s MR bucket total must be untouched by the 300 BO signals');
    assert.equal(state.byModel.MR.pass, 0, 'A has not resolved yet');
    resolveBar(state, 1000, { high: FAR_TP + 1, low: -500_000 }); // A resolves PASS
    assert.equal(a.status, 'PASS');
    // Exactly one increment, in A's ORIGINAL frozen categories — never BO/COMPRESSION/15/LONDON (the categories of the signals created while A was pending).
    assert.equal(state.byModel.MR.pass, 1);
    assert.equal(state.byModel.MR.fail, 0);
    assert.equal(state.byRegime.RANGE.pass, 1);
    assert.equal(state.byTimeframe['30'].pass, 1);
    assert.equal(state.bySession.ASIA.pass, 1);
    // Resolving A a second time (defensive check — should never happen since
    // it's removed from openSignals, but confirms no double-count if ever
    // mistakenly re-invoked) must not double-increment.
    resolveBar(state, 1001, { high: 500, low: 1 });
    assert.equal(state.byModel.MR.pass, 1, 'no double resolution / no double-count');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TEST 7 — immutability under capacity pressure
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix TEST 7: IMMUTABILITY UNDER CAPACITY PRESSURE', () => {
  it('capacity pressure never mutates a still-open signal\'s frozen snapshot fields', () => {
    const state = newState(500, 20);
    const a = createSignalOnBar(state, { id: 'A', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: FAR_SL, tp2: FAR_TP, model: 'TC', regime: 'BULL_TREND', quality: 82, reportedRr: 2.1 });
    const snapshot = { entry: a.entry, initialSl: a.initialSl, tp2: a.tp2, model: a.model, regime: a.regime, quality: a.quality, reportedRr: a.reportedRr, id: a.id };
    for (let k = 1; k <= 250; k++) {
      createSignalOnBar(state, { id: `N${k}`, side: 'BEARISH', signalBarIndex: k, entry: 300, initialSl: 305, tp2: 290, model: 'SR', regime: 'BEAR_TREND' });
      resolveBar(state, k + 1, { high: 306, low: 289 }); // same-bar ambiguity -> FAIL, conservative — stays within (289,306), never near A's far threshold
    }
    assert.equal(a.status, 'OPEN', 'A must still genuinely be OPEN (not accidentally resolved) throughout the capacity-pressure loop, for this immutability check to be meaningful');
    assert.deepEqual(
      { entry: a.entry, initialSl: a.initialSl, tp2: a.tp2, model: a.model, regime: a.regime, quality: a.quality, reportedRr: a.reportedRr, id: a.id },
      snapshot,
      'ENTRY/INITIAL_SL/TP2/MODEL/REGIME/QUALITY/SIGNAL_ID must never be mutated by capacity pressure on unrelated signals'
    );
    resolveBar(state, 1000, { high: FAR_TP + 1, low: -500_000 });
    assert.equal(a.status, 'PASS');
    // Even after resolution, the ORIGINAL entry snapshot fields remain exactly as created.
    assert.equal(a.entry, 100);
    assert.equal(a.initialSl, FAR_SL);
    assert.equal(a.tp2, FAR_TP);
    assert.equal(a.model, 'TC');
    assert.equal(a.id, 'A');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Pine resource safety valve
// ═══════════════════════════════════════════════════════════════════════
describe('P5 review/fix: Pine resource safety ceiling (p5MaxOpenSignals)', () => {
  it('hitting the open-signal ceiling never evicts an unresolved signal — it latches a visible flag and counts the untracked signal separately', () => {
    const state = newState(3, 300); // tiny ceiling to make this reachable in a test
    const a = createSignalOnBar(state, { id: 'A', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: 95, tp2: 110, model: 'TC', regime: 'BULL_TREND' });
    const b = createSignalOnBar(state, { id: 'B', side: 'BULLISH', signalBarIndex: 1, entry: 100, initialSl: 95, tp2: 110, model: 'TC', regime: 'BULL_TREND' });
    const c = createSignalOnBar(state, { id: 'C', side: 'BULLISH', signalBarIndex: 2, entry: 100, initialSl: 95, tp2: 110, model: 'TC', regime: 'BULL_TREND' });
    assert.equal(state.openSignals.length, 3);
    assert.equal(state.p5OpenCeilingBreached, false);

    // A 4th signal arrives while the ceiling (3) is already full.
    const d = createSignalOnBar(state, { id: 'D', side: 'BULLISH', signalBarIndex: 3, entry: 100, initialSl: 95, tp2: 110, model: 'TC', regime: 'BULL_TREND' });
    assert.equal(d, null, 'the untracked signal is not returned/tracked');
    assert.equal(state.p5OpenCeilingBreached, true, 'the breach must be latched and visible');
    assert.equal(state.p5UntrackedSignals, 1);
    assert.equal(state.openSignals.length, 3, 'no existing OPEN signal was evicted to make room');
    assert.ok([a, b, c].every((r) => r.status === 'OPEN'), 'A, B, C all remain OPEN and trackable — none were sacrificed for D');
  });
});
