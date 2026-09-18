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

## Not part of this stage

Explicitly deferred to a later, separately-approved stage:

- Persistence (`anticipationStore.js`), transition history, the
  opportunity/WAIT observability log, and any metrics aggregation over it.
- Visualization (`drawingRegistry.js`, `visualization.js`,
  `xauusd_visualize.js`) — no `draw_shape`/`draw_list`/`draw_remove_one`
  tool is exposed, no drawing occurs, no `profiles.js` change was made.
- Watcher changes (`watcher.js`, `watcherState.js`, `notifier.js`) — the
  watcher still only ever calls `calculateEntry()`, exactly as before.
- Pine/P8 changes.
- Product rename, threshold tuning, or any change to the protected decision
  pipeline (`models.js`, `pipeline.js`, `risk.js`, `quality.js`, `mtf.js`,
  `htf.js`) — `minRR = 1.7`, `qualityThreshold = 65`, and
  `corrResolveConfirmBars = 3` are unchanged and covered by a regression
  test in `tests/engine_anticipation.test.js`.
