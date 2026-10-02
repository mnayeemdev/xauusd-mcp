/**
 * V15 QUOTE DATA CONTRACT (quote-v15-1) -- pure, deterministic (RESEARCH ONLY; no order code; never guesses a value).
 * Spec: ../V15_PREREGISTRATION.md. Builds the quote record from a read-only MT5 tick, validates it (fail closed, never repaired),
 * Dependency-free so the forward-shadow runner can import it. The gate wrapper is in live_gate.mjs.
 */

export const CONTRACT = 'quote-v15-1'; export const UNAVAILABLE = 'UNAVAILABLE';
export const DATA_SOURCE = 'MT5 terminal symbol_info_tick via the read-only shadow reader (mt5/mt5_shadow_reader.py)';
export const TECHNICAL_SCENARIOS_MS = Object.freeze([100, 250, 500, 1000, 2000, 5000]); // measurement scenarios only, never approved parameters
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null); const has = (x) => num(x) != null;
const REASON_ORDER = ['QUOTE_TIMESTAMP_UNAVAILABLE', 'DECISION_TIMESTAMP_UNAVAILABLE', 'RECEIVE_TIMESTAMP_UNAVAILABLE', 'CLOCK_OFFSET_UNAVAILABLE', 'QUOTE_AGE_UNAVAILABLE', 'CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT', 'CLOCK_OR_DATA_ERROR:NEGATIVE_AGE', 'DECISION_BEFORE_RECEIPT', 'OUT_OF_ORDER', 'STALE_QUOTE', 'BID_UNAVAILABLE', 'ASK_UNAVAILABLE', 'BID_NOT_POSITIVE', 'ASK_NOT_POSITIVE', 'ASK_BELOW_BID', 'SPREAD_NEGATIVE'];
const BROKER_REASONS = new Set(['BID_UNAVAILABLE', 'ASK_UNAVAILABLE', 'BID_NOT_POSITIVE', 'ASK_NOT_POSITIVE', 'ASK_BELOW_BID', 'SPREAD_NEGATIVE']);

/** Clock offset (broker server clock - UTC) from live observations: median of (time_msc - received), rounded to 15 minutes. */
export function estimateServerOffsetMs(samples) { const d = samples.filter((s) => has(s.quote_timestamp_ms) && has(s.received_ms)).map((s) => s.quote_timestamp_ms - s.received_ms).sort((a, b) => a - b); if (!d.length) return null; const med = d[Math.floor(d.length / 2)]; const q = 15 * 60 * 1000; return Math.round(med / q) * q; }

/** Contract record from a reader tick response. Missing platform fields stay UNAVAILABLE; nothing is reconstructed. */
export function buildQuote({ symbol, tick, receivedMs, decisionMs, serverUtcOffsetMs = null, offsetSource = UNAVAILABLE, point = 0.001 }) {
  const bid = num(tick?.bid), ask = num(tick?.ask), qms = num(tick?.time_msc), qs = num(tick?.time);
  const q = { contract: CONTRACT, symbol, decision_timestamp_ms: num(decisionMs) ?? UNAVAILABLE, bid: bid ?? UNAVAILABLE, ask: ask ?? UNAVAILABLE, mid: bid != null && ask != null ? (bid + ask) / 2 : UNAVAILABLE,
    quote_timestamp_ms: qms ?? UNAVAILABLE, quote_timestamp_s: qs ?? UNAVAILABLE, quote_age_ms: UNAVAILABLE, spread: bid != null && ask != null ? Math.round((ask - bid) * 1e6) / 1e6 : UNAVAILABLE, spread_points: bid != null && ask != null ? Math.round((ask - bid) / point) : UNAVAILABLE,
    tick_sequence: UNAVAILABLE, tick_flags: num(tick?.flags) ?? UNAVAILABLE, data_source: DATA_SOURCE, data_received_timestamp_ms: num(receivedMs) ?? UNAVAILABLE, status: 'LIVE',
    clock: { quote_clock: 'BROKER_SERVER (time_msc)', decision_clock: 'PC_UTC (Date.now)', server_utc_offset_ms: num(serverUtcOffsetMs) ?? UNAVAILABLE, offset_source: offsetSource } };
  if (qms != null && has(decisionMs) && has(serverUtcOffsetMs)) q.quote_age_ms = decisionMs - (qms - serverUtcOffsetMs);
  return q;
}
/** Historical / legacy record: candles only. Quote age is UNAVAILABLE and is never reconstructed from candle timestamps. */
export function legacyQuote({ symbol = 'XAUUSDm', source }) { return { contract: CONTRACT, symbol, status: 'LEGACY_DATA', legacy_source: source, decision_timestamp_ms: UNAVAILABLE, bid: UNAVAILABLE, ask: UNAVAILABLE, mid: UNAVAILABLE, quote_timestamp_ms: UNAVAILABLE, quote_timestamp_s: UNAVAILABLE, quote_age_ms: UNAVAILABLE, spread: UNAVAILABLE, spread_points: UNAVAILABLE, tick_sequence: UNAVAILABLE, tick_flags: UNAVAILABLE, data_source: UNAVAILABLE, data_received_timestamp_ms: UNAVAILABLE, clock: { quote_clock: UNAVAILABLE, decision_clock: UNAVAILABLE, server_utc_offset_ms: UNAVAILABLE, offset_source: UNAVAILABLE } }; }

/** Validates a contract record. prev = last ACCEPTED quote (ordering / duplicates). maxAgeMs = freshness limit (null = not checked). */
export function validateQuote(q, { prev = null, maxAgeMs = null } = {}) {
  const r = []; const qt = num(q?.quote_timestamp_ms), dt = num(q?.decision_timestamp_ms), rt = num(q?.data_received_timestamp_ms), off = num(q?.clock?.server_utc_offset_ms), age = num(q?.quote_age_ms); const bid = num(q?.bid), ask = num(q?.ask);
  if (qt == null) r.push('QUOTE_TIMESTAMP_UNAVAILABLE'); if (dt == null) r.push('DECISION_TIMESTAMP_UNAVAILABLE'); if (rt == null) r.push('RECEIVE_TIMESTAMP_UNAVAILABLE'); if (off == null) r.push('CLOCK_OFFSET_UNAVAILABLE'); if (age == null) r.push('QUOTE_AGE_UNAVAILABLE');
  if (qt != null && rt != null && off != null && qt - off > rt) r.push('CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT');
  if (age != null && age < 0) r.push('CLOCK_OR_DATA_ERROR:NEGATIVE_AGE');
  if (dt != null && rt != null && dt < rt) r.push('DECISION_BEFORE_RECEIPT');
  const pq = num(prev?.quote_timestamp_ms); if (qt != null && pq != null && qt < pq) r.push('OUT_OF_ORDER');
  if (age != null && maxAgeMs != null && age > maxAgeMs) r.push('STALE_QUOTE');
  if (bid == null) r.push('BID_UNAVAILABLE'); if (ask == null) r.push('ASK_UNAVAILABLE'); if (bid != null && !(bid > 0)) r.push('BID_NOT_POSITIVE'); if (ask != null && !(ask > 0)) r.push('ASK_NOT_POSITIVE');
  if (bid != null && ask != null && ask < bid) r.push('ASK_BELOW_BID'); const sp = num(q?.spread); if (sp != null && sp < 0) r.push('SPREAD_NEGATIVE');
  const reasons = REASON_ORDER.filter((x) => r.includes(x)); const duplicate = !!(prev && qt != null && qt === pq && bid === num(prev.bid) && ask === num(prev.ask));
  const status = !reasons.length ? 'VALID' : reasons.length === 1 && reasons[0] === 'STALE_QUOTE' ? 'STALE' : 'INVALID_QUOTE';
  return { status, reasons, primary: reasons[0] ?? null, duplicate, quote_age_ms: age, gate_state: !reasons.length ? null : reasons.every((x) => BROKER_REASONS.has(x)) ? 'WAIT_BROKER_UNSAFE' : 'WAIT_STALE_DATA' };
}
/** Execution-side price: BUY = ask, SELL = bid. Never the mid. */
export function entryPrice(side, q) { const v = side === 'BUY' ? num(q?.ask) : side === 'SELL' ? num(q?.bid) : null; return v != null && v > 0 ? { price: v, source: side === 'BUY' ? 'ASK' : 'BID' } : null; }

