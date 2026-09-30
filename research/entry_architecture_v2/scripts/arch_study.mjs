/**
 * ENTRY ARCHITECTURE V2 -- gate attrition, conditional gate value, RR/quality bands, A0..A3 comparison.
 * RESEARCH ONLY. Reads results/candidates.jsonl (from enrich_candidates.mjs), the Edge Lab bars and rows
 * read-only; writes only results/study_results.json. Spec: PREREGISTRATION.md (hash asserted below).
 */
import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)); const REPO = join(HERE, '..', '..', '..');
const ROOT = join(REPO, 'research', 'entry_architecture_v2'); const OUT = join(ROOT, 'results'); const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const PREREG_SHA = readFileSync(join(ROOT, 'PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0];
if (createHash('sha256').update(readFileSync(join(ROOT, 'PREREGISTRATION.md'))).digest('hex') !== PREREG_SHA) throw new Error('PREREGISTRATION.md does not match its frozen hash');

const SPEC = { cost: 0.34, stress: 0.80, spread: 0.24, horizon: 288, gap_s: 10800, cluster_bars: 12, boot: 2000, seed: 20260930, minRR: 1.7, dev: ['2025-05-07', '2025-12-31'], hold: ['2026-01-01', '2026-09-29'], strong_q: 75, strong_rr: 2.0, a2_q: 80, a2_rr: 2.0, ctx_pts: 5 };
const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8')); const b5 = BARS['5m'];
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const iso = (t) => new Date(t * 1000).toISOString(); const day = (t) => iso(t).slice(0, 10); const month = (t) => iso(t).slice(0, 7);
const split = (t) => { const d = day(t); if (d >= SPEC.dev[0] && d <= SPEC.dev[1]) return 'DEV'; if (d >= SPEC.hold[0] && d <= SPEC.hold[1]) return 'HOLD'; return 'EXCLUDED'; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null); const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function bootCI(v, n = SPEC.boot) { if (v.length < 2) return null; const rand = rng(SPEC.seed); const ms = []; for (let k = 0; k < n; k++) { let s = 0; for (let j = 0; j < v.length; j++) s += v[Math.floor(rand() * v.length)]; ms.push(s / v.length); } ms.sort((a, b) => a - b); return [r3(ms[Math.floor(0.025 * n)]), r3(ms[Math.floor(0.975 * n)])]; }

// ---------- outcome (identical to the missed-opportunity study) ----------
function outcome(c, { cost = SPEC.cost, delay = false } = {}) {
  const g = c.geo; if (!g) return { status: 'NO_GEO' }; const { entry, sl, tp1, tp2 } = g; const side = c.side; const sp = SPEC.spread, slip = cost - sp; const sgn = side === 'BUY' ? 1 : -1;
  let fill = side === 'BUY' ? entry + sp : entry, start = c.i + 1;
  if (delay) { if (c.i + 1 >= b5.length) return { status: 'NO_DATA' }; fill = side === 'BUY' ? b5[c.i + 1].open + sp : b5[c.i + 1].open; start = c.i + 2; }
  const risk = Math.abs(entry - sl); if (!(risk > 0)) return { status: 'INVALID' };
  let mfe = 0, mae = 0, tp1Hit = false, gap = false, exit = null, exitBar = null; const end = Math.min(b5.length - 1, c.i + SPEC.horizon);
  for (let j = start; j <= end; j++) { const b = b5[j]; if (b.time - b5[j - 1].time > SPEC.gap_s) gap = true;
    const fav = side === 'BUY' ? b.high - fill : fill - (b.low + sp), adv = side === 'BUY' ? fill - b.low : (b.high + sp) - fill; if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
    const slHit = side === 'BUY' ? b.low <= sl : (b.high + sp) >= sl, tpHit = side === 'BUY' ? b.high >= tp2 : (b.low + sp) <= tp2; if (!tp1Hit && (side === 'BUY' ? b.high >= tp1 : (b.low + sp) <= tp1)) tp1Hit = true;
    if (slHit) { exit = { k: 'SL', px: sl }; exitBar = j; break; } if (tpHit) { exit = { k: 'TP2', px: tp2 }; exitBar = j; break; } }
  let status = 'RESOLVED'; if (!exit) { if (end < c.i + SPEC.horizon) return { status: 'NO_DATA' }; status = 'OPEN'; exit = { k: 'HORIZON', px: b5[end].close }; exitBar = end; }
  const pnl = sgn * (exit.px - fill) - slip; return { status, gap, exit: exit.k, exitBar, bars: exitBar - c.i, R: r3(pnl / risk), mfe_r: r3(mfe / risk), mae_r: r3(mae / risk), tp1: tp1Hit, risk };
}
function summarize(items) { const R = items.map((x) => x.o.R); if (!R.length) return { n: 0 }; const w = R.filter((x) => x > 0), l = R.filter((x) => x <= 0); const gw = w.reduce((s, x) => s + x, 0), gl = -l.reduce((s, x) => s + x, 0); const sorted = [...R].sort((a, b) => b - a);
  return { n: R.length, mean_r: r3(mean(R)), median_r: r3(median(R)), win_rate: r3(w.length / R.length), pf: gl > 0 ? r3(gw / gl) : (gw > 0 ? 99 : null), ci95: bootCI(R), sum_r: r3(R.reduce((s, x) => s + x, 0)), mfe_r: r3(mean(items.map((x) => x.o.mfe_r))), mae_r: r3(mean(items.map((x) => x.o.mae_r))), tp1_reach: r3(items.filter((x) => x.o.tp1).length / R.length), tp2_reach: r3(items.filter((x) => x.o.exit === 'TP2').length / R.length), sl_first: r3(items.filter((x) => x.o.exit === 'SL').length / R.length), open: items.filter((x) => x.o.status === 'OPEN').length, drop_top1: R.length > 1 ? r3(mean(sorted.slice(1))) : null, drop_top3: R.length > 3 ? r3(mean(sorted.slice(3))) : null, top5_share: gw > 0 ? r3(sorted.slice(0, 5).filter((x) => x > 0).reduce((s, x) => s + x, 0) / gw) : null }; }
const by = (items, f) => { const g = {}; for (const x of items) (g[String(f(x) ?? 'null')] ??= []).push(x); return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, { n: v.length, mean_r: r3(mean(v.map((x) => x.o.R))), win_rate: r3(v.filter((x) => x.o.R > 0).length / v.length), sum_r: r3(v.reduce((s, x) => s + x.o.R, 0)) }])); };
function independent(items) { const s = [...items].sort((a, b) => a.c.i - b.c.i); const out = []; let lastI = -1e9, lastSide = null; for (const x of s) { if (x.c.side !== lastSide || x.c.i - lastI > SPEC.cluster_bars) out.push(x); lastI = x.c.i; lastSide = x.c.side; } return out; }
const valid = (items) => items.filter((x) => x.o && x.o.status !== 'NO_GEO' && x.o.status !== 'NO_DATA' && x.o.status !== 'INVALID' && !x.o.gap);
const volB = (a) => (a == null ? 'null' : a < 0.9 ? 'lt0.9' : a <= 1.1 ? '0.9-1.1' : 'gt1.1');

// ---------- load rows (funnel top) and candidates ----------
console.log('loading ...');
let completed = 0, eligible = 0, chop = 0; const sessions = new Set(); const sessionsBySplit = { DEV: new Set(), HOLD: new Set() };
const rl = createInterface({ input: createReadStream(join(LAB, 'lab_rows.jsonl')) });
for await (const line of rl) { if (!line) continue; const r = JSON.parse(line); const sp = split(r.t); if (sp === 'EXCLUDED') continue; completed++; sessions.add(day(r.t)); sessionsBySplit[sp].add(day(r.t)); if (r.wr === 'CHOP' || !r.elig) chop++; else eligible++; }
const C = readFileSync(join(OUT, 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((c) => split(c.t) !== 'EXCLUDED');
for (const c of C) { c.rr = c.geo?.rr ?? null; c.split = split(c.t); c.cs = c.a15 + c.a30r + c.a30s + c.a1h - 2 * c.fresh_opp; c.conf = c.q_base + SPEC.ctx_pts * c.cs;
  c.g = { vol: c.vol_ok, over: c.overext_ok, geo: !!c.geo, rr: c.rr != null && c.rr >= SPEC.minRR, q: c.q_final >= c.q_th, fresh: !c.fresh_opp, two: !c.two_factor, htf: !c.htf_conflict };
  const order = ['vol', 'over', 'geo', 'rr', 'q', 'fresh', 'two', 'htf']; c.first_fail = order.find((k) => !c.g[k]) ?? null; c.B = c.g.vol && c.g.over && c.g.geo && c.g.rr; c.D_pass = c.g.fresh && c.g.two && c.g.htf; c.prod_signal = c.act === 'BUY' || c.act === 'SELL';
  c.o = outcome(c); c.o_stress = outcome(c, { cost: SPEC.stress }); c.o_delay = outcome(c, { delay: true }); }
const consistency = { prod_signal_and_chain_pass: C.filter((c) => c.prod_signal && c.first_fail === null).length, prod_signal_but_chain_fail: C.filter((c) => c.prod_signal && c.first_fail !== null).length, chain_pass_but_prod_wait: C.filter((c) => !c.prod_signal && c.first_fail === null).length };
console.log('candidates', C.length, 'consistency', JSON.stringify(consistency));

// ---------- controls (frozen acceptance) ----------
const ctrl = (() => { const rand = rng(SPEC.seed + 1); const leak = [], nul = []; for (const c of C) { const i = c.i; if (i + 13 >= b5.length || !(c.atr > 0)) continue; const a = c.atr; const fut = b5[i + 12].close - b5[i].close; const mk = (s) => ({ i, side: s, geo: { entry: b5[i].close, sl: s === 'BUY' ? b5[i].close - a : b5[i].close + a, tp1: s === 'BUY' ? b5[i].close + a : b5[i].close - a, tp2: s === 'BUY' ? b5[i].close + 2 * a : b5[i].close - 2 * a } }); const o1 = outcome(mk(fut >= 0 ? 'BUY' : 'SELL')), o2 = outcome(mk(rand() < 0.5 ? 'BUY' : 'SELL')); if (o1.status === 'RESOLVED') leak.push({ o: o1 }); if (o2.status === 'RESOLVED') nul.push({ o: o2 }); }
  const a0 = valid(C.filter((c) => c.prod_signal).map((c) => ({ c, o: c.o }))); const zero = a0.map((x) => outcome(x.c, { cost: 0 }).R); const diff = mean(zero) - mean(a0.map((x) => x.o.R)); const expected = mean(a0.map((x) => SPEC.cost / x.o.risk));
  const ind = independent(a0); let clusterOk = true; for (let k = 1; k < ind.length; k++) if (ind[k].c.side === ind[k - 1].c.side && ind[k].c.i - ind[k - 1].c.i <= SPEC.cluster_bars) clusterOk = false;
  return { leak: summarize(leak), null: summarize(nul), cost_check: { diff: r3(diff), expected: r3(expected), pass: Math.abs(diff - expected) < 0.001 }, cluster_independence_pass: clusterOk, lookahead_note: 'all features at T=close+80s from bars<=i; outcomes start at i+1', timestamp_alignment_note: 'same slicing reproduced 43/43 and 37/38 live v9 decisions on 2026-09-30' }; })();
console.log('controls', JSON.stringify({ leak: ctrl.leak.mean_r, null: ctrl.null.mean_r, cost: ctrl.cost_check, cluster: ctrl.cluster_independence_pass }));
if (!(ctrl.leak.mean_r > 0.3) || !(Math.abs(ctrl.null.mean_r) < 0.25) || !ctrl.cost_check.pass || !ctrl.cluster_independence_pass) throw new Error('CONTROL FAILED');

// ---------- gate attrition ----------
const GATES = [['vol', 'ATR >= 2 USD (VOLATILITY_INSUFFICIENT)'], ['over', 'overextension <= 2.5 ATR'], ['geo', 'stop geometry valid'], ['rr', 'RR >= 1.7'], ['q', 'quality >= threshold (65/70, HTF penalty)'], ['fresh', 'fresh opposing 15m CHoCH veto'], ['two', '30m two-factor conflict veto'], ['htf', '1H HTF_CONFLICT veto']];
function label(s, n) { if (!n || s.n < 30) return 'UNDERPOWERED'; if (s.mean_r <= -0.10) return 'PROTECTIVE'; if (s.mean_r >= 0.10 && s.ci95 && s.ci95[0] > 0) return 'POSSIBLY_OVER_RESTRICTIVE'; return 'NEUTRAL'; }
const attrition = []; let entering = C.length;
for (let gi = 0; gi < GATES.length; gi++) { const [k, name] = GATES[gi]; const rej = C.filter((c) => c.first_fail === k); const later = GATES.slice(gi + 1).map((x) => x[0]); const alsoLater = rej.filter((c) => later.some((l) => !c.g[l])).length;
  const rv = valid(rej.map((c) => ({ c, o: c.o }))); const ind = independent(rv); const s = summarize(ind);
  attrition.push({ gate: k, name, entering, rejected: rej.length, rejection_rate: r3(rej.length / entering), rejected_with_outcome: rv.length, independent_clusters: ind.length, rejected_forward: s, rejected_forward_dev: summarize(ind.filter((x) => x.c.split === 'DEV')), rejected_forward_hold: summarize(ind.filter((x) => x.c.split === 'HOLD')), also_rejected_by_later_gate_share: rej.length ? r3(alsoLater / rej.length) : null, label: (rej.length / entering < 0.01 || (rej.length && alsoLater / rej.length >= 0.9)) ? 'REDUNDANT' : label(s, ind.length), by_model: by(ind, (x) => x.c.model) });
  entering -= rej.length; }
const funnel = { completed_candles: completed, model_eligible: eligible, chop_or_no_models: chop, candidates_setup_trigger: C.length, ...Object.fromEntries(attrition.map((a) => ['after_' + a.gate, a.entering - a.rejected])), production_signals: C.filter((c) => c.prod_signal).length, safety_and_execution_gates: 'not in replay (News V2, shock, spread, drift, breaker, identity); identical for all architectures' };

// ---------- conditional gate value ----------
const strong = C.filter((c) => c.B && c.q_final >= SPEC.strong_q && c.rr >= SPEC.strong_rr);
function condCell(set) { const v = valid(set.map((c) => ({ c, o: c.o }))); const ind = independent(v); const s = summarize(ind); return { raw: v.length, independent: ind.length, ...s, verdict: ind.length < 30 ? 'UNDERPOWERED' : s.mean_r <= -0.10 ? 'VETO_PROTECTIVE' : s.mean_r >= 0.10 && s.ci95 && s.ci95[0] > 0 ? 'VETO_POSSIBLY_OVER_RESTRICTIVE' : 'VETO_NEUTRAL' }; }
const vetoes = { fresh: (c) => c.fresh_opp === 1, two: (c) => c.two_factor, htf: (c) => c.htf_conflict };
const conditional = { strong_definition: `B gates pass AND quality >= ${SPEC.strong_q} AND RR >= ${SPEC.strong_rr}`, strong_candidates: strong.length, strong_passing_all_vetoes: condCell(strong.filter((c) => c.D_pass)), per_veto: {} };
for (const [v, f] of Object.entries(vetoes)) { const rej = strong.filter((c) => f(c)); conditional.per_veto[v] = { all_models: condCell(rej), by_model: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => [m, condCell(rej.filter((c) => c.model === m))])) }; }
// unconditional per-model veto value on quality-passing candidates (for reference)
const qpass = C.filter((c) => c.B && c.g.q); conditional.quality_pass_per_veto = Object.fromEntries(Object.entries(vetoes).map(([v, f]) => [v, { all_models: condCell(qpass.filter((c) => f(c))), by_model: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => [m, condCell(qpass.filter((c) => c.model === m && f(c)))])) }]));

// ---------- RR bands and quality bands ----------
const rrBand = (rr) => (rr == null ? 'null' : rr < 1.4 ? '<1.4' : rr < 1.5 ? '1.4-1.5' : rr < 1.6 ? '1.5-1.6' : rr < 1.7 ? '1.6-1.7' : '>=1.7');
const qBand = (q) => (q < 55 ? '<55' : q < 60 ? '55-59' : q < 65 ? '60-64' : q < 70 ? '65-69' : q < 75 ? '70-74' : q < 80 ? '75-79' : '80+');
function bandTable(set, keyFn) { const g = {}; for (const c of set) (g[keyFn(c)] ??= []).push(c); return Object.fromEntries(Object.entries(g).sort().map(([k, arr]) => { const v = valid(arr.map((c) => ({ c, o: c.o }))); const ind = independent(v); const s = summarize(ind); const st = summarize(independent(valid(arr.map((c) => ({ c, o: c.o_stress }))))); return [k, { raw: v.length, independent: ind.length, mean_r: s.mean_r, median_r: s.median_r, pf: s.pf, ci95: s.ci95, win_rate: s.win_rate, mfe_r: s.mfe_r, mae_r: s.mae_r, stress_mean_r: st.mean_r, dev_mean_r: summarize(ind.filter((x) => x.c.split === 'DEV')).mean_r, dev_n: ind.filter((x) => x.c.split === 'DEV').length, hold_mean_r: summarize(ind.filter((x) => x.c.split === 'HOLD')).mean_r, hold_n: ind.filter((x) => x.c.split === 'HOLD').length }]; })); }
const rrEligible = C.filter((c) => c.g.vol && c.g.over && c.g.geo);
const qNoRr = (c) => c.q_final - (c.q_break?.qRr ?? 0);
const rrResearch = { population: 'passed ATR floor, overextension, geometry; RR is first failing gate or passed', all: bandTable(rrEligible, (c) => rrBand(c.rr)), strong_q75_production_formula: bandTable(rrEligible.filter((c) => c.q_final >= SPEC.strong_q), (c) => rrBand(c.rr)), strong_q75_excluding_rr_component: bandTable(rrEligible.filter((c) => qNoRr(c) >= SPEC.strong_q - 10), (c) => rrBand(c.rr)), context_pass_only: bandTable(rrEligible.filter((c) => c.D_pass), (c) => rrBand(c.rr)), by_model_1_5_to_1_7: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => [m, condCell(rrEligible.filter((c) => c.model === m && c.rr >= 1.5 && c.rr < 1.7))])) };
const qEligible = C.filter((c) => c.B);
const qResearch = { population: 'passed all B gates (RR >= 1.7)', all: bandTable(qEligible, (c) => qBand(c.q_final)), context_vetoes_pass: bandTable(qEligible.filter((c) => c.D_pass), (c) => qBand(c.q_final)), by_model_65_69: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => [m, condCell(qEligible.filter((c) => c.model === m && c.q_final >= 65 && c.q_final < 70))])), threshold_basis_split: { directional_65: bandTable(qEligible.filter((c) => c.q_th === 65), (c) => qBand(c.q_final)), neutral_70: bandTable(qEligible.filter((c) => c.q_th === 70), (c) => qBand(c.q_final)) } };

// ---------- architectures ----------
const decide = {
  A0: (c) => c.prod_signal,
  A1: (c) => c.B && c.conf >= c.q_th,
  A2: (c) => c.B && ((c.q_final >= SPEC.a2_q && c.rr >= SPEC.a2_rr) || (c.g.q && c.D_pass)),
};
// A3 selection on DEVELOPMENT only
const a3sel = {}; for (const m of ['MC', 'PB', 'BO', 'SR', 'MR']) { a3sel[m] = {}; for (const [v, f] of Object.entries(vetoes)) { const others = Object.keys(vetoes).filter((x) => x !== v); const rej = C.filter((c) => c.split === 'DEV' && c.model === m && c.B && c.g.q && f(c) && others.every((o) => !vetoes[o](c))); const ind = independent(valid(rej.map((c) => ({ c, o: c.o })))); const s = summarize(ind); const drop = ind.length >= 30 && s.mean_r >= 0.10 && s.ci95 && s.ci95[0] > 0; a3sel[m][v] = { dev_independent_n: ind.length, dev_mean_r: s.mean_r, dev_ci95: s.ci95, decision: drop ? 'DROP' : 'KEEP' }; } }
decide.A3 = (c) => c.B && c.g.q && Object.entries(vetoes).every(([v, f]) => a3sel[c.model][v].decision === 'DROP' || !f(c));

function sequential(sigs, { cost = SPEC.cost, delay = false } = {}) { const trades = []; let busy = -1; for (const c of [...sigs].sort((a, b) => a.i - b.i)) { if (c.i <= busy) continue; const o = delay || cost !== SPEC.cost ? outcome(c, { cost, delay }) : c.o; if (!o || o.status === 'NO_GEO' || o.status === 'NO_DATA' || o.status === 'INVALID') continue; trades.push({ c, o }); busy = o.exitBar; } return trades; }
function seqStats(trades, sessSet) { const R = trades.map((x) => x.o.R); let cum = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0; for (const r of R) { cum += r; if (cum > peak) peak = cum; dd = Math.max(dd, peak - cum); if (r <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
  const perDay = {}; for (const t of trades) perDay[day(t.c.t)] = (perDay[day(t.c.t)] ?? 0) + 1; const counts = [...sessSet].map((d) => perDay[d] ?? 0); const months = {}; for (const t of trades) months[month(t.c.t)] = (months[month(t.c.t)] ?? 0) + t.o.R; const mv = Object.values(months);
  return { trades: trades.length, sum_r: r3(cum), max_drawdown_r: r3(dd), max_loss_streak: maxStreak, trades_per_session: { p10: pct(counts, 0.1), p25: pct(counts, 0.25), median: pct(counts, 0.5), p75: pct(counts, 0.75), p90: pct(counts, 0.9), mean: r3(mean(counts)) }, zero_trade_session_rate: r3(counts.filter((x) => x === 0).length / counts.length), months: mv.length, months_positive_share: mv.length ? r3(mv.filter((x) => x > 0).length / mv.length) : null, ...summarize(trades) }; }
const arch = {}; const holdSess = sessionsBySplit.HOLD, devSess = sessionsBySplit.DEV;
for (const [name, fn] of Object.entries(decide)) { const sigs = C.filter(fn); const withO = valid(sigs.map((c) => ({ c, o: c.o }))); const ind = independent(withO); const sub = (s) => ind.filter((x) => x.c.split === s); const seqAll = sequential(sigs); const seqH = seqAll.filter((t) => t.c.split === 'HOLD'), seqD = seqAll.filter((t) => t.c.split === 'DEV');
  const indH = sub('HOLD'), indD = sub('DEV');
  arch[name] = { signals_raw: sigs.length, signals_with_outcome: withO.length, independent: ind.length, independent_stats: summarize(ind), DEV: { independent: indD.length, ...summarize(indD), seq: seqStats(seqD, devSess) }, HOLD: { independent: indH.length, ...summarize(indH), seq: seqStats(seqH, holdSess), stress: summarize(independent(valid(sigs.filter((c) => c.split === 'HOLD').map((c) => ({ c, o: c.o_stress }))))), delay: summarize(independent(valid(sigs.filter((c) => c.split === 'HOLD').map((c) => ({ c, o: c.o_delay }))))), by_side: by(indH, (x) => x.c.side), by_model: by(indH, (x) => x.c.model), by_session: by(indH, (x) => x.c.ses), by_vol: by(indH, (x) => volB(x.c.atrR)), by_month: by(indH, (x) => month(x.c.t)) }, seq_all: seqStats(seqAll, sessions) }; }
// decisions vs A0 on HOLDOUT
const a0h = arch.A0.HOLD; for (const name of ['A1', 'A2', 'A3']) { const h = arch[name].HOLD; const s = h; const opp = a0h.seq.trades ? r3(h.seq.trades / a0h.seq.trades) : null; const deg = r3((s.mean_r ?? 0) - (a0h.mean_r ?? 0)); let status;
  if ((s.mean_r ?? -9) < (a0h.mean_r ?? 0) - 0.05 || (s.mean_r ?? -9) <= -0.05 || (s.pf ?? 0) < 0.9 || h.seq.max_drawdown_r > 1.5 * a0h.seq.max_drawdown_r) status = 'REJECTED';
  else if ((s.mean_r ?? -9) < (a0h.mean_r ?? 0) + 0.05 || (opp ?? 0) < 1.2) status = 'NO_IMPROVEMENT';
  else { const monthsPos = Object.values(h.by_month).filter((m) => m.sum_r > 0).length / Math.max(1, Object.keys(h.by_month).length); const sessOk = Object.values(h.by_session).every((m) => m.mean_r >= -0.2); const promo = s.n >= 100 && s.mean_r >= 0.10 && s.ci95 && s.ci95[0] > 0 && s.pf >= 1.2 && opp >= 1.2 && h.seq.max_drawdown_r <= 1.25 * a0h.seq.max_drawdown_r && s.mae_r <= 1.2 * a0h.mae_r && h.seq.max_loss_streak <= a0h.seq.max_loss_streak + 2 && s.drop_top3 > 0 && h.stress.mean_r > 0 && h.delay.mean_r > 0 && (arch[name].DEV.mean_r ?? -1) > 0 && monthsPos >= 0.6 && sessOk; status = promo ? 'ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION' : 'INTERESTING_RESEARCH_LEAD'; }
  arch[name].decision = { status, opportunity_gain: opp, edge_degradation_vs_A0: deg, holdout_mean_r: s.mean_r, a0_holdout_mean_r: a0h.mean_r, holdout_pf: s.pf, a0_holdout_pf: a0h.pf, holdout_dd: h.seq.max_drawdown_r, a0_dd: a0h.seq.max_drawdown_r }; }
const bonferroni = { family: ['A1', 'A2', 'A3'], alpha: 0.05 / 3, note: 'CIs are 95% cluster-bootstrap; with Bonferroni the effective requirement is stricter than the reported CI' };
const meta = { generated_utc: new Date().toISOString(), prereg_sha256: PREREG_SHA, spec: SPEC, sessions_total: sessions.size, sessions_dev: devSess.size, sessions_hold: holdSess.size, candidates: C.length, consistency, controls: ctrl, a3_selection_table: a3sel, bonferroni };
writeFileSync(join(OUT, 'study_results.json'), JSON.stringify({ meta, funnel, attrition, conditional, rr_research: rrResearch, quality_research: qResearch, architectures: arch }, null, 1));
console.log(JSON.stringify({ funnel, arch_summary: Object.fromEntries(Object.entries(arch).map(([k, v]) => [k, { indep: v.independent, mean_r: v.independent_stats.mean_r, pf: v.independent_stats.pf, hold_mean_r: v.HOLD.mean_r, hold_pf: v.HOLD.pf, hold_trades: v.HOLD.seq.trades, med_tps: v.seq_all.trades_per_session.median, zero_rate: v.seq_all.zero_trade_session_rate, dd: v.HOLD.seq.max_drawdown_r, status: v.decision?.status ?? 'CONTROL' }])) }, null, 1));
