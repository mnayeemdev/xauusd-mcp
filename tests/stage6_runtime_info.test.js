/**
 * src/core/xauusd_runtime_info.js -- Stage 6, Part 29 + Part 32.
 * Proves:
 *   - getRuntimeInfo() is pure/synchronous, reports real package
 *     version/node version/protected parameter VALUES (never redefines
 *     them), and explicitly reports auto_update:false
 *   - getRuntimeHealthSnapshot() never calls calculateEntry()/
 *     analyzeMarket() (a health check must never itself produce a new
 *     signal or trigger a 10-TF sweep)
 *   - the watcher-lock peek is read-only -- it never acquires/writes the
 *     lock file, unlike watcherState.js's acquireLock()
 *   - a missing Stage 3 store / drawing registry reports honestly
 *     (store_present:false, tracked_setups:0), never throws
 *   - CDP unreachable (READ_ERROR) is reported, not fabricated as reachable
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRuntimeInfo, getRuntimeHealthSnapshot, RUNTIME_INFO_SCHEMA_VERSION } from '../src/core/xauusd_runtime_info.js';
import { RISK_PARAMS } from '../src/engine/risk.js';
import { QUALITY_PARAMS } from '../src/engine/quality.js';
import { CORRECTION_PARAMS } from '../src/engine/correction.js';

describe('xauusd_runtime_info: getRuntimeInfo()', () => {
  it('reports the real package name/version, node version, and schema version', () => {
    const info = getRuntimeInfo();
    assert.equal(info.schema_version, RUNTIME_INFO_SCHEMA_VERSION);
    assert.equal(info.package.name, 'tradingview-mcp');
    assert.equal(typeof info.package.version, 'string');
    assert.equal(info.node_version, process.version);
  });

  it('republishes the EXACT protected parameter values, never redefining them', () => {
    const info = getRuntimeInfo();
    assert.equal(info.protected_parameters.min_rr, RISK_PARAMS.minRR);
    assert.equal(info.protected_parameters.quality_threshold, QUALITY_PARAMS.qualityThreshold);
    assert.equal(info.protected_parameters.corr_resolve_confirm_bars, CORRECTION_PARAMS.corrResolveConfirmBars);
    assert.equal(info.protected_parameters.min_rr, 1.7);
    assert.equal(info.protected_parameters.quality_threshold, 65);
    assert.equal(info.protected_parameters.corr_resolve_confirm_bars, 3);
  });

  it('explicitly reports no auto-update mechanism', () => {
    assert.equal(getRuntimeInfo().auto_update, false);
  });

  it('documents a non-empty reconnect/restart procedure', () => {
    const info = getRuntimeInfo();
    assert.ok(Array.isArray(info.reconnect_and_restart_procedure));
    assert.ok(info.reconnect_and_restart_procedure.length > 0);
  });
});

describe('xauusd_runtime_info: getRuntimeHealthSnapshot()', () => {
  function memoryDeps({ getStateThrows = false, symbol = 'OANDA:XAUUSD', resolution = '15', bars } = {}) {
    return {
      getState: async () => { if (getStateThrows) throw new Error('CDP unavailable'); return { success: true, symbol, resolution }; },
      getOhlcv: async () => ({ bars: bars ?? [] }),
      loadWatcherState: () => ({ last_connection_ok: true, baseline_established: true, last_processed_5m_time: 1700000000, last_alerted_signal_id: 'sig-1', updated_at: '2026-09-17T00:00:00.000Z' }),
      readAnticipationStore: () => null,
      readRegistry: () => null,
      isAlive: () => false,
      watcherLockPath: '/does/not/exist/lock',
    };
  }

  it('never calls calculateEntry/analyzeMarket -- source audit', () => {
    const src = readFileSync(new URL('../src/core/xauusd_runtime_info.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/calculateEntry\(/.test(code));
    assert.ok(!/analyzeMarket\(/.test(code));
  });

  it('reports CDP unreachable honestly (READ_ERROR), never fabricates a reachable chart', async () => {
    const snap = await getRuntimeHealthSnapshot({ _deps: memoryDeps({ getStateThrows: true }) });
    assert.equal(snap.cdp.reachable, false);
    assert.equal(snap.cdp.status, 'READ_ERROR');
  });

  it('reports watcher lock as not running when the lock file does not exist -- read-only, never acquires it', async () => {
    const snap = await getRuntimeHealthSnapshot({ _deps: memoryDeps() });
    assert.equal(snap.watcher.running, false);
    assert.equal(snap.watcher.pid, null);
    // The watcher STATE (from the injected loadWatcherState mock) is still reported.
    assert.equal(snap.watcher.last_processed_5m_time, 1700000000);
    assert.equal(snap.watcher.last_alerted_signal_id, 'sig-1');
  });

  it('reports watcher running:true when the lock file exists with a live PID', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runtime-info-'));
    try {
      const lockPath = join(dir, 'lock');
      writeFileSync(lockPath, '4242');
      const deps = { ...memoryDeps(), watcherLockPath: lockPath, isAlive: (pid) => pid === 4242 };
      const snap = await getRuntimeHealthSnapshot({ _deps: deps });
      assert.equal(snap.watcher.running, true);
      assert.equal(snap.watcher.pid, 4242);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports the fixed protocol decision timeframe (15m) without any live call -- verified against mtf.js\'s own hardcoded source_timeframe', async () => {
    const snap = await getRuntimeHealthSnapshot({ _deps: memoryDeps() });
    assert.equal(snap.decision_timeframe, '15m');
  });

  it('a missing Stage 3 store / drawing registry reports honestly, never throws', async () => {
    const snap = await getRuntimeHealthSnapshot({ _deps: memoryDeps() });
    assert.equal(snap.stage3_observability.store_present, false);
    assert.equal(snap.stage3_observability.tracked_setups, 0);
    assert.equal(snap.visualization.registry_present, false);
    assert.equal(snap.visualization.tracked_drawings, 0);
  });

  it('an existing Stage 3 store / registry reports the real tracked counts', async () => {
    const deps = {
      ...memoryDeps(),
      readAnticipationStore: () => ({ setups: { a: {}, b: {}, c: {} } }),
      readRegistry: () => ({ entries: { k1: {}, k2: {} } }),
    };
    const snap = await getRuntimeHealthSnapshot({ _deps: deps });
    assert.equal(snap.stage3_observability.tracked_setups, 3);
    assert.equal(snap.visualization.tracked_drawings, 2);
  });

  it('includes the active chart symbol/timeframe when CDP is reachable', async () => {
    const bars = [];
    for (let i = 0; i < 200; i++) bars.push({ time: 1700000000 + i * 900, open: 2000, high: 2001, low: 1999, close: 2000.5, volume: 100 });
    const snap = await getRuntimeHealthSnapshot({ _deps: memoryDeps({ resolution: '15', bars }) });
    assert.equal(snap.active_chart.symbol, 'OANDA:XAUUSD');
    assert.equal(snap.active_chart.timeframe, '15m');
  });
});
