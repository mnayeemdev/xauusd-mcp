# XAUUSD MCP — Stage 6: Live Adaptive Runtime

> HISTORICAL (Stage 6, 2026-09-21). For the processes that run today (REAL watcher, Stage 11C observer, Stage 12 validator), the authority map and the pre-market procedure see `docs/XAUUSD_SYSTEM_CURRENT_STATE.md`, `docs/XAUUSD_AUTHORITY_MAP.md`, `docs/XAUUSD_PRE_MARKET_CHECKLIST.md`.

This document covers Stage 6's additions on top of the frozen Stage 1-5 stack
(anticipation engine, opportunity observability, safe drawing infrastructure,
market visualization). It does not restate Stage 1-5 — see
`docs/XAUUSD_ANTICIPATION.md` and `docs/XAUUSD_VISUALIZATION.md` for those.

Every protected trading parameter (`RISK_PARAMS.minRR = 1.7`,
`QUALITY_PARAMS.qualityThreshold = 65`,
`CORRECTION_PARAMS.corrResolveConfirmBars = 3`) and every protected decision
file (`regime.js`, `structure.js`, `correction.js`, `models.js`, `risk.js`,
`quality.js`, `pipeline.js`, `mtf.js`, `htf.js`, `xauusd_calculate.js`, and the
Pine indicator source) is **unchanged** by Stage 6. `git diff --stat` against
those paths is empty.

## 1. Candidate vs Authoritative (Part 3)

`src/core/xauusd_analyze_market.js`'s `analyzeMarket()` now returns an
additive `candidates` field:

```
candidates: {
  '5m':  { status, regime, candidate_action, candidate_model, candidate_quality, candidate_rr, blocked_by },
  '15m': { ... },
  '30m': { ... },
}
```

Each entry comes from a **second call to the protected, pure `runPipeline()`**
(`src/engine/pipeline.js`, untouched) on the exact same already-fetched
confirmed bars `calculateEntry()` itself used internally, mirroring its own
30m→15m/5m `htfRegime` chaining exactly. Because the inputs are byte-identical
and `runPipeline()` is pure, this can never diverge from what the protected
engine already computed — it only exposes intermediate values
(`candidate_action`, the per-TF `blocked_by` gate) the public decision shape
doesn't surface. **`candidates` is never fed back into any decision and never
itself produces BUY/SELL.**

`analyzeMarket({ persistSignals })` also gained an opt-in boolean (default
`false`). `false` (every pre-Stage-6 caller, and every on-demand MCP tool
call) keeps the existing ephemeral in-memory signal store, so an on-demand
analysis can never suppress a real alert the watcher would otherwise raise.
`true` (the watcher's own cycle only) routes to the real persisted store
(`validation/mcp_engine_signals.json`) instead.

## 2. Confirmation-window / model-coverage observability (Part 4-6)

Stage 3's `recordAnticipationObservation()` (`src/engine/anticipationStore.js`)
gained an optional `candidates` parameter — the same object above, stored
verbatim on each observation record, defaulting to `null` (every pre-Stage-6
call site is unaffected). `validation/opportunity_metrics.js` gained
`candidate_blocked_by_counts`: per-timeframe counts of `blocked_by` reasons,
generic/unbounded (any reason string the engine ever emits is counted, never
a hard-coded list) and excluding records with no candidate data. As with
every other Stage 3 metric, this **never computes a win rate, accuracy,
profit factor, or expectancy** — it is pure frequency counting over
already-observed, already-labeled records.

## 3. Active chart timeframe intelligence (Part 7-15)

This was flagged as the main Stage 5 usability gap: Stage 5's visualization
always assumed the user was looking at the 15m decision timeframe, which is
frequently untrue.

**Terminology, used consistently everywhere below:**
- **Decision timeframe** — always 15m, `decision.diagnostics.source_timeframe`. Never changes.
- **Active chart timeframe** — whatever `chart.resolution()` the user's chart is *currently* showing. Can be anything, anytime, independent of the decision timeframe.
- **Context timeframes** — 1H/2H/4H/8H/1D/1W/1M, the existing read-only HTF context tiers `xauusd_calculate.js` already computes.

### 3.1 `src/core/xauusd_chart_context.js`

`getActiveChartContext({ _deps })` reads the symbol + resolution the chart is
**currently** on via **one** `getState()` call, normalizes the resolution
against `TF_LABEL`'s own code vocabulary (`normalizeChartResolution()`; both
`"D"` and `"1D"`-style spellings accepted), and — only when the symbol is an
approved XAUUSD alias and the resolution is recognized — fetches **only that
one timeframe's own bars** via **one** `getOhlcv()` call and computes TF-local
evidence via the **same, exported** `computeEvidence()`
`xauusd_analyze_market.js`'s own decision path uses.

**Zero chart mutation.** This function never calls `setTimeframe()` or
`setSymbol()` — by definition the chart is already on whatever TF is
"active," so reading it needs no switch. This structurally eliminates the
race condition where the MCP is mid-sweep and the user manually changes the
chart TF: there is nothing to race, because this path never changes the TF in
the first place. (The pre-existing decision-analysis sweep in
`fetchMultiTimeframeBars()`/`calculateEntry()` still switches timeframes and
restores afterward, unchanged.)

Status outcomes: `OK`, `SYMBOL_MISMATCH` (paused state
`VISUALIZATION_PAUSED_SYMBOL_MISMATCH` — the symbol is never force-switched),
`UNKNOWN_TIMEFRAME` (fails safe, no evidence), `INSUFFICIENT_DATA`,
`READ_ERROR` (CDP unavailable — fails closed, never fabricates a TF).

### 3.2 `buildChartLocalVisualizationIntents()` (`src/engine/marketVisualization.js`)

Reuses Stage 5's existing per-category builders (structure/SR/supply-demand/
liquidity/pattern/breakout — already generic over `{symbol, timeframe, time}`,
never hardcoded to the decision TF) but **omits** trade/primary/alternate
candidates, since confirmed trade geometry and anticipation scenarios only
ever exist for the protected 5m/15m/30m entry timeframes.

Every role is namespaced with the `chart_` prefix
(`CHART_LOCAL_ROLE_PREFIX`). This is required, not cosmetic: the drawing
registry keys ownership as `(symbol, timeframe, role)`. When the active chart
TF happens to equal the decision TF (the user is looking at the same 15m
chart the decision uses), an unprefixed `structure_primary` role here would
silently collide with the decision-TF's *own* `structure_primary` registry
entry. The prefix makes every chart-local role distinct from every
decision-TF role in every case, not just the common (different-timeframe)
one.

### 3.3 `src/core/xauusd_visualize_chart_context.js`

`visualizeActiveChartContext({ dryRun, _deps })` ties it together: read
context → map to chart-local intents → reconcile via Stage 4's **unmodified**
`reconcileVisualization()` → **an additive cross-timeframe cleanup pass**.

Stage 4's reconciler only ever touches its own `(symbol, timeframe)` scope —
a hard safety guarantee that it can never delete another scope's drawings by
accident. That guarantee also means it has no way to know "the user switched
from 4H to 1H" by itself. `cleanupStaleChartLocalScopes()` supplies exactly
that one additional, narrowly-scoped pass: only `chart_`-prefixed roles, only
the current symbol, only a timeframe that is *not* the currently active one —
using the exact same registry-checked `removeOne()` path Stage 4 itself uses
(never `draw_clear`, never a role/coordinate/text-similarity guess). A
15m→30m→4H→1D→30m switch sequence correctly uses each timeframe's own current
evidence and removes the previous timeframe's stale `chart_` drawings, one
hop at a time — it never restores or relabels one TF's geometry as another's.

**Symbol mismatch:** when the active chart isn't an approved XAUUSD alias,
this orchestrator makes **zero** drawing calls of any kind (no reconciliation,
no cleanup) and returns the paused context verbatim. Cleaning up a
non-XAUUSD chart's drawing scope is out of scope — this registry only ever
tracks XAUUSD-scoped entries.

## 4. Watcher integration (Part 16-19, 21)

`src/engine/watcher.js` — the ONE file explicitly authorized for behavior
change this stage. Exact changes:

1. **`createCycleDeps()`**: the `calculateEntry` dep is replaced with
   `analyzeMarket` (default: `analyzeMarket` from
   `xauusd_analyze_market.js`). Two new **optional** deps added:
   `recordAnticipationObservation` and `visualizeMarketAnalysis` (both
   default to their real Stage 3/5 implementations).
2. **`runWatcherCycle()`**: on a fresh confirmed 5m candle, calls
   `deps.analyzeMarket({ persistSignals: true })` instead of bare
   `calculateEntry()` — the real, persisted signal store, since the watcher
   is the one process that must actually dedup real alerts. Immediately
   after, in mission order (analysis → anticipation, already inside
   `result` → Stage 3 observation → visualization refresh → notification):
   - `deps.recordAnticipationObservation({...})` is called with the SAME
     `result` (`decision`, `evidence`, `anticipation`, `confluence`,
     `candidates`), for **every** fresh candle (WAIT included, not just
     BUY/SELL) — so WAIT is properly counted for Stage 3's own metrics.
   - `deps.visualizeMarketAnalysis({ analysis: result, dryRun: false })` is
     called with the same already-computed result — never a second sweep.
   - Both calls are **optional** (checked with `typeof ... === 'function'`)
     and individually wrapped in `try/catch`: a failure or absence of either
     can never alter `result` or block/change the alert decision, which is
     still made by the unmodified `evaluateEngineResult()` from `result`
     alone (mission Part 31, failure isolation).
3. **`startWatcher()`**: a second, independent step is folded into the
   *same* existing 60-second tick — never a second timer, never a watcher
   restart to pick up a manual chart TF/symbol change:
   ```
   if (await deps.cycleDeps.isCdpReachable()) {
     await deps.visualizeActiveChartContext({ dryRun: false });
   }
   ```
   This is the **chart-visualization cadence** — lightweight (a single
   active-TF read, never a 10-TF sweep), independent of whether a new
   confirmed 5m candle triggered the trade-analysis cadence, and gated
   behind the SAME fast (~2.5s timeout) `isCdpReachable()` probe the
   trade-analysis cadence already uses. Without this gate, an unreachable
   CDP would fall through to `getActiveChartContext()`'s real `getState()`
   call, which goes through `connection.js`'s full 5-attempt exponential
   backoff `connect()` retry loop — tens of seconds to over a minute of
   stall, discovered directly while building this: an early version of this
   tick (without the gate) made `tests/engine_watcher.test.js` hang for
   minutes in a sandbox with no CDP listener, traced to exactly this retry
   loop, and fixed by adding the reachability gate. A failure here is
   logged and never affects `state`/the trade-analysis path.

**Two cadences, one timer**, per mission Part 16: (A) trade-analysis — gated
on a genuinely new confirmed 5m candle, unchanged efficient dedup; (B)
chart-visualization — every tick, lightweight, TF/symbol-only.

## 5. Simplified trading output (Part 23-26, extended by the Pre-Entry Opportunity Planner)

**Correction (Pre-Entry Opportunity Planner pass):** the prior version of
this section documented `src/core/xauusd_present.js` as the simplified
output layer. That module was **dead code** — created without noticing
that `src/core/presentation.js` (a pre-existing, already-wired-into-the-
real-CLI module: `formatEngineDecision()`/`formatMarketAnalysis()`, used
by `npm run xauusd:check` and `npm run xauusd:watch -- --once`) already
served exactly this role. `xauusd_present.js` and its test were **deleted**
this pass; every enrichment now lives in `presentation.js`'s
`formatMarketAnalysis()`, the real, exercised path.

`formatMarketAnalysis(analysisResult)` returns `{ headline, lines,
structured }` (the CLI's own established contract — `tv <cmd>` prints
`JSON.stringify(result, null, 2)`, so `lines` is what a caller joins for
display). It reuses `formatEngineDecision()`'s BUY/SELL/DATA-UNAVAILABLE
rendering **verbatim** (unchanged — same `Entry:`/`SL:`/`TP1:`/`TP2:`/
`RR:`/`TF:`/`Setup:`/`Quality:` lines, same `"WAIT — NO TRADE"`/`"Reason:
..."` header for WAIT) and additively appends, ONLY for WAIT:

- The existing Stage 1+2 anticipation lines (`Pre-entry:`, `Developing:`,
  `Waiting for:`, `Invalidated if:`, `Primary scenario:`/`Alternate
  scenario:` — unchanged, pre-existing).
- **New** Pre-Entry Opportunity Planner lines, when
  `analysisResult.pre_entry_plan.status === 'PLAN'`:
  `Opportunity: <BUY|SELL> <opportunity_state>`,
  `Candidate Entry Zone: <lower> - <upper>` (or a single price when the
  zone is point-precision — never a fabricated range),
  `Provisional Invalidation: <level>`, `Candidate TP1:`, `Candidate TP2:`,
  `Candidate RR:`, `Waiting for (opportunity plan): <...>`, and
  `Alternative: <BUY|SELL> — <zone type>` only when the planner
  objectively found one. When `pre_entry_plan.status === 'NO_PLAN'`:
  `Primary Opportunity: NONE (<reason>)`.

Every value is read **verbatim** from `opportunityPlanner.js`'s own
already-computed output — this presentation layer never computes or
adjusts a single one of them. WAIT **never** shows Entry/SL/TP1/TP2
(verified by test) — only the `Candidate`/`Provisional`-prefixed fields
above, which can never be confused with confirmed trade geometry.

`npm run xauusd:check` (`src/cli/commands/xauusd.js`'s `check`
subcommand) now calls `analyzeMarket({ persistSignals: false })` +
`formatMarketAnalysis()` instead of bare `calculateEntry()` +
`formatEngineDecision()` — this is the fix for mission Section 31 ("It
should expose the current pre-entry opportunity plan when available").
`persistSignals: false` is unchanged/correct: a manual check must never
mark a signal as already-seen and suppress a real watcher alert (§4).
`npm run xauusd:watch -- --once` (a separate, explicitly "testing only"
path per its own CLI help text) was deliberately left on bare
`calculateEntry()`/`formatEngineDecision()` — out of scope for this fix,
and a lighter-weight smoke-test path is a reasonable thing to keep.

## 6. Pine clean-mode audit (Part 27)

**`PINE CLEAN MODE AVAILABLE: YES`** — input `debugMode`
(`pine/XAUUSD_Adaptive_Master.pine:36`, `input.bool(false, "Debug Mode (show
internal state table + regime tint)", group="Debug")`) gates the 56-row
`debugTable` (`if debugMode and barstate.islast`, lines 1606-1671+) and is
**off by default**. No Pine source was modified to discover or confirm this —
this is a read-only audit of an existing input already OFF by default.
Two related, smaller display toggles also exist and default as shown:
`p5ShowStatsTable` (default `true`, a compact statistics table — not the
large diagnostic dump) and `p5ShowRecentSignals` (default `false`).

## 7. Call-path audit (Part 28)

| Caller | Calls `calculateEntry()`? | Adds evidence? | Adds anticipation? | Records Stage 3? | Visualizes? |
|---|---|---|---|---|---|
| `npm run xauusd:check` / `xauusd_calculate_entry` tool | Yes (directly) | No | No | No | No |
| `xauusd_analyze_market` tool (`analyzeMarket()`) | Yes (internally, once) | Yes | Yes | No (on-demand calls never persist Stage 3 either, to match the ephemeral-store principle) | No (visualization is a separate tool) |
| `xauusd_visualize_market` tool (`visualizeXauusdMarket()`) | Yes (via one internal `analyzeMarket()` call) | Yes | Yes | No | Yes |
| Watcher (`runWatcherCycle()`, this stage) | Yes (via `analyzeMarket({persistSignals:true})`, once) | Yes | Yes | **Yes** | **Yes** |

No layer invents a different final action than `calculateEntry()`'s own
`combineTimeframes()`/`detectHtfConflict()` output — every caller above
either *is* that call or spreads its result verbatim.
**Recommended normal daily-use path:** the watcher (`npm run xauusd:watch` or
equivalent), since it is the only path that keeps Stage 3 observability and
Stage 5/chart-local visualization continuously current without a repeated
manual call. For an ad-hoc, one-off check, `xauusd_visualize_market` gives
decision + evidence + drawing refresh in one call.

## 8. Runtime/version info (Part 29)

`src/core/xauusd_runtime_info.js`'s `getRuntimeInfo()` — pure, synchronous —
returns `package.json`'s name/version, `process.version`,
`CALCULATE_SCHEMA_VERSION`, `CHART_CONTEXT_SCHEMA_VERSION`, and the exact
protected parameter values (`min_rr`, `quality_threshold`,
`corr_resolve_confirm_bars`), republished verbatim from their owning modules
— it never redefines them. `auto_update: false` is explicit: there is no
in-process hot reload or self-update mechanism anywhere in this codebase.
Reconnect/restart procedure (also returned as `reconnect_and_restart_procedure`):
1. Verify TradingView Desktop is running with CDP remote debugging on
   the configured host/port (default `127.0.0.1:9222`).
2. Call `tv_health_check` (or `xauusd_research_health`) to confirm the
   server can reach it.
3. A transient CDP drop needs no manual action — the watcher auto-retries
   every poll and re-baselines on reconnect (never replays history).
4. To pick up a code change, stop and restart the MCP server process
   itself — there is no hot reload.

## 9. Concurrency (Part 30)

**Classification: A — SAFE ENOUGH FOR LOCAL SINGLE-USER STAGE 6.**
Reached by enumerating every actual shared-mutable-state race in this
codebase (not just the chart-TF one the mission names), not by assumption.

**Every persisted store that can affect a trading DECISION has exactly one
writer, by construction — no lost-update race is possible for these:**
- `validation/mcp_engine_signals.json` (the real signal store,
  `signalStore.js`): written only when `persistSignals: true`, and the ONLY
  caller that ever passes `persistSignals: true` is the watcher's own cycle
  (§4). Every on-demand MCP tool call (`xauusd_analyze_market`,
  `xauusd_visualize_market`) stays on the ephemeral, never-persisted store
  by default — this was already true before Stage 6 and remains true
  (verified: `grep -rn "persistSignals: true"` matches only
  `src/engine/watcher.js`).
- `state/xauusd_anticipation_store.json` (Stage 3, `anticipationStore.js`):
  `recordAnticipationObservation()` is called from exactly one real
  (non-test) call site — `src/engine/watcher.js` (verified: `grep -rln
  "recordAnticipationObservation" src/` excluding tests returns only
  `anticipationStore.js` itself and `watcher.js`).

**One store CAN have concurrent writers — `state/xauusd_drawing_registry.json`
(Stage 4's ownership registry):** the watcher's chart-visualization tick,
the watcher's decision-TF visualization step, and a manual
`xauusd_visualize_market` tool call (a separate OS process, the MCP server)
can all read-modify-write it. This is a real, reachable dual-writer scenario.
It is judged non-blocking for Stage 6 because:
1. The worst case is a **lost registry update** (an orphaned or momentarily
   stale drawing) — never a corrupted or wrong trading decision. The
   registry has no read/write path back into `calculateEntry()`/
   `analyzeMarket()`'s decision logic at all.
2. It is **self-healing**: the next reconciliation cycle re-reads the
   registry from disk and re-syncs against `listDrawings()`'s real chart
   state (`DROP_STALE_REGISTRY`/`CREATE` as needed) — a lost update never
   compounds across cycles.
3. This exact risk class was already identified and explicitly accepted in
   Stage 4's own original design (`xauusd_visualize.js`'s module header:
   "the one unavoidable orphan-drawing risk this can still leave, which is
   surfaced in warnings, never hidden") — Stage 6 adds a second writer
   (the chart-visualization tick) to an already-acknowledged risk, it does
   not introduce a new class of risk.

**The chart-timeframe read/write race the mission names** (two processes
calling `setTimeframe()` concurrently, one reading bars mislabeled as the
wrong TF) is real in principle, but: (a) Stage 6's own new chart-context
path (`getActiveChartContext()`) never calls `setTimeframe()` at all (§3.1,
§8 below), so it structurally cannot be either side of this race; (b) the
remaining `setTimeframe()`-based sweeps (`fetchMultiTimeframeBars()` in the
protected `xauusd_calculate.js`, `peekLatest5mCandle()` in `watcher.js`)
are **unchanged, pre-existing** code — this race already existed before
Stage 6 as an acknowledged characteristic of the single-chart CDP
architecture (`xauusd_calculate.js`'s own module header: "gathering all
timeframes' OHLCV from this single-chart CDP architecture requires
switching the visible chart's timeframe"). Stage 6 neither worsens nor
fixes it.

**Deferred, not implemented this stage:** closing the chart-TF race
properly would mean a file-based lock (mirroring the existing watcher
PID-lock precedent) around every `setTimeframe()`-based sweep, several of
which live in the protected `xauusd_calculate.js`/`core/chart.js` —
modifying those is out of this stage's safe scope. Recommended as a scoped
Stage 7 follow-up: a `state/xauusd_chart_mutation.lock` file, acquired for
the duration of any `setTimeframe()`-based sweep, released after restore.

## 10. Failure isolation (Part 31)

Verified by test, not just by inspection — see
`tests/stage6_watcher_integration.test.js` ("failure isolation" describe
block) and `tests/stage6_chart_context.test.js`/`stage6_visualize_chart_context.test.js`'s
non-OK-status tests:
- A throwing `recordAnticipationObservation` or `visualizeMarketAnalysis`
  never blocks a BUY/SELL alert, never alters `result`, and never crashes
  the cycle.
- A throwing `visualizeActiveChartContext` never crashes the watcher's tick
  or affects the trade-analysis cadence's own state.
- `getActiveChartContext()`'s `getState()`/`getOhlcv()` failures return
  `READ_ERROR` (never a fabricated timeframe/evidence); a non-approved
  symbol returns `SYMBOL_MISMATCH` with zero drawing calls; an unrecognized
  resolution returns `UNKNOWN_TIMEFRAME` with zero drawing calls.

## 11. Runtime health snapshot (Part 32)

`getRuntimeHealthSnapshot()` (same file as §8) — read-only, lightweight (one
`getActiveChartContext()` read plus a few local JSON file reads), **never**
calls `calculateEntry()`/`analyzeMarket()` itself. Reports: CDP
reachability/status, active chart symbol + timeframe + last confirmed bar
time, the **decision timeframe** (`'15m'`, a fixed protocol constant —
verified directly against `mtf.js`'s own hardcoded `source_timeframe`
return value at every branch, so stating it costs zero I/O and cannot go
stale silently), watcher running/pid (a **read-only peek** at the lock
file — it never acquires/writes it, unlike `watcherState.js`'s own
`acquireLock()`) plus the watcher's own persisted state fields, Stage 3
store presence + tracked setup count, and drawing-registry presence +
tracked-drawing count.

**Known, documented limitation:** the mission also asked for "last analysis
action/candidate/anticipation" in this snapshot. Those only ever exist as the
output of an actual `calculateEntry()`/`analyzeMarket()` call, and this
snapshot deliberately never makes one (to stay lightweight and
side-effect-free — a health check must never itself risk triggering a new
signal). The persisted signal store only records BUY/SELL signals, not every
WAIT decision, so a genuine "last full decision" cannot be honestly
reconstructed from disk alone without either persisting a new artifact
(out of scope this pass) or making a live call from the health check itself
(rejected, for the reason above). `watcher.last_processed_5m_time` /
`last_alerted_signal_id` are the closest available honest proxies.

## 12. Pre-Entry Opportunity Planner

An ADDITIVE upgrade on top of the frozen Stage 1-6 stack. It answers a
question the protected engine alone cannot: not just "is a fully
confirmed trade available right now?" but "if a direction is objectively
developing, where is the next objectively favorable area it could
develop from?" — without ever loosening a protected gate to manufacture
an answer.

**Purpose.** Motivated directly by a real observed case (verified live,
§13 below): a 15m BEAR_TREND SELL (model PB) with current RR 0.65,
blocked by `RR_NOT_ACCEPTABLE`. The protected engine correctly reports
WAIT — but stops there. The planner additionally asks whether an
objective overhead supply/resistance/retest area exists where the SAME
direction's geometry could become favorable, and reports that
transparently, as provisional planning information only.

**Authority boundary (never crossed, structurally).**
`calculateEntry()` remains the SOLE source of BUY/SELL/WAIT and of final
Entry/SL/TP1/TP2/RR. `src/engine/opportunityPlanner.js`'s
`computeOpportunityPlan()` returns `status: 'SUPERSEDED_BY_CONFIRMED_TRADE'`
with **zero** candidate geometry the instant `decision.action` is
BUY/SELL — there is no code path anywhere that copies a
`candidate_entry_zone`/`provisional_invalidation`/`candidate_tp1`/
`candidate_tp2`/`candidate_rr` value into `decision`'s own fields (proven
by test: `tests/engine_opportunity_planner.test.js`'s "final authority is
never usurped" suite).

**Zone ranking (mission Section 8), deterministic, no probability
score.** Four tiers, highest first, each filtered to the correct side of
current price (never a zone already fully passed through):
1. Supply/demand zone (`levels.js`'s `supplyDemandZones`, not
   `INVALIDATED`) — the most specific "area" evidence.
2. Nearest fresh support/resistance (`levels.js` — point-precision,
   exposed as a **zero-width** zone, never a fabricated range).
3. Opposing structural swing (`structure.js`'s `lastSwingHigh`/
   `lastSwingLow` — the same swing `anticipation.js`'s own
   `buildAlternateScenario()` already reads, for consistency).
4. Nearest liquidity pool (`liquidity.js`'s `equalHighs`/`equalLows`).

No tier having a valid candidate → `status: 'NO_PLAN'`,
`reason: 'NO_OBJECTIVE_ZONE_AVAILABLE'` — never a fabricated zone.

**Approach rule.** ATR-relative distance to the zone's near edge
(`distanceInAtr()`, `volatility.js` — already used elsewhere), compared
against the SAME tolerance `anticipation.js` itself uses
(`BREAKOUT_PARAMS.retestAtrTol`) — never a second, invented threshold or
a fixed dollar distance.

**Touch/reaction semantics.** `interaction_state` (`APPROACHING` /
`WICK_TOUCH` / `BODY_TOUCH` / `REJECTION` / `BROKEN`) is read from the
SINGLE latest confirmed bar's own OHLC against the zone bounds — never a
subjective "looks bullish" judgment. `REJECTION` requires a
directionally-matching candlestick/pattern already present at that bar
(reused verbatim from `anticipation.js`'s own `supporting_evidence`),
distinguishing it from an unconfirmed `WICK_TOUCH`. `BROKEN` (a confirmed
close beyond the zone's far edge, against the plan's direction) is an
objective new invalidation path, mapped straight to
`opportunity_state: 'INVALIDATED'`.

**`opportunity_state` lifecycle** (`DEVELOPING` → `APPROACHING_ZONE` →
`ZONE_TOUCHED` → `REACTION_PENDING` → `CONFIRMATION_PENDING` → `ARMED` →
`CONFIRMED`, or `MISSED`/`INVALIDATED`) defers to `anticipation.state`
(Stage 1+2, protected, unchanged) for the advanced states it already
computes precisely, and uses the planner's own zone-interaction evidence
only for the earlier states Stage 1+2 has no concept of at all (it never
looks at supply/demand zones). `NO_LONGER_RELEVANT` is a documented,
deliberately unused vocabulary member — no objective signal currently
justifies emitting it.

**Candidate geometry — always PROVISIONAL, never final.**
`candidate_entry_zone` (`{lower, upper}`, from the selected zone — a
genuine range when the source is a supply/demand zone, a zero-width
"zone" when it's a point level, never fabricated width).
`provisional_invalidation` (the zone's FAR edge — never a fabricated
stop distance). `candidate_tp1` (nearest opposing fresh level) /
`candidate_tp2` (`anticipation.primary_scenario.target_room
.structural_objective`, reused **verbatim**, never recomputed).
`candidate_rr` — a **planning-only** reward/risk ratio (reward = distance
from the zone's near edge to `candidate_tp1`; risk = distance from the
near edge to `provisional_invalidation`); it is compared against
`RISK_PARAMS.minRR` only to populate `blocking_conditions` with a
descriptive string, never to gate or alter anything. Every field is
`null` (never a fabricated 0) when its inputs aren't objectively
available.

**Candidate RR semantics — the motivating example, live-verified (§13):**
a current RR of 0.65 (blocked) does not prevent the planner from
separately reporting that an objective overhead zone exists where the
SAME direction's RR could be materially better — both facts are true and
reported honestly at once; neither is used to override the other.

**Primary + alternate.** The alternate is built ONLY when
`anticipation.js`'s own `alternate_scenario` already exists AND an
objective zone is separately found for that direction — never forced,
and deliberately lighter (direction + zone + basis only) than the
primary.

**No future leakage — structural, tested.** `computeOpportunityPlan()`
is a pure function of its arguments alone (no wall-clock reads — verified
by source audit test); it reads at most the single LATEST bar in
whatever `primaryBars` array the caller passes (the exact same
already-fetched confirmed-bars array `computeEvidence()` itself
consumes — never a second fetch). `tests/engine_opportunity_planner.test.js`
proves the identical snapshot always produces an identical plan
regardless of what bars exist "afterward" elsewhere.

**Lifecycle history — the Opportunity Ledger
(`src/engine/opportunityLedger.js`).** Mirrors Stage 3
(`anticipationStore.js`)'s own proven architecture and identity
philosophy exactly — atomic JSON store (latest-per-opportunity) +
append-only JSONL log, deterministic `computeOpportunityId()`
(symbol/timeframe/direction/zone-anchor — deliberately excluding
family/model, exactly like Stage 3's own `computeSetupId()`, so identity
survives a family/model first resolving), dedup on
(opportunity_id, confirmed_bar_time, opportunity_state) only. **A
`NO_PLAN` snapshot is never recorded at all.** History is genuinely
append-only: a later `MISSED`/`INVALIDATED` transition is written as a
NEW row, never overwriting the earlier `DEVELOPING`/
`APPROACHING_ZONE`/`REACTION_PENDING` rows — this is what lets a future
query answer "did a candidate appear before it became overextended?"
honestly, from real recorded history (mission Section 24) — proven by
test (`tests/engine_opportunity_ledger.test.js`'s "candidate-before-
overextended history is preserved verbatim" test). **Explicitly NOT a
replacement for Stage 3** — `anticipationStore.js` is untouched;
`confirmed_bar_time` is the natural join key between the two when both
exist for the same bar.

**Watcher integration.** `src/engine/watcher.js`'s cycle, on a genuinely
new confirmed 5m candle, in mission order: `analyzeMarket()` (now
additively returns `pre_entry_plan`) → Stage 3 recording (unchanged) →
**Opportunity Ledger recording** (`recordOpportunityObservation()`, the
SAME `result.pre_entry_plan` — never a second sweep, never an
independent planner computation) → Stage 5 visualization refresh →
notification policy. Both the ledger recording and the low-noise
pre-entry notification below are OPTIONAL deps, individually
failure-isolated exactly like Stage 3/Stage 5's own wiring — a thrown/
missing implementation can never alter the alert decision, which still
depends on `result` alone.

**Low-noise pre-entry notification (mission Section 32).**
`notifyPreEntryWatch()` (`src/engine/notifier.js`, additive, a
STRUCTURALLY SEPARATE format from `formatSignalAlert()` — its own header
`"PRE-ENTRY WATCH — BUY/SELL"` and an explicit `"NOT A CONFIRMED TRADE"`
footer, never confusable with a confirmed alert) fires **only** on a
genuine transition INTO `ARMED` (the ledger's own returned
`previous_opportunity_state !== 'ARMED' && opportunity_state === 'ARMED'`)
— never on `DEVELOPING`, never repeated while an opportunity simply
remains `ARMED` across later confirmed bars, never when the ledger
recorded nothing. Verified by test
(`tests/pre_entry_notification.test.js`).

**Visualization.** `src/engine/marketVisualization.js`'s
`buildMarketVisualizationIntents()` gained an additive `plan` parameter
and exactly 2 new roles at tier 1 (alongside the existing primary
scenario, since this IS that scenario's own enrichment):
`plan_candidate_zone` (a single `horizontal_line` at the zone's near
edge, labeled `"CANDIDATE ENTRY ZONE <lower> - <upper>"` — the SAME
"no fabricated time span for an area" precedent
`buildSupplyDemandCandidates()` already established) and
`plan_provisional_invalidation` (labeled `"PROVISIONAL INVALIDATION (not
SL)"`). Deliberately NOT `candidate_tp1`/`candidate_tp2` as separate
lines — they usually coincide with levels already drawn elsewhere, and
`mergeCoincidentLevels()` already combines them rather than adding a
third/fourth line (mission Section 34: "do not turn the chart into a
diagnostic dashboard"). Both roles resolve to `included: false` the
instant the decision is confirmed (`SUPERSEDED_BY_CONFIRMED_TRADE`) or
no plan exists (`NO_PLAN`) — the confirmed trade's own geometry, or
nothing, is drawn instead.

**Active chart TF vs decision TF (mission Section 35-36).** The planner
itself operates ONLY on the 15m decision timeframe (mirroring
`anticipation.js`/`calculateEntry()`'s own scope exactly — mission
Section 5 explicitly forbids "recalculating the entire market
independently" for an arbitrary active chart TF, which a full
per-timeframe planner would require). The planner's 2 visualization
roles are drawn under the DECISION-TF-scoped registry roles (not
`chart_`-prefixed), so switching the visible chart to 4H/1D never
creates or relabels a 4H/1D "opportunity plan" that doesn't actually
exist — the ALREADY-TF-adaptive chart-local visualization (Stage 6, §3)
is what changes as the user switches chart timeframe, and it stays
untouched by this upgrade. This directly satisfies "chart intelligence
and trade authority remain separate."

**Symbol safety.** The planner is only ever invoked with `decision.symbol`
already gated by the SAME protected `checkXauusdSymbol()` guard
`calculateEntry()` itself enforces (an unapproved symbol already fails
the whole `analyzeMarket()` call closed to `SYMBOL_NOT_APPROVED` well
before the planner would run) — no separate symbol check was needed or
added.

**Concurrency (mission Section 42).** The Opportunity Ledger uses the
EXACT SAME atomic temp-file+rename write discipline as every other
persisted store in this codebase, and — mirroring Stage 3's own single-
writer property (§9) — `recordOpportunityObservation()` is called from
exactly one real (non-test) call site: `src/engine/watcher.js`. No new
multi-writer risk was introduced.

**Known limitations (disclosed, not silently omitted):**
- `NO_LONGER_RELEVANT` is unused (see lifecycle above) — no objective
  trigger currently justifies it.
- `candidate_tp1`/`candidate_tp2` are never drawn as separate chart
  lines (see Visualization above) — they remain fully available in the
  structured `pre_entry_plan`/ledger data and in `xauusd:check`'s text
  output.
- The planner has no concept of an active-chart-TF-local opportunity
  (see Active chart TF above) — an explicit, reasoned scope boundary,
  not an oversight.

## 13. Test coverage

**Pre-Entry Opportunity Planner, all new:**
- `tests/engine_opportunity_planner.test.js` (35 tests) — the pure planner core: BUY/SELL symmetry, correction-as-opportunity (both directions), zone ranking/fallback tiers, no-fabricated-zone behavior, approach/touch/reaction states, candidate geometry, primary/alternate scenario, no-future-leakage, final-authority-never-usurped, public vocabulary (including a check that `NO_LONGER_RELEVANT` is genuinely never emitted).
- `tests/engine_opportunity_ledger.test.js` (20 tests) — store/log safety, deterministic identity, dedup, full lifecycle transitions, candidate-before-overextended history preservation, no hindsight mutation.
- `tests/pre_entry_analyze_market_wiring.test.js` (5 tests) — `analyzeMarket()`'s `pre_entry_plan` wiring, no second sweep.
- `tests/pre_entry_watcher_ledger_wiring.test.js` (6 tests) — watcher → ledger wiring, failure isolation, no duplicate sweep.
- `tests/pre_entry_notification.test.js` (10 tests) — the low-noise ARMED-only notification format and gating.
- `tests/pre_entry_plan_visualization.test.js` (9 tests) — the 2 new candidate/provisional drawing roles.
- `tests/presentation_market_analysis.test.js` — extended in place (+6 tests) for the new WAIT-with-plan/NO_PLAN output lines.

(Renamed during the final freeze review from misleading `stage7_*` names --
this work is NOT Stage 7, which has not started -- to the `pre_entry_*`
names above; `tests/engine_opportunity_planner.test.js`/
`tests/engine_opportunity_ledger.test.js` were already correctly named
and untouched by the rename.)

**Stage 6 (prior pass, unchanged, still passing):** `tests/stage6_candidate_observability.test.js`, `tests/stage6_candidate_metrics.test.js`, `tests/stage6_chart_context.test.js`, `tests/stage6_chart_local_visualization.test.js`, `tests/stage6_visualize_chart_context.test.js`, `tests/stage6_watcher_integration.test.js`, `tests/stage6_runtime_info.test.js`. **Deleted:** `tests/stage6_present.test.js` (its module, `xauusd_present.js`, was dead code — see §5).

**Cross-scope drawing ownership fix, new:** `tests/cross_scope_drawing_ownership.test.js`
(10 tests) — see §14's "Finding from live proof, FIXED" for full detail.

Full local run (`node --test tests/`, excluding the pre-existing, purely
environment-dependent `tests/e2e.test.js`): **1490/1490 passing** before
this fix; the fix's own 246 directly-related focused tests (visualization,
watcher, planner, ledger, presentation) all pass after it, and it touches
no file outside the visualization/reconciliation layer, so the full count
is expected to remain 1490+10 = **1500/1500** (not re-run in full this
pass, per this pass's own explicit instruction that the focused suite is
sufficient for a truly isolated change).

**Final freeze review findings (fixed, no behavior change):** a stray
duplicate-looking blank line in `xauusd_analyze_market.js`'s header
comment; a stale doc-comment reference to a test file that never existed
(`opportunity_planner_no_future_leakage.test.js` → corrected to point at
the real suite); a genuine code duplication between
`notifier.js`'s `windowsDesktopNotify()` and
`windowsDesktopPreEntryNotify()` (both built an almost-identical
PowerShell toast script) — extracted into a shared `spawnWindowsToast()`
helper, re-verified byte-for-byte behavior via the existing test suite
before and after.

## 14. Live verification

**CLOSED.** CDP 9222 was reachable for this pass (`Invoke-RestMethod
http://127.0.0.1:9222/json/version` succeeded), and every previously
outstanding live-proof gap was closed using the CURRENT local source
directly (never the long-running MCP server process, which cannot pick
up uncommitted code changes without a restart):

- **Real candidate-vs-authoritative + planner proof:** live 15m
  `BULL_TREND`, 15m candidate `BUY`, model `BO`, `candidate_rr: 0.18`,
  `blocked_by: 'RR_NOT_ACCEPTABLE'`, authoritative action `WAIT`/
  `RR_NOT_ACCEPTABLE`. The planner built a real `PLAN`:
  `direction: BULLISH`, `opportunity_state: CONFIRMATION_PENDING`, a real
  demand-zone (`levels.js supplyDemandZones`, state `MITIGATED`) at
  `[4340.81, 4341.12]`, `candidate_tp1`/`candidate_tp2: 4399.67`,
  `candidate_rr: 188.87`, a real objective `alternate_scenario`
  (`BEARISH`, resistance zone at 4399.67) — never forced, never
  fabricated.
- **Real Opportunity Ledger write — the previously missing proof,
  closed:** `state/xauusd_opportunity_ledger_store.json` and
  `state/xauusd_opportunity_ledger_log.jsonl` **did not exist before this
  proof** and were created by a genuine `recordOpportunityObservation()`
  call using the live snapshot above. The persisted record matches the
  live snapshot verbatim (symbol, confirmed bar time, direction, zone,
  candidate geometry, `authoritative_action`/`reason`).
- **Same-snapshot dedup, live:** invoking `recordOpportunityObservation()`
  again with the IDENTICAL live decision/plan/confirmed-bar-time returned
  `recorded: false, reason: 'DUPLICATE_OBSERVATION'` — log stayed at 1
  row.
- **Bounded (150s) live watcher run:** started clean, correctly processed
  exactly one genuinely new confirmed 5m candle (WAIT, silent, no alert),
  self-terminated via `ABORT`, lock released, no leftover process. The
  watcher's **own** cycle (not the proof script) independently wrote a
  **second**, genuinely new ledger row for the SAME `opportunity_id`
  (continuity correctly preserved across a real confirmed-bar advance:
  `transition: "CONFIRMATION_PENDING -> CONFIRMATION_PENDING"`) —
  definitively proving the full watcher → `analyzeMarket()` →
  `pre_entry_plan` → `recordOpportunityObservation()` wiring end-to-end,
  live, with zero manual fabrication.
- **Live drawing proof:** the decision-TF visualization cycle created
  exactly 2 new `plan_candidate_zone`/`plan_provisional_invalidation`
  drawings (labeled `"CANDIDATE ENTRY ZONE ..."` /
  `"PROVISIONAL INVALIDATION (not SL)"`, never `"ENTRY"`/`"SL"`) among 8
  total decision-TF drawings; an immediate second render of the
  identical analysis correctly reused them (`KEEP`, zero churn, same
  entity IDs).
- **Active chart TF / symbol safety:** `visualizeActiveChartContext()`
  returned `status: OK`, `symbol: OANDA:XAUUSD`, `timeframe_label: 15m`
  (the user's real active chart TF, which happened to equal the decision
  TF at proof time).

### Finding from live proof, FIXED: cross-scope drawing cleanup ownership

During the bounded watcher run, the watcher's chart-visualization tick
(`visualizeActiveChartContext()`) ran in the SAME cycle as its
decision-TF visualization. Because the user's active chart TF (15m)
happened to equal the decision TF (15m) at the time, **both
reconciliations shared the identical `OANDA:XAUUSD|15m|` registry scope**.
Stage 4's `reconcileVisualization()` cleans up any registry entry in its
scope that isn't in ITS OWN desired-intents set (`scopedKeys()` filters
by `symbol|timeframe|` only, never by role prefix) — so the
chart-context reconciliation, whose desired set is only `chart_`-prefixed
roles, correctly-by-its-own-logic-but-wrongly-overall treated the
decision-TF's OWN `plan_candidate_zone`/`plan_provisional_invalidation`/
`structure_primary`/etc. entries as "no longer desired" and removed them
(confirmed live: the registry contained only 5 `chart_*` entries
afterward, zero `plan_*`/decision-TF entries, even though a live
re-query moments later showed the SAME plan was still fully valid).

**Severity:** drawing-hygiene only — never touched the protected decision,
the Opportunity Ledger, or Stage 3. The `chart_` role PREFIX (Stage 6)
correctly prevented two DIFFERENT roles from colliding on the identical
registry KEY; it did not prevent one reconciliation's "clean up what I
don't recognize" pass from deleting another reconciliation's OWN, still-
valid drawings when both shared a scope. It was self-healing (the next
decision-TF cycle recreated the removed entries) but caused real, user-
visible flicker/churn whenever active chart TF equaled decision TF.

**Surgical fix, additive, backward-compatible:**
`src/core/xauusd_visualize.js`'s `buildReconciliationPlan()`/
`reconcileVisualization()` gained an optional `ownsRole(role) => boolean`
predicate (default `() => true`, so every pre-existing call site's
behavior is byte-identical unless it opts in). The trailing stale-cleanup
loop now does `if (!ownsRole(registered.role)) continue;` before staging
ANY removal — a registered role outside the caller's declared domain is
never inspected, staged, or reported; the plan simply doesn't mention it.
Entries the caller's own `desiredIntents` explicitly names are unaffected
(ownership there is already implicit). The two real callers now declare
their domains:
- `src/core/xauusd_visualize_market.js` (decision-TF):
  `ownsRole: (role) => !role.startsWith(CHART_LOCAL_ROLE_PREFIX)`.
- `src/core/xauusd_visualize_chart_context.js` (chart-local):
  `ownsRole: (role) => role.startsWith(CHART_LOCAL_ROLE_PREFIX)`.

No change to Stage 4's hard safety rules — `removeOne` is still called
only with a registry-known `entity_id`; `draw_clear`/`clearAll`/
`removeAllShapes`/coordinate-or-text-similarity removal remain absent and
unreachable. A role outside the caller's ownership domain is `IGNORE`d,
never deleted, matching the existing "unknown entity is never touched"
precedent exactly (ownership-domain filtering is just a second, additive
gate alongside the pre-existing entity-ID gate).

**Deterministic regression (`tests/cross_scope_drawing_ownership.test.js`,
10 new tests):** reproduces the exact live defect (same `OANDA:XAUUSD|15m|`
scope holding `plan_candidate_zone`/`plan_provisional_invalidation`/
`structure_primary`/`chart_structure_primary`/`chart_sr_support`
simultaneously) and proves: chart-local reconciliation never touches the
decision roles while still legitimately cleaning up its OWN stale
`chart_*` role; decision reconciliation never touches `chart_*` roles
while still legitimately cleaning up its OWN stale `plan_*` role;
different-TF scopes remain naturally isolated (unaffected regression);
`pre_entry_plan` → `NO_PLAN`/superseded-by-confirmed-trade still
correctly removes its OWN now-stale `plan_*` roles (never immortal);
confirmed trade roles correctly replace `plan_*` via the decision
domain's own cleanup, untouched by the chart domain; an unregistered
("unknown/user") drawing is invisible to both domains; and a full
decision→chart-local watcher-tick sequence (plus an identical repeat)
leaves every role from both domains intact with zero unnecessary churn.

**Live reproof:** CDP remained connected. The user's active chart TF had
naturally moved to 30m (real, organic interaction — not forced), so the
exact same-scope collision could not be reproduced live this pass without
force-switching the chart (explicitly forbidden) — the deterministic
suite above is the authoritative reproduction. The live session instead
confirmed **no regression** in the everyday (different-TF) case: a real
WAIT/RR_NOT_ACCEPTABLE analysis with a real objective plan produced 8
decision-TF drawings (including `plan_candidate_zone`/
`plan_provisional_invalidation`); the chart-context cycle then ran at the
real active 30m TF; all 8 decision-TF entity IDs survived; an identical
re-render of the decision visualization produced 100% `KEEP` (zero
churn).

**No trading-semantic impact:** `src/engine/opportunityPlanner.js` and
`src/engine/opportunityLedger.js` have zero diff from this fix (confirmed
via `git diff --stat`); `RISK_PARAMS.minRR`/`QUALITY_PARAMS
.qualityThreshold`/`CORRECTION_PARAMS.corrResolveConfirmBars` unchanged;
`calculateEntry()` remains the sole BUY/SELL/WAIT authority. This fix
touches only drawing-reconciliation ownership scoping.

## 15. Not attempted / deliberately out of scope this pass

- Cross-process concurrency serialization (§9, Stage 6) — still analyzed
  only, not implemented; unchanged by this pass.
- An active-chart-TF-local opportunity planner (§12's "Active chart TF vs
  decision TF") — a reasoned scope boundary, not an oversight.
- `candidate_tp1`/`candidate_tp2` as separate chart drawing lines (§12's
  "Known limitations") — available in structured data and text output,
  not drawn separately, to respect the clutter budget.
- `NO_LONGER_RELEVANT` opportunity state (§12) — no objective trigger
  currently justifies emitting it.
