/**
 * src/engine/liquidity.js -- deterministic sweep/liquidity-pool/FVG/
 * premium-discount evidence. Hand-crafted fixtures (exact geometry
 * matters), following tests/engine_calculation.test.js conventions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findEqualLevels, detectSweepReclaim, detectPriorPeriodSweep,
  detectFairValueGaps, computePremiumDiscount, computeLiquidityContext, LIQUIDITY_PARAMS,
} from '../src/engine/liquidity.js';
import { computeStructure } from '../src/engine/structure.js';

const T0 = 1700000000;
function bar(i, { open, high, low, close }) {
  return { time: T0 + i * 900, open, high, low, close, volume: 100 };
}

describe('engine/liquidity: findEqualLevels', () => {
  it('clusters two nearby pivot highs into one liquidity pool', () => {
    const pivots = [{ index: 5, price: 2100.0, type: 'high' }, { index: 20, price: 2100.5, type: 'high' }];
    const pools = findEqualLevels(pivots, LIQUIDITY_PARAMS);
    assert.equal(pools.length, 1);
    assert.equal(pools[0].touch_count, 2);
  });
  it('does not merge pivots that are far apart in price', () => {
    const pivots = [{ index: 5, price: 2100, type: 'high' }, { index: 20, price: 2200, type: 'high' }];
    const pools = findEqualLevels(pivots, LIQUIDITY_PARAMS);
    assert.equal(pools.length, 0); // each cluster only has 1 touch -> below minClusterSize
  });
  it('returns empty for no pivots', () => {
    assert.deepEqual(findEqualLevels([], LIQUIDITY_PARAMS), []);
  });
});

describe('engine/liquidity: detectSweepReclaim', () => {
  it('reports swept:false when structure has no lastSweep', () => {
    assert.deepEqual(detectSweepReclaim([bar(0, { open: 1, high: 2, low: 0, close: 1 })], { lastSweep: null }), { swept: false });
  });

  it('detects reclaim when a later close breaks beyond the sweep bar own opposite extreme', () => {
    const bars = [];
    for (let i = 0; i <= 5; i++) bars.push(bar(i, { open: 2000, high: 2001, low: 1999, close: 2000 }));
    // sweep bar at index 5: wicks above with low=1998 (opposite extreme), closes back down
    bars[5] = bar(5, { open: 2000, high: 2005, low: 1998, close: 1999 });
    bars.push(bar(6, { open: 1999, high: 1999.5, low: 1997.5, close: 1997.9 })); // closes below sweep bar's low (1998) -> reclaim
    const structure = { lastSweep: { type: 'SWEEP_HIGH', bar: 5, level: 2004 } };
    const result = detectSweepReclaim(bars, structure, LIQUIDITY_PARAMS);
    assert.equal(result.swept, true);
    assert.equal(result.reclaimed, true);
    assert.equal(result.reclaimBarIndex, 6);
  });

  it('does not report reclaim if price never breaks the sweep bar own opposite extreme within lookback', () => {
    const bars = [];
    for (let i = 0; i <= 5; i++) bars.push(bar(i, { open: 2000, high: 2001, low: 1999, close: 2000 }));
    bars[5] = bar(5, { open: 2000, high: 2005, low: 1998, close: 1999 });
    bars.push(bar(6, { open: 1999, high: 2000, low: 1998.5, close: 1999.5 })); // stays above 1998, no reclaim
    const structure = { lastSweep: { type: 'SWEEP_HIGH', bar: 5, level: 2004 } };
    const result = detectSweepReclaim(bars, structure, LIQUIDITY_PARAMS);
    assert.equal(result.reclaimed, false);
  });
});

describe('engine/liquidity: detectPriorPeriodSweep', () => {
  it('reports BROKEN when the last bar closes beyond the prior high', () => {
    const bars = [bar(0, { open: 2100, high: 2130, low: 2099, close: 2125 })];
    const result = detectPriorPeriodSweep({ bars, priorHigh: 2120, priorLow: 2080 });
    assert.equal(result.high, 'BROKEN');
  });
  it('reports SWEPT_REJECTED when price wicks beyond but closes back inside', () => {
    const bars = [bar(0, { open: 2100, high: 2130, low: 2099, close: 2110 })];
    const result = detectPriorPeriodSweep({ bars, priorHigh: 2120, priorLow: 2080 });
    assert.equal(result.high, 'SWEPT_REJECTED');
  });
  it('reports NONE when neither prior extreme was approached', () => {
    const bars = [bar(0, { open: 2100, high: 2105, low: 2095, close: 2100 })];
    const result = detectPriorPeriodSweep({ bars, priorHigh: 2120, priorLow: 2080 });
    assert.equal(result.high, 'NONE');
    assert.equal(result.low, 'NONE');
  });
  it('handles missing prior levels without throwing', () => {
    const result = detectPriorPeriodSweep({ bars: [], priorHigh: null, priorLow: null });
    assert.deepEqual(result, { high: 'NONE', low: 'NONE' });
  });
});

describe('engine/liquidity: detectFairValueGaps', () => {
  it('detects a bullish FVG when candle i-2 high is below candle i low, filtered by ATR ratio', () => {
    const bars = [
      bar(0, { open: 2000, high: 2002, low: 1998, close: 2001 }), // i-2: high=2002
      bar(1, { open: 2001, high: 2010, low: 2000, close: 2009 }), // impulse
      bar(2, { open: 2010, high: 2015, low: 2008, close: 2013 }), // i: low=2008 > 2002 -> gap [2002,2008]
    ];
    const atrSeries = [1, 1, 1]; // gap size 6, ratio 6 >> fvgMinGapAtrRatio
    const gaps = detectFairValueGaps(bars, atrSeries, LIQUIDITY_PARAMS);
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].direction, 'BULLISH');
    assert.equal(gaps[0].gapLow, 2002);
    assert.equal(gaps[0].gapHigh, 2008);
  });

  it('marks a gap filled once a later bar trades back into it', () => {
    const bars = [
      bar(0, { open: 2000, high: 2002, low: 1998, close: 2001 }),
      bar(1, { open: 2001, high: 2010, low: 2000, close: 2009 }),
      bar(2, { open: 2010, high: 2015, low: 2008, close: 2013 }),
      bar(3, { open: 2013, high: 2014, low: 2004, close: 2005 }), // dips back into [2002,2008]
    ];
    const atrSeries = [1, 1, 1, 1];
    const gaps = detectFairValueGaps(bars, atrSeries, LIQUIDITY_PARAMS);
    assert.equal(gaps[0].filled, true);
  });

  it('filters out gaps too small relative to ATR', () => {
    const bars = [
      bar(0, { open: 2000, high: 2002, low: 1998, close: 2001 }),
      bar(1, { open: 2001, high: 2010, low: 2000, close: 2009 }),
      bar(2, { open: 2010, high: 2015, low: 2008, close: 2013 }),
    ];
    const atrSeries = [100, 100, 100]; // gap size 6, ratio 0.06 < fvgMinGapAtrRatio (0.1)
    assert.equal(detectFairValueGaps(bars, atrSeries, LIQUIDITY_PARAMS).length, 0);
  });

  it('returns empty for missing atrSeries or too few bars', () => {
    assert.deepEqual(detectFairValueGaps([bar(0, { open: 1, high: 2, low: 0, close: 1 })], null), []);
    assert.deepEqual(detectFairValueGaps([], []), []);
  });
});

describe('engine/liquidity: computePremiumDiscount', () => {
  it('classifies price near the top of the range as PREMIUM', () => {
    const result = computePremiumDiscount(2190, 2200, 2000);
    assert.equal(result.zone, 'PREMIUM');
  });
  it('classifies price near the bottom of the range as DISCOUNT', () => {
    const result = computePremiumDiscount(2010, 2200, 2000);
    assert.equal(result.zone, 'DISCOUNT');
  });
  it('classifies price near the middle as EQUILIBRIUM', () => {
    const result = computePremiumDiscount(2100, 2200, 2000);
    assert.equal(result.zone, 'EQUILIBRIUM');
  });
  it('never fabricates a zone from an invalid/absent range', () => {
    assert.deepEqual(computePremiumDiscount(2100, null, 2000), { zone: null, pct: null });
    assert.deepEqual(computePremiumDiscount(2100, 2000, 2200), { zone: null, pct: null }); // inverted range
  });
});

describe('engine/liquidity: computeLiquidityContext integration', () => {
  it('assembles a full evidence object from real structure output without throwing', () => {
    const bars = [];
    let price = 2000;
    for (let i = 0; i < 40; i++) {
      const close = price + (i % 2 === 0 ? 1 : -0.5);
      bars.push(bar(i, { open: price, high: Math.max(price, close) + 0.5, low: Math.min(price, close) - 0.5, close }));
      price = close;
    }
    const structure = computeStructure(bars);
    const ctx = computeLiquidityContext({ bars, structure, atrSeries: bars.map(() => 1), priorDayHigh: 2010, priorDayLow: 1990, priorWeekHigh: 2020, priorWeekLow: 1980 });
    assert.ok(Array.isArray(ctx.equalHighs));
    assert.ok(Array.isArray(ctx.equalLows));
    assert.ok('swept' in ctx.sweepReclaim || ctx.sweepReclaim.swept === false);
    assert.ok(['NONE', 'SWEPT_REJECTED', 'BROKEN'].includes(ctx.priorDaySweep.high));
  });

  it('degrades safely with no structure/bars', () => {
    const ctx = computeLiquidityContext({ bars: [], structure: null });
    assert.deepEqual(ctx.equalHighs, []);
    assert.deepEqual(ctx.equalLows, []);
    assert.equal(ctx.sweepReclaim.swept, false);
  });
});
