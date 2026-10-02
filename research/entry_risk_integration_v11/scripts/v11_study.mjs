/**
 * V11 ENTRY + RISK INTEGRATION -- study runner (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED). Spec: ../V11_PREREGISTRATION.md (hash asserted).
 * EDGE_PHASE=DEV : integrated replay on DEV (+ integrity) -> results/v11_dev.json, configs/v11_freeze.json (code frozen).
 * EDGE_PHASE=FULL: freeze verified; DEV + HOLDOUT grid, entry-only economics, entry-risk matrix records, planned vs realized
 *                  risk, chronological replay determinism, restart, duplicate delivery, fault-injection replay, decision.
 * CORRECTION (see ../CORRECTION_LOG.md): the pre-registered MARGIN_INSUFFICIENT injection (leverage 1) did not guarantee an
 * insufficient-margin condition; it is replaced by a leverage that puts the minimum-lot margin at 2x the cap. The original
 * injection is still replayed as a diagnostic (`prereg_harness`). integrate.mjs is unchanged.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { simulateTrade, SWAP_PER_NIGHT } from '../../capital_harvest_v9/scripts/harvest.mjs';
import { initState, openPosition, settle, serialize, deserialize } from '../../risk_capital_v10/scripts/risk.mjs';
import { COSTS, loadContext, signals as v10Signals, outcomes as v10Outcomes, walk as v10Walk, cfgOf as v10CfgOf } from '../../risk_capital_v10/scripts/sim.mjs';
import { entryFromRow, entryHash, integrateEntry, loadPlatformSpec, validateBrokerOrder, checkEntryGeometry, deepFreeze } from './integrate.mjs';

const PHASE = process.env.EDGE_PHASE === 'FULL' ? 'FULL' : 'DEV';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const OUT = join(ROOT, 'results'); const CFG = join(ROOT, 'configs'); mkdirSync(OUT, { recursive: true }); mkdirSync(CFG, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex'); const shaFile = (p) => sha(readFileSync(p));
if (shaFile(join(ROOT, 'V11_PREREGISTRATION.md')) !== readFileSync(join(ROOT, 'V11_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('V11_PREREGISTRATION hash mismatch');
const RISK_LIB = join(REPO, 'research', 'risk_capital_v10', 'scripts', 'risk.mjs'); if (shaFile(RISK_LIB) !== '2fc1806a1e14748e430e75e6eb0fa58ce6ebf79ad63f4262d9275c0366e49cd0') throw new Error('V10 risk library changed');
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100); const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null); const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const count = (a, f) => a.reduce((g, x) => { const k = f(x); g[k] = (g[k] ?? 0) + 1; return g; }, {});

const CTX = loadContext(); const B = CTX.bars; const SPEC = loadPlatformSpec(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl'));
const ACCOUNTS = [1000, 5000, 10000]; const MODELS = [['CURRENT', null], ['PCT', 0.001], ['PCT', 0.0025], ['PCT', 0.005], ['PCT', 0.01]];
const mkey = (m, r) => (m === 'CURRENT' ? 'CURRENT_0.01_LOT' : `PCT_${r}`);
const cfgOf = (model, riskPct, cost) => ({ ...v10CfgOf(model, riskPct, cost, SPEC), spec: SPEC });

function entries(S) { const out = []; for (const l of readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.act !== 'BUY' && r.act !== 'SELL') continue; out.push(entryFromRow(r)); } return out.sort((a, b) => a.i - b.i); }
/** Outcomes per entry and cost (per oz): the V10 simulation plus the execution components (swap nights, gap) for attribution. */
function outcomes(ents) { const O = {}; for (const [k, c] of Object.entries(COSTS)) { let stops = 0; O[k] = new Map(); for (const e of ents) { const o = simulateTrade(B, CTX.F, e, { kind: 'BASELINE' }, { spread: c.spread, slip: c.slip }); if (o.status === 'NO_DATA' || o.status === 'INVALID') continue; let pnl = o.pnl_usd; let gap = 0; const R = Math.abs(e.entry - e.sl); if (c.gapEvery && (o.exit === 'BROKER_SL' || o.exit === 'THESIS_INVALIDATION')) { stops++; if (stops % c.gapEvery === 0) { gap = c.gapR * R; pnl -= gap; } }
  let nights = 0; if (e.side === 'BUY') for (let j = e.i + 1; j <= o.exitBar; j++) if (Math.floor(B[j].time / 86400) !== Math.floor(B[j - 1].time / 86400)) nights++;
  O[k].set(e.id, { pnl_oz: pnl, r: pnl / R, exitBar: o.exitBar, exitT: B[o.exitBar].time + 300, exit: o.exit, gap_oz: gap, swap_oz: nights * SWAP_PER_NIGHT, R }); } } return O; }

const FAULTS = [
  ['EQUITY_UNAVAILABLE', (c) => ({ ...c, equity: null }), 'EQUITY_UNAVAILABLE'],
  ['SL_UNAVAILABLE', (c) => ({ ...c, deliverSlMissing: true }), 'SL_UNAVAILABLE'],
  ['BROKER_SPEC_UNAVAILABLE', (c) => ({ ...c, spec: { ...c.spec, volume_step: null } }), 'BROKER_SPEC_UNAVAILABLE'],
  ['TICK_VALUE_UNAVAILABLE', (c) => ({ ...c, spec: { ...c.spec, currency_profit: 'EUR', platform_tick_value: null } }), 'TICK_VALUE_UNAVAILABLE'],
  ['DATA_STALE_QUOTE', (c) => ({ ...c, quoteAgeSec: 120 }), 'DATA_STALE_QUOTE'],
  ['DATA_STALE_SIGNAL', (c) => ({ ...c, signalAgeSec: 900 }), 'DATA_STALE_SIGNAL'],
  ['SPREAD_ABOVE_LIMIT', (c) => ({ ...c, spread: 0.85 }), 'SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT'],
  ['POSITION_SIZE_INVALID', (c) => ({ ...c, faults: { tamperLots: true } }), 'POSITION_SIZE_INVALID'],
  ['RISK_CALCULATION_INCONSISTENT', (c) => ({ ...c, faults: { tamperRisk: true } }), 'RISK_CALCULATION_INCONSISTENT'],
  ['MIN_LOT_EXCEEDS_RISK', (c) => ({ ...c, faults: { riskPct: 1e-6 } }), 'RISK_BELOW_MIN_LOT'],
  ['MARGIN_INSUFFICIENT', (c) => ({ ...c, spec: { ...c.spec, leverage: (c.spec.volume_min * c.spec.contract_size * c.entryPrice) / (2 * c.cfg.marginCapPct * c.equity) } }), 'MARGIN_ABOVE_CAP'],
  ['BROKER_STOPS_LEVEL', (c) => ({ ...c, spec: { ...c.spec, stops_level_points: 1e9 } }), 'BROKER_STRUCTURAL_SL_INSIDE_STOPS_LEVEL'],
  ['BROKER_REJECTS_ORDER', (c) => ({ ...c, faults: { brokerReject: 'TRADE_RETCODE_INVALID_STOPS' } }), 'REJECTED_BY_BROKER'],
];
/** The pre-registered (defective) margin injection, replayed as a diagnostic only. */
const FAULTS_PREREG = FAULTS.map((f) => (f[0] === 'MARGIN_INSUFFICIENT' ? ['MARGIN_INSUFFICIENT_PREREG_LEVERAGE_1', (c) => ({ ...c, spec: { ...c.spec, leverage: 1 } }), 'MARGIN_ABOVE_CAP'] : f));

/** Integrated chronological replay: every valid entry gets exactly one record. */
function run(ents, O, model, riskPct, cost, equity0, { keepRecords = false, startState = null, from = 0, upto = null, faultEvery = 0, faultList = FAULTS } = {}) {
  const cfg = cfgOf(model, riskPct, cost); let W = startState ? deserialize(serialize(startState)) : { ctrl: initState(equity0), exitBar: -1, last: null, lastLoss: false, peak: equity0, maxDD: 0, minEq: equity0, attempts: 0, rec: [] };
  const stop = upto ?? ents.length; const S = COSTS[cost];
  for (let k = from; k < stop; k++) { const e = ents[k]; const o = O.get(e.id); const eh = entryHash(e); const base = { entry_id: e.id, engine_entry_hash: eh, model: e.model, side: e.side, hyp_r: o ? o.r : null };
    if (!o) { W.rec.push({ ...base, outcome: 'NOT_EVALUABLE', reason: 'NO_FORWARD_DATA', entry_hash_after: eh }); continue; }
    if (e.i <= W.exitBar) { W.rec.push({ ...base, outcome: 'EXPOSURE_BLOCKED', reason: 'POSITION_OPEN', entry_hash_after: eh }); continue; }
    const ok = canReenter({ signal: e, exitBar: W.exitBar, lastTrade: W.last, lastExitWasLoss: W.lastLoss }); if (!ok.ok) { W.rec.push({ ...base, outcome: 'EXPOSURE_BLOCKED', reason: ok.reason, entry_hash_after: eh }); continue; }
    let ctx = { equity: W.ctrl.equity, spread: S.spread, quoteAgeSec: 0, signalAgeSec: 0, nowT: e.t + 300, spec: SPEC, cfg, entryPrice: e.entry }; let fault = null;
    if (faultEvery && W.attempts % faultEvery === faultEvery - 1) { fault = faultList[Math.floor(W.attempts / faultEvery) % faultList.length]; ctx = fault[1](ctx); }
    W.attempts++; const delivered = ctx.deliverSlMissing ? deepFreeze({ ...e, sl: null }) : e;
    const out = integrateEntry(W.ctrl, delivered, ctx); W.ctrl = out.state; const rec = { ...base, ...out.record, engine_entry_hash: eh, fault: fault ? fault[0] : null, fault_expected: fault ? fault[2] : null };
    if (fault && rec.outcome === 'RISK_ACCEPTED') { const m = (rec.lots * SPEC.contract_size * e.entry) / ctx.spec.leverage; Object.assign(rec, { fault_leverage: ctx.spec.leverage, fault_margin_pct: m / ctx.equity, fault_margin_level_after_loss_pct: ((ctx.equity - rec.planned_risk_usd) / m) * 100, fault_cap: cfg.marginCapPct }); }
    if (rec.outcome === 'RISK_ACCEPTED') { const lots = rec.lots; const pnl = o.pnl_oz * lots * SPEC.contract_size; const eqBefore = W.ctrl.equity; W.ctrl = openPosition(W.ctrl, { id: e.id }, { lots, actual_risk: rec.planned_risk_usd }); W.ctrl = settle(W.ctrl, { pnlUsd: pnl, exitT: o.exitT }, cfg);
      const plannedOz = 1.5 * o.R + S.spread + cfg.slipAllowance; const lossOz = -o.pnl_oz; const k100 = lots * SPEC.contract_size;
      Object.assign(rec, { pnl_usd: pnl, r: o.r, exit: o.exit, equity_before: eqBefore, equity_after: W.ctrl.equity, realized_loss_usd: pnl < 0 ? -pnl : 0, planned_worst_oz: plannedOz, exceed_usd: lossOz > plannedOz + 1e-9 ? (lossOz - plannedOz) * k100 : 0, swap_usd: o.swap_oz * k100, gap_usd: o.gap_oz * k100, slip_excess_usd: o.exit === 'BROKER_SL' ? Math.max(0, S.slip - cfg.slipAllowance) * k100 : 0, broker_recheck_ok: validateBrokerOrder({ lots, side: e.side, entry: e.entry, sl: e.sl, spread: S.spread, spec: SPEC }).ok });
      W.peak = Math.max(W.peak, W.ctrl.equity); const dd = (W.peak - W.ctrl.equity) / W.peak; rec.dd = dd; W.maxDD = Math.max(W.maxDD, dd); W.minEq = Math.min(W.minEq, W.ctrl.equity); W.exitBar = o.exitBar; W.last = { i: e.i, model: e.model, side: e.side, anchor: e.anchor }; W.lastLoss = pnl <= 0; }
    W.rec.push(rec); }
  return keepRecords ? W : summarize(W, ents.length - from, model, riskPct, equity0);
}
function summarize(W, nEntries, model, riskPct, equity0) {
  const rec = W.rec; const acc = rec.filter((x) => x.outcome === 'RISK_ACCEPTED'); const rs = acc.map((x) => x.r); const wins = rs.filter((x) => x > 0), losses = rs.filter((x) => x <= 0);
  let s = 0, worst = 0; for (const x of acc) { if (x.pnl_usd <= 0) { s++; worst = Math.max(worst, s); } else s = 0; }
  const rr = rec.filter((x) => x.outcome === 'RISK_REJECTED'); const lossAcc = acc.filter((x) => x.pnl_usd < 0); const exc = lossAcc.filter((x) => x.exceed_usd > 0); const dds = acc.map((x) => x.dd);
  return {
    valid_entries: nEntries, records: rec.length, identity_ok: rec.length === nEntries && new Set(rec.map((x) => x.entry_id)).size === nEntries,
    by_outcome: count(rec, (x) => x.outcome), by_reason: count(rec.filter((x) => x.outcome !== 'RISK_ACCEPTED'), (x) => `${x.outcome}:${x.reason}`),
    eligibility_share_of_evaluated: r4(acc.length / Math.max(1, acc.length + rr.length)),
    risk_rejected_valid_entries: rr.length, risk_rejected_hyp_mean_r: r4(mean(rr.map((x) => x.hyp_r).filter(Number.isFinite))), min_lot_rejections: rr.filter((x) => x.reason === 'RISK_BELOW_MIN_LOT').length,
    exposure_blocked: rec.filter((x) => x.outcome === 'EXPOSURE_BLOCKED').length, fail_closed: rec.filter((x) => x.outcome === 'FAIL_CLOSED').length,
    trades: acc.length, expectancy_r: r4(mean(rs)), pf_r: r4(losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : null), win_rate: r4(wins.length / Math.max(1, rs.length)), avg_win_r: r4(mean(wins)), avg_loss_r: r4(mean(losses)), worst_loss_streak: worst,
    start: equity0, end: r2(W.ctrl.equity), return_pct: r4(W.ctrl.equity / equity0 - 1), max_dd_pct: r4(W.maxDD), recovery_needed_pct: r4(W.maxDD / (1 - W.maxDD)), min_equity: r2(W.minEq), survived: W.ctrl.equity > 0,
    dd_distribution: { p50: r4(pct(dds, 0.5)), p90: r4(pct(dds, 0.9)), share_ge_10: r4(dds.filter((x) => x >= 0.1).length / Math.max(1, dds.length)), share_ge_20: r4(dds.filter((x) => x >= 0.2).length / Math.max(1, dds.length)) },
    planned_risk_pct_mean: r4(mean(acc.map((x) => x.planned_risk_pct))), planned_risk_pct_max: r4(Math.max(0, ...acc.map((x) => x.planned_risk_pct))), lots_mean: r4(mean(acc.map((x) => x.lots))), lots_max: r4(Math.max(0, ...acc.map((x) => x.lots))),
    margin_pct_max: r4(Math.max(0, ...acc.map((x) => x.margin_pct))), margin_pct_mean: r4(mean(acc.map((x) => x.margin_pct))),
    pct_above_approved: model === 'PCT' ? acc.filter((x) => x.planned_risk_usd > x.approved_cash_usd + 1e-9).length : null,
    broker_invalid_accepted: acc.filter((x) => !x.broker_recheck_ok).length,
    entry_hash_mismatches: rec.filter((x) => x.entry_hash_after !== x.engine_entry_hash && x.fault !== 'SL_UNAVAILABLE').length,
    planned_vs_realized: { losing_trades: lossAcc.length, exceedances: exc.length, exceed_share: r4(exc.length / Math.max(1, lossAcc.length)), max_ratio: r4(Math.max(0, ...lossAcc.map((x) => x.realized_loss_usd / x.planned_risk_usd))), excess_usd: r2(exc.reduce((a, x) => a + x.exceed_usd, 0)), swap_usd: r2(exc.reduce((a, x) => a + x.swap_usd, 0)), gap_usd: r2(exc.reduce((a, x) => a + x.gap_usd, 0)), slip_excess_usd: r2(exc.reduce((a, x) => a + x.slip_excess_usd, 0)), current_losses_above_50usd: model === 'CURRENT' ? lossAcc.filter((x) => x.realized_loss_usd > 50).length : null },
  };
}
/** Entry-only economics (no risk layer; the unchanged one-position walk), in R. */
function entryOnly(ents, O) { let exitBar = -1, last = null, lastLoss = false; const rs = []; for (const e of ents) { const o = O.get(e.id); if (!o || e.i <= exitBar) continue; if (!canReenter({ signal: e, exitBar, lastTrade: last, lastExitWasLoss: lastLoss }).ok) continue; rs.push(o.r); exitBar = o.exitBar; last = { i: e.i, model: e.model, side: e.side, anchor: e.anchor }; lastLoss = o.pnl_oz <= 0; }
  const w = rs.filter((x) => x > 0), l = rs.filter((x) => x <= 0); let cum = 0, peak = 0, dd = 0, s = 0, worst = 0; for (const x of rs) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); if (x <= 0) { s++; worst = Math.max(worst, s); } else s = 0; }
  return { n: rs.length, expectancy_r: r4(mean(rs)), pf_r: r4(w.reduce((a, b) => a + b, 0) / Math.abs(l.reduce((a, b) => a + b, 0))), win_rate: r4(w.length / rs.length), avg_win_r: r4(mean(w)), avg_loss_r: r4(mean(l)), max_dd_r: r2(dd), worst_loss_streak: worst, net_r: r2(cum) }; }
function geometry(ents) { const d = ents.map((e) => checkEntryGeometry(e)); return { entries: ents.length, ok: d.filter((x) => x.ok).length, defects: count(d.flatMap((x) => x.defects), (x) => x), side_mix: count(ents, (e) => e.side), model_mix: count(ents, (e) => e.model) }; }
function grid(ents, O) { const g = {}; for (const A of ACCOUNTS) { g[A] = {}; for (const [m, r] of MODELS) g[A][mkey(m, r)] = Object.fromEntries(Object.keys(COSTS).map((c) => [c, run(ents, O[c], m, r, c, A)])); } return g; }
/** V10 parity: the integrated replay must reproduce the V10 walk (same entries, sizes, equity) when no fault is injected. */
function v10Parity(S, ents, O) { const sigs = v10Signals(S); const O10 = v10Outcomes(sigs, CTX); let pnlMismatch = 0; for (const c of Object.keys(COSTS)) for (const s of sigs) { const a = O10[c].get(s.id), b = O[c].get(s.id); if (!!a !== !!b || (a && Math.abs(a.pnl_oz - b.pnl_oz) > 1e-9)) pnlMismatch++; }
  const cmp = []; for (const A of ACCOUNTS) for (const [m, r] of MODELS) { const a = v10Walk(sigs, O10.normal, v10CfgOf(m, r, 'normal', SPEC), A); const b = run(ents, O.normal, m, r, 'normal', A); cmp.push({ A, model: mkey(m, r), v10_end: a.end, v11_end: b.end, v10_trades: a.trades, v11_trades: b.trades, same: a.end === b.end && a.trades === b.trades }); }
  return { signals_v10: sigs.length, entries_v11: ents.length, outcome_pnl_mismatches: pnlMismatch, configs: cmp, all_same: cmp.every((x) => x.same) && pnlMismatch === 0 && sigs.length === ents.length }; }
/** Compact entry-risk matrix: every valid entry with its outcome in each configuration (NORMAL cost). */
function matrix(S, ents, O) { const cols = []; for (const A of ACCOUNTS) for (const [m, r] of MODELS) cols.push([`${mkey(m, r)}@${A}`, run(ents, O.normal, m, r, 'normal', A, { keepRecords: true }).rec]); const code = (x) => (x.outcome === 'RISK_ACCEPTED' ? `A:${x.lots}` : `${x.outcome[0]}${x.outcome === 'EXPOSURE_BLOCKED' ? 'X' : ''}:${x.reason}`);
  const lines = ents.map((e, k) => JSON.stringify({ id: e.id, t: e.t, model: e.model, side: e.side, entry: e.entry, sl: e.sl, hash: entryHash(e).slice(0, 16), hyp_r: r4(O.normal.get(e.id)?.r ?? null), d: Object.fromEntries(cols.map(([n, rec]) => [n, code(rec[k])])) }));
  writeFileSync(join(OUT, `entry_risk_matrix_${S}.jsonl`), lines.join('\n') + '\n'); return { file: `results/entry_risk_matrix_${S}.jsonl`, rows: lines.length, columns: cols.map(([n]) => n) }; }

const DEV = entries('DEV'); const OD = outcomes(DEV);
if (PHASE === 'DEV') {
  const res = { phase: 'DEV', generated_utc: new Date().toISOString(), spec: SPEC, entries: DEV.length, geometry: geometry(DEV), entry_only: { normal: entryOnly(DEV, OD.normal), severe: entryOnly(DEV, OD.severe) }, grid: grid(DEV, OD), v10_parity: v10Parity('DEV', DEV, OD) };
  writeFileSync(join(OUT, 'v11_dev.json'), JSON.stringify(res, null, 1));
  const freeze = { frozen_utc: new Date().toISOString(), prereg_sha: shaFile(join(ROOT, 'V11_PREREGISTRATION.md')), integrate_sha: shaFile(join(HERE, 'integrate.mjs')), study_sha: shaFile(join(HERE, 'v11_study.mjs')), risk_sha: shaFile(RISK_LIB) };
  writeFileSync(join(CFG, 'v11_freeze.json'), JSON.stringify(freeze, null, 1)); console.log('geometry', JSON.stringify(res.geometry.defects), 'entry_only', JSON.stringify(res.entry_only.normal), 'v10_parity', res.v10_parity.all_same, res.v10_parity.outcome_pnl_mismatches);
} else {
  const fz = JSON.parse(readFileSync(join(CFG, 'v11_freeze.json'), 'utf8')); for (const [k, p] of [['prereg_sha', join(ROOT, 'V11_PREREGISTRATION.md')], ['integrate_sha', join(HERE, 'integrate.mjs')], ['study_sha', join(HERE, 'v11_study.mjs')], ['risk_sha', RISK_LIB]]) if (fz[k] !== shaFile(p)) throw new Error(`freeze violated: ${k}`);
  const HOLD = entries('HOLD'); const OH = outcomes(HOLD); const res = { phase: 'FULL', generated_utc: new Date().toISOString(), freeze: fz, spec: SPEC, splits: {} };
  for (const [S, ents, O] of [['DEV', DEV, OD], ['HOLD', HOLD, OH]]) res.splits[S] = { entries: ents.length, geometry: geometry(ents), entry_only: Object.fromEntries(Object.keys(COSTS).map((c) => [c, entryOnly(ents, O[c])])), grid: grid(ents, O), v10_parity: v10Parity(S, ents, O), matrix: matrix(S, ents, O) };
  // ---- chronological replay determinism, restart, duplicate delivery (HOLD, PCT 0.50 %, 10,000 USD, NORMAL) ----
  const ref = () => run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true }); const a = ref(), b = ref(); const hRec = (W) => sha(JSON.stringify(W.rec));
  const half = Math.floor(HOLD.length / 2); const first = run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true, upto: half }); const resumed = run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true, startState: deserialize(serialize(first)), from: half });
  const dup = (() => { const e = HOLD.find((x) => OH.normal.has(x.id)); const ctx = { equity: 10000, spread: 0.24, quoteAgeSec: 0, signalAgeSec: 0, nowT: e.t + 300, spec: SPEC, cfg: cfgOf('PCT', 0.005, 'normal') }; const s1 = integrateEntry(initState(10000), e, ctx); const s2 = integrateEntry(s1.state, e, ctx); const s3 = integrateEntry(deserialize(serialize(s1.state)), e, ctx); return { first: s1.record.outcome, second: s2.record.outcome, after_restart: s3.record.outcome, ok: s1.record.outcome === 'RISK_ACCEPTED' && s2.record.outcome === 'DUPLICATE_DELIVERY' && s3.record.outcome === 'DUPLICATE_DELIVERY' }; })();
  // ---- fault-injection replay: every 10th integration attempt carries one simulated fault (cycled) ----
  const faultSummary = (W, list) => { const xs0 = W.rec.filter((x) => x.fault); return { by_fault: Object.fromEntries(list.map(([name, , expected]) => { const xs = xs0.filter((x) => x.fault === name); return [name, { injected: xs.length, expected_reason: expected, closed_with_expected_reason: xs.filter((x) => x.reason === expected).length, closed_upstream_other_reason: xs.filter((x) => x.reason !== expected && x.outcome !== 'RISK_ACCEPTED').length, accepted_despite_fault: xs.filter((x) => x.outcome === 'RISK_ACCEPTED').length, entry_unchanged: xs.filter((x) => x.fault !== 'SL_UNAVAILABLE').every((x) => x.entry_hash_after === x.engine_entry_hash) }]; })), accepted_details: xs0.filter((x) => x.outcome === 'RISK_ACCEPTED').map((x) => ({ entry_id: x.entry_id, fault: x.fault, lots: x.lots, leverage: x.fault_leverage, margin_pct: r4(x.fault_margin_pct), cap: x.fault_cap, margin_level_after_loss_pct: r2(x.fault_margin_level_after_loss_pct), margin_rule_satisfied: x.fault_margin_pct <= x.fault_cap && x.fault_margin_level_after_loss_pct >= (SPEC.margin_call_pct ?? 60) + 40 })) }; };
  const P = run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true, faultEvery: 10, faultList: FAULTS_PREREG }); const prereg = faultSummary(P, FAULTS_PREREG);
  const F = run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true, faultEvery: 10 }); const inj = F.rec.filter((x) => x.fault);
  const faults = Object.fromEntries(FAULTS.map(([name, , expected]) => { const xs = inj.filter((x) => x.fault === name); const exact = xs.filter((x) => x.reason === expected).length; const upstream = xs.filter((x) => x.reason !== expected && x.outcome !== 'RISK_ACCEPTED').length; const accepted = xs.filter((x) => x.outcome === 'RISK_ACCEPTED').length; return [name, { injected: xs.length, expected_reason: expected, closed_with_expected_reason: exact, closed_upstream_other_reason: upstream, accepted_despite_fault: accepted, entry_unchanged: xs.filter((x) => x.fault !== 'SL_UNAVAILABLE').every((x) => x.entry_hash_after === x.engine_entry_hash) }]; }));
  const clean = run(HOLD, OH.normal, 'PCT', 0.005, 'normal', 10000, { keepRecords: true }); const firstFault = F.rec.findIndex((x) => x.fault);
  res.integrity = {
    replay_deterministic: hRec(a) === hRec(b), restart_equals_uninterrupted: hRec({ rec: resumed.rec }) === hRec(a), restart_split_at: half, duplicate_delivery: dup,
    fault_injection: { config: 'HOLD PCT 0.50 % 10,000 USD NORMAL, fault on every 10th integration attempt (corrected harness)', attempts: F.attempts, injected: inj.length, by_fault: faults, faults_accepted: inj.filter((x) => x.outcome === 'RISK_ACCEPTED').length, prefix_identical_to_clean: sha(JSON.stringify(F.rec.slice(0, firstFault))) === sha(JSON.stringify(clean.rec.slice(0, firstFault))), identity_ok: F.rec.length === HOLD.length },
    fault_injection_prereg_harness: { note: 'pre-registered harness replayed as a diagnostic; its MARGIN_INSUFFICIENT injection used leverage 1', injected: P.rec.filter((x) => x.fault).length, faults_accepted: P.rec.filter((x) => x.fault && x.outcome === 'RISK_ACCEPTED').length, ...prereg },
  };
  // ---- decision (pre-registered) ----
  const cells = []; for (const S of ['DEV', 'HOLD']) for (const A of ACCOUNTS) for (const [m, r] of MODELS) for (const c of Object.keys(COSTS)) cells.push(res.splits[S].grid[A][mkey(m, r)][c]);
  const v10sel = JSON.parse(readFileSync(join(REPO, 'research', 'risk_capital_v10', 'configs', 'selection.json'), 'utf8'));
  const fail = { entry_changed: cells.some((x) => x.entry_hash_mismatches > 0), pct_above_approved: cells.some((x) => (x.pct_above_approved ?? 0) > 0), broker_invalid_accepted: cells.some((x) => x.broker_invalid_accepted > 0), identity_broken: cells.some((x) => !x.identity_ok) || !res.integrity.fault_injection.identity_ok, fault_not_closed: res.integrity.fault_injection.faults_accepted > 0 || Object.values(faults).some((x) => !x.entry_unchanged), restart_mismatch: !res.integrity.restart_equals_uninterrupted || !res.integrity.replay_deterministic, duplicate_accepted: !dup.ok };
  const failed = Object.values(fail).some(Boolean); const supported = v10sel.approved_risk_pct != null;
  const preregFaultNotClosed = res.integrity.fault_injection_prereg_harness.faults_accepted > 0; const preregAcceptedAllLegit = res.integrity.fault_injection_prereg_harness.accepted_details.every((x) => x.margin_rule_satisfied);
  res.decision = { prereg_harness: { fault_not_closed: preregFaultNotClosed, status_if_used: preregFaultNotClosed ? 'INTEGRATION_FAILED' : null, accepted_trades_satisfied_margin_rule: preregAcceptedAllLegit }, failure_conditions: fail, mechanics: 'see tests/entry_risk_integration_v11.test.js (must pass)', supported_risk_percentage: supported ? v10sel.approved_risk_pct : 'UNRESOLVED', INTEGRATION_STATUS: failed ? 'INTEGRATION_FAILED' : supported ? 'INTEGRATION_VALIDATED_PENDING_CAPITAL_CHECK' : 'INTEGRATION_PARTIALLY_VALIDATED' };
  writeFileSync(join(OUT, 'v11_results_FULL.json'), JSON.stringify(res, null, 1)); console.log('integrity', JSON.stringify({ ...res.integrity, fault_injection: { ...res.integrity.fault_injection, by_fault: undefined } })); console.log('faults', JSON.stringify(Object.fromEntries(Object.entries(faults).map(([k, v]) => [k, `${v.closed_with_expected_reason}/${v.injected} exact, ${v.closed_upstream_other_reason} upstream, ${v.accepted_despite_fault} accepted`])))); console.log('decision', JSON.stringify(res.decision));
}
