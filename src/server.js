import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerHealthTools } from './tools/health.js';
import { registerChartTools } from './tools/chart.js';
import { registerPineTools } from './tools/pine.js';
import { registerDataTools } from './tools/data.js';
import { registerCaptureTools } from './tools/capture.js';
import { registerDrawingTools } from './tools/drawing.js';
import { registerAlertTools } from './tools/alerts.js';
import { registerBatchTools } from './tools/batch.js';
import { registerReplayTools } from './tools/replay.js';
import { registerIndicatorTools } from './tools/indicators.js';
import { registerWatchlistTools } from './tools/watchlist.js';
import { registerUiTools } from './tools/ui.js';
import { registerPaneTools } from './tools/pane.js';
import { registerTabTools } from './tools/tab.js';
import { registerXauusdTools } from './tools/xauusd.js';
import { resolveProfile, PROFILE_ENV_VAR } from './profiles.js';
import { createProfileGate } from './profile_gate.js';
import { PRODUCT_NAME, PRODUCT_DEVELOPER, PRODUCT_VERSION, UPSTREAM_URL } from './branding.js';

// Profile selection is explicit and fails closed: an unknown/malformed
// profile name refuses to start the server rather than silently exposing
// every tool. See src/profiles.js.
let profile;
try {
  profile = resolveProfile(process.env[PROFILE_ENV_VAR]);
} catch (err) {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
}

const RESEARCH_INSTRUCTIONS = `${PRODUCT_NAME} — profile: XAUUSD_RESEARCH (read-only).

This profile exposes ONLY read-only tools. Chart mutation, Pine writes, drawings,
alerts, watchlist changes, replay, UI automation, and arbitrary JS execution are
NOT registered in this profile — they do not exist as callable tools here.

TOOL SELECTION GUIDE:
- xauusd_research_health → connectivity + guard + exposed-tools self-check (call first)
- xauusd_market_snapshot → one deterministic call for quote + OHLCV + studies + Pine graphics
- xauusd_master_state → structured read of the XAUUSD Adaptive Master Pine indicator (Pine is authoritative; never a fabricated BUY/SELL)
- chart_get_state → symbol, timeframe, all indicator names + entity IDs
- data_get_study_values → current numeric values from ALL visible indicators
- quote_get → real-time price snapshot for the CURRENT chart symbol only (cannot switch symbols in this profile)
- data_get_ohlcv → price bars; ALWAYS pass summary=true unless you need individual bars
- data_get_pine_lines / _labels / _tables / _boxes → custom Pine indicator output; pass study_filter when you know the indicator name
- capture_screenshot → CDP screenshot only (method is always "cdp" in this profile)

CONTEXT MANAGEMENT:
- ALWAYS use summary=true on data_get_ohlcv
- ALWAYS use study_filter on pine tools when you know which indicator you want
- Prefer xauusd_market_snapshot over several separate calls when you need a full picture`;

const DEVELOPMENT_INSTRUCTIONS = `${RESEARCH_INSTRUCTIONS}

This profile ALSO exposes Pine Script development tools (still no chart mutation
beyond the Pine Editor's own study):
- pine_get_source → read current Pine source (can be 200KB+ — avoid unless editing)
- pine_set_source → inject Pine source into the editor
- pine_smart_compile → compile + check errors (adds/updates the Pine-Editor study on the chart)
- pine_get_errors → read compiler errors
- pine_get_console → read log.info()/console output`;

const server = new McpServer(
  {
    name: 'xauusd-adaptive-master-mcp',
    version: PRODUCT_VERSION,
    description: `${PRODUCT_NAME} (by ${PRODUCT_DEVELOPER}) — a profile-gated, XAUUSD-focused customization of the open-source TradingView MCP Bridge (${UPSTREAM_URL})`,
  },
  {
    instructions: profile.name === 'XAUUSD_DEVELOPMENT' ? DEVELOPMENT_INSTRUCTIONS : RESEARCH_INSTRUCTIONS,
  }
);

// Register all tool groups THROUGH THE GATE, not the raw server. The gate
// only forwards registrations whose tool name is in the active profile's
// allowlist — everything else is never registered with the MCP SDK at all.
// None of the register*Tools functions below needed to change: the gate
// duck-types the same `.tool(name, description, schema, handler)` interface
// as the real McpServer.
const gate = createProfileGate(server, profile);
registerHealthTools(gate);
registerChartTools(gate);
registerPineTools(gate);
registerDataTools(gate);
registerCaptureTools(gate);
registerDrawingTools(gate);
registerAlertTools(gate);
registerBatchTools(gate);
registerReplayTools(gate);
registerIndicatorTools(gate);
registerWatchlistTools(gate);
registerUiTools(gate);
registerPaneTools(gate);
registerTabTools(gate);
registerXauusdTools(gate, { profile });

// Startup notice (stderr so it doesn't interfere with MCP stdio protocol)
process.stderr.write(`${PRODUCT_NAME} by ${PRODUCT_DEVELOPER} — v${PRODUCT_VERSION}\n`);
process.stderr.write(`Based on the open-source TradingView MCP Bridge (${UPSTREAM_URL})\n`);
process.stderr.write(`Profile: ${profile.name} — ${gate.getRegisteredTools().length} tools exposed, ${gate.getBlockedTools().length} blocked\n`);
process.stderr.write('⚠  Unofficial tool. Not affiliated with TradingView Inc. or Anthropic.\n');
process.stderr.write('   Ensure your usage complies with TradingView\'s Terms of Use.\n\n');

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
