/**
 * V9 CAPITAL HARVEST (2026-10-01) -- deterministic tests for the research profit manager (RESEARCH ONLY; no order code).
 * Baseline equivalence with the V5/V8 simulator, floor rules (armed, monotone, >= break-even, <= close, next-bar effect),
 * continuation states (BUY/SELL symmetric), loss side unchanged before profit, PROTECT + RUN beyond 1.70R, HARVEST on weakness,
 * no hindsight (future corruption), live-time = replay, costs, and the absence of execution code / fixed-dollar targets.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { features, simulateTrade, continuationState, postExitContinuation, COSTS } from '../research/capital_harvest_v9/scripts/harvest.mjs';
import { simulate } from '../research/trade_economics_v5/scripts/exitPolicies.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const T0 = 1_700_000_000 - (1_700_000_000 % 86400) + 8 * 3600;
const warm = (n = 40, c0 = 100) => Array.from({ length: n }, (_, k) => { const c = c0 + Math.sin(k) * 0.3; return { time: T0 + 300 * k, open: c, high: c + 0.4, low: c - 0.4, close: c }; });
const path = (bars, closes, wick = 0.3) => { const out = [...bars]; let prev = out.at(-1).close; for (const c of closes) { out.push({ time: out.at(-1).time + 300, open: prev, high: Math.max(prev, c) + wick, low: Math.min(prev, c) - wick, close: c }); prev = c; } return out; };
const mirror = (bars, K = 200) => bars.map((b) => ({ ...b, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close }));
const BASE = { kind: 'BASELINE' }; const RUN = { kind: 'RUN_TO_END' };
const P1 = { kind: 'ADAPTIVE', floor: { family: 'D', arm: 0.75, rho: 0.5 }, harvestMinR: 1.0 };

describe('baseline and run-to-end reproduce the V5/V8 simulator', () => {
  it('target, broker fail-safe, thesis invalidation and horizon: identical exits and R for BUY and SELL', () => {
    const w = warm(); const cases = [[101, 102, 103, 104], [99.5, 99, 98, 97.5], [100.4, 99.4, 98.6, 98.3], Array.from({ length: 300 }, (_, k) => 100 + Math.sin(k / 5) * 0.4)];
    for (const tail of cases) for (const mir of [false, true]) { let bars = path(w, tail); if (mir) bars = mirror(bars); const i = w.length - 1; const side = mir ? 'SELL' : 'BUY'; const entry = bars[i].close; const sl = mir ? entry + 1 : entry - 1; const f = features(bars);
      for (const [p, v5] of [[BASE, { type: 'FIXED', rr: 1.7 }], [RUN, { type: 'OPEN' }]]) { const a = simulateTrade(bars, f, { i, side, entry, sl }, p); const b = simulate(bars, { i, side, geo: { entry, sl } }, v5); assert.equal(a.status, b.status); if (a.status !== 'NO_DATA') { assert.equal(a.exitBar, b.exitBar); assert.ok(Math.abs(a.r - b.r) < 0.0011, `${side} ${p.kind} ${a.r} vs ${b.r}`); } } }
  });
});

describe('protected-profit floor', () => {
  it('arms only after MFE >= arm, is monotone, never below break-even, never above the close, and acts from the next bar', () => {
    const w = warm(); const bars = path(w, [100.6, 101.2, 101.8, 102.4, 102.0, 101.7, 101.4, 101.0, 100.6]); const i = w.length - 1; const entry = bars[i].close; const t = { i, side: 'BUY', entry, sl: entry - 1 };
    const o = simulateTrade(bars, features(bars), t, { kind: 'FLOOR', floor: { family: 'D', arm: 0.75, rho: 0.5 } }, COSTS.normal, { log: true });
    const floors = o.decisions.map((d) => d.floor).filter((x) => x != null); for (let k = 1; k < floors.length; k++) assert.ok(floors[k] >= floors[k - 1] - 1e-9, 'monotone');
    const be = entry + 0.24 + 0.10; assert.ok(floors.every((x) => x >= be - 1e-9), 'never below break-even'); for (const d of o.decisions) if (d.floor != null) assert.ok(d.floor <= bars[d.j].close + 1e-9, 'never above the close');
    assert.equal(o.exit, 'PROTECTED_FLOOR'); assert.ok(o.r > 0); const firstFloorBar = o.decisions.find((d) => d.floor != null).j; assert.ok(o.exitBar > firstFloorBar, 'the floor acts from the next bar');
  });
  it('before profit is available the adaptive policy is identical to the baseline (loss side unchanged)', () => {
    const w = warm(); const bars = path(w, [100.2, 99.8, 99.3, 98.8, 98.6]); const i = w.length - 1; const entry = bars[i].close; const t = { i, side: 'BUY', entry, sl: entry - 1 };
    const a = simulateTrade(bars, features(bars), t, P1), b = simulateTrade(bars, features(bars), t, BASE); assert.equal(a.exit, b.exit); assert.equal(a.r, b.r); assert.equal(a.armed_bar, null);
  });
});

describe('continuation states and governed actions', () => {
  it('STRONG / WEAK / INVALIDATED / MODERATE, symmetric for SELL', () => {
    const w = warm(); const up = path(w, [100.5, 101.0, 101.6, 102.3]); const f = features(up); const j = up.length - 1; const i = w.length - 1;
    assert.equal(continuationState({ bars: up, f, j, side: 'BUY', i, bestCloseBar: j, lastPivot: null }), 'STRONG');
    const m = mirror(up); assert.equal(continuationState({ bars: m, f: features(m), j, side: 'SELL', i, bestCloseBar: j, lastPivot: null }), 'STRONG');
    assert.equal(continuationState({ bars: up, f, j, side: 'BUY', i, bestCloseBar: j, lastPivot: { idx: i + 1, price: 103 } }), 'INVALIDATED');
    const rej = [...up, { time: up.at(-1).time + 300, open: 102.3, high: 103.5, low: 102.2, close: 102.35 }]; assert.equal(continuationState({ bars: rej, f: features(rej), j: rej.length - 1, side: 'BUY', i, bestCloseBar: j, lastPivot: null }), 'WEAK');
    assert.equal(continuationState({ bars: up, f, j, side: 'BUY', i, bestCloseBar: j - 3, lastPivot: null }), 'MODERATE');
  });
  it('STRONG suspends the 1.70R target (protect + run beyond it); a weak close with enough open profit is harvested', () => {
    const w = warm(); const run = path(w, [100.5, 101.1, 101.8, 102.6, 103.4, 104.2, 105.0, 105.7, 105.5, 104.9, 104.6], 0.2); const i = w.length - 1; const entry = run[i].close; const t = { i, side: 'BUY', entry, sl: entry - 2 }; // a 1-USD risk would put the 50 % floor inside a normal wick
    const o = simulateTrade(run, features(run), t, P1, COSTS.normal, { log: true }); assert.ok(o.decisions.some((d) => d.tp_active === false), 'target suspended while STRONG'); assert.ok(o.r > 1.7, `ran beyond 1.70R (${o.r})`); assert.ok(['HARVEST', 'PROTECTED_FLOOR'].includes(o.exit));
    const b = simulateTrade(run, features(run), t, BASE); assert.equal(b.exit, 'TARGET_170R');
  });
});

describe('no hindsight, live-time = replay, costs', () => {
  const w = warm(60); const bars = path(w, Array.from({ length: 80 }, (_, k) => 100 + k * 0.12 + Math.sin(k / 3) * 0.5), 0.3); const i = w.length - 1; const entry = bars[i].close; const t = { i, side: 'BUY', entry, sl: entry - 1.2 };
  it('features are causal and decisions up to bar j are unchanged when every later bar is corrupted', () => {
    const f = features(bars); const fp = features(bars.slice(0, 90)); for (let j = 0; j < 90; j++) { assert.equal(f.ema[j], fp.ema[j]); assert.equal(f.atr[j], fp.atr[j]); assert.deepEqual(f.pivLowAt[j], fp.pivLowAt[j]); }
    const full = simulateTrade(bars, f, t, P1, COSTS.normal, { log: true }); const cut = full.decisions[Math.floor(full.decisions.length / 2)].j; const bad = bars.map((b, k) => (k > cut ? { ...b, high: b.high * 2, low: b.low * 0.5, close: b.close * 0.6 } : b)); const o2 = simulateTrade(bad, features(bad), t, P1, COSTS.normal, { log: true });
    for (const d of full.decisions.filter((x) => x.j <= cut)) assert.deepEqual(o2.decisions.find((x) => x.j === d.j), d);
  });
  it('feeding bars one completed close at a time reproduces the full replay decision by decision', () => {
    const full = simulateTrade(bars, features(bars), t, P1, COSTS.normal, { log: true });
    for (const d of full.decisions) { const pre = bars.slice(0, d.j + 1); const o = simulateTrade(pre, features(pre), t, P1, COSTS.normal, { log: true }); assert.deepEqual(o.decisions.at(-1), d); }
  });
  it('costs: a zero-slippage baseline differs by exactly the slippage; stress is worse than normal; post-exit continuation is measured from the exit', () => {
    const a = simulateTrade(bars, features(bars), t, BASE, { spread: 0.24, slip: 0.10 }), z = simulateTrade(bars, features(bars), t, BASE, { spread: 0.24, slip: 0 }); assert.ok(Math.abs(z.pnl_usd - a.pnl_usd - 0.10) < 1e-6);
    const s = simulateTrade(bars, features(bars), t, BASE, COSTS.stress); assert.ok(s.pnl_usd < a.pnl_usd);
    const o = simulateTrade(bars, features(bars), t, P1); if (o.early) assert.ok(postExitContinuation(bars, t, o.exitBar, o.exitPx) >= 0);
  });
});

describe('research boundaries', () => {
  it('no execution code, no fixed-dollar profit target, entries never altered', () => {
    for (const f of ['harvest.mjs', 'v9_study.mjs', 'v9_drift_control.mjs']) { const s = readFileSync(join(ROOT, 'research', 'capital_harvest_v9', 'scripts', f), 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'mt5RealPolicy', 'order_send', "request('open'", 'watcher.js', 'profitTargetUsd', 'targetUsd']) assert.ok(!s.includes(bad), `${f}: ${bad}`); }
    const h = readFileSync(join(ROOT, 'research', 'capital_harvest_v9', 'scripts', 'harvest.mjs'), 'utf8'); assert.ok(!/entry\s*=(?!=)/.test(h.replace(/const \{ i, side, entry, sl \} = t;/g, '')), 'the manager never assigns a new entry');
  });
  it('frozen study results (local, skipped when absent): reproduction exact, integrity PASS, decision not DEMONSTRATED-by-accident', { skip: !existsSync(join(ROOT, 'research', 'capital_harvest_v9', 'results', 'v9_results_FULL.json')) }, () => {
    const r = JSON.parse(readFileSync(join(ROOT, 'research', 'capital_harvest_v9', 'results', 'v9_results_FULL.json'), 'utf8')); assert.equal(r.baseline_reproduction.mismatches, 0); assert.equal(r.integrity.live_time_vs_replay.mismatches, 0); assert.equal(r.integrity.hindsight.violations, 0); assert.equal(r.integrity.determinism.identical, true); assert.equal(r.integrity.cost_accounting.pass, true);
    assert.ok(['DEMONSTRATED', 'INCONCLUSIVE', 'NOT_DEMONSTRATED'].includes(r.decision.CAPITAL_HARVEST_EDGE)); assert.equal(r.decision.PROPOSED_POLICY, r.decision.CAPITAL_HARVEST_EDGE === 'DEMONSTRATED' ? 'YES' : 'NO');
  });
});
