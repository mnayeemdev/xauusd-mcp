/**
 * V15 QUOTE DATA INTEGRITY -- study (RESEARCH ONLY; no order code). Spec: ../V15_PREREGISTRATION.md (hash asserted).
 * 1) replays the recorded live capture deterministically (restart, prefix / no-lookahead); 2) documents the clock: raw PC clock vs
 * broker clock, and an explicit NTP-referenced conversion SCENARIO (measured offset, not used for decisions); 3) historical replay
 * through the live-gate wrapper (candles only -> QUOTE age UNAVAILABLE, never fabricated); 4) forward-shadow records: legacy vs
 * quote-contract records, and the wrapper on them; 5) decision.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildQuote, validateQuote, legacyQuote, estimateServerOffsetMs, TECHNICAL_SCENARIOS_MS, CONTRACT } from './quote.mjs';
import { decideWithQuote, PRODUCTION_MAX_QUOTE_AGE_MS } from './live_gate.mjs';
import { fromReplayRow, fromShadowRecord, initGate, PRODUCTION_BREAKERS } from '../../trade_gate_v14/scripts/gate.mjs';
import { loadPlatformSpec } from '../../entry_risk_integration_v11/scripts/integrate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..'); const REPO = join(ROOT, '..', '..'); const OUT = join(ROOT, 'results');
const sha = (s) => createHash('sha256').update(s).digest('hex'); const shaFile = (p) => sha(readFileSync(p));
if (shaFile(join(ROOT, 'V15_PREREGISTRATION.md')) !== readFileSync(join(ROOT, 'V15_PREREGISTRATION.sha256'), 'utf8').trim().split(/\s+/)[0]) throw new Error('V15_PREREGISTRATION hash mismatch');
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = (a) => (a.length ? { n: a.length, min: Math.min(...a), p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9), p99: pct(a, 0.99), max: Math.max(...a) } : { n: 0 });
const count = (xs, f) => xs.reduce((g, x) => { const k = f(x); g[k] = (g[k] ?? 0) + 1; return g; }, {});
const res = { generated_utc: new Date().toISOString(), prereg_sha: shaFile(join(ROOT, 'V15_PREREGISTRATION.md')), contract: CONTRACT };

// ---------- 1. live capture: deterministic replay of every quote-age decision ----------
const raw = readFileSync(join(OUT, 'live_capture_raw.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); const summary = JSON.parse(readFileSync(join(OUT, 'live_capture_summary.json'), 'utf8'));
const offset = estimateServerOffsetMs(raw.filter((x) => x.tick).map((x) => ({ quote_timestamp_ms: x.tick.time_msc, received_ms: x.py_received_ms })));
function replayCapture(rows, { pcUtcOffsetMs = 0, from = 0, upto = null, prev0 = null } = {}) { let prev = prev0; const out = []; for (let k = from; k < (upto ?? rows.length); k++) { const x = rows[k]; const q = buildQuote({ symbol: 'XAUUSDm', tick: x.tick, receivedMs: x.py_received_ms == null ? null : x.py_received_ms + pcUtcOffsetMs, decisionMs: x.node_received_ms + pcUtcOffsetMs, serverUtcOffsetMs: offset, offsetSource: 'live calibration' }); const v = validateQuote(q, { prev, maxAgeMs: PRODUCTION_MAX_QUOTE_AGE_MS }); out.push({ age: q.quote_age_ms, status: v.status, primary: v.primary, duplicate: v.duplicate }); if (v.status === 'VALID' || v.status === 'STALE') prev = q; } return { out, prev }; }
const a = replayCapture(raw), b = replayCapture(raw); const half = Math.floor(raw.length / 2); const p1 = replayCapture(raw, { upto: half }); const p2 = replayCapture(raw, { from: half, prev0: p1.prev });
res.live_capture = { observations: raw.length, server_utc_offset_ms: offset, summary_from_capture: summary, replay_deterministic: sha(JSON.stringify(a.out)) === sha(JSON.stringify(b.out)), replay_matches_capture_summary: JSON.stringify(count(a.out, (x) => x.status + (x.primary ? `:${x.primary}` : ''))) === JSON.stringify(summary.validation), restart_equals_uninterrupted: sha(JSON.stringify([...p1.out, ...p2.out])) === sha(JSON.stringify(a.out)), prefix_stable: sha(JSON.stringify(replayCapture(raw.slice(0, 200)).out)) === sha(JSON.stringify(a.out.slice(0, 200))), raw_pc_clock: { ages: stats(a.out.map((x) => x.age).filter(Number.isFinite)), statuses: count(a.out, (x) => x.status + (x.primary ? `:${x.primary}` : '')) } };
// receive (Python reader, time.time) vs decision (Node, Date.now) are two processes reading the same PC clock at 1 ms resolution; a decision 1 ms "before" receipt is a resolution artifact, kept and reported (fails closed as DECISION_BEFORE_RECEIPT), never repaired.
res.live_capture.decision_minus_receive_ms = count(raw.filter((x) => x.py_received_ms != null), (x) => x.node_received_ms - x.py_received_ms);

// ---------- 2. clock: NTP reference (read-only w32tm) and the documented conversion SCENARIO ----------
const clockTxt = readFileSync(join(OUT, 'clock_reference_raw.txt'), 'utf8'); const offs = [...clockTxt.matchAll(/,\s*([+-]\d+\.\d+)s/g)].map((m) => Number(m[1]) * 1000); const ntpOffsetMs = Math.round(pct(offs, 0.5));
const lastPlatform = readFileSync(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"ping_last"')).at(-1); const ping = lastPlatform ? Number(/"ping_last":(\d+)/.exec(lastPlatform)?.[1]) : null;
const corr = replayCapture(raw, { pcUtcOffsetMs: ntpOffsetMs }); const cAges = corr.out.map((x) => x.age).filter(Number.isFinite);
res.clock = { pc_time_service: /Leap Indicator: 3/.test(clockTxt) ? 'NOT_SYNCHRONIZED (Leap Indicator 3, Source: Local CMOS Clock, never synced)' : 'SYNCHRONIZED_OR_UNKNOWN', ntp_reference: 'time.windows.com (w32tm /stripchart, read-only)', ntp_minus_pc_ms_samples: offs, ntp_minus_pc_ms_median: ntpOffsetMs, broker_minus_pc_ms_estimate: -Math.min(...a.out.map((x) => x.age).filter(Number.isFinite)), broker_vs_ntp_ms: -Math.min(...a.out.map((x) => x.age).filter(Number.isFinite)) - ntpOffsetMs, terminal_ping_us: ping,
  conversion_scenario: { description: 'decision and receive times converted from the PC clock to UTC by the measured NTP offset; documented research conversion, NOT used for any decision', ages: stats(cAges), negative_ages: cAges.filter((x) => x < 0).length, statuses: count(corr.out, (x) => x.status + (x.primary ? `:${x.primary}` : '')), technical_scenarios: Object.fromEntries(TECHNICAL_SCENARIOS_MS.map((t) => [t, Math.round((cAges.filter((x) => x <= t).length / Math.max(1, cAges.length)) * 10000) / 10000])), min_age_vs_half_ping_ms: ping ? [Math.min(...cAges), Math.round(ping / 2000)] : null } };

// ---------- 3. historical replay: candles only -> quote age UNAVAILABLE, never fabricated ----------
const SPEC = loadPlatformSpec(join(REPO, 'state', 'xauusd_mt5_real_trade_log.jsonl'));
const CFG = { PRIMARY: { riskModel: 'UNRESOLVED', breakers: PRODUCTION_BREAKERS, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC }, ILLUSTRATIVE_PCT_0_50_10K: { riskModel: { model: 'PCT', riskPct: 0.005 }, breakers: null, conflictResolution: 'EXISTING_PRIORITY', spec: SPEC } };
res.historical = {}; for (const S of ['DEV', 'HOLD']) { const rows = readFileSync(join(REPO, 'research', 'core_pattern_audit_v8', 'results', 'rows', `ALL_${S}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).sort((x, y) => x.i - y.i); res.historical[S] = {};
  for (const [name, cfg] of Object.entries(CFG)) { let st = initGate(); const recs = []; for (const r of rows) { const o = decideWithQuote(st, fromReplayRow(r), legacyQuote({ source: 'V8_REPLAY_ROW (candles only)' }), cfg); st = o.state; recs.push(o.record); }
    const valid = recs.filter((x) => x.valid_entry); res.historical[S][name] = { decisions: recs.length, valid_entries: valid.length, by_state: count(recs, (x) => x.decision), valid_entry_reasons: count(valid, (x) => x.reason), trade_eligible: recs.filter((x) => x.decision === 'TRADE_ELIGIBLE').length, fabricated_quote_age: recs.filter((x) => typeof x.quote?.quote_age_ms === 'number').length }; } }

// ---------- 4. forward shadow: legacy vs quote-contract records; the wrapper on them ----------
const SH = join(REPO, 'state', 'v8_shadow', 'decisions.jsonl'); const recsAll = existsSync(SH) ? readFileSync(SH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => o.record === 'decision') : [];
const withQ = recsAll.filter((o) => o.quote_contract === CONTRACT && o.quote); const legacy = recsAll.filter((o) => !o.quote);
const qFields = ['symbol', 'decision_timestamp_ms', 'bid', 'ask', 'mid', 'quote_timestamp_ms', 'quote_age_ms', 'spread', 'tick_sequence', 'data_source', 'data_received_timestamp_ms', 'clock'];
const v8q = withQ.filter((o) => o.engine === 'V8'); let st = initGate(); const live = []; for (const o of v8q.sort((x, y) => x.bar_time - y.bar_time)) { const out = decideWithQuote(st, fromShadowRecord(o), o.quote, CFG.ILLUSTRATIVE_PCT_0_50_10K); st = out.state; live.push({ bar_close_utc: o.bar_close_utc, engine_action: o.engine_action, decision: out.record.decision, reason: out.record.reason, quote_age_ms: o.quote.quote_age_ms, quote_status: o.quote_check?.status, quote_reason: o.quote_check?.reasons?.[0] ?? null }); }
res.forward_shadow = { records: recsAll.length, legacy_records: legacy.length, legacy_label: 'LEGACY_DATA / QUOTE_AGE_UNAVAILABLE', quote_contract_records: withQ.length, quote_fields_complete: withQ.filter((o) => qFields.every((k) => k in o.quote)).length, quote_timestamp_captured: withQ.filter((o) => typeof o.quote.quote_timestamp_ms === 'number').length, quote_age_computed: withQ.filter((o) => typeof o.quote.quote_age_ms === 'number').length, quote_status: count(withQ, (o) => `${o.quote_check?.status}${o.quote_check?.reasons?.[0] ? `:${o.quote_check.reasons[0]}` : ''}`), quote_age_ms: stats(withQ.map((o) => o.quote.quote_age_ms).filter(Number.isFinite)), first_quote_record_utc: withQ[0]?.decision_time_utc ?? null, gate_on_v8_quote_records: live };

// ---------- 5. invariants and decision (pre-registered §6) ----------
const eligibleWithoutAge = Object.values(res.historical).flatMap((s2) => Object.values(s2)).reduce((s2, x) => s2 + x.trade_eligible, 0) + live.filter((x) => x.decision === 'TRADE_ELIGIBLE' && x.quote_status !== 'VALID').length;
const fabricated = Object.values(res.historical).flatMap((s2) => Object.values(s2)).reduce((s2, x) => s2 + x.fabricated_quote_age, 0);
const L = res.live_capture; const liveOk = summary.quote_timestamp_capture_share >= 0.99 && L.raw_pc_clock.ages.n === raw.length; const clockOk = summary.negative_ages === 0;
const shadowOk = v8q.length + withQ.filter((o) => o.engine === 'CONTROL').length >= 3 && withQ.filter((o) => o.quote_check?.status === 'VALID').length >= 3;
const failed = eligibleWithoutAge > 0 || fabricated > 0; const replayOk = L.replay_deterministic && L.replay_matches_capture_summary && L.restart_equals_uninterrupted && L.prefix_stable;
res.decision = { criteria: { quote_timestamp_captured_ge_99pct: liveOk, quote_age_computed_every_observation: L.raw_pc_clock.ages.n === raw.length, no_unexplained_negative_age: clockOk, clock_negative_ages_explained: !clockOk ? 'PC clock not synchronized: it lags NTP by ~' + ntpOffsetMs + ' ms; the broker clock agrees with NTP within ~' + Math.abs(res.clock.broker_vs_ntp_ms) + ' ms' : null, forward_shadow_ge_3_valid_quote_records: shadowOk, replay_ok: replayOk, eligible_without_quote_age: eligibleWithoutAge, fabricated_historical_quote_age: fabricated },
  DATA_INTEGRITY_STATUS: failed ? 'DATA_INTEGRITY_FAILED' : raw.length === 0 ? 'DATA_INTEGRITY_INCONCLUSIVE' : liveOk && clockOk && shadowOk && replayOk ? 'DATA_INTEGRITY_VALIDATED' : 'DATA_INTEGRITY_PARTIALLY_VALIDATED' };
writeFileSync(join(OUT, 'v15_results.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify({ decision: res.decision, clock: { ...res.clock, ntp_minus_pc_ms_samples: undefined }, live: { ...L, summary_from_capture: undefined }, historical: res.historical, shadow: { ...res.forward_shadow, gate_on_v8_quote_records: res.forward_shadow.gate_on_v8_quote_records.slice(0, 6) } }, null, 1));
