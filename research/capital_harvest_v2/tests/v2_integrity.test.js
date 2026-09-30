// CAPITAL HARVEST V2 -- deterministic integrity tests (RESEARCH ONLY; imports only the V1 research engine).
// Run: node --test research/capital_harvest_v2/tests/v2_integrity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulateTrade, updateFloor, canReenter } from '../../capital_harvest_v1/scripts/harvest_engine.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const R = JSON.parse(readFileSync(join(ROOT, 'results', 'study_results.json'), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('pre-registration hash is frozen and matches the results file', () => {
  const rec = readFileSync(join(ROOT, 'PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert.equal(sha(join(ROOT, 'PREREGISTRATION.md')), rec); assert.equal(R.meta.prereg_sha256, rec);
});
test('controls passed with frozen acceptance and the study is deterministically repeatable', () => {
  const c = R.meta.controls; assert.ok(c.leak_mean_usd > 1.0); assert.ok(Math.abs(c.null_mean_usd) < 0.5); assert.ok(c.cost_test.pass); assert.equal(R.meta.repeatability_pass, true);
});
test('the 1.70 control reproduces production signals exactly (Population A isolates RR)', () => {
  const k = R.meta.consistency; assert.equal(k.in_R0_not_prod, 0); assert.equal(k.in_prod_not_R0, 0); assert.equal(k.R0_signals, k.production_signals); assert.equal(R.thresholds['R0_1.70'].signals, k.production_signals);
});
test('frozen RR family only; admitted sets are nested for fixed thresholds', () => {
  assert.deepEqual(Object.keys(R.thresholds), ['R0_1.70', 'R1_1.50', 'R2_1.25', 'R3_1.00', 'R4_NO_FIXED_RR']);
  const s = ['R0_1.70', 'R1_1.50', 'R2_1.25', 'R3_1.00'].map((k) => R.thresholds[k].signals); for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1]);
  for (const k of ['R1_1.50', 'R2_1.25', 'R3_1.00']) assert.equal(R.thresholds[k].incremental_vs_R0.raw_signals, R.thresholds[k].signals - R.thresholds['R0_1.70'].signals);
  assert.ok(R.thresholds['R4_NO_FIXED_RR'].incremental_vs_R0.raw_signals <= R.thresholds['R4_NO_FIXED_RR'].signals);
});
test('decision statuses are from the allowed set; nothing is PRODUCTION_READY or PROVEN_EDGE', () => {
  for (const k of ['R1_1.50', 'R2_1.25', 'R3_1.00', 'R4_NO_FIXED_RR']) assert.ok(['REJECTED', 'INCONCLUSIVE', 'RESEARCH_CANDIDATE'].includes(R.thresholds[k].decision.status), k);
  const s = JSON.stringify(R); assert.ok(!s.includes('PRODUCTION_READY')); assert.ok(!s.includes('PROVEN_EDGE'));
});
test('H2a management is the corrected V1 engine: floor monotone, never above market, bank/run needs 2 of 3', () => {
  const bar = (o, h, l, c, k) => ({ open: o, high: h, low: l, close: c, time: 1_700_000_000 + 300 * k });
  const bars = [bar(100, 100.5, 99.8, 100.0, 0), bar(100, 105.5, 99.9, 101.0, 1), bar(101, 101.2, 100.6, 100.8, 2)];
  const o = simulateTrade({ bars, i: 0, side: 'BUY', entry: 100, sl: 98, atr: 1, tp1Dist: 2, variant: { kind: 'RUN', m1: { usd: 3 }, buffer: { usd: 1 }, bankRun: false } });
  assert.ok(o.final_floor <= 101.0 - 100.24 + 1e-9); assert.equal(o.ratchetViolations, 0); assert.equal(updateFloor(2, 1.5), 2);
  assert.equal(canReenter({ signal: { i: 5, model: 'BO', side: 'BUY', anchor: 1 }, exitBar: 5, lastTrade: null, lastExitWasLoss: false }).ok, false);
});
test('capital matrix cells exist for every threshold x cap and empty cells are flagged', () => {
  for (const k of Object.keys(R.thresholds)) for (const cap of ['no cap', 'cap<=8%', 'cap<=5%', 'cap<=3%']) { const cell = R.matrix[`${k} x ${cap}`]; assert.ok(cell, `${k} x ${cap}`); assert.equal(typeof cell.empty, 'boolean'); }
});
test('no execution import from research scripts', () => {
  for (const f of readdirSync(join(ROOT, 'scripts'))) { const src = readFileSync(join(ROOT, 'scripts', f), 'utf8'); for (const bad of ['mt5Executor', 'mt5Bridge', 'mt5RealPolicy', 'watcher.js', 'server.js', 'mt5_bridge', 'cdp']) assert.ok(!src.includes(bad), `${f} references ${bad}`); }
});
test('production strategy, REAL config and fingerprint untouched', () => {
  const pol = readFileSync(join(REPO, 'src', 'engine', 'mt5RealPolicy.js'), 'utf8');
  for (const s of ['REAL_FIXED_LOT = 0.01', 'profitTargetUsd: 30', 'maximumLossUsd: -50', 'maxEntryDriftUsd: 2.0', 'maxSpreadUsd: 0.6']) assert.ok(pol.includes(s), s);
  assert.ok(readFileSync(join(REPO, 'src', 'engine', 'intraday', 'params.js'), 'utf8').includes('minRR: 1.7'));
  assert.ok(readFileSync(join(REPO, 'src', 'engine', 'strategy.frozen.json'), 'utf8').includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed'));
});
