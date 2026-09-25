/**
 * Engine profile selection for the XAUUSD MCP calculation engine.
 *
 * Two profiles exist side by side. They share the SAME OHLCV fetch,
 * validation, signal store, dedup, Pine comparison and MT5 execution
 * plumbing; only the decision layer differs:
 *
 *   reference_15m  -- the original engine (15m decides, 30m/5m veto,
 *                     1H HTF gate). UNCHANGED, byte-identical behavior,
 *                     and the DEFAULT when nothing selects a profile so
 *                     every existing caller/test keeps its exact result.
 *   intraday_5m    -- the faster intraday engine (5m = entry authority,
 *                     15m = bias/regime/correction, 30m/1H = strong-
 *                     conflict filters only). See src/engine/intraday/.
 *
 * Selection precedence: an explicit option (CLI `--engine`, or the
 * `engineProfile` argument to calculateEntry()/analyzeMarket()) > the
 * XAUUSD_ENGINE_PROFILE environment variable > the default. Unknown
 * values throw rather than silently falling back -- a misconfigured
 * profile must never quietly run the wrong engine.
 */

export const ENGINE_PROFILES = Object.freeze({
  REFERENCE_15M: 'reference_15m',
  INTRADAY_5M: 'intraday_5m',
});

export const DEFAULT_ENGINE_PROFILE = ENGINE_PROFILES.REFERENCE_15M;

const ALIASES = Object.freeze({
  reference_15m: ENGINE_PROFILES.REFERENCE_15M,
  reference: ENGINE_PROFILES.REFERENCE_15M,
  '15m': ENGINE_PROFILES.REFERENCE_15M,
  old: ENGINE_PROFILES.REFERENCE_15M,
  intraday_5m: ENGINE_PROFILES.INTRADAY_5M,
  intraday: ENGINE_PROFILES.INTRADAY_5M,
  fast: ENGINE_PROFILES.INTRADAY_5M,
  '5m': ENGINE_PROFILES.INTRADAY_5M,
});

/** Returns the canonical profile id for `value`, null for empty/undefined, throws for unknown. */
export function normalizeEngineProfile(value) {
  if (value === null || value === undefined) return null;
  const key = String(value).trim().toLowerCase();
  if (key === '') return null;
  const resolved = ALIASES[key];
  if (!resolved) throw new Error(`unknown engine profile "${value}" (expected one of: ${Object.values(ENGINE_PROFILES).join(', ')})`);
  return resolved;
}

/** explicit option > XAUUSD_ENGINE_PROFILE env > default (reference_15m). */
export function resolveEngineProfile(explicit, env = process.env) {
  return normalizeEngineProfile(explicit) ?? normalizeEngineProfile(env?.XAUUSD_ENGINE_PROFILE) ?? DEFAULT_ENGINE_PROFILE;
}

export function isIntradayProfile(profile) {
  return profile === ENGINE_PROFILES.INTRADAY_5M;
}
