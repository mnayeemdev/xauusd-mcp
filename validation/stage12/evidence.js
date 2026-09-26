/**
 * STAGE 12 D/E/F — EVIDENCE LOADING, INTEGRITY AND NORMALISATION. READ-ONLY. PURE apart from reading files.
 *
 * Sources (never modified, never repaired, never deleted):
 *   DEMO   state/demo_forward/demo_forward_evidence.jsonl (schema demo-forward-1.0; SIGNAL/EXECUTION/OUTCOME)
 *   REAL   state/xauusd_mt5_real_trade_log.jsonl (executor audit; OPENED/CLOSED/SKIPPED rows) -> derived provenance
 *          FORWARD_LIVE_REAL, always a SEPARATE cohort (never mixed with DEMO)
 *   SHADOW state/shadow/{observations,outcomes}.jsonl (schema shadow-1.0) via the frozen Stage 11C evaluator
 *
 * Questionable evidence is QUARANTINED (listed with reasons) and excluded from every statistic; it is never
 * rewritten into valid evidence. Provenance is read, never assigned to DEMO/SHADOW records; the REAL cohort's
 * derived label is explicit and cannot satisfy the DEMO gate.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRecord as validateDemoRecord, DEMO_PROVENANCE, FORWARD_DEMO } from '../../src/demo/evidence.js';
import { DEMO_PROVENANCE_FORWARD, REAL_PROVENANCE_FORWARD, NEVER_GATE_PROVENANCE, R_DEFINITION, SESSION_BUCKETS } from './rules.js';

export const DEMO_EXPECTED = Object.freeze({ login: 480236873, server: 'Exness-MT5Trial11', symbol: 'XAUUSDm', account_class: 'DEMO' });
export const REAL_EXPECTED = Object.freeze({ login: 460149329, server: 'Exness-MT5Real51', symbol: 'XAUUSDm', account_class: 'REAL' });
const FUTURE_TOLERANCE_SEC = 300;

export function readJsonl(path) {
  const rows = [], malformed = [];
  if (!existsSync(path)) return { rows, malformed, missing: true };
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => { if (!line.trim()) return; try { rows.push({ line: i + 1, r: JSON.parse(line) }); } catch { malformed.push(i + 1); } });
  return { rows, malformed, missing: false };
}

export function sessionBucket(iso) { const h = new Date(iso).getUTCHours(); return SESSION_BUCKETS.find((b) => h >= b.from_hour && h < b.to_hour)?.id ?? 'UNKNOWN'; }
const riskUsd = (fill, stop, lot = R_DEFINITION.lot) => (Number.isFinite(fill) && Number.isFinite(stop) && Math.abs(fill - stop) > 0 ? Math.abs(fill - stop) * R_DEFINITION.contract_size * lot : null);

/**
 * DEMO evidence -> { trades, open_trades, blocked_signals, signals, integrity, cohorts }.
 * Integrity checks (each failing record is quarantined with reasons; nothing is repaired):
 *  schema/provenance validity, duplicate record ids, duplicate SIGNAL per signal_id, duplicate CLOSED per ticket,
 *  duplicate OUTCOME per (signal, horizon), outcome before signal, outcome before horizon (validator rule),
 *  future timestamps, clock inversion (CLOSED before OPENED, created before event), account contamination
 *  (login/server/class/symbol/lot), fingerprint cohort split, malformed lines (counted).
 */
export function loadDemoEvidence({ dir, nowSec = Date.now() / 1000, evidenceFile = 'demo_forward_evidence.jsonl', allowSyntheticFixtures = false } = {}) {
  const path = join(dir, evidenceFile); const { rows, malformed, missing } = readJsonl(path);
  const quarantine = []; const q = (row, reason, extra = {}) => quarantine.push({ line: row.line, record_id: row.r?.record_id ?? null, kind: row.r?.kind ?? null, reason, ...extra });
  const seenId = new Set(), seenSignal = new Set(), seenClosedTicket = new Set(), seenOutcome = new Set();
  const valid = [];
  for (const row of rows) {
    const r = row.r; const v = validateDemoRecord(r);
    if (!v.ok) { q(row, 'INVALID_RECORD', { errors: v.errors }); continue; }
    if (!DEMO_PROVENANCE.includes(r.provenance)) { q(row, 'INVALID_PROVENANCE'); continue; }
    // Synthetic test fixtures carry an explicit marker; outside an isolated test store they are quarantined, never counted.
    if (r.synthetic_fixture && !allowSyntheticFixtures) { q(row, 'SYNTHETIC_FIXTURE_IN_EVIDENCE'); continue; }
    if (seenId.has(r.record_id)) { q(row, 'DUPLICATE_RECORD_ID'); continue; } seenId.add(r.record_id);
    const stamps = [r.created_at_utc, r.decision_time_utc, r.event_time_utc, r.labeled_at_utc].filter(Boolean);
    if (stamps.some((s) => Date.parse(s) / 1000 > nowSec + FUTURE_TOLERANCE_SEC)) { q(row, 'FUTURE_TIMESTAMP'); continue; }
    if (r.kind === 'SIGNAL') {
      if (seenSignal.has(r.signal_id)) { q(row, 'DUPLICATE_SIGNAL'); continue; } seenSignal.add(r.signal_id);
      if (r.account_class !== DEMO_EXPECTED.account_class || r.expected_login !== DEMO_EXPECTED.login || r.expected_server !== DEMO_EXPECTED.server || r.symbol !== DEMO_EXPECTED.symbol || r.lot !== R_DEFINITION.lot) { q(row, 'ACCOUNT_CONTAMINATION', { account_class: r.account_class, expected_login: r.expected_login, expected_server: r.expected_server, symbol: r.symbol, lot: r.lot }); continue; }
    }
    if (r.kind === 'EXECUTION') {
      if (r.account_login != null && Number(r.account_login) !== DEMO_EXPECTED.login) { q(row, 'ACCOUNT_CONTAMINATION', { account_login: r.account_login }); continue; }
      if (r.account_server != null && r.account_server !== DEMO_EXPECTED.server) { q(row, 'ACCOUNT_CONTAMINATION', { account_server: r.account_server }); continue; }
      if (Date.parse(r.created_at_utc) + 1000 < Date.parse(r.event_time_utc)) { q(row, 'CLOCK_INVERSION_CREATED_BEFORE_EVENT'); continue; }
      if (r.event_type === 'CLOSED') { const key = `${r.ticket ?? r.position_id ?? r.signal_id}`; if (seenClosedTicket.has(key)) { q(row, 'DUPLICATE_CLOSE'); continue; } seenClosedTicket.add(key); }
    }
    if (r.kind === 'OUTCOME') { const key = `${r.signal_id}|${r.horizon}`; if (seenOutcome.has(key)) { q(row, 'DUPLICATE_OUTCOME'); continue; } seenOutcome.add(key); }
    valid.push(r);
  }
  const signals = valid.filter((r) => r.kind === 'SIGNAL'); const execs = valid.filter((r) => r.kind === 'EXECUTION'); const outs = valid.filter((r) => r.kind === 'OUTCOME');
  const bySignal = new Map(signals.map((s) => [s.signal_id, s]));
  // outcome-before-signal + outcome-for-unknown-signal
  const validOuts = [];
  for (const o of outs) { const s = bySignal.get(o.signal_id); if (!s) { quarantine.push({ record_id: o.record_id, kind: 'OUTCOME', reason: 'OUTCOME_WITHOUT_SIGNAL' }); continue; } if (Date.parse(o.created_at_utc) < Date.parse(s.decision_time_utc)) { quarantine.push({ record_id: o.record_id, kind: 'OUTCOME', reason: 'OUTCOME_BEFORE_SIGNAL' }); continue; } if (o.provenance !== s.provenance) { quarantine.push({ record_id: o.record_id, kind: 'OUTCOME', reason: 'PROVENANCE_MISMATCH_WITH_SIGNAL' }); continue; } validOuts.push(o); }
  // trades from OPENED + CLOSED
  const opened = new Map(); for (const e of execs) if (e.event_type === 'OPENED' && e.signal_id) opened.set(e.signal_id, e);
  const trades = [], open_trades = [];
  for (const e of execs) {
    if (e.event_type !== 'CLOSED' || !e.signal_id) continue;
    const s = bySignal.get(e.signal_id); const o = opened.get(e.signal_id);
    if (!s) { quarantine.push({ record_id: e.record_id, kind: 'EXECUTION', reason: 'CLOSE_WITHOUT_SIGNAL' }); continue; }
    if (o && Date.parse(e.event_time_utc) < Date.parse(o.event_time_utc)) { quarantine.push({ record_id: e.record_id, kind: 'EXECUTION', reason: 'CLOCK_INVERSION_CLOSE_BEFORE_OPEN' }); continue; }
    if (e.provenance !== s.provenance) { quarantine.push({ record_id: e.record_id, kind: 'EXECUTION', reason: 'PROVENANCE_MISMATCH_WITH_SIGNAL' }); continue; }
    trades.push(normalizeTrade({ cohort: 'DEMO', provenance: e.provenance, signal: s, opened: o, closed: e }));
  }
  for (const [sid, o] of opened) if (!trades.some((t) => t.signal_id === sid)) open_trades.push({ signal_id: sid, provenance: o.provenance, opened_at: o.event_time_utc, side: o.side ?? bySignal.get(sid)?.side ?? null, status: 'OPEN_NOT_COMPLETED' });
  const blocked_signals = signals.filter((s) => s.execution_eligibility === 'BLOCKED').map((s) => ({ signal_id: s.signal_id, provenance: s.provenance, decision_time_utc: s.decision_time_utc, reason: s.block_reason ?? 'UNKNOWN', guard: s.block_guard ?? null, model: s.model ?? null, side: s.side ?? null, pine_reference_status: s.pine_reference_status ?? null }));
  const cohorts = cohortSplit([...signals, ...execs]);
  return { source: path, missing, integrity: { malformed_lines: malformed, malformed_count: malformed.length, quarantined: quarantine, quarantined_count: quarantine.length, valid_records: valid.length, total_lines: rows.length + malformed.length, ok: quarantine.length === 0 && malformed.length === 0 }, signals, executions: execs, outcomes: validOuts, trades, open_trades, blocked_signals, cohorts };
}

/** Strategy-fingerprint cohort split: records stamped with a fingerprint are grouped; unstamped ones form the UNSTAMPED cohort. */
export function cohortSplit(records) {
  const m = new Map();
  for (const r of records) { const k = r.strategy_fingerprint ?? 'UNSTAMPED_PRE_12DEF'; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([fingerprint, records]) => ({ fingerprint, records }));
}

export function normalizeTrade({ cohort, provenance, signal, opened, closed }) {
  const fill = Number.isFinite(opened?.fill_price) ? opened.fill_price : (Number.isFinite(closed.open_price) ? closed.open_price : (Number.isFinite(signal?.entry) ? signal.entry : null));
  const stop = Number.isFinite(signal?.structural_stop) ? signal.structural_stop : (Number.isFinite(opened?.structural_stop) ? opened.structural_stop : null);
  const riskDist = Number.isFinite(closed.initial_structural_risk) ? closed.initial_structural_risk : (Number.isFinite(opened?.initial_structural_risk) ? opened.initial_structural_risk : null);
  const risk = riskDist != null ? riskDist * R_DEFINITION.contract_size * R_DEFINITION.lot : riskUsd(fill, stop);
  const net = Number.isFinite(closed.net_pnl) ? closed.net_pnl : null; const gross = Number.isFinite(closed.gross_pnl) ? closed.gross_pnl : null;
  const openIso = opened?.event_time_utc ?? closed.open_time ?? null; const closeIso = closed.exit_time ?? closed.event_time_utc;
  const slip = Number.isFinite(opened?.slippage) ? Math.abs(opened.slippage) : (Number.isFinite(opened?.fill_price) && Number.isFinite(opened?.requested_price) ? Math.abs(opened.fill_price - opened.requested_price) : null);
  const decisionIso = signal?.decision_time_utc ?? opened?.calculated_at ?? openIso;
  return {
    trade_id: `${cohort}:${closed.ticket ?? closed.position_id ?? closed.signal_id}`, cohort, account_class: cohort, provenance, gate_eligible: provenance === DEMO_PROVENANCE_FORWARD && cohort === 'DEMO', signal_id: closed.signal_id,
    strategy_fingerprint: closed.strategy_fingerprint ?? signal?.strategy_fingerprint ?? null, model: signal?.model ?? closed.model ?? opened?.model ?? null, side: signal?.side ?? closed.side ?? opened?.side ?? null,
    decision_time_utc: decisionIso, session_day: decisionIso ? decisionIso.slice(0, 10) : null, session_bucket: decisionIso ? sessionBucket(decisionIso) : null, month: decisionIso ? decisionIso.slice(0, 7) : null,
    open_time_utc: openIso, close_time_utc: closeIso, holding_minutes: openIso && closeIso ? r2((Date.parse(closeIso) - Date.parse(openIso)) / 60000) : null,
    requested_price: opened?.requested_price ?? null, fill_price: fill, exit_price: closed.exit_price ?? null, structural_stop: stop, initial_risk_usd: risk != null ? r2(risk) : null,
    net_usd: net, gross_usd: gross, commission_usd: closed.commission ?? null, swap_usd: closed.swap ?? null, r_net: net != null && risk ? +(net / risk).toFixed(4) : null, r_gross: gross != null && risk ? +(gross / risk).toFixed(4) : null,
    mfe_usd: closed.mfe_usd ?? null, mae_usd: closed.mae_usd ?? null, entry_slippage_usd: slip, spread_usd: opened?.spread ?? signal?.spread_usd ?? null, entry_drift_usd: opened?.entry_drift ?? null,
    exit_reason: closed.exit_reason ?? closed.reason ?? null, news_state: signal?.news?.state ?? opened?.protection?.news_state ?? closed.protection?.news_state ?? null, news_tier: signal?.news_tier ?? opened?.protection?.news_tier ?? null, shock_state: signal?.shock_state ?? opened?.protection?.shock_state ?? null, regime: signal?.regime_5m ?? opened?.regime ?? null, pine_reference_status: signal?.pine_reference_status ?? null,
    status: net != null ? 'COMPLETED' : 'COMPLETED_NO_PNL',
  };
}
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(2));

/**
 * REAL executor audit -> SUPPLEMENTARY cohort (derived provenance FORWARD_LIVE_REAL). Never mixed with DEMO,
 * never gate-eligible (the Stage 12 gate is declared on DEMO forward trades). Genuine forward evidence: every
 * row was written by the live executor at the time of the event.
 */
export function loadRealAuditEvidence({ path, nowSec = Date.now() / 1000 } = {}) {
  const { rows, malformed, missing } = readJsonl(path); const quarantine = [];
  const opened = new Map(), closedSeen = new Set(); const trades = [], blocked = [], open_trades = [];
  for (const row of rows) {
    const r = row.r; if (!r?.type || !r.timestamp) { quarantine.push({ line: row.line, reason: 'INVALID_ROW' }); continue; }
    if (Date.parse(r.timestamp) / 1000 > nowSec + FUTURE_TOLERANCE_SEC) { quarantine.push({ line: row.line, reason: 'FUTURE_TIMESTAMP' }); continue; }
    if (r.account_login != null && Number(r.account_login) !== REAL_EXPECTED.login) { quarantine.push({ line: row.line, reason: 'ACCOUNT_CONTAMINATION', account_login: r.account_login }); continue; }
    if (r.type === 'OPENED') opened.set(r.signal_id, r);
    else if (r.type === 'SKIPPED' && r.signal_id) blocked.push({ signal_id: r.signal_id, provenance: REAL_PROVENANCE_FORWARD, decision_time_utc: r.timestamp, reason: r.reason ?? 'UNKNOWN', guard: r.guard ?? null, model: r.model ?? null, side: r.side ?? null });
    else if (r.type === 'CLOSED') {
      const key = `${r.ticket ?? r.position_id ?? r.signal_id}`; if (closedSeen.has(key)) { quarantine.push({ line: row.line, reason: 'DUPLICATE_CLOSE', ticket: key }); continue; } closedSeen.add(key);
      const o = opened.get(r.signal_id) ?? null; if (o && Date.parse(r.timestamp) < Date.parse(o.timestamp)) { quarantine.push({ line: row.line, reason: 'CLOCK_INVERSION_CLOSE_BEFORE_OPEN' }); continue; }
      const openedRec = o ? { event_time_utc: o.timestamp, fill_price: o.execution_price ?? null, requested_price: o.requested_price ?? null, slippage: o.slippage ?? null, spread: o.spread ?? null, entry_drift: o.entry_drift ?? null, structural_stop: o.structural_stop ?? null, initial_structural_risk: o.initial_structural_risk ?? null, model: o.model ?? null, side: o.side ?? null, calculated_at: o.calculated_at ?? null, protection: o.protection ?? null, regime: o.regime ?? null } : null;
      const closedRec = { ticket: r.ticket, position_id: r.position_id, signal_id: r.signal_id, net_pnl: r.net_pnl, gross_pnl: r.gross_pnl, commission: r.commission, swap: r.swap, exit_price: r.exit_price, exit_time: r.exit_time ?? r.timestamp, event_time_utc: r.timestamp, exit_reason: r.exit_reason, open_price: r.open_price, open_time: r.open_time, initial_structural_risk: r.initial_structural_risk, mfe_usd: r.mfe_usd, mae_usd: r.mae_usd, model: r.model, side: r.side, protection: null };
      trades.push(normalizeTrade({ cohort: 'REAL', provenance: REAL_PROVENANCE_FORWARD, signal: null, opened: openedRec, closed: closedRec }));
    }
  }
  for (const [sid, o] of opened) if (!trades.some((t) => t.signal_id === sid)) open_trades.push({ signal_id: sid, provenance: REAL_PROVENANCE_FORWARD, opened_at: o.timestamp, side: o.side ?? null, status: 'OPEN_NOT_COMPLETED' });
  return { source: path, missing, integrity: { malformed_lines: malformed, malformed_count: malformed.length, quarantined: quarantine, quarantined_count: quarantine.length, ok: quarantine.length === 0 && malformed.length === 0 }, trades, open_trades, blocked_signals: blocked };
}

/** Provenance filter used by every gate: only the declared forward provenance counts; BACKFILL/HISTORICAL_REPLAY/TEST never do. */
export function gateEligible(trades) { return trades.filter((t) => t.gate_eligible && !NEVER_GATE_PROVENANCE.includes(t.provenance) && t.provenance === FORWARD_DEMO); }
export function splitByProvenance(items) { const m = {}; for (const it of items) m[it.provenance ?? 'MISSING'] = (m[it.provenance ?? 'MISSING'] ?? 0) + 1; return m; }
