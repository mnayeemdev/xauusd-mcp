/**
 * Stage 4 — MCP-owned drawing ownership registry.
 *
 * TradingView's own shape API exposes NO custom tag/metadata/group field
 * of any kind (verified directly against src/core/drawing.js's real
 * implementation, not assumed): `createShape()`/`createMultipointShape()`
 * accept only `{shape, overrides, text}` and never return an entity ID
 * directly — `drawShape()` discovers the new ID by diffing
 * `getAllShapes()` before/after. `listDrawings()` itself returns only
 * `{id, name}` per shape — `name` is TradingView's own shape-TYPE name
 * (e.g. "horizontal_line"), never something this project sets, and `text`
 * is never returned by a list read at all. There is therefore NO way to
 * ask TradingView "which shapes belong to MCP" — ownership can only ever
 * be tracked here, client-side, in this registry.
 *
 * THIS MODULE PERFORMS ONLY LOCAL FILESYSTEM I/O. It never calls
 * evaluate()/getChartApi()/any CDP primitive, never imports
 * src/connection.js or src/core/drawing.js, and never decides what to
 * draw — it only persists/looks up the mapping {role (scoped to a
 * symbol+timeframe) -> entity_id}. See src/core/xauusd_visualize.js for
 * the orchestrator that actually calls the drawing primitives and uses
 * this registry as its sole ownership authority.
 *
 * Same atomic-write / fail-safe-load discipline as
 * src/engine/watcherState.js and src/engine/anticipationStore.js.
 */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const REGISTRY_SCHEMA_VERSION = 1;

export const DEFAULT_REGISTRY_PATH = fileURLToPath(new URL('../../state/xauusd_drawing_registry.json', import.meta.url));

/**
 * Loads the registry. Missing file -> a fresh, empty registry (never an
 * error). Malformed/corrupt/wrong-shape file -> fails SAFELY to a fresh,
 * empty in-memory registry rather than crash or fabricate prior ownership
 * data. This is never a destructive reset of real data: the file on disk
 * is left completely untouched until the next successful atomic save.
 */
export function loadRegistry(path) {
  if (!existsSync(path)) return { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} };
    }
    return { schema_version: REGISTRY_SCHEMA_VERSION, entries: parsed.entries };
  } catch {
    return { schema_version: REGISTRY_SCHEMA_VERSION, entries: {} };
  }
}

/** Atomic temp-file + rename write -- a process kill mid-write can never leave a torn/partial registry file. */
export function saveRegistry(path, registry) {
  mkdirSync(dirname(path), { recursive: true });
  const payload = JSON.stringify({ schema_version: REGISTRY_SCHEMA_VERSION, entries: registry.entries ?? {} }, null, 2) + '\n';
  const tmpPath = `${path}.tmp-${process.pid}`;
  writeFileSync(tmpPath, payload);
  renameSync(tmpPath, path);
}

/**
 * Deterministic registry key: one MCP-owned drawing "slot" is uniquely
 * identified by (symbol, timeframe, role[, index]). `index` exists ONLY
 * for roles that explicitly support multiple simultaneous indexed
 * instances (mission Part 10: "unless a role explicitly supports multiple
 * indexed instances") -- it defaults to 0, meaning "at most one active
 * entity per unique role" is the default and normal case.
 */
export function buildRegistryKey({ symbol, timeframe, role, index = 0 }) {
  return [symbol ?? 'UNKNOWN_SYMBOL', timeframe ?? 'UNKNOWN_TF', role ?? 'UNKNOWN_ROLE', String(index)].join('|');
}

/** Every registry key belonging to a given (symbol, timeframe) scope -- used to bound reconciliation so it can never touch another symbol/timeframe's entries. */
export function scopedKeys(registry, { symbol, timeframe }) {
  const prefix = `${symbol ?? 'UNKNOWN_SYMBOL'}|${timeframe ?? 'UNKNOWN_TF'}|`;
  return Object.keys(registry.entries ?? {}).filter((k) => k.startsWith(prefix));
}

/**
 * Primitives whose CREATED anchor time is genuinely NOT part of their
 * visible geometry in the real TradingView drawing implementation.
 *
 * `src/core/drawing.js`'s `drawShape()` passes the exact same
 * `{time, price}` point structure to `createShape()`/`createMultipointShape()`
 * regardless of `shape` type — TradingView's OWN renderer is what gives
 * each shape type its specific geometric interpretation, and standard
 * TradingView drawing semantics for these exact primitive names are
 * unambiguous:
 *
 *   - `horizontal_line`: extends across the ENTIRE visible chart width at
 *     the given PRICE, regardless of which bar anchored its creation --
 *     empirically verified identical on-chart appearance across different
 *     anchor times in both the Stage 4 and Stage 5 live CDP proofs. This
 *     is the ONLY primitive where excluding time is safe.
 *   - `vertical_line`: TIME IS the entire visible geometry (a vertical
 *     line drawn at that time coordinate, extending across all prices) --
 *     changing it visibly moves the line. Never excluded.
 *   - `trend_line` / `rectangle`: two-point primitives (see
 *     `src/engine/visualization.js`'s `TWO_POINT_PRIMITIVES`) whose BOTH
 *     time coordinates are the actual line/box endpoints -- changing
 *     either one visibly reshapes the drawing. Never excluded.
 *   - `text`: a point-anchored label placed AT `(time, price)`. Unlike
 *     `horizontal_line` it does NOT extend/repeat across the chart --
 *     changing its time coordinate visibly moves the label to a different
 *     horizontal position. Never excluded. (A market-derived text intent
 *     re-anchored at a newer confirmed bar is therefore CORRECTLY treated
 *     as changed — that is real, visible geometry moving, not spurious
 *     "timestamp-only churn" the way an unused horizontal_line anchor is.)
 *
 * Required invariant (never violated): a timestamp is excluded from the
 * signature ONLY when changing it provably does not change what the
 * primitive looks like on the chart.
 */
const TIME_INVARIANT_PRIMITIVES = new Set(['horizontal_line']);

function pointForSignature(point, timeInvariant) {
  if (!point) return null;
  return timeInvariant ? { price: point.price ?? null } : { time: point.time ?? null, price: point.price ?? null };
}

/**
 * Deterministic content signature for a drawing intent -- used to detect
 * "unchanged" vs "changed" without storing/re-deriving the full intent.
 * See `TIME_INVARIANT_PRIMITIVES` above for exactly which primitive's
 * time coordinate(s) are excluded, and why -- every other primitive's
 * `point`/`point2` (including time) is included in full, since for those
 * primitives a time change IS a real, visible geometry change.
 */
export function computeIntentSignature(intent) {
  const timeInvariant = TIME_INVARIANT_PRIMITIVES.has(intent?.primitive);
  const canonical = JSON.stringify({
    primitive: intent?.primitive ?? null,
    point: pointForSignature(intent?.point, timeInvariant),
    point2: pointForSignature(intent?.point2, timeInvariant),
    text: intent?.text ?? null,
    overrides: intent?.overrides ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
