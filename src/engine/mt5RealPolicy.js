/**
 * MT5 REAL execution policy -- a SEPARATE profile from the DEMO policy
 * (src/engine/mt5Policy.js, whose demo behaviour is untouched). PURE.
 *
 * Identity hard locks (code, never env):
 *   login 460149329, server Exness-MT5Real51, trade mode REAL, symbol XAUUSDm,
 *   magic 88052001 (isolated from DEMO 88051501).
 *
 * LOT (user authority, 2026-09-25): EXACTLY 0.01. Not a cap, not a default --
 * the only volume a REAL order may carry. Enforced here (config), in the
 * executor (volume must equal `exactLot`), and independently in
 * mt5/mt5_bridge_real.py (REQUIRED_EXACT_VOLUME). Margin/broker safety is a
 * VETO only (`assessSafety`): if 0.01 is unsafe the trade is refused and
 * reported; the lot is never reduced, raised or guessed. No automatic lot
 * scaling exists; src/engine/mt5RealScaling.js is NOT wired into this profile
 * and may only ever be attached for MONETARY targets under an explicitly
 * user-approved policy.
 *
 * Monetary envelope (configurable, reported, never silently changed):
 *   profit target +30 USD actual position P&L, maximum loss -50 USD.
 * Post-entry, the executor also enforces STRUCTURAL thesis invalidation
 * (`thesisExit`) and an executable-geometry RR recheck (`minEffectiveRr`), and
 * derives the broker fail-safe SL from the engine's structural stop
 * (`brokerStructuralSlMultiple`) so the crash protection is not knowingly five
 * times wider than the thesis. See docs/XAUUSD_MT5_REAL_EXECUTION.md.
 */
import { fileURLToPath } from 'node:url';
import { FOREX_FACTORY_WEEKLY_JSON_URL, PROVIDER_KINDS } from './newsMonitor.js';
import { SHOCK_PARAMS } from './marketShock.js';

export const REAL_ACCOUNT = Object.freeze({ login: 460149329, server: 'Exness-MT5Real51', symbol: 'XAUUSDm' });
export const REAL_MAGIC = 88052001;
export const DEMO_MAGIC = 88051501; // for isolation assertions only
export const REAL_FIXED_LOT = 0.01; // user-selected; mirrors REQUIRED_EXACT_VOLUME in mt5/mt5_bridge_real.py
export const REAL_ABSOLUTE_LOT_CEILING = REAL_FIXED_LOT; // bridge ABSOLUTE_MAX_VOLUME
export const REAL_STAGE1_LOT_CEILING = REAL_FIXED_LOT; // kept for older imports; identical to the fixed lot
export const REAL_ARM_ENV = 'XAUUSD_MT5_REAL_ARMED';
export const REAL_ARM_TOKEN = 'ARM_REAL_460149329_STAGE1';

export const REAL_STATE_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_real_executor_state.json', import.meta.url));
export const REAL_LOG_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_real_trade_log.jsonl', import.meta.url));
export const REAL_KILL_SWITCH_PATH = fileURLToPath(new URL('../../state/xauusd_mt5_real_kill_switch', import.meta.url));
export const DEFAULT_REAL_BRIDGE_SCRIPT = fileURLToPath(new URL('../../mt5/mt5_bridge_real.py', import.meta.url));

export const REAL_DEFAULTS = Object.freeze({
  mode: 'real',
  real_profile: true,
  sizingMode: 'fixed_user_lot',
  login: REAL_ACCOUNT.login,
  server: REAL_ACCOUNT.server,
  symbol: REAL_ACCOUNT.symbol,
  magic: REAL_MAGIC,
  lotSize: REAL_FIXED_LOT,
  maxLotSize: REAL_FIXED_LOT,
  exactLot: REAL_FIXED_LOT, // executor refuses any other volume
  // Monetary envelope (actual position P&L). Configurable, reported, never silently changed.
  tradeBudgetUsd: 100, // reference only
  profitTargetUsd: 30,
  maximumLossUsd: -50,
  takeProfitPercent: 30, // display only
  stopLossPercent: 50, // display only
  // Post-entry protections.
  thesisExit: true, // structural/thesis invalidation exit on confirmed evidence
  minEffectiveRr: 1.7, // executable-geometry RR recheck before send and after fill
  brokerStructuralSlMultiple: 1.5, // broker fail-safe SL = min(monetary, structural risk x this + spread)
  // Entry guards.
  maxEntryDriftUsd: 2.0,
  maxSpreadUsd: 0.6,
  deviationPoints: 300,
  maxTradesPerDay: 10, // ceiling, never a target; absolute cap 150
  dailyLossLimitUsd: null, // DISABLED (policy 2026-09-25): a realised loss must not impose a calendar-day entry lock; consecutive-loss breaker + kill switch remain
  maxConsecutiveLosses: 2,
  maxSignalAgeSec: 600,
  maxQuoteAgeSec: 90,
  monitorIntervalMs: 3000,
  brokerTakeProfit: true,
  estimatedCommissionPerSideUsd: 0,
  // Margin safety VETO parameters (never resize).
  marginBudgetPctOfEquity: 50,
  marginCallBufferPct: 10,
  // NEWS + VOLATILITY SHOCK PROTECTION V1 (2026-09-25): a safety/context layer
  // on top of the unchanged intraday_5m entry authority. It only vetoes NEW
  // orders and adds risk-only emergency handling; it never produces a
  // direction and never closes a position because of news alone.
  // See docs/XAUUSD_NEWS_SHOCK_PROTECTION.md for the justification of each default.
  newsProtection: true, // cannot be disabled for the REAL profile (provider 'none' => state DISABLED, still audited)
  newsProvider: 'http_json', // http_json | file | none
  newsCalendarUrl: FOREX_FACTORY_WEEKLY_JSON_URL,
  newsCalendarFile: null,
  newsFetchIntervalSec: 900,
  newsPreWindowMin: 30,
  newsActiveWindowMin: 5,
  newsCooldownMin: 30,
  newsStaleSec: 6 * 3600,
  newsDataUnavailablePolicy: 'BLOCK', // BLOCK | ALLOW (ALLOW still audits every entry as NEWS_DATA_UNAVAILABLE)
  // NEWS PROTECTION V2 (2026-09-26, docs/XAUUSD_NEWS_PROTECTION_V2_SPEC.md): tiered SAFETY windows
  // from the V5 magnitude evidence. Tier B = CPI/NFP, Tier A = FOMC cluster, Tier C = V1 generic.
  newsTierBCooldownMin: 55,
  newsTierAPostMin: 150,
  newsTierAPressConfCoverMin: 90,
  newsTierAClusterGapMin: 120,
  newsNormalizationRatio: 1.5,
  newsNormalizationConfirmBars: 2,
  newsNormalizationMaxExtensionMin: 0, // extension OFF by default (shadow-audited); enable only with an unbiased baseline, see docs/XAUUSD_NEWS_PROTECTION_V2.md
  shockClearAfterSec: SHOCK_PARAMS.clearAfterSec,
});

// Tunable ONLY within hard ranges. Monetary targets are configurable by design (PART 12).
const ENV_MAP = Object.freeze({
  XAUUSD_MT5_REAL_PROFIT_TARGET_USD: ['profitTargetUsd', 'number'],
  XAUUSD_MT5_REAL_MAXIMUM_LOSS_USD: ['maximumLossUsd', 'number'],
  XAUUSD_MT5_REAL_MAX_TRADES_PER_DAY: ['maxTradesPerDay', 'int'],
  XAUUSD_MT5_REAL_MAX_CONSECUTIVE_LOSSES: ['maxConsecutiveLosses', 'int'],
  XAUUSD_MT5_REAL_MAX_SPREAD_USD: ['maxSpreadUsd', 'number'],
  XAUUSD_MT5_REAL_MAX_ENTRY_DRIFT_USD: ['maxEntryDriftUsd', 'number'],
  XAUUSD_MT5_REAL_COMMISSION_PER_SIDE_USD: ['estimatedCommissionPerSideUsd', 'number'],
  XAUUSD_MT5_REAL_DAILY_LOSS_LIMIT_USD: ['dailyLossLimitUsd', 'number'],
  XAUUSD_MT5_REAL_BROKER_STRUCTURAL_SL_MULTIPLE: ['brokerStructuralSlMultiple', 'number'],
  XAUUSD_NEWS_FETCH_INTERVAL_SEC: ['newsFetchIntervalSec', 'int'],
  XAUUSD_NEWS_PRE_WINDOW_MIN: ['newsPreWindowMin', 'number'],
  XAUUSD_NEWS_ACTIVE_WINDOW_MIN: ['newsActiveWindowMin', 'number'],
  XAUUSD_NEWS_COOLDOWN_MIN: ['newsCooldownMin', 'number'],
  XAUUSD_NEWS_STALE_SEC: ['newsStaleSec', 'int'],
  XAUUSD_SHOCK_CLEAR_AFTER_SEC: ['shockClearAfterSec', 'int'],
  XAUUSD_NEWS_TIER_B_COOLDOWN_MIN: ['newsTierBCooldownMin', 'number'],
  XAUUSD_NEWS_TIER_A_POST_MIN: ['newsTierAPostMin', 'number'],
  XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN: ['newsTierAPressConfCoverMin', 'number'],
  XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN: ['newsTierAClusterGapMin', 'number'],
  XAUUSD_NEWS_NORMALIZATION_RATIO: ['newsNormalizationRatio', 'number'],
  XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS: ['newsNormalizationConfirmBars', 'int'],
  XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN: ['newsNormalizationMaxExtensionMin', 'number'],
});
// String-valued news configuration (validated below).
const STRING_ENV_MAP = Object.freeze({
  XAUUSD_NEWS_PROVIDER: 'newsProvider',
  XAUUSD_NEWS_CALENDAR_URL: 'newsCalendarUrl',
  XAUUSD_NEWS_CALENDAR_FILE: 'newsCalendarFile',
  XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY: 'newsDataUnavailablePolicy',
});

// Env keys that would try to move the hard-locked identity/lot values are REJECTED, not applied.
const FORBIDDEN_ENV = Object.freeze(['XAUUSD_MT5_REAL_LOGIN_OVERRIDE', 'XAUUSD_MT5_REAL_SERVER_OVERRIDE', 'XAUUSD_MT5_REAL_SYMBOL_OVERRIDE', 'XAUUSD_MT5_REAL_MAGIC', 'XAUUSD_MT5_REAL_MAX_LOT_SIZE', 'XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING', 'XAUUSD_MT5_REAL_MAX_LOSS_PCT_OF_EQUITY', 'XAUUSD_MT5_REAL_MARGIN_BUDGET_PCT']);
// A lot restatement is accepted ONLY when it equals the fixed lot.
const LOT_ENV = Object.freeze(['XAUUSD_MT5_REAL_LOT_SIZE', 'XAUUSD_MT5_REAL_LOT_CAP', 'XAUUSD_MT5_REAL_LOT']);

function parseTyped(raw, type, key) {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${key} must be numeric, got "${raw}"`);
  if (type === 'int' && !Number.isInteger(n)) throw new Error(`${key} must be an integer, got "${raw}"`);
  return n;
}

/** Fail-closed config for the REAL profile. Throws on ANY deviation from the envelope. */
export function resolveRealExecutorConfig(env = {}) {
  for (const k of FORBIDDEN_ENV) if (env[k] !== undefined && env[k] !== '') throw new Error(`${k} is not permitted: the REAL profile identity and lot are hard-locked in code`);
  for (const k of LOT_ENV) {
    if (env[k] !== undefined && env[k] !== '' && Math.abs(Number(env[k]) - REAL_FIXED_LOT) > 1e-9) {
      throw new Error(`${k}="${env[k]}" rejected: the REAL lot is user-locked to exactly ${REAL_FIXED_LOT}; no automatic or configured lot change is permitted without explicit user approval`);
    }
  }
  if (env.XAUUSD_MT5_REAL_LOGIN !== undefined && env.XAUUSD_MT5_REAL_LOGIN !== '' && Number(env.XAUUSD_MT5_REAL_LOGIN) !== REAL_ACCOUNT.login) throw new Error(`XAUUSD_MT5_REAL_LOGIN "${env.XAUUSD_MT5_REAL_LOGIN}" does not match the locked REAL login ${REAL_ACCOUNT.login}`);
  if (env.XAUUSD_MT5_REAL_SERVER !== undefined && env.XAUUSD_MT5_REAL_SERVER !== '' && env.XAUUSD_MT5_REAL_SERVER !== REAL_ACCOUNT.server) throw new Error(`XAUUSD_MT5_REAL_SERVER "${env.XAUUSD_MT5_REAL_SERVER}" does not match the locked REAL server ${REAL_ACCOUNT.server}`);
  if (env.XAUUSD_MT5_REAL_SYMBOL !== undefined && env.XAUUSD_MT5_REAL_SYMBOL !== '' && env.XAUUSD_MT5_REAL_SYMBOL !== REAL_ACCOUNT.symbol) throw new Error(`XAUUSD_MT5_REAL_SYMBOL "${env.XAUUSD_MT5_REAL_SYMBOL}" does not match the locked REAL symbol ${REAL_ACCOUNT.symbol}`);

  const cfg = { ...REAL_DEFAULTS };
  for (const [envKey, [field, type]] of Object.entries(ENV_MAP)) {
    if (env[envKey] !== undefined && env[envKey] !== '') cfg[field] = parseTyped(env[envKey], type, envKey);
  }

  if (cfg.mode !== 'real' || cfg.real_profile !== true || cfg.sizingMode !== 'fixed_user_lot') throw new Error('REAL config integrity failure');
  if (cfg.login !== REAL_ACCOUNT.login) throw new Error('REAL login integrity failure');
  if (cfg.server !== REAL_ACCOUNT.server || /trial|demo/i.test(cfg.server)) throw new Error(`REAL server "${cfg.server}" is not the locked real server`);
  if (cfg.symbol !== REAL_ACCOUNT.symbol) throw new Error('REAL symbol integrity failure');
  if (cfg.magic === DEMO_MAGIC || cfg.magic !== REAL_MAGIC) throw new Error('REAL magic must be the isolated real magic');
  if (cfg.lotSize !== REAL_FIXED_LOT || cfg.maxLotSize !== REAL_FIXED_LOT || cfg.exactLot !== REAL_FIXED_LOT) throw new Error('REAL lot integrity failure');
  if (!(cfg.profitTargetUsd > 0 && cfg.profitTargetUsd <= 1000)) throw new Error('REAL profit target must be within (0, 1000] USD');
  if (!(cfg.maximumLossUsd < 0 && cfg.maximumLossUsd >= -1000)) throw new Error('REAL maximum loss must be within [-1000, 0) USD');
  if (!(cfg.minEffectiveRr >= 1.7)) throw new Error('REAL minimum effective RR may not be lowered below 1.7');
  if (!(cfg.brokerStructuralSlMultiple >= 1.0 && cfg.brokerStructuralSlMultiple <= 3.0)) throw new Error('REAL broker structural SL multiple must be within [1.0, 3.0]');
  if (cfg.thesisExit !== true) throw new Error('REAL thesis exit cannot be disabled');
  if (!(cfg.maxTradesPerDay >= 0 && cfg.maxTradesPerDay <= 150)) throw new Error('REAL MaxTradesPerDay must be within [0, 150]');
  if (!(cfg.maxConsecutiveLosses >= 1 && cfg.maxConsecutiveLosses <= 5)) throw new Error('REAL MaxConsecutiveLosses must be within [1, 5]');
  if (cfg.dailyLossLimitUsd !== null && !(cfg.dailyLossLimitUsd > 0)) throw new Error('REAL daily loss limit, when set, must be positive');
  if (!(cfg.maxSpreadUsd > 0 && cfg.maxSpreadUsd <= 1.0)) throw new Error('REAL MaxSpreadUSD must be within (0, 1.0]');
  if (!(cfg.maxEntryDriftUsd >= 0 && cfg.maxEntryDriftUsd <= 3.0)) throw new Error('REAL MaxEntryDriftUSD must be within [0, 3.0]');
  if (!(cfg.estimatedCommissionPerSideUsd >= 0 && cfg.estimatedCommissionPerSideUsd < 10)) throw new Error('REAL commission estimate out of range');

  // NEWS + SHOCK protection configuration (hard ranges; the layer itself cannot be switched off).
  for (const [envKey, field] of Object.entries(STRING_ENV_MAP)) {
    if (env[envKey] !== undefined && env[envKey] !== '') cfg[field] = String(env[envKey]).trim();
  }
  if (env.XAUUSD_NEWS_PROTECTION !== undefined && env.XAUUSD_NEWS_PROTECTION !== '' && !/^(1|true|on)$/i.test(String(env.XAUUSD_NEWS_PROTECTION))) throw new Error('XAUUSD_NEWS_PROTECTION cannot disable the REAL news/shock protection layer; set XAUUSD_NEWS_PROVIDER=none to run without a calendar (audited as DISABLED)');
  if (cfg.newsProtection !== true) throw new Error('REAL news/shock protection cannot be disabled');
  if (!PROVIDER_KINDS.includes(cfg.newsProvider)) throw new Error(`XAUUSD_NEWS_PROVIDER must be one of ${PROVIDER_KINDS.join('|')}`);
  if (cfg.newsProvider === 'http_json' && !/^https:\/\//.test(String(cfg.newsCalendarUrl))) throw new Error('XAUUSD_NEWS_CALENDAR_URL must be an https URL');
  if (cfg.newsProvider === 'file' && !cfg.newsCalendarFile) throw new Error('XAUUSD_NEWS_CALENDAR_FILE is required for the file provider');
  if (!(cfg.newsFetchIntervalSec >= 300 && cfg.newsFetchIntervalSec <= 86400)) throw new Error('XAUUSD_NEWS_FETCH_INTERVAL_SEC must be within [300, 86400]');
  if (!(cfg.newsPreWindowMin >= 5 && cfg.newsPreWindowMin <= 240)) throw new Error('XAUUSD_NEWS_PRE_WINDOW_MIN must be within [5, 240]');
  if (!(cfg.newsActiveWindowMin >= 1 && cfg.newsActiveWindowMin <= 60)) throw new Error('XAUUSD_NEWS_ACTIVE_WINDOW_MIN must be within [1, 60]');
  if (!(cfg.newsCooldownMin >= 5 && cfg.newsCooldownMin <= 240)) throw new Error('XAUUSD_NEWS_COOLDOWN_MIN must be within [5, 240]');
  if (!(cfg.newsStaleSec >= 600 && cfg.newsStaleSec <= 172800)) throw new Error('XAUUSD_NEWS_STALE_SEC must be within [600, 172800]');
  if (!['BLOCK', 'ALLOW'].includes(cfg.newsDataUnavailablePolicy)) throw new Error('XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY must be BLOCK or ALLOW');
  if (!(cfg.shockClearAfterSec >= 60 && cfg.shockClearAfterSec <= 3600)) throw new Error('XAUUSD_SHOCK_CLEAR_AFTER_SEC must be within [60, 3600]');
  // V2 tier / normalisation ranges. Tier B may never be shorter than the generic cooldown (a tier only ADDS protection).
  if (!(cfg.newsTierBCooldownMin >= 30 && cfg.newsTierBCooldownMin <= 120)) throw new Error('XAUUSD_NEWS_TIER_B_COOLDOWN_MIN must be within [30, 120]');
  if (cfg.newsTierBCooldownMin < cfg.newsCooldownMin) throw new Error('XAUUSD_NEWS_TIER_B_COOLDOWN_MIN may not be shorter than XAUUSD_NEWS_COOLDOWN_MIN');
  if (!(cfg.newsTierAPostMin >= 65 && cfg.newsTierAPostMin <= 240)) throw new Error('XAUUSD_NEWS_TIER_A_POST_MIN must be within [65, 240]');
  if (!(cfg.newsTierAPressConfCoverMin >= 30 && cfg.newsTierAPressConfCoverMin <= 180)) throw new Error('XAUUSD_NEWS_TIER_A_PRESSCONF_COVER_MIN must be within [30, 180]');
  if (!(cfg.newsTierAClusterGapMin >= 30 && cfg.newsTierAClusterGapMin <= 240)) throw new Error('XAUUSD_NEWS_TIER_A_CLUSTER_GAP_MIN must be within [30, 240]');
  if (!(cfg.newsNormalizationRatio >= 1.2 && cfg.newsNormalizationRatio <= 3.0)) throw new Error('XAUUSD_NEWS_NORMALIZATION_RATIO must be within [1.2, 3.0]');
  if (!(cfg.newsNormalizationConfirmBars >= 1 && cfg.newsNormalizationConfirmBars <= 4)) throw new Error('XAUUSD_NEWS_NORMALIZATION_CONFIRM_BARS must be within [1, 4]');
  if (!(cfg.newsNormalizationMaxExtensionMin >= 0 && cfg.newsNormalizationMaxExtensionMin <= 240)) throw new Error('XAUUSD_NEWS_NORMALIZATION_MAX_EXTENSION_MIN must be within [0, 240]');
  cfg.newsRiskParams = Object.freeze({
    preNewsWindowMin: cfg.newsPreWindowMin, newsActiveWindowMin: cfg.newsActiveWindowMin, postNewsCooldownMin: cfg.newsCooldownMin, staleCalendarSec: cfg.newsStaleSec, dataUnavailablePolicy: cfg.newsDataUnavailablePolicy, lookaheadHours: 48,
    tierBCooldownMin: cfg.newsTierBCooldownMin, tierAPostMin: cfg.newsTierAPostMin, tierAPressConfCoverMin: cfg.newsTierAPressConfCoverMin, tierAClusterGapMin: cfg.newsTierAClusterGapMin,
    normalizationRatio: cfg.newsNormalizationRatio, normalizationConfirmBars: cfg.newsNormalizationConfirmBars, normalizationMaxExtensionMin: cfg.newsNormalizationMaxExtensionMin, normalizationReferenceHours: 24, normalizationReferenceMinBars: 24,
  });
  cfg.shockParams = Object.freeze({ ...SHOCK_PARAMS, clearAfterSec: cfg.shockClearAfterSec });

  /**
   * Margin/broker safety VETO at the FIXED lot. Never resizes: returns
   * executable:false with reasons when 0.01 cannot be carried safely for the
   * configured monetary loss at the current equity/leverage/spread.
   */
  cfg.assessSafety = ({ account, market, lot = REAL_FIXED_LOT, profitTargetUsd = cfg.profitTargetUsd, maximumLossUsd = cfg.maximumLossUsd }) => assessRealLot({
    lot, price: Number(market?.ask ?? market?.bid), contractSize: Number(market?.contract_size ?? 100), leverage: Number(account?.leverage), equity: Number(account?.equity),
    freeMargin: Number(account?.margin_free ?? account?.equity), spreadUsd: Number(market?.spread_price ?? 0), profitTargetUsd, maximumLossUsd,
    marginCallLevelPct: Number(account?.margin_so_call ?? 60), stopOutLevelPct: Number(account?.margin_so_so ?? 0), marginBudgetPctOfEquity: cfg.marginBudgetPctOfEquity, marginCallBufferPct: cfg.marginCallBufferPct, lotCeiling: REAL_FIXED_LOT,
  });
  return Object.freeze(cfg);
}

/** True only when the exact arming token is present. Status/inspection never requires it. */
export function isRealArmed(env = {}) {
  return env[REAL_ARM_ENV] === REAL_ARM_TOKEN;
}

/** Environment handed to the REAL python bridge (own XAUUSD_MT5_REAL_* names). The bridge's own cap is the fixed lot. */
export function realBridgeEnv(env = process.env) {
  return {
    ...env,
    XAUUSD_MT5_REAL_LOGIN: String(REAL_ACCOUNT.login),
    XAUUSD_MT5_REAL_SERVER: REAL_ACCOUNT.server,
    XAUUSD_MT5_REAL_SYMBOL: REAL_ACCOUNT.symbol,
    XAUUSD_MT5_REAL_BRIDGE_HARD_MAX_VOLUME: String(REAL_FIXED_LOT),
  };
}

/**
 * Margin/stop-out safety assessment for ONE lot (pure arithmetic). Used as a
 * VETO by the executor and for operator reporting. It never chooses a lot.
 */
export function assessRealLot({ lot, price, contractSize = 100, leverage, equity, freeMargin = null, spreadUsd = 0.3, profitTargetUsd = 30, maximumLossUsd = -50, marginCallLevelPct = 60, stopOutLevelPct = 0, marginBudgetPctOfEquity = 50, marginCallBufferPct = 0, lotCeiling = REAL_FIXED_LOT }) {
  const oz = lot * contractSize;
  const notional = oz * price;
  const pnlPerUsdMove = oz;
  const targetDistance = profitTargetUsd / pnlPerUsdMove;
  const lossDistance = Math.abs(maximumLossUsd) / pnlPerUsdMove;
  const marginRequired = leverage > 0 ? notional / leverage : null;
  const marginPct = marginRequired != null && equity > 0 ? (marginRequired / equity) * 100 : null;
  const equityAtMaxLoss = equity + maximumLossUsd;
  const marginLevelAtMaxLoss = marginRequired ? (equityAtMaxLoss / marginRequired) * 100 : null;
  const reasons = [];
  if (!(Number.isFinite(price) && price > 0)) reasons.push('PRICE_UNKNOWN');
  if (marginRequired == null || !Number.isFinite(marginRequired)) reasons.push('LEVERAGE_UNKNOWN');
  else {
    if (freeMargin != null && Number.isFinite(freeMargin) && marginRequired > freeMargin) reasons.push('MARGIN_EXCEEDS_FREE_MARGIN');
    if (marginPct > marginBudgetPctOfEquity) reasons.push(`MARGIN_${Math.round(marginPct)}PCT_OF_EQUITY_EXCEEDS_${marginBudgetPctOfEquity}PCT`);
    if (!(equityAtMaxLoss > 0)) reasons.push('EQUITY_EXHAUSTED_BEFORE_MAX_LOSS');
    if (marginLevelAtMaxLoss < 100) reasons.push(`MARGIN_LEVEL_${Math.round(marginLevelAtMaxLoss)}PCT_AT_MAX_LOSS_BELOW_100`);
    if (marginLevelAtMaxLoss <= stopOutLevelPct) reasons.push('STOP_OUT_BEFORE_MAX_LOSS');
    if (marginLevelAtMaxLoss < marginCallLevelPct + marginCallBufferPct) reasons.push('MARGIN_CALL_BEFORE_MAX_LOSS');
  }
  if (lossDistance < 4 * spreadUsd) reasons.push('LOSS_DISTANCE_TOO_CLOSE_TO_SPREAD');
  if (lot > lotCeiling + 1e-12) reasons.push('ABOVE_LOT_CEILING');
  const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
  return {
    lot, xau_exposure_oz: r2(oz), notional_usd: r2(notional), pnl_per_usd_move: r2(pnlPerUsdMove),
    target_distance_usd: r2(targetDistance), loss_distance_usd: r2(lossDistance),
    margin_required_usd: r2(marginRequired), margin_pct_of_equity: r2(marginPct), equity_at_max_loss: r2(equityAtMaxLoss), margin_level_at_max_loss_pct: r2(marginLevelAtMaxLoss),
    executable: reasons.length === 0, reasons,
  };
}

/**
 * REPORTING ONLY. Largest lot (0.01 steps, <= ceiling) that assessRealLot()
 * marks executable. Deliberately NOT used anywhere in REAL execution: the
 * executed lot is the user-fixed REAL_FIXED_LOT, never a broker-safe maximum.
 */
export function chooseRealLot(params) {
  const ceiling = params.lotCeiling ?? REAL_FIXED_LOT;
  let best = null;
  for (let lot = 0.01; lot <= ceiling + 1e-9; lot = Math.round((lot + 0.01) * 100) / 100) {
    const a = assessRealLot({ ...params, lot, lotCeiling: ceiling });
    if (a.executable) best = a;
  }
  return best;
}
