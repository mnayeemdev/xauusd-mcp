# Pine P1 — Regime + Correction Foundation

Canonical Pine source: [`pine/XAUUSD_Adaptive_Master.pine`](../pine/XAUUSD_Adaptive_Master.pine)
`//@version=6`, `INDICATOR_VERSION = "0.1.0"`, `CONTRACT_VERSION = 1`.

**This is the first real Pine implementation for XAUUSD Adaptive Master.**
Before it, no `.pine` file, no saved TradingView script, and no chart study
existed anywhere for this project (verified: `find -iname "*.pine"` → 0,
`tv pine list` against the live account → 0 saved scripts, live chart →
0 studies). Nothing here extends prior Pine work because there was none —
this file *is* the foundation.

## P1 scope discipline

**`ACTION` is the hardcoded literal string `"WAIT"`.** There is no variable,
branch, input, or state transition anywhere in the file that can produce any
other value — grep for `BUY` or `SELL` in the file returns zero matches,
including in comments. P1 has no representation of a trade decision; it
cannot signal one even in principle, let alone accidentally.

Implemented: confirmed-bar architecture, regime classification (7 regimes,
with persistence/hysteresis), a correction state machine with chronology
protection, an HTF context mechanism (exposed, not yet used to gate
anything), UTC session classification, and the minimal P1-owned slice of the
Phase 2B contract table. **Not implemented** (by design, reserved for later
phases): TC/PB/BO/MR/SR entry models, setup/trigger/entry pipeline, quality
score, SL/TP/RR, any trade decision, alerts, webhooks, broker execution.

## Regime definitions and precedence

Computed fresh every bar as `regimeCandidate` (raw), then persisted into
`officialRegime` only via the hysteresis mechanism below. Evaluated as an
**if/else-if chain — first match wins**, so branches never overlap
ambiguously:

| Priority | Regime | Deterministic evidence |
|---|---|---|
| 1 | `HIGH_VOLATILITY` | `atrRatio >= highVolMultiplier` (current ATR%-of-price vs. its own 100-bar rolling average) |
| 2 | `COMPRESSION` | `adx < adxTrendThreshold` **and** `bbWidthRatio <= compressionRatioMax` (Bollinger width vs. its own 100-bar rolling average) |
| 3 | `BULL_TREND` | `emaFast > emaSlow` **and** `emaSlow` rising over `emaSlopeLookback` bars **and** `adx >= adxTrendThreshold` |
| 4 | `BEAR_TREND` | mirror of BULL_TREND (falling slow EMA, ADX confirms strength) |
| 5 | `TRANSITION` | an EMA fast/slow cross happened within `transitionLookback` bars, **or** the market was strongly trending within that lookback and no longer is |
| 6 | `RANGE` | `|DI+ − DI−| <= diBalanceThreshold` (no directional dominance) **and not** choppy |
| 7 | `CHOP_UNCERTAIN` | fallback — everything above failed to classify, **or** a short-lookback direction-flip count (`flipCount >= flipCountThreshold`) indicates oscillation |

Each rule uses one or two well-known, explainable measures (EMA
relationship/slope, ADX/DMI, normalized ATR, Bollinger width) — no indicator
stacking, exactly per the spec's caution against over-sophistication.

### Hysteresis (anti-flicker)

`officialRegime` only changes when `regimeCandidate` has held the same value
for `persistenceBars` (default 3) **consecutive confirmed bars**. The
streak counter resets on any candidate change. Initial value (before enough
confirmed history exists) is `"CHOP_UNCERTAIN"` — the most conservative
state — never an undefined/`na` regime.

## HTF context foundation

```pine
htfEmaFastExpr() => ta.ema(close, emaFastLen)
htfEmaFast = request.security(syminfo.tickerid, htfTimeframe, htfEmaFastExpr()[1], lookahead = barmerge.lookahead_off)
```

- `lookahead = barmerge.lookahead_off` is **always** used — never `lookahead_on`.
- The `[1]` **inside** the security expression is the standard Pine
  non-repaint pattern: it asks for the value as of the *previous, already-
  closed* HTF bar, regardless of how far into the current (still-forming)
  HTF bar the chart's own clock is. HTF information becomes knowable exactly
  at HTF-bar close — never before, and the `[1]` offset guarantees it's
  never read mid-formation even on the current chart's most recent bar.
- `htfTimeframe` defaults to `"60"` — an explicit, documented **placeholder**,
  not an approved 5m→HTF/15m→HTF/30m→HTF mapping (that hierarchy is a later
  phase's architecture decision per the Phase 3 spec's own caution against
  hard-coding an unapproved MTF hierarchy).
- `htfBias` (BULL/BEAR/FLAT) is computed and exposed in the debug table only
  — **it does not gate `officialRegime`, `waitReason`, or anything else in
  P1.** No MTF entry logic exists yet.

### `request.security` audit

Exactly two calls, both to the same `htfTimeframe` input, both using
`lookahead = barmerge.lookahead_off` and the `[1]`-inside-expression pattern
described above. No other `request.security` call exists in the file. No
`request.security_lower_tf`, no `barmerge.lookahead_on`, anywhere.

## Correction engine

Persistent state (`var`, confirmed-bar gated): `correctionActive`,
`correctionSide`, `corrStartBar`, `corrStartTime`, `correctionEvidence`,
`correctionResolved` (transient, true only on the resolving bar),
`corrResolvedBar`/`corrResolvedSide` (permanent audit trail, never cleared
by a mere regime-exit), `corrRecoverStreak`.

**Activation** — only from `officialRegime == "BULL_TREND"` or
`"BEAR_TREND"` (never from RANGE/COMPRESSION/CHOP/TRANSITION/HIGH_VOLATILITY
— "a valid directional context" per spec), and requires **two independent
pieces of evidence together**, never a single candle:
1. Structural displacement: `recentSwingHigh − close >= corrAtrMultiplier × ATR`
   (mirrored for bear: `close − recentSwingLow`).
2. Momentum deterioration: `emaFast` declining over `corrMomentumLookback`
   bars (mirrored for bear: rising).

`recentSwingHigh`/`recentSwingLow` are computed from `high[1]`/`low[1]` — the
current, possibly-still-forming bar's own extreme can never become the
displacement anchor.

**Resolution — chronology-protected:**
- **Hard guard: `bar_index > corrStartBar`.** A correction can never activate
  and resolve on the same bar — this is checked explicitly before any
  resolution logic runs at all.
- Requires `corrResolveConfirmBars` (default 2) **consecutive confirmed
  bars** of recovery evidence (`close` back on the trend side of `emaFast`),
  not a single tick — no backdated CHoCH-style single-bar resolution.
- On resolution: `corrResolvedBar`/`corrResolvedSide` are written (audit
  trail, permanent) and `correctionActive` clears.

**Regime-exit clearing (not a resolution):** if `officialRegime` leaves
`BULL_TREND`/`BEAR_TREND` entirely while a correction is active, the
transient fields clear but `corrResolvedBar`/`corrResolvedSide` are **left
untouched** — this was never a genuine resolution, so the audit trail isn't
overwritten with a false one.

**Trend-side flip:** a direct `BULL_TREND ↔ BEAR_TREND` transition fully
resets the transient correction fields (the correction context no longer
means anything relative to the new direction).

**The permanent invariant this phase establishes** (P1 itself always
outputs WAIT regardless, but the rule is coded for future phases to inherit
unchanged): `correctionActive == true` ⇒ `ACTION = WAIT`,
`WAIT_REASON = CORRECTION_ACTIVE`. Resolution never implies a trade — it
only means later phases may *investigate* whether a setup exists.

## Session foundation

Deterministic, non-overlapping UTC-hour buckets (all four boundaries are
configurable inputs; defaults below are a documented placeholder baseline,
not a claim of exact interbank-session accuracy):

| Session | Default UTC hours |
|---|---|
| `ASIA` | 00:00–07:59 |
| `LONDON` | 08:00–12:59 |
| `NEW_YORK` | 13:00–20:59 |
| `OTHER` | 21:00–23:59 |

Session is exposed as context only — it never gates `officialRegime`,
`correctionActive`, or `waitReason`.

## WAIT reason rules (documented precedence)

```
1. officialRegime == CHOP_UNCERTAIN → CHOP
2. officialRegime == TRANSITION     → TRANSITION
3. correctionActive                 → CORRECTION_ACTIVE
4. otherwise                        → NO_ELIGIBLE_STRATEGY
```

This is the P1-relevant subset of the full Phase 3 precedence
(`NEWS_SUPPRESSION → UNCLEAR/CHOP/TRANSITION → CORRECTION_ACTIVE →
NO_ELIGIBLE_STRATEGY → NO_SETUP → NO_TRIGGER → CONFIRMATION_INCOMPLETE →
ENTRY_LATE/OVEREXTENDED → QUALITY_TOO_LOW/NO_GOOD_ENTRY →
RR_NOT_ACCEPTABLE`), in the same relative order. P1 never emits
`NEWS_SUPPRESSION`, `NO_SETUP`, `NO_TRIGGER`, `CONFIRMATION_INCOMPLETE`,
`ENTRY_LATE`, `OVEREXTENDED`, or `RR_NOT_ACCEPTABLE` — it has no strategy,
setup, trigger, entry-location, or RR logic to make any of those claims
truthfully. `NO_ELIGIBLE_STRATEGY` is the honest catch-all: zero strategy
models exist yet, so nothing is ever eligible.

## Contract table implementation

30 fixed rows, `KEY | VALUE`, exactly matching `data_get_pine_tables`'
format. P1-owned fields: `CONTRACT_VERSION`, `INDICATOR_VERSION`, `SYMBOL`,
`EXECUTION_TF`, `CONTEXT_TF`, `BAR_TIME`, `BAR_INDEX`, `BAR_CONFIRMED`,
`REGIME`, `CORRECTION_STATE`, `CORRECTION_REASON`, `ACTION` (always
`"WAIT"`), `WAIT_REASON`, `SESSION`. Every field P1 does not own
(`MODEL`, `SETUP_STATE`, `TRIGGER_STATE`, `CONFIRMATION_STATE`, `QUALITY`,
`QUALITY_THRESHOLD`, `OVEREXTENSION_STATE`, `RR_VALIDATION_STATE`, `ENTRY`,
`SL`, `TP1`, `TP2`, `EXIT_TARGET`, `RR`, `SIGNAL_ID`, `SIGNAL_BAR_TIME`) is
emitted as the literal string `"NA"` — nothing is invented on Pine's behalf.

**No contract change was required.** The existing Phase 2B parser accepts
this table as-is (verified in `tests/pine_p1_contract.test.js` against the
real parser, using fixtures that mirror the Pine file's exact row order and
values).

## Debug fields (off by default — `debugMode` input)

`regime_candidate`, `regime_streak`, `official_regime`,
`prior_official_regime`, `htf_bias`, `correction_active`,
`correction_side`, `corr_start_bar`, `corr_resolved_bar`,
`corr_resolved_side`, `corr_recover_streak`, `adx`, `atr_ratio`,
`bb_width_ratio`, `flip_count`, `wait_reason`. Default chart visuals are
minimal: two EMA lines only; the contract table is small and always
present (it's the machine-readable data path, not a visual add-on); the
debug table and regime background tint are both gated behind `debugMode`.

## Compile / static validation

- **Offline static analyzer** (`tv pine analyze`, no network/CDP): 0 issues.
- **Real TradingView compile check** (`tv pine check` — a direct Node
  `fetch()` to TradingView's public `pine-facade/translate_light` endpoint;
  no CDP, no browser, no chart interaction of any kind): **compiled: true,
  0 errors, 0 warnings.**
- `npm run pine:analyze` / `npm run pine:check` added as convenience scripts.

## MCP parser compatibility

`tests/pine_p1_contract.test.js` (10 tests) hand-encodes the exact 30-row
table this Pine file emits (same order, same literal values) for several
scenarios — `BULL_TREND` clean, `BEAR_TREND` with an active correction,
`CHOP_UNCERTAIN`, `TRANSITION`, every regime value, every session value, an
unconfirmed bar, and the always-literal `ACTION | WAIT` row — and feeds each
through the real `buildMasterContract()` parser. All 10 pass: `status: OK`,
`decision.action: WAIT`, correct `wait_reason`, zero trade-price fields
populated. **This is fixture-based verification against the real parser,
not a claim that the indicator was compiled and run live on the chart** —
per this task's explicit instruction, the indicator was never installed on
the live chart.

## Non-repaint audit

| Concern | Finding |
|---|---|
| `request.security` | 2 calls, both `lookahead = barmerge.lookahead_off`, both use the `[1]`-inside-expression pattern. No `lookahead_on` anywhere. |
| Persistent state (`officialRegime`, `correctionActive`, etc.) | All transitions gated behind `if confirmedBar` (`barstate.isconfirmed`) — historical values cannot change after a bar closes. |
| Regime persistence | Streak counter and official-regime commit both confirmed-bar-gated. |
| Correction activation | Confirmed-bar-gated; uses `high[1]`/`low[1]` as swing anchors (never the current bar's own extreme). |
| Correction resolution | Confirmed-bar-gated, hard `bar_index > corrStartBar` guard, multi-bar confirmation streak (not a single tick). |
| Contract table drawing | Wrapped in `if barstate.islast` for rendering efficiency only — this affects *when the table is drawn*, not the underlying state, which is already confirmed-bar-committed before the table ever reads it. |
| HTF | See §HTF above — `[1]` offset prevents an in-progress HTF bar from ever being read. |

**Residual repaint risk, disclosed rather than hidden:** the *candidate*
regime classification (`regimeCandidate`, and the debug-only `htf_bias`) is
recomputed on every bar including the currently-forming one, so it can
change intrabar — this is intentional (it's explicitly a "candidate," shown
for debug transparency) and is never what `officialRegime`, `waitReason`, or
the contract's `REGIME`/`WAIT_REASON` fields expose; those only ever reflect
the confirmed-bar-committed `officialRegime`. `BAR_CONFIRMED` in the
contract table directly reflects `barstate.isconfirmed` at read time, so a
consumer can always tell whether the current row was captured mid-bar
(informational fields update every bar) or on a freshly-closed bar.

## Known limitations

- `htfTimeframe` default (`"60"`) is a placeholder, not an approved
  per-execution-timeframe HTF mapping.
- Session boundaries are a documented deterministic baseline, not validated
  against real interbank session-overlap behavior.
- Regime/correction thresholds (ADX 20, persistence 3 bars, ATR/BB
  multipliers, etc.) are reasonable defaults, not backtested/optimized —
  explicitly out of scope per "no overfitting."
- The indicator has never run on a live chart in this task (by instruction);
  compile/parser verification is as thorough as possible without that step.

## Deviations

None from the P1 spec. `flipCount` uses a small bounded loop
(`flipLookback`, default 10 iterations) rather than a built-in — Pine has no
single built-in choppiness measure that matches the "direction-flip count"
evidence description, so a minimal explicit loop was used instead of adding
an unrelated third-party formula.
