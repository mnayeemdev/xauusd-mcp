/**
 * NEWS RISK STATE MACHINE. PURE and deterministic: same events + same clock
 * => same state. It is a SAFETY/CONTEXT layer only. It never produces BUY or
 * SELL, never reads news direction, never closes a position. Its only
 * outputs are (a) a named state with the evidence that produced it and (b)
 * an entry verdict for NEW orders.
 *
 * States
 *   NORMAL             no gold-relevant event inside any window; calendar fresh
 *   PRE_NEWS           a relevant release is due within preNewsWindowMin
 *   NEWS_ACTIVE        release time reached; inside newsActiveWindowMin after it
 *   POST_NEWS_COOLDOWN active window over; inside postNewsCooldownMin after that
 *   DATA_UNAVAILABLE   a provider is configured but its data is missing/stale/errored
 *   DISABLED           no provider configured (operator choice, always audited)
 *
 * Precedence when windows of different events overlap:
 *   NEWS_ACTIVE > PRE_NEWS > POST_NEWS_COOLDOWN (all three block new entries;
 *   the precedence only decides the reported state). DATA_UNAVAILABLE
 *   overrides everything because the calendar cannot be trusted.
 *
 * Defaults (conservative, see docs/XAUUSD_NEWS_SHOCK_PROTECTION.md):
 *   pre 30 min  -- a 5m confirmed-candle setup entered inside the last half
 *                  hour would be resolved by the release, not by structure
 *   active 5 min -- the release print itself and the first repricing
 *   cooldown 30 min -- typical XAUUSD post-release spread/velocity tail
 *   stale 6 h   -- a weekly feed refreshed every 15 min that has not been
 *                  refreshable for 6 h is no longer trusted
 * Every value is configuration (src/engine/mt5RealPolicy.js env names), not
 * a hidden constant.
 */
import { isGoldRelevant, calendarFreshness, GOLD_RELEVANCE_PARAMS } from './newsCalendar.js';

export const NEWS_STATES = Object.freeze(['NORMAL', 'PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'DATA_UNAVAILABLE', 'DISABLED']);
export const BLOCKING_NEWS_STATES = Object.freeze(['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']);

export const NEWS_RISK_PARAMS = Object.freeze({
  preNewsWindowMin: 30,
  newsActiveWindowMin: 5,
  postNewsCooldownMin: 30,
  staleCalendarSec: 6 * 3600,
  dataUnavailablePolicy: 'BLOCK', // BLOCK | ALLOW  (ALLOW still audits every decision as NEWS_DATA_UNAVAILABLE)
  lookaheadHours: 48, // only events inside this horizon are reported as "next"
});

const STATE_RANK = { NEWS_ACTIVE: 3, PRE_NEWS: 2, POST_NEWS_COOLDOWN: 1 };

function describe(e, nowMs) {
  const t = Date.parse(e.event_time_utc);
  return { event_id: e.event_id, event_name: e.event_name, currency: e.currency, impact: e.impact, event_time_utc: e.event_time_utc, minutes_to_event: Math.round(((t - nowMs) / 60_000) * 10) / 10, actual: e.actual ?? null, forecast: e.forecast ?? null, previous: e.previous ?? null, source: e.source ?? null };
}

/**
 * calendar: { status: 'OK'|'ERROR'|'NONE'|'DISABLED', source, source_timestamp, last_success_at, error, consecutive_failures }
 * events:   normalised events (src/engine/newsCalendar.js)
 */
export function evaluateNewsState({ events, now, calendar, params = NEWS_RISK_PARAMS, relevance = GOLD_RELEVANCE_PARAMS }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const nowIso = new Date(nowMs).toISOString();
  const windows = { pre_news_min: params.preNewsWindowMin, news_active_min: params.newsActiveWindowMin, post_news_cooldown_min: params.postNewsCooldownMin };
  const base = { evaluated_at: nowIso, windows, calendar: { status: calendar?.status ?? 'NONE', source: calendar?.source ?? null, source_timestamp: calendar?.source_timestamp ?? null, last_success_at: calendar?.last_success_at ?? null, error: calendar?.error ?? null, consecutive_failures: calendar?.consecutive_failures ?? 0, freshness: null, stale_after_sec: params.staleCalendarSec } };

  if (!calendar || calendar.status === 'DISABLED' || calendar.status === 'NONE') {
    return { ...base, state: 'DISABLED', reason: calendar?.status === 'NONE' ? 'NO_CALENDAR_PROVIDER' : 'CALENDAR_DISABLED', event: null, contributing_events: [], next_event: null };
  }
  const freshness = calendarFreshness({ sourceTimestamp: calendar.source_timestamp, now: nowMs, staleAfterSec: params.staleCalendarSec });
  base.calendar.freshness = freshness;
  if (calendar.status !== 'OK' && !(Array.isArray(events) && events.length && freshness.fresh)) {
    return { ...base, state: 'DATA_UNAVAILABLE', reason: calendar.error ? `PROVIDER_ERROR:${calendar.error}` : 'PROVIDER_NOT_OK', event: null, contributing_events: [], next_event: null };
  }
  if (!freshness.fresh) return { ...base, state: 'DATA_UNAVAILABLE', reason: freshness.reason === 'STALE' ? 'CALENDAR_STALE' : freshness.reason, event: null, contributing_events: [], next_event: null };
  if (!Array.isArray(events)) return { ...base, state: 'DATA_UNAVAILABLE', reason: 'EVENTS_MISSING', event: null, contributing_events: [], next_event: null };

  const relevant = events.filter((e) => isGoldRelevant(e, relevance));
  const pre = params.preNewsWindowMin * 60_000, active = params.newsActiveWindowMin * 60_000, cool = params.postNewsCooldownMin * 60_000;
  const contributing = [];
  for (const e of relevant) {
    const t = Date.parse(e.event_time_utc);
    if (!Number.isFinite(t)) continue;
    let phase = null;
    if (t > nowMs && t - nowMs <= pre) phase = 'PRE_NEWS';
    else if (nowMs >= t && nowMs < t + active) phase = 'NEWS_ACTIVE';
    else if (nowMs >= t + active && nowMs < t + active + cool) phase = 'POST_NEWS_COOLDOWN';
    if (phase) contributing.push({ ...describe(e, nowMs), phase, window_ends_utc: new Date(phase === 'PRE_NEWS' ? t : phase === 'NEWS_ACTIVE' ? t + active : t + active + cool).toISOString() });
  }
  const upcoming = relevant.map((e) => ({ e, t: Date.parse(e.event_time_utc) })).filter((x) => Number.isFinite(x.t) && x.t > nowMs && x.t - nowMs <= params.lookaheadHours * 3600_000).sort((a, b) => a.t - b.t);
  const next_event = upcoming.length ? describe(upcoming[0].e, nowMs) : null;
  if (!contributing.length) return { ...base, state: 'NORMAL', reason: 'NO_RELEVANT_EVENT_IN_WINDOW', event: null, contributing_events: [], next_event, relevant_count: relevant.length };
  contributing.sort((a, b) => (STATE_RANK[b.phase] - STATE_RANK[a.phase]) || (Date.parse(a.window_ends_utc) - Date.parse(b.window_ends_utc)));
  const top = contributing[0];
  const blockEnds = contributing.reduce((m, c) => Math.max(m, Date.parse(c.window_ends_utc)), 0);
  return { ...base, state: top.phase, reason: `${top.phase}:${top.event_name}`, event: top, contributing_events: contributing, next_event, block_ends_utc: new Date(blockEnds).toISOString(), relevant_count: relevant.length };
}

/** Entry verdict for a NEW order. Never touches an open position. */
export function evaluateNewsEntryPolicy({ news, params = NEWS_RISK_PARAMS }) {
  const details = { news_state: news?.state ?? null, event: news?.event ?? null, minutes_to_event: news?.event?.minutes_to_event ?? null, impact: news?.event?.impact ?? null, source: news?.calendar?.source ?? null, calendar_freshness: news?.calendar?.freshness ?? null, block_ends_utc: news?.block_ends_utc ?? null, reason: news?.reason ?? null };
  if (!news) return { allowed: false, reason: 'NEWS_STATE_UNKNOWN', details };
  if (BLOCKING_NEWS_STATES.includes(news.state)) return { allowed: false, reason: 'NEWS_ENTRY_BLOCK', details };
  if (news.state === 'DATA_UNAVAILABLE') {
    if (params.dataUnavailablePolicy === 'ALLOW') return { allowed: true, reason: 'NEWS_DATA_UNAVAILABLE_ALLOWED', details };
    return { allowed: false, reason: 'NEWS_DATA_UNAVAILABLE_BLOCK', details };
  }
  return { allowed: true, reason: news.state === 'DISABLED' ? 'NEWS_DISABLED' : 'OK', details };
}

/** Auditable transition record, or null when the state did not change. */
export function newsTransition(prev, next, now) {
  const from = prev?.state ?? null, to = next?.state ?? null;
  if (from === to && (prev?.event?.event_id ?? null) === (next?.event?.event_id ?? null)) return null;
  return { at: (now instanceof Date ? now : new Date(now)).toISOString(), from, to, event: next?.event ?? null, reason: next?.reason ?? null, calendar: next?.calendar ?? null, block_ends_utc: next?.block_ends_utc ?? null };
}
