/**
 * src/engine/volatility.js -- deterministic unit tests using synthetic
 * OHLCV fixtures only.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVolatilityContext, distanceInAtr, VOLATILITY_PARAMS } from '../src/engine/volatility.js';
import { seededRng } from '../validation/metrics.js';

const START_TIME = 1700000000;
const TF_SECONDS = 900;

// Only exercise the ratio-based branch of the state machine (never the
// percentile-based HIGH/LOW branch), by pushing the percentile thresholds
// out of reach -- isolates EXPANSION/CONTRACTION/NORMAL from HIGH/LOW.
const RATIO_ONLY_PARAMS = { ...VOLATILITY_PARAMS, highVolPercentile: 101, lowVolPercentile: -1 };

function makeBars(n, rangeFn, { base = 2000, seed = 1 } = {}) {
  const rng = seededRng(seed);
  const bars = [];
  let price = base;
  for (let i = 0; i < n; i++) {
    const range = rangeFn(i);
    const open = price;
    const close = price + (rng() - 0.5) * range * 0.2;
    const high = Math.max(open, close) + range / 2;
    const low = Math.min(open, close) - range / 2;
    bars.push({ time: START_TIME + i * TF_SECONDS, open, high, low, close, volume: 100 });
    price = close;
  }
  return bars;
}

describe('engine/volatility: computeVolatilityContext', () => {
  it('reports UNKNOWN on insufficient bars rather than a fabricated state', () => {
    const bars = makeBars(5, () => 2);
    const ctx = computeVolatilityContext(bars);
    assert.equal(ctx.state, 'UNKNOWN');
    assert.equal(ctx.atrValue, null);
    assert.equal(ctx.atrPct, null);
    assert.equal(ctx.atrPercentile, null);
    assert.equal(ctx.ratio, null);
  });

  it('classifies steady, unchanging range as NORMAL', () => {
    const bars = makeBars(150, () => 2, { seed: 10 });
    const ctx = computeVolatilityContext(bars, RATIO_ONLY_PARAMS);
    assert.equal(ctx.state, 'NORMAL');
    assert.ok(ctx.ratio > 0.7 && ctx.ratio < 1.3, `expected ratio near 1, got ${ctx.ratio}`);
  });

  it('classifies a sustained range increase as EXPANSION (ratio-based branch)', () => {
    const bars = makeBars(150, (i) => (i < 130 ? 2 : 8), { seed: 11 });
    const ctx = computeVolatilityContext(bars, RATIO_ONLY_PARAMS);
    assert.equal(ctx.state, 'EXPANSION');
    assert.ok(ctx.ratio >= RATIO_ONLY_PARAMS.expansionRatio, `expected ratio >= ${RATIO_ONLY_PARAMS.expansionRatio}, got ${ctx.ratio}`);
  });

  it('classifies a sustained range decrease as CONTRACTION (ratio-based branch)', () => {
    const bars = makeBars(150, (i) => (i < 130 ? 8 : 1.5), { seed: 12 });
    const ctx = computeVolatilityContext(bars, RATIO_ONLY_PARAMS);
    assert.equal(ctx.state, 'CONTRACTION');
    assert.ok(ctx.ratio <= RATIO_ONLY_PARAMS.contractionRatio, `expected ratio <= ${RATIO_ONLY_PARAMS.contractionRatio}, got ${ctx.ratio}`);
  });

  it('classifies HIGH via the percentile branch when the current bar is the most volatile in its own lookback', () => {
    // Monotonically increasing range: the LAST bar's ATR is the highest
    // ever observed within its own trailing percentileLookback window.
    const bars = makeBars(220, (i) => 1 + i * 0.15, { seed: 13 });
    const ctx = computeVolatilityContext(bars); // default params (percentile branch active)
    assert.equal(ctx.atrPercentile, 100);
    assert.equal(ctx.state, 'HIGH');
  });

  it('classifies LOW via the percentile branch when the current bar is the calmest in its own lookback', () => {
    const bars = makeBars(220, (i) => 40 - i * 0.15, { seed: 14 });
    const ctx = computeVolatilityContext(bars);
    // Percentile rank is inclusive of the current value itself, so the
    // strict minimum of a 100-bar window ranks at 1/100, not 0.
    assert.equal(ctx.atrPercentile, 1);
    assert.equal(ctx.state, 'LOW');
  });

  it('no-lookahead: the state computed for a bar prefix is unaffected by wildly different data appended after it', () => {
    const base = makeBars(150, (i) => (i % 7 === 0 ? 6 : 2), { seed: 20 });
    for (const k of [90, 120]) {
      const prefix = base.slice(0, k);
      const resultA = computeVolatilityContext(prefix);

      const alteredFuture = makeBars(150, () => 50, { seed: 999, base: 5000 }).slice(k);
      const alteredFullSeries = [...prefix, ...alteredFuture];
      const resultB = computeVolatilityContext(alteredFullSeries.slice(0, k));

      assert.deepEqual(resultA, resultB, `mismatch at prefix length ${k}`);
    }
  });
});

describe('engine/volatility: distanceInAtr', () => {
  it('computes distance in ATR units', () => {
    assert.equal(distanceInAtr(10, 5, 2), 2.5);
    assert.equal(distanceInAtr(5, 10, 2), 2.5);
  });

  it('is null-safe against zero, null, undefined, and non-finite ATR', () => {
    assert.equal(distanceInAtr(10, 5, 0), null);
    assert.equal(distanceInAtr(10, 5, null), null);
    assert.equal(distanceInAtr(10, 5, undefined), null);
    assert.equal(distanceInAtr(10, 5, NaN), null);
  });
});
