/**
 * P1 watcher data-reliability layer (2026-09-30 LIVE vs REPLAY PARITY AUDIT,
 * REPAIR_SPEC items 1-3). Pure dependency-injection: it wraps the FROZEN
 * watcher/engine functions (src/engine/watcher.js peekLatest5mCandle,
 * src/core/xauusd_analyze_market.js analyzeMarket) with hardened chart deps
 * and is wired ONLY from the CLI (src/cli/commands/xauusd.js `watch`), so no
 * file on the frozen strategy surface (src/engine/strategy.frozen.json)
 * changes and the strategy fingerprint stays identical.
 *
 * What it changes (data acquisition only, never a decision):
 *   1. RESTING TIMEFRAME 5m: the 5m peek's "restore the original resolution"
 *      call is skipped when the original is not 5m, so the chart rests on 5m
 *      and the per-poll 30m->5m->30m switching stops. The multi-timeframe
 *      sweep then finds 5m as the original and restores to 5m by itself.
 *   2. BOUNDED READINESS for every timeframe read of the sweep: after a
 *      timeframe switch the chart may still be loading (getOhlcv throws
 *      "Could not extract OHLCV data") or still serve the PREVIOUS series;
 *      each read is retried until the series is present AND verified to be
 *      the requested timeframe (minimum bar spacing over the last bars),
 *      within a per-read and a per-sweep budget, then fails closed exactly
 *      as before (fetch error -> null -> calculateEntry DATA_UNAVAILABLE for
 *      an entry timeframe). A wrong-timeframe series was previously
 *      accepted silently; now it is never consumed.
 *   3. OUTER PEEK RETRY: the frozen peek's own 8x500ms budget is kept; on
 *      failure the peek is re-run up to peekOuterAttempts times inside a
 *      total budget well under the 60s poll.
 *   4. OBSERVABILITY: cumulative counters (read failures, retries, wrong-
 *      timeframe reads, switch failures, incomplete MTF reads) and a per-day
 *      candle ledger (expected/processed/missed/recovered-late/unrecovered,
 *      feed stalls) are written into the persisted watcher state under
 *      `ops` by the runCycle wrapper. Never decision-relevant.
 *
 * Missed-candle recovery (REPAIR_SPEC item 5 / mission B3) is deliberately
 * NOT implemented: the engine evaluates only the LATEST confirmed candle
 * from the live chart, so a candle missed for a whole bar cannot be
 * re-evaluated later without new engine inputs (a look-back slice) and
 * the executor would refuse the resulting alert as STALE_SIGNAL (> 600 s)
 * anyway. Missed candles are counted and listed instead.
 */
import * as _chartCore from '../core/chart.js';
import * as _dataCore from '../core/data.js';
import { analyzeMarket as _analyzeMarket } from '../core/xauusd_analyze_market.js';
import { peekLatest5mCandle as _peekLatest5mCandle, runWatcherCycle as _runWatcherCycle } from './watcher.js';
import { withCdpLock as _withCdpLock, DEFAULT_CDP_LOCK_PATH } from './cdpLock.js';
import { timeframeSeconds } from './freshData.js';

export const DEFAULT_RESTING_TIMEFRAME = '5';
export const DEFAULTS = Object.freeze({
  restingTimeframe: DEFAULT_RESTING_TIMEFRAME,
  peekOuterAttempts: 3, // frozen peek (8 x 500 ms) re-run up to this many times ...
  peekTotalBudgetMs: 20_000, // ... inside this wall-clock budget (poll cadence is 60 s)
  peekRetryDelayMs: 750,
  readMaxWaitMs: 6_000, // per timeframe read of the sweep
  readRetryDelayMs: 250,
  sweepBudgetMs: 45_000, // shared across the 10-timeframe sweep
  spacingSampleBars: 12,
  missedGapMaxCandles: 12, // larger jumps = session/market closure, not attributed as missed
  lateThresholdSec: 150, // processed later than this after close = obtained after >= 1 failed poll
  missedListCap: 60,
});
// Outcomes of runWatcherCycle that mean "a new confirmed candle was analysed".
const PROCESSED_ACTIONS = new Set(['WAIT', 'ALERTED', 'DUPLICATE_SIGNAL', 'VALIDATION_FAILED', 'ENGINE_STATUS_NOT_OK']);

export function emptyCounters() {
  return { peek_reads: 0, peek_read_failures: 0, peek_wrong_timeframe_reads: 0, peek_failures: 0, peek_outer_retries: 0, peek_recovered_after_retry: 0, restore_skipped_resting_policy: 0, timeframe_switch_failures: 0, sweeps: 0, sweep_reads: 0, sweep_read_failures: 0, sweep_retries: 0, sweep_reads_recovered: 0, sweep_wrong_timeframe_reads: 0, sweep_not_extractable_reads: 0, sweep_series_failures: 0, incomplete_mtf_reads: 0, mtf_fetch_errors: 0 };
}

function emptyDay(day) {
  return { day, polls: 0, read_failed_polls: 0, connection_unavailable_polls: 0, candles_expected: 0, candles_processed: 0, candles_missed: 0, candles_unrecovered: 0, candles_recovered_late: 0, candles_missed_times: [], session_gaps: 0, rebaselines: 0, feed_stalls: 0, incomplete_mtf_reads: 0, last_processing_delay_s: null, max_processing_delay_s: null };
}

/**
 * Verifies that `bars` genuinely belong to `timeframe`: the minimum spacing
 * over the last `sample` bars must equal the timeframe's bar duration
 * (gaps such as weekends only ever make a spacing LARGER, so the minimum is
 * robust to them; a series from a smaller timeframe has a smaller minimum,
 * one from a larger timeframe a larger minimum). Calendar-spaced D/W/M
 * series are not spacing-checked (existing behaviour).
 */
export function verifySeriesTimeframe(bars, timeframe, { sample = DEFAULTS.spacingSampleBars } = {}) {
  const tfSec = timeframeSeconds(timeframe);
  if (!Array.isArray(bars) || bars.length < 2) return { ok: false, reason: `insufficient bars: ${bars?.length ?? 0} available, 2 required` };
  if (!tfSec || tfSec >= 86_400) return { ok: true, reason: 'calendar-spaced or unknown timeframe: spacing not verified' };
  const tail = bars.slice(-Math.max(2, sample));
  let min = Infinity;
  for (let i = 1; i < tail.length; i++) {
    const d = Number(tail[i].time) - Number(tail[i - 1].time);
    if (!Number.isFinite(d) || d <= 0) return { ok: false, reason: `non-monotonic timestamps at index ${i} (${tail[i - 1].time} -> ${tail[i].time})` };
    if (d < min) min = d;
  }
  if (min !== tfSec) return { ok: false, reason: `minimum bar spacing ${min}s does not match a ${timeframe} series (expected ${tfSec}s) -- stale or wrong-timeframe data`, minSpacingSec: min };
  return { ok: true, minSpacingSec: min };
}

/**
 * Bounded readiness read for the multi-timeframe sweep. Wraps a raw
 * getOhlcv() so each call waits (polling) until the chart serves a
 * non-empty series verified to be the timeframe last selected through the
 * paired setTimeframe wrapper, or fails closed after the budget.
 */
export function createReadinessRead({ getOhlcv, currentTimeframe, sleep, now, counters, sweepDeadline = () => Infinity, readMaxWaitMs = DEFAULTS.readMaxWaitMs, readRetryDelayMs = DEFAULTS.readRetryDelayMs }) {
  const _sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const _now = () => (now ? now() : new Date()).getTime();
  return async function readWhenReady(opts) {
    const tf = currentTimeframe();
    const deadline = Math.min(_now() + readMaxWaitMs, sweepDeadline());
    let attempt = 0;
    let last = { code: 'SERIES_NOT_READY', detail: 'no attempt made' };
    for (;;) {
      attempt++;
      counters.sweep_reads++;
      let raw = null;
      try {
        raw = await getOhlcv(opts);
      } catch (err) {
        counters.sweep_not_extractable_reads++;
        last = { code: 'SERIES_NOT_EXTRACTABLE', detail: err.message };
      }
      if (raw) {
        const bars = raw.bars ?? [];
        const v = verifySeriesTimeframe(bars, tf);
        if (v.ok) {
          if (attempt > 1) counters.sweep_reads_recovered++;
          return raw;
        }
        if (bars.length >= 2) counters.sweep_wrong_timeframe_reads++;
        last = { code: bars.length >= 2 ? 'WRONG_TIMEFRAME_SERIES' : 'SERIES_INSUFFICIENT', detail: v.reason };
      }
      if (_now() >= deadline) {
        counters.sweep_series_failures++;
        const err = new Error(`${tf}: series not ready after ${attempt} attempt(s): ${last.code}: ${last.detail}`);
        err.code = last.code;
        err.attempts = attempt;
        throw err;
      }
      counters.sweep_retries++;
      await _sleep(readRetryDelayMs);
    }
  };
}

/**
 * Builds the hardened cycle deps. Everything is injectable for tests; the
 * defaults are the real chart/data/engine functions.
 */
export function createWatcherReliability(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const getState = o.getState ?? _chartCore.getState;
  const setTimeframe = o.setTimeframe ?? _chartCore.setTimeframe;
  const getOhlcv = o.getOhlcv ?? _dataCore.getOhlcv;
  const analyzeMarketImpl = o.analyzeMarket ?? _analyzeMarket;
  const peekImpl = o.peekImpl ?? _peekLatest5mCandle;
  const withCdpLock = o.withCdpLock ?? _withCdpLock;
  const cdpLockPath = o.cdpLockPath ?? DEFAULT_CDP_LOCK_PATH;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => new Date());
  const nowMs = () => now().getTime();
  const log = o.log ?? (() => {});
  const resting = String(o.restingTimeframe);
  const counters = emptyCounters();
  let restingPolicyLogged = false;

  // ---- 5m peek: frozen implementation, hardened deps, outer retry ----
  const peekDeps = {
    getState,
    setTimeframe: async ({ timeframe }) => {
      if (String(timeframe) === resting) {
        try { return await setTimeframe({ timeframe }); } catch (err) { counters.timeframe_switch_failures++; throw err; }
      }
      // The frozen peek only ever asks for a non-resting timeframe to RESTORE
      // the chart to what it found. Resting policy: leave the chart on 5m.
      counters.restore_skipped_resting_policy++;
      if (!restingPolicyLogged) { restingPolicyLogged = true; log(`[watcher-reliability] chart found on resolution ${timeframe}; resting it on ${resting} instead of switching back every poll (data-acquisition policy, no decision impact)`); }
      return { success: true, timeframe: resting, skipped_restore_to: String(timeframe) };
    },
    getOhlcv: async (opts) => {
      counters.peek_reads++;
      try {
        const raw = await getOhlcv(opts);
        const bars = raw?.bars ?? [];
        if (bars.length >= 2 && (Number(bars.at(-1).time) - Number(bars.at(-2).time)) !== timeframeSeconds(resting)) counters.peek_wrong_timeframe_reads++;
        return raw;
      } catch (err) { counters.peek_read_failures++; throw err; }
    },
    withCdpLock, cdpLockPath, sleep, now,
  };
  async function peekLatest5mCandle() {
    const deadline = nowMs() + o.peekTotalBudgetMs;
    let lastErr = null;
    for (let i = 1; i <= o.peekOuterAttempts; i++) {
      try {
        const candle = await peekImpl(peekDeps);
        if (i > 1) counters.peek_recovered_after_retry++;
        return candle;
      } catch (err) {
        lastErr = err;
        counters.peek_failures++;
        if (i < o.peekOuterAttempts && nowMs() < deadline) { counters.peek_outer_retries++; await sleep(o.peekRetryDelayMs); } else break;
      }
    }
    throw lastErr;
  }

  // ---- multi-timeframe sweep: readiness-verified reads, same engine ----
  let currentTf = null;
  let sweepDeadlineMs = Infinity;
  const sweepSetTimeframe = async ({ timeframe }) => {
    currentTf = String(timeframe);
    try { return await setTimeframe({ timeframe }); } catch (err) { counters.timeframe_switch_failures++; throw err; }
  };
  const sweepGetOhlcv = createReadinessRead({ getOhlcv, currentTimeframe: () => currentTf, sleep, now, counters, sweepDeadline: () => sweepDeadlineMs, readMaxWaitMs: o.readMaxWaitMs, readRetryDelayMs: o.readRetryDelayMs });
  async function analyzeMarket(opts = {}) {
    counters.sweeps++;
    sweepDeadlineMs = nowMs() + o.sweepBudgetMs;
    try {
      const result = await analyzeMarketImpl({ ...opts, ...(o.engineProfile ? { engineProfile: opts.engineProfile ?? o.engineProfile } : {}), _deps: { ...(opts._deps ?? {}), getState, setTimeframe: sweepSetTimeframe, getOhlcv: sweepGetOhlcv } });
      if (result?.status === 'DATA_UNAVAILABLE') counters.incomplete_mtf_reads++;
      if (Array.isArray(result?.errors) && result.errors.length > 0) counters.mtf_fetch_errors += result.errors.length;
      return result;
    } finally { sweepDeadlineMs = Infinity; }
  }

  // ---- runCycle wrapper: per-day candle ledger + counters into state.ops ----
  const runCycleImpl = o.runCycle ?? _runWatcherCycle;
  async function runCycle({ state, deps, log: cycleLog }) {
    const before = state ?? {};
    const out = await runCycleImpl({ state, deps, log: cycleLog });
    const s = out?.state ?? before;
    return { ...out, state: { ...s, ops: foldOps({ before, after: s, action: out?.action, prevOps: s.ops, counters, now, o }) } };
  }

  return { peekLatest5mCandle, analyzeMarket, runCycle, counters, options: Object.freeze({ ...o, getState: undefined, setTimeframe: undefined, getOhlcv: undefined, analyzeMarket: undefined, peekImpl: undefined, runCycle: undefined, withCdpLock: undefined, sleep: undefined, now: undefined, log: undefined }) };
}

/** Pure: folds one cycle outcome into the persisted `ops` block. */
export function foldOps({ before, after, action, prevOps, counters, now, o = DEFAULTS }) {
  const t = now ? now() : new Date();
  const day = t.toISOString().slice(0, 10);
  const ops = { schema: 'watcher-ops-1.0', ...(prevOps ?? {}) };
  if (!ops.today || ops.today.day !== day) {
    if (ops.today) ops.previous_day = ops.today;
    ops.today = emptyDay(day);
  }
  const d = { ...ops.today, candles_missed_times: [...(ops.today.candles_missed_times ?? [])] };
  d.polls++;
  if (action === 'CANDLE_READ_FAILED') d.read_failed_polls++;
  if (action === 'CONNECTION_UNAVAILABLE') d.connection_unavailable_polls++;
  if (action === 'RECONNECTED_REBASELINE' || action === 'BASELINE_ESTABLISHED') d.rebaselines++;
  if (action === 'ENGINE_STATUS_NOT_OK') d.incomplete_mtf_reads++;
  if (after?.feed_stall_alerted_at && !before?.feed_stall_alerted_at) d.feed_stalls++;
  const prevT = before?.last_processed_5m_time;
  const newT = after?.last_processed_5m_time;
  if (PROCESSED_ACTIONS.has(action) && Number.isInteger(newT) && newT > (Number.isInteger(prevT) ? prevT : -Infinity)) {
    d.candles_processed++;
    d.candles_expected++;
    if (Number.isInteger(prevT)) {
      const gap = Math.round((newT - prevT) / 300) - 1;
      if (gap > 0 && gap <= o.missedGapMaxCandles) {
        d.candles_expected += gap;
        d.candles_missed += gap;
        d.candles_unrecovered += gap;
        for (let k = 1; k <= gap && d.candles_missed_times.length < o.missedListCap; k++) d.candles_missed_times.push(prevT + 300 * k);
      } else if (gap > o.missedGapMaxCandles) {
        d.session_gaps++;
      }
    }
    const delay = Math.round(t.getTime() / 1000 - (newT + 300));
    d.last_processing_delay_s = delay;
    d.max_processing_delay_s = d.max_processing_delay_s == null ? delay : Math.max(d.max_processing_delay_s, delay);
    if (delay > o.lateThresholdSec) d.candles_recovered_late++;
  }
  ops.today = d;
  ops.since_process_start = { ...counters };
  ops.updated_at = t.toISOString();
  return ops;
}
