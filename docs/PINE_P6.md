# Pine P6 — Out-of-Sample + Robustness Validation

**P6 is a validation phase, not an optimization phase.** The frozen P5
system (`pine/XAUUSD_Adaptive_Master.pine`, SHA-256
`6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6`) was
**not modified in any way** during P6. Every number in this document is
the real, live output of that unmodified file, read through the
unmodified production MCP functions (`data_get_pine_tables`,
`xauusd_master_state`). Nothing here was tuned, filtered, or
cherry-picked to look better.

## Data availability and partition limitation (read this first)

Before any performance figure, the single most important finding of P6
is a **tooling limitation**, not a trading result:

**There is no way, through the currently exposed MCP/CDP tools, to make
the live Pine engine compute over an arbitrary, precisely-bounded PREFIX
of history.** `chart_scroll_to_date`/`chart_set_visible_range` only
change what's *visible*; they do not truncate what Pine's `var`
accumulators compute over. Pine always computes over the *entire*
currently-loaded bar buffer. There is no exposed "compute only the first
70%, stop" mechanism, and building one would require either modifying
the frozen indicator (forbidden by the P6 hard-freeze boundary) or
writing a fully independent JS reimplementation of the entire five-model
decision engine (rejected as too fidelity-risky and contrary to the
project's own "never build a second signal detector" principle).

**Consequence:** the predeclared chronological 70/30 IS/OOS split
required by the P6 spec's Step 4 could not be executed at the
individual-signal level using the live engine. What *is* real,
reproducible, and reported below instead:

1. **A clean full-window measurement per timeframe** — the indicator was
   removed and freshly re-added (a complete `var`-state reset) against
   the maximum reproducible bar buffer TradingView would backfill for
   `OANDA:XAUUSD` at each resolution. This is the star, most trustworthy
   deliverable of P6: one deterministic pass over an exactly documented
   date range, not an uncontrolled accumulation across the project's
   past development sessions.
2. **A small (n=30), most-recent-only individual-signal sample** per
   timeframe, extracted via the frozen contract's own bounded
   recent-signals display (an already-existing, unmodified P5
   observability feature) — used only to illustrate a genuine
   chronological R-sequence/drawdown/streak calculation. This is
   explicitly **not** a substitute for the full-window result and is
   labeled as such everywhere it appears.
3. **Bootstrap: NOT PERFORMED — INSUFFICIENT SAMPLE.** The only
   individually-exportable R sequences (n=30) are too small and too
   recency-biased to responsibly resample; doing so would fabricate an
   appearance of statistical precision the data doesn't support.

This is reported as **VALIDATION LIMITED**, not VALIDATION BLOCKED — no
correctness defect was found; the limitation is about *available
tooling/history*, not about the frozen system being wrong.

## Maximum reproducible history (empirically determined, not assumed)

| Timeframe | Bars loaded | Date range | Span |
|---|---|---|---|
| 5m | 5,096 | 2026-08-23 → 2026-09-17 | 24.5 days |
| 15m | 5,179 | 2026-06-30 → 2026-09-17 | 78.5 days |
| 30m | 8,409 | 2026-01-01 → 2026-09-17 | 258.5 days |

Determined by requesting a deliberately very wide `chart_set_visible_range`
(back to 2020-01-01) and reading TradingView's actual in-memory bar-buffer
size (`bars.size()`/`bars.firstIndex()`/`bars.valueAt()`) via a read-only
CDP evaluation — repeated wider requests did not increase these figures
further, confirming each is the genuine backfill ceiling at capture time,
not an arbitrary choice. Full detail in `validation/p6_manifest.json`.

## Full-window primary results (the authoritative P6 numbers)

Captured immediately after a clean indicator reload at each timeframe —
one deterministic pass, not accumulated dev-session state.

| Timeframe | Bars | Signals | Closed | PASS | FAIL | PASS rate | Wilson 95% CI | Cum. R | Mean R | Max fail streak |
|---|---|---|---|---|---|---|---|---|---|---|
| 5m | 5,096 | 54 | 54 | 14 | 40 | **25.9%** | 16.1–38.9% | **+0.26** | 0.00 | 10 |
| 15m | 5,179 | 70 | 70 | 23 | 47 | **32.9%** | 23.0–44.5% | **+19.67** | 0.28 | 5 |
| 30m | 8,409 | 121 | 121 | 30 | 91 | **24.8%** | 18.0–33.2% | **-9.30** | -0.08 | 15 |

No signal was OPEN at capture time on any timeframe. Full breakdowns by
model/regime/session/BUY-SELL are in `validation/p6_results.json`.

**Observed, unmodified facts, reported as-is (no tuning applied because
of these numbers):**
- 30m's full-window cumulative R is **negative** (-9.3R) — reported
  honestly, not hidden or excluded.
- 30m's `MR` model closed 0/8 PASS (0%) — reported honestly.
- 30m's `RANGE` regime closed 0/9 PASS (0%) — reported honestly.
- 30m had a 15-signal FAIL streak — reported honestly.
- 15m's full-window result is positive (+19.67R, 32.9% PASS) — also
  reported as-is; this is the "MOST favorable" of the three, and is
  presented with equal weight, not elevated, per the anti-cherry-picking
  rule in the P6 spec.

**Interpretation (explicitly separated from fact):** the three
timeframes do **not** show a consistent sign of expectancy across their
respective (different-length, non-overlapping-in-methodology) windows —
30m negative, 15m and 5m marginally-to-clearly positive. Given the
data-availability limitation above (no true predeclared OOS split was
possible), this spread cannot be interpreted as "OOS confirms/refutes
the system" — it is only evidence that results are **not uniform across
timeframes and full-window periods observed**, which is itself a
legitimate, reportable finding.

## Model / regime / session / BUY-SELL breakdowns

Full detail in `validation/p6_results.json`. Sample-size labels
(`VERY LIMITED SAMPLE` <20, `LIMITED SAMPLE` 20–49, `MODERATE SAMPLE`
50–99, `LARGER SAMPLE` ≥100) are descriptive of evidence quantity only —
never a performance grade. At the observed sample sizes, `TC` and `PB`
are `VERY LIMITED SAMPLE` (0–1 total occurrences on most timeframes,
because the frozen regime-eligibility matrix + all the P3 gates
correctly and rarely qualify them in this window) or entirely
unobserved; `SR` is the only `LARGER SAMPLE` model (42–91 occurrences
depending on timeframe). No model was disabled, favored, or excluded
because of these figures.

## Drawdown, streaks, sparsity (n=30 recent-signal illustration only)

| Timeframe | n | PASS rate | Mean R | Cum R | Profit factor | Max DD (R) | Max fail streak |
|---|---|---|---|---|---|---|---|
| 5m | 30 | 33.3% | 0.275 | 8.26 | 1.413 | 5.0 | 4 |
| 15m | 30 | 36.7% | 0.421 | 12.62 | 1.664 | 7.0 | 5 |
| 30m | 30 | 26.7% | 0.033 | 1.0 | 1.045 | 7.0 | 7 |

**These are the 30 most-recent signals only** (the maximum the frozen
contract's own recent-signals display exposes), not the full closed
population. They are a real, unmodified calculation, but a small and
recency-biased one — treat as illustration, not as "the" result.

Sparsity (full-window): 5m ≈ 10.6 signals/1000 bars, 15m ≈ 13.5/1000,
30m ≈ 14.4/1000 — consistent with an intentionally selective,
"good-entry-only" system, not a defect.

## Leakage / lookahead / repaint audit (fresh P6-level re-check)

- All four `request.security()` calls use `lookahead = barmerge.lookahead_off`
  explicitly; none use `lookahead_on`. Grep-confirmed fresh in this
  phase, not assumed from memory.
- No negative array/series index offsets anywhere in the file.
- Signal creation remains gated by `confirmedBar and finalTradeApproved`
  (unchanged, source-audited).
- Outcome evaluation remains gated by `bar_index > rec.signalBarIndex`
  (unchanged, source-audited) — the signal bar can never resolve itself.
- Same-bar SL+target ambiguity remains `isPass = targetHit and not slHit`
  (unchanged, source-audited) — always resolves conservative FAIL.
- All 72 existing P2/P5 chronology and non-repaint tests re-run fresh in
  this phase: 72/72 pass.
- **No genuine leakage, repaint, or lookahead defect was found.**

## Reload / prefix-stability test (real, not simulated)

The indicator was removed (0 studies confirmed) and freshly re-added
(full `var`-state reset, new entity ID each time) independently for 5m,
15m, and 30m, against the exact same already-loaded bar buffer. Every
fresh reload reproduced **numerically identical** full-window results to
the prior reading — including readings taken in the separate, earlier
P4B/P5 development sessions for 5m (54/14/40) and 15m (70/23/47). No
terminal PASS ever became FAIL or vice versa across any reload. This is
real, positive, empirical evidence of deterministic, non-repainting
behavior — not a claim, a repeated observation.

## Perturbation tests

- **Window-start perturbation:** not independently perturbed in this
  pass beyond the natural window-start differences already present
  across the three timeframes' different backfill ceilings (24.5 / 78.5
  / 258.5 days) — which themselves function as three different
  window-start observations, with materially different results (30m
  negative, 15m/5m positive), already reported above as a finding, not
  smoothed over.
- **Warm-up sensitivity:** not independently tested; the frozen
  regime/structure engine's own warm-up behavior (EMA/ADX/ATR lookback
  periods) is unchanged from prior phases and was not re-parameterized.
- **Truncation/prefix test:** performed via the reload/prefix-stability
  test above — confirmed no rewriting of earlier decisions.
- **Missing-bar handling:** not independently verified bar-by-bar in
  this pass (see Limitations). OANDA forex feeds have expected
  weekend/holiday session gaps; no attempt was made to distinguish
  expected gaps from genuine defects.

## Strategy Tester cross-check

The frozen strategy (`pine/XAUUSD_Adaptive_Master_Strategy.pine`,
byte-for-byte parity with the indicator's decision logic, enforced by
`tests/pine_p5_strategy_parity.test.js`) was **not** re-attached to the
live chart in P6 (compile-only re-verification: 0 errors/warnings/issues,
confirmed this phase). Documented, unchanged from P5: `pyramiding=0`
means TradingView's Strategy Tester broker emulator can hold at most one
open position at a time, while the P5 custom recorder can track multiple
concurrent OPEN signals if the frozen engine produces them. This is a
disclosed difference, not a defect — the P5 recorder remains the sole
authoritative PASS/FAIL source of truth; Strategy Tester was not used as
a second source of truth in this phase.

## Real TradingView validation (this phase)

| Timeframe | Runtime | Contract table | MCP master state | P5 stats table |
|---|---|---|---|---|
| 5m | not failed | unambiguous (1 contract table) | `status: OK` | renders correctly |
| 15m | not failed | unambiguous (1 contract table) | `status: OK` | renders correctly |
| 30m | not failed | unambiguous (1 contract table) | `status: OK` | renders correctly |

No broker order was placed. No trade execution was connected. Exactly
one healthy `XAUUSD Adaptive Master` instance was present at every
timeframe (verified via `chart_get_state`). Final chart state restored
to `OANDA:XAUUSD`, `15m`, chart type `1`, 1 study.

## MCP regression (re-confirmed this phase)

Research profile: **13 tools** (verified by direct import). Development
profile: **18 tools** (13 + 5). Exact study identity, no first-match
fallback, multi-table ambiguity fail-closed, strict `BAR_CONFIRMED`
(only exact trimmed `"1"`), directional price-geometry validation, WAIT
handling, and no-fabrication were all re-verified live and via the
existing P4A/P4B automated test suites — unchanged.

## Full regression (this phase)

- `test:unit`: **738/738 passing** (693 P5 baseline + 45 new P6 tests).
- Indicator compile: 0 errors, 0 warnings. Analyzer: 0 issues.
- Strategy compile: 0 errors, 0 warnings. Analyzer: 0 issues.
- ESLint: 0 errors, 4 pre-existing documented warnings.
- Indicator SHA-256: `6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6` — **identical** to the P5 freeze.
- Strategy SHA-256: `947b6852d3ae60fc236854c0b6604b7af15f355a58340d5b5eca79db37797911` — **identical** to the P5 freeze.

## P6 continuation — expanded OOS-mechanism investigation

A follow-up P6 continuation performed an exhaustive, multi-method audit
of every candidate mechanism that might allow a genuine, computation-
restricted chronological IS/OOS split for the frozen engine, specifically
to determine whether the limitation above could be resolved without
modifying frozen Pine or building a second detector. Findings:

**A. Visible-range controls.** `chart_set_visible_range` and
`chart_scroll_to_date` were re-confirmed viewport-only: setting a
visible-range `to` timestamp in the past did not change the underlying
`mainSeries().bars()` buffer's last bar (it remained at the live "now"
bar). Neither control restricts what the Pine runtime computes over.

**B. TradingView Bar Replay.** Bar Replay is genuinely
computation-limiting when it can be started: a controlled experiment
entered replay at a historical cutoff on the Daily timeframe, removed
the existing indicator, and added a completely fresh instance while
replay was active. The resulting authoritative contract table showed
`BAR_INDEX`/`BAR_TIME` pinned to the replay cursor and
`P5_LAST_SIGNAL_TIME` dated well before the cutoff, with zero signals
after it — direct proof that future bars were genuinely unavailable to
the fresh Pine instance, not merely hidden from view. However, Bar
Replay could not be started at all on 5m, 15m, 30m, 60m, or 240m for
`OANDA:XAUUSD` (tested with multiple candidate dates on each), and the
same failure reproduced on a different symbol (`NASDAQ:AAPL`) at 15m,
showing the restriction is general to intraday resolutions in this
account/session rather than specific to this symbol or feed. The
Strategy Tester panel visibly displayed "Current plan: Basic" with an
adjacent upgrade prompt at the time of testing, which is consistent with
an account/plan-tier limitation on intraday replay — this is reported as
an observed correlation in the tested environment, not a general,
certain claim about TradingView's product tiers.

**C. Strategy Tester "Testing period" (backtest date-range) control.**
This native control (`Available chart range` / preset day ranges /
`Entire history` / `Custom date range`) is present in the UI. Every
tested activation method — precise CDP mouse clicks at DOM-verified
exact button centers, direct JS `.click()` dispatch on the confirmed
non-disabled button element, and keyboard focus-navigation with Enter
and Space — produced no change to the displayed range or to the
strategy's computed metrics (`total_trades` stayed fixed throughout,
including for the plain "Last 30 days" preset, not just the custom-range
sub-flow). This rules out a picker-specific quirk. The control's
non-responsiveness in this session is consistent with the same
environment/account limitation observed in (B), though this was not
independently proven with a paywall dialog and is reported as an
observation, not a certain conclusion.

**D. Authoritative individual-record extraction.** The frozen contract's
P5 recent-signals table is hard-capped at 30 most-recent individually
timestamped records by the frozen `p5RecentSignalsCount` input's
`maxval = 30` (confirmed by reading, not modifying, the frozen source).
The internal `recentHistory` array can hold more (bounded by
`p5MaxTrackedSignals`, default 300, no `maxval`), but nothing in the
frozen contract exposes those additional internally-retained records
externally — there is no per-signal label/marker and no pagination
input. Only the 30 most recent records were ever externally extractable.

**E. Conclusion.** No mechanism survived this investigation as both (i)
genuinely computation-restricting and (ii) available at the required
5m/15m/30m timeframes without modifying frozen Pine or building a
parallel detector. True chronological IS/OOS therefore remains
unavailable, on stronger and more directly-demonstrated evidence than
the original P6 pass. No boundary was ever fabricated, and full-window
results were re-confirmed bit-for-bit identical (5m=54/14/40,
15m=70/23/47, 30m=121/30/91) via fresh clean reloads at all three
timeframes during this continuation.

## Limitations (complete list, nothing hidden)

1. No predeclared chronological IS/OOS split was possible at the
   individual-signal level with current tooling (see the top of this
   document and "P6 continuation" above) — the single largest limitation
   of this phase.
2. Bootstrap resampling was not performed (sample too small/biased to
   responsibly resample).
3. Model/regime breakdowns for `TC`/`PB` are `VERY LIMITED SAMPLE`
   (0–1 occurrences) — no confident conclusion can be drawn about them.
4. Gap/duplicate-bar detection was not performed bar-by-bar across the
   full loaded ranges (5,096–8,409 bars) in this pass.
5. Window-start and warm-up sensitivity were not independently
   perturbation-tested beyond the three timeframes' naturally different
   backfill windows.
6. The 5m/15m/30m full-window results come from three **different,
   non-overlapping-length** historical windows (24.5 / 78.5 / 258.5
   days) determined by TradingView's own backfill ceiling, not by a
   uniform, researcher-chosen window — this is disclosed, not corrected
   for, since doing so would require discarding real, legitimately
   available data.
7. The strategy was briefly attached to the live chart during the P6
   continuation solely to investigate the native Testing-period control
   (see "P6 continuation" above), with no broker execution; no fresh
   Strategy-Tester-vs-recorder timing/PASS-FAIL comparison was performed
   (P5's architectural comparison stands unchanged).

## Testing

- `tests/pine_p6_validation_metrics.test.js` (28 tests) — deterministic,
  synthetic-fixture proof of the measurement arithmetic itself (Wilson
  interval, mean/median/cumulative R, profit factor, drawdown, streaks,
  percentiles, grouping, sample-size labels, seeded bootstrap). A weak or
  negative real trading result can never fail these tests — they test
  correctness of calculation, not profitability.
- `tests/pine_p6_regression_audit.test.js` (17 tests) — frozen-hash
  identity, `CONTRACT_VERSION`/`INDICATOR_VERSION` unchanged, no
  contract-table ambiguity, and internal consistency of the
  `validation/p6_manifest.json`/`p6_results.json` artifacts (every
  model/regime/session/BUY-SELL breakdown is cross-checked to sum
  exactly to each timeframe's total signal count).
