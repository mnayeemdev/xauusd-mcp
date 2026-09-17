/**
 * Pine P5 — signal recorder + outcome engine + statistics: faithful JS
 * reference-model proof.
 *
 * No Pine execution/bar-replay harness exists outside TradingView's own
 * runtime (unchanged limitation, documented since P1). This file is a
 * faithful transliteration of the exact P5 Pine algorithm added to
 * pine/XAUUSD_Adaptive_Master.pine — same variable roles, same chronology
 * guard (`bar_index > rec.signalBarIndex`), same same-bar-ambiguity rule
 * (`isPass = targetHit and not slHit`), same R-multiple formula, same
 * streak/aggregate bookkeeping — executed for real in Node against
 * constructed bar sequences. tests/pine_p5_source_audit.test.js separately
 * cross-checks that the Pine file's actual expressions match this model.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Reference model: mirrors the Pine SignalRecord + resolution loop ─────
function createSignal({ id, side, signalBarIndex, entry, initialSl, tp1, tp2, exitTarget = null, reportedRr, model, regime, quality, timeframe = '15', session = 'LONDON' }) {
  const successTarget = tp2 !== null && tp2 !== undefined ? tp2 : (exitTarget !== null && exitTarget !== undefined ? exitTarget : null);
  return {
    id, side, signalBarIndex, entry, initialSl, tp1, tp2: tp2 ?? null, exitTarget, successTarget,
    reportedRr, model, regime, quality, timeframe, session,
    status: 'OPEN', outcomeBarIndex: null, outcomePrice: null, rResult: null, sameBarAmbiguity: false,
  };
}

// Mirrors the exact Pine resolution loop body for ONE bar against ONE record.
function resolveBar(rec, barIndex, bar) {
  if (rec.status !== 'OPEN') return rec;
  if (!(barIndex > rec.signalBarIndex)) return rec; // chronology guard — never resolve on/before the signal bar
  if (rec.successTarget === null) return rec; // no terminal target available — never guessed

  const isLong = rec.side === 'BULLISH';
  const slHit = isLong ? bar.low <= rec.initialSl : bar.high >= rec.initialSl;
  const targetHit = isLong ? bar.high >= rec.successTarget : bar.low <= rec.successTarget;
  if (!slHit && !targetHit) return rec; // still OPEN

  const isPass = targetHit && !slHit; // same-bar ambiguity (both true) -> isPass=false -> FAIL
  const risk = isLong ? rec.entry - rec.initialSl : rec.initialSl - rec.entry;
  const reward = isLong ? rec.successTarget - rec.entry : rec.entry - rec.successTarget;
  const rMultiple = isPass ? (risk > 0 ? reward / risk : null) : -1;

  rec.status = isPass ? 'PASS' : 'FAIL';
  rec.sameBarAmbiguity = slHit && targetHit;
  rec.outcomeBarIndex = barIndex;
  rec.outcomePrice = isPass ? rec.successTarget : rec.initialSl;
  rec.rResult = rMultiple;
  return rec;
}

function newAggregates() {
  return {
    totalSignals: 0, totalPass: 0, totalFail: 0,
    buyTotal: 0, sellTotal: 0,
    cumulativeR: 0, bestR: null, worstR: null, sumWinR: 0, winCount: 0, sumLossR: 0, lossCount: 0,
    currentStreakType: 'NONE', currentStreakLen: 0, maxPassStreak: 0, maxFailStreak: 0,
    firstSignalTime: null, lastSignalTime: null,
    byModel: {}, byRegime: {}, bySession: {}, byTimeframe: {},
  };
}

function bumpCategory(bucket, key, field) {
  if (!bucket[key]) bucket[key] = { total: 0, pass: 0, fail: 0, cumR: 0 };
  bucket[key][field] = (bucket[key][field] ?? 0) + 1;
}

function recordSignal(agg, rec, signalTime) {
  agg.totalSignals += 1;
  if (agg.firstSignalTime === null) agg.firstSignalTime = signalTime;
  agg.lastSignalTime = signalTime;
  if (rec.side === 'BULLISH') agg.buyTotal += 1; else agg.sellTotal += 1;
  bumpCategory(agg.byModel, rec.model, 'total');
  bumpCategory(agg.byRegime, rec.regime, 'total');
  bumpCategory(agg.bySession, rec.session, 'total');
  const tfBucket = ['5', '15', '30'].includes(rec.timeframe) ? rec.timeframe : 'OTHER';
  bumpCategory(agg.byTimeframe, tfBucket, 'total');
}

function recordResolution(agg, rec) {
  const isPass = rec.status === 'PASS';
  const r = rec.rResult ?? 0;
  if (isPass) {
    agg.totalPass += 1;
    agg.sumWinR += r; agg.winCount += 1;
    if (agg.bestR === null || r > agg.bestR) agg.bestR = r;
  } else {
    agg.totalFail += 1;
    agg.sumLossR += r; agg.lossCount += 1;
    if (agg.worstR === null || r < agg.worstR) agg.worstR = r;
  }
  agg.cumulativeR += r;
  const type = isPass ? 'PASS' : 'FAIL';
  if (agg.currentStreakType === type) agg.currentStreakLen += 1;
  else { agg.currentStreakType = type; agg.currentStreakLen = 1; }
  if (isPass) agg.maxPassStreak = Math.max(agg.maxPassStreak, agg.currentStreakLen);
  else agg.maxFailStreak = Math.max(agg.maxFailStreak, agg.currentStreakLen);
  const tfBucket = ['5', '15', '30'].includes(rec.timeframe) ? rec.timeframe : 'OTHER';
  for (const [bucket, key] of [[agg.byModel, rec.model], [agg.byRegime, rec.regime], [agg.bySession, rec.session], [agg.byTimeframe, tfBucket]]) {
    bumpCategory(bucket, key, isPass ? 'pass' : 'fail');
    bucket[key].cumR += r;
  }
}

// Drives a full bar sequence through create+resolve, exactly mirroring the
// Pine per-bar order (resolve existing OPEN records against this bar,
// THEN create a new signal on this bar if one is scheduled).
function runSequence(bars, signalsAtBar = {}) {
  const agg = newAggregates();
  const records = [];
  for (const bar of bars) {
    for (const rec of records) resolveBar(rec, bar.barIndex, bar);
    for (const rec of records) {
      if (rec.status !== 'OPEN' && rec.outcomeBarIndex === bar.barIndex && !rec._counted) {
        recordResolution(agg, rec);
        rec._counted = true;
      }
    }
    if (signalsAtBar[bar.barIndex]) {
      const rec = createSignal({ ...signalsAtBar[bar.barIndex], signalBarIndex: bar.barIndex });
      records.push(rec);
      recordSignal(agg, rec, bar.time ?? bar.barIndex);
    }
  }
  return { agg, records };
}

// ═══════════════════════════════════════════════════════════════════════
// §29 Outcome reference-model tests
// ═══════════════════════════════════════════════════════════════════════
describe('P5 §29: BUY outcome rules', () => {
  it('BUY target first -> PASS', () => {
    const rec = createSignal({ id: 's1', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 105, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 100.5 }); // target(110) hit, SL(95) not hit
    assert.equal(rec.status, 'PASS');
    assert.equal(rec.rResult, 2); // reward=10, risk=5 -> R=2
  });
  it('BUY SL first -> FAIL', () => {
    const rec = createSignal({ id: 's2', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 105, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 101, low: 94 });
    assert.equal(rec.status, 'FAIL');
    assert.equal(rec.rResult, -1);
  });
  it('BUY neither -> OPEN', () => {
    const rec = createSignal({ id: 's3', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 105, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 102, low: 98 });
    assert.equal(rec.status, 'OPEN');
  });
  it('BUY same bar target+SL -> FAIL (conservative)', () => {
    const rec = createSignal({ id: 's4', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 105, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 112, low: 90 }); // both hit same bar
    assert.equal(rec.status, 'FAIL');
    assert.equal(rec.sameBarAmbiguity, true);
    assert.equal(rec.rResult, -1);
  });
});

describe('P5 §29: SELL outcome rules (independent, no shared BUY assumptions)', () => {
  it('SELL target first -> PASS', () => {
    const rec = createSignal({ id: 't1', side: 'BEARISH', signalBarIndex: 200, entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'TC', regime: 'BEAR_TREND', quality: 80 });
    resolveBar(rec, 201, { high: 100.5, low: 89 });
    assert.equal(rec.status, 'PASS');
    assert.equal(rec.rResult, 2);
  });
  it('SELL SL first -> FAIL', () => {
    const rec = createSignal({ id: 't2', side: 'BEARISH', signalBarIndex: 200, entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'TC', regime: 'BEAR_TREND', quality: 80 });
    resolveBar(rec, 201, { high: 106, low: 99 });
    assert.equal(rec.status, 'FAIL');
    assert.equal(rec.rResult, -1);
  });
  it('SELL neither -> OPEN', () => {
    const rec = createSignal({ id: 't3', side: 'BEARISH', signalBarIndex: 200, entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'TC', regime: 'BEAR_TREND', quality: 80 });
    resolveBar(rec, 201, { high: 102, low: 98 });
    assert.equal(rec.status, 'OPEN');
  });
  it('SELL same bar target+SL -> FAIL (conservative)', () => {
    const rec = createSignal({ id: 't4', side: 'BEARISH', signalBarIndex: 200, entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'TC', regime: 'BEAR_TREND', quality: 80 });
    resolveBar(rec, 201, { high: 106, low: 89 });
    assert.equal(rec.status, 'FAIL');
    assert.equal(rec.sameBarAmbiguity, true);
  });
});

describe('P5 §7/§29: terminal target selection (TP2/EXIT_TARGET either/or)', () => {
  it('TP2 present -> TP2 is the success target', () => {
    const rec = createSignal({ id: 'u1', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: 95, tp1: 103, tp2: 108, reportedRr: 1.6, model: 'PB', regime: 'BULL_TREND', quality: 80 });
    assert.equal(rec.successTarget, 108);
  });
  it('TP2 absent + EXIT_TARGET present -> EXIT_TARGET is the success target', () => {
    const rec = createSignal({ id: 'u2', side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: 95, tp1: 103, tp2: null, exitTarget: 112, reportedRr: 1.6, model: 'PB', regime: 'BULL_TREND', quality: 80 });
    assert.equal(rec.successTarget, 112);
  });
  it('TP1 is never treated as the terminal PASS target even though it is present and would be hit first', () => {
    const rec = createSignal({ id: 'u3', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 104, low: 99 }); // hits TP1 (103) but not TP2 (110) or SL
    assert.equal(rec.status, 'OPEN', 'TP1 alone must never resolve the signal to PASS');
  });
  it('no successTarget at all (neither TP2 nor EXIT_TARGET) -> never resolved, fails closed rather than guessing', () => {
    const rec = createSignal({ id: 'u4', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: null, exitTarget: null, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 200, low: 1 });
    assert.equal(rec.status, 'OPEN', 'a record with no usable terminal target must remain OPEN, never fabricate a PASS/FAIL');
  });
});

describe('P5 §29: geometry / risk validation (defense-in-depth, mirrors the already-frozen slGeometryOk invariant)', () => {
  it('invalid geometry (SL on the wrong side of entry for a BUY) produces a non-finite/undefined R rather than a fabricated number', () => {
    // This can never actually occur in the live Pine engine (slGeometryOk
    // gates finalTradeApproved before any signal can exist), but the R
    // formula itself must still fail closed defensively if ever given
    // inverted geometry.
    const rec = createSignal({ id: 'v1', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 105, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 106 }); // "target" hit, SL(105) also structurally beyond low in this inverted case is moot; risk = entry-initialSl = -5 (invalid)
    // risk <= 0 -> rMultiple must be null (not fabricated), even though status still resolves structurally
    if (rec.status === 'PASS') assert.equal(rec.rResult, null);
  });
  it('zero risk (entry == initialSl) produces null R, never Infinity or a fabricated ratio', () => {
    const rec = createSignal({ id: 'v2', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 100, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 101 }); // low stays above initialSl(100) so only the target is hit, not SL
    assert.equal(rec.status, 'PASS');
    assert.equal(rec.rResult, null, 'zero risk must never produce Infinity or a guessed R value');
  });
});

describe('P5 §29: immutability — future bars never rewrite original entry/SL/target', () => {
  it('original entry/initialSl/successTarget are frozen at creation and never mutated by resolution', () => {
    const rec = createSignal({ id: 'w1', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    const snapshot = { entry: rec.entry, initialSl: rec.initialSl, successTarget: rec.successTarget, model: rec.model, regime: rec.regime, quality: rec.quality };
    resolveBar(rec, 101, { high: 96, low: 94 }); // partial movement, still open
    resolveBar(rec, 102, { high: 111, low: 96 }); // eventually resolves PASS
    assert.deepEqual({ entry: rec.entry, initialSl: rec.initialSl, successTarget: rec.successTarget, model: rec.model, regime: rec.regime, quality: rec.quality }, snapshot, 'signal snapshot fields must never change across multiple resolution bars');
  });

  it('a terminal outcome never reverses: PASS never becomes FAIL and FAIL never becomes PASS', () => {
    const rec = createSignal({ id: 'w2', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 99 }); // PASS
    assert.equal(rec.status, 'PASS');
    const beforeSecondCall = { ...rec };
    resolveBar(rec, 102, { high: 50, low: 1 }); // a wild later bar that would have hit SL if still open
    assert.equal(rec.status, 'PASS', 'a resolved record must never be re-evaluated — resolveBar must be a no-op once status != OPEN');
    assert.deepEqual(rec, beforeSecondCall);
  });
});

describe('P5 §11/§30: signal-bar chronology — ambiguous pre-entry movement cannot create a favorable PASS', () => {
  it('the signal bar\'s OWN high/low (even if it would have hit the target) is never used to resolve the signal', () => {
    // ENTRY = close of bar 100 itself. If bar 100's own high already exceeded
    // the target BEFORE that close existed, using it would grant favorable
    // information from before the entry was filled. The chronology guard
    // (`bar_index > signalBarIndex`) must make bar 100 itself structurally
    // ineligible to resolve this signal, regardless of its own high/low.
    const rec = createSignal({ id: 'x1', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 100, { high: 120, low: 90 }); // same bar as signalBarIndex — must be ignored entirely
    assert.equal(rec.status, 'OPEN', 'the signal bar itself must never resolve its own signal, no matter how favorable its high/low');
  });
  it('resolution correctly begins on the very next bar (signalBarIndex + 1)', () => {
    const rec = createSignal({ id: 'x2', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 99 });
    assert.equal(rec.status, 'PASS', 'bar 101 (the first bar strictly after the signal bar) must be eligible to resolve it');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §31 Statistics tests — deterministic synthetic dataset
// ═══════════════════════════════════════════════════════════════════════
describe('P5 §31: aggregate statistics on a deterministic synthetic record set', () => {
  // 5 signals total: 3 BUY (2 pass, 1 fail), 2 SELL (1 pass, 1 fail).
  // Models: TC x2 (sig1 BUY BULL_TREND pass, sig3 SELL BEAR_TREND pass) ->
  // TC = 2 pass 0 fail; PB x2 (sig2 BUY BULL_TREND fail, sig4 SELL
  // BEAR_TREND fail) -> PB = 0 pass 2 fail; BO x1 (sig5, never resolved).
  // Regimes: BULL_TREND x3, BEAR_TREND x2. Sessions: LONDON x3, ASIA x2.
  const bars = [
    { barIndex: 0, time: 1000 },
    { barIndex: 1, time: 2000, high: 111, low: 99 },   // resolves sig1 (BUY TC BULL_TREND LONDON) PASS, R=2
    { barIndex: 2, time: 3000 },
    { barIndex: 3, time: 4000, high: 101, low: 94 },   // resolves sig2 (BUY PB BULL_TREND LONDON) FAIL
    { barIndex: 4, time: 5000 },
    { barIndex: 5, time: 6000, high: 100.5, low: 89 }, // resolves sig3 (SELL TC BEAR_TREND ASIA) PASS, R=2
    { barIndex: 6, time: 7000 },
    { barIndex: 7, time: 8000, high: 106, low: 99 },   // resolves sig4 (SELL PB BEAR_TREND ASIA) FAIL
    { barIndex: 8, time: 9000 },
    // sig5 (BUY BO BULL_TREND LONDON) — never resolved, stays OPEN
  ];
  const signalsAtBar = {
    0: { id: 'sig1', side: 'BULLISH', entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80, session: 'LONDON' },
    2: { id: 'sig2', side: 'BULLISH', entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'PB', regime: 'BULL_TREND', quality: 80, session: 'LONDON' },
    4: { id: 'sig3', side: 'BEARISH', entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'TC', regime: 'BEAR_TREND', quality: 80, session: 'ASIA' },
    6: { id: 'sig4', side: 'BEARISH', entry: 100, initialSl: 105, tp1: 95, tp2: 90, reportedRr: 2, model: 'PB', regime: 'BEAR_TREND', quality: 80, session: 'ASIA' },
    8: { id: 'sig5', side: 'BULLISH', entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'BO', regime: 'BULL_TREND', quality: 80, session: 'LONDON' },
  };
  const { agg } = runSequence(bars, signalsAtBar);

  it('total/pass/fail/open/closed counts are exact', () => {
    assert.equal(agg.totalSignals, 5);
    assert.equal(agg.totalPass, 2);
    assert.equal(agg.totalFail, 2);
    const open = agg.totalSignals - agg.totalPass - agg.totalFail;
    assert.equal(open, 1);
    const closed = agg.totalPass + agg.totalFail;
    assert.equal(closed, 4);
  });

  it('pass rate is computed among CLOSED signals only (OPEN excluded from the denominator)', () => {
    const closed = agg.totalPass + agg.totalFail;
    const passRate = agg.totalPass / closed;
    assert.equal(passRate, 0.5, '2 pass / 4 closed = 50%, NOT 2/5 = 40% (which would wrongly include the 1 still-open signal)');
  });

  it('BUY/SELL split is exact', () => {
    assert.equal(agg.buyTotal, 3);
    assert.equal(agg.sellTotal, 2);
  });

  it('model split is exact (TC: 2P/0F, PB: 0P/2F, BO: 0P/0F/1 open)', () => {
    assert.equal(agg.byModel.TC.pass, 2);
    assert.equal(agg.byModel.TC.fail, 0);
    assert.equal(agg.byModel.PB.pass, 0);
    assert.equal(agg.byModel.PB.fail, 2);
    assert.equal(agg.byModel.BO.total, 1);
    assert.equal(agg.byModel.BO.pass, 0);
    assert.equal(agg.byModel.BO.fail, 0);
  });

  it('regime split is exact', () => {
    assert.equal(agg.byRegime.BULL_TREND.total, 3);
    assert.equal(agg.byRegime.BEAR_TREND.total, 2);
    assert.equal(agg.byRegime.BULL_TREND.pass, 1); // sig1
    assert.equal(agg.byRegime.BEAR_TREND.pass, 1); // sig3
  });

  it('session split is exact', () => {
    assert.equal(agg.bySession.LONDON.total, 3);
    assert.equal(agg.bySession.ASIA.total, 2);
  });

  it('cumulative R and average R are exact', () => {
    assert.equal(agg.cumulativeR, 2 - 1 + 2 - 1); // +2, -1, +2, -1 = 2
    const closed = agg.totalPass + agg.totalFail;
    assert.equal(agg.cumulativeR / closed, 0.5);
  });

  it('average win/loss R, best/worst R are exact', () => {
    assert.equal(agg.sumWinR / agg.winCount, 2);
    assert.equal(agg.sumLossR / agg.lossCount, -1);
    assert.equal(agg.bestR, 2);
    assert.equal(agg.worstR, -1);
  });

  it('streaks are exact (chronological order: PASS, FAIL, PASS, FAIL -> alternating, no streak > 1)', () => {
    assert.equal(agg.maxPassStreak, 1);
    assert.equal(agg.maxFailStreak, 1);
    assert.equal(agg.currentStreakType, 'FAIL');
    assert.equal(agg.currentStreakLen, 1);
  });

  it('date range (first/last signal time) is exact', () => {
    assert.equal(agg.firstSignalTime, 1000);
    assert.equal(agg.lastSignalTime, 9000);
  });
});

describe('P5 §31: streak tests with genuine multi-length runs', () => {
  it('three consecutive PASS then two consecutive FAIL produces maxPassStreak=3, maxFailStreak=2', () => {
    const agg = newAggregates();
    const outcomes = ['PASS', 'PASS', 'PASS', 'FAIL', 'FAIL'];
    for (const o of outcomes) {
      const rec = { status: o, rResult: o === 'PASS' ? 1 : -1, model: 'TC', regime: 'BULL_TREND', session: 'LONDON', timeframe: '15' };
      recordResolution(agg, rec);
    }
    assert.equal(agg.maxPassStreak, 3);
    assert.equal(agg.maxFailStreak, 2);
    assert.equal(agg.currentStreakType, 'FAIL');
    assert.equal(agg.currentStreakLen, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §13/§32 Duplicate prevention + non-repainting audit
// ═══════════════════════════════════════════════════════════════════════
describe('P5 §13: duplicate signal prevention', () => {
  it('the same underlying signal event (same origin identity) recalculated/reloaded produces exactly one record — mirrors the existing candOriginFresh/lastEmittedOriginKey P3 dedup, not a new mechanism', () => {
    // P5 hooks the identical `if newSignalId != signalId` block P3 already
    // uses, which is itself downstream of candOriginFresh. A second
    // evaluation of the identical origin can never re-enter that block,
    // so P5's array.push() call site is structurally reachable at most
    // once per distinct origin. This is proven by source audit
    // (tests/pine_p5_source_audit.test.js), not re-derived here — this
    // test documents the invariant the reference model assumes.
    const records = [];
    const seenIds = new Set();
    function tryCreate(id) {
      if (seenIds.has(id)) return; // mirrors: candOriginFresh is false, finalTradeApproved cannot be true again
      seenIds.add(id);
      records.push(createSignal({ id, side: 'BULLISH', signalBarIndex: 0, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 }));
    }
    tryCreate('TC_BULLISH_O10_T20');
    tryCreate('TC_BULLISH_O10_T20'); // identical origin re-presented (e.g. a chart reload recomputing history)
    assert.equal(records.length, 1, 'the same origin must never produce a second record');
  });
});

describe('P5 §32: non-repainting audit', () => {
  it('OPEN can only ever transition to PASS or FAIL, never directly to any other state', () => {
    for (const finalState of ['PASS', 'FAIL']) {
      const rec = createSignal({ id: `y-${finalState}`, side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
      assert.equal(rec.status, 'OPEN');
      const bar = finalState === 'PASS' ? { high: 111, low: 99 } : { high: 101, low: 94 };
      resolveBar(rec, 101, bar);
      assert.equal(rec.status, finalState);
      assert.ok(['OPEN', 'PASS', 'FAIL'].includes(rec.status), 'status must always be one of exactly three values');
    }
  });

  it('a resolved record is never mutated by subsequent bars (metadata frozen, no future-bar rewriting)', () => {
    const rec = createSignal({ id: 'z1', side: 'BULLISH', signalBarIndex: 100, entry: 100, initialSl: 95, tp1: 103, tp2: 110, reportedRr: 2, model: 'TC', regime: 'BULL_TREND', quality: 80 });
    resolveBar(rec, 101, { high: 111, low: 99 });
    const frozen = JSON.stringify(rec);
    for (let b = 102; b < 110; b++) resolveBar(rec, b, { high: 1000, low: -1000 });
    assert.equal(JSON.stringify(rec), frozen, 'no field may change after the terminal outcome is set');
  });
});
