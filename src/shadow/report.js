/**
 * READ-ONLY forward-evidence report (Stage 11C). Summarises the append-only store and applies the
 * pre-declared forward gates (docs/XAUUSD_FORWARD_SHADOW_EVIDENCE_PROTOCOL.md §7). Historical/backfill
 * evidence is always reported separately from FORWARD_LIVE and never counts toward a gate.
 *   node src/shadow/report.js [--dir state/shadow] [--export path.json] [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEvidenceStore } from './store.js';
import { CANDIDATES } from './candidates.js';

export const FORWARD_GATES = Object.freeze({
  SC1_SILVER_LEAD_v1: { min_observations: 150, min_sessions: 60, min_calendar_days: 120, max_missing_share: 0.10, primary_horizon: 'h8', ci_lower_gt: 0, p_first_touch_min: 0.53, cost_usd: 0.26, top_winner_removal: 5, min_positive_month_share: 0.6, min_months: 4 },
  SC2_PRODUCTION_SIGNAL_v1: { min_observations: 100, min_sessions: 60, min_calendar_days: 120, max_missing_share: 0.10, primary_horizon: 'h24', ci_lower_gt: 0, p_first_touch_min: null, cost_usd: 0.26, top_winner_removal: 5, min_positive_month_share: 0.6, min_months: 4, geometry_expectancy_gt: 0 },
});
export const STATUSES = Object.freeze(['COLLECTING', 'INSUFFICIENT_FORWARD_EVIDENCE', 'PROMISING_UNPROVEN', 'FAILED_FORWARD_GATE', 'ELIGIBLE_FOR_INDEPENDENT_VALIDATION']);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null); const r3 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(3));
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function bootCI(v, R = 2000) { if (v.length < 5) return null; const out = []; for (let k = 0; k < R; k++) { let s = 0; for (let i = 0; i < v.length; i++) s += v[Math.floor(rnd() * v.length)]; out.push(s / v.length); } out.sort((a, b) => a - b); return [r3(out[Math.floor(0.025 * R)]), r3(out[Math.floor(0.975 * R)])]; }

export function evaluateCandidate(cid, observations, outcomes, { nowSec = Date.now() / 1000 } = {}) {
  const g = FORWARD_GATES[cid]; const obsAll = observations.filter((o) => o.candidate_id === cid); const fwd = obsAll.filter((o) => o.provenance === 'FORWARD_LIVE'); const hist = obsAll.length - fwd.length;
  const byId = new Map(fwd.map((o) => [o.observation_id, o])); const outs = outcomes.filter((r) => byId.has(r.observation_id) && r.provenance === 'FORWARD_LIVE');
  const labeled = outs.filter((r) => r.horizon === g.primary_horizon && r.status === 'LABELED'); const incomplete = outs.filter((r) => r.horizon === g.primary_horizon && r.status !== 'LABELED');
  const sessions = new Set(fwd.map((o) => o.decision_time_utc.slice(0, 10))).size; const first = fwd.length ? Math.min(...fwd.map((o) => Date.parse(o.decision_time_utc))) : null; const days = first ? (nowSec * 1000 - first) / 86400000 : 0;
  const res = { candidate_id: cid, forward_observations: fwd.length, historical_or_backfill_observations: hist, sessions, calendar_days: r3(days), labeled_primary: labeled.length, incomplete_primary: incomplete.length, missing_share: labeled.length + incomplete.length ? r3(incomplete.length / (labeled.length + incomplete.length)) : null, status: 'COLLECTING', gate: g };
  if (labeled.length) {
    const moves = labeled.map((r) => r.side_signed_move_atr ?? r.move_atr).filter(Number.isFinite); const usd = labeled.map((r) => r.side_signed_move_usd ?? r.move_usd).filter(Number.isFinite);
    const ci = bootCI(moves); const sorted = [...moves].sort((a, b) => b - a); const f = labeled.map((r) => r.first_touch_05atr).filter((x) => x === 'FAV' || x === 'ADV');
    const months = {}; for (const r of labeled) { const o = byId.get(r.observation_id); const m = o.decision_time_utc.slice(0, 7); (months[m] ??= []).push(r.side_signed_move_atr ?? r.move_atr); } const monthMeans = Object.entries(months).filter(([, v]) => v.length >= 10).map(([m, v]) => ({ m, n: v.length, mean: r3(mean(v)) }));
    res.metrics = { n: labeled.length, mean_atr: r3(mean(moves)), ci95: ci, p_win: r3(moves.filter((x) => x > 0).length / moves.length), net_usd_after_cost: r3(mean(usd) - g.cost_usd), p_first_touch: f.length ? r3(f.filter((x) => x === 'FAV').length / f.length) : null, no_top5_atr: sorted.length > g.top_winner_removal ? r3(mean(sorted.slice(g.top_winner_removal))) : null, months: monthMeans, positive_month_share: monthMeans.length ? r3(monthMeans.filter((x) => x.mean > 0).length / monthMeans.length) : null };
    if (cid === 'SC2_PRODUCTION_SIGNAL_v1') { const geo = outcomes.filter((r) => byId.has(r.observation_id) && r.provenance === 'FORWARD_LIVE' && r.horizon === 'h48' && r.status === 'LABELED' && r.geometry && Number.isFinite(r.geometry.r_multiple)); res.metrics.geometry = { n: geo.length, expectancy_R: r3(mean(geo.map((r) => r.geometry.r_multiple))), p_tp1_first: geo.length ? r3(geo.filter((r) => r.geometry.touch === 'TP1').length / geo.length) : null }; const execs = {}; for (const o of fwd) { const k = o.payload?.execution?.status ?? 'UNKNOWN'; execs[k] = (execs[k] || 0) + 1; } res.metrics.execution_status_counts = execs; }
  }
  const m = res.metrics; const enough = fwd.length >= g.min_observations && sessions >= g.min_sessions && days >= g.min_calendar_days && (res.missing_share ?? 0) <= g.max_missing_share && m && m.months.length >= g.min_months;
  if (!m || labeled.length < 20) res.status = 'COLLECTING';
  else if (!enough) res.status = m.mean_atr > 0 ? 'INSUFFICIENT_FORWARD_EVIDENCE' : 'INSUFFICIENT_FORWARD_EVIDENCE';
  else {
    const pass = m.ci95 && m.ci95[0] > g.ci_lower_gt && m.net_usd_after_cost > 0 && (g.p_first_touch_min == null || (m.p_first_touch ?? 0) >= g.p_first_touch_min) && (m.no_top5_atr ?? -1) > 0 && (m.positive_month_share ?? 0) >= g.min_positive_month_share && (g.geometry_expectancy_gt == null || (m.geometry?.expectancy_R ?? -1) > g.geometry_expectancy_gt);
    res.status = pass ? 'ELIGIBLE_FOR_INDEPENDENT_VALIDATION' : (m.mean_atr > 0 && m.ci95 && m.ci95[1] > 0 ? 'PROMISING_UNPROVEN' : 'FAILED_FORWARD_GATE');
    if (res.status === 'PROMISING_UNPROVEN' && m.ci95 && m.ci95[1] <= 0) res.status = 'FAILED_FORWARD_GATE';
  }
  return res;
}

export function buildReport({ dir, nowSec = Date.now() / 1000 } = {}) {
  const store = createEvidenceStore({ dir }); const obs = store.readAll('observations'); const outs = store.readAll('outcomes'); const status = existsSync(`${dir}/observer_status.json`) ? JSON.parse(readFileSync(`${dir}/observer_status.json`, 'utf8')) : null;
  const byProv = {}; for (const o of obs) (byProv[o.provenance] ??= { observations: 0 }).observations++; for (const r of outs) (byProv[r.provenance] ??= { observations: 0 }).outcomes = ((byProv[r.provenance].outcomes) || 0) + 1;
  const fwd = obs.filter((o) => o.provenance === 'FORWARD_LIVE'); const candles = fwd.filter((o) => o.type === 'CANDLE_5M'); const firstFwd = fwd.length ? new Date(Math.min(...fwd.map((o) => Date.parse(o.created_at_utc)))).toISOString() : null;
  const prodActions = {}; const blocked = {}; for (const c of candles) { const a = c.production?.available ? (c.production.action ?? 'WAIT') : 'MISSING'; prodActions[a] = (prodActions[a] || 0) + 1; if (c.production?.blocked_by) for (const [tf, b] of Object.entries(c.production.blocked_by)) if (b) blocked[`${tf}:${b}`] = (blocked[`${tf}:${b}`] || 0) + 1; }
  const sig = fwd.filter((o) => o.type === 'PRODUCTION_SIGNAL'); const sigExec = {}; for (const s of sig) { const k = s.payload?.execution?.status ?? 'UNKNOWN'; sigExec[k] = (sigExec[k] || 0) + 1; }
  const news = obs.filter((o) => o.type === 'NEWS_V2_EVENT'); const newsFwd = news.filter((o) => o.provenance === 'FORWARD_LIVE'); const tierEvents = { A: 0, B: 0, C: 0 }; for (const n of newsFwd) { const t = n.payload?.protection?.news_tier; if (t && tierEvents[t] != null && n.payload.type === 'NEWS_STATE_CHANGED' && n.payload.to === 'PRE_NEWS') tierEvents[t]++; }
  const missingProd = candles.filter((c) => !c.production?.available).length; const missingCross = candles.filter((c) => Object.values(c.cross_asset ?? {}).some((x) => !x?.available)).length;
  const candidates = Object.fromEntries(CANDIDATES.map((c) => [c.id, evaluateCandidate(c.id, obs, outs, { nowSec })]));
  const expected = candles.length ? Math.round((Math.max(...candles.map((c) => c.bar_time)) - Math.min(...candles.map((c) => c.bar_time))) / 300) + 1 : 0;
  return { generated_at: new Date(nowSec * 1000).toISOString(), dir, observer_status: status ? { started_at: status.started_at, cycles: status.cycles, last_cycle_at: status.last_cycle_at, last_error: status.last_error, market: status.market, reader: status.reader } : null, forward_collection_start_utc: firstFwd, by_provenance: byProv, forward_live: { observations: fwd.length, candles: candles.length, expected_candles_in_span: expected, candle_coverage: expected ? r3(candles.length / expected) : null, outcomes: outs.filter((r) => r.provenance === 'FORWARD_LIVE').length, missing_production_snapshot_share: candles.length ? r3(missingProd / candles.length) : null, missing_cross_asset_share: candles.length ? r3(missingCross / candles.length) : null, production_actions: prodActions, production_blocked_by: blocked, production_signals: sig.length, production_signal_execution: sigExec }, historical: { observations: obs.length - fwd.length, note: 'BACKFILL / HISTORICAL_REPLAY / TEST records never count toward a forward gate' }, news_v2: { events_total: news.length, events_forward: newsFwd.length, pre_news_entries_by_tier_forward: tierEvents, cpi_nfp_tier_b_forward: tierEvents.B, fomc_tier_a_forward: tierEvents.A }, candidates, store: store.stats() };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
  const dir = arg('--dir') ?? fileURLToPath(new URL('../../state/shadow', import.meta.url)); const rep = buildReport({ dir });
  if (arg('--export')) { const store = createEvidenceStore({ dir }); console.log(JSON.stringify(store.exportSnapshot(arg('--export'), { report: rep }))); }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rep, null, 1));
  else { console.log(`FORWARD SHADOW EVIDENCE REPORT ${rep.generated_at}`); console.log(`collection start (FORWARD_LIVE): ${rep.forward_collection_start_utc ?? 'none yet'}`); console.log(`observer: ${JSON.stringify(rep.observer_status)}`); console.log(`by provenance: ${JSON.stringify(rep.by_provenance)}`); console.log(`FORWARD_LIVE: ${JSON.stringify(rep.forward_live)}`); console.log(`HISTORICAL: ${JSON.stringify(rep.historical)}`); console.log(`NEWS V2: ${JSON.stringify(rep.news_v2)}`); for (const [id, c] of Object.entries(rep.candidates)) console.log(`${id}: status=${c.status} forward_obs=${c.forward_observations} sessions=${c.sessions} days=${c.calendar_days} labeled=${c.labeled_primary} metrics=${JSON.stringify(c.metrics ?? null)}`); }
}
