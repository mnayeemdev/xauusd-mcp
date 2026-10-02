/**
 * V13 CORE EDGE RECONSTRUCTION (2026-10-02) -- deterministic tests for the lean strategy audit (RESEARCH ONLY; no order code).
 * Pre-registered groupings use only pre-entry attributes; decision rules (strategy, stage, cost, direction, sample, final);
 * no hindsight; holdout isolation (candidates come from DEV only); replay parity; research boundaries.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPINGS, MIN_N, COSTS, stageClass, meetsEdge, strategyStatus, costLabel, directionClass, sampleLabel, finalStatus } from '../research/core_edge_v13/scripts/lean.mjs';
import { entryFromRow } from '../research/entry_risk_integration_v11/scripts/integrate.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)); const V13 = join(ROOT, 'research', 'core_edge_v13');
const row = (o = {}) => ({ i: 1000, t: 1767690000, act: 'BUY', mdl: 'BO', cs: 'BUY', anc: 3998, st5: 'BULLISH', b15: 'BULLISH', ev5: ['BOS', 'B', 995, 3998], g: { e: 4000, sl: 3995, tp2: 4010, rr: 2, ra: 1.0, src: 'candidate_anchor' }, ...o });
const G = (name, r) => GROUPINGS[name](r, entryFromRow(r));
const ci = (mean, lo, hi) => ({ mean, lo, hi });
const split = (o = {}) => ({ entries: { n: 500, gross: ci(0.2, 0.05, 0.35), normal: ci(0.12, 0.01, 0.25), stress_mean: 0.03, ...o.entries }, walk: { normal_expectancy: 0.1, ...o.walk } });

describe('pre-registered groupings (existing pre-entry attributes only)', () => {
  it('six groupings, fixed levels', () => {
    assert.deepEqual(Object.keys(GROUPINGS), ['DIRECTION', 'LOCATION', 'STRUCTURE', 'PATTERN_EVENT', 'SL_SOURCE', 'BIAS']);
    assert.equal(G('DIRECTION', row()), 'BUY'); assert.equal(G('DIRECTION', row({ act: 'SELL', cs: 'SELL', g: { e: 4000, sl: 4005, ra: 1 } })), 'SELL');
    assert.equal(G('LOCATION', row()), 'VALID_LE_2.0'); assert.equal(G('LOCATION', row({ anc: 3989 })), 'MARGINAL_2.0_2.5');
    assert.equal(G('STRUCTURE', row()), 'ALIGNED'); assert.equal(G('STRUCTURE', row({ st5: 'BEARISH' })), 'COUNTER'); assert.equal(G('STRUCTURE', row({ st5: null })), null);
    assert.equal(G('PATTERN_EVENT', row()), 'BOS'); assert.equal(G('PATTERN_EVENT', row({ ev5: ['CHOCH', 'S', 1, 2] })), 'CHOCH'); assert.equal(G('PATTERN_EVENT', row({ ev5: null })), null);
    assert.equal(G('SL_SOURCE', row()), 'candidate_anchor');
    assert.equal(G('BIAS', row()), 'ALIGNED'); assert.equal(G('BIAS', row({ b15: 'NEUTRAL' })), 'NEUTRAL'); assert.equal(G('BIAS', row({ b15: 'BEARISH' })), 'OPPOSED'); assert.equal(G('BIAS', row({ b15: null })), null);
    assert.equal(GROUPINGS.BIAS(row({ act: 'SELL', b15: 'BEARISH' }), { side: 'SELL' }), 'ALIGNED');
  });
  it('no hindsight: groupings ignore every outcome field (adding future / outcome data never changes a level)', () => {
    const base = row(); const withFuture = { ...row(), hyp_r: 3, mfe: 5, mae: 0.1, exit: 'TARGET_170R', future_close: 9999 };
    for (const k of Object.keys(GROUPINGS)) assert.equal(G(k, withFuture), G(k, base), k);
    const src = readFileSync(join(V13, 'scripts', 'lean.mjs'), 'utf8'); for (const bad of ['mfe', 'mae', 'exitBar', 'pnl', 'outcome', 'future']) assert.ok(!new RegExp(`row\\.${bad}`, 'i').test(src), bad);
  });
});

describe('decision rules', () => {
  it('stage class: DEMONSTRATED only above 0 on both splits; NEGATIVE only below 0 on both', () => {
    assert.equal(stageClass(ci(0.1, 0.01, 0.2), ci(0.1, 0.02, 0.2)), 'DEMONSTRATED'); assert.equal(stageClass(ci(0.1, 0.01, 0.2), ci(0.1, -0.01, 0.2)), 'NOT_DEMONSTRATED');
    assert.equal(stageClass(ci(-0.1, -0.2, -0.01), ci(-0.1, -0.2, -0.02)), 'NEGATIVE_REPLICATED'); assert.equal(stageClass(ci(0.1, 0.01, 0.2), ci(-0.1, -0.2, -0.01)), 'NOT_DEMONSTRATED');
  });
  it('edge criteria: sample >= 100, gross and normal CI above 0, stress mean above 0, and (strategy) a positive walk -- on BOTH splits', () => {
    assert.equal(MIN_N, 100); assert.equal(meetsEdge(split().entries), true); assert.equal(meetsEdge({ ...split().entries, n: 99 }), false); assert.equal(meetsEdge({ ...split().entries, stress_mean: -0.01 }), false); assert.equal(meetsEdge({ ...split().entries, normal: ci(0.1, -0.01, 0.2) }), false);
    assert.equal(strategyStatus(split(), split()), 'EDGE_DEMONSTRATED'); assert.equal(strategyStatus(split(), split({ walk: { normal_expectancy: -0.01 } })), 'EDGE_NOT_DEMONSTRATED');
    assert.equal(strategyStatus(split(), split({ entries: { gross: ci(0.2, -0.01, 0.4) } })), 'EDGE_NOT_DEMONSTRATED'); assert.equal(strategyStatus(split({ entries: { n: 80 } }), split()), 'INSUFFICIENT_EVIDENCE');
  });
  it('cost label: zero gross that costs make negative = NO_COST_RESILIENT_EDGE', () => {
    assert.equal(costLabel({ gross: ci(0.01, -0.1, 0.1), normal: ci(-0.08, -0.2, 0.02), stress_mean: -0.3 }), 'NO_COST_RESILIENT_EDGE');
    assert.equal(costLabel({ gross: ci(0.2, 0.05, 0.3), normal: ci(0.1, 0.01, 0.2), stress_mean: 0.02 }), 'COST_RESILIENT'); assert.equal(costLabel({ gross: ci(0.2, 0.05, 0.3), normal: ci(0.05, -0.02, 0.1), stress_mean: -0.1 }), 'GROSS_EDGE_NOT_COST_RESILIENT');
    assert.equal(costLabel({ gross: ci(-0.2, -0.3, -0.05), normal: ci(-0.3, -0.4, -0.2), stress_mean: -0.5 }), 'NEGATIVE_GROSS'); assert.equal(costLabel({ gross: ci(0.1, -0.1, 0.3), normal: ci(0.02, -0.1, 0.2), stress_mean: -0.1 }), 'NOT_DEMONSTRATED');
  });
  it('direction: only a CI-separated difference on BOTH splits counts; a sign flip is NO_DIRECTION_EDGE', () => {
    assert.equal(directionClass(ci(0.2, 0.01, 0.4), ci(-0.2, -0.3, -0.02)), 'NO_DIRECTION_EDGE'); assert.equal(directionClass(ci(0.2, 0.01, 0.4), ci(0.2, 0.02, 0.4)), 'BUY_BETTER_REPLICATED'); assert.equal(directionClass(ci(-0.2, -0.4, -0.01), ci(-0.2, -0.4, -0.02)), 'SELL_BETTER_REPLICATED');
  });
  it('sample label and final status', () => {
    assert.equal(sampleLabel(150, 99), 'INSUFFICIENT_EVIDENCE'); assert.equal(sampleLabel(100, 100), 'SUFFICIENT');
    assert.equal(finalStatus({ combinedStatus: 'EDGE_NOT_DEMONSTRATED', strategyStatuses: ['EDGE_NOT_DEMONSTRATED'], survivingCandidates: 0 }), 'EDGE_NOT_DEMONSTRATED');
    assert.equal(finalStatus({ combinedStatus: 'EDGE_NOT_DEMONSTRATED', strategyStatuses: ['EDGE_DEMONSTRATED'], survivingCandidates: 0 }), 'EDGE_PARTIALLY_DEMONSTRATED');
    assert.equal(finalStatus({ combinedStatus: 'EDGE_NOT_DEMONSTRATED', strategyStatuses: [], survivingCandidates: 1 }), 'EDGE_PARTIALLY_DEMONSTRATED');
    assert.equal(finalStatus({ combinedStatus: 'EDGE_DEMONSTRATED', strategyStatuses: [], survivingCandidates: 0 }), 'EDGE_DEMONSTRATED'); assert.equal(finalStatus({ combinedStatus: 'INSUFFICIENT_EVIDENCE', strategyStatuses: [], survivingCandidates: 0 }), 'INSUFFICIENT_EVIDENCE');
  });
  it('cost bases are the pre-registered levels', () => { assert.deepEqual(COSTS, { GROSS: { spread: 0, slip: 0 }, NORMAL: { spread: 0.24, slip: 0.10 }, STRESS: { spread: 0.60, slip: 0.60 } }); });
});

describe('research boundaries and frozen results', () => {
  it('no execution code; no new indicators or filters', () => {
    for (const f of ['lean.mjs', 'v13_study.mjs', 'write_reports.mjs']) { const p = join(V13, 'scripts', f); if (!existsSync(p)) continue; const s = readFileSync(p, 'utf8');
      for (const bad of ['mt5Executor', 'mt5Bridge', 'order_send', "request('open'", 'watcher.js', 'child_process', 'REAL_ACCOUNT', 'silver', 'DXY', 'rsi(', 'macd', 'capitalHarvest = true']) assert.ok(!s.toLowerCase().includes(bad.toLowerCase()), `${f}: ${bad}`); }
  });
  it('frozen study (local, skipped when absent): prereg, freeze, holdout isolation, replay parity, decision consistent', { skip: !existsSync(join(V13, 'results', 'v13_results_FULL.json')) }, () => {
    const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'); assert.equal(sha(join(V13, 'V13_PREREGISTRATION.md')), readFileSync(join(V13, 'V13_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]);
    const r = JSON.parse(readFileSync(join(V13, 'results', 'v13_results_FULL.json'), 'utf8')); for (const [k, f] of [['lean_sha', 'lean.mjs'], ['study_sha', 'v13_study.mjs']]) assert.equal(r.freeze[k], sha(join(V13, 'scripts', f)), k);
    const dev = JSON.parse(readFileSync(join(V13, 'results', 'v13_dev.json'), 'utf8')); assert.deepEqual(r.freeze.candidates_frozen, dev.subgroups_passing_dev, 'candidates come from DEV only');
    assert.deepEqual(Object.keys(r.decision.candidates_holdout), r.freeze.candidates_frozen);
    assert.equal(r.replay.ok, true); assert.equal(r.replay.deterministic_rerun, true); for (const S of ['DEV', 'HOLD']) { assert.equal(r.replay.parity[S].model_mix_equal, true); assert.equal(r.replay.parity[S].v12_probe_edge_max_abs_diff, 0); }
    assert.ok(['EDGE_DEMONSTRATED', 'EDGE_PARTIALLY_DEMONSTRATED', 'EDGE_NOT_DEMONSTRATED', 'INSUFFICIENT_EVIDENCE'].includes(r.decision.EDGE_STATUS));
    assert.equal(r.decision.STOP_COMPLEXITY_RECOMMENDATION, r.decision.EDGE_STATUS === 'EDGE_NOT_DEMONSTRATED'); if (r.decision.CORRECTION_CANDIDATE === 'NONE') assert.ok(Object.values(r.decision.candidates_holdout).every((c) => !c.survives));
  });
});
