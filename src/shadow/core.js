/**
 * FORWARD SHADOW EVIDENCE -- pure core (Stage 11C). No I/O, no timers, no engine, no bridge.
 * Everything here takes explicit "now" and explicit bar arrays and refuses anything that is not complete
 * at the decision time (anti-lookahead is enforced structurally, not by convention).
 */
import { SCHEMA_VERSION, FRESHNESS_WINDOW_SEC, BACKFILL_MAX_AGE_SEC, observationId, outcomeId } from './schema.js';

export const TF_SEC = Object.freeze({ '5m': 300, '15m': 900, '30m': 1800, '1H': 3600 });
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(4));

/** Bars complete at `nowSec`: bar.time + tfSec <= nowSec. Input bars may include the forming bar; it is dropped. */
export function completedBars(bars, tfSec, nowSec) { return (bars ?? []).filter((b) => Number.isFinite(b?.time) && b.time + tfSec <= nowSec).sort((a, b) => a.time - b.time); }

export function atr14(bars) { if (!bars || bars.length < 15) return null; let s = 0; for (let i = bars.length - 14; i < bars.length; i++) { const b = bars[i], p = bars[i - 1]; s += Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)); } return s / 14; }
export function realizedVol(bars, n = 20) { if (!bars || bars.length < n + 1) return null; const r = []; for (let i = bars.length - n; i < bars.length; i++) r.push(Math.log(bars[i].close / bars[i - 1].close)); const m = r.reduce((a, b) => a + b, 0) / n; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / n); }
/** z-score of the last completed bar's log return against the trailing `win` returns before it. */
export function lastReturnZ(bars, win = 96) { if (!bars || bars.length < win + 2) return null; const rets = []; for (let i = bars.length - win - 1; i < bars.length; i++) rets.push(Math.log(bars[i].close / bars[i - 1].close)); const last = rets.pop(); const m = rets.reduce((a, b) => a + b, 0) / rets.length; const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length); return sd > 0 ? { z: r4((last - m) / sd), ret: r4(last), sigma: sd } : null; }

/** Provenance from timing alone: FORWARD_LIVE only inside the freshness window; BACKFILL up to 24 h; null (skip) beyond. Replay/test callers pass their own provenance explicitly. */
export function provenanceFor({ barCloseSec, nowSec, mode = 'LIVE' }) {
  if (mode === 'REPLAY') return 'HISTORICAL_REPLAY'; if (mode === 'TEST') return 'TEST';
  const age = nowSec - barCloseSec; if (age < 0) return null; if (age <= FRESHNESS_WINDOW_SEC) return 'FORWARD_LIVE'; if (age <= BACKFILL_MAX_AGE_SEC) return 'BACKFILL'; return null;
}

/** Cross-asset block for one symbol: only a bar that is complete at the decision time is used; otherwise null (missingness recorded, never filled). */
export function crossAssetSnapshot(sym, bars15, decisionSec) {
  const done = completedBars(bars15, 900, decisionSec); if (!done.length) return { symbol: sym, available: false, reason: 'NO_COMPLETED_BAR' };
  const last = done.at(-1); if (last.time + 900 < decisionSec - 900) return { symbol: sym, available: false, reason: 'STALE', last_bar_close_time: last.time + 900 };
  const z = lastReturnZ(done, 96);
  return { symbol: sym, available: true, bar_time: last.time, bar_close_time: last.time + 900, close: last.close, z_96: z?.z ?? null, ret_15m: z?.ret ?? null };
}

/** SC1 trigger (pure): silver z <= threshold on the completed 15m bar closing exactly at decisionSec. */
export function evaluateSilverLead(candidate, silver15, decisionSec) {
  const done = completedBars(silver15, 900, decisionSec); const last = done.at(-1);
  if (!last || last.time + 900 !== decisionSec) return { triggered: false, reason: 'NO_BAR_CLOSING_AT_DECISION_TIME' };
  if (done.length < candidate.trigger.zscore_window_bars + 1) return { triggered: false, reason: 'INSUFFICIENT_HISTORY' };
  const z = lastReturnZ(done, candidate.trigger.zscore_window_bars); if (!z) return { triggered: false, reason: 'SIGMA_ZERO' };
  return { triggered: z.z <= candidate.trigger.z_threshold, z: z.z, ret: z.ret, bar_time: last.time };
}

/** Builds the CANDLE_5M observation. `prod` is the read-only production snapshot (may be null: recorded as missing). */
export function buildCandleObservation({ nowSec, barTime, bars5, bars15, bars30, bars60, tick, cross = {}, prod = null, news = null, provenance, source = 'shadow-observer' }) {
  const b5 = completedBars(bars5, 300, nowSec); const bar = b5.find((b) => b.time === barTime); if (!bar) throw new Error('BAR_NOT_COMPLETED_OR_MISSING');
  const decisionSec = barTime + 300; if (decisionSec > nowSec) throw new Error('FORMING_CANDLE');
  const hist5 = b5.filter((b) => b.time <= barTime); const h15 = completedBars(bars15, 900, decisionSec), h30 = completedBars(bars30, 1800, decisionSec), h60 = completedBars(bars60, 3600, decisionSec);
  const feedAge = tick && Number.isFinite(tick.time) ? Math.round(nowSec - tick.time) : null;
  const o = {
    schema_version: SCHEMA_VERSION, record: 'observation', type: 'CANDLE_5M', candidate_id: null, observation_id: null, provenance, source,
    created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: new Date(decisionSec * 1000).toISOString(), symbol: 'XAUUSDm', feed: 'Exness MT5', timeframe: '5m', bar_time: barTime, bar_close_time: decisionSec,
    session: { utc_date: new Date(barTime * 1000).toISOString().slice(0, 10), utc_hour: new Date(barTime * 1000).getUTCHours(), weekday_utc: new Date(barTime * 1000).getUTCDay() },
    market: { bar: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume ?? null }, atr14_5m: r4(atr14(hist5)), atr14_15m: r4(atr14(h15)), rv20_5m: r4(realizedVol(hist5, 20)), last_15m: h15.at(-1) ? { time: h15.at(-1).time, close: h15.at(-1).close } : null, last_30m: h30.at(-1) ? { time: h30.at(-1).time, close: h30.at(-1).close } : null, last_1h: h60.at(-1) ? { time: h60.at(-1).time, close: h60.at(-1).close } : null, spread_usd: tick && Number.isFinite(tick.ask) && Number.isFinite(tick.bid) ? r4(tick.ask - tick.bid) : null, feed_age_sec: feedAge, feed_state: feedAge == null ? 'UNKNOWN' : feedAge > 90 ? 'STALE' : 'FRESH' },
    cross_asset: Object.fromEntries(Object.entries(cross).map(([sym, bars]) => [sym, crossAssetSnapshot(sym, bars, decisionSec)])),
    production: prod ? { available: true, ...prod } : { available: false, reason: 'NO_PRODUCTION_RECORD_FOR_BAR' },
    news: news ?? { available: false },
    hypothesis_side: 'NONE',
  };
  o.observation_id = observationId({ type: o.type, candidate_id: null, symbol: o.symbol, timeframe: o.timeframe, bar_time: o.bar_time });
  return o;
}

export function buildTriggerObservation({ candidate, nowSec, decisionSec, barTime, provenance, payload, side }) {
  const o = { schema_version: SCHEMA_VERSION, record: 'observation', type: 'CANDIDATE_TRIGGER', candidate_id: candidate.id, candidate_version: candidate.version, observation_id: null, provenance, source: 'shadow-observer', created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: new Date(decisionSec * 1000).toISOString(), symbol: candidate.outcome_symbol, feed: 'Exness MT5', timeframe: candidate.timeframe, bar_time: barTime, bar_close_time: decisionSec, hypothesis_side: side, payload, execution_authority: 'NONE' };
  o.observation_id = observationId({ type: o.type, candidate_id: candidate.id, symbol: o.symbol, timeframe: o.timeframe, bar_time: o.bar_time }); return o;
}

/**
 * Outcome for one observation and one pre-declared horizon. Refuses to label before the horizon has fully
 * elapsed (requires the bar that closes at horizon end to be complete at nowSec). Uses only bars after the
 * decision time. Returns null when not yet labelable.
 */
export function labelOutcome({ observation, horizonKey, horizonBars, tfSec, bars, nowSec, side = null, refPrice = null, atr = null, geometry = null, provenance }) {
  const decisionSec = Date.parse(observation.decision_time_utc) / 1000; const horizonEnd = decisionSec + horizonBars * tfSec;
  if (nowSec < horizonEnd) return null;
  const path = completedBars(bars, tfSec, Math.min(nowSec, horizonEnd)).filter((b) => b.time >= decisionSec && b.time + tfSec <= horizonEnd);
  if (path.length < horizonBars) return { schema_version: SCHEMA_VERSION, record: 'outcome', outcome_id: outcomeId(observation.observation_id, horizonKey), observation_id: observation.observation_id, horizon: horizonKey, provenance, labeled_at_utc: new Date(nowSec * 1000).toISOString(), horizon_end_time: horizonEnd, last_bar_time_used: path.at(-1)?.time ?? decisionSec, status: 'INCOMPLETE_PATH', bars_expected: horizonBars, bars_found: path.length };
  const p0 = refPrice ?? path[0].open; const dir = side === 'SELL' ? -1 : side === 'BUY' ? 1 : 0; const end = path.at(-1).close;
  let hi = -Infinity, lo = Infinity, first = null, geomTouch = null, geomBar = null;
  for (const b of path) { hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); if (dir !== 0 && atr) { const fav = dir > 0 ? (b.high - p0) / atr : (p0 - b.low) / atr, adv = dir > 0 ? (p0 - b.low) / atr : (b.high - p0) / atr; if (first == null) { if (fav >= 0.5 && adv >= 0.5) first = 'BOTH'; else if (fav >= 0.5) first = 'FAV'; else if (adv >= 0.5) first = 'ADV'; } } if (geometry && geomTouch == null) { const tp = dir > 0 ? b.high >= geometry.tp1 : b.low <= geometry.tp1, sl = dir > 0 ? b.low <= geometry.stop_loss : b.high >= geometry.stop_loss; if (tp && sl) geomTouch = 'BOTH_SAME_BAR'; else if (tp) geomTouch = 'TP1'; else if (sl) geomTouch = 'SL'; if (geomTouch) geomBar = b.time; } }
  const move = end - p0; const out = { schema_version: SCHEMA_VERSION, record: 'outcome', outcome_id: outcomeId(observation.observation_id, horizonKey), observation_id: observation.observation_id, horizon: horizonKey, provenance, labeled_at_utc: new Date(nowSec * 1000).toISOString(), horizon_end_time: horizonEnd, last_bar_time_used: path.at(-1).time, status: 'LABELED', ref_price: p0, end_close: end, move_usd: r4(move), move_atr: atr ? r4(move / atr) : null, side_signed_move_usd: dir ? r4(dir * move) : null, side_signed_move_atr: dir && atr ? r4(dir * move / atr) : null, mfe_usd: dir ? r4(dir > 0 ? hi - p0 : p0 - lo) : null, mae_usd: dir ? r4(dir > 0 ? p0 - lo : hi - p0) : null, first_touch_05atr: first, high: hi, low: lo };
  if (geometry) { const risk = Math.abs(geometry.entry - geometry.stop_loss); const reward = Math.abs(geometry.tp1 - geometry.entry); out.geometry = { touch: geomTouch ?? 'NONE', touch_bar_time: geomBar, r_multiple: geomTouch === 'TP1' ? r4(reward / risk) : geomTouch === 'SL' ? -1 : geomTouch === 'BOTH_SAME_BAR' ? null : r4(dir * (end - geometry.entry) / risk), risk_usd: r4(risk), reward_usd: r4(reward) }; }
  return out;
}


// ======================= SILVER N2 + DOM FORWARD OBSERVATION (2026-10-01, MEASURE ONLY) =======================
export const SILVER_N2 = Object.freeze({ threshold_atr: 0.75, stale_sec: 600, mom_bars: 6 });
export const HYP_COSTS = Object.freeze({ normal: { spread: 0.24, slip: 0.10 }, stress: { spread: 0.60, slip: 0.20 } });
export const HYP_MILESTONES = Object.freeze([1, 1.25, 1.5, 1.7, 2]);
export const HYP_LABEL = 'HYPOTHETICAL_NOT_EXECUTED';

/**
 * Silver N2 snapshot for one production signal (pure). silver5 = XAGUSDm 5m bars (may include the forming bar);
 * decisionSec = signal bar close; side = production side. lag = 0 uses the bar with the SAME open time as the signal bar
 * (complete at the decision instant); lag = 1 uses the previous completed bar (realistic-latency variant).
 * Only bars with time + 300 <= decisionSec are ever used. Missing/stale -> state NA (recorded, never substituted).
 */
export function silverN2Snapshot(silver5, decisionSec, side, { lag = 0, threshold = SILVER_N2.threshold_atr } = {}) {
  const done = completedBars(silver5, 300, decisionSec); const sgn = side === 'BUY' ? 1 : side === 'SELL' ? -1 : 0; const timing = lag ? 'LAG_1' : 'SAME_BAR';
  const idx = done.length - 1 - lag; if (idx < SILVER_N2.mom_bars + 14) return { available: false, reason: done.length ? 'INSUFFICIENT_HISTORY' : 'NO_COMPLETED_BAR', state: 'NA', timing };
  const bar = done[idx]; if (decisionSec - (bar.time + 300) > SILVER_N2.stale_sec + lag * 300) return { available: false, reason: 'STALE', state: 'NA', timing, last_bar_close_time: bar.time + 300 };
  const atr = atr14(done.slice(0, idx + 1)); if (!atr) return { available: false, reason: 'ATR_UNAVAILABLE', state: 'NA', timing };
  const mom6 = (bar.close - done[idx - SILVER_N2.mom_bars].close) / atr; const signed = sgn * mom6;
  const state = sgn === 0 ? 'NA' : signed >= threshold ? 'CONFIRMED' : signed <= -threshold ? 'CONFLICT' : 'NEUTRAL';
  return { available: true, timing, same_open_as_signal: lag === 0 && bar.time === decisionSec - 300, bar_time: bar.time, bar_close_time: bar.time + 300, close: bar.close, atr14: r4(atr), mom6_atr: r4(mom6), signed_mom6_atr: r4(signed), silver_direction: mom6 > 0 ? 'UP' : mom6 < 0 ? 'DOWN' : 'FLAT', threshold_atr: threshold, state };
}

/** Hypothetical 1.70R geometry from the production signal (never sent anywhere). */
export function hypotheticalGeometry(sig) {
  const entry = Number(sig.entry), sl = Number(sig.stop_loss); if (!Number.isFinite(entry) || !Number.isFinite(sl) || entry === sl) return null;
  const risk = Math.abs(entry - sl); const dir = sig.side === 'BUY' ? 1 : -1;
  return { label: HYP_LABEL, side: sig.side, entry, stop_loss: sl, risk_usd: r4(risk), target_170r: r4(entry + dir * 1.7 * risk), production_tp1: Number.isFinite(sig.tp1) ? sig.tp1 : null, production_tp2: Number.isFinite(sig.tp2) ? sig.tp2 : null, production_rr: Number.isFinite(sig.rr) ? sig.rr : null };
}

/** DOM snapshot (pure) from a market-book level list [{type:'BID'|'ASK', price, volume}]; prev = previous snapshot for change metrics. */
export function domSnapshot(book, { tick = null, prev = null, nowSec = null } = {}) {
  if (!book || !book.ok || !Array.isArray(book.levels)) return { available: false, reason: book?.error ?? 'NO_BOOK', forward_only_data: true, measure_only: true };
  const bids = book.levels.filter((l) => l.type === 'BID'), asks = book.levels.filter((l) => l.type === 'ASK'); if (!bids.length || !asks.length) return { available: false, reason: 'EMPTY_BOOK', forward_only_data: true, measure_only: true, level_count: book.levels.length };
  const bidDepth = bids.reduce((a, l) => a + (l.volume ?? 0), 0), askDepth = asks.reduce((a, l) => a + (l.volume ?? 0), 0); const bestBid = Math.max(...bids.map((l) => l.price)), bestAsk = Math.min(...asks.map((l) => l.price));
  const total = bidDepth + askDepth; const prevTotal = prev?.available ? prev.bid_depth + prev.ask_depth : null;
  return { available: true, forward_only_data: true, measure_only: true, snapshot_time: nowSec, best_bid: bestBid, best_ask: bestAsk, spread: r4(bestAsk - bestBid), tick_bid: tick?.bid ?? null, tick_ask: tick?.ask ?? null, bid_depth: bidDepth, ask_depth: askDepth, imbalance: total ? r4((bidDepth - askDepth) / total) : null, level_count: book.levels.length, bid_levels: bids.length, ask_levels: asks.length, depth_change_vs_prev: prevTotal != null ? r4((total - prevTotal) / Math.max(1, prevTotal)) : null, liquidity_withdrawal: prevTotal != null ? total <= 0.5 * prevTotal : null, book_time: book.time ?? null };
}

/** Observation record for SC3 (one per production signal). cross_asset.XAGUSDm_5m carries the same-bar snapshot so the schema's anti-future check applies. */
export function buildSilverN2Observation({ candidate, nowSec, signal, provenance, silver5, tick = null, bars5 = [], news = null, dom = null, prodSnapshot = null, execution = null }) {
  const barTime = signal.signal_bar_time; const decisionSec = barTime + 300; const same = silverN2Snapshot(silver5, decisionSec, signal.side, { lag: 0 }); const lag1 = silverN2Snapshot(silver5, decisionSec, signal.side, { lag: 1 });
  const hist5 = completedBars(bars5, 300, decisionSec); const atr = atr14(hist5); const spreadNow = tick && Number.isFinite(tick.bid) && Number.isFinite(tick.ask) ? r4(tick.ask - tick.bid) : null;
  const o = { schema_version: SCHEMA_VERSION, record: 'observation', type: 'CANDIDATE_TRIGGER', candidate_id: candidate.id, candidate_version: candidate.version, observation_id: null, provenance, source: 'shadow-observer', created_at_utc: new Date(nowSec * 1000).toISOString(), decision_time_utc: new Date(decisionSec * 1000).toISOString(), symbol: 'XAUUSDm', feed: 'Exness MT5', timeframe: '5m', bar_time: barTime, bar_close_time: decisionSec, hypothesis_side: signal.side, execution_authority: 'NONE', measure_only: true,
    cross_asset: { XAGUSDm_5m: same.available ? { symbol: 'XAGUSDm', available: true, bar_time: same.bar_time, bar_close_time: same.bar_close_time, close: same.close } : { symbol: 'XAGUSDm', available: false, reason: same.reason } },
    payload: { signal_id: signal.signal_id, side: signal.side, model: signal.model ?? null, quality: signal.quality ?? null, engine_created_at: signal.created_at ?? null, xauusd_price_at_signal: Number.isFinite(signal.entry) ? signal.entry : null, xauusd_last_close: hist5.at(-1)?.close ?? null, xagusd_price: same.available ? same.close : null, silver_same_bar: same, silver_lag_1: lag1, silver_confirmation_state: same.state, silver_divergence: same.available ? same.state === 'CONFLICT' : null, silver_available_at_decision: !!same.available, hypothetical: hypotheticalGeometry(signal), context: { atr14_5m: r4(atr), spread_now_usd: spreadNow, session_utc_hour: new Date(barTime * 1000).getUTCHours(), production: prodSnapshot, news, execution }, dom },
  };
  o.observation_id = observationId({ type: o.type, candidate_id: candidate.id, symbol: o.symbol, timeframe: o.timeframe, bar_time: o.bar_time }); return o;
}

/**
 * Hypothetical EXIT_F outcome (pure, HYPOTHETICAL_NOT_EXECUTED). Uses only completed gold 5m bars after the decision.
 * Labels when the open path (structural stop only) has resolved or the 288-bar horizon has elapsed; returns null before that.
 */
export function labelHypothetical({ observation, bars5, nowSec, horizonBars = 288, provenance }) {
  const g = observation.payload?.hypothetical; if (!g) return null; const decisionSec = Date.parse(observation.decision_time_utc) / 1000; const horizonEnd = decisionSec + horizonBars * 300;
  const path = completedBars(bars5, 300, nowSec).filter((b) => b.time >= decisionSec && b.time + 300 <= horizonEnd); if (!path.length) return null;
  const dir = g.side === 'BUY' ? 1 : -1; const risk = Math.abs(g.entry - g.stop_loss);
  const run = (costs, tpPrice) => { const sp = costs.spread, slip = costs.slip; const fill = dir > 0 ? g.entry + sp : g.entry; const brokerDist = 1.5 * risk + sp; let mfe = 0, mae = 0, exit = null, exitBar = null, pnl = 0; const reach = Object.fromEntries(HYP_MILESTONES.map((m) => [m, null]));
    for (const b of path) { const adv = dir > 0 ? fill - b.low : (b.high + sp) - fill, fav = dir > 0 ? b.high - fill : fill - (b.low + sp); if (adv > mae) mae = adv; if (adv >= brokerDist) { exit = 'BROKER_SL'; pnl = -brokerDist - slip; exitBar = b.time; break; } if (tpPrice != null && (dir > 0 ? b.high >= tpPrice : (b.low + sp) <= tpPrice)) { if (fav > mfe) mfe = fav; exit = 'TARGET_170R'; pnl = Math.abs(tpPrice - fill) - slip; exitBar = b.time; break; } if (fav > mfe) mfe = fav; for (const m of HYP_MILESTONES) if (reach[m] == null && mfe >= m * risk) reach[m] = b.time; if (dir > 0 ? b.close < g.stop_loss : b.close > g.stop_loss) { exit = 'THESIS_INVALIDATION'; pnl = dir * ((dir > 0 ? b.close : b.close + sp) - fill) - slip; exitBar = b.time; break; } }
    const resolved = exit != null; const horizonElapsed = path.length >= horizonBars; if (!resolved && !horizonElapsed) return { resolved: false }; if (!resolved) { const last = path.at(-1); exit = 'HORIZON'; pnl = dir * ((dir > 0 ? last.close : last.close + sp) - fill) - slip; exitBar = last.time; }
    return { resolved: true, exit, exit_bar_time: exitBar, duration_bars: Math.round((exitBar - decisionSec) / 300) + 1, exit_r: r4(pnl / risk), pnl_usd: r4(pnl), mfe_r: r4(mfe / risk), mae_r: r4(mae / risk), reach, cost_usd: r4(sp + slip) }; };
  const open = run(HYP_COSTS.normal, null); if (!open.resolved) return null; // the open path (structural stop only) decides when the record is final
  const normal = run(HYP_COSTS.normal, g.target_170r), stress = run(HYP_COSTS.stress, g.target_170r);
  const wrong = open.mfe_r < 0.5 && (open.exit === 'BROKER_SL' || open.exit === 'THESIS_INVALIDATION'); const bad = open.reach[1] == null;
  // the record is final once the open path resolved (no later bar can change it): effective horizon end = close of the resolving bar
  const resolvedEarly = open.exit !== 'HORIZON'; const effectiveEnd = resolvedEarly ? open.exit_bar_time + 300 : horizonEnd; const lastUsed = resolvedEarly ? open.exit_bar_time : path.at(-1).time;
  return { schema_version: SCHEMA_VERSION, record: 'outcome', outcome_id: outcomeId(observation.observation_id, 'hyp288'), observation_id: observation.observation_id, horizon: 'hyp288', provenance, labeled_at_utc: new Date(nowSec * 1000).toISOString(), horizon_end_time: effectiveEnd, nominal_horizon_end_time: horizonEnd, resolved_before_nominal_horizon: resolvedEarly, last_bar_time_used: lastUsed, status: 'LABELED', label: HYP_LABEL, executed: false, side: g.side, risk_usd: r4(risk), open_path: { exit: open.exit, mfe_r: open.mfe_r, mae_r: open.mae_r, reach_bar_time: open.reach, reach: Object.fromEntries(HYP_MILESTONES.map((m) => [m, open.reach[m] != null])), duration_bars: open.duration_bars }, wrong_direction: wrong, bad_entry: bad, hypothetical_normal_cost: { exit: normal.exit, exit_r: normal.exit_r, pnl_usd: normal.pnl_usd, duration_bars: normal.duration_bars, cost_usd: normal.cost_usd }, hypothetical_stress_cost: { exit: stress.exit, exit_r: stress.exit_r, pnl_usd: stress.pnl_usd, cost_usd: stress.cost_usd }, silver_state_same_bar: observation.payload?.silver_same_bar?.state ?? 'NA', silver_state_lag_1: observation.payload?.silver_lag_1?.state ?? 'NA' };
}
