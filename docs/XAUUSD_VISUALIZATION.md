# XAUUSD Visual Market Intelligence — Stage 4 + Stage 5

Status: **Stage 4 (safe drawing infrastructure) and Stage 5 (real
market-evidence → visualization) both implemented.** Stage 6 (watcher
integration — automatic refresh on a new confirmed 5m candle, transition-
based notifications) is **not implemented yet**.

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

## What Stage 4 (alone) deliberately did NOT do

As shipped, Stage 4 drew nothing automatically — no structure, S/R,
supply/demand, liquidity, FVGs, classical pattern geometry, breakout/
retest state, primary/alternate scenario, or Entry/SL/TP.
`visualization.js` defined the intent *shape* only. Stage 5 (below) is
what maps real evidence/anticipation output into intents and actually
decides what to draw for a given market snapshot.

## Controlled live CDP verification performed (Stage 4)

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

---

## Stage 5 — Real Market Evidence → TradingView Visualization

### Purpose

Stage 4 proved the drawing infrastructure was safe. Stage 5 makes it
useful: it maps the MOST RELEVANT parts of the already-computed market
analysis (structure, S/R, supply/demand, liquidity, the strongest current
classical pattern, breakout/retest lifecycle, and the Stage 1/2
anticipation primary/alternate scenario) into a clutter-budgeted set of
real TradingView drawings, and — only when the protected decision is a
confirmed BUY/SELL — the exact protected Entry/SL/TP1/TP2. **MCP remains
the only analysis brain; TradingView drawings remain presentation only.**
Nothing drawn ever changes `decision`/`confluence`/`anticipation`, and
nothing in this stage recomputes, second-guesses, or adjusts a single
protected value.

### Where it lives

- `src/engine/marketVisualization.js` — the pure mapper
  (`buildMarketVisualizationIntents()`). No I/O, no CDP, no persistence.
- `src/core/xauusd_visualize_market.js` — the execution orchestrator
  (`visualizeMarketAnalysis()` / `visualizeXauusdMarket()`), tying the
  analysis stack, the mapper, and Stage 4's reconciler together.
- `xauusd_visualize_market` — the one new MCP tool (Development profile
  only), registered in `src/tools/xauusd.js`.

### Evidence exposure (one small, additive change to a frozen file)

`src/core/xauusd_analyze_market.js`'s `analyzeMarket()` previously
computed an `evidence` object internally (to build `confluence` and
`anticipation`) but never returned it. Stage 5's mapper signature
explicitly requires `evidence` as a first-class input — `confluence`
alone exposes only a lossy subset (e.g. `structure_state` as a bare
string, not the full `structure` object with `lastEvent`/
`lastSwingHigh`/`lastSwingLow` the mapper needs). `analyzeMarket()` now
also returns `evidence` verbatim — the exact same object already used to
build `confluence`/`anticipation`, never a second computation, never
altering any existing field. Verified byte-identical before/after by the
existing Stage 1/2/3 regression suite, plus two new dedicated tests.

### Real-timestamp limitation (documented, not hidden)

`structure.js` and `breakout.js` report pivot/event positions as **array
indices** into the bars window that produced them, never as bar
timestamps — an index is not stable/meaningful outside the specific fetch
that produced it (the same "new ID every call" failure mode Stage 3 had
to avoid for setup identity). Every horizontal_line/text intent derived
from structure/levels/liquidity/breakout evidence is therefore anchored
at the **current/latest confirmed bar's timestamp**
(`decision.market_data_times`/`decision.timeframes[tf].last_confirmed_bar_time`
— a real, objective, already-computed market timestamp, **never**
wall-clock time) rather than the level's own historical formation bar,
which is not available. A `horizontal_line`'s visual extent does not
depend on which bar anchors it, so the LEVEL itself (always the exact,
real, already-computed price) is never misrepresented — this is not a
claim about *when* a level formed. `patterns.js` is the one evidence
layer that DOES expose real bar timestamps (`start_time`/`end_time`/
`pivot_points[].time`, looked up from the bars it was given) — pattern
geometry uses those directly, never the current-bar substitution.

**Supply/demand zones**: `levels.js` exposes real PRICE bounds
(`zone_low`/`zone_high`) but only an `origin_bar_index` (not a
timestamp) — with no objective time bounds, a `rectangle` cannot be
drawn without fabricating a time span, so zones are rendered as a single
`horizontal_line` at the zone edge nearest current price (the mission's
own explicit fallback). **Fair value gaps** have the identical
missing-time-bounds problem and are **never visualized** — explicitly
skipped, not forgotten.

### Active-market-only philosophy / priority system

Not a dump of everything the engine knows. Three priority tiers:

- **P1 (decision-critical)**: confirmed `trade_entry`/`trade_sl`/
  `trade_tp1`/`trade_tp2`/`trade_status` (BUY/SELL only), and the
  anticipation `primary_scenario`/`primary_trigger`/`primary_invalidation`
  (WAIT only — these two P1 subsets are mutually exclusive per bar by
  Stage 1/2's own design: `primary_scenario` is `null` exactly when
  `CONFIRMED`).
- **P2 (active setup context)**: `structure_primary`, `structure_event`,
  `nearest_support`, `nearest_resistance`, `active_demand`,
  `active_supply`, `liquidity_primary`, `pattern_primary`,
  `breakout_level`.
- **P3 (supporting context)**: `alternate_scenario`,
  `alternate_trigger`, `alternate_invalidation` — only when Stage 1/2's
  anticipation engine actually produced an objective opposing path.

### Clutter budget

`CLUTTER_BUDGET.MAX_TOTAL = 12`. Priority-ordered suppression (tier 1
first, stable order within a tier) — never a blind sum of per-category
maxima. Real live-market verification (see below) produced **6** drawings
for a genuine WAIT/TRANSITION snapshot, comfortably inside the 6–12
target.

### Coincident-level merge (found and fixed via the live dry-run)

Real live testing surfaced that multiple independent roles can
legitimately land on the **exact same price** — `structure_event` and
`breakout_level` are *guaranteed* to coincide whenever a breakout
lifecycle is active (both anchor to `structure.lastEvent.level` by
construction), and `pattern_primary`/`liquidity_primary` can coincide
with it too (genuine technical confluence — a CHoCH level that is also a
pattern neckline that is also a swept liquidity level). Drawing 3–4
stacked, overlapping lines at the identical price is poor chart hygiene
regardless of whether the confluence is real or coincidental:

- `structure_event` is skipped outright whenever `breakout_level` will
  already cover the identical level with a strictly more current
  lifecycle label (root-cause fix for the guaranteed-duplicate case).
- A general `mergeCoincidentLevels()` pass combines any remaining
  same-price `horizontal_line` candidates into ONE drawing (the
  highest-priority role's point/primitive kept as anchor; other labels
  appended, length-capped, never silently discarded — each merged role is
  recorded in the audit trail as `MERGED_INTO_<role>_SAME_PRICE`, never
  simply "gone").
- **Confirmed trade geometry is never merged**, even if it coincides with
  another level — `ENTRY`/`SL`/`TP1`/`TP2` must always stay exact and
  separately labeled.

### WAIT label wording

`primary_scenario`'s text combines the authoritative WAIT reason with the
pre-entry state, but avoids the redundant `"WAIT — WAIT (REASON)"` that a
naive template produces when `anticipation.state` is itself bare `WAIT`
(nothing more specific developing) — it renders `"WAIT (REASON)"` in that
case, and `"WAIT — <STATE> (REASON)"` when a more specific pre-entry state
exists (e.g. `"WAIT — CONFIRMATION_PENDING (CORRECTION_ACTIVE)"`).

### Style system

Centralized in `styleFor(category, direction)` — uses **only** the
override keys empirically verified against the real TradingView API
(`linecolor`, `linewidth`, `linestyle` — confirmed working in both the
Stage 4 and Stage 5 live CDP proofs; no other override key is invented or
assumed). Semantic color distinction by category (structure/S-R/supply-
demand/liquidity/pattern/breakout/primary/alternate/trade), with
direction-aware coloring (green/red) for primary scenario and confirmed
trade geometry.

### No fabricated trade geometry — the hard rule

`trade_entry`/`trade_sl`/`trade_tp1`/`trade_tp2` are emitted **only**
when `decision.action` is `BUY` or `SELL`, using `decision.entry`/`sl`/
`tp1`/`tp2` **exactly** — never recalculated, never adjusted, never
inferred when a field is missing. On `WAIT`, all five trade roles
(including `trade_status`) are explicitly excluded with reason
`DECISION_IS_NOT_CONFIRMED` — proven by dedicated tests for every real
WAIT reason the engine can produce. Quality is never rendered as a
percentage/probability (`BUY | PB | RR 2.1 | Q 78`, never `"78% chance"`).

### Important visual semantics (never blurred)

SUPPORT ≠ ENTRY. DEMAND ZONE ≠ BUY ZONE. RESISTANCE ≠ SELL SIGNAL.
LIQUIDITY ≠ TARGET (never labeled a target unless the engine explicitly
treats it as one — it currently doesn't, so liquidity is always
descriptive). PRIMARY TRIGGER ≠ ENTRY (labeled "(conditional)").
PRE-ENTRY INVALIDATION ≠ SL (`primary_invalidation`'s text is literally
`"PRE-ENTRY INVALIDATION (not SL)"`, and is only ever drawn from
`anticipation.primary_scenario.invalidation`, never from
`decision.sl`). FORMING pattern ≠ confirmed trade. ARMED ≠ BUY/SELL.

### No prediction language

No "will rise/fall", "guaranteed", "high probability", "certain buy/
sell" anywhere. Scenario labels are conditional
(`"PRIMARY — BULLISH TREND_CONTINUATION — CONFIRMATION_PENDING"`,
`"TRIGGER (conditional) — ARMED"`) — actual `BUY`/`SELL` labels appear
only when `decision.action` already says so.

### Role ownership / timeframe hierarchy

Every drawing has a stable role (see the P1/P2/P3 lists above), reconciled
through Stage 4's existing registry-based ownership — unchanged from
Stage 4's own guarantees (KEEP/CREATE/REMOVE_REGISTERED/
DROP_STALE_REGISTRY, `draw_clear` never reachable). All Stage 5 geometry
is anchored to the single **primary decision timeframe**
(`decision.diagnostics.source_timeframe`, currently always 15m) — no
equal-timeframe voting, no per-timeframe overlay dump; higher-timeframe-
specific visualization is deliberately out of scope for this pass.
`confluence` is accepted by the mapper for interface stability but not
currently read by any drawing decision.

### Intent-signature fix — primitive-aware time semantics (two passes)

The live second-cycle proof (mission Part 31) initially showed
`removed_registered: 6, created: 6` instead of the expected `kept: 6` on
a re-run against the SAME unchanged market snapshot. Root cause:
`drawingRegistry.js`'s `computeIntentSignature()` included `point.time`/
`point2.time` — since most Stage 5 intents are anchored at "the latest
confirmed bar" (an ever-advancing value with every new candle), the
signature changed on every call even when the level/text/style were
completely unchanged.

**First pass** excluded `time` from the signature entirely, for every
primitive. A follow-up review correctly flagged this as unsafe in
general: for a two-point primitive (`trend_line`/`rectangle`) or
`vertical_line`, the time coordinate(s) ARE the actual visible geometry —
blanket-excluding them would silently hide a real, on-chart shape change.

**Corrected, primitive-aware fix**: re-inspecting `src/core/drawing.js`'s
`drawShape()` (it passes the exact same `{time, price}` structure to
`createShape()`/`createMultipointShape()` regardless of `shape` — it is
TradingView's own renderer that gives each shape type its specific
geometric interpretation) confirms `horizontal_line` is the **only**
primitive whose anchor time is provably not part of its visible
geometry — it extends across the entire visible chart width at the given
price regardless of which bar anchored its creation (empirically
identical on-chart appearance across different anchor times in both the
Stage 4 and Stage 5 live CDP proofs). Every other primitive's time
coordinate(s) are real geometry and are never excluded:

| Primitive | Time excluded from signature? | Why |
|---|---|---|
| `horizontal_line` | **Yes** | Extends full chart width; anchor time is not visible geometry. |
| `vertical_line` | No | Time IS the primary geometry (the line's own position). |
| `trend_line` | No | Both endpoints (`point`, `point2`) are the actual line coordinates. |
| `rectangle` | No | Both corners (`point`, `point2`) are the actual box bounds. |
| `text` | No | A point-anchored label — its time coordinate controls where it visibly sits; unlike `horizontal_line` it does not extend/repeat across the chart. A market-derived text intent (`primary_scenario`/`alternate_scenario`) re-anchored at a newer confirmed bar is therefore CORRECTLY treated as changed — that is real geometry moving, not spurious churn. |

Verified by a full primitive-by-primitive regression test matrix (23
tests) plus a repeat live-market run showing `kept: 6, created: 0,
removed_registered: 0` with the exact same 6 entity IDs before and after
— all 6 of Stage 5's currently-active roles happen to be `horizontal_line`
in the live proof's specific market snapshot, so all 6 correctly KEEP;
a `text`-based role (`primary_scenario`) legitimately re-creates on a new
confirmed bar even with unchanged content, since its position is real,
visible geometry that has genuinely moved.

### MCP tool exposure

**One new tool, `xauusd_visualize_market`**, added to
`APPROVED_DEVELOPMENT_EXTRA_TOOLS` (Development profile only — never
Research). It internally calls `analyzeMarket()` (the SAME unmodified,
single-sweep orchestrator `xauusd_analyze_market` already uses — never a
second/duplicate 10-TF sweep), builds intents, and reconciles them
through Stage 4's safe path — all encapsulated internally. **No raw
drawing tool (`draw_shape`/`draw_list`/`draw_remove_one`/
`draw_get_properties`) is exposed at all**, and `draw_clear` remains
completely unreachable — this is the smallest safe surface (mission's own
explicit preference), verified by dedicated profile-gate tests. The tool
accepts exactly one parameter, `dry_run` (boolean, default `false`) — no
`entity_id`, `shape`, or `role` parameter exists anywhere in its schema,
so it structurally cannot be used to remove or "clear" an arbitrary/
unknown/user drawing.

### Dry-run first, then controlled live proof (both performed)

Per the mission's own required order: a dry-run was run against REAL
current `OANDA:XAUUSD` analysis first (`dry_run: true` — zero mutation),
inspected for clutter/fabrication/duplicate levels (this is exactly how
the coincident-level-merge and intent-signature issues above were
found), fixed, and re-verified — only then was a real, live, mutating
run performed. See the Stage 5 implementation report for the full
numeric results of both.

### Failure isolation

A visualization failure (a failed draw/remove, a registry persistence
failure, an unreachable `listDrawings`) is reported in the result's
`visualization.warnings`/`failed` fields — it **never** alters
`decision.action` or any other authoritative field, proven by a dedicated
test that injects a `drawShape` failure and asserts the `decision` object
is byte-identical before and after.

### Orphan-drawing risk (Stage 4's limitation, unchanged, never solved by inference)

Stage 5 introduces no new orphan-risk path and does not attempt to reduce
Stage 4's documented one: if `drawShape` succeeds but the subsequent
`saveRegistry` fails, the new shape is real but untracked until a human
or a future reconciliation notices and cleans it up manually — this is
still never solved by guessing ownership from shape similarity, and
`draw_clear` is never used to "recover".

### Stage 3 / watcher boundary

Stage 5 reads `anticipation`/`evidence`/`confluence` — it never writes to
Stage 3's persisted store (`state/xauusd_anticipation_store.json` /
`state/xauusd_wait_opportunity_log.jsonl`), never calls
`recordAnticipationObservation()`, and never fabricates or backfills an
observation. `watcher.js`/`watcherState.js`/`notifier.js` remain
completely untouched — automatic refresh on a new confirmed 5m candle and
transition-based notification policy are Stage 6, not yet implemented.

### Controlled live CDP verification performed (Stage 5)

Two real cycles against the live `OANDA:XAUUSD` chart (real analysis, real
drawings, the REAL default registry path — this is genuine persistent
market intelligence the feature is meant to leave on the chart, not a
throwaway synthetic test object like Stage 4's proof): cycle 1 created 6
drawings exactly matching the dry-run's plan, zero pre-existing drawings
disturbed, all 6 registry entries verified present on the chart, chart
symbol/resolution/studies unchanged throughout; a second cycle (after the
intent-signature fix) reproduced `kept: 6, created: 0,
removed_registered: 0` with the identical 6 entity IDs before and after —
the zero-churn proof mission Part 31 requires. `draw_clear` was never
called. See the Stage 5 implementation report for the full numeric
result.
