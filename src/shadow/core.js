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
