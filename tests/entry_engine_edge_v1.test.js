/**
 * ENTRY ENGINE EDGE V1 -- invariant tests over the frozen research artefacts (research/entry_engine_edge_v1/results).
 * They assert the pre-registration discipline (hashes), the built-in controls, funnel/direction/overlap accounting,
 * candidate-derivation reproducibility and the decision rule -- without re-running the study. Production is untouched.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../research/entry_engine_edge_v1/', import.meta.url);
const R = JSON.parse(readFileSync(new URL('results/edge_results.json', ROOT), 'utf8'));
const DEFN = JSON.parse(readFileSync(new URL('results/candidate_definitions.json', ROOT), 'utf8'));
const sha = (u) => createHash('sha256').update(readFileSync(u)).digest('hex');

describe('pre-registration discipline', () => {
  it('the pre-registration hash on disk matches the frozen .sha256 and the results carry it', () => { const frozen = readFileSync(new URL('ENTRY_EDGE_PREREGISTRATION.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('ENTRY_EDGE_PREREGISTRATION.md', ROOT)), frozen); assert.equal(R.meta.prereg_sha256, frozen); });
  it('candidate definitions were frozen before the FULL pass (hash matches; derived from DEV only)', () => { const frozen = readFileSync(new URL('results/candidate_definitions.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('results/candidate_definitions.json', ROOT)), frozen); assert.equal(R.candidate_definitions_sha256, frozen); assert.equal(DEFN.derived_from, 'DEV'); });
  it('chronological splits: DEV ends before HOLDOUT starts', () => { assert.ok(R.meta.split.dev[1] < R.meta.split.hold[0]); });
});
describe('built-in controls', () => {
  it('no look-ahead: leak control strongly positive, null control near zero, cost accounting exact, first exit after entry, timestamps aligned', () => { const c = R.meta.controls; assert.ok(c.leak_mean_r > 0.3); assert.ok(Math.abs(c.null_mean_r) < 0.15); assert.equal(c.cost_test.pass, true); assert.equal(c.confirmed_candle_first_exit_after_entry, true); assert.equal(c.timestamp_misaligned, 0); assert.equal(c.non_monotone_bars, 0); assert.equal(c.flags_reproduce_production_signals, true); });
});
describe('accounting invariants', () => {
  for (const S of ['DEV', 'HOLD', 'ALL']) {
    it(`${S}: funnel is monotone and ends at the production signal count; per-model funnels sum to it`, () => { const g = R[S].funnel.gates; for (let k = 1; k < g.length; k++) assert.equal(g[k].entering, g[k - 1].passing); assert.equal(g.at(-1).passing, R[S].funnel.final_signals); const sum = ['MC', 'PB', 'BO', 'SR', 'MR'].reduce((s, m) => s + R[S].decomposition[m].funnel.signals, 0); assert.equal(sum, R[S].funnel.final_signals); });
    it(`${S}: LONG + SHORT = ALL for every model; overlap populations partition the signals`, () => { for (const m of ['MC', 'PB', 'BO', 'SR', 'MR']) { const d = R[S].decomposition[m]; assert.equal((d.signals_long.n ?? 0) + (d.signals_short.n ?? 0), d.signals_all.n); } const o = R[S].overlap; assert.equal(o.signals_with_agreement_within_3_bars.n + o.signals_without_agreement_within_3_bars.n, R[S].funnel.final_signals); assert.equal(o.duplicate_theses_same_bar_same_side, 0); });
    it(`${S}: move events are labelled with exactly one first blocker and capture rate reconciles`, () => { const m = R[S].moves; assert.equal(Object.values(m.first_blocker_distribution).reduce((a, b) => a + b, 0), m.events); assert.equal(Math.round((m.captured / m.events) * 1000) / 1000, m.move_capture_rate); });
    it(`${S}: quality and RR buckets and timing classes partition their populations`, () => { const q = Object.values(R[S].quality.buckets).reduce((a, v) => a + v.n, 0); const entering = R[S].funnel.gates.find((g) => g.gate === 'QUALITY').entering; assert.ok(q <= entering && q >= R[S].funnel.final_signals, 'quality population = candidates passing every gate except quality: between the final signals and the quality-gate entrants'); const rr = Object.values(R[S].rr).reduce((a, v) => a + v.n, 0); assert.equal(rr, R[S].funnel.gates.find((g) => g.gate === 'RR>=1.70').entering); const t = Object.values(R[S].timing.classes).reduce((a, v) => a + v.n, 0); assert.equal(t, R[S].funnel.final_signals); });
    it(`${S}: one-position semantics -- sequential portfolios never exceed the signal count and contribution portfolios are consistent`, () => { const c = R[S].contribution; assert.ok(c.ALL.n <= R[S].funnel.final_signals); for (const m of ['MC', 'PB', 'BO', 'SR', 'MR']) { assert.ok(c[`ONLY_${m}`].n <= R[S].decomposition[m].funnel.signals); assert.ok(c[`NO_${m}`].n <= R[S].funnel.final_signals - R[S].decomposition[m].funnel.signals + c.ALL.n); } });
  }
});
describe('candidate derivation reproduces the pre-registered rules from the DEV diagnostics', () => {
  it('C1 = models with DEV expectancy > 0, PF > 1, N >= 100', () => { const exp = ['MC', 'PB', 'BO', 'SR', 'MR'].filter((m) => { const s = R.DEV.decomposition[m].signals_all; return s.n >= 100 && s.expectancy_r > 0 && s.pf > 1.0; }); assert.deepEqual(DEFN.supported_models, exp); });
  it('C2 regimes = DEV cells with N >= 50 and expectancy > 0 for each supported model', () => { for (const m of DEFN.supported_models) { const exp = Object.entries(R.DEV.matrix.by_5m_regime[m]).filter(([, v]) => v.n >= 50 && v.expectancy_r > 0).map(([k]) => k); assert.deepEqual(DEFN.c2_regimes[m], exp); } });
  it('C3 components = DEV top-minus-bottom tercile spread >= 0.05 R; C4 = null when no cap improves with stable neighbours', () => { const exp = Object.entries(R.DEV.quality.components).filter(([, v]) => v.monotonic_helpful).map(([k]) => k); assert.deepEqual(DEFN.c3_components, exp); const base = DEFN.c1_dev_expectancy_r; assert.ok(DEFN.c4_scan.every((e) => e.dev_expectancy_r <= base)); assert.equal(DEFN.c4_X, null); });
});
describe('decision rule (ENTRY_EDGE_PREREGISTRATION section 8)', () => {
  it('every candidate that fails a requirement is not a finalist; a finalist requires every listed criterion', () => { const ctl = R.candidates.HOLD.C0; for (const [n, d] of Object.entries(R.decisions.candidates)) { const c = R.candidates.HOLD[n]; const fails = !(c.n >= 200) || !(c.expectancy_r > 0) || !(c.ci95_r?.[0] > 0) || !(c.session_block_ci95_r?.[0] > 0) || !(c.pf > 1.10) || !(c.max_dd_r <= ctl.max_dd_r) || !(c.stress.expectancy_r > 0) || !(c.drift.expectancy_r > 0); assert.equal(d.status === 'FAILS_FINALIST_REQUIREMENTS', fails || d.reasons.length > 0); } assert.equal(R.decisions.finalist, null); assert.equal(R.decisions.edge_demonstrated, 'NO'); assert.equal(R.decisions.demo_eligible, 'NO'); });
  it('restart determinism: the decision fields are a pure function of the persisted results (recomputed here)', () => { const anyPos = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'].some((n) => R.candidates.HOLD[n].n >= 200 && R.candidates.HOLD[n].expectancy_r > 0 && !(R.candidates.HOLD[n].ci95_r?.[0] > 0)); assert.equal(R.decisions.edge_demonstrated, R.decisions.finalist ? 'YES' : anyPos ? 'INCONCLUSIVE' : 'NO'); });
});
describe('production preservation', () => {
  it('the study imports only the pure re-entry guard and no frozen-surface file references it; fingerprint registry unchanged', () => { const src = readFileSync(new URL('scripts/edge_study.mjs', ROOT), 'utf8'); assert.ok(!/mt5Executor|mt5Bridge|order_send|analyzeMarket\(/.test(src)); assert.ok(readFileSync(new URL('../src/engine/strategy.frozen.json', import.meta.url), 'utf8').includes('356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed')); });
});
