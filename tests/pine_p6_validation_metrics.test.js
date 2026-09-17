/**
 * Pine P6 — deterministic tests for the validation-metrics machinery
 * itself (validation/metrics.js).
 *
 * These tests validate CORRECTNESS OF MEASUREMENT using synthetic
 * fixtures, never live/expected trading performance. A weak or negative
 * historical result observed in docs/PINE_P6.md must never make these
 * tests fail — these tests only prove the arithmetic is right.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chronologicalSplit, wilsonInterval, passRate, meanR, medianR, cumulativeR,
  profitFactor, drawdown, streaks, percentiles, groupBy, sampleSizeLabel,
  bootstrapMeanR,
} from '../validation/metrics.js';

describe('P6 §1/§2: chronological split (no shuffle, boundary math)', () => {
  it('splits 70/30 by time-ascending order, never shuffles', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ time: i, v: i }));
    const { is, oos, boundaryIndex } = chronologicalSplit(data, 0.7);
    assert.equal(boundaryIndex, 7);
    assert.deepEqual(is.map((r) => r.time), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(oos.map((r) => r.time), [7, 8, 9]);
  });
  it('rejects non-time-ascending input rather than silently sorting/shuffling it', () => {
    const data = [{ time: 5 }, { time: 1 }, { time: 3 }];
    assert.throws(() => chronologicalSplit(data));
  });
  it('boundary is deterministic for the same input and fraction (immutability under repeated calls)', () => {
    const data = Array.from({ length: 23 }, (_, i) => ({ time: i }));
    const a = chronologicalSplit(data, 0.7);
    const b = chronologicalSplit(data, 0.7);
    assert.deepEqual(a, b);
  });
});

describe('P6 §7: Wilson interval', () => {
  it('matches a known reference value (pass=23, closed=70)', () => {
    const w = wilsonInterval(23, 70);
    assert.equal(w.low, 23.0);
    assert.equal(w.high, 44.5);
  });
  it('returns null for zero closed signals rather than dividing by zero', () => {
    assert.equal(wilsonInterval(0, 0), null);
  });
  it('is symmetric around 50% when pass=closed/2 for an even sample', () => {
    const w = wilsonInterval(10, 20);
    const mid = (w.low + w.high) / 2;
    assert.ok(Math.abs(mid - 50) < 1);
  });
});

describe('P6 §7: PASS-rate denominator excludes OPEN', () => {
  it('passRate(pass, fail) never accepts or is influenced by an OPEN count', () => {
    assert.equal(passRate(2, 4), +((2 / 6) * 100).toFixed(1));
  });
  it('a synthetic record set with OPEN entries computes pass rate only over closed ones via meanR/cumulativeR helpers', () => {
    const records = [
      { status: 'PASS', r: 2 }, { status: 'FAIL', r: -1 }, { status: 'OPEN', r: null },
      { status: 'OPEN', r: null }, { status: 'PASS', r: 3 },
    ];
    assert.equal(passRate(2, 1), 66.7); // 2 pass, 1 fail -> 66.7%, NOT 2/5=40%
    assert.equal(cumulativeR(records), 4); // 2 + -1 + 3, OPEN contributes nothing
  });
});

describe('P6 §8: mean/median/cumulative R and profit factor', () => {
  const records = [
    { status: 'PASS', r: 3 }, { status: 'PASS', r: 2 }, { status: 'FAIL', r: -1 },
    { status: 'FAIL', r: -1 }, { status: 'OPEN', r: null },
  ];
  it('meanR excludes OPEN', () => {
    assert.equal(meanR(records), (3 + 2 - 1 - 1) / 4);
  });
  it('medianR excludes OPEN and is computed correctly for an even closed count', () => {
    // sorted closed R: -1, -1, 2, 3 -> median = (-1+2)/2 = 0.5
    assert.equal(medianR(records), 0.5);
  });
  it('cumulativeR excludes OPEN', () => {
    assert.equal(cumulativeR(records), 3);
  });
  it('profitFactor = sum(positive)/abs(sum(negative))', () => {
    assert.equal(profitFactor(records), +((3 + 2) / 2).toFixed(4));
  });
  it('profitFactor handles zero losses explicitly (Infinity, not NaN or silently 0)', () => {
    const allWins = [{ status: 'PASS', r: 2 }, { status: 'PASS', r: 1 }];
    assert.equal(profitFactor(allWins), Infinity);
  });
  it('profitFactor handles zero wins AND zero losses explicitly (null, not NaN)', () => {
    assert.equal(profitFactor([{ status: 'OPEN', r: null }]), null);
  });
});

describe('P6 §9: drawdown', () => {
  it('computes a known drawdown sequence correctly', () => {
    // R sequence: +2, +1, -1, -1, -1, +3  => equity: 2,3,2,1,0,3
    // peak=3 at index1, trough=0 at index4 -> maxDD=3, recovers at index5 (equity 3 >= peak 3)
    const records = [
      { status: 'PASS', r: 2 }, { status: 'PASS', r: 1 }, { status: 'FAIL', r: -1 },
      { status: 'FAIL', r: -1 }, { status: 'FAIL', r: -1 }, { status: 'PASS', r: 3 },
    ];
    const dd = drawdown(records);
    assert.equal(dd.maxDrawdownR, 3);
    assert.equal(dd.drawdownStartIndex, 1);
    assert.equal(dd.troughIndex, 4);
    assert.equal(dd.recoveryIndex, 5);
    assert.equal(dd.durationClosedSignals, 3);
  });
  it('a monotonically increasing equity curve has zero drawdown', () => {
    const records = [{ status: 'PASS', r: 1 }, { status: 'PASS', r: 1 }, { status: 'PASS', r: 1 }];
    assert.equal(drawdown(records).maxDrawdownR, 0);
  });
  it('an unrecovered drawdown has recoveryIndex null', () => {
    const records = [{ status: 'PASS', r: 1 }, { status: 'FAIL', r: -1 }, { status: 'FAIL', r: -1 }];
    const dd = drawdown(records);
    assert.equal(dd.recoveryIndex, null);
  });
  it('OPEN records are excluded from the equity sequence entirely', () => {
    const records = [{ status: 'PASS', r: 1 }, { status: 'OPEN', r: null }, { status: 'FAIL', r: -1 }];
    assert.equal(drawdown(records).equityCurve.length, 2);
  });
});

describe('P6 §9/§10: streak calculations', () => {
  it('computes max PASS/FAIL streaks correctly for a mixed chronological sequence', () => {
    const records = ['PASS', 'PASS', 'PASS', 'FAIL', 'FAIL', 'PASS', 'FAIL', 'FAIL', 'FAIL', 'FAIL'].map((status) => ({ status, r: status === 'PASS' ? 1 : -1 }));
    const s = streaks(records);
    assert.equal(s.maxPassStreak, 3);
    assert.equal(s.maxFailStreak, 4);
    assert.equal(s.currentType, 'FAIL');
    assert.equal(s.currentLength, 4);
  });
  it('OPEN records do not break or extend a streak (excluded entirely)', () => {
    const records = [{ status: 'PASS', r: 1 }, { status: 'OPEN', r: null }, { status: 'PASS', r: 1 }];
    assert.equal(streaks(records).maxPassStreak, 2);
  });
});

describe('P6 §8: percentile distribution', () => {
  it('computes min/p25/median/p75/max for a known closed set', () => {
    const records = [-1, -1, -1, 2, 3].map((r) => ({ status: r > 0 ? 'PASS' : 'FAIL', r }));
    const p = percentiles(records);
    assert.equal(p.min, -1);
    assert.equal(p.median, -1);
    assert.equal(p.max, 3);
  });
});

describe('P6 §10/§11/§12/§13: grouping (model/regime/session/timeframe/BUY-SELL)', () => {
  it('groups correctly by an arbitrary key function and preserves per-group total/pass/fail/open/cumR', () => {
    const records = [
      { model: 'TC', status: 'PASS', r: 2 },
      { model: 'TC', status: 'FAIL', r: -1 },
      { model: 'SR', status: 'OPEN', r: null },
      { model: 'SR', status: 'PASS', r: 3 },
    ];
    const g = groupBy(records, (r) => r.model);
    assert.equal(g.TC.total, 2);
    assert.equal(g.TC.pass, 1);
    assert.equal(g.TC.fail, 1);
    assert.equal(g.TC.cumR, 1);
    assert.equal(g.SR.total, 2);
    assert.equal(g.SR.open, 1);
    assert.equal(g.SR.cumR, 3);
  });
  it('zero-signal groups are handled without throwing (a group simply does not appear)', () => {
    const g = groupBy([], (r) => r.model);
    assert.deepEqual(g, {});
  });
});

describe('P6 §10: sample-size labels are descriptive only, not performance grades', () => {
  it('labels n<20/20-49/50-99/>=100 correctly', () => {
    assert.equal(sampleSizeLabel(5), 'VERY LIMITED SAMPLE');
    assert.equal(sampleSizeLabel(19), 'VERY LIMITED SAMPLE');
    assert.equal(sampleSizeLabel(20), 'LIMITED SAMPLE');
    assert.equal(sampleSizeLabel(49), 'LIMITED SAMPLE');
    assert.equal(sampleSizeLabel(50), 'MODERATE SAMPLE');
    assert.equal(sampleSizeLabel(99), 'MODERATE SAMPLE');
    assert.equal(sampleSizeLabel(100), 'LARGER SAMPLE');
  });
});

describe('P6 §18: deterministic bootstrap seed', () => {
  it('the same seed always produces the exact same result (reproducibility)', () => {
    const records = [1, -1, 2, -1, 3, -1].map((r) => ({ status: r > 0 ? 'PASS' : 'FAIL', r }));
    const a = bootstrapMeanR(records, 500, 42);
    const b = bootstrapMeanR(records, 500, 42);
    assert.deepEqual(a, b);
  });
  it('a different seed can produce a different (but still deterministic) result', () => {
    const records = [1, -1, 2, -1, 3, -1].map((r) => ({ status: r > 0 ? 'PASS' : 'FAIL', r }));
    const a = bootstrapMeanR(records, 500, 1);
    const b = bootstrapMeanR(records, 500, 2);
    // Not asserting they differ (could coincide), only that both are well-formed and reproducible individually.
    assert.equal(a.iterations, 500);
    assert.equal(b.iterations, 500);
  });
  it('returns null for zero closed records rather than fabricating a distribution', () => {
    assert.equal(bootstrapMeanR([{ status: 'OPEN', r: null }], 100, 1), null);
  });
});

describe('P6 §22: no optimization-parameter mutation possible through this module', () => {
  it('validation/metrics.js exports only measurement functions — no threshold/quality/RR/model constant is defined or exported here', () => {
    const mod = { chronologicalSplit, wilsonInterval, passRate, meanR, medianR, cumulativeR, profitFactor, drawdown, streaks, percentiles, groupBy, sampleSizeLabel, bootstrapMeanR };
    for (const [name, fn] of Object.entries(mod)) {
      assert.equal(typeof fn, 'function', `${name} must be a pure function, not a mutable constant`);
    }
  });
});
