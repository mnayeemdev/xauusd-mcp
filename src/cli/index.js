#!/usr/bin/env node

/**
 * tv — CLI for TradingView Desktop via Chrome DevTools Protocol.
 * Outputs JSON to stdout. Errors to stderr.
 * Exit codes: 0 success, 1 error, 2 connection failure.
 *
 * Every upstream MCP tool (chart mutation, Pine write, drawings, alerts,
 * watchlist, replay/trade, UI automation including arbitrary JS via
 * `tv ui-evaluate` if ever added, tv_launch, etc.) is reachable from this
 * CLI. Pipe-friendly: every command outputs JSON for use with jq.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ MCP PROFILE SECURITY (src/profiles.js, src/profile_gate.js) DOES NOT │
 * │ SANDBOX THIS CLI. The Research/Development tool allowlist applies    │
 * │ ONLY to the MCP stdio server started by `node src/server.js` /       │
 * │ `npm start` — the surface an MCP client (e.g. Claude) talks to.      │
 * │ This `tv` command always has full, ungated access to every tool,     │
 * │ by design, for maintainer scripting. Anyone with shell access to     │
 * │ this repository can bypass the MCP profile entirely by running this │
 * │ CLI directly. The `tv xauusd snapshot|master|health` subcommands are │
 * │ read-only by their own implementation (they call the same read-only  │
 * │ core functions the MCP tools do), but that is a property of those    │
 * │ specific subcommands, not a CLI-wide guarantee.                      │
 * └──────────────────────────────────────────────────────────────────────┘
 */

// Register all commands
import './commands/health.js';
import './commands/chart.js';
import './commands/data.js';
import './commands/pine.js';
import './commands/capture.js';
import './commands/replay.js';
import './commands/drawing.js';
import './commands/alerts.js';
import './commands/watchlist.js';
import './commands/layout.js';
import './commands/indicator.js';
import './commands/ui.js';
import './commands/pane.js';
import './commands/tab.js';
import './commands/stream.js';
import './commands/xauusd.js';

// Run
import { run } from './router.js';
await run(process.argv);
