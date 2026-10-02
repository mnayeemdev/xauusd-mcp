/**
 * V17 RISK GATE HARDENING -- study runner (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED; reads only).
 * Spec: ../V17_PREREGISTRATION.md (hash asserted).
 *   V17_PHASE=DEV  : DEV evidence -> configs/v17_freeze.json (severe slippage, reopen-gap levels, swap rates, envelope swap nights)
 *   V17_PHASE=FULL : freeze verified; DEV and HOLDOUT chronological walks; gap / swap / slippage / envelope analyses; replay; decision
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulateTrade, HORIZON } from '../../capital_harvest_v9/scripts/harvest.mjs';
import { loadContext } from '../../risk_capital_v10/scripts/sim.mjs';
import { gapThroughOz, closureReachable } from '../../entry_edge_risk_v12/scripts/envelope.mjs';
import { specFromCapture, validateBrokerData, swapRates, rolloverCharges, boundaryCharges, decideRisk, settleRisk, initRiskState, realizedComponents, sizePosition, RULES, RISK_CANDIDATES, EXCEEDANCE_CLASSES, CONTRACT } from './riskgate.mjs';

const PHASE = process.env.V17_PHASE === 'FULL' ? 'FULL' : 'DEV';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..');
const OUT = join(ROOT, 'results'); const CFG = join(ROOT, 'configs'); mkdirSync(OUT, { recursive: true }); mkdirSync(CFG, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex');
if (sha(readFileSync(join(ROOT, 'V17_PREREGISTRATION.md'))) !== readFileSync(join(ROOT, 'V17_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('V17_PREREGISTRATION hash mismatch');
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null); const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = (a) => (a.length ? { n: a.length, mean: r4(a.reduce((s, x) => s + x, 0) / a.length), p50: r4(pct(a, 0.5)), p90: r4(pct(a, 0.9)), p99: r4(pct(a, 0.99)), max: r4(Math.max(...a)) } : { n: 0 });
const count = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const SPLITS = { DEV: [Date.UTC(2025, 4, 7) / 1000, Date.UTC(2026, 0, 1) / 1000], HOLD: [Date.UTC(2026, 0, 1) / 1000, Date.UTC(2026, 8, 30) / 1000] };

// ---------------- inputs ----------------
const CTX = loadContext(); const B = CTX.bars; const F = CTX.F; const REAL_SPEC = CTX.spec;
const CAP = JSON.parse(readFileSync(join(OUT, 'broker_spec_live.json'), 'utf8')); const SPEC = specFromCapture(CAP); const SWAP = swapRates(SPEC);
function rows(S) { const out = []; for (const l of readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.act === 'BUY' || r.act === 'SELL') out.push({ id: `${r.i}|${r.act}`, i: r.i, t: r.t, side: r.act, model: r.mdl, entry: r.g?.e, sl: r.g?.sl, anchor: r.anc ?? r.g?.e }); } return out.sort((a, b) => a.i - b.i); }
const ENTRIES = { DEV: rows('DEV'), HOLD: rows('HOLD') };
const inSplit = (t, S) => t >= SPLITS[S][0] && t < SPLITS[S][1];

// ---------------- evidence (bars) ----------------
function discontinuities(S) { const g = { IN_SESSION: [], DAILY_BREAK: [], CLOSURE: [] }; let maxIn = null; for (let j = 1; j < B.length; j++) { const b = B[j], p = B[j - 1]; if (!inSplit(b.time, S)) continue; const dt = b.time - p.time; const t = dt > 86400 ? 'CLOSURE' : dt > 1800 ? 'DAILY_BREAK' : dt === 300 ? 'IN_SESSION' : null; if (!t) continue; const v = Math.abs(b.open - p.close); g[t].push(v); if (t === 'IN_SESSION' && (!maxIn || v > maxIn.v)) maxIn = { v, at: new Date(b.time * 1000).toISOString() }; } return { g, maxIn }; }
const levels = (a) => ({ normal_p50: r4(pct(a, 0.5)), moderate_p90: r4(pct(a, 0.9)), severe_p99: r4(pct(a, 0.99)), historical_max: r4(Math.max(...a)), n: a.length });
function maxNightsInHorizon(S) { let m = 0; for (let i = 0; i + 1 < B.length; i++) { if (!inSplit(B[i].time, S)) continue; const j = Math.min(B.length - 1, i + HORIZON); const c = rolloverCharges(B[i].time + 300, B[j].time + 300, SWAP.rollover3days).charged_nights; if (c > m) m = c; } return m; }

// ---------------- freeze ----------------
const FREEZE = join(CFG, 'v17_freeze.json');
if (PHASE === 'DEV') {
  const d = discontinuities('DEV');
  const freeze = { written_utc: new Date().toISOString(), phase: 'DEV', prereg_sha: sha(readFileSync(join(ROOT, 'V17_PREREGISTRATION.md'))), broker_capture_utc: CAP.captured_utc, swap: SWAP, envelope_swap_max_charged_nights_dev: maxNightsInHorizon('DEV'),
    scenarios: { NORMAL: { spread: 0.24, slip: 0.10, source: 'V5/V9/V10 normal; production CAPITAL_DEFAULTS' }, MODERATE: { spread: RULES.maxSpreadUsd, slip: 0.30, source: 'production maxSpreadUsd; V12 moderate slippage level' }, SEVERE: { spread: RULES.maxSpreadUsd, slip: r4(d.maxIn.v), source: `DEV maximum in-session 5m discontinuity (${d.maxIn.at})` } },
    reopen_gap_levels_dev: { DAILY_BREAK: levels(d.g.DAILY_BREAK), CLOSURE: levels(d.g.CLOSURE) }, in_session_discontinuity_dev: levels(d.g.IN_SESSION) };
  writeFileSync(FREEZE, JSON.stringify(freeze, null, 1)); writeFileSync(join(CFG, 'v17_freeze.sha256'), `${sha(readFileSync(FREEZE))}  v17_freeze.json\n`);
  console.log(JSON.stringify(freeze, null, 1)); process.exit(0);
}
if (sha(readFileSync(FREEZE)) !== readFileSync(join(CFG, 'v17_freeze.sha256'), 'utf8').split(/\s+/)[0]) throw new Error('freeze hash mismatch');
const FZ = JSON.parse(readFileSync(FREEZE, 'utf8')); const SC = FZ.scenarios; const ENV_NIGHTS = FZ.envelope_swap_max_charged_nights_dev;

// ---------------- outcomes per entry and scenario (zero-slippage simulator run; slippage, swap and gap added explicitly) ----------------
const simNights = (e, exitBar) => { if (e.side !== 'BUY') return 0; let n = 0; for (let j = e.i + 1; j <= exitBar; j++) if (Math.floor(B[j].time / 86400) !== Math.floor(B[j - 1].time / 86400)) n++; return n; };
const SIM_SWAP_PER_NIGHT = 0.56; // the V9 simulator's built-in BUY swap, added back so that V17 applies the broker rate itself
const OUTC = new Map();
function outcome(e, scn) { const key = `${e.id}|${scn}`; if (OUTC.has(key)) return OUTC.get(key); const c = SC[scn]; const o = simulateTrade(B, F, { i: e.i, side: e.side, entry: e.entry, sl: e.sl }, { kind: 'BASELINE' }, { spread: c.spread, slip: 0 });
  let res = null; if (o.status === 'RESOLVED' || o.status === 'OPEN_AT_HORIZON') { const R = Math.abs(e.entry - e.sl); const priceOz = o.pnl_usd + simNights(e, o.exitBar) * SIM_SWAP_PER_NIGHT; const atClose = o.exit === 'THESIS_INVALIDATION' || o.exit === 'HORIZON';
    const exitT = B[o.exitBar].time + (atClose ? 300 : 0); const roll = rolloverCharges(B[e.i].time + 300, exitT, SWAP.rollover3days); const bnd = boundaryCharges(B, e.i, o.exitBar, SWAP.rollover3days);
    const gapOz = o.exit === 'BROKER_SL' ? gapThroughOz({ bars: B, exitBar: o.exitBar, side: e.side, entry: e.entry, R }) : 0; const gapKind = gapOz > 0 ? (B[o.exitBar].time - B[o.exitBar - 1].time > 86400 ? 'CLOSURE' : B[o.exitBar].time - B[o.exitBar - 1].time > 1800 ? 'DAILY_BREAK' : 'IN_SESSION') : null;
    res = { exit: o.exit, exitBar: o.exitBar, exitT, stopLossLossOz: -priceOz, slipOz: c.slip, gapOz, gapKind, roll, bnd, R }; }
  OUTC.set(key, res); return res; }

// ---------------- chronological walk ----------------
function walk(S, { riskPct, scn, basis, equity0 = 10_000, list = ENTRIES[S], start = null }) {
  let st = start?.state ?? initRiskState(equity0); let pending = start?.pending ?? null; const decisions = [], trades = [];
  const settleUpTo = (i) => { if (pending && pending.exitBar <= i) { st = settleRisk(st, { pnlUsd: pending.pnlUsd, exitT: pending.exitT, exitBar: pending.exitBar }); pending = null; } };
  for (const e of list) { settleUpTo(e.i); const c = SC[scn]; const execPrice = e.side === 'BUY' ? e.entry + c.spread : e.entry;
    const swapCost = Math.max(0, -(e.side === 'BUY' ? SWAP.long : SWAP.short)); const sig = { id: e.id, i: e.i, t: e.t, side: e.side, model: e.model, entry: e.entry, sl: e.sl, anchor: e.anchor, execPrice, spread: c.spread, quote_ok: true };
    const o = outcome(e, scn); if (!o) { decisions.push({ id: e.id, decision: 'NOT_EVALUABLE' }); continue; }
    const d = decideRisk(st, sig, { riskPct, spec: SPEC, basis, maxSwapCostPerOz: basis === 'ENVELOPE' ? ENV_NIGHTS * swapCost : 0 }); st = d.state; decisions.push({ id: e.id, decision: d.decision.decision });
    if (d.decision.decision !== 'RISK_ACCEPTED') continue; const z = d.decision.sizing;
    const rc = realizedComponents({ stopLossLossOz: o.stopLossLossOz, slippageOz: o.slipOz, gapOz: o.gapOz, swapRatePerOz: e.side === 'BUY' ? SWAP.long : SWAP.short, chargedNights: o.roll.charged_nights, lots: z.lots, spec: SPEC, planned: z.actual_stop_exposure });
    const tr = { id: e.id, i: e.i, t: e.t, side: e.side, model: e.model, entry_price: r4(z.entry_price), engine_entry: e.entry, sl_price: e.sl, broker_sl: r4(z.broker_sl), position_size: z.lots, planned_risk_amount: r4(z.cash_risk), cash_risk_raw: z.cash_risk, actual_stop_risk_raw: z.actual_stop_exposure, planned_risk_pct: riskPct, actual_stop_risk: r4(z.actual_stop_exposure), actual_stop_risk_pct: r4(z.actual_risk_pct), rr: r4(z.rr), exit: o.exit, exitBar: o.exitBar, swap_category: o.roll.category, charged_nights: o.roll.charged_nights, boundary_category: o.bnd.category, gap_kind: o.gapKind,
      stop_loss_loss: r4(rc.stop_loss_loss), commission: r4(rc.commission), swap: r4(rc.swap), slippage: r4(rc.slippage), gap_impact: r4(rc.gap_impact), total_realized: r4(rc.total_realized), risk_multiplier: r4(rc.risk_multiplier), exceedance: rc.exceedance, margin_required: r2(z.margin_required) };
    trades.push(tr); pending = { exitBar: o.exitBar, exitT: o.exitT, pnlUsd: -rc.total_realized }; }
  return { decisions, trades, state: st, pending };
}
function summarize(w) { const L = w.trades.filter((t) => t.total_realized > 0); return { decisions: count(w.decisions, (d) => d.decision), accepted: w.trades.length, losing: L.length, exceedance: count(L, (t) => t.exceedance), multiplier_losers: stats(L.map((t) => t.risk_multiplier)), planned_risk_amount: stats(w.trades.map((t) => t.planned_risk_amount)), actual_stop_risk: stats(w.trades.map((t) => t.actual_stop_risk)),
  stop_loss_loss_losers: stats(L.map((t) => t.stop_loss_loss)), commission: stats(w.trades.map((t) => t.commission)), swap: stats(w.trades.map((t) => t.swap)), slippage: stats(w.trades.map((t) => t.slippage)), gap_impact_all: stats(w.trades.map((t) => t.gap_impact)), gap_events: w.trades.filter((t) => t.gap_impact > 0).length, total_realized_losers: stats(L.map((t) => t.total_realized)),
  max_exceedance: L.length ? L.reduce((a, b) => (b.risk_multiplier > a.risk_multiplier ? b : a)) : null, rounding_violations: w.trades.filter((t) => !(t.actual_stop_risk_raw <= t.cash_risk_raw + 1e-9)).length, rr_violations: w.trades.filter((t) => Math.abs(t.rr - 1.7) > 1e-3).length, margin_required: stats(w.trades.map((t) => t.margin_required)), margin_share_of_equity: stats(w.trades.map((t) => t.margin_required / (t.planned_risk_amount / t.planned_risk_pct))) }; }

// ---------------- run ----------------
const res = { generated_utc: new Date().toISOString(), contract: CONTRACT, prereg_sha: FZ.prereg_sha, freeze_sha: sha(readFileSync(FREEZE)), rules: RULES, spec: SPEC, freeze: FZ };
// broker data validation (live capture vs MT5 calculators vs REAL bridge record)
const bd = validateBrokerData(SPEC); const px = CAP.tick.ask; const marginFormula = (lots) => (lots * SPEC.contract_size * px) / SPEC.leverage;
res.broker = { live_capture_utc: CAP.captured_utc, account_mode: SPEC.account_mode, validation: bd, swap: SWAP,
  margin_check: [0.01, 0.10, 1.00].map((l) => ({ lots: l, formula: r2(marginFormula(l)), mt5_calc: CAP.terminal_calculations[`margin_buy_${l.toFixed(2)}`], abs_diff: r4(Math.abs(marginFormula(l) - CAP.terminal_calculations[`margin_buy_${l.toFixed(2)}`])) })),
  tick_value_check: { formula_usd_per_1usd_move_0_01: r4(0.01 * SPEC.contract_size * 1.0), mt5_calc: CAP.terminal_calculations['profit_buy_0.01_plus_1usd'] },
  real_record_compare: Object.fromEntries(['contract_size', 'volume_min', 'volume_max', 'volume_step', 'point', 'digits', 'stops_level_points', 'freeze_level_points', 'leverage', 'margin_call_pct'].map((k) => [k, { live: SPEC[k], real_record: REAL_SPEC[k] ?? null, equal: Number(SPEC[k]) === Number(REAL_SPEC[k]) }])),
  real_record_swap_long_points: REAL_SPEC.swap_long_points ?? null };
res.broker.ok = bd.ok && res.broker.margin_check.every((m) => m.abs_diff <= 0.5) && Math.abs(res.broker.tick_value_check.formula_usd_per_1usd_move_0_01 - res.broker.tick_value_check.mt5_calc) < 1e-9;
// walks
const BASES = ['ENVELOPE', 'PLANNED']; res.walks = {};
for (const S of ['DEV', 'HOLD']) { res.walks[S] = {}; for (const scn of Object.keys(SC)) for (const rp of RISK_CANDIDATES) for (const basis of BASES) { const w = walk(S, { riskPct: rp, scn, basis }); res.walks[S][`${scn}|${rp}|${basis}`] = summarize(w); if (scn === 'NORMAL' && rp === 0.005 && basis === 'ENVELOPE') res.walks[S].__headline_trades = w.trades; } }
// PRIMARY: risk % unresolved -> every valid entry VALID_ENTRY + RISK_REJECTED
res.primary = Object.fromEntries(['DEV', 'HOLD'].map((S) => [S, count(walk(S, { riskPct: 'UNRESOLVED', scn: 'NORMAL', basis: 'ENVELOPE' }).decisions, (d) => d.decision)]));
// minimum lot by equity (static per entry, NORMAL, ENVELOPE basis)
res.minimum_lot = {}; for (const S of ['DEV', 'HOLD']) { res.minimum_lot[S] = {}; for (const eq of [250, 1000, 10000]) for (const rp of RISK_CANDIDATES) { let n = 0, minLot = 0, ok = 0; const pcts = []; for (const e of ENTRIES[S]) { n++; const sc = SC.NORMAL; const z = sizePosition({ equity: eq, riskPct: rp, side: e.side, execPrice: e.side === 'BUY' ? e.entry + sc.spread : e.entry, entry: e.entry, sl: e.sl, spread: sc.spread, spec: SPEC, basis: 'ENVELOPE', maxSwapCostPerOz: ENV_NIGHTS * Math.max(0, -(e.side === 'BUY' ? SWAP.long : SWAP.short)) }); if (z.ok) ok++; else if (z.reason === 'RISK_REJECTED_MINIMUM_LOT') { minLot++; pcts.push(z.min_lot_risk_pct * 100); } }
  res.minimum_lot[S][`${eq}|${rp}`] = { entries: n, accepted: ok, minimum_lot_rejected: minLot, share_min_lot: r4(minLot / n), min_lot_risk_pct_of_rejected: stats(pcts) }; } }
// swap analysis (headline walk + per-category magnitude, both rollover definitions)
res.swap = {}; for (const S of ['DEV', 'HOLD']) { const T = res.walks[S].__headline_trades; const by = (f) => Object.fromEntries(['INTRADAY', 'OVERNIGHT', 'TRIPLE_ROLLOVER'].map((c) => { const x = T.filter((t) => f(t) === c); return [c, { trades: x.length, buy_trades: x.filter((t) => t.side === 'BUY').length, swap_cost_usd: stats(x.map((t) => t.swap)), swap_cost_share_of_actual_stop_risk: stats(x.map((t) => t.swap / t.actual_stop_risk)) }]; }));
  res.swap[S] = { midnight_rule: by((t) => t.swap_category), daily_break_rule_sensitivity: by((t) => t.boundary_category), usd_per_oz_per_night: { long: r4(SWAP.long), short: r4(SWAP.short) }, envelope_nights: ENV_NIGHTS, max_charged_nights_in_horizon_this_split: maxNightsInHorizon(S),
    swap_exceedance_planned_basis: res.walks[S]['NORMAL|0.005|PLANNED'].exceedance.SWAP_EXCEEDANCE ?? 0, swap_exceedance_envelope_basis: res.walks[S]['NORMAL|0.005|ENVELOPE'].exceedance.SWAP_EXCEEDANCE ?? 0 }; }
// slippage evidence
res.slippage = { scenarios: SC, real_account_entry_slippage: 'two real fills, both 0 (state/xauusd_mt5_real_trade_log.jsonl)', stop_fill_evidence: 'none (no real stop-out fill recorded)' };
for (const S of ['DEV', 'HOLD']) { const d = discontinuities(S); res.slippage[S] = { in_session_discontinuity: levels(d.g.IN_SESSION), max_at: d.maxIn?.at, above_frozen_severe: d.g.IN_SESSION.filter((v) => v > SC.SEVERE.slip).length }; }
// gap analysis
res.gap = { dev_levels_frozen: FZ.reopen_gap_levels_dev }; for (const S of ['DEV', 'HOLD']) { const d = discontinuities(S); const T = res.walks[S].__headline_trades;
  const exposures = []; for (const t of T) { const e = ENTRIES[S].find((x) => x.id === t.id); const R = Math.abs(e.entry - e.sl); const L = e.side === 'BUY' ? e.entry - 1.5 * R : e.entry + 1.5 * R; const k = t.position_size * SPEC.contract_size;
    for (let j = e.i + 1; j <= t.exitBar; j++) { const dt = B[j].time - B[j - 1].time; if (dt <= 1800) continue; const type = dt > 86400 ? 'CLOSURE' : 'DAILY_BREAK'; const dist = e.side === 'BUY' ? B[j - 1].close - L : L - B[j - 1].close; const lv = FZ.reopen_gap_levels_dev[type];
      exposures.push({ type, dist, mult: Object.fromEntries(['normal_p50', 'moderate_p90', 'severe_p99', 'historical_max'].map((q) => [q, (Math.max(0, lv[q] - dist) * k) / t.actual_stop_risk])) }); } }
  const ex = (type) => { const x = exposures.filter((y) => y.type === type); return { positions_open_over_reopen: x.length, distance_to_broker_stop_usd_oz: stats(x.map((y) => y.dist)), extra_multiple_if_adverse_gap: Object.fromEntries(['normal_p50', 'moderate_p90', 'severe_p99', 'historical_max'].map((q) => [q, { share_through_stop: r4(x.filter((y) => y.mult[q] > 0).length / Math.max(1, x.length)), extra_multiple: stats(x.map((y) => y.mult[q])) }])) }; };
  const G = T.filter((t) => t.gap_impact > 0); const flagged = new Set(ENTRIES[S].filter((e) => closureReachable(B, e.i, HORIZON)).map((e) => e.id));
  res.gap[S] = { reopen_levels: { DAILY_BREAK: levels(d.g.DAILY_BREAK), CLOSURE: levels(d.g.CLOSURE) }, realized_gap_through: { events: G.length, by_kind: count(G, (t) => t.gap_kind), gap_impact_usd: stats(G.map((t) => t.gap_impact)), multiplier: stats(G.map((t) => t.risk_multiplier)), worst: G.length ? G.reduce((a, b) => (b.risk_multiplier > a.risk_multiplier ? b : a)) : null },
    exposure_counterfactual: { DAILY_BREAK: ex('DAILY_BREAK'), CLOSURE: ex('CLOSURE') }, GC1_informational: { entries_flagged_share: r4(flagged.size / ENTRIES[S].length), gap_exceedances_removed: G.filter((t) => flagged.has(t.id) && t.gap_kind === 'CLOSURE').length, gap_exceedances_remaining: G.filter((t) => !(flagged.has(t.id) && t.gap_kind === 'CLOSURE')).length, note: 'production has no maximum holding time; the 288-bar horizon is a simulator construct, so GC1 cannot bound real exposure without a new exit rule' } }; }
const gapEx = ['DEV', 'HOLD'].reduce((s, S) => s + Object.entries(res.walks[S]).filter(([k]) => !k.startsWith('__')).reduce((a, [, w]) => a + (w.exceedance.GAP_EXCEEDANCE ?? 0), 0), 0);
res.gap.GAP_RISK = gapEx === 0 ? 'BOUNDED' : 'UNRESOLVED';
// envelope
res.envelope = Object.fromEntries(['DEV', 'HOLD'].map((S) => { const T = res.walks[S].__headline_trades.filter((t) => t.total_realized > 0); const exGap = T.filter((t) => t.total_realized - t.gap_impact > t.actual_stop_risk + 1e-9); return [S, { losing: T.length, within_envelope_excluding_gap: T.length - exGap.length, exceed_excluding_gap: count(exGap, (t) => t.exceedance), gap_tail: T.filter((t) => t.gap_impact > 0).length }]; }));
// final table (owner §33): per scenario x risk %, ENVELOPE basis, both splits
res.final_table = []; for (const S of ['DEV', 'HOLD']) for (const scn of Object.keys(SC)) for (const rp of RISK_CANDIDATES) { const w = res.walks[S][`${scn}|${rp}|ENVELOPE`];
  res.final_table.push({ split: S, scenario: scn, risk_pct: rp, accepted: w.accepted, losing: w.losing, planned_risk: w.planned_risk_amount.mean, actual_stop_risk: w.actual_stop_risk.mean, commission: w.commission.mean, swap_mean: w.swap.mean, swap_max: w.swap.max, slippage: w.slippage.mean, gap_impact_max: w.gap_impact_all.max, gap_events: w.gap_events, total_exposure_mean_losers: w.total_realized_losers.mean, total_exposure_max: w.total_realized_losers.max, multiplier_p50: w.multiplier_losers.p50, multiplier_p99: w.multiplier_losers.p99, multiplier_max: w.multiplier_losers.max, within_risk: w.exceedance.WITHIN_RISK ?? 0, exceedance: w.exceedance }); }
// replay parity and restart
const H = (w) => sha(JSON.stringify({ d: w.decisions, t: w.trades, s: w.state, p: w.pending }));
res.replay = {}; for (const S of ['DEV', 'HOLD']) { const a = walk(S, { riskPct: 0.005, scn: 'NORMAL', basis: 'ENVELOPE' }); const b = walk(S, { riskPct: 0.005, scn: 'NORMAL', basis: 'ENVELOPE' }); const half = Math.floor(ENTRIES[S].length / 2);
  const p1 = walk(S, { riskPct: 0.005, scn: 'NORMAL', basis: 'ENVELOPE', list: ENTRIES[S].slice(0, half) }); const restored = JSON.parse(JSON.stringify({ state: p1.state, pending: p1.pending })); const p2 = walk(S, { riskPct: 0.005, scn: 'NORMAL', basis: 'ENVELOPE', list: ENTRIES[S].slice(half), start: restored });
  res.replay[S] = { deterministic: H(a) === H(b), restart_equals_uninterrupted: sha(JSON.stringify([...p1.decisions, ...p2.decisions])) === sha(JSON.stringify(a.decisions)) && sha(JSON.stringify([...p1.trades, ...p2.trades])) === sha(JSON.stringify(a.trades)), hash: H(a) }; }
// integrity invariants across every walk
const allW = ['DEV', 'HOLD'].flatMap((S) => Object.entries(res.walks[S]).filter(([k]) => !k.startsWith('__')).map(([, w]) => w));
res.invariants = { rounding_violations: allW.reduce((s, w) => s + w.rounding_violations, 0), rr_violations: allW.reduce((s, w) => s + w.rr_violations, 0), broker_rounding_exceedance: allW.reduce((s, w) => s + (w.exceedance.BROKER_ROUNDING_EXCEEDANCE ?? 0), 0), other_exceedance: allW.reduce((s, w) => s + (w.exceedance.OTHER ?? 0), 0), primary_accepted: ['DEV', 'HOLD'].reduce((s, S) => s + (res.primary[S].RISK_ACCEPTED ?? 0), 0) };
// decision (pre-registration §8)
const T = existsSync(join(OUT, 'test_counts.json')) ? JSON.parse(readFileSync(join(OUT, 'test_counts.json'), 'utf8')) : null; const testsOk = T ? Object.values(T).every((s) => /\(fail 0,/.test(s)) : null;
const integrity = { tests_pass: testsOk, no_rounding_up_or_overrisk: res.invariants.rounding_violations === 0, rr_170: res.invariants.rr_violations === 0, no_broker_rounding_exceedance: res.invariants.broker_rounding_exceedance === 0, primary_never_accepts: res.invariants.primary_accepted === 0, replay_parity: Object.values(res.replay).every((x) => x.deterministic && x.restart_equals_uninterrupted) };
const measured = { broker_data_validated: res.broker.ok, components_measured_dev: res.walks.DEV['NORMAL|0.005|ENVELOPE'].accepted > 0, components_measured_hold: res.walks.HOLD['NORMAL|0.005|ENVELOPE'].accepted > 0 };
const failed = Object.entries(integrity).some(([k, v]) => v === false);
const status = failed ? 'RISK_GATE_FAILED' : Object.values(integrity).every((v) => v === true) && Object.values(measured).every(Boolean) ? 'RISK_GATE_VALIDATED' : Object.values(integrity).every((v) => v === true) ? 'RISK_GATE_PARTIALLY_VALIDATED' : 'RISK_GATE_INCONCLUSIVE';
res.decision = { integrity, measured, RISK_GATE_STATUS: status, GAP_RISK: res.gap.GAP_RISK, SLIPPAGE_RISK: 'UNRESOLVED (no stop-fill evidence; scenarios are documented assumptions plus the DEV in-session maximum)', RISK_PERCENTAGE: 'UNRESOLVED', DAILY_LOSS_POLICY: 'UNRESOLVED' };
for (const S of ['DEV', 'HOLD']) delete res.walks[S].__headline_trades;
writeFileSync(join(OUT, 'v17_results.json'), JSON.stringify(res, null, 1));
const headline = Object.fromEntries(['DEV', 'HOLD'].map((S) => [S, Object.fromEntries(Object.keys(SC).map((scn) => { const w = res.walks[S][`${scn}|0.005|ENVELOPE`]; return [scn, { accepted: w.accepted, losing: w.losing, exceedance: w.exceedance, mult: w.multiplier_losers, gap_events: w.gap_events }]; }))]));
console.log(JSON.stringify({ decision: res.decision, broker_ok: res.broker.ok, invariants: res.invariants, replay: res.replay, primary: res.primary, headline_0_50_envelope: headline, gap: { DEV: res.gap.DEV.realized_gap_through, HOLD: res.gap.HOLD.realized_gap_through }, envelope: res.envelope, swap_DEV: res.swap.DEV.midnight_rule }, null, 1));
