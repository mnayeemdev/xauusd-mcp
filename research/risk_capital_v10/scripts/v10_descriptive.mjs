/**
 * V10 RISK + CAPITAL CONTROL -- DESCRIPTIVE tables (RESEARCH ONLY; never used for selection; the pre-registered decision is
 * v10_study.mjs). Stage 2 / stage 3 of the pre-registration run only AT a supported risk %; none was supported, so the controls and
 * margin caps are described here at every candidate risk % on both splits, labelled DESCRIPTIVE_ONLY_NOT_SELECTION.
 * Output: results/v10_descriptive.json.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RISK_CANDIDATES, sizePosition, marginCheck, lossPerLot } from './risk.mjs';
import { COSTS, ACCOUNTS, loadContext, signals, outcomes, walk, cfgOf, r2, r4, mean, pct, day } from './sim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const OUT = join(HERE, '..', 'results');
const CTX = loadContext(); const SPEC = CTX.spec; const LABEL = 'DESCRIPTIVE_ONLY_NOT_SELECTION';
const CONTROLS = { none: {}, daily_1: { dailyLimitPct: 0.01 }, daily_2: { dailyLimitPct: 0.02 }, daily_3: { dailyLimitPct: 0.03 }, pause_3: { pauseAfter: 3 }, pause_5: { pauseAfter: 5 }, weekly_5: { weeklyLimitPct: 0.05 } };
const CONTROL_REASONS = ['DAILY_LOSS_LIMIT_REACHED', 'DAILY_CAPACITY_INSUFFICIENT', 'LOSS_STREAK_PAUSE', 'WEEKLY_HALTED'];
const MARGIN_REASONS = ['MARGIN_ABOVE_CAP', 'MARGIN_LEVEL_AFTER_LOSS_TOO_LOW', 'EQUITY_EXHAUSTED_AT_STOP'];
const q = (a) => ({ p10: r2(pct(a, 0.1)), p50: r2(pct(a, 0.5)), p90: r2(pct(a, 0.9)), p99: r2(pct(a, 0.99)), max: r2(Math.max(...a)) });
const res = { label: LABEL, generated_utc: new Date().toISOString(), spec: SPEC, splits: {} };

for (const S of ['DEV', 'HOLD']) {
  const sigs = signals(S); const O = outcomes(sigs, CTX); const out = {};
  // ---- structural SL distribution and the fixed-dollar binding share ----
  const R = sigs.map((s) => Math.abs(s.entry - s.sl)); const wl = sigs.map((s) => lossPerLot({ entry: s.entry, sl: s.sl, spread: COSTS.normal.spread, slipAllowance: COSTS.normal.slip, spec: SPEC }) * SPEC.volume_min);
  const price = pct(sigs.map((s) => s.entry), 0.5);
  out.sl_distribution = { signals: sigs.length, entry_price_median: r2(price), structural_distance_usd: q(R), worst_case_loss_usd_at_001_lot: q(wl),
    share_monetary_50_binds: r4(wl.filter((x) => x > 50).length / wl.length), share_structural_beyond_50: r4(R.filter((x) => x > 50).length / R.length), share_profit_budget_30_binds_before_1_7R: r4(R.filter((x) => 1.7 * x > 30).length / R.length) };
  // ---- risk table at representative SL distances (median / p90 of this split), production margin cap 50 % ----
  const reps = { SL_p50: pct(R, 0.5), SL_p90: pct(R, 0.9) }; out.risk_table = [];
  for (const A of ACCOUNTS) for (const r of RISK_CANDIDATES) for (const [tag, d] of Object.entries(reps)) {
    const z = sizePosition({ equity: A, riskPct: r, entry: price, sl: price - d, spread: COSTS.normal.spread, slipAllowance: COSTS.normal.slip, spec: SPEC });
    const lots = z.eligible ? z.lots : 0; const m = z.eligible ? marginCheck({ lots, price, equity: A, capPct: 0.5, worstLossUsd: z.actual_risk, spec: SPEC }) : null;
    out.risk_table.push({ equity: A, risk_pct: r, sl_case: tag, max_risk_usd: r2(A * r), sl_distance_usd: r2(d), worst_case_loss_per_001_lot_usd: r2(z.loss_per_lot * SPEC.volume_min), lots_calculated: r4(z.lots_raw), lots_rounded_down: lots, actual_risk_usd: z.eligible ? r2(z.actual_risk) : 0, actual_risk_pct: z.eligible ? r4(z.actual_risk_pct) : 0, margin_usd: m ? r2(m.margin_usd) : 0, remaining_margin_usd: m ? r2(A - m.margin_usd) : A, margin_level_after_loss_pct: m ? r2(m.margin_level_after_loss_pct) : null, eligible: z.eligible && (m?.ok ?? false), reason: !z.eligible ? z.reason : (m.ok ? 'ACCEPT' : m.reasons[0]), min_lot_risk_pct: z.eligible ? null : r4(z.min_lot_risk_pct) });
  }
  // ---- minimum equity for one 0.01 lot at the SL quantiles, per risk % ----
  out.min_equity_for_min_lot = Object.fromEntries(RISK_CANDIDATES.map((r) => [r, Object.fromEntries([['SL_p50', 0.5], ['SL_p90', 0.9], ['SL_p99', 0.99]].map(([k, p]) => [k, r2(pct(wl, p) / r)]))]));
  // ---- CURRENT fixed 0.01 lot expressed as % of equity ----
  out.current_fixed_lot_pct_risk = Object.fromEntries(ACCOUNTS.map((A) => [A, { p50: r4(pct(wl, 0.5) / A), p90: r4(pct(wl, 0.9) / A), p99: r4(pct(wl, 0.99) / A), max: r4(Math.max(...wl) / A) }]));
  // ---- loss overshoot (realized loss vs planned worst case at the hard stop) per cost ----
  out.loss_overshoot = {}; for (const c of Object.keys(COSTS)) { const rows = []; for (const s of sigs) { const o = O[c].get(s.id); if (!o || o.pnl_oz >= 0) continue; const Rr = Math.abs(s.entry - s.sl); const planned = 1.5 * Rr + COSTS[c].spread + COSTS.normal.slip; rows.push({ id: s.id, date: day(s.t), exit: o.exit, R_usd: r2(Rr), loss_oz: r2(-o.pnl_oz), ratio: -o.pnl_oz / planned }); }
    const ratios = rows.map((x) => x.ratio); out.loss_overshoot[c] = { losing_outcomes: rows.length, share_above_planned: r4(ratios.filter((x) => x > 1 + 1e-9).length / rows.length), share_above_1_25x: r4(ratios.filter((x) => x > 1.25).length / rows.length), p99_ratio: r4(pct(ratios, 0.99)), max_ratio: r4(Math.max(...ratios)), worst5: rows.sort((a, b) => b.ratio - a.ratio).slice(0, 5).map((x) => ({ ...x, ratio: r4(x.ratio) })) }; }
  // ---- CURRENT largest single losses (normal cost, 1,000 USD) ----
  { const w = walk(sigs, O.normal, cfgOf('CURRENT', null, 'normal', SPEC), 1000, { keepState: true }); const byId = new Map(sigs.map((s) => [s.id, s]));
    out.current_largest_losses_1000 = w._trades.filter((x) => x.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, 5).map((x) => { const s = byId.get(x.id); const Rr = Math.abs(s.entry - s.sl); return { id: x.id, date: day(s.t), R_usd: r2(Rr), loss_usd: r2(-x.pnl), exit: O.normal.get(x.id).exit, monetary_cap_would_bind: 1.5 * Rr + COSTS.normal.spread > 50 }; }); }
  // ---- CURRENT fixed lot weights trades by SL width in USD; PCT weights them by R. P&L by structural-SL quartile (10,000 USD) ----
  { const byId = new Map(sigs.map((s) => [s.id, s])); out.sl_quartile_weighting = {}; for (const c of ['normal', 'moderate']) { const w = walk(sigs, O[c], cfgOf('CURRENT', null, c, SPEC), 10000, { keepState: true }); const rows = w._trades.map((x) => ({ R: Math.abs(byId.get(x.id).entry - byId.get(x.id).sl), r: x.r, usd: x.pnl }));
    const cuts = [0.25, 0.5, 0.75].map((p) => pct(rows.map((x) => x.R), p)); const qOf = (R) => (R <= cuts[0] ? 'Q1' : R <= cuts[1] ? 'Q2' : R <= cuts[2] ? 'Q3' : 'Q4');
    out.sl_quartile_weighting[c] = { trades: rows.length, total_usd_001lot: r2(rows.reduce((s, x) => s + x.usd, 0)), mean_r_all: r4(mean(rows.map((x) => x.r))), cuts_usd: cuts.map(r2), quartiles: Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4'].map((k) => { const q4 = rows.filter((x) => qOf(x.R) === k); return [k, { n: q4.length, mean_sl_usd: r2(mean(q4.map((x) => x.R))), mean_r: r4(mean(q4.map((x) => x.r))), usd_001lot: r2(q4.reduce((s, x) => s + x.usd, 0)) }]; })) }; } }
  // ---- CURRENT small-account trace: the last trades of the 250 USD MODERATE-cost walk (where a negative balance can occur) ----
  { const w = walk(sigs, O.moderate, cfgOf('CURRENT', null, 'moderate', SPEC), 250, { keepState: true }); const byId = new Map(sigs.map((s) => [s.id, s]));
    out.current_250_moderate_last_trades = { end: w.end, survived: w.survived, last: w._trades.slice(-3).map((x) => { const s = byId.get(x.id); const Rr = Math.abs(s.entry - s.sl); return { id: x.id, date: day(s.t), R_usd: r2(Rr), pnl_usd: r2(x.pnl), equity_after: r2(x.eq), equity_before: r2(x.eq - x.pnl), production_monetary_cap_binds: 1.5 * Rr + COSTS.moderate.spread > 50 }; }) }; }
  // ---- controls at every candidate risk % (accounts >= 1,000) ----
  out.controls = {}; for (const r of RISK_CANDIDATES) { out.controls[r] = {}; for (const A of [1000, 5000, 10000]) { const base = walk(sigs, O.normal, cfgOf('PCT', r, 'normal', SPEC), A, { keepState: true }); out.controls[r][A] = {};
    for (const [name, ex] of Object.entries(CONTROLS)) { const w = name === 'none' ? base : walk(sigs, O.normal, cfgOf('PCT', r, 'normal', SPEC, ex), A, { keepState: true }); const blocked = w._rejects.filter((x) => CONTROL_REASONS.includes(x.reason));
      const ddRed = base.max_dd_pct > 0 ? 1 - w.max_dd_pct / base.max_dd_pct : 0; const bm = mean(blocked.map((x) => x.r)); const tm = w.taken_mean_r;
      out.controls[r][A][name] = { trades: w.trades, return_pct: w.return_pct, max_dd_pct: w.max_dd_pct, dd_reduction_rel: r4(ddRed), blocked_by_control: blocked.length, blocked_by_reason: blocked.reduce((g, x) => { g[x.reason] = (g[x.reason] ?? 0) + 1; return g; }, {}), blocked_mean_r: r4(bm), taken_mean_r: tm, would_pass_stage2_rule: name !== 'none' && ddRed >= 0.10 && !(bm != null && tm != null && bm > tm + 0.05), days_protected: new Set(blocked.map((x) => day(x.t))).size }; } } }
  // ---- margin caps at every candidate risk % (all accounts) ----
  out.margin_caps = {}; for (const r of RISK_CANDIDATES) { out.margin_caps[r] = {}; for (const A of ACCOUNTS) { out.margin_caps[r][A] = {}; for (const cap of [0.10, 0.25, 0.50]) { const w = walk(sigs, O.normal, cfgOf('PCT', r, 'normal', SPEC, { marginCapPct: cap }), A); const mr = MARGIN_REASONS.reduce((s, k) => s + (w.rejected_by_reason[k] ?? 0), 0); out.margin_caps[r][A][cap] = { trades: w.trades, margin_rejects: mr, margin_reject_share: r4(mr / Math.max(1, w.trades + mr)), max_margin_pct: w.max_margin_pct, mean_margin_pct: w.mean_margin_pct }; } } }
  // ---- exposure: signals that arrived while the single allowed position was open (PCT 0.5 %, 10,000 USD) ----
  { const w = walk(sigs, O.normal, cfgOf('PCT', 0.005, 'normal', SPEC), 10000, { keepState: true }); const iOf = new Map(sigs.map((s) => [s.id, s.i])); let blocked = 0; const spans = w._trades.map((x) => [iOf.get(x.id), O.normal.get(x.id).exitBar]); let k = 0;
    for (const s of sigs) { while (k < spans.length && spans[k][1] < s.i) k++; if (k < spans.length && s.i > spans[k][0] && s.i <= spans[k][1]) blocked++; }
    out.exposure = { max_simultaneous_trades: 1, trades: w.trades, signals_during_open_position: blocked, share_of_signals: r4(blocked / sigs.length), note: 'blocked by MAX_SIMULTANEOUS_TRADES = 1 (no pyramiding, no averaging down, no second position)' }; }
  res.splits[S] = out; console.log(S, 'done', JSON.stringify(out.sl_distribution));
}
writeFileSync(join(OUT, 'v10_descriptive.json'), JSON.stringify(res, null, 1)); console.log('wrote results/v10_descriptive.json');
