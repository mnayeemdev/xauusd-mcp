/**
 * Dynamic capital scaling (src/engine/mt5RealScaling.js) and its wiring into
 * the REAL policy (src/engine/mt5RealPolicy.js). Pure, no I/O.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDynamicSizing, riskTierForEquity, priceEnvelope, floorToStep, resolveScalingParams, SCALING_PARAMS } from '../src/engine/mt5RealScaling.js';
import { resolveRealExecutorConfig, REAL_ABSOLUTE_LOT_CEILING } from '../src/engine/mt5RealPolicy.js';

const BROKER = { price: 4274.36, contractSize: 100, leverage: 200, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, spreadUsd: 0.24, marginCallLevelPct: 60, stopOutLevelPct: 0 };
const size = (equity, over = {}) => computeDynamicSizing({ equity, freeMargin: equity, ...BROKER, ...over });

describe('dynamic scaling: baseline calibration (~100 USD)', () => {
  it('the fixed price envelope is 25 USD loss / 15 USD target (from +30/-50 at lot 0.02)', () => {
    assert.deepEqual(priceEnvelope(100), { loss_distance_usd: 25, target_distance_usd: 15 });
  });
  it('at exactly 100 USD equity: lot 0.02, +30 / -50 (the live stage-1 envelope preserved)', () => {
    const s = size(100);
    assert.equal(s.approved, true);
    assert.equal(s.lot, 0.02); assert.equal(s.profitTargetUsd, 30); assert.equal(s.maximumLossUsd, -50);
    assert.equal(s.tier.loss_pct_of_equity, 0.5);
    assert.equal(s.requiredMarginUsd, 42.74); assert.ok(Math.abs(s.projectedMarginLevelAtMaxLossPct - 117) < 0.2, String(s.projectedMarginLevelAtMaxLossPct));
  });
  it('at the live equity 121.94 the same 0.02 / +30 / -50 is approved (raw 0.022 floors to 0.02)', () => {
    const s = size(121.94);
    assert.equal(s.lot, 0.02); assert.equal(s.profitTargetUsd, 30); assert.equal(s.maximumLossUsd, -50);
    assert.equal(s.raw_lot, 0.0221);
  });
});

describe('dynamic scaling: growth scales up sub-linearly, decline scales down, never martingale', () => {
  it('equity growth: 500 -> 0.04, 1000 -> 0.06, 5000 -> 0.14, 10000 -> 0.20, 100000 -> 0.80 (2% floor)', () => {
    const rows = [500, 1000, 5000, 10000, 100000].map((e) => [e, size(e)]);
    assert.deepEqual(rows.map(([e, s]) => [e, s.lot, s.profitTargetUsd, s.maximumLossUsd]), [
      [500, 0.04, 60, -100], [1000, 0.06, 90, -150], [5000, 0.14, 210, -350], [10000, 0.2, 300, -500], [100000, 0.8, 1200, -2000],
    ]);
    // risk % of equity strictly falls with equity until the floor
    assert.ok(riskTierForEquity(500).loss_pct_of_equity < riskTierForEquity(100).loss_pct_of_equity);
    assert.ok(riskTierForEquity(10000).loss_pct_of_equity < riskTierForEquity(1000).loss_pct_of_equity);
    assert.equal(riskTierForEquity(100000).loss_pct_of_equity, SCALING_PARAMS.minLossPctOfEquity);
    for (const [, s] of rows) assert.equal(s.approved, true);
  });
  it('equity decline: 71.94 (after one -50) -> 0.01 / +15 / -25; 50 -> 0.01; 40 -> refuse (below broker minimum)', () => {
    const a = size(71.94); assert.equal(a.lot, 0.01); assert.equal(a.maximumLossUsd, -25); assert.equal(a.profitTargetUsd, 15);
    const b = size(50); assert.equal(b.approved, true); assert.equal(b.lot, 0.01); assert.equal(b.maximumLossUsd, -25);
    const c = size(40); assert.equal(c.approved, false); assert.equal(c.reason, 'LOT_BELOW_BROKER_MIN');
  });
  it('lot is non-decreasing in equity (no size increase after a loss, by construction)', () => {
    let prev = 0;
    for (let e = 40; e <= 200000; e = Math.round(e * 1.07)) {
      const s = size(e); const lot = s.approved ? s.lot : 0;
      assert.ok(lot >= prev - 1e-9, `equity ${e}: lot ${lot} < previous ${prev}`);
      prev = lot;
    }
    const before = size(100).lot, afterLoss = size(50).lot;
    assert.ok(afterLoss < before);
  });
  it('the -maxLoss never exceeds the tier percentage of CURRENT equity', () => {
    for (const e of [60, 100, 250, 1000, 25000]) { const s = size(e); assert.ok(Math.abs(s.maximumLossUsd) <= e * riskTierForEquity(e).loss_pct_of_equity + 1e-6); }
  });
});

describe('dynamic scaling: broker safety has final authority', () => {
  it('rounds DOWN to the broker volume step, never up', () => {
    assert.equal(floorToStep(0.0221, 0.01), 0.02); assert.equal(floorToStep(0.0299, 0.01), 0.02); assert.equal(floorToStep(0.13, 0.05), 0.1);
    assert.equal(size(1000, { volumeStep: 0.05 }).lot, 0.05, 'raw 0.063 with step 0.05 -> 0.05');
  });
  it('insufficient free margin steps the lot down, and refuses when even the minimum lot cannot be margined', () => {
    const s = size(10000, { freeMargin: 300 }); // 0.20 needs 427; 0.14 needs 299
    assert.equal(s.approved, true); assert.ok(s.lot < 0.2); assert.ok(s.requiredMarginUsd <= 300); assert.ok(s.step_downs > 0);
    const r = size(10000, { freeMargin: 5 });
    assert.equal(r.approved, false); assert.equal(r.reason, 'SIZING_UNSAFE'); assert.ok(r.failed_checks.includes('margin_within_free_margin'));
  });
  it('margin-call protection: low leverage steps the lot down until the projected margin level clears margin call + buffer', () => {
    const s = size(100, { leverage: 100 }); // 0.02 -> margin 85, level at -50 = 59% < 70 -> step to 0.01 (margin 42.7, level 176%)
    assert.equal(s.lot, 0.01); assert.equal(s.maximumLossUsd, -25); assert.ok(s.projectedMarginLevelAtMaxLossPct >= 70); assert.equal(s.step_downs, 1);
    const t = size(100, { leverage: 20 }); // even 0.01 needs 213 > equity
    assert.equal(t.approved, false);
  });
  it('an extreme lot is impossible: absolute ceiling, config cap and broker max all bound the lot', () => {
    const big = size(50_000_000);
    assert.equal(big.lot, SCALING_PARAMS.absoluteLotCeiling); assert.equal(big.ceiling_applied, 'ABSOLUTE_CEILING');
    const capped = size(10000, { lotCap: 0.05 });
    assert.equal(capped.lot, 0.05); assert.equal(capped.ceiling_applied, 'CONFIG_LOT_CAP');
    const broker = size(10000, { volumeMax: 0.1 });
    assert.equal(broker.lot, 0.1);
    assert.ok(size(1e12).lot <= 1.0);
  });
  it('invalid inputs never size a trade', () => {
    assert.equal(computeDynamicSizing({ equity: NaN, freeMargin: 1, price: 1, leverage: 1 }).approved, false);
    assert.equal(computeDynamicSizing({ equity: 100, freeMargin: 100, price: 0, leverage: 200 }).approved, false);
    assert.equal(computeDynamicSizing({ equity: 100, freeMargin: 100, price: 4000, leverage: 0 }).approved, false);
  });
  it('spread guard: the loss distance must be at least 4 spreads', () => {
    const s = size(100, { spreadUsd: 7 });
    assert.equal(s.approved, false); assert.ok(s.failed_checks.includes('loss_distance_vs_spread'));
  });
});

describe('dynamic scaling: NOT wired into the REAL profile (lot is user-fixed)', () => {
  it('the REAL config carries no computeSizing, is fixed_user_lot at 0.01, and the pure scaling module stays reporting-only', () => {
    const c = resolveRealExecutorConfig({});
    assert.equal(c.sizingMode, 'fixed_user_lot'); assert.equal(c.computeSizing, undefined);
    assert.equal(c.lotSize, 0.01); assert.equal(c.maxLotSize, 0.01); assert.equal(c.exactLot, 0.01);
    assert.equal(REAL_ABSOLUTE_LOT_CEILING, 0.01);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_LOT_CAP: '0.05' }), /user-locked to exactly 0.01/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_MAX_LOSS_PCT_OF_EQUITY: '0.25' }), /not permitted/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING: '0.5' }), /not permitted/);
    assert.equal(resolveScalingParams({}).absoluteLotCeiling, SCALING_PARAMS.absoluteLotCeiling, 'pure module untouched');
  });
});
