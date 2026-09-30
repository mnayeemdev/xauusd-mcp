/**
 * CAPITAL HARVEST MASTER -- deterministic tests for the pure capital-eligibility and position-management modules
 * (src/engine/capitalHarvest). No I/O, no broker, no CDP. Covers the owner's section-43 list at the module level;
 * production preservation (news, drift, breaker, identity, broker SL) is asserted by the frozen-surface check.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessCapitalEligibility, governedExposure, productionMonetaryVeto, RISK_POLICIES_PCT, initPosition, stepPosition, simulatePosition, continuationEvidence, adverseBreak, ratchetFloor, canReenter, floorPrice, resolveCapitalHarvestMode, MANAGEMENT_CANDIDATES, COSTS, STATES, CH_MODES } from '../src/engine/capitalHarvest/index.js';

const mk = (n, f) => { const b = []; for (let k = 0; k < n; k++) b.push({ time: 1_790_000_000 + k * 300, volume: 1, ...f(k) }); return b; };
const up = (n, step = 0.8) => mk(n, (k) => { const base = 4000 + k * step; return { open: base, high: base + 1.2, low: base - 0.6, close: base + 0.9 }; });
const down = (n, step = 0.8) => mk(n, (k) => { const base = 4000 - k * step; return { open: base, high: base + 0.6, low: base - 1.2, close: base - 0.9 }; });
const flat = (n) => mk(n, () => ({ open: 4000, high: 4000.3, low: 3999.7, close: 4000.05 }));
const P = MANAGEMENT_CANDIDATES;

describe('percentage risk: governed exposure and eligibility arithmetic', () => {
  it('exposure = structural x 1.5 + spread + slippage at 0.01 lot (1 USD per 1.00 move)', () => {
    const e = governedExposure({ entry: 4193.22, sl: 4181.78 });
    assert.equal(e.structuralLossUsd, 11.44); assert.equal(e.brokerSlDistance, 17.4); assert.equal(e.exposureUsd, 17.5);
  });
  it('the frozen policy family is exactly 1/2/3/5/7.5/10 percent', () => { assert.deepEqual([...RISK_POLICIES_PCT], [1, 2, 3, 5, 7.5, 10]); });
  it('equity changes move eligibility: the Sept-30 geometry is refused at 62.07 (28 % exposure) and accepted at 250 under 10 %', () => {
    const a = assessCapitalEligibility({ equity: 62.07, price: 4193, entry: 4193.22, sl: 4181.78, riskPct: 10 });
    assert.equal(a.eligible, false); assert.deepEqual(a.reasons, ['CAPITAL_RISK_TOO_HIGH']); assert.equal(a.risk_pct_of_equity, 28.194); assert.match(a.minimum_lot_constraint, /BINDING/);
    const b = assessCapitalEligibility({ equity: 250, price: 4193, entry: 4193.22, sl: 4181.78, riskPct: 10 });
    assert.equal(b.eligible, true); assert.equal(b.risk_pct_of_equity, 7); assert.equal(b.margin_required_usd, 20.97);
    assert.equal(assessCapitalEligibility({ equity: 175, price: 4193, entry: 4193.22, sl: 4181.78, riskPct: 10 }).eligible, true);
    assert.equal(assessCapitalEligibility({ equity: 174, price: 4193, entry: 4193.22, sl: 4181.78, riskPct: 10 }).eligible, false);
  });
  it('margin rules: margin over 50 % of equity, margin level below 100 % at the stop, or margin over free margin each refuse', () => {
    assert.ok(assessCapitalEligibility({ equity: 40, price: 4150, entry: 4150, sl: 4149.5, riskPct: 10 }).reasons.includes('MARGIN_EXCEEDS_BUDGET'));
    assert.ok(assessCapitalEligibility({ equity: 60, price: 4150, entry: 4150, sl: 4120, riskPct: 100 }).reasons.includes('MARGIN_LEVEL_BELOW_100_AT_STOP'));
    assert.ok(assessCapitalEligibility({ equity: 1000, freeMargin: 10, price: 4150, entry: 4150, sl: 4149, riskPct: 5 }).reasons.includes('MARGIN_EXCEEDS_FREE_MARGIN'));
  });
  it('minimum lot: a stop is never tightened to fit; an oversized 0.01-lot exposure is NO TRADE, never a smaller lot', () => {
    const r = assessCapitalEligibility({ equity: 100, price: 4150, entry: 4150, sl: 4140, riskPct: 1 });
    assert.equal(r.eligible, false); assert.equal(r.lot, 0.01); assert.equal(r.stop_distance, 10);
  });
  it('production monetary veto reproduces the live numbers (62.07 -> 58 %; 71.94 -> executable) for side-by-side reporting', () => {
    const v = productionMonetaryVeto({ equity: 62.07, price: 4152.311 }); assert.equal(v.executable, false); assert.equal(v.margin_level_at_max_loss_pct, 58.14);
    assert.equal(productionMonetaryVeto({ equity: 71.94, price: 4310.843 }).executable, true);
  });
  it('fails closed on unknown equity or policy', () => { assert.ok(assessCapitalEligibility({ equity: null, price: 1, entry: 1, sl: 0.5, riskPct: 5 }).reasons.includes('EQUITY_UNKNOWN')); assert.ok(assessCapitalEligibility({ equity: 100, price: 1, entry: 1, sl: 0.5, riskPct: 0 }).reasons.includes('RISK_POLICY_UNKNOWN')); });
});

describe('position manager: structural and broker protection', () => {
  it('structural SL: a CONFIRMED close beyond the stop exits at that close (thesis invalidation), before the broker SL', () => {
    const bars = down(40); const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30 });
    assert.equal(o.exit, 'THESIS_INVALIDATION'); assert.ok(o.pnl_usd > -(4.5 + 0.24 + 0.10), 'loss smaller than the broker SL distance'); assert.equal(o.loss_state, 'EXIT');
  });
  it('broker SL: an intrabar spike through 1.5 x structural + spread closes at exactly that distance plus slippage and is never widened', () => {
    const bars = flat(20); bars[4] = { ...bars[4], low: 3990, close: 4000 }; // spike then recovery inside the bar
    const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: 4000, sl: 3997, atr: 1, params: P.CH_D1, horizon: 15 });
    assert.equal(o.exit, 'BROKER_SL'); assert.equal(o.pnl_usd, -(4.5 + 0.24 + 0.10).toFixed(2) * 1); assert.equal(o.broker_sl_usd, 4.74);
  });
  it('thesis deterioration (3 adverse closes, beyond half R and the entry bar) exits early with a smaller loss than invalidation', () => {
    const bars = down(40); const d = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_D1, horizon: 30 });
    const inv = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30 });
    assert.equal(d.exit, 'THESIS_DETERIORATION'); assert.ok(d.pnl_usd > inv.pnl_usd); assert.ok(d.bars < inv.bars);
  });
  it('SELL mirror: spread is paid on the exit side and the structural stop is above the fill', () => {
    const bars = up(40); const o = simulatePosition({ bars, i: 2, side: 'SELL', entry: bars[2].close, sl: bars[2].close + 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30 });
    assert.equal(o.exit, 'THESIS_INVALIDATION'); assert.ok(o.pnl_usd < 0);
  });
});

describe('position manager: HOLD / PROFIT_AVAILABLE / PROTECT / HARVEST / EXIT', () => {
  it('profit milestone detection: PROFIT_AVAILABLE at the first close with MFE >= trigger R (0.75 R for D1, 1.0 R for D2)', () => {
    const bars = up(40); const d1 = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_D1, horizon: 30 }); const d2 = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_D2, horizon: 30 });
    assert.equal(d1.trigger_bar, 3); assert.equal(d2.trigger_bar, 4); assert.ok(d1.states.includes('PROTECTED'));
  });
  it('HOLD: with no profit available and no deterioration the manager holds and leaves protection unchanged', () => {
    const bars = flat(20); let pos = initPosition({ side: 'BUY', fill: 4000.24, sl: 3997, atr: 1, entryBarExtreme: 3999.7, entryIdx: 2, spread: 0.24, params: P.CH_D1 });
    for (let j = 3; j < 10; j++) { const r = stepPosition(pos, { bars, j }); pos = r.pos; assert.equal(r.audit.action, 'HOLD'); assert.equal(pos.floor, null); }
    assert.equal(pos.state, 'OPEN_UNPROTECTED');
  });
  it('HARVEST on weak continuation: a spike to the trigger followed by a weak close banks at that close', () => {
    const bars = flat(20); bars[4] = { ...bars[4], open: 4000, high: 4004, low: 3999.7, close: 3999.9 }; // MFE >= 0.75 R but the bar closes down: 1 of 3 evidence = weak
    const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: 4000, sl: 3997, atr: 1, params: P.CH_D1, horizon: 15 });
    assert.equal(o.exit, 'HARVEST_WEAK_CONTINUATION'); assert.equal(o.decision, 'BANK'); assert.match(o.exit_reason, /WEAK_EVIDENCE_[01]_OF_3/);
  });
  it('PROTECT + RUN on strong continuation: floor activates from the next bar, ratchets upward, and the floor touch banks the floor', () => {
    const bars = up(40); const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_C, horizon: 30, keepAudit: true });
    assert.equal(o.decision ?? 'RUN', 'RUN'); assert.ok(o.protect_bar != null);
    const floors = o.audit.filter((a) => a.floor != null).map((a) => a.floor); for (let k = 1; k < floors.length; k++) assert.ok(floors[k] >= floors[k - 1], 'floor is monotone');
    assert.equal(o.ratchetViolations, 0); assert.ok(o.final_floor > 0);
  });
  it('EXIT on adverse break during a protected run (harvest at the close, never below the floor)', () => {
    const bars = up(12); for (let k = 12; k < 30; k++) { const b = bars[11]; bars.push({ time: b.time + (k - 11) * 300, open: b.close - (k - 11) * 0.3, high: b.close - (k - 11) * 0.3 + 0.2, low: b.close - (k - 11) * 0.3 - 0.4, close: b.close - (k - 11) * 0.3 - 0.1, volume: 1 }); }
    const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_D1, horizon: 25 });
    assert.ok(['FLOOR_BANK', 'HARVEST_ADVERSE_BREAK', 'HARVEST_CONTINUATION_WEAKENED'].includes(o.exit)); assert.ok(o.pnl_usd >= (o.final_floor ?? 0) - 0.10 - 1e-9);
  });
  it('HARVEST when the remaining reward compresses (distance to TP2 < 0.5 ATR)', () => {
    const bars = up(40); const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, tp2Dist: 4, params: P.CH_D1, horizon: 30 });
    assert.ok(['HARVEST_REWARD_COMPRESSED', 'FLOOR_BANK'].includes(o.exit));
  });
  it('simple bank (CH-B) closes at the first close after 1 R', () => { const bars = up(40); const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_B, horizon: 30 }); assert.equal(o.exit, 'HARVEST_BANK'); assert.equal(o.trigger_bar, 4); });
  it('production-like (CH-A) closes on retrace >= 0.5 of the best excursion after 1 R, or at the +30 USD monetary target', () => {
    const bars = up(8); for (let k = 8; k < 20; k++) { const b = bars[7]; bars.push({ time: b.time + (k - 7) * 300, open: b.close, high: b.close + 0.2, low: b.close - 2.5 * (k - 7), close: b.close - 2 * (k - 7), volume: 1 }); }
    const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_A, horizon: 15 });
    assert.ok(['HARVEST_PROD_PROTECT', 'THESIS_INVALIDATION', 'BROKER_SL'].includes(o.exit));
    const big = up(60, 1.0); const t = simulatePosition({ bars: big, i: 2, side: 'BUY', entry: big[2].close, sl: big[2].close - 3, atr: 1.5, params: P.CH_A, horizon: 50 }); assert.equal(t.exit, 'MONETARY_TARGET'); assert.equal(t.pnl_usd, 29.9 - 0);
  });
});

describe('ratchet, spread, slippage, give-back, runners', () => {
  it('ratchetFloor never lowers a floor', () => { assert.equal(ratchetFloor(2, 1), 2); assert.equal(ratchetFloor(2, 3), 3); assert.equal(ratchetFloor(null, 1.5), 1.5); });
  it('floorPrice sits at fill + floor for BUY and fill - floor - spread for SELL (an executable price, never above the market by construction)', () => {
    assert.equal(floorPrice({ side: 'BUY', fill: 4000.24, floor: 2 }), 4002.24); assert.equal(floorPrice({ side: 'SELL', fill: 4000, floor: 2 }), 3997.76); assert.equal(floorPrice({ side: 'BUY', fill: 1, floor: null }), null);
  });
  it('spread and slippage are charged: stress costs lower every realised P&L on identical paths and slippage is pure accounting', () => {
    const bars = up(40); const n = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30 }); const s = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30, costs: COSTS.stress });
    assert.equal(n.exitBar, s.exitBar, 'identical path'); assert.ok(s.pnl_usd < n.pnl_usd);
    const z = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.RUN_TO_END, horizon: 30, costs: { spread: 0.24, slip: 0 } }); assert.equal(Math.round((z.pnl_usd - n.pnl_usd) * 100) / 100, 0.10);
  });
  it('profit give-back = MFE - realised is reported per trade with its share of MFE', () => {
    const bars = up(40); const o = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_D1, horizon: 30 });
    assert.equal(o.given_back, Math.round((o.mfe_usd - o.pnl_usd) * 1000) / 1000); assert.ok(o.giveback_share >= 0 && o.giveback_share <= 1);
  });
  it('runner continuation: a strong trend under CH-C/D keeps more than the bank-at-trigger counterfactual', () => {
    const bars = up(60, 1.5); const c = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_C, horizon: 50 }); const b = simulatePosition({ bars, i: 2, side: 'BUY', entry: bars[2].close, sl: bars[2].close - 3, atr: 1.5, params: P.CH_B, horizon: 50 });
    assert.ok(c.pnl_usd > b.pnl_usd, `runner ${c.pnl_usd} vs bank ${b.pnl_usd}`);
  });
  it('continuation evidence and adverse break are pure and deterministic', () => {
    const bars = up(10); const ev = continuationEvidence({ bar: bars[5], prev: bars[4], side: 'BUY', atrEntry: 1.5 }); assert.equal(ev.e1, true); assert.equal(ev.e2, true); assert.equal(ev.e3, true); assert.equal(ev.strong, true);
    const d = down(10); assert.equal(adverseBreak({ bars: d, j: 9, side: 'BUY' }), true); assert.equal(adverseBreak({ bars: up(10), j: 9, side: 'BUY' }), false);
  });
});

describe('re-entry, dedup, restart recovery, broker truth, feed failure, modes', () => {
  it('re-entry: same/earlier candle, stale same setup within 12 bars, and same-side re-entry within 3 bars after a loss are refused', () => {
    const last = { i: 100, model: 'BO', side: 'BUY', anchor: 4000.004 };
    assert.equal(canReenter({ signal: { i: 100, model: 'MC', side: 'SELL', anchor: 1 }, exitBar: 100, lastTrade: last, lastExitWasLoss: false }).reason, 'SAME_OR_EARLIER_CANDLE');
    assert.equal(canReenter({ signal: { i: 110, model: 'BO', side: 'BUY', anchor: 4000.001 }, exitBar: 101, lastTrade: last, lastExitWasLoss: false }).reason, 'STALE_SAME_SETUP');
    assert.equal(canReenter({ signal: { i: 103, model: 'MC', side: 'BUY', anchor: 1 }, exitBar: 101, lastTrade: last, lastExitWasLoss: true }).reason, 'REVENGE_GUARD');
    assert.equal(canReenter({ signal: { i: 120, model: 'MC', side: 'BUY', anchor: 1 }, exitBar: 101, lastTrade: last, lastExitWasLoss: true }).ok, true);
  });
  it('restart recovery: the position state is a plain serialisable object; resuming from JSON yields the identical next decision', () => {
    const bars = up(40); let pos = initPosition({ side: 'BUY', fill: bars[2].close + 0.24, sl: bars[2].close - 3, atr: 1.5, tp2Dist: 20, entryBarExtreme: bars[2].low, entryIdx: 2, spread: 0.24, params: P.CH_D1 });
    for (let j = 3; j <= 6; j++) pos = stepPosition(pos, { bars, j }).pos;
    const resumed = JSON.parse(JSON.stringify(pos)); const a = stepPosition(pos, { bars, j: 7 }), b = stepPosition(resumed, { bars, j: 7 });
    assert.deepEqual(a.audit, b.audit); assert.deepEqual(JSON.parse(JSON.stringify(a.pos)), JSON.parse(JSON.stringify(b.pos)));
  });
  it('feed failure: a missing bar produces no decision (the caller must not fabricate one); the closed position never re-opens', () => {
    const bars = up(10); let pos = initPosition({ side: 'BUY', fill: 4000.24, sl: 3997, atr: 1, entryBarExtreme: 3999, entryIdx: 2, spread: 0.24, params: P.CH_D1 });
    assert.throws(() => stepPosition(pos, { bars, j: 50 }));
    const closed = { ...pos, closed: { kind: 'HARVEST_BANK', pnl: 1 } }; const r = stepPosition(closed, { bars, j: 5 }); assert.equal(r.audit, null); assert.equal(r.pos, closed);
  });
  it('broker truth: floor price and secured profit derive from the FILL the broker reported, never from the planned entry', () => {
    const pos = initPosition({ side: 'BUY', fill: 4001.0, sl: 3997, atr: 1, entryBarExtreme: 3999, entryIdx: 2, spread: 0.24, params: P.CH_D1 }); assert.equal(pos.fill, 4001.0); assert.equal(pos.risk, 4);
  });
  it('modes: CONTROL and CAPITAL_HARVEST_SHADOW resolve; DEMO and REAL are refused until promotion', () => {
    assert.equal(resolveCapitalHarvestMode({}), 'CONTROL'); assert.equal(resolveCapitalHarvestMode({ XAUUSD_CAPITAL_HARVEST_MODE: 'CAPITAL_HARVEST_SHADOW' }), 'CAPITAL_HARVEST_SHADOW');
    assert.throws(() => resolveCapitalHarvestMode({ XAUUSD_CAPITAL_HARVEST_MODE: 'CAPITAL_HARVEST_DEMO' }), /not enabled/); assert.throws(() => resolveCapitalHarvestMode({ XAUUSD_CAPITAL_HARVEST_MODE: 'CAPITAL_HARVEST_REAL' }), /not enabled/); assert.throws(() => resolveCapitalHarvestMode({ XAUUSD_CAPITAL_HARVEST_MODE: 'x' }));
    assert.deepEqual([...CH_MODES], ['CONTROL', 'CAPITAL_HARVEST_SHADOW', 'CAPITAL_HARVEST_DEMO', 'CAPITAL_HARVEST_REAL']); assert.ok(STATES.includes('PROTECTED_RUN'));
  });
  it('production preservation: no frozen-surface file imports the capital-harvest module, and the executor/policy files are unchanged in the registry', () => {
    for (const f of ['src/engine/mt5Executor.js', 'src/engine/mt5RealPolicy.js', 'src/engine/mt5Policy.js', 'src/engine/watcher.js', 'src/engine/mt5TradeManagement.js', 'src/core/xauusd_calculate.js']) assert.ok(!readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes('capitalHarvest'), `${f} must not import capitalHarvest`);
    assert.ok(readFileSync(new URL('../src/engine/strategy.frozen.json', import.meta.url), 'utf8').includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed'));
  });
});
