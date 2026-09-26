/**
 * ECONOMIC-EVENT ABSTRACTION for the NEWS + VOLATILITY SHOCK PROTECTION
 * layer. PURE: no I/O, no timers, no network. Provider adapters that fetch
 * data live in src/engine/newsMonitor.js; this file only normalises whatever
 * a provider returns into ONE deterministic internal event shape:
 *
 *   event_id         sha256(currency|event_name|event_time_utc) -- provider-independent,
 *                    so the same release from two sources collapses to one event
 *   event_time_utc   ISO-8601 UTC ("...Z") or null when the source time is not
 *                    unambiguously convertible (then status UNSCHEDULABLE; never guessed)
 *   currency         upper-case ISO code as the provider reports it (e.g. "USD")
 *   impact           HIGH | MEDIUM | LOW | HOLIDAY | UNKNOWN
 *   event_name       provider title, trimmed
 *   actual / forecast / previous   strings as published, or null
 *   source           provider name ("forexfactory_json", "file", ...)
 *   source_timestamp ISO time the provider data was produced/fetched
 *   status           SCHEDULED | RELEASED | UNSCHEDULABLE
 *
 * TIMEZONE POLICY (explicit, tested): a source time is accepted ONLY when it
 * carries an explicit UTC designator or numeric offset (ISO "Z", "+hh:mm",
 * "-hhmm"), is a unix epoch number, or the caller supplies the source's fixed
 * offset for a naive "YYYY-MM-DD HH:mm" string. A naive time without a known
 * offset is never interpreted as local or UTC: it becomes UNSCHEDULABLE and is
 * reported, so a mis-zoned release can never silently move a protection
 * window by hours.
 *
 * GOLD RELEVANCE (V1, deterministic): currency in `currencies` (USD) AND
 * (impact in `impacts` (HIGH) OR event name matches a central-bank decision
 * pattern). The provider's own impact classification is the primary source;
 * the patterns only make sure Fed rate decisions / FOMC statements / Fed Chair
 * appearances are never missed if a provider grades them lower. Nothing here
 * says "news bullish => BUY": relevance only opens a protection window.
 */
import { createHash } from 'node:crypto';

export const IMPACT = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', HOLIDAY: 'HOLIDAY', UNKNOWN: 'UNKNOWN' });
export const EVENT_STATUS = Object.freeze({ SCHEDULED: 'SCHEDULED', RELEASED: 'RELEASED', UNSCHEDULABLE: 'UNSCHEDULABLE' });

export const GOLD_RELEVANCE_PARAMS = Object.freeze({
  currencies: ['USD'],
  impacts: [IMPACT.HIGH],
  // Central-bank decision events that must always count for USD/gold, whatever impact grade a provider assigns.
  alwaysRelevantPatterns: [/\bFOMC (Statement|Press Conference|Economic Projections)\b/i, /\bFederal Funds Rate\b/i, /\bFed Chair\b/i],
});

const IMPACT_ALIASES = { high: IMPACT.HIGH, red: IMPACT.HIGH, 3: IMPACT.HIGH, medium: IMPACT.MEDIUM, med: IMPACT.MEDIUM, orange: IMPACT.MEDIUM, 2: IMPACT.MEDIUM, low: IMPACT.LOW, yellow: IMPACT.LOW, 1: IMPACT.LOW, holiday: IMPACT.HOLIDAY, 'non-economic': IMPACT.LOW, 0: IMPACT.LOW };

export function normalizeImpact(raw) {
  if (raw === null || raw === undefined) return IMPACT.UNKNOWN;
  const key = String(raw).trim().toLowerCase();
  return IMPACT_ALIASES[key] ?? IMPACT.UNKNOWN;
}

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Converts a provider time to an ISO UTC string. Returns { iso, error }.
 *   - number: unix seconds (< 1e12) or milliseconds
 *   - string with explicit Z/offset: parsed as-is
 *   - naive "YYYY-MM-DD[ T]HH:mm[:ss]" + sourceOffsetMinutes: shifted explicitly
 *   - anything else: error (never guessed)
 */
export function parseEventTimeUtc(raw, { sourceOffsetMinutes = null } = {}) {
  if (raw === null || raw === undefined || raw === '') return { iso: null, error: 'TIME_MISSING' };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return { iso: new Date(ms).toISOString(), error: null };
  }
  const s = String(raw).trim();
  if (OFFSET_RE.test(s)) {
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), error: null } : { iso: null, error: 'TIME_UNPARSEABLE' };
  }
  const naive = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (naive) {
    if (!Number.isFinite(sourceOffsetMinutes)) return { iso: null, error: 'TIMEZONE_AMBIGUOUS' };
    const [, y, mo, d, h, mi, se] = naive;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? 0)) - sourceOffsetMinutes * 60_000;
    return { iso: new Date(ms).toISOString(), error: null };
  }
  return { iso: null, error: 'TIME_UNPARSEABLE' };
}

function cleanText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function eventIdFor({ currency, event_name, event_time_utc }) {
  return createHash('sha256').update(`${currency ?? ''}|${event_name ?? ''}|${event_time_utc ?? ''}`).digest('hex').slice(0, 16);
}

/**
 * Normalises one raw provider record. Accepts the Forex Factory JSON shape
 * ({title,country,date,impact,forecast,previous[,actual]}) and the internal
 * shape ({event_name,currency,event_time_utc,impact,...}). `now` decides
 * SCHEDULED vs RELEASED when the provider gives no actual value.
 */
export function normalizeEvent(raw, { source, sourceTimestamp, now, sourceOffsetMinutes = null } = {}) {
  const event_name = cleanText(raw?.event_name ?? raw?.title ?? raw?.name);
  const currency = cleanText(raw?.currency ?? raw?.country)?.toUpperCase() ?? null;
  const time = parseEventTimeUtc(raw?.event_time_utc ?? raw?.date ?? raw?.time ?? raw?.timestamp, { sourceOffsetMinutes });
  const actual = cleanText(raw?.actual);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now ?? '') || Date.now();
  let status = EVENT_STATUS.SCHEDULED;
  if (!time.iso) status = EVENT_STATUS.UNSCHEDULABLE;
  else if (actual !== null || Date.parse(time.iso) <= nowMs) status = EVENT_STATUS.RELEASED;
  const ev = {
    event_id: null, event_time_utc: time.iso, currency, impact: normalizeImpact(raw?.impact), event_name,
    actual, forecast: cleanText(raw?.forecast), previous: cleanText(raw?.previous),
    source: source ?? cleanText(raw?.source) ?? 'unknown', source_timestamp: sourceTimestamp ?? cleanText(raw?.source_timestamp) ?? null,
    status, parse_error: time.error,
  };
  ev.event_id = eventIdFor(ev);
  return ev;
}

/** Duplicate handling: same event_id => keep the record with the newest source_timestamp (ties: the one carrying an actual). */
export function dedupeEvents(events) {
  const byId = new Map();
  for (const e of events) {
    if (!e?.event_id) continue;
    const prev = byId.get(e.event_id);
    if (!prev) { byId.set(e.event_id, e); continue; }
    const pt = Date.parse(prev.source_timestamp ?? '') || 0, nt = Date.parse(e.source_timestamp ?? '') || 0;
    if (nt > pt || (nt === pt && e.actual !== null && prev.actual === null)) byId.set(e.event_id, e);
  }
  return [...byId.values()].sort((a, b) => (Date.parse(a.event_time_utc ?? '') || 0) - (Date.parse(b.event_time_utc ?? '') || 0));
}

/** Normalises a whole provider payload: events (deduplicated, time-sorted) plus what was dropped and why. */
export function normalizeCalendar(rawList, opts = {}) {
  const list = Array.isArray(rawList) ? rawList : [];
  const normalized = list.map((r) => normalizeEvent(r, opts));
  const unschedulable = normalized.filter((e) => e.status === EVENT_STATUS.UNSCHEDULABLE);
  const usable = normalized.filter((e) => e.status !== EVENT_STATUS.UNSCHEDULABLE && e.event_name && e.currency);
  const events = dedupeEvents(usable);
  return { events, counts: { received: list.length, usable: usable.length, unique: events.length, unschedulable: unschedulable.length, duplicates: usable.length - events.length }, dropped: unschedulable.map((e) => ({ event_name: e.event_name, currency: e.currency, parse_error: e.parse_error })) };
}

export function isGoldRelevant(event, params = GOLD_RELEVANCE_PARAMS) {
  if (!event || !event.event_time_utc) return false;
  if (!params.currencies.includes(event.currency)) return false;
  if (params.impacts.includes(event.impact)) return true;
  return params.alwaysRelevantPatterns.some((re) => re.test(String(event.event_name ?? '')));
}

/**
 * NEWS PROTECTION V2 (2026-09-26) event TIERS -- a SAFETY classification of a
 * relevant event by release family, derived from the V5 scheduled-news study
 * (docs/XAUUSD_V5_NEWS_EDGE_MATRIX.md) and frozen in
 * docs/XAUUSD_NEWS_PROTECTION_V2_SPEC.md. Tiers only size protection windows:
 *   A  FOMC decision cluster (statement, rate decision, projections, press conference)
 *   B  CPI cluster and Employment Situation (NFP) cluster
 *   C  every other relevant event, including unknown USD HIGH releases (V1 windows)
 * A tier never says anything about direction, model, quality or size.
 */
export const NEWS_TIERS = Object.freeze({ A: 'A', B: 'B', C: 'C' });
export const TIER_PATTERNS = Object.freeze({
  A: [/\bFOMC (Statement|Press Conference|Economic Projections)\b/i, /\bFederal Funds Rate\b/i],
  B: [/\bCPI\b/i, /\bConsumer Price Index\b/i, /\bNon-?Farm\b/i, /\bEmployment Situation\b/i, /\bUnemployment Rate\b/i, /\bAverage Hourly Earnings\b/i],
});
export const PRESS_CONFERENCE_PATTERN = /\bFOMC Press Conference\b/i;

/** Tier of a RELEVANT event (callers check isGoldRelevant first). Unknown => C (the safe V1 fallback). */
export function classifyNewsTier(event) {
  const name = String(event?.event_name ?? '');
  if (TIER_PATTERNS.A.some((re) => re.test(name))) return NEWS_TIERS.A;
  if (TIER_PATTERNS.B.some((re) => re.test(name))) return NEWS_TIERS.B;
  return NEWS_TIERS.C;
}

/** Freshness of a calendar payload relative to `now`. */
export function calendarFreshness({ sourceTimestamp, now, staleAfterSec }) {
  // `now` may be a Date, an ISO string or epoch milliseconds (the state machine passes a number).
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now ?? '');
  const srcMs = Date.parse(sourceTimestamp ?? '');
  if (!Number.isFinite(srcMs) || !Number.isFinite(nowMs)) return { age_sec: null, fresh: false, reason: 'SOURCE_TIMESTAMP_MISSING' };
  const age = Math.max(0, Math.round((nowMs - srcMs) / 1000));
  return { age_sec: age, fresh: age <= staleAfterSec, reason: age <= staleAfterSec ? 'OK' : 'STALE' };
}
