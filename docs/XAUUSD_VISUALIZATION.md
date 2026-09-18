# XAUUSD Visual Market Intelligence — Stage 4

Status: **Stage 4 implemented** (safe drawing infrastructure + ownership
only). Stage 5 (mapping real market/anticipation evidence into drawing
intents and actually drawing the market) is **not implemented yet**.

## Architecture

**MCP is the analysis brain. TradingView drawings are presentation only.**
Nothing in this stage computes a trading decision, and nothing drawn ever
feeds back into `decision`/`anticipation`/`confluence`/Stage 3 observations
— data flow is one-way: engine output → (future Stage 5 mapping) → drawing
intent → this infrastructure → TradingView shape.

## Where it lives

- `src/engine/drawingRegistry.js` — the ownership registry (persistence
  primitives only, no CDP).
- `src/engine/visualization.js` — the drawing-intent schema (pure, no I/O,
  no decision dependency). Stage 4 only defines and validates this shape;
  it does not yet generate real intents from market evidence.
- `src/core/xauusd_visualize.js` — the orchestrator: reconciles desired
  intents against the registry and the chart's actual current drawings,
  and executes the plan (or previews it in dry-run mode).

## What the real drawing stack actually supports (verified against source, not assumed)

- `src/core/drawing.js`'s `drawShape()` supports exactly 5 primitives —
  `horizontal_line`, `vertical_line`, `trend_line`, `rectangle`, `text`
  (cross-checked against `src/tools/drawing.js`'s own tool schema).
- `createShape()`/`createMultipointShape()` never return an entity ID
  directly. `drawShape()` discovers the new ID by diffing
  `getAllShapes()` before/after creation — if that diff finds nothing new,
  `entity_id` is `null`, and this project's orchestrator never registers a
  null ID as owned.
- `listDrawings()` returns only `{id, name}` per shape. `name` is
  TradingView's own shape-TYPE name (e.g. `"horizontal_line"`), never
  something this project sets. **`text` is never returned by a list
  read at all**, and there is no tag/group/metadata field of any kind
  anywhere in the API. This is a structural fact verified directly against
  the source, not a limitation this project chose — **ownership can only
  ever be tracked client-side, in the registry.**
- `getProperties(entity_id)`/`removeOne(entity_id)` both **throw** when the
  ID is not currently on the chart (`Shape not found: <id>`). This project
  treats that throw as the expected, routine "stale ID" signal, never as
  fatal.
- `clearAll()` calls TradingView's `removeAllShapes()` — a global wipe of
  **every** shape on the chart, including the user's own manual drawings
  and other indicators' drawings. This project's visualization code never
  calls it, imports it, or exposes it (enforced structurally — see below —
  and by tests).

## Hard safety rule: `draw_clear` is never used

No code path in `drawingRegistry.js`, `visualization.js`, or
`xauusd_visualize.js` references `clearAll`, `removeAllShapes`, or
`draw_clear` in actual code (source-audit tests strip comments before
checking, so the doc comments *explaining* this rule by name don't
trip the check on themselves). The **only** removal primitive this stage
ever calls is `removeOne(entity_id)`, and it is **always** called with an
`entity_id` this project's own registry already recorded as MCP-owned —
never inferred from shape type, coordinates, text similarity, or proximity
to a computed price level. An entity ID absent from the registry is never
removed by this code, structurally, not merely by convention.

## Ownership registry

`state/xauusd_drawing_registry.json` (atomic temp-file+rename writes, same
discipline as `watcherState.js`/`anticipationStore.js`; missing file →
empty registry; malformed file → fails safe to empty, never crashes, never
destructively clobbers a file it couldn't parse). One entry per
`(symbol, timeframe, role[, index])` — a deterministic key
(`buildRegistryKey()`), so "at most one active entity per unique role" is
the default, with an explicit `index` escape hatch for a role that
genuinely needs multiple simultaneous instances. Each entry records
`role`, `entity_id`, `symbol`, `timeframe`, `primitive`,
`intent_signature` (a content hash used to detect "unchanged" without
re-deriving the full intent), and `created_at`.

**Runtime location, never committed.** `state/` is already blanket-
gitignored by this repository (the same precedent Stage 3's
`anticipationStore.js` already established and documented) — no
`.gitignore` change was needed. Only the code
(`src/engine/drawingRegistry.js` and its tests) is tracked in git; the
registry file itself starts empty and is never seeded/backfilled.

## Session-specific / stale entity IDs

TradingView entity IDs are not assumed to survive a chart reload, a
TradingView restart, or a manual deletion. The reconciliation plan checks
every registered entity against **one real `listDrawings()` read** of what
currently exists on the chart:

- Registered, but no longer present → `DROP_STALE_REGISTRY` (the stale
  bookkeeping entry is discarded) followed by `CREATE` (a fresh replacement
  is drawn, if still desired). **Never** a search for a "similar-looking"
  shape to reclaim — a stale ID is simply gone, not rediscovered.
- If `listDrawings()` itself fails (CDP unreachable, etc.), reconciliation
  **changes nothing** and reports a warning — an empty/unavailable read is
  never treated as "everything is stale," which would otherwise force
  bogus `DROP_STALE_REGISTRY` entries and risk masking real, still-present
  drawings.

If TradingView restarts and every previously-registered ID becomes
invalid, the very next reconciliation cycle detects each one as stale via
the same `listDrawings()` check and recovers cleanly — it never touches an
unknown/user-owned shape in the process, because recovery only ever acts
on entity IDs this registry already owned.

## Dry-run

`reconcileVisualization({..., dryRun: true})` calls `loadRegistry()`
(read) and `listDrawings()` (read, so `DROP_STALE_REGISTRY` detection is
accurate even in preview) and returns the full plan — `KEEP` / `CREATE` /
`REMOVE_REGISTERED` / `DROP_STALE_REGISTRY` (plus `SKIP_INVALID` for a
malformed intent) — **without ever calling `drawShape`, `removeOne`, or
`saveRegistry`**. The execution loop that calls those functions is
structurally unreachable when `dryRun` is true (a plain early `return`,
not a flag threaded through the mutating code), and this is directly
tested.

## Profile capability boundary

**Unmodified in Stage 4, by deliberate choice.** `profiles.js` was
inspected directly: neither `XAUUSD_RESEARCH` nor `XAUUSD_DEVELOPMENT`
currently exposes any drawing tool at all (`draw_shape`/`draw_list`/
`draw_remove_one`/`draw_get_properties` are all classified under
`PROHIBITED_MUTATING_TOOLS` or `OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE`,
and `server.js` registers every tool group through `ProfileGate`, which
silently drops any tool name not in the active profile's allowlist —
verified directly in `profile_gate.js`, not assumed).

Stage 4 does not need MCP-level tool exposure to exist or to be verified:
its infrastructure is exercised by unit tests (in-memory/mocked
dependencies) and, for controlled live verification, by directly invoking
`reconcileVisualization()` from a script with real dependencies — the
existing ungated CLI drawing commands (`src/cli/commands/drawing.js`) are
a separate, already-existing, already-ungated path that needed no changes
either. **No new MCP tool and no profile change were added in this
stage.** The smallest capability tier Stage 5 would eventually need is
documented here for that future decision: `draw_shape`, `draw_list`,
`draw_remove_one`, `draw_get_properties` — explicitly **never**
`draw_clear`.

## Crash safety / unavoidable orphan risk (never hidden)

- A failed `removeOne` never cascades: no global clear, no other entity
  touched. The registry entry is deliberately **left in place** on an
  ambiguous failure (network error, etc.) — ownership is never guessed
  away. If the shape really was already gone, the next cycle's
  `listDrawings()`-based check correctly reclassifies it as
  `DROP_STALE_REGISTRY`.
- A failed `drawShape` (or one that returns no discoverable `entity_id`)
  never writes anything to the registry — a failed create cannot corrupt
  ownership state.
- **The one genuinely unavoidable risk:** `drawShape` can succeed (a real
  shape now exists on the live chart) immediately before `saveRegistry`
  fails (disk full, permission error, etc.). That shape is now a real,
  untracked orphan — the next reconciliation cycle reloads the registry
  from disk and has no record of it. This is surfaced as an explicit
  `ORPHAN RISK` warning in the result, and no further mutating step runs
  in that reconciliation cycle so the risk cannot compound into more
  untracked shapes. There is no way to eliminate this risk entirely
  without TradingView itself offering atomic create+tag semantics, which
  it does not.

## What Stage 4 deliberately does NOT do

No automatic drawing of structure (HH/HL/LH/LL, BOS/CHoCH), S/R,
supply/demand, liquidity, FVGs, classical pattern geometry, breakout/retest
state, primary/alternate scenario, or Entry/SL/TP. `visualization.js`
defines the intent *shape* only; nothing yet maps real evidence/
anticipation output into intents — that mapping, and the actual decision
of *what* to draw for a given market snapshot, is Stage 5.

## Controlled live CDP verification performed

A one-time, manual, non-committed script exercised the real path end to
end against a live TradingView connection: created one harmless
`horizontal_line` test drawing (clearly labeled, isolated to a scratch
registry file), verified it was registered and appeared on the chart with
zero pre-existing drawings disturbed, then reconciled again with an empty
intent list and verified the exact registered entity was removed, the
drawing count returned to its original value, the registry held zero
remaining entries, and the chart's symbol/timeframe were unchanged
throughout. `draw_clear` was never called. See the Stage 4 implementation
report for the full result.
