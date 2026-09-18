/**
 * src/engine/patterns.js -- classical chart-pattern detection. Fixtures
 * pass a synthetic `{ pivots: [...] }` structure object directly (the
 * exact shape computeStructure() produces) so each geometry test is
 * fully controlled and independent of the pivot-detection algorithm
 * itself (which tests/engine_calculation.test.js and tests/engine_levels
 * already cover separately).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectClassicalPatterns, PATTERN_PARAMS } from '../src/engine/patterns.js';
import { computeStructure } from '../src/engine/structure.js';

const T0 = 1700000000;
function bar(i, close, o = close, h = close + 0.2, l = close - 0.2) {
  return { time: T0 + i * 900, open: o, high: Math.max(h, o, close), low: Math.min(l, o, close), close, volume: 100 };
}
function flatBars(n, price = 2000) {
  return Array.from({ length: n }, (_, i) => bar(i, price));
}
function piv(index, price, type) { return { index, price, type, label: type === 'high' ? 'H' : 'L' }; }

function findPattern(patterns, type) { return patterns.find((p) => p.pattern_type === type); }

describe('engine/patterns: Double/Triple Top/Bottom', () => {
  it('detects a DOUBLE_TOP with a neckline and reports COMPLETE_UNCONFIRMED before the break', () => {
    const bars = flatBars(30, 2005); // last close 2005, below the tops but not yet below the neckline
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2020.5, 'high')] };
    const patterns = detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS);
    const dt = findPattern(patterns, 'DOUBLE_TOP');
    assert.ok(dt, 'expected a DOUBLE_TOP');
    assert.equal(dt.bias, 'BEARISH');
    assert.equal(dt.neckline, 2000);
    assert.equal(dt.completion_state, 'COMPLETE_UNCONFIRMED');
  });

  it('confirms the DOUBLE_TOP once the close breaks the neckline', () => {
    const bars = flatBars(30, 1995); // below the neckline (2000)
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2020.5, 'high')] };
    const dt = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DOUBLE_TOP');
    assert.equal(dt.completion_state, 'CONFIRMED');
  });

  it('invalidates the DOUBLE_TOP if price closes back above both tops', () => {
    const bars = flatBars(30, 2030);
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2020.5, 'high')] };
    const dt = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DOUBLE_TOP');
    assert.equal(dt.completion_state, 'INVALIDATED');
  });

  it('does NOT report a double top when the two peaks are not comparable in height', () => {
    const bars = flatBars(30, 2005);
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2100, 'high')] }; // 2100 is far from 2020
    assert.equal(findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DOUBLE_TOP'), undefined);
  });

  it('does NOT report a double top when there is no meaningful pullback between the peaks', () => {
    const bars = flatBars(30, 2019);
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2019.9, 'low'), piv(15, 2020.1, 'high')] }; // negligible pullback
    assert.equal(findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DOUBLE_TOP'), undefined);
  });

  it('prefers TRIPLE_TOP over DOUBLE_TOP when three comparable peaks exist', () => {
    const bars = flatBars(40, 2005);
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2020.2, 'high'), piv(20, 2000.1, 'low'), piv(25, 2019.9, 'high')] };
    const patterns = detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS);
    assert.ok(findPattern(patterns, 'TRIPLE_TOP'));
    assert.equal(findPattern(patterns, 'DOUBLE_TOP'), undefined);
  });

  it('detects a DOUBLE_BOTTOM mirrored correctly', () => {
    const bars = flatBars(30, 2025); // above the neckline
    const structure = { pivots: [piv(5, 1980, 'low'), piv(10, 2000, 'high'), piv(15, 1979.8, 'low')] };
    const db = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DOUBLE_BOTTOM');
    assert.ok(db);
    assert.equal(db.bias, 'BULLISH');
    assert.equal(db.neckline, 2000);
  });
});

describe('engine/patterns: Head & Shoulders', () => {
  it('detects a HEAD_AND_SHOULDERS with comparable shoulders and a clearly higher head', () => {
    const bars = flatBars(25, 1985); // comfortably below the (slightly downward-extrapolated) neckline
    const structure = { pivots: [piv(5, 2010, 'high'), piv(8, 1998, 'low'), piv(12, 2030, 'high'), piv(16, 1997, 'low'), piv(20, 2010.5, 'high')] };
    const hs = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'HEAD_AND_SHOULDERS');
    assert.ok(hs);
    assert.equal(hs.bias, 'BEARISH');
    assert.equal(hs.completion_state, 'CONFIRMED');
  });

  it('does not report H&S when shoulders are not comparable in height', () => {
    const bars = flatBars(40, 1995);
    const structure = { pivots: [piv(5, 2010, 'high'), piv(8, 1998, 'low'), piv(12, 2030, 'high'), piv(16, 1997, 'low'), piv(20, 2050, 'high')] }; // right shoulder far above left
    assert.equal(findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'HEAD_AND_SHOULDERS'), undefined);
  });

  it('does not report H&S when the middle peak does not clearly exceed the shoulders', () => {
    const bars = flatBars(40, 1995);
    const structure = { pivots: [piv(5, 2010, 'high'), piv(8, 1998, 'low'), piv(12, 2011, 'high'), piv(16, 1997, 'low'), piv(20, 2010.2, 'high')] }; // head barely above shoulders
    assert.equal(findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'HEAD_AND_SHOULDERS'), undefined);
  });

  it('detects an INVERSE_HEAD_AND_SHOULDERS mirrored correctly', () => {
    const bars = flatBars(40, 2010); // above the neckline
    const structure = { pivots: [piv(5, 1990, 'low'), piv(8, 2002, 'high'), piv(12, 1970, 'low'), piv(16, 2003, 'high'), piv(20, 1989.5, 'low')] };
    const ihs = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'INVERSE_HEAD_AND_SHOULDERS');
    assert.ok(ihs);
    assert.equal(ihs.bias, 'BULLISH');
  });
});

describe('engine/patterns: triangles, wedges, channels, rectangle', () => {
  it('detects an ASCENDING_TRIANGLE (flat resistance, rising support)', () => {
    const bars = flatBars(30, 2010);
    const structure = { pivots: [piv(2, 2000, 'high'), piv(6, 1990, 'low'), piv(10, 2000.2, 'high'), piv(14, 1995, 'low'), piv(18, 1999.9, 'high'), piv(22, 1999, 'low')] };
    const tri = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'ASCENDING_TRIANGLE');
    assert.ok(tri, 'expected ASCENDING_TRIANGLE');
    assert.equal(tri.bias, 'BULLISH');
  });

  it('detects a DESCENDING_TRIANGLE (falling resistance, flat support)', () => {
    const bars = flatBars(30, 1990);
    const structure = { pivots: [piv(2, 2015, 'high'), piv(6, 2000, 'low'), piv(10, 2010, 'high'), piv(14, 2000.1, 'low'), piv(18, 2005, 'high'), piv(22, 1999.9, 'low')] };
    const tri = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'DESCENDING_TRIANGLE');
    assert.ok(tri, 'expected DESCENDING_TRIANGLE');
    assert.equal(tri.bias, 'BEARISH');
  });

  it('detects a SYMMETRICAL_TRIANGLE (converging opposite-slope lines)', () => {
    const bars = flatBars(30, 2000);
    const structure = { pivots: [piv(2, 2030, 'high'), piv(6, 1970, 'low'), piv(10, 2015, 'high'), piv(14, 1985, 'low'), piv(18, 2005, 'high'), piv(22, 1995, 'low')] };
    const tri = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'SYMMETRICAL_TRIANGLE');
    assert.ok(tri, 'expected SYMMETRICAL_TRIANGLE');
  });

  it('detects a RISING_WEDGE (both lines rising, converging)', () => {
    const bars = flatBars(30, 2000);
    const structure = { pivots: [piv(2, 2000, 'high'), piv(6, 1970, 'low'), piv(10, 2015, 'high'), piv(14, 1995, 'low'), piv(18, 2025, 'high'), piv(22, 2015, 'low')] };
    const w = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'RISING_WEDGE');
    assert.ok(w, 'expected RISING_WEDGE');
    assert.equal(w.bias, 'BEARISH');
  });

  it('detects a FALLING_WEDGE (both lines falling, converging)', () => {
    const bars = flatBars(30, 2000);
    const structure = { pivots: [piv(2, 2030, 'high'), piv(6, 2000, 'low'), piv(10, 2015, 'high'), piv(14, 1995, 'low'), piv(18, 2005, 'high'), piv(22, 1990, 'low')] };
    const w = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'FALLING_WEDGE');
    assert.ok(w, 'expected FALLING_WEDGE');
    assert.equal(w.bias, 'BULLISH');
  });

  it('detects a RECTANGLE when both boundaries are flat and parallel', () => {
    const bars = flatBars(30, 2000);
    const structure = { pivots: [piv(2, 2020, 'high'), piv(6, 1980, 'low'), piv(10, 2020.1, 'high'), piv(14, 1979.9, 'low'), piv(18, 2019.9, 'high'), piv(22, 1980.1, 'low')] };
    const r = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'RECTANGLE');
    assert.ok(r, 'expected RECTANGLE');
  });

  it('detects an ASCENDING_CHANNEL (both lines rising, roughly parallel)', () => {
    const bars = flatBars(30, 2020);
    const structure = { pivots: [piv(2, 2000, 'high'), piv(6, 1980, 'low'), piv(10, 2015, 'high'), piv(14, 1995, 'low'), piv(18, 2030, 'high'), piv(22, 2010, 'low')] };
    const c = findPattern(detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS), 'ASCENDING_CHANNEL');
    assert.ok(c, 'expected ASCENDING_CHANNEL');
    assert.equal(c.bias, 'BULLISH');
  });

  it('reports no trendline pattern for an incoherent/crossed set of pivots', () => {
    const bars = flatBars(30, 2000);
    const structure = { pivots: [piv(2, 1980, 'high'), piv(6, 2020, 'low')] }; // high below low -- degenerate
    const patterns = detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS);
    assert.equal(patterns.filter((p) => ['ASCENDING_TRIANGLE', 'DESCENDING_TRIANGLE', 'SYMMETRICAL_TRIANGLE', 'RISING_WEDGE', 'FALLING_WEDGE', 'RECTANGLE', 'ASCENDING_CHANNEL', 'DESCENDING_CHANNEL'].includes(p.pattern_type)).length, 0);
  });
});

describe('engine/patterns: flags and pennants', () => {
  function makeFlagBars() {
    const bars = [bar(0, 2000)]; // one leading filler bar (the detector needs poleMaxBars+flagWindowBars+1 bars total)
    // pole: strong bullish impulsive move over exactly poleMaxBars (8) bars
    let price = 2000;
    for (let i = 1; i <= 8; i++) {
      const close = price + 5;
      bars.push(bar(i, close, price, close + 0.3, price - 0.2));
      price = close;
    }
    // consolidation: flagWindowBars (10) bars, shallow parallel pullback (flag), roughly constant range
    for (let i = 9; i < 19; i++) {
      bars.push(bar(i, price - 1 + (i % 2 === 0 ? 0.5 : -0.5), price, price + 0.6, price - 1.6));
    }
    return bars;
  }

  it('detects a BULL_FLAG after an impulsive move followed by a shallow parallel pullback', () => {
    const bars = makeFlagBars();
    const flag = findPattern(detectClassicalPatterns(bars, { pivots: [] }, 1, PATTERN_PARAMS), 'BULL_FLAG');
    assert.ok(flag, 'expected BULL_FLAG');
    assert.equal(flag.bias, 'BULLISH');
  });

  it('does not detect a flag when there is no genuine impulsive pole', () => {
    const bars = flatBars(20, 2000); // no displacement at all
    const patterns = detectClassicalPatterns(bars, { pivots: [] }, 1, PATTERN_PARAMS);
    assert.equal(findPattern(patterns, 'BULL_FLAG'), undefined);
    assert.equal(findPattern(patterns, 'BEAR_FLAG'), undefined);
  });

  it('classifies a narrowing (converging) consolidation after a pole as a PENNANT instead of a flag', () => {
    const bars = [bar(0, 2000)]; // one leading filler bar
    let price = 2000;
    for (let i = 1; i <= 8; i++) {
      const close = price + 5;
      bars.push(bar(i, close, price, close + 0.3, price - 0.2));
      price = close;
    }
    // consolidation narrows sharply over the window (wide then tight)
    for (let i = 9; i < 19; i++) {
      const width = i < 14 ? 1.5 : 0.2;
      bars.push(bar(i, price, price, price + width, price - width));
    }
    const patterns = detectClassicalPatterns(bars, { pivots: [] }, 1, PATTERN_PARAMS);
    assert.ok(findPattern(patterns, 'PENNANT'), 'expected PENNANT');
  });
});

describe('engine/patterns: no-lookahead and safety', () => {
  it('a pattern reported from a longer bar series is unaffected by bars appended after it was already resolvable', () => {
    const bars = flatBars(50, 2005);
    const structure = { pivots: [piv(5, 2020, 'high'), piv(10, 2000, 'low'), piv(15, 2020.5, 'high')] };
    const prefixBars = bars.slice(0, 20);
    const full = detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS);
    const prefix = detectClassicalPatterns(prefixBars, structure, 1, PATTERN_PARAMS);
    const fullDt = findPattern(full, 'DOUBLE_TOP');
    const prefixDt = findPattern(prefix, 'DOUBLE_TOP');
    assert.equal(fullDt.completion_state, prefixDt.completion_state);
    assert.equal(fullDt.neckline, prefixDt.neckline);
  });

  it('returns an empty array for missing bars/structure rather than throwing', () => {
    assert.deepEqual(detectClassicalPatterns([], null, 1), []);
    assert.deepEqual(detectClassicalPatterns([bar(0, 2000)], { pivots: [] }, 1), []);
  });

  it('integrates with real computeStructure() output without throwing', () => {
    const bars = flatBars(150, 2000).map((b, i) => ({ ...b, close: 2000 + Math.sin(i / 5) * 10, high: 2000 + Math.sin(i / 5) * 10 + 0.5, low: 2000 + Math.sin(i / 5) * 10 - 0.5 }));
    const structure = computeStructure(bars);
    assert.doesNotThrow(() => detectClassicalPatterns(bars, structure, 1, PATTERN_PARAMS));
  });
});
