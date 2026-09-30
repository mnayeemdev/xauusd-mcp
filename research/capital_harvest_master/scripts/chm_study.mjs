/**
 * CAPITAL HARVEST MASTER -- integrated study runner (RESEARCH ONLY). Imports the runtime-grade pure modules
 * (src/engine/capitalHarvest) so research and any future shadow share ONE code path. Reads Edge Lab bars, the
 * enriched candidate set and the production-stack simulation read-only; writes only research/capital_harvest_master/results/.
 * No execution module is imported. No production state is touched. Spec: PREREGISTRATION.md (hash asserted).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COSTS, HORIZON_BARS, MANAGEMENT_CANDIDATES, simulatePosition, canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { RISK_POLICIES_PCT, assessCapitalEligibility, productionMonetaryVeto, governedExposure } from '../../../src/engine/capitalHarvest/riskPolicy.js';

const HERE = dirname(fileURLToPath(import.meta.url)); const REPO = join(HERE, '..', '..', '..'); const ROOT = join(REPO, 'research', 'capital_harvest_master'); const OUT = join(ROOT, 'results'); mkdirSync(OUT, { recursive: true });
const PREREG_SHA = readFileSync(join(ROOT, 'PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0];
if (createHash('sha256').update(readFileSync(join(ROOT, 'PREREGISTRATION.md'))).digest('hex') !== PREREG_SHA) throw new Error('PREREGISTRATION.md does not match its frozen hash');
const LAB = join(REPO, 'handoff', 'edge_discovery_lab', 'data');
const b5 = JSON.parse(readFileSync(join(LAB, 'XAUUSDm_bars.json'), 'utf8'))['5m'];
const EQUITIES = [62.07, 75, 100, 250, 500, 1000]; const POLICIES = [null, ...RISK_POLICIES_PCT, 'PROD_VETO']; const MARGIN_FLOOR = 20.8;
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100); const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);
const iso = (t) => new Date(t * 1000).toISOString(); const day = (t) => iso(t).slice(0, 10); const month = (t) => iso(t).slice(0, 7);
const SPLIT = { dev: ['2025-05-07', '2025-12-31'], hold: ['2026-01-01', '2026-09-29'] };
const split = (t) => { const d = day(t); if (d >= SPLIT.dev[0] && d <= SPLIT.dev[1]) return 'DEV'; if (d >= SPLIT.hold[0] && d <= SPLIT.hold[1]) return 'HOLD'; return 'EXCLUDED'; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null); const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function bootCI(v, n = 2000, seed = 20260930) { if (v.length < 2) return null; const rand = rng(seed); const ms = []; for (let k = 0; k < n; k++) { let s = 0; for (let j = 0; j < v.length; j++) s += v[Math.floor(rand() * v.length)]; ms.push(s / v.length); } ms.sort((a, b) => a - b); return [r3(ms[Math.floor(0.025 * n)]), r3(ms[Math.floor(0.975 * n)])]; }

// ---------- data ----------
const C = readFileSync(join(REPO, 'research', 'entry_architecture_v2', 'results', 'candidates.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const SIG = C.filter((c) => (c.act === 'BUY' || c.act === 'SELL') && c.geo && split(c.t) !== 'EXCLUDED').map((c) => ({ i: c.i, t: c.t, side: c.side, model: c.model, anchor: c.anchor, entry: c.geo.entry, sl: c.geo.sl, tp2Dist: Math.abs(c.geo.tp2 - c.geo.entry), rr: c.geo.rr, atr: c.atr, q: c.q_final, rg5: c.rg5, ses: c.ses, split: split(c.t) })).sort((a, b) => a.i - b.i);
const sessions = new Set(); const sessBy = { DEV: new Set(), HOLD: new Set() };
for (const line of readFileSync(join(LAB, 'lab_rows.jsonl'), 'utf8').split('\n')) { if (!line) continue; const t = Number(line.slice(line.indexOf('"t":') + 4, line.indexOf(',', line.indexOf('"t":')))); const sp = split(t); if (sp === 'EXCLUDED') continue; sessions.add(day(t)); sessBy[sp].add(day(t)); }
const LT = JSON.parse(readFileSync(join(LAB, 'lab_trades.json'), 'utf8')); const H0BY = new Map(); for (const t of LT) if (t.signal && t.taken && t.prod && !t.prod.skipped) H0BY.set(t.i, t.prod);
// timestamp alignment control: candidate index i must point at a bar whose time equals candidate t
let misaligned = 0; for (const s of SIG) if (b5[s.i]?.time !== s.t) misaligned++;
let nonMono = 0; for (let k = 1; k < b5.length; k++) if (!(b5[k].time > b5[k - 1].time)) nonMono++;
console.log(`signals ${SIG.length} (DEV ${SIG.filter((s) => s.split === 'DEV').length}, HOLD ${SIG.filter((s) => s.split === 'HOLD').length}); sessions ${sessions.size}; misaligned ${misaligned}; non-monotone bars ${nonMono}`);
if (misaligned || nonMono) throw new Error('TIMESTAMP ALIGNMENT CONTROL FAILED');

// ---------- per-signal simulations (independent of equity) ----------
const CANDS = ['RUN_TO_END', 'CH_A', 'CH_B', 'CH_C', 'CH_D1', 'CH_D2', 'CH_D3'];
const CASES = { normal: { costs: COSTS.normal, drift: false }, stress: { costs: COSTS.stress, drift: false }, drift: { costs: COSTS.normal, drift: true } };
function simAll(cand, cse) { const params = MANAGEMENT_CANDIDATES[cand]; return SIG.map((s) => simulatePosition({ bars: b5, i: s.i, side: s.side, entry: s.entry, sl: s.sl, atr: s.atr, tp2Dist: s.tp2Dist, params, costs: cse.costs, drift: cse.drift })); }
console.log('simulating ...'); const SIM = {}; for (const cand of CANDS) { SIM[cand] = {}; for (const [cn, cse] of Object.entries(CASES)) SIM[cand][cn] = simAll(cand, cse); console.log(' ', cand, 'done'); }
// CONTROL = Edge Lab production-stack outcomes on the same signals, minus slippage (V1 H0 convention)
const H0 = SIG.map((s) => { const p = H0BY.get(s.i); if (!p) return { status: 'NO_DATA' }; return { status: 'RESOLVED', gap: false, exit: p.exit, exitBar: p.closeIdx, bars: p.hold, pnl_usd: r3(p.pnl - COSTS.normal.slip), r: r3((p.pnl - COSTS.normal.slip) / p.risk), risk_usd: p.risk, mfe_usd: p.mfe, mae_usd: p.mae, given_back: r3(p.mfe - p.pnl), giveback_share: p.mfe > 0 ? r3((p.mfe - p.pnl) / p.mfe) : null, cost_usd: COSTS.normal.spread + COSTS.normal.slip, trigger_bar: null, protect_bar: null, decision: null, states: ['PRODUCTION'], ratchetViolations: 0 }; });
SIM.CONTROL = { normal: H0, stress: H0, drift: H0 };

// ---------- sequential capital paths ----------
function eligibility(s, equity, policy) {
  if (policy == null) return { eligible: true, reasons: [] };
  if (policy === 'PROD_VETO') { const v = productionMonetaryVeto({ equity, price: s.entry }); return { eligible: v.executable, reasons: v.reasons }; }
  return assessCapitalEligibility({ equity, freeMargin: equity, price: s.entry, entry: s.entry, sl: s.sl, riskPct: policy });
}
function runPath(outcomes, { policy = null, startEquity = 62.07, splitOnly = null } = {}) {
  const trades = []; const skipped = { SAME_OR_EARLIER_CANDLE: 0, STALE_SAME_SETUP: 0, REVENGE_GUARD: 0, CAPITAL_RISK_TOO_HIGH: 0, MARGIN_UNSAFE: 0, PROD_VETO: 0, NO_DATA: 0 };
  let exitBar = -1, lastTrade = null, lastLoss = false, equity = startEquity, peak = startEquity, maxDD = 0, minBal = startEquity, streak = 0, maxStreak = 0, sincePeak = 0; const recover = []; let bankrupt = false;
  for (let k = 0; k < SIG.length; k++) { const s = SIG[k]; if (splitOnly && s.split !== splitOnly) continue; const o = outcomes[k]; if (!o || o.status === 'NO_DATA' || o.status === 'INVALID') { skipped.NO_DATA++; continue; }
    const ok = canReenter({ signal: s, exitBar, lastTrade, lastExitWasLoss: lastLoss }); if (!ok.ok) { skipped[ok.reason]++; continue; }
    const el = eligibility(s, equity, policy); if (!el.eligible) { if (policy === 'PROD_VETO') skipped.PROD_VETO++; else if (el.reasons.includes('CAPITAL_RISK_TOO_HIGH')) skipped.CAPITAL_RISK_TOO_HIGH++; else skipped.MARGIN_UNSAFE++; continue; }
    trades.push({ s, o, equity_before: r2(equity), risk_pct: r3((governedExposure({ entry: s.entry, sl: s.sl }).exposureUsd / equity) * 100) });
    equity += o.pnl_usd; if (equity > peak) { if (sincePeak > 0) recover.push(sincePeak); peak = equity; sincePeak = 0; } else sincePeak++; maxDD = Math.max(maxDD, peak - equity); minBal = Math.min(minBal, equity); if (equity <= MARGIN_FLOOR) bankrupt = true;
    if (o.pnl_usd <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; exitBar = o.exitBar; lastTrade = s; lastLoss = o.pnl_usd <= 0; }
  return { trades, skipped, path: { start: startEquity, final: r2(equity), min_balance: r2(minBal), max_drawdown_usd: r2(maxDD), max_drawdown_pct_of_start: r3(maxDD / startEquity), max_loss_streak: maxStreak, median_trades_to_recover_peak: median(recover), margin_floor_hit: bankrupt } };
}
function depletion(trades, start, draws = 500, seed = 7) { if (!trades.length) return null; const rand = rng(seed); const byM = {}; for (const t of trades) (byM[month(t.s.t)] ??= []).push(t.o.pnl_usd); const months = Object.values(byM); let hit = 0; for (let k = 0; k < draws; k++) { const order = [...months].sort(() => rand() - 0.5); let bal = start, h = false; for (const m of order) for (const p of [...m].sort(() => rand() - 0.5)) { bal += p; if (bal <= MARGIN_FLOOR) h = true; } if (hit === hit && h) hit++; } return r3(hit / draws); }
const isHarvest = (o) => typeof o.exit === 'string' && o.exit.startsWith('HARVEST');
function stats(trades, sessSet, cfOutcomes = null, triggerR = null) {
  const P = trades.map((t) => t.o.pnl_usd); if (!P.length) return { trades: 0 };
  const wins = P.filter((x) => x > 0), losses = P.filter((x) => x <= 0); const gw = wins.reduce((s, x) => s + x, 0), gl = -losses.reduce((s, x) => s + x, 0);
  const perDay = {}; for (const t of trades) perDay[day(t.s.t)] = (perDay[day(t.s.t)] ?? 0) + 1; const counts = [...sessSet].map((d) => perDay[d] ?? 0); const months = {}; for (const t of trades) months[month(t.s.t)] = (months[month(t.s.t)] ?? 0) + t.o.pnl_usd; const mv = Object.values(months);
  const avgW = mean(wins), avgL = losses.length ? -mean(losses) : null; const costs = trades.reduce((s, t) => s + (t.o.cost_usd ?? 0), 0);
  const withMfe = trades.filter((t) => t.o.mfe_usd > 0); const gb = withMfe.map((t) => t.o.given_back); const gbShare = withMfe.map((t) => t.o.giveback_share).filter((x) => x != null);
  const trig = trades.filter((t) => t.o.trigger_bar != null); const prot = trades.filter((t) => t.o.protect_bar != null); const harv = trades.filter((t) => isHarvest(t.o)); const run = trades.filter((t) => t.o.states?.includes('PROTECTED_RUN') || t.o.exit === 'FLOOR_BANK'); const early = trades.filter((t) => t.o.exit === 'THESIS_DETERIORATION');
  let prematureCost = null, runnerExtra = null, prematureN = 0;
  if (cfOutcomes) { const pc = []; for (const t of trades) { if (isHarvest(t.o) || t.o.exit === 'THESIS_DETERIORATION') { const cf = cfOutcomes[t.k]; if (cf && cf.status !== 'NO_DATA') pc.push(cf.pnl_usd - t.o.pnl_usd); } } prematureN = pc.length; prematureCost = r3(mean(pc)); }
  if (triggerR != null) { const re = prot.map((t) => t.o.pnl_usd - (triggerR * t.o.risk_usd - COSTS.normal.slip)); runnerExtra = r3(mean(re)); }
  const winStreaks = [], lossStreaks = []; let sum = 0, kind = null; for (const x of P) { const k = x > 0 ? 'W' : 'L'; if (k === kind) sum += x; else { if (kind === 'W') winStreaks.push(sum); if (kind === 'L') lossStreaks.push(-sum); kind = k; sum = x; } } if (kind === 'W') winStreaks.push(sum); if (kind === 'L') lossStreaks.push(-sum);
  const indep = (() => { let n = 0, lastI = -1e9, lastSide = null; for (const t of trades) { if (t.s.side !== lastSide || t.s.i - lastI > 12) n++; lastI = t.s.i; lastSide = t.s.side; } return n; })();
  return { trades: P.length, independent_trades: indep, trades_per_session: { p10: pct(counts, 0.1), median: pct(counts, 0.5), p90: pct(counts, 0.9), mean: r2(mean(counts)) }, zero_trade_session_rate: r3(counts.filter((x) => x === 0).length / counts.length), avg_hold_bars: r2(mean(trades.map((t) => t.o.bars))), median_hold_bars: median(trades.map((t) => t.o.bars)),
    win_rate: r3(wins.length / P.length), avg_win_usd: r2(avgW), avg_loss_usd: r2(avgL), wins_erased_by_one_loss: avgW && avgL ? r2(avgL / avgW) : null, expectancy_usd: r3(mean(P)), expectancy_r: r3(mean(trades.map((t) => t.o.r))), pf: gl > 0 ? r2(gw / gl) : (gw > 0 ? 99 : null), ci95_usd: bootCI(P), gross_profit_usd: r2(gw), gross_loss_usd: r2(gl), net_usd: r2(gw - gl), costs_usd: r2(costs), cost_pct_of_gross_profit: gw > 0 ? r3(costs / (gw + costs)) : null,
    mfe_mean_usd: r2(mean(trades.map((t) => t.o.mfe_usd))), mae_mean_usd: r2(mean(trades.map((t) => t.o.mae_usd))), mfe_median_usd: r2(median(trades.map((t) => t.o.mfe_usd))),
    profit_available_rate: r3(trig.length / P.length), protect_rate: r3(prot.length / P.length), harvest_rate: r3(harv.length / P.length), protected_run_rate: r3(run.length / P.length), early_exit_rate: r3(early.length / P.length), early_exit_avg_loss_usd: r2(mean(early.map((t) => -t.o.pnl_usd))),
    giveback: { mean: r2(mean(gb)), median: r2(median(gb)), p75: r2(pct(gb, 0.75)), p90: r2(pct(gb, 0.9)), share_of_mfe_mean: r3(mean(gbShare)) }, premature_exit_cost_usd: prematureCost, premature_exit_n: prematureN, additional_profit_from_runners_usd: runnerExtra, runners_n: prot.length,
    top5_share_of_gross_profit: gw > 0 ? r3([...P].sort((a, b) => b - a).slice(0, 5).filter((x) => x > 0).reduce((s, x) => s + x, 0) / gw) : null, months: mv.length, months_positive_share: mv.length ? r3(mv.filter((x) => x > 0).length / mv.length) : null,
    loss_asymmetry: { median_win_streak_usd: r2(median(winStreaks)), median_loss_streak_usd: r2(median(lossStreaks)), p95_loss_sequence_usd: r2(pct(lossStreaks, 0.95)) }, capital_risk_pct_mean: r3(mean(trades.map((t) => t.risk_pct))), capital_risk_pct_p90: r3(pct(trades.map((t) => t.risk_pct), 0.9)),
    exit_mix: Object.fromEntries(Object.entries(trades.reduce((g, t) => { g[t.o.exit] = (g[t.o.exit] ?? 0) + 1; return g; }, {}))), by_model: Object.fromEntries(['MC', 'PB', 'BO', 'SR', 'MR'].map((m) => { const x = trades.filter((t) => t.s.model === m); return [m, { n: x.length, exp_usd: r3(mean(x.map((t) => t.o.pnl_usd))) }]; })), by_side: Object.fromEntries(['BUY', 'SELL'].map((m) => { const x = trades.filter((t) => t.s.side === m); return [m, { n: x.length, exp_usd: r3(mean(x.map((t) => t.o.pnl_usd))) }]; })) };
}
const withK = (outcomes) => outcomes; // outcomes are indexed by signal position k
function tradesWithK(res) { return res.trades.map((t) => ({ ...t, k: SIG.indexOf(t.s) })); }

// ---------- controls ----------
console.log('controls ...');
const ctrl = (() => { const rand = rng(99); const leak = [], nul = []; const ind = SIG.filter((s, k) => k % 7 === 0);
  for (const s of ind) { if (s.i + 13 >= b5.length) continue; const fut = b5[s.i + 12].close - b5[s.i].close; const mk = (side) => ({ bars: b5, i: s.i, side, entry: b5[s.i].close, sl: side === 'BUY' ? b5[s.i].close - s.atr : b5[s.i].close + s.atr, atr: s.atr, params: { kind: 'BANK', triggerR: 1.0 } }); const o1 = simulatePosition(mk(fut >= 0 ? 'BUY' : 'SELL')), o2 = simulatePosition(mk(rand() < 0.5 ? 'BUY' : 'SELL')); if (o1.status === 'RESOLVED' && !o1.gap) leak.push(o1.pnl_usd); if (o2.status === 'RESOLVED' && !o2.gap) nul.push(o2.pnl_usd); }
  const sample = SIG.slice(0, 400); const a = sample.map((s) => simulatePosition({ bars: b5, i: s.i, side: s.side, entry: s.entry, sl: s.sl, atr: s.atr, tp2Dist: s.tp2Dist, params: MANAGEMENT_CANDIDATES.CH_D1 }).pnl_usd); const b = sample.map((s) => simulatePosition({ bars: b5, i: s.i, side: s.side, entry: s.entry, sl: s.sl, atr: s.atr, tp2Dist: s.tp2Dist, params: MANAGEMENT_CANDIDATES.CH_D1, costs: { spread: COSTS.normal.spread, slip: 0 } }).pnl_usd); const diff = mean(b) - mean(a);
  const ratchet = CANDS.reduce((s, c) => s + SIM[c].normal.reduce((x, o) => x + (o.ratchetViolations ?? 0), 0), 0);
  // structural-stop integrity: no realized loss may exceed broker SL distance + slip + swap for any candidate (stop never widened)
  let widened = 0; for (const c of CANDS) for (const o of SIM[c].normal) if (o.status !== 'NO_DATA' && o.exit === 'BROKER_SL' && -o.pnl_usd > o.broker_sl_usd + COSTS.normal.slip + (o.swap_usd ?? 0) + 1e-6) widened++;
  return { leak_mean_usd: r3(mean(leak)), leak_n: leak.length, null_mean_usd: r3(mean(nul)), null_n: nul.length, cost_test: { no_slip_minus_normal: r3(diff), expected: 0.10, pass: Math.abs(diff - 0.10) < 0.001 }, ratchet_violations: ratchet, stop_widened: widened, timestamp_misaligned: misaligned, non_monotone_bars: nonMono }; })();
console.log(JSON.stringify(ctrl));
if (!(ctrl.leak_mean_usd > 1.0) || !(Math.abs(ctrl.null_mean_usd) < 0.5) || !ctrl.cost_test.pass || ctrl.ratchet_violations || ctrl.stop_widened) throw new Error('CONTROL FAILED ' + JSON.stringify(ctrl));

// ---------- study ----------
function runStudy() {
  const out = { architectures: {}, capital_matrix: {}, eligibility: {} };
  // eligibility rates per policy x equity (all signals, fixed equity)
  for (const eq of EQUITIES) { out.eligibility[eq] = {}; for (const pol of POLICIES) { const el = SIG.map((s) => eligibility(s, eq, pol)); const ok = el.filter((e) => e.eligible).length; out.eligibility[eq][String(pol)] = { eligible_share: r3(ok / SIG.length), eligible_n: ok, reasons: el.filter((e) => !e.eligible).reduce((g, e) => { for (const r of e.reasons) g[r] = (g[r] ?? 0) + 1; return g; }, {}) }; }
    const ex = SIG.map((s) => governedExposure({ entry: s.entry, sl: s.sl })); out.eligibility[eq]._risk = { median_exposure_pct: r3(median(ex.map((e) => (e.exposureUsd / eq) * 100))), p75_exposure_pct: r3(pct(ex.map((e) => (e.exposureUsd / eq) * 100), 0.75)), median_structural_pct: r3(median(ex.map((e) => (e.structuralLossUsd / eq) * 100))), margin_burden_pct: r3((4150 * 100 * 0.01 / 200 / eq) * 100), production_veto_executable: productionMonetaryVeto({ equity: eq, price: 4150 }).executable }; }
  const dedup = { same_candle: 0, revenge: 0 };
  for (const cand of ['CONTROL', ...CANDS.filter((c) => c !== 'RUN_TO_END')]) {
    const A = { candidate: cand, params: MANAGEMENT_CANDIDATES[cand] ?? 'production stack', per_policy: {} };
    const triggerR = MANAGEMENT_CANDIDATES[cand]?.triggerR ?? null;
    for (const pol of POLICIES) { A.per_policy[String(pol)] = {};
      for (const eq of EQUITIES) {
        const resN = runPath(SIM[cand].normal, { policy: pol, startEquity: eq }); const tr = tradesWithK(resN);
        for (let k = 1; k < tr.length; k++) { if (tr[k].s.i <= tr[k - 1].o.exitBar) dedup.same_candle++; if (tr[k - 1].o.pnl_usd <= 0 && tr[k].s.side === tr[k - 1].s.side && tr[k].s.i - tr[k - 1].o.exitBar <= 3) dedup.revenge++; }
        const H = tr.filter((t) => t.s.split === 'HOLD'), D = tr.filter((t) => t.s.split === 'DEV');
        const cf = SIM.RUN_TO_END.normal;
        const row = { equity: eq, ALL: stats(tr, sessions, cf, triggerR), DEV: stats(D, sessBy.DEV, cf, triggerR), HOLD: stats(H, sessBy.HOLD, cf, triggerR), skipped: resN.skipped, path_all: resN.path, path_hold: runPath(SIM[cand].normal, { policy: pol, startEquity: eq, splitOnly: 'HOLD' }).path, path_dev: runPath(SIM[cand].normal, { policy: pol, startEquity: eq, splitOnly: 'DEV' }).path, depletion_hold_from_start: depletion(H, eq) };
        if (cand !== 'CONTROL') { const st = tradesWithK(runPath(SIM[cand].stress, { policy: pol, startEquity: eq })).filter((t) => t.s.split === 'HOLD'); const dr = tradesWithK(runPath(SIM[cand].drift, { policy: pol, startEquity: eq })).filter((t) => t.s.split === 'HOLD'); const ss = stats(st, sessBy.HOLD), ds = stats(dr, sessBy.HOLD); row.HOLD_stress = { trades: ss.trades, expectancy_usd: ss.expectancy_usd, pf: ss.pf, net_usd: ss.net_usd, ci95_usd: ss.ci95_usd }; row.HOLD_drift = { trades: ds.trades, expectancy_usd: ds.expectancy_usd, pf: ds.pf, net_usd: ds.net_usd }; }
        A.per_policy[String(pol)][eq] = row;
        out.capital_matrix[`${cand}|${pol}|${eq}`] = { trades_all: row.ALL.trades, trades_hold: row.HOLD.trades, hold_exp: row.HOLD.expectancy_usd, hold_pf: row.HOLD.pf, hold_ci: row.HOLD.ci95_usd, dd_all: row.path_all.max_drawdown_usd, dd_pct: row.path_all.max_drawdown_pct_of_start, min_bal_all: row.path_all.min_balance, floor_hit: row.path_all.margin_floor_hit, loss_streak: row.path_all.max_loss_streak, depletion_hold: row.depletion_hold_from_start, risk_pct_mean: row.ALL.capital_risk_pct_mean, eligible_share: out.eligibility[eq][String(pol)].eligible_share, stress_exp: row.HOLD_stress?.expectancy_usd ?? null };
      } }
    out.architectures[cand] = A; console.log(' ', cand, 'paths done');
  }
  out.dedup = dedup;
  return out;
}
const run1 = runStudy();
// repeatability: re-simulate one candidate end-to-end and compare
const rep = simAll('CH_D1', CASES.normal); const hA = createHash('sha256').update(JSON.stringify(SIM.CH_D1.normal)).digest('hex'), hB = createHash('sha256').update(JSON.stringify(rep)).digest('hex');
const resultsHash = createHash('sha256').update(JSON.stringify(run1)).digest('hex');
if (hA !== hB) throw new Error('REPEATABILITY CONTROL FAILED');
if (run1.dedup.same_candle || run1.dedup.revenge) throw new Error('DEDUP CONTROL FAILED ' + JSON.stringify(run1.dedup));

// ---------- decisions (PREREGISTRATION section 11) ----------
const decisions = {};
for (const cand of CANDS.filter((c) => c !== 'RUN_TO_END')) { decisions[cand] = {};
  for (const pol of RISK_POLICIES_PCT) { const pp = run1.architectures[cand].per_policy[String(pol)]; const eqs = EQUITIES.filter((eq) => pp[eq].HOLD.trades >= 300); const eq = eqs[0] ?? null; const rowsAt = (e) => pp[e];
    const judge = (e) => { const row = rowsAt(e); const h = row.HOLD; if (!h.trades || h.trades < 300) return { status: 'EMPTY', trades: h.trades ?? 0 }; const reasons = []; const ctl = run1.architectures.CONTROL.per_policy[String(pol)][e];
      if (h.expectancy_usd <= 0) reasons.push('expectancy<=0'); if ((h.pf ?? 0) < 1.0) reasons.push('PF<1'); if ((row.HOLD_stress?.expectancy_usd ?? -9) <= 0) reasons.push('stress<=0'); if ((h.wins_erased_by_one_loss ?? 99) > 5) reasons.push('erased>5'); if (row.path_hold.max_drawdown_pct_of_start > 0.30) reasons.push('DD>30%'); if ((row.depletion_hold_from_start ?? 0) > 0.05) reasons.push('depletion>5%');
      if (reasons.length) return { status: 'REJECTED', reasons, equity: e, trades: h.trades };
      const promo = []; if (!(h.ci95_usd?.[0] > 0)) promo.push('CI includes 0'); if (h.pf < 1.15) promo.push('PF<1.15'); if (!(row.DEV.expectancy_usd > 0)) promo.push('DEV<=0'); if (!((row.HOLD_drift?.expectancy_usd ?? -1) > 0)) promo.push('drift<=0'); if ((h.months_positive_share ?? 0) < 0.6) promo.push('months<60%'); if ((h.top5_share_of_gross_profit ?? 1) > 0.3) promo.push('top5>30%'); if (MANAGEMENT_CANDIDATES[cand].kind === 'ADAPTIVE' || MANAGEMENT_CANDIDATES[cand].kind === 'RUN') { if ((h.giveback?.p90 ?? 0) > 2 * (h.avg_win_usd ?? 0)) promo.push('P90 giveback > 2x avg win'); if ((h.additional_profit_from_runners_usd ?? -1) < 0) promo.push('runners add < 0'); }
      const vsCtl = ctl && ctl.HOLD.trades ? { pf_not_worse: h.pf >= (ctl.HOLD.pf ?? 0), dd_not_worse: row.path_hold.max_drawdown_usd <= (ctl.path_hold.max_drawdown_usd ?? Infinity) } : null; if (vsCtl && !vsCtl.pf_not_worse && !vsCtl.dd_not_worse) promo.push('worse PF and DD than CONTROL');
      return { status: promo.length ? 'INCONCLUSIVE' : 'SUPPORTED_RESEARCH_LEAD', promo_gaps: promo, equity: e, trades: h.trades, vs_control: vsCtl }; };
    decisions[cand][String(pol)] = { first_nonempty_equity: eq, at_first_nonempty: eq ? judge(eq) : { status: 'EMPTY' }, at_62_07: judge(62.07), at_250: judge(250), at_1000: judge(1000) }; } }
const supported = Object.entries(decisions).flatMap(([c, d]) => Object.entries(d).flatMap(([p, r]) => [['first', r.at_first_nonempty], ['62.07', r.at_62_07]].filter(([, x]) => x.status === 'SUPPORTED_RESEARCH_LEAD').map(([w, x]) => ({ candidate: c, policy: p, where: w, equity: x.equity }))));
const meta = { generated_utc: new Date().toISOString(), prereg_sha256: PREREG_SHA, results_hash: resultsHash, repeatability_pass: hA === hB, signals: SIG.length, signals_dev: SIG.filter((s) => s.split === 'DEV').length, signals_hold: SIG.filter((s) => s.split === 'HOLD').length, sessions: sessions.size, sessions_dev: sessBy.DEV.size, sessions_hold: sessBy.HOLD.size, controls: ctrl, dedup: run1.dedup, candidates: CANDS, policies: POLICIES, equities: EQUITIES, costs: COSTS, bonferroni_alpha: 0.05 / 6, forward_shadow_eligible: supported.some((x) => x.equity <= 250), supported };
writeFileSync(join(OUT, 'study_results.json'), JSON.stringify({ meta, decisions, ...run1 }, null, 1));
// compact console
for (const cand of ['CONTROL', 'CH_A', 'CH_B', 'CH_C', 'CH_D1', 'CH_D2', 'CH_D3']) for (const pol of ['null', '3', '5', '10']) { const r = run1.architectures[cand].per_policy[pol]; console.log(cand.padEnd(6), `pol ${pol}`.padEnd(8), EQUITIES.map((eq) => { const x = r[eq]; return `${eq}: n${x.HOLD.trades} e${x.HOLD.expectancy_usd} pf${x.HOLD.pf} dd${x.path_hold.max_drawdown_usd}${x.path_all.margin_floor_hit ? '!' : ''}`; }).join(' | ')); }
console.log('SUPPORTED', JSON.stringify(supported)); console.log('written', join(OUT, 'study_results.json'));
