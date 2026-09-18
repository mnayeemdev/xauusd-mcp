/**
 * src/engine/levels.js -- deterministic unit tests using synthetic OHLCV
 * fixtures and structure.js's real pivot detection (pivots are never
 * hand-faked; they are produced by computeStructure() exactly as the real
 * engine would).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLevels, LEVELS_PARAMS } from '../src/engine/levels.js';
import { computeStructure } from '../src/engine/structure.js';

const START_TIME = 1700000000;
const TF_SECONDS = 900;

/**
 * n baseline bars with a strictly monotonic (tiny-slope) high/low series,
 * so the baseline itself never contains an interior local max/min --
 * findPivots() only ever reports the pivots this fixture deliberately
 * injects via `overrides[i]`, never spurious ties from a flat run (a dead
 * -flat baseline would tie-satisfy `high === max(window)` at every index).
 */
function makeBars(n, overrides = {}) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const drift = i * 0.001;
    const bar = { time: START_TIME + i * TF_SECONDS, open: 1985 + drift, close: 1985 + drift, high: 1990 + drift, low: 1980 + drift, volume: 100 };
    if (overrides[i]) Object.assign(bar, overrides[i]);
    bars.push(bar);
  }
  return bars;
}

describe('engine/levels: clustering', () => {
  it('merges two comparable-height resistance pivots into one level with touch_count 2', () => {
    const bars = makeBars(70, { 20: { high: 2050 }, 60: { high: 2051 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.filter((l) => l.type === 'resistance');
    assert.equal(resistance.length, 1, `expected exactly one clustered resistance level, got ${resistance.length}`);
    assert.equal(resistance[0].touch_count, 2);
    assert.ok(Math.abs(resistance[0].price - 2050.5) < 0.01);
  });

  it('keeps two pivots as separate levels when they are outside the cluster tolerance', () => {
    const bars = makeBars(70, { 20: { high: 2050 }, 60: { high: 2200 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.filter((l) => l.type === 'resistance');
    assert.equal(resistance.length, 2);
  });
});

describe('engine/levels: broken + role reversal', () => {
  it('marks a level broken after a later confirmed close beyond it, with the correct direction', () => {
    const bars = makeBars(80, { 20: { high: 2050 }, 60: { high: 2051 }, 70: { close: 2060 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance');
    assert.equal(resistance.broken, true);
    assert.equal(resistance.broken_direction, 'up');
  });

  it('detects role reversal when a broken resistance later holds as support on retest', () => {
    const bars = makeBars(85, {
      20: { high: 2050 }, 60: { high: 2051 },
      70: { close: 2060 }, // breaks resistance ~2050.5 upward
      75: { low: 2049.5, close: 2052 }, // dips back to the level and holds above it
    });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance');
    assert.equal(resistance.broken, true);
    assert.equal(resistance.role_reversed, true);
  });

  it('does not report role reversal when a broken level is never retested', () => {
    const bars = makeBars(80, { 20: { high: 2050 }, 60: { high: 2051 }, 70: { close: 2060 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance');
    assert.equal(resistance.role_reversed, false);
  });
});

describe('engine/levels: freshness', () => {
  it('is fresh when formed recently and never retested', () => {
    const bars = makeBars(40, { 25: { high: 2050 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance');
    assert.equal(resistance.fresh, true);
  });

  it('is not fresh once older than the freshness lookback window', () => {
    const bars = makeBars(40, { 5: { high: 2050 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance');
    assert.equal(40 - 1 - 5 > LEVELS_PARAMS.freshnessLookbackBars, true, 'fixture sanity check');
    assert.equal(resistance.fresh, false);
  });

  it('is not fresh once retested, even within the lookback window', () => {
    const bars = makeBars(40, { 20: { high: 2050 }, 35: { high: 2049 } });
    const structure = computeStructure(bars);
    const { levels } = buildLevels(bars, structure);
    const resistance = levels.find((l) => l.type === 'resistance' && Math.abs(l.price - 2050) < 1);
    assert.ok(resistance, 'expected a resistance level near 2050');
    assert.equal(resistance.fresh, false);
  });
});

describe('engine/levels: nearest support/resistance', () => {
  it('identifies the nearest level above and below the current price', () => {
    const bars = makeBars(75, { 20: { high: 2050 }, 60: { high: 2051 }, 30: { low: 1950 }, 65: { low: 1951 } });
    const structure = computeStructure(bars);
    const { nearestResistance, nearestSupport } = buildLevels(bars, structure);
    assert.ok(nearestResistance, 'expected a resistance level above current price');
    assert.ok(nearestSupport, 'expected a support level below current price');
    assert.ok(Math.abs(nearestResistance.price - 2050.5) < 0.5);
    assert.ok(Math.abs(nearestSupport.price - 1950.5) < 0.5);
  });

  it('returns null when no level exists on one side of the current price', () => {
    const bars = makeBars(40, { 20: { high: 2050 } });
    const structure = computeStructure(bars);
    const { nearestSupport } = buildLevels(bars, structure);
    assert.equal(nearestSupport, null);
  });
});

describe('engine/levels: supply/demand zones', () => {
  // A tight, low-range baseline (distinct from the pivot-testing makeBars
  // above) so ATR(14) stays small and the displacement candles below
  // clearly clear the displacementAtrMult threshold.
  function calmBars(n) {
    return Array.from({ length: n }, (_, i) => ({
      time: START_TIME + i * TF_SECONDS, open: 2000, close: 2000, high: 2000.5, low: 1999.5, volume: 100,
    }));
  }

  it('classifies a fresh displacement zone as FRESH when never revisited', () => {
    const bars = [
      ...calmBars(20),
      { time: START_TIME + 20 * TF_SECONDS, open: 2000, close: 2015, high: 2015.2, low: 1999.8, volume: 100 },
      ...Array.from({ length: 10 }, (_, k) => ({ time: START_TIME + (21 + k) * TF_SECONDS, open: 2015, close: 2020, high: 2021, low: 2010, volume: 100 })),
    ];
    const { supplyDemandZones } = buildLevels(bars, computeStructure(bars));
    const zone = supplyDemandZones.find((z) => z.origin_bar_index === 20);
    assert.ok(zone, 'expected a demand zone at the displacement candle');
    assert.equal(zone.direction, 'demand');
    assert.equal(zone.state, 'FRESH');
  });

  it('classifies a zone as MITIGATED when price returns into it without closing through the far boundary', () => {
    const bars = [
      ...calmBars(20),
      { time: START_TIME + 20 * TF_SECONDS, open: 2000, close: 2015, high: 2015.2, low: 1999.8, volume: 100 },
      { time: START_TIME + 21 * TF_SECONDS, open: 2015, close: 2005, high: 2015, low: 1999, volume: 100 },
    ];
    const { supplyDemandZones } = buildLevels(bars, computeStructure(bars));
    const zone = supplyDemandZones.find((z) => z.origin_bar_index === 20);
    assert.equal(zone.state, 'MITIGATED');
  });

  it('classifies a zone as INVALIDATED when a later close breaches the far boundary', () => {
    const bars = [
      ...calmBars(20),
      { time: START_TIME + 20 * TF_SECONDS, open: 2000, close: 2015, high: 2015.2, low: 1999.8, volume: 100 },
      { time: START_TIME + 21 * TF_SECONDS, open: 2005, close: 1995, high: 2005, low: 1994, volume: 100 },
    ];
    const { supplyDemandZones } = buildLevels(bars, computeStructure(bars));
    const zone = supplyDemandZones.find((z) => z.origin_bar_index === 20);
    assert.equal(zone.state, 'INVALIDATED');
  });
});

describe('engine/levels: malformed/insufficient data', () => {
  it('does not throw on an empty bars array', () => {
    assert.doesNotThrow(() => buildLevels([], { pivots: [] }));
    const result = buildLevels([], { pivots: [] });
    assert.deepEqual(result, { levels: [], nearestResistance: null, nearestSupport: null, supplyDemandZones: [] });
  });

  it('does not throw on a single bar', () => {
    const bars = makeBars(1);
    assert.doesNotThrow(() => buildLevels(bars, computeStructure(bars)));
  });

  it('does not throw when structure has no pivots', () => {
    const bars = makeBars(30);
    const structure = computeStructure(bars);
    assert.doesNotThrow(() => buildLevels(bars, structure));
  });
});

describe('engine/levels: no-lookahead', () => {
  it('the registry computed for a bar prefix is unaffected by wildly different data appended after it', () => {
    const base = makeBars(150, { 20: { high: 2050 }, 60: { high: 2051 }, 100: { low: 1950 }, 130: { low: 1951 } });
    for (const k of [90, 140]) {
      const prefixA = base.slice(0, k);
      const resultA = buildLevels(prefixA, computeStructure(prefixA));

      const alteredFuture = makeBars(150, { 5: { high: 9999 }, 10: { low: -9999 } }).slice(k);
      const prefixB = [...base.slice(0, k), ...alteredFuture].slice(0, k);
      const resultB = buildLevels(prefixB, computeStructure(prefixB));

      assert.deepEqual(resultA, resultB, `mismatch at prefix length ${k}`);
    }
  });
});
