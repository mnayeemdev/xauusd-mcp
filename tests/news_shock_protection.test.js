/**
 * NEWS + VOLATILITY SHOCK PROTECTION V1 (2026-09-25).
 *
 *   src/engine/newsCalendar.js     event normalisation, timezone policy, dedup, gold relevance
 *   src/engine/newsRisk.js         deterministic news state machine + entry verdict
 *   src/engine/newsMonitor.js      providers (http_json / file / none), cache, snapshot, health
 *   src/engine/marketShock.js      spread / velocity / jump / range shock detector, spread gate, emergency
 *   src/engine/protectionGuards.js entry-guard interface
 *   src/engine/mt5RealPolicy.js    REAL config envelope for the layer
 *   src/engine/mt5Executor.js      REAL integration: entry veto, block/normalise audit, fast safety monitor
 *
 * Pure functions + scripted REAL bridge. No network, no files, no terminal, no orders.
 * The REAL authorities (exact 0.01 lot, entry engine, adaptive management,
 * thesis exits, broker SL/TP, one-position, dedup/fresh-signal, consecutive
 * losses, kill switch) are exercised unchanged around the new layer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeImpact, parseEventTimeUtc, normalizeEvent, normalizeCalendar, dedupeEvents, isGoldRelevant, calendarFreshness, eventIdFor, IMPACT, EVENT_STATUS } from '../src/engine/newsCalendar.js';
import { evaluateNewsState, evaluateNewsEntryPolicy, newsTransition, NEWS_STATES, BLOCKING_NEWS_STATES, NEWS_RISK_PARAMS } from '../src/engine/newsRisk.js';
import { createCalendarProvider, createNewsMonitor, FOREX_FACTORY_WEEKLY_JSON_URL, PROVIDER_KINDS } from '../src/engine/newsMonitor.js';
import { SHOCK_PARAMS, SHOCK_STATES, initialShockState, computeSpreadBaseline, computeAtrContext, evaluateShockSignals, advanceShockState, evaluateSpreadGate, evaluateEmergency } from '../src/engine/marketShock.js';
import { runEntryGuards, createNewsGuard, createShockGuard, createFeedHealthGuard, createSpreadGuard, createNormalizationGuard } from '../src/engine/protectionGuards.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { resolveExecutorConfig } from '../src/engine/mt5Policy.js';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { permissiveNewsMonitor, scriptedNewsMonitor, memoryProvider, fixtureCalendarMonitor } from './fixtures/news_test_monitor.js';

const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ff_calendar_synthetic.json', import.meta.url)), 'utf8'));
const NOON = new Date('2026-09-25T12:00:00.000Z');
const at = (iso) => new Date(iso);
const T = (m) => 1790337600 + m * 60; // 2026-09-25T12:00:00Z + minutes, unix seconds
const CAL_OK = { status: 'OK', source: 'test', source_timestamp: '2026-09-25T12:00:00.000Z', last_success_at: '2026-09-25T12:00:00.000Z', error: null, consecutive_failures: 0 };
const ev = (over = {}) => normalizeEvent({ title: 'Synthetic CPI m/m', country: 'USD', date: '2026-09-25T12:30:00Z', impact: 'High', forecast: '0.3%', previous: '0.2%', ...over }, { source: 'test', sourceTimestamp: CAL_OK.source_timestamp, now: NOON });

// ── A. newsCalendar ────────────────────────────────────────────────────
describe('newsCalendar: normalisation, timezone policy, dedup, relevance', () => {
  it('impact aliases map to the closed vocabulary; unknown stays UNKNOWN', () => {
    assert.equal(normalizeImpact('High'), IMPACT.HIGH); assert.equal(normalizeImpact('red'), IMPACT.HIGH); assert.equal(normalizeImpact(3), IMPACT.HIGH);
    assert.equal(normalizeImpact('Medium'), IMPACT.MEDIUM); assert.equal(normalizeImpact('orange'), IMPACT.MEDIUM);
    assert.equal(normalizeImpact('Low'), IMPACT.LOW); assert.equal(normalizeImpact('Non-Economic'), IMPACT.LOW); assert.equal(normalizeImpact('Holiday'), IMPACT.HOLIDAY);
    assert.equal(normalizeImpact(undefined), IMPACT.UNKNOWN); assert.equal(normalizeImpact('purple'), IMPACT.UNKNOWN);
  });
  it('a time is accepted only with an explicit Z/offset, as an epoch, or as a naive string with a KNOWN source offset; never guessed', () => {
    assert.deepEqual(parseEventTimeUtc('2026-09-25T08:30:00-04:00'), { iso: '2026-09-25T12:30:00.000Z', error: null });
    assert.deepEqual(parseEventTimeUtc('2026-09-25T12:30:00Z'), { iso: '2026-09-25T12:30:00.000Z', error: null });
    assert.deepEqual(parseEventTimeUtc(1790339400), { iso: '2026-09-25T12:30:00.000Z', error: null });
    assert.deepEqual(parseEventTimeUtc(1790339400000), { iso: '2026-09-25T12:30:00.000Z', error: null });
    assert.deepEqual(parseEventTimeUtc('2026-09-25 08:30', { sourceOffsetMinutes: -240 }), { iso: '2026-09-25T12:30:00.000Z', error: null });
    assert.deepEqual(parseEventTimeUtc('2026-09-25 08:30'), { iso: null, error: 'TIMEZONE_AMBIGUOUS' });
    assert.deepEqual(parseEventTimeUtc('tomorrow 8am'), { iso: null, error: 'TIME_UNPARSEABLE' });
    assert.deepEqual(parseEventTimeUtc(''), { iso: null, error: 'TIME_MISSING' }); assert.deepEqual(parseEventTimeUtc(null), { iso: null, error: 'TIME_MISSING' });
  });
  it('normalizeEvent: Forex-Factory shape and internal shape produce the same deterministic event_id and status', () => {
    const a = ev();
    const b = normalizeEvent({ event_name: 'Synthetic CPI m/m', currency: 'usd', event_time_utc: '2026-09-25T08:30:00-04:00', impact: 'HIGH' }, { source: 'other', now: NOON });
    assert.equal(a.event_id, b.event_id); assert.equal(a.event_id, eventIdFor({ currency: 'USD', event_name: 'Synthetic CPI m/m', event_time_utc: '2026-09-25T12:30:00.000Z' }));
    assert.equal(a.status, EVENT_STATUS.SCHEDULED); assert.equal(a.impact, IMPACT.HIGH); assert.equal(a.currency, 'USD'); assert.equal(a.actual, null); assert.equal(a.forecast, '0.3%');
    assert.equal(normalizeEvent({ title: 'X', country: 'USD', date: '2026-09-25T11:00:00Z', impact: 'High' }, { now: NOON }).status, EVENT_STATUS.RELEASED, 'past time => RELEASED');
    assert.equal(normalizeEvent({ title: 'X', country: 'USD', date: '2026-09-25T13:00:00Z', impact: 'High', actual: '0.4%' }, { now: NOON }).status, EVENT_STATUS.RELEASED, 'an actual value => RELEASED');
    const naive = normalizeEvent({ title: 'X', country: 'USD', date: '2026-09-25 13:30', impact: 'High' }, { now: NOON });
    assert.equal(naive.status, EVENT_STATUS.UNSCHEDULABLE); assert.equal(naive.parse_error, 'TIMEZONE_AMBIGUOUS'); assert.equal(naive.event_time_utc, null);
  });
  it('normalizeCalendar over the synthetic Forex-Factory fixture: 11 received, 1 unschedulable (naive time), 1 duplicate, 9 unique, time-sorted', () => {
    const n = normalizeCalendar(FIXTURE, { source: 'forexfactory_json', sourceTimestamp: CAL_OK.source_timestamp, now: NOON });
    assert.deepEqual(n.counts, { received: 11, usable: 10, unique: 9, unschedulable: 1, duplicates: 1 });
    assert.deepEqual(n.dropped, [{ event_name: 'Naive Time Event', currency: 'USD', parse_error: 'TIMEZONE_AMBIGUOUS' }]);
    const times = n.events.map((e) => Date.parse(e.event_time_utc));
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.equal(n.events.filter((e) => e.event_name === 'Synthetic CPI m/m').length, 1);
    assert.equal(n.events.find((e) => e.event_name === 'Bank Holiday').status, EVENT_STATUS.RELEASED);
    assert.equal(n.events.find((e) => e.event_name === 'Synthetic CPI m/m').status, EVENT_STATUS.SCHEDULED);
  });
  it('dedupe keeps the newest source_timestamp; on a tie the record carrying an actual wins', () => {
    const older = ev({}); const newer = { ...ev({ actual: '0.4%' }), source_timestamp: '2026-09-25T12:31:00.000Z' };
    assert.equal(dedupeEvents([newer, older])[0].actual, '0.4%'); assert.equal(dedupeEvents([older, newer])[0].actual, '0.4%');
    const tieA = ev({}); const tieB = ev({ actual: '0.4%' });
    assert.equal(dedupeEvents([tieA, tieB])[0].actual, '0.4%'); assert.equal(dedupeEvents([tieB, tieA])[0].actual, '0.4%');
  });
  it('gold relevance: USD HIGH; USD central-bank decision at any grade; nothing else, never a direction', () => {
    assert.equal(isGoldRelevant(ev()), true);
    assert.equal(isGoldRelevant(ev({ title: 'FOMC Statement', impact: 'Medium' })), true);
    assert.equal(isGoldRelevant(ev({ title: 'Federal Funds Rate', impact: 'Low' })), true);
    assert.equal(isGoldRelevant(ev({ title: 'Fed Chair Powell Speaks', impact: 'Low' })), true);
    assert.equal(isGoldRelevant(ev({ title: 'FOMC Member Speaks', impact: 'Low' })), false, 'a member speech is not a decision');
    assert.equal(isGoldRelevant(ev({ title: 'Unemployment Claims', impact: 'Medium' })), false);
    assert.equal(isGoldRelevant(ev({ title: 'ECB Press Conference', country: 'EUR', impact: 'High' })), false);
    assert.equal(isGoldRelevant(ev({ title: 'Bank Holiday', country: 'JPY', impact: 'Holiday' })), false);
    assert.equal(isGoldRelevant({ ...ev(), event_time_utc: null }), false, 'no time => never relevant');
    assert.equal(isGoldRelevant(null), false);
  });
  it('calendar freshness is explicit and fails closed without a source timestamp', () => {
    assert.deepEqual(calendarFreshness({ sourceTimestamp: '2026-09-25T11:00:00Z', now: NOON, staleAfterSec: 21600 }), { age_sec: 3600, fresh: true, reason: 'OK' });
    assert.deepEqual(calendarFreshness({ sourceTimestamp: '2026-09-25T05:00:00Z', now: NOON, staleAfterSec: 21600 }), { age_sec: 25200, fresh: false, reason: 'STALE' });
    assert.deepEqual(calendarFreshness({ sourceTimestamp: null, now: NOON, staleAfterSec: 21600 }), { age_sec: null, fresh: false, reason: 'SOURCE_TIMESTAMP_MISSING' });
  });
});

// ── B. newsRisk state machine ─────────────────────────────────────────
describe('newsRisk: deterministic state machine and entry verdict', () => {
  const events = [ev()]; // CPI 12:30Z, HIGH USD
  const state = (iso, over = {}) => evaluateNewsState({ events, now: at(iso), calendar: CAL_OK, ...over });
  it('vocabulary is closed; blocking states are exactly PRE/ACTIVE/COOLDOWN; defaults 30/5/30 min, 6 h stale, BLOCK', () => {
    assert.deepEqual(NEWS_STATES, ['NORMAL', 'PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'DATA_UNAVAILABLE', 'DISABLED']);
    assert.deepEqual(BLOCKING_NEWS_STATES, ['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']);
    assert.equal(NEWS_RISK_PARAMS.preNewsWindowMin, 30); assert.equal(NEWS_RISK_PARAMS.newsActiveWindowMin, 5); assert.equal(NEWS_RISK_PARAMS.postNewsCooldownMin, 30); assert.equal(NEWS_RISK_PARAMS.staleCalendarSec, 21600); assert.equal(NEWS_RISK_PARAMS.dataUnavailablePolicy, 'BLOCK');
  });
  it('window boundaries (V2, CPI = Tier B): NORMAL -> PRE_NEWS (T-30m) -> NEWS_ACTIVE (T..T+5m) -> POST_NEWS_COOLDOWN (..T+60m clock minimum, no bars => no extension) -> NORMAL', () => {
    const s0 = state('2026-09-25T11:59:59Z'); assert.equal(s0.state, 'NORMAL'); assert.equal(s0.next_event.event_name, 'Synthetic CPI m/m'); assert.equal(s0.next_event.minutes_to_event, 30); assert.equal(s0.next_event.tier, 'B');
    const s1 = state('2026-09-25T12:00:00Z'); assert.equal(s1.state, 'PRE_NEWS'); assert.equal(s1.block_ends_utc, '2026-09-25T12:30:00.000Z'); assert.equal(s1.event.minutes_to_event, 30); assert.equal(s1.reason, 'PRE_NEWS:Synthetic CPI m/m'); assert.equal(s1.event.tier, 'B');
    assert.equal(state('2026-09-25T12:29:59Z').state, 'PRE_NEWS');
    const s2 = state('2026-09-25T12:30:00Z'); assert.equal(s2.state, 'NEWS_ACTIVE'); assert.equal(s2.block_ends_utc, '2026-09-25T12:35:00.000Z'); assert.equal(s2.event.minutes_to_event, 0);
    assert.equal(state('2026-09-25T12:34:59Z').state, 'NEWS_ACTIVE');
    const s3 = state('2026-09-25T12:35:00Z'); assert.equal(s3.state, 'POST_NEWS_COOLDOWN'); assert.equal(s3.block_ends_utc, '2026-09-25T13:30:00.000Z', 'Tier B: 5 min active + 55 min cooldown = T+60'); assert.equal(s3.event.clock_min_end_utc, '2026-09-25T13:30:00.000Z');
    assert.equal(state('2026-09-25T13:04:59Z').state, 'POST_NEWS_COOLDOWN', 'the V1 T+35 boundary no longer ends a Tier-B block');
    assert.equal(state('2026-09-25T13:29:59Z').state, 'POST_NEWS_COOLDOWN');
    const s4 = state('2026-09-25T13:30:00Z'); assert.equal(s4.state, 'NORMAL', 'without completed 15m bars there is no normalisation extension (audited), the block ends at the clock minimum'); assert.equal(s4.next_event, null); assert.equal(s4.block_ends_utc, undefined);
    // Tier C (generic, V1 windows) is unchanged: T+35.
    const c = evaluateNewsState({ events: [ev({ title: 'Synthetic PPI m/m' })], now: at('2026-09-25T12:35:00Z'), calendar: CAL_OK });
    assert.equal(c.state, 'POST_NEWS_COOLDOWN'); assert.equal(c.block_ends_utc, '2026-09-25T13:05:00.000Z'); assert.equal(c.event.tier, 'C');
    assert.equal(evaluateNewsState({ events: [ev({ title: 'Synthetic PPI m/m' })], now: at('2026-09-25T13:05:00Z'), calendar: CAL_OK }).state, 'NORMAL');
  });
  it('same events + same clock => identical output (determinism); windows are parameters, not constants', () => {
    assert.equal(JSON.stringify(state('2026-09-25T12:10:00Z')), JSON.stringify(state('2026-09-25T12:10:00Z')));
    const p = { ...NEWS_RISK_PARAMS, preNewsWindowMin: 10 };
    assert.equal(state('2026-09-25T12:10:00Z', { params: p }).state, 'NORMAL'); assert.equal(state('2026-09-25T12:20:00Z', { params: p }).state, 'PRE_NEWS');
  });
  it('overlapping windows: NEWS_ACTIVE outranks PRE_NEWS outranks COOLDOWN; all contributing events are reported', () => {
    const two = [ev(), ev({ title: 'Federal Funds Rate', date: '2026-09-25T12:33:00Z' })];
    const s = evaluateNewsState({ events: two, now: at('2026-09-25T12:31:00Z'), calendar: CAL_OK });
    assert.equal(s.state, 'NEWS_ACTIVE'); assert.equal(s.event.event_name, 'Synthetic CPI m/m'); assert.equal(s.contributing_events.length, 2); assert.equal(s.contributing_events[1].phase, 'PRE_NEWS');
    const later = evaluateNewsState({ events: two, now: at('2026-09-25T12:36:00Z'), calendar: CAL_OK });
    assert.equal(later.state, 'NEWS_ACTIVE', 'FFR active (12:33-12:38) outranks CPI cooldown'); assert.equal(later.event.event_name, 'Federal Funds Rate'); assert.equal(later.block_ends_utc, '2026-09-25T13:30:00.000Z', 'block end = latest end of the CURRENT phases (CPI Tier-B cooldown, T+60); the FFR Tier-A cooldown is reported once it begins'); assert.equal(later.contributing_events.map((c) => c.phase).sort().join('+'), 'NEWS_ACTIVE+POST_NEWS_COOLDOWN');
  });
  it('irrelevant events never open a window: USD Medium, EUR High, JPY holiday', () => {
    const irrelevant = [ev({ title: 'Unemployment Claims', impact: 'Medium' }), ev({ title: 'ECB Press Conference', country: 'EUR' }), ev({ title: 'Bank Holiday', country: 'JPY', impact: 'Holiday' })];
    const s = evaluateNewsState({ events: irrelevant, now: at('2026-09-25T12:31:00Z'), calendar: CAL_OK });
    assert.equal(s.state, 'NORMAL'); assert.equal(s.relevant_count, 0);
  });
  it('DISABLED when no provider; DATA_UNAVAILABLE on provider error without data, on stale data, or missing events', () => {
    assert.equal(evaluateNewsState({ events, now: NOON, calendar: null }).state, 'DISABLED');
    assert.equal(evaluateNewsState({ events, now: NOON, calendar: { status: 'NONE' } }).reason, 'NO_CALENDAR_PROVIDER');
    assert.equal(evaluateNewsState({ events, now: NOON, calendar: { status: 'DISABLED' } }).reason, 'CALENDAR_DISABLED');
    const err = evaluateNewsState({ events: [], now: NOON, calendar: { status: 'ERROR', error: 'HTTP_503', source_timestamp: null } });
    assert.equal(err.state, 'DATA_UNAVAILABLE'); assert.equal(err.reason, 'PROVIDER_ERROR:HTTP_503');
    const stale = evaluateNewsState({ events, now: at('2026-09-25T18:00:01Z'), calendar: CAL_OK });
    assert.equal(stale.state, 'DATA_UNAVAILABLE'); assert.equal(stale.reason, 'CALENDAR_STALE'); assert.equal(stale.calendar.freshness.fresh, false);
    assert.equal(evaluateNewsState({ events: undefined, now: NOON, calendar: CAL_OK }).reason, 'EVENTS_MISSING');
    assert.equal(evaluateNewsState({ events, now: NOON, calendar: { ...CAL_OK, source_timestamp: null } }).reason, 'SOURCE_TIMESTAMP_MISSING');
  });
  it('a provider error AFTER a good fetch keeps evaluating the fresh cached events (freshness still enforced)', () => {
    const s = evaluateNewsState({ events, now: at('2026-09-25T12:10:00Z'), calendar: { ...CAL_OK, status: 'ERROR', error: 'HTTP_503', consecutive_failures: 2 } });
    assert.equal(s.state, 'PRE_NEWS'); assert.equal(s.calendar.consecutive_failures, 2);
    assert.equal(evaluateNewsState({ events, now: at('2026-09-25T18:10:00Z'), calendar: { ...CAL_OK, status: 'ERROR', error: 'HTTP_503' } }).state, 'DATA_UNAVAILABLE');
  });
  it('entry verdict: blocking states block; DATA_UNAVAILABLE blocks by default and is audited when allowed; DISABLED/NORMAL allow; unknown blocks', () => {
    for (const st of BLOCKING_NEWS_STATES) { const v = evaluateNewsEntryPolicy({ news: { state: st, event: { minutes_to_event: 3, impact: 'HIGH' } } }); assert.equal(v.allowed, false); assert.equal(v.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(v.details.minutes_to_event, 3); }
    assert.deepEqual(evaluateNewsEntryPolicy({ news: { state: 'DATA_UNAVAILABLE', reason: 'CALENDAR_STALE' } }).reason, 'NEWS_DATA_UNAVAILABLE_BLOCK');
    const allowed = evaluateNewsEntryPolicy({ news: { state: 'DATA_UNAVAILABLE', reason: 'CALENDAR_STALE' }, params: { ...NEWS_RISK_PARAMS, dataUnavailablePolicy: 'ALLOW' } });
    assert.equal(allowed.allowed, true); assert.equal(allowed.reason, 'NEWS_DATA_UNAVAILABLE_ALLOWED'); assert.equal(allowed.details.reason, 'CALENDAR_STALE');
    assert.equal(evaluateNewsEntryPolicy({ news: { state: 'DISABLED' } }).reason, 'NEWS_DISABLED');
    assert.equal(evaluateNewsEntryPolicy({ news: { state: 'NORMAL' } }).reason, 'OK');
    assert.equal(evaluateNewsEntryPolicy({ news: null }).reason, 'NEWS_STATE_UNKNOWN');
  });
  it('transitions are recorded only on a state or event change', () => {
    const a = state('2026-09-25T12:10:00Z'), b = state('2026-09-25T12:11:00Z'), c = state('2026-09-25T12:31:00Z');
    assert.equal(newsTransition(a, b, at('2026-09-25T12:11:00Z')), null);
    const tr = newsTransition(b, c, at('2026-09-25T12:31:00Z'));
    assert.equal(tr.from, 'PRE_NEWS'); assert.equal(tr.to, 'NEWS_ACTIVE'); assert.equal(tr.at, '2026-09-25T12:31:00.000Z'); assert.equal(tr.event.event_name, 'Synthetic CPI m/m');
    assert.equal(newsTransition(null, a, NOON).from, null);
  });
});

// ── C. newsMonitor (providers, cache, snapshot, health) ───────────────
describe('newsMonitor: providers, rate limiting, snapshot, health', () => {
  const okResp = (raw, lastModified = null) => ({ ok: true, status: 200, text: async () => JSON.stringify(raw), headers: { get: (k) => (k === 'last-modified' ? lastModified : null) } });
  it('provider kinds are closed; an unknown kind throws; the default URL is the Forex Factory weekly JSON over https', () => {
    assert.deepEqual(PROVIDER_KINDS, ['http_json', 'file', 'none']);
    assert.throws(() => createCalendarProvider({ kind: 'scrape' }), /unknown calendar provider kind/);
    assert.match(FOREX_FACTORY_WEEKLY_JSON_URL, /^https:\/\/nfs\.faireconomy\.media\//);
    assert.equal(createCalendarProvider({ kind: 'http_json' }).source, 'forexfactory_json'); assert.equal(createCalendarProvider({ kind: 'http_json', url: 'https://example.test/cal.json' }).source, 'http_json');
  });
  it('http_json: one GET with a user agent; Last-Modified becomes source_timestamp; HTTP error, invalid JSON, wrong shape and timeout are explicit failures', async () => {
    const calls = [];
    const p = createCalendarProvider({ kind: 'http_json', fetchImpl: async (url, opts) => { calls.push({ url, opts }); return okResp(FIXTURE, 'Fri, 25 Sep 2026 11:50:00 GMT'); } });
    const r = await p.fetch({ now: NOON });
    assert.equal(r.ok, true); assert.equal(r.source_timestamp, '2026-09-25T11:50:00.000Z'); assert.equal(r.raw.length, 11); assert.equal(calls[0].url, FOREX_FACTORY_WEEKLY_JSON_URL); assert.match(calls[0].opts.headers['user-agent'], /xauusd-mcp-news/);
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: async () => okResp(FIXTURE) }).fetch({ now: NOON })).source_timestamp, NOON.toISOString(), 'no Last-Modified => fetched_at');
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: async () => ({ ok: false, status: 503 }) }).fetch({ now: NOON })).error, 'HTTP_503');
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>', headers: { get: () => null } }) }).fetch({ now: NOON })).error, 'INVALID_JSON');
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: async () => okResp({ events: 1 }) }).fetch({ now: NOON })).error, 'UNEXPECTED_SHAPE');
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: async () => { throw new Error('ECONNRESET'); } }).fetch({ now: NOON })).error, 'FETCH_FAILED:ECONNRESET');
    const hang = createCalendarProvider({ kind: 'http_json', timeoutMs: 10, fetchImpl: (_u, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); })) });
    assert.equal((await hang.fetch({ now: NOON })).error, 'TIMEOUT_10MS');
    assert.equal((await createCalendarProvider({ kind: 'http_json', fetchImpl: null }).fetch({ now: NOON })).error, 'FETCH_UNAVAILABLE');
  });
  it('file: reads the same shapes from a local JSON file with the file mtime as source_timestamp; missing path / unreadable file fail explicitly', async () => {
    const p = createCalendarProvider({ kind: 'file', filePath: 'C:/cal.json', readFile: () => JSON.stringify({ events: FIXTURE }), fileMtime: () => new Date('2026-09-25T11:45:00Z') });
    const r = await p.fetch({ now: NOON });
    assert.equal(r.ok, true); assert.equal(r.source, 'file'); assert.equal(r.raw.length, 11); assert.equal(r.source_timestamp, '2026-09-25T11:45:00.000Z');
    assert.equal((await createCalendarProvider({ kind: 'file' }).fetch({ now: NOON })).error, 'FILE_PATH_MISSING');
    assert.match((await createCalendarProvider({ kind: 'file', filePath: 'x', readFile: () => { throw new Error('ENOENT'); } }).fetch({ now: NOON })).error, /^FILE_READ_FAILED:ENOENT/);
    const none = await createCalendarProvider({ kind: 'none' }).fetch({ now: NOON }); assert.equal(none.disabled, true);
  });
  it('monitor over an in-memory provider: refresh normalises + snapshots; evaluate is synchronous over the cache and records transitions; status exposes health', async () => {
    const saved = [];
    const provider = memoryProvider([{ ok: true, raw: FIXTURE, source_timestamp: '2026-09-25T11:50:00.000Z' }]);
    let t = at('2026-09-25T12:00:00Z');
    const m = createNewsMonitor({ provider, now: () => t, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: (_p, s) => saved.push(s) } });
    assert.equal(m.status().calendar.status, 'ERROR'); assert.equal(m.status().calendar.error, 'NOT_FETCHED_YET');
    assert.equal(m.evaluate({ now: t, scheduleRefresh: false }).state, 'DATA_UNAVAILABLE', 'before the first fetch the calendar is not trusted');
    const r = await m.refresh({ now: t });
    assert.equal(r.skipped, false); assert.deepEqual(r.counts, { received: 11, usable: 10, unique: 9, unschedulable: 1, duplicates: 1 });
    assert.equal(saved.length, 1); assert.equal(saved[0].source, 'memory'); assert.equal(saved[0].events.length, 9);
    const s = m.evaluate({ now: t, scheduleRefresh: false });
    assert.equal(s.state, 'PRE_NEWS'); assert.equal(s.event.event_name, 'Synthetic CPI m/m'); assert.equal(s.transition.from, 'DATA_UNAVAILABLE'); assert.equal(s.transition.to, 'PRE_NEWS');
    assert.equal(m.evaluate({ now: t, scheduleRefresh: false }).transition, null);
    t = at('2026-09-25T12:31:00Z');
    assert.equal(m.evaluate({ now: t, scheduleRefresh: false }).state, 'NEWS_ACTIVE');
    const st = m.status();
    assert.equal(st.calendar.status, 'OK'); assert.equal(st.calendar.consecutive_failures, 0); assert.equal(st.last_state.state, 'NEWS_ACTIVE'); assert.deepEqual(st.recent_transitions.map((x) => x.to), ['DATA_UNAVAILABLE', 'PRE_NEWS', 'NEWS_ACTIVE']); assert.deepEqual(st.dropped, [{ event_name: 'Naive Time Event', currency: 'USD', parse_error: 'TIMEZONE_AMBIGUOUS' }]);
    assert.equal(m.events().length, 9);
  });
  it('rate limiting: a refresh inside minFetchIntervalSec is skipped unless forced; concurrent refreshes share one provider call', async () => {
    const provider = memoryProvider([{ ok: true, raw: FIXTURE }], { minFetchIntervalSec: 900 });
    const m = createNewsMonitor({ provider, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    const [a, b] = await Promise.all([m.refresh({ now: NOON }), m.refresh({ now: NOON })]);
    assert.equal(a.skipped, false); assert.equal(b.skipped, false); assert.equal(provider.calls.length, 1, 'in-flight refresh is shared');
    assert.equal((await m.refresh({ now: at('2026-09-25T12:10:00Z') })).reason, 'RATE_LIMITED'); assert.equal(provider.calls.length, 1);
    assert.equal((await m.refresh({ now: at('2026-09-25T12:10:00Z'), force: true })).skipped, false); assert.equal(provider.calls.length, 2);
    assert.equal((await m.refresh({ now: at('2026-09-25T12:26:00Z') })).skipped, false); assert.equal(provider.calls.length, 3);
    m.evaluate({ now: at('2026-09-25T12:27:00Z') }); assert.equal(provider.calls.length, 3, 'evaluate schedules a refresh only when due');
    m.evaluate({ now: at('2026-09-25T12:42:00Z') }); await new Promise((r) => setImmediate(r)); assert.equal(provider.calls.length, 4, 'evaluate scheduled the due refresh in the background');
  });
  it('a failure after a good fetch keeps the last good events (status stays OK, failures counted); a failure before any data is ERROR; freshness still expires the data', async () => {
    const logs = [];
    const provider = memoryProvider([{ ok: true, raw: FIXTURE, source_timestamp: '2026-09-25T11:50:00.000Z' }, { ok: false, error: 'HTTP_503' }]);
    const m = createNewsMonitor({ provider, snapshotPath: 'mem', log: (l) => logs.push(l), _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    await m.refresh({ now: NOON }); await m.refresh({ now: at('2026-09-25T12:20:00Z'), force: true }); await m.refresh({ now: at('2026-09-25T12:40:00Z'), force: true });
    const c = m.status().calendar;
    assert.equal(c.status, 'OK'); assert.equal(c.consecutive_failures, 2); assert.equal(c.last_error, 'HTTP_503'); assert.equal(c.last_success_at, NOON.toISOString()); assert.equal(m.events().length, 9);
    assert.ok(logs.some((l) => /keeping the last good snapshot/.test(l)));
    assert.equal(m.evaluate({ now: at('2026-09-25T12:45:00Z'), scheduleRefresh: false }).state, 'POST_NEWS_COOLDOWN', 'cached events still drive the state');
    assert.equal(m.evaluate({ now: at('2026-09-25T18:00:00Z'), scheduleRefresh: false }).state, 'DATA_UNAVAILABLE', '6 h after the source timestamp the data is stale');
    const bad = createNewsMonitor({ provider: memoryProvider([{ ok: false, error: 'HTTP_503' }]), snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    await bad.refresh({ now: NOON }); assert.equal(bad.status().calendar.status, 'ERROR'); assert.equal(bad.evaluate({ now: NOON, scheduleRefresh: false }).reason, 'PROVIDER_ERROR:HTTP_503');
    const thrower = { kind: 'http_json', source: 'x', url: null, filePath: null, minFetchIntervalSec: 0, fetch: async () => { throw new Error('boom'); } };
    const t = createNewsMonitor({ provider: thrower, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    await t.refresh({ now: NOON }); assert.equal(t.status().calendar.error, 'PROVIDER_THREW:boom');
  });
  it('a persisted snapshot from the same source restores the cache at construction (no DATA_UNAVAILABLE after a restart); another source is ignored', () => {
    const norm = normalizeCalendar(FIXTURE, { source: 'forexfactory_json', sourceTimestamp: '2026-09-25T11:50:00.000Z', now: NOON });
    const snap = { source: 'forexfactory_json', source_timestamp: '2026-09-25T11:50:00.000Z', fetched_at: '2026-09-25T11:55:00.000Z', counts: norm.counts, events: norm.events };
    const provider = createCalendarProvider({ kind: 'http_json', fetchImpl: async () => okResp(FIXTURE) });
    const m = createNewsMonitor({ provider, snapshotPath: 'mem', _deps: { loadSnapshot: () => snap, saveSnapshot: () => {} } });
    assert.equal(m.status().calendar.status, 'OK'); assert.equal(m.status().calendar.restored_from_snapshot, true); assert.equal(m.evaluate({ now: at('2026-09-25T12:10:00Z'), scheduleRefresh: false }).state, 'PRE_NEWS');
    const other = createNewsMonitor({ provider, snapshotPath: 'mem', _deps: { loadSnapshot: () => ({ ...snap, source: 'file' }), saveSnapshot: () => {} } });
    assert.equal(other.status().calendar.status, 'ERROR'); assert.equal(other.events().length, 0);
  });
  it('provider none => DISABLED (audited, never DATA_UNAVAILABLE); a monitor needs a provider', async () => {
    const m = createNewsMonitor({ provider: createCalendarProvider({ kind: 'none' }), snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: () => {} } });
    assert.equal(m.evaluate({ now: NOON }).state, 'DISABLED'); await m.refresh({ now: NOON, force: true }); assert.equal(m.status().calendar.status, 'DISABLED');
    assert.throws(() => createNewsMonitor({}), /requires a provider/);
  });
});

// ── D. marketShock ─────────────────────────────────────────────────────
const BID = 4265.158, ASK = 4265.418, SPREAD = 0.26;
function sampleSeries({ nowSec, spanSec = 1800, stepSec = 3, spread = SPREAD, bid = BID, mutate = null }) {
  const out = [];
  for (let t = nowSec - spanSec; t <= nowSec; t += stepSec) {
    const s = { t, tick_time: t, bid, ask: bid + spread, spread };
    out.push(mutate ? mutate(s, nowSec - t) : s);
  }
  return out;
}
const bars5m = ({ count = 20, endSec = T(0), close = 4265, halfRange = 0.5, lastOver = {} } = {}) => Array.from({ length: count }, (_, i) => { const b = { time: endSec - (count - i) * 300, open: close, high: close + halfRange, low: close - halfRange, close }; return i === count - 1 ? { ...b, ...lastOver } : b; });

describe('marketShock: baselines, signals, state machine, spread gate, emergency', () => {
  const NOW = T(0);
  it('defaults are the documented ones and the vocabulary is closed', () => {
    assert.deepEqual(SHOCK_STATES, ['INSUFFICIENT_DATA', 'NORMAL', 'VOLATILITY_SHOCK']);
    assert.equal(SHOCK_PARAMS.spreadShockRatio, 3.0); assert.equal(SHOCK_PARAMS.spreadShockMinAbs, 0.5); assert.equal(SHOCK_PARAMS.spreadEntryRatio, 2.0); assert.equal(SHOCK_PARAMS.velocityShockAtr, 1.5); assert.equal(SHOCK_PARAMS.jumpShockAtr, 1.0); assert.equal(SHOCK_PARAMS.rangeShockAtr, 3.0);
    assert.equal(SHOCK_PARAMS.confirmSamples, 2); assert.equal(SHOCK_PARAMS.clearAfterSec, 600); assert.equal(SHOCK_PARAMS.feedStaleSec, 90); assert.equal(SHOCK_PARAMS.baselineMinSamples, 20); assert.equal(SHOCK_PARAMS.emergencyBoundaryToleranceUsd, 0.5);
    assert.deepEqual(initialShockState().state, 'INSUFFICIENT_DATA');
  });
  it('spread baseline = median of the window EXCLUDING the last 60 s (a spike cannot inflate its own baseline); needs 20 samples', () => {
    const spiky = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age < 60 ? { ...s, spread: 5, ask: s.bid + 5 } : s) });
    const b = computeSpreadBaseline(spiky, NOW);
    assert.equal(b.ok, true); assert.equal(b.baseline, SPREAD); assert.ok(b.samples_used >= 500);
    assert.equal(computeSpreadBaseline(sampleSeries({ nowSec: NOW, spanSec: 100 }), NOW).ok, false, 'only ~13 samples older than 60 s');
  });
  it('ATR context uses the bars BEFORE the last one and needs 16 confirmed bars', () => {
    const c = computeAtrContext(bars5m({ lastOver: { high: 4267, low: 4263 } }));
    assert.equal(c.ok, true); assert.equal(Math.round(c.atr * 1000) / 1000, 1); assert.equal(c.last_true_range, 4); assert.equal(c.bars, 20);
    assert.equal(computeAtrContext(bars5m({ count: 15 })).ok, false); assert.equal(computeAtrContext(null).ok, false);
  });
  it('a calm market: no triggers, ratios ~1, data sufficient', () => {
    const e = evaluateShockSignals({ samples: sampleSeries({ nowSec: NOW }), bars: bars5m(), nowSec: NOW });
    assert.deepEqual(e.triggers, []); assert.equal(e.feed_stale, false); assert.equal(e.data.sufficient, true); assert.equal(e.metrics.spread_ratio, 1); assert.equal(e.metrics.velocity_atr, 0); assert.equal(e.metrics.jump_atr, 0); assert.equal(e.metrics.range_atr, 1); assert.equal(e.metrics.quote_age_sec, 0);
  });
  it('SPREAD_SHOCK needs BOTH ratio >= 3 and an absolute spread >= 0.5 USD', () => {
    const wide = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age === 0 ? { ...s, spread: 0.9, ask: s.bid + 0.9 } : s) });
    const e = evaluateShockSignals({ samples: wide, bars: bars5m(), nowSec: NOW });
    assert.deepEqual(e.triggers, ['SPREAD_SHOCK']); assert.equal(e.metrics.spread_ratio, 3.462);
    const tiny = sampleSeries({ nowSec: NOW, spread: 0.1, mutate: (s, age) => (age === 0 ? { ...s, spread: 0.3, ask: s.bid + 0.3 } : s) });
    assert.deepEqual(evaluateShockSignals({ samples: tiny, bars: bars5m(), nowSec: NOW }).triggers, [], 'ratio 3 on a 0.1 baseline is not a shock');
  });
  it('VELOCITY_SHOCK: |mid(now) - mid(now-60s)| >= 1.5 ATR; JUMP_SHOCK only when the level really changed (a single reverting bad tick is ignored)', () => {
    const fast = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age < 60 ? { ...s, bid: s.bid + 1.6, ask: s.ask + 1.6 } : s) });
    const e = evaluateShockSignals({ samples: fast, bars: bars5m(), nowSec: NOW });
    assert.deepEqual(e.triggers, ['VELOCITY_SHOCK']); assert.equal(e.metrics.velocity_atr, 1.6); assert.equal(e.metrics.jump_atr, 0);
    const badTick = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age === 3 ? { ...s, bid: s.bid + 1.2, ask: s.ask + 1.2 } : s) });
    const b = evaluateShockSignals({ samples: badTick, bars: bars5m(), nowSec: NOW });
    assert.deepEqual(b.triggers, []); assert.equal(b.metrics.jump_atr, 1.2); assert.equal(b.metrics.jump_confirmed, false);
    const realJump = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age === 0 ? { ...s, bid: s.bid + 1.2, ask: s.ask + 1.2 } : s) });
    const j = evaluateShockSignals({ samples: realJump, bars: bars5m(), nowSec: NOW });
    assert.deepEqual(j.triggers, ['JUMP_SHOCK']); assert.equal(j.metrics.jump_confirmed, true); assert.equal(j.metrics.velocity_atr, 1.2);
  });
  it('RANGE_SHOCK from the last confirmed 5m bar (>= 3 ATR) or from the 5-minute sample window; a stale feed is flagged but is not a shock', () => {
    const r = evaluateShockSignals({ samples: sampleSeries({ nowSec: NOW }), bars: bars5m({ lastOver: { high: 4266.75, low: 4263.25 } }), nowSec: NOW });
    assert.deepEqual(r.triggers, ['RANGE_SHOCK']); assert.equal(r.metrics.range_atr, 3.5);
    const swing = sampleSeries({ nowSec: NOW, mutate: (s, age) => (age >= 120 && age <= 300 ? { ...s, bid: s.bid + 3.2, ask: s.ask + 3.2 } : s) });
    const w = evaluateShockSignals({ samples: swing, bars: bars5m(), nowSec: NOW });
    assert.deepEqual(w.triggers, ['RANGE_SHOCK']); assert.equal(w.metrics.window_range_atr, 3.2); assert.equal(w.metrics.velocity_atr, 0);
    const stale = sampleSeries({ nowSec: NOW, mutate: (s) => ({ ...s, tick_time: NOW - 120 }) });
    const f = evaluateShockSignals({ samples: stale, bars: bars5m(), nowSec: NOW });
    assert.equal(f.feed_stale, true); assert.deepEqual(f.triggers, []); assert.equal(f.metrics.quote_age_sec, 120);
  });
  it('without a baseline or ATR there is no shock claim either way (INSUFFICIENT_DATA)', () => {
    const e = evaluateShockSignals({ samples: sampleSeries({ nowSec: NOW, spanSec: 30 }), bars: null, nowSec: NOW });
    assert.equal(e.data.sufficient, false); assert.deepEqual(e.triggers, []);
    const s = advanceShockState(initialShockState(), e, NOW);
    assert.equal(s.state, 'INSUFFICIENT_DATA'); assert.equal(s.changed, false);
    const wideButNoBaseline = evaluateShockSignals({ samples: sampleSeries({ nowSec: NOW, spanSec: 30, spread: 5 }), bars: bars5m(), nowSec: NOW });
    assert.deepEqual(wideButNoBaseline.triggers, []);
  });
  it('state machine: 2 consecutive positives confirm; clearing needs clearAfterSec quiet AND spread <= 1.5x AND velocity <= 0.75 ATR', () => {
    const evalOf = (triggers, m = {}) => ({ triggers, feed_stale: false, metrics: { spread_ratio: 1, velocity_atr: 0, ...m }, data: { sufficient: true, atr_ok: true, baseline_ok: true } });
    let s = advanceShockState(initialShockState(), evalOf([]), NOW);
    assert.equal(s.state, 'NORMAL'); assert.equal(s.reason, 'DATA_SUFFICIENT'); assert.equal(s.changed, true);
    s = advanceShockState(s, evalOf(['VELOCITY_SHOCK'], { velocity_atr: 2 }), NOW + 3);
    assert.equal(s.state, 'NORMAL'); assert.equal(s.consecutive_positive, 1); assert.equal(s.changed, false, 'one tick is never a shock');
    s = advanceShockState(s, evalOf([]), NOW + 6); assert.equal(s.consecutive_positive, 0, 'a negative resets the count');
    s = advanceShockState(s, evalOf(['VELOCITY_SHOCK'], { velocity_atr: 2 }), NOW + 9);
    s = advanceShockState(s, evalOf(['VELOCITY_SHOCK', 'JUMP_SHOCK'], { velocity_atr: 2 }), NOW + 12);
    assert.equal(s.state, 'VOLATILITY_SHOCK'); assert.equal(s.reason, 'SHOCK_CONFIRMED:VELOCITY_SHOCK+JUMP_SHOCK'); assert.equal(s.since, new Date((NOW + 12) * 1000).toISOString()); assert.equal(s.last_trigger_at, s.since);
    s = advanceShockState(s, evalOf(['SPREAD_SHOCK'], { spread_ratio: 4 }), NOW + 100);
    assert.equal(s.state, 'VOLATILITY_SHOCK'); assert.equal(s.last_trigger_at, new Date((NOW + 100) * 1000).toISOString(), 're-trigger extends the shock');
    s = advanceShockState(s, evalOf([]), NOW + 100 + 599); assert.equal(s.state, 'VOLATILITY_SHOCK', '599 s quiet is not enough');
    s = advanceShockState(s, evalOf([], { spread_ratio: 1.8 }), NOW + 100 + 700); assert.equal(s.state, 'VOLATILITY_SHOCK', 'spread still 1.8x: normalisation is a condition, not a clock');
    s = advanceShockState(s, evalOf([], { velocity_atr: 0.9 }), NOW + 100 + 701); assert.equal(s.state, 'VOLATILITY_SHOCK', 'velocity still 0.9 ATR');
    s = advanceShockState(s, evalOf([]), NOW + 100 + 702);
    assert.equal(s.state, 'NORMAL'); assert.equal(s.reason, 'NORMALIZED'); assert.equal(s.normalized_at, new Date((NOW + 802) * 1000).toISOString()); assert.equal(s.changed, true);
    const lost = advanceShockState(s, { triggers: [], feed_stale: false, metrics: {}, data: { sufficient: false, atr_ok: false, baseline_ok: false } }, NOW + 900);
    assert.equal(lost.state, 'INSUFFICIENT_DATA'); assert.equal(lost.reason, 'DATA_INSUFFICIENT');
  });
  it('relative spread gate for NEW orders: >= 2x baseline AND >= 0.35 USD rejects; no baseline is reported, not guessed', () => {
    assert.equal(evaluateSpreadGate({ spread: 0.3, baseline: 0.26 }).ok, true);
    const bad = evaluateSpreadGate({ spread: 0.55, baseline: 0.26 }); assert.equal(bad.ok, false); assert.equal(bad.reason, 'SPREAD_ABNORMAL'); assert.equal(bad.ratio, 2.115); assert.equal(bad.deviation, 0.29);
    assert.equal(evaluateSpreadGate({ spread: 0.3, baseline: 0.1 }).ok, true, '3x but only 0.3 USD');
    assert.equal(evaluateSpreadGate({ spread: 0.55, baseline: null }).reason, 'SPREAD_BASELINE_UNAVAILABLE');
    assert.equal(evaluateSpreadGate({ spread: NaN, baseline: 0.26 }).reason, 'SPREAD_UNKNOWN');
  });
  it('emergency: RESTORE_SL when the broker SL vanished; CLOSE only when price is beyond the broker SL by more than the tolerance; spread alone never closes', () => {
    const buy = { side: 'BUY', broker_sl: 4257.658, broker_tp: 4295.418 }, sell = { side: 'SELL', broker_sl: 4281.27, broker_tp: 4267.69 };
    assert.equal(evaluateEmergency({ position: null, live: null, tick: null }).reason, 'NO_POSITION');
    const restore = evaluateEmergency({ position: buy, live: { sl: 0 }, tick: { bid: 4265, ask: 4265.26 } });
    assert.equal(restore.action, 'RESTORE_SL'); assert.equal(restore.reason, 'BROKER_SL_MISSING'); assert.equal(restore.evidence.expected_sl, 4257.658); assert.equal(restore.evidence.expected_tp, 4295.418);
    assert.equal(evaluateEmergency({ position: { side: 'BUY', broker_sl: null }, live: { sl: 0 }, tick: { bid: 4200, ask: 4200.3 } }).reason, 'NO_BOUNDARY');
    assert.equal(evaluateEmergency({ position: buy, live: { sl: 4257.658 }, tick: { bid: 4257.3, ask: 4257.56 } }).action, 'NONE', 'inside the 0.5 tolerance');
    const close = evaluateEmergency({ position: buy, live: { sl: 4257.658 }, tick: { bid: 4257.0, ask: 4257.26 } });
    assert.equal(close.action, 'CLOSE'); assert.equal(close.reason, 'BROKER_BOUNDARY_BREACHED'); assert.equal(close.evidence.tolerance_usd, 0.5);
    assert.equal(evaluateEmergency({ position: sell, live: { sl: 4281.27 }, tick: { bid: 4281.7, ask: 4282.0 } }).action, 'CLOSE');
    assert.equal(evaluateEmergency({ position: sell, live: { sl: 4281.27 }, tick: { bid: 4281.3, ask: 4281.6 } }).action, 'NONE');
    assert.equal(evaluateEmergency({ position: buy, live: { sl: 4257.658 }, tick: { bid: 4260.0, ask: 4266.0 } }).action, 'NONE', 'a 6 USD spread with the bid inside the boundary never closes');
    assert.equal(evaluateEmergency({ position: buy, live: { sl: 4257.658 }, tick: null }).reason, 'NO_BOUNDARY');
  });
});

// ── E. protectionGuards ────────────────────────────────────────────────
describe('protectionGuards: the module boundary', () => {
  const now = NOON;
  const ctx = (over = {}) => ({ now, signal: { signal_id: 's', action: 'BUY', entry: 4265, calculated_at: '2026-09-25T11:59:40.000Z' }, market: { bid: BID, ask: ASK, spread_price: SPREAD, tick_time: now.getTime() / 1000 - 1, now_sec: now.getTime() / 1000 }, news: { state: 'NORMAL' }, shock: { state: 'NORMAL', evidence: { feed_stale: false } }, spreadBaseline: 0.26, protection: { blocking: false, last_block_cleared_at: null }, ...over });
  const all = () => [createNewsGuard(), createShockGuard(), createFeedHealthGuard({ feedStaleSec: 90 }), createSpreadGuard(), createNormalizationGuard()];
  it('all guards pass on a calm context; every guard is still evaluated when one blocks; the FIRST block is the verdict', () => {
    const ok = runEntryGuards(all(), ctx());
    assert.equal(ok.allowed, true); assert.equal(ok.guard, null); assert.deepEqual(Object.keys(ok.results), ['news', 'shock', 'feed', 'spread', 'normalization']);
    const two = runEntryGuards(all(), ctx({ news: { state: 'PRE_NEWS' }, shock: { state: 'VOLATILITY_SHOCK' } }));
    assert.equal(two.allowed, false); assert.equal(two.guard, 'news'); assert.equal(two.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(two.results.shock.reason, 'VOLATILITY_SHOCK_ENTRY_BLOCK');
  });
  it('a guard that throws or returns nothing blocks (fail closed) with the error audited', () => {
    const r = runEntryGuards([{ name: 'x', evaluate: () => { throw new Error('kaboom'); } }, { name: 'y', evaluate: () => undefined }], ctx());
    assert.equal(r.reason, 'x_GUARD_THREW'); assert.equal(r.details.error, 'kaboom'); assert.equal(r.results.y.reason, 'y_NO_VERDICT');
  });
  it('shock guard: unknown state blocks; INSUFFICIENT_DATA is allowed but audited; feed guard blocks a stale or missing quote', () => {
    assert.equal(createShockGuard().evaluate(ctx({ shock: null })).reason, 'SHOCK_STATE_UNKNOWN');
    assert.equal(createShockGuard().evaluate(ctx({ shock: { state: 'INSUFFICIENT_DATA' } })).reason, 'SHOCK_BASELINE_UNAVAILABLE_ABSOLUTE_GATES_ONLY');
    const feed = createFeedHealthGuard({ feedStaleSec: 90 });
    assert.equal(feed.evaluate(ctx({ market: { ...ctx().market, tick_time: now.getTime() / 1000 - 91 } })).reason, 'FEED_UNHEALTHY_BLOCK');
    assert.equal(feed.evaluate(ctx({ market: null })).reason, 'FEED_UNHEALTHY_BLOCK');
    assert.equal(feed.evaluate(ctx({ shock: { state: 'NORMAL', evidence: { feed_stale: true } } })).reason, 'FEED_UNHEALTHY_BLOCK', 'the detector\'s own stale flag also blocks');
  });
  it('spread guard: abnormal relative spread blocks; no baseline => absolute gate only (audited)', () => {
    assert.equal(createSpreadGuard().evaluate(ctx({ market: { ...ctx().market, spread_price: 0.55 } })).reason, 'SPREAD_ABNORMAL');
    const nb = createSpreadGuard().evaluate(ctx({ spreadBaseline: null, market: { ...ctx().market, spread_price: 0.55 } }));
    assert.equal(nb.allowed, true); assert.equal(nb.reason, 'SPREAD_BASELINE_UNAVAILABLE_ABSOLUTE_GATE_ONLY');
  });
  it('normalisation guard: an active block blocks; a signal calculated before the last block cleared is never replayed', () => {
    const g = createNormalizationGuard();
    assert.equal(g.evaluate(ctx({ protection: { blocking: true, last_block_cleared_at: null } })).reason, 'PROTECTION_BLOCK_ACTIVE');
    assert.equal(g.evaluate(ctx({ protection: { blocking: false, last_block_cleared_at: '2026-09-25T11:59:50.000Z' } })).reason, 'SIGNAL_PREDATES_NORMALIZATION');
    assert.equal(g.evaluate(ctx({ protection: { blocking: false, last_block_cleared_at: '2026-09-25T11:59:40.000Z' } })).reason, 'SIGNAL_PREDATES_NORMALIZATION', 'equal timestamps count as before');
    assert.equal(g.evaluate(ctx({ protection: { blocking: false, last_block_cleared_at: '2026-09-25T11:59:30.000Z' } })).reason, 'OK');
    assert.equal(g.evaluate(ctx({ protection: null })).reason, 'OK');
  });
});

// ── F. REAL policy envelope ────────────────────────────────────────────
describe('mt5RealPolicy: NEWS + SHOCK protection configuration', () => {
  it('defaults: protection on, Forex Factory JSON provider every 15 min, 30/5/30 min windows, 6 h stale, BLOCK, shock clear 600 s; unchanged REAL authorities', () => {
    const c = resolveRealExecutorConfig({});
    assert.equal(c.newsProtection, true); assert.equal(c.newsProvider, 'http_json'); assert.equal(c.newsCalendarUrl, FOREX_FACTORY_WEEKLY_JSON_URL); assert.equal(c.newsFetchIntervalSec, 900);
    assert.deepEqual(c.newsRiskParams, { preNewsWindowMin: 30, newsActiveWindowMin: 5, postNewsCooldownMin: 30, staleCalendarSec: 21600, dataUnavailablePolicy: 'BLOCK', lookaheadHours: 48, tierBCooldownMin: 55, tierAPostMin: 150, tierAPressConfCoverMin: 90, tierAClusterGapMin: 120, normalizationRatio: 1.5, normalizationConfirmBars: 2, normalizationMaxExtensionMin: 0, normalizationReferenceHours: 24, normalizationReferenceMinBars: 24 });
    assert.equal(c.shockParams.clearAfterSec, 600); assert.equal(c.shockParams.spreadShockRatio, SHOCK_PARAMS.spreadShockRatio); assert.ok(Object.isFrozen(c.newsRiskParams)); assert.ok(Object.isFrozen(c.shockParams));
    assert.equal(c.lotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(c.thesisExit, true); assert.equal(c.maxConsecutiveLosses, 2); assert.equal(c.maxSpreadUsd, 0.6); assert.equal(c.computeSizing, undefined);
  });
  it('the layer cannot be switched off; the provider can be none (audited as DISABLED)', () => {
    for (const v of ['0', 'false', 'off', 'no']) assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_PROTECTION: v }), /cannot disable the REAL news\/shock protection layer/, v);
    assert.equal(resolveRealExecutorConfig({ XAUUSD_NEWS_PROTECTION: '1' }).newsProtection, true);
    assert.equal(resolveRealExecutorConfig({ XAUUSD_NEWS_PROVIDER: 'none' }).newsProvider, 'none');
  });
  it('env overrides are validated within hard ranges; invalid values throw instead of being clamped', () => {
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_PROVIDER: 'scraper' }), /XAUUSD_NEWS_PROVIDER must be one of http_json\|file\|none/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_CALENDAR_URL: 'http://insecure.test/x.json' }), /must be an https URL/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_PROVIDER: 'file' }), /XAUUSD_NEWS_CALENDAR_FILE is required/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_FETCH_INTERVAL_SEC: '299' }), /\[300, 86400\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_PRE_WINDOW_MIN: '4' }), /\[5, 240\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_ACTIVE_WINDOW_MIN: '0' }), /\[1, 60\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_COOLDOWN_MIN: '241' }), /\[5, 240\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_STALE_SEC: '599' }), /\[600, 172800\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY: 'MAYBE' }), /must be BLOCK or ALLOW/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_SHOCK_CLEAR_AFTER_SEC: '59' }), /\[60, 3600\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_STALE_SEC: '1.5' }), /must be an integer/);
    const c = resolveRealExecutorConfig({ XAUUSD_NEWS_PROVIDER: 'file', XAUUSD_NEWS_CALENDAR_FILE: 'C:/cal.json', XAUUSD_NEWS_PRE_WINDOW_MIN: '45', XAUUSD_NEWS_ACTIVE_WINDOW_MIN: '10', XAUUSD_NEWS_COOLDOWN_MIN: '20', XAUUSD_NEWS_STALE_SEC: '7200', XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY: 'ALLOW', XAUUSD_SHOCK_CLEAR_AFTER_SEC: '120', XAUUSD_NEWS_FETCH_INTERVAL_SEC: '600' });
    assert.equal(c.newsCalendarFile, 'C:/cal.json'); assert.deepEqual(c.newsRiskParams, { preNewsWindowMin: 45, newsActiveWindowMin: 10, postNewsCooldownMin: 20, staleCalendarSec: 7200, dataUnavailablePolicy: 'ALLOW', lookaheadHours: 48, tierBCooldownMin: 55, tierAPostMin: 150, tierAPressConfCoverMin: 90, tierAClusterGapMin: 120, normalizationRatio: 1.5, normalizationConfirmBars: 2, normalizationMaxExtensionMin: 0, normalizationReferenceHours: 24, normalizationReferenceMinBars: 24 }); assert.equal(c.shockParams.clearAfterSec, 120); assert.equal(c.newsFetchIntervalSec, 600);
  });
  it('the DEMO policy has no protection flag (isolation: DEMO behaviour unchanged)', () => {
    const d = resolveExecutorConfig({}, { mode: 'demo' });
    assert.equal(d.newsProtection, undefined); assert.equal(d.newsRiskParams, undefined); assert.equal(d.shockParams, undefined);
  });
});

// ── G. REAL executor integration ───────────────────────────────────────
const SIG = 'aaaaaaaaaaaaaaaa', SIG2 = 'bbbbbbbbbbbbbbbb', SIG3 = 'cccccccccccccccc';
function realHello({ equity = 100 } = {}) {
  return { real_verified: true, profile: 'real', checks: { account_readable: true, trade_mode_is_real: true, server_not_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true },
    account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2, currency: 'USD', balance: equity, equity, margin: 0, margin_free: equity, leverage: 500 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5-REAL' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
function demoHello() {
  return { demo_verified: true, checks: { account_readable: true, trade_mode_is_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true },
    account: { login: 480236873, server: 'Exness-MT5Trial11', trade_mode: 0, currency: 'USD', balance: 10000, equity: 10000 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
const tick = (clock, over = {}) => ({ symbol: 'XAUUSDm', bid: BID, ask: ASK, time: clock.now().getTime() / 1000 - 1, spread_price: SPREAD, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over });
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } }
function makeClock(start = new Date('2026-09-25T10:00:00.000Z')) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function live(clock, { profit = 0, sl = 4257.658, tp = 4295.418, price_open = ASK, ticket = 7001 } = {}) { return { ticket, time: clock.now().getTime() / 1000, type: 0, magic: REAL_MAGIC, identifier: ticket, reason: 3, volume: 0.01, price_open, sl, tp, price_current: price_open + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: `MCP:${SIG}` }; }
function bridgeOk(clock, tickFn = () => tick(clock)) {
  const b = new FakeBridge(); b.set('hello', () => realHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', tickFn); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] }));
  b.set('open', (p) => { const price = p.side === 'SELL' ? tickFn().bid : tickFn().ask; return { result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7001, volume: p.volume, price, commission: 0, swap: 0, profit: 0, fee: 0, comment: `MCP:${SIG}` }, position_id: 7001, position: live(clock, { price_open: price, sl: p.sl, tp: p.tp }), requested_price: price }; });
  return b;
}
function build({ bridge, store, clock, env = {}, newsMonitor = permissiveNewsMonitor() }) { return createMt5Executor({ config: resolveRealExecutorConfig(env), bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor, _deps: store.deps }); }
function sig(clock, id = SIG, over = {}) { const calculated_at = over.calculated_at ?? new Date(clock.now().getTime() - 20_000).toISOString(); const entry = over.entry ?? 4265.0; return { signalId: id, alert: { action: 'BUY', entry, sl: entry - 5, tp1: entry + 5, tp2: entry + 11, rr: 2.2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: 'BUY', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: id, is_new_event: true, thesis_id: `th-${id}` }, diagnostics: { candidate: { model: 'BO', side: 'BUY', anchor: entry - 3 }, objective: { price: entry + 11, source: '5m_pivot' } }, market_data_times: { '5m': clock.now().getTime() / 1000 - 300 } } }; }
const prot = (e) => e.protection;
/** Feed the detector: confirmed 5m bars (ATR 1.0) + N monitor passes of calm ticks at 3 s. */
async function warmBaseline(ex, clock, passes = 60) {
  await ex.reviewThesis({ result: { primary_confirmed_bars: bars5m({ endSec: clock.now().getTime() / 1000 - 60 }) } });
  for (let i = 0; i < passes; i++) { clock.advance(3000); await ex.monitorOnce(); }
}

describe('REAL executor: news protection vetoes NEW orders only, with a full audit', () => {
  it('PRE_NEWS: the signal is SKIPPED (NEWS_ENTRY_BLOCK), no order, block audited and persisted; the REAL gates ran first unchanged', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const nm = scriptedNewsMonitor(() => ({ state: 'PRE_NEWS', reason: 'PRE_NEWS:Synthetic CPI m/m', event: { event_id: 'e1', event_name: 'Synthetic CPI m/m', currency: 'USD', impact: 'HIGH', event_time_utc: '2026-09-25T10:12:00.000Z', minutes_to_event: 12, actual: null, forecast: '0.3%', previous: '0.2%', source: 'test' }, block_ends_utc: '2026-09-25T10:12:00.000Z' }));
    const ex = build({ bridge, store, clock, newsMonitor: nm });
    const st = await ex.start();
    assert.equal(st.halted, null); assert.equal(store.events('PROTECTION_STARTED').length, 1); assert.equal(prot(store.events('PROTECTION_STARTED')[0]).news_state, 'PRE_NEWS');
    const started = store.events('PROTECTION_BLOCK_STARTED'); assert.equal(started.length, 1); assert.deepEqual(started[0].reasons, ['NEWS:PRE_NEWS']); assert.equal(started[0].open_position_action, 'NONE'); assert.equal(started[0].entry_allowed, false);
    assert.equal(store.state.protection.blocking, true); assert.deepEqual(store.state.protection.block_reasons, ['NEWS:PRE_NEWS']);
    const r = await ex.executeSignal(sig(clock));
    assert.equal(r.executed, false); assert.equal(r.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(bridge.count('open'), 0);
    const skipped = store.events('SKIPPED')[0];
    assert.equal(skipped.guard, 'news'); assert.equal(skipped.entry_allowed, false); assert.equal(skipped.open_position_action, 'NONE'); assert.equal(skipped.details.minutes_to_event, 12); assert.equal(skipped.details.impact, 'HIGH');
    const p = prot(skipped);
    assert.equal(p.news_state, 'PRE_NEWS'); assert.equal(p.event_name, 'Synthetic CPI m/m'); assert.equal(p.currency, 'USD'); assert.equal(p.release_time_utc, '2026-09-25T10:12:00.000Z'); assert.equal(p.forecast, '0.3%'); assert.equal(p.provider, 'test'); assert.equal(p.shock_state, 'INSUFFICIENT_DATA'); assert.equal(p.blocking, true);
    assert.equal(p.guards.news.allowed, false); assert.equal(p.guards.normalization.reason, 'PROTECTION_BLOCK_ACTIVE'); assert.equal(p.guards.shock.reason, 'SHOCK_BASELINE_UNAVAILABLE_ABSOLUTE_GATES_ONLY'); assert.equal(p.guards.spread.reason, 'SPREAD_BASELINE_UNAVAILABLE_ABSOLUTE_GATE_ONLY'); assert.equal(p.guards.feed.allowed, true);
    assert.equal(store.state.executed_signals[SIG].reason, 'NEWS_ENTRY_BLOCK');
    assert.equal((await ex.executeSignal(sig(clock))).reason, 'DUPLICATE_SIGNAL', 'dedup guard unchanged and evaluated before the protection guards');
    const spreadTooWide = bridgeOk(clock, () => tick(clock, { spread_price: 0.7, ask: BID + 0.7 })); const s2 = makeStore();
    const ex2 = build({ bridge: spreadTooWide, store: s2, clock, newsMonitor: nm }); await ex2.start();
    const r2 = await ex2.executeSignal(sig(clock)); assert.equal(r2.reason, 'SPREAD_TOO_WIDE', 'the absolute REAL spread gate still runs before any protection guard'); assert.equal(s2.events('SKIPPED')[0].guard, undefined);
  });
  it('normalisation: the block clears with an audit; a signal calculated BEFORE the clear is never replayed; a fresh signal executes at exactly 0.01', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    let phase = 'PRE_NEWS';
    const nm = scriptedNewsMonitor(() => (phase === 'PRE_NEWS' ? { state: 'PRE_NEWS', reason: 'PRE_NEWS:CPI', event: { event_id: 'e1', event_name: 'CPI', currency: 'USD', impact: 'HIGH', minutes_to_event: 5 } } : {}));
    const ex = build({ bridge, store, clock, newsMonitor: nm }); await ex.start();
    const stale = sig(clock, SIG); // calculated 20 s before the clear
    clock.advance(5_000); phase = 'NORMAL';
    const m = await ex.monitorOnce(); assert.equal(m.action, 'NO_POSITION'); assert.equal(m.news_state, 'NORMAL');
    const norm = store.events('PROTECTION_NORMALIZED'); assert.equal(norm.length, 1); assert.equal(norm[0].cleared_at, clock.now().toISOString()); assert.equal(norm[0].entry_allowed, true); assert.ok(norm[0].blocking_since);
    assert.equal(store.events('NEWS_STATE_CHANGED').at(-1).to, 'NORMAL');
    assert.equal(store.state.protection.blocking, false); assert.equal(store.state.protection.last_block_cleared_at, norm[0].cleared_at);
    const r1 = await ex.executeSignal(stale);
    assert.equal(r1.reason, 'SIGNAL_PREDATES_NORMALIZATION'); assert.equal(store.events('SKIPPED')[0].guard, 'normalization'); assert.equal(bridge.count('open'), 0);
    clock.advance(30_000);
    const r2 = await ex.executeSignal(sig(clock, SIG2));
    assert.equal(r2.executed, true); assert.equal(bridge.count('open'), 1); assert.equal(bridge.last('open').volume, 0.01);
    const opened = store.events('OPENED')[0]; assert.equal(prot(opened).guards.normalization.reason, 'OK'); assert.equal(prot(opened).news_state, 'NORMAL'); assert.equal(prot(opened).last_block_cleared_at, norm[0].cleared_at);
    assert.equal(prot(store.events('INTENT')[0]).guards.news.reason, 'OK');
    const st = ex.status().news_protection; assert.equal(st.enabled, true); assert.equal(st.last_block_cleared_at, norm[0].cleared_at); assert.equal(st.news.state, 'NORMAL'); assert.equal(st.params.news.preNewsWindowMin, 30);
    const restarted = build({ bridge: bridgeOk(clock, () => tick(clock)), store: makeStore(store.state), clock, newsMonitor: nm });
    assert.equal(restarted.status().news_protection.enabled, true);
  });
  it('DATA_UNAVAILABLE blocks by default (calendar not trusted) and is allowed-but-audited under XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY=ALLOW', async () => {
    const nm = scriptedNewsMonitor(() => ({ state: 'DATA_UNAVAILABLE', reason: 'CALENDAR_STALE', calendar: { status: 'OK', freshness: { age_sec: 30000, fresh: false, reason: 'STALE' } } }));
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock, newsMonitor: nm }); await ex.start();
    assert.deepEqual(store.events('PROTECTION_BLOCK_STARTED')[0].reasons, ['NEWS:DATA_UNAVAILABLE']);
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'NEWS_DATA_UNAVAILABLE_BLOCK'); assert.equal(r.details.reason, 'CALENDAR_STALE'); assert.equal(bridge.count('open'), 0);
    const c2 = makeClock(); const s2 = makeStore(); const b2 = bridgeOk(c2);
    const ex2 = build({ bridge: b2, store: s2, clock: c2, newsMonitor: nm, env: { XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY: 'ALLOW' } }); await ex2.start();
    assert.equal(s2.events('PROTECTION_BLOCK_STARTED').length, 0);
    const r2 = await ex2.executeSignal(sig(c2)); assert.equal(r2.executed, true); assert.equal(prot(s2.events('OPENED')[0]).guards.news.reason, 'NEWS_DATA_UNAVAILABLE_ALLOWED'); assert.equal(prot(s2.events('OPENED')[0]).provider_freshness.fresh, false);
  });
  it('provider none => DISABLED: entries allowed and every decision audited as NEWS_DISABLED', async () => {
    const nm = scriptedNewsMonitor(() => ({ state: 'DISABLED', reason: 'NO_CALENDAR_PROVIDER', calendar: { status: 'NONE', source: null } }));
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock, newsMonitor: nm, env: { XAUUSD_NEWS_PROVIDER: 'none' } }); await ex.start();
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.executed, true); assert.equal(prot(store.events('OPENED')[0]).guards.news.reason, 'NEWS_DISABLED'); assert.equal(prot(store.events('OPENED')[0]).news_state, 'DISABLED');
  });
  it('a missing or throwing news monitor is DATA_UNAVAILABLE (fail closed), never an exception in the trade path', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const ex = build({ bridge, store, clock, newsMonitor: null }); await ex.start();
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'NEWS_DATA_UNAVAILABLE_BLOCK'); assert.equal(r.details.reason, 'NEWS_MONITOR_MISSING');
    const thrower = { refresh: async () => { throw new Error('net down'); }, evaluate: () => { throw new Error('boom'); }, status: () => ({ provider: { kind: 'x' }, calendar: null }) };
    const c2 = makeClock(); const s2 = makeStore(); const b2 = bridgeOk(c2);
    const ex2 = build({ bridge: b2, store: s2, clock: c2, newsMonitor: thrower }); assert.equal((await ex2.start()).halted, null);
    const r2 = await ex2.executeSignal(sig(c2)); assert.equal(r2.reason, 'NEWS_DATA_UNAVAILABLE_BLOCK'); assert.equal(r2.details.reason, 'NEWS_MONITOR_THREW:boom'); assert.equal(b2.count('open'), 0);
  });
  it('end to end with the synthetic Forex-Factory fixture: PRE_NEWS -> NEWS_ACTIVE -> POST_NEWS_COOLDOWN -> NORMAL around the 12:30Z CPI; the naive-time event is dropped, not guessed', async () => {
    const clock = makeClock(new Date('2026-09-25T12:05:00.000Z')); const store = makeStore(); const bridge = bridgeOk(clock);
    const { monitor } = fixtureCalendarMonitor({ raw: FIXTURE, sourceTimestamp: '2026-09-25T11:50:00.000Z', now: clock.now });
    const ex = build({ bridge, store, clock, newsMonitor: monitor }); await ex.start();
    assert.equal(monitor.status().counts.unschedulable, 1); assert.equal(monitor.status().dropped[0].event_name, 'Naive Time Event');
    const startedCal = store.events('PROTECTION_STARTED')[0].calendar; assert.equal(startedCal.status, 'OK'); assert.equal(startedCal.source_timestamp, '2026-09-25T11:50:00.000Z');
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(r.details.news_state, 'PRE_NEWS'); assert.equal(r.details.minutes_to_event, 25); assert.match(r.details.event.event_name, /CPI/);
    const step = async (iso) => { clock.advance(at(iso).getTime() - clock.now().getTime()); await ex.monitorOnce(); return ex.status().news_protection.news; };
    assert.equal((await step('2026-09-25T12:31:00Z')).state, 'NEWS_ACTIVE');
    assert.equal((await step('2026-09-25T12:36:00Z')).state, 'POST_NEWS_COOLDOWN');
    assert.equal((await step('2026-09-25T13:04:00Z')).state, 'POST_NEWS_COOLDOWN');
    assert.equal((await step('2026-09-25T13:29:00Z')).state, 'POST_NEWS_COOLDOWN', 'V2: CPI is Tier B, clock minimum T+60');
    const n = await step('2026-09-25T13:31:00Z'); assert.equal(n.state, 'NORMAL'); assert.equal(n.next_event, null, 'the Low-impact member speech is not relevant; FOMC/NFP are beyond 48 h');
    assert.deepEqual(store.events('NEWS_STATE_CHANGED').map((e) => e.to), ['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'NORMAL']);
    assert.equal(store.events('PROTECTION_NORMALIZED').length, 1);
    assert.equal((await ex.executeSignal(sig(clock, SIG2))).reason, 'SIGNAL_PREDATES_NORMALIZATION', 'a signal calculated 20 s before the clear is not replayed');
    clock.advance(30_000);
    assert.equal((await ex.executeSignal(sig(clock, SIG3))).executed, true, 'a signal calculated after normalisation executes');
  });
});

describe('REAL executor: volatility shock detector on live ticks', () => {
  it('a 2 ATR move inside 60 s confirms VOLATILITY_SHOCK after 2 passes, blocks entries, and clears only after the configured quiet period', async () => {
    const clock = makeClock(); const store = makeStore();
    let px = 0; const bridge = bridgeOk(clock, () => tick(clock, { bid: BID + px, ask: ASK + px }));
    const ex = build({ bridge, store, clock, env: { XAUUSD_SHOCK_CLEAR_AFTER_SEC: '120' } }); await ex.start();
    assert.equal(ex.status().news_protection.shock.state, 'INSUFFICIENT_DATA');
    await warmBaseline(ex, clock);
    const st = ex.status().news_protection; assert.equal(st.shock.state, 'NORMAL'); assert.equal(st.spread_baseline, SPREAD); assert.equal(st.confirmed_bars_5m, 20); assert.ok(st.samples >= 60);
    assert.deepEqual(store.events('SHOCK_STATE_CHANGED').map((e) => [e.from, e.to]), [['INSUFFICIENT_DATA', 'NORMAL']]);
    px = 2.0; clock.advance(3000); await ex.monitorOnce();
    assert.equal(ex.status().news_protection.shock.state, 'NORMAL', 'one positive pass is never a shock'); assert.equal(store.events('PROTECTION_BLOCK_STARTED').length, 0);
    clock.advance(3000); await ex.monitorOnce();
    const shock = ex.status().news_protection.shock; assert.equal(shock.state, 'VOLATILITY_SHOCK'); assert.ok(shock.triggers.includes('VELOCITY_SHOCK')); assert.ok(shock.evidence.velocity_atr >= 1.5);
    const changed = store.events('SHOCK_STATE_CHANGED').at(-1); assert.equal(changed.to, 'VOLATILITY_SHOCK'); assert.match(changed.reason, /^SHOCK_CONFIRMED:/);
    const blk = store.events('PROTECTION_BLOCK_STARTED'); assert.equal(blk.length, 1); assert.deepEqual(blk[0].reasons, ['VOLATILITY_SHOCK']); assert.equal(blk[0].open_position_action, 'NONE');
    const r = await ex.executeSignal(sig(clock, SIG, { entry: 4267.2 }));
    assert.equal(r.reason, 'VOLATILITY_SHOCK_ENTRY_BLOCK'); assert.equal(store.events('SKIPPED')[0].guard, 'shock'); assert.equal(prot(store.events('SKIPPED')[0]).shock_state, 'VOLATILITY_SHOCK'); assert.ok(prot(store.events('SKIPPED')[0]).velocity_atr >= 1.5); assert.equal(bridge.count('open'), 0);
    // Price holds at the new level: velocity fades after 60 s, then 120 s of quiet with a normal spread => NORMALIZED.
    for (let i = 0; i < 40; i++) { clock.advance(3000); await ex.monitorOnce(); }
    assert.equal(ex.status().news_protection.shock.state, 'VOLATILITY_SHOCK', '~120 s after the last trigger is not yet the configured quiet period');
    for (let i = 0; i < 40; i++) { clock.advance(3000); await ex.monitorOnce(); }
    const after = ex.status().news_protection; assert.equal(after.shock.state, 'NORMAL'); assert.ok(after.shock.normalized_at); assert.equal(after.blocking, false);
    const norm = store.events('PROTECTION_NORMALIZED'); assert.equal(norm.length, 1);
    const stale = sig(clock, SIG2, { entry: 4267.2, calculated_at: new Date(Date.parse(norm[0].cleared_at) - 1000).toISOString() });
    assert.equal((await ex.executeSignal(stale)).reason, 'SIGNAL_PREDATES_NORMALIZATION');
    const fresh = await ex.executeSignal(sig(clock, SIG3, { entry: 4267.2 }));
    assert.equal(fresh.executed, true); assert.equal(bridge.last('open').volume, 0.01); assert.equal(prot(store.events('OPENED')[0]).shock_state, 'NORMAL');
  });
  it('relative spread gate: 0.55 USD passes the absolute 0.6 max but is 2.1x the live baseline => SPREAD_ABNORMAL; without a baseline the absolute gate alone applies (audited)', async () => {
    const clock = makeClock(); const store = makeStore();
    let spread = SPREAD; const bridge = bridgeOk(clock, () => tick(clock, { spread_price: spread, ask: BID + spread }));
    const ex = build({ bridge, store, clock }); await ex.start();
    await warmBaseline(ex, clock);
    spread = 0.55;
    const r = await ex.executeSignal(sig(clock));
    assert.equal(r.reason, 'SPREAD_ABNORMAL'); assert.equal(r.details.ratio, 2.115); assert.equal(bridge.count('open'), 0);
    const sk = store.events('SKIPPED')[0]; assert.equal(sk.guard, 'spread'); assert.equal(prot(sk).spread_gate.reason, 'SPREAD_ABNORMAL'); assert.equal(prot(sk).spread_gate.baseline, SPREAD); assert.equal(prot(sk).shock_state, 'NORMAL', 'a single 2x sample is not a spread shock');
    const c2 = makeClock(); const s2 = makeStore(); const b2 = bridgeOk(c2, () => tick(c2, { spread_price: 0.55, ask: BID + 0.55 }));
    const ex2 = build({ bridge: b2, store: s2, clock: c2 }); await ex2.start();
    const r2 = await ex2.executeSignal(sig(c2)); assert.equal(r2.executed, true); assert.equal(prot(s2.events('OPENED')[0]).guards.spread.reason, 'SPREAD_BASELINE_UNAVAILABLE_ABSOLUTE_GATE_ONLY');
  });
});

describe('REAL executor: fast safety monitor on an OPEN position (risk protection only)', () => {
  async function opened({ tickFn = null, newsMonitor = permissiveNewsMonitor() } = {}) {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock, tickFn ? () => tickFn(clock) : () => tick(clock));
    const ex = build({ bridge, store, clock, newsMonitor }); await ex.start();
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.executed, true);
    bridge.set('close', () => ({ result: { retcode: 10009, deal: 9102, order: 7001 }, exit_deal: { ticket: 9102, entry: 1, price: 4257.0, profit: -8.42, time: clock.now().getTime() / 1000 + 1, reason: 3 } }));
    bridge.set('deals', () => ({ deals: [{ ticket: 9101, entry: 0, price: ASK, profit: 0, commission: 0, swap: 0, fee: 0 }, { ticket: 9102, entry: 1, price: 4257.0, profit: -8.42, commission: 0, swap: 0, fee: 0, reason: 3, time: clock.now().getTime() / 1000 + 1 }] }));
    return { clock, store, bridge, ex, brokerSl: store.state.position.broker_sl, brokerTp: store.state.position.broker_tp };
  }
  it('a vanished broker SL is restored through the bridge (EMERGENCY_SL_RESTORE/RESTORED), at most once a minute; a failed restore is audited and never closes', async () => {
    const { clock, store, bridge, ex, brokerSl, brokerTp } = await opened();
    assert.ok(brokerSl > 0 && brokerSl < ASK, 'the structural broker SL was placed at open');
    bridge.set('positions', () => ({ positions: [live(clock, { sl: 0, profit: -1 })] }));
    bridge.set('modify', () => ({ result: { retcode: 10009 } }));
    clock.advance(3000); const m = await ex.monitorOnce();
    assert.equal(m.action, 'HOLD'); assert.equal(bridge.count('modify'), 1); assert.equal(bridge.last('modify').sl, brokerSl); assert.equal(bridge.last('modify').tp, brokerTp); assert.equal(bridge.last('modify').ticket, 7001);
    const ev1 = store.events('EMERGENCY_SL_RESTORE')[0]; assert.equal(ev1.reason, 'BROKER_SL_MISSING'); assert.equal(ev1.open_position_action, 'RESTORE_SL'); assert.equal(ev1.evidence.expected_sl, brokerSl); assert.equal(store.events('EMERGENCY_SL_RESTORED').length, 1);
    clock.advance(3000); await ex.monitorOnce(); assert.equal(bridge.count('modify'), 1, 'throttled to one attempt per minute');
    clock.advance(61_000); bridge.set('modify', () => new Mt5BridgeError('MODIFY_REJECTED', 'invalid stops'));
    const m3 = await ex.monitorOnce(); assert.equal(m3.action, 'HOLD'); assert.equal(bridge.count('modify'), 2);
    const failed = store.events('EMERGENCY_SL_RESTORE_FAILED'); assert.equal(failed.length, 1); assert.equal(failed[0].reason, 'MODIFY_REJECTED'); assert.match(failed[0].note, /kill switch remain in force/);
    assert.equal(bridge.count('close'), 0); assert.ok(store.state.position); assert.equal(store.state.position.broker_sl, brokerSl, 'our record of the protective SL is kept');
  });
  it('market beyond the broker SL by more than 0.5 USD while still open => governed close (EMERGENCY_BROKER_BOUNDARY_BREACHED, FAST_SAFETY_MONITOR); inside the tolerance => HOLD', async () => {
    let bid = BID; const { clock, store, bridge, ex, brokerSl } = await opened({ tickFn: (c) => tick(c, { bid, ask: bid + SPREAD }) });
    bridge.set('positions', () => ({ positions: [live(clock, { sl: brokerSl, profit: -7 })] }));
    bid = brokerSl - 0.3; clock.advance(3000);
    assert.equal((await ex.monitorOnce()).action, 'HOLD'); assert.equal(bridge.count('close'), 0);
    bid = brokerSl - 0.7; clock.advance(3000);
    const m = await ex.monitorOnce();
    assert.equal(m.action, 'CLOSED'); assert.equal(m.reason, 'EMERGENCY_BROKER_BOUNDARY_BREACHED'); assert.equal(bridge.count('close'), 1);
    const trig = store.events('CLOSE_TRIGGERED')[0]; assert.equal(trig.reason, 'EMERGENCY_BROKER_BOUNDARY_BREACHED'); assert.equal(trig.source, 'FAST_SAFETY_MONITOR'); assert.equal(trig.open_position_action, 'CLOSE'); assert.equal(trig.evidence.broker_sl, brokerSl); assert.ok(prot(trig));
    const closed = store.events('CLOSED')[0]; assert.equal(closed.exit_reason, 'EMERGENCY_BROKER_BOUNDARY_BREACHED'); assert.equal(closed.exit_source, 'FAST_SAFETY_MONITOR'); assert.equal(closed.exit_state, 'EMERGENCY_CLOSE');
    assert.equal(store.state.position, null); assert.equal(store.state.executed_signals[SIG].status, 'CLOSED');
  });
  it('spread expansion, a confirmed shock, a stale feed and a news window NEVER close an open position; the monetary monitor and adaptive management keep their authority', async () => {
    let spread = SPREAD, age = 1, px = 0; let phase = 'NORMAL';
    const nm = scriptedNewsMonitor(() => (phase === 'NORMAL' ? {} : { state: phase, reason: `${phase}:CPI`, event: { event_id: 'e1', event_name: 'CPI', currency: 'USD', impact: 'HIGH', minutes_to_event: 1 } }));
    const { clock, store, bridge, ex } = await opened({ tickFn: (c) => ({ ...tick(c, { bid: BID + px, ask: BID + px + spread, spread_price: spread }), time: c.now().getTime() / 1000 - age }), newsMonitor: nm });
    bridge.set('positions', () => ({ positions: [live(clock, { profit: 2.5 })] }));
    await warmBaseline(ex, clock);
    px = 2.5; clock.advance(3000); await ex.monitorOnce(); clock.advance(3000); await ex.monitorOnce();
    assert.equal(ex.status().news_protection.shock.state, 'VOLATILITY_SHOCK');
    spread = 3.0; for (let i = 0; i < 5; i++) { clock.advance(3000); assert.equal((await ex.monitorOnce()).action, 'HOLD'); }
    age = 200; clock.advance(3000); assert.equal((await ex.monitorOnce()).action, 'HOLD');
    age = 1; spread = SPREAD; phase = 'NEWS_ACTIVE'; clock.advance(3000); assert.equal((await ex.monitorOnce()).action, 'HOLD');
    assert.equal(bridge.count('close'), 0); assert.equal(bridge.count('modify'), 0); assert.equal(store.events('CLOSE_TRIGGERED').length, 0); assert.ok(store.state.position);
    for (const e of store.events('PROTECTION_BLOCK_STARTED')) assert.equal(e.open_position_action, 'NONE');
    assert.ok(store.state.protection.block_reasons.includes('NEWS:NEWS_ACTIVE'));
    assert.equal((await ex.executeSignal(sig(clock, SIG2, { entry: 4267.6 }))).reason, 'POSITION_ALREADY_OPEN', 'one-position guard still first');
    bridge.set('positions', () => ({ positions: [live(clock, { profit: 31 })] }));
    clock.advance(3000); const m = await ex.monitorOnce(); assert.equal(m.action, 'CLOSED'); assert.equal(m.reason, 'TAKE_PROFIT_BUDGET', 'the +30 monetary monitor still closes during a news window');
  });
});

describe('DEMO isolation', () => {
  it('the DEMO executor has no protection layer: no PROTECTION_STARTED, no guards, status reports enabled:false, entry path unchanged', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = new FakeBridge();
    bridge.set('hello', () => demoHello()); bridge.set('positions', () => ({ positions: [] })); bridge.set('tick', () => tick(clock)); bridge.set('history', () => ({ deals: [] })); bridge.set('deals', () => ({ deals: [] }));
    bridge.set('open', (p) => ({ result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price: ASK }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: 88051501, position_id: 7001, volume: p.volume, price: ASK, commission: 0, swap: 0, profit: 0, fee: 0, comment: `MCP:${SIG}` }, position_id: 7001, position: { ...live(clock, { sl: p.sl, tp: p.tp }), magic: 88051501 }, requested_price: ASK }));
    const demo = createMt5Executor({ config: resolveExecutorConfig({}, { mode: 'demo' }), bridge, statePath: 'mem', logPath: 'mem', killSwitchPath: 'mem', log: () => {}, now: clock.now, _deps: store.deps });
    const st = await demo.start(); assert.equal(st.halted, null); assert.deepEqual(st.news_protection, { enabled: false });
    assert.equal(store.events('PROTECTION_STARTED').length, 0);
    const r = await demo.executeSignal(sig(clock)); assert.equal(r.executed, true); assert.equal(store.events('OPENED')[0].protection, null);
    assert.equal((await demo.monitorOnce()).shock_state, undefined);
  });
});
