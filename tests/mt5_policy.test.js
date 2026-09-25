/**
 * MT5 DEMO execution policy (src/engine/mt5Policy.js) -- pure-function tests.
 * No MT5, no Python, no filesystem, no timers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MT5_DEFAULTS, resolveExecutorConfig, computeBudgetTargets, validateLot, computeBrokerStops, estimateNetPnl,
  realizedFromDeals, rebuildDailyFromDeals, applyClosedTrade, rollDaily, evaluateEntry, evaluateExit,
  buildOrderComment, signalIdFromComment, utcDay,
} from '../src/engine/mt5Policy.js';

const NOW = new Date('2026-09-25T10:00:00.000Z');

function baseConfig(env = {}) { return resolveExecutorConfig(env, { mode: 'demo' }); }
function goodBroker() { return { demo_verified: true, connected: true, algo_trading_enabled: true }; }
function goodMarket(over = {}) {
  return { bid: 4265.158, ask: 4265.418, tick_time: NOW.getTime() / 1000 - 2, now_sec: NOW.getTime() / 1000, spread_price: 0.26, volume_min: 0.01, volume_max: 200, volume_step: 0.01, ...over };
}
function goodSignal(over = {}) { return { signal_id: 'abc123def4567890', action: 'BUY', entry: 4265.0, calculated_at: new Date(NOW.getTime() - 30_000).toISOString(), ...over }; }
function goodState(over = {}) { return { executed_signals: {}, intent: null, position: null, last_close_at: null, daily: null, halted: null, ...over }; }
function entryArgs(over = {}) {
  return { config: baseConfig(), state: goodState(), signal: goodSignal(), market: goodMarket(), broker: goodBroker(), brokerPositions: [], killSwitch: { active: false }, now: NOW, ...over };
}

describe('mt5Policy: TradeBudget money-management model', () => {
  it('10 USD budget / 30% / 50% => +3.00 / -5.00', () => {
    assert.deepEqual(computeBudgetTargets({ tradeBudgetUsd: 10, takeProfitPercent: 30, stopLossPercent: 50 }), { profitTargetUsd: 3, maximumLossUsd: -5 });
  });
  it('100 USD budget / 30% / 50% => +30.00 / -50.00 while lot stays 0.01', () => {
    const cfg = baseConfig({ XAUUSD_MT5_TRADE_BUDGET_USD: '100' });
    assert.equal(cfg.profitTargetUsd, 30);
    assert.equal(cfg.maximumLossUsd, -50);
    assert.equal(cfg.lotSize, 0.01);
  });
  it('defaults match the verified DEMO environment and the initial configuration', () => {
    const cfg = baseConfig();
    assert.equal(cfg.mode, 'demo');
    assert.equal(cfg.login, 480236873);
    assert.equal(cfg.server, 'Exness-MT5Trial11');
    assert.equal(cfg.symbol, 'XAUUSDm');
    assert.equal(cfg.tradeBudgetUsd, 10); assert.equal(cfg.takeProfitPercent, 30); assert.equal(cfg.stopLossPercent, 50);
    assert.equal(cfg.lotSize, 0.01); assert.equal(cfg.maxLotSize, 0.01);
    assert.equal(cfg.profitTargetUsd, 3); assert.equal(cfg.maximumLossUsd, -5);
    assert.equal(cfg.maxEntryDriftUsd, 2); assert.equal(cfg.maxTradesPerDay, 150);
    assert.equal(MT5_DEFAULTS.maxTradesPerDay, 150);
  });
  it('budget is independent of lot: changing lot does not change targets, changing budget does not change lot', () => {
    const a = baseConfig({ XAUUSD_MT5_LOT_SIZE: '0.01', XAUUSD_MT5_TRADE_BUDGET_USD: '50' });
    assert.equal(a.profitTargetUsd, 15); assert.equal(a.maximumLossUsd, -25); assert.equal(a.lotSize, 0.01);
  });
});

describe('mt5Policy: configuration hard blocks', () => {
  it('any mode other than "demo" throws (real-money hard block)', () => {
    for (const mode of ['live', 'real', 'LIVE', 'Demo ', '', null]) assert.throws(() => resolveExecutorConfig({}, { mode }), /only "demo" exists|hard-blocked/);
  });
  it('a server name without Trial/Demo is refused', () => {
    assert.throws(() => baseConfig({ XAUUSD_MT5_SERVER: 'Exness-MT5Real7' }), /DEMO\/Trial/);
  });
  it('lot above the independent hard cap is refused (two settings must change to raise volume)', () => {
    assert.throws(() => baseConfig({ XAUUSD_MT5_LOT_SIZE: '0.02' }), /hard cap/);
    const ok = baseConfig({ XAUUSD_MT5_LOT_SIZE: '0.02', XAUUSD_MT5_MAX_LOT_SIZE: '0.02' });
    assert.equal(ok.lotSize, 0.02);
  });
  it('daily ceiling cannot exceed 150 and stop-loss percent cannot exceed 100', () => {
    assert.throws(() => baseConfig({ XAUUSD_MT5_MAX_TRADES_PER_DAY: '151' }), /150/);
    assert.throws(() => baseConfig({ XAUUSD_MT5_STOP_LOSS_PERCENT: '150' }), /StopLossPercent/);
    assert.throws(() => baseConfig({ XAUUSD_MT5_TRADE_BUDGET_USD: '0' }), /TradeBudgetUSD/);
    assert.throws(() => baseConfig({ XAUUSD_MT5_TRADE_BUDGET_USD: 'abc' }), /invalid numeric/);
  });
});

describe('mt5Policy: lot validation against symbol properties', () => {
  it('accepts 0.01 on XAUUSDm (min 0.01, step 0.01, max 200)', () => {
    assert.deepEqual(validateLot({ lot: 0.01, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, maxLotSize: 0.01 }), { ok: true });
  });
  it('rejects below-min, off-step, above-max and above-cap volumes', () => {
    assert.equal(validateLot({ lot: 0.005, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, maxLotSize: 1 }).reason, 'LOT_BELOW_SYMBOL_MIN');
    assert.equal(validateLot({ lot: 0.015, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, maxLotSize: 1 }).reason, 'LOT_STEP_INVALID');
    assert.equal(validateLot({ lot: 201, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, maxLotSize: 500 }).reason, 'LOT_ABOVE_SYMBOL_MAX');
    assert.equal(validateLot({ lot: 0.02, volumeMin: 0.01, volumeMax: 200, volumeStep: 0.01, maxLotSize: 0.01 }).reason, 'LOT_ABOVE_HARD_CAP');
  });
});

describe('mt5Policy: broker-side fail-safe stops', () => {
  const base = { lot: 0.01, contractSize: 100, digits: 3, profitTargetUsd: 3, maximumLossUsd: -5 };
  it('BUY at 4265.418: SL 5.000 below (gross -5 USD at bid), TP 3.000 above', () => {
    const s = computeBrokerStops({ ...base, side: 'BUY', fillPrice: 4265.418 });
    assert.equal(s.sl, 4260.418); assert.equal(s.tp, 4268.418); assert.equal(s.usdPerPriceUnit, 1);
  });
  it('SELL at 4265.158: mirrored', () => {
    const s = computeBrokerStops({ ...base, side: 'SELL', fillPrice: 4265.158 });
    assert.equal(s.sl, 4270.158); assert.equal(s.tp, 4262.158);
  });
  it('100 USD budget => 30/50 USD distances at 0.01 lot', () => {
    const s = computeBrokerStops({ ...base, side: 'BUY', fillPrice: 4000, profitTargetUsd: 30, maximumLossUsd: -50 });
    assert.equal(s.sl, 3950); assert.equal(s.tp, 4030);
  });
  it('commission tightens the SL and widens the TP so NET stays inside the budget', () => {
    const s = computeBrokerStops({ ...base, side: 'BUY', fillPrice: 4000, estimatedRoundTripCommissionUsd: 0.5 });
    assert.equal(s.sl, 3995.5); assert.equal(s.tp, 4003.5);
  });
  it('broker TP can be disabled (monitor-only profit exit); SL never can', () => {
    const s = computeBrokerStops({ ...base, side: 'BUY', fillPrice: 4000, brokerTakeProfit: false });
    assert.equal(s.tp, null); assert.equal(s.sl, 3995);
  });
  it('0.1 lot scales the price distance down 10x for the same USD budget', () => {
    const s = computeBrokerStops({ ...base, lot: 0.1, side: 'BUY', fillPrice: 4000 });
    assert.equal(s.sl, 3999.5); assert.equal(s.tp, 4000.3);
  });
});

describe('mt5Policy: actual P&L accounting', () => {
  it('net = gross + swap + entry commission + estimated exit commission', () => {
    assert.equal(estimateNetPnl({ grossProfit: 3.2, swap: -0.05, entryCommission: -0.1 }), 2.95);
    assert.equal(estimateNetPnl({ grossProfit: 3.2 }), 3.2);
  });
  it('realised P&L sums every deal of the position and identifies the exit deal', () => {
    const r = realizedFromDeals([
      { ticket: 1, entry: 0, profit: 0, commission: -0.1, swap: 0, fee: 0, time: 100 },
      { ticket: 2, entry: 1, profit: 3.3, commission: -0.1, swap: -0.02, fee: 0, time: 200, reason: 5 },
    ]);
    assert.equal(r.netPnl, 3.08); assert.equal(r.grossProfit, 3.3); assert.equal(r.commission, -0.2); assert.equal(r.exitDeal.ticket, 2); assert.equal(r.entryDeal.ticket, 1);
  });
});

describe('mt5Policy: daily counters', () => {
  it('rebuilds completed/realised/consecutive losses from exit deals of one UTC day only', () => {
    const day = '2026-09-25';
    const t = (h) => Date.parse(`${day}T${h}:00:00Z`) / 1000;
    const d = rebuildDailyFromDeals([
      { entry: 1, time: t('01'), profit: -5, commission: 0, swap: 0, fee: 0 },
      { entry: 0, time: t('02'), profit: 0 },
      { entry: 1, time: t('03'), profit: -4.8, commission: -0.2, swap: 0, fee: 0 },
      { entry: 1, time: t('04'), profit: 3, commission: 0, swap: 0, fee: 0 },
      { entry: 1, time: Date.parse('2026-09-24T23:00:00Z') / 1000, profit: 100 },
    ], day);
    assert.equal(d.completed, 3); assert.equal(d.realized_net_usd, -7); assert.equal(d.losses, 2); assert.equal(d.wins, 1); assert.equal(d.consecutive_losses, 0);
  });
  it('applyClosedTrade tracks consecutive losses and resets on a win; rollDaily resets on a new UTC day', () => {
    let d = rollDaily(null, NOW);
    d = applyClosedTrade(d, -5); d = applyClosedTrade(d, -5);
    assert.equal(d.consecutive_losses, 2);
    d = applyClosedTrade(d, 3);
    assert.equal(d.consecutive_losses, 0); assert.equal(d.completed, 3); assert.equal(d.realized_net_usd, -7);
    assert.equal(rollDaily(d, new Date('2026-09-26T00:00:01Z')).completed, 0);
    assert.equal(utcDay(NOW), '2026-09-25');
  });
});

describe('mt5Policy: evaluateEntry gates (any doubt => no trade)', () => {
  it('allows a clean, fresh, in-drift BUY with all safety inputs green', () => {
    const v = evaluateEntry(entryArgs());
    assert.equal(v.allowed, true); assert.equal(v.details.live_price, 4265.418); assert.equal(v.details.drift, 0.42);
  });
  const denies = [
    ['HALTED', { state: goodState({ halted: { reason: 'X' } }) }],
    ['KILL_SWITCH', { killSwitch: { active: true } }],
    ['DEMO_NOT_VERIFIED', { broker: { ...goodBroker(), demo_verified: false } }],
    ['DEMO_NOT_VERIFIED', { broker: null }],
    ['TERMINAL_NOT_CONNECTED', { broker: { ...goodBroker(), connected: false } }],
    ['ALGO_TRADING_DISABLED', { broker: { ...goodBroker(), algo_trading_enabled: false } }],
    ['PENDING_INTENT_UNRESOLVED', { state: goodState({ intent: { status: 'PENDING', signal_id: 'x' } }) }],
    ['NOT_ACTIONABLE', { signal: goodSignal({ action: 'WAIT' }) }],
    ['NO_SIGNAL_ID', { signal: goodSignal({ signal_id: null }) }],
    ['DUPLICATE_SIGNAL', { state: goodState({ executed_signals: { abc123def4567890: { status: 'EXECUTED' } } }) }],
    ['DUPLICATE_SIGNAL', { state: goodState({ executed_signals: { abc123def4567890: { status: 'SKIPPED', reason: 'ENTRY_DRIFT' } } }) }],
    ['INVALID_ENGINE_ENTRY', { signal: goodSignal({ entry: null }) }],
    ['INVALID_SIGNAL_TIME', { signal: goodSignal({ calculated_at: 'garbage' }) }],
    ['STALE_SIGNAL', { signal: goodSignal({ calculated_at: new Date(NOW.getTime() - 601_000).toISOString() }) }],
    ['SIGNAL_PREDATES_LAST_CLOSE', { state: goodState({ last_close_at: new Date(NOW.getTime() - 10_000).toISOString() }) }],
    ['POSITION_ALREADY_OPEN', { state: goodState({ position: { ticket: 1 } }) }],
    ['BROKER_POSITIONS_UNKNOWN', { brokerPositions: null }],
    ['BROKER_POSITION_ALREADY_OPEN', { brokerPositions: [{ ticket: 77 }] }],
    ['DAILY_TRADE_CEILING', { state: goodState({ daily: { day: '2026-09-25', completed: 150, realized_net_usd: 0, consecutive_losses: 0 } }) }],
    ['DAILY_LOSS_LIMIT', { state: goodState({ daily: { day: '2026-09-25', completed: 5, realized_net_usd: -25, consecutive_losses: 0 } }) }],
    ['CONSECUTIVE_LOSS_LIMIT', { state: goodState({ daily: { day: '2026-09-25', completed: 5, realized_net_usd: -20, consecutive_losses: 5 } }) }],
    ['QUOTE_UNAVAILABLE', { market: null }],
    ['STALE_QUOTE', { market: goodMarket({ tick_time: NOW.getTime() / 1000 - 120 }) }],
    ['SPREAD_TOO_WIDE', { market: goodMarket({ spread_price: 0.9 }) }],
    ['ENTRY_DRIFT', { market: goodMarket({ bid: 4268.0, ask: 4268.26 }) }],
    ['LOT_STEP_INVALID', { market: goodMarket({ volume_step: 0.1 }) }],
  ];
  for (const [reason, over] of denies) {
    it(`denies with ${reason}`, () => {
      const v = evaluateEntry(entryArgs(over));
      assert.equal(v.allowed, false, `expected deny, got ${JSON.stringify(v)}`);
      assert.equal(v.reason, reason);
    });
  }
  it('ENTRY_DRIFT uses ask for BUY and bid for SELL, and is configurable', () => {
    const buy = evaluateEntry(entryArgs({ signal: goodSignal({ entry: 4263.5 }) }));
    assert.equal(buy.reason, 'OK'); assert.equal(buy.details.drift, 1.92);
    const sell = evaluateEntry(entryArgs({ signal: goodSignal({ action: 'SELL', entry: 4263.1 }) }));
    assert.equal(sell.reason, 'ENTRY_DRIFT'); assert.equal(sell.details.live_price, 4265.158);
    const wide = evaluateEntry(entryArgs({ config: baseConfig({ XAUUSD_MT5_MAX_ENTRY_DRIFT_USD: '5' }), signal: goodSignal({ action: 'SELL', entry: 4263.1 }) }));
    assert.equal(wide.allowed, true);
  });
  it('a daily counter from a previous UTC day does not block today', () => {
    const v = evaluateEntry(entryArgs({ state: goodState({ daily: { day: '2026-09-24', completed: 150, realized_net_usd: -100, consecutive_losses: 9 } }) }));
    assert.equal(v.allowed, true);
  });
});

describe('mt5Policy: evaluateExit (actual net P&L authority)', () => {
  const t = { profitTargetUsd: 3, maximumLossUsd: -5 };
  it('closes at >= +3 and <= -5, holds in between, kill "close" overrides', () => {
    assert.equal(evaluateExit({ ...t, netPnl: 3.0 }).reason, 'TAKE_PROFIT_BUDGET');
    assert.equal(evaluateExit({ ...t, netPnl: 2.99 }).close, false);
    assert.equal(evaluateExit({ ...t, netPnl: -5.0 }).reason, 'STOP_LOSS_BUDGET');
    assert.equal(evaluateExit({ ...t, netPnl: -4.99 }).close, false);
    assert.equal(evaluateExit({ ...t, netPnl: NaN }).reason, 'PNL_UNKNOWN');
    assert.equal(evaluateExit({ ...t, netPnl: 0.1, killSwitch: { active: true, close: true } }).reason, 'KILL_SWITCH_CLOSE');
    assert.equal(evaluateExit({ ...t, netPnl: 0.1, killSwitch: { active: true, close: false } }).close, false);
  });
  it('100 USD budget thresholds: +30 / -50', () => {
    assert.equal(evaluateExit({ profitTargetUsd: 30, maximumLossUsd: -50, netPnl: 30 }).close, true);
    assert.equal(evaluateExit({ profitTargetUsd: 30, maximumLossUsd: -50, netPnl: -49.9 }).close, false);
    assert.equal(evaluateExit({ profitTargetUsd: 30, maximumLossUsd: -50, netPnl: -50 }).close, true);
  });
});

describe('mt5Policy: order comment round-trip', () => {
  it('encodes and decodes the signal id within MT5 comment limits', () => {
    const c = buildOrderComment('979c1e71c587928d');
    assert.equal(c, 'MCP:979c1e71c587928d'); assert.ok(c.length <= 31);
    assert.equal(signalIdFromComment(c), '979c1e71c587928d');
    assert.equal(signalIdFromComment('manual trade'), null);
  });
});
