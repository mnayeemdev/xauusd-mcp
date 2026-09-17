import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/xauusd.js';

/**
 * @param {object} gate - a ProfileGate (or the raw McpServer) with a .tool() method
 * @param {object} opts
 * @param {object} opts.profile - the resolved active profile (for reporting only)
 */
export function registerXauusdTools(gate, { profile } = {}) {
  gate.tool('xauusd_market_snapshot', 'Read-only unified XAUUSD/Gold market snapshot: quote, latest bar, recent OHLCV, visible studies, data-window values, and Pine graphics (tables/labels/lines/boxes) in one call with a stable schema. Components are read sequentially, not atomically — see capture_started_at/capture_completed_at. Never mutates the chart, never computes BUY/SELL, never predicts price. Unavailable fields are null with a warning/error, never fabricated.', {
    ohlcv_count: z.coerce.number().optional().describe('Recent OHLCV bars to include (default 20, max 500)'),
  }, async ({ ohlcv_count }) => {
    try { return jsonResult(await core.getMarketSnapshot({ ohlcv_count })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  gate.tool('xauusd_master_state', 'Read-only structured reader for the XAUUSD Adaptive Master Pine indicator, parsed through a versioned contract (market/setup/decision/signal). Pine remains authoritative: this tool never derives regime/setup/action independently and never promotes WAIT/UNKNOWN into BUY/SELL. Status is one of NOT_FOUND / AMBIGUOUS / READ_ERROR / NO_CONTRACT / UNSUPPORTED_CONTRACT_VERSION / MALFORMED_CONTRACT / CONTRACT_CONTRADICTION / SOURCE_UNCONFIRMED / OK — decision.action stays UNKNOWN on every status except a fully-validated OK.', {}, async () => {
    try { return jsonResult(await core.getMasterState()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  gate.tool('xauusd_research_health', 'Self-check for the active XAUUSD Adaptive Master MCP profile: MCP/CDP connectivity, current symbol/timeframe, XAUUSD guard result, active profile name, the exact list of tools actually registered, and confirmation that no prohibited state-changing tool is exposed.', {}, async () => {
    try {
      return jsonResult(await core.getResearchHealth({
        profileName: profile?.name,
        registeredTools: gate.getRegisteredTools?.() ?? [],
        blockedTools: gate.getBlockedTools?.() ?? [],
      }));
    } catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}
