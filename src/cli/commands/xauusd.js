import { register } from '../router.js';
import * as core from '../../core/xauusd.js';
import { getLaunchReadiness } from '../../core/launch.js';
import { formatDecision, formatEngineDecision } from '../../core/presentation.js';
import { calculateEntry } from '../../core/xauusd_calculate.js';

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
      description: 'Run the independent MCP calculation engine (raw OHLCV -> regime/structure/setup/quality/risk -> decision) for 5m/15m/30m. Full structured result. Never places trades. MUTATES chart timeframe temporarily (restores it afterward).',
      handler: () => calculateEntry(),
    }],
    ['check', {
      description: 'Run the MCP calculation engine and print only the final Claude-readable decision (WAIT or BUY/SELL). This is the "npm run xauusd:check" launch command.',
      handler: async () => {
        const result = await calculateEntry();
        return formatEngineDecision(result);
      },
    }],
  ]),
});
