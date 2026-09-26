/**
 * READ-ONLY pre-market system health report (weekend freeze, 2026-09-26).
 *
 * Answers, before market open, every question in the market-open runbook
 * (docs/XAUUSD_PRE_MARKET_CHECKLIST.md) from FILES, PROCESS LISTS and PURE
 * CONFIG RESOLUTION ONLY. It NEVER: starts an executor, attaches a trading
 * bridge, reconciles, restarts anything, resets the breaker, clears state,
 * changes the lot or touches the strategy. It does not even open the MT5
 * terminal unless `--live` is passed, and then only through the read-only
 * feed reader (mt5/mt5_feed_reader.py: rates/tick/ping, no trading calls).
 *
 * This replaces `xauusd mt5-real-status` while the REAL watcher is running
 * (that command starts a second executor on the live state -- see
 * docs/XAUUSD_BROKER_COMMAND_SURFACE.md).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { verifyStrategyFingerprint, computeStrategyFingerprint } from '../engine/strategyFingerprint.js';
import { resolveRealExecutorConfig, REAL_STATE_PATH, REAL_LOG_PATH, REAL_KILL_SWITCH_PATH, REAL_ACCOUNT, REAL_MAGIC } from '../engine/mt5RealPolicy.js';
import { DEFAULT_STATE_PATH as WATCHER_STATE_PATH, DEFAULT_LOCK_PATH as WATCHER_LOCK_PATH, lockHeldByLiveProcess } from '../engine/watcherState.js';
import { DEFAULT_CDP_LOCK_PATH } from '../engine/cdpLock.js';
import { DEFAULT_NEWS_SNAPSHOT_PATH } from '../engine/newsMonitor.js';
import { DEFAULT_STORE_PATH as SIGNAL_STORE_PATH } from '../engine/signalStore.js';
import { isGoldRelevant, classifyNewsTier, calendarFreshness } from '../engine/newsCalendar.js';
import { readTradeLog, readKillSwitch } from '../engine/mt5Executor.js';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const STATE_DIR = join(REPO_ROOT, 'state');
const SHADOW_STATUS = join(STATE_DIR, 'shadow', 'observer_status.json');
const SHADOW_LOCK = join(STATE_DIR, 'shadow', 'observer.lock');
const DEMO_STATUS = join(STATE_DIR, 'demo_forward', 'validator_status.json');
const DEMO_LOCK = join(STATE_DIR, 'demo_forward', 'validator.lock');

const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch (err) { return { __error: err.message }; } };
const ageSec = (iso, nowMs) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? Math.round((nowMs - t) / 1000) : null; };
const isoOf = (sec) => (Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null);

/** Cross-platform read-only process listing (node/python/terminal64). Never signals a process. */
export function listRelevantProcesses({ platform = process.platform, exec = execFileSync } = {}) {
  try {
    if (platform === 'win32') {
      const ps = "Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'node.exe','python.exe','terminal64.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
      const out = exec('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
      const parsed = out.trim() ? JSON.parse(out) : [];
      return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, name: p.Name, cmd: p.CommandLine ?? '' }));
    }
    const out = exec('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8', timeout: 20_000 });
    return out.split('\n').filter(Boolean).map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/); return m ? { pid: Number(m[1]), ppid: Number(m[2]), name: m[3], cmd: m[4] } : null; }).filter((p) => p && /node|python|terminal64/.test(p.name));
  } catch (err) { return { __error: err.message }; }
}

export function classifyProcesses(list) {
  if (!Array.isArray(list)) return { error: list?.__error ?? 'unavailable', real_watchers: [], demo_watchers: [], plain_watchers: [], validators: [], observers: [], real_bridges: [], demo_bridges: [], readers: [], terminals: [] };
  const has = (p, re) => re.test(p.cmd ?? '');
  const pick = (re) => list.filter((p) => has(p, re)).map((p) => ({ pid: p.pid, cmd: p.cmd }));
  return {
    real_watchers: pick(/xauusd\s+watch(?=.*--mt5-real)/), demo_watchers: pick(/xauusd\s+watch(?=.*--mt5-demo)/), plain_watchers: list.filter((p) => has(p, /xauusd\s+watch/) && !has(p, /--mt5-real|--mt5-demo/)).map((p) => ({ pid: p.pid, cmd: p.cmd })),
    validators: pick(/src[\\/]demo[\\/]validator\.js/), observers: pick(/src[\\/]shadow[\\/]observer\.js/), real_bridges: pick(/mt5_bridge_real\.py/), demo_bridges: pick(/mt5[\\/]mt5_bridge\.py/), readers: pick(/mt5_shadow_reader\.py|mt5_feed_reader\.py/), terminals: list.filter((p) => /terminal64/i.test(p.name)).map((p) => ({ pid: p.pid, cmd: p.cmd })),
  };
}

function gitInfo() {
  const g = (args) => { try { return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 15_000 }).trim(); } catch (err) { return `ERROR: ${err.message.split('\n')[0]}`; } };
  return { head: g(['rev-parse', 'HEAD']), branch: g(['rev-parse', '--abbrev-ref', 'HEAD']), subject: g(['log', '-1', '--format=%s']), dirty_files: g(['status', '--porcelain']).split('\n').filter(Boolean) };
}

function newestWatcherLog() {
  try {
    const files = readdirSync(STATE_DIR).filter((f) => /^watcher_real_v\d+\.log$/.test(f)).map((f) => ({ f, m: statSync(join(STATE_DIR, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    if (!files.length) return null;
    const p = join(STATE_DIR, files[0].f);
    const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-400);
    return { file: files[0].f, mtime: new Date(files[0].m).toISOString(), lines: lines.length, unexpected_errors_recent: tail.filter((l) => /Unexpected watcher error/.test(l)).length, last_lines: lines.slice(-3).map((l) => l.slice(0, 200)), stale_candle_lines_recent: tail.filter((l) => /stale 5m data/.test(l)).length };
  } catch (err) { return { __error: err.message }; }
}

/**
 * Builds the report. `env` is the environment of THIS shell (the watcher's
 * own env at start is recorded in its STARTED/PROTECTION_STARTED audit rows,
 * which the report reads and compares). Pure/read-only; optional `live`
 * uses the read-only feed reader for tick/spread/last bars.
 */
export async function buildPremarketHealth({ env = process.env, now = () => new Date(), live = false, feedReaderFactory = null } = {}) {
  const nowDate = now(); const nowMs = nowDate.getTime(); const nowSec = nowMs / 1000;
  const checks = []; const add = (id, status, detail, data = null) => { checks.push({ id, status, detail, ...(data ? { data } : {}) }); };

  // 1. Git + strategy freeze
  const git = gitInfo();
  const fp = verifyStrategyFingerprint();
  add('GIT_HEAD', git.head.startsWith('ERROR') ? 'WARN' : 'INFO', `${git.head} (${git.branch}) ${git.subject}`);
  add('STRATEGY_FINGERPRINT', fp.ok ? 'PASS' : 'FAIL', fp.ok ? `matches frozen ${fp.frozen?.version} ${fp.frozen?.strategy_fingerprint?.slice(0, 16)}` : `${fp.reason}: changed=${(fp.changed ?? []).join(',') || '-'} added=${(fp.added ?? []).join(',') || '-'} removed=${(fp.removed ?? []).join(',') || '-'} config_changed=${fp.config_changed ?? 'n/a'}`, { frozen: fp.frozen, current: fp.current });
  if (git.dirty_files.length) add('GIT_WORKTREE_DIRTY', 'WARN', `${git.dirty_files.length} uncommitted change(s): ${git.dirty_files.slice(0, 6).join(' | ')}`);

  // 2. Resolved REAL configuration (pure) -- lot, scaling, breaker, RR, News V2
  let cfg = null; let cfgError = null;
  try { cfg = resolveRealExecutorConfig(env); } catch (err) { cfgError = err.message; }
  if (cfgError) add('REAL_CONFIG', 'FAIL', `resolveRealExecutorConfig rejected this environment: ${cfgError}`);
  else {
    add('REAL_LOT', cfg.exactLot === 0.01 && cfg.lotSize === 0.01 && cfg.maxLotSize === 0.01 && cfg.sizingMode === 'fixed_user_lot' ? 'PASS' : 'FAIL', `exactLot=${cfg.exactLot} lotSize=${cfg.lotSize} maxLotSize=${cfg.maxLotSize} sizingMode=${cfg.sizingMode}`);
    add('AUTO_SCALING', cfg.computeSizing === undefined && cfg.sizingMode === 'fixed_user_lot' ? 'PASS' : 'FAIL', cfg.computeSizing === undefined ? 'OFF (no computeSizing hook in the REAL config)' : 'a sizing hook is configured');
    add('BREAKER', cfg.maxConsecutiveLosses === 2 ? 'PASS' : 'WARN', `maxConsecutiveLosses=${cfg.maxConsecutiveLosses} (per UTC day, resets at 00:00Z; dailyLossLimitUsd=${cfg.dailyLossLimitUsd})`);
    add('MIN_EFFECTIVE_RR', cfg.minEffectiveRr === 1.7 && cfg.thesisExit === true ? 'PASS' : 'WARN', `minEffectiveRr=${cfg.minEffectiveRr} thesisExit=${cfg.thesisExit} brokerStructuralSlMultiple=${cfg.brokerStructuralSlMultiple}`);
    add('MONETARY_ENVELOPE', cfg.profitTargetUsd === 30 && cfg.maximumLossUsd === -50 ? 'PASS' : 'WARN', `+${cfg.profitTargetUsd} / ${cfg.maximumLossUsd} USD`);
    const p = cfg.newsRiskParams;
    add('NEWS_V2_CONFIG', cfg.newsProtection === true && cfg.newsProvider !== 'none' && p.dataUnavailablePolicy === 'BLOCK' && p.tierBCooldownMin === 55 && p.tierAPostMin === 150 && p.normalizationMaxExtensionMin === 0 ? 'PASS' : 'WARN', `provider=${cfg.newsProvider} policy=${p.dataUnavailablePolicy} tierB=${p.tierBCooldownMin} tierA=${p.tierAPostMin}/${p.tierAPressConfCoverMin}/${p.tierAClusterGapMin} generic=${p.preNewsWindowMin}/${p.newsActiveWindowMin}/${p.postNewsCooldownMin} normalization_extension=${p.normalizationMaxExtensionMin} (0 = shadow only)`);
  }
  const fpFull = computeStrategyFingerprint({ env });
  if (fpFull.runtime_config_matches_defaults === false) add('RUNTIME_CONFIG_OVERRIDES', 'WARN', 'this shell environment overrides REAL config defaults (the running watcher env may differ: compare PROTECTION_STARTED.news_params below)');

  // 3. Processes, duplicates, locks
  const procs = classifyProcesses(listRelevantProcesses());
  add('REAL_WATCHER_PROCESS', procs.real_watchers.length === 1 ? 'PASS' : procs.real_watchers.length === 0 ? 'FAIL' : 'FAIL', procs.real_watchers.length === 1 ? `exactly one (pid ${procs.real_watchers[0].pid})` : procs.real_watchers.length === 0 ? 'NO REAL watcher process found' : `DUPLICATE REAL watchers: ${procs.real_watchers.map((p) => p.pid).join(',')}`);
  add('REAL_BRIDGE_PROCESS', procs.real_bridges.length >= 1 ? 'PASS' : 'FAIL', procs.real_bridges.length ? `pid(s) ${procs.real_bridges.map((p) => p.pid).join(',')}` : 'no mt5_bridge_real.py sidecar running');
  add('SHADOW_OBSERVER_PROCESS', procs.observers.length === 1 ? 'PASS' : procs.observers.length === 0 ? 'WARN' : 'WARN', procs.observers.length === 1 ? `pid ${procs.observers[0].pid}` : `${procs.observers.length} observer process(es)`);
  add('DEMO_VALIDATOR_PROCESS', procs.validators.length === 0 ? 'INFO' : 'INFO', procs.validators.length ? `RUNNING pid ${procs.validators.map((p) => p.pid).join(',')}` : 'not running (READY_NOT_STARTED expected)');
  add('LEGACY_DEMO_WATCHER', procs.demo_watchers.length === 0 ? 'PASS' : 'WARN', procs.demo_watchers.length ? `legacy --mt5-demo watcher running pid ${procs.demo_watchers.map((p) => p.pid).join(',')}` : 'none');
  add('MT5_TERMINAL_PROCESS', procs.terminals.length >= 1 ? 'PASS' : 'FAIL', procs.terminals.length ? procs.terminals.map((p) => `pid ${p.pid} ${p.cmd}`).join(' | ') : 'no terminal64.exe running');
  const wl = lockHeldByLiveProcess(WATCHER_LOCK_PATH); const ol = lockHeldByLiveProcess(SHADOW_LOCK); const dl = lockHeldByLiveProcess(DEMO_LOCK);
  const cdp = readJson(DEFAULT_CDP_LOCK_PATH);
  add('WATCHER_LOCK', wl.held ? 'PASS' : 'FAIL', wl.held ? `held by live pid ${wl.holderPid}` : `not held by a live process (holder ${wl.holderPid ?? 'none'})`);
  if (wl.held && procs.real_watchers.length === 1 && wl.holderPid !== procs.real_watchers[0].pid) add('WATCHER_LOCK_PID_MISMATCH', 'FAIL', `lock pid ${wl.holderPid} != REAL watcher pid ${procs.real_watchers[0].pid}`);
  add('SHADOW_LOCK', ol.held ? 'PASS' : 'WARN', ol.held ? `held by live pid ${ol.holderPid}` : 'not held');
  add('DEMO_LOCK', dl.held ? 'INFO' : 'INFO', dl.held ? `held by live pid ${dl.holderPid}` : 'not held (validator dormant)');
  add('CDP_CHART_LOCK', cdp && !cdp.__error && cdp.pid ? 'INFO' : 'INFO', cdp && cdp.pid ? `held by pid ${cdp.pid} since ${new Date(cdp.acquired_at).toISOString()} (reclaimed automatically when stale)` : 'free');

  // 4. Watcher state + log
  const ws = readJson(WATCHER_STATE_PATH);
  const wlog = newestWatcherLog();
  if (!ws || ws.__error) add('WATCHER_STATE', 'FAIL', `unreadable: ${ws?.__error ?? 'missing'}`);
  else {
    const hb = ageSec(ws.updated_at, nowMs);
    add('WATCHER_HEARTBEAT', hb != null && hb <= 180 ? 'PASS' : 'FAIL', `state updated ${hb ?? '?'}s ago (${ws.updated_at})`);
    add('LAST_PROCESSED_5M', 'INFO', `${isoOf(ws.last_processed_5m_time)} (baseline_established=${ws.baseline_established}, last_alerted_signal_id=${ws.last_alerted_signal_id ?? null})`);
    add('WATCHER_FEED', ws.feed_failure_streak > 0 ? 'WARN' : 'PASS', ws.feed_failure_streak > 0 ? `feed failure streak ${ws.feed_failure_streak} since ${ws.feed_failure_since} (alerted ${ws.feed_stall_alerted_at ?? 'no'}) -- expected while the market is closed; must recover after reopen` : 'no feed failure streak');
    if (ws.cycle_error_streak > 0) add('WATCHER_CYCLE_ERRORS', 'FAIL', `${ws.cycle_error_streak} consecutive cycle error(s): ${ws.last_cycle_error}`);
  }
  if (wlog && !wlog.__error) add('WATCHER_LOG', wlog.unexpected_errors_recent === 0 ? 'PASS' : 'WARN', `${wlog.file} (${wlog.lines} lines, mtime ${wlog.mtime}); unexpected errors in last 400 lines: ${wlog.unexpected_errors_recent}; stale-candle lines: ${wlog.stale_candle_lines_recent}`, { last_lines: wlog.last_lines });

  // 5. REAL executor state + audit log
  const es = readJson(REAL_STATE_PATH);
  const events = existsSync(REAL_LOG_PATH) ? readTradeLog(REAL_LOG_PATH) : [];
  const rawLines = existsSync(REAL_LOG_PATH) ? readFileSync(REAL_LOG_PATH, 'utf8').split('\n').filter(Boolean).length : 0;
  const lastOf = (t) => [...events].reverse().find((e) => e.type === t) ?? null;
  const started = lastOf('STARTED'); const prot = lastOf('PROTECTION_STARTED');
  const sinceStart = started ? events.filter((e) => e.timestamp >= started.timestamp) : events;
  if (!es || es.__error) add('REAL_EXECUTOR_STATE', 'FAIL', `unreadable: ${es?.__error ?? 'missing'}`);
  else {
    add('REAL_EXECUTOR_STATE', 'INFO', `magic=${es.magic} updated ${ageSec(es.updated_at, nowMs)}s ago; executed_signals=${Object.keys(es.executed_signals ?? {}).length}`);
    add('REAL_MAGIC', es.magic === REAL_MAGIC ? 'PASS' : 'FAIL', `state magic ${es.magic} vs REAL_MAGIC ${REAL_MAGIC}`);
    add('REAL_HALTED', es.halted ? 'FAIL' : 'PASS', es.halted ? `HALTED: ${es.halted.reason} at ${es.halted.at}` : 'not halted');
    add('REAL_POSITION', es.position ? 'WARN' : 'PASS', es.position ? `OPEN ${es.position.side} ticket ${es.position.ticket ?? es.position.position_id} since ${es.position.open_time} (close_requested=${es.position.close_requested ?? null})` : 'flat (no MCP position in state)');
    add('REAL_INTENT', es.intent?.status === 'PENDING' ? 'FAIL' : 'PASS', es.intent ? `${es.intent.status} signal ${es.intent.signal_id} (${es.intent.resolved_at ?? es.intent.created_at})` : 'none');
    add('REAL_DAILY', 'INFO', `day=${es.daily?.day} completed=${es.daily?.completed} consecutive_losses=${es.daily?.consecutive_losses} realized_net=${es.daily?.realized_net_usd} (UTC day rollover pending: ${es.daily?.day !== nowDate.toISOString().slice(0, 10)})`);
    const pr = es.protection ?? {};
    add('REAL_PROTECTION', pr.blocking ? 'WARN' : 'PASS', pr.blocking ? `BLOCKING since ${pr.blocking_since}: ${(pr.block_reasons ?? []).join(',')} (news=${pr.last_news_state} shock=${pr.last_shock_state}); last_block_cleared_at=${pr.last_block_cleared_at}` : `not blocking (news=${pr.last_news_state} shock=${pr.last_shock_state}); last_block_cleared_at=${pr.last_block_cleared_at}`);
  }
  if (!started) add('REAL_ACCOUNT_IDENTITY', 'FAIL', 'no STARTED record in the REAL audit log');
  else {
    const a = started.account ?? {}; const ok = Number(a.login) === REAL_ACCOUNT.login && a.server === REAL_ACCOUNT.server && Number(a.trade_mode) === 2 && started.real_verified === true;
    add('REAL_ACCOUNT_IDENTITY', ok ? 'PASS' : 'FAIL', `last STARTED ${started.timestamp}: login=${a.login} server=${a.server} trade_mode=${a.trade_mode} real_verified=${started.real_verified} terminal=${started.terminal?.path} build=${started.terminal?.build} lot_size=${started.lot_size} magic=${started.magic} equity=${a.equity} leverage=${a.leverage}`);
    const failedChecks = Object.entries(started.checks ?? {}).filter(([, v]) => v === false).map(([k]) => k);
    add('REAL_BRIDGE_CHECKS', failedChecks.length === 0 ? 'PASS' : 'FAIL', failedChecks.length ? `failed: ${failedChecks.join(',')}` : `all ${Object.keys(started.checks ?? {}).length} checks true at last start`);
    add('REAL_START_AGE', 'INFO', `watcher executor started ${ageSec(started.timestamp, nowMs)}s ago (${started.timestamp}); STARTED rows total ${events.filter((e) => e.type === 'STARTED').length}`);
  }
  if (prot) { const np = prot.news_params ?? {}; add('REAL_RUNNING_NEWS_PARAMS', np.dataUnavailablePolicy === 'BLOCK' && np.normalizationMaxExtensionMin === 0 && np.tierBCooldownMin === 55 && np.tierAPostMin === 150 ? 'PASS' : 'WARN', `as loaded by the RUNNING executor at ${prot.timestamp}: provider=${prot.news_provider?.kind ?? prot.news_provider} policy=${np.dataUnavailablePolicy} tierB=${np.tierBCooldownMin} tierA=${np.tierAPostMin}/${np.tierAPressConfCoverMin}/${np.tierAClusterGapMin} normalization_extension=${np.normalizationMaxExtensionMin}`); }
  const counts = {}; for (const e of sinceStart) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const bad = ['HALTED', 'ANOMALY', 'ORDER_AMBIGUOUS', 'CLOSE_FAILED', 'EMERGENCY_CLOSE', 'EMERGENCY_CLOSE_FAILED', 'STOPS_REALIGN_FAILED', 'REJECTED'].filter((t) => counts[t]);
  add('REAL_AUDIT_SINCE_START', bad.length ? 'WARN' : 'PASS', `${sinceStart.length} events since last start: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}${bad.length ? ` -- attention: ${bad.join(',')}` : ''}`);
  add('REAL_AUDIT_INTEGRITY', rawLines === events.length ? 'PASS' : 'WARN', `${events.length} parsed of ${rawLines} lines${rawLines !== events.length ? ' (torn/invalid lines skipped)' : ''}`);
  const ks = readKillSwitch(REAL_KILL_SWITCH_PATH);
  add('REAL_KILL_SWITCH', ks.active ? 'WARN' : 'PASS', ks.active ? `ACTIVE (${ks.close ? 'close requested' : 'entries blocked'}): ${ks.raw}` : 'not present (entries permitted by this gate)');

  // 6. News calendar snapshot
  const snap = readJson(DEFAULT_NEWS_SNAPSHOT_PATH);
  if (!snap || snap.__error) add('NEWS_SNAPSHOT', 'FAIL', `unreadable: ${snap?.__error ?? 'missing'}`);
  else {
    const fresh = calendarFreshness({ sourceTimestamp: snap.source_timestamp, now: nowDate, staleAfterSec: cfg?.newsStaleSec ?? 21600 });
    add('NEWS_SNAPSHOT', fresh?.stale === false || fresh?.fresh === true ? 'PASS' : 'WARN', `source=${snap.source} source_timestamp=${snap.source_timestamp} (${ageSec(snap.source_timestamp, nowMs)}s) fetched_at=${snap.fetched_at} (${ageSec(snap.fetched_at, nowMs)}s) events=${snap.counts?.usable}/${snap.counts?.received}; freshness=${JSON.stringify(fresh)}`);
    const upcoming = (snap.events ?? []).filter((e) => e.status !== 'UNSCHEDULABLE' && isGoldRelevant(e) && Date.parse(e.event_time_utc) > nowMs).sort((x, y) => Date.parse(x.event_time_utc) - Date.parse(y.event_time_utc)).slice(0, 8).map((e) => ({ when: e.event_time_utc, tier: classifyNewsTier(e), impact: e.impact, currency: e.currency, name: e.event_name }));
    add('NEWS_UPCOMING_RELEVANT', 'INFO', upcoming.length ? upcoming.map((u) => `${u.when} T${u.tier} ${u.currency} ${u.impact} ${u.name}`).join(' | ') : 'none in snapshot horizon', { upcoming });
  }

  // 7. Signal store integrity
  const store = readJson(SIGNAL_STORE_PATH);
  add('SIGNAL_STORE', store && !store.__error && Array.isArray(store.signals) ? 'PASS' : 'FAIL', store?.__error ? `CORRUPT: ${store.__error}` : `${store?.signals?.length ?? 0} signals (dedup store)`);

  // 8. Shadow observer + evidence store health
  const os_ = readJson(SHADOW_STATUS);
  if (!os_ || os_.__error) add('SHADOW_OBSERVER', 'WARN', `status unreadable: ${os_?.__error ?? 'missing'}`);
  else add('SHADOW_OBSERVER', ageSec(os_.updated_at, nowMs) <= 180 && !os_.last_error ? 'PASS' : 'WARN', `cycles=${os_.cycles} last_cycle ${ageSec(os_.last_cycle_at, nowMs)}s ago; feed=${os_.market?.feed_state} last_tick=${isoOf(os_.market?.last_tick_time)} last_completed_5m=${isoOf(os_.market?.last_completed_5m)}; store obs=${os_.store?.observations} outcomes=${os_.store?.outcomes} malformed=${os_.store?.malformed_lines}; last_error=${os_.last_error ?? 'none'}`);

  // 9. DEMO validator
  const ds = readJson(DEMO_STATUS);
  add('DEMO_VALIDATOR', 'INFO', ds && !ds.__error ? `${ds.status} (running=${ds.running}) gate=${ds.gate?.ok ? 'PASS' : `FAIL ${ds.gate?.blocker}`} updated ${ds.updated_at}` : 'no status file');

  // 10. Optional LIVE market read (read-only feed reader; never a trading bridge)
  let market = null;
  if (live) {
    try {
      const { createFeedReader } = await import('../engine/mt5FeedReader.js');
      const feed = (feedReaderFactory ?? createFeedReader)({ log: () => {} });
      try {
        await feed.start();
        const t = await feed.tick('XAUUSDm'); const r = await feed.rates('XAUUSDm', '5', 3);
        const tick = t?.tick ?? t; const bars = r?.bars ?? [];
        const tickAge = Number.isFinite(tick?.time) ? Math.round(nowSec - tick.time) : null;
        const spread = Number.isFinite(tick?.ask) && Number.isFinite(tick?.bid) ? Math.round((tick.ask - tick.bid) * 1000) / 1000 : null;
        market = { tick_time: isoOf(tick?.time), tick_age_sec: tickAge, bid: tick?.bid ?? null, ask: tick?.ask ?? null, spread_usd: spread, last_bars_5m: bars.map((b) => ({ time: isoOf(b.time), close: b.close })) };
        add('LIVE_TICK', tickAge != null && tickAge <= 90 ? 'PASS' : 'WARN', `tick ${isoOf(tick?.time)} age ${tickAge}s bid=${tick?.bid} ask=${tick?.ask} (market closed => stale is expected)`);
        add('LIVE_SPREAD', spread != null && cfg && spread <= cfg.maxSpreadUsd ? 'PASS' : 'WARN', `spread ${spread} USD vs guard ${cfg?.maxSpreadUsd}`);
        const lastConfirmed = bars.length >= 2 ? bars[bars.length - 2] : null;
        add('LIVE_LAST_CONFIRMED_5M', lastConfirmed ? 'INFO' : 'WARN', lastConfirmed ? `${isoOf(lastConfirmed.time)} (forming ${isoOf(bars.at(-1)?.time)}); watcher last_processed ${isoOf(ws?.last_processed_5m_time)}` : 'no bars');
      } finally { try { await feed.stop(); } catch { /* ignore */ } }
    } catch (err) { add('LIVE_MARKET', 'WARN', `live read failed: ${err.message}`); }
  }

  const fails = checks.filter((c) => c.status === 'FAIL'); const warns = checks.filter((c) => c.status === 'WARN');
  return {
    generated_at: nowDate.toISOString(), read_only: true, git, strategy: { verify: fp, runtime: { runtime_config_fingerprint: fpFull.runtime_config_fingerprint ?? null, matches_defaults: fpFull.runtime_config_matches_defaults ?? null } },
    processes: procs, market, checks, summary: { pass: checks.filter((c) => c.status === 'PASS').length, warn: warns.length, fail: fails.length, info: checks.filter((c) => c.status === 'INFO').length },
    blocking_conditions: fails.map((c) => `${c.id}: ${c.detail}`), attention: warns.map((c) => `${c.id}: ${c.detail}`),
    ready_for_market_open: fails.length === 0,
    note: 'READ-ONLY report. It never trades, restarts, resets the breaker, clears state, changes the lot or modifies the strategy. FAIL = blocks controlled market-open validation until resolved; WARN = review; INFO = context.',
  };
}

export function formatPremarketHealth(rep) {
  const lines = [`XAUUSD PRE-MARKET HEALTH — ${rep.generated_at} — READY_FOR_MARKET_OPEN=${rep.ready_for_market_open ? 'YES' : 'NO'} (pass ${rep.summary.pass} / warn ${rep.summary.warn} / fail ${rep.summary.fail})`];
  for (const c of rep.checks) lines.push(`${c.status.padEnd(4)} ${c.id.padEnd(28)} ${c.detail}`);
  if (rep.market) lines.push(`LIVE ${JSON.stringify(rep.market)}`);
  if (rep.blocking_conditions.length) { lines.push('BLOCKING:'); for (const b of rep.blocking_conditions) lines.push(`  - ${b}`); }
  lines.push(rep.note);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  buildPremarketHealth({ live: args.includes('--live') }).then((rep) => { console.log(args.includes('--json') ? JSON.stringify(rep, null, 2) : formatPremarketHealth(rep)); process.exitCode = rep.ready_for_market_open ? 0 : 2; }).catch((err) => { console.error(`premarket health failed: ${err.message}`); process.exitCode = 1; });
}
