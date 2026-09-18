import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/xauusd.js';
import { calculateEntry } from '../core/xauusd_calculate.js';
import { analyzeMarket } from '../core/xauusd_analyze_market.js';

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

  gate.tool('xauusd_calculate_entry', 'MUTATING (switches chart timeframe internally for every required timeframe, restores it afterward even on partial failure): the independent MCP calculation engine (src/core/xauusd_calculate.js). Fetches raw OHLCV directly from TradingView for 5m/15m/30m (entry) plus 1H/2H/4H/8H/1D/1W/1M (higher-timeframe context/filtering, src/engine/htf.js) and computes regime/structure/correction/setup-model/quality/risk from scratch — it does NOT require or read the Pine indicator ACTION to produce a decision. 5m/15m/30m remain the sole decision-critical timeframes (unchanged); higher timeframes are read-only context except a single 1H conflict gate (mirrors the existing 30m->15m rule one tier higher, never majority voting; 1M/1W never gate or generate an entry). Returns WAIT with null trade geometry, or BUY/SELL with entry/sl/tp1/tp2/rr computed by this engine. If the Pine indicator is present, its state is attached read-only as `pine_reference` for comparison only; a materially opposing actionable disagreement between the two engines fails closed to WAIT. Never places broker orders.', {}, async () => {
    try { return jsonResult(await calculateEntry()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  gate.tool('xauusd_analyze_market', 'MUTATING (same chart-timeframe-switching discipline as xauusd_calculate_entry, restores the original timeframe afterward): the Full Market Analysis Engine. Calls the SAME unmodified xauusd_calculate_entry() decision engine for the authoritative WAIT/BUY/SELL (never recomputed, never overridden here) and additionally computes structured, deterministic EVIDENCE on the primary 15m decision timeframe — classical chart patterns (double/triple top/bottom, head & shoulders, triangles, wedges, rectangles, channels, flags/pennants), candlestick patterns, a rich breakout/false-break/retest lifecycle state, liquidity (equal highs/lows, sweep+reclaim, prior day/week sweeps, fair value gaps, premium/discount), support/resistance + supply/demand levels, gold trading-session context (Asia/London/New York/overlap, DST-aware) plus previous day/week range, volatility state, and regime-gated strategy-family eligibility. Returned as a `confluence` object with `supporting_evidence`/`opposing_evidence`/`mandatory_gates`/`informational_context` — this is explicitly NOT majority voting: pattern/candlestick/breakout/liquidity evidence can never override or alter the decision`s action/entry/sl/tp1/tp2/rr/quality, only annotate it. Uses an ephemeral, never-persisted signal store internally so calling this tool can never suppress or duplicate an alert the 60-second auto watcher would otherwise independently raise. Never places broker orders.', {}, async () => {
    try { return jsonResult(await analyzeMarket()); }
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
