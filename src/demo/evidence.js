/**
 * STAGE 12 FORWARD DEMO EVIDENCE (schema demo-forward-1.0). Append-only JSONL under state/demo_forward/
 * (gitignored). Records are never rewritten; a partial trailing line after a crash is skipped and counted,
 * never repaired. Provenance is fixed at creation; only FORWARD_LIVE_DEMO may count toward Stage 12 gates.
 *
 * Record kinds (all carry the envelope: schema_version, record_id, kind, provenance, created_at_utc):
 *   SIGNAL      decision-time record of a genuine production BUY/SELL (executed OR blocked) with the context
 *               known at that time and the executor's verdict (never a future field)
 *   EXECUTION   lifecycle events mirrored from the DEMO executor audit (INTENT, OPENED, SKIPPED, CLOSE_TRIGGERED,
 *               CLOSED, STOPS_REALIGNED, THESIS_*, EMERGENCY_*, ANOMALY, ...) with broker identifiers/timestamps
 *   OUTCOME     future metrics per pre-declared horizon, written only after the horizon elapsed, linked by signal_id
 * This module is pure apart from the store's file appends. It never imports execution code.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEMO_SCHEMA_VERSION = 'demo-forward-1.0';
export const DEMO_PROVENANCE = Object.freeze(['FORWARD_LIVE_DEMO', 'BACKFILL', 'HISTORICAL_REPLAY', 'TEST']);
export const FORWARD_DEMO = 'FORWARD_LIVE_DEMO';
export const RECORD_KINDS = Object.freeze(['SIGNAL', 'EXECUTION', 'OUTCOME']);
export const FRESHNESS_WINDOW_SEC = 15 * 60;
export const OUTCOME_HORIZONS = Object.freeze({ h12: { bars_5m: 12 }, h24: { bars_5m: 24 }, h48: { bars_5m: 48 } }); // + geometry (TP1 vs SL within 48 bars) inside h48
const isIso = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s)) && s.endsWith('Z');
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(4));

export const recordId = (...parts) => createHash('sha256').update(`${DEMO_SCHEMA_VERSION}|${parts.join('|')}`).digest('hex').slice(0, 20);

export function provenanceFor({ decisionSec, nowSec, mode = 'LIVE' }) {
  if (mode === 'REPLAY') return 'HISTORICAL_REPLAY'; if (mode === 'TEST') return 'TEST';
  const age = nowSec - decisionSec; if (age < 0) return null; if (age <= FRESHNESS_WINDOW_SEC) return FORWARD_DEMO; if (age <= 24 * 3600) return 'BACKFILL'; return null;
}

/** Decision-time SIGNAL record. `exec` is the executor verdict for this signal ({ executed, reason, details }); `ctx` is the context read from the engine result. */
export function buildSignalRecord({ nowSec, signalId, result, alert, exec, ctx = {}, provenance, identity, cohort = null }) {
  const barTime = result?.signal?.signal_bar_time ?? result?.market_data_times?.['5m'] ?? null; const decisionIso = result?.calculated_at ?? new Date(nowSec * 1000).toISOString();
  return {
    schema_version: DEMO_SCHEMA_VERSION, record: 'demo_forward', kind: 'SIGNAL', record_id: recordId('SIGNAL', signalId), signal_id: signalId, thesis_id: result?.signal?.thesis_id ?? null, provenance, created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: decisionIso,
    signal_candle_time: Number.isFinite(barTime) ? barTime : null, symbol: identity.symbol, engine_symbol: result?.symbol ?? null, timeframe: '5m', engine_profile: result?.engine_profile ?? null,
    side: alert?.action ?? result?.action ?? null, model: alert?.setup ?? result?.setup ?? null, quality: alert?.quality ?? result?.quality ?? null,
    regime_5m: ctx.regime_5m ?? null, structure_5m: ctx.structure_5m ?? null, bias_15m: ctx.bias_15m ?? null, regime_15m: ctx.regime_15m ?? null, context_30m: ctx.context_30m ?? null, context_1h: ctx.context_1h ?? null,
    entry: alert?.entry ?? null, structural_stop: alert?.sl ?? null, tp1: alert?.tp1 ?? null, tp2: alert?.tp2 ?? null, effective_rr: alert?.rr ?? null,
    spread_usd: ctx.spread_usd ?? null, feed_age_sec: ctx.feed_age_sec ?? null, feed_state: ctx.feed_state ?? null, news: ctx.news ?? null, news_tier: ctx.news_tier ?? null, shock_state: ctx.shock_state ?? null, breaker: ctx.breaker ?? null,
    account_class: identity.account_class, expected_login: identity.login, expected_server: identity.server, lot: identity.lot,
    // Pine-reference parity flag: production can veto an actionable signal on an
    // OPPOSING Pine reference (ENGINE_DISAGREEMENT); the validator has no chart
    // access, so its reference is always NOT_FOUND and such a veto cannot fire.
    pine_reference_status: result?.pine_reference?.status ?? null,
    pine_parity: result?.pine_reference?.status === 'OK' ? 'REFERENCE_READ' : 'REFERENCE_UNAVAILABLE_PRODUCTION_MAY_VETO',
    // Strategy/evidence version linking (Stage 12 D/E/F): a strategy mutation creates a visible cohort boundary.
    strategy_fingerprint: cohort?.strategy_fingerprint ?? null, git_commit: cohort?.git_commit ?? null, evaluation_rule_version: cohort?.evaluation_rule_version ?? null,
    execution_eligibility: exec?.executed ? 'EXECUTED' : 'BLOCKED', execution_status: exec?.executed ? 'EXECUTED' : `BLOCKED:${exec?.reason ?? 'UNKNOWN'}`, block_reason: exec?.executed ? null : (exec?.reason ?? 'UNKNOWN'), block_guard: exec?.details?.guard ?? exec?.guard ?? null, executor_details: exec?.details ?? null,
  };
}

export function buildExecutionRecord({ nowSec, auditRecord, provenance, lineIndex = null, cohort = null }) {
  // Identity = position in the append-only executor audit (stable across restarts) + the row's own type/time, so a
  // replayed mirror pass can never duplicate a row and two rows within the same millisecond are still distinct.
  const a = auditRecord; const id = recordId('EXECUTION', lineIndex ?? '', a.type, a.timestamp, a.signal_id ?? '', a.ticket ?? '', a.reason ?? '');
  return { schema_version: DEMO_SCHEMA_VERSION, record: 'demo_forward', kind: 'EXECUTION', record_id: id, audit_line_index: lineIndex, provenance, created_at_utc: new Date(nowSec * 1000).toISOString(), event_time_utc: a.timestamp, event_type: a.type, signal_id: a.signal_id ?? null, decision_id: a.decision_id ?? null, ticket: a.ticket ?? null, position_id: a.position_id ?? null, deal: a.broker_response?.deal ?? a.entry_deal?.ticket ?? null, order: a.broker_response?.order ?? null, retcode: a.broker_response?.retcode ?? null, account_login: a.account_login ?? null, account_server: a.account_server ?? null, side: a.side ?? null, lot: a.lot_size ?? a.volume ?? null, requested_price: a.requested_price ?? null, fill_price: a.execution_price ?? a.price ?? a.fill ?? a.broker_response?.price ?? null, slippage: a.slippage ?? null, structural_stop: a.structural_stop ?? null, initial_structural_risk: a.initial_structural_risk ?? null, initial_effective_rr: a.initial_effective_rr ?? null, model: a.model ?? null, calculated_at: a.calculated_at ?? null, regime: a.regime ?? null, open_price: a.open_price ?? null, open_time: a.open_time ?? null, exit_time: a.exit_time ?? null, exit_reason: a.exit_reason ?? null, exit_source: a.exit_source ?? null, broker_exit_reason: a.broker_exit_reason ?? null, strategy_fingerprint: cohort?.strategy_fingerprint ?? null, git_commit: cohort?.git_commit ?? null, live_bid: a.live_bid ?? null, live_ask: a.live_ask ?? null, spread: a.spread ?? null, entry_drift: a.entry_drift ?? null, broker_sl: a.broker_sl ?? null, broker_tp: a.broker_tp ?? null, reason: a.reason ?? null, source: a.source ?? null, net_pnl: a.net_pnl ?? null, gross_pnl: a.gross_pnl ?? null, commission: a.commission ?? null, swap: a.swap ?? null, exit_price: a.exit_price ?? a.price_current ?? null, mfe_usd: a.mfe_usd ?? null, mae_usd: a.mae_usd ?? null, protection: a.protection ? { news_state: a.protection.news_state, news_tier: a.protection.news_tier ?? null, shock_state: a.protection.shock_state, block_reasons: a.protection.block_reasons, last_block_cleared_at: a.protection.last_block_cleared_at ?? null } : null, raw_keys: Object.keys(a) };
}

/** Pure delayed outcome label. Uses only completed 5m bars strictly after the signal candle; refuses before the horizon end. */
export function labelSignalOutcome({ signal, horizonKey, bars5, nowSec, provenance }) {
  const n = OUTCOME_HORIZONS[horizonKey]?.bars_5m; if (!n) return null; const decisionSec = signal.signal_candle_time + 300; const horizonEnd = decisionSec + n * 300;
  if (nowSec < horizonEnd) return null;
  const path = (bars5 ?? []).filter((b) => Number.isFinite(b?.time) && b.time >= decisionSec && b.time + 300 <= horizonEnd).sort((a, b) => a.time - b.time);
  const base = { schema_version: DEMO_SCHEMA_VERSION, record: 'demo_forward', kind: 'OUTCOME', record_id: recordId('OUTCOME', signal.signal_id, horizonKey), signal_id: signal.signal_id, signal_record_id: signal.record_id, horizon: horizonKey, provenance, created_at_utc: new Date(nowSec * 1000).toISOString(), labeled_at_utc: new Date(nowSec * 1000).toISOString(), horizon_end_time: horizonEnd, last_bar_time_used: path.at(-1)?.time ?? null };
  if (path.length < n) return { ...base, status: 'INCOMPLETE_PATH', bars_expected: n, bars_found: path.length };
  const dir = signal.side === 'SELL' ? -1 : 1; const p0 = Number.isFinite(signal.entry) ? signal.entry : path[0].open; const end = path.at(-1).close; const risk = Number.isFinite(signal.structural_stop) ? Math.abs(p0 - signal.structural_stop) : null;
  let hi = -Infinity, lo = Infinity, touch = null, touchBar = null;
  for (const b of path) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); if (touch == null && Number.isFinite(signal.tp1) && Number.isFinite(signal.structural_stop)) { const tp = dir > 0 ? b.high >= signal.tp1 : b.low <= signal.tp1; const sl = dir > 0 ? b.low <= signal.structural_stop : b.high >= signal.structural_stop; if (tp && sl) touch = 'BOTH_SAME_BAR'; else if (tp) touch = 'TP1'; else if (sl) touch = 'SL'; if (touch) touchBar = b.time; } }
  const move = dir * (end - p0); const mfe = dir > 0 ? hi - p0 : p0 - lo; const mae = dir > 0 ? p0 - lo : hi - p0;
  return { ...base, status: 'LABELED', ref_price: p0, end_close: end, side_signed_move_usd: r4(move), mfe_usd: r4(mfe), mae_usd: r4(mae), r_multiple_mtm: risk ? r4(move / risk) : null, geometry: { touch: touch ?? 'NONE', touch_bar_time: touchBar, r_multiple: touch === 'TP1' ? (risk ? r4(Math.abs(signal.tp1 - p0) / risk) : null) : touch === 'SL' ? -1 : touch === 'BOTH_SAME_BAR' ? null : (risk ? r4(move / risk) : null) } };
}

export function validateRecord(r) {
  const e = []; if (!r || typeof r !== 'object') return { ok: false, errors: ['NOT_AN_OBJECT'] };
  if (r.schema_version !== DEMO_SCHEMA_VERSION) e.push('SCHEMA_VERSION'); if (!RECORD_KINDS.includes(r.kind)) e.push('KIND'); if (!DEMO_PROVENANCE.includes(r.provenance)) e.push('PROVENANCE'); if (typeof r.record_id !== 'string' || r.record_id.length !== 20) e.push('RECORD_ID'); if (!isIso(r.created_at_utc)) e.push('CREATED_AT');
  if (r.kind === 'SIGNAL') { if (!isIso(r.decision_time_utc)) e.push('DECISION_TIME'); if (r.record_id !== recordId('SIGNAL', r.signal_id)) e.push('RECORD_ID_MISMATCH'); if (r.account_class !== 'DEMO') e.push('ACCOUNT_CLASS'); if (r.lot !== 0.01) e.push('LOT'); if (r.provenance === FORWARD_DEMO) { const lag = (Date.parse(r.created_at_utc) - Date.parse(r.decision_time_utc)) / 1000; if (!(lag >= 0 && lag <= FRESHNESS_WINDOW_SEC)) e.push('FORWARD_FRESHNESS'); } for (const k of ['realized_pnl', 'exit_price', 'mfe_usd', 'outcome']) if (k in r) e.push(`FUTURE_FIELD:${k}`); }
  if (r.kind === 'OUTCOME') { if (!isIso(r.labeled_at_utc)) e.push('LABELED_AT'); if (!Number.isInteger(r.horizon_end_time)) e.push('HORIZON_END'); else if (Date.parse(r.labeled_at_utc) / 1000 < r.horizon_end_time) e.push('LABELED_BEFORE_HORIZON'); if (r.last_bar_time_used != null && r.last_bar_time_used > r.horizon_end_time) e.push('LAST_BAR_TIME_USED'); if (r.record_id !== recordId('OUTCOME', r.signal_id, r.horizon)) e.push('RECORD_ID_MISMATCH'); }
  if (r.kind === 'EXECUTION' && !isIso(r.event_time_utc)) e.push('EVENT_TIME');
  return { ok: e.length === 0, errors: e };
}

export function createDemoEvidenceStore({ dir, deps = {} } = {}) {
  if (!dir) throw new Error('demo evidence store needs a directory');
  const fs = { append: deps.append ?? ((p, line) => appendFileSync(p, line)), read: deps.read ?? ((p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')), mkdir: deps.mkdir ?? ((p) => mkdirSync(p, { recursive: true })), write: deps.write ?? ((p, s) => { writeFileSync(p + '.tmp', s); renameSync(p + '.tmp', p); }) };
  const path = join(dir, 'demo_forward_evidence.jsonl'); fs.mkdir(dir); const ids = new Set(); const stats = { malformed_lines: 0, loaded: 0 };
  function readAll() { const rows = []; stats.malformed_lines = 0; for (const line of fs.read(path).split(/\r?\n/)) { if (!line.trim()) continue; try { const r = JSON.parse(line); rows.push(r); ids.add(r.record_id); } catch { stats.malformed_lines++; } } stats.loaded = rows.length; return rows; }
  readAll();
  function append(r) { const v = validateRecord(r); if (!v.ok) return { ok: false, reason: 'INVALID', errors: v.errors }; if (ids.has(r.record_id)) return { ok: false, reason: 'DUPLICATE' }; fs.append(path, JSON.stringify(r) + '\n'); ids.add(r.record_id); return { ok: true }; }
  function exportSnapshot(out, meta = {}) { const snap = { exported_at: new Date().toISOString(), schema_version: DEMO_SCHEMA_VERSION, ...meta, records: readAll() }; fs.mkdir(dirname(out)); fs.write(out, JSON.stringify(snap)); return { path: out, records: snap.records.length }; }
  return { path, append, readAll, has: (id) => ids.has(id), exportSnapshot, stats: () => ({ ...stats, records: ids.size }) };
}
