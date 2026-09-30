// Deterministic integrity tests for the missed-opportunity research artifacts. RESEARCH ONLY; imports nothing from production.
// Run: node --test research/missed_opportunity/tests/study_integrity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REPO = join(ROOT, '..', '..');
const results = JSON.parse(readFileSync(join(ROOT, 'results', 'study_results.json'), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('pre-registration file is present and its frozen hash matches the results file', () => {
  const recorded = readFileSync(join(ROOT, 'preregistered_hypotheses.sha256'), 'utf8').trim().split(/\s+/)[0];
  assert.equal(sha(join(ROOT, 'preregistered_hypotheses.md')), recorded, 'pre-registration was edited after its hash was frozen');
  assert.equal(results.meta.spec.prereg_sha256, recorded, 'study ran against a different pre-registration');
});

test('outcome plumbing controls passed (leak control positive, null control near zero)', () => {
  const c = results.meta.controls;
  assert.ok(c.leak_control.mean_r > 0.3, `leak control mean R ${c.leak_control.mean_r}`);
  assert.ok(Math.abs(c.null_control.mean_r) < 0.25, `null control mean R ${c.null_control.mean_r}`);
  assert.ok(c.leak_control.n > 100 && c.null_control.n > 100);
});

test('motivating session 2026-09-30 is excluded from every sample', () => {
  assert.ok(results.meta.excluded_2026_09_30_rows > 0);
  for (const e of results.H1.independent_events) assert.ok(!e.t.startsWith('2026-09-30'), e.t);
  for (const k of ['H2a', 'H2b']) for (const e of results.H2[k].independent_events) assert.ok(!e.t.startsWith('2026-09-30'), e.t);
});

test('frozen study constants equal the production constants they cite (no tuning)', () => {
  const s = results.meta.spec;
  assert.equal(s.h2.max_event_age, 10); assert.equal(s.h2.retest_tol_atr, 0.3); assert.equal(s.h2.disp_min_atr, 1.0); assert.equal(s.h2.disp_max_atr, 2.5);
  assert.equal(s.h2.min_atr_ratio, 1.0); assert.equal(s.h2.leg_lookback, 2); assert.equal(s.h2.fresh_choch_bars, 3);
  assert.equal(s.cost_normal_usd, 0.34); assert.equal(s.cost_stress_usd, 0.8); assert.equal(s.horizon_bars, 288);
});

test('independent counts never exceed raw counts and clusters are unique', () => {
  const h1 = results.H1.population; assert.ok(h1.independent_cluster_count <= h1.primary_raw && h1.primary_raw <= h1.raw_event_count);
  for (const k of ['H2a', 'H2b']) { const p = results.H2[k].population; assert.ok(p.independent_cluster_count <= p.qualified_raw_event_count); const ids = new Set(results.H2[k].independent_events.map((e) => e.i)); assert.equal(ids.size, results.H2[k].independent_events.length); }
});

test('decision statuses are from the allowed set and PROVEN_EDGE is never emitted', () => {
  const allowed = new Set(['NEGATIVE', 'NO_EDGE', 'WEAK_INTEREST', 'ROBUST_INTEREST', 'INSUFFICIENT_EVIDENCE']);
  const phase7 = new Set(['REJECTED', 'INSUFFICIENT_EVIDENCE', 'INTERESTING_RESEARCH_LEAD', 'ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION']);
  for (const d of [results.H1.decision, results.H2.H2a.decision, results.H2.H2b.decision]) { assert.ok(allowed.has(d.status), d.status); assert.ok(phase7.has(d.phase7), d.phase7); assert.notEqual(d.status, 'PROVEN_EDGE'); }
  assert.ok(!JSON.stringify(results).includes('PROVEN_EDGE'));
});

test('production engine files are unchanged since the study ran', () => {
  for (const [f, prefix] of Object.entries(results.meta.engine_files_sha256)) {
    assert.equal(sha(join(REPO, 'src', 'engine', f)).slice(0, 16), prefix, `${f} changed after the study`);
  }
  if (existsSync(join(REPO, 'src', 'engine', 'strategy.frozen.json'))) {
    const fz = JSON.parse(readFileSync(join(REPO, 'src', 'engine', 'strategy.frozen.json'), 'utf8'));
    const fp = fz.strategy_fingerprint ?? fz.fingerprints?.strategy_fingerprint ?? JSON.stringify(fz);
    assert.ok(String(fp).includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed'), 'frozen strategy fingerprint changed');
  }
});
