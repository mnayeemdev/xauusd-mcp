import { register } from '../router.js';
import * as core from '../../core/xauusd.js';

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
  ]),
});
