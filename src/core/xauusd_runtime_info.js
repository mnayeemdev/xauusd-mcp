/**
 * Stage 6, Part 29 + Part 32 — runtime/version identification and a
 * concise live health snapshot.
 *
 * THIS MODULE NEVER COMPUTES A DECISION. getRuntimeInfo() is pure/
 * synchronous (package.json + already-exported protected parameter
 * VALUES, republished verbatim -- risk.js/quality.js/correction.js
 * remain the sole authority on what those values should be).
 * getRuntimeHealthSnapshot() performs ONLY lightweight, read-only work:
 * one getActiveChartContext() call (zero chart mutation, see
 * xauusd_chart_context.js) plus a few local JSON file reads -- it NEVER
 * calls calculateEntry()/analyzeMarket() itself, so checking health never
 * triggers a 10-TF sweep or a new watcher-dedup-relevant signal.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CALCULATE_SCHEMA_VERSION } from './xauusd_calculate.js';
import { CHART_CONTEXT_SCHEMA_VERSION, getActiveChartContext } from './xauusd_chart_context.js';
import { RISK_PARAMS } from '../engine/risk.js';
import { QUALITY_PARAMS } from '../engine/quality.js';
import { CORRECTION_PARAMS } from '../engine/correction.js';
import { DEFAULT_STATE_PATH, DEFAULT_LOCK_PATH, loadWatcherState } from '../engine/watcherState.js';
import { DEFAULT_STORE_PATH as DEFAULT_ANTICIPATION_STORE_PATH } from '../engine/anticipationStore.js';
import { DEFAULT_REGISTRY_PATH } from '../engine/drawingRegistry.js';

export const RUNTIME_INFO_SCHEMA_VERSION = '1.0.0';

const PACKAGE_JSON_PATH = fileURLToPath(new URL('../../package.json', import.meta.url));

function readPackageVersion(path) {
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8'));
    return { name: pkg.name ?? null, version: pkg.version ?? null };
  } catch {
    return { name: null, version: null };
  }
}

/**
 * Static build/version/schema identification. Pure, synchronous, no CDP/
 * network I/O. Documents the reconnect/restart procedure inline (mission
 * Part 29) and explicitly confirms no auto-update mechanism exists.
 */
export function getRuntimeInfo({ _deps } = {}) {
  const pkg = readPackageVersion(_deps?.packageJsonPath ?? PACKAGE_JSON_PATH);
  return {
    schema_version: RUNTIME_INFO_SCHEMA_VERSION,
    package: pkg,
    node_version: process.version,
    platform: process.platform,
    engine_schema_version: CALCULATE_SCHEMA_VERSION,
    chart_context_schema_version: CHART_CONTEXT_SCHEMA_VERSION,
    // Republished verbatim from their OWN owning modules -- never
    // redefined or re-derived here.
    protected_parameters: {
      min_rr: RISK_PARAMS.minRR,
      quality_threshold: QUALITY_PARAMS.qualityThreshold,
      corr_resolve_confirm_bars: CORRECTION_PARAMS.corrResolveConfirmBars,
    },
    auto_update: false,
    reconnect_and_restart_procedure: [
      'Verify TradingView Desktop is running with CDP remote debugging enabled on the configured host/port (default 127.0.0.1:9222, see src/connection.js CDP_HOST/CDP_PORT).',
      'Call tv_health_check (or xauusd_research_health in the research profile) to confirm the MCP server can reach it.',
      'A transient CDP drop needs no manual action: the watcher (src/engine/watcher.js) auto-retries every poll and re-baselines on reconnect (RECONNECTED_REBASELINE) -- it never replays history.',
      'To restart the MCP server itself (e.g. after a code update), stop the running process and re-run the normal launch command -- there is no in-process hot reload and no auto-update of any kind; a new process always starts from this exact source on disk.',
    ],
  };
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * Read-only peek at the watcher's single-instance lock file. Unlike
 * watcherState.js's acquireLock(), this NEVER writes/claims the lock --
 * a health check must never itself affect whether the real watcher can
 * start.
 */
function peekWatcherLock(lockPath, isAlive = defaultIsAlive) {
  if (!existsSync(lockPath)) return { running: false, pid: null };
  try {
    const pid = Number(readFileSync(lockPath, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid)) return { running: true, pid };
    return { running: false, pid: null }; // stale lock file, no live holder
  } catch {
    return { running: false, pid: null };
  }
}

function safeReadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// The protected decision timeframe is a fixed protocol constant, not a
// live-computed value: src/engine/mtf.js's combineTimeframes() returns
// `source_timeframe: '15m'` literally at EVERY branch (WAIT and BUY/SELL
// alike) -- verified directly against that file, never assumed. Stating
// it here costs zero I/O and never risks going stale silently, since any
// future change to mtf.js's own hardcoded value would need to be a
// deliberate, protected-file edit this module would then also need
// updating for.
const DECISION_TIMEFRAME = '15m';

/**
 * Concise live runtime health snapshot. Read-only and lightweight (one
 * getActiveChartContext() read + a handful of local JSON file reads) --
 * never a calculateEntry()/analyzeMarket() call of its own, so checking
 * health can never trigger a new signal or interfere with watcher dedup.
 *
 * KNOWN LIMITATION (documented, not silently omitted): the mission also
 * asked for "last full analysis / action / candidate / anticipation"
 * fields. Those are only ever produced by an actual calculateEntry()/
 * analyzeMarket() call, and this snapshot deliberately never makes one
 * (to stay lightweight and side-effect-free -- a health check must never
 * itself risk triggering a new signal). The persisted signal store
 * (validation/mcp_engine_signals.json) only records BUY/SELL signals, not
 * every WAIT decision, so a genuine "last full decision" cannot be
 * reconstructed from disk alone without either persisting a new artifact
 * (out of scope for this pass) or making a live call here (rejected, for
 * the reason above). `watcher.last_processed_5m_time` (the last confirmed
 * 5m candle the watcher acted on) and `watcher.last_alerted_signal_id`
 * are the closest available honest proxies for "last analysis"/"action".
 */
export async function getRuntimeHealthSnapshot({ _deps } = {}) {
  const runtime = getRuntimeInfo({ _deps });
  const context = await getActiveChartContext({ _deps });

  const watcherStatePath = _deps?.watcherStatePath ?? DEFAULT_STATE_PATH;
  const watcherLockPath = _deps?.watcherLockPath ?? DEFAULT_LOCK_PATH;
  const anticipationStorePath = _deps?.anticipationStorePath ?? DEFAULT_ANTICIPATION_STORE_PATH;
  const registryPath = _deps?.registryPath ?? DEFAULT_REGISTRY_PATH;

  const watcherState = (_deps?.loadWatcherState ?? loadWatcherState)(watcherStatePath);
  const lock = peekWatcherLock(watcherLockPath, _deps?.isAlive);
  const anticipationStore = (_deps?.readAnticipationStore ?? safeReadJson)(anticipationStorePath);
  const registry = (_deps?.readRegistry ?? safeReadJson)(registryPath);

  return {
    schema_version: runtime.schema_version,
    runtime: { package_version: runtime.package.version, node_version: runtime.node_version, engine_schema_version: runtime.engine_schema_version },
    cdp: { reachable: context.status !== 'READ_ERROR', status: context.status, reason: context.reason ?? null },
    active_chart: {
      symbol: context.symbol ?? null,
      timeframe: context.timeframe_label ?? null,
      last_confirmed_bar_time: context.last_confirmed_bar_time ?? null,
    },
    decision_timeframe: DECISION_TIMEFRAME,
    watcher: {
      running: lock.running,
      pid: lock.pid,
      last_connection_ok: watcherState.last_connection_ok,
      baseline_established: watcherState.baseline_established,
      last_processed_5m_time: watcherState.last_processed_5m_time,
      last_alerted_signal_id: watcherState.last_alerted_signal_id,
      updated_at: watcherState.updated_at,
    },
    stage3_observability: {
      store_present: !!anticipationStore,
      tracked_setups: anticipationStore ? Object.keys(anticipationStore.setups ?? {}).length : 0,
    },
    visualization: {
      registry_present: !!registry,
      tracked_drawings: registry ? Object.keys(registry.entries ?? {}).length : 0,
    },
  };
}
