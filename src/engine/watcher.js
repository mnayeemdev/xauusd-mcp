/**
 * XAUUSD local auto signal watcher — orchestration/notification ONLY.
 *
 * This module never computes regime/structure/correction/setup/quality/
 * entry/SL/TP/RR itself. Every trading decision comes from a single call
 * to the existing, unmodified calculateEntry() (src/core/xauusd_calculate.js,
 * schema 1.1.0, 5m/15m/30m entry tiers + 1H/2H/4H/8H/1D/1W/1M context
 * tiers). This file's only job is: decide WHEN to call that engine (once
 * per newly confirmed 5m candle, never blindly every poll), and decide
 * whether an already-computed, already-validated result should raise a
 * user-facing alert (BUY/SELL only, deduplicated, fail-closed on malformed
 * geometry).
 *
 * Poll cadence: every 60s (DEFAULT_POLL_INTERVAL_MS), the watcher does a
 * LIGHTWEIGHT peek at the latest confirmed 5m candle's timestamp only
 * (peekLatest5mCandle) -- it does not run the 10-timeframe engine unless
 * that timestamp has advanced past the last one this watcher processed.
 */
import * as _chartCore from '../core/chart.js';
import * as _dataCore from '../core/data.js';
import { calculateEntry as _calculateEntry, CALCULATE_SCHEMA_VERSION } from '../core/xauusd_calculate.js';
import { CDP_HOST, CDP_PORT } from '../connection.js';
import { notify as _notify } from './notifier.js';
import { isBarFresh } from './freshData.js';
import {
  DEFAULT_STATE_PATH, DEFAULT_LOCK_PATH,
  loadWatcherState, saveWatcherState, acquireLock, releaseLock,
} from './watcherState.js';

export const DEFAULT_POLL_INTERVAL_MS = 60_000;

// How many times peekLatest5mCandle will re-issue the resolution switch
// before giving up and failing closed (see its doc comment below).
const PEEK_MAX_ATTEMPTS = 3;
const PEEK_RETRY_DELAY_MS = 500;

function formatTimestamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Fast, single-attempt reachability probe (no retry/backoff — that is
 * connection.js's job for an actual CDP session). Used only to decide
 * whether this poll should even attempt to read chart data, so a down
 * TradingView/CDP never blocks a 60s poll cycle behind the heavier
 * multi-retry connect() used by the real engine calls.
 */
export async function isCdpReachable({ timeoutMs = 2500, _deps } = {}) {
  const fetchImpl = _deps?.fetchImpl ?? fetch;
  const host = _deps?.host ?? CDP_HOST;
  const port = _deps?.port ?? CDP_PORT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(`http://${host}:${port}/json/version`, { signal: controller.signal });
    return !!resp?.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lightweight peek at the latest CONFIRMED 5-minute candle's timestamp
 * only. Switches to the 5m resolution ONLY if the chart isn't already
 * there, and always restores the original resolution afterward (mirrors
 * the same restore-on-completion discipline calculateEntry() itself uses)
 * -- this never leaves the user's chart on a different timeframe.
 *
 * A resolution switch is asynchronous inside TradingView, so the bars read
 * right after one can race the resubscribe and come back as a stale/cached
 * snapshot for the requested timeframe that never advances (see
 * ./freshData.js). Before trusting a read, this verifies the FORMING bar's
 * own timestamp is plausibly current; if not, it re-issues the exact same
 * safe setTimeframe('5')/getOhlcv() call -- the existing resubscription
 * mechanism, never a new/undocumented CDP API -- up to PEEK_MAX_ATTEMPTS
 * times. If it still cannot obtain a fresh series, it throws: the caller
 * (runWatcherCycle) already fails closed on a thrown peek (no engine call,
 * no alert), so a genuinely stale feed can never trigger a signal.
 */
export async function peekLatest5mCandle(deps) {
  const original = await deps.getState();
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let switched = false;
  try {
    if (String(original.resolution) !== '5') {
      await deps.setTimeframe({ timeframe: '5' });
      switched = true;
    }
    let lastAgeSec = null;
    for (let attempt = 1; attempt <= PEEK_MAX_ATTEMPTS; attempt++) {
      const raw = await deps.getOhlcv({ count: 2 });
      const bars = raw?.bars ?? [];
      if (bars.length < 2) throw new Error(`insufficient 5m bars: ${bars.length} available, 2 required`);
      const forming = bars[bars.length - 1];
      const nowSec = (deps.now ? deps.now() : new Date()).getTime() / 1000;
      if (isBarFresh({ barTime: forming.time, timeframe: '5', nowSec })) {
        return { time: bars[bars.length - 2].time }; // last bar is forming, never treated as confirmed
      }
      lastAgeSec = nowSec - forming.time;
      if (attempt < PEEK_MAX_ATTEMPTS) {
        // Re-issue the same safe resubscription the initial switch used.
        await deps.setTimeframe({ timeframe: '5' });
        switched = true;
        await sleep(PEEK_RETRY_DELAY_MS);
      }
    }
    const err = new Error(`stale 5m data: forming bar age ~${Math.round(lastAgeSec)}s exceeds freshness tolerance after ${PEEK_MAX_ATTEMPTS} attempt(s) -- refusing to use it for new-candle detection`);
    err.code = 'STALE_5M_DATA';
    throw err;
  } finally {
    if (switched) {
      try { await deps.setTimeframe({ timeframe: original.resolution }); } catch { /* best-effort restore */ }
    }
  }
}

export function createCycleDeps(_deps = {}) {
  const chartDeps = {
    getState: _deps.getState ?? _chartCore.getState,
    setTimeframe: _deps.setTimeframe ?? _chartCore.setTimeframe,
    getOhlcv: _deps.getOhlcv ?? _dataCore.getOhlcv,
  };
  return {
    isCdpReachable: _deps.isCdpReachable ?? (() => isCdpReachable()),
    peekLatest5mCandle: _deps.peekLatest5mCandle ?? (() => peekLatest5mCandle(chartDeps)),
    calculateEntry: _deps.calculateEntry ?? _calculateEntry,
    notify: _deps.notify ?? _notify,
    now: _deps.now,
  };
}

function requireFiniteFields(result, fields) {
  // Number(null) === 0 and Number(undefined) === NaN only by luck of
  // coercion -- check null/undefined explicitly so a missing field is
  // never mistaken for a legitimate zero value.
  return fields.filter((k) => result[k] === null || result[k] === undefined || !Number.isFinite(Number(result[k])));
}

/**
 * Evaluates an already-computed calculateEntry() result. Pure
 * decision/validation logic — never recomputes or repairs a value. Any
 * malformed or incomplete actionable result fails closed to no-alert.
 */
function evaluateEngineResult({ result, state, deps, log, stamp }) {
  if (!result || result.status !== 'OK') {
    log(`[${stamp()}] New confirmed 5m candle processed — status ${result?.status ?? 'UNKNOWN'} (no actionable result)`);
    return { state, action: 'ENGINE_STATUS_NOT_OK', alerted: false };
  }

  if (result.action !== 'BUY' && result.action !== 'SELL') {
    log(`[${stamp()}] New confirmed 5m candle processed — WAIT / ${result.reason ?? 'UNKNOWN'}`);
    return { state, action: 'WAIT', alerted: false };
  }

  const missing = requireFiniteFields(result, ['entry', 'sl', 'tp1', 'tp2', 'rr']);
  const signalId = result.signal?.signal_id ?? null;
  if (missing.length > 0 || !signalId) {
    const why = missing.length > 0 ? `missing/invalid trade geometry (${missing.join(', ')})` : 'no signal identity from the engine signal store';
    log(`[${stamp()}] New confirmed 5m candle processed — ${result.action} reported but ${why} — failing closed, no alert`);
    return { state, action: 'VALIDATION_FAILED', alerted: false };
  }

  // Dedup, deterministically: the engine's OWN signal store already marks
  // is_new_event: false for a signal_id it has seen before (this persists
  // in validation/mcp_engine_signals.json across process restarts). The
  // watcher additionally tracks its own last_alerted_signal_id so a
  // restart can never re-alert the last thing THIS watcher already sent,
  // even in the unlikely case the two stores were ever to disagree.
  if (result.signal?.is_new_event === false || state.last_alerted_signal_id === signalId) {
    log(`[${stamp()}] New confirmed 5m candle processed — ${result.action} signal ${signalId} already alerted, duplicate suppressed`);
    return { state, action: 'DUPLICATE_SIGNAL', alerted: false };
  }

  const alert = {
    action: result.action,
    entry: result.entry,
    sl: result.sl,
    tp1: result.tp1,
    tp2: result.tp2,
    rr: result.rr,
    quality: result.quality ?? null,
    timeframe: result.diagnostics?.source_timeframe ?? null,
    setup: result.setup ?? null,
    time: result.calculated_at ?? null,
  };
  deps.notify(alert);
  log(`[${stamp()}] ${result.action} signal ${signalId} — alert sent`);
  return { state: { ...state, last_alerted_signal_id: signalId }, action: 'ALERTED', alerted: true, alert };
}

/**
 * Runs exactly one poll cycle. Pure orchestration: never mutates the
 * chart beyond the brief 5m peek (which always restores itself), and
 * calls the authoritative engine at most once, only when a genuinely new
 * confirmed 5m candle has appeared.
 */
export async function runWatcherCycle({ state, deps, log = () => {} }) {
  const stamp = () => formatTimestamp(deps.now ? deps.now() : new Date());

  const connected = await deps.isCdpReachable();
  if (!connected) {
    const alreadyKnownDown = state.last_connection_ok === false;
    if (!alreadyKnownDown) log(`[${stamp()}] TradingView/CDP unreachable — will keep retrying every poll`);
    return { state: { ...state, last_connection_ok: false }, action: 'CONNECTION_UNAVAILABLE', alerted: false };
  }

  const wasDisconnected = state.last_connection_ok === false;
  let candle;
  try {
    candle = await deps.peekLatest5mCandle();
  } catch (err) {
    log(`[${stamp()}] Could not read latest confirmed 5m candle: ${err.message}`);
    return { state: { ...state, last_connection_ok: true }, action: 'CANDLE_READ_FAILED', alerted: false };
  }

  const connectedState = { ...state, last_connection_ok: true };

  if (wasDisconnected) {
    log(`[${stamp()}] TradingView/CDP connection restored — re-baselining to the latest confirmed 5m candle (no historical replay)`);
    return { state: { ...connectedState, last_processed_5m_time: candle.time, baseline_established: true }, action: 'RECONNECTED_REBASELINE', alerted: false };
  }

  if (!state.baseline_established) {
    log(`[${stamp()}] Watcher baseline set at confirmed 5m candle ${candle.time} — waiting for the next new confirmed candle`);
    return { state: { ...connectedState, last_processed_5m_time: candle.time, baseline_established: true }, action: 'BASELINE_ESTABLISHED', alerted: false };
  }

  if (candle.time === state.last_processed_5m_time) {
    return { state: connectedState, action: 'NO_NEW_CANDLE', alerted: false };
  }

  const result = await deps.calculateEntry();
  const advancedState = { ...connectedState, last_processed_5m_time: candle.time };
  return evaluateEngineResult({ result, state: advancedState, deps, log, stamp });
}

function printBanner(log, pollIntervalMs) {
  log([
    'XAUUSD MCP AUTO WATCHER',
    'Status: WATCHING',
    `Poll interval: ${Math.round(pollIntervalMs / 1000)} seconds`,
    'Trigger: New confirmed 5m candle',
    `Engine: MCP 10-TF schema ${CALCULATE_SCHEMA_VERSION}`,
    'Alerts: BUY/SELL only',
    'WAIT alerts: OFF',
  ].join('\n'));
}

/**
 * Starts the continuous watcher. Resolves once when the watcher stops
 * (SIGINT/SIGTERM, an injected abortSignal, or a single-instance lock
 * conflict) — this is intentionally long-running; the CLI command awaits
 * this promise for the lifetime of the process.
 */
export function startWatcher({ pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, _deps } = {}) {
  const deps = {
    statePath: _deps?.statePath ?? DEFAULT_STATE_PATH,
    lockPath: _deps?.lockPath ?? DEFAULT_LOCK_PATH,
    loadState: _deps?.loadState ?? loadWatcherState,
    saveState: _deps?.saveState ?? saveWatcherState,
    acquireLock: _deps?.acquireLock ?? acquireLock,
    releaseLock: _deps?.releaseLock ?? releaseLock,
    setInterval: _deps?.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: _deps?.clearInterval ?? ((t) => clearInterval(t)),
    onSignal: _deps?.onSignal ?? ((sig, fn) => process.on(sig, fn)),
    offSignal: _deps?.offSignal ?? ((sig, fn) => process.off(sig, fn)),
    abortSignal: _deps?.abortSignal,
    log: _deps?.log ?? ((msg) => console.log(msg)),
    runCycle: _deps?.runCycle ?? runWatcherCycle,
    cycleDeps: _deps?.cycleDeps ?? createCycleDeps(_deps?.cycle),
  };

  const lock = deps.acquireLock(deps.lockPath, _deps?.lockOpts);
  if (!lock.acquired) {
    deps.log(`Another XAUUSD watcher instance is already running (pid ${lock.holderPid}). Exiting.`);
    return Promise.resolve({ success: false, reason: 'ALREADY_RUNNING', holder_pid: lock.holderPid });
  }

  printBanner(deps.log, pollIntervalMs);

  let state = deps.loadState(deps.statePath);

  return new Promise((resolve) => {
    let stopped = false;
    let timer = null;

    const onSigint = () => shutdown('SIGINT');
    const onSigterm = () => shutdown('SIGTERM');
    const onAbort = () => shutdown('ABORT');

    function shutdown(reason) {
      if (stopped) return;
      stopped = true;
      if (timer) deps.clearInterval(timer);
      deps.offSignal('SIGINT', onSigint);
      deps.offSignal('SIGTERM', onSigterm);
      if (deps.abortSignal?.removeEventListener) deps.abortSignal.removeEventListener('abort', onAbort);
      try { deps.saveState(deps.statePath, state); } catch { /* best-effort */ }
      deps.releaseLock(deps.lockPath);
      deps.log(`XAUUSD MCP AUTO WATCHER stopped (${reason})`);
      resolve({ success: true, stopped_reason: reason, state });
    }

    deps.onSignal('SIGINT', onSigint);
    deps.onSignal('SIGTERM', onSigterm);
    if (deps.abortSignal?.addEventListener) deps.abortSignal.addEventListener('abort', onAbort);

    const tick = async () => {
      if (stopped) return;
      try {
        const { state: nextState } = await deps.runCycle({ state, deps: deps.cycleDeps, log: deps.log });
        state = nextState;
        deps.saveState(deps.statePath, state);
      } catch (err) {
        deps.log(`Unexpected watcher error: ${err.message}`);
      }
    };

    tick();
    timer = deps.setInterval(tick, pollIntervalMs);
  });
}
