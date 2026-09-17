# Pine P7 — Controlled Robustness-First Research

**P7 is a research/optimization phase, not an OOS validation phase.**
Every figure in this document is DEVELOPMENT/RESEARCH performance,
measured on the same non-OOS full-window history already used and
disclosed in P6 (`VALIDATION LIMITED`). Nothing here is OOS, future
performance, production validation, or a probability of winning.

The frozen indicator source (`pine/XAUUSD_Adaptive_Master.pine`,
SHA-256 `6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6`)
was **never modified**. Every P7 candidate is a live Pine **input**
override applied to that exact unmodified script (via
`indicator set --inputs`, TradingView's own input-reconfiguration
mechanism), read through the unmodified production MCP functions. No
second detector was built; every signal came from Pine.

## Parameter audit

Full inventory and selection rationale: `docs/PINE_P7_PARAMETER_AUDIT.md`.
5 of 59 total inputs were selected as genuine, independent, low-blast-
radius trading-decision parameters: `qualityThreshold`, `minRR`,
`overextendAtrMult`, `corrResolveConfirmBars`, `boMaxEntryLateBars`.

## Search design

- Baseline snapshot and predeclared candidate ranges:
  `validation/p7_baseline_parameters.json` (written before any candidate
  was run).
- One-factor sensitivity: each of the 5 parameters tested at 2 candidate
  values around baseline, on 15m (chosen as the primary sensitivity
  timeframe for its balanced, positive baseline sample — see rationale
  in the baseline-parameters file).
- Combination search: a small, predeclared set of 4 combinations plus 2
  neighborhood-robustness spot-checks (6 total), built only from the
  most promising single factors — never a blind sweep.
- Full candidate ledger, including losing candidates: `validation/p7_candidates.json`.

## One-factor sensitivity (15m, full results in the ledger)

| Parameter | Baseline | Low candidate | High candidate | Sensitivity observation |
|---|---|---|---|---|
| `qualityThreshold` | 65 → 70 sig, cumR 19.67 | 60 → 78 sig, cumR 22.8 | 70 → 51 sig, cumR 21.0 | Monotonic signal count as expected; both directions modestly beat baseline cumR — baseline is not a sharp local optimum |
| `minRR` | 1.5 → 70 sig, cumR 19.67 | 1.3 → 72 sig, cumR 17.67 (worse) | 1.8 → 60 sig, cumR 26.63 (strong) | Clear asymmetric sensitivity: loosening hurts, tightening helps substantially |
| `overextendAtrMult` | 2.5 → 70 sig, cumR 19.67 | 2.0 → 65 sig, cumR 21.63 | 3.0 → 71 sig, cumR 21.67 | Low sensitivity, no cliff; both neighbors mildly better than baseline |
| `corrResolveConfirmBars` | 2 → 70 sig, cumR 19.67 | 1 → 73 sig, cumR 16.67 (worse) | 3 → 67 sig, cumR 22.67 (better) | Clear, coherent sensitivity: more confirmation → fewer false starts |
| `boMaxEntryLateBars` | 10 → 70 sig, cumR 19.67 | 7 → identical to baseline | 13 → 71 sig, cumR 18.67 (slightly worse) | Low sensitivity, isolated to BO only |

No parameter showed a fragile cliff (a single isolated spike surrounded
by poor neighbors); the two most promising (`minRR`, `corrResolveConfirmBars`)
both showed smooth, directionally coherent sensitivity.

## Combination search and neighborhood robustness

6 combinations tested (`C1`–`C4`, `N1`, `N2` in the ledger). Key finding:
combining `minRR=1.8` with `qualityThreshold=70` (`C2`) **degraded**
performance below baseline (cumR 13.0 vs 19.67, max fail streak 8 vs 5)
despite both factors independently looking positive — a clear
non-additive interaction, reported honestly rather than discarded.
The `minRR`/`corrResolveConfirmBars` neighborhood (`C1`, `C3`, `N1`,
`N2`, `C4`) was consistently strong (cumR 25.7–28.6 across five nearby
configurations), indicating a genuinely robust region rather than an
isolated spike.

## Cross-timeframe validation of the narrowed candidate

The single most promising 15m-only candidate (`N1`: `minRR=1.7`,
`corrResolveConfirmBars=3`, `qualityThreshold=60`) was tested on 5m and
**failed** cross-timeframe robustness: it turned 5m's already-marginal
P6 baseline (+0.26R) negative (-2.74R). Investigating the cause (the
`qualityThreshold=60` loosening admitting three additional signals on
5m that all resolved FAIL), a refined candidate (`C4`) was formed by
removing only that component:

**P7 RESEARCH CANDIDATE = `minRR: 1.7`, `corrResolveConfirmBars: 3`,
all other parameters unchanged from the P6 baseline.**

| TF | Config | Signals | PASS | FAIL | OPEN | PASS_RATE | Mean R | Cum R | Sample retention |
|---|---|---|---|---|---|---|---|---|---|
| 5m | P6 | 54 | 14 | 40 | 0 | 25.9% | 0.005 | +0.26 | 100% |
| 5m | P7 | 50 | 13 | 37 | 0 | 26.0% | 0.01 | +0.26 | 92.6% |
| 15m | P6 | 70 | 23 | 47 | 0 | 32.9% | 0.281 | +19.67 | 100% |
| 15m | P7 | 60 | 22 | 37 | 1 | 37.3% | 0.47 | +27.63 | 84.3% |
| 30m | P6 | 121 | 30 | 91 | 0 | 24.8% | -0.077 | -9.30 | 100% |
| 30m | P7 | 106 | 26 | 80 | 0 | 24.5% | -0.09 | -9.30 | 87.6% |

**Reproducibility**: confirmed via an independent fresh remove/re-add
cycle — the 15m result reproduced exactly (60/22/37/1 open, cumR 27.63).

## Interpretation — FACT / INTERPRETATION / LIMITATION

**FACT**: 15m cumulative R and mean R improved materially (+19.67→+27.63,
+0.281→+0.47) with a 15.7% sample reduction and no session/regime/model
concentration. 5m and 30m are statistically unchanged (identical
cumulative R to two decimal places / exactly). No timeframe got worse.

**INTERPRETATION**: the improvement appears concentrated on 15m rather
than broad-based across all timeframes — this is a real, disclosed
trade-off, not a universal win. 30m's already-negative P6 baseline was
not fixed by this candidate; that remains an open architectural
observation for whoever reviews P6/P7, not something P7 attempted to
paper over by excluding 30m.

**LIMITATION**: this is DEVELOPMENT/RESEARCH data on the same
already-seen full-window history as P6 — no genuine OOS baseline exists
to confirm this improvement would persist. See
`docs/PINE_P7_OVERFITTING_RISK.md` for the complete disclosure register.

## Model / regime / session / BUY-SELL analysis (selected candidate, 15m)

Full breakdown in `validation/p7_results.json`. TC/PB remain
`VERY LIMITED SAMPLE` (unaffected by these parameter changes in any
meaningful way — 0-1 occurrences under every tested configuration; no
architectural conclusion drawn per Phase 9's BUG/DESIGN/MARKET-SAMPLE
distinction, since gate logic and priority order were read and confirmed
unchanged). BO's sample shrank slightly (9→8) and its own PASS rate
fell (22.2%→14.3%) — disclosed, not hidden; BO's sample is too small for
a confident conclusion either way. MR and SR both improved. No regime
or session got worse; COMPRESSION and LONDON were exactly unchanged.
BUY/SELL asymmetry did not worsen (36.0% vs 37.1%, closer to parity than
the P6 baseline's 30.0% vs 35.0%).

## Chronology / non-repaint re-audit

No frozen file was touched, so the P6 audit stands unchanged:
`lookahead_off` on all `request.security()` calls, confirmed-bar
authorization, next-bar-only outcome resolution, conservative same-bar
ambiguity, immutable signal snapshot — all re-confirmed present in the
unmodified source. No candidate could have introduced leakage because no
candidate changed any code, only input *values* already exposed by the
frozen script's own `input.*()` declarations.

## MCP / contract

Unchanged: Research profile 13 tools, Development profile 18 tools.
`CONTRACT_VERSION` remains 1 (no wire-format change — parameter values
are not part of the contract schema). `INDICATOR_VERSION` remains
`0.4.0` (no version bump — the frozen `.pine` file itself was never
edited; the "candidate" exists only as a documented input-configuration
that can be applied to the same unmodified script).

## Regression

738/738 tests passing (unchanged — no source files were modified, only
new P7 documentation/validation/test files were added). Indicator and
strategy: 0 compile errors/warnings, 0 analyzer issues. ESLint: 0 errors,
4 pre-existing documented warnings. Both Pine hashes remain byte-identical
to the P6/P5 freeze.

## Real TradingView validation

All 16 candidates were measured directly on the live TradingView
Desktop/CDP connection against `OANDA:XAUUSD`, not simulated. The
selected candidate was independently verified on 5m, 15m, and 30m, with
a fresh remove/re-add reproducibility check on 15m. No broker orders
were placed; no execution was connected. Final chart state restored to
`OANDA:XAUUSD`, 15m, exactly one healthy indicator instance running the
**frozen P6 baseline inputs** (not the unreviewed research candidate —
see Repository Policy).

## Limitations

**NO GENUINE OOS BASELINE EXISTS.** This is the single most important
limitation carried forward from P6 and applying with full force to every
number in this document. All P7 results are development/research
results on already-seen historical data. See
`docs/PINE_P7_OVERFITTING_RISK.md` for the complete disclosure register,
including sample-size caveats for TC/PB/BO and the timeframe-window
asymmetry inherited from P6.

## Repository policy

P7 was not committed. The frozen `.pine` files were never modified — the
research candidate is fully specified as a documented input-parameter
delta (`validation/p7_results.json`) that can be reproduced against the
exact same frozen script, not as a new committed source file. The live
TradingView chart was restored to the frozen P6 baseline input
configuration before finishing this phase.
