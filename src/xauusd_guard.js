/**
 * XAUUSD/Gold chart identity guard.
 *
 * Deliberately an explicit allowlist of exact "EXCHANGE:TICKER" (or bare
 * TICKER) strings — never a substring/"contains GOLD" check, which would
 * wrongly match unrelated instruments (e.g. a mining stock or an unrelated
 * ticker that happens to contain "GOLD").
 *
 * Configuration contract (changed in the Phase 2A review — see "XAUUSD
 * symbol configuration" section): XAUUSD_ALLOWED_SYMBOLS is ADDITIVE, not a
 * replacement. The effective allowlist is always
 *
 *     DEFAULT_XAUUSD_SYMBOLS  ∪  validated additional aliases from the env var
 *
 * Replacement semantics were rejected because they let a well-intentioned
 * operator (who just wants to add their own broker's symbol) silently drop
 * every built-in default and end up with a narrower, easy-to-misconfigure
 * guard — or, if they mistype the env var, an empty allowlist that rejects
 * even OANDA:XAUUSD. Union semantics can only ever widen the allowlist
 * relative to the immutable defaults, which is the safer failure direction
 * for a guard whose job is to say "no" by default.
 */

export const XAUUSD_ALIASES_ENV_VAR = 'XAUUSD_ALLOWED_SYMBOLS';

export const DEFAULT_XAUUSD_SYMBOLS = Object.freeze([
  'OANDA:XAUUSD',
  'FOREXCOM:XAUUSD',
  'FXCM:XAUUSD',
  'PEPPERSTONE:XAUUSD',
  'ICMARKETS:XAUUSD',
  'TVC:GOLD',
  'COMEX:GC1!',
]);

function normalize(symbol) {
  return (symbol ?? '').toString().trim().toUpperCase();
}

/**
 * Parses the env var into a validated, normalized, deduplicated array.
 * - trims whitespace around each alias
 * - normalizes case (uppercase) consistently with the built-in defaults
 * - rejects (drops) empty aliases left by stray commas ("a,,b" or trailing ",")
 * - deduplicates
 * Never does substring/"contains" matching — every entry here becomes an
 * exact-match candidate only.
 */
function parseAdditionalAliases(raw) {
  if (!raw) return [];
  const seen = new Set();
  const result = [];
  for (const part of raw.split(',')) {
    const norm = normalize(part);
    if (!norm) continue; // reject empty aliases (stray/trailing commas, whitespace-only entries)
    if (seen.has(norm)) continue; // deduplicate
    seen.add(norm);
    result.push(norm);
  }
  return result;
}

/**
 * Returns the effective approved alias list: built-in defaults UNION any
 * validated additional aliases from XAUUSD_ALLOWED_SYMBOLS. Always
 * normalized (trimmed + uppercased) and deduplicated.
 */
export function getApprovedAliases({ _deps } = {}) {
  const env = _deps?.env ?? process.env;
  const additional = parseAdditionalAliases(env[XAUUSD_ALIASES_ENV_VAR]);
  const merged = new Set([...DEFAULT_XAUUSD_SYMBOLS.map(normalize), ...additional]);
  return [...merged];
}

/**
 * Checks whether `symbol` is an approved XAUUSD/Gold identity.
 * Exact match only against the effective approved alias list — no
 * substring matching. Never mutates anything; pure read/compute. Never
 * switches the chart under any circumstance, approved or not.
 */
export function checkXauusdSymbol(symbol, { aliases, _deps } = {}) {
  const approvedAliases = aliases ? [...new Set(aliases.map(normalize).filter(Boolean))] : getApprovedAliases({ _deps });
  const normalized = normalize(symbol);
  const approved = normalized !== '' && approvedAliases.includes(normalized);
  return {
    symbol: symbol ?? null,
    normalized: normalized || null,
    approved,
    approved_aliases: approvedAliases,
  };
}
