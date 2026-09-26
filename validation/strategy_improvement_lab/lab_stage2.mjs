/**
 * STRATEGY IMPROVEMENT LAB — STAGE 2: frozen candidates → discovery (A) and validation (B),
 * selection by pre-declared rules, combinations, then the untouched FINAL HOLDOUT (C),
 * robustness (bootstrap, friction). Research only. Writes only into this folder.
 *
 * Candidate definitions below were frozen from DISCOVERY-ONLY diagnostics
 * (lab_stage1_discovery_diagnostics.json) before B and C were examined.
 *
 * Run from repo root:  node validation/strategy_improvement_lab/lab_stage2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const DS = JSON.parse(readFileSync(join(HERE, 'lab_dataset.json'), 'utf8'));
const G = DS.gate;
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
let seed = 20260926; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ── helpers ──
function dedupe(list, key = 'prod') { const out = []; let last = null; for (const d of list) { const o = d.o[key]; const same = last && last.side === d.side && last.model === d.model && Math.abs(last.anchor - d.anchor) <= 0.5 * Math.max(1, d.atr) && d.i <= (last.o[key]?.closeIdx ?? Infinity); if (same) continue; out.push(d); last = d; } return out; }
function stats(arr, key = 'prod') {
  const c = arr.filter((s) => s.o[key] && !s.o[key].skipped); const n = c.length; if (!n) return { n: 0 };
  const rs = c.map((s) => s.o[key].r); const wins = c.filter((s) => s.o[key].pnl > 0);
  const gp = wins.reduce((a, s) => a + s.o[key].pnl, 0), gl = c.filter((s) => s.o[key].pnl <= 0).reduce((a, s) => a - s.o[key].pnl, 0);
  const mean = rs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  let ls = 0, maxLs = 0; for (const s of c) { if (s.o[key].pnl <= 0) { ls++; maxLs = Math.max(maxLs, ls); } else ls = 0; }
  let cum = 0, peak = 0, dd = 0; for (const s of c) { cum += s.o[key].r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  const sorted = [...rs].sort((a, b) => b - a); const top = (k) => r2(sorted.slice(0, k).reduce((a, b) => a + b, 0));
  const total = rs.reduce((a, b) => a + b, 0);
  const byModel = {}; for (const s of c) { byModel[s.model] = r2((byModel[s.model] ?? 0) + s.o[key].r); }
  return { n, wr: r2(wins.length / n * 100), pf: gl > 0 ? r2(gp / gl) : null, mr: r3(mean), tot: r2(total), ci: [r3(mean - 1.96 * sd / Math.sqrt(n)), r3(mean + 1.96 * sd / Math.sqrt(n))], maxDD_R: r2(dd), maxLossStreak: maxLs, top1: top(1), top3: top(3), top5: top(5), tot_ex_top5: r2(total - sorted.slice(0, 5).reduce((a, b) => a + b, 0)), byModel };
}
function boot(arr, key = 'prod', B = 2000) { const c = arr.filter((s) => s.o[key] && !s.o[key].skipped); const rs = c.map((s) => s.o[key].r); const n = rs.length; const ms = []; for (let k = 0; k < B; k++) { let sum = 0; for (let q = 0; q < n; q++) sum += rs[Math.floor(rnd() * n)]; ms.push(sum / n); } ms.sort((a, b) => a - b); return { n, mean: r3(rs.reduce((a, b) => a + b, 0) / n), ci95: [r3(ms[Math.floor(B * 0.025)]), r3(ms[Math.floor(B * 0.975)])], p_le_0: r2(ms.filter((m) => m <= 0).length / B * 100) }; }
const inR = (reg) => (g) => g.region === reg;
const CONTROL_SET = G.filter((g) => g.passed);

// ── frozen candidate definitions (one concept each) ──
// Quality re-scoring helpers: threshold shift chosen on DISCOVERY so the candidate passes the same number of gate candidates as CONTROL in A (rank-preserving), then frozen.
function rescore(fn) { // fn(g) -> new score; returns a set of passed gate candidates using a discovery-calibrated shift
  const A = G.filter(inR('A')); const target = A.filter((g) => g.passed).length;
  // find shift s such that count(score' >= threshold - s, not vetoed) == target on A (search over 0..30 step 0.5)
  let best = { s: 0, diff: Infinity };
  for (let s = -10; s <= 30; s += 0.5) { const c = A.filter((g) => !g.vetoed && fn(g) >= g.threshold - s).length; const diff = Math.abs(c - target); if (diff < best.diff) best = { s, diff }; }
  return { shift: best.s, set: G.filter((g) => !g.vetoed && fn(g) >= g.threshold - best.s) };
}
const qA = rescore((g) => g.quality - (g.qb.qEntryLocation ?? 0));
const qB = rescore((g) => g.quality - Math.max(0, (g.qb.qEntryLocation ?? 0) - 7.5));
const qC = rescore((g) => g.quality - (g.qb.qEntryLocation ?? 0) + 10.55);
const qD = (() => { const A = G.filter(inR('A')); const target = A.filter((g) => g.passed).length; const score = (g) => ((g.qb.qTrigger ?? 0) + (g.qb.qMtf ?? 0) + (g.qb.qSession ?? 0)) / 40 * 100; let best = { th: 0, diff: Infinity }; for (let th = 40; th <= 100; th += 1) { const c = A.filter((g) => !g.vetoed && score(g) >= th).length; const diff = Math.abs(c - target); if (diff < best.diff) best = { th, diff }; } return { threshold: best.th, set: G.filter((g) => !g.vetoed && score(g) >= best.th) }; })();
const CANDIDATES = {
  'SR-A': { family: 'SR', rationale: 'SR trades against the current 5m structure lose almost always on discovery (n 21, PF 0.09); the counter-structure allowance (bias support or fresh sweep) is the failing path', set: CONTROL_SET.filter((g) => !(g.model === 'SR' && !g.withStructure)) },
  'SR-B': { family: 'SR', rationale: 'stronger alignment: SR only with 5m structure AND an aligned 15m bias', set: CONTROL_SET.filter((g) => !(g.model === 'SR' && !(g.withStructure && g.alignedWithBias))) },
  'SR-C': { family: 'SR', rationale: 'require a fresh sweep (≤ 3 bars) for every SR (expected to fail: fresh-sweep SR was the worst subtype on discovery)', set: CONTROL_SET.filter((g) => !(g.model === 'SR' && !(g.sweep && g.sweep.barsAgo <= 3))) },
  'SR-D': { family: 'SR', rationale: 'benchmark only: SR disabled', set: CONTROL_SET.filter((g) => g.model !== 'SR') },
  'QUALITY-A': { family: 'QUALITY', rationale: 'qEntryLocation is inverted on discovery (below-mean +0.216 R vs above-mean −0.049 R); removed from research scoring with a discovery-calibrated threshold shift', set: qA.set, note: `shift ${qA.shift}` },
  'QUALITY-B': { family: 'QUALITY', rationale: 'cap qEntryLocation at 7.5 (half) with discovery-calibrated shift', set: qB.set, note: `shift ${qB.shift}` },
  'QUALITY-C': { family: 'QUALITY', rationale: 'qEntryLocation eligibility-neutral (replaced by its discovery mean 10.55) with shift', set: qC.set, note: `shift ${qC.shift}` },
  'QUALITY-D': { family: 'QUALITY', rationale: 'reduced score from the only components with non-negative ordering on discovery (qTrigger, qMtf, qSession), threshold calibrated on discovery', set: qD.set, note: `threshold ${qD.threshold}` },
  'LAG-B': { family: 'LAG', rationale: 'during a 15m-lag episode (directional bias disagreeing with 5m structure) block bias-side trades against 5m structure; do NOT authorize the opposite side', set: CONTROL_SET.filter((g) => !g.lag) },
  'EXIT-C': { family: 'EXIT', rationale: 'broker fail-safe placed at 1.0 × structural + spread instead of 1.5 ×; thesis/adaptive exits unchanged', set: CONTROL_SET, key: 'structSL' },
  'EXIT-B': { family: 'EXIT', rationale: 'broker fail-safe at 1.25 × structural + spread', set: CONTROL_SET, key: 'sl125' },
  'EXIT-D': { family: 'EXIT', rationale: 'profit lock: once MFE ≥ 1 R, exit at +0.25 R (expected to fail: cuts the large winners)', set: CONTROL_SET, key: 'lock' },
  'PB-A': { family: 'PB', rationale: 'PB fired while the 5m regime already trends in the trade direction is a late continuation entry (discovery n 40, PF 0.57); blocked', set: CONTROL_SET.filter((g) => !(g.model === 'PB' && ((g.ctx.regime5 === 'BULL_TREND' && g.side === 'BUY') || (g.ctx.regime5 === 'BEAR_TREND' && g.side === 'SELL')))) },
  'PB-C': { family: 'PB', rationale: 'benchmark only: PB disabled', set: CONTROL_SET.filter((g) => g.model !== 'PB') },
  'BO-A': { family: 'BO', rationale: 'BO whose stop had to be widened to the 0.5-ATR floor has no genuine structural stop (discovery n 47, PF 0.59); blocked', set: CONTROL_SET.filter((g) => !(g.model === 'BO' && String(g.slSource ?? '').includes('min_risk'))) },
};
// ── evaluate on A and B (C untouched until frozen combos are chosen) ──
const ctrl = { A: stats(dedupe(CONTROL_SET).filter(inR('A'))), B: stats(dedupe(CONTROL_SET).filter(inR('B'))) };
const evalSet = (c) => { const key = c.key ?? 'prod'; const d = dedupe(c.set, key); return { A: stats(d.filter(inR('A')), key), B: stats(d.filter(inR('B')), key), removed_vs_control: dedupe(CONTROL_SET).length - (c.key ? dedupe(CONTROL_SET).length : d.length) }; };
const results = {}; for (const [k, c] of Object.entries(CANDIDATES)) results[k] = { ...evalSet(c), family: c.family, rationale: c.rationale, note: c.note ?? null };
// pre-declared selection rule
const passes = (r) => { const dA = r.A.mr - ctrl.A.mr, dB = r.B.mr - ctrl.B.mr; const tA = r.A.tot - ctrl.A.tot, tB = r.B.tot - ctrl.B.tot; return { dA: r3(dA), dB: r3(dB), tA: r2(tA), tB: r2(tB), ddB_ok: r.B.maxDD_R <= ctrl.B.maxDD_R * 1.1, streakB_ok: r.B.maxLossStreak <= ctrl.B.maxLossStreak + 1, pass: dA > 0 && dB > 0 && tA > 0 && tB > 0 && r.B.maxDD_R <= ctrl.B.maxDD_R * 1.1 && r.B.maxLossStreak <= ctrl.B.maxLossStreak + 1 }; };
for (const k of Object.keys(results)) results[k].selection = passes(results[k]);
// affected-trade counts (A+B) for sample adequacy
for (const [k, c] of Object.entries(CANDIDATES)) { if (c.key) { results[k].affected = dedupe(CONTROL_SET).filter((g) => g.region !== 'C' && g.o.prod && g.o[c.key] && g.o.prod.exit !== g.o[c.key].exit).length; } else { const ids = new Set(dedupe(c.set).map((g) => g.i + '|' + g.side)); const cid = new Set(dedupe(CONTROL_SET).map((g) => g.i + '|' + g.side)); results[k].affected = [...cid].filter((x) => !ids.has(x)).length + [...ids].filter((x) => !cid.has(x)).length; results[k].added = [...ids].filter((x) => !cid.has(x)).length; results[k].removed = [...cid].filter((x) => !ids.has(x)).length; } }
// ── choose up to 3 compatible passing candidates (best per family by validation Δ total R; benchmarks SR-D / PB-C excluded; one exit stack max) ──
const passing = Object.entries(results).filter(([k, r]) => r.selection.pass && !['SR-D', 'PB-C'].includes(k) && r.affected >= 30).sort((a, b) => b[1].selection.tB - a[1].selection.tB);
const chosen = []; const famUsed = new Set();
for (const [k, r] of passing) { const fam = r.family; if (famUsed.has(fam)) continue; if (fam === 'EXIT' && chosen.some((x) => CANDIDATES[x].key)) continue; chosen.push(k); famUsed.add(fam); if (chosen.length === 3) break; }
function comboSet(keys) { let set = CONTROL_SET; let exitKey = 'prod'; for (const k of keys) { const c = CANDIDATES[k]; if (c.key) exitKey = c.key; else { const ids = new Set(c.set.map((g) => g.i + '|' + g.side + '|' + g.model)); set = set.filter((g) => ids.has(g.i + '|' + g.side + '|' + g.model)); } } return { set, exitKey }; }
// quality candidates change membership beyond CONTROL_SET (they can admit new trades); handle by intersecting with the quality set if chosen
function comboSetFull(keys) { let base = null; let exitKey = 'prod'; const filters = []; for (const k of keys) { const c = CANDIDATES[k]; if (c.key) exitKey = c.key; else if (c.family === 'QUALITY') base = c.set; else filters.push(c); } let set = base ?? CONTROL_SET; for (const c of filters) { const ids = new Set(c.set.map((g) => g.i + '|' + g.side + '|' + g.model)); const removedIds = new Set(CONTROL_SET.filter((g) => !ids.has(g.i + '|' + g.side + '|' + g.model)).map((g) => g.i + '|' + g.side + '|' + g.model)); set = set.filter((g) => !removedIds.has(g.i + '|' + g.side + '|' + g.model)); } return { set, exitKey }; }
const combos = {}; const comboKeys = { 'COMBO-1': chosen.slice(0, 1), 'COMBO-2': chosen.slice(0, 2), 'COMBO-3': chosen.slice(0, 3) };
for (const [name, keys] of Object.entries(comboKeys)) { if (!keys.length) { combos[name] = null; continue; } const { set, exitKey } = comboSetFull(keys); const d = dedupe(set, exitKey); combos[name] = { keys, A: stats(d.filter(inR('A')), exitKey), B: stats(d.filter(inR('B')), exitKey) }; }
// ── FINAL HOLDOUT (C) opened only now, for CONTROL and the frozen combos ──
const holdout = { CONTROL: stats(dedupe(CONTROL_SET).filter(inR('C'))) };
for (const [name, keys] of Object.entries(comboKeys)) { if (!keys.length) continue; const { set, exitKey } = comboSetFull(keys); holdout[name] = { keys, ...stats(dedupe(set, exitKey).filter(inR('C')), exitKey) }; }
// also every single candidate on C for transparency (reported after the fact, not used for selection)
const holdoutSingles = {}; for (const [k, c] of Object.entries(CANDIDATES)) { const key = c.key ?? 'prod'; holdoutSingles[k] = stats(dedupe(c.set, key).filter(inR('C')), key); }
// ── robustness for CONTROL and the frozen combos: bootstrap on all regions, friction sensitivity ──
const robust = {};
const fricKey = (exitKey, f) => (exitKey === 'prod' ? f : null);
for (const [name, keys] of [['CONTROL', []], ...Object.entries(comboKeys).filter(([, k]) => k.length)]) {
  const { set, exitKey } = name === 'CONTROL' ? { set: CONTROL_SET, exitKey: 'prod' } : comboSetFull(keys);
  const d = dedupe(set, exitKey);
  robust[name] = { all: stats(d, exitKey), bootstrap_all: boot(d, exitKey), bootstrap_BC: boot(d.filter((g) => g.region !== 'A'), exitKey), friction_spread040: exitKey === 'prod' ? stats(dedupe(set, 'fric1'), 'fric1') : 'n/a (exit variant not re-simulated with friction)', friction_spread040_slip015: exitKey === 'prod' ? stats(dedupe(set, 'fric2'), 'fric2') : 'n/a' };
}
// ── MR stability ──
const MR = dedupe(CONTROL_SET).filter((g) => g.model === 'MR');
const mr = { A: stats(MR.filter(inR('A'))), B: stats(MR.filter(inR('B'))), C: stats(MR.filter(inR('C'))), all: stats(MR), bootstrap: boot(MR), dependence: (() => { const s = stats(MR); return { top1_share_of_total: r2(s.top1 / s.tot * 100), top3_share: r2(s.top3 / s.tot * 100), top5_share: r2(s.top5 / s.tot * 100), total_ex_top5: s.tot_ex_top5, mean_ex_top5: r3(s.tot_ex_top5 / (s.n - 5)) }; })() };
// ── lag groups on all regions (fired vs suppressed cannot be measured here beyond master variants; fired only) ──
const lagFired = dedupe(CONTROL_SET).filter((g) => g.lag);
const lag = { fired: { A: stats(lagFired.filter(inR('A'))), B: stats(lagFired.filter(inR('B'))), C: stats(lagFired.filter(inR('C'))), all: stats(lagFired), byModel: Object.fromEntries(['SR', 'PB', 'MC', 'BO'].map((m) => [m, stats(lagFired.filter((g) => g.model === m))])) } };
// ── exit inflation reconstruction (all regions, CONTROL) ──
const CD = dedupe(CONTROL_SET).filter((g) => g.o.prod && !g.o.prod.skipped);
const L = CD.filter((g) => g.o.prod.pnl <= 0);
const exitAudit = { losses: L.length, gt1R: L.filter((g) => g.o.prod.r < -1).length, gt12R: L.filter((g) => g.o.prod.r < -1.2).length, gt15R: L.filter((g) => g.o.prod.r < -1.5).length, avoidable_R_beyond_1R_total: r2(L.reduce((a, g) => a + Math.max(0, -g.o.prod.r - 1), 0)), unavoidable_R_total: r2(L.reduce((a, g) => a + Math.min(1, -g.o.prod.r), 0)), latency_thesis_stop_bars: (() => { const x = L.filter((g) => g.o.prod.sub === 'THESIS_STOP_CLOSE' && g.o.prod.latencyBars != null).map((g) => g.o.prod.latencyBars).sort((a, b) => a - b); return { n: x.length, median: x[Math.floor(x.length / 2)], mean: r2(x.reduce((a, b) => a + b, 0) / Math.max(1, x.length)), p90: x[Math.floor(x.length * 0.9)], seconds_note: 'adaptive manager acts once per confirmed 5m close (~80 s after close), so 0 bars = same bar as the stop touch, 1 bar = 5 min' }; })(), stacks_all_regions: { prod: stats(CD, 'prod'), structSL: stats(dedupe(CONTROL_SET, 'structSL'), 'structSL'), sl125: stats(dedupe(CONTROL_SET, 'sl125'), 'sl125'), lock: stats(dedupe(CONTROL_SET, 'lock'), 'lock') }, stacks_by_region: Object.fromEntries(['A', 'B', 'C'].map((R) => [R, { prod: stats(dedupe(CONTROL_SET, 'prod').filter(inR(R)), 'prod'), structSL: stats(dedupe(CONTROL_SET, 'structSL').filter(inR(R)), 'structSL'), sl125: stats(dedupe(CONTROL_SET, 'sl125').filter(inR(R)), 'sl125') }])) };
const out = { generated_at: new Date().toISOString(), regions: DS.regions, control: { ...ctrl, C_holdout: holdout.CONTROL, all: stats(dedupe(CONTROL_SET)) }, candidates: results, selection_rule: 'pass iff Δmean R > 0 and Δtotal R > 0 in BOTH A and B, validation max DD ≤ 1.1 × control, validation loss streak ≤ control + 1, affected trades ≥ 30 (A+B); benchmarks SR-D/PB-C never selected; one candidate per family; at most one exit stack', passing_candidates: passing.map(([k]) => k), chosen, combos, holdout, holdout_singles_after_the_fact: holdoutSingles, robustness: robust, mr, lag, exit_audit: exitAudit, quality_calibration: { A_shift: qA.shift, B_shift: qB.shift, C_shift: qC.shift, D_threshold: qD.threshold } };
writeFileSync(join(HERE, 'lab_stage2_results.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
