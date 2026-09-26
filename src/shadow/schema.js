/**
 * FORWARD SHADOW EVIDENCE -- schema (Stage 11C, 2026-09-26). OBSERVATION ONLY.
 *
 * Append-only, versioned records. Two record kinds share the envelope:
 *   observation  what was known at an exact time (market, cross-asset, production engine snapshot,
 *                news/shock/safety state, shadow-candidate trigger evaluations)
 *   outcome      what happened afterwards, written ONLY after the horizon elapsed, linked by observation_id;
 *                never modifies the observation
 *
 * Provenance (mandatory, closed vocabulary): FORWARD_LIVE (created by the live observer within the freshness
 * window after the candle closed), BACKFILL (created later than the freshness window for a candle the observer
 * missed), HISTORICAL_REPLAY (created by a replay over stored history), TEST (created by tests). Only
 * FORWARD_LIVE evidence counts toward the pre-declared forward gates.
 *
 * Nothing in this module can reach execution: it imports nothing from the engine or the bridge.
 */
import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 'shadow-1.0';
export const PROVENANCE = Object.freeze(['FORWARD_LIVE', 'BACKFILL', 'HISTORICAL_REPLAY', 'TEST']);
export const FORWARD_PROVENANCE = 'FORWARD_LIVE';
export const OBSERVATION_TYPES = Object.freeze(['CANDLE_5M', 'PRODUCTION_SIGNAL', 'NEWS_V2_EVENT', 'CANDIDATE_TRIGGER']);
export const FRESHNESS_WINDOW_SEC = 15 * 60; // an observation created later than this after the candle closed is BACKFILL, never FORWARD_LIVE
export const BACKFILL_MAX_AGE_SEC = 24 * 3600; // older candles are not backfilled at all

export function observationId({ type, candidate_id = null, symbol, timeframe, bar_time }) {
  return createHash('sha256').update(`${SCHEMA_VERSION}|${type}|${candidate_id ?? ''}|${symbol}|${timeframe}|${bar_time}`).digest('hex').slice(0, 20);
}
export function outcomeId(observation_id, horizon) { return createHash('sha256').update(`${observation_id}|${horizon}`).digest('hex').slice(0, 20); }

const isIso = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s)) && s.endsWith('Z');
const isInt = (n) => Number.isInteger(n);

/** Returns { ok, errors[] }. Strict on identity/provenance; tolerant on optional payload blocks (which may be null when honestly missing). */
export function validateObservation(o) {
  const e = [];
  if (!o || typeof o !== 'object') return { ok: false, errors: ['NOT_AN_OBJECT'] };
  if (o.schema_version !== SCHEMA_VERSION) e.push('SCHEMA_VERSION');
  if (o.record !== 'observation') e.push('RECORD_KIND');
  if (typeof o.observation_id !== 'string' || o.observation_id.length !== 20) e.push('OBSERVATION_ID');
  if (!OBSERVATION_TYPES.includes(o.type)) e.push('TYPE');
  if (!PROVENANCE.includes(o.provenance)) e.push('PROVENANCE');
  if (!isIso(o.created_at_utc)) e.push('CREATED_AT');
  if (!isIso(o.decision_time_utc)) e.push('DECISION_TIME');
  if (typeof o.symbol !== 'string' || !o.symbol) e.push('SYMBOL');
  if (typeof o.timeframe !== 'string' || !o.timeframe) e.push('TIMEFRAME');
  if (!isInt(o.bar_time)) e.push('BAR_TIME');
  if (o.bar_close_time !== undefined && o.bar_close_time !== null && (!isInt(o.bar_close_time) || o.bar_close_time <= o.bar_time)) e.push('BAR_CLOSE_TIME');
  if (o.provenance === 'FORWARD_LIVE') {
    const lag = (Date.parse(o.created_at_utc) - Date.parse(o.decision_time_utc)) / 1000;
    if (!(lag >= 0 && lag <= FRESHNESS_WINDOW_SEC)) e.push('FORWARD_LIVE_FRESHNESS');
  }
  if (o.observation_id !== observationId({ type: o.type, candidate_id: o.candidate_id ?? null, symbol: o.symbol, timeframe: o.timeframe, bar_time: o.bar_time })) e.push('OBSERVATION_ID_MISMATCH');
  if (o.cross_asset) for (const [sym, x] of Object.entries(o.cross_asset)) { if (x && Number.isFinite(x.bar_time) && Number.isFinite(x.bar_close_time) && x.bar_close_time > Date.parse(o.decision_time_utc) / 1000) e.push(`CROSS_ASSET_FUTURE:${sym}`); }
  if (o.type === 'CANDIDATE_TRIGGER') { if (typeof o.candidate_id !== 'string') e.push('CANDIDATE_ID'); if (!['BUY', 'SELL', 'NONE'].includes(o.hypothesis_side)) e.push('HYPOTHESIS_SIDE'); }
  return { ok: e.length === 0, errors: e };
}

export function validateOutcome(r) {
  const e = [];
  if (!r || typeof r !== 'object') return { ok: false, errors: ['NOT_AN_OBJECT'] };
  if (r.schema_version !== SCHEMA_VERSION) e.push('SCHEMA_VERSION');
  if (r.record !== 'outcome') e.push('RECORD_KIND');
  if (typeof r.observation_id !== 'string' || r.observation_id.length !== 20) e.push('OBSERVATION_ID');
  if (typeof r.horizon !== 'string') e.push('HORIZON');
  if (r.outcome_id !== outcomeId(r.observation_id, r.horizon)) e.push('OUTCOME_ID_MISMATCH');
  if (!isIso(r.labeled_at_utc)) e.push('LABELED_AT');
  if (!isInt(r.horizon_end_time)) e.push('HORIZON_END_TIME');
  if (!isInt(r.last_bar_time_used) || r.last_bar_time_used > r.horizon_end_time) e.push('LAST_BAR_TIME_USED');
  if (Date.parse(r.labeled_at_utc) / 1000 < r.horizon_end_time) e.push('LABELED_BEFORE_HORIZON');
  if (!PROVENANCE.includes(r.provenance)) e.push('PROVENANCE');
  return { ok: e.length === 0, errors: e };
}
