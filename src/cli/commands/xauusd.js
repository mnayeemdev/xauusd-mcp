import { register } from '../router.js';
import * as core from '../../core/xauusd.js';
import { getLaunchReadiness } from '../../core/launch.js';
import { formatDecision, formatEngineDecision, formatMarketAnalysis } from '../../core/presentation.js';
import { calculateEntry } from '../../core/xauusd_calculate.js';
import { analyzeMarket } from '../../core/xauusd_analyze_market.js';
import { startWatcher, DEFAULT_POLL_INTERVAL_MS } from '../../engine/watcher.js';
import { resolveExecutorConfig } from '../../engine/mt5Policy.js';
import { Mt5Bridge } from '../../engine/mt5Bridge.js';
import { createMt5Executor, readTradeLog, summarizeOverlayStats, summarizeEngineSignalStats, DEFAULT_MT5_LOG_PATH } from '../../engine/mt5Executor.js';
import { loadStore as loadSignalStore, DEFAULT_STORE_PATH as SIGNAL_STORE_PATH } from '../../engine/signalStore.js';
import { resolveEngineProfile, ENGINE_PROFILES } from '../../engine/engineProfile.js';
import { resolveRealExecutorConfig, isRealArmed, REAL_ARM_ENV, REAL_ARM_TOKEN, REAL_STATE_PATH, REAL_LOG_PATH, REAL_KILL_SWITCH_PATH, DEFAULT_REAL_BRIDGE_SCRIPT, realBridgeEnv, REAL_ACCOUNT } from '../../engine/mt5RealPolicy.js';
import { createCalendarProvider, createNewsMonitor } from '../../engine/newsMonitor.js';

/**
 * Builds the STAGE-1 REAL executor (src/engine/mt5RealPolicy.js): its own
 * hard-locked config, its own python bridge (mt5/mt5_bridge_real.py, own
 * env names, own terminal path), its own state/log/kill-switch files and its
 * own magic. `requireArmed` (default true) refuses to build a trading-capable
 * executor unless XAUUSD_MT5_REAL_ARMED carries the exact arming token;
 * read-only status passes requireArmed:false.
 */
function buildMt5RealExecutor({ log, requireArmed = true } = {}) {
  const config = resolveRealExecutorConfig(process.env);
  if (requireArmed && !isRealArmed(process.env)) {
    throw new Error(`REAL execution is NOT armed. To arm stage 1 on ${REAL_ACCOUNT.login}/${REAL_ACCOUNT.server}, start the watcher with ${REAL_ARM_ENV}=${REAL_ARM_TOKEN} in the environment (and XAUUSD_MT5_REAL_TERMINAL_PATH pointing at the terminal logged into that account).`);
  }
  const bridge = new Mt5Bridge({ scriptPath: DEFAULT_REAL_BRIDGE_SCRIPT, env: realBridgeEnv(process.env), log: log ?? ((m) => console.log(m)) });
  // NEWS + VOLATILITY SHOCK PROTECTION (src/engine/newsMonitor.js): the
  // calendar provider is configuration (http_json | file | none); the
  // executor treats provider failure/staleness as DATA_UNAVAILABLE explicitly.
  const provider = createCalendarProvider({ kind: config.newsProvider, url: config.newsCalendarUrl, filePath: config.newsCalendarFile, minFetchIntervalSec: config.newsFetchIntervalSec });
  const newsMonitor = createNewsMonitor({ provider, params: config.newsRiskParams, log: log ?? ((m) => console.log(m)) });
  const executor = createMt5Executor({ config, bridge, statePath: REAL_STATE_PATH, logPath: REAL_LOG_PATH, killSwitchPath: REAL_KILL_SWITCH_PATH, log: log ?? ((m) => console.log(m)), newsMonitor });
  return { config, bridge, executor, newsMonitor };
}

const ENGINE_OPTION = { type: 'string', description: `Engine profile: ${ENGINE_PROFILES.REFERENCE_15M} (default; the original 15m-authority engine) or ${ENGINE_PROFILES.INTRADAY_5M} (5m entry authority, 15m bias, 30m/1H strong-conflict filters only). Also settable via XAUUSD_ENGINE_PROFILE.` };

/**
 * Builds the MT5 DEMO executor (config from env, python bridge, executor).
 * Throws on any unsafe configuration -- never silently degrades. `demo`
 * is the ONLY mode that exists; see src/engine/mt5Policy.js.
 */
function buildMt5Executor({ log } = {}) {
  const config = resolveExecutorConfig(process.env, { mode: 'demo' });
  const bridge = new Mt5Bridge({ log: log ?? ((m) => console.log(m)) });
  const executor = createMt5Executor({ config, bridge, log: log ?? ((m) => console.log(m)) });
  return { config, bridge, executor };
}

register('xauusd', {
  description: 'XAUUSD Adaptive Master research tools (snapshot, master state, health)',
  subcommands: new Map([
    ['snapshot', {
      description: 'Unified read-only XAUUSD market snapshot',
      options: {
        count: { type: 'string', short: 'n', description: 'Recent OHLCV bars to include (default 20, max 500)' },
      },
      handler: (opts) => core.getMarketSnapshot({ ohlcv_count: opts.count ? Number(opts.count) : undefined }),
    }],
    ['master', {
      description: 'Read the XAUUSD Adaptive Master Pine indicator (NOT_FOUND/AMBIGUOUS/FOUND_NO_CONTRACT when not wired)',
      handler: () => core.getMasterState(),
    }],
    ['health', {
      description: 'Research-profile self-check (this only reflects CLI-level reads — profile gating applies to the MCP server, not the CLI)',
      handler: () => core.getResearchHealth({ profileName: 'CLI (ungated)', registeredTools: [], blockedTools: [] }),
    }],
    ['decision', {
      description: 'Read the master contract and render it as a Claude-readable WAIT/BUY/SELL/DATA-UNAVAILABLE decision (read-only, places no trades)',
      handler: async () => {
        const master = await core.getMasterState();
        return formatDecision(master);
      },
    }],
    ['launch-check', {
      description: 'Deterministic pre-launch readiness check (CDP, chart, master contract, C4 inputs, MCP profile counts, source hashes). Never places trades.',
      handler: () => getLaunchReadiness(),
    }],
    ['calculate', {
      description: 'Run the independent MCP calculation engine (raw OHLCV -> regime/structure/setup/quality/risk -> decision) for 5m/15m/30m (entry) plus 1H/2H/4H/8H/1D/1W/1M (higher-timeframe context/filtering). Full structured result. Never places trades. MUTATES chart timeframe temporarily for each timeframe (restores it afterward, even on partial failure).',
      options: { engine: ENGINE_OPTION },
      handler: (opts) => calculateEntry({ engineProfile: resolveEngineProfile(opts.engine) }),
    }],
    ['check', {
      description: 'Run the Full Market Analysis Engine (the SAME protected calculateEntry() decision, plus the Pre-Entry Opportunity Planner) and print the final Claude-readable decision (WAIT or BUY/SELL) -- for WAIT, also the current objective pre-entry opportunity plan when one exists (candidate/provisional geometry only, never confirmed trade geometry). This is the "npm run xauusd:check" launch command -- a manual current-snapshot read only; the watcher discovers/records opportunities on its own and never requires this command to be run.',
      options: { engine: ENGINE_OPTION },
      handler: async (opts) => {
        const result = await analyzeMarket({ persistSignals: false, engineProfile: resolveEngineProfile(opts.engine) });
        return formatMarketAnalysis(result);
      },
    }],
    ['watch', {
      description: 'Local auto signal watcher: polls every 60s for a newly confirmed 5m candle, then calls the SAME calculateEntry() engine (never a second/duplicate engine) and alerts only on BUY/SELL. WAIT results are logged, never alerted. Runs until Ctrl+C (SIGINT/SIGTERM). Never places trades. This is the "npm run xauusd:watch" command.',
      options: {
        once: { type: 'boolean', description: 'Run a single immediate calculateEntry() call and exit (testing only) — does not start the continuous watcher and never back-alerts a historical signal' },
        interval: { type: 'string', short: 'i', description: `Polling interval in seconds (default ${DEFAULT_POLL_INTERVAL_MS / 1000})` },
        'mt5-demo': { type: 'boolean', description: 'ALSO execute each validated NEW BUY/SELL alert on the Exness MT5 DEMO account (XAUUSDm, 0.01 lot, TradeBudget exit overlay) via mt5/mt5_bridge.py. OFF by default. Real accounts are hard-blocked in both Node and Python. See docs/XAUUSD_MT5_DEMO_EXECUTION.md.' },
        'mt5-real': { type: 'boolean', description: `ALSO execute each validated NEW BUY/SELL alert on the Exness MT5 REAL stage-1 account ${REAL_ACCOUNT.login}/${REAL_ACCOUNT.server} (XAUUSDm, approved lot, +30/-50 USD actual-P&L exits) via mt5/mt5_bridge_real.py. OFF by default and REFUSED unless ${REAL_ARM_ENV} carries the exact arming token. Separate state, log, kill switch and magic from DEMO. See docs/XAUUSD_MT5_REAL_EXECUTION.md.` },
        engine: ENGINE_OPTION,
      },
      handler: async (opts) => {
        const engineProfile = resolveEngineProfile(opts.engine);
        if (opts.once) {
          const result = await calculateEntry({ engineProfile });
          return formatEngineDecision(result);
        }
        const pollIntervalMs = opts.interval ? Math.max(1, Number(opts.interval)) * 1000 : undefined;
        if (!opts['mt5-demo'] && !opts['mt5-real']) return startWatcher({ pollIntervalMs, _deps: { cycle: { engineProfile } } });

        // One decision path, one or two isolated executors (DEMO and/or REAL).
        // Each executor applies its own gates, state, magic and bridge; a
        // failure in one never alters the other or the watcher decision.
        const executors = [];
        if (opts['mt5-demo']) executors.push(['demo', buildMt5Executor()]);
        if (opts['mt5-real']) executors.push(['real', buildMt5RealExecutor({ requireArmed: true })]);
        const startupReport = { engine_profile: engineProfile };
        for (const [name, { executor }] of executors) startupReport[`mt5_${name}_executor`] = await executor.start();
        console.log(JSON.stringify(startupReport, null, 2));
        const executeSignal = async (ev) => {
          const out = {};
          for (const [name, { executor }] of executors) {
            try { out[name] = await executor.executeSignal(ev); } catch (err) { out[name] = { executed: false, reason: 'EXECUTOR_THREW', detail: err.message }; }
          }
          return { executed: Object.values(out).some((r) => r?.executed), reason: Object.entries(out).map(([n, r]) => `${n}:${r?.reason ?? 'unknown'}`).join(' '), ...out };
        };
        // Post-entry thesis review for every executor that supports it (REAL): confirmed evidence only.
        const reviewOpenPosition = async (ev) => {
          const out = {};
          for (const [name, { executor }] of executors) {
            if (typeof executor.reviewThesis !== 'function') continue;
            try { out[name] = await executor.reviewThesis(ev); } catch (err) { out[name] = { action: 'REVIEW_FAILED', reason: err.message }; }
          }
          const acted = Object.values(out).find((r) => r?.action === 'CLOSED' || r?.action === 'CLOSE_FAILED');
          return acted ?? { action: 'THESIS_HOLD', ...out };
        };
        try {
          return await startWatcher({ pollIntervalMs, _deps: { cycle: { engineProfile, executeSignal, reviewOpenPosition } } });
        } finally {
          for (const [, { executor, bridge }] of executors) { await executor.stop(); await bridge.stop(); }
        }
      },
    }],
    ['mt5-status', {
      description: 'READ-ONLY MT5 DEMO executor status: demo verification checks, account/symbol spec, open MCP-owned position, daily counters, kill switch, and SEPARATE statistics for (A) MCP decision quality and (B) the TradeBudget execution overlay. Sends no orders.',
      handler: async () => {
        const { bridge, executor } = buildMt5Executor({ log: () => {} });
        try {
          const status = await executor.start();
          const events = readTradeLog(DEFAULT_MT5_LOG_PATH);
          let engineStats = null;
          try { engineStats = summarizeEngineSignalStats(loadSignalStore(SIGNAL_STORE_PATH)); } catch { engineStats = null; }
          return { ...status, stats: { engine_decision_quality: engineStats, execution_overlay: summarizeOverlayStats(events) } };
        } finally {
          await executor.stop();
          await bridge.stop();
        }
      },
    }],
    ['mt5-real-status', {
      description: `READ-ONLY MT5 REAL stage-1 executor status for ${REAL_ACCOUNT.login}/${REAL_ACCOUNT.server}: real verification checks, account/symbol spec, open MCP-owned position, daily counters, kill switch. Sends no orders. Does not require arming.`,
      handler: async () => {
        const { bridge, executor } = buildMt5RealExecutor({ log: () => {}, requireArmed: false });
        try {
          const status = await executor.start();
          return { ...status, armed: isRealArmed(process.env), stats: { execution_overlay: summarizeOverlayStats(readTradeLog(REAL_LOG_PATH)) } };
        } finally {
          await executor.stop();
          await bridge.stop();
        }
      },
    }],
    ['mt5-real-close', {
      description: 'Manually close the single MCP-owned MT5 REAL position (magic 88052001 only; never touches manual/other positions). Requires --yes AND the arming token.',
      options: { yes: { type: 'boolean', description: 'Confirm the close' } },
      handler: async (opts) => {
        if (!opts.yes) return { closed: false, reason: 'CONFIRMATION_REQUIRED', hint: 'pass --yes to close the MCP-owned REAL position' };
        const { bridge, executor } = buildMt5RealExecutor({ requireArmed: true });
        try {
          await executor.start();
          return await executor.closePosition({ reason: 'MANUAL_CLI' });
        } finally {
          await executor.stop();
          await bridge.stop();
        }
      },
    }],
    ['mt5-close', {
      description: 'Manually close the single MCP-owned MT5 DEMO position (magic-number isolated; never touches manual/other-EA positions). Requires --yes.',
      options: { yes: { type: 'boolean', description: 'Confirm the close' } },
      handler: async (opts) => {
        if (!opts.yes) return { closed: false, reason: 'CONFIRMATION_REQUIRED', hint: 'pass --yes to close the MCP-owned position' };
        const { bridge, executor } = buildMt5Executor();
        try {
          await executor.start();
          return await executor.closePosition({ reason: 'MANUAL_CLI' });
        } finally {
          await executor.stop();
          await bridge.stop();
        }
      },
    }],
  ]),
});
