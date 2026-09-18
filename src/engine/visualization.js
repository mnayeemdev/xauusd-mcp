/**
 * Stage 4 — visualization intent schema (infrastructure only).
 *
 * This module defines and validates the deterministic, internal
 * drawing-intent shape that a FUTURE Stage 5 market-mapping layer will
 * produce from evidence/anticipation output. Stage 4 does NOT implement
 * that mapping -- this file only establishes the stable interface Stage 5
 * will feed, so src/core/xauusd_visualize.js's reconciliation logic can be
 * built and tested now, independent of what eventually generates intents.
 *
 * PURE, NO I/O: no CDP calls, no TradingView mutation, no file access. No
 * trading decision is derived from or by this module -- it never imports
 * src/core/xauusd_calculate.js, src/engine/anticipation.js, or
 * src/engine/confluence.js, and an intent carries no BUY/SELL authority of
 * any kind (a `trade_entry`/`trade_sl`/`trade_tp1`/`trade_tp2` role, when
 * Stage 5 eventually produces one, is a passive geometry marker only --
 * the SAME already-decided price the protected engine already computed,
 * never a second source of truth).
 *
 * `primitive` is restricted to the exact shape types
 * src/core/drawing.js's drawShape() actually supports today (verified
 * against its real tool schema in src/tools/drawing.js, not assumed).
 */

export const SUPPORTED_PRIMITIVES = Object.freeze(['horizontal_line', 'vertical_line', 'trend_line', 'rectangle', 'text']);

// Two-point primitives require `point2`; the rest are single-point.
const TWO_POINT_PRIMITIVES = new Set(['trend_line', 'rectangle']);

// Example role vocabulary (mission Part 10) -- illustrative, NOT a closed
// enum. A role is validated only for being a non-empty string; Stage 5 is
// free to introduce new roles without a schema change here.
export const EXAMPLE_ROLES = Object.freeze([
  'structure_primary', 'nearest_support', 'nearest_resistance',
  'active_demand', 'active_supply', 'liquidity_primary', 'pattern_primary',
  'primary_trigger', 'primary_invalidation', 'alternate_trigger', 'alternate_invalidation',
  'trade_entry', 'trade_sl', 'trade_tp1', 'trade_tp2',
]);

function isFinitePoint(p) {
  return !!p && Number.isFinite(Number(p.time)) && Number.isFinite(Number(p.price));
}

/**
 * Validates a drawing intent, returning { valid: true, errors: [] } or
 * { valid: false, errors: [...] }. Never throws -- callers decide how to
 * handle an invalid intent (the orchestrator skips it and reports why).
 */
export function validateDrawingIntent(intent) {
  const errors = [];
  if (!intent || typeof intent !== 'object') return { valid: false, errors: ['intent must be an object'] };

  if (!intent.role || typeof intent.role !== 'string') errors.push('role is required and must be a non-empty string');
  if (!SUPPORTED_PRIMITIVES.includes(intent.primitive)) errors.push(`primitive must be one of ${SUPPORTED_PRIMITIVES.join(', ')}`);
  if (!intent.symbol || typeof intent.symbol !== 'string') errors.push('symbol is required and must be a non-empty string');
  if (!intent.timeframe || typeof intent.timeframe !== 'string') errors.push('timeframe is required and must be a non-empty string');
  if (!isFinitePoint(intent.point)) errors.push('point.time and point.price are required and must be finite numbers');

  if (TWO_POINT_PRIMITIVES.has(intent.primitive)) {
    if (!isFinitePoint(intent.point2)) errors.push(`${intent.primitive} requires a finite point2`);
  } else if (intent.point2 != null) {
    errors.push(`${intent.primitive} does not accept point2`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds a normalized intent object from already-validated inputs. Never
 * invents a role, price, or point -- every field is exactly what the
 * caller passed in. Returns null (never throws, never a partially-built
 * intent) when the result would not validate.
 */
export function makeDrawingIntent({ role, primitive, point, point2 = null, text = null, overrides = null, source = null, symbol, timeframe, index = 0 }) {
  const intent = { role, primitive, point, point2, text, overrides, source, symbol, timeframe, index };
  const { valid } = validateDrawingIntent(intent);
  return valid ? intent : null;
}
