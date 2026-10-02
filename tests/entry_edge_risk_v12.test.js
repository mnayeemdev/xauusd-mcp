/**
 * V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING (2026-10-02) -- deterministic tests (RESEARCH ONLY; no order code).
 * Entry preservation and the risk firewall; valid entry + risk rejection; pattern / setup / trigger / direction / location / SL /
 * RR attribution (incl. the SR bias-support rule); no-lookahead; holdout isolation; swap / slippage / gap exposure; closure
 * reachability; minimum-lot rejection and actual-risk recalculation under the envelope; restart; duplicates; fail-closed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, stageOf, stagesReached, triggerValid, attributeLoss, outcomeLabel, timingFeatures, probe, mirror, dayBlockCI, summarizeR } from '../research/entry_edge_risk_v12/scripts/isolation.mjs';
import { calendarNights, nightsPossible, closureReachable, gapType, gapThroughOz, envelopeExtraOz, worstPlausibleOz, realizedPnlOz, maxSwapLongUsd, BASE_SLIP, SLIPPAGE_BUFFER } from '../research/entry_edge_risk_v12/scripts/envelope.mjs';
import { entryFromRow, entryHash, integrateEntry } from '../research/entry_risk_integration_v11/scripts/integrate.mjs';
import { initState, serialize, deserialize } from '../research/risk_capital_v10/scripts/risk.mjs';
import { features } from '../research/capital_harvest_v9/scripts/harvest.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V12 = join(ROOT, 'research', 'entry_edge_risk_v12');
const SPEC = Object.freeze({ symbol: 'XAUUSDm', contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, point: 0.001, digits: 3, stops_level_points: 0, freeze_level_points: 0, leverage: 200, margin_call_pct: 60, currency_profit: 'USD', account_currency: 'USD', platform_tick_value: null });
const T0 = Date.UTC(2026, 0, 6, 9) / 1000;
// stage strings: one digit per model in the order MC PB BO SR MR
const row = (over = {}) => ({ i: 1000, t: T0, act: 'BUY', mdl: 'BO', cs: 'BUY', anc: 3998, org: 997, trig: 'BOB', b15: 'BULLISH', gap: 0, stB: '00300', stS: '00000', ev5: ['BOS', 'B', 995, 3998], g: { e: 4000, sl: 3995, tp1: 4005, tp2: 4010, rr: 2, ra: 1.0 }, ...over });
const ent = (r) => entryFromRow(r);
const cfgPct = (r, slip = BASE_SLIP) => ({ model: 'PCT', riskPct: r, marginCapPct: 0.5, dailyLimitPct: null, pauseAfter: null, weeklyLimitPct: null, slipAllowance: slip });
const ctx = (over = {}) => ({ equity: 10000, spread: 0.24, quoteAgeSec: 0, signalAgeSec: 0, nowT: T0 + 300, spec: SPEC, cfg: cfgPct(0.005), ...over });
const bars = (n, t0 = T0, step = 300, px = 100) => Array.from({ length: n }, (_, k) => ({ time: t0 + step * k, open: px, high: px + 0.2, low: px - 0.2, close: px + Math.sin(k) * 0.05 }));

describe('stage decoding, funnel and attribution', () => {
  it('stage strings decode per model; the funnel is nested (PATTERN ⊇ SETUP ⊇ TRIGGER ⊇ DIRECTION)', () => {
    const r = row({ stB: '12310' }); assert.deepEqual(MODELS.map((m) => stageOf(r, m, 'BUY')), [1, 2, 3, 1, 0]); assert.equal(stageOf({ stB: null }, 'MC', 'BUY'), null);
    for (const m of MODELS) for (const st of ['01230', '33333', '00000', '12312']) { const x = stagesReached(row({ stB: st, trig: 'MCB,PBB,BOB,SRB,MRB' }), m, 'BUY'); assert.ok(!x.SETUP || x.PATTERN); assert.ok(!x.TRIGGER || x.SETUP); assert.ok(!x.DIRECTION || x.TRIGGER); }
  });
  it('attribution follows pipeline order: PATTERN / SETUP / TRIGGER / DIRECTION / LOCATION / SL / RR / UNKNOWN / VALID', () => {
    assert.equal(attributeLoss(row({ stB: '00000' }), ent(row())), 'PATTERN_ERROR');
    assert.equal(attributeLoss(row({ stB: '00100' }), ent(row())), 'SETUP_ERROR');
    assert.equal(attributeLoss(row({ stB: '00200' }), ent(row())), 'TRIGGER_ERROR');
    assert.equal(attributeLoss(row({ trig: 'PBB' }), ent(row())), 'DIRECTION_ERROR');
    assert.equal(attributeLoss(row(), ent(row({ anc: 3980 }))), 'LOCATION_ERROR');
    assert.equal(attributeLoss(row(), ent(row({ g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 0.3 } }))), 'SL_ERROR');
    assert.equal(attributeLoss(row(), ent(row({ g: { e: 4000, sl: 3995, tp2: 4008, rr: 1.6, ra: 1 } }))), 'RR_ERROR');
    assert.equal(attributeLoss(row({ gap: 1 }), ent(row())), 'UNKNOWN'); assert.equal(attributeLoss(row({ stB: undefined }), ent(row())), 'UNKNOWN');
    assert.equal(attributeLoss(row(), ent(row())), 'VALID_LOSING_TRADE');
  });
  it('SR trigger: stage 2 counter-structure is valid only when the 15m bias supports the side (the frozen SR rule)', () => {
    const sr = (b15, side = 'SELL') => row({ act: side, mdl: 'SR', cs: side, trig: `SR${side[0]}`, b15, stS: '00020', stB: '00020', anc: 4002, g: { e: 4000, sl: 4005, tp1: 3995, tp2: 3990, rr: 2, ra: 1.0 } });
    assert.equal(triggerValid(sr('BEARISH'), 'SR', 'SELL'), true); assert.equal(triggerValid(sr('BULLISH'), 'SR', 'SELL'), false); assert.equal(triggerValid(sr('NEUTRAL'), 'SR', 'SELL'), false);
    assert.equal(triggerValid(row({ stB: '00200' }), 'BO', 'BUY'), false, 'the exception is SR only');
    assert.equal(attributeLoss(sr('BEARISH'), ent(sr('BEARISH'))), 'VALID_LOSING_TRADE'); assert.equal(attributeLoss(sr('BULLISH'), ent(sr('BULLISH'))), 'TRIGGER_ERROR');
  });
  it('hindsight outcome labels are labels only (MFE thresholds 0.5 / 1.2 R); the mirror keeps entry and SL distance', () => {
    assert.equal(outcomeLabel(0.2), 'ADVERSE_FROM_START'); assert.equal(outcomeLabel(0.7), 'FAVOURABLE_THEN_LOST'); assert.equal(outcomeLabel(1.3), 'NEAR_TARGET_REVERSAL');
    const t = { i: 5, side: 'BUY', entry: 100, sl: 98 }; assert.deepEqual(mirror(t), { i: 5, side: 'SELL', entry: 100, sl: 102 });
  });
});

describe('no lookahead', () => {
  it('timing / location features use only the signal bar and earlier fields', () => {
    const r = row({ i: 1000, org: 996, anc: 3998.5, ev5: ['BOS', 'B', 994, 3998] }); const f = timingFeatures(r, ent(r)); assert.equal(f.bars_from_origin, 4); assert.equal(f.bo_bars_since_event, 6); assert.ok(Math.abs(f.anchor_dist_atr - 1.5 / 5) < 1e-9); assert.equal(f.sl_atr, 1.0);
  });
  it('the probe at bar i is unchanged when every later bar is corrupted (causal ATR, entry = close of bar i)', () => {
    const b = bars(80); const a = probe(b, features(b), 60, 'BUY'); const c = b.map((x, k) => (k > 60 ? { ...x, high: x.high + 50, low: x.low - 50, close: x.close + 30 } : x)); const p = probe(c, features(c), 60, 'BUY');
    assert.deepEqual(a, p);
  });
  it('calendar functions depend only on the bar schedule, never on future prices', () => {
    const b = bars(400); const c = b.map((x, k) => (k > 10 ? { ...x, open: 999, high: 999, low: 1, close: 500 } : x)); assert.equal(nightsPossible(b, 10), nightsPossible(c, 10)); assert.equal(closureReachable(b, 10), closureReachable(c, 10));
  });
});

describe('swap, slippage and gap exposure', () => {
  it('calendar nights: Friday -> Monday = 3; intraday = 0; closure reachability detects a > 24 h gap in the horizon', () => {
    assert.equal(calendarNights(Date.UTC(2026, 0, 2, 20) / 1000, Date.UTC(2026, 0, 5, 2) / 1000), 3); assert.equal(calendarNights(T0, T0 + 3600), 0);
    const b = bars(300); assert.equal(closureReachable(b, 0), false); const w = b.map((x, k) => (k >= 100 ? { ...x, time: x.time + 2 * 86400 } : x)); assert.equal(closureReachable(w, 0), true); assert.equal(closureReachable(w, 150), false);
    assert.equal(gapType(w, 100), 'CLOSURE'); assert.equal(gapType(b, 100), 'IN_SESSION'); const s = b.map((x, k) => (k >= 50 ? { ...x, time: x.time + 3600 } : x)); assert.equal(gapType(s, 50), 'SESSION');
  });
  it('swap buffer: BUY = nights possible x rate, SELL = 0; unavailable rate fails closed', () => {
    const e = envelopeExtraOz({ side: 'BUY', R: 5, nightsPossible: 3, swapRate: 0.5674, gapBufferR: 0.7 }); assert.ok(Math.abs(e.swap - 1.7022) < 1e-9); assert.ok(Math.abs(e.gap - 3.5) < 1e-9); assert.equal(e.slip, SLIPPAGE_BUFFER);
    assert.equal(envelopeExtraOz({ side: 'SELL', R: 5, nightsPossible: 3, swapRate: 0.5674, gapBufferR: 0 }).swap, 0);
    assert.equal(envelopeExtraOz({ side: 'BUY', R: 5, nightsPossible: 1, swapRate: null, gapBufferR: 0 }).reason, 'SWAP_RATE_UNAVAILABLE'); assert.equal(envelopeExtraOz({ side: 'BUY', R: 0, nightsPossible: 1, swapRate: 0.5, gapBufferR: 0 }).reason, 'INVALID_STRUCTURAL_SL'); assert.equal(envelopeExtraOz({ side: 'SELL', R: 5, nightsPossible: 1, swapRate: 0.5, gapBufferR: NaN }).reason, 'GAP_BUFFER_UNAVAILABLE');
  });
  it('worst plausible loss = 1.5 R + spread + 0.10 + slippage + gap + swap buffers', () => { const extra = envelopeExtraOz({ side: 'BUY', R: 4, nightsPossible: 1, swapRate: 0.5, gapBufferR: 0.5 }); assert.ok(Math.abs(worstPlausibleOz({ R: 4, spread: 0.24, extra }) - (6 + 0.24 + 0.10 + 0.20 + 2 + 0.5)) < 1e-9); });
  it('gap-through: fill at the open when the bar opens beyond the broker level (BUY / SELL), otherwise 0', () => {
    const b = [{ time: 0, open: 100, high: 100, low: 100, close: 100 }, { time: 300, open: 90, high: 91, low: 89, close: 90 }];
    assert.ok(Math.abs(gapThroughOz({ bars: b, exitBar: 1, side: 'BUY', entry: 100, R: 4 }) - 4) < 1e-9); assert.equal(gapThroughOz({ bars: b, exitBar: 1, side: 'SELL', entry: 100, R: 4 }), 0);
    const s = [b[0], { time: 300, open: 110, high: 111, low: 109, close: 110 }]; assert.ok(Math.abs(gapThroughOz({ bars: s, exitBar: 1, side: 'SELL', entry: 100, R: 4 }) - 4) < 1e-9);
  });
  it('realized P&L: SCENARIO as simulated; REALISTIC replaces simulator swap / deterministic gap with calendar swap and data gap-through', () => {
    assert.equal(realizedPnlOz({ model: 'SCENARIO', pnlOz: -7 }), -7);
    assert.ok(Math.abs(realizedPnlOz({ model: 'REALISTIC', pnlOz: -7.56, side: 'BUY', simSwapOz: 0.56, detGapOz: 0, calNights: 3, swapRate: 0.5674, exit: 'BROKER_SL', gapThrough: 2 }) - (-7 - 1.7022 - 2)) < 1e-9);
    assert.ok(Math.abs(realizedPnlOz({ model: 'REALISTIC', pnlOz: -9, side: 'SELL', simSwapOz: 0, detGapOz: 2, calNights: 3, swapRate: 0.5674, exit: 'THESIS_INVALIDATION', gapThrough: 5 }) - (-7)) < 1e-9);
  });
  it('the platform swap history is read, not assumed (local, skipped when absent)', { skip: !existsSync(join(ROOT, 'state', 'xauusd_mt5_real_trade_log.jsonl')) }, () => { const s = maxSwapLongUsd(join(ROOT, 'state', 'xauusd_mt5_real_trade_log.jsonl')); assert.ok(s.usd_per_oz_night > 0.4 && s.usd_per_oz_night < 1); });
});

describe('risk firewall under the envelope (V11 integration, V10 library unchanged)', () => {
  it('envelope sizing: lots x worst plausible loss <= approved; the entry is never modified; minimum lot -> RISK_REJECTED', () => {
    const e = ent(row()); const h = entryHash(e); const extra = envelopeExtraOz({ side: 'BUY', R: 5, nightsPossible: 3, swapRate: 0.5674, gapBufferR: 3.7 });
    const out = integrateEntry(initState(10000), e, ctx({ cfg: cfgPct(0.005, BASE_SLIP + extra.total) })); assert.equal(out.record.outcome, 'RISK_ACCEPTED'); assert.equal(out.record.entry_hash_after, h);
    assert.ok(out.record.lots * 100 * worstPlausibleOz({ R: 5, spread: 0.24, extra }) <= 50 + 1e-9); assert.ok(out.record.lots < integrateEntry(initState(10000), e, ctx()).record.lots, 'the envelope sizes down');
    const rej = integrateEntry(initState(1000), e, ctx({ equity: 1000, cfg: cfgPct(0.005, BASE_SLIP + extra.total) })); assert.equal(rej.record.outcome, 'RISK_REJECTED'); assert.equal(rej.record.reason, 'RISK_BELOW_MIN_LOT'); assert.equal(rej.record.valid_entry, true); assert.equal(rej.record.entry_hash_after, h);
  });
  it('actual risk is recalculated through the independent tick-value path with the envelope allowance (consistent; never above approved)', () => {
    for (const eq of [5000, 12345, 80000]) { const r = integrateEntry(initState(eq), ent(row()), ctx({ equity: eq, cfg: cfgPct(0.0025, BASE_SLIP + 1.3) })).record; if (r.outcome !== 'RISK_ACCEPTED') continue; assert.ok(r.planned_risk_usd <= eq * 0.0025 + 1e-9); assert.ok(Math.abs(r.planned_risk_usd - r.lots * (1.5 * 5 + 0.24 + BASE_SLIP + 1.3) * 100) < 1e-6); }
  });
  it('restart and duplicate delivery; fail-closed paths still precede risk (stale data, missing SL)', () => {
    const a = integrateEntry(initState(10000), ent(row()), ctx()); const re = deserialize(serialize(a.state)); assert.equal(integrateEntry(re, ent(row()), ctx()).record.outcome, 'DUPLICATE_DELIVERY');
    const e2 = ent(row({ i: 1100, t: T0 + 3600 })); assert.deepEqual(integrateEntry(a.state, e2, ctx({ nowT: T0 + 3900 })).record, integrateEntry(re, e2, ctx({ nowT: T0 + 3900 })).record);
    assert.equal(integrateEntry(initState(10000), ent(row()), ctx({ quoteAgeSec: 120 })).record.reason, 'DATA_STALE_QUOTE'); assert.equal(integrateEntry(initState(10000), ent(row({ g: { e: 4000, sl: null, tp2: 4010, rr: 2, ra: 1 } })), ctx()).record.reason, 'SL_UNAVAILABLE');
  });
});

describe('statistics helpers', () => {
  it('day-block bootstrap is deterministic and centred on the point estimate; summary maths', () => {
    const A = Array.from({ length: 200 }, (_, k) => ({ d: `D${k % 20}`, x: (k % 7) - 3 })); const c1 = dayBlockCI(A), c2 = dayBlockCI(A); assert.deepEqual(c1, c2); assert.ok(c1.lo <= c1.mean && c1.mean <= c1.hi);
    const s = summarizeR([1.7, -1, -1, 1.7]); assert.equal(s.wins, 2); assert.ok(Math.abs(s.pf - 1.7) < 1e-9); assert.ok(Math.abs(s.expectancy_r - 0.35) < 1e-9); assert.equal(s.max_dd_r, 2);
  });
});

describe('research boundaries, holdout isolation and frozen results', () => {
  it('no execution code; no new indicators; production imported read-only', () => {
    for (const f of ['isolation.mjs', 'envelope.mjs', 'v12_study.mjs', 'write_reports.mjs']) { const p = join(V12, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8');
      for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'watcher.js', 'child_process', 'REAL_ACCOUNT', 'REAL_ARM', 'silver', 'DXY', 'capitalHarvest = true']) assert.ok(!s.includes(bad), `${f}: ${bad}`); }
  });
  it('frozen study (local, skipped when absent): amended prereg, freeze, holdout isolation, parity, firewall, decision states', { skip: !existsSync(join(V12, 'results', 'v12_results_FULL.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'); const pre = sha(join(V12, 'V12_PREREGISTRATION.md')); assert.equal(pre, readFileSync(join(V12, 'V12_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]);
    const r = JSON.parse(readFileSync(join(V12, 'results', 'v12_results_FULL.json'), 'utf8')); assert.equal(r.freeze.prereg_sha, pre); for (const [k, f] of [['isolation_sha', 'isolation.mjs'], ['envelope_sha', 'envelope.mjs'], ['study_sha', 'v12_study.mjs']]) assert.equal(r.freeze[k], sha(join(V12, 'scripts', f)), k);
    const dev = JSON.parse(readFileSync(join(V12, 'results', 'v12_dev.json'), 'utf8')); assert.deepEqual(r.freeze.buffers, dev.buffers, 'buffers derived on DEV only'); assert.deepEqual(r.freeze.candidates_dev, dev.partA.candidates);
    for (const [k, v] of Object.entries(r.candidates_holdout)) assert.equal(v.supported, r.freeze.candidates_frozen.includes(k) && v.hold.pass, k);
    assert.equal(r.splits.DEV.partA.entries, 4858); assert.equal(r.splits.HOLD.partA.entries, 6553); assert.equal(r.splits.DEV.partA.strategy.ALL.trades, 1133); assert.equal(r.splits.HOLD.partA.strategy.ALL.trades, 1510);
    assert.equal(r.integrity.v11_parity_all_same, true); assert.equal(r.integrity.entry_hash_mismatches, 0); assert.equal(r.risk_replay.deterministic, true); assert.equal(r.risk_replay.restart_equals_uninterrupted, true); assert.equal(r.risk_replay.identity_ok, true);
    assert.ok(['EDGE_FAILURE_ISOLATED', 'EDGE_FAILURE_NOT_ISOLATED', 'EDGE_CORRECTION_SUPPORTED', 'EDGE_CORRECTION_NOT_SUPPORTED', 'INCONCLUSIVE'].includes(r.decision.ENTRY_EDGE_STATUS));
    assert.ok(['RISK_HARDENED', 'RISK_PARTIALLY_HARDENED', 'RISK_INCONCLUSIVE', 'RISK_FAILED'].includes(r.decision.RISK_STATUS)); assert.equal(r.decision.SUPPORTED_RISK_PERCENTAGE, 'UNRESOLVED');
    for (const S of ['DEV', 'HOLD']) for (const g of Object.values(r.splits[S].partB.grid)) for (const a of Object.values(g)) for (const b of Object.values(a)) for (const c of Object.values(b)) { assert.equal(c.planned_above_approved, 0); assert.equal(c.entry_hash_mismatches, 0); }
  });
});
