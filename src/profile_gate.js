/**
 * ProfileGate — the actual enforcement point for MCP tool-exposure profiles.
 *
 * server.js registers every tool group through a gate instance instead of
 * the raw MCP server object. Each `register*Tools(server)` function is
 * unmodified and still calls `server.tool(name, description, schema,
 * handler)` — the gate just duck-types that interface and only forwards
 * calls whose tool name is in the active profile's allowedTools set.
 * Anything else is silently NOT registered with the MCP SDK: it doesn't
 * exist as a callable tool for this session, it isn't merely hidden.
 *
 * Two tools get additional in-code hardening even though their name is
 * allowed, because their PARAMETER space allows mutation the profiles must
 * never permit:
 *   - quote_get: never receives a symbol argument. If the caller asks for a
 *     different symbol than the current chart, the gate rejects the call
 *     BEFORE touching the real quote_get implementation at all — there is no
 *     code path here that can ever call chart.setSymbol.
 *   - capture_screenshot: method is pinned to 'cdp'. Any other requested
 *     method is rejected outright; core.captureScreenshot's 'api' branch
 *     (TradingView's own share/screenshot UI) is never reachable from here.
 */
import { jsonResult } from './tools/_format.js';
import * as chartCore from './core/chart.js';
import * as dataCore from './core/data.js';
import * as captureCore from './core/capture.js';

function bareSymbol(sym) {
  return (sym ?? '').toString().trim().split(':').pop().toUpperCase();
}

/**
 * Hardened quote_get: current-chart-symbol reads only, ever.
 * Exported directly (not only via the gate) so it can be unit tested without
 * a live CDP connection.
 */
export async function guardedQuoteGet({ symbol, _deps } = {}) {
  const deps = {
    getState: _deps?.getState ?? chartCore.getState,
    getQuote: _deps?.getQuote ?? dataCore.getQuote,
  };
  const requested = (symbol ?? '').toString().trim();

  if (requested) {
    let current;
    try {
      const state = await deps.getState();
      current = state.symbol;
    } catch (err) {
      return jsonResult({
        success: false,
        error: `Could not verify the current chart symbol to enforce the research-mode guard: ${err.message}`,
      }, true);
    }
    if (bareSymbol(current) !== bareSymbol(requested)) {
      return jsonResult({
        success: false,
        error: `This profile's quote_get cannot switch symbols. Requested "${requested}" differs from the current chart symbol "${current}". Read-only profiles never change the chart — remove the symbol argument to read the current chart's quote.`,
        current_symbol: current,
        requested_symbol: requested,
      }, true);
    }
  }

  // Never forward a symbol argument, matching or not — this eliminates the
  // upstream setSymbol/restore code path entirely rather than trusting it.
  try { return jsonResult(await deps.getQuote({})); }
  catch (err) { return jsonResult({ success: false, error: err.message }, true); }
}

/**
 * Hardened capture_screenshot: CDP method only, ever.
 */
export async function guardedCaptureScreenshot({ region, filename, method, wait_for_render, _deps } = {}) {
  const deps = { captureScreenshot: _deps?.captureScreenshot ?? captureCore.captureScreenshot };

  // Blank (undefined/null/'' /whitespace-only) means "not specified" and is
  // treated exactly like omitted — matching upstream's own default-to-cdp
  // behavior. Anything else must equal "cdp" case/whitespace-insensitively;
  // everything else (including "api") is rejected outright.
  const normalizedMethod = (method ?? '').toString().trim().toLowerCase();
  if (normalizedMethod !== '' && normalizedMethod !== 'cdp') {
    return jsonResult({
      success: false,
      error: `This profile's capture_screenshot only supports method "cdp". API/share screenshot mode ("${method}") is disabled — it would open TradingView's own screenshot/share UI.`,
    }, true);
  }

  try {
    return jsonResult(await deps.captureScreenshot({ region, filename, method: 'cdp', waitForRender: wait_for_render }));
  } catch (err) {
    return jsonResult({ success: false, error: err.message }, true);
  }
}

const HARDENED_HANDLERS = Object.freeze({
  quote_get: guardedQuoteGet,
  capture_screenshot: guardedCaptureScreenshot,
});

/**
 * @param {object} server - the real McpServer instance
 * @param {object} profile - a resolved profile from profiles.js
 */
export function createProfileGate(server, profile) {
  const registered = [];
  const blocked = [];

  return {
    tool(name, description, schema, handler) {
      if (!profile.allowedTools.has(name)) {
        blocked.push(name);
        return undefined;
      }
      registered.push(name);
      const finalHandler = HARDENED_HANDLERS[name] ?? handler;
      return server.tool(name, description, schema, finalHandler);
    },
    getRegisteredTools: () => [...registered],
    getBlockedTools: () => [...blocked],
  };
}
