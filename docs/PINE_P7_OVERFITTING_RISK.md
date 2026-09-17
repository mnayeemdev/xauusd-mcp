# P7 — Overfitting Risk Register

This document must remain visible whenever interpreting P7 results.

## Multiple-comparison inventory

- **Parameters inspected**: 5, out of 59 total tunable inputs (8.5% of the
  full surface) — see `docs/PINE_P7_PARAMETER_AUDIT.md` for why the other
  54 were excluded before any performance was read.
- **Candidate configurations tested**: 16 total (10 one-factor + 6
  combination/neighborhood), all recorded in `validation/p7_candidates.json`
  including losing candidates (e.g. `C2`, which underperformed baseline).
- **Timeframes evaluated for the finally-selected candidate**: 3 (5m, 15m,
  30m) — not just the one that looked best in initial one-factor testing.
- **Metrics inspected per candidate**: signals, PASS/FAIL/OPEN, PASS rate,
  cumulative R, mean R, max fail streak, and (for the selected candidate)
  full model/regime/session/BUY-SELL breakdown.

## Same-data reuse

Every candidate was measured against the **same historical bar range**
already used during P6 development and validation. There is no
independent, unseen data — this is the central, already-disclosed P6
limitation (`VALIDATION LIMITED`), and it applies with full force to every
P7 number. P7 does not and cannot claim otherwise.

## Small-sample risk

- TC and PB remain `VERY LIMITED SAMPLE` (0-1 occurrences) under every
  tested configuration on 15m — no candidate decision was based on their
  behavior, and none should be until a materially larger sample exists.
- BO's sample shrank further under the selected candidate (9→8 on 15m) —
  disclosed in `p7_results.json`, not hidden.
- The selected candidate's sample retention is 84-93% of the P6 baseline
  on every timeframe (never below the 50% floor defined in
  `validation/p7_baseline_parameters.json`), which mitigates but does not
  eliminate small-sample risk on the smaller-count models/regimes.

## Timeframe/window asymmetry

Unchanged from P6: the three timeframes' full-window histories still
span different, non-uniform date ranges (24.5 / 78.5 / 258.5 days)
determined by TradingView's own backfill ceiling, not a P7 choice. This
means the three timeframes are not being compared over the same
calendar period, which is a disclosed limitation inherited from P6, not
introduced by P7.

## Session/regime concentration

Checked explicitly for the selected candidate (see
`overfitting_indicators_checked` in `validation/p7_results.json`):
improvement was NOT concentrated in a single model, regime, or session.
COMPRESSION regime and LONDON session were statistically unchanged;
several other slices improved individually and modestly, not just one.

## Candidate selection bias

The selection process is fully disclosed, including its false starts:
one promising-looking 15m-only candidate (`N1`, quality=60 included) was
**rejected** after cross-timeframe testing revealed it made 5m's already-
marginal baseline (+0.26R) turn negative (-2.74R). The finally-selected
candidate (`C4`) specifically **excludes** the quality-threshold change
that caused that regression, precisely because of this finding — the
selection was falsifiable by the data, not steered toward a
predetermined outcome.

## Data-snooping discipline

The one-factor sensitivity phase deliberately used only 15m (the most
balanced baseline sample) before any combination search — 5m and 30m
were reserved as an unbiased cross-check applied only once to the single
finally-narrowed candidate, not used to cherry-pick among many
combinations.

## What this register does NOT claim

This document does not compute a numeric "overfitting score." Per the
P7 mandate, no black-box score was created. It is a disclosure checklist,
not a certification that overfitting is absent — genuine overfitting risk
remains inherent to any parameter research performed without a true OOS
dataset (see Limitations in `docs/PINE_P7.md`).
