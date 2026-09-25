/**
 * MT5 REAL policy (src/engine/mt5RealPolicy.js): identity hard locks, the
 * user-fixed 0.01 lot, margin safety as a VETO only, monetary envelope,
 * arming, and isolation from the DEMO policy.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRealExecutorConfig, isRealArmed, assessRealLot, chooseRealLot, realBridgeEnv, REAL_ACCOUNT, REAL_MAGIC, DEMO_MAGIC, REAL_FIXED_LOT, REAL_ABSOLUTE_LOT_CEILING, REAL_ARM_ENV, REAL_ARM_TOKEN, REAL_STATE_PATH, REAL_LOG_PATH, REAL_KILL_SWITCH_PATH, DEFAULT_REAL_BRIDGE_SCRIPT } from '../src/engine/mt5RealPolicy.js';
import { resolveExecutorConfig, MT5_DEFAULTS, evaluateEntry } from '../src/engine/mt5Policy.js';
import { DEFAULT_MT5_STATE_PATH, DEFAULT_MT5_LOG_PATH, DEFAULT_KILL_SWITCH_PATH } from '../src/engine/mt5Executor.js';
import { readFileSync } from 'node:fs';

describe('mt5RealPolicy: hard-locked identity and the user-fixed lot', () => {
  it('defaults: login 460149329, Exness-MT5Real51, XAUUSDm, real magic, lot EXACTLY 0.01 (lotSize = maxLotSize = exactLot), +30/-50, thesis exit on', () => {
    const c = resolveRealExecutorConfig({});
    assert.equal(c.mode, 'real'); assert.equal(c.real_profile, true); assert.equal(c.sizingMode, 'fixed_user_lot');
    assert.equal(c.login, 460149329); assert.equal(c.server, 'Exness-MT5Real51'); assert.equal(c.symbol, 'XAUUSDm');
    assert.equal(c.magic, REAL_MAGIC); assert.notEqual(c.magic, DEMO_MAGIC); assert.notEqual(c.magic, MT5_DEFAULTS.magic);
    assert.equal(c.lotSize, 0.01); assert.equal(c.maxLotSize, 0.01); assert.equal(c.exactLot, 0.01); assert.equal(REAL_FIXED_LOT, 0.01); assert.equal(REAL_ABSOLUTE_LOT_CEILING, 0.01);
    assert.equal(c.profitTargetUsd, 30); assert.equal(c.maximumLossUsd, -50);
    assert.equal(c.thesisExit, true); assert.equal(c.minEffectiveRr, 1.7); assert.equal(c.brokerStructuralSlMultiple, 1.5);
    assert.equal(c.computeSizing, undefined, 'no automatic lot scaling is attached');
    assert.equal(typeof c.assessSafety, 'function');
    assert.equal(c.maxTradesPerDay, 10); assert.equal(c.dailyLossLimitUsd, null, 'no calendar-day loss lock'); assert.equal(c.maxConsecutiveLosses, 2);
    assert.ok(Object.isFrozen(c));
  });
  it('0.02, 0.03, 0.10, 1.0 and any non-0.01 lot restatement are rejected under every lot env name', () => {
    for (const k of ['XAUUSD_MT5_REAL_LOT_SIZE', 'XAUUSD_MT5_REAL_LOT_CAP', 'XAUUSD_MT5_REAL_LOT']) {
      for (const v of ['0.02', '0.03', '0.10', '1.0', '0.005', '0', '-0.01']) assert.throws(() => resolveRealExecutorConfig({ [k]: v }), /user-locked to exactly 0.01/, `${k}=${v}`);
      assert.equal(resolveRealExecutorConfig({ [k]: '0.01' }).lotSize, 0.01, 'restating 0.01 is accepted');
    }
    for (const k of ['XAUUSD_MT5_REAL_MAX_LOT_SIZE', 'XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING', 'XAUUSD_MT5_REAL_MAGIC']) assert.throws(() => resolveRealExecutorConfig({ [k]: '1' }), /not permitted/, k);
  });
  it('wrong real login / server / symbol restatements are rejected, never applied', () => {
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_LOGIN: '480236873' }), /does not match the locked REAL login/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_SERVER: 'Exness-MT5Trial11' }), /does not match the locked REAL server/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_SERVER: 'Exness-MT5Real7' }), /does not match the locked REAL server/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_SYMBOL: 'XAUUSD' }), /does not match the locked REAL symbol/);
    assert.equal(resolveRealExecutorConfig({ XAUUSD_MT5_REAL_LOGIN: '460149329', XAUUSD_MT5_REAL_SERVER: 'Exness-MT5Real51', XAUUSD_MT5_REAL_SYMBOL: 'XAUUSDm' }).login, 460149329);
  });
  it('monetary targets are configurable within hard ranges and reported; protections cannot be lowered', () => {
    const c = resolveRealExecutorConfig({ XAUUSD_MT5_REAL_PROFIT_TARGET_USD: '20', XAUUSD_MT5_REAL_MAXIMUM_LOSS_USD: '-25' });
    assert.equal(c.profitTargetUsd, 20); assert.equal(c.maximumLossUsd, -25);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_MAXIMUM_LOSS_USD: '25' }), /within \[-1000, 0\)/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_PROFIT_TARGET_USD: '0' }), /within \(0, 1000\]/);
    assert.throws(() => resolveRealExecutorConfig({ XAUUSD_MT5_REAL_BROKER_STRUCTURAL_SL_MULTIPLE: '5' }), /within \[1.0, 3.0\]/);
  });
  it('the DEMO policy still refuses "real" and the REAL policy cannot produce a demo config', () => {
    assert.throws(() => resolveExecutorConfig({}, { mode: 'real' }), /only "demo" exists/);
    assert.equal(resolveExecutorConfig({}, { mode: 'demo' }).mode, 'demo');
    assert.equal(resolveRealExecutorConfig({}).mode, 'real');
  });
  it('the python REAL bridge independently requires exactly 0.01 (source assertion)', () => {
    const src = readFileSync(DEFAULT_REAL_BRIDGE_SCRIPT, 'utf8');
    assert.match(src, /REQUIRED_EXACT_VOLUME = 0\.01/);
    assert.match(src, /abs\(volume - REQUIRED_EXACT_VOLUME\) > 1e-9/);
    assert.match(src, /ABSOLUTE_MAX_VOLUME = REQUIRED_EXACT_VOLUME/);
    assert.doesNotMatch(src, /demo_verified/);
  });
});

describe('mt5RealPolicy: margin safety is a VETO, never a resize', () => {
  const account = { equity: 121.94, margin_free: 121.94, leverage: 200, margin_so_call: 60, margin_so_so: 0 };
  const market = { ask: 4274.36, bid: 4274.12, contract_size: 100, spread_price: 0.24 };
  it('at the live account 0.01 is executable: 21.37 margin, 17.5% of equity, margin level 337% at -50', () => {
    const a = resolveRealExecutorConfig({}).assessSafety({ account, market });
    assert.equal(a.lot, 0.01); assert.equal(a.executable, true);
    assert.equal(a.margin_required_usd, 21.37); assert.ok(Math.abs(a.margin_level_at_max_loss_pct - 336.6) < 0.1, String(a.margin_level_at_max_loss_pct));
    assert.equal(a.pnl_per_usd_move, 1); assert.equal(a.target_distance_usd, 30); assert.equal(a.loss_distance_usd, 50);
  });
  it('when 0.01 is unsafe the assessment says so with reasons and the lot is NOT changed', () => {
    const c = resolveRealExecutorConfig({});
    const low = c.assessSafety({ account: { ...account, equity: 40, margin_free: 40 }, market });
    assert.equal(low.executable, false); assert.equal(low.lot, 0.01); assert.ok(low.reasons.includes('EQUITY_EXHAUSTED_BEFORE_MAX_LOSS'));
    const noMargin = c.assessSafety({ account: { ...account, margin_free: 5 }, market });
    assert.equal(noMargin.executable, false); assert.ok(noMargin.reasons.includes('MARGIN_EXCEEDS_FREE_MARGIN'));
    const lowLev = c.assessSafety({ account: { ...account, leverage: 20 }, market });
    assert.equal(lowLev.executable, false);
    assert.equal(c.assessSafety({ account: { ...account, leverage: null }, market }).executable, false);
  });
  it('chooseRealLot() is reporting-only and can never exceed 0.01; a broker-safe 0.02 cannot become the executed lot', () => {
    const best = chooseRealLot({ price: 4274, leverage: 2000, equity: 100000, spreadUsd: 0.24 });
    assert.equal(best.lot, 0.01);
    assert.equal(assessRealLot({ lot: 0.02, price: 4274, leverage: 2000, equity: 100000, spreadUsd: 0.24 }).reasons.includes('ABOVE_LOT_CEILING'), true);
  });
});

describe('mt5RealPolicy: arming, bridge env, isolation', () => {
  it('arming requires the exact token; anything else is unarmed', () => {
    assert.equal(isRealArmed({}), false);
    assert.equal(isRealArmed({ [REAL_ARM_ENV]: 'yes' }), false);
    assert.equal(isRealArmed({ [REAL_ARM_ENV]: REAL_ARM_TOKEN.toLowerCase() }), false);
    assert.equal(isRealArmed({ [REAL_ARM_ENV]: REAL_ARM_TOKEN }), true);
  });
  it('bridge env pins the REAL identity and the 0.01 cap under REAL-specific names regardless of DEMO variables', () => {
    const env = realBridgeEnv({ XAUUSD_MT5_LOGIN: '480236873', XAUUSD_MT5_SERVER: 'Exness-MT5Trial11', XAUUSD_MT5_BRIDGE_HARD_MAX_VOLUME: '5', XAUUSD_MT5_REAL_BRIDGE_HARD_MAX_VOLUME: '2' });
    assert.equal(env.XAUUSD_MT5_REAL_LOGIN, '460149329');
    assert.equal(env.XAUUSD_MT5_REAL_SERVER, 'Exness-MT5Real51');
    assert.equal(env.XAUUSD_MT5_REAL_SYMBOL, 'XAUUSDm');
    assert.equal(env.XAUUSD_MT5_REAL_BRIDGE_HARD_MAX_VOLUME, '0.01');
  });
  it('DEMO and REAL state, log, kill-switch, bridge script and magic never collide', () => {
    assert.notEqual(REAL_STATE_PATH, DEFAULT_MT5_STATE_PATH);
    assert.notEqual(REAL_LOG_PATH, DEFAULT_MT5_LOG_PATH);
    assert.notEqual(REAL_KILL_SWITCH_PATH, DEFAULT_KILL_SWITCH_PATH);
    assert.match(DEFAULT_REAL_BRIDGE_SCRIPT, /mt5_bridge_real\.py$/);
    assert.notEqual(REAL_MAGIC, MT5_DEFAULTS.magic);
    assert.deepEqual(REAL_ACCOUNT, { login: 460149329, server: 'Exness-MT5Real51', symbol: 'XAUUSDm' });
  });
  it('evaluateEntry: a REAL config never accepts a demo_verified broker, a DEMO config never accepts a real_verified broker', () => {
    const real = resolveRealExecutorConfig({});
    const demo = resolveExecutorConfig({}, { mode: 'demo' });
    const base = { state: { executed_signals: {} }, signal: { signal_id: 'a', action: 'BUY', entry: 1, calculated_at: new Date().toISOString() }, market: null, brokerPositions: [], killSwitch: { active: false }, now: new Date() };
    assert.equal(evaluateEntry({ ...base, config: real, broker: { demo_verified: true, real_verified: false, connected: true, algo_trading_enabled: true } }).reason, 'REAL_NOT_VERIFIED');
    assert.equal(evaluateEntry({ ...base, config: demo, broker: { demo_verified: false, real_verified: true, connected: true, algo_trading_enabled: true } }).reason, 'DEMO_NOT_VERIFIED');
  });
});
