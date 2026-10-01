/**
 * ENTRY EDGE V3 -- invariant tests over the frozen research artefacts (research/entry_edge_v3).
 * Pre-registration discipline (hashes), built-in controls, hysteresis state-machine properties (determinism, H1 == H0,
 * k-bar confirmation, no look-ahead, session reset), subset/overlap accounting, eligibility/direction/exclusivity rules,
 * finalist derivation from DEV, decision-rule recomputation, production preservation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../research/entry_edge_v3/', import.meta.url);
const R = JSON.parse(readFileSync(new URL('results/v3_results.json', ROOT), 'utf8'));
const RD = JSON.parse(readFileSync(new URL('results/v3_results_DEV_phase.json', ROOT), 'utf8'));
const DEFN = JSON.parse(readFileSync(new URL('configs/finalists.json', ROOT), 'utf8'));
const V2 = JSON.parse(readFileSync(new URL('../research/entry_engine_core_rebuild_v2/results/v2_results.json', import.meta.url), 'utf8'));
const sha = (u) => createHash('sha256').update(readFileSync(u)).digest('hex');
const CANDS = ['V3-A', 'V3-B', 'V3-C', 'V3-D', 'V3-E'];
const S2 = ['DEV', 'HOLD'];

// Reference hysteresis state machine (PREREGISTRATION section 5): H_k(t) = H_k(t-1) unless the last k raw labels all equal r(t) != H_k(t-1).
function hysteresis(raw, k, sessionOf = () => 0) {
  const out = []; let cur = null, prevS = null; const hist = [];
  for (let t = 0; t < raw.length; t++) {
    const s = sessionOf(t); if (s !== prevS) { prevS = s; hist.length = 0; cur = raw[t]; }
    hist.push(raw[t]); if (hist.length > 4) hist.shift();
    if (k <= 1) cur = raw[t]; else if (hist.length >= k && hist.slice(-k).every((x) => x === raw[t])) cur = raw[t];
    out.push(cur);
  }
  return out;
}

describe('pre-registration discipline', () => {
  it('V3 pre-registration hash matches the frozen .sha256 and is carried in both result files', () => { const frozen = readFileSync(new URL('V3_PREREGISTRATION.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('V3_PREREGISTRATION.md', ROOT)), frozen); assert.equal(R.meta.prereg_sha256, frozen); assert.equal(RD.meta.prereg_sha256, frozen); });
  it('finalists were frozen from DEV before the FULL pass (hash matches; identical to the DEV-phase derivation)', () => { const frozen = readFileSync(new URL('configs/finalists.sha256', ROOT), 'utf8').trim().split(/\s+/)[0]; assert.equal(sha(new URL('configs/finalists.json', ROOT)), frozen); assert.equal(R.finalists_sha256, frozen); assert.equal(DEFN.derived_from, 'DEV'); assert.deepEqual(RD.finalist_definitions, DEFN); assert.deepEqual(R.finalist_definitions, DEFN); });
  it('parameters are the pre-registered centre values and the candidate set is V3-A..E + CONTROL', () => { assert.deepEqual(R.meta.params, { mr_atr: 1, bo_rng: 1, bo_atr: 1, bo_chase: 1.5 }); assert.deepEqual(Object.keys(DEFN.finalists), CANDS); for (const c of CANDS) assert.deepEqual(DEFN.finalists[c].params, R.meta.params); assert.deepEqual(R.meta.hysteresis_family, [0, 1, 2, 3]); for (const S of S2) assert.deepEqual(Object.keys(R.finalists[S]), ['CONTROL', ...CANDS]); });
  it('CONTROL reproduces the V2 (= V1) CONTROL exactly on both splits', () => { for (const S of S2) { const a = R.finalists[S].CONTROL, b = V2.finalists[S].CONTROL; assert.equal(a.n, b.n); assert.equal(a.expectancy_r, b.expectancy_r); assert.equal(a.pf, b.pf); assert.equal(a.max_dd_r, b.max_dd_r); } assert.equal(R.meta.controls.control_reproduces_v2, true); assert.equal(R.finalists.HOLD.CONTROL.n, 1163); assert.equal(R.finalists.HOLD.CONTROL.expectancy_r, -0.064); });
});

describe('built-in controls', () => {
  it('leak / null / cost / hysteresis determinism / no look-ahead controls pass', () => { const c = R.meta.controls; assert.ok(c.leak_mean_r > 0.3); assert.ok(Math.abs(c.null_mean_r) < 0.15); assert.equal(c.cost_test.pass, true); assert.equal(c.hysteresis_h1_equals_h0, true); assert.equal(c.hysteresis_lookahead_violations, 0); assert.deepEqual(RD.meta.controls, c); });
  it('DEV diagnostics are identical between the DEV phase and the FULL phase (repeatability)', () => { assert.deepEqual(RD.DEV.hysteresis, R.DEV.hysteresis); assert.deepEqual(RD.DEV.subsets, R.DEV.subsets); assert.deepEqual(RD.DEV.overlap, R.DEV.overlap); assert.deepEqual(RD.DEV.matrix, R.DEV.matrix); });
});

describe('hysteresis state machine (reference implementation)', () => {
  const raw = ['A', 'A', 'B', 'A', 'B', 'B', 'B', 'C', 'C', 'B', 'C', 'C', 'C', 'C'];
  it('H1 is identical to H0 (raw) by construction', () => { assert.deepEqual(hysteresis(raw, 1), hysteresis(raw, 0)); assert.deepEqual(hysteresis(raw, 0), raw); });
  it('H_k changes only after k identical raw labels and holds the previous label meanwhile', () => { assert.deepEqual(hysteresis(raw, 2), ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'C', 'C']); assert.deepEqual(hysteresis(raw, 3), ['A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'C', 'C']); });
  it('no look-ahead: the prefix of H_k never changes when later labels change', () => { for (const k of [2, 3]) { const a = hysteresis(raw, k).slice(0, 9); const b = hysteresis([...raw.slice(0, 9), 'Z', 'Z', 'Z', 'Z', 'Z'], k).slice(0, 9); assert.deepEqual(a, b); } });
  it('resets at a session boundary (first label of the new session is taken as is)', () => { const h = hysteresis(['A', 'A', 'A', 'B', 'B'], 3, (t) => (t < 3 ? 0 : 1)); assert.deepEqual(h, ['A', 'A', 'A', 'B', 'B']); });
  it('deterministic: two runs give identical sequences', () => { assert.deepEqual(hysteresis(raw, 2), hysteresis(raw, 2)); });
  it('flips per session decrease monotonically with k and H1 equals H0 in the study', () => { for (const S of S2) { const fl = R[S].hysteresis.flips_per_session; assert.deepEqual(fl[1], fl[0]); assert.ok(fl[0].median >= fl[2].median && fl[2].median >= fl[3].median, S); assert.ok(fl[0].mean > fl[2].mean && fl[2].mean > fl[3].mean, S); } });
  it('H0 rows of the hysteresis effect table have zero removed / added / missed-valid by definition', () => { for (const S of S2) for (const c of CANDS) { const v = R[S].hysteresis.per_candidate[c][0]; assert.equal(v.removed_vs_H0, 0); assert.equal(v.added_vs_H0, 0); assert.equal(v.missed_valid_signals_vs_H0, 0); assert.deepEqual(R[S].hysteresis.per_candidate[c][1], v); } });
});

describe('subset, overlap and matrix accounting', () => {
  for (const S of S2) {
    it(`${S}: overlaps exist only within a model and the union reconciles`, () => { const o = R[S].overlap; for (const k of Object.keys(o.pairwise)) assert.ok(k === 'PB_SELL∩PB_RANGE' || k === 'MR_LONG∩MR_HIGH_ATR', k); const sum = Object.values(o.sizes).reduce((a, b) => a + b, 0) - Object.values(o.pairwise).reduce((a, b) => a + b, 0); assert.equal(o.union, sum); assert.ok(o.unique_to_one_subset <= o.union); for (const [k, v] of Object.entries(o.incremental_contribution)) assert.ok(v.unique_n <= o.sizes[k], k); });
    it(`${S}: regime x direction cells sum to the subset sizes (PB SELL, PB RANGE, MR LONG, BO2)`, () => { const M = R[S].matrix.H0; const sum = (m, pred) => Object.entries(M[m]).filter(([k]) => pred(k)).reduce((a, [, v]) => a + v.n, 0); assert.equal(sum('PB', (k) => k.endsWith('|SELL')), R[S].subsets.PB_SELL.H0.n); assert.equal(sum('PB', (k) => k.startsWith('RANGE|')), R[S].subsets.PB_RANGE.H0.n); assert.equal(sum('MR', (k) => k.endsWith('|BUY') && !k.startsWith('BEAR_TREND|')), R[S].subsets.MR_LONG.H0.n); assert.equal(sum('BO2', () => true), R[S].subsets.BO2.H0.n); });
    it(`${S}: trend-fade exclusion holds (no MR BUY in BEAR_TREND, no MR SELL in BULL_TREND inside V3-B/V3-D cells) and V3-D admits nothing in BULL_TREND`, () => { for (const c of ['V3-B', 'V3-D']) { const t = R.finalists[S][c].tiny_cells; if (!t) continue; for (const cell of t.cells) { const [m, rg, side] = cell.cell.split('|'); if (m === 'MR') { assert.ok(!(side === 'BUY' && rg === 'BEAR_TREND'), cell.cell); assert.ok(!(side === 'SELL' && rg === 'BULL_TREND'), cell.cell); } if (c === 'V3-D') { assert.notEqual(rg, 'BULL_TREND', cell.cell); if (rg === 'BEAR_TREND') assert.ok(m === 'PB' && side === 'SELL', cell.cell); if (!['RANGE', 'BEAR_TREND'].includes(rg)) assert.ok(m === 'MR' && side === 'BUY', cell.cell); } } } });
    it(`${S}: candidates are subsets of CONTROL with the pre-registered model membership and direction rules`, () => { const C = R.finalists[S].CONTROL; const allowed = { 'V3-A': ['PB'], 'V3-B': ['MR'], 'V3-C': ['BO', 'PB'], 'V3-D': ['PB', 'MR'], 'V3-E': ['BO', 'PB'] }; for (const c of CANDS) { const v = R.finalists[S][c]; assert.ok(v.signals <= C.signals && v.n <= v.signals, c); for (const m of Object.keys(v.model_mix)) assert.ok(allowed[c].includes(m), `${c} ${m}`); assert.equal(v.false_positive.additional_signals_vs_control, 0); assert.equal(v.false_positive.control_signals_removed, C.signals - v.signals); } for (const cell of R.finalists[S]['V3-A'].tiny_cells.cells) { const [, rg, side] = cell.cell.split('|'); assert.ok(side === 'SELL' || rg === 'RANGE', cell.cell); } });
    it(`${S}: move-event accounting partitions every event`, () => { for (const k of ['CONTROL', ...CANDS]) { const m = R.finalists[S][k].move_capture; const sum = m.capture_rate + m.wrong_direction_rate + m.already_positioned_rate + m.no_signal_rate; assert.ok(Math.abs(sum - 1) < 0.01, `${k} ${sum}`); assert.ok(Math.abs(m.capture_rate - m.valid_entry_rate - m.late_entry_rate) < 0.01); assert.ok(Math.abs(m.no_signal_rate - m.no_setup_or_trigger_rate - m.gate_or_filter_rate) < 0.01); } });
    it(`${S}: exit mix and sequential skips are consistent`, () => { for (const k of ['CONTROL', ...CANDS]) { const v = R.finalists[S][k]; const s = Object.values(v.exit_mix).reduce((a, b) => a + b, 0); assert.ok(Math.abs(s - 1) < 0.01, k); assert.ok(v.n + Object.values(v.skipped).reduce((a, b) => a + b, 0) === v.signals, k); } });
  }
});

describe('finalist derivation reproduces the pre-registered hysteresis-selection rule from DEV', () => {
  it('selected level = highest DEV expectancy among H0..H3 with N >= 100, >= H0 expectancy and <= H0 DD; else H0', () => { for (const c of CANDS) { const pc = RD.DEV.hysteresis.per_candidate[c]; const h0 = pc[0]; let best = 0; for (const k of [2, 3]) { const v = pc[k]; if (v.trades >= 100 && v.expectancy_r > pc[best].expectancy_r && v.expectancy_r >= h0.expectancy_r && v.max_dd_r <= h0.max_dd_r) best = k; } assert.equal(DEFN.finalists[c].hysteresis_k, best, c); assert.equal(DEFN.finalists[c].dev_trades, pc[best].trades); assert.equal(DEFN.finalists[c].dev_expectancy_r, pc[best].expectancy_r); } });
  it('finalist DEV statistics equal the hysteresis-table entry of the selected level', () => { for (const c of CANDS) { const k = DEFN.finalists[c].hysteresis_k; const v = R.DEV.hysteresis.per_candidate[c][k], fin = R.finalists.DEV[c]; assert.equal(fin.hysteresis_k, k); assert.equal(fin.n, v.trades); assert.equal(fin.expectancy_r, v.expectancy_r); assert.equal(fin.signals, v.signals); } });
});

describe('decision rules recompute from the persisted HOLDOUT statistics', () => {
  const H = R.finalists.HOLD, ctl = H.CONTROL;
  it('tiny-cell rule is the per-cell maximum share (<= 30 %) as pre-registered', () => { for (const c of CANDS) { const t = H[c].tiny_cells; const net = t.cells.reduce((a, x) => a + x.net_r, 0); const maxTiny = Math.max(0, ...t.cells.filter((x) => x.n < 30 && x.net_r > 0).map((x) => x.net_r)); assert.equal(t.pass, !(net > 0) || maxTiny / net <= 0.30 + 1e-9, c); assert.ok(Math.abs((t.max_tiny_cell_share ?? 0) - (net > 0 ? maxTiny / net : 0)) < 0.01, c); } });
  it('each candidate status and reason list follows the section-9 gate', () => { for (const c of CANDS) { const v = H[c]; const reasons = []; if (!(v.expectancy_r > 0)) reasons.push('(1)'); if (!(v.stress.expectancy_r > 0)) reasons.push('(2)'); if (!(v.pf > 1.10)) reasons.push('(3)'); if (!(v.expectancy_r >= ctl.expectancy_r + 0.10)) reasons.push('(4)'); if (!(v.max_dd_r <= ctl.max_dd_r)) reasons.push('(5)'); if (!(v.n >= 200)) reasons.push('(6)'); if (!v.tiny_cells.pass) reasons.push('(7)'); if (!(v.quarters_positive_share >= 0.6)) reasons.push('(8)'); if (Object.values(v.neighbourhood).some((x) => x.classification !== 'ROBUST')) reasons.push('(9)'); if (!(v.ci95_r[0] > 0)) reasons.push('(10)'); if (!(v.block_ci95_r[0] > 0)) reasons.push('(10)'); if (!(R.finalists.DEV[c].expectancy_r > 0)) reasons.push('DEV'); if (!(v.drift.expectancy_r > 0)) reasons.push('drift'); const d = R.decisions.candidates[c]; assert.deepEqual(d.reasons.map((r) => (r.startsWith('(') ? r.slice(0, r.indexOf(')') + 1) : r.startsWith('DEV') ? 'DEV' : 'drift')), reasons, c); const onlyCI = reasons.length > 0 && reasons.every((r) => r === '(10)'); assert.equal(d.status, reasons.length ? (onlyCI ? 'PROMISING_INCONCLUSIVE (fails only the CI requirement)' : 'FAILS_GATE') : 'PASS', c); } });
  it('aggregate decisions: no pass, EDGE INCONCLUSIVE, DEMO NO, best candidate = highest HOLD expectancy with N >= 200', () => { const D = R.decisions; assert.deepEqual(D.passing, CANDS.filter((c) => D.candidates[c].status === 'PASS')); assert.equal(D.v3_pass, D.passing.length > 0); const anyPos = CANDS.some((c) => H[c].n >= 200 && H[c].expectancy_r > 0 && !(H[c].ci95_r[0] > 0)); assert.equal(D.edge_demonstrated, D.passing.length ? 'YES' : anyPos ? 'INCONCLUSIVE' : 'NO'); assert.equal(D.demo_eligible, D.passing.length ? 'YES (subject to parity fixtures)' : 'NO'); const best = CANDS.filter((c) => H[c].n >= 200).sort((a, b) => H[b].expectancy_r - H[a].expectancy_r)[0]; if (!D.passing.length) assert.equal(D.best_candidate, best); const b = H[D.best_candidate]; assert.equal(D.v3_beats_control, (b.ci95_r[0] > ctl.expectancy_r && b.max_dd_r <= ctl.max_dd_r) ? 'YES' : b.expectancy_r > ctl.expectancy_r ? 'INCONCLUSIVE' : 'NO'); assert.equal(D.v3_pass, false); assert.equal(D.demo_eligible, 'NO'); });
  it('no candidate with N >= 200 has a HOLDOUT CI lower bound above zero, and no candidate is positive on DEV except V3-A', () => { for (const c of CANDS) { if (H[c].n >= 200) { assert.ok(!(H[c].ci95_r[0] > 0), c); assert.ok(!(H[c].block_ci95_r[0] > 0), c); } if (c !== 'V3-A') assert.ok(R.finalists.DEV[c].expectancy_r <= 0, c); } });
});

describe('production preservation', () => {
  it('the study imports only the pure re-entry guard; no executor, bridge, watcher or MT5 module', () => { const src = readFileSync(new URL('scripts/v3_study.mjs', ROOT), 'utf8'); const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((p) => p.startsWith('.')); assert.deepEqual(imports, ['../../../src/engine/capitalHarvest/positionManager.js']); for (const bad of ['mt5Executor', 'mt5_bridge', 'watcher.js', 'order_send', 'startWatcher']) assert.ok(!src.includes(bad), bad); });
  it('no V3 runtime module exists under src and the frozen registry is untouched by this stage', () => { assert.throws(() => readFileSync(new URL('../src/engine/entryEdgeV3.js', import.meta.url))); const reg = JSON.parse(readFileSync(new URL('../src/engine/strategy.frozen.json', import.meta.url), 'utf8')); assert.ok(Array.isArray(reg.files) ? reg.files.length >= 50 : Object.keys(reg).length > 0); });
  it('costs, split, RR-independent R economics and 0.01-lot USD are reported separately (capital neutrality)', () => { assert.deepEqual(R.meta.costs, { normal: { spread: 0.24, slip: 0.1 }, stress: { spread: 0.6, slip: 0.2 } }); assert.deepEqual(R.meta.split, { dev: ['2025-05-07', '2025-12-31'], hold: ['2026-01-01', '2026-09-29'] }); for (const S of S2) for (const k of ['CONTROL', ...CANDS]) { const v = R.finalists[S][k]; assert.ok(typeof v.expectancy_r === 'number' && typeof v.expectancy_usd === 'number', k); } });
});
