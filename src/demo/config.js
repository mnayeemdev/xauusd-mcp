/**
 * STAGE 12 DEMO PARITY CONFIGURATION. The DEMO validator must run the SAME approved production logic with
 * the only intended difference being the execution destination. This module derives the DEMO executor
 * config from the existing DEMO policy (src/engine/mt5Policy.js, identity 480236873 / Exness-MT5Trial11,
 * mode 'demo') and copies the strategy-relevant, NON-identity settings from the REAL policy's resolved
 * defaults (monetary envelope, breaker, thesis exit, minimum RR, broker structural SL multiple, exact lot,
 * News Protection V2 + shock parameters). Identity, magic, bridge and state stay DEMO. Nothing here can
 * change the REAL configuration: it only reads resolveRealExecutorConfig({}) defaults.
 */
import { resolveExecutorConfig } from '../engine/mt5Policy.js';
import { resolveRealExecutorConfig } from '../engine/mt5RealPolicy.js';
import { DEMO_IDENTITY } from './identityGuard.js';

export const DEMO_MAGIC_STAGE12 = 88051512; // Stage 12 validator's own magic: never the REAL magic, never the Stage-1 demo magic
export const PARITY_FIELDS = Object.freeze(['profitTargetUsd', 'maximumLossUsd', 'maxConsecutiveLosses', 'maxTradesPerDay', 'maxSignalAgeSec', 'maxQuoteAgeSec', 'maxSpreadUsd', 'maxEntryDriftUsd', 'deviationPoints', 'brokerTakeProfit', 'thesisExit', 'minEffectiveRr', 'brokerStructuralSlMultiple', 'exactLot', 'sizingMode', 'newsProtection', 'newsProvider', 'newsCalendarUrl', 'newsCalendarFile', 'newsFetchIntervalSec', 'newsDataUnavailablePolicy', 'newsRiskParams', 'shockParams']);

export function buildDemoParityConfig(env = process.env) {
  const real = resolveRealExecutorConfig({}); // REAL defaults are the parity reference (never the REAL identity)
  const demoEnv = { ...env, XAUUSD_MT5_LOGIN: String(DEMO_IDENTITY.login), XAUUSD_MT5_SERVER: DEMO_IDENTITY.server, XAUUSD_MT5_SYMBOL: DEMO_IDENTITY.symbol, XAUUSD_MT5_MAGIC: String(DEMO_MAGIC_STAGE12), XAUUSD_MT5_LOT_SIZE: '0.01', XAUUSD_MT5_MAX_LOT_SIZE: '0.01',
    XAUUSD_MT5_TRADE_BUDGET_USD: '100', XAUUSD_MT5_TAKE_PROFIT_PERCENT: '30', XAUUSD_MT5_STOP_LOSS_PERCENT: '50', // => +30 / -50 USD, the REAL monetary envelope
    XAUUSD_MT5_MAX_CONSECUTIVE_LOSSES: String(real.maxConsecutiveLosses), XAUUSD_MT5_MAX_TRADES_PER_DAY: String(real.maxTradesPerDay), XAUUSD_MT5_DAILY_LOSS_LIMIT_USD: '1000000', // REAL has no daily-loss lock (null); the DEMO policy requires a positive number, so it is set beyond reach and documented
    XAUUSD_MT5_MAX_SPREAD_USD: String(real.maxSpreadUsd), XAUUSD_MT5_MAX_ENTRY_DRIFT_USD: String(real.maxEntryDriftUsd), XAUUSD_MT5_DEVIATION_POINTS: String(real.deviationPoints) };
  for (const k of Object.keys(demoEnv)) if (/^XAUUSD_MT5_REAL_/.test(k)) delete demoEnv[k]; // REAL env never leaks into the DEMO config
  const demo = resolveExecutorConfig(demoEnv, { mode: 'demo' });
  const cfg = { ...demo,
    thesisExit: real.thesisExit, minEffectiveRr: real.minEffectiveRr, brokerStructuralSlMultiple: real.brokerStructuralSlMultiple, exactLot: DEMO_IDENTITY.lot, sizingMode: 'fixed_user_lot',
    newsProtection: real.newsProtection, newsProvider: real.newsProvider, newsCalendarUrl: real.newsCalendarUrl, newsCalendarFile: real.newsCalendarFile, newsFetchIntervalSec: real.newsFetchIntervalSec, newsDataUnavailablePolicy: real.newsDataUnavailablePolicy, newsRiskParams: real.newsRiskParams, shockParams: real.shockParams,
    account_class: 'DEMO', stage: 'STAGE12_DEMO_FORWARD_VALIDATION' };
  if (cfg.mode !== 'demo' || cfg.login !== DEMO_IDENTITY.login || cfg.server !== DEMO_IDENTITY.server || cfg.symbol !== DEMO_IDENTITY.symbol || cfg.lotSize !== 0.01 || cfg.maxLotSize !== 0.01 || cfg.exactLot !== 0.01) throw new Error('DEMO parity config integrity failure');
  if (cfg.magic === real.magic) throw new Error('DEMO magic must differ from the REAL magic');
  if (cfg.computeSizing !== undefined || cfg.real_profile !== undefined) throw new Error('DEMO config must not carry REAL-only sizing/profile markers');
  return Object.freeze(cfg);
}

/** Field-by-field comparison of the strategy-relevant settings against the REAL defaults (for tests and the report). */
export function parityReport(cfg = buildDemoParityConfig({})) {
  const real = resolveRealExecutorConfig({}); const rows = {};
  for (const f of PARITY_FIELDS) { const a = JSON.stringify(cfg[f] ?? null), b = JSON.stringify(real[f] ?? null); rows[f] = { demo: cfg[f] ?? null, real: real[f] ?? null, equal: a === b }; }
  rows.dailyLossLimitUsd = { demo: cfg.dailyLossLimitUsd, real: real.dailyLossLimitUsd, equal: real.dailyLossLimitUsd == null && cfg.dailyLossLimitUsd >= 1000000, note: 'REAL: disabled (null); DEMO policy needs a positive number, set beyond reach' };
  const identity = { login: { demo: cfg.login, real: real.login, must_differ: cfg.login !== real.login }, server: { demo: cfg.server, real: real.server, must_differ: cfg.server !== real.server }, magic: { demo: cfg.magic, real: real.magic, must_differ: cfg.magic !== real.magic }, lot: { demo: cfg.lotSize, real: real.lotSize, equal: cfg.lotSize === real.lotSize } };
  return { all_parity_fields_equal: Object.values(rows).every((r) => r.equal), rows, identity };
}
