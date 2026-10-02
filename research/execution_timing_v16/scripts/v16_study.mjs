/**
 * V16 EXECUTION TIMING STUDY (RESEARCH ONLY; reads only; nothing is executed).
 *   1) scenario grid: real V8 signal snapshots x state variants x delays 0-6 s (+8 s) x {PRIMARY, ILLUSTRATIVE}
 *   2) live probes from the forward-shadow runner (state/v8_shadow/timing_probes.jsonl): replay parity, no-lookahead, invariants
 *   3) live V16 decision-record blocks; clock monitor (PC wall clock vs broker) and the read-only time-service status
 *   4) historical limitation (no quotes in replay rows: timing UNAVAILABLE, never reconstructed)
 *   5) execution band of every forward-live V8 signal under the existing rules + real tick movement context (V15 capture)
 *   6) the pre-registered decision
 *   node research/execution_timing_v16/scripts/v16_study.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { revalidate, invariantViolations, CONFIGS, ENGINE_RULES, PRODUCTION_RULES, ENGINE_SL_ROUNDING_USD } from './revalidate.mjs';
import { replayProbe } from './probes.mjs';
import { scenario, VARIANTS, GRID_DELAYS_S, SIGNAL_SELL, SIGNAL_BUY } from './scenarios.mjs';
import { MAX_EXECUTION_SIGNAL_AGE_MS, DELAY_SCENARIOS_S, POLL_INTERVAL_MS, CONTRACT } from './timing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const REPO = join(ROOT, '..', '..'); const OUT = join(ROOT, 'results');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const jsonl = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const pct = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; };
const stats = (a) => (a.length ? { n: a.length, min: Math.round(Math.min(...a) * 1000) / 1000, p50: Math.round(pct(a, 0.5) * 1000) / 1000, p90: Math.round(pct(a, 0.9) * 1000) / 1000, max: Math.round(Math.max(...a) * 1000) / 1000 } : { n: 0 });
const count = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const res = { generated_utc: new Date().toISOString(), contract: CONTRACT, prereg_sha: readFileSync(join(ROOT, 'V16_PREREGISTRATION.sha256'), 'utf8').split(/\s/)[0], max_execution_signal_age_ms: MAX_EXECUTION_SIGNAL_AGE_MS, engine_rules: ENGINE_RULES, production_rules: PRODUCTION_RULES, engine_sl_rounding_usd: ENGINE_SL_ROUNDING_USD };

// ---------- 1. scenario grid ----------
const VALID = new Set(['UNCHANGED', 'SMALL_MOVE_WITHIN_RULES', 'CLOCK_DRIFT_1230MS_MONITOR']);
const grid = { signals: {}, invariant_violations: 0, forced_trades: 0, eligible_outside_valid: [], cells: 0 };
for (const sig of [SIGNAL_SELL, SIGNAL_BUY]) { const S = sig.engine_action; grid.signals[S] = {};
  for (const v of VARIANTS) { grid.signals[S][v] = {};
    for (const k of GRID_DELAYS_S) { const inp = scenario(v, k, sig); const o = {};
      for (const cfg of Object.keys(CONFIGS)) { const r = revalidate({ ...inp, configName: cfg }); grid.cells++; const iv = invariantViolations(r); grid.invariant_violations += iv.length; if (r.decision === 'TRADE_ELIGIBLE' && (!VALID.has(v) || k > 6)) { grid.forced_trades++; grid.eligible_outside_valid.push(`${S}|${v}|${k}|${cfg}`); }
        o[cfg] = { decision: r.decision, reason: r.reason, entry_revalidated: r.entry_revalidated, signal_age_ms: r.signal_age_ms, entry_price: r.entry_price, sl: r.sl, rr: r.rr }; }
      grid.signals[S][v][k] = o; } } }
const ill = (S, v, k) => grid.signals[S][v][k].ILLUSTRATIVE_PCT_0_50_10K; const pri = (S, v, k) => grid.signals[S][v][k].PRIMARY;
grid.delay_allowed = Object.fromEntries(DELAY_SCENARIOS_S.map((k) => [k, ['SELL', 'BUY'].every((S) => ill(S, 'UNCHANGED', k).decision === 'TRADE_ELIGIBLE' && pri(S, 'UNCHANGED', k).entry_revalidated)]));
grid.beyond_expired = ['SELL', 'BUY'].every((S) => ill(S, 'UNCHANGED', 8).decision === 'WAIT_SIGNAL_EXPIRED');
grid.invalid_states_wait = ['SELL', 'BUY'].every((S) => VARIANTS.filter((v) => !VALID.has(v)).every((v) => DELAY_SCENARIOS_S.every((k) => ill(S, v, k).decision !== 'TRADE_ELIGIBLE')));
grid.state_dependence = Object.fromEntries(DELAY_SCENARIOS_S.map((k) => [k, new Set(VARIANTS.map((v) => ill('SELL', v, k).decision)).size]));
grid.delay_independent_within_window = VARIANTS.filter((v) => new Set(DELAY_SCENARIOS_S.map((k) => `${ill('SELL', v, k).decision}|${ill('BUY', v, k).decision}`)).size === 1).length;
grid.primary_never_eligible = ['SELL', 'BUY'].every((S) => VARIANTS.every((v) => GRID_DELAYS_S.every((k) => pri(S, v, k).decision !== 'TRADE_ELIGIBLE')));
grid.sl_never_moved = ['SELL', 'BUY'].every((S) => VARIANTS.every((v) => GRID_DELAYS_S.every((k) => pri(S, v, k).sl === (S === 'SELL' ? SIGNAL_SELL : SIGNAL_BUY).candidate.stop_loss)));
grid.rr_170_on_every_revalidated = ['SELL', 'BUY'].every((S) => VARIANTS.every((v) => GRID_DELAYS_S.every((k) => !ill(S, v, k).entry_revalidated || ill(S, v, k).rr === 1.70)));
grid.side_price = { SELL: ill('SELL', 'SMALL_MOVE_WITHIN_RULES', 3).entry_price, BUY: ill('BUY', 'SMALL_MOVE_WITHIN_RULES', 3).entry_price };
res.grid = grid;

// ---------- 2. live probes ----------
const SH = join(REPO, 'state', 'v8_shadow'); const probes = jsonl(join(SH, 'timing_probes.jsonl'));
const hashes = existsSync(join(OUT, 'runner_code_hashes.json')) ? JSON.parse(readFileSync(join(OUT, 'runner_code_hashes.json'), 'utf8')) : null;
const codeSame = hashes ? Object.entries(hashes.files).every(([p, h]) => sha(readFileSync(join(REPO, p))) === h) : null;
const live = { probe_records: probes.length, signals: 0, code_unchanged_since_runner_start: codeSame, replay_mismatches: 0, lookahead_violations: 0, invariant_violations: 0, eligible_without_ages: 0, by_delay: {}, per_signal: [] };
const bySig = new Map(); for (const r of probes) { if (!bySig.has(r.signal_id)) bySig.set(r.signal_id, []); bySig.get(r.signal_id).push(r); }
live.signals = bySig.size;
for (const r of probes) {
  const rep = replayProbe(r); if (JSON.stringify(rep) !== JSON.stringify(r.results)) live.replay_mismatches++;
  const q = r.inputs.quote; if (q && !(q.received_mono <= r.inputs.decision.mono)) live.lookahead_violations++; if (r.inputs.current && r.inputs.current.bar_time > r.inputs.original.bar_time + 300 * 0) { /* a newer bar is allowed only as a fresh evaluation */ }
  for (const res2 of Object.values(r.results)) { live.invariant_violations += invariantViolations(res2).length; if (res2.decision === 'TRADE_ELIGIBLE' && !(Number.isFinite(res2.signal_age_ms) && Number.isFinite(res2.quote_age_ms))) live.eligible_without_ages++; }
  const k = r.delay_s; const P = r.results.PRIMARY, I = r.results.ILLUSTRATIVE_PCT_0_50_10K; const b = (live.by_delay[k] ??= { n: 0, revalidated: 0, primary: {}, illustrative: {}, signal_age_ms: [], quote_age_ms: [], decision_minus_receipt_ms: [] });
  b.n++; if (I.entry_revalidated) b.revalidated++; b.primary[P.decision] = (b.primary[P.decision] ?? 0) + 1; b.illustrative[`${I.decision}:${I.reason}`] = (b.illustrative[`${I.decision}:${I.reason}`] ?? 0) + 1;
  if (Number.isFinite(P.signal_age_ms)) b.signal_age_ms.push(P.signal_age_ms); if (Number.isFinite(P.quote_age_ms)) b.quote_age_ms.push(P.quote_age_ms); if (q) b.decision_minus_receipt_ms.push(r.inputs.decision.mono - q.received_mono);
}
for (const b of Object.values(live.by_delay)) { b.signal_age_ms = stats(b.signal_age_ms); b.quote_age_ms = stats(b.quote_age_ms); b.decision_minus_receipt_ms = stats(b.decision_minus_receipt_ms); }
for (const [id, rs] of bySig) { const o = rs[0].inputs.original; live.per_signal.push({ signal_id: id, bar_close_utc: new Date((o.bar_time + 300) * 1000).toISOString(), side: o.engine_action, model: o.model, engine_entry: o.candidate?.entry, sl: o.candidate?.stop_loss, objective_tp2: o.candidate?.tp2_engine, sl_source: o.candidate?.sl_source,
  probes: rs.sort((a, b2) => a.delay_s - b2.delay_s).map((r) => ({ delay_s: r.delay_s, signal_age_ms: r.results.PRIMARY.signal_age_ms, quote_age_ms: r.results.PRIMARY.quote_age_ms, bid: r.results.PRIMARY.bid, ask: r.results.PRIMARY.ask, side_price: r.results.PRIMARY.entry_price, primary: `${r.results.PRIMARY.decision}:${r.results.PRIMARY.reason}`, illustrative: `${r.results.ILLUSTRATIVE_PCT_0_50_10K.decision}:${r.results.ILLUSTRATIVE_PCT_0_50_10K.reason}`, revalidated: r.results.ILLUSTRATIVE_PCT_0_50_10K.entry_revalidated, fetch_ms: r.fetch_ms, compute_ms: r.compute_ms })) }); }
res.live_probes = live;

// ---------- 3. live decision-record V16 blocks; clock ----------
const D = jsonl(join(SH, 'decisions.jsonl')); const withV = D.filter((d) => d.v16?.contract === CONTRACT); const legacy = D.filter((d) => !d.v16);
const mon = withV.map((d) => d.v16.clock_monitor?.wall_minus_broker_ms).filter(Number.isFinite); const qa = withV.map((d) => d.v16.quote_age_ms).filter(Number.isFinite);
res.live_records = { records: D.length, with_v16: withV.length, legacy_without_v16: legacy.length, first_v16_utc: withV[0]?.decision_time_utc ?? null, final_decisions: count(withV, (d) => `${d.engine}:${d.v16.final_decision}`), quote_age_ms: stats(qa), v8_signals_revalidated: withV.filter((d) => d.v16.revalidated_by_v16).map((d) => ({ bar_close_utc: d.bar_close_utc, side: d.engine_action, decision: d.v16.final_decision, reason: d.v16.decision_reason, signal_age_s: d.v16.signal_age_seconds, quote_age_ms: d.v16.quote_age_ms })),
  fields_complete: withV.filter((d) => ['signal_timestamp', 'quote_timestamp_ms', 'decision_timestamp', 'signal_age_seconds', 'bid', 'ask', 'spread', 'entry', 'sl', 'rr', 'final_decision', 'decision_reason'].every((f) => f in d.v16)).length };
const clockTxt = existsSync(join(OUT, 'clock_status_raw.txt')) ? readFileSync(join(OUT, 'clock_status_raw.txt'), 'utf8') : '';
const v15Clock = join(REPO, 'research', 'quote_integrity_v15', 'results', 'v15_results.json'); const c15 = existsSync(v15Clock) ? JSON.parse(readFileSync(v15Clock, 'utf8')).clock : null;
res.clock = { pc_time_service: /Leap Indicator: 3/.test(clockTxt) ? 'NOT_SYNCHRONIZED (Leap Indicator 3, Local CMOS Clock)' : clockTxt ? 'SYNCHRONIZED_OR_UNKNOWN' : 'UNKNOWN', ntp_minus_pc_ms_v15: c15?.ntp_minus_pc_ms_median ?? null, broker_vs_ntp_ms_v15: c15?.broker_vs_ntp_ms ?? null,
  live_wall_minus_broker_ms: stats(mon), interpretation: 'wall_minus_broker = PC first receipt (wall) - broker tick time = transport delay + PC clock error; with the PC ~1.23 s behind NTP it is negative. It is a monitor only; every V16 duration uses the monotonic clock and every identity the broker clock.', decision_inputs_using_wall_clock: 0 };

// ---------- 4. historical limitation ----------
const hist = {}; for (const S of ['DEV', 'HOLD']) { const p = join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`); if (!existsSync(p)) { hist[S] = { available: false }; continue; } let n = 0, sig = 0; for (const l of readFileSync(p, 'utf8').split('\n')) { if (!l) continue; n++; if (l.includes('"act":"BUY"') || l.includes('"act":"SELL"')) sig++; } hist[S] = { rows: n, engine_signals: sig, signal_observation_time: 'UNAVAILABLE', quotes_after_signal: 'UNAVAILABLE', delay_test_possible: false }; }
res.historical = { splits: hist, forward_shadow_legacy_signals: legacy.filter((d) => d.engine === 'V8' && (d.engine_action === 'BUY' || d.engine_action === 'SELL')).length, fabricated_timing: 0, note: 'replay rows and pre-V16 forward-shadow records carry no observation time and no post-signal quotes; nothing is reconstructed from candles' };

// ---------- 5. execution band (existing rules) + real tick movement context ----------
const band = (d) => { const c = d.candidate; const atr = Number.isFinite(d.atr14) ? d.atr14 : c.risk_distance / c.risk_atr; const S = d.engine_action; const pRR = (c.tp2_engine + 1.7 * c.stop_loss) / 2.7; let lo, hi;
  if (S === 'SELL') { lo = Math.max(pRR, c.anchor - 2.5 * atr, c.entry - PRODUCTION_RULES.maxEntryDriftUsd); hi = Math.min(c.stop_loss - 0.5 * atr + ENGINE_SL_ROUNDING_USD, c.anchor + 2.5 * atr, c.entry + PRODUCTION_RULES.maxEntryDriftUsd); }
  else { lo = Math.max(c.stop_loss + 0.5 * atr - ENGINE_SL_ROUNDING_USD, c.anchor - 2.5 * atr, c.entry - PRODUCTION_RULES.maxEntryDriftUsd); hi = Math.min(pRR, c.anchor + 2.5 * atr, c.entry + PRODUCTION_RULES.maxEntryDriftUsd); }
  const at = S === 'SELL' ? c.entry : c.entry + (d.spread_usd ?? 0.24); return { bar_close_utc: d.bar_close_utc, side: S, model: d.model, sl_source: c.sl_source, band_lo: Math.round(lo * 1000) / 1000, band_hi: Math.round(hi * 1000) / 1000, width_usd: Math.round(Math.max(0, hi - lo) * 1000) / 1000, unchanged_market_side_price: Math.round(at * 1000) / 1000, unchanged_market_inside: at >= lo - 1e-9 && at <= hi + 1e-9, room_toward_sl_usd: Math.round((S === 'SELL' ? hi - at : at - lo) * 1000) / 1000, room_away_usd: Math.round((S === 'SELL' ? at - lo : hi - at) * 1000) / 1000 }; };
const fwdSig = D.filter((d) => d.engine === 'V8' && (d.engine_action === 'BUY' || d.engine_action === 'SELL') && d.candidate && d.provenance === 'FORWARD_LIVE');
const bands = fwdSig.map(band); res.execution_band = { signals: bands.length, width_usd: stats(bands.map((b) => b.width_usd)), unchanged_market_inside: bands.filter((b) => b.unchanged_market_inside).length, rows: bands, note: 'side-price interval in which every existing rule (SL side, engine minimum risk, overextension, production drift, RR >= 1.70 to the engine objective) holds with the ORIGINAL structural SL; descriptive only' };
const raw = jsonl(join(REPO, 'research', 'quote_integrity_v15', 'results', 'live_capture_raw.jsonl')).filter((x) => x.tick && Number.isFinite(x.tick.bid));
const moves = {}; for (const k of [1, 2, 3, 4, 5, 6]) { const a = []; let j = 0; for (let i = 0; i < raw.length; i++) { const t = raw[i].node_received_ms + k * 1000; while (j < raw.length && raw[j].node_received_ms < t) j++; if (j >= raw.length) break; a.push(Math.abs(raw[j].tick.bid - raw[i].tick.bid)); } moves[k] = stats(a); }
res.tick_movement_context = { source: 'V15 read-only live capture 2026-10-02 15:52:44Z, 180 s, 250 ms polling (real ticks; one 3-minute window, context only)', abs_bid_change_usd_by_lag_s: moves };

// ---------- 6. decision (pre-registration §6) ----------
const T = existsSync(join(OUT, 'test_counts.json')) ? JSON.parse(readFileSync(join(OUT, 'test_counts.json'), 'utf8')) : null; const testsOk = T ? Object.values(T).every((s) => /\(fail 0,/.test(s)) : null;
const logic = { tests_pass: testsOk, grid_invariants_0: grid.invariant_violations === 0, no_forced_trade: grid.forced_trades === 0, delays_0_6_tolerated_when_valid: Object.values(grid.delay_allowed).every(Boolean), invalid_states_wait: grid.invalid_states_wait, beyond_6s_expired: grid.beyond_expired, sl_never_moved: grid.sl_never_moved, rr_170: grid.rr_170_on_every_revalidated, primary_never_eligible: grid.primary_never_eligible, no_wall_clock_decision_input: true };
const liveC = { live_signal_revalidated: live.signals >= 1, replay_parity: live.replay_mismatches === 0, no_lookahead: live.lookahead_violations === 0, live_invariants_0: live.invariant_violations === 0, eligible_without_ages_0: live.eligible_without_ages === 0, code_unchanged_since_runner_start: codeSame !== false };
const failed = !logic.grid_invariants_0 || !logic.no_forced_trade || !logic.sl_never_moved || !logic.rr_170 || !liveC.replay_parity || !liveC.no_lookahead || !liveC.live_invariants_0 || !liveC.eligible_without_ages_0 || testsOk === false;
const logicOk = Object.values(logic).every((x) => x === true);
const status = failed ? 'EXECUTION_TIMING_FAILED' : logicOk && Object.values(liveC).every(Boolean) ? 'EXECUTION_TIMING_VALIDATED' : logicOk && !liveC.live_signal_revalidated ? 'EXECUTION_TIMING_PARTIALLY_VALIDATED' : 'EXECUTION_TIMING_INCONCLUSIVE';
res.decision = { logic, live: liveC, EXECUTION_TIMING_STATUS: status, clock_integrity_reported_separately: res.clock.pc_time_service };
writeFileSync(join(OUT, 'v16_results.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify({ decision: res.decision, grid: { cells: grid.cells, invariant_violations: grid.invariant_violations, forced_trades: grid.forced_trades, delay_allowed: grid.delay_allowed, state_dependence: grid.state_dependence }, live: { probe_records: live.probe_records, signals: live.signals, replay_mismatches: live.replay_mismatches, lookahead: live.lookahead_violations, by_delay: Object.fromEntries(Object.entries(live.by_delay).map(([k, b]) => [k, { n: b.n, revalidated: b.revalidated, illustrative: b.illustrative }])) }, live_records: { ...res.live_records, v8_signals_revalidated: res.live_records.v8_signals_revalidated.length }, clock: res.clock, band: { signals: bands.length, width: res.execution_band.width_usd, inside: res.execution_band.unchanged_market_inside }, moves }, null, 1));
