/**
 * STAGE 12 — CONTROLLED DEMO FORWARD VALIDATOR (2026-09-26). One separate process that runs the UNCHANGED
 * production decision path (src/engine/watcher.js cycle + src/core/xauusd_analyze_market.js /
 * calculateEntry) on Exness XAUUSDm bars from a read-only feed, and routes the resulting BUY/SELL signals to
 * the UNCHANGED executor (src/engine/mt5Executor.js) configured for the DEMO account with REAL-parity
 * settings (docs/XAUUSD_STAGE12_DEMO_EXECUTION_ARCHITECTURE.md). Every trade-changing bridge command passes
 * the DEMO identity guard first (src/demo/identityGuard.js). All Stage 12 runtime state lives under
 * state/demo_forward/ (own watcher lock/state, own executor state/audit/kill switch, own evidence store).
 *
 *   node src/demo/validator.js            run (poll every 60 s)
 *   node src/demo/validator.js --check    verify the DEMO connection and identity, print the pre-start gate, exit
 *
 * It never touches the TradingView chart, the REAL bridge, the REAL state files or the Stage 11C store.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startWatcher, createCycleDeps } from '../engine/watcher.js';
import { analyzeMarket } from '../core/xauusd_analyze_market.js';
import { createMt5Executor } from '../engine/mt5Executor.js';
import { Mt5Bridge, DEFAULT_BRIDGE_SCRIPT } from '../engine/mt5Bridge.js';
import { createCalendarProvider, createNewsMonitor } from '../engine/newsMonitor.js';
import { notifyOps } from '../engine/notifier.js';
import { createFeedReader, createEngineFeedDeps, FEED_SYMBOL } from './feed.js';
import { buildDemoParityConfig } from './config.js';
import { DEMO_IDENTITY, createGuardedBridge, verifyDemoIdentity } from './identityGuard.js';
import { createDemoEvidenceStore, buildSignalRecord, buildExecutionRecord, labelSignalOutcome, provenanceFor, OUTCOME_HORIZONS, DEMO_SCHEMA_VERSION } from './evidence.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DEMO_DIR = `${ROOT}state/demo_forward`;
export const DEMO_PATHS = Object.freeze({ dir: DEMO_DIR, lock: `${DEMO_DIR}/validator.lock`, watcherState: `${DEMO_DIR}/watcher_state.json`, watcherLock: `${DEMO_DIR}/watcher.lock`, executorState: `${DEMO_DIR}/executor_state.json`, executorLog: `${DEMO_DIR}/executor_audit.jsonl`, killSwitch: `${DEMO_DIR}/kill_switch`, signalStore: `${DEMO_DIR}/engine_signals.json`, status: `${DEMO_DIR}/validator_status.json`, log: `${DEMO_DIR}/validator.log` });
const TAG = `ACCOUNT_CLASS=DEMO login=${DEMO_IDENTITY.login} server=${DEMO_IDENTITY.server} symbol=${DEMO_IDENTITY.symbol} lot=${DEMO_IDENTITY.lot}`;

/** Builds every component with injectable deps (tests pass fakes). Returns the pieces; nothing is started here. */
export function buildDemoValidator({ paths = DEMO_PATHS, env = process.env, log = () => {}, now = () => new Date(), feed, bridge, newsMonitor, evidenceStore, ops = notifyOps, demoTerminalPath = env.XAUUSD_MT5_DEMO_TERMINAL_PATH ?? null } = {}) {
  const config = buildDemoParityConfig(env);
  const rawBridge = bridge ?? new Mt5Bridge({ scriptPath: DEFAULT_BRIDGE_SCRIPT, env: { ...stripReal(env), XAUUSD_MT5_LOGIN: String(DEMO_IDENTITY.login), XAUUSD_MT5_SERVER: DEMO_IDENTITY.server, XAUUSD_MT5_SYMBOL: DEMO_IDENTITY.symbol, ...(demoTerminalPath ? { XAUUSD_MT5_TERMINAL_PATH: demoTerminalPath } : {}) }, log });
  const alerts = createOpsAlerts({ ops, log, now });
  const guarded = createGuardedBridge(rawBridge, { log, onBlock: ({ cmd, reasons }) => alerts.once('DEMO_ACCOUNT_MISMATCH', { cmd, reasons: reasons.join(',') }) });
  const monitor = newsMonitor ?? createNewsMonitor({ provider: createCalendarProvider({ kind: config.newsProvider, url: config.newsCalendarUrl, filePath: config.newsCalendarFile, minFetchIntervalSec: config.newsFetchIntervalSec }), params: config.newsRiskParams, snapshotPath: `${paths.dir}/news_calendar_snapshot.json`, log });
  const executor = createMt5Executor({ config, bridge: guarded, statePath: paths.executorState, logPath: paths.executorLog, killSwitchPath: paths.killSwitch, log: (m) => log(`[demo-executor] ${m}`), now, newsMonitor: monitor });
  const store = evidenceStore ?? createDemoEvidenceStore({ dir: paths.dir });
  const feedDeps = createEngineFeedDeps({ feed, symbol: FEED_SYMBOL, storePath: paths.signalStore, now, env });
  return { config, executor, bridge: guarded, rawBridge, monitor, store, feedDeps, alerts, feed };
}
function stripReal(env) { const o = {}; for (const [k, v] of Object.entries(env)) if (!/^XAUUSD_MT5_REAL_/.test(k)) o[k] = v; return o; }

function createOpsAlerts({ ops, log, now }) {
  const fired = new Set();
  const send = (kind, extra = {}) => { const payload = { kind: `DEMO_${kind}`.replace(/^DEMO_DEMO_/, 'DEMO_'), at: now().toISOString(), message: `${kind} | ${TAG}${extra.detail ? ` | ${extra.detail}` : ''}`, ...extra }; try { ops(payload); } catch (err) { log(`[demo-ops] alert failed (non-fatal): ${err.message}`); } };
  return { send, once: (kind, extra = {}) => { const key = `${kind}|${extra.reasons ?? extra.cmd ?? ''}`; if (fired.has(key)) return; fired.add(key); send(kind, extra); }, reset: (kind) => { for (const k of [...fired]) if (k.startsWith(kind)) fired.delete(k); } };
}

/** Pre-start gate: DEMO identity through the live bridge; REAL identity or any mismatch refuses. Never sends an order. */
export async function preStartGate({ executor, bridge }) {
  let hello; try { hello = await bridge.request('hello', { expected_login: DEMO_IDENTITY.login, expected_server: DEMO_IDENTITY.server, symbol: DEMO_IDENTITY.symbol }); } catch (err) { return { ok: false, blocker: `DEMO_BRIDGE_HELLO_FAILED:${err.message}` }; }
  const v = verifyDemoIdentity(hello); if (!v.ok) return { ok: false, blocker: `DEMO_IDENTITY_MISMATCH:${v.reasons.join(',')}`, hello_login: hello?.account?.login ?? null, hello_server: hello?.account?.server ?? null, trade_mode: hello?.account?.trade_mode ?? null };
  const st = await executor.start(); if (st?.halted) return { ok: false, blocker: `DEMO_EXECUTOR_HALTED:${st.halted?.reason ?? JSON.stringify(st.halted)}`, verified: v.verified };
  return { ok: true, verified: v.verified, symbol: hello.symbol, terminal: hello.terminal ?? null, account: { balance: hello.account.balance, equity: hello.account.equity, margin_free: hello.account.margin_free, leverage: hello.account.leverage }, start: st };
}

/** Wires the evidence recorder around the executor and the watcher cycle deps. Pure orchestration; returns the watcher deps. */
export function createValidatorCycle({ parts, paths = DEMO_PATHS, log = () => {}, now = () => new Date(), mode = 'LIVE' }) {
  const { executor, store, feedDeps, alerts } = parts; const nowSec = () => now().getTime() / 1000; let mirroredLines = 0; let lastResult = null;
  const ctxFrom = (result) => { const p = executor.status?.().news_protection ?? null; return { regime_5m: result?.evidence?.regime ?? result?.regime ?? null, structure_5m: result?.evidence?.structure?.state ?? null, bias_15m: result?.bias?.direction ?? null, regime_15m: result?.bias?.regime ?? null, context_30m: result?.diagnostics?.htf?.['30m'] ?? result?.htf_context?.['30m'] ?? null, context_1h: result?.diagnostics?.htf?.['1H'] ?? result?.htf_context?.['1H'] ?? null, spread_usd: p?.shock?.evidence?.spread ?? null, feed_age_sec: p?.shock?.evidence?.quote_age_sec ?? null, feed_state: p?.shock?.evidence?.feed_stale === true ? 'STALE' : p ? 'FRESH' : null, news: p?.news ? { state: p.news.state, reason: p.news.reason, block_ends_utc: p.news.block_ends_utc ?? null, tier: p.news.tier ?? null } : null, news_tier: p?.news?.tier ?? p?.news?.event?.tier ?? null, shock_state: p?.shock?.state ?? null, breaker: executor.status?.().daily ? { day: executor.status().daily.day, completed: executor.status().daily.completed, consecutive_losses: executor.status().daily.consecutive_losses } : null }; };
  async function executeSignal(ev) {
    const { alert, signalId, result } = ev; log(`[demo-validator] ${TAG} signal_id=${signalId} action=${alert?.action} model=${alert?.setup} quality=${alert?.quality} rr=${alert?.rr} -> executor`);
    let exec; try { exec = await executor.executeSignal(ev); } catch (err) { exec = { executed: false, reason: 'EXECUTOR_THREW', details: { error: err.message } }; }
    const decisionSec = Date.parse(result?.calculated_at ?? '') / 1000; const prov = provenanceFor({ decisionSec: Number.isFinite(decisionSec) ? decisionSec : nowSec(), nowSec: nowSec(), mode });
    if (prov) { const rec = buildSignalRecord({ nowSec: Math.floor(nowSec()), signalId, result, alert, exec, ctx: ctxFrom(result), provenance: prov, identity: DEMO_IDENTITY }); const r = store.append(rec); if (!r.ok && r.reason !== 'DUPLICATE') log(`[demo-validator] evidence SIGNAL rejected: ${r.reason} ${r.errors?.join(',') ?? ''}`); }
    log(`[demo-validator] ${TAG} signal_id=${signalId} RESULT=${exec.executed ? 'DEMO ORDER EXECUTED' : `BLOCKED:${exec.reason}`}`);
    if (exec.executed) alerts.send('ORDER_FILLED', { detail: `signal_id=${signalId} ${alert?.action}` }); else if (/DUPLICATE/.test(exec.reason ?? '')) alerts.once('DUPLICATE_BLOCKED', { detail: `signal_id=${signalId}`, reasons: signalId });
    return exec;
  }
  function mirrorAudit() { if (!existsSync(paths.executorLog)) return; const rows = readFileSync(paths.executorLog, 'utf8').split(/\r?\n/).filter(Boolean); for (let i = mirroredLines; i < rows.length; i++) { let a; try { a = JSON.parse(rows[i]); } catch { continue; } const t = Date.parse(a.timestamp) / 1000; const prov = provenanceFor({ decisionSec: t, nowSec: nowSec(), mode }) ?? 'BACKFILL'; const r = store.append(buildExecutionRecord({ nowSec: Math.floor(nowSec()), auditRecord: a, provenance: prov, lineIndex: i })); if (r.ok) { if (a.type === 'CLOSED') alerts.send('TRADE_CLOSED', { detail: `signal_id=${a.signal_id} reason=${a.reason ?? a.exit_reason ?? ''} net=${a.net_pnl ?? a.realized_net_usd ?? ''}` }); if (a.type === 'INTENT') alerts.send('ORDER_INTENT', { detail: `signal_id=${a.signal_id} ${a.side ?? ''}` }); if (a.type === 'SKIPPED' && /BROKER|REJECT|RETCODE|ORDER_FAILED/.test(a.reason ?? '')) alerts.once('ORDER_REJECTED', { detail: a.reason, reasons: a.reason }); if (/RECONCIL|RESUMED_POSITION|INTENT_RESOLVED|ANOMALY/.test(a.type)) alerts.once('POSITION_RECONCILED', { detail: a.type, reasons: a.type }); } } mirroredLines = rows.length; }
  function labelOutcomes() { const bars5 = feedDeps.bars()['5'] ?? []; const recs = store.readAll(); const signals = recs.filter((r) => r.kind === 'SIGNAL' && Number.isFinite(r.signal_candle_time)); for (const s of signals) for (const h of Object.keys(OUTCOME_HORIZONS)) { const o = labelSignalOutcome({ signal: s, horizonKey: h, bars5, nowSec: nowSec(), provenance: s.provenance }); if (!o) continue; if (o.status === 'LABELED' || nowSec() - o.horizon_end_time > 48 * 3600) store.append(o); } }
  const analyze = async (opts) => { await feedDeps.sweep(); const result = await analyzeMarket({ ...opts, persistSignals: true, engineProfile: 'intraday_5m', _deps: feedDeps.deps }); lastResult = result; return result; };
  const noop = () => null;
  const cycleDeps = createCycleDeps({ getState: feedDeps.deps.getState, setTimeframe: feedDeps.deps.setTimeframe, getOhlcv: feedDeps.deps.getOhlcv, withCdpLock: (_p, fn) => fn(), cdpLockPath: 'unused', now, isCdpReachable: feedDeps.isReachable, peekLatest5mCandle: feedDeps.peekLatest5mCandle, engineProfile: 'intraday_5m', analyzeMarket: analyze, recordAnticipationObservation: noop, recordOpportunityObservation: noop, resolveOpportunityOutcomes: noop, visualizeMarketAnalysis: noop, notify: (alert) => log(`[demo-validator] ${TAG} SIGNAL ${alert.action} entry=${alert.entry} sl=${alert.sl} tp1=${alert.tp1} tp2=${alert.tp2} rr=${alert.rr} quality=${alert.quality} (decision only; execution follows through the DEMO executor)`), notifyPreEntryWatch: noop, notifyOps: (o) => alerts.send(o.kind === 'FEED_STALLED' ? 'FEED_STALLED' : o.kind === 'FEED_RECOVERED' ? 'FEED_RECOVERED' : o.kind, { detail: o.last_reason ?? o.recovered_action ?? '' }), executeSignal, reviewOpenPosition: async (ev) => { try { return await executor.reviewThesis(ev); } catch (err) { return { action: 'REVIEW_FAILED', reason: err.message }; } } });
  return { cycleDeps, executeSignal, mirrorAudit, labelOutcomes, monitorTick: async () => { try { await executor.monitorOnce(); } catch (err) { log(`[demo-validator] monitor error: ${err.message}`); } mirrorAudit(); labelOutcomes(); }, lastResult: () => lastResult };
}

// ---------------- process entry ----------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const check = process.argv.includes('--check'); mkdirSync(DEMO_DIR, { recursive: true });
  const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; console.log(line); try { appendFileSync(DEMO_PATHS.log, line + '\n'); } catch { /* ignore */ } };
  const writeStatus = (s) => { try { writeFileSync(DEMO_PATHS.status, JSON.stringify({ ...s, schema_version: DEMO_SCHEMA_VERSION, identity: DEMO_IDENTITY, updated_at: new Date().toISOString() }, null, 1)); } catch { /* ignore */ } };
  (async () => {
    if (!check) { if (existsSync(DEMO_PATHS.lock)) { const pid = Number(readFileSync(DEMO_PATHS.lock, 'utf8').trim()); let alive = false; try { process.kill(pid, 0); alive = true; } catch { alive = false; } if (alive && pid !== process.pid) { console.error(`demo validator already running (pid ${pid}); refusing to start a duplicate`); process.exit(2); } } writeFileSync(DEMO_PATHS.lock, String(process.pid)); }
    const feed = createFeedReader({ log }); const fh = await feed.start(); log(`[demo-feed] hello read_only=${fh.read_only} terminal=${fh.terminal_path} (market data only)`);
    const parts = buildDemoValidator({ log, feed }); parts.rawBridge.start?.();
    const gate = await preStartGate({ executor: parts.executor, bridge: parts.rawBridge });
    log(`[demo-validator] PRE-START GATE ${gate.ok ? 'PASS' : 'FAIL'} ${TAG} :: ${JSON.stringify({ ok: gate.ok, blocker: gate.blocker ?? null, verified: gate.verified ?? null, hello_login: gate.hello_login ?? null, hello_server: gate.hello_server ?? null })}`);
    writeStatus({ started_at: new Date().toISOString(), pid: process.pid, gate, running: false, status: gate.ok ? 'STARTING' : 'READY_NOT_STARTED' });
    if (!gate.ok || check) { if (!gate.ok) parts.alerts.send('ACCOUNT_MISMATCH', { detail: gate.blocker }); await parts.executor.stop().catch(() => {}); await parts.rawBridge.stop?.().catch?.(() => {}); await feed.stop(); if (!check && existsSync(DEMO_PATHS.lock)) unlinkSync(DEMO_PATHS.lock); process.exit(gate.ok ? 0 : 3); }
    const cycle = createValidatorCycle({ parts, log }); parts.alerts.send('VALIDATOR_STARTED', { detail: `pid=${process.pid} verified_login=${gate.verified.login} magic=${parts.config.magic}` });
    writeStatus({ started_at: new Date().toISOString(), pid: process.pid, gate, running: true, status: 'RUNNING', config: { magic: parts.config.magic, lot: parts.config.lotSize, exact_lot: parts.config.exactLot, profit_target_usd: parts.config.profitTargetUsd, maximum_loss_usd: parts.config.maximumLossUsd, max_consecutive_losses: parts.config.maxConsecutiveLosses, min_effective_rr: parts.config.minEffectiveRr, thesis_exit: parts.config.thesisExit, news_protection: parts.config.newsProtection, news_params: parts.config.newsRiskParams } });
    const monitorTimer = setInterval(() => cycle.monitorTick(), 3000);
    const shutdown = async (sig) => { log(`stopping (${sig})`); clearInterval(monitorTimer); parts.alerts.send('VALIDATOR_STOPPED', { detail: sig }); try { await parts.executor.stop(); } catch { /* ignore */ } try { await parts.rawBridge.stop?.(); } catch { /* ignore */ } try { await feed.stop(); } catch { /* ignore */ } writeStatus({ pid: process.pid, running: false, status: 'STOPPED', stopped_reason: sig }); try { if (existsSync(DEMO_PATHS.lock) && readFileSync(DEMO_PATHS.lock, 'utf8').trim() === String(process.pid)) unlinkSync(DEMO_PATHS.lock); } catch { /* ignore */ } process.exit(0); };
    process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
    await startWatcher({ pollIntervalMs: 60_000, _deps: { statePath: DEMO_PATHS.watcherState, lockPath: DEMO_PATHS.watcherLock, log, cycleDeps: cycle.cycleDeps, visualizeActiveChartContext: async () => {} } });
    await shutdown('watcher-ended');
  })().catch((e) => { log(`fatal: ${e.message}`); try { if (existsSync(DEMO_PATHS.lock) && readFileSync(DEMO_PATHS.lock, 'utf8').trim() === String(process.pid)) unlinkSync(DEMO_PATHS.lock); } catch { /* ignore */ } process.exit(1); });
}
