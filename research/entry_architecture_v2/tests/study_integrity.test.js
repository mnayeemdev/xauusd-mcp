// Deterministic integrity tests for the Entry Architecture V2 research artifacts. RESEARCH ONLY; imports nothing from production.
// Run: node --test research/entry_architecture_v2/tests/study_integrity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const R = JSON.parse(readFileSync(join(ROOT, 'results', 'study_results.json'), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('pre-registration hash is frozen and matches the results', () => {
  const rec = readFileSync(join(ROOT, 'PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert.equal(sha(join(ROOT, 'PREREGISTRATION.md')), rec); assert.equal(R.meta.prereg_sha256, rec);
});
test('controls passed with the frozen acceptance criteria', () => {
  const c = R.meta.controls; assert.ok(c.leak.mean_r > 0.3); assert.ok(Math.abs(c.null.mean_r) < 0.25); assert.ok(c.cost_check.pass); assert.ok(c.cluster_independence_pass);
});
test('the replayed production chain reproduces every production signal', () => {
  const k = R.meta.consistency; assert.equal(k.prod_signal_but_chain_fail, 0); assert.equal(k.chain_pass_but_prod_wait, 0); assert.equal(k.prod_signal_and_chain_pass, R.funnel.production_signals);
});
test('funnel is monotone and A0 equals production', () => {
  const f = R.funnel; const seq = [f.candidates_setup_trigger, f.after_vol, f.after_over, f.after_geo, f.after_rr, f.after_q, f.after_fresh, f.after_two, f.after_htf];
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] <= seq[i - 1]); assert.equal(f.after_htf, f.production_signals); assert.equal(R.architectures.A0.signals_raw, f.production_signals);
});
test('frozen constants equal production constants (no tuning) and 2026-09-30 is excluded', () => {
  const s = R.meta.spec; assert.equal(s.minRR, 1.7); assert.equal(s.cost, 0.34); assert.equal(s.stress, 0.8); assert.equal(s.horizon, 288); assert.equal(s.ctx_pts, 5); assert.equal(s.a2_q, 80); assert.equal(s.a2_rr, 2.0); assert.equal(s.strong_q, 75);
  assert.equal(s.hold[1], '2026-09-29');
});
test('decision statuses are from the allowed set and PROVEN_EDGE never appears', () => {
  const allowed = new Set(['REJECTED', 'NO_IMPROVEMENT', 'INTERESTING_RESEARCH_LEAD', 'ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION']);
  for (const k of ['A1', 'A2', 'A3']) assert.ok(allowed.has(R.architectures[k].decision.status), k);
  assert.ok(!JSON.stringify(R).includes('PROVEN_EDGE'));
});
test('A3 selection used development data only and kept every veto', () => {
  for (const m of Object.values(R.meta.a3_selection_table)) for (const v of Object.values(m)) assert.equal(v.decision, 'KEEP');
});
test('production strategy files and fingerprint are unchanged', () => {
  const fz = JSON.parse(readFileSync(join(REPO, 'src', 'engine', 'strategy.frozen.json'), 'utf8'));
  assert.ok(JSON.stringify(fz).includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed'));
});
