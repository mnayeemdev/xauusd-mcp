/**
 * MT5 DEMO execution policy -- PURE functions only (no I/O, no timers, no
 * MT5 calls). Everything here is unit-testable with plain objects.
 *
 * This module is an EXECUTION EXIT OVERLAY on top of the existing MCP
 * decision engine. It never decides BUY/SELL/WAIT (that is exclusively
 * src/core/xauusd_calculate.js via the watcher's alert gate) and it never
 * touches the engine's own SL/TP/RR/quality. It only answers two
 * questions about an ALREADY-authorised signal:
 *   1. evaluateEntry(): may this exact signal be sent to the broker right
 *      now? (every safety gate; any doubt => not allowed)
 *   2. evaluateExit(): must the open MCP-owned position be closed now,
 *      based on ACTUAL position P&L versus the TradeBudget targets?
 *
 * MONEY-MANAGEMENT MODEL (TradeBudget-based, configurable):
 *   ProfitTargetUSD = TradeBudgetUSD x TakeProfitPercent/100
 *   MaximumLossUSD  = TradeBudgetUSD x StopLossPercent/100   (as a negative)
 *   e.g. 10 USD / 30% / 50%  => +3.00 / -5.00
 *        100 USD / 30% / 50% => +30.00 / -50.00
 * TradeBudgetUSD is a risk-configuration number. It is NOT margin, NOT
 * lot size, NOT notional exposure and NOT money isolated by the broker.
 * LotSize (position volume) is a separate, independent parameter.
 */

export const MT5_DEFAULTS = Object.freeze({
  login: 480236873,
  server: 'Exness-MT5Trial11',
  symbol: 'XAUUSDm',
  magic: 88051501,
  tradeBudgetUsd: 10,
  takeProfitPercent: 30,
  stopLossPercent: 50,
  lotSize: 0.01,
  maxLotSize: 0.01, // independent hard cap: raising lotSize alone is not enough
  maxEntryDriftUsd: 2.0,
  maxSpreadUsd: 0.6,
  deviationPoints: 300, // 0.300 USD on a 3-digit symbol
  maxTradesPerDay: 150,
  dailyLossLimitUsd: 25, // circuit breaker on realised net P&L per UTC day
  maxConsecutiveLosses: 5,
  maxSignalAgeSec: 600,
  maxQuoteAgeSec: 90,
  monitorIntervalMs: 3000,
  brokerTakeProfit: true, // broker-side TP as a secondary fail-safe (monitor is primary)
  estimatedCommissionPerSideUsd: 0, // Exness Standard: 0; set if the account charges commission
});

const ENV_MAP = {
  XAUUSD_MT5_LOGIN: ['login', 'int'],
  XAUUSD_MT5_SERVER: ['server', 'string'],
  XAUUSD_MT5_SYMBOL: ['symbol', 'string'],
  XAUUSD_MT5_MAGIC: ['magic', 'int'],
  XAUUSD_MT5_TRADE_BUDGET_USD: ['tradeBudgetUsd', 'number'],
  XAUUSD_MT5_TAKE_PROFIT_PERCENT: ['takeProfitPercent', 'number'],
  XAUUSD_MT5_STOP_LOSS_PERCENT: ['stopLossPercent', 'number'],
  XAUUSD_MT5_LOT_SIZE: ['lotSize', 'number'],
  XAUUSD_MT5_MAX_LOT_SIZE: ['maxLotSize', 'number'],
  XAUUSD_MT5_MAX_ENTRY_DRIFT_USD: ['maxEntryDriftUsd', 'number'],
  XAUUSD_MT5_MAX_SPREAD_USD: ['maxSpreadUsd', 'number'],
  XAUUSD_MT5_DEVIATION_POINTS: ['deviationPoints', 'int'],
  XAUUSD_MT5_MAX_TRADES_PER_DAY: ['maxTradesPerDay', 'int'],
  XAUUSD_MT5_DAILY_LOSS_LIMIT_USD: ['dailyLossLimitUsd', 'number'],
  XAUUSD_MT5_MAX_CONSECUTIVE_LOSSES: ['maxConsecutiveLosses', 'int'],
  XAUUSD_MT5_MAX_SIGNAL_AGE_SEC: ['maxSignalAgeSec', 'number'],
  XAUUSD_MT5_MAX_QUOTE_AGE_SEC: ['maxQuoteAgeSec', 'number'],
  XAUUSD_MT5_MONITOR_INTERVAL_MS: ['monitorIntervalMs', 'int'],
  XAUUSD_MT5_BROKER_TP: ['brokerTakeProfit', 'bool'],
  XAUUSD_MT5_COMMISSION_PER_SIDE_USD: ['estimatedCommissionPerSideUsd', 'number'],
};

function parseTyped(raw, type, key) {
  const s = String(raw).trim();
  if (type === 'string') return s;
  if (type === 'bool') return !(s === '0' || s.toLowerCase() === 'false' || s.toLowerCase() === 'off' || s === '');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`invalid numeric value for ${key}: "${raw}"`);
  if (type === 'int' && !Number.isInteger(n)) throw new Error(`invalid integer value for ${key}: "${raw}"`);
  return n;
}

/**
 * Builds the executor configuration from defaults + environment overrides
 * and validates it. Throws on anything unsafe so the executor can never
 * start with a half-valid configuration. `mode` MUST be exactly 'demo';
 * any other value (including 'live'/'real') throws -- there is no real
 * mode in this codebase.
 */
export function resolveExecutorConfig(env = {}, { mode = 'demo' } = {}) {
  if (mode !== 'demo') throw new Error(`MT5 execution mode "${mode}" is not permitted: only "demo" exists. Real-money execution is hard-blocked.`);
  const cfg = { ...MT5_DEFAULTS, mode: 'demo' };
  for (const [envKey, [field, type]] of Object.entries(ENV_MAP)) {
    if (env[envKey] !== undefined && env[envKey] !== '') cfg[field] = parseTyped(env[envKey], type, envKey);
  }
  if (!(cfg.tradeBudgetUsd > 0)) throw new Error('TradeBudgetUSD must be > 0');
  if (!(cfg.takeProfitPercent > 0 && cfg.takeProfitPercent <= 1000)) throw new Error('TakeProfitPercent must be in (0, 1000]');
  if (!(cfg.stopLossPercent > 0 && cfg.stopLossPercent <= 100)) throw new Error('StopLossPercent must be in (0, 100] -- a position can never lose more than its whole budget by design');
  if (!(cfg.lotSize > 0)) throw new Error('LotSize must be > 0');
  if (cfg.lotSize > cfg.maxLotSize + 1e-12) throw new Error(`LotSize ${cfg.lotSize} exceeds the independent hard cap MaxLotSize ${cfg.maxLotSize}`);
  if (!(cfg.maxTradesPerDay >= 0 && cfg.maxTradesPerDay <= 150)) throw new Error('MaxTradesPerDay must be within [0, 150] (150 is the hard ceiling)');
  if (!(cfg.maxEntryDriftUsd >= 0)) throw new Error('MaxEntryDriftUSD must be >= 0');
  if (!(cfg.maxSpreadUsd > 0)) throw new Error('MaxSpreadUSD must be > 0');
  if (!Number.isInteger(cfg.login) || cfg.login <= 0) throw new Error('login must be a positive integer');
  if (!cfg.server || !/trial|demo/i.test(cfg.server)) throw new Error(`server "${cfg.server}" does not look like a DEMO/Trial server -- refusing`);
  if (!cfg.symbol) throw new Error('symbol is required');
  Object.assign(cfg, computeBudgetTargets(cfg));
  return cfg;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** ProfitTargetUSD (positive) and MaximumLossUSD (negative) from the budget model. */
export function computeBudgetTargets({ tradeBudgetUsd, takeProfitPercent, stopLossPercent }) {
  return {
    profitTargetUsd: round2(tradeBudgetUsd * takeProfitPercent / 100),
    maximumLossUsd: -round2(tradeBudgetUsd * stopLossPercent / 100),
  };
}

/** Lot must be within [min,max], a multiple of step, and under the config cap. */
export function validateLot({ lot, volumeMin, volumeMax, volumeStep, maxLotSize }) {
  if (!(lot > 0)) return { ok: false, reason: 'INVALID_LOT' };
  if (lot > maxLotSize + 1e-12) return { ok: false, reason: 'LOT_ABOVE_HARD_CAP' };
  if (volumeMin != null && lot < volumeMin - 1e-12) return { ok: false, reason: 'LOT_BELOW_SYMBOL_MIN' };
  if (volumeMax != null && lot > volumeMax + 1e-12) return { ok: false, reason: 'LOT_ABOVE_SYMBOL_MAX' };
  if (volumeStep) {
    const steps = lot / volumeStep;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return { ok: false, reason: 'LOT_STEP_INVALID' };
  }
  return { ok: true };
}

/**
 * Broker-side fail-safe stops. Position P&L on MT5 for a BUY is
 * (bid - fill) x lot x contract, and for a SELL (fill - ask) x lot x
 * contract; broker SL/TP for a BUY are evaluated against BID, for a SELL
 * against ASK. So a stop placed at exactly maximumLoss/(lot*contract)
 * from the fill price yields a GROSS loss of exactly maximumLossUsd when
 * hit (before commission/swap/slippage). To keep the NET loss inside the
 * budget, the estimated round-trip commission is subtracted from the
 * distance. The broker SL therefore protects the budget if Node/Python
 * die; the actual-P&L monitor (evaluateExit) is the PRIMARY authority
 * and normally fires first or at the same level.
 *
 * The broker TP is placed at the gross profit-target distance PLUS the
 * commission estimate (so net ~= target). Spread is NOT added: for a BUY
 * the spread is already paid at entry (fill = ask, P&L measured on bid)
 * and the TP triggers on bid, so no systematic conflict exists. Swap
 * accrued overnight is not knowable at open time and is the documented
 * residual difference; the monitor uses live swap so it remains exact.
 */
export function computeBrokerStops({ side, fillPrice, lot, contractSize, digits, profitTargetUsd, maximumLossUsd, estimatedRoundTripCommissionUsd = 0, brokerTakeProfit = true }) {
  const perUsd = 1 / (lot * contractSize); // price distance per 1 USD of P&L
  const lossDistance = (Math.abs(maximumLossUsd) - Math.max(0, estimatedRoundTripCommissionUsd)) * perUsd;
  const profitDistance = (profitTargetUsd + Math.max(0, estimatedRoundTripCommissionUsd)) * perUsd;
  if (!(lossDistance > 0)) throw new Error('broker SL distance is not positive -- commission estimate exceeds the loss budget');
  const r = (p) => Number(p.toFixed(digits));
  const sl = side === 'BUY' ? r(fillPrice - lossDistance) : r(fillPrice + lossDistance);
  const tp = brokerTakeProfit ? (side === 'BUY' ? r(fillPrice + profitDistance) : r(fillPrice - profitDistance)) : null;
  return { sl, tp, lossDistance: r(lossDistance), profitDistance: r(profitDistance), usdPerPriceUnit: lot * contractSize };
}

/**
 * Live net P&L estimate for an OPEN position. MT5's position.profit is
 * the gross floating P&L at the current bid/ask (so it already reflects
 * spread and the actual fill price). swap is reported live. Commission on
 * the entry deal is known; the exit commission is estimated as equal.
 */
export function estimateNetPnl({ grossProfit, swap = 0, entryCommission = 0, estimatedExitCommission = null, entryFee = 0 }) {
  const exitCommission = estimatedExitCommission ?? entryCommission;
  const net = Number(grossProfit) + Number(swap) + Number(entryCommission) + Number(exitCommission) + Number(entryFee);
  return round2(net);
}

/** Realised net P&L from the closed position's deals (entry + exit). */
export function realizedFromDeals(deals) {
  let profit = 0, commission = 0, swap = 0, fee = 0;
  let exitDeal = null, entryDeal = null;
  for (const d of deals ?? []) {
    profit += Number(d.profit ?? 0); commission += Number(d.commission ?? 0); swap += Number(d.swap ?? 0); fee += Number(d.fee ?? 0);
    if (Number(d.entry) === 1) exitDeal = d; // DEAL_ENTRY_OUT
    if (Number(d.entry) === 0) entryDeal = d; // DEAL_ENTRY_IN
  }
  return { grossProfit: round2(profit), commission: round2(commission), swap: round2(swap), fee: round2(fee), netPnl: round2(profit + commission + swap + fee), exitDeal, entryDeal };
}

export const DEAL_REASON = { 0: 'CLIENT', 1: 'MOBILE', 2: 'WEB', 3: 'EXPERT', 4: 'SL', 5: 'TP', 6: 'SO', 7: 'ROLLOVER', 8: 'VMARGIN', 9: 'SPLIT' };

export function utcDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

export function emptyDaily(day) {
  return { day, completed: 0, realized_net_usd: 0, consecutive_losses: 0, wins: 0, losses: 0 };
}

/** Rolls the daily counters when the UTC day changes; returns the (possibly new) daily object. */
export function rollDaily(daily, now) {
  const day = utcDay(now);
  if (!daily || daily.day !== day) return emptyDaily(day);
  return daily;
}

/**
 * Rebuilds daily statistics from broker deal history (exit deals only,
 * DEAL_ENTRY_OUT, our magic already filtered by the caller) for one UTC
 * day. Broker history is the source of truth after a restart.
 */
export function rebuildDailyFromDeals(deals, day) {
  const daily = emptyDaily(day);
  const outs = (deals ?? []).filter((d) => Number(d.entry) === 1 && utcDay(Number(d.time) * 1000) === day).sort((a, b) => Number(a.time) - Number(b.time));
  for (const d of outs) {
    const net = Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0) + Number(d.fee ?? 0);
    daily.completed += 1;
    daily.realized_net_usd = round2(daily.realized_net_usd + net);
    if (net < 0) { daily.losses += 1; daily.consecutive_losses += 1; } else { daily.wins += 1; daily.consecutive_losses = 0; }
  }
  return daily;
}

/** Applies one closed trade's realised net P&L to the daily counters. */
export function applyClosedTrade(daily, netPnl) {
  const next = { ...daily };
  next.completed += 1;
  next.realized_net_usd = round2(next.realized_net_usd + netPnl);
  if (netPnl < 0) { next.losses += 1; next.consecutive_losses += 1; } else { next.wins += 1; next.consecutive_losses = 0; }
  return next;
}

/**
 * The entry gate. Order matters: the first failing check is the reported
 * reason. Every input is a plain value the executor gathered beforehand;
 * a missing/unknown input fails closed.
 *
 *   signal   : { signal_id, action, entry, calculated_at }
 *   market   : { bid, ask, tick_time (sec), now_sec, spread_price, volume_min, volume_max, volume_step } | null
 *   broker   : { demo_verified, connected, algo_trading_enabled } | null
 *   state    : executor persisted state
 *   brokerPositions : array of positions carrying our magic (already filtered) | null (=unknown)
 */
export function evaluateEntry({ config, state, signal, market, broker, brokerPositions, killSwitch, now }) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const deny = (reason, details = {}) => ({ allowed: false, reason, details });

  if (state?.halted) return deny('HALTED', { halted: state.halted });
  if (killSwitch?.active) return deny('KILL_SWITCH', { kill: killSwitch });
  // Mode-aware account verification: a DEMO config (the default, and every
  // pre-existing caller) still requires the bridge's demo_verified handshake
  // exactly as before; a REAL config (src/engine/mt5RealPolicy.js) requires
  // the REAL bridge's real_verified handshake. Neither ever accepts the other.
  if (config?.mode === 'real') {
    if (!broker || broker.real_verified !== true) return deny('REAL_NOT_VERIFIED', { broker });
  } else if (!broker || broker.demo_verified !== true) return deny('DEMO_NOT_VERIFIED', { broker });
  if (broker.connected !== true) return deny('TERMINAL_NOT_CONNECTED');
  if (broker.algo_trading_enabled !== true) return deny('ALGO_TRADING_DISABLED');
  if (state?.intent && state.intent.status === 'PENDING') return deny('PENDING_INTENT_UNRESOLVED', { intent: state.intent });

  if (!signal || (signal.action !== 'BUY' && signal.action !== 'SELL')) return deny('NOT_ACTIONABLE', { action: signal?.action ?? null });
  if (!signal.signal_id) return deny('NO_SIGNAL_ID');
  if (state?.executed_signals && state.executed_signals[signal.signal_id]) return deny('DUPLICATE_SIGNAL', { prior: state.executed_signals[signal.signal_id] });
  if (signal.entry === null || signal.entry === undefined || !Number.isFinite(Number(signal.entry))) return deny('INVALID_ENGINE_ENTRY');
  const calcMs = Date.parse(signal.calculated_at ?? '');
  if (!Number.isFinite(calcMs)) return deny('INVALID_SIGNAL_TIME');
  const ageSec = (nowMs - calcMs) / 1000;
  if (ageSec > config.maxSignalAgeSec) return deny('STALE_SIGNAL', { age_sec: Math.round(ageSec) });
  if (state?.last_close_at && calcMs <= Date.parse(state.last_close_at)) return deny('SIGNAL_PREDATES_LAST_CLOSE', { last_close_at: state.last_close_at });

  if (state?.position) return deny('POSITION_ALREADY_OPEN', { ticket: state.position.ticket });
  if (!Array.isArray(brokerPositions)) return deny('BROKER_POSITIONS_UNKNOWN');
  if (brokerPositions.length > 0) return deny('BROKER_POSITION_ALREADY_OPEN', { tickets: brokerPositions.map((p) => p.ticket) });

  const daily = rollDaily(state?.daily, nowMs);
  if (daily.completed >= config.maxTradesPerDay) return deny('DAILY_TRADE_CEILING', { completed: daily.completed, ceiling: config.maxTradesPerDay });
  // Daily realised-loss lock: applies only when the profile configures a
  // positive limit (DEMO: 25). A profile may disable it (REAL: null) so that
  // a realised loss never freezes entries until the UTC day rolls; the
  // consecutive-loss breaker, kill switch and daily trade ceiling still apply.
  if (Number.isFinite(config.dailyLossLimitUsd) && config.dailyLossLimitUsd > 0 && daily.realized_net_usd <= -Math.abs(config.dailyLossLimitUsd)) return deny('DAILY_LOSS_LIMIT', { realized_net_usd: daily.realized_net_usd, limit: -Math.abs(config.dailyLossLimitUsd) });
  if (daily.consecutive_losses >= config.maxConsecutiveLosses) return deny('CONSECUTIVE_LOSS_LIMIT', { consecutive_losses: daily.consecutive_losses, limit: config.maxConsecutiveLosses });

  if (!market || !Number.isFinite(market.bid) || !Number.isFinite(market.ask)) return deny('QUOTE_UNAVAILABLE');
  const quoteAgeSec = (market.now_sec ?? nowMs / 1000) - Number(market.tick_time);
  if (!Number.isFinite(quoteAgeSec) || quoteAgeSec > config.maxQuoteAgeSec) return deny('STALE_QUOTE', { quote_age_sec: Math.round(quoteAgeSec) });
  const spread = Number.isFinite(market.spread_price) ? market.spread_price : market.ask - market.bid;
  if (spread > config.maxSpreadUsd) return deny('SPREAD_TOO_WIDE', { spread, max: config.maxSpreadUsd });

  const livePrice = signal.action === 'BUY' ? market.ask : market.bid;
  const drift = Math.abs(livePrice - Number(signal.entry));
  if (drift > config.maxEntryDriftUsd) return deny('ENTRY_DRIFT', { engine_entry: Number(signal.entry), live_price: livePrice, drift: round2(drift), max: config.maxEntryDriftUsd });

  const lot = validateLot({ lot: config.lotSize, volumeMin: market.volume_min, volumeMax: market.volume_max, volumeStep: market.volume_step, maxLotSize: config.maxLotSize });
  if (!lot.ok) return deny(lot.reason, { lot: config.lotSize });

  return { allowed: true, reason: 'OK', details: { live_price: livePrice, drift: round2(drift), spread, lot: config.lotSize, daily } };
}

/**
 * Exit authority for the open MCP-owned position, driven by ACTUAL net
 * position P&L. `netPnl` must already include swap and commission
 * estimates (see estimateNetPnl()).
 */
export function evaluateExit({ netPnl, profitTargetUsd, maximumLossUsd, killSwitch }) {
  if (killSwitch?.close) return { close: true, reason: 'KILL_SWITCH_CLOSE' };
  if (!Number.isFinite(netPnl)) return { close: false, reason: 'PNL_UNKNOWN' };
  if (netPnl >= profitTargetUsd) return { close: true, reason: 'TAKE_PROFIT_BUDGET' };
  if (netPnl <= maximumLossUsd) return { close: true, reason: 'STOP_LOSS_BUDGET' };
  return { close: false, reason: 'HOLD' };
}

/** Order comment: 'MCP:' + signal_id (16 hex) = 20 chars, under MT5's 31-char limit. */
export function buildOrderComment(signalId) {
  return `MCP:${String(signalId).slice(0, 27)}`;
}

export function signalIdFromComment(comment) {
  const m = /^MCP:([0-9a-f]{8,27})/i.exec(String(comment ?? ''));
  return m ? m[1] : null;
}

/**
 * PART 9 -- executable-geometry recheck. The engine's RR was computed at the
 * confirmed close; the order executes at the live bid/ask (and fills may
 * slip). Recompute structural risk and reward at `price` against the
 * engine's own stop (`engineSl`) and objective (`engineTp2`). Pure.
 */
export function evaluateExecutableGeometry({ side, price, engineSl, engineTp2, minRr }) {
  const p = Number(price), sl = Number(engineSl), tp = Number(engineTp2);
  if (![p, sl, tp].every(Number.isFinite)) return { valid: false, reason: 'GEOMETRY_UNAVAILABLE', price: p, risk: null, reward: null, rr: null };
  const risk = side === 'BUY' ? p - sl : sl - p;
  const reward = side === 'BUY' ? tp - p : p - tp;
  if (!(risk > 0)) return { valid: false, reason: 'PRICE_BEYOND_STRUCTURAL_STOP', price: p, risk: round2(risk), reward: round2(reward), rr: null };
  if (!(reward > 0)) return { valid: false, reason: 'PRICE_BEYOND_OBJECTIVE', price: p, risk: round2(risk), reward: round2(reward), rr: null };
  const rr = round2(reward / risk);
  if (minRr != null && rr < minRr) return { valid: false, reason: 'EFFECTIVE_RR_BELOW_MINIMUM', price: p, risk: round2(risk), reward: round2(reward), rr, min_rr: minRr };
  return { valid: true, reason: 'OK', price: p, risk: round2(risk), reward: round2(reward), rr, min_rr: minRr ?? null };
}

/**
 * PART 5 -- broker fail-safe stops derived conservatively. The monetary
 * boundary (computeBrokerStops) is the OUTER limit; when a structural stop is
 * known, the broker SL is placed at min(monetary distance, structural risk x
 * multiple + spread), never closer than 4 spreads or the broker stops level.
 * BUY SL triggers on BID, SELL SL on ASK: the spread term covers that. Pure.
 */
export function computeProtectiveStops({ side, fillPrice, lot, contractSize, digits, profitTargetUsd, maximumLossUsd, estimatedRoundTripCommissionUsd = 0, brokerTakeProfit = true, structuralStop = null, plannedEntry = null, structuralMultiple = null, spread = 0, stopsLevelPrice = 0 }) {
  const monetary = computeBrokerStops({ side, fillPrice, lot, contractSize, digits, profitTargetUsd, maximumLossUsd, estimatedRoundTripCommissionUsd, brokerTakeProfit });
  const r = (p) => Number(p.toFixed(digits));
  const sp = Math.max(0, Number(spread) || 0);
  const minDistance = Math.max(4 * sp, Number(stopsLevelPrice) || 0);
  let lossDistance = monetary.lossDistance;
  let basis = 'MONETARY';
  let structuralDistance = null;
  if (structuralMultiple != null && Number.isFinite(Number(structuralStop)) && Number.isFinite(Number(plannedEntry))) {
    const structuralRisk = Math.abs(Number(plannedEntry) - Number(structuralStop));
    structuralDistance = structuralRisk * structuralMultiple + sp;
    if (structuralDistance > 0 && structuralDistance < lossDistance) { lossDistance = structuralDistance; basis = 'STRUCTURAL'; }
  }
  lossDistance = Math.max(lossDistance, minDistance);
  const sl = side === 'BUY' ? r(fillPrice - lossDistance) : r(fillPrice + lossDistance);
  return { ...monetary, sl, lossDistance: r(lossDistance), sl_basis: basis, structural_distance: structuralDistance == null ? null : r(structuralDistance), monetary_distance: monetary.lossDistance };
}

/**
 * PART 3 -- post-entry THESIS INVALIDATION on CONFIRMED evidence only. Pure.
 *   position.engine carries the ORIGINAL signal geometry (structural_stop,
 *   setup_level, planned_entry, direction). `result` is this cycle's
 *   analyzeMarket() output: primary_confirmed_bars (confirmed candles of the
 *   entry timeframe), evidence.structure (confirmed structure events) and the
 *   final action/signal (an ACTIONABLE opposite signal, never a candidate).
 * Exits (earliest wins):
 *   A. a confirmed candle CLOSES beyond the original structural stop;
 *   B. a confirmed opposite BOS/CHoCH broke through the setup level after entry;
 *   C. a genuine NEW opposite actionable signal formed in the same market area
 *      (its entry at/beyond the setup level minus one structural risk).
 * Never exits on ticks, spread, unconfirmed bars, planner/watch states or
 * opposite candidates that did not become actionable.
 */
export function evaluateThesisInvalidation({ position, result }) {
  const eng = position?.engine;
  const side = position?.side;
  if (!position || !eng || (side !== 'BUY' && side !== 'SELL')) return { invalidated: false, reason: 'NO_POSITION' };
  const stop = Number(eng.structural_stop ?? eng.engine_sl);
  const planned = Number(eng.planned_entry ?? eng.engine_entry);
  const setup = Number.isFinite(Number(eng.setup_level)) ? Number(eng.setup_level) : stop;
  const bars = Array.isArray(result?.primary_confirmed_bars) ? result.primary_confirmed_bars : null;
  const last = bars?.at(-1);
  if (!last || !Number.isFinite(stop)) return { invalidated: false, reason: 'NO_CONFIRMED_EVIDENCE' };
  const openSec = Date.parse(position.open_time ?? '') / 1000;
  const barSec = (typeof last.time === 'number') ? last.time : NaN;
  const tfSec = bars.length > 1 ? Math.max(60, bars.at(-1).time - bars.at(-2).time) : 300;
  if (!Number.isFinite(openSec) || !Number.isFinite(barSec) || !(barSec + tfSec > openSec)) return { invalidated: false, reason: 'CANDLE_PREDATES_ENTRY' };
  const riskDist = Number.isFinite(planned) ? Math.abs(planned - stop) : 0;
  const against = (price) => (side === 'SELL' ? price > stop : price < stop);
  const throughSetup = (level) => (side === 'SELL' ? level >= setup - riskDist : level <= setup + riskDist);

  if (against(Number(last.close))) return { invalidated: true, reason: 'THESIS_STOP_CLOSE', detail: { confirmed_close: last.close, structural_stop: stop, bar_time: barSec } };

  const ev = result?.evidence?.structure?.lastEvent;
  if (ev && ((side === 'SELL' && ev.direction === 'BULLISH') || (side === 'BUY' && ev.direction === 'BEARISH'))) {
    const evBar = Number.isInteger(ev.bar) ? bars[ev.bar] : null;
    const evSec = evBar?.time;
    if (Number.isFinite(evSec) && evSec + tfSec > openSec && throughSetup(Number(ev.level))) {
      return { invalidated: true, reason: 'THESIS_OPPOSITE_STRUCTURE_BREAK', detail: { event: ev.type, direction: ev.direction, level: ev.level, bar_time: evSec, setup_level: setup } };
    }
  }

  const opposite = side === 'SELL' ? 'BUY' : 'SELL';
  if (result?.action === opposite && result?.signal?.is_new_event === true && Number.isFinite(Number(result.entry)) && throughSetup(Number(result.entry))) {
    return { invalidated: true, reason: 'THESIS_OPPOSITE_SIGNAL', detail: { signal_id: result.signal.signal_id, model: result.setup ?? null, entry: result.entry, setup_level: setup } };
  }
  return { invalidated: false, reason: 'THESIS_HOLD', detail: { confirmed_close: last.close, structural_stop: stop } };
}
