/**
 * NEWS MONITOR -- the only I/O in the news layer. Owns a calendar PROVIDER
 * (pluggable), a cached, deduplicated, normalised event list, a persisted
 * snapshot (so a restart does not begin in DATA_UNAVAILABLE) and provider
 * health (last success, last attempt, consecutive failures, error).
 *
 * Providers (createCalendarProvider):
 *   http_json  GET a JSON array in the Forex Factory weekly-feed shape
 *              ({title,country,date,impact,forecast,previous}) or the internal
 *              shape, with a hard timeout, a minimum interval between fetches
 *              (rate-limit friendly) and no retries inside one call
 *   file       read the same shapes from a local JSON file the operator or an
 *              external licensed feed maintains (source_timestamp = file mtime)
 *   none       no calendar (state DISABLED, always audited)
 *
 * FOREX FACTORY ROLE: https://www.forexfactory.com/calendar is the human
 * reference/cross-check. The machine path used by http_json is the weekly
 * JSON the same calendar widget consumes (nfs.faireconomy.media). It is NOT a
 * scraper (no HTML, no session, one small GET per interval), it is technically
 * reliable in this environment (probed 2026-09-25: HTTP 200, JSON, cache
 * max-age 60 s, Last-Modified present) but its terms of automated third-party
 * use are not formally published, so the URL is configuration, the fetch
 * cadence is conservative (default 15 min), and any other provider can be
 * substituted without touching the state machine.
 *
 * evaluate() is SYNCHRONOUS over the cache and may schedule a background
 * refresh; a network problem can therefore never stall an entry decision or
 * the P&L monitor. The state machine (src/engine/newsRisk.js) turns provider
 * failure/staleness into DATA_UNAVAILABLE explicitly.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCalendar } from './newsCalendar.js';
import { evaluateNewsState, newsTransition, NEWS_RISK_PARAMS } from './newsRisk.js';

export const FOREX_FACTORY_WEEKLY_JSON_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export const DEFAULT_NEWS_SNAPSHOT_PATH = fileURLToPath(new URL('../../state/xauusd_news_calendar_snapshot.json', import.meta.url));
export const PROVIDER_KINDS = Object.freeze(['http_json', 'file', 'none']);

export function createCalendarProvider({ kind = 'none', url = FOREX_FACTORY_WEEKLY_JSON_URL, filePath = null, fetchImpl = globalThis.fetch, readFile = (p) => readFileSync(p, 'utf8'), fileMtime = (p) => statSync(p).mtime, timeoutMs = 10_000, minFetchIntervalSec = 900, userAgent = 'xauusd-mcp-news/1.0' } = {}) {
  if (!PROVIDER_KINDS.includes(kind)) throw new Error(`unknown calendar provider kind "${kind}"`);
  const source = kind === 'http_json' ? (url === FOREX_FACTORY_WEEKLY_JSON_URL ? 'forexfactory_json' : 'http_json') : kind;
  return {
    kind, source, url: kind === 'http_json' ? url : null, filePath: kind === 'file' ? filePath : null, minFetchIntervalSec,
    async fetch({ now }) {
      const fetchedAt = (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();
      if (kind === 'none') return { ok: false, disabled: true, source, error: null, raw: null, source_timestamp: null, fetched_at: fetchedAt };
      if (kind === 'file') {
        if (!filePath) return { ok: false, source, error: 'FILE_PATH_MISSING', raw: null, source_timestamp: null, fetched_at: fetchedAt };
        try {
          const raw = JSON.parse(readFile(filePath));
          const mtime = fileMtime(filePath);
          return { ok: true, source, error: null, raw: Array.isArray(raw) ? raw : raw?.events ?? [], source_timestamp: (mtime instanceof Date ? mtime : new Date(mtime)).toISOString(), fetched_at: fetchedAt };
        } catch (err) { return { ok: false, source, error: `FILE_READ_FAILED:${err.message}`, raw: null, source_timestamp: null, fetched_at: fetchedAt }; }
      }
      if (typeof fetchImpl !== 'function') return { ok: false, source, error: 'FETCH_UNAVAILABLE', raw: null, source_timestamp: null, fetched_at: fetchedAt };
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const resp = await fetchImpl(url, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: controller?.signal });
        if (!resp?.ok) return { ok: false, source, error: `HTTP_${resp?.status ?? 'NO_RESPONSE'}`, raw: null, source_timestamp: null, fetched_at: fetchedAt };
        const text = await resp.text();
        let raw;
        try { raw = JSON.parse(text); } catch { return { ok: false, source, error: 'INVALID_JSON', raw: null, source_timestamp: null, fetched_at: fetchedAt }; }
        if (!Array.isArray(raw)) return { ok: false, source, error: 'UNEXPECTED_SHAPE', raw: null, source_timestamp: null, fetched_at: fetchedAt };
        const lm = typeof resp.headers?.get === 'function' ? resp.headers.get('last-modified') : null;
        const lmMs = Date.parse(lm ?? '');
        return { ok: true, source, error: null, raw, source_timestamp: Number.isFinite(lmMs) ? new Date(lmMs).toISOString() : fetchedAt, fetched_at: fetchedAt, http_last_modified: lm ?? null };
      } catch (err) {
        return { ok: false, source, error: err?.name === 'AbortError' ? `TIMEOUT_${timeoutMs}MS` : `FETCH_FAILED:${err.message}`, raw: null, source_timestamp: null, fetched_at: fetchedAt };
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}

export function loadNewsSnapshot(path) {
  if (!path || !existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

export function saveNewsSnapshot(path, snapshot) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(snapshot, null, 2) + '\n');
  renameSync(tmp, path);
}

/**
 * createNewsMonitor({ provider, params, relevance, snapshotPath, now, log, _deps })
 *   refresh({ now, force })  async: one provider call (rate limited unless force)
 *   evaluate({ now })        sync: state from the cache; schedules a refresh when due
 *   status()                 provider health + last state
 */
export function createNewsMonitor({ provider, params = NEWS_RISK_PARAMS, relevance, snapshotPath = DEFAULT_NEWS_SNAPSHOT_PATH, now, log = () => {}, _deps = {} } = {}) {
  if (!provider) throw new Error('createNewsMonitor requires a provider');
  const deps = { loadSnapshot: _deps.loadSnapshot ?? loadNewsSnapshot, saveSnapshot: _deps.saveSnapshot ?? saveNewsSnapshot };
  const nowDate = () => (now ? now() : new Date());
  const cache = { events: [], counts: null, dropped: [], calendar: { status: provider.kind === 'none' ? 'DISABLED' : 'ERROR', source: provider.source, source_timestamp: null, last_success_at: null, last_attempt_at: null, error: provider.kind === 'none' ? null : 'NOT_FETCHED_YET', consecutive_failures: 0 } };
  let inflight = null;
  let lastState = null;
  const transitions = [];

  if (provider.kind !== 'none') {
    const snap = deps.loadSnapshot(snapshotPath);
    if (snap?.source === provider.source && Array.isArray(snap.events)) {
      cache.events = snap.events; cache.counts = snap.counts ?? null;
      cache.calendar = { ...cache.calendar, status: 'OK', source_timestamp: snap.source_timestamp ?? null, last_success_at: snap.fetched_at ?? null, error: null, restored_from_snapshot: true };
    }
  }

  function applyFetch(res) {
    cache.calendar.last_attempt_at = res.fetched_at;
    if (res.disabled) { cache.calendar = { ...cache.calendar, status: 'DISABLED', error: null }; return; }
    if (!res.ok) {
      cache.calendar = { ...cache.calendar, status: cache.events.length ? cache.calendar.status : 'ERROR', error: res.error, consecutive_failures: (cache.calendar.consecutive_failures ?? 0) + 1, last_error: res.error, last_error_at: res.fetched_at };
      log(`[news-monitor] calendar refresh failed (${res.error}); ${cache.events.length ? 'keeping the last good snapshot (freshness still enforced)' : 'no calendar data'}`);
      return;
    }
    const norm = normalizeCalendar(res.raw, { source: res.source, sourceTimestamp: res.source_timestamp, now: nowDate() });
    cache.events = norm.events; cache.counts = norm.counts; cache.dropped = norm.dropped;
    cache.calendar = { ...cache.calendar, status: 'OK', source: res.source, source_timestamp: res.source_timestamp, last_success_at: res.fetched_at, error: null, consecutive_failures: 0, restored_from_snapshot: false, http_last_modified: res.http_last_modified ?? null };
    try { deps.saveSnapshot(snapshotPath, { source: res.source, source_timestamp: res.source_timestamp, fetched_at: res.fetched_at, counts: norm.counts, events: norm.events }); } catch (err) { log(`[news-monitor] snapshot write failed: ${err.message}`); }
    if (norm.counts.unschedulable) log(`[news-monitor] ${norm.counts.unschedulable} event(s) dropped: time not unambiguously convertible to UTC`);
  }

  function refreshDue(nowMs) {
    if (provider.kind === 'none') return false;
    const last = Date.parse(cache.calendar.last_attempt_at ?? '');
    return !Number.isFinite(last) || nowMs - last >= provider.minFetchIntervalSec * 1000;
  }

  async function refresh({ now: at, force = false } = {}) {
    const t = at ?? nowDate();
    if (inflight) return inflight;
    if (!force && !refreshDue(t.getTime())) return { skipped: true, reason: 'RATE_LIMITED', calendar: cache.calendar };
    inflight = (async () => {
      try { applyFetch(await provider.fetch({ now: t })); } catch (err) { applyFetch({ ok: false, source: provider.source, error: `PROVIDER_THREW:${err.message}`, fetched_at: t.toISOString() }); }
      return { skipped: false, calendar: cache.calendar, counts: cache.counts };
    })();
    try { return await inflight; } finally { inflight = null; }
  }

  function evaluate({ now: at, scheduleRefresh = true, bars15m = null } = {}) {
    const t = at ?? nowDate();
    if (scheduleRefresh && !inflight && refreshDue(t.getTime())) refresh({ now: t }).catch(() => {});
    // bars15m: COMPLETED 15m bars supplied by the executor (V2 Tier A/B normalisation); evidence only, never required.
    const next = evaluateNewsState({ events: cache.events, now: t, calendar: cache.calendar, params, relevance, bars15m });
    const tr = newsTransition(lastState, next, t);
    if (tr) { transitions.push(tr); if (transitions.length > 200) transitions.shift(); }
    lastState = next;
    return { ...next, transition: tr };
  }

  function status() {
    return { provider: { kind: provider.kind, source: provider.source, url: provider.url, file: provider.filePath, min_fetch_interval_sec: provider.minFetchIntervalSec }, calendar: cache.calendar, counts: cache.counts, dropped: cache.dropped.slice(0, 10), last_state: lastState ? { state: lastState.state, reason: lastState.reason, event: lastState.event, next_event: lastState.next_event, block_ends_utc: lastState.block_ends_utc ?? null } : null, recent_transitions: transitions.slice(-10), params };
  }

  return { refresh, evaluate, status, events: () => cache.events.slice(), _cache: cache };
}
