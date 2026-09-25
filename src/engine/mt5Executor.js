/**
 * MT5 DEMO execution layer for the XAUUSD MCP watcher.
 *
 *   existing MCP decision engine
 *     -> validated, NEW, deduplicated BUY/SELL (watcher alert gate)
 *     -> executor.executeSignal()            (this file: safety gates + intent)
 *     -> src/engine/mt5Bridge.js             (JSON lines)
 *     -> mt5/mt5_bridge.py                   (thin, non-deciding, own hard guards)
 *     -> Exness MT5 DEMO
 *
 * There is NO second decision path: this module never evaluates market
 * structure, never produces BUY/SELL, never retries a signal it once
 * skipped/rejected, and never reopens merely because a position closed.
 * The next trade requires the watcher to raise a NEW signal_id from a
 * FRESH engine evaluation on a later confirmed candle.
 *
 * Persistence (all under the gitignored state/ directory):
 *   xauusd_mt5_executor_state.json  -- executed-signal ledger, write-ahead
 *                                      intent, open position, daily counters
 *   xauusd_mt5_trade_log.jsonl      -- append-only audit log, one event/line
 *   xauusd_mt5_kill_switch          -- presence = no new entries;
 *                                      content "close" = also close the open
 *                                      MCP position
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  evaluateEntry, evaluateExit, estimateNetPnl, realizedFromDeals, rollDaily, applyClosedTrade,
  rebuildDailyFromDeals, buildOrderComment, signalIdFromComment, utcDay, DEAL_REASON,
  evaluateExecutableGeometry, computeProtectiveStops,
} from './mt5Policy.js';
import { evaluateTradeManagement, isEvidenceFresh, exitStateFor } from './mt5TradeManagement.js';
import { capitalSnapshot } from './mt5CapitalPolicy.js';
import { evaluateShockSignals, advanceShockState, initialShockState, computeSpreadBaseline, evaluateEmergency, SHOCK_PARAMS } from './marketShock.js';
import { runEntryGuards, createNewsGuard, createShockGuard, createFeedHealthGuard, createSpreadGuard, createNormalizationGuard } from './protectionGuards.js';
import { BLOCKING_NEWS_STATES } from './newsRisk.js';

export const DEFAULT_MT5_STATE_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_executor_state.json', import.meta.url));
export const DEFAULT_MT5_LOG_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_trade_log.jsonl', import.meta.url));
export const DEFAULT_KILL_SWITCH_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_kill_switch', import.meta.url));

export const DEFAULT_MT5_STATE = Object.freeze({
  version: 1,
  magic: null,
  executed_signals: {},
  intent: null,
  position: null,
  last_close_at: null,
  daily: null,
  halted: null,
  protection: null, // news/shock protection: { last_block_cleared_at, blocking, blocking_since, block_reasons, ... }
  updated_at: null,
});

export function loadMt5State(path) {
  if (!existsSync(path)) return { ...DEFAULT_MT5_STATE, executed_signals: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { ...DEFAULT_MT5_STATE, executed_signals: {}, ...parsed };
  } catch {
    // A corrupt state file is an unreconcilable state: fail closed for new
    // entries until a human looks (position adoption still works from the
    // broker side on the next start()).
    return { ...DEFAULT_MT5_STATE, executed_signals: {}, halted: { reason: 'STATE_FILE_CORRUPT', at: new Date().toISOString() } };
  }
}

export function saveMt5State(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2) + '\n';
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, payload);
  renameSync(tmp, path);
}

export function appendTradeLog(path, event) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(event) + '\n');
}

export function readTradeLog(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function readKillSwitch(path) {
  if (!existsSync(path)) return { active: false, close: false };
  let raw = '';
  try { raw = readFileSync(path, 'utf8').trim(); } catch { /* presence alone is enough */ }
  return { active: true, close: /close/i.test(raw), raw };
}

const AMBIGUOUS_CODES = new Set(['TRADE_REQUEST_TIMEOUT', 'BRIDGE_DOWN', 'BRIDGE_TIMEOUT', 'BRIDGE_WRITE_FAILED', 'ORDER_SEND_NONE']);

function round2(n) { return n === null || n === undefined ? null : Math.round(Number(n) * 100) / 100; }

export function createMt5Executor({ config, bridge, statePath = DEFAULT_MT5_STATE_PATH, logPath = DEFAULT_MT5_LOG_PATH, killSwitchPath = DEFAULT_KILL_SWITCH_PATH, log = (m) => console.log(m), now, newsMonitor = null, _deps = {} } = {}) {
  // DEMO (resolveExecutorConfig, mode 'demo') or REAL (resolveRealExecutorConfig,
  // mode 'real' AND real_profile marker). Anything else is refused.
  const isReal = config?.mode === 'real' && config?.real_profile === true;
  if (!config || !(config.mode === 'demo' || isReal)) throw new Error('createMt5Executor requires a config resolved by resolveExecutorConfig() (demo) or resolveRealExecutorConfig() (real)');
  const verifiedKey = isReal ? 'real_verified' : 'demo_verified';
  if (!bridge) throw new Error('createMt5Executor requires a bridge');
  const deps = {
    loadState: _deps.loadState ?? loadMt5State,
    saveState: _deps.saveState ?? saveMt5State,
    appendLog: _deps.appendLog ?? appendTradeLog,
    readKillSwitch: _deps.readKillSwitch ?? readKillSwitch,
    setInterval: _deps.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
    clearInterval: _deps.clearInterval ?? ((t) => clearInterval(t)),
    sleep: _deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
  };
  const nowDate = () => (now ? now() : new Date());
  const nowIso = () => nowDate().toISOString();

  let state = null;
  let broker = null; // last hello snapshot (normalised)
  let timer = null;
  let chain = Promise.resolve();
  let started = false;

  // NEWS + VOLATILITY SHOCK PROTECTION (config.newsProtection: REAL profile
  // only; the DEMO config has no such flag and keeps its previous behaviour
  // exactly). Runtime evidence lives in memory (tick samples, confirmed 5m
  // bars, shock/news state); only the block/normalisation bookkeeping is
  // persisted (state.protection) because the fresh-signal rule depends on it.
  const protectionOn = config.newsProtection === true;
  const shockParams = { ...SHOCK_PARAMS, ...(config.shockParams ?? {}) };
  const prot = { samples: [], bars5m: null, bars5m_at: null, shock: initialShockState(), news: null };
  const guards = protectionOn ? [createNewsGuard({ params: config.newsRiskParams }), createShockGuard(), createFeedHealthGuard({ feedStaleSec: shockParams.feedStaleSec }), createSpreadGuard({ params: shockParams }), createNormalizationGuard()] : [];

  const serialize = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  const persist = () => { state.magic = config.magic; deps.saveState(statePath, state); };

  const budgetFields = () => ({
    mode: config.mode,
    lot_size: config.lotSize,
    trade_budget_usd: config.tradeBudgetUsd,
    take_profit_percent: config.takeProfitPercent,
    stop_loss_percent: config.stopLossPercent,
    profit_target_usd: config.profitTargetUsd,
    maximum_loss_usd: config.maximumLossUsd,
    magic: config.magic,
    symbol: config.symbol,
    account_login: broker?.account?.login ?? null,
    account_server: broker?.account?.server ?? null,
  });

  const record = (type, fields = {}) => {
    const event = { timestamp: nowIso(), type, ...budgetFields(), ...fields };
    try { deps.appendLog(logPath, event); } catch (err) { log(`[mt5-executor] audit log write failed: ${err.message}`); }
    log(`[mt5-executor] ${type}${fields.reason ? ` / ${fields.reason}` : ''}${fields.signal_id ? ` signal ${fields.signal_id}` : ''}${fields.ticket ? ` ticket ${fields.ticket}` : ''}`);
    return event;
  };

  const halt = (reason, details = {}) => {
    state.halted = { reason, at: nowIso(), ...details };
    record('HALTED', { reason, ...details });
    persist();
  };

  function normalizeHello(h) {
    return {
      demo_verified: h?.demo_verified === true,
      real_verified: h?.real_verified === true,
      connected: h?.checks?.terminal_connected === true,
      algo_trading_enabled: h?.checks?.terminal_algo_trading_enabled === true,
      checks: h?.checks ?? null, account: h?.account ?? null, terminal: h?.terminal ?? null, symbol: h?.symbol ?? null, expected: h?.expected ?? null,
    };
  }

  const guardParams = () => ({ expected_login: config.login, expected_server: config.server, symbol: config.symbol });

  // ---- protection layer helpers (no-ops unless protectionOn) --------------
  const protectionState = () => {
    state.protection = state.protection ?? { last_block_cleared_at: null, blocking: false, blocking_since: null, block_reasons: [], last_news_state: null, last_shock_state: null };
    return state.protection;
  };
  function ingestSample(t) {
    if (!protectionOn || !t || !Number.isFinite(Number(t.bid)) || !Number.isFinite(Number(t.ask))) return;
    const nowSec = nowDate().getTime() / 1000;
    prot.samples.push({ t: nowSec, tick_time: Number(t.tick_time ?? t.time), bid: Number(t.bid), ask: Number(t.ask), spread: Number.isFinite(Number(t.spread_price)) ? Number(t.spread_price) : Number(t.ask) - Number(t.bid) });
    const cutoff = nowSec - shockParams.sampleWindowSec - 60;
    while (prot.samples.length && prot.samples[0].t < cutoff) prot.samples.shift();
  }
  function newsNow() {
    if (!protectionOn) return null;
    const unavailable = (reason) => ({ state: 'DATA_UNAVAILABLE', reason, event: null, next_event: null, contributing_events: [], calendar: { status: 'ERROR', source: null, freshness: null, error: reason } });
    if (!newsMonitor) return unavailable('NEWS_MONITOR_MISSING');
    try { return newsMonitor.evaluate({ now: nowDate() }); } catch (err) { return unavailable(`NEWS_MONITOR_THREW:${err.message}`); }
  }
  function protectionAuditFields() {
    if (!protectionOn) return {};
    const n = prot.news, s = prot.shock, m = s?.evidence ?? {};
    const ps = state?.protection ?? null;
    return { protection: {
      news_state: n?.state ?? null, news_reason: n?.reason ?? null, event_id: n?.event?.event_id ?? null, event_name: n?.event?.event_name ?? null, currency: n?.event?.currency ?? null, impact: n?.event?.impact ?? null,
      release_time_utc: n?.event?.event_time_utc ?? null, minutes_to_event: n?.event?.minutes_to_event ?? null, actual: n?.event?.actual ?? null, forecast: n?.event?.forecast ?? null, previous: n?.event?.previous ?? null,
      next_event: n?.next_event ?? null, block_ends_utc: n?.block_ends_utc ?? null, provider: n?.calendar?.source ?? null, provider_status: n?.calendar?.status ?? null, provider_freshness: n?.calendar?.freshness ?? null, provider_error: n?.calendar?.error ?? null,
      shock_state: s?.state ?? null, shock_since: s?.since ?? null, shock_triggers: s?.triggers ?? [], shock_last_trigger_at: s?.last_trigger_at ?? null,
      spread: m.spread ?? null, spread_baseline: m.spread_baseline ?? null, spread_ratio: m.spread_ratio ?? null, price_velocity: m.velocity_move ?? null, velocity_atr: m.velocity_atr ?? null, atr: m.atr ?? null, atr_bars: m.atr_bars ?? null,
      range_atr: m.range_atr ?? null, window_range_atr: m.window_range_atr ?? null, jump_atr: m.jump_atr ?? null, quote_age_sec: m.quote_age_sec ?? null, feed_stale: m.feed_stale ?? null,
      blocking: ps?.blocking ?? false, block_reasons: ps?.block_reasons ?? [], blocking_since: ps?.blocking_since ?? null, last_block_cleared_at: ps?.last_block_cleared_at ?? null,
    } };
  }
  /** One protection evaluation: shock-state advance, news state, block/normalise transitions. Every transition is audited. */
  function evaluateProtection() {
    if (!protectionOn || !state) return null;
    const nowSec = nowDate().getTime() / 1000;
    const evaluation = evaluateShockSignals({ samples: prot.samples, bars: prot.bars5m, nowSec, params: shockParams });
    const nextShock = advanceShockState(prot.shock, evaluation, nowSec, shockParams);
    const prevShock = prot.shock.state;
    prot.shock = nextShock;
    if (nextShock.changed) record('SHOCK_STATE_CHANGED', { from: prevShock, to: nextShock.state, reason: nextShock.reason, triggers: nextShock.triggers, since: nextShock.since, ...protectionAuditFields() });
    const news = newsNow();
    prot.news = news;
    if (news?.transition) record('NEWS_STATE_CHANGED', { from: news.transition.from, to: news.transition.to, reason: news.reason, ...protectionAuditFields() });
    const ps = protectionState();
    const newsBlocks = !!news && (BLOCKING_NEWS_STATES.includes(news.state) || (news.state === 'DATA_UNAVAILABLE' && config.newsRiskParams?.dataUnavailablePolicy !== 'ALLOW'));
    const reasons = [...(newsBlocks ? [`NEWS:${news.state}`] : []), ...(nextShock.state === 'VOLATILITY_SHOCK' ? ['VOLATILITY_SHOCK'] : []), ...(evaluation.feed_stale ? ['FEED_STALE'] : [])];
    const blocking = reasons.length > 0;
    if (blocking && !ps.blocking) {
      ps.blocking = true; ps.blocking_since = nowIso(); ps.block_reasons = reasons;
      record('PROTECTION_BLOCK_STARTED', { reasons, entry_allowed: false, open_position_action: 'NONE', ...protectionAuditFields() });
      persist();
    } else if (!blocking && ps.blocking) {
      ps.blocking = false; ps.last_block_cleared_at = nowIso(); const since = ps.blocking_since; ps.blocking_since = null; ps.block_reasons = [];
      record('PROTECTION_NORMALIZED', { cleared_at: ps.last_block_cleared_at, blocking_since: since, entry_allowed: true, note: 'only a signal calculated AFTER cleared_at may execute', ...protectionAuditFields() });
      persist();
    } else if (blocking && JSON.stringify(reasons) !== JSON.stringify(ps.block_reasons)) {
      ps.block_reasons = reasons; persist();
    }
    ps.last_news_state = news?.state ?? null; ps.last_shock_state = nextShock.state;
    return { news, shock: nextShock, evaluation, blocking, reasons };
  }

  async function refreshBroker() {
    const hello = await bridge.request('hello', guardParams());
    broker = normalizeHello(hello);
    return broker;
  }

  async function brokerPositions() {
    const r = await bridge.request('positions', { symbol: config.symbol, magic: config.magic });
    return Array.isArray(r?.positions) ? r.positions : null;
  }

  async function marketTick() {
    const t = await bridge.request('tick', { symbol: config.symbol });
    return { bid: t.bid, ask: t.ask, tick_time: t.time, now_sec: nowDate().getTime() / 1000, spread_price: t.spread_price, spread_points: t.spread_points, digits: t.digits, point: t.point, contract_size: t.contract_size, volume_min: t.volume_min, volume_max: t.volume_max, volume_step: t.volume_step, stops_level: t.stops_level };
  }

  async function dealsForPosition(positionId, { attempts = 5 } = {}) {
    for (let i = 0; i < attempts; i++) {
      const r = await bridge.request('deals', { position_id: positionId });
      const deals = r?.deals ?? [];
      if (deals.some((d) => Number(d.entry) === 1)) return deals; // exit deal present
      if (i < attempts - 1) await deps.sleep(400);
    }
    const r = await bridge.request('deals', { position_id: positionId });
    return r?.deals ?? [];
  }

  function positionRecord({ positionId, signalId, decisionId, side, volume, fill, requestedPrice, openTime, brokerSl, brokerTp, stops, entryDeal, engine, adopted = false, profitTargetUsd = config.profitTargetUsd, maximumLossUsd = config.maximumLossUsd, equityBeforeTrade = null, sizing = null, signalCandleTime = null, initialEffectiveRr = null }) {
    const structuralStop = Number(engine?.structural_stop ?? engine?.engine_sl);
    const initialRisk = Number.isFinite(fill) && Number.isFinite(structuralStop) ? Math.abs(fill - structuralStop) : null;
    return {
      // Adaptive trade management state (PART 9): everything needed to manage
      // the position deterministically, persisted so a restart keeps the thesis.
      signal_candle_time: signalCandleTime, initial_structural_risk: initialRisk == null ? null : round2(initialRisk) ?? initialRisk, initial_effective_rr: initialEffectiveRr,
      best_net_pnl: null, current_confirmed_structure: null, exit_evidence: null,
      adaptive: { last_evaluated_bar_time: null, evaluations: 0, last_state: null, last_reason: null, last_factors: null, progress: null, profit_protect_armed: false, market_context: null },
      ticket: positionId, position_id: positionId, signal_id: signalId, decision_id: decisionId, side, volume,
      open_price: fill, requested_price: requestedPrice ?? null, slippage: requestedPrice != null && fill != null ? round2(Math.abs(fill - requestedPrice)) : null,
      open_time: openTime, broker_sl: brokerSl, broker_tp: brokerTp, stops_meta: stops ?? null,
      // Per-position exit authority: for a dynamically sized (REAL) trade these
      // are THAT trade's own target/loss; for DEMO they equal the fixed config.
      profit_target_usd: profitTargetUsd, maximum_loss_usd: maximumLossUsd,
      equity_before_trade: equityBeforeTrade, sizing: sizing ? { tier: sizing.tier ?? null, approved_lot: sizing.lot ?? null, required_margin_usd: sizing.requiredMarginUsd ?? null, projected_margin_level_at_max_loss_pct: sizing.projectedMarginLevelAtMaxLossPct ?? null, price_envelope: sizing.price_envelope ?? null } : null,
      entry_commission: Number(entryDeal?.commission ?? 0), entry_fee: Number(entryDeal?.fee ?? 0), entry_deal: entryDeal?.ticket ?? null, entry_order: entryDeal?.order ?? null,
      mfe_usd: 0, mae_usd: 0, last_net_pnl: null, last_checked_at: null, adopted, engine: engine ?? null,
    };
  }

  async function finalizeClose({ deals, exitReason, exitSource, brokerResponse = null }) {
    const pos = state.position;
    const realized = realizedFromDeals(deals);
    const exitState = exitStateFor(exitReason);
    // Dynamic scaling audit: equity AFTER the close, read fresh from the broker
    // (observability only; the next trade's sizing reads equity again itself).
    let equityAfterClose = null;
    if (config.mode === 'real' || typeof config.computeSizing === 'function') {
      try { const h = await refreshBroker(); equityAfterClose = h?.account?.equity ?? null; } catch { /* observability only */ }
    }
    const exitDeal = realized.exitDeal;
    const exitTime = exitDeal?.time ? new Date(Number(exitDeal.time) * 1000).toISOString() : nowIso();
    const brokerReason = exitDeal ? (DEAL_REASON[Number(exitDeal.reason)] ?? String(exitDeal.reason)) : null;
    state.daily = applyClosedTrade(rollDaily(state.daily, nowDate()), realized.netPnl);
    state.last_close_at = exitTime;
    if (pos?.signal_id && state.executed_signals[pos.signal_id]) state.executed_signals[pos.signal_id] = { ...state.executed_signals[pos.signal_id], status: 'CLOSED', closed_at: exitTime, net_pnl: realized.netPnl };
    const event = record('CLOSED', {
      signal_id: pos?.signal_id ?? null, decision_id: pos?.decision_id ?? null, ticket: pos?.ticket ?? null, position_id: pos?.position_id ?? null,
      side: pos?.side ?? null, volume: pos?.volume ?? null, open_price: pos?.open_price ?? null, open_time: pos?.open_time ?? null,
      exit_price: exitDeal?.price ?? null, exit_time: exitTime, exit_reason: exitReason, exit_source: exitSource, broker_exit_reason: brokerReason,
      exit_deal: exitDeal?.ticket ?? null, exit_order: exitDeal?.order ?? null, broker_sl: pos?.broker_sl ?? null, broker_tp: pos?.broker_tp ?? null,
      gross_pnl: realized.grossProfit, commission: realized.commission, swap: realized.swap, fee: realized.fee, net_pnl: realized.netPnl,
      realised_pnl: realized.netPnl, equity_before_trade: pos?.equity_before_trade ?? null, equity_after_close: equityAfterClose,
      // PART 10: exit decision audit.
      exit_state: exitState, exit_evidence: pos?.exit_evidence ?? null, adaptive: pos?.adaptive ?? null, best_net_pnl: pos?.best_net_pnl ?? null, initial_structural_risk: pos?.initial_structural_risk ?? null, initial_effective_rr: pos?.initial_effective_rr ?? null,
      thesis_id: pos?.engine?.thesis_id ?? null, model: pos?.engine?.model ?? null, broker_response: brokerResponse,
      capital_after_close: config.mode === 'real' ? capitalSnapshot({ config, account: broker?.account ?? null, market: null }).capital : null,
      approved_lot: pos?.volume ?? null, profit_target_usd: pos?.profit_target_usd ?? config.profitTargetUsd, maximum_loss_usd: pos?.maximum_loss_usd ?? config.maximumLossUsd, sizing: pos?.sizing ?? null,
      mfe_usd: pos?.mfe_usd ?? null, mae_usd: pos?.mae_usd ?? null, engine: pos?.engine ?? null,
      daily_completed: state.daily.completed, daily_realized_net_usd: state.daily.realized_net_usd, daily_consecutive_losses: state.daily.consecutive_losses,
    });
    state.position = null;
    persist();
    return event;
  }

  async function reconcile() {
    state.halted = null; // every start re-evaluates; a persisted halt from a prior run is re-derived below if still true
    const positions = await brokerPositions();
    if (!Array.isArray(positions)) { halt('RECONCILE_FAILED', { detail: 'broker positions unreadable' }); return; }

    // 1. Pending write-ahead intent: did the order we may have sent fill?
    if (state.intent?.status === 'PENDING') {
      const intent = state.intent;
      let deals;
      try {
        const fromTs = Date.parse(intent.created_at) / 1000 - 120;
        const h = await bridge.request('history', { from_ts: fromTs, to_ts: nowDate().getTime() / 1000 + 60, magic: config.magic, symbol: config.symbol });
        deals = h?.deals ?? [];
      } catch (err) {
        halt('RECONCILE_FAILED', { detail: `history unavailable while a PENDING intent exists: ${err.message}`, intent });
        return;
      }
      const entryDeal = deals.find((d) => Number(d.entry) === 0 && signalIdFromComment(d.comment) === intent.signal_id);
      if (entryDeal) {
        const pid = Number(entryDeal.position_id);
        const live = positions.find((p) => Number(p.ticket) === pid);
        state.intent = { ...intent, status: 'RESOLVED_FILLED', resolved_at: nowIso(), position_id: pid };
        state.executed_signals[intent.signal_id] = { status: 'EXECUTED', at: nowIso(), ticket: pid, reconciled: true };
        record('INTENT_RESOLVED', { signal_id: intent.signal_id, decision_id: intent.decision_id, reason: 'FILLED_FOUND_IN_HISTORY', position_id: pid, ticket: pid });
        if (live) {
          state.position = positionRecord({ positionId: pid, signalId: intent.signal_id, decisionId: intent.decision_id, side: intent.side, volume: Number(live.volume), fill: Number(live.price_open), openTime: new Date(Number(live.time) * 1000).toISOString(), brokerSl: live.sl, brokerTp: live.tp, entryDeal, engine: intent.engine ?? null, adopted: true });
        } else if (!state.position) {
          state.position = positionRecord({ positionId: pid, signalId: intent.signal_id, decisionId: intent.decision_id, side: intent.side, volume: Number(entryDeal.volume), fill: Number(entryDeal.price), openTime: new Date(Number(entryDeal.time) * 1000).toISOString(), brokerSl: null, brokerTp: null, entryDeal, engine: intent.engine ?? null, adopted: true });
          const pdeals = await dealsForPosition(pid, { attempts: 1 });
          await finalizeClose({ deals: pdeals, exitReason: 'CLOSED_WHILE_EXECUTOR_DOWN', exitSource: 'RECONCILE' });
        }
      } else {
        state.intent = { ...intent, status: 'ABANDONED', resolved_at: nowIso() };
        state.executed_signals[intent.signal_id] = { status: 'ABANDONED_UNCONFIRMED', at: nowIso() };
        record('INTENT_RESOLVED', { signal_id: intent.signal_id, decision_id: intent.decision_id, reason: 'NO_FILL_FOUND_NEVER_RESENT' });
      }
      persist();
    }

    // 2. Locally-known position vs broker.
    if (state.position) {
      const live = positions.find((p) => Number(p.ticket) === Number(state.position.ticket));
      if (live) {
        state.position.broker_sl = live.sl; state.position.broker_tp = live.tp;
        record('RESUMED_POSITION', { signal_id: state.position.signal_id, ticket: state.position.ticket, side: state.position.side, open_price: state.position.open_price, broker_sl: live.sl, broker_tp: live.tp });
      } else {
        const deals = await dealsForPosition(state.position.position_id, { attempts: 2 });
        if (deals.some((d) => Number(d.entry) === 1)) {
          await finalizeClose({ deals, exitReason: 'CLOSED_WHILE_EXECUTOR_DOWN', exitSource: 'RECONCILE' });
        } else {
          record('ANOMALY', { reason: 'POSITION_MISSING_NO_EXIT_DEAL', ticket: state.position.ticket, signal_id: state.position.signal_id });
          state.position = null;
          halt('RECONCILE_FAILED', { detail: 'locally-known position is gone from the broker but no exit deal was found' });
        }
      }
    }

    // 3. Broker-side MCP-owned positions we do not know about.
    const unknown = positions.filter((p) => !state.position || Number(p.ticket) !== Number(state.position.ticket));
    if (unknown.length > 1 || (unknown.length === 1 && state.position)) {
      halt('MULTIPLE_MCP_POSITIONS', { tickets: positions.map((p) => p.ticket) });
    } else if (unknown.length === 1) {
      const p = unknown[0];
      const signalId = signalIdFromComment(p.comment);
      state.position = positionRecord({ positionId: Number(p.ticket), signalId, decisionId: null, side: Number(p.type) === 0 ? 'BUY' : 'SELL', volume: Number(p.volume), fill: Number(p.price_open), openTime: new Date(Number(p.time) * 1000).toISOString(), brokerSl: p.sl, brokerTp: p.tp, entryDeal: null, adopted: true });
      if (signalId) state.executed_signals[signalId] = { ...(state.executed_signals[signalId] ?? {}), status: 'EXECUTED', ticket: Number(p.ticket), adopted: true, at: nowIso() };
      record('ADOPTED_EXISTING_POSITION', { signal_id: signalId, ticket: p.ticket, side: state.position.side, open_price: state.position.open_price, broker_sl: p.sl, broker_tp: p.tp });
    }

    // 4. Daily counters from broker history (source of truth).
    const day = utcDay(nowDate());
    try {
      const dayStart = Date.parse(`${day}T00:00:00Z`) / 1000;
      const h = await bridge.request('history', { from_ts: dayStart, to_ts: nowDate().getTime() / 1000 + 60, magic: config.magic, symbol: config.symbol });
      const rebuilt = rebuildDailyFromDeals(h?.deals ?? [], day);
      const local = rollDaily(state.daily, nowDate());
      state.daily = rebuilt.completed >= local.completed ? rebuilt : local;
      record('DAILY_REBUILT', { day, completed: state.daily.completed, realized_net_usd: state.daily.realized_net_usd, consecutive_losses: state.daily.consecutive_losses, source: rebuilt.completed >= local.completed ? 'BROKER_HISTORY' : 'LOCAL_STATE' });
    } catch (err) {
      state.daily = rollDaily(state.daily, nowDate());
      record('DAILY_REBUILD_FAILED', { reason: err.message, day, completed: state.daily.completed });
    }
    persist();
  }

  async function start() {
    if (started) return status();
    started = true;
    state = deps.loadState(statePath);
    if (state.halted?.reason === 'STATE_FILE_CORRUPT') record('HALTED', { reason: 'STATE_FILE_CORRUPT' });
    try {
      await refreshBroker();
    } catch (err) {
      halt('BRIDGE_UNAVAILABLE', { detail: err.message });
      return status();
    }
    record('STARTED', { demo_verified: broker.demo_verified, real_verified: broker.real_verified, connected: broker.connected, algo_trading_enabled: broker.algo_trading_enabled, checks: broker.checks, account: broker.account, terminal: { build: broker.terminal?.build, path: broker.terminal?.path }, symbol_spec: broker.symbol });
    if (!broker[verifiedKey]) {
      halt(isReal ? 'REAL_VERIFICATION_FAILED' : 'DEMO_VERIFICATION_FAILED', { checks: broker.checks, account: broker.account ? { login: broker.account.login, server: broker.account.server, trade_mode: broker.account.trade_mode } : null });
      return status();
    }
    if (state.halted?.reason === 'STATE_FILE_CORRUPT') return status();
    try {
      await reconcile();
    } catch (err) {
      halt('RECONCILE_FAILED', { detail: err.message });
    }
    // NEWS + SHOCK protection: one forced calendar refresh at start (bounded by
    // the provider timeout; failure => DATA_UNAVAILABLE, explicit and audited).
    if (protectionOn && !state.halted) {
      if (newsMonitor) { try { await newsMonitor.refresh({ now: nowDate(), force: true }); } catch (err) { log(`[mt5-executor] news refresh at start failed: ${err.message}`); } }
      try { evaluateProtection(); } catch (err) { log(`[mt5-executor] protection evaluation at start failed: ${err.message}`); }
      record('PROTECTION_STARTED', { news_provider: newsMonitor?.status?.().provider ?? null, calendar: newsMonitor?.status?.().calendar ?? null, news_params: config.newsRiskParams ?? null, shock_params: shockParams, ...protectionAuditFields() });
    }
    if (config.monitorIntervalMs > 0) timer = deps.setInterval(() => { monitorOnce().catch(() => {}); }, config.monitorIntervalMs);
    return status();
  }

  function engineMeta(result, alert) {
    return {
      engine_entry: alert?.entry ?? result?.entry ?? null, engine_sl: alert?.sl ?? null, engine_tp1: alert?.tp1 ?? null, engine_tp2: alert?.tp2 ?? null, engine_rr: alert?.rr ?? null,
      // PART 2: the ORIGINAL thesis, persisted so it stays meaningful after entry.
      thesis_id: result?.signal?.thesis_id ?? null, direction: alert?.action ?? result?.action ?? null, model: alert?.setup ?? result?.setup ?? null,
      planned_entry: alert?.entry ?? result?.entry ?? null, structural_stop: alert?.sl ?? null, setup_level: result?.diagnostics?.candidate?.anchor ?? null, objective: result?.diagnostics?.objective ?? null,
      quality: alert?.quality ?? null, setup: alert?.setup ?? null, timeframe: alert?.timeframe ?? null, regime: result?.regime ?? null,
      correction_state: result?.correction_state ?? null, confirmation_state: result?.confirmation_state ?? null, calculated_at: result?.calculated_at ?? alert?.time ?? null,
      wait_reason: result?.reason ?? null, schema_version: result?.schema_version ?? null,
    };
  }

  /** Called by the watcher's alert gate. Never throws. */
  function executeSignal({ alert, signalId, result } = {}) {
    return serialize(async () => {
      if (!started || !state) return { executed: false, reason: 'EXECUTOR_NOT_STARTED' };
      const decisionId = randomUUID();
      const meta = engineMeta(result, alert);
      const signal = { signal_id: signalId ?? result?.signal?.signal_id ?? null, action: alert?.action ?? result?.action ?? null, entry: alert?.entry ?? result?.entry ?? null, calculated_at: meta.calculated_at };
      const base = { signal_id: signal.signal_id, decision_id: decisionId, action: signal.action, ...meta };

      let killSwitch, positions = null, market = null;
      try {
        killSwitch = deps.readKillSwitch(killSwitchPath);
        await refreshBroker(); // fresh demo verification before every trade-changing operation
        positions = await brokerPositions();
        market = await marketTick();
      } catch (err) {
        const ev = record('SKIPPED', { ...base, reason: 'BROKER_QUERY_FAILED', detail: err.message });
        if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: 'BROKER_QUERY_FAILED', at: ev.timestamp }; persist(); }
        return { executed: false, reason: 'BROKER_QUERY_FAILED' };
      }

      // Gate precedence is unchanged: halt, kill switch, account verification,
      // connectivity, pending intent, dedup, freshness, one-position, daily
      // breakers, quote, spread, drift -- all evaluated FIRST on the baseline
      // config. Only a signal that passes every gate is then sized.
      let verdict = evaluateEntry({ config, state, signal, market, broker, brokerPositions: positions, killSwitch, now: nowDate() });
      if (!verdict.allowed) {
        const ev = record('SKIPPED', { ...base, reason: verdict.reason, details: verdict.details, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price, entry_drift: verdict.details?.drift ?? null });
        if (signal.signal_id && verdict.reason !== 'DUPLICATE_SIGNAL') { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: verdict.reason, at: ev.timestamp }; persist(); }
        return { executed: false, reason: verdict.reason, details: verdict.details };
      }

      // NEWS + VOLATILITY SHOCK PROTECTION gates (REAL profile). The live tick
      // just read is also a detector sample; the guards then judge the news
      // state, the shock state, feed health, the RELATIVE spread (on top of the
      // absolute max already applied above) and normalisation freshness (a
      // signal calculated before the last block cleared is never replayed).
      // Any block is a SKIPPED carrying the full protection audit. Nothing here
      // touches an open position.
      let protection = null;
      if (protectionOn) {
        ingestSample(market);
        const pe = evaluateProtection();
        const spreadBaseline = computeSpreadBaseline(prot.samples, nowDate().getTime() / 1000, shockParams).baseline;
        const g = runEntryGuards(guards, { now: nowDate(), signal, market, news: pe.news, shock: pe.shock, spreadBaseline, protection: state.protection });
        protection = { ...protectionAuditFields().protection, spread_gate: g.results.spread?.details ?? null, guards: Object.fromEntries(Object.entries(g.results).map(([k, v]) => [k, { allowed: v.allowed, reason: v.reason }])) };
        if (!g.allowed) {
          const ev = record('SKIPPED', { ...base, reason: g.reason, guard: g.guard, details: g.details, entry_allowed: false, open_position_action: 'NONE', protection, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price });
          if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: g.reason, at: ev.timestamp }; persist(); }
          return { executed: false, reason: g.reason, details: g.details };
        }
      }

      // DYNAMIC CAPITAL SCALING (REAL profile, src/engine/mt5RealScaling.js):
      // CURRENT equity -> tier -> lot -> that trade's target/max loss -> broker
      // safety, before EVERY new trade. Absent for DEMO (fixed config). A lot
      // is only ever stepped DOWN; an unsafe sizing skips the signal. The sized
      // lot is re-validated against the live symbol spec and the config cap.
      let effective = config;
      let sizing = null;
      if (typeof config.computeSizing === 'function') {
        sizing = config.computeSizing({ account: broker.account, market, config });
        if (!sizing?.approved) {
          const ev = record('SKIPPED', { ...base, reason: 'SIZING_UNSAFE', details: sizing, equity_before_trade: broker.account?.equity ?? null, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price });
          if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: 'SIZING_UNSAFE', at: ev.timestamp }; persist(); }
          return { executed: false, reason: 'SIZING_UNSAFE', details: sizing };
        }
        effective = { ...config, lotSize: sizing.lot, profitTargetUsd: sizing.profitTargetUsd, maximumLossUsd: sizing.maximumLossUsd };
        verdict = evaluateEntry({ config: effective, state, signal, market, broker, brokerPositions: positions, killSwitch, now: nowDate() });
        if (!verdict.allowed) {
          const ev = record('SKIPPED', { ...base, reason: verdict.reason, details: { ...verdict.details, sizing }, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price });
          if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: verdict.reason, at: ev.timestamp }; persist(); }
          return { executed: false, reason: verdict.reason, details: verdict.details };
        }
      }
      const sizingFields = sizing ? {
        equity_before_trade: sizing.equity, sizing_tier: sizing.tier, price_envelope: sizing.price_envelope, approved_lot: sizing.lot,
        lot_size: sizing.lot, profit_target_usd: sizing.profitTargetUsd, maximum_loss_usd: sizing.maximumLossUsd,
        required_margin_usd: sizing.requiredMarginUsd, margin_pct_of_equity: sizing.marginPctOfEquity, projected_margin_level_at_max_loss_pct: sizing.projectedMarginLevelAtMaxLossPct, sizing_step_downs: sizing.step_downs, sizing_ceiling_applied: sizing.ceiling_applied ?? null,
      } : {};

      const side = signal.action;
      const requestedPrice = verdict.details.live_price;

      // PART 1: the REAL lot is user-fixed. Any other volume is refused here
      // (and again, independently, inside the python bridge). Never adjusted.
      if (config.exactLot != null && Math.abs(Number(effective.lotSize) - Number(config.exactLot)) > 1e-9) {
        const ev = record('SKIPPED', { ...base, reason: 'LOT_NOT_USER_APPROVED', details: { requested_lot: effective.lotSize, user_lot: config.exactLot } });
        if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: 'LOT_NOT_USER_APPROVED', at: ev.timestamp }; persist(); }
        return { executed: false, reason: 'LOT_NOT_USER_APPROVED' };
      }
      // PART 1.7/1.8: margin/stop-out safety is a VETO at the fixed lot -- never a resize.
      let safety = null;
      if (typeof config.assessSafety === 'function') {
        safety = config.assessSafety({ account: broker.account, market, lot: effective.lotSize, profitTargetUsd: effective.profitTargetUsd, maximumLossUsd: effective.maximumLossUsd });
        if (!safety?.executable) {
          const ev = record('SKIPPED', { ...base, reason: 'MARGIN_SAFETY_VETO', details: safety, equity_before_trade: broker.account?.equity ?? null, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price });
          if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: 'MARGIN_SAFETY_VETO', at: ev.timestamp }; persist(); }
          return { executed: false, reason: 'MARGIN_SAFETY_VETO', details: safety };
        }
      }
      // PART 9: executable geometry at the live price (structural risk/reward/RR at bid/ask, not at the confirmed close).
      const preGeometry = evaluateExecutableGeometry({ side, price: requestedPrice, engineSl: meta.structural_stop, engineTp2: meta.engine_tp2, minRr: config.minEffectiveRr ?? null });
      if (config.minEffectiveRr != null && !preGeometry.valid) {
        const ev = record('SKIPPED', { ...base, reason: 'EXECUTABLE_GEOMETRY_INVALID', details: preGeometry, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price, entry_drift: verdict.details.drift });
        if (signal.signal_id) { state.executed_signals[signal.signal_id] = { status: 'SKIPPED', reason: 'EXECUTABLE_GEOMETRY_INVALID', at: ev.timestamp }; persist(); }
        return { executed: false, reason: 'EXECUTABLE_GEOMETRY_INVALID', details: preGeometry };
      }
      const stopsFor = (px) => computeProtectiveStops({ side, fillPrice: px, lot: effective.lotSize, contractSize: market.contract_size, digits: market.digits, profitTargetUsd: effective.profitTargetUsd, maximumLossUsd: effective.maximumLossUsd, estimatedRoundTripCommissionUsd: 2 * config.estimatedCommissionPerSideUsd, brokerTakeProfit: config.brokerTakeProfit, structuralStop: meta.structural_stop, plannedEntry: meta.planned_entry, structuralMultiple: config.brokerStructuralSlMultiple ?? null, spread: market.spread_price, stopsLevelPrice: (Number(market.stops_level) || 0) * (Number(market.point) || 0.001) });
      const stops = stopsFor(requestedPrice);

      // Write-ahead intent: persisted BEFORE order_send so a crash in the
      // send window can never lead to a second send (reconcile() resolves it).
      state.intent = { intent_id: randomUUID(), decision_id: decisionId, signal_id: signal.signal_id, side, status: 'PENDING', created_at: nowIso(), requested_price: requestedPrice, sl: stops.sl, tp: stops.tp, volume: effective.lotSize, profit_target_usd: effective.profitTargetUsd, maximum_loss_usd: effective.maximumLossUsd, engine: meta };
      state.executed_signals[signal.signal_id] = { status: 'INTENT', at: state.intent.created_at, decision_id: decisionId };
      persist();
      record('INTENT', { ...base, ...sizingFields, side, entry_allowed: true, protection, requested_price: requestedPrice, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price, entry_drift: verdict.details.drift, broker_sl: stops.sl, broker_tp: stops.tp, stops_meta: stops, executable_geometry: preGeometry, margin_safety: safety, thesis: { thesis_id: meta.thesis_id, model: meta.model, direction: meta.direction, planned_entry: meta.planned_entry, structural_stop: meta.structural_stop, setup_level: meta.setup_level, quality: meta.quality, rr: meta.engine_rr, timeframe: meta.timeframe } });

      let opened;
      try {
        opened = await bridge.request('open', { ...guardParams(), side, volume: effective.lotSize, sl: stops.sl, tp: stops.tp, deviation: config.deviationPoints, magic: config.magic, comment: buildOrderComment(signal.signal_id) });
      } catch (err) {
        if (AMBIGUOUS_CODES.has(err.code)) {
          // The order MAY have reached the server. Never resend; fail closed until a restart reconciles it against history.
          record('ORDER_AMBIGUOUS', { ...base, side, reason: err.code, detail: err.message });
          halt('AMBIGUOUS_ORDER_STATE', { signal_id: signal.signal_id, code: err.code });
          return { executed: false, reason: 'AMBIGUOUS_ORDER_STATE' };
        }
        state.intent = { ...state.intent, status: 'REJECTED', resolved_at: nowIso(), error: { code: err.code, message: err.message } };
        state.executed_signals[signal.signal_id] = { status: 'REJECTED', reason: err.code ?? 'ORDER_ERROR', at: nowIso() };
        persist();
        record('REJECTED', { ...base, side, reason: err.code ?? 'ORDER_ERROR', detail: err.message, broker_result: err.extra?.result ?? null, order_check: err.extra?.order_check ?? null, guard_checks: err.extra?.checks ?? null });
        return { executed: false, reason: err.code ?? 'ORDER_ERROR' };
      }

      const fill = Number(opened.result?.price ?? opened.entry_deal?.price ?? requestedPrice);
      const positionId = Number(opened.position_id);
      const openTime = opened.entry_deal?.time ? new Date(Number(opened.entry_deal.time) * 1000).toISOString() : nowIso();
      const fillGeometry = evaluateExecutableGeometry({ side, price: fill, engineSl: meta.structural_stop, engineTp2: meta.engine_tp2, minRr: config.minEffectiveRr ?? null });
      state.position = positionRecord({ positionId, signalId: signal.signal_id, decisionId, side, volume: Number(opened.result?.volume ?? effective.lotSize), fill, requestedPrice, openTime, brokerSl: opened.position?.sl ?? stops.sl, brokerTp: opened.position?.tp ?? stops.tp, stops, entryDeal: opened.entry_deal, engine: meta, profitTargetUsd: effective.profitTargetUsd, maximumLossUsd: effective.maximumLossUsd, equityBeforeTrade: sizing?.equity ?? broker.account?.equity ?? null, sizing, signalCandleTime: result?.market_data_times?.[meta.timeframe ?? '5m'] ?? null, initialEffectiveRr: fillGeometry.rr ?? null });
      state.intent = { ...state.intent, status: 'FILLED', resolved_at: nowIso(), position_id: positionId };
      state.executed_signals[signal.signal_id] = { status: 'EXECUTED', at: nowIso(), ticket: positionId, decision_id: decisionId };
      persist();
      const capitalAtOpen = config.mode === 'real' ? capitalSnapshot({ config, account: broker.account, market, position: state.position }) : null;
      record('OPENED', { ...base, ...sizingFields, side, ticket: positionId, protection, capital: capitalAtOpen, initial_structural_risk: state.position.initial_structural_risk, initial_effective_rr: state.position.initial_effective_rr, signal_candle_time: state.position.signal_candle_time, position_id: positionId, mt5_order_id: opened.result?.order ?? null, deal_id: opened.result?.deal ?? null, requested_price: requestedPrice, execution_price: fill, slippage: state.position.slippage, live_bid: market.bid, live_ask: market.ask, spread: market.spread_price, entry_drift: verdict.details.drift, broker_sl: state.position.broker_sl, broker_tp: state.position.broker_tp, entry_commission: state.position.entry_commission, retcode: opened.result?.retcode ?? null, broker_comment: opened.result?.comment ?? null });

      // Re-align the fail-safe stops to the REAL fill if it slipped.
      if (Number.isFinite(fill) && Math.abs(fill - requestedPrice) >= (market.point ?? 0.001)) {
        try {
          const realigned = stopsFor(fill);
          await bridge.request('modify', { ...guardParams(), ticket: positionId, magic: config.magic, sl: realigned.sl, tp: realigned.tp });
          state.position.broker_sl = realigned.sl; state.position.broker_tp = realigned.tp; state.position.stops_meta = realigned;
          persist();
          record('STOPS_REALIGNED', { ...base, ticket: positionId, execution_price: fill, broker_sl: realigned.sl, broker_tp: realigned.tp });
        } catch (err) {
          record('STOPS_REALIGN_FAILED', { ...base, ticket: positionId, reason: err.code ?? 'MODIFY_ERROR', detail: err.message, broker_sl: state.position.broker_sl, broker_tp: state.position.broker_tp });
        }
      }
      // PART 9 (after fill): if the broker fill itself made the geometry invalid, close through the governed path.
      if (config.minEffectiveRr != null && Number.isFinite(fill)) {
        const postGeometry = evaluateExecutableGeometry({ side, price: fill, engineSl: meta.structural_stop, engineTp2: meta.engine_tp2, minRr: config.minEffectiveRr });
        if (!postGeometry.valid) {
          record('FILL_GEOMETRY_INVALID', { ...base, ticket: positionId, execution_price: fill, details: postGeometry });
          try {
            await closeNow({ reason: 'FILL_GEOMETRY_INVALID', source: 'POST_FILL_CHECK' });
            return { executed: true, reason: 'OPENED_THEN_CLOSED_FILL_GEOMETRY_INVALID', ticket: positionId, decision_id: decisionId, details: postGeometry };
          } catch (err) {
            record('CLOSE_FAILED', { ...base, ticket: positionId, reason: err.code ?? 'CLOSE_ERROR', detail: err.message });
          }
        }
      }
      return { executed: true, reason: 'OPENED', ticket: positionId, decision_id: decisionId };
    });
  }

  /**
   * The ONLY path that sends a close. Idempotent across authorities (P&L
   * monitor, adaptive manager, fast safety monitor, kill switch, manual CLI):
   * every caller runs inside serialize(), re-checks state.position first, and
   * a close that was already requested (possibly with an ambiguous outcome) is
   * never blindly re-sent -- the broker's deals are consulted first.
   */
  async function closeNow({ reason, source }) {
    const pos = state.position;
    if (pos.close_requested) {
      const prior = await dealsForPosition(pos.position_id, { attempts: 1 });
      if (prior.some((d) => Number(d.entry) === 1)) {
        return finalizeClose({ deals: prior, exitReason: pos.close_requested.reason, exitSource: pos.close_requested.source, brokerResponse: { closed_by_prior_request: pos.close_requested, superseded_request: { reason, source } } });
      }
      record('CLOSE_RETRY', { signal_id: pos.signal_id, ticket: pos.ticket, prior_request: pos.close_requested, reason, source, note: 'prior close request left no exit deal at the broker; sending once more' });
    }
    pos.close_requested = { reason, source, at: nowIso() };
    persist();
    const closed = await bridge.request('close', { ...guardParams(), ticket: pos.ticket, magic: config.magic, deviation: config.deviationPoints, comment: `MCP close ${reason}`.slice(0, 31) });
    if (closed?.already_closed) {
      const deals = await dealsForPosition(pos.position_id);
      return finalizeClose({ deals, exitReason: 'CLOSED_BY_BROKER_BEFORE_OUR_CLOSE', exitSource: source, brokerResponse: closed });
    }
    const deals = await dealsForPosition(pos.position_id);
    return finalizeClose({ deals, exitReason: reason, exitSource: source, brokerResponse: closed?.result ?? closed ?? null });
  }

  /** One monitor pass: actual-P&L exit authority for the open MCP position. Never throws. */
  function monitorOnce() {
    return serialize(async () => {
      if (!started || !state) return { action: 'NOT_STARTED' };
      // FAST SAFETY MONITOR (protection layer): every pass samples the live
      // tick -- also while FLAT, so the spread/velocity baselines exist before
      // the next entry -- and advances the shock/news states (audited).
      let tick = null;
      if (protectionOn) {
        try { tick = await marketTick(); ingestSample(tick); } catch (err) { log(`[mt5-executor] monitor: tick unavailable (${err.message})`); }
        try { evaluateProtection(); } catch (err) { log(`[mt5-executor] protection evaluation failed: ${err.message}`); }
      }
      if (!state.position) return { action: 'NO_POSITION', shock_state: prot.shock?.state ?? null, news_state: prot.news?.state ?? null };
      const pos = state.position;
      let positions, killSwitch;
      try {
        killSwitch = deps.readKillSwitch(killSwitchPath);
        positions = await brokerPositions();
      } catch (err) {
        log(`[mt5-executor] monitor: broker unreadable (${err.message}) -- broker-side SL/TP remain in force`);
        return { action: 'MONITOR_UNAVAILABLE' };
      }
      if (!Array.isArray(positions)) return { action: 'MONITOR_UNAVAILABLE' };
      const live = positions.find((p) => Number(p.ticket) === Number(pos.ticket));
      if (!live) {
        let deals = [];
        try { deals = await dealsForPosition(pos.position_id); } catch (err) { log(`[mt5-executor] deals unavailable after broker-side close: ${err.message}`); }
        if (!deals.some((d) => Number(d.entry) === 1)) {
          record('ANOMALY', { reason: 'POSITION_GONE_NO_EXIT_DEAL_YET', ticket: pos.ticket, signal_id: pos.signal_id });
          return { action: 'AWAITING_EXIT_DEAL' };
        }
        const brokerReason = DEAL_REASON[Number(realizedFromDeals(deals).exitDeal?.reason)] ?? 'UNKNOWN';
        // A position that vanished after OUR close request (deal reason EXPERT) keeps our reason; SL/TP/SO stay the broker's.
        const ours = pos.close_requested && brokerReason === 'EXPERT';
        await finalizeClose({ deals, exitReason: ours ? pos.close_requested.reason : `BROKER_${brokerReason}`, exitSource: ours ? pos.close_requested.source : 'BROKER', brokerResponse: ours ? { closed_by_prior_request: pos.close_requested } : null });
        return { action: ours ? 'CLOSED_BY_PRIOR_REQUEST' : 'CLOSED_BY_BROKER' };
      }
      const netPnl = estimateNetPnl({ grossProfit: Number(live.profit), swap: Number(live.swap ?? 0), entryCommission: pos.entry_commission ?? 0, entryFee: pos.entry_fee ?? 0 });
      pos.last_net_pnl = netPnl; pos.last_checked_at = nowIso();
      if (Number(live.sl) > 0 || pos.broker_sl == null) pos.broker_sl = live.sl;
      pos.broker_tp = live.tp;
      if (netPnl > (pos.mfe_usd ?? 0)) pos.mfe_usd = netPnl;
      if (netPnl < (pos.mae_usd ?? 0)) pos.mae_usd = netPnl;
      if (pos.best_net_pnl == null || netPnl > pos.best_net_pnl) pos.best_net_pnl = netPnl;
      // EMERGENCY (risk protection ONLY, protection layer): the broker
      // protective SL must exist at all times (restore it if it is missing),
      // and a market already beyond the broker SL while the position is still
      // open is closed through the governed path. Spread expansion alone, a
      // stale feed or a shock state NEVER close a position here; strategy exits
      // stay with the adaptive manager on confirmed candles.
      if (protectionOn && tick) {
        const em = evaluateEmergency({ position: pos, live, tick, params: shockParams });
        if (em.action === 'RESTORE_SL') {
          const lastTry = Date.parse(pos.sl_restore_attempted_at ?? '');
          if (!Number.isFinite(lastTry) || nowDate().getTime() - lastTry >= 60_000) {
            pos.sl_restore_attempted_at = nowIso(); persist();
            record('EMERGENCY_SL_RESTORE', { signal_id: pos.signal_id, ticket: pos.ticket, reason: em.reason, evidence: em.evidence, open_position_action: 'RESTORE_SL', ...protectionAuditFields() });
            try {
              const r = await bridge.request('modify', { ...guardParams(), ticket: pos.ticket, magic: config.magic, sl: pos.broker_sl, tp: pos.broker_tp });
              record('EMERGENCY_SL_RESTORED', { signal_id: pos.signal_id, ticket: pos.ticket, broker_sl: pos.broker_sl, broker_tp: pos.broker_tp, broker_response: r?.result ?? r ?? null });
            } catch (err) {
              record('EMERGENCY_SL_RESTORE_FAILED', { signal_id: pos.signal_id, ticket: pos.ticket, reason: err.code ?? 'MODIFY_ERROR', detail: err.message, note: 'monetary monitor and kill switch remain in force' });
            }
          }
        } else if (em.action === 'CLOSE') {
          record('CLOSE_TRIGGERED', { signal_id: pos.signal_id, decision_id: pos.decision_id, ticket: pos.ticket, reason: 'EMERGENCY_BROKER_BOUNDARY_BREACHED', source: 'FAST_SAFETY_MONITOR', evidence: em.evidence, open_position_action: 'CLOSE', net_pnl: netPnl, price_current: live.price_current, mfe_usd: pos.mfe_usd, mae_usd: pos.mae_usd, ...protectionAuditFields() });
          try {
            await refreshBroker();
            await closeNow({ reason: 'EMERGENCY_BROKER_BOUNDARY_BREACHED', source: 'FAST_SAFETY_MONITOR' });
            return { action: 'CLOSED', reason: 'EMERGENCY_BROKER_BOUNDARY_BREACHED', net_pnl: netPnl };
          } catch (err) {
            record('CLOSE_FAILED', { signal_id: pos.signal_id, ticket: pos.ticket, reason: err.code ?? 'CLOSE_ERROR', detail: err.message, net_pnl: netPnl, source: 'FAST_SAFETY_MONITOR' });
            return { action: 'CLOSE_FAILED', reason: err.code ?? 'CLOSE_ERROR' };
          }
        }
      }
      const verdict = evaluateExit({ netPnl, profitTargetUsd: pos.profit_target_usd ?? config.profitTargetUsd, maximumLossUsd: pos.maximum_loss_usd ?? config.maximumLossUsd, killSwitch });
      persist();
      if (!verdict.close) return { action: 'HOLD', net_pnl: netPnl };
      record('CLOSE_TRIGGERED', { signal_id: pos.signal_id, decision_id: pos.decision_id, ticket: pos.ticket, reason: verdict.reason, net_pnl: netPnl, gross_pnl: Number(live.profit), swap: Number(live.swap ?? 0), price_current: live.price_current, mfe_usd: pos.mfe_usd, mae_usd: pos.mae_usd });
      try {
        await refreshBroker();
        await closeNow({ reason: verdict.reason, source: 'MONITOR' });
        return { action: 'CLOSED', reason: verdict.reason, net_pnl: netPnl };
      } catch (err) {
        record('CLOSE_FAILED', { signal_id: pos.signal_id, ticket: pos.ticket, reason: err.code ?? 'CLOSE_ERROR', detail: err.message, net_pnl: netPnl });
        return { action: 'CLOSE_FAILED', reason: err.code ?? 'CLOSE_ERROR' };
      }
    });
  }

  /**
   * PART 3/4 -- post-entry thesis review on CONFIRMED evidence (called by the
   * watcher with each new confirmed-candle analysis, BEFORE the alert path).
   * Structural invalidation is an exit authority in its own right: it never
   * waits for the monetary max-loss. Never throws. No-op unless config.thesisExit.
   */
  /**
   * ADAPTIVE TRADE MANAGEMENT (src/engine/mt5TradeManagement.js), called by
   * the watcher with each new confirmed-candle analysis BEFORE the alert path.
   * Evaluates, in order: structural/thesis invalidation, profit protection,
   * thesis deterioration -- each on CONFIRMED evidence only. Stale evidence is
   * never used (logged, HOLD). Each confirmed bar is evaluated at most once,
   * so duplicate deliveries can never duplicate a close. Never throws.
   */
  function reviewThesis({ result } = {}) {
    return serialize(async () => {
      if (!started || !state) return { action: 'NO_POSITION' };
      // Protection layer: the confirmed 5m bars of every cycle (position or
      // not) are the ATR/range baseline of the shock detector. Evidence only.
      if (protectionOn && Array.isArray(result?.primary_confirmed_bars) && result.primary_confirmed_bars.length) { prot.bars5m = result.primary_confirmed_bars; prot.bars5m_at = nowIso(); }
      if (!state.position) return { action: 'NO_POSITION' };
      if (config.thesisExit !== true) return { action: 'THESIS_REVIEW_DISABLED' };
      const pos = state.position;
      pos.adaptive = pos.adaptive ?? { last_evaluated_bar_time: null, evaluations: 0, last_state: null, last_reason: null, last_factors: null, progress: null, profit_protect_armed: false, market_context: null };
      const bars = Array.isArray(result?.primary_confirmed_bars) ? result.primary_confirmed_bars : null;
      const lastBarTime = bars?.at(-1)?.time ?? null;
      const fresh = isEvidenceFresh({ result, now: nowDate() });
      if (!fresh.fresh) {
        if (pos.adaptive.last_stale_bar_time !== lastBarTime) { pos.adaptive.last_stale_bar_time = lastBarTime; persist(); record('ADAPTIVE_EVIDENCE_STALE', { signal_id: pos.signal_id, ticket: pos.ticket, reason: fresh.reason, details: fresh, note: 'stale evidence never drives an adaptive exit; broker SL/TP and the P&L monitor remain in force' }); }
        return { action: 'THESIS_HOLD', reason: fresh.reason, state: 'HOLD' };
      }
      if (lastBarTime != null && pos.adaptive.last_evaluated_bar_time === lastBarTime) return { action: 'THESIS_HOLD', reason: 'ALREADY_EVALUATED_BAR', state: 'HOLD' };

      const verdict = evaluateTradeManagement({ position: pos, result });
      const context = { bar_time: lastBarTime, regime_5m: result?.evidence?.regime ?? result?.regime ?? null, structure_5m: result?.evidence?.structure?.state ?? null, last_event_5m: result?.evidence?.structure?.lastEvent ? { type: result.evidence.structure.lastEvent.type, direction: result.evidence.structure.lastEvent.direction, level: result.evidence.structure.lastEvent.level } : null, bias_15m: result?.bias?.direction ?? null, regime_15m: result?.bias?.regime ?? null, engine_action: result?.action ?? null };
      pos.adaptive = { ...pos.adaptive, last_evaluated_bar_time: lastBarTime, evaluations: (pos.adaptive.evaluations ?? 0) + 1, last_state: verdict.state, last_reason: verdict.reason, last_factors: verdict.evidence?.factors ?? null, progress: verdict.evidence?.progress ?? null, profit_protect_armed: !!(pos.adaptive.profit_protect_armed || (verdict.evidence?.progress?.progress_r ?? 0) >= 1.0), market_context: context };
      pos.current_confirmed_structure = result?.evidence?.structure ? { state: result.evidence.structure.state ?? null, last_event: context.last_event_5m } : null;
      pos.last_evaluated_bar_time = lastBarTime;
      persist();
      if (verdict.state === 'HOLD') return { action: 'THESIS_HOLD', reason: verdict.reason, state: 'HOLD', factors: verdict.evidence?.factors ?? null };

      const isInvalidation = verdict.state === 'THESIS_INVALIDATION_CLOSE';
      pos.exit_evidence = { state: verdict.state, reason: verdict.reason, trigger: verdict.trigger ?? null, evidence: verdict.evidence ?? null, market_context: context, at: nowIso() };
      persist();
      record(isInvalidation ? 'THESIS_INVALIDATED' : 'ADAPTIVE_EXIT_TRIGGERED', { signal_id: pos.signal_id, decision_id: pos.decision_id, ticket: pos.ticket, exit_state: verdict.state, reason: verdict.reason, trigger: verdict.trigger ?? null, details: verdict.evidence ?? null, market_context: context, net_pnl: pos.last_net_pnl ?? null, mfe_usd: pos.mfe_usd ?? null, mae_usd: pos.mae_usd ?? null, thesis: { thesis_id: pos.engine?.thesis_id ?? null, model: pos.engine?.model ?? null, structural_stop: pos.engine?.structural_stop ?? null, setup_level: pos.engine?.setup_level ?? null } });
      try {
        await refreshBroker();
        await closeNow({ reason: verdict.reason, source: isInvalidation ? 'THESIS_MONITOR' : 'ADAPTIVE_MONITOR' });
        return { action: 'CLOSED', state: verdict.state, reason: verdict.reason };
      } catch (err) {
        record('CLOSE_FAILED', { signal_id: pos.signal_id, ticket: pos.ticket, reason: err.code ?? 'CLOSE_ERROR', detail: err.message, exit_state: verdict.state, thesis_reason: verdict.reason });
        return { action: 'CLOSE_FAILED', state: verdict.state, reason: err.code ?? 'CLOSE_ERROR', thesis_reason: verdict.reason };
      }
    });
  }

  /** Manual close of the MCP-owned position (CLI). Demo guard applies inside the bridge too. */
  function closePosition({ reason = 'MANUAL' } = {}) {
    return serialize(async () => {
      if (!started || !state?.position) return { closed: false, reason: 'NO_POSITION' };
      const pos = state.position;
      try {
        await refreshBroker();
        const ev = await closeNow({ reason, source: 'MANUAL' });
        return { closed: true, ticket: pos.ticket, net_pnl: ev.net_pnl, exit_reason: ev.exit_reason };
      } catch (err) {
        record('CLOSE_FAILED', { signal_id: pos.signal_id, ticket: pos.ticket, reason: err.code ?? 'CLOSE_ERROR', detail: err.message });
        return { closed: false, reason: err.code ?? 'CLOSE_ERROR', detail: err.message };
      }
    });
  }

  function status() {
    return {
      mode: config.mode,
      started,
      config: { login: config.login, server: config.server, symbol: config.symbol, magic: config.magic, sizing_mode: config.sizingMode ?? 'fixed', exact_lot: config.exactLot ?? null, thesis_exit: config.thesisExit === true, adaptive_management: config.thesisExit === true, exit_states: config.thesisExit === true ? ['HOLD', 'THESIS_INVALIDATION_CLOSE', 'THESIS_DETERIORATION_CLOSE', 'PROFIT_PROTECT_CLOSE', 'MONETARY_PROFIT_CLOSE', 'MONETARY_MAX_LOSS_CLOSE', 'BROKER_PROTECTIVE_CLOSE', 'EMERGENCY_CLOSE'] : null, min_effective_rr: config.minEffectiveRr ?? null, broker_structural_sl_multiple: config.brokerStructuralSlMultiple ?? null, lot_size: config.lotSize, max_lot_size: config.maxLotSize, trade_budget_usd: config.tradeBudgetUsd, take_profit_percent: config.takeProfitPercent, stop_loss_percent: config.stopLossPercent, profit_target_usd: config.profitTargetUsd, maximum_loss_usd: config.maximumLossUsd, max_entry_drift_usd: config.maxEntryDriftUsd, max_spread_usd: config.maxSpreadUsd, deviation_points: config.deviationPoints, max_trades_per_day: config.maxTradesPerDay, daily_loss_limit_usd: config.dailyLossLimitUsd, max_consecutive_losses: config.maxConsecutiveLosses, broker_take_profit: config.brokerTakeProfit, monitor_interval_ms: config.monitorIntervalMs },
      broker: broker ? { demo_verified: broker.demo_verified, real_verified: broker.real_verified, connected: broker.connected, algo_trading_enabled: broker.algo_trading_enabled, checks: broker.checks, account: broker.account ? { login: broker.account.login, server: broker.account.server, trade_mode: broker.account.trade_mode, currency: broker.account.currency, balance: broker.account.balance, equity: broker.account.equity } : null } : null,
      halted: state?.halted ?? null,
      position: state?.position ?? null,
      intent: state?.intent ?? null,
      daily: state ? rollDaily(state.daily, nowDate()) : null,
      last_close_at: state?.last_close_at ?? null,
      executed_signal_count: state ? Object.keys(state.executed_signals).length : 0,
      kill_switch: deps.readKillSwitch(killSwitchPath),
      news_protection: protectionOn ? {
        enabled: true,
        news: prot.news ? { state: prot.news.state, reason: prot.news.reason, event: prot.news.event ?? null, next_event: prot.news.next_event ?? null, block_ends_utc: prot.news.block_ends_utc ?? null, calendar: prot.news.calendar ?? null } : null,
        shock: { state: prot.shock.state, since: prot.shock.since, triggers: prot.shock.triggers, last_trigger_at: prot.shock.last_trigger_at, normalized_at: prot.shock.normalized_at, evidence: prot.shock.evidence },
        blocking: state?.protection?.blocking ?? false, block_reasons: state?.protection?.block_reasons ?? [], blocking_since: state?.protection?.blocking_since ?? null, last_block_cleared_at: state?.protection?.last_block_cleared_at ?? null,
        samples: prot.samples.length, spread_baseline: computeSpreadBaseline(prot.samples, nowDate().getTime() / 1000, shockParams).baseline, confirmed_bars_5m: prot.bars5m?.length ?? 0, confirmed_bars_at: prot.bars5m_at,
        provider: newsMonitor?.status?.().provider ?? null, calendar: newsMonitor?.status?.().calendar ?? null,
        params: { news: config.newsRiskParams ?? null, shock: shockParams },
      } : { enabled: false },
    };
  }

  async function stop() {
    if (timer) { deps.clearInterval(timer); timer = null; }
    if (state) { try { persist(); } catch { /* best-effort */ } }
    record('STOPPED', {});
  }

  return { start, executeSignal, monitorOnce, reviewThesis, closePosition, status, stop, refreshBroker, _getState: () => state };
}

/**
 * Separate statistics for (A) MCP decision quality and (B) the
 * TradeBudget execution overlay -- never merged, never claimed to measure
 * the engine's own TP/SL performance.
 */
export function summarizeOverlayStats(events) {
  const closed = events.filter((e) => e.type === 'CLOSED');
  const wins = closed.filter((e) => Number(e.net_pnl) >= 0).length;
  const net = closed.reduce((s, e) => s + Number(e.net_pnl ?? 0), 0);
  const byReason = {};
  for (const e of closed) byReason[e.exit_reason ?? 'UNKNOWN'] = (byReason[e.exit_reason ?? 'UNKNOWN'] ?? 0) + 1;
  const skipped = events.filter((e) => e.type === 'SKIPPED');
  const skipReasons = {};
  for (const e of skipped) skipReasons[e.reason ?? 'UNKNOWN'] = (skipReasons[e.reason ?? 'UNKNOWN'] ?? 0) + 1;
  return {
    label: 'B. TradeBudget execution-overlay performance (does NOT measure engine TP/SL)',
    closed_trades: closed.length, wins, losses: closed.length - wins, net_pnl_usd: round2(net), avg_net_pnl_usd: closed.length ? round2(net / closed.length) : null,
    exits_by_reason: byReason, opened: events.filter((e) => e.type === 'OPENED').length, rejected: events.filter((e) => e.type === 'REJECTED').length, skipped: skipped.length, skipped_by_reason: skipReasons,
  };
}

export function summarizeEngineSignalStats(store) {
  const signals = store?.signals ?? [];
  const count = (s) => signals.filter((x) => x.status === s).length;
  return { label: 'A. MCP decision quality (engine signal store, own SL/TP2 resolution)', total: signals.length, open: count('OPEN'), pass: count('PASS'), fail: count('FAIL'), tp1_hit: signals.filter((x) => x.tp1_hit).length };
}
