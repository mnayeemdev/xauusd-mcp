/**
 * EI-1 -- Market Evidence Foundation. Proves:
 *   - regime/structure/correction are reused VERBATIM (same object
 *     reference) from an already-computed pipeline result, never
 *     independently recomputed a second/third time
 *   - the pre-EI-1 fallback (independent computation) still works
 *     byte-identically when no pipeline result is supplied (e.g.
 *     xauusd_chart_context.js's own non-entry-timeframe call site)
 *   - src/engine/marketEvidence.js is never imported/referenced by any
 *     protected trading-authority file (no feedback path exists)
 *   - computeMarketEvidence() is pure, deterministic, and direction-neutral
 *   - no forming-bar leakage: the exact same confirmed-bars array/length
 *     reaches the evidence layer, nothing appended or dropped
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeEvidence } from '../src/core/xauusd_analyze_market.js';
import { computeMarketEvidence } from '../src/engine/marketEvidence.js';
import { classifyRegime, REGIME_PARAMS } from '../src/engine/regime.js';
import { computeStructure, STRUCTURE_PARAMS } from '../src/engine/structure.js';
import { computeCorrection, CORRECTION_PARAMS } from '../src/engine/correction.js';
import { ELIGIBILITY_TABLE } from '../src/engine/strategies/eligibility.js';

const START_TIME = 1700000000;
function makeTrendBars(n, { start = 2000, drift = 0.5, tfSeconds = 900 } = {}) {
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const close = price + drift;
    bars.push({ time: START_TIME + i * tfSeconds, open: price, high: Math.max(price, close) + 0.2, low: Math.min(price, close) - 0.2, close, volume: 100 });
    price = close;
  }
  return bars;
}
function makeBearBars(n, opts = {}) { return makeTrendBars(n, { ...opts, drift: -(opts.drift ?? 0.5) }); }

const bullBars = makeTrendBars(510, { drift: 0.5 });
const bearBars = makeBearBars(510, { drift: 0.5 });
const minimalSplit = {}; // computeEvidence()'s dailyWeeklyContext degrades gracefully on missing D/W

describe('EI-1: regime/structure/correction are reused verbatim from an already-computed pipeline result', () => {
  it('when primaryPipeline is supplied, evidence.regime/structure/correction are the EXACT SAME references -- never recomputed', () => {
    const realStructure = computeStructure(bullBars, STRUCTURE_PARAMS);
    const realCorrection = computeCorrection(bullBars, realStructure.state, CORRECTION_PARAMS);
    // Deliberately WRONG regime (bullBars would never classify as COMPRESSION)
    // and a distinctively-marked correction object -- if computeEvidence()
    // silently recomputed instead of reusing, these injected, provably-wrong
    // values could never survive into its return value.
    const fakePipeline = { regime: 'COMPRESSION', structure: realStructure, correction: { ...realCorrection, reason: 'EI1-TEST-MARKER' } };

    const evidence = computeEvidence(bullBars, minimalSplit, null, fakePipeline);

    assert.equal(evidence.regime, 'COMPRESSION', 'regime must be the injected value, not independently reclassified');
    assert.equal(evidence.structure, fakePipeline.structure, 'structure must be the EXACT SAME object reference -- proof of reuse, not recomputation');
    assert.equal(evidence.correction, fakePipeline.correction, 'correction must be the EXACT SAME object reference');
    assert.equal(evidence.correction.reason, 'EI1-TEST-MARKER');
    // eligibility.js echoes regime straight through and looks it up in its
    // own table -- confirms the WRONG injected regime actually propagated
    // into a real downstream consumer, not just the top-level field.
    assert.equal(evidence.eligibility.regime, 'COMPRESSION');
    assert.deepEqual(evidence.eligibility.eligible, ELIGIBILITY_TABLE.COMPRESSION);
  });

  it('the SAME primaryPipeline structure reference flows into liquidityContext\'s premium/discount calculation (a real downstream consumer of structure.rangeHigh/rangeLow)', () => {
    // Fully controlled minimal structure fixtures (not derived from real
    // pivot detection, whose rangeHigh/rangeLow can legitimately be null
    // for a given synthetic bar series) so this test deterministically
    // exercises computeLiquidityContext()'s premium/discount branch.
    const lastClose = bullBars[bullBars.length - 1].close;
    const structureA = { state: 'BULLISH', pivots: [], lastEvent: null, lastSweep: null, lastSwingHigh: null, lastSwingLow: null, rangeHigh: lastClose + 10, rangeLow: lastClose - 10 };
    const structureB = { ...structureA, rangeHigh: lastClose + 5, rangeLow: lastClose - 995 };
    const evidenceA = computeEvidence(bullBars, minimalSplit, null, { regime: 'BULL_TREND', structure: structureA, correction: { state: 'NONE' } });
    const evidenceB = computeEvidence(bullBars, minimalSplit, null, { regime: 'BULL_TREND', structure: structureB, correction: { state: 'NONE' } });
    assert.ok(Number.isFinite(evidenceA.liquidityContext.premiumDiscount.pct));
    assert.ok(Number.isFinite(evidenceB.liquidityContext.premiumDiscount.pct));
    assert.notEqual(evidenceA.liquidityContext.premiumDiscount.pct, evidenceB.liquidityContext.premiumDiscount.pct, 'a genuinely different injected structure.rangeHigh/rangeLow must change a real downstream computation, proving it was actually used, not ignored');
  });

  it('when NO primaryPipeline is supplied (e.g. xauusd_chart_context.js\'s own non-entry-timeframe call), falls back to an independent computation byte-identical to classifyRegime()/computeStructure()/computeCorrection() called directly', () => {
    const evidence = computeEvidence(bullBars, minimalSplit, null); // 4th arg omitted entirely
    const expectedRegime = classifyRegime(bullBars, REGIME_PARAMS).regime;
    const expectedStructure = computeStructure(bullBars, STRUCTURE_PARAMS);
    const expectedCorrection = expectedRegime && expectedStructure.state ? computeCorrection(bullBars, expectedStructure.state, CORRECTION_PARAMS) : { state: 'NONE' };
    assert.equal(evidence.regime, expectedRegime);
    assert.deepEqual(evidence.structure, expectedStructure);
    assert.deepEqual(evidence.correction, expectedCorrection);
  });

  it('a primaryPipeline with structure:null (e.g. a CHOP_UNCERTAIN/TRANSITION regime, where the protected pipeline itself never computed structure) falls back to independent computation for that field only -- never crashes, never fabricates', () => {
    const evidence = computeEvidence(bullBars, minimalSplit, null, { regime: 'TRANSITION', structure: null, correction: { state: 'NONE' } });
    // regime IS reused verbatim (it was supplied); structure was null so it must have been independently computed (a real object, not null/undefined).
    assert.equal(evidence.regime, 'TRANSITION');
    assert.ok(evidence.structure && typeof evidence.structure === 'object');
  });
});

describe('EI-1: no authority feedback -- MarketEvidence is never read by protected decision logic', () => {
  const protectedFiles = [
    'src/engine/models.js', 'src/engine/risk.js', 'src/engine/quality.js',
    'src/engine/mtf.js', 'src/engine/htf.js', 'src/engine/signalStore.js',
    'src/engine/regime.js', 'src/engine/structure.js', 'src/engine/correction.js',
    'src/engine/pipeline.js', 'src/core/xauusd_calculate.js',
  ];
  for (const file of protectedFiles) {
    it(`${file} never imports/references marketEvidence.js or computeMarketEvidence`, () => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.ok(!/marketEvidence/i.test(src), `${file} must not reference marketEvidence in any form`);
    });
  }
});

describe('EI-1: computeMarketEvidence() is pure, deterministic, and direction-neutral', () => {
  it('identical inputs produce deepEqual output on repeated calls (pure, no hidden state)', () => {
    const structure = computeStructure(bullBars, STRUCTURE_PARAMS);
    const a = computeMarketEvidence({ confirmedBars: bullBars, regime: 'BULL_TREND', structure });
    const b = computeMarketEvidence({ confirmedBars: bullBars, regime: 'BULL_TREND', structure });
    assert.deepEqual(a, b);
  });

  it('produces evidence for both a bullish and a bearish bar series -- no structural favoring of either direction', () => {
    const bullStructure = computeStructure(bullBars, STRUCTURE_PARAMS);
    const bearStructure = computeStructure(bearBars, STRUCTURE_PARAMS);
    const bullEvidence = computeMarketEvidence({ confirmedBars: bullBars, regime: classifyRegime(bullBars, REGIME_PARAMS).regime, structure: bullStructure });
    const bearEvidence = computeMarketEvidence({ confirmedBars: bearBars, regime: classifyRegime(bearBars, REGIME_PARAMS).regime, structure: bearStructure });
    assert.ok(bullEvidence.eligibility && bearEvidence.eligibility);
    assert.ok(Array.isArray(bullEvidence.candlestickPatterns) && Array.isArray(bearEvidence.candlestickPatterns));
    assert.ok(Array.isArray(bullEvidence.classicalPatterns) && Array.isArray(bearEvidence.classicalPatterns));
    // Same call shape, same field set, regardless of direction.
    assert.deepEqual(Object.keys(bullEvidence).sort(), Object.keys(bearEvidence).sort());
  });
});

describe('EI-1: confirmed-bar / no-lookahead discipline preserved through the refactor', () => {
  it('the exact confirmed-bars array (same length, same last bar) reaches the evidence layer -- nothing appended or dropped by the refactor', () => {
    const structure = computeStructure(bullBars, STRUCTURE_PARAMS);
    const evidence = computeEvidence(bullBars, minimalSplit, null, { regime: 'BULL_TREND', structure, correction: { state: 'NONE' } });
    const lastBar = bullBars[bullBars.length - 1];
    assert.equal(evidence.sessionContext.current.end_time, lastBar.time, 'session context\'s last segment must end on the exact last confirmed bar the caller supplied');
    assert.equal(evidence.candlestickPatterns.every((p) => p.bar_index <= bullBars.length - 1), true, 'no candlestick pattern may reference an index beyond the supplied confirmed bars');
  });
});
