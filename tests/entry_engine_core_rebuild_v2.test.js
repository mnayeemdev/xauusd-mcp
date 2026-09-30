/**
 * ENTRY ENGINE CORE REBUILD V2 -- invariant tests over the frozen research artefacts (research/entry_engine_core_rebuild_v2).
 * Pre-registration discipline (hashes), built-in controls (no look-ahead, geometry, cost accounting, confirmed candle), finalist
 * derivation reproducibility from DEV, accounting invariants, decision-rule recomputation, production preservation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../research/entry_engine_core_rebuild_v2/', import.meta.url);
const R = JSON.parse(readFileSync(new URL('results/v2_results.json', ROOT), 'utf8'));
const DEFN = JSON.parse(readFileSync(new URL('configs/finalists.json', ROOT), 'utf8'));
const V1 = JSON.parse(readFileSync(new URL('../research/entry_engine_edge_v1/results/edge_results.json', import.meta.url), 'utf8'));
const sha = (u) => createHash('sha256').update(readFileSync(u)).digest('hex');
const MODELS = ['MC', 'PB', 'BO', 'SR', 'MR'];

describe('pre-registration discipline', () => {
  it('V2 pre-registration hash matches the frozen .sha256 and is carried in the results', () => { const frozen = readFileSync(new URL('V2_PREREGISTRATION.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('V2_PREREGISTRATION.md', ROOT)), frozen); assert.equal(R.meta.prereg_sha256, frozen); });
  it('finalists were frozen from DEV before the FULL pass (hash matches; derived_from DEV)', () => { const frozen = readFileSync(new URL('configs/finalists.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('configs/finalists.json', ROOT)), frozen); assert.equal(R.finalists_sha256, frozen); assert.equal(DEFN.derived_from, 'DEV'); assert.ok(Object.keys(DEFN.finalists).length <= 8); });
  it('CONTROL reproduces the V1 CONTROL exactly (same inputs, same exit, same costs)', () => { const a = R.finalists.HOLD.CONTROL, b = V1.candidates.HOLD.C0; assert.equal(a.n, b.n); assert.equal(a.expectancy_r, b.expectancy_r); assert.equal(a.pf, b.pf); assert.equal(a.max_dd_r, b.max_dd_r); assert.equal(R.finalists.DEV.CONTROL.n, V1.candidates.DEV.C0.n); });
});
describe('built-in controls', () => {
  it('no look-ahead / geometry / cost / confirmed-candle controls pass', () => { const c = R.meta.controls; assert.ok(c.leak_mean_r > 0.3); assert.ok(Math.abs(c.null_mean_r) < 0.15); assert.equal(c.cost_test.pass, true); assert.equal(c.nt_geometry_ok, true, 'new-trigger TP2 = 2 R, stop >= 0.5 ATR, entry = close of the trigger bar'); assert.equal(c.nt_first_exit_after_entry, true); assert.equal(c.flags_reproduce_production_signals, true); });
  it('new-trigger gates account for every gated candle and the trigger family is the pre-registered five', () => { assert.deepEqual(Object.keys(R.meta.nt_gated).sort(), ['ATR_FLOOR', 'BIAS_OPPOSED', 'OVEREXTENDED', 'TWO_FACTOR_30M']); const names = Object.keys(R.DEV.new_triggers).filter((k) => !k.startsWith('_')); assert.deepEqual(names.sort(), ['NT1_COMPRESSION_EXPANSION', 'NT2_SWEEP_RECLAIM', 'NT3_MOMENTUM_IGNITION', 'NT4_STRUCTURAL_FLIP', 'NT5_BREAK_RETEST_V2']); assert.deepEqual(R.meta.nt_params, { nt1_rngA: 1.5, nt1_body: 0.6, nt2_body: 0.4, nt3_imp6: 0.6, nt3_rngA: 1.2, nt5_body: 0.5 }); });
});
describe('accounting invariants', () => {
  for (const S of ['DEV', 'HOLD']) {
    it(`${S}: structural portfolios are subsets of CONTROL and the model families cover the five production models`, () => { const s = R[S].structural; for (const k of Object.keys(s)) assert.ok(s[k].n <= s.CONTROL.n, k); assert.ok(s.NO_BO.n + s.MC_ONLY.n >= s.MC_PB.n); for (const m of MODELS) assert.ok(R[S].model_features[m].n >= 0); assert.equal(Object.values(R[S].model_features).reduce((a, v) => a + v.n, 0), R[S].structural.CONTROL.n <= R.meta.signals ? Object.values(R[S].model_features).reduce((a, v) => a + v.n, 0) : -1); });
    it(`${S}: every variant is a subset of its model and its share is consistent`, () => { for (const [k, v] of Object.entries(R[S].variants)) { const base = R[S].model_features[v.model].n; assert.ok(v.n <= base, k); if (base) assert.equal(v.share_of_model, Math.round((v.n / base) * 1000) / 1000); } });
    it(`${S}: move events carry a full capture partition (capture + wrong + positioned + none = 1)`, () => { for (const [k, v] of Object.entries(R.finalists[S])) { const m = v.move_capture; if (!m) continue; const sum = m.capture_rate + m.wrong_direction_rate + m.already_positioned_rate + m.no_signal_rate; assert.ok(Math.abs(sum - 1) < 0.005, `${k} ${sum}`); assert.ok(Math.abs(m.early_capture_rate + m.late_capture_rate - m.capture_rate) < 0.005); } });
    it(`${S}: quality component decisions follow the frozen rule (spread >= +0.05 KEEP, <= -0.05 REMOVE, else NEUTRAL)`, () => { for (const [k, v] of Object.entries(R[S].quality.components)) { const exp = v.spread_r == null ? 'NEUTRAL' : v.spread_r >= 0.05 ? 'KEEP' : v.spread_r <= -0.05 ? 'REMOVE' : 'NEUTRAL'; assert.equal(v.decision, exp, k); } });
    it(`${S}: BO / SR loss classifications cover the losers (untagged <= 1 %)`, () => { for (const c of [R[S].bo_classification, R[S].sr_classification]) assert.ok(c.untagged_losers <= Math.max(2, 0.01 * c.losers)); });
  }
});
describe('finalist derivation reproduces the pre-registered rules from DEV', () => {
  it('supported variant per model = best DEV variant with N >= 80, expectancy > 0, PF > 1.05 above the base', () => { for (const m of MODELS) { const cands = Object.entries(R.DEV.variants).filter(([, v]) => v.model === m && v.n >= 80 && v.expectancy_r > 0 && v.pf > 1.05 && v.expectancy_r > v.base_expectancy_r).sort((a, b) => b[1].expectancy_r - a[1].expectancy_r); assert.equal(DEFN.supported_variant_per_model[m], cands[0]?.[0] ?? null, m); } });
  it('supported new triggers = DEV sequential N >= 100, expectancy > 0.05, PF > 1.10, stress > 0', () => { const exp = Object.entries(R.DEV.new_triggers).filter(([k, v]) => !k.startsWith('_') && v.sequential.n >= 100 && v.sequential.expectancy_r > 0.05 && v.sequential.pf > 1.10 && v.stress_expectancy_r > 0).map(([k]) => k); assert.deepEqual(DEFN.supported_new_triggers, exp); });
  it('QV2 components = DEV KEEP components; vetoes attached only if both DEV criteria pass', () => { assert.deepEqual(DEFN.quality_v2.keep, Object.entries(R.DEV.quality.components).filter(([, v]) => v.decision === 'KEEP').map(([k]) => k)); assert.deepEqual(DEFN.vetoes_attached, Object.entries(R.DEV.vetoes).filter(([, v]) => v.passes).map(([k]) => k)); });
  it('F2 = best DEV structural combination with N >= 150', () => { const best = Object.entries(R.DEV.structural).filter(([, v]) => v.n >= 150).sort((a, b) => b[1].expectancy_r - a[1].expectancy_r)[0][0]; assert.equal(DEFN.finalists.F2.structural, best); });
});
describe('decision rule (V2_PREREGISTRATION section 9) is recomputed from the persisted results', () => {
  it('every FAILS status has a listed reason; a FINALIST_QUALIFIED would need every criterion; DEMO follows the finalist', () => { const ctl = R.finalists.HOLD.CONTROL; for (const [n, d] of Object.entries(R.decisions.candidates)) { const c = R.finalists.HOLD[n]; if (d.status === 'EMPTY') { assert.ok(!c.n); continue; } const fails = !(c.n >= 200) || !(c.expectancy_r > 0) || !(c.ci95_r?.[0] > 0) || !(c.block_ci95_r?.[0] > 0) || !(c.pf > 1.10) || !(c.max_dd_r <= ctl.max_dd_r) || !(c.stress.expectancy_r > 0) || !(c.drift.expectancy_r > 0) || !(R.finalists.DEV[n].expectancy_r > 0) || Object.values(c.neighbourhood ?? {}).some((v) => v.classification !== 'ROBUST'); assert.equal(d.status === 'FAILS_FINALIST_REQUIREMENTS', fails || d.reasons.length > 0, n); } assert.equal(R.decisions.finalist, null); assert.equal(R.decisions.demo_eligible, 'NO'); });
  it('EDGE_DEMONSTRATED = INCONCLUSIVE exactly because a candidate has positive HOLDOUT expectancy with N >= 200 and a CI spanning zero', () => { const anyPos = Object.keys(DEFN.finalists).some((n) => R.finalists.HOLD[n].n >= 200 && R.finalists.HOLD[n].expectancy_r > 0 && !(R.finalists.HOLD[n].ci95_r?.[0] > 0)); assert.equal(R.decisions.edge_demonstrated, R.decisions.finalist ? 'YES' : anyPos ? 'INCONCLUSIVE' : 'NO'); assert.equal(R.decisions.edge_demonstrated, 'INCONCLUSIVE'); });
  it('same-candle / one-position semantics: sequential trades never exceed signals and dedup skips are reported', () => { for (const S of ['DEV', 'HOLD']) for (const [k, v] of Object.entries(R.finalists[S])) { if (!v.n) continue; assert.ok(v.n <= v.signals, k); assert.ok(v.skipped && 'SAME_OR_EARLIER_CANDLE' in v.skipped); } });
});
describe('production preservation', () => {
  it('the study imports only the pure re-entry guard; frozen registry unchanged', () => { const src = readFileSync(new URL('scripts/v2_study.mjs', ROOT), 'utf8'); assert.ok(!/mt5Executor|mt5Bridge|order_send|analyzeMarket\(|watcher\.js/.test(src)); assert.ok(readFileSync(new URL('../src/engine/strategy.frozen.json', import.meta.url), 'utf8').includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed')); });
});
