/**
 * MISSED-OPPORTUNITY EDGE RESEARCH -- H1 (30m two-factor veto) + H2 (impulse without retest) + +30 USD observability.
 * RESEARCH ONLY. Reads the Edge Lab replay and MT5 bar cache read-only; imports PURE production engine functions;
 * writes only under research/missed_opportunity/results/. Never imported by production. No CDP, no MT5, no state files.
 *
 * Specification: research/missed_opportunity/preregistered_hypotheses.md (sha256 in preregistered_hypotheses.sha256).
 * Run: node research/missed_opportunity/scripts/study.mjs
 */
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, createReadStream, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* never compete with the live watcher */ }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT = join(REPO, 'research', 'missed_opportunity', 'results');
mkdirSync(OUT, { recursive: true });
const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const E = (p) => 'file:///' + join(REPO, 'src', 'engine', p).replace(/\\/g, '/');
const { runPipeline } = await import(E('pipeline.js'));
const { classifyRegime, REGIME_PARAMS } = await import(E('regime.js'));
const { computeStructure, STRUCTURE_PARAMS } = await import(E('structure.js'));
const { scoreQuality, classifySession } = await import(E('quality.js'));
const { atr, ema, adxDi } = await import(E('math.js'));
const { computeHtfContext, detectHtfConflict } = await import(E('htf.js'));
const { computeBias } = await import(E('intraday/bias.js'));
const { computeIntradayRisk } = await import(E('intraday/risk5m.js'));
const { resolveQualityThreshold } = await import(E('intraday/pipeline5m.js'));
const { INTRADAY_PARAMS: P } = await import(E('intraday/params.js'));

// ---------------- frozen study constants (from the pre-registration; NOT tunable) ----------------
const SPEC = {
  prereg_sha256: readFileSync(join(REPO, 'research', 'missed_opportunity', 'preregistered_hypotheses.sha256'), 'utf8').trim().split(/\s+/)[0],
  spread_usd: 0.24, slippage_usd: 0.10, cost_normal_usd: 0.34, cost_stress_usd: 0.80,
  horizon_bars: 288, gap_seconds: 3 * 3600, cluster_gap_bars_h1: 12, bootstrap_n: 2000, seed: 20260930,
  splits: { DEVELOPMENT: ['2025-05-07', '2025-12-31'], EVALUATION_A: ['2026-01-01', '2026-05-31'], EVALUATION_B: ['2026-06-01', '2026-09-29'], EXCLUDED: ['2026-09-30', '2026-12-31'] },
  h2: { max_event_age: P.boMaxEntryLateBars, retest_tol_atr: P.boRetestAtrTol, disp_min_atr: 1.0, disp_max_atr: P.overextendAtrMult, min_atr_ratio: P.mcMinAtrRatio, leg_lookback: P.mcLegBaseLookback, fresh_choch_bars: P.freshChochMaxAgeBars },
  fetch_lag_s: 80, req: 500,
};
const H1_RE = /^30m regime (BEAR_TREND|BULL_TREND) AND 30m structure (BEARISH|BULLISH) both oppose a (BUY|SELL) \(two-factor conflict\)$/;

const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const iso = (t) => new Date(t * 1000).toISOString();
const dayOf = (t) => iso(t).slice(0, 10);
const splitOf = (t) => { const d = dayOf(t); for (const [k, [a, b]] of Object.entries(SPEC.splits)) if (d >= a && d <= b) return k; return 'PRE_DEVELOPMENT'; };

// ---------------- data ----------------
const BARS = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8'));
const b5 = BARS['5m'];
const TF_SEC = { '15m': 900, '30m': 1800, '1H': 3600 };
const TIMES = Object.fromEntries(Object.entries(BARS).map(([k, v]) => [k, v.map((b) => b.time)]));
const ub = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const confirmedAt = (tf, T) => { const cut = Math.floor(T / TF_SEC[tf]) * TF_SEC[tf]; const end = ub(TIMES[tf], cut); return BARS[tf].slice(Math.max(0, end - (SPEC.req - 1)), end); };
const win5 = (i) => b5.slice(Math.max(0, i - (SPEC.req - 2)), i + 1);
const memo = (m, k, f) => { if (!m.has(k)) m.set(k, f()); return m.get(k); };
const cache = { bias: new Map(), m30: new Map(), h1: new Map() };
const biasAt = (T) => memo(cache.bias, Math.floor(T / 900), () => computeBias({ confirmedBars: confirmedAt('15m', T), params: P }));
const m30At = (T) => memo(cache.m30, Math.floor(T / 1800), () => runPipeline({ confirmedBars: confirmedAt('30m', T) }));
const h1At = (T) => memo(cache.h1, Math.floor(T / 3600), () => computeHtfContext(confirmedAt('1H', T), { includeCorrection: true }));
if (b5.length !== 99990) console.warn('WARNING: 5m bar count differs from the Edge Lab provenance (99,990)');

// ---------------- outcome function (pre-registered) ----------------
/** First touch of sl or tp2 from bar i+1; BUY fills at close+spread, SELL pays spread on exit; slippage subtracted once. */
function structuralOutcome({ i, side, entry, sl, tp1, tp2 }, { cost = SPEC.cost_normal_usd, delay = false } = {}) {
  const sp = SPEC.spread_usd; const slip = cost - sp; // cost = spread + slippage by construction
  const sgn = side === 'BUY' ? 1 : -1;
  let fill = side === 'BUY' ? entry + sp : entry;
  let start = i + 1;
  if (delay) { if (i + 1 >= b5.length) return { status: 'NO_DATA' }; fill = side === 'BUY' ? b5[i + 1].open + sp : b5[i + 1].open; start = i + 2; }
  const risk = Math.abs(entry - sl); if (!(risk > 0)) return { status: 'INVALID' };
  const tpDist = Math.abs(tp2 - entry), tp1Dist = Math.abs(tp1 - entry);
  let mfe = 0, mae = 0, tp1Hit = false, gap = false, exit = null, exitBar = null;
  const end = Math.min(b5.length - 1, i + SPEC.horizon_bars);
  for (let j = start; j <= end; j++) {
    const b = b5[j];
    if (b.time - b5[j - 1].time > SPEC.gap_seconds) gap = true;
    const fav = side === 'BUY' ? b.high - fill : fill - (b.low + sp);
    const adv = side === 'BUY' ? fill - b.low : (b.high + sp) - fill;
    if (fav > mfe) mfe = fav; if (adv > mae) mae = adv;
    // levels relative to the ENTRY geometry (engine sl / tp2 are absolute prices)
    const slHit = side === 'BUY' ? b.low <= sl : (b.high + sp) >= sl;
    const tpHit = side === 'BUY' ? b.high >= tp2 : (b.low + sp) <= tp2;
    if (!tp1Hit && (side === 'BUY' ? b.high >= tp1 : (b.low + sp) <= tp1)) tp1Hit = true;
    if (slHit) { exit = { kind: 'SL', px: sl }; exitBar = j; break; } // same-bar ambiguity -> SL (conservative)
    if (tpHit) { exit = { kind: 'TP2', px: tp2 }; exitBar = j; break; }
  }
  let status = 'RESOLVED';
  if (!exit) { if (end < i + SPEC.horizon_bars) return { status: 'NO_DATA' }; status = 'OPEN_AT_HORIZON'; exit = { kind: 'HORIZON', px: b5[end].close }; exitBar = end; }
  const pnl = sgn * (exit.px - fill) - slip;
  return { status, gap, exit: exit.kind, bars: exitBar - i, pnl_usd: r3(pnl), R: r3(pnl / risk), mfe_r: r3(mfe / risk), mae_r: r3(mae / risk), tp1: tp1Hit, tp2: exit.kind === 'TP2', risk_usd: r3(risk), tp_dist_usd: r3(tpDist), tp1_dist_usd: r3(tp1Dist) };
}

// ---------------- statistics ----------------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function bootCI(vals, n = SPEC.bootstrap_n, seed = SPEC.seed) { if (vals.length < 2) return null; const rand = rng(seed); const ms = []; for (let k = 0; k < n; k++) { let s = 0; for (let j = 0; j < vals.length; j++) s += vals[Math.floor(rand() * vals.length)]; ms.push(s / vals.length); } ms.sort((a, b) => a - b); return [r3(ms[Math.floor(0.025 * n)]), r3(ms[Math.floor(0.975 * n)])]; }
function summarize(items) {
  const R = items.map((x) => x.o.R); if (!R.length) return { n: 0 };
  const wins = R.filter((x) => x > 0), losses = R.filter((x) => x <= 0);
  const gw = wins.reduce((s, x) => s + x, 0), gl = -losses.reduce((s, x) => s + x, 0);
  const sorted = [...R].sort((a, b) => b - a);
  const drop = (k) => (R.length > k ? r3(mean(sorted.slice(k))) : null);
  return {
    n: R.length, mean_r: r3(mean(R)), median_r: r3(median(R)), win_rate: r3(wins.length / R.length), loss_rate: r3(losses.length / R.length),
    profit_factor: gl > 0 ? r3(gw / gl) : (gw > 0 ? Infinity : null), ci95_mean_r: bootCI(R), sum_r: r3(R.reduce((s, x) => s + x, 0)),
    mfe_r_mean: r3(mean(items.map((x) => x.o.mfe_r))), mae_r_mean: r3(mean(items.map((x) => x.o.mae_r))),
    tp1_reach: r3(items.filter((x) => x.o.tp1).length / R.length), tp2_reach: r3(items.filter((x) => x.o.tp2).length / R.length), sl_first: r3(items.filter((x) => x.o.exit === 'SL').length / R.length),
    open_at_horizon: items.filter((x) => x.o.status === 'OPEN_AT_HORIZON').length, bars_to_exit_median: median(items.map((x) => x.o.bars)),
    mean_r_drop_top1: drop(1), mean_r_drop_top3: drop(3), top5_share_of_positive_r: gw > 0 ? r3(sorted.slice(0, 5).filter((x) => x > 0).reduce((s, x) => s + x, 0) / gw) : null,
  };
}
const by = (items, keyFn) => { const g = {}; for (const x of items) { const k = String(keyFn(x) ?? 'null'); (g[k] ??= []).push(x); } return Object.fromEntries(Object.entries(g).sort().map(([k, v]) => [k, { n: v.length, mean_r: r3(mean(v.map((x) => x.o.R))), win_rate: r3(v.filter((x) => x.o.R > 0).length / v.length), sum_r: r3(v.map((x) => x.o.R).reduce((s, y) => s + y, 0)) }])); };
const volBucket = (a) => (a == null ? 'null' : a < 0.9 ? 'lt0.9' : a <= 1.1 ? '0.9-1.1' : 'gt1.1');
const hourBucket = (h) => (h < 7 ? '00-06' : h < 12 ? '07-11' : h < 17 ? '12-16' : h < 21 ? '17-20' : '21-23');

function classify(indep, evalSet, devSet, stress, delay, managed) {
  const s = summarize(indep); if (!s.n) return { status: 'INSUFFICIENT_EVIDENCE', reason: 'N=0' };
  const dev = summarize(devSet), ev = summarize(evalSet), st = summarize(stress), dl = summarize(delay);
  const ciLow = s.ci95_mean_r ? s.ci95_mean_r[0] : null;
  const pf = s.profit_factor === Infinity ? 99 : (s.profit_factor ?? 0);
  let status;
  if (s.mean_r <= -0.10 || pf < 0.9) status = 'NEGATIVE';
  else if (s.mean_r < 0.10 || (ciLow != null && ciLow <= 0 && s.mean_r < 0.10)) status = 'NO_EDGE';
  else {
    const robust = s.n >= 30 && s.mean_r >= 0.15 && pf >= 1.25 && ciLow != null && ciLow > 0 && (dev.mean_r ?? -1) > 0 && (ev.mean_r ?? -1) > 0 && (s.mean_r_drop_top3 ?? -1) > 0 && (st.mean_r ?? -1) > 0 && (dl.mean_r ?? -1) > 0 && (managed == null || managed > 0);
    status = robust ? 'ROBUST_INTEREST' : (s.mean_r >= 0.10 && pf >= 1.10 ? 'WEAK_INTEREST' : 'NO_EDGE');
  }
  const phase7 = status === 'NEGATIVE' ? 'REJECTED' : status === 'NO_EDGE' ? (s.n < 30 ? 'INSUFFICIENT_EVIDENCE' : 'REJECTED') : status === 'WEAK_INTEREST' ? 'INTERESTING_RESEARCH_LEAD' : 'ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION';
  return { status, phase7, checks: { n_ge_30: s.n >= 30, mean_r: s.mean_r, pf: s.profit_factor, ci_low_gt_0: ciLow != null && ciLow > 0, dev_mean_r: dev.mean_r, eval_mean_r: ev.mean_r, drop_top3_mean_r: s.mean_r_drop_top3, stress_mean_r: st.mean_r, delay_mean_r: dl.mean_r, managed_mean_r: managed } };
}

// ---------------- load replay rows (streamed) ----------------
console.log('loading replay rows ...');
const rows = new Map(); const h1Rows = []; const h2CandRows = []; let rowCount = 0; let excludedToday = 0;
const rl = createInterface({ input: createReadStream(join(LAB, 'lab_rows.jsonl')) });
for await (const line of rl) {
  if (!line) continue; const r = JSON.parse(line); rowCount++;
  if (splitOf(r.t) === 'EXCLUDED') { excludedToday++; continue; }
  if (r.wr === 'ENTRY_CONFLICT') { rows.set(r.i, r); if (H1_RE.test(String(r.cf))) h1Rows.push(r); continue; }
  if (r.wr === 'NO_ELIGIBLE_STRATEGY' && r.evT && r.bo && r.evAge != null && r.evAge <= SPEC.h2.max_event_age && r.bo.retested === false) {
    const side = r.evD === 'BULLISH' ? 'BUY' : 'SELL'; const sgn = side === 'BUY' ? 1 : -1;
    const disp = r.evLvlD == null ? null : sgn * r.evLvlD;
    if (disp == null || disp < SPEC.h2.disp_min_atr || disp > SPEC.h2.disp_max_atr) continue;
    if (r.e20d == null || sgn * r.e20d <= 0) continue;
    if (r.atrR == null || r.atrR < SPEC.h2.min_atr_ratio) continue;
    if (r.rg5 === 'CHOP_UNCERTAIN' || !r.b15d) continue;
    const opp = side === 'BUY' ? 'BEARISH' : 'BULLISH', oppReg = side === 'BUY' ? 'BEAR_TREND' : 'BULL_TREND';
    if (r.choch === opp) continue; // fresh opposing 15m CHoCH veto
    if (r.m30r === oppReg && r.m30s === opp) continue; // 30m two-factor veto
    const aligned = r.b15d === (side === 'BUY' ? 'BULLISH' : 'BEARISH');
    if (r.h1r === oppReg && !aligned) continue; // HTF_CONFLICT rule for non-aligned sides
    if (r.b15d === opp) continue; // opposing bias: not even H2b
    h2CandRows.push({ r, side, aligned });
  }
}
console.log(`rows ${rowCount}, excluded 2026-09-30 rows ${excludedToday}, H1 rows ${h1Rows.length}, H2 pre-geometry candidates ${h2CandRows.length}`);
const trades = JSON.parse(readFileSync(join(LAB, 'lab_trades.json'), 'utf8'));
const tradeByI = new Map(); for (const t of trades) if (!tradeByI.has(t.i)) tradeByI.set(t.i, t); else if (t.wr === 'ENTRY_CONFLICT') tradeByI.set(t.i, t);
const openIntervals = trades.filter((t) => t.signal && t.taken && t.prod && !t.prod.skipped).map((t) => [t.i, t.prod.closeIdx]).sort((a, b) => a[0] - b[0]);
const openAt = (i) => openIntervals.some(([a, b]) => i > a && i <= b);

// ---------------- controls (before H1/H2 results are read) ----------------
function controls() {
  const H = 12; const rand = rng(SPEC.seed + 1);
  const leak = [], nul = [];
  for (const { r } of h2CandRows) {
    const i = r.i; if (i + H + 1 >= b5.length) continue; const a = r.atr; if (!(a > 0)) continue;
    const fut = b5[i + H].close - b5[i].close; const side = fut >= 0 ? 'BUY' : 'SELL'; const rside = rand() < 0.5 ? 'BUY' : 'SELL';
    const geo = (s) => ({ i, side: s, entry: b5[i].close, sl: s === 'BUY' ? b5[i].close - a : b5[i].close + a, tp1: s === 'BUY' ? b5[i].close + a : b5[i].close - a, tp2: s === 'BUY' ? b5[i].close + 2 * a : b5[i].close - 2 * a });
    const o1 = structuralOutcome(geo(side)); if (o1.status !== 'NO_DATA' && o1.status !== 'INVALID' && !o1.gap) leak.push({ o: o1 });
    const o2 = structuralOutcome(geo(rside)); if (o2.status !== 'NO_DATA' && o2.status !== 'INVALID' && !o2.gap) nul.push({ o: o2 });
  }
  return { leak_control: summarize(leak), null_control: summarize(nul), note: 'leak control uses the FUTURE 12-bar sign (must be strongly positive); null control uses a random side (must be about minus cost)' };
}
const ctrl = controls();
console.log('controls:', JSON.stringify({ leak_mean_r: ctrl.leak_control.mean_r, leak_win: ctrl.leak_control.win_rate, null_mean_r: ctrl.null_control.mean_r }));
if (!(ctrl.leak_control.mean_r > 0.3)) throw new Error('LEAK CONTROL FAILED: outcome plumbing does not detect a known effect');
if (!(Math.abs(ctrl.null_control.mean_r) < 0.25)) throw new Error('NULL CONTROL FAILED: random-side outcome is not near zero');

// ---------------- H1 ----------------
function studyH1() {
  const members = [];
  for (const r of h1Rows) {
    const t = tradeByI.get(r.i); if (!t || t.wr !== 'ENTRY_CONFLICT') { members.push({ r, missing_geometry: true }); continue; }
    const geo = { i: r.i, side: t.side, entry: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2 };
    members.push({ r, t, geo, o: structuralOutcome(geo), o_stress: structuralOutcome(geo, { cost: SPEC.cost_stress_usd }), o_delay: structuralOutcome(geo, { delay: true }), managed_r: t.prod && !t.prod.skipped ? t.prod.r : null, managed_skipped: t.prod?.skipped ?? null });
  }
  const valid = members.filter((m) => m.o && m.o.status !== 'NO_DATA' && m.o.status !== 'INVALID');
  const gapSpanning = valid.filter((m) => m.o.gap); const primary = valid.filter((m) => !m.o.gap);
  // clusters: same side, <= 12 bars apart
  primary.sort((a, b) => a.r.i - b.r.i); let cid = -1, lastI = -1e9, lastSide = null; const clusters = [];
  for (const m of primary) { if (m.geo.side !== lastSide || m.r.i - lastI > SPEC.cluster_gap_bars_h1) { cid++; clusters.push([]); } clusters[cid].push(m); m.cluster = cid; lastI = m.r.i; lastSide = m.geo.side; }
  const indep = clusters.map((c) => c[0]);
  const spl = (set, k) => set.filter((m) => (Array.isArray(k) ? k : [k]).includes(splitOf(m.r.t)));
  const evalSet = spl(indep, ['EVALUATION_A', 'EVALUATION_B']), devSet = spl(indep, 'DEVELOPMENT');
  const managedVals = indep.map((m) => m.managed_r).filter((x) => x != null);
  const managedMean = r3(mean(managedVals));
  const res = {
    population: { raw_event_count: h1Rows.length, with_geometry: members.filter((m) => !m.missing_geometry).length, gap_spanning_excluded: gapSpanning.length, primary_raw: primary.length, independent_cluster_count: indep.length, clusters_started_while_production_position_open: indep.filter((m) => openAt(m.r.i)).length },
    structural_r: { raw: summarize(primary), independent: summarize(indep), independent_stress_cost: summarize(indep.map((m) => ({ o: m.o_stress })).filter((x) => x.o.status !== 'NO_DATA')), independent_delay: summarize(indep.map((m) => ({ o: m.o_delay })).filter((x) => x.o.status !== 'NO_DATA')), gap_spanning_only: summarize(gapSpanning) },
    managed_r_APPROXIMATE: { n: managedVals.length, mean_r: managedMean, median_r: r3(median(managedVals)), win_rate: managedVals.length ? r3(managedVals.filter((x) => x > 0).length / managedVals.length) : null, sum_r: r3(managedVals.reduce((s, x) => s + x, 0)), exits: Object.fromEntries(Object.entries(indep.reduce((g, m) => { const k = m.t?.prod?.exit ?? m.managed_skipped ?? 'n/a'; g[k] = (g[k] ?? 0) + 1; return g; }, {}))), note: 'Edge Lab production-stack simulation (broker stops, +30 USD TP, adaptive management). Approximate; NOT REAL behaviour.' },
    splits: { DEVELOPMENT: summarize(devSet), EVALUATION_A: summarize(spl(indep, 'EVALUATION_A')), EVALUATION_B: summarize(spl(indep, 'EVALUATION_B')), EVALUATION_A_plus_B: summarize(evalSet) },
    breakdowns_independent: {
      side: by(indep, (m) => m.geo.side), model: by(indep, (m) => m.t.model), regime_5m: by(indep, (m) => m.r.rg5), bias_15m_direction: by(indep, (m) => m.r.b15d), bias_15m_regime: by(indep, (m) => m.r.b15r), regime_30m: by(indep, (m) => m.r.m30r), regime_1h: by(indep, (m) => m.r.h1r), session: by(indep, (m) => m.r.ses), hour_bucket: by(indep, (m) => hourBucket(m.r.hr)), volatility: by(indep, (m) => volBucket(m.r.atrR)), year_month: by(indep, (m) => iso(m.r.t).slice(0, 7)), quality_bucket: by(indep, (m) => (m.t.q >= 80 ? 'q80+' : m.t.q >= 70 ? 'q70-79' : 'q65-69')), rr_bucket: by(indep, (m) => (m.t.rr >= 2.5 ? 'rr2.5+' : m.t.rr >= 2 ? 'rr2-2.5' : 'rr1.7-2')),
    },
    side_table_fresh_choch_veto: (() => { const fc = []; for (const [i, r] of rows) { if (H1_RE.test(String(r.cf))) continue; const t = tradeByI.get(i); if (!t || t.wr !== 'ENTRY_CONFLICT') continue; const o = structuralOutcome({ i, side: t.side, entry: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2 }); if (o.status !== 'NO_DATA' && !o.gap) fc.push({ o }); } return { note: 'other ENTRY_CONFLICT branch (fresh opposing 15m CHoCH), raw candles, informational only', ...summarize(fc) }; })(),
  };
  res.decision = classify(indep, evalSet, devSet, indep.map((m) => ({ o: m.o_stress })), indep.map((m) => ({ o: m.o_delay })).filter((x) => x.o.status !== 'NO_DATA'), managedMean);
  res.independent_events = indep.map((m) => ({ t: iso(m.r.t), i: m.r.i, side: m.geo.side, model: m.t.model, q: m.t.q, rr: m.t.rr, entry: m.geo.entry, sl: m.geo.sl, tp2: m.geo.tp2, R: m.o.R, exit: m.o.exit, bars: m.o.bars, mfe_r: m.o.mfe_r, mae_r: m.o.mae_r, managed_r: m.managed_r, managed_exit: m.t?.prod?.exit ?? m.managed_skipped, split: splitOf(m.r.t), cluster_size: clusters[m.cluster].length, prod_position_open: openAt(m.r.i) }));
  return res;
}

// ---------------- H2 ----------------
function h2Geometry(cand) {
  const { r, side } = cand; const i = r.i; const bars = win5(i); const k = bars.length - 1; const T = r.t + 300 + SPEC.fetch_lag_s;
  const structure = computeStructure(bars, STRUCTURE_PARAMS); const ev = structure.lastEvent; if (!ev) return { reject: 'NO_EVENT_IN_WINDOW' };
  if (k - ev.bar !== r.evAge) return { reject: 'EVENT_MISMATCH_WITH_REPLAY' };
  const bias = biasAt(T); const m30 = m30At(T); const ctx1H = h1At(T);
  const a14 = atr(bars, 14).at(-1); const { regime, evidence: re } = classifyRegime(bars, REGIME_PARAMS); const atrRatio = re?.atrRatio ?? 1;
  const legStart = Math.max(0, ev.bar - SPEC.h2.leg_lookback); const leg = bars.slice(legStart, k + 1);
  const slAnchor = side === 'BUY' ? Math.min(...leg.map((b) => b.low)) : Math.max(...leg.map((b) => b.high));
  const candidate = { model: 'IMP', side, anchor: ev.level, slAnchor, originBar: ev.bar };
  const risk = computeIntradayRisk({ candidate, bars, atrVal: a14, structure5: structure, structure15: bias.structure }, P);
  if (risk.gate !== 'OK') return { reject: risk.gate, risk };
  const { adx } = adxDi(bars, REGIME_PARAMS.adxDiLen, REGIME_PARAMS.adxSmoothing);
  const overextensionRatio = Math.abs(bars[k].close - candidate.anchor) / (a14 * P.overextendAtrMult);
  const q = scoreQuality({ candidate: { ...candidate, overextensionRatio }, structure, regime, adxVal: adx.at(-1), adxThreshold: REGIME_PARAMS.adxTrendThreshold, atrRatio, htfRegime: m30.regime, session: classifySession(bars[k].time), rr: risk.rr, minRR: P.minRR });
  const htfOpposed = detectHtfConflict(side, ctx1H); const penalised = htfOpposed ? Math.max(0, q.score - P.htfOpposedQualityPenalty) : q.score;
  const { threshold, basis } = resolveQualityThreshold({ bias, side, ctx1H, params: P });
  if (penalised < threshold) return { reject: 'NO_GOOD_ENTRY', quality: penalised, threshold, risk };
  return { geo: { i, side, entry: risk.entry, sl: risk.stop_loss, tp1: risk.tp1, tp2: risk.tp2 }, rr: risk.rr, quality: penalised, threshold, threshold_basis: basis, sl_source: risk.sl_source, objective: risk.objective?.source ?? null, event_bar_index: i - r.evAge, ev_type: ev.type };
}
function studyH2() {
  console.log(`H2: computing production geometry for ${h2CandRows.length} candidate candles ...`);
  const evaluated = []; const preGate = { RR_NOT_ACCEPTABLE: 0, NO_GOOD_ENTRY: 0, OVEREXTENDED: 0, VOLATILITY_INSUFFICIENT: 0, INVALID_GEOMETRY: 0, OTHER: 0 };
  let n = 0;
  for (const cand of h2CandRows) {
    const g = h2Geometry(cand); n++; if (n % 500 === 0) console.log(`  ${n}/${h2CandRows.length}`);
    if (g.reject) { preGate[g.reject in preGate ? g.reject : 'OTHER']++; continue; }
    evaluated.push({ ...cand, g, o: structuralOutcome(g.geo), o_stress: structuralOutcome(g.geo, { cost: SPEC.cost_stress_usd }), o_delay: structuralOutcome(g.geo, { delay: true }) });
  }
  const build = (label, set) => {
    const valid = set.filter((m) => m.o.status !== 'NO_DATA' && m.o.status !== 'INVALID'); const gapS = valid.filter((m) => m.o.gap); const primary = valid.filter((m) => !m.o.gap);
    const clusters = new Map(); for (const m of primary.sort((a, b) => a.r.i - b.r.i)) { const key = `${m.g.event_bar_index}|${m.side}`; if (!clusters.has(key)) clusters.set(key, []); clusters.get(key).push(m); }
    const indep = [...clusters.values()].map((c) => c[0]);
    const spl = (s, k) => s.filter((m) => (Array.isArray(k) ? k : [k]).includes(splitOf(m.r.t)));
    const evalSet = spl(indep, ['EVALUATION_A', 'EVALUATION_B']), devSet = spl(indep, 'DEVELOPMENT');
    const res = {
      label, population: { pre_gate_candidate_candles: h2CandRows.filter((c) => (label === 'H2a' ? c.aligned : true)).length, qualified_raw_event_count: primary.length, gap_spanning_excluded: gapS.length, independent_cluster_count: indep.length, clusters_started_while_production_position_open: indep.filter((m) => openAt(m.r.i)).length },
      structural_r: { raw: summarize(primary), independent: summarize(indep), independent_stress_cost: summarize(indep.map((m) => ({ o: m.o_stress })).filter((x) => x.o.status !== 'NO_DATA')), independent_delay: summarize(indep.map((m) => ({ o: m.o_delay })).filter((x) => x.o.status !== 'NO_DATA')), gap_spanning_only: summarize(gapS) },
      splits: { DEVELOPMENT: summarize(devSet), EVALUATION_A: summarize(spl(indep, 'EVALUATION_A')), EVALUATION_B: summarize(spl(indep, 'EVALUATION_B')), EVALUATION_A_plus_B: summarize(evalSet) },
      breakdowns_independent: { side: by(indep, (m) => m.side), event_type: by(indep, (m) => m.g.ev_type), event_age: by(indep, (m) => m.r.evAge), regime_5m: by(indep, (m) => m.r.rg5), bias_15m_direction: by(indep, (m) => m.r.b15d), bias_15m_regime: by(indep, (m) => m.r.b15r), regime_30m: by(indep, (m) => m.r.m30r), regime_1h: by(indep, (m) => m.r.h1r), session: by(indep, (m) => m.r.ses), hour_bucket: by(indep, (m) => hourBucket(m.r.hr)), volatility: by(indep, (m) => volBucket(m.r.atrR)), year: by(indep, (m) => iso(m.r.t).slice(0, 4)), year_month: by(indep, (m) => iso(m.r.t).slice(0, 7)), displacement_atr: by(indep, (m) => (Math.abs(m.r.evLvlD) < 1.5 ? '1.0-1.5' : Math.abs(m.r.evLvlD) < 2.0 ? '1.5-2.0' : '2.0-2.5')), objective_source: by(indep, (m) => m.g.objective), quality_bucket: by(indep, (m) => (m.g.quality >= 80 ? 'q80+' : m.g.quality >= 70 ? 'q70-79' : 'q65-69')) },
    };
    const s = res.structural_r.independent; const pos = (o) => Object.values(o).filter((v) => v.sum_r > 0).map((v) => v.sum_r); const totalPos = (o) => pos(o).reduce((a, b) => a + b, 0);
    const conc = (o) => { const tp = totalPos(o); return tp > 0 ? r3(Math.max(...pos(o)) / tp) : null; };
    res.concentration = { max_share_by_year: conc(res.breakdowns_independent.year), max_share_by_session: conc(res.breakdowns_independent.session), max_share_by_side: conc(res.breakdowns_independent.side), top5_share_of_positive_r: s.top5_share_of_positive_r, unstable: [conc(res.breakdowns_independent.year), conc(res.breakdowns_independent.session), conc(res.breakdowns_independent.side)].some((v) => v != null && v > 0.6) || ((res.splits.DEVELOPMENT.mean_r ?? 0) > 0) !== ((res.splits.EVALUATION_A_plus_B.mean_r ?? 0) > 0) };
    res.decision = classify(indep, evalSet, devSet, indep.map((m) => ({ o: m.o_stress })), indep.map((m) => ({ o: m.o_delay })).filter((x) => x.o.status !== 'NO_DATA'), null);
    res.independent_events = indep.map((m) => ({ t: iso(m.r.t), i: m.r.i, side: m.side, ev: m.g.ev_type, age: m.r.evAge, disp_atr: m.r.evLvlD, q: m.g.quality, rr: m.g.rr, entry: m.g.geo.entry, sl: m.g.geo.sl, tp2: m.g.geo.tp2, R: m.o.R, exit: m.o.exit, bars: m.o.bars, mfe_r: m.o.mfe_r, mae_r: m.o.mae_r, split: splitOf(m.r.t), b15: `${m.r.b15d}/${m.r.b15r}`, m30: m.r.m30r, h1: m.r.h1r, ses: m.r.ses }));
    return res;
  };
  return { pre_gate_rejections_all_candidates: preGate, evaluated_qualified_candles: evaluated.length, H2a: build('H2a', evaluated.filter((m) => m.aligned)), H2b: build('H2b', evaluated) };
}

// ---------------- +30 USD observability ----------------
function monetaryObservability() {
  const sig = trades.filter((t) => t.signal && t.prod && !t.prod.skipped && splitOf(t.t) !== 'EXCLUDED');
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return r3(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
  const targetAtr = sig.map((t) => 30 / t.atr); const tpUsd = sig.map((t) => Math.abs(t.tp2 - t.entry)); const ratio = sig.map((t) => 30 / Math.abs(t.tp2 - t.entry));
  const mfeUsd = sig.map((t) => t.prod.mfe); const hold = sig.map((t) => t.prod.hold);
  const tp2BeforeMonetary = sig.filter((t) => t.prod.mfe >= Math.abs(t.tp2 - t.entry)).length; const monetaryHit = sig.filter((t) => t.prod.exit === 'BROKER_TP').length; const mfe30 = sig.filter((t) => t.prod.mfe >= 30).length;
  const exits = {}; for (const t of sig) exits[t.prod.exit] = (exits[t.prod.exit] ?? 0) + 1;
  const dist = (arr) => ({ n: arr.length, p10: q(arr, 0.1), p25: q(arr, 0.25), median: q(arr, 0.5), p75: q(arr, 0.75), p90: q(arr, 0.9), mean: r3(mean(arr)) });
  return {
    note: 'MEASUREMENT ONLY. Production signals from the Edge Lab replay (signal==true), production-stack simulation; 2026-09-30 excluded. Lot 0.01 => 30 USD profit = 30.00 USD price move (contract 100 oz).',
    n_signals: sig.length, target_30usd_in_atr: dist(targetAtr), structural_tp2_distance_usd: dist(tpUsd), ratio_30usd_over_tp2_distance: dist(ratio), mfe_usd_simulated: dist(mfeUsd), hold_bars_simulated: dist(hold),
    pct_structural_tp2_reached_by_mfe: r3(tp2BeforeMonetary / sig.length), pct_mfe_reached_30usd: r3(mfe30 / sig.length), pct_exit_by_30usd_broker_tp: r3(monetaryHit / sig.length), simulated_exit_reasons: exits,
    real_account_evidence: 'state/xauusd_mt5_real_trade_log.jsonl: two REAL closes to date, BROKER_SL -50.00 (2026-09-25 10:08Z) and THESIS_STOP_CLOSE -9.87 (2026-09-25 11:41Z); no REAL trade has reached +30 USD.',
    documentation_discrepancy: 'src/engine/intraday/params.js comment on minAtrUsd says "+3 USD overlay target"; REAL config profitTargetUsd is 30 (mt5RealPolicy.js). Documentation correction only; no monetary change proposed.',
  };
}

// ---------------- run ----------------
const t0 = Date.now();
const h1 = studyH1(); console.log('H1 done', JSON.stringify({ raw: h1.population.raw_event_count, indep: h1.population.independent_cluster_count, mean_r: h1.structural_r.independent.mean_r, status: h1.decision.status }));
const h2 = studyH2(); console.log('H2 done', JSON.stringify({ H2a: { raw: h2.H2a.population.qualified_raw_event_count, indep: h2.H2a.population.independent_cluster_count, mean_r: h2.H2a.structural_r.independent.mean_r, status: h2.H2a.decision.status }, H2b: { raw: h2.H2b.population.qualified_raw_event_count, indep: h2.H2b.population.independent_cluster_count, mean_r: h2.H2b.structural_r.independent.mean_r, status: h2.H2b.decision.status } }));
const mon = monetaryObservability();
const meta = { generated_utc: new Date().toISOString(), elapsed_s: Math.round((Date.now() - t0) / 1000), spec: SPEC, replay_rows: rowCount, excluded_2026_09_30_rows: excludedToday, bars_5m: b5.length, bars_5m_span: [iso(b5[0].time), iso(b5.at(-1).time)], controls: ctrl, engine_files_sha256: Object.fromEntries(['intraday/params.js', 'intraday/pipeline5m.js', 'intraday/models5m.js', 'intraday/risk5m.js', 'intraday/bias.js', 'regime.js', 'structure.js', 'quality.js', 'htf.js'].map((f) => [f, createHash('sha256').update(readFileSync(join(REPO, 'src', 'engine', f))).digest('hex').slice(0, 16)])) };
writeFileSync(join(OUT, 'study_results.json'), JSON.stringify({ meta, H1: h1, H2: h2, monetary_target_observability: mon }, null, 1));
writeFileSync(join(OUT, 'h1_independent_events.json'), JSON.stringify(h1.independent_events, null, 0));
writeFileSync(join(OUT, 'h2a_independent_events.json'), JSON.stringify(h2.H2a.independent_events, null, 0));
writeFileSync(join(OUT, 'h2b_independent_events.json'), JSON.stringify(h2.H2b.independent_events, null, 0));
console.log(`written to ${OUT} in ${meta.elapsed_s}s`);
