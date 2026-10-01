/**
 * V10 RISK + CAPITAL CONTROL -- shared simulation helpers (RESEARCH ONLY; HYPOTHETICAL_NOT_EXECUTED; no order code).
 * Used by v10_study.mjs (pre-registered selection, freeze, holdout) and v10_descriptive.mjs (descriptive tables, never selection).
 * Moved verbatim out of v10_study.mjs; the only change is that the broker spec and bars are passed in (cfg.spec / ctx) instead of
 * module globals. Re-running FULL after the move reproduced v10_results_FULL.json identically apart from the timestamp.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canReenter } from '../../../src/engine/capitalHarvest/positionManager.js';
import { assessRealLot } from '../../../src/engine/mt5RealPolicy.js';
import { features, simulateTrade } from '../../capital_harvest_v9/scripts/harvest.mjs';
import { loadBrokerSpec, initState, decide, openPosition, settle } from './risk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); export const REPO = join(HERE, '..', '..', '..');
export const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100); export const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null); export const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
export const COSTS = { normal: { spread: 0.24, slip: 0.10 }, moderate: { spread: 0.40, slip: 0.30 }, severe: { spread: 0.60, slip: 0.60, gapEvery: 10, gapR: 0.5 } };
export const ACCOUNTS = [100, 250, 500, 1000, 5000, 10000];

/** Broker spec (production MT5 bridge log, read-only) + Edge Lab XAUUSDm 5m bars + causal features. */
export function loadContext() { const spec = loadBrokerSpec(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl')); const bars = JSON.parse(readFileSync(join(REPO, 'handoff', 'edge_discovery_lab', 'data', 'XAUUSDm_bars.json'), 'utf8'))['5m']; return { spec, bars, F: features(bars) }; }
export function signals(S) { const out = []; const p = join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`); if (!existsSync(p)) throw new Error(`missing V8 rows ${p}`); for (const l of readFileSync(p, 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.act !== 'BUY' && r.act !== 'SELL') continue; out.push({ id: `${r.i}|${r.act}`, i: r.i, t: r.t, side: r.act, entry: r.g.e, sl: r.g.sl, model: r.mdl, anchor: r.anc ?? r.g.e }); } return out.sort((a, b) => a.i - b.i); }
// outcomes per signal and cost (per oz = per 0.01 lot); SEVERE adds a deterministic gap on every 10th stop-out in time order
export function outcomes(sigs, { bars, F }) { const O = {}; for (const [k, c] of Object.entries(COSTS)) { let stops = 0; O[k] = new Map(); for (const s of sigs) { const o = simulateTrade(bars, F, s, { kind: 'BASELINE' }, { spread: c.spread, slip: c.slip }); if (o.status === 'NO_DATA' || o.status === 'INVALID') continue; let pnl = o.pnl_usd; const R = Math.abs(s.entry - s.sl); if (c.gapEvery && (o.exit === 'BROKER_SL' || o.exit === 'THESIS_INVALIDATION')) { stops++; if (stops % c.gapEvery === 0) pnl -= c.gapR * R; } O[k].set(s.id, { pnl_oz: pnl, r: pnl / R, exitBar: o.exitBar, exitT: bars[o.exitBar].time + 300, exit: o.exit }); } } return O; }

/** Chronological walk: one position at a time (canReenter), risk decision, settlement. Returns the equity path and every decision. */
export function walk(sigs, O, cfg, equity0, { keepState = false, startState = null, from = 0 } = {}) {
  const SPEC = cfg.spec; let st = startState ?? initState(equity0); let exitBar = st.walk?.exitBar ?? -1, last = st.walk?.last ?? null, lastLoss = st.walk?.lastLoss ?? false; const trades = [], rejects = []; let peak = equity0, maxDD = 0, maxSingleLossPct = 0, overshoot = 0, minEq = equity0;
  for (let k = from; k < sigs.length; k++) { const s = sigs[k]; const o = O.get(s.id); if (!o) continue; if (s.i <= exitBar) continue; const ok = canReenter({ signal: s, exitBar, lastTrade: last, lastExitWasLoss: lastLoss }); if (!ok.ok) continue;
    const sig = { id: s.id, t: s.t + 300, side: s.side, entry: s.entry, sl: s.sl, spread: cfg.spread }; const d = decide(st, sig, cfg); st = d.state;
    if (d.decision.action !== 'ACCEPT') { rejects.push({ id: s.id, reason: d.decision.reason, r: o.r, t: s.t }); continue; }
    const lots = d.decision.lots; const pnl = o.pnl_oz * lots * SPEC.contract_size; const eqBefore = st.equity; st = openPosition(st, sig, d.decision); st = settle(st, { pnlUsd: pnl, exitT: o.exitT }, cfg);
    if (pnl < 0) { maxSingleLossPct = Math.max(maxSingleLossPct, -pnl / eqBefore); if (d.decision.actual_risk > 0) overshoot = Math.max(overshoot, -pnl / d.decision.actual_risk); }
    trades.push({ id: s.id, t: s.t, lots, pnl, r: o.r, planned_risk_pct: d.decision.actual_risk_pct, margin_pct: d.decision.margin_pct ?? (lots * SPEC.contract_size * s.entry / SPEC.leverage) / eqBefore, eq: st.equity });
    peak = Math.max(peak, st.equity); maxDD = Math.max(maxDD, (peak - st.equity) / peak); minEq = Math.min(minEq, st.equity); exitBar = o.exitBar; last = { i: s.i, model: s.model, side: s.side, anchor: s.anchor }; lastLoss = pnl <= 0; st.walk = { exitBar, last, lastLoss }; }
  let streak = 0, worst = 0; for (const x of trades) { if (x.pnl <= 0) { streak++; worst = Math.max(worst, streak); } else streak = 0; }
  const byReason = rejects.reduce((g, x) => { g[x.reason] = (g[x.reason] ?? 0) + 1; return g; }, {});
  const res = { start: equity0, end: r2(st.equity), return_pct: r4(st.equity / equity0 - 1), max_dd_pct: r4(maxDD), recovery_needed_pct: r4(maxDD / (1 - maxDD)), min_equity: r2(minEq), trades: trades.length, rejected: rejects.length, rejected_by_reason: byReason, mean_planned_risk_pct: r4(mean(trades.map((x) => x.planned_risk_pct))), max_planned_risk_pct: r4(Math.max(0, ...trades.map((x) => x.planned_risk_pct))), max_single_loss_pct: r4(maxSingleLossPct), loss_overshoot_vs_planned: r4(overshoot), max_margin_pct: r4(Math.max(0, ...trades.map((x) => x.margin_pct))), mean_margin_pct: r4(mean(trades.map((x) => x.margin_pct))), worst_loss_streak: worst, taken_mean_r: r4(mean(trades.map((x) => x.r))), blocked_mean_r: r4(mean(rejects.filter((x) => !['DUPLICATE_SIGNAL'].includes(x.reason)).map((x) => x.r))), survived: st.equity > 0 };
  if (keepState) { res._state = st; res._trades = trades; res._rejects = rejects; } return res;
}
export const cfgOf = (model, riskPct, cost, spec, extra = {}) => ({ model, riskPct, marginCapPct: 0.5, dailyLimitPct: null, pauseAfter: null, weeklyLimitPct: null, slipAllowance: COSTS.normal.slip, spread: COSTS[cost].spread, spec, assessCurrent: assessRealLot, ...extra });
export function monteCarlo(units, riskPct, nTrades, paths = 2000, seed = 20261001) { let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const dds = []; for (let p = 0; p < paths; p++) { let eq = 1, peak = 1, dd = 0; for (let k = 0; k < nTrades; k++) { const u = units[Math.floor(rnd() * units.length)]; eq *= 1 + riskPct * u; peak = Math.max(peak, eq); dd = Math.max(dd, (peak - eq) / peak); } dds.push(dd); } return { paths, trades_per_year: nTrades, p_dd_ge_10: r4(dds.filter((x) => x >= 0.1).length / paths), p_dd_ge_20: r4(dds.filter((x) => x >= 0.2).length / paths), p_dd_ge_30: r4(dds.filter((x) => x >= 0.3).length / paths), p_dd_ge_50: r4(dds.filter((x) => x >= 0.5).length / paths), median_dd: r4(pct(dds, 0.5)), p95_dd: r4(pct(dds, 0.95)) }; }
export const streakDD = (riskPct, k, lossUnit = 1) => r4(1 - (1 - riskPct * lossUnit) ** k);
export const sessionsOf = (sigs) => new Set(sigs.map((s) => day(s.t))).size;
