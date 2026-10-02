/**
 * V13 CORE EDGE RECONSTRUCTION -- lean strategy audit runner (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED).
 * Spec: ../V13_PREREGISTRATION.md (hash asserted). EDGE_PHASE=DEV: DEV audit, subgroup screen -> configs/v13_freeze.json.
 * EDGE_PHASE=FULL: freeze verified; DEV + HOLDOUT; stage / cost / direction / location tests; candidates; replay; decision.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { simulateTrade, SWAP_PER_NIGHT } from '../../capital_harvest_v9/scripts/harvest.mjs';
import { loadContext } from '../../risk_capital_v10/scripts/sim.mjs';
import { entryFromRow } from '../../entry_risk_integration_v11/scripts/integrate.mjs';
import { MODELS, STAGES, stagesReached, probe, dayBlockCI, summarizeR } from '../../entry_edge_risk_v12/scripts/isolation.mjs';
import { COSTS, GROUPINGS, MIN_N, stageClass, meetsEdge, strategyStatus, costLabel, directionClass, sampleLabel, finalStatus } from './lean.mjs';

const PHASE = process.env.EDGE_PHASE === 'FULL' ? 'FULL' : 'DEV';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const OUT = join(ROOT, 'results'); const CFG = join(ROOT, 'configs'); mkdirSync(OUT, { recursive: true }); mkdirSync(CFG, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex'); const shaFile = (p) => sha(readFileSync(p));
if (shaFile(join(ROOT, 'V13_PREREGISTRATION.md')) !== readFileSync(join(ROOT, 'V13_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('V13_PREREGISTRATION hash mismatch');
const V12 = join(REPO, 'research', 'entry_edge_risk_v12'); const V12FZ = JSON.parse(readFileSync(join(V12, 'configs', 'v12_freeze.json'), 'utf8'));
if (shaFile(join(V12, 'scripts', 'isolation.mjs')) !== V12FZ.isolation_sha) throw new Error('V12 isolation helpers changed');
const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000); const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null); const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const ci = (c) => ({ mean: r4(c.mean), lo: r4(c.lo), hi: r4(c.hi), n: c.n, days: c.days });
const { bars: B, F } = loadContext(); const BASE = { kind: 'BASELINE' };
const swapOz = (t, exitBar) => { if (t.side !== 'BUY') return 0; let n = 0; for (let j = t.i + 1; j <= exitBar; j++) if (Math.floor(B[j].time / 86400) !== Math.floor(B[j - 1].time / 86400)) n++; return n * SWAP_PER_NIGHT; };
const sim = (t, c) => simulateTrade(B, F, t, BASE, c); const bad = (o) => o.status === 'NO_DATA' || o.status === 'INVALID';

function loadRows(S) { const rows = []; for (const l of readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n')) if (l) rows.push(JSON.parse(l)); return rows.sort((a, b) => a.i - b.i); }
/** Every valid entry with GROSS / NORMAL / STRESS outcome of its own geometry. */
function entryOutcomes(rows) { const out = []; for (const row of rows) { if (row.act !== 'BUY' && row.act !== 'SELL') continue; const e = entryFromRow(row); const n = sim(e, COSTS.NORMAL); if (bad(n)) continue; const g = sim(e, COSTS.GROSS); const s = sim(e, COSTS.STRESS); const R = Math.abs(e.entry - e.sl);
  out.push({ row, e, d: day(e.t), gross: (g.pnl_usd + swapOz(e, g.exitBar)) / R, normal: n.r, stress: s.r, mfe: n.mfe_r, mae: n.mae_r, tgt: n.exit === 'TARGET_170R', bars: n.bars, exitBar: n.exitBar, pnl: n.pnl_usd, gExit: g.exitBar, gPnl: g.pnl_usd, sExit: s.exitBar, sPnl: s.pnl_usd }); } return out; }
/** One-position walk (unchanged canReenter); the walk path uses the NORMAL outcome (as V8 / V11). */
function walk(xs) { let exitBar = -1, last = null, lastLoss = false; const t = []; for (const x of xs) { if (x.e.i <= exitBar) continue; if (!canReenter({ signal: x.e, exitBar, lastTrade: last, lastExitWasLoss: lastLoss }).ok) continue; t.push(x); exitBar = x.exitBar; last = { i: x.e.i, model: x.e.model, side: x.e.side, anchor: x.e.anchor }; lastLoss = x.pnl <= 0; } return t; }
function entryStats(xs) { const cx = (k) => ci(dayBlockCI(xs.map((x) => ({ d: x.d, x: x[k] })))); const s = summarizeR(xs.map((x) => x.normal), { mfe: xs.map((x) => x.mfe), mae: xs.map((x) => x.mae), target: xs.map((x) => x.tgt) });
  return { n: xs.length, gross: cx('gross'), normal: cx('normal'), stress: cx('stress'), stress_mean: r4(mean(xs.map((x) => x.stress))), win_rate: r4(s.win_rate), avg_win_r: r4(mean(xs.map((x) => x.normal).filter((v) => v > 0))), avg_loss_r: r4(mean(xs.map((x) => x.normal).filter((v) => v <= 0))), pf: r4(s.pf), mfe_r: r4(s.mfe_r), mae_r: r4(s.mae_r), reach_170: r4(s.reach_170), duration_bars: r2(mean(xs.map((x) => x.bars))) }; }
function walkStats(ts) { const n = summarizeR(ts.map((x) => x.normal), { mfe: ts.map((x) => x.mfe), mae: ts.map((x) => x.mae), target: ts.map((x) => x.tgt) });
  return { trades: ts.length, normal_expectancy: r4(n.expectancy_r), gross_expectancy: r4(mean(ts.map((x) => x.gross))), stress_expectancy: r4(mean(ts.map((x) => x.stress))), win_rate: r4(n.win_rate), avg_win_r: r4(mean(ts.map((x) => x.normal).filter((v) => v > 0))), avg_loss_r: r4(mean(ts.map((x) => x.normal).filter((v) => v <= 0))), pf: r4(n.pf), max_dd_r: r2(n.max_dd_r), mfe_r: r4(n.mfe_r), mae_r: r4(n.mae_r), reach_170: r4(n.reach_170), duration_bars: r2(mean(ts.map((x) => x.bars))), ci_normal: ci(dayBlockCI(ts.map((x) => ({ d: x.d, x: x.normal })))) }; }
/** V12 probe outcomes (identical method) for every traced (bar, side). */
function probes(rows) { const P = new Map(); for (const row of rows) { if (!row.stB) continue; for (const side of ['BUY', 'SELL']) { const p = probe(B, F, row.i, side); if (!p) continue; const n = sim(p, COSTS.NORMAL), g = sim(p, COSTS.GROSS); if (bad(n) || bad(g)) continue; P.set(`${row.i}|${side}`, { d: day(row.t), gross: (g.pnl_usd + swapOz(p, g.exitBar)) / Math.abs(p.entry - p.sl) }); } } return P; }
function stageTests(rows, P) { const base = {}; for (const side of ['BUY', 'SELL']) base[side] = mean([...P.entries()].filter(([k]) => k.endsWith(side)).map(([, v]) => v.gross));
  const res = {}; for (const m of [...MODELS, 'ALL']) { const obs = Object.fromEntries(STAGES.map((st) => [st, []])); const perSide = { BUY: {}, SELL: {} };
    for (const side of ['BUY', 'SELL']) for (const st of STAGES) perSide[side][st] = [];
    for (const row of rows) for (const side of ['BUY', 'SELL']) { const o = P.get(`${row.i}|${side}`); if (!o) continue; for (const mm of m === 'ALL' ? MODELS : [m]) { const r = stagesReached(row, mm, side); for (const st of STAGES) if (r[st]) { const x = { d: o.d, x: o.gross - base[side] }; obs[st].push(x); perSide[side][st].push(x); } } }
    res[m] = { edge: Object.fromEntries(STAGES.map((st) => [st, ci(dayBlockCI(obs[st]))])), transitions: Object.fromEntries(STAGES.slice(1).map((st, k) => [`${STAGES[k]}->${st}`, ci(dayBlockCI(obs[st], obs[STAGES[k]]))])), per_side_edge_mean: Object.fromEntries(['BUY', 'SELL'].map((s) => [s, Object.fromEntries(STAGES.map((st) => [st, r4(mean(perSide[s][st].map((x) => x.x)))]))])) }; }
  return { baseline: { BUY: r4(base.BUY), SELL: r4(base.SELL) }, models: res }; }
function groupStats(xs) { const out = {}; for (const [g, fn] of Object.entries(GROUPINGS)) { const lv = {}; for (const x of xs) { const k = fn(x.row, x.e); if (k == null) continue; (lv[k] ??= []).push(x); } out[g] = Object.fromEntries(Object.entries(lv).map(([k, ys]) => [k, entryStats(ys)])); } return out; }
function analyse(S) { const rows = loadRows(S); const all = entryOutcomes(rows); const P = probes(rows); const strategies = {}; const groups = {}; const direction = {};
  for (const m of [...MODELS, 'ALL']) { const xs = m === 'ALL' ? all : all.filter((x) => x.e.model === m); const setups = rows.reduce((s, row) => s + ['BUY', 'SELL'].filter((side) => (m === 'ALL' ? MODELS.some((mm) => stagesReached(row, mm, side).SETUP) : stagesReached(row, m, side).SETUP)).length, 0);
    strategies[m] = { valid_setups: setups, entries: entryStats(xs), walk: walkStats(walk(xs)) }; groups[m] = groupStats(xs);
    const b = xs.filter((x) => x.e.side === 'BUY'), s = xs.filter((x) => x.e.side === 'SELL'); direction[m] = { BUY: entryStats(b), SELL: entryStats(s), buy_minus_sell: ci(dayBlockCI(b.map((x) => ({ d: x.d, x: x.normal })), s.map((x) => ({ d: x.d, x: x.normal })))) }; }
  return { entries: all.length, strategies, stages: stageTests(rows, P), groups, direction, _all: all }; }
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
const subgroupKeys = (A) => Object.entries(A.groups).flatMap(([m, g]) => Object.entries(g).flatMap(([gr, lv]) => Object.keys(lv).map((k) => `${m}|${gr}|${k}`)));
const getSub = (A, key) => { const [m, gr, k] = key.split('|'); return A.groups[m]?.[gr]?.[k] ?? null; };

if (PHASE === 'DEV') {
  const D = analyse('DEV'); const passed = subgroupKeys(D).filter((k) => meetsEdge(getSub(D, k)));
  writeFileSync(join(OUT, 'v13_dev.json'), JSON.stringify(strip({ phase: 'DEV', generated_utc: new Date().toISOString(), ...D, subgroups_screened: subgroupKeys(D).length, subgroups_passing_dev: passed }), null, 1));
  const freeze = { frozen_utc: new Date().toISOString(), prereg_sha: shaFile(join(ROOT, 'V13_PREREGISTRATION.md')), lean_sha: shaFile(join(HERE, 'lean.mjs')), study_sha: shaFile(join(HERE, 'v13_study.mjs')), v12_isolation_sha: V12FZ.isolation_sha, subgroups_screened: subgroupKeys(D).length, candidates_frozen: passed };
  writeFileSync(join(CFG, 'v13_freeze.json'), JSON.stringify(freeze, null, 1)); console.log('DEV entries', D.entries, 'subgroups', freeze.subgroups_screened, 'passing DEV', JSON.stringify(passed));
  console.log('strategies', JSON.stringify(Object.fromEntries(Object.entries(D.strategies).map(([m, s]) => [m, { n: s.entries.n, gross: s.entries.gross.mean, glo: s.entries.gross.lo, normal: s.entries.normal.mean, stress: s.entries.stress_mean, walk: s.walk.normal_expectancy, trades: s.walk.trades }]))));
} else {
  const fz = JSON.parse(readFileSync(join(CFG, 'v13_freeze.json'), 'utf8')); for (const [k, p] of [['prereg_sha', join(ROOT, 'V13_PREREGISTRATION.md')], ['lean_sha', join(HERE, 'lean.mjs')], ['study_sha', join(HERE, 'v13_study.mjs')]]) if (fz[k] !== shaFile(p)) throw new Error(`freeze violated: ${k}`);
  const D = analyse('DEV'); const H = analyse('HOLD'); const res = { phase: 'FULL', generated_utc: new Date().toISOString(), freeze: fz, splits: { DEV: strip(D), HOLD: strip(H) } };
  // ---- classifications ----
  const strat = Object.fromEntries([...MODELS, 'ALL'].map((m) => [m, strategyStatus(D.strategies[m], H.strategies[m])]));
  const stage = Object.fromEntries([...MODELS, 'ALL'].map((m) => [m, { PATTERN: stageClass(D.stages.models[m].edge.PATTERN, H.stages.models[m].edge.PATTERN), SETUP: stageClass(D.stages.models[m].transitions['PATTERN->SETUP'], H.stages.models[m].transitions['PATTERN->SETUP']), TRIGGER: stageClass(D.stages.models[m].transitions['SETUP->TRIGGER'], H.stages.models[m].transitions['SETUP->TRIGGER']), DIRECTION: stageClass(D.stages.models[m].transitions['TRIGGER->DIRECTION'], H.stages.models[m].transitions['TRIGGER->DIRECTION']), LOCATION_GATES: stageClass(D.stages.models[m].transitions['DIRECTION->ENTRY'], H.stages.models[m].transitions['DIRECTION->ENTRY']) }]));
  for (const m of Object.keys(stage)) stage[m].SETUP_LABEL = stage[m].PATTERN !== 'DEMONSTRATED' && stage[m].SETUP !== 'DEMONSTRATED' ? 'SETUP_ADDS_NO_DEMONSTRATED_EDGE' : stage[m].SETUP;
  const cost = Object.fromEntries([...MODELS, 'ALL'].map((m) => [m, { DEV: costLabel(D.strategies[m].entries), HOLD: costLabel(H.strategies[m].entries) }]));
  const dir = Object.fromEntries([...MODELS, 'ALL'].map((m) => [m, directionClass(D.direction[m].buy_minus_sell, H.direction[m].buy_minus_sell)]));
  const loc = Object.fromEntries([...MODELS, 'ALL'].map((m) => { const dv = D.groups[m].LOCATION ?? {}, hv = H.groups[m].LOCATION ?? {}; const lbl = sampleLabel(Math.min(dv['MARGINAL_2.0_2.5']?.n ?? 0, dv['VALID_LE_2.0']?.n ?? 0), Math.min(hv['MARGINAL_2.0_2.5']?.n ?? 0, hv['VALID_LE_2.0']?.n ?? 0)); return [m, { gates: stage[m].LOCATION_GATES, class_split_sample: lbl }]; }));
  const cands = Object.fromEntries(fz.candidates_frozen.map((k) => { const h = getSub(H, k), d = getSub(D, k); const same = d && h && Math.sign(d.normal.mean) === Math.sign(h.normal.mean); return [k, { dev: d, hold: h, survives: meetsEdge(h) && same }]; }));
  const subgroupTable = subgroupKeys(D).map((k) => { const d = getSub(D, k), h = getSub(H, k); return { key: k, n_dev: d?.n ?? 0, n_hold: h?.n ?? 0, sample: sampleLabel(d?.n ?? 0, h?.n ?? 0), dev_normal: d?.normal ?? null, hold_normal: h?.normal ?? null, dev_gross: d?.gross ?? null, hold_gross: h?.gross ?? null, sign_stable: d && h ? Math.sign(d.normal.mean) === Math.sign(h.normal.mean) : null, passes_dev: meetsEdge(d), passes_hold: meetsEdge(h) }; });
  // ---- replay parity ----
  const v8 = JSON.parse(readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'v8_results_FULL.json'), 'utf8')); const v12 = JSON.parse(readFileSync(join(V12, 'results', 'v12_results_FULL.json'), 'utf8'));
  const par = {}; for (const [S, X] of [['DEV', D], ['HOLD', H]]) { const v = v8.variants.ALL[S]; let probeMax = 0; for (const m of MODELS) for (const side of ['BUY', 'SELL']) for (const st of STAGES) { const a = v12.splits[S].partA.stages.per_model[m][side][st].edge_vs_baseline.mean, b = X.stages.models[m].per_side_edge_mean[side][st]; if (a != null && b != null) probeMax = Math.max(probeMax, Math.abs(a - b)); }
    par[S] = { entries: X.entries, v8_signals: v.signals, model_mix_equal: MODELS.every((m) => X.strategies[m].entries.n === v.signal_model_mix[m]), combined_trades: X.strategies.ALL.walk.trades, v8_trades: v.fixed_170r.n, combined_expectancy: X.strategies.ALL.walk.normal_expectancy, v8_expectancy: v.fixed_170r.expectancy_r, v12_probe_edge_max_abs_diff: r4(probeMax) }; }
  const again = entryOutcomes(loadRows('HOLD')); const det = sha(JSON.stringify(again.map((x) => [x.e.id, x.gross, x.normal, x.stress]))) === sha(JSON.stringify(H._all.map((x) => [x.e.id, x.gross, x.normal, x.stress]))) && sha(JSON.stringify(walk(again).map((x) => x.e.id))) === sha(JSON.stringify(walk(H._all).map((x) => x.e.id)));
  const replay = { parity: par, deterministic_rerun: det, ok: det && ['DEV', 'HOLD'].every((S) => par[S].entries === par[S].v8_signals && par[S].model_mix_equal && par[S].combined_trades === par[S].v8_trades && Math.abs(par[S].combined_expectancy - par[S].v8_expectancy) < 0.001 && par[S].v12_probe_edge_max_abs_diff < 1e-3) };
  const surviving = Object.values(cands).filter((c) => c.survives).length && replay.ok ? Object.values(cands).filter((c) => c.survives).length : 0;
  const EDGE_STATUS = finalStatus({ combinedStatus: strat.ALL, strategyStatuses: MODELS.map((m) => strat[m]), survivingCandidates: surviving });
  res.decision = { EDGE_STATUS, strategy_status: strat, stage_tests: stage, cost_labels: cost, direction: dir, location: loc, candidates_holdout: cands, CORRECTION_CANDIDATE: surviving ? Object.keys(cands).filter((k) => cands[k].survives) : 'NONE', STOP_COMPLEXITY_RECOMMENDATION: EDGE_STATUS === 'EDGE_NOT_DEMONSTRATED' };
  res.subgroups = subgroupTable; res.replay = replay;
  writeFileSync(join(OUT, 'v13_results_FULL.json'), JSON.stringify(res, null, 1)); console.log('decision', JSON.stringify({ EDGE_STATUS, strat, cost, dir, CORRECTION_CANDIDATE: res.decision.CORRECTION_CANDIDATE })); console.log('stage', JSON.stringify(stage)); console.log('replay', JSON.stringify(replay));
}
