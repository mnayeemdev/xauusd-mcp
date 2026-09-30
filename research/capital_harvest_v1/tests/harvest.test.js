// CAPITAL HARVEST V1 -- deterministic tests (RESEARCH ONLY). Imports only the research engine; asserts production is untouched.
// Run: node --test research/capital_harvest_v1/tests/harvest.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COSTS, EQUITY_REF_USD, capitalRisk, updateFloor, canReenter, continuationEvidence, simulateTrade } from '../scripts/harvest_engine.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const bar = (o, h, l, c, t) => ({ open: o, high: h, low: l, close: c, time: t });
const mk = (arr, t0 = 1_700_000_000) => arr.map((b, k) => bar(b[0], b[1], b[2], b[3], t0 + 300 * k));

test('first milestone detection: FIXED 3 USD banks at the first bar whose MFE reaches 3 (after spread)', () => {
  const bars = mk([[100, 100.5, 99.8, 100.2], [100.2, 101.5, 100.1, 101.4], [101.4, 103.6, 101.3, 103.5], [103.5, 104, 103, 103.8]]);
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100.2, sl: 98.0, atr: 1, tp1Dist: 2.2, variant: { kind: 'FIXED', m1: { usd: 3 } } });
  assert.equal(o.exit, 'MILESTONE_BANK'); assert.equal(o.exitBar, 2); assert.equal(o.pnl_usd, 2.9); // 3.00 - 0.10 slippage
});
test('spread cost applied: BUY fills at close + 0.24; SELL pays spread on exit', () => {
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 100.1, 90, 95]]);
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100.0, sl: 99.0, atr: 1, tp1Dist: 1, variant: { kind: 'FIXED', m1: { usd: 3 } } });
  assert.equal(o.fill, 100.24); assert.equal(o.exit, 'STRUCTURAL_STOP'); assert.ok(Math.abs(o.pnl_usd - (-(100.24 - 99.0) - 0.10)) < 1e-6);
  const s = simulateTrade({ bars: mk([[100, 100.2, 99.8, 100.0], [100, 96, 95, 96.5]]), i: 0, side: 'SELL', entry: 100.0, sl: 101.0, atr: 1, tp1Dist: 1, variant: { kind: 'FIXED', m1: { usd: 3 } } });
  assert.equal(s.exit, 'MILESTONE_BANK'); assert.equal(s.pnl_usd, 2.9); // milestone measured on bid+spread
});
test('slippage applied once per round trip and stress costs are larger', () => {
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 104, 99.9, 103.5]]);
  const n = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 99, atr: 1, tp1Dist: 1, variant: { kind: 'FIXED', m1: { usd: 3 } } });
  const st = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 99, atr: 1, tp1Dist: 1, variant: { kind: 'FIXED', m1: { usd: 3 } }, costs: COSTS.stress });
  assert.equal(n.pnl_usd, 2.9); assert.equal(st.pnl_usd, 2.8); assert.equal(st.fill, 100.6);
});
test('structural stop respected: stop before milestone in the same bar is scored as a loss', () => {
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 104, 98.5, 103.5]]);
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 99, atr: 1, tp1Dist: 1, variant: { kind: 'FIXED', m1: { usd: 3 } } });
  assert.equal(o.exit, 'STRUCTURAL_STOP'); assert.ok(o.pnl_usd < 0);
});
test('profit floor is positive after activation and never decreases (ratchet monotonicity)', () => {
  assert.equal(updateFloor(2, 1.5), 2); assert.equal(updateFloor(2, 2.5), 2.5); assert.equal(updateFloor(null, 1), 1);
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 101, 99.9, 100.9], [100.9, 103.8, 100.8, 103.7], [103.7, 105.5, 103.6, 105.4], [105.4, 105.6, 104.0, 104.2], [104.2, 104.5, 103.0, 103.2]]);
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1.2, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false } });
  assert.equal(o.decision, 'RUN'); assert.ok(o.final_floor > 0); assert.equal(o.ratchetViolations, 0); assert.ok(['RATCHET_BANK', 'PROTECTED_BANK'].includes(o.exit)); assert.ok(o.pnl_usd > 0);
});
test('reversal banks protected profit; continuation can remain open', () => {
  const rev = mk([[100, 100.5, 99.8, 100.0], [100, 103.8, 99.9, 103.7], [103.7, 103.9, 101.0, 101.2]]);
  const o = simulateTrade({ bars: rev, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1.2, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false } });
  assert.equal(o.exit, 'PROTECTED_BANK'); assert.ok(Math.abs(o.pnl_usd - 2.46) < 1e-6); // floor 2.0 at activation, ratcheted at that close to min(MFE 3.56 - 1, close P&L 3.46) = 2.56; banked 2.56 - 0.10
  const run = mk([[100, 100.5, 99.8, 100.0], [100, 103.8, 99.9, 103.7], [103.7, 104.5, 103.6, 104.4], [104.4, 105.2, 104.3, 105.1]]);
  const o2 = simulateTrade({ bars: run, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1.2, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false }, horizon: 3 });
  assert.equal(o2.status, 'OPEN_AT_HORIZON'); assert.ok(o2.final_floor >= 2);
});
test('protective floor is never above market: ratchet is capped at close-based P&L, and a spike-and-close-back banks at the close', () => {
  const spike = mk([[100, 100.5, 99.8, 100.0], [100, 105.5, 99.9, 101.0], [101, 101.2, 100.6, 100.8]]);
  const o = simulateTrade({ bars: spike, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false } });
  assert.equal(o.exit, 'PROTECTED_BANK'); assert.ok(o.final_floor <= 101.0 - 100.24 + 1e-9, 'floor above close P&L'); // floor = min(2.0, 0.76) = 0.76
  const back = mk([[100, 100.5, 99.8, 100.0], [100, 105.5, 99.9, 100.3]]);
  const o2 = simulateTrade({ bars: back, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false } });
  assert.equal(o2.exit, 'PROTECTED_BANK_AT_CLOSE');
});
test('bank/run evidence uses only bars <= milestone bar and needs 2 of 3', () => {
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 101, 99.9, 100.9], [100.9, 103.8, 100.8, 103.7]]);
  const ev = continuationEvidence({ bars, j: 2, side: 'BUY', atrEntry: 1 });
  assert.equal(ev.e1, true); assert.equal(ev.e2, true); assert.equal(ev.e3, true); assert.equal(ev.strong, true);
  const weak = continuationEvidence({ bars: mk([[100, 100.5, 99.8, 100.0], [100, 104, 99.9, 103.9], [103.9, 104.1, 103.0, 103.1]]), j: 2, side: 'BUY', atrEntry: 3 });
  assert.equal(weak.strong, false);
});
test('stale signal cannot re-enter; fresh setup may re-enter; same-candle re-entry blocked; revenge guard', () => {
  const last = { i: 100, model: 'BO', side: 'BUY', anchor: 4190.00 };
  assert.equal(canReenter({ signal: { i: 105, model: 'BO', side: 'BUY', anchor: 4190.004 }, exitBar: 103, lastTrade: last, lastExitWasLoss: false }).reason, 'STALE_SAME_SETUP');
  assert.equal(canReenter({ signal: { i: 103, model: 'PB', side: 'SELL', anchor: 4180 }, exitBar: 103, lastTrade: last, lastExitWasLoss: false }).reason, 'SAME_OR_EARLIER_CANDLE');
  assert.equal(canReenter({ signal: { i: 105, model: 'PB', side: 'BUY', anchor: 4185 }, exitBar: 103, lastTrade: last, lastExitWasLoss: true }).reason, 'REVENGE_GUARD');
  assert.equal(canReenter({ signal: { i: 105, model: 'PB', side: 'BUY', anchor: 4185 }, exitBar: 103, lastTrade: last, lastExitWasLoss: false }).ok, true);
  assert.equal(canReenter({ signal: { i: 120, model: 'BO', side: 'BUY', anchor: 4190.00 }, exitBar: 103, lastTrade: last, lastExitWasLoss: true }).ok, true);
});
test('capital-risk calculation and rejection band; minimum-lot constraint is explicit', () => {
  const r = capitalRisk({ entry: 4190, sl: 4187 }); // stop 3.00 + 0.24 + 0.10 = 3.34 USD
  assert.equal(r.expectedLossUsd, 3.34); assert.equal(r.pctEquity, Math.round((3.34 / EQUITY_REF_USD) * 10000) / 10000); assert.equal(r.band, '5-8%'); assert.equal(r.tooHighAbove5pct, true);
  const small = capitalRisk({ entry: 4190, sl: 4189.4 }); assert.equal(small.band, '1-2%'); // 0.60 + 0.34 = 0.94 USD = 1.5%
  assert.equal(EQUITY_REF_USD, 62.07);
});
test('opposite production signal closes the position (governed early thesis exit)', () => {
  const bars = mk([[100, 100.5, 99.8, 100.0], [100, 101, 99.9, 100.9], [100.9, 101.2, 100.5, 100.6]]);
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1, tp1Dist: 2, variant: { kind: 'FIXED', m1: { usd: 5 } }, oppSignalBars: [2] });
  assert.equal(o.exit, 'OPPOSITE_SIGNAL'); assert.equal(o.exitBar, 2);
});
test('no execution import from research: engine and study import nothing from mt5Executor, mt5Bridge, watcher or server', () => {
  for (const f of readdirSync(join(ROOT, 'scripts'))) { const src = readFileSync(join(ROOT, 'scripts', f), 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'mt5RealPolicy', 'watcher.js', 'server.js', 'mt5_bridge', 'cdp']) assert.ok(!src.includes(bad), `${f} references ${bad}`); }
});
test('REAL configuration, protections and fingerprint untouched', () => {
  const pol = readFileSync(join(REPO, 'src', 'engine', 'mt5RealPolicy.js'), 'utf8');
  for (const s of ['REAL_FIXED_LOT = 0.01', 'profitTargetUsd: 30', 'maximumLossUsd: -50', 'maxEntryDriftUsd: 2.0', 'maxSpreadUsd: 0.6', 'brokerStructuralSlMultiple: 1.5']) assert.ok(pol.includes(s), s);
  const fz = readFileSync(join(REPO, 'src', 'engine', 'strategy.frozen.json'), 'utf8'); assert.ok(fz.includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed'));
  const results = JSON.parse(readFileSync(join(ROOT, 'results', 'study_results.json'), 'utf8'));
  assert.equal(results.meta.prereg_sha256, readFileSync(join(ROOT, 'PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]);
  assert.equal(createHash('sha256').update(readFileSync(join(ROOT, 'PREREGISTRATION.md'))).digest('hex'), results.meta.prereg_sha256);
  assert.ok(results.meta.controls.leak_mean_usd > 1.0 && Math.abs(results.meta.controls.null_mean_usd) < 0.5 && results.meta.controls.cost_test.pass);
  assert.equal(results.meta.dedup_ratchet_checks.same_candle_violations, 0); assert.equal(results.meta.dedup_ratchet_checks.ratchet_violations, 0); assert.equal(results.meta.dedup_ratchet_checks.revenge_violations, 0);
  assert.ok(!JSON.stringify(results).includes('PROVEN_EDGE'));
});
