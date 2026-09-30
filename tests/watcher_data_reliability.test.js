/**
 * P1 watcher data-reliability layer (src/engine/watcherDataReliability.js):
 * deterministic tests with fully injected chart/engine deps. No CDP, no
 * timers, no filesystem beyond a temp dir for the state-recovery case.
 *
 * Also proves the repair does not alter decisions: for identical, ready
 * market inputs the sweep hands calculateEntry() byte-identical bars, and
 * the frozen files (watcher.js, xauusd_calculate.js, ...) are not touched
 * (the strategy fingerprint test remains the authority for that).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWatcherReliability, createReadinessRead, verifySeriesTimeframe, foldOps, emptyCounters, DEFAULTS } from '../src/engine/watcherDataReliability.js';
import { runWatcherCycle, peekLatest5mCandle } from '../src/engine/watcher.js';
import { fetchMultiTimeframeBars, resolveDeps, calculateEntry } from '../src/core/xauusd_calculate.js';
import { loadWatcherState, saveWatcherState, DEFAULT_WATCHER_STATE } from '../src/engine/watcherState.js';
import { evaluateEntry } from '../src/engine/mt5Policy.js';
import { resolveRealExecutorConfig } from '../src/engine/mt5RealPolicy.js';

const NOW = 1_790_800_200; // fixed "now" (s) on an exact 5m boundary (1790800200 / 300 = 5969334); polls run at NOW + 90 s
const fixedNow = (sec) => () => new Date(sec * 1000);
const noSleep = async () => {};
const withLock = async (_p, fn) => fn();

/** Synthetic bars: `n` bars of `tfSec` spacing ending with a forming bar that opens at `lastOpen`. */
function series(tfSec, n, lastOpen, base = 4000) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = lastOpen - i * tfSec;
    const o = base + Math.sin(t / 1000) * 5;
    out.push({ time: t, open: o, high: o + 1.5, low: o - 1.5, close: o + Math.cos(t / 700), volume: 100 });
  }
  return out;
}

/** A fake chart that serves the CORRECT series for whatever timeframe was last selected. */
function fakeChart({ resolution = '30', nowSec = NOW, failFirst = 0, wrongTfFor = {}, fetchThrowFor = {} } = {}) {
  const calls = { setTimeframe: [], getOhlcv: [] };
  let current = String(resolution);
  let failures = failFirst;
  const tfSecOf = (tf) => ({ 5: 300, 15: 900, 30: 1800, 60: 3600, 120: 7200, 240: 14400, 480: 28800, D: 86400, W: 604800, M: 2592000 })[tf];
  const lastOpenFor = (tf) => Math.floor(nowSec / tfSecOf(tf)) * tfSecOf(tf);
  return {
    calls,
    resolution: () => current,
    getState: async () => ({ success: true, symbol: 'OANDA:XAUUSD', resolution: current }),
    setTimeframe: async ({ timeframe }) => { calls.setTimeframe.push(String(timeframe)); current = String(timeframe); return { success: true, timeframe }; },
    getOhlcv: async ({ count }) => {
      calls.getOhlcv.push({ tf: current, count });
      if (failures > 0) { failures--; throw new Error('Could not extract OHLCV data. The chart may still be loading.'); }
      if (fetchThrowFor[current]) throw new Error('Could not extract OHLCV data. The chart may still be loading.');
      const tf = wrongTfFor[current] ?? current; // optionally serve a stale series from another timeframe
      return { success: true, bars: series(tfSecOf(tf), Math.min(count, 500), lastOpenFor(tf)), total_bars: 500 };
    },
  };
}

describe('verifySeriesTimeframe: timeframe readiness verification', () => {
  it('accepts a genuine 5m series, including one with a weekend gap (minimum spacing is what matters)', () => {
    const bars = series(300, 20, NOW);
    assert.equal(verifySeriesTimeframe(bars, '5').ok, true);
    const gapped = [...series(300, 10, NOW - 172_800 - 3000), ...series(300, 10, NOW)];
    assert.equal(verifySeriesTimeframe(gapped, '5').ok, true);
  });
  it('rejects a 30m series offered as 5m (the live 11:35:52Z "bar spacing 1800s" case) and a 5m series offered as 30m', () => {
    const r = verifySeriesTimeframe(series(1800, 20, NOW), '5');
    assert.equal(r.ok, false); assert.match(r.reason, /1800s/);
    assert.equal(verifySeriesTimeframe(series(300, 20, NOW), '30').ok, false);
  });
  it('rejects fewer than 2 bars and non-monotonic timestamps; does not spacing-check calendar timeframes', () => {
    assert.equal(verifySeriesTimeframe([{ time: 1 }], '5').ok, false);
    assert.equal(verifySeriesTimeframe([{ time: 600 }, { time: 300 }, { time: 900 }], '5').ok, false);
    assert.equal(verifySeriesTimeframe([{ time: 0 }, { time: 86400 }, { time: 86400 * 4 }], 'D').ok, true);
  });
});

describe('createReadinessRead: bounded, verified series reads', () => {
  it('normal read: a ready series is returned unchanged on the first attempt (pass-through)', async () => {
    const chart = fakeChart({ resolution: '15' });
    const counters = emptyCounters();
    const read = createReadinessRead({ getOhlcv: chart.getOhlcv, currentTimeframe: () => '15', sleep: noSleep, now: fixedNow(NOW), counters });
    const raw = await read({ count: 500 });
    const direct = await chart.getOhlcv({ count: 500 });
    assert.deepEqual(raw.bars, direct.bars);
    assert.equal(counters.sweep_retries, 0);
  });
  it('delayed TradingView series: throws twice ("still loading") then serves -> retried within budget, recovered counted', async () => {
    const chart = fakeChart({ resolution: '5', failFirst: 2 });
    const counters = emptyCounters();
    let t = NOW * 1000;
    const read = createReadinessRead({ getOhlcv: chart.getOhlcv, currentTimeframe: () => '5', sleep: async () => { t += 250; }, now: () => new Date(t), counters });
    const raw = await read({ count: 500 });
    assert.equal(raw.bars.length, 500);
    assert.equal(counters.sweep_not_extractable_reads, 2); assert.equal(counters.sweep_retries, 2); assert.equal(counters.sweep_reads_recovered, 1);
  });
  it('previous-timeframe series still served after a switch: rejected and retried until the correct series appears', async () => {
    let served = 0;
    const getOhlcv = async () => { served++; return { bars: served < 3 ? series(1800, 30, NOW) : series(300, 30, NOW) }; };
    const counters = emptyCounters();
    let t = NOW * 1000;
    const read = createReadinessRead({ getOhlcv, currentTimeframe: () => '5', sleep: async () => { t += 250; }, now: () => new Date(t), counters });
    const raw = await read({ count: 30 });
    assert.equal(verifySeriesTimeframe(raw.bars, '5').ok, true);
    assert.equal(counters.sweep_wrong_timeframe_reads, 2);
  });
  it('repeated failure: fails closed after the per-read budget with a coded error, never returns partial/wrong data', async () => {
    const getOhlcv = async () => { throw new Error('Could not extract OHLCV data. The chart may still be loading.'); };
    const counters = emptyCounters();
    let t = NOW * 1000;
    const read = createReadinessRead({ getOhlcv, currentTimeframe: () => '30', sleep: async () => { t += 250; }, now: () => new Date(t), counters, readMaxWaitMs: 2000 });
    await assert.rejects(() => read({ count: 500 }), (err) => err.code === 'SERIES_NOT_EXTRACTABLE' && err.attempts >= 8);
    assert.equal(counters.sweep_series_failures, 1);
  });
  it('the shared sweep deadline caps a single read', async () => {
    const getOhlcv = async () => ({ bars: series(1800, 30, NOW) }); // wrong timeframe forever
    const counters = emptyCounters();
    let t = NOW * 1000;
    const read = createReadinessRead({ getOhlcv, currentTimeframe: () => '5', sleep: async () => { t += 250; }, now: () => new Date(t), counters, sweepDeadline: () => NOW * 1000 + 600 });
    await assert.rejects(() => read({ count: 30 }), (err) => err.code === 'WRONG_TIMEFRAME_SERIES' && err.attempts <= 4);
  });
});

describe('createWatcherReliability: 5m peek with resting timeframe and outer retry', () => {
  it('normal 5m read: chart found on 30m -> switched to 5m once, confirmed = second-to-last bar, restore to 30m SKIPPED (chart rests on 5m)', async () => {
    const chart = fakeChart({ resolution: '30', nowSec: NOW + 90 });
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90) });
    const candle = await rel.peekLatest5mCandle();
    assert.equal(candle.time, NOW - 300, 'confirmed candle = the bar before the forming one');
    assert.deepEqual(chart.calls.setTimeframe, ['5'], 'exactly one switch to 5m and no restore to 30m');
    assert.equal(chart.resolution(), '5');
    assert.equal(rel.counters.restore_skipped_resting_policy, 1);
  });
  it('subsequent polls on a resting 5m chart perform no timeframe switch at all', async () => {
    const chart = fakeChart({ resolution: '5', nowSec: NOW + 90 });
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90) });
    await rel.peekLatest5mCandle(); await rel.peekLatest5mCandle();
    assert.deepEqual(chart.calls.setTimeframe, []);
  });
  it('legacy behaviour is untouched: the frozen peekLatest5mCandle called directly still restores the original resolution', async () => {
    const chart = fakeChart({ resolution: '30', nowSec: NOW + 90 });
    const candle = await peekLatest5mCandle({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90) });
    assert.equal(candle.time, NOW - 300);
    assert.deepEqual(chart.calls.setTimeframe, ['5', '30']);
  });
  it('one failed read then recovery: a peek that exhausts the frozen budget once is re-run and succeeds (outer retry counted)', async () => {
    const chart = fakeChart({ resolution: '5', nowSec: NOW + 90, failFirst: 9 }); // 9 > frozen 8 attempts -> first peek fails, second succeeds
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90) });
    const candle = await rel.peekLatest5mCandle();
    assert.equal(candle.time, NOW - 300);
    assert.equal(rel.counters.peek_failures, 1); assert.equal(rel.counters.peek_outer_retries, 1); assert.equal(rel.counters.peek_recovered_after_retry, 1);
    assert.ok(rel.counters.peek_read_failures >= 8);
  });
  it('repeated read failure: all outer attempts fail -> throws (fail closed), never fabricates a candle', async () => {
    const chart = fakeChart({ resolution: '5', nowSec: NOW + 90, failFirst: 1000 });
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90) });
    await assert.rejects(() => rel.peekLatest5mCandle(), /could not obtain a fresh, verified 5m candle/);
    assert.equal(rel.counters.peek_failures, DEFAULTS.peekOuterAttempts);
  });
  it('a failing timeframe switch is counted and propagates (fail closed)', async () => {
    const chart = fakeChart({ resolution: '30', nowSec: NOW + 90 });
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: async () => { throw new Error('setResolution failed'); }, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW + 90), peekOuterAttempts: 1 });
    await assert.rejects(() => rel.peekLatest5mCandle(), /setResolution failed/);
    assert.equal(rel.counters.timeframe_switch_failures, 1);
  });
});

describe('createWatcherReliability: multi-timeframe sweep through analyzeMarket', () => {
  it('PRE_REPAIR == POST_REPAIR inputs: with a ready chart the readiness-wrapped sweep yields byte-identical bars to the legacy sweep and restores to 5m', async () => {
    const legacyChart = fakeChart({ resolution: '5' });
    const legacy = await fetchMultiTimeframeBars(resolveDeps({ getState: legacyChart.getState, setTimeframe: legacyChart.setTimeframe, getOhlcv: legacyChart.getOhlcv, withCdpLock: withLock }));
    const chart = fakeChart({ resolution: '5' });
    let seenDeps = null;
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW), analyzeMarket: async ({ _deps }) => { seenDeps = _deps; const sweep = await fetchMultiTimeframeBars(resolveDeps({ ..._deps, withCdpLock: withLock })); return { status: 'OK', action: 'WAIT', sweep }; } });
    const result = await rel.analyzeMarket({ persistSignals: true });
    assert.deepEqual(result.sweep.byTf, legacy.byTf, 'identical market inputs -> identical bars handed to the engine');
    assert.deepEqual(result.sweep.fetchErrors, []);
    assert.equal(chart.calls.setTimeframe.at(-1), '5', 'sweep restores the resting 5m timeframe');
    assert.equal(typeof seenDeps.getOhlcv, 'function');
    assert.equal(rel.counters.sweeps, 1); assert.equal(rel.counters.sweep_retries, 0);
  });
  it('HTF incomplete data: a context timeframe that never becomes ready is reported as a fetch error (null), the entry tiers are unaffected', async () => {
    const chart = fakeChart({ resolution: '5', fetchThrowFor: { 240: true } });
    let t = NOW * 1000;
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: async () => { t += 250; }, now: () => new Date(t), readMaxWaitMs: 1000, analyzeMarket: async ({ _deps }) => ({ status: 'OK', sweep: await fetchMultiTimeframeBars(resolveDeps({ ..._deps, withCdpLock: withLock })) }) });
    const { sweep } = await rel.analyzeMarket({});
    assert.equal(sweep.byTf[240], null);
    assert.equal(sweep.fetchErrors.length, 1); assert.match(sweep.fetchErrors[0], /4H: 240: series not ready/);
    assert.ok(sweep.byTf[5].length === 500 && sweep.byTf[15].length === 500 && sweep.byTf[30].length === 500);
  });
  it('never consumes partial/incomplete required data: an entry timeframe serving the WRONG series fails closed to DATA_UNAVAILABLE / WAIT in the frozen calculateEntry', async () => {
    const chart = fakeChart({ resolution: '5', wrongTfFor: { 30: '60' } }); // 30m switch keeps serving the 1H series
    let t = NOW * 1000;
    const rel = createWatcherReliability({ getState: chart.getState, setTimeframe: chart.setTimeframe, getOhlcv: chart.getOhlcv, withCdpLock: withLock, sleep: async () => { t += 250; }, now: () => new Date(t), readMaxWaitMs: 1000, analyzeMarket: async ({ _deps }) => calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: { ..._deps, withCdpLock: withLock, getMasterState: async () => ({ status: 'UNAVAILABLE' }), loadStore: () => ({ signals: [] }), saveStore: () => {}, env: {} } }) });
    const result = await rel.analyzeMarket({});
    assert.equal(result.status, 'DATA_UNAVAILABLE'); assert.equal(result.action, 'WAIT');
    assert.ok(result.errors.some((e) => /30m: .*WRONG_TIMEFRAME_SERIES/.test(e)));
    assert.equal(rel.counters.incomplete_mtf_reads, 1);
  });
  it('the frozen engine is the SAME engine: identical bars through the wrapped sweep and through a direct call give identical decisions', async () => {
    const chartA = fakeChart({ resolution: '5' });
    const direct = await calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: { getState: chartA.getState, setTimeframe: chartA.setTimeframe, getOhlcv: chartA.getOhlcv, withCdpLock: withLock, getMasterState: async () => ({ status: 'UNAVAILABLE' }), loadStore: () => ({ signals: [] }), saveStore: () => {}, env: {} } });
    const chartB = fakeChart({ resolution: '30' }); // chart found resting elsewhere: sweep still reads every timeframe explicitly
    const rel = createWatcherReliability({ getState: chartB.getState, setTimeframe: chartB.setTimeframe, getOhlcv: chartB.getOhlcv, withCdpLock: withLock, sleep: noSleep, now: fixedNow(NOW), analyzeMarket: async ({ _deps }) => calculateEntry({ enablePineComparison: false, engineProfile: 'intraday_5m', _deps: { ..._deps, withCdpLock: withLock, getMasterState: async () => ({ status: 'UNAVAILABLE' }), loadStore: () => ({ signals: [] }), saveStore: () => {}, env: {} } }) });
    const wrapped = await rel.analyzeMarket({});
    const strip = (r) => { const { calculated_at, ...rest } = r; return rest; };
    assert.deepEqual(strip(wrapped), strip(direct));
    assert.ok(['OK', 'DATA_UNAVAILABLE'].includes(direct.status));
  });
});

describe('createWatcherReliability: runCycle wrapper -- candle ledger and counters (observability only)', () => {
  function cycleDeps({ peek, analyze = async () => ({ status: 'OK', action: 'WAIT', reason: 'NO_ELIGIBLE_STRATEGY', calculated_at: new Date(NOW * 1000).toISOString() }), notify = () => {} }) {
    return { isCdpReachable: async () => true, peekLatest5mCandle: peek, analyzeMarket: analyze, notify, now: fixedNow(NOW + 90) };
  }
  const baseState = (t) => ({ ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: t, last_connection_ok: true });

  it('normal candle: processed once, expected/processed counted, delay recorded', async () => {
    let analyses = 0;
    const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
    const deps = cycleDeps({ peek: async () => ({ time: NOW - 300 }), analyze: async () => { analyses++; return { status: 'OK', action: 'WAIT', reason: 'X' }; } });
    const out = await rel.runCycle({ state: baseState(NOW - 600), deps, log: () => {} });
    assert.equal(out.action, 'WAIT'); assert.equal(analyses, 1);
    assert.equal(out.state.last_processed_5m_time, NOW - 300);
    assert.equal(out.state.ops.today.candles_processed, 1); assert.equal(out.state.ops.today.candles_expected, 1); assert.equal(out.state.ops.today.candles_missed, 0);
    assert.equal(out.state.ops.today.last_processing_delay_s, 90);
  });
  it('duplicate prevention: the same confirmed candle again -> NO_NEW_CANDLE, no second analysis, ledger unchanged', async () => {
    let analyses = 0;
    const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
    const deps = cycleDeps({ peek: async () => ({ time: NOW - 300 }), analyze: async () => { analyses++; return { status: 'OK', action: 'WAIT' }; } });
    const first = await rel.runCycle({ state: baseState(NOW - 600), deps, log: () => {} });
    const second = await rel.runCycle({ state: first.state, deps, log: () => {} });
    assert.equal(second.action, 'NO_NEW_CANDLE'); assert.equal(analyses, 1);
    assert.equal(second.state.ops.today.candles_processed, 1); assert.equal(second.state.ops.today.polls, 2);
  });
  it('missing completed candle: two candles lost during a stall are COUNTED and LISTED, never replayed (one analysis for the latest candle only)', async () => {
    let analyses = 0;
    const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
    const deps = cycleDeps({ peek: async () => ({ time: NOW - 300 }), analyze: async () => { analyses++; return { status: 'OK', action: 'WAIT' }; } });
    const out = await rel.runCycle({ state: baseState(NOW - 1200), deps, log: () => {} }); // last processed 4 bars ago -> NOW-900, NOW-600 were never evaluated
    assert.equal(analyses, 1);
    assert.equal(out.state.ops.today.candles_missed, 2); assert.equal(out.state.ops.today.candles_unrecovered, 2);
    assert.deepEqual(out.state.ops.today.candles_missed_times, [NOW - 900, NOW - 600]);
    assert.equal(out.state.ops.today.candles_expected, 3); assert.equal(out.state.ops.today.candles_processed, 1);
  });
  it('one failed read then recovery inside the same bar window: CANDLE_READ_FAILED counted, then the late-processed candle counts as recovered-late, not missed', async () => {
    let fail = true;
    let t = NOW + 90;
    const rel = createWatcherReliability({ now: () => new Date(t * 1000), sleep: noSleep });
    const deps = { isCdpReachable: async () => true, peekLatest5mCandle: async () => { if (fail) { fail = false; throw Object.assign(new Error('could not obtain a fresh, verified 5m candle'), { code: 'STALE_5M_DATA' }); } return { time: NOW - 300 }; }, analyzeMarket: async () => ({ status: 'OK', action: 'WAIT' }), notify: () => {}, now: () => new Date(t * 1000) };
    const a = await rel.runCycle({ state: baseState(NOW - 600), deps, log: () => {} });
    assert.equal(a.action, 'CANDLE_READ_FAILED'); assert.equal(a.state.ops.today.read_failed_polls, 1); assert.equal(a.state.last_processed_5m_time, NOW - 600);
    t = NOW + 150 + 30; // next poll, still inside the NOW..NOW+300 bar
    const b = await rel.runCycle({ state: a.state, deps, log: () => {} });
    assert.equal(b.action, 'WAIT'); assert.equal(b.state.ops.today.candles_recovered_late, 1); assert.equal(b.state.ops.today.candles_missed, 0);
  });
  it('feed stall alert transitions are counted once per stall; a large jump is a session gap, not missed candles', async () => {
    const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
    const stalled = { ...baseState(NOW - 600), feed_stall_alerted_at: null };
    const s1 = foldOps({ before: stalled, after: { ...stalled, feed_stall_alerted_at: 'x' }, action: 'CANDLE_READ_FAILED', prevOps: null, counters: rel.counters, now: fixedNow(NOW + 90) });
    assert.equal(s1.today.feed_stalls, 1);
    const s2 = foldOps({ before: { ...stalled, last_processed_5m_time: NOW - 300 - 300 * 40 }, after: { ...stalled, last_processed_5m_time: NOW - 300 }, action: 'WAIT', prevOps: s1, counters: rel.counters, now: fixedNow(NOW + 90) });
    assert.equal(s2.today.session_gaps, 1); assert.equal(s2.today.candles_missed, 0);
  });
  it('watcher restart / state recovery: ops persisted through saveWatcherState/loadWatcherState survive and the next cycle continues the ledger without re-processing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdr-'));
    try {
      const path = join(dir, 'state.json');
      const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
      const deps = cycleDeps({ peek: async () => ({ time: NOW - 300 }) });
      const out = await rel.runCycle({ state: baseState(NOW - 600), deps, log: () => {} });
      saveWatcherState(path, out.state);
      const loaded = loadWatcherState(path);
      assert.equal(loaded.ops.today.candles_processed, 1); assert.equal(loaded.last_processed_5m_time, NOW - 300);
      const again = await rel.runCycle({ state: loaded, deps, log: () => {} });
      assert.equal(again.action, 'NO_NEW_CANDLE'); assert.equal(again.state.ops.today.candles_processed, 1); assert.equal(again.state.ops.today.polls, 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('signal deduplication is untouched: a BUY already alerted (state) is suppressed by the frozen watcher through the wrapper', async () => {
    let notified = 0;
    const rel = createWatcherReliability({ now: fixedNow(NOW + 90), sleep: noSleep });
    const buy = { status: 'OK', action: 'BUY', entry: 4000, sl: 3990, tp1: 4010, tp2: 4020, rr: 2, quality: 80, setup: 'BO', signal: { signal_id: 'sig-1', is_new_event: true }, diagnostics: { source_timeframe: '5m' } };
    const deps = cycleDeps({ peek: async () => ({ time: NOW - 300 }), analyze: async () => buy, notify: () => { notified++; } });
    const out = await rel.runCycle({ state: { ...baseState(NOW - 600), last_alerted_signal_id: 'sig-1' }, deps, log: () => {} });
    assert.equal(out.action, 'DUPLICATE_SIGNAL'); assert.equal(notified, 0);
    assert.equal(out.state.ops.today.candles_processed, 1);
  });
  it('stale signal rejection remains the executor\'s authority: a signal older than 600 s is denied STALE_SIGNAL regardless of acquisition timing', () => {
    const config = resolveRealExecutorConfig({});
    const now = new Date(NOW * 1000);
    const state = { halted: null, intent: null, position: null, executed_signals: {}, daily: { day: now.toISOString().slice(0, 10), completed: 0, realized_net_usd: 0, consecutive_losses: 0 } };
    const broker = { real_verified: true, connected: true, algo_trading_enabled: true, account: { equity: 1000, margin_free: 1000, leverage: 200 } };
    const market = { bid: 4000, ask: 4000.24, spread_price: 0.24, time: NOW };
    const stale = evaluateEntry({ config, state, signal: { signal_id: 's', action: 'BUY', entry: 4000, calculated_at: new Date((NOW - 601) * 1000).toISOString() }, market, broker, brokerPositions: [], killSwitch: null, now });
    assert.equal(stale.allowed, false); assert.equal(stale.reason, 'STALE_SIGNAL');
  });
});

describe('frozen surface untouched by the reliability layer', () => {
  it('the reliability module wires through createCycleDeps/startWatcher injection seams only: runWatcherCycle is imported, not modified (smoke: legacy cycle still runs without the wrapper)', async () => {
    const deps = { isCdpReachable: async () => true, peekLatest5mCandle: async () => ({ time: NOW - 300 }), analyzeMarket: async () => ({ status: 'OK', action: 'WAIT' }), notify: () => {}, now: fixedNow(NOW + 90) };
    const out = await runWatcherCycle({ state: { ...DEFAULT_WATCHER_STATE, baseline_established: true, last_processed_5m_time: NOW - 600, last_connection_ok: true }, deps, log: () => {} });
    assert.equal(out.action, 'WAIT'); assert.equal(out.state.ops, undefined, 'legacy cycle writes no ops block');
  });
});
