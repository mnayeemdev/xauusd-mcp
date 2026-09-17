# Pine P3 — Good-Entry-Only Decision Engine

Canonical Pine source: [`pine/XAUUSD_Adaptive_Master.pine`](../pine/XAUUSD_Adaptive_Master.pine)
`INDICATOR_VERSION = "0.3.0"`, `CONTRACT_VERSION` unchanged at `1`.

**This is the first phase authorized to reach BUY/SELL.** Every gate below
exists to keep that rare — WAIT is the default and the common case, exactly
as instructed. `contractAction` is computed as:

```pine
contractAction = finalTradeApproved ? (candIsLong ? "BUY" : "SELL") : "WAIT"
```

`finalTradeApproved` is a single boolean conjunction of every gate in the
pipeline. If even one is false, the result is always `"WAIT"`. This is the
only place `"BUY"`/`"SELL"` appears in the entire file (verified: exactly 5
code lines mention them, all gated by `finalTradeApproved` — the assignment
itself plus two `alertcondition()` calls and two `plotshape()` markers).

## Pipeline

```
MARKET DATA → REGIME → STRUCTURE → IS TRADING APPROPRIATE?
→ MODEL ELIGIBILITY → SETUP → CORRECTION BLOCKER → TRIGGER → CONFIRMATION
→ ENTRY LOCATION → QUALITY GATE → LOGICAL STOP → LOGICAL TARGETS
→ RR VALIDATION → FINAL ACTION
```

## Regime × Model × Direction eligibility matrix

| Regime | TC | PB | BO | MR | SR |
|---|---|---|---|---|---|
| BULL_TREND | long | long | long | ✗ | long+short |
| BEAR_TREND | short | short | short | ✗ | long+short |
| RANGE | ✗ | ✗ | long+short | long+short | long+short |
| COMPRESSION | ✗ | ✗ | long+short | ✗ | ✗ |
| TRANSITION | ✗ | ✗ | ✗ | ✗ | ✗ (WAIT decided before model evaluation) |
| CHOP_UNCERTAIN | ✗ | ✗ | ✗ | ✗ | ✗ (WAIT decided before model evaluation) |
| HIGH_VOLATILITY | ✗ | ✗ | ✗ | ✗ | ✗ (explicitly gated off entirely) |
| correctionActive=true | blocked regardless of regime — hard blocker checked independently |

MR is blocked in every regime except RANGE — verified by source audit and
the JS reference-model's exhaustive regime sweep.

## Model selection priority

**PB > BO > TC > MR > SR** — a resolved trend correction is the most
specific, highest-conviction context; an anchored breakout/retest is next
most rigorous; plain continuation is common but least specific; range
mean-reversion and structural rejection are the most opportunistic. Only the
first eligible model with a **confirmed trigger this bar** is considered —
never more than one model, never both directions, per bar.

## Setup ≠ Trigger ≠ Confirmation

`SETUP_STATE ∈ {NO_SETUP, SETUP_READY}`, `TRIGGER_STATE ∈ {NO_TRIGGER,
TRIGGER_PENDING, TRIGGER_CONFIRMED}`, `CONFIRMATION_STATE ∈ {PENDING,
CONFIRMED}` (whether the current bar itself is confirmed). A setup never
implies permission to trade by itself; a trigger is still subject to
confirmation, entry-location, quality, and RR.

## The five models

| Model | Eligible regimes | Setup | Trigger | Invalidation | Entry | SL basis | Target basis | Quality req. | RR req. |
|---|---|---|---|---|---|---|---|---|---|
| **TC** | BULL/BEAR trend | Structure direction agrees with trend + a matching displacement within `tcSetupLookback` bars | Fresh continuation `BULLISH_BOS`/`BEARISH_BOS` this bar (never CHoCH) | Correction becomes active; structure disagrees | Confirmed trigger bar close | Most recent opposing swing (structure), ATR-buffered | Nearest opposing active level, else 2R default, capped 3R | ≥ `qualityThreshold` (65 default) | ≥ `minRR` (1.5 default) |
| **PB** | BULL/BEAR trend | Correction resolved in favor of the trend within `pbSetupLookback` bars, not currently active | Fresh `BOS` or "back with trend" `CHoCH`, strictly after the resolution bar | A new correction activates; resolution goes stale | Trigger bar close | Most recent opposing swing (the pullback extreme) | Same as TC | Same | Same |
| **BO** | BULL/BEAR/RANGE/COMPRESSION | P2 anchored range confirmed **before** any breakout (`rangeState` transitions ACTIVE→BROKEN) | Retest of the broken boundary (`boLongRetestBar`/`boShortRetestBar`, strictly after the breakout bar), then a **strictly later** confirmed reclaim close (`bar_index > retestBar`) — breakout bar, retest bar, and reclaim bar are always three distinct bars | Retest expires after `boRetestMaxBars`; a recorded retest that closes back through the broken boundary invalidates the whole sequence (`boLongActive`/`boShortActive` cleared) | Reclaim bar close | The broken range boundary, ATR-buffered | Same nearest-objective logic | Same | Same |
| **MR** | RANGE only | Price genuinely touches the boundary (`low <= rangeLow` / `high >= rangeHigh`) | Same-bar close back inside the range (`close > rangeLow` / `close < rangeHigh`) with the overshoot within `mrBoundaryAtrTol`, self-contained on the trigger line itself, **and no RECENT opposing displacement** (`mrLongDisplacementBlocked`/`mrShortDisplacementBlocked`, reusing P2's `barsSinceBearishDisp`/`barsSinceBullishDisp` recency series over `mrDisplacementBlockBars`, not just the identical bar) | An opposing displacement within the recency window blocks the setup outright | Rejection bar close | The sweep bar's own extreme, ATR-buffered | Same | Same | Same |
| **SR** | BULL/BEAR/RANGE | Regime supports structure, not correcting | A genuine P2-confirmed event this bar: swing sweep, PDH/PDL sweep, or CHoCH (never a bare wick) | Stale event (not this bar) is never reusable | Trigger bar close | Most recent tracked swing, ATR-buffered | Same | Same | Same |

## Correction hard blocker

`not correctionActive` is an unconditional `and` term in `finalTradeApproved`
— verified by source audit that it never appears inside an `or` branch.
Perfect BOS + CHoCH + sweep + high quality + attractive RR, all at once,
still yields WAIT if `correctionActive == true` (tested explicitly).

## Confirmation gate

`confirmedBar` is required in `finalTradeApproved`. `BAR_CONFIRMED` in the
contract always reflects the live `confirmedBar` flag — never hardcoded
`true` (source-audited).

## Entry semantics

`ENTRY = close` of the confirmed trigger bar — never a historical idealized
price, never a future bar's price.

## Entry-location / do-not-chase

`candOverextended = |entry - anchor| > overextendAtrMult × ATR` (default
2.5×ATR). Both are ATR/bar-count normalized — never raw dollar thresholds —
so the same rule behaves sensibly across 5m/15m/30m regardless of Gold's
absolute price level. Verified with an explicit test proving the same raw
price distance is/isn't overextended depending on ATR.

### ENTRY_LATE — per-model setup-origin freshness (review/fix pass)

An earlier draft computed `candTriggerBar = bar_index` and then compared
`bar_index - candTriggerBar`, which is always `0` — a structurally dead
gate that could never fire. This was corrected to a genuine per-model
**setup origin bar** (`candSetupOriginBar`), compared against a
**per-model** maximum age (`candMaxLateBars`), each deliberately tighter
than that model's own setup-recency window so the gate is actually
reachable:

| Model | Setup origin bar | Max age input |
|---|---|---|
| TC | The displacement bar that produced the trend continuation setup (`bar_index - barsSinceBullish/BearishDisp`) | `tcMaxEntryLateBars` (5) |
| PB | `corrResolvedBar` — the bar the pullback correction resolved on | `pbMaxEntryLateBars` (5) |
| BO | `boLongBar`/`boShortBar` — the original breakout bar | `boMaxEntryLateBars` (10) |
| MR | `bar_index` (same-bar by architecture — MR's setup and trigger are the same candle) | `0` — always fresh by construction; documented rather than pretending the generic gate adds protection here |
| SR | `bar_index` (same-bar by architecture, same reasoning as MR) | `0` |

`candEntryLate = candTriggered and not na(candSetupOriginBar) and
(bar_index - candSetupOriginBar) > candMaxLateBars`. Proven reachable (not
a tautology) for TC/PB/BO by construction and by
`tests/pine_p3_review_fix.test.js` §2.

## SL → Targets → RR (in that order, never reversed)

1. **SL** = nearest relevant structural anchor (model-specific) minus/plus
   an ATR buffer (`slAtrBuffer`, default 0.25×ATR); falls back to a fixed
   ATR distance (`slAtrFallback`, default 1.5×ATR) only when no anchor
   exists. Geometry sanity-checked (`long: SL < ENTRY`, `short: SL > ENTRY`)
   — invalid geometry is rejected outright, never repaired.
2. **TP1** = `entry ± 1.0×risk` (fixed R-multiple, `tp1RMultiple`).
   **TP2** = the nearest real active opposing-side structural level beyond
   entry (reusing P2's bounded level arrays directly), falling back to a
   2R default (`tp2RMultipleDefault`) when no objective exists, always
   capped at 3R (`tp2RMultipleCap`) so a distant "objective" can never
   manufacture an unrealistic target.
3. **RR** = `|TP2 − entry| / risk`, validated against `minRR` (1.5 default).
   Because TP2 uses a real structural objective when one exists, RR is
   **not a tautological constant** — a genuinely close opposing level
   correctly produces a lower RR and can fail the gate, giving the RR check
   real teeth (verified by test).

## Quality score (0–100, clamped, never a probability claim)

| Component | Max | Rule |
|---|---|---|
| Structure | 15 | HH/LL = 15, LH/HL = 10, EQH/EQL = 5 |
| Trigger | 15 | Fresh BOS = 15, fresh CHoCH = 12, MR/SR sweep-class = 10 |
| Entry location | 15 | Linear falloff to 0 as extension approaches the overextension ATR multiple |
| Momentum | 10 | ADX scaled linearly to the trend threshold, capped |
| Volatility | 10 | Full marks inside a 0.7–1.3 ATR-ratio band, linear falloff outside |
| MTF alignment | 15 | HTF bias matches direction = 15, flat = 7.5, opposes = 0 |
| Session | 10 | LONDON/NEW_YORK = 10, ASIA = 6, OTHER = 2 |
| RR quality | 10 | 0 at minRR, scales to +100% over minRR, capped |
| **Total** | **100** | Components sum to exactly 100 at best case; defensively clamped `[0,100]` |

Never named "confidence," "win probability," or "AI confidence" anywhere in
the codebase (source-audited). `QUALITY_THRESHOLD` default `65`
(unchanged by this review pass — not re-tuned).

**qStructure vs qTrigger / qEntryLocation vs candOverextended (review
re-audit):** these pairs were checked for accidental double-counting of the
same evidence. They measure genuinely different properties and were kept
as-is: `qStructure` scores the classification of the *last confirmed swing
pattern* (HH/LL vs LH/HL vs EQH/EQL — a structural-quality property that
persists across many bars), while `qTrigger` scores the *type of event that
fired this bar* (fresh BOS vs CHoCH vs sweep-class — an event-quality
property that exists only on the trigger bar itself); a bar can have
excellent structure with a weaker trigger type or vice versa. Similarly,
`qEntryLocation` is a graduated 0–15 score (linear falloff with distance
from the anchor) feeding the overall quality total, while
`candOverextended` is a separate hard boolean gate at a fixed ATR multiple
— one measures "how good is this entry on a sliding scale," the other
answers "is this entry disqualified outright." No code change was required;
this section documents the distinction per the review's request.

## WAIT-reason precedence (exact, source-audited order)

```
1. NEWS_SUPPRESSION        7. CONFIRMATION_INCOMPLETE
2. CHOP / TRANSITION       8. ENTRY_LATE
3. CORRECTION_ACTIVE       9. OVEREXTENDED
4. NO_ELIGIBLE_STRATEGY   10. NO_GOOD_ENTRY (quality below threshold)
5. NO_SETUP               11. RR_NOT_ACCEPTABLE
6. NO_TRIGGER             12. UNKNOWN (unreachable fallback)
```

`NO_GOOD_ENTRY` (an existing Phase 2B enum value) is used for "quality below
threshold" rather than inventing a new `QUALITY_TOO_LOW` value — this keeps
`CONTRACT_VERSION` at `1` with zero parser changes required.

## Signal state machine / freeze

Thirteen `var`-declared fields (`signalId`, `signalSide`, `signalEntry`,
`signalSl`, `signalTp1`, `signalTp2`, `signalRr`, `signalModel`,
`signalRegime`, `signalQuality`, `signalBarTime`, `signalTimeframe`,
`signalSession`) are written **exactly once**, inside a block gated by
`if confirmedBar and finalTradeApproved`. `SIGNAL_ID = model + "_" + side +
"_O" + setupOriginBar + "_T" + bar_index` — now encodes the setup's origin
bar, not just the trigger bar. Published trade fields (`outEntry`, `outSl`,
etc.) mirror the frozen signal only on the approval bar and are `NA` on
every other bar. BO's multi-bar retest state (`boLongActive`/
`boShortActive`) is explicitly consumed (cleared) the instant its trigger
fires, preventing the same breakout sequence from re-triggering on a later
bar.

### Duplicate-signal / stale-event defense-in-depth (review/fix pass)

`SIGNAL_ID = model_side_barIndex` alone was flagged as insufficient — a
new `bar_index` does not by itself prove a new setup. A second, independent
layer was added: `candOriginKey = model_side_setupOriginBar` (built from
the setup's origin bar, not the trigger bar), latched into a persistent
`var string lastEmittedOriginKey` the instant a trade is approved.
`candOriginFresh = candOriginKey != "NA" and candOriginKey !=
lastEmittedOriginKey` is now an unconditional `and` term inside
`finalTradeApproved` — the identical underlying setup/event can never be
approved a second time, independent of what `bar_index` the trigger itself
happens to land on. See `tests/pine_p3_review_fix.test.js` §5.

## MTF (5m/15m/30m)

`EXECUTION_TF = timeframe.period` faithfully reflects the live chart. HTF
context (`htfBias`) feeds only the quality score's MTF-alignment component
— it never gates eligibility or setup/trigger detection on its own (no
"if any timeframe says BUY" mechanical chain). All thresholds (ATR
multiples, bar counts) are normalized, not raw dollar amounts, so behavior
is consistent across timeframes by construction rather than by per-timeframe
tuning (which was explicitly not done — no historical optimization occurred).

## Session and high volatility

Session contributes only a small (max 10 of 100) quality component — it
cannot create or veto a trade by itself. `HIGH_VOLATILITY` blocks every
model outright (§25 "explicitly gated, not assumed as opportunity") —
documented as a deliberate current-phase choice, not an oversight.

## News suppression

`newsSuppressed` is a manual `input.bool`, default `false` — Pine cannot
know live economic news. When `true`, it is the highest-priority WAIT
reason, blocking every new trade unconditionally.

## Alerts

Two `alertcondition()` calls (confirmed BUY, confirmed SELL), both gated by
`finalTradeApproved`. No live alerts are configured, no webhook, no
`strategy.*` call, no order/broker integration exists anywhere in the file
(source-audited).

## Non-repaint / chronology audit summary

All P1/P2 chronology guarantees are unchanged and re-verified (105+ existing
tests still pass unmodified). New for P3:

| Event | Physical bar | First knowable bar | Recorded bar | Backdate possible? |
|---|---|---|---|---|
| Setup | evidence bar | same bar | same bar | No |
| Trigger | confirmed-event bar | same bar (BOS/CHoCH/sweep already chronology-protected by P2) | same bar | No |
| Entry | trigger bar close | same bar | same bar | No |
| Signal freeze | approval bar | same bar (`confirmedBar` required) | same bar | No — `var` fields written exactly once |

`request.security` audit: no new calls added in P3 (reuses P1/P2's HTF/PDH/PDL
calls unchanged, both `lookahead_off`, both source-audited previously and
again in this phase's suite).

## MCP no-fabrication verification

No `src/core/master_contract.js` change was required — `CONTRACT_VERSION`
remains `1`. All existing Phase 2B BUY/SELL validation gates (required
fields, confirmed-bar check, contradiction checks for correction/
overextension/RR/quality) apply unchanged and were re-verified against
realistic P3 fixtures (`tests/pine_p3_contract.test.js`, 19 tests) —
including that a Pine-side contradiction (e.g. claiming BUY with quality
below its own stated threshold) is still caught and rejected by the parser,
never silently repaired.

## Testing

```bash
npm run test:contract  # master_contract + all pine_p1/p2/p3 test files
npm run pine:check     # real TradingView compile
npm run pine:analyze   # offline static analyzer
```

- `tests/pine_p3_decision_model.test.js` (38 tests) — JS reference-model of
  the eligibility matrix, SL/TP/RR construction, entry-location, quality
  scoring, WAIT-reason precedence, and the exhaustive "every single gate
  alone forces WAIT" proof (directly answering the Final Proof questions).
- `tests/pine_p3_audit.test.js` (23 tests) — static source audits proving
  the Pine file's actual expressions match the model, including the
  corrected MR displacement-blocker and BO retest/reclaim source patterns.
- `tests/pine_p3_contract.test.js` (19 tests) — realistic valid BUY/SELL
  fixtures plus per-model and boundary adversarial cases against the real
  parser.
- `tests/pine_p3_review_fix.test.js` (27 tests, added during the
  review/fix pass) — dedicated proof of the three corrected defects: MR
  boundary/touch requirement and displacement blocker (§1, 8 tests), a
  bar-by-bar BO retest→reclaim state-machine simulator proving breakout,
  retest, and reclaim are always three distinct bars with correct expiry
  and failed-retest invalidation (§3, 7 tests), model-specific
  `candSetupOriginBar`/`candEntryLate` reachability proofs (§2, 9 tests),
  and the origin-based duplicate-signal guard (§5, 3 tests).

## Known limitations

- No Pine execution/bar-replay harness exists outside TradingView's own
  runtime; verification is compile success + JS reference-model execution +
  source audits + parser fixtures — not literal historical bar replay.
- Model logic is deliberately minimal (as instructed) — e.g. SL/TP always
  use the single nearest structural anchor, not a bespoke per-model
  algorithm; this is a documented simplification, not an oversight.
- No historical/out-of-sample validation, backtesting, or parameter tuning
  was performed — explicitly out of scope for this phase.
- The indicator has never executed on a live chart in this task.

## Deviations

- `QUALITY_TOO_LOW` was not added to the WAIT_REASON enum; `NO_GOOD_ENTRY`
  (already approved in Phase 2B) is used instead, avoiding any contract
  version bump.
- `structureDirection`'s 3-state simplification (from Pine P2) carries
  forward unchanged; P3 does not introduce a 4th state.
- Quality component weights were corrected during this phase's own testing
  (see review report) from an initial 85-point max to a genuine 100-point
  max — caught by the test suite itself before being reported as final.
- **Review/fix pass (post-initial-delivery):** three independently-reported
  defects were fixed without redesigning P1/P2 or retuning thresholds — see
  the "PINE P3 REVIEW/FIX REPORT" for full detail: (1) MR's boundary/sweep
  condition was made self-contained and touch-based rather than reachable
  without genuinely touching the range, and its displacement blocker was
  widened from same-bar-only to a recency window (`mrDisplacementBlockBars`)
  reusing existing P2 state; (2) `candEntryLate` was redesigned from a dead
  always-false tautology into genuine per-model setup-origin freshness; (3)
  BO's retest and reclaim were separated into two distinct, chronologically
  ordered bars (`boLongRetestBar`/`boShortRetestBar`) with explicit
  retest-failure invalidation. A defense-in-depth `candOriginFresh` guard
  was added proactively alongside these fixes.
