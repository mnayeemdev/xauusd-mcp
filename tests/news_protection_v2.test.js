/**
 * NEWS PROTECTION V2 (2026-09-26) -- docs/XAUUSD_NEWS_PROTECTION_V2_SPEC.md.
 *
 * Tiered SAFETY windows from the V5 scheduled-news evidence: Tier B (CPI/NFP)
 * clock minimum T+60, Tier A (FOMC cluster) one merged interval to
 * max(anchor+150, last row+35, press conference+90), Tier C = V1 generic;
 * Tier A/B normalisation confirmation on COMPLETED 15m bars; remembered
 * events while DATA_UNAVAILABLE; news + shock + feed + spread + fresh-signal
 * guards independent. Pure functions + scripted REAL bridge. No network, no
 * files, no terminal, no orders. News never produces a direction.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, normalizeCalendar, classifyNewsTier, NEWS_TIERS, isGoldRelevant } from '../src/engine/newsCalendar.js';
import { evaluateNewsState, evaluateNewsEntryPolicy, evaluateNormalization, aggregateCompleted15m, buildProtectionIntervals, NEWS_RISK_PARAMS, NEWS_STATES, BLOCKING_NEWS_STATES, NORMALIZATION_STATUS } from '../src/engine/newsRisk.js';
import { resolveRealExecutorConfig, REAL_MAGIC } from '../src/engine/mt5RealPolicy.js';
import { createMt5Executor, loadMt5State } from '../src/engine/mt5Executor.js';
import { Mt5BridgeError } from '../src/engine/mt5Bridge.js';
import { scriptedNewsMonitor, fixtureCalendarMonitor, memoryProvider } from './fixtures/news_test_monitor.js';
import { createNewsMonitor } from '../src/engine/newsMonitor.js';

const at = (iso) => new Date(iso);
const SRC = '2026-09-25T12:00:00.000Z';
const CAL_OK = { status: 'OK', source: 'test', source_timestamp: SRC, last_success_at: SRC, error: null, consecutive_failures: 0 };
const NOW = at(SRC);
const mk = (title, date, over = {}) => normalizeEvent({ title, country: 'USD', date, impact: 'High', forecast: '', previous: '', ...over }, { source: 'test', sourceTimestamp: SRC, now: NOW });
const CPI = mk('CPI m/m', '2026-09-25T12:30:00Z');
const NFP = mk('Non-Farm Employment Change', '2026-10-02T12:30:00Z');
const state = (events, iso, over = {}) => evaluateNewsState({ events, now: at(iso), calendar: { ...CAL_OK, source_timestamp: over.src ?? iso.replace(/T.*/, 'T00:00:00.000Z') <= iso ? (over.src ?? iso) : SRC }, ...over });
// FOMC on Wednesday 2026-09-30, 14:00 EDT = 18:00Z; press conference 14:30 EDT = 18:30Z
const FOMC_ROWS = [mk('FOMC Statement', '2026-09-30T14:00:00-04:00', { impact: 'Medium' }), mk('Federal Funds Rate', '2026-09-30T14:00:00-04:00'), mk('FOMC Economic Projections', '2026-09-30T14:00:00-04:00'), mk('FOMC Press Conference', '2026-09-30T14:30:00-04:00')];
const fomcAt = (iso, rows = FOMC_ROWS, extra = {}) => evaluateNewsState({ events: rows, now: at(iso), calendar: { ...CAL_OK, source_timestamp: iso }, ...extra });

/** Completed 15m bars: `ref` bars of range refRange ending 1 h before T, then `post` ranges starting at T. */
function bars15(Tsec, { refCount = 96, refRange = 1.0, post = [] } = {}) {
  const out = [];
  for (let i = refCount; i >= 1; i--) { const t = Tsec - 3600 - i * 900; out.push({ time: t, open: 4000, high: 4000 + refRange / 2, low: 4000 - refRange / 2, close: 4000 }); }
  post.forEach((r, k) => out.push({ time: Tsec + k * 900, open: 4000, high: 4000 + r / 2, low: 4000 - r / 2, close: 4000 }));
  return out;
}
const TSEC = Date.parse('2026-09-25T12:30:00Z') / 1000;

// ── A. tiers ──────────────────────────────────────────────────────────
describe('V2 tiers: deterministic name classification, never a direction', () => {
  it('Tier B = CPI cluster + Employment Situation cluster; Tier A = FOMC decision cluster; everything else (incl. unknown USD HIGH, Fed Chair) = Tier C', () => {
    for (const n of ['CPI m/m', 'Core CPI m/m', 'CPI y/y', 'Consumer Price Index (YoY)', 'Non-Farm Employment Change', 'Nonfarm Payrolls', 'Employment Situation', 'Unemployment Rate', 'Average Hourly Earnings m/m']) assert.equal(classifyNewsTier({ event_name: n }), 'B', n);
    for (const n of ['FOMC Statement', 'FOMC Press Conference', 'FOMC Economic Projections', 'Federal Funds Rate']) assert.equal(classifyNewsTier({ event_name: n }), 'A', n);
    for (const n of ['PPI m/m', 'Core PCE Price Index m/m', 'Retail Sales m/m', 'ISM Manufacturing PMI', 'JOLTS Job Openings', 'Advance GDP q/q', 'Fed Chair Powell Testifies', 'Synthetic Widget Index', 'FOMC Member Speaks', '']) assert.equal(classifyNewsTier({ event_name: n }), 'C', n || '(empty)');
    assert.deepEqual(Object.values(NEWS_TIERS), ['A', 'B', 'C']); assert.equal(classifyNewsTier(null), 'C');
  });
  it('tiers never change relevance (USD HIGH or decision pattern) and carry no action/side/direction field', () => {
    assert.equal(isGoldRelevant(mk('Unemployment Claims', '2026-09-24T12:30:00Z', { impact: 'Medium' })), false, 'a Medium USD event stays irrelevant whatever it is named');
    const s = state([CPI], '2026-09-25T12:31:00Z');
    for (const k of ['action', 'side', 'direction', 'bias', 'signal']) assert.equal(k in s, false, k); assert.equal(s.event.tier, 'B');
    assert.deepEqual(NEWS_STATES, ['NORMAL', 'PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN', 'DATA_UNAVAILABLE', 'DISABLED']); assert.deepEqual(BLOCKING_NEWS_STATES, ['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']);
    assert.deepEqual(NORMALIZATION_STATUS, ['NOT_APPLICABLE', 'BARS_UNAVAILABLE', 'REFERENCE_UNAVAILABLE', 'PENDING', 'NORMALIZED', 'MAX_EXTENSION_REACHED']);
  });
});

// ── B. Tier B / Tier C windows ─────────────────────────────────────────
describe('V2 Tier B (CPI / NFP) and Tier C windows', () => {
  it('CPI: pre 30 unchanged, active 5, cooldown 55 => clock minimum T+60; no bars => ends at the clock minimum, audited as BARS_UNAVAILABLE', () => {
    assert.equal(state([CPI], '2026-09-25T11:59:00Z').state, 'NORMAL'); assert.equal(state([CPI], '2026-09-25T12:00:00Z').state, 'PRE_NEWS');
    const cd = state([CPI], '2026-09-25T13:20:00Z'); assert.equal(cd.state, 'POST_NEWS_COOLDOWN'); assert.equal(cd.block_ends_utc, '2026-09-25T13:30:00.000Z'); assert.equal(cd.event.tier, 'B'); assert.equal(cd.event.normalization_pending, false);
    const n = state([CPI], '2026-09-25T13:30:00Z'); assert.equal(n.state, 'NORMAL');
    const viaBars = evaluateNewsState({ events: [CPI], now: at('2026-09-25T13:30:00Z'), calendar: { ...CAL_OK, source_timestamp: '2026-09-25T13:30:00Z' }, bars15m: [] }); assert.equal(viaBars.state, 'NORMAL');
  });
  it('NFP cluster rows (payrolls, unemployment rate, earnings at the same minute) form one Tier-B block to T+60, reported once each, never double-counted into a longer block', () => {
    const rows = [NFP, mk('Unemployment Rate', '2026-10-02T12:30:00Z'), mk('Average Hourly Earnings m/m', '2026-10-02T12:30:00Z')];
    const s = state(rows, '2026-10-02T13:00:00Z'); assert.equal(s.state, 'POST_NEWS_COOLDOWN'); assert.equal(s.contributing_events.length, 3); assert.ok(s.contributing_events.every((c) => c.tier === 'B' && c.window_ends_utc === '2026-10-02T13:30:00.000Z'));
    assert.equal(state(rows, '2026-10-02T13:30:00Z').state, 'NORMAL');
  });
  it('Tier C and UNKNOWN USD HIGH keep the V1 window (T+35) -- never less protection than V1', () => {
    for (const name of ['PPI m/m', 'Synthetic Widget Index', 'Fed Chair Powell Speaks']) {
      const e = mk(name, '2026-09-25T12:30:00Z');
      assert.equal(state([e], '2026-09-25T13:04:00Z').state, 'POST_NEWS_COOLDOWN', name); assert.equal(state([e], '2026-09-25T13:04:00Z').event.tier, 'C'); assert.equal(state([e], '2026-09-25T13:05:00Z').state, 'NORMAL', name);
    }
  });
  it('multiple nearby high-impact events: the block ends at the latest window in force (CPI T+60 beats PPI T+35; a later Tier-C event extends past the Tier-B end)', () => {
    const both = [CPI, mk('PPI m/m', '2026-09-25T12:30:00Z')];
    const s = state(both, '2026-09-25T13:10:00Z'); assert.equal(s.state, 'POST_NEWS_COOLDOWN'); assert.equal(s.contributing_events.length, 1, 'PPI window already over'); assert.equal(s.block_ends_utc, '2026-09-25T13:30:00.000Z');
    const later = [CPI, mk('ISM Manufacturing PMI', '2026-09-25T13:15:00Z')];
    assert.equal(state(later, '2026-09-25T12:50:00Z').state, 'PRE_NEWS', 'PRE of the ISM outranks CPI cooldown for reporting'); assert.equal(state(later, '2026-09-25T13:40:00Z').state, 'POST_NEWS_COOLDOWN'); assert.equal(state(later, '2026-09-25T13:40:00Z').block_ends_utc, '2026-09-25T13:50:00.000Z'); assert.equal(state(later, '2026-09-25T13:50:00Z').state, 'NORMAL');
  });
  it('a Tier-B cooldown parameter can never be shorter than the generic cooldown (a tier only adds protection)', () => {
    const p = { ...NEWS_RISK_PARAMS, tierBCooldownMin: 10 };
    assert.equal(state([CPI], '2026-09-25T13:04:00Z', { params: p }).state, 'POST_NEWS_COOLDOWN'); assert.equal(state([CPI], '2026-09-25T13:04:00Z', { params: p }).block_ends_utc, '2026-09-25T13:05:00.000Z');
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_B_COOLDOWN_MIN: '30', XAUUSD_NEWS_COOLDOWN_MIN: '40' }), /may not be shorter/);
  });
  it('DST: a November 08:30 EST release is 13:30Z, a late-October 08:30 EDT release is 12:30Z; windows follow the UTC instant, never the wall clock', () => {
    const nov = mk('CPI m/m', '2026-11-10T08:30:00-05:00'), oct = mk('CPI m/m', '2026-10-13T08:30:00-04:00');
    assert.equal(nov.event_time_utc, '2026-11-10T13:30:00.000Z'); assert.equal(oct.event_time_utc, '2026-10-13T12:30:00.000Z');
    assert.equal(state([nov], '2026-11-10T12:10:00Z').state, 'NORMAL', 'an hour too early (wall-clock confusion) is not a window'); assert.equal(state([nov], '2026-11-10T13:00:00Z').state, 'PRE_NEWS'); assert.equal(state([nov], '2026-11-10T14:29:00Z').state, 'POST_NEWS_COOLDOWN'); assert.equal(state([nov], '2026-11-10T14:30:00Z').state, 'NORMAL');
    assert.equal(state([oct], '2026-10-13T12:00:00Z').state, 'PRE_NEWS'); assert.equal(state([oct], '2026-10-13T13:30:00Z').state, 'NORMAL');
  });
});

// ── C. Tier A FOMC cluster ─────────────────────────────────────────────
describe('V2 Tier A: the FOMC cluster is ONE merged protection interval', () => {
  it('statement + rate + projections (18:00Z) + press conference (18:30Z): PRE from anchor-30, block to max(anchor+150, pc+90, last+35) = 20:30Z; non-anchor rows never open a contradictory PRE state', () => {
    assert.equal(fomcAt('2026-09-30T17:29:00Z').state, 'NORMAL'); const pre = fomcAt('2026-09-30T17:30:00Z'); assert.equal(pre.state, 'PRE_NEWS'); assert.equal(pre.event.tier, 'A'); assert.equal(pre.contributing_events.length, 3, 'the three rows released at the anchor minute carry PRE_NEWS; the later press-conference row does not'); assert.ok(pre.contributing_events.every((c) => c.phase === 'PRE_NEWS' && c.event_name !== 'FOMC Press Conference')); assert.equal(pre.event.cluster_anchor_utc, '2026-09-30T18:00:00.000Z'); assert.equal(pre.event.press_conference_utc, '2026-09-30T18:30:00.000Z');
    const act = fomcAt('2026-09-30T18:02:00Z'); assert.equal(act.state, 'NEWS_ACTIVE'); assert.equal(act.block_ends_utc, '2026-09-30T18:05:00.000Z', 'block_ends_utc keeps the V1 meaning (end of the phases currently in force)'); assert.equal(act.event.clock_min_end_utc, '2026-09-30T20:30:00.000Z', 'the cluster clock minimum is reported alongside from the first minute');
    const mid = fomcAt('2026-09-30T18:20:00Z'); assert.equal(mid.state, 'POST_NEWS_COOLDOWN', 'between the statement and the press conference the cluster is in cooldown, NOT in PRE_NEWS'); assert.ok(mid.contributing_events.every((c) => c.phase === 'POST_NEWS_COOLDOWN')); assert.equal(mid.contributing_events.length, 3, 'the press-conference row has no PRE phase');
    const pc = fomcAt('2026-09-30T18:31:00Z'); assert.equal(pc.state, 'NEWS_ACTIVE'); assert.equal(pc.event.event_name, 'FOMC Press Conference'); assert.equal(pc.block_ends_utc, '2026-09-30T20:30:00.000Z');
    assert.equal(fomcAt('2026-09-30T19:04:00Z').state, 'POST_NEWS_COOLDOWN', 'the V1 end (last row+35 = 19:05) no longer ends the cluster'); assert.equal(fomcAt('2026-09-30T20:29:00Z').state, 'POST_NEWS_COOLDOWN'); assert.equal(fomcAt('2026-09-30T20:30:00Z').state, 'NORMAL');
    assert.ok(mid.contributing_events.every((c) => c.clock_min_end_utc === '2026-09-30T20:30:00.000Z' && c.cluster_anchor_utc === '2026-09-30T18:00:00.000Z'));
  });
  it('missing press-conference row: the cluster still covers anchor+150 (a 14:30 conference is covered to 16:30) and no press-conference time is invented', () => {
    const rows = FOMC_ROWS.slice(0, 2);
    const s = fomcAt('2026-09-30T19:30:00Z', rows); assert.equal(s.state, 'POST_NEWS_COOLDOWN'); assert.equal(s.block_ends_utc, '2026-09-30T20:30:00.000Z'); assert.equal(s.event.press_conference_utc, null);
    assert.equal(fomcAt('2026-09-30T20:30:00Z', rows).state, 'NORMAL');
    const iv = buildProtectionIntervals(rows); assert.equal(iv.length, 2); assert.ok(iv.every((x) => x.press_conf_t === null && x.cluster_id === 'A0'));
  });
  it('press-conference cover dominates when the post minimum is short; overlapping/duplicate FOMC rows collapse into one interval; distant Tier-A rows form separate clusters', () => {
    const p = { ...NEWS_RISK_PARAMS, tierAPostMin: 65 };
    const s = fomcAt('2026-09-30T19:30:00Z', FOMC_ROWS, { params: p }); assert.equal(s.state, 'POST_NEWS_COOLDOWN'); assert.equal(s.block_ends_utc, '2026-09-30T20:00:00.000Z', 'press conference 18:30 + 90');
    const raw = [{ title: 'FOMC Statement', country: 'USD', date: '2026-09-30T14:00:00-04:00', impact: 'High' }, { title: 'FOMC Statement', country: 'USD', date: '2026-09-30T14:00:00-04:00', impact: 'High' }, { title: 'Federal Funds Rate', country: 'USD', date: '2026-09-30T14:00:00-04:00', impact: 'High' }];
    const norm = normalizeCalendar(raw, { source: 'test', sourceTimestamp: SRC, now: NOW }); assert.equal(norm.counts.duplicates, 1); assert.equal(norm.events.length, 2);
    const iv = buildProtectionIntervals(norm.events); assert.equal(new Set(iv.map((x) => x.clock_end)).size, 1); assert.equal(new Set(iv.map((x) => x.cluster_id)).size, 1);
    const far = [mk('Federal Funds Rate', '2026-09-30T18:00:00Z'), mk('FOMC Statement', '2026-09-30T23:00:00Z')];
    const iv2 = buildProtectionIntervals(far); assert.equal(new Set(iv2.map((x) => x.cluster_id)).size, 2, '5 h apart => two clusters'); assert.equal(iv2[0].clock_end, Date.parse('2026-09-30T20:30:00Z')); assert.equal(iv2[1].clock_end, Date.parse('2026-10-01T01:30:00Z'));
  });
});

// ── D. normalisation ───────────────────────────────────────────────────
describe('V2 normalisation confirmation (Tier A/B): completed 15m bars only, clock minimum never bypassed', () => {
  it('aggregateCompleted15m: three confirmed 5m bars per bucket, bucket end <= now; partial and forming buckets are ignored; ms timestamps accepted', () => {
    const t0 = 1790337600; // 12:00Z
    const b5 = []; for (let i = 0; i < 9; i++) b5.push({ time: t0 + i * 300, open: 1, high: 2 + i, low: 0, close: 1 });
    const done = aggregateCompleted15m(b5, t0 + 9 * 300); assert.equal(done.length, 3); assert.deepEqual(done.map((b) => b.time), [t0, t0 + 900, t0 + 1800]); assert.equal(done[2].high, 10);
    assert.equal(aggregateCompleted15m(b5, t0 + 9 * 300 - 1).length, 2, 'the last bucket is not complete until its end');
    assert.equal(aggregateCompleted15m(b5.slice(0, 8), t0 + 3600).length, 2, 'a bucket with two bars is partial and ignored');
    assert.equal(aggregateCompleted15m(b5.map((b) => ({ ...b, time: b.time * 1000 })), t0 + 9 * 300).length, 3, 'millisecond times');
    assert.deepEqual(aggregateCompleted15m(null, t0), []); assert.deepEqual(aggregateCompleted15m([{ time: 'x' }], t0), []);
  });
  it('evaluateNormalization: reference = median 15m true range of [T-25h, T-1h] (>= 24 bars); NORMALIZED only when the last 2 completed post bars are <= 1.5x; a single quiet bar is not enough; forming bars never count', () => {
    const now = TSEC + 4 * 900;
    assert.equal(evaluateNormalization({ bars15m: bars15(TSEC, { post: [4, 3, 1.2, 1.1] }), releaseSec: TSEC, nowSec: now }).status, 'NORMALIZED');
    assert.equal(evaluateNormalization({ bars15m: bars15(TSEC, { post: [4, 3, 3, 1.1] }), releaseSec: TSEC, nowSec: now }).status, 'PENDING', 'one quiet bar after a 3x bar is not normalisation');
    assert.equal(evaluateNormalization({ bars15m: bars15(TSEC, { post: [4, 3, 1.2, 1.1] }), releaseSec: TSEC, nowSec: now - 1 }).status, 'PENDING', 'the 4th bar is still forming one second earlier: only [3, 1.2] count');
    const r = evaluateNormalization({ bars15m: bars15(TSEC, { post: [4] }), releaseSec: TSEC, nowSec: TSEC + 900 }); assert.equal(r.status, 'PENDING'); assert.equal(r.reference_range, 1); assert.equal(r.reference_bars, 96); assert.equal(r.last_ranges.length, 1);
    assert.equal(evaluateNormalization({ bars15m: bars15(TSEC, { refCount: 10, post: [1, 1] }), releaseSec: TSEC, nowSec: now }).status, 'REFERENCE_UNAVAILABLE');
    assert.equal(evaluateNormalization({ bars15m: null, releaseSec: TSEC, nowSec: now }).status, 'BARS_UNAVAILABLE'); assert.equal(evaluateNormalization({ bars15m: [], releaseSec: TSEC, nowSec: now }).status, 'BARS_UNAVAILABLE');
    const p = { ...NEWS_RISK_PARAMS, normalizationConfirmBars: 1 }; assert.equal(evaluateNormalization({ bars15m: bars15(TSEC, { post: [4, 3, 3, 1.1] }), releaseSec: TSEC, nowSec: now, params: p }).status, 'NORMALIZED');
  });
  it('state machine: normalisation not reached keeps POST_NEWS_COOLDOWN after the clock minimum (audited, bounded by +120); reached => NORMAL; missing reference/bars => clock minimum; quiet bars can never end the block before T+60', () => {
    const src = (iso) => ({ ...CAL_OK, source_timestamp: iso });
    const EXT = { ...NEWS_RISK_PARAMS, normalizationMaxExtensionMin: 120 };
    const st = (iso, post) => evaluateNewsState({ events: [CPI], now: at(iso), calendar: src(iso), bars15m: bars15(TSEC, { post }), params: EXT });
    const quietEarly = st('2026-09-25T13:15:00Z', [1, 1, 1]); assert.equal(quietEarly.state, 'POST_NEWS_COOLDOWN', 'T+45: clock minimum in force whatever the bars say'); assert.equal(quietEarly.event.normalization_pending, false);
    const pend = st('2026-09-25T13:30:00Z', [5, 4, 3, 3]); assert.equal(pend.state, 'POST_NEWS_COOLDOWN'); assert.equal(pend.event.normalization_pending, true); assert.equal(pend.normalization.status, 'PENDING'); assert.equal(pend.block_ends_utc, '2026-09-25T15:30:00.000Z', 'upper bound = clock minimum + max extension'); assert.equal(pend.normalization.extension_min, 0);
    const norm = st('2026-09-25T13:45:00Z', [5, 4, 3, 1.2, 1.1]); assert.equal(norm.state, 'NORMAL');
    const stillHot = st('2026-09-25T14:30:00Z', [5, 4, 3, 3, 3, 3, 3, 3]); assert.equal(stillHot.state, 'POST_NEWS_COOLDOWN'); assert.equal(stillHot.normalization.extension_min, 60);
    assert.equal(st('2026-09-25T15:30:00Z', new Array(12).fill(3)).state, 'NORMAL', 'max extension (+120) reached: the block ends, the shock layer remains');
    assert.equal(evaluateNewsState({ events: [CPI], now: at('2026-09-25T13:30:00Z'), calendar: src('2026-09-25T13:30:00Z'), bars15m: bars15(TSEC, { refCount: 5, post: [5, 5, 5, 5] }), params: EXT }).state, 'NORMAL', 'REFERENCE_UNAVAILABLE => clock minimum only');
    assert.equal(evaluateNewsState({ events: [CPI], now: at('2026-09-25T13:30:00Z'), calendar: src('2026-09-25T13:30:00Z'), bars15m: null, params: EXT }).state, 'NORMAL', 'BARS_UNAVAILABLE => clock minimum only');
    const c = evaluateNewsState({ events: [mk('PPI m/m', '2026-09-25T12:30:00Z')], now: at('2026-09-25T13:05:00Z'), calendar: src('2026-09-25T13:05:00Z'), bars15m: bars15(TSEC, { post: [5, 5, 5] }), params: EXT }); assert.equal(c.state, 'NORMAL', 'Tier C has no normalisation extension');
    const off = evaluateNewsState({ events: [CPI], now: at('2026-09-25T13:30:00Z'), calendar: src('2026-09-25T13:30:00Z'), bars15m: bars15(TSEC, { post: [5, 5, 5, 5] }) });
    assert.equal(off.state, 'NORMAL', 'DEFAULT: extension off => the clock minimum ends the block'); assert.equal(off.normalization_shadow.status, 'PENDING', 'but the decision is still measured in shadow'); assert.equal(off.normalization_shadow.enforced, false); assert.equal(off.normalization_shadow.event_name, 'CPI m/m'); assert.equal(off.normalization_shadow.minutes_after_clock_min, 0);
    assert.equal(evaluateNewsState({ events: [CPI], now: at('2026-09-25T15:31:00Z'), calendar: src('2026-09-25T15:31:00Z'), bars15m: bars15(TSEC, { post: new Array(13).fill(5) }) }).normalization_shadow, undefined, 'the shadow window is 2 h after the clock minimum');
    const fomc = evaluateNewsState({ events: FOMC_ROWS, now: at('2026-09-30T20:30:00Z'), calendar: src('2026-09-30T20:30:00Z'), bars15m: bars15(Date.parse('2026-09-30T18:00:00Z') / 1000, { post: new Array(10).fill(4) }), params: EXT }); assert.equal(fomc.state, 'POST_NEWS_COOLDOWN', 'Tier A normalisation is anchored on the statement'); assert.equal(fomc.normalization.status, 'PENDING');
  });
});

// ── E. DATA_UNAVAILABLE + remembered events ────────────────────────────
describe('V2 DATA_UNAVAILABLE: fail-closed, remembered windows from the last accepted calendar', () => {
  const stale = (iso, events = [CPI]) => evaluateNewsState({ events, now: at(iso), calendar: { ...CAL_OK, source_timestamp: '2026-09-25T04:00:00.000Z' } }); // > 6 h old at 12:xx
  it('stale calendar inside a remembered CPI window: DATA_UNAVAILABLE with remembered_block active; BLOCK policy blocks as before; ALLOW policy blocks with NEWS_REMEMBERED_EVENT_BLOCK', () => {
    const s = stale('2026-09-25T12:40:00Z'); assert.equal(s.state, 'DATA_UNAVAILABLE'); assert.equal(s.reason, 'CALENDAR_STALE'); assert.equal(s.remembered_block.active, true); assert.equal(s.remembered_block.contributing[0].event_name, 'CPI m/m'); assert.equal(s.remembered_block.block_ends_utc, '2026-09-25T13:30:00.000Z'); assert.equal(s.remembered_block.source_timestamp, '2026-09-25T04:00:00.000Z');
    assert.equal(evaluateNewsEntryPolicy({ news: s }).reason, 'NEWS_DATA_UNAVAILABLE_BLOCK');
    const allow = evaluateNewsEntryPolicy({ news: s, params: { ...NEWS_RISK_PARAMS, dataUnavailablePolicy: 'ALLOW' } }); assert.equal(allow.allowed, false); assert.equal(allow.reason, 'NEWS_REMEMBERED_EVENT_BLOCK'); assert.equal(allow.details.block_ends_utc, '2026-09-25T13:30:00.000Z');
  });
  it('remembered windows expire by their own clock (no permanent false events); provider error without events remembers nothing; missing events => no remembered block', () => {
    const after = stale('2026-09-25T13:30:00Z'); assert.equal(after.state, 'DATA_UNAVAILABLE'); assert.equal(after.remembered_block.active, false);
    assert.equal(evaluateNewsEntryPolicy({ news: after, params: { ...NEWS_RISK_PARAMS, dataUnavailablePolicy: 'ALLOW' } }).reason, 'NEWS_DATA_UNAVAILABLE_ALLOWED');
    const old = evaluateNewsState({ events: [CPI], now: at('2026-10-20T12:40:00Z'), calendar: { ...CAL_OK, source_timestamp: SRC } }); assert.equal(old.remembered_block.active, false, 'a weeks-old snapshot opens no window');
    const err = evaluateNewsState({ events: [], now: at('2026-09-25T12:40:00Z'), calendar: { status: 'ERROR', error: 'HTTP_503', source_timestamp: null } }); assert.equal(err.state, 'DATA_UNAVAILABLE'); assert.equal(err.remembered_block.active, false);
    assert.equal(evaluateNewsState({ events: undefined, now: at('2026-09-25T12:40:00Z'), calendar: CAL_OK }).remembered_block.active, false);
  });
  it('remembered windows use the clock minimum only (no bars while untrusted) and Tier A clusters are remembered as clusters; timestamps come only from previously accepted records', () => {
    const s = evaluateNewsState({ events: FOMC_ROWS, now: at('2026-09-30T19:30:00Z'), calendar: { ...CAL_OK, source_timestamp: '2026-09-30T08:00:00.000Z' }, bars15m: bars15(Date.parse('2026-09-30T18:00:00Z') / 1000, { post: [1, 1, 1, 1, 1, 1] }) });
    assert.equal(s.state, 'DATA_UNAVAILABLE'); assert.equal(s.remembered_block.active, true); assert.equal(s.remembered_block.block_ends_utc, '2026-09-30T20:30:00.000Z'); assert.ok(s.remembered_block.contributing.every((c) => c.tier === 'A'));
  });
  it('monitor restart: a persisted snapshot restores the same events; a later provider outage turns into DATA_UNAVAILABLE with the remembered CPI window (deterministic, no duplicates)', async () => {
    const raw = [{ title: 'CPI m/m', country: 'USD', date: '2026-09-25T08:30:00-04:00', impact: 'High' }, { title: 'CPI m/m', country: 'USD', date: '2026-09-25T08:30:00-04:00', impact: 'High' }];
    let clock = at('2026-09-25T09:00:00Z');
    const provider = memoryProvider([{ ok: true, raw, source_timestamp: '2026-09-25T09:00:00.000Z' }, { ok: false, error: 'HTTP_503' }]);
    let saved = null;
    const m1 = createNewsMonitor({ provider, now: () => clock, snapshotPath: 'mem', _deps: { loadSnapshot: () => null, saveSnapshot: (_p, s) => { saved = s; } } });
    await m1.refresh({ now: clock, force: true }); assert.equal(saved.events.length, 1, 'duplicate collapsed before persisting');
    const m2 = createNewsMonitor({ provider: memoryProvider([{ ok: false, error: 'HTTP_503' }]), now: () => clock, snapshotPath: 'mem', _deps: { loadSnapshot: () => saved, saveSnapshot: () => {} } });
    clock = at('2026-09-25T12:40:00Z'); assert.equal(m2.evaluate({ now: clock, scheduleRefresh: false }).state, 'POST_NEWS_COOLDOWN', 'restored snapshot still fresh (< 6 h)');
    clock = at('2026-09-25T15:10:00Z'); // snapshot now 6 h 10 min old => stale; CPI window over anyway
    const s = m2.evaluate({ now: clock, scheduleRefresh: false }); assert.equal(s.state, 'DATA_UNAVAILABLE'); assert.equal(s.remembered_block.active, false);
    const s2 = evaluateNewsState({ events: m2.events(), now: at('2026-09-25T13:10:00Z'), calendar: { ...m2.status().calendar, source_timestamp: '2026-09-25T06:00:00.000Z' } }); assert.equal(s2.remembered_block.active, true); assert.equal(s2.remembered_block.contributing.length, 1);
  });
});

// ── F. configuration ───────────────────────────────────────────────────
describe('V2 configuration envelope (REAL): defaults, env names, hard ranges', () => {
  it('defaults 55 / 150 / 90 / 120 / 1.5 / 2 / 120; the layer still cannot be disabled; every V1 authority unchanged', () => {
    const c = resolveRealExecutorConfig({});
    assert.equal(c.newsTierBCooldownMin, 55); assert.equal(c.newsTierAPostMin, 150); assert.equal(c.newsTierAPressConfCoverMin, 90); assert.equal(c.newsTierAClusterGapMin, 120); assert.equal(c.newsNormalizationRatio, 1.5); assert.equal(c.newsNormalizationConfirmBars, 2); assert.equal(c.newsNormalizationMaxExtensionMin, 0, 'extension OFF by default (shadow only)');
    assert.equal(c.newsRiskParams.tierBCooldownMin, 55); assert.equal(c.newsRiskParams.preNewsWindowMin, 30); assert.equal(c.newsRiskParams.postNewsCooldownMin, 30); assert.equal(c.newsRiskParams.dataUnavailablePolicy, 'BLOCK'); assert.ok(Object.isFrozen(c.newsRiskParams));
    assert.equal(c.lotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(c.maxConsecutiveLosses, 2); assert.equal(c.minEffectiveRr, 1.7); assert.equal(c.thesisExit, true); assert.equal(c.computeSizing, undefined); assert.equal(c.newsProtection, true);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_PROTECTION: 'off' }), /cannot disable/);
  });
  it('env overrides within hard ranges; out-of-range values throw instead of being clamped', () => {
    const c = resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_B_COOLDOWN_MIN: '70', XAUUSD_NEWS_TIER_A_POST_MIN: '180', XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN: '120', XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN: '90', XAUUSD_NEWS_NORMALIZATION_RATIO: '2', XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS: '3', XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN: '60' });
    assert.equal(c.newsRiskParams.tierBCooldownMin, 70); assert.equal(c.newsRiskParams.tierAPostMin, 180); assert.equal(c.newsRiskParams.tierAPressConfCoverMin, 120); assert.equal(c.newsRiskParams.tierAClusterGapMin, 90); assert.equal(c.newsRiskParams.normalizationRatio, 2); assert.equal(c.newsRiskParams.normalizationConfirmBars, 3); assert.equal(c.newsRiskParams.normalizationMaxExtensionMin, 60);
    assert.equal(resolveRealExecutorConfig({}).newsRiskParams.normalizationMaxExtensionMin, 0);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_B_COOLDOWN_MIN: '29' }), /\[30, 120\]/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_A_POST_MIN: '64' }), /\[65, 240\]/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN: '181' }), /\[30, 180\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN: '10' }), /\[30, 240\]/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_NORMALIZATION_RATIO: '1.1' }), /\[1.2, 3.0\]/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS: '5' }), /\[1, 4\]/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS: '1.5' }), /integer/); assert.throws(() => resolveRealExecutorConfig({ XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN: '241' }), /\[0, 240\]/);
  });
});

// ── G. REAL executor integration ───────────────────────────────────────
const SIG = 'aaaaaaaaaaaaaaaa', SIG2 = 'bbbbbbbbbbbbbbbb', SIG3 = 'cccccccccccccccc';
const BID = 4265.158, ASK = 4265.418, SPREAD = 0.26;
function realHello({ equity = 100 } = {}) {
  return { real_verified: true, profile: 'real', checks: { account_readable: true, trade_mode_is_real: true, server_not_demo: true, login_matches_bridge: true, server_matches_bridge: true, login_matches_request: true, server_matches_request: true, terminal_connected: true, terminal_algo_trading_enabled: true, symbol_available: true, symbol_matches_request: true },
    account: { login: 460149329, server: 'Exness-MT5Real51', trade_mode: 2, currency: 'USD', balance: equity, equity, margin: 0, margin_free: equity, leverage: 500 }, terminal: { connected: true, trade_allowed: true, build: 6182, path: 'C:\\MT5-REAL' }, symbol: { name: 'XAUUSDm', digits: 3, point: 0.001, trade_contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01 } };
}
const tick = (clock, over = {}) => ({ symbol: 'XAUUSDm', bid: BID, ask: ASK, time: clock.now().getTime() / 1000 - 1, spread_price: SPREAD, spread_points: 260, digits: 3, point: 0.001, contract_size: 100, volume_min: 0.01, volume_max: 200, volume_step: 0.01, stops_level: 0, ...over });
class FakeBridge { constructor() { this.script = {}; this.calls = []; } set(c, f) { this.script[c] = f; } async request(cmd, params) { this.calls.push({ cmd, params }); const fn = this.script[cmd]; if (!fn) throw new Mt5BridgeError('UNSCRIPTED', cmd); const r = fn(params); if (r instanceof Error) throw r; return r; } count(c) { return this.calls.filter((x) => x.cmd === c).length; } last(c) { return this.calls.filter((x) => x.cmd === c).at(-1)?.params; } }
function makeClock(start = new Date('2026-09-25T10:00:00.000Z')) { let t = start.getTime(); return { now: () => new Date(t), advance: (ms) => { t += ms; }, set: (iso) => { t = Date.parse(iso); } }; }
function makeStore(initial = null) { const st = { state: initial, log: [], kill: { active: false, close: false } }; st.deps = { loadState: () => (st.state ? JSON.parse(JSON.stringify(st.state)) : loadMt5State('/nonexistent')), saveState: (_p, s) => { st.state = JSON.parse(JSON.stringify(s)); }, appendLog: (_p, e) => st.log.push(e), readKillSwitch: () => st.kill, setInterval: () => 't', clearInterval: () => {}, sleep: async () => {} }; st.events = (t) => st.log.filter((e) => e.type === t); return st; }
function live(clock, { profit = 0, sl = 4257.658, tp = 4295.418, price_open = ASK, ticket = 7001 } = {}) { return { ticket, time: clock.now().getTime() / 1000, type: 0, magic: REAL_MAGIC, identifier: ticket, reason: 3, volume: 0.01, price_open, sl, tp, price_current: price_open + profit, swap: 0, profit, symbol: 'XAUUSDm', comment: `MCP:${SIG}` }; }
function bridgeOk(clock, tickFn = () => tick(clock)) {
  const b = new FakeBridge(); b.set('hello', () => realHello()); b.set('positions', () => ({ positions: [] })); b.set('tick', tickFn); b.set('history', () => ({ deals: [] })); b.set('deals', () => ({ deals: [] }));
  b.set('open', (p) => { const price = p.side === 'SELL' ? tickFn().bid : tickFn().ask; return { result: { retcode: 10009, deal: 9101, order: 7001, volume: p.volume, price }, entry_deal: { ticket: 9101, order: 7001, time: clock.now().getTime() / 1000, type: 0, entry: 0, magic: REAL_MAGIC, position_id: 7001, volume: p.volume, price, commission: 0, swap: 0, profit: 0, fee: 0, comment: `MCP:${SIG}` }, position_id: 7001, position: live(clock, { price_open: price, sl: p.sl, tp: p.tp }), requested_price: price }; });
  return b;
}
function build({ bridge, store, clock, env = {}, newsMonitor }) { return createMt5Executor({ config: resolveRealExecutorConfig(env), bridge, statePath: 'm', logPath: 'm', killSwitchPath: 'm', log: () => {}, now: clock.now, newsMonitor, _deps: store.deps }); }
function sig(clock, id = SIG, over = {}) { const calculated_at = over.calculated_at ?? new Date(clock.now().getTime() - 20_000).toISOString(); const entry = over.entry ?? 4265.0; return { signalId: id, alert: { action: over.action ?? 'BUY', entry, sl: entry - 5, tp1: entry + 5, tp2: entry + 11, rr: 2.2, quality: 72, timeframe: '5m', setup: 'BO', time: calculated_at }, result: { status: 'OK', action: over.action ?? 'BUY', calculated_at, schema_version: '1.2.0', engine_profile: 'intraday_5m', signal: { signal_id: id, is_new_event: true, thesis_id: `th-${id}` }, diagnostics: { candidate: { model: 'BO', side: over.action ?? 'BUY', anchor: entry - 3 }, objective: { price: entry + 11, source: '5m_pivot' } }, market_data_times: { '5m': clock.now().getTime() / 1000 - 300 } } }; }
/** Confirmed 5m bars ending at endSec: `count` calm bars (ATR ~ 1.0) optionally followed by hot bars. */
/** `count` calm bars (ATR ~ 1.0) ENDING at endSec (last calm bar opens at endSec-300), then `hot` bars opening at endSec, endSec+300, ... */
const bars5m = ({ count = 300, endSec, halfRange = 0.5, hot = [] } = {}) => { const calm = Array.from({ length: count }, (_, i) => ({ time: endSec - (count - i) * 300, open: 4265, high: 4265 + halfRange, low: 4265 - halfRange, close: 4265 })); const hotBars = hot.map((r, k) => ({ time: endSec + k * 300, open: 4265, high: 4265 + r / 2, low: 4265 - r / 2, close: 4265 })); return [...calm, ...hotBars]; };
async function warm(ex, clock, passes = 60, bars = null) { await ex.reviewThesis({ result: { primary_confirmed_bars: bars ?? bars5m({ count: 60, endSec: clock.now().getTime() / 1000 - 60 }) } }); for (let i = 0; i < passes; i++) { clock.advance(3000); await ex.monitorOnce(); } }
const prot = (e) => e.protection;
const FIX_CPI = [{ title: 'CPI m/m', country: 'USD', date: '2026-09-25T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.2%' }];

describe('V2 REAL executor: independent layers, fresh signals, open-position policy, no direction from news', () => {
  it('Tier-B live path with bars: at T+61 the block persists while the completed 15m bars are still hot (normalisation pending, audited); quiet bars end it; a signal calculated during the extension is never replayed', async () => {
    const clock = makeClock(at('2026-09-25T12:05:00Z')); const store = makeStore(); const bridge = bridgeOk(clock);
    const env = { XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN: '120' };
    const { monitor } = fixtureCalendarMonitor({ raw: FIX_CPI, sourceTimestamp: '2026-09-25T12:00:00.000Z', now: clock.now, params: resolveRealExecutorConfig(env).newsRiskParams }); // the CLI wires config.newsRiskParams into the monitor
    const ex = build({ bridge, store, clock, newsMonitor: monitor, env }); await ex.start();
    assert.equal(store.events('PROTECTION_STARTED')[0].news_params.tierBCooldownMin, 55); assert.equal(store.events('PROTECTION_STARTED')[0].news_params.normalizationMaxExtensionMin, 120, 'extension enabled explicitly for this test (default 0)');
    const feed = async (iso, hot) => { clock.set(iso); await ex.reviewThesis({ result: { primary_confirmed_bars: bars5m({ count: 300, endSec: TSEC, hot }) } }); await ex.monitorOnce(); return ex.status().news_protection.news; };
    const hot = new Array(12).fill(3); // 12 hot 5m bars = four 15m bars of ~3x range after 12:30
    const s1 = await feed('2026-09-25T13:31:00Z', hot); assert.equal(s1.state, 'POST_NEWS_COOLDOWN'); assert.equal(s1.normalization.status, 'PENDING'); assert.equal(s1.event.normalization_pending, true);
    const r0 = await ex.executeSignal(sig(clock, SIG2)); assert.equal(r0.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(prot(store.events('SKIPPED')[0]).news_tier, 'B'); assert.equal(prot(store.events('SKIPPED')[0]).normalization.status, 'PENDING');
    assert.equal((await ex.executeSignal(sig(clock, SIG2))).reason, 'DUPLICATE_SIGNAL', 'a re-delivered signal id is deduplicated first');
    clock.set('2026-09-25T14:00:30Z'); const during = sig(clock, SIG3, { calculated_at: '2026-09-25T14:00:10.000Z' }); // calculated inside the extension, 50 s before the clear
    const s2 = await feed('2026-09-25T14:01:00Z', [...hot, 1, 1, 1, 1, 1, 1]); assert.equal(s2.state, 'NORMAL', 'two quiet completed 15m bars => normalised');
    assert.equal(store.events('PROTECTION_NORMALIZED').length, 1);
    const r1 = await ex.executeSignal(during); assert.equal(r1.reason, 'SIGNAL_PREDATES_NORMALIZATION'); assert.equal(bridge.count('open'), 0);
    const SIG4 = 'dddddddddddddddd';
    clock.advance(60_000); const r2 = await ex.executeSignal(sig(clock, SIG4)); assert.equal(r2.executed, true, r2.reason); assert.equal(bridge.last('open').volume, 0.01); assert.equal(prot(store.events('OPENED')[0]).news_state, 'NORMAL');
  });
  it('DEFAULT config: the extension is OFF -- at T+61 with hot bars the block has ended at the clock minimum and the shadow normalisation is audited (PENDING, enforced:false)', async () => {
    const clock = makeClock(at('2026-09-25T12:05:00Z')); const store = makeStore(); const bridge = bridgeOk(clock);
    const { monitor } = fixtureCalendarMonitor({ raw: FIX_CPI, sourceTimestamp: '2026-09-25T12:00:00.000Z', now: clock.now });
    const ex = build({ bridge, store, clock, newsMonitor: monitor }); await ex.start();
    clock.set('2026-09-25T13:31:00Z'); await ex.reviewThesis({ result: { primary_confirmed_bars: bars5m({ count: 300, endSec: TSEC, hot: new Array(12).fill(3) }) } }); await ex.monitorOnce();
    const n = ex.status().news_protection.news; assert.equal(n.state, 'NORMAL'); assert.equal(store.state.protection.blocking, false);
    clock.advance(60_000); const r = await ex.executeSignal(sig(clock)); assert.equal(r.executed, true, r.reason); assert.equal(prot(store.events('OPENED')[0]).normalization_shadow.status, 'PENDING'); assert.equal(prot(store.events('OPENED')[0]).normalization_shadow.enforced, false);
  });
  it('minimum clock protection cannot be bypassed: shock NORMAL, spread normal, feed fresh, quiet bars -- a Tier-B signal at T+40 is still NEWS_ENTRY_BLOCK', async () => {
    const clock = makeClock(at('2026-09-25T12:05:00Z')); const store = makeStore(); const bridge = bridgeOk(clock);
    const { monitor } = fixtureCalendarMonitor({ raw: FIX_CPI, sourceTimestamp: '2026-09-25T12:00:00.000Z', now: clock.now });
    const ex = build({ bridge, store, clock, newsMonitor: monitor }); await ex.start();
    clock.set('2026-09-25T13:04:00Z'); await warm(ex, clock, 60, bars5m({ count: 300, endSec: TSEC, hot: [1, 1, 1, 1, 1, 1] }));
    assert.equal(ex.status().news_protection.shock.state, 'NORMAL');
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(r.details.news_state, 'POST_NEWS_COOLDOWN'); assert.equal(prot(store.events('SKIPPED')[0]).guards.shock.reason, 'OK'); assert.equal(bridge.count('open'), 0);
  });
  it('shock during news, and a shock persisting after the calendar block: both reasons are audited; calendar expiry never clears a VOLATILITY_SHOCK; the fresh-signal contract holds after the last reason clears', async () => {
    const clock = makeClock(); const store = makeStore();
    let phase = 'POST_NEWS_COOLDOWN'; let bid = BID;
    const bridge = bridgeOk(clock, () => tick(clock, { bid, ask: bid + SPREAD }));
    const nm = scriptedNewsMonitor(() => (phase === 'NORMAL' ? {} : { state: phase, reason: `${phase}:CPI`, event: { event_id: 'e1', event_name: 'CPI m/m', currency: 'USD', impact: 'HIGH', minutes_to_event: -20, tier: 'B' }, block_ends_utc: '2026-09-25T13:30:00.000Z' }));
    const ex = build({ bridge, store, clock, newsMonitor: nm }); await ex.start(); await warm(ex, clock);
    bid += 2.0; clock.advance(3000); await ex.monitorOnce(); clock.advance(3000); await ex.monitorOnce();
    assert.equal(ex.status().news_protection.shock.state, 'VOLATILITY_SHOCK'); assert.deepEqual(store.state.protection.block_reasons, ['NEWS:POST_NEWS_COOLDOWN', 'VOLATILITY_SHOCK']);
    phase = 'NORMAL'; clock.advance(3000); await ex.monitorOnce();
    assert.equal(store.state.protection.blocking, true); assert.deepEqual(store.state.protection.block_reasons, ['VOLATILITY_SHOCK'], 'the calendar cleared, the shock did not');
    const r = await ex.executeSignal(sig(clock, SIG, { entry: bid + SPREAD })); assert.equal(r.reason, 'VOLATILITY_SHOCK_ENTRY_BLOCK'); assert.equal(prot(store.events('SKIPPED')[0]).guards.news.reason, 'OK');
    for (let i = 0; i < 190; i++) { clock.advance(3000); await ex.monitorOnce(); } // 570 s quiet: still VOLATILITY_SHOCK
    assert.equal(ex.status().news_protection.shock.state, 'VOLATILITY_SHOCK');
    const inside = sig(clock, SIG2, { entry: bid + SPREAD }); // calculated while the shock block is still in force
    for (let i = 0; i < 30; i++) { clock.advance(3000); await ex.monitorOnce(); } // > 600 s quiet
    assert.equal(ex.status().news_protection.shock.state, 'NORMAL'); assert.equal(store.state.protection.blocking, false);
    assert.equal((await ex.executeSignal(inside)).reason, 'SIGNAL_PREDATES_NORMALIZATION'); clock.advance(20_000); assert.equal((await ex.executeSignal(sig(clock, SIG3, { entry: bid + SPREAD }))).executed, true);
  });
  it('after the calendar cooldown: an abnormal relative spread still blocks (SPREAD_ABNORMAL) and a stale feed still blocks (FEED_UNHEALTHY_BLOCK); news OK is not enough', async () => {
    const clock = makeClock(); const store = makeStore(); let spread = SPREAD; let age = 1;
    const bridge = bridgeOk(clock, () => tick(clock, { spread_price: spread, ask: BID + spread, time: clock.now().getTime() / 1000 - age }));
    const ex = build({ bridge, store, clock, newsMonitor: scriptedNewsMonitor(() => ({})) }); await ex.start(); await warm(ex, clock);
    spread = 0.55; const r1 = await ex.executeSignal(sig(clock)); assert.equal(r1.reason, 'SPREAD_ABNORMAL'); assert.equal(prot(store.events('SKIPPED')[0]).guards.news.reason, 'OK');
    spread = SPREAD; age = 200; clock.advance(3000); await ex.monitorOnce();
    assert.deepEqual(store.state.protection.block_reasons, ['FEED_STALE'], 'the protection layer flags the stale feed independently of the calendar');
    const r2 = await ex.executeSignal(sig(clock, SIG2)); assert.equal(r2.reason, 'STALE_QUOTE', 'the pre-existing REAL quote-age gate rejects first; the feed guard (FEED_UNHEALTHY_BLOCK) is the second line'); assert.equal(bridge.count('open'), 0);
  });
  it('open-position policy (O1): a position open through PRE_NEWS / NEWS_ACTIVE / a Tier-A cluster is never closed, reversed or modified by news; monitor HOLDs; broker SL/TP, thesis exit and monetary monitor keep authority', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    let phase = 'NORMAL';
    const nm = scriptedNewsMonitor(() => (phase === 'NORMAL' ? {} : { state: phase, reason: `${phase}:FOMC Statement`, event: { event_id: 'f1', event_name: 'FOMC Statement', currency: 'USD', impact: 'HIGH', minutes_to_event: 1, tier: 'A' } }));
    const ex = build({ bridge, store, clock, newsMonitor: nm }); await ex.start();
    assert.equal((await ex.executeSignal(sig(clock))).executed, true);
    bridge.set('positions', () => ({ positions: [live(clock, { profit: 3 })] }));
    for (const p of ['PRE_NEWS', 'NEWS_ACTIVE', 'POST_NEWS_COOLDOWN']) { phase = p; clock.advance(3000); const m = await ex.monitorOnce(); assert.equal(m.action, 'HOLD', p); }
    assert.equal(bridge.count('close'), 0); assert.equal(bridge.count('modify'), 0); assert.equal(store.events('CLOSE_TRIGGERED').length, 0); assert.equal(store.state.position.side, 'BUY');
    assert.ok(store.events('PROTECTION_BLOCK_STARTED').every((e) => e.open_position_action === 'NONE'));
    assert.equal((await ex.executeSignal(sig(clock, SIG2))).reason, 'POSITION_ALREADY_OPEN', 'the one-position gate rejects first (unchanged precedence); the news block is also in force'); assert.equal(store.state.protection.blocking, true); assert.deepEqual(store.state.protection.block_reasons, ['NEWS:POST_NEWS_COOLDOWN']);
  });
  it('news never creates BUY or SELL: with only news windows and no engine signal there is never an order; the news verdict carries no direction, and the same tier blocks BUY and SELL identically', async () => {
    const clock = makeClock(); const store = makeStore(); const bridge = bridgeOk(clock);
    const nm = scriptedNewsMonitor(() => ({ state: 'NEWS_ACTIVE', reason: 'NEWS_ACTIVE:Non-Farm Employment Change', event: { event_id: 'n1', event_name: 'Non-Farm Employment Change', currency: 'USD', impact: 'HIGH', minutes_to_event: 0, tier: 'B', actual: '250K', forecast: '150K' } }));
    const ex = build({ bridge, store, clock, newsMonitor: nm }); await ex.start();
    for (let i = 0; i < 20; i++) { clock.advance(3000); await ex.monitorOnce(); }
    assert.equal(bridge.count('open'), 0); assert.equal(store.events('INTENT').length, 0);
    const buy = await ex.executeSignal(sig(clock, SIG, { action: 'BUY' })), sell = await ex.executeSignal(sig(clock, SIG2, { action: 'SELL' }));
    assert.equal(buy.reason, 'NEWS_ENTRY_BLOCK'); assert.equal(sell.reason, 'NEWS_ENTRY_BLOCK');
    const v = evaluateNewsEntryPolicy({ news: nm.evaluate({ now: clock.now() }) }); for (const k of ['action', 'side', 'direction']) assert.equal(k in v, false); assert.equal(v.details.event.actual, '250K', 'a surprise is audited, never acted on');
  });
  it('DATA_UNAVAILABLE under ALLOW with a remembered Tier-B window blocks (NEWS_REMEMBERED_EVENT_BLOCK, audited as NEWS:REMEMBERED_EVENT); once the remembered window expires ALLOW permits (audited); under BLOCK it stays blocked', async () => {
    const clock = makeClock(at('2026-09-25T12:40:00Z')); const store = makeStore(); const bridge = bridgeOk(clock);
    const { monitor } = fixtureCalendarMonitor({ raw: FIX_CPI, sourceTimestamp: '2026-09-25T04:00:00.000Z', now: clock.now });
    const ex = build({ bridge, store, clock, newsMonitor: monitor, env: { XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY: 'ALLOW' } }); await ex.start();
    assert.deepEqual(store.events('PROTECTION_BLOCK_STARTED')[0].reasons, ['NEWS:REMEMBERED_EVENT']);
    const r = await ex.executeSignal(sig(clock)); assert.equal(r.reason, 'NEWS_REMEMBERED_EVENT_BLOCK'); assert.equal(prot(store.events('SKIPPED')[0]).remembered_block_active, true);
    clock.set('2026-09-25T13:31:00Z'); await ex.monitorOnce(); assert.equal(store.state.protection.blocking, false);
    clock.advance(30_000); const r2 = await ex.executeSignal(sig(clock, SIG2)); assert.equal(r2.executed, true); assert.equal(prot(store.events('OPENED')[0]).guards.news.reason, 'NEWS_DATA_UNAVAILABLE_ALLOWED');
    const c2 = makeClock(at('2026-09-25T12:40:00Z')); const s2 = makeStore(); const b2 = bridgeOk(c2);
    const { monitor: m2 } = fixtureCalendarMonitor({ raw: FIX_CPI, sourceTimestamp: '2026-09-25T04:00:00.000Z', now: c2.now });
    const ex2 = build({ bridge: b2, store: s2, clock: c2, newsMonitor: m2 }); await ex2.start();
    assert.deepEqual(s2.events('PROTECTION_BLOCK_STARTED')[0].reasons, ['NEWS:DATA_UNAVAILABLE']); assert.equal((await ex2.executeSignal(sig(c2))).reason, 'NEWS_DATA_UNAVAILABLE_BLOCK');
  });
});
