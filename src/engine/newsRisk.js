/**
 * NEWS RISK STATE MACHINE. PURE and deterministic: same events + same clock
 * (+ same completed bars) => same state. It is a SAFETY/CONTEXT layer only. It
 * never produces BUY or SELL, never reads news direction, never closes a
 * position. Its only outputs are (a) a named state with the evidence that
 * produced it and (b) an entry verdict for NEW orders.
 *
 * States (vocabulary unchanged since V1)
 *   NORMAL             no gold-relevant event inside any window; calendar fresh
 *   PRE_NEWS           a relevant release is due within preNewsWindowMin
 *   NEWS_ACTIVE        release time reached; inside newsActiveWindowMin after it
 *   POST_NEWS_COOLDOWN active window over; inside the tier's clock minimum, or
 *                      (Tier A/B) inside the normalisation extension
 *   DATA_UNAVAILABLE   a provider is configured but its data is missing/stale/errored
 *   DISABLED           no provider configured (operator choice, always audited)
 *
 * Precedence when windows of different events overlap:
 *   NEWS_ACTIVE > PRE_NEWS > POST_NEWS_COOLDOWN (all three block new entries;
 *   the precedence only decides the reported state). DATA_UNAVAILABLE
 *   overrides everything because the calendar cannot be trusted.
 *
 * V2 (2026-09-26, docs/XAUUSD_NEWS_PROTECTION_V2_SPEC.md) -- evidence from the
 * V5 scheduled-news study (magnitude only; no direction was found):
 *   Tier C (generic, = V1)  pre 30 / active 5 / cooldown 30  => block ends T+35
 *   Tier B (CPI, NFP)       cooldown 55                      => block ends T+60
 *   Tier A (FOMC cluster)   one merged interval: anchor-30 .. max(anchor+150,
 *                           last row+35, press conference+90)
 *   Tier A/B normalisation: after the clock minimum the block persists until
 *   the last `normalizationConfirmBars` COMPLETED 15m bars after the release
 *   are all <= normalizationRatio x the pre-event reference range (median 15m
 *   true range of the 24 h before the release, excluding the last hour), or
 *   until clock minimum + normalizationMaxExtensionMin. Missing bars or an
 *   unavailable reference end the block at the clock minimum (audited); the
 *   clock minimum can never be shortened. DEFAULT normalizationMaxExtensionMin
 *   = 0: the offline replay (validation/v5_news_edge/v2_reference_variants.mjs)
 *   showed the 24 h reference is session-biased for 08:30 ET releases (it hit
 *   the cap in 65 % of Tier A/B events and half of the extra blocked bars were
 *   normal), so the extension is NOT enforced; the check is still computed and
 *   audited as `normalization_shadow` for 2 h after a Tier A/B clock minimum so
 *   a future unbiased (same-slot) baseline can be calibrated from live audits.
 *   Remembered events: while DATA_UNAVAILABLE, the windows of the last accepted
 *   event list are still computed and reported (`remembered_block`); under
 *   dataUnavailablePolicy ALLOW an active remembered window still blocks.
 * Every value is configuration (src/engine/mt5RealPolicy.js env names), not a
 * hidden constant.
 */
import { isGoldRelevant, calendarFreshness, GOLD_RELEVANCE_PARAMS, classifyNewsTier, NEWS_TIERS, PRESS_CONFERENCE_PATTERN } from './newsCalendar.js';

export const NEWS_STATES = Object.freeze(['NORMAL', 'PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'DATA_UNAVAILABLE', 'DISABLED']);
export const BLOCKING_NEWS_STATES = Object.freeze(['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']);
export const NORMALIZATION_STATUS = Object.freeze(['NOT_APPLICABLE', 'BARS_UNAVAILABLE', 'REFERENCE_UNAVAILABLE', 'PENDING', 'NORMALIZED', 'MAX_EXTENSION_REACHED']);

export const NEWS_RISK_PARAMS = Object.freeze({
  preNewsWindowMin: 30,
  newsActiveWindowMin: 5,
  postNewsCooldownMin: 30,
  staleCalendarSec: 6 * 3600,
  dataUnavailablePolicy: 'BLOCK', // BLOCK | ALLOW  (ALLOW still audits every decision as NEWS_DATA_UNAVAILABLE)
  lookaheadHours: 48, // only events inside this horizon are reported as "next"
  // V2 tiers (SAFETY windows only)
  tierBCooldownMin: 55,
  tierAPostMin: 150,
  tierAPressConfCoverMin: 90,
  tierAClusterGapMin: 120,
  normalizationRatio: 1.5,
  normalizationConfirmBars: 2,
  normalizationMaxExtensionMin: 0, // 0 = extension OFF (shadow-measured only); spec amendment A1: no unbiased deployable reference yet
  normalizationReferenceHours: 24,
  normalizationReferenceMinBars: 24,
});

const STATE_RANK = { NEWS_ACTIVE: 3, PRE_NEWS: 2, POST_NEWS_COOLDOWN: 1 };
const MIN = 60_000;
const BAR15_SEC = 900;

function describe(e, nowMs) {
  const t = Date.parse(e.event_time_utc);
  return { event_id: e.event_id, event_name: e.event_name, currency: e.currency, impact: e.impact, event_time_utc: e.event_time_utc, minutes_to_event: Math.round(((t - nowMs) / 60_000) * 10) / 10, actual: e.actual ?? null, forecast: e.forecast ?? null, previous: e.previous ?? null, source: e.source ?? null };
}

/**
 * Deterministic aggregation of CONFIRMED 5m bars into COMPLETED 15m bars.
 * A 15m bucket counts only when it holds exactly three 5m bars and its end
 * (bucket + 900 s) is <= nowSec: never a forming or partial candle. Times may
 * be unix seconds or milliseconds; output times are unix seconds.
 */
export function aggregateCompleted15m(bars5m, nowSec) {
  if (!Array.isArray(bars5m) || !bars5m.length || !Number.isFinite(nowSec)) return [];
  const buckets = new Map();
  for (const b of bars5m) {
    let t = Number(b?.time ?? b?.t);
    if (!Number.isFinite(t)) continue;
    if (t > 1e12) t = Math.floor(t / 1000);
    const o = Number(b.open), h = Number(b.high), l = Number(b.low), c = Number(b.close);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    const k = Math.floor(t / BAR15_SEC) * BAR15_SEC;
    const g = buckets.get(k) ?? { time: k, bars: [] };
    g.bars.push({ t, o, h, l, c });
    buckets.set(k, g);
  }
  const out = [];
  for (const g of [...buckets.values()].sort((a, b) => a.time - b.time)) {
    if (g.bars.length !== 3 || g.time + BAR15_SEC > nowSec) continue;
    const bars = g.bars.sort((a, b) => a.t - b.t);
    if (new Set(bars.map((x) => x.t)).size !== 3) continue;
    out.push({ time: g.time, open: bars[0].o, high: Math.max(...bars.map((x) => x.h)), low: Math.min(...bars.map((x) => x.l)), close: bars[2].c });
  }
  return out;
}

const median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000);

/**
 * Post-release normalisation check (Tier A/B). `bars15m` = COMPLETED 15m bars
 * ({ time (sec), open, high, low, close }, ascending). Pure; no look-ahead:
 * only bars whose end <= nowSec are used. Never shortens a clock minimum --
 * the caller applies it only after the clock minimum has elapsed.
 */
export function evaluateNormalization({ bars15m, releaseSec, nowSec, params = NEWS_RISK_PARAMS }) {
  const base = { status: 'BARS_UNAVAILABLE', reference_range: null, last_ranges: [], confirm_bars: params.normalizationConfirmBars, ratio: params.normalizationRatio, bars_checked: 0, reference_bars: 0 };
  if (!Array.isArray(bars15m) || !bars15m.length || !Number.isFinite(releaseSec) || !Number.isFinite(nowSec)) return base;
  const done = bars15m.filter((b) => Number.isFinite(b?.time) && b.time + BAR15_SEC <= nowSec).sort((a, b) => a.time - b.time);
  if (!done.length) return base;
  const tr = (i) => { const b = done[i], p = i > 0 ? done[i - 1] : null; const hl = b.high - b.low; return p ? Math.max(hl, Math.abs(b.high - p.close), Math.abs(b.low - p.close)) : hl; };
  const refFrom = releaseSec - (params.normalizationReferenceHours + 1) * 3600, refTo = releaseSec - 3600;
  const ref = []; for (let i = 0; i < done.length; i++) if (done[i].time >= refFrom && done[i].time <= refTo) ref.push(tr(i));
  if (ref.length < params.normalizationReferenceMinBars) return { ...base, status: 'REFERENCE_UNAVAILABLE', reference_bars: ref.length };
  const reference = median(ref);
  if (!(reference > 0)) return { ...base, status: 'REFERENCE_UNAVAILABLE', reference_bars: ref.length };
  const post = []; for (let i = 0; i < done.length; i++) if (done[i].time >= releaseSec) post.push({ time: done[i].time, range: tr(i) });
  const last = post.slice(-params.normalizationConfirmBars);
  const out = { ...base, reference_range: r3(reference), reference_bars: ref.length, bars_checked: post.length, last_ranges: last.map((x) => ({ time: x.time, range: r3(x.range), ratio: r3(x.range / reference) })) };
  if (last.length < params.normalizationConfirmBars) return { ...out, status: 'PENDING' };
  const ok = last.every((x) => x.range <= params.normalizationRatio * reference);
  return { ...out, status: ok ? 'NORMALIZED' : 'PENDING' };
}

/**
 * Protection intervals for the relevant events: per event { tier, t, pre_start,
 * active_end, clock_end, cluster_anchor, press_conf_t, cluster_id }. Tier-A rows
 * within tierAClusterGapMin of each other form ONE cluster with one merged
 * clock minimum; only the cluster anchor carries a PRE_NEWS phase.
 */
export function buildProtectionIntervals(relevant, params = NEWS_RISK_PARAMS) {
  const pre = params.preNewsWindowMin * MIN, active = params.newsActiveWindowMin * MIN, cool = params.postNewsCooldownMin * MIN;
  const rows = relevant.map((e) => ({ e, t: Date.parse(e.event_time_utc), tier: classifyNewsTier(e) })).filter((r) => Number.isFinite(r.t)).sort((a, b) => a.t - b.t);
  const out = [];
  const tierA = rows.filter((r) => r.tier === NEWS_TIERS.A);
  const clusters = [];
  for (const r of tierA) {
    const last = clusters.at(-1);
    if (last && r.t - last.rows.at(-1).t <= params.tierAClusterGapMin * MIN) last.rows.push(r); else clusters.push({ rows: [r] });
  }
  for (const [ci, c] of clusters.entries()) {
    const anchor = c.rows[0].t;
    const pressConf = c.rows.filter((r) => PRESS_CONFERENCE_PATTERN.test(String(r.e.event_name ?? ''))).map((r) => r.t).sort((a, b) => a - b)[0] ?? null;
    const lastRow = c.rows.at(-1).t;
    const clockEnd = Math.max(anchor + params.tierAPostMin * MIN, lastRow + active + cool, pressConf != null ? pressConf + params.tierAPressConfCoverMin * MIN : -Infinity);
    for (const r of c.rows) out.push({ e: r.e, tier: NEWS_TIERS.A, t: r.t, pre_start: r.t === anchor ? anchor - pre : r.t, active_end: r.t + active, clock_end: clockEnd, cluster_anchor: anchor, press_conf_t: pressConf, cluster_id: `A${ci}` });
  }
  for (const r of rows) {
    if (r.tier === NEWS_TIERS.A) continue;
    const coolMs = (r.tier === NEWS_TIERS.B ? Math.max(params.tierBCooldownMin, params.postNewsCooldownMin) : params.postNewsCooldownMin) * MIN;
    out.push({ e: r.e, tier: r.tier, t: r.t, pre_start: r.t - pre, active_end: r.t + active, clock_end: r.t + active + coolMs, cluster_anchor: null, press_conf_t: null, cluster_id: null });
  }
  return out.sort((a, b) => a.t - b.t);
}

function contributingAt(intervals, nowMs, { bars15m = null, params }) {
  const contributing = [];
  const normalizations = {};
  const maxExt = params.normalizationMaxExtensionMin * MIN;
  for (const iv of intervals) {
    let phase = null, windowEnd = null, normalization = null;
    if (iv.t > nowMs && nowMs >= iv.pre_start) { phase = 'PRE_NEWS'; windowEnd = iv.t; }
    else if (nowMs >= iv.t && nowMs < iv.active_end) { phase = 'NEWS_ACTIVE'; windowEnd = iv.active_end; }
    else if (nowMs >= iv.active_end && nowMs < iv.clock_end) { phase = 'POST_NEWS_COOLDOWN'; windowEnd = iv.clock_end; }
    else if (nowMs >= iv.clock_end && (iv.tier === NEWS_TIERS.A || iv.tier === NEWS_TIERS.B) && maxExt > 0 && nowMs < iv.clock_end + maxExt) {
      // Normalisation extension: evaluated once per cluster/event on the anchor time. Only completed bars, never a shortened clock minimum.
      const key = iv.cluster_id ?? iv.e.event_id;
      const releaseMs = iv.cluster_anchor ?? iv.t;
      normalization = normalizations[key] ??= evaluateNormalization({ bars15m, releaseSec: releaseMs / 1000, nowSec: nowMs / 1000, params });
      if (normalization.status === 'PENDING') { phase = 'POST_NEWS_COOLDOWN'; windowEnd = iv.clock_end + maxExt; }
    }
    if (!phase) continue;
    contributing.push({ ...describe(iv.e, nowMs), phase, tier: iv.tier, window_ends_utc: new Date(windowEnd).toISOString(), clock_min_end_utc: new Date(iv.clock_end).toISOString(), cluster_anchor_utc: iv.cluster_anchor != null ? new Date(iv.cluster_anchor).toISOString() : null, press_conference_utc: iv.press_conf_t != null ? new Date(iv.press_conf_t).toISOString() : null, normalization_pending: phase === 'POST_NEWS_COOLDOWN' && nowMs >= iv.clock_end, ...(normalization ? { normalization: { ...normalization, extension_min: Math.round((nowMs - iv.clock_end) / MIN), max_extension_min: params.normalizationMaxExtensionMin } } : {}) });
  }
  contributing.sort((a, b) => (STATE_RANK[b.phase] - STATE_RANK[a.phase]) || (Date.parse(a.window_ends_utc) - Date.parse(b.window_ends_utc)));
  return contributing;
}

/**
 * calendar: { status: 'OK'|'ERROR'|'NONE'|'DISABLED', source, source_timestamp, last_success_at, error, consecutive_failures }
 * events:   normalised events (src/engine/newsCalendar.js)
 * bars15m:  optional COMPLETED 15m bars (aggregateCompleted15m) for Tier A/B normalisation; evidence only
 */
export function evaluateNewsState({ events, now, calendar, params = NEWS_RISK_PARAMS, relevance = GOLD_RELEVANCE_PARAMS, bars15m = null }) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const nowIso = new Date(nowMs).toISOString();
  const windows = { pre_news_min: params.preNewsWindowMin, news_active_min: params.newsActiveWindowMin, post_news_cooldown_min: params.postNewsCooldownMin, tier_b_cooldown_min: params.tierBCooldownMin, tier_a_post_min: params.tierAPostMin, tier_a_pressconf_cover_min: params.tierAPressConfCoverMin, normalization: { ratio: params.normalizationRatio, confirm_bars: params.normalizationConfirmBars, max_extension_min: params.normalizationMaxExtensionMin } };
  const base = { evaluated_at: nowIso, windows, calendar: { status: calendar?.status ?? 'NONE', source: calendar?.source ?? null, source_timestamp: calendar?.source_timestamp ?? null, last_success_at: calendar?.last_success_at ?? null, error: calendar?.error ?? null, consecutive_failures: calendar?.consecutive_failures ?? 0, freshness: null, stale_after_sec: params.staleCalendarSec } };

  if (!calendar || calendar.status === 'DISABLED' || calendar.status === 'NONE') {
    return { ...base, state: 'DISABLED', reason: calendar?.status === 'NONE' ? 'NO_CALENDAR_PROVIDER' : 'CALENDAR_DISABLED', event: null, contributing_events: [], next_event: null };
  }
  const freshness = calendarFreshness({ sourceTimestamp: calendar.source_timestamp, now: nowMs, staleAfterSec: params.staleCalendarSec });
  base.calendar.freshness = freshness;

  // Remembered events (V2): the last ACCEPTED event list still opens its windows while the calendar is not trusted.
  const remembered = (reason) => {
    const list = Array.isArray(events) ? events.filter((e) => isGoldRelevant(e, relevance)) : [];
    const contributing = list.length ? contributingAt(buildProtectionIntervals(list, params), nowMs, { bars15m: null, params }) : [];
    const blockEnds = contributing.reduce((m, c) => Math.max(m, Date.parse(c.window_ends_utc)), 0);
    return { ...base, state: 'DATA_UNAVAILABLE', reason, event: null, contributing_events: [], next_event: null, remembered_block: { active: contributing.length > 0, contributing, block_ends_utc: blockEnds ? new Date(blockEnds).toISOString() : null, source_timestamp: calendar.source_timestamp ?? null } };
  };
  if (calendar.status !== 'OK' && !(Array.isArray(events) && events.length && freshness.fresh)) return remembered(calendar.error ? `PROVIDER_ERROR:${calendar.error}` : 'PROVIDER_NOT_OK');
  if (!freshness.fresh) return remembered(freshness.reason === 'STALE' ? 'CALENDAR_STALE' : freshness.reason);
  if (!Array.isArray(events)) return { ...base, state: 'DATA_UNAVAILABLE', reason: 'EVENTS_MISSING', event: null, contributing_events: [], next_event: null, remembered_block: { active: false, contributing: [], block_ends_utc: null, source_timestamp: calendar.source_timestamp ?? null } };

  const relevant = events.filter((e) => isGoldRelevant(e, relevance));
  const intervals = buildProtectionIntervals(relevant, params);
  const contributing = contributingAt(intervals, nowMs, { bars15m, params });
  const upcoming = relevant.map((e) => ({ e, t: Date.parse(e.event_time_utc) })).filter((x) => Number.isFinite(x.t) && x.t > nowMs && x.t - nowMs <= params.lookaheadHours * 3600_000).sort((a, b) => a.t - b.t);
  const next_event = upcoming.length ? { ...describe(upcoming[0].e, nowMs), tier: classifyNewsTier(upcoming[0].e) } : null;
  if (!contributing.length) {
    // Shadow normalisation (audit only, never blocks): for 2 h after a Tier A/B clock minimum, report what the
    // extension WOULD have decided so a future baseline can be calibrated against live audit data.
    let normalization_shadow = null;
    if (Array.isArray(bars15m) && bars15m.length) {
      const recent = intervals.filter((iv) => (iv.tier === NEWS_TIERS.A || iv.tier === NEWS_TIERS.B) && nowMs >= iv.clock_end && nowMs < iv.clock_end + 120 * MIN).sort((a, b) => b.clock_end - a.clock_end)[0];
      if (recent) normalization_shadow = { event_name: recent.e.event_name, tier: recent.tier, enforced: params.normalizationMaxExtensionMin > 0, minutes_after_clock_min: Math.round((nowMs - recent.clock_end) / MIN), ...evaluateNormalization({ bars15m, releaseSec: (recent.cluster_anchor ?? recent.t) / 1000, nowSec: nowMs / 1000, params }) };
    }
    return { ...base, state: 'NORMAL', reason: 'NO_RELEVANT_EVENT_IN_WINDOW', event: null, contributing_events: [], next_event, relevant_count: relevant.length, ...(normalization_shadow ? { normalization_shadow } : {}) };
  }
  const top = contributing[0];
  const blockEnds = contributing.reduce((m, c) => Math.max(m, Date.parse(c.window_ends_utc)), 0);
  const norm = contributing.find((c) => c.normalization)?.normalization ?? null;
  return { ...base, state: top.phase, reason: `${top.phase}:${top.event_name}`, event: top, contributing_events: contributing, next_event, block_ends_utc: new Date(blockEnds).toISOString(), relevant_count: relevant.length, tier: top.tier, normalization: norm };
}

/** Entry verdict for a NEW order. Never touches an open position. */
export function evaluateNewsEntryPolicy({ news, params = NEWS_RISK_PARAMS }) {
  const details = { news_state: news?.state ?? null, event: news?.event ?? null, tier: news?.event?.tier ?? news?.tier ?? null, minutes_to_event: news?.event?.minutes_to_event ?? null, impact: news?.event?.impact ?? null, source: news?.calendar?.source ?? null, calendar_freshness: news?.calendar?.freshness ?? null, block_ends_utc: news?.block_ends_utc ?? null, reason: news?.reason ?? null, normalization: news?.normalization ?? null, remembered_block: news?.remembered_block ?? null };
  if (!news) return { allowed: false, reason: 'NEWS_STATE_UNKNOWN', details };
  if (BLOCKING_NEWS_STATES.includes(news.state)) return { allowed: false, reason: 'NEWS_ENTRY_BLOCK', details };
  if (news.state === 'DATA_UNAVAILABLE') {
    if (params.dataUnavailablePolicy === 'ALLOW') {
      if (news.remembered_block?.active) return { allowed: false, reason: 'NEWS_REMEMBERED_EVENT_BLOCK', details: { ...details, block_ends_utc: news.remembered_block.block_ends_utc ?? null, event: news.remembered_block.contributing?.[0] ?? null } };
      return { allowed: true, reason: 'NEWS_DATA_UNAVAILABLE_ALLOWED', details };
    }
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
