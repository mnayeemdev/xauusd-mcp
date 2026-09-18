/**
 * src/engine/candlesticks.js — deterministic candlestick evidence tests
 * using small, hand-crafted OHLCV fixtures (exact geometry matters here,
 * so these are not randomly generated).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectCandlestickPatterns, CANDLESTICK_PARAMS } from '../src/engine/candlesticks.js';

const START_TIME = 1700000000;
const TF = 900;

function bar(idx, open, high, low, close, volume = 100) {
  return { time: START_TIME + idx * TF, open, high, low, close, volume };
}

function names(results) {
  return results.map((r) => r.pattern);
}

function has(results, pattern) {
  return results.some((r) => r.pattern === pattern);
}

/** Builds N bars of a steady trend (up if step>0, down if step<0) ending just before the bar under test. */
function trendPrefix(n, startPrice, step) {
  const bars = [];
  let price = startPrice;
  for (let idx = 0; idx < n; idx++) {
    const open = price;
    const close = price + step;
    const high = Math.max(open, close) + Math.abs(step) * 0.1 + 0.05;
    const low = Math.min(open, close) - Math.abs(step) * 0.1 - 0.05;
    bars.push(bar(idx, open, high, low, close));
    price = close;
  }
  return bars;
}

describe('candlesticks: single-candle — doji family', () => {
  it('detects a Doji at the body/range boundary (inclusive)', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2001)]; // range 10, body 1 -> ratio exactly 0.1
    assert.equal(has(detectCandlestickPatterns(bars, 0), 'DOJI'), true);
  });
  it('does not detect a Doji just past the boundary', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2001.01)]; // ratio 0.101
    assert.equal(has(detectCandlestickPatterns(bars, 0), 'DOJI'), false);
  });
  it('detects Long-Legged Doji when both wicks are long', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2001)]; // upperWickRatio .4, lowerWickRatio .5
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'DOJI'), true);
    assert.equal(has(r, 'LONG_LEGGED_DOJI'), true);
  });
  it('detects Dragonfly Doji (small upper wick, long lower wick) and it is NOT Long-Legged', () => {
    const bars = [bar(0, 2000, 2000.1, 1998.9, 2000.05)];
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'DRAGONFLY_DOJI'), true);
    assert.equal(has(r, 'LONG_LEGGED_DOJI'), false);
  });
  it('detects Gravestone Doji (small lower wick, long upper wick)', () => {
    const bars = [bar(0, 2000, 2001.1, 1999.9, 1999.95)];
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'GRAVESTONE_DOJI'), true);
    assert.equal(has(r, 'DRAGONFLY_DOJI'), false);
  });
});

describe('candlesticks: single-candle — marubozu / spinning top', () => {
  it('detects a bullish Marubozu at/above the body-ratio and wick-ratio thresholds', () => {
    const bars = [bar(0, 2000, 2010.2, 1999.8, 2010)]; // bodyToRange .9615, wicks ~.019
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'MARUBOZU'), true);
    assert.equal(r.find((p) => p.pattern === 'MARUBOZU').bias, 'BULLISH');
  });
  it('a Marubozu-sized body with a wick past the wick threshold is NOT a Marubozu', () => {
    const bars = [bar(0, 2000, 2011, 1999.8, 2010)]; // upper wick ratio ~0.09 > 0.05
    assert.equal(has(detectCandlestickPatterns(bars, 0), 'MARUBOZU'), false);
  });
  it('detects a balanced Spinning Top', () => {
    const bars = [bar(0, 2000, 2006, 1996, 2002)]; // body2/range10=.2, wicks .4/.4
    assert.equal(has(detectCandlestickPatterns(bars, 0), 'SPINNING_TOP'), true);
  });
  it('an unbalanced small-body candle (one wick below the minimum) is NOT a Spinning Top', () => {
    const bars = [bar(0, 2000, 2007, 1999, 2002)]; // lowerWickRatio 1/8=.125 < .25
    assert.equal(has(detectCandlestickPatterns(bars, 0), 'SPINNING_TOP'), false);
  });
});

describe('candlesticks: hammer family (trend-dependent)', () => {
  const hammerShapeBar = (idx) => bar(idx, 2070, 2070.3, 2065, 2069.5); // small body, long lower wick
  const invHammerShapeBar = (idx) => bar(idx, 2070, 2075, 2069.3, 2069.5); // small body, long upper wick

  it('the hammer shape after a DOWN trend is a HAMMER (bullish)', () => {
    const bars = [...trendPrefix(12, 2100, -2), hammerShapeBar(12)];
    const r = detectCandlestickPatterns(bars, 12);
    assert.equal(has(r, 'HAMMER'), true);
    assert.equal(r.find((p) => p.pattern === 'HAMMER').bias, 'BULLISH');
    assert.equal(has(r, 'HANGING_MAN'), false);
  });
  it('the IDENTICAL shape after an UP trend is a HANGING_MAN (bearish), never a HAMMER', () => {
    const bars = [...trendPrefix(12, 2000, 2), hammerShapeBar(12)];
    const r = detectCandlestickPatterns(bars, 12);
    assert.equal(has(r, 'HANGING_MAN'), true);
    assert.equal(r.find((p) => p.pattern === 'HANGING_MAN').bias, 'BEARISH');
    assert.equal(has(r, 'HAMMER'), false);
  });
  it('the hammer shape with no established trend (insufficient history) fires neither HAMMER nor HANGING_MAN', () => {
    const bars = [hammerShapeBar(0)];
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'HAMMER'), false);
    assert.equal(has(r, 'HANGING_MAN'), false);
  });
  it('Inverted Hammer after a DOWN trend; Shooting Star for the identical shape after an UP trend', () => {
    const down = [...trendPrefix(12, 2100, -2), invHammerShapeBar(12)];
    const rDown = detectCandlestickPatterns(down, 12);
    assert.equal(has(rDown, 'INVERTED_HAMMER'), true);
    assert.equal(has(rDown, 'SHOOTING_STAR'), false);

    const up = [...trendPrefix(12, 2000, 2), invHammerShapeBar(12)];
    const rUp = detectCandlestickPatterns(up, 12);
    assert.equal(has(rUp, 'SHOOTING_STAR'), true);
    assert.equal(has(rUp, 'INVERTED_HAMMER'), false);
  });
  it('boundary: lowerWick exactly 2x body still qualifies as a hammer shape', () => {
    // body=1 (2069-2070=|-1|), lowerWick exactly 2.0
    const bars = [...trendPrefix(12, 2100, -2), bar(12, 2070, 2070.1, 2067, 2069)];
    const r = detectCandlestickPatterns(bars, 12);
    assert.equal(has(r, 'HAMMER'), true);
  });
  it('boundary: lowerWick just under 2x body does not qualify', () => {
    const bars = [...trendPrefix(12, 2100, -2), bar(12, 2070, 2070.1, 2067.1, 2069)]; // lowerWick 1.9
    const r = detectCandlestickPatterns(bars, 12);
    assert.equal(has(r, 'HAMMER'), false);
  });
});

describe('candlesticks: pin bar / rejection (trend-independent)', () => {
  it('detects a Bullish Pin Bar regardless of trend context', () => {
    const bars = [bar(0, 2000, 2001.3, 1995, 2001)];
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'BULLISH_PIN_BAR'), true);
  });
  it('detects a Bearish Pin Bar regardless of trend context', () => {
    const bars = [bar(0, 2000, 2005, 1998.7, 1999)];
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'BEARISH_PIN_BAR'), true);
  });
  it('a candle with a dominant wick but a centered close is NOT a pin bar', () => {
    const bars = [bar(0, 2000, 2010, 1990, 2001)]; // big range, but close near the middle
    const r = detectCandlestickPatterns(bars, 0);
    assert.equal(has(r, 'BULLISH_PIN_BAR'), false);
    assert.equal(has(r, 'BEARISH_PIN_BAR'), false);
  });
});

describe('candlesticks: two-candle patterns', () => {
  it('detects Bullish Engulfing', () => {
    const bars = [bar(0, 2000, 2000.2, 1994.8, 1995), bar(1, 1994, 2001.2, 1993.8, 2001)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BULLISH_ENGULFING'), true);
  });
  it('a smaller bullish body that does NOT fully engulf the prior body is not Bullish Engulfing', () => {
    const bars = [bar(0, 2000, 2000.2, 1994.8, 1995), bar(1, 1996, 1999.5, 1995.5, 1999)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BULLISH_ENGULFING'), false);
  });
  it('detects Bearish Engulfing', () => {
    const bars = [bar(0, 1995, 2000.2, 1994.8, 2000), bar(1, 2001, 2001.2, 1993.8, 1994)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BEARISH_ENGULFING'), true);
  });
  it('detects Inside Bar', () => {
    const bars = [bar(0, 2000, 2010, 1990, 2005), bar(1, 2001, 2005, 1995, 2002)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'INSIDE_BAR'), true);
  });
  it('a bar that is NOT strictly inside the prior range is not an Inside Bar', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2002), bar(1, 2001, 2005, 1995, 2002)]; // identical range
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'INSIDE_BAR'), false);
  });
  it('detects Outside Bar', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2002), bar(1, 2001, 2010, 1990, 2003)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'OUTSIDE_BAR'), true);
  });
  it('detects Tweezer Top', () => {
    const bars = [bar(0, 2000, 2010, 1998, 2008), bar(1, 2009, 2010.005, 2000, 2001)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'TWEEZER_TOP'), true);
  });
  it('highs that are not close enough do not form a Tweezer Top', () => {
    const bars = [bar(0, 2000, 2010, 1998, 2008), bar(1, 2009, 2015, 2000, 2001)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'TWEEZER_TOP'), false);
  });
  it('detects Tweezer Bottom', () => {
    const bars = [bar(0, 2010, 2012, 2000, 2001), bar(1, 2002, 2011, 2000.005, 2009)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'TWEEZER_BOTTOM'), true);
  });
  it('detects Bullish Harami', () => {
    const bars = [bar(0, 2010, 2011, 1994, 1995), bar(1, 2000, 2006, 1999, 2005)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BULLISH_HARAMI'), true);
  });
  it('a second body that is not meaningfully smaller is not a Harami', () => {
    const bars = [bar(0, 2010, 2011, 1994, 1995), bar(1, 1996, 2009.5, 1995.5, 2009)]; // body ~13, not << 15
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BULLISH_HARAMI'), false);
  });
  it('detects Bearish Harami', () => {
    const bars = [bar(0, 1995, 2011, 1994, 2010), bar(1, 2005, 2006, 1999, 2000)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'BEARISH_HARAMI'), true);
  });
  it('detects Piercing Pattern', () => {
    const bars = [bar(0, 2010, 2011, 1999, 2000), bar(1, 1998, 2007.5, 1997.8, 2007)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'PIERCING_PATTERN'), true);
  });
  it('detects Dark Cloud Cover', () => {
    const bars = [bar(0, 2000, 2011, 1999, 2010), bar(1, 2012, 2012.5, 2002.5, 2003)];
    assert.equal(has(detectCandlestickPatterns(bars, 1), 'DARK_CLOUD_COVER'), true);
  });
});

describe('candlesticks: multi-candle patterns', () => {
  it('detects Morning Star', () => {
    const bars = [
      bar(0, 2020, 2020.2, 1999.8, 2000),
      bar(1, 1998.5, 1999.5, 1997.5, 1998),
      bar(2, 1998, 2012.3, 1997.7, 2012),
    ];
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'MORNING_STAR'), true);
  });
  it('a middle candle that is too large is not a Morning Star (no genuine indecision)', () => {
    const bars = [
      bar(0, 2020, 2020.2, 1999.8, 2000),
      bar(1, 1999, 1996, 1996, 1996), // will be corrected below to be a valid, larger-bodied bar
      bar(2, 1998, 2012.3, 1997.7, 2012),
    ];
    bars[1] = bar(1, 1999, 1999.2, 1990.8, 1991); // body 8, range 8.4 -> bodyToRange .95, too large to be "small"
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'MORNING_STAR'), false);
  });
  it('detects Evening Star', () => {
    const bars = [
      bar(0, 2000, 2020.2, 1999.8, 2020),
      bar(1, 2021, 2022, 2020.7, 2021.3),
      bar(2, 2022, 2022.3, 2007.7, 2008),
    ];
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'EVENING_STAR'), true);
  });
  it('detects Three White Soldiers', () => {
    const bars = [
      bar(0, 2000, 2010.5, 1999.5, 2010),
      bar(1, 2005, 2015.5, 2004.5, 2015),
      bar(2, 2010, 2020.5, 2009.5, 2020),
    ];
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'THREE_WHITE_SOLDIERS'), true);
  });
  it('a sequence with a shrinking third close is not Three White Soldiers', () => {
    const bars = [
      bar(0, 2000, 2010.5, 1999.5, 2010),
      bar(1, 2005, 2015.5, 2004.5, 2015),
      bar(2, 2010, 2014.5, 2009.5, 2014), // closes lower than bar 1
    ];
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'THREE_WHITE_SOLDIERS'), false);
  });
  it('detects Three Black Crows', () => {
    const bars = [
      bar(0, 2020, 2020.3, 2009.7, 2010),
      bar(1, 2015, 2015.3, 2004.7, 2005),
      bar(2, 2010, 2010.3, 1999.7, 2000),
    ];
    assert.equal(has(detectCandlestickPatterns(bars, 2), 'THREE_BLACK_CROWS'), true);
  });
});

describe('candlesticks: no-lookahead', () => {
  it('detection at index i is identical whether later bars exist in the array or not', () => {
    const full = [
      bar(0, 2000, 2000.2, 1994.8, 1995),
      bar(1, 1994, 2001.2, 1993.8, 2001), // bullish engulfing completes HERE (index 1)
      bar(2, 2001, 2050, 1990, 2049), // an unrelated later bar that must not affect index-1 detection
    ];
    const sliced = full.slice(0, 2);
    assert.deepEqual(detectCandlestickPatterns(full, 1), detectCandlestickPatterns(sliced, 1));
    // and index 0 must show no forward-looking knowledge of the engulfing that only completes at index 1
    assert.equal(has(detectCandlestickPatterns(full, 0), 'BULLISH_ENGULFING'), false);
  });
});

describe('candlesticks: malformed / insufficient data safety', () => {
  it('a bar with high < low does not throw and yields no patterns', () => {
    const bars = [bar(0, 2000, 1990, 2010, 2000)]; // inverted high/low
    assert.doesNotThrow(() => detectCandlestickPatterns(bars, 0));
    assert.deepEqual(detectCandlestickPatterns(bars, 0), []);
  });
  it('non-finite OHLC values do not throw and yield no patterns', () => {
    const bars = [{ time: START_TIME, open: NaN, high: 2010, low: 1990, close: 2000, volume: 100 }];
    assert.doesNotThrow(() => detectCandlestickPatterns(bars, 0));
    assert.deepEqual(detectCandlestickPatterns(bars, 0), []);
  });
  it('a zero-range bar (open=high=low=close) yields no patterns rather than a fabricated Doji', () => {
    const bars = [bar(0, 2000, 2000, 2000, 2000)];
    assert.deepEqual(detectCandlestickPatterns(bars, 0), []);
  });
  it('calling at i=0 never throws for two/multi-candle logic and returns only single-candle evidence', () => {
    const bars = [bar(0, 2000, 2001.3, 1995, 2001)]; // a pin-bar shaped single candle
    assert.doesNotThrow(() => detectCandlestickPatterns(bars, 0));
    const r = detectCandlestickPatterns(bars, 0);
    assert.ok(r.every((p) => p.family === 'single_candle'));
  });
  it('calling at i=1 never throws for multi-candle logic (needs i>=2)', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2002), bar(1, 2002, 2008, 1998, 2004)];
    assert.doesNotThrow(() => detectCandlestickPatterns(bars, 1));
    const r = detectCandlestickPatterns(bars, 1);
    assert.ok(r.every((p) => p.family !== 'multi_candle'));
  });
  it('an out-of-range index returns an empty array rather than throwing', () => {
    const bars = [bar(0, 2000, 2005, 1995, 2002)];
    assert.doesNotThrow(() => detectCandlestickPatterns(bars, 5));
    assert.deepEqual(detectCandlestickPatterns(bars, 5), []);
  });
});

describe('candlesticks: ordinary candle produces no false positives', () => {
  it('a plain mid-range candle with no special geometry matches nothing', () => {
    const bars = [bar(0, 2000, 2005, 1998, 2003)];
    assert.deepEqual(detectCandlestickPatterns(bars, 0), []);
  });
});

describe('candlesticks: params are exported and documented', () => {
  it('exposes every threshold used by the detectors', () => {
    const required = [
      'trendLookback', 'trendEmaLen', 'trendMinSlopeAbsPct',
      'dojiBodyToRangeMax', 'longLeggedWickMin', 'dragonflyUpperWickMax', 'dragonflyLowerWickMin',
      'gravestoneLowerWickMax', 'gravestoneUpperWickMin', 'marubozuMinBodyToRange', 'marubozuWickMax',
      'spinningBodyToRangeMax', 'spinningWickMin', 'spinningWickBalanceTol',
      'hammerMaxBodyToRange', 'hammerDominantWickToBodyMin', 'hammerOppositeWickRatioMax',
      'pinBarWickRatioMin', 'pinBarClosePositionMin', 'tweezerTolerancePct', 'haramiMaxBodyRatio',
      'starLargeBodyMin', 'starSmallBodyMax', 'starPenetrationMin', 'soldiersMinBodyToRange', 'soldiersMaxWickRatio',
    ];
    for (const key of required) assert.ok(Object.prototype.hasOwnProperty.call(CANDLESTICK_PARAMS, key), `missing param: ${key}`);
  });
});
