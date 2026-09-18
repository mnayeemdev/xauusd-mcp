# XAUUSD Anticipation Engine — Stage 1 + Stage 2

Status: **implemented (Stage 1+2 only)**. Persistence, transition tracking,
the opportunity-observability log, visualization, watcher changes, and
profile/drawing changes are **not** part of this stage — see "Not part of
this stage" below.

## What this is, and what it is not

Anticipation is **scenario preparation, not price prediction**. It never
tells you what price will do next. It only relabels conditions that were
already objectively true in the current, already-computed market analysis
— what is currently developing, what location is being approached, and
what specific, already-named condition is still outstanding before a
scenario could become a trade.

**The authoritative decision remains exactly one thing:** `calculateEntry()`
(`src/core/xauusd_calculate.js`). Its `action` (`WAIT`/`BUY`/`SELL`) and its
`wait_reason` are never touched, never recomputed, and never overridden by
anything in this engine. Anticipation is additive intelligence layered
*around* that decision, never a second decision path.

## Where it lives

- `src/engine/anticipation.js` — the pure, stateless state machine +
  scenario derivation (`computeAnticipation({ decision, evidence })`).
- `src/core/xauusd_analyze_market.js` — calls `computeAnticipation()` once,
  after the authoritative decision and the confluence report are already
  finalized, and appends the result as an additive `anticipation` field.
- `src/core/presentation.js` — `formatMarketAnalysis()` renders the
  `anticipation` object as a few extra WAIT-only lines.

## Purity contract

`computeAnticipation()` is a pure function: no CDP calls, no file writes,
no notifications, no TradingView mutation, no signal-store access, no
network I/O, and it never mutates its `decision`/`evidence` inputs. It
consumes only the already-computed evidence `xauusd_analyze_market.js`
assembles once per call (regime, structure, correction, strategy
eligibility, candlestick patterns, classical patterns, breakout/retest
state, liquidity, levels, volatility, session) — it never re-fetches data,
never re-runs the protected pipeline, and never introduces a second
`calculateEntry()` call or an additional OHLCV/timeframe sweep.

## No future leakage

Every field consumed by this engine was already computed from confirmed
bars only, by modules that document their own no-lookahead discipline
(`structure.js`'s pivot-confirmation lag, `breakout.js`'s close-confirmed
lifecycle, etc.). `anticipation.js` never sees raw bars itself — only the
already-confirmed-bar evidence objects — so no lookahead is possible here
by construction.

## No probabilities, no fabricated trade geometry

Nothing in the anticipation output is a confidence score, a win-rate
estimate, or a price prediction. `potential_rr_feasibility` and
`late_overextension_risk` are discrete, evidence-derived labels
(`LIKELY_ACCEPTABLE`/`MARGINAL`/`UNLIKELY`/`UNKNOWN`,
`NONE`/`APPROACHING`/`AT_RISK`/`MISSED`/`UNKNOWN`), never a number claiming
to be an odds estimate. An unconfirmed `primary_scenario`/
`alternate_scenario` **never** contains an Entry, SL, TP1, or TP2 — those
fields only ever appear on `decision` itself, and only once `decision.action`
is genuinely `BUY`/`SELL`.

## State definitions

| State | Meaning |
|---|---|
| `WAIT` | No sufficiently developed deterministic scenario. |
| `DEVELOPING` | Objective setup evidence is forming (a regime-eligible family, or a real candidate blocked by RR/quality with no structural corroboration), but not close enough to entry readiness. |
| `APPROACHING_ZONE` | Price is within the existing retest-ATR tolerance (`breakout.js`'s own `retestAtrTol = 0.3`, reused verbatim — not a new threshold) of a fresh support/resistance level. |
| `RETEST_PENDING` | The breakout lifecycle (`breakout.js`) itself reports `BREAKOUT_FORMING`/`BREAKOUT_RETEST_PENDING`. |
| `RECLAIM_PENDING` | The breakout is currently being retested (`RETEST_TESTING`), or a liquidity sweep has occurred but not yet been reclaimed. |
| `CONFIRMATION_PENDING` | A real setup/location exists but a protected, already-named confirmation is incomplete: an active correction (protected `corrResolveConfirmBars`), an already-held retest blocked only by RR/quality, or unresolved HTF context. |
| `ARMED` | A candidate that already cleared **every** protected gate (correction resolved, model triggered, RR ≥ `minRR`, quality ≥ `qualityThreshold`) and is blocked by exactly one additional, already-named confirmatory condition: `HTF_CONFLICT` (1H regime alignment), `ENTRY_CONFLICT` (the existing 30m/5m mtf gate), or `ENGINE_DISAGREEMENT` (Pine vs. MCP). |
| `CONFIRMED` | `decision.action` is `BUY` or `SELL` — the protected engine's own output, verbatim. |
| `MISSED` | The protected engine already reported `OVEREXTENDED` (or the reserved `ENTRY_LATE` — see below), or the breakout lifecycle itself reports `OVEREXTENDED_BREAKOUT`: the entry window for this anchor has passed. This is **not** ARMED. |
| `INVALIDATED` | The **current snapshot itself** already reports an objective invalidation: the breakout lifecycle reports `FAILED_BREAKOUT`/`FALSE_BREAKOUT` (a genuine reversal back through the level), or a classical pattern sharing the current structural bias already reports `completion_state: 'INVALIDATED'`. Stateless by construction — never inferred by comparing to a prior call. |

### The corrected ARMED definition (important)

The originally-audited definition of ARMED (any `OVEREXTENDED`/
`ENTRY_LATE`/`RR_NOT_ACCEPTABLE` WAIT) was **rejected** during review and
replaced with the definition above. `OVEREXTENDED`/`ENTRY_LATE` represent an
entry opportunity that has already passed — they are `MISSED`, not `ARMED`.
`RR_NOT_ACCEPTABLE`/`NO_GOOD_ENTRY` are **never** automatically `ARMED`
either: the actual RR number and quality margin are not exposed anywhere
in the data this engine consumes (only the pass/fail gate result is), so
this engine cannot deterministically tell "almost acceptable" from
"structurally hopeless" — inventing a numeric closeness threshold to guess
would violate the "no arbitrary thresholds" instruction. Instead, these two
reasons classify conservatively from the breakout lifecycle's own discrete,
already-computed state only: `CONFIRMATION_PENDING` when the breakout has
already held (`RETEST_HOLD`/`BREAKOUT_CONFIRMED`), otherwise `DEVELOPING`.

`ARMED` is instead reserved for the one case that genuinely is "fully
formed, one confirmatory condition remaining": `HTF_CONFLICT`,
`ENTRY_CONFLICT`, and `ENGINE_DISAGREEMENT` only fire **after** the
underlying 15m candidate already passed correction/model/RR/quality —
`combineTimeframes()`'s own WAIT branches for these three reasons are only
reachable once `primaryAction` was already `BUY`/`SELL`. Blocking on one
additional, already-named, higher-authority check is exactly "confirmatory
rather than evidence that the entry has already become bad."

### On `ENTRY_LATE`

The JS calculation engine (`src/engine/risk.js`, `src/engine/models.js`)
does not currently produce a `decision.reason` of `ENTRY_LATE` — a stale
candidate is currently absorbed into `NO_ELIGIBLE_STRATEGY` (the model
simply never triggers once too many bars have passed its recency window).
`ENTRY_LATE` is reserved in the Pine-side contract vocabulary
(`src/core/master_contract.js`'s `WAIT_REASONS`). This engine handles
`reason === 'ENTRY_LATE'` as `MISSED` for forward-compatibility and
vocabulary consistency with that reserved enum, even though it is not
currently reachable from the JS engine's own output.

## Primary/alternate scenario semantics

`primary_scenario` answers "what objective setup is currently closest to
becoming actionable" — never "what price will probably do." It is derived
from whichever real candidate/breakout/correction/liquidity/level evidence
is actually present, using the exact priority order `resolvePreEntryState()`
itself uses (an explicit candidate first, then correction, then breakout,
then liquidity, then a nearby S/R reaction) — never a fabricated pick.

`alternate_scenario` is **only** populated when `structure.js` itself
provides an objective opposing anchor: a confirmed close beyond the
relevant swing (`structure.lastSwingLow`/`lastSwingHigh`) that would
register as a CHoCH against the current direction. It is explicitly the
`structural_reversal` family — evidence-only, `mapped_model_code: null`,
since no protected model independently triggers on a bare CHoCH. When no
such swing exists, `alternate_scenario` is `null` — it is never manufactured
as "the opposite of primary" without an objective structural basis.

## WAIT enrichment

`decision.action`/`decision.reason` are preserved byte-for-byte as the
authoritative reason. Additively, the anticipation object adds:

```
authoritative_wait_reason   // decision.reason, verbatim
pre_entry_state             // one of the 10 states above (field name: `state`)
waiting_for: []              // concise, objective, unmet conditions
invalidated_if: []           // concise, objective, already-known invalidation conditions
```

`formatMarketAnalysis()` renders this as additional lines, e.g.:

```
WAIT — NO TRADE
Reason: CORRECTION_ACTIVE
...
Pre-entry: CONFIRMATION_PENDING
Developing: pullback_continuation
Waiting for: protected correction resolution; 3-consecutive-confirmed-bar momentum requirement; ...
Invalidated if: the pullback extends beyond the structural anchor without resuming momentum
```

Null/empty fields are never printed as literal noise (no `Developing:
null`, no empty `Waiting for:` line).

## 14-family mapping

Per the approved audit (Part F):

| Protected model | Families (aliases/extensions — category B) |
|---|---|
| TC | `trend_continuation`, `structure_break_continuation` |
| PB | `pullback_continuation`, `trend_pullback_confirmation` |
| BO | `breakout`, `breakout_retest` |
| MR | `mean_reversion`, `liquidity_sweep_reversal` |
| SR | `sr_reaction`, `rejection_reclaim` |

Evidence/context-only today (category C/D — no code path independently
triggers BUY/SELL for these, and this engine never lets them do so either):
`momentum_continuation`, `range_trading`, `compression_expansion`,
`structural_reversal`. `structural_reversal` is the one evidence-only
family this engine actively surfaces, exclusively as `alternate_scenario`'s
family, always with `mapped_model_code: null`.

## Stage 1/2 is stateless

`computeAnticipation()` has no memory of any previous call.
`improving_or_deteriorating` is therefore **always**
`'UNKNOWN_WITHOUT_HISTORY'` in this stage — no prior-state comparison is
fabricated. `INVALIDATED` is reported only when the **current** snapshot
itself already contains an explicit invalidation signal (as defined above),
never inferred from a remembered prior state.

## Not part of Stage 1/2

Explicitly deferred to later stages (Stage 3 below covers the first of these):

- ~~Persistence, transition history, the opportunity/WAIT observability
  log, and any metrics aggregation over it~~ — **implemented in Stage 3**,
  see below.
- Visualization (`drawingRegistry.js`, `visualization.js`,
  `xauusd_visualize.js`) — no `draw_shape`/`draw_list`/`draw_remove_one`
  tool is exposed, no drawing occurs, no `profiles.js` change was made.
- Watcher changes (`watcher.js`, `watcherState.js`, `notifier.js`) — the
  watcher still only ever calls `calculateEntry()`, exactly as before.
  Stage 3 provides a recording API a *future* watcher integration can call;
  it does not wire it in.
- Pine/P8 changes.
- Product rename, threshold tuning, or any change to the protected decision
  pipeline (`models.js`, `pipeline.js`, `risk.js`, `quality.js`, `mtf.js`,
  `htf.js`) — `minRR = 1.7`, `qualityThreshold = 65`, and
  `corrResolveConfirmBars = 3` are unchanged and covered by a regression
  test in `tests/engine_anticipation.test.js` and
  `tests/engine_anticipation_store.test.js`.

---

## Stage 3 — Persistence + WAIT/Opportunity Observability

Status: **implemented**. This is an **observability-only** layer: it can
never alter `decision.action`/`decision.wait_reason`, and Stage 1/2's own
pure `src/engine/anticipation.js` is untouched — `computeAnticipation()`
still takes no persistence dependency of any kind.

### Purpose

Stage 1/2 answers "what is developing right now" statelessly, one call at
a time. Stage 3 adds memory across confirmed bars so the SAME questions can
be answered with history: did a setup progress or deteriorate? Did
DEVELOPING become ARMED? Did ARMED become CONFIRMED or INVALIDATED? Which
authoritative WAIT reasons actually occur most often? Is repeated WAIT
caused by market-quality gates (RR/quality/HTF) or by a genuine gap in
model coverage?

### Where it lives

- `src/engine/anticipationStore.js` — setup identity, atomic store
  persistence, the append-only observation log, transition/historical-
  invalidation/improving-deteriorating/model-coverage logic, and the
  `recordAnticipationObservation()` recording API.
- `validation/opportunity_metrics.js` — pure aggregation over an
  already-loaded array of observation records (`computeOpportunityMetrics()`).

### Purity / boundary contract

`anticipationStore.js` performs **only local filesystem I/O**. It never
imports `xauusd_calculate.js`, `core/chart.js`, or `core/data.js`, and
therefore cannot call `calculateEntry()`, fetch OHLCV, or make any CDP/
TradingView call — enforced structurally (no such import exists) and
checked by a source-audit test, not merely by convention.
`recordAnticipationObservation()` takes an **already-computed**
`decision`/`evidence`/`anticipation` (+ optional `confluence`) as plain
data; it is designed to be called once per newly confirmed candle by a
*future* integration (Stage 6+), never to trigger a second analysis sweep
itself.

### Runtime persistence location

Both persisted artifacts live under **`state/`**:

- `state/xauusd_anticipation_store.json` — latest-observation-per-setup
  (small, bounded; used for transition/historical-invalidation lookups).
- `state/xauusd_wait_opportunity_log.jsonl` — append-only, one line per
  genuinely new, non-duplicate observation (used by `opportunity_metrics.js`).

**This deliberately differs from the mission's suggested default
(`validation/xauusd_wait_opportunity_log.jsonl`).** Inspecting this
repository's actual `.gitignore` and tracked files found that
`validation/` is **not** a safe runtime-data location here: files like
`validation/mcp_engine_signals.json` and the P6/P7/P8 ledgers are already
committed to git as research evidence. `state/` is already blanket-ignored
(`.gitignore`: `"XAUUSD auto signal watcher — local runtime bookkeeping ...
not a trading ledger. state/"`) and is exactly what
`src/engine/watcherState.js` already uses for this same kind of local,
non-authoritative bookkeeping. No `.gitignore` change was needed — new
files under `state/` are already excluded.

**Runtime observation rows are never committed.** Only the code
(`src/engine/anticipationStore.js`, `validation/opportunity_metrics.js`)
and its tests are tracked in git. The store/log start empty; nothing is
backfilled from memory, prior console output, or assumption — rows only
ever come from a real, future call to `recordAnticipationObservation()`
with genuinely computed engine data.

### Setup identity

Canonical fields, in this exact order — see `computeSetupId()`'s own doc
comment for the full reasoning:

1. `symbol`
2. `timeframe` (the decision's own source timeframe, e.g. `"15m"`)
3. `direction` (`'BULLISH'`/`'BEARISH'`/`'NONE'`)
4. **structural anchor price** — the relevant swing price from
   `evidence.structure` for the current structure direction, rounded to
   2dp (`'NO_ANCHOR'` when structure is unresolved)
5. `regime` — **only** when the anchor is absent (the degenerate
   "nothing developing at all" bucket)

**Deliberately excluded:** current wall-clock observation time, quality
score, current RR, ATR, session label (all would mint a new ID almost
every call). Bar/pivot **array indices** are also excluded — `structure.js`
reports pivot/event positions as indices into a bars window that re-slices
every call, not as stable timestamps; using one would silently reproduce
the exact failure mode the mission warns against.

**`developing_strategy_family`/`mapped_model_code` are also deliberately
excluded from identity**, despite being listed as candidate fields in the
mission. `developing_strategy_family` is typically `null` while a setup is
merely `DEVELOPING` and only resolves to a real value the moment a
protected-model candidate actually triggers — exactly the
`DEVELOPING -> ARMED` transition this stage exists to track. Including it
in the hash would mint a brand-new `setup_id` at that exact moment,
fracturing continuity for the single most important transition. The
structural anchor price is used instead as the stable, specific "same
opportunity" signal; family/model are still recorded on every observation
for classification, just never used to key identity.

The anchor price itself is computed independently from `evidence.structure`
(not from `anticipation.primary_scenario.invalidation`, which is `null`
exactly when state is `CONFIRMED`) so the identity survives into
`CONFIRMED` on the same basis it used throughout `DEVELOPING`/`ARMED`.

### Observation record schema

One JSON object per genuinely new, non-duplicate observation (see
`recordAnticipationObservation()`): `schema_version`, `observed_at`,
`symbol`, `confirmed_bar_time`, `setup_id`, `authoritative_action`,
`authoritative_wait_reason`, `pre_entry_state`, `previous_pre_entry_state`,
`transition`, `direction`, `developing_strategy_family`,
`mapped_model_code`, `decision_timeframe`, `regime`, `structure_state`,
`structure_event`, `session`, `volatility_state`, `htf_alignment`,
`pattern_context`, `breakout_state`, `liquidity_state`, `location`,
`distance_to_trigger`, `potential_rr_feasibility`, `late_overextension_risk`,
`waiting_for`, `invalidated_if`, `primary_scenario_present`,
`alternate_scenario_present`, `improving_or_deteriorating`,
`model_coverage`, `invalidation_level`, `structural_anchor_price`. Every
field is `null` explicitly when genuinely unavailable — never omitted to
make the record "look full," and never fabricated.

### Transition semantics

`transition = "<previous_pre_entry_state> -> <pre_entry_state>"` for the
SAME `setup_id`, looked up from the store's latest record for that ID. A
brand-new `setup_id` (first observation, or a genuinely different setup)
always has `previous_pre_entry_state: null` and `transition: null` — it
never inherits another setup's state. The engine is not restricted to a
fixed example list of transitions; any `from -> to` pair the closed
10-state vocabulary allows can occur.

### Historical invalidation (additive, around Stage 1/2, never inside it)

Stage 1/2's `anticipation.state` can only ever report `INVALIDATED` from
the **current** snapshot's own explicit evidence (a `FAILED_BREAKOUT`/
`FALSE_BREAKOUT`, or a direction-matched invalidated classical pattern).
Stage 3 adds one more, strictly objective possibility: if a **previous**,
still-open observation exists for this exact `setup_id` with a stored
`invalidation_level`/`direction`, and the **current** evidence's last
confirmed close has crossed that stored level against the stored
direction, the observation is recorded as `INVALIDATED` even though Stage
1/2 alone would not have known that. This is evaluated by
`checkHistoricalInvalidation()`, called from
`recordAnticipationObservation()` — `anticipation.js` itself is never
modified and never takes a persistence dependency. Terminal states
(`CONFIRMED`, `MISSED`, `INVALIDATED` itself) are never re-checked. If the
current confirmed close is unavailable, the check returns `false` — it
never guesses.

### Improving / deteriorating

`classifyProgression()` implements an explicit, ordinal semantics table —
**not** a probability, **not** a weighted score:

| Rank | States |
|---|---|
| 5 | `CONFIRMED` |
| 4 | `ARMED` |
| 3 | `CONFIRMATION_PENDING` |
| 2 | `APPROACHING_ZONE`, `RETEST_PENDING`, `RECLAIM_PENDING` (same tier) |
| 1 | `DEVELOPING` |
| 0 | `WAIT` |
| -1 | `MISSED`, `INVALIDATED` (terminal-negative, same tier) |

`current rank > previous rank` → `IMPROVING`; `<` → `DETERIORATING`; equal
rank (including a same-tier lateral move, e.g.
`RETEST_PENDING -> RECLAIM_PENDING`) → `UNCHANGED`; no previous observation
for this `setup_id`, or a state outside the closed vocabulary → `UNKNOWN`.
This is explicitly not "every enum change is improvement" — a lateral move
within a tier demonstrates no objective progress toward confirmation.

### WAIT-reason observability

`authoritative_wait_reason` is copied **verbatim** from
`anticipation.authoritative_wait_reason` (itself `decision.reason`,
untouched) — never renamed, bucketed, or normalized. `opportunity_metrics.js`'s
counters are generic (`countBy` over whatever string keys actually appear),
so a wait reason the engine has never produced before is still counted
correctly, with zero code changes required.

### Model-coverage observability

`classifyModelCoverage()` (mission Part 10) is **observability only** — it
is never read by `anticipation.js` or `calculateEntry()`, and a source-audit
test asserts `anticipation.js` never imports `anticipationStore.js` at all.

| Class | Meaning |
|---|---|
| `NO_OBJECTIVE_SETUP` | Bare `WAIT`, nothing developing at all. |
| `EVIDENCE_ONLY_FAMILY_DEVELOPING` | The developing family is one of the 4 evidence-only families (`momentum_continuation`, `range_trading`, `compression_expansion`, `structural_reversal`) — no code path could ever independently trigger BUY/SELL for it. |
| `PROTECTED_MODEL_TRIGGER_NOT_COMPLETE` | A protected-model-mapped family (TC/PB/BO/MR/SR) is developing, but no candidate has triggered yet. |
| `PROTECTED_MODEL_CANDIDATE_BLOCKED_BY_GATE` | A real protected-model candidate DID trigger (`mapped_model_code` is set) but `decision.action` is still not BUY/SELL — a downstream gate (RR/quality/HTF/overextension/etc.), not missing coverage, is what's blocking. |
| `PROTECTED_MODEL_CONFIRMED` | `pre_entry_state === 'CONFIRMED'`. |
| `UNKNOWN` | Defensive fallback. |

This is the classification that will eventually let a later, separate
analysis distinguish "WAIT is caused by gating" from "WAIT is caused by a
genuine model-coverage gap" — Stage 3 only records the evidence; it draws
no such conclusion itself.

### Metrics (`validation/opportunity_metrics.js`)

`computeOpportunityMetrics(records)` is pure (no I/O) and computes: total
observations; action counts; authoritative WAIT-reason counts (generic,
unbounded); pre-entry-state counts; transition counts; strategy-family
counts; model-coverage counts; regime/session/volatility-state counts;
per-HTF-tier alignment counts; unique/confirmed/invalidated/missed setup
counts; and transition ratios for `DEVELOPING -> ARMED`,
`ARMED -> CONFIRMED`, `ARMED -> INVALIDATED`, `ARMED -> MISSED` (each
`{from, to, count, denominator, ratio}`, or `null` when the denominator is
zero — never a fabricated percentage).

### No win-rate/accuracy claims

**This module never computes a win rate, accuracy, profit factor, or
expectancy, and makes no profitability claim of any kind.** Opportunity
*progression* is not trade *success*. An `ARMED -> CONFIRMED` ratio
measures how often a fully gate-cleared candidate also cleared the one
remaining confirmatory condition — it says nothing about whether the
resulting trade would have won or lost. That question belongs to a genuine
completed-trade outcome ledger (`src/engine/signalStore.js`'s own
OPEN/PASS/FAIL resolution, or the P6/P7/P8 validation ledgers), which is
explicitly outside this Stage 3 mission. A dedicated test asserts the
serialized metrics output never contains `win rate`, `accuracy`, `profit
factor`, or `expectancy`.

### Integration boundary (what Stage 3 deliberately does NOT do)

`watcher.js` is **unchanged** — it still only ever calls `calculateEntry()`
on a new confirmed 5m candle, exactly as before Stage 3. Stage 3 provides
`recordAnticipationObservation()` as the small, explicit recording API a
*future* Stage 6 watcher/CLI integration can call, passing in the SAME
already-computed `decision`/`evidence`/`anticipation` it already has — no
new CLI command or MCP tool was added in this stage, and no new mutating
surface was exposed, per the mission's own "do not expand MCP mutating
surface unnecessarily." The function itself, directly callable and
directly unit-tested, is the minimum safe integration point for now.

### Live-data rule

The store and log start genuinely empty. No historical row is fabricated,
backfilled from memory, console output, or assumption — every row that
will ever exist comes from a real, future call to
`recordAnticipationObservation()` fed by a real engine evaluation.
