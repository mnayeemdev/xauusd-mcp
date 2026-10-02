/**
 * V16 EXECUTION TIMING -- pure clock model, quote tracker and timing checks (RESEARCH ONLY; no order code; no imports).
 * Clocks are never mixed (V16_PREREGISTRATION §2):
 *   broker clock (MT5 time_msc, bar times) -> market-event identity, ordering, broker-internal consistency;
 *   monotonic clock (performance.now)      -> every elapsed duration (signal age, quote age);
 *   PC wall clock (UTC)                    -> human-readable timestamps and the clock MONITOR only, never a decision input.
 * There is no application clock offset anywhere in this file.
 */
export const CONTRACT = 'timing-v16-1';
export const MAX_EXECUTION_SIGNAL_AGE_MS = 6000; // owner-defined execution tolerance; NOT an entry, NOT a BUY/SELL, NOT a gap-fill assumption
export const DELAY_SCENARIOS_S = Object.freeze([0, 1, 2, 3, 4, 5, 6]); // owner's execution-tolerance test scenarios (not strategies)
export const BEYOND_SCENARIOS_S = Object.freeze([8]); // exercises the "> 6 s" rule only
export const POLL_INTERVAL_MS = 250; // measurement setting of the read-only quote poller (not a decision threshold)
export const BAR_SEC = 300;
export const UNAVAILABLE = 'UNAVAILABLE';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r3 = (x) => (fin(x) ? Math.round(x * 1000) / 1000 : null);

/** Tick identity on the broker clock: (time_msc, bid, ask). */
export const tickId = (t) => (t && fin(t.time_msc) ? `${t.time_msc}|${t.bid}|${t.ask}` : null);

// ---------------- quote tracker (continuous read-only polling) ----------------
export function initTracker() { return { polls: 0, failed_polls: 0, last_ok_request_mono: null, current: null }; }
/**
 * Fold one completed read-only poll into the tracker. poll = { requestMono, receiveMono, receiveWallMs, ok, tick }. Pure.
 * A tick first returned by this poll "appeared after" the request time of the last SUCCESSFUL poll that returned an older tick
 * (conservative bound); with no such poll the bound is null -> quote age UNAVAILABLE (fail closed).
 */
export function observePoll(state, poll) {
  const s = { ...state, polls: state.polls + 1 };
  const t = poll && poll.ok ? poll.tick : null;
  if (!t || !fin(t.time_msc)) { s.failed_polls = state.failed_polls + 1; return s; }
  const id = tickId(t); const cur = state.current;
  if (!cur || cur.tick_id !== id) {
    s.current = { tick: { time_msc: t.time_msc, bid: t.bid, ask: t.ask, flags: t.flags ?? null }, tick_id: id, first_seen_mono: poll.receiveMono, first_seen_wall_ms: poll.receiveWallMs ?? null, appeared_after_mono: state.last_ok_request_mono, received_mono: poll.receiveMono, received_wall_ms: poll.receiveWallMs ?? null, prev_time_msc: cur ? cur.tick.time_msc : null, order_error: cur != null && t.time_msc < cur.tick.time_msc };
  } else s.current = { ...cur, received_mono: poll.receiveMono, received_wall_ms: poll.receiveWallMs ?? null };
  s.last_ok_request_mono = poll.requestMono;
  return s;
}
/** The quote as of now (everything in it was received before the caller's decision instant). null when nothing was received. */
export function quoteSnapshot(state, symbol = 'XAUUSDm') {
  const c = state?.current; if (!c) return null; const { bid, ask } = c.tick;
  return { contract: CONTRACT, symbol, bid, ask, mid: fin(bid) && fin(ask) ? r3((bid + ask) / 2) : null, spread: fin(bid) && fin(ask) ? r3(ask - bid) : null, quote_timestamp_ms: c.tick.time_msc, quote_timestamp_utc: fin(c.tick.time_msc) ? new Date(c.tick.time_msc).toISOString() : null, tick_flags: c.tick.flags, tick_id: c.tick_id, first_seen_mono: c.first_seen_mono, first_seen_wall_ms: c.first_seen_wall_ms, appeared_after_mono: c.appeared_after_mono, received_mono: c.received_mono, received_wall_ms: c.received_wall_ms, prev_time_msc: c.prev_time_msc, order_error: c.order_error, tick_sequence: UNAVAILABLE, data_source: 'MT5 symbol_info_tick via the read-only shadow reader (polled)' };
}

// ---------------- timing checks (T1-T6 of the pre-registration) ----------------
const STALE = 'WAIT_STALE_DATA', BROKER = 'WAIT_BROKER_UNSAFE', EXPIRED = 'WAIT_SIGNAL_EXPIRED';
/**
 * signal: { observed_mono, observed_wall_ms, bar_time }; quote: quoteSnapshot(); decision: { mono, wallMs };
 * bars: { last_closed_open, latest_open } (broker seconds, from the bars used by this decision).
 * Returns every failed check in pre-registered order; `primary` decides; the clock monitor is never a decision input.
 */
export function checkTiming({ signal, quote, decision, bars, maxAgeMs = MAX_EXECUTION_SIGNAL_AGE_MS }) {
  const R = []; const add = (code, state) => R.push({ code, state });
  const sm = signal?.observed_mono, dm = decision?.mono;
  // T1 presence
  if (!fin(sm)) add('MISSING_TIMESTAMP:SIGNAL_OBSERVED', STALE);
  if (!fin(dm)) add('MISSING_TIMESTAMP:DECISION', STALE);
  if (!quote) add('MISSING_QUOTE', STALE);
  else { if (!fin(quote.quote_timestamp_ms)) add('MISSING_TIMESTAMP:QUOTE', STALE); if (!fin(quote.received_mono) || !fin(quote.first_seen_mono)) add('MISSING_TIMESTAMP:QUOTE_RECEIPT', STALE); }
  if (!bars || !fin(bars.last_closed_open) || !fin(bars.latest_open)) add('MISSING_TIMESTAMP:BARS', STALE);
  // T2 monotonic order (impossible relations only)
  if (fin(sm) && fin(dm) && sm > dm) add('CLOCK_OR_DATA_ERROR:SIGNAL_AFTER_DECISION', STALE);
  if (quote && fin(dm) && fin(quote.received_mono) && quote.received_mono > dm) add('CLOCK_OR_DATA_ERROR:QUOTE_RECEIVED_AFTER_DECISION', STALE);
  if (quote && fin(quote.appeared_after_mono) && fin(quote.first_seen_mono) && quote.appeared_after_mono > quote.first_seen_mono) add('CLOCK_OR_DATA_ERROR:QUOTE_RECEIPT_ORDER', STALE);
  // T3 broker-internal consistency (broker clock only)
  if (quote && fin(quote.quote_timestamp_ms) && bars && fin(bars.last_closed_open) && quote.quote_timestamp_ms < bars.last_closed_open * 1000) add('CLOCK_OR_DATA_ERROR:QUOTE_PREDATES_DECISION_BARS', STALE);
  if (quote && fin(quote.quote_timestamp_ms) && bars && fin(bars.latest_open) && quote.quote_timestamp_ms >= (bars.latest_open + 2 * BAR_SEC) * 1000) add('CLOCK_OR_DATA_ERROR:QUOTE_AHEAD_OF_BROKER_BARS', STALE);
  if (quote && quote.order_error) add('CLOCK_OR_DATA_ERROR:QUOTE_OUT_OF_ORDER', STALE);
  // T4 signal age (monotonic)
  const signalAge = fin(sm) && fin(dm) ? dm - sm : null;
  if (signalAge != null && signalAge >= 0 && signalAge > maxAgeMs) add('SIGNAL_AGE_ABOVE_EXECUTION_TOLERANCE', EXPIRED);
  // T5 quote age (monotonic, conservative upper bound)
  const quoteAge = quote && fin(dm) && fin(quote.appeared_after_mono) ? dm - quote.appeared_after_mono : null;
  const quoteAgeLower = quote && fin(dm) && fin(quote.first_seen_mono) ? dm - quote.first_seen_mono : null;
  if (quote && quoteAge == null) add('QUOTE_AGE_UNAVAILABLE', STALE);
  else if (quoteAge != null && quoteAge > maxAgeMs) add('QUOTE_AGE_ABOVE_EXECUTION_TOLERANCE', STALE);
  // T6 bid / ask integrity (fail closed, never repaired)
  if (quote) { const { bid, ask } = quote;
    if (!fin(bid)) add('BID_UNAVAILABLE', BROKER); else if (!(bid > 0)) add('BID_NOT_POSITIVE', BROKER);
    if (!fin(ask)) add('ASK_UNAVAILABLE', BROKER); else if (!(ask > 0)) add('ASK_NOT_POSITIVE', BROKER);
    if (fin(bid) && fin(ask) && ask < bid) add('ASK_BELOW_BID_SPREAD_NEGATIVE', BROKER); }
  const primary = R[0] ?? null;
  const firstWall = quote ? (fin(quote.first_seen_wall_ms) ? quote.first_seen_wall_ms : quote.received_wall_ms) : null; const wallMinusBroker = fin(firstWall) && fin(quote?.quote_timestamp_ms) ? firstWall - quote.quote_timestamp_ms : null;
  const wallVsMono = fin(signal?.observed_wall_ms) && fin(decision?.wallMs) && fin(sm) && fin(dm) ? r3((decision.wallMs - signal.observed_wall_ms) - (dm - sm)) : null;
  return { ok: !primary, primary: primary?.code ?? null, gate_state: primary?.state ?? null, reasons: R.map((x) => x.code), signal_age_ms: r3(signalAge), quote_age_ms: r3(quoteAge), quote_age_lower_ms: r3(quoteAgeLower), max_age_ms: maxAgeMs,
    clock_monitor: { wall_minus_broker_ms: wallMinusBroker, wall_minus_mono_over_signal_ms: wallVsMono, note: 'monitor only: PC wall clock vs broker clock mixes PC drift and transport delay; never a decision input' } };
}

/** Execution price: BUY at the current ask, SELL at the current bid. Never the mid, never the old signal price. */
export function executionPrice(side, quote) {
  if (side === 'BUY') return { price: quote?.ask ?? null, source: 'ASK' };
  if (side === 'SELL') return { price: quote?.bid ?? null, source: 'BID' };
  return { price: null, source: null };
}
