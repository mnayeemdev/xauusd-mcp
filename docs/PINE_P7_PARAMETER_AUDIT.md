# P7 — Tunable Parameter Surface Audit

Full inventory of every `input.*()` declaration in the frozen P6 indicator
(`pine/XAUUSD_Adaptive_Master.pine`, SHA-256
`6c4dbba9105db1f75a07682408a8d91f34929d594cf8ddf7eaaea0defa57d3b6`), read
from the frozen source without modification. 59 inputs total. Each is
mapped to its `indicator set --inputs` positional index (`in_N`, 0-based,
in textual declaration order) for reproducible reference.

## Full inventory

| # | in_N | Name | Value | Category | Trading candidate? |
|---|---|---|---|---|---|
| 1 | in_0 | debugMode | false | I. Display/Debug | No |
| 2 | in_1 | persistenceBars | 3 | B. Regime | No (architectural) |
| 3 | in_2 | emaFastLen | 20 | B. Regime | No |
| 4 | in_3 | emaSlowLen | 50 | B. Regime | No |
| 5 | in_4 | emaSlopeLookback | 5 | B. Regime | No |
| 6 | in_5 | adxDiLen | 14 | B. Regime | No |
| 7 | in_6 | adxSmoothing | 14 | B. Regime | No |
| 8 | in_7 | adxTrendThreshold | 20.0 | B. Regime | No |
| 9 | in_8 | atrLen | 14 | B. Regime | No |
| 10 | in_9 | atrAvgLen | 100 | B. Regime | No |
| 11 | in_10 | highVolMultiplier | 1.5 | B. Regime | No |
| 12 | in_11 | bbLen | 20 | B. Regime | No |
| 13 | in_12 | bbMult | 2.0 | B. Regime | No |
| 14 | in_13 | bbWidthAvgLen | 100 | B. Regime | No |
| 15 | in_14 | compressionRatioMax | 0.6 | B. Regime | No |
| 16 | in_15 | diBalanceThreshold | 6.0 | B. Regime | No |
| 17 | in_16 | transitionLookback | 5 | B. Regime | No |
| 18 | in_17 | flipLookback | 10 | B. Regime | No |
| 19 | in_18 | flipCountThreshold | 4 | B. Regime | No |
| 20 | in_19 | htfTimeframe | "60" | A. Market/Context | No |
| 21 | in_20 | swingLookback | 20 | D. Correction | No |
| 22 | in_21 | corrAtrMultiplier | 1.2 | D. Correction | No |
| 23 | in_22 | corrMomentumLookback | 3 | D. Correction | No |
| 24 | in_23 | corrResolveConfirmBars | 2 | D. Correction | **Yes — selected** |
| 25 | in_24 | asiaStartUtc | 0 | A. Market/Context | No |
| 26 | in_25 | londonStartUtc | 8 | A. Market/Context | No |
| 27 | in_26 | nyStartUtc | 13 | A. Market/Context | No |
| 28 | in_27 | otherStartUtc | 21 | A. Market/Context | No |
| 29 | in_28 | pivotLeftBars | 5 | C. Structure | No |
| 30 | in_29 | pivotRightBars | 5 | C. Structure | No |
| 31 | in_30 | swingEqAtrMult | 0.1 | C. Structure | No |
| 32 | in_31 | displacementAtrMult | 1.5 | C. Structure | No |
| 33 | in_32 | displacementBodyRatioMin | 0.6 | C. Structure | No |
| 34 | in_33 | displacementCloseLocMin | 0.7 | C. Structure | No |
| 35 | in_34 | rangeAnchorPersistBars | 5 | C. Structure | No |
| 36 | in_35 | maxActiveLevels | 3 | C. Structure | No |
| 37 | in_36 | tcSetupLookback | 10 | E. Model (TC) | No |
| 38 | in_37 | pbSetupLookback | 10 | E. Model (PB) | No |
| 39 | in_38 | boRetestAtrTol | 0.3 | E. Model (BO) | No |
| 40 | in_39 | boRetestMaxBars | 15 | E. Model (BO) | No |
| 41 | in_40 | mrBoundaryAtrTol | 0.5 | E. Model (MR) | No |
| 42 | in_41 | mrDisplacementBlockBars | 2 | E. Model (MR) | No |
| 43 | in_42 | overextendAtrMult | 2.5 | H. Late/Overextension | **Yes — selected** |
| 44 | in_43 | tcMaxEntryLateBars | 5 | H. Late/Overextension (TC) | No |
| 45 | in_44 | pbMaxEntryLateBars | 5 | H. Late/Overextension (PB) | No |
| 46 | in_45 | boMaxEntryLateBars | 10 | H. Late/Overextension (BO) | **Yes — selected** |
| 47 | in_46 | slAtrBuffer | 0.25 | G. RR/Risk | No |
| 48 | in_47 | slAtrFallback | 1.5 | G. RR/Risk | No |
| 49 | in_48 | tp1RMultiple | 1.0 | G. RR/Risk | No |
| 50 | in_49 | tp2RMultipleDefault | 2.0 | G. RR/Risk | No |
| 51 | in_50 | tp2RMultipleCap | 3.0 | G. RR/Risk | No |
| 52 | in_51 | minRR | 1.5 | G. RR/Risk | **Yes — selected** |
| 53 | in_52 | qualityThreshold | 65 | F. Quality | **Yes — selected** |
| 54 | in_53 | newsSuppressed | false | A. Market/Context (manual safety) | No |
| 55 | in_54 | p5MaxTrackedSignals | 300 | J. P5 Recorder/Resource | No |
| 56 | in_55 | p5MaxOpenSignals | 500 | J. P5 Recorder/Resource | No |
| 57 | in_56 | p5ShowStatsTable | true | I. Display/Debug | No |
| 58 | in_57 | p5ShowRecentSignals | false | I. Display/Debug | No |
| 59 | in_58 | p5RecentSignalsCount | 10 | J. P5 Recorder/Resource | No |

## Selected optimization subset (5 parameters)

Chosen because each is directly named as a legitimate P7 research target
in the phase spec (quality gate, RR gate, overextension gate,
correction-confirmation gate, model-specific late-entry gate), each maps
to a single, independent, well-understood gate rather than a cluster of
correlated regime/structure constants, and together they touch every one
of the five "prefer" categories the spec lists (entry confirmation,
entry quality, correction completion, late-entry rejection, RR
acceptance).

| Parameter | in_N | Baseline | Candidates | Purpose | Models affected | Regimes affected | Alters signal frequency? | Affects entry? | Affects SL/TP? | Overfitting risk |
|---|---|---|---|---|---|---|---|---|---|---|
| `qualityThreshold` | in_52 | 65 | 60, 70 | Minimum composite quality score required to authorize any signal | All (TC/PB/BO/MR/SR) | All | Yes — direct filter | No (gates authorization only) | No | Medium — single global scalar, easy to overfit toward one metric; mitigated by requiring effect across all 3 timeframes |
| `minRR` | in_51 | 1.5 | 1.3, 1.8 | Minimum acceptable reward:risk before a signal is authorized | All | All | Yes | No | No (filters after SL/TP computed) | Medium — same reasoning as above |
| `overextendAtrMult` | in_42 | 2.5 | 2.0, 3.0 | ATR-multiple distance from reference level beyond which entry is rejected as overextended/late | All | All | Yes | Yes (blocks entry, doesn't move it) | No | Low-medium — directly implements "DO NOT CHASE"; a stricter value should mechanically remove only the most-extended entries |
| `corrResolveConfirmBars` | in_23 | 2 | 1, 3 | Number of confirmed bars required before a correction is considered resolved | Correction-gated models (blocks entries while `CORRECTION_STATE != NONE`) | All | Yes | Indirectly (timing) | No | Medium — directly implements "CONFIRMATION NOT COMPLETE → WAIT"; a lower value legitimately trades earlier-but-less-confirmed entries |
| `boMaxEntryLateBars` | in_45 | 10 | 7, 13 | Max bars allowed between BO breakout and retest/reclaim before the entry is rejected as late | BO only | All | Yes (BO signals only) | Yes (blocks entry) | No | Low — model-specific, isolated blast radius (BO is the second-largest sample after SR on 30m/5m) |

## Excluded parameters — rationale (by category)

- **B. Regime (17 params)**: define the regime classifier itself
  (BULL_TREND/BEAR_TREND/RANGE/COMPRESSION/TRANSITION/HIGH_VOLATILITY/
  CHOP_UNCERTAIN). Changing these would alter which regime every bar is
  labeled as, cascading into every downstream model-eligibility and
  quality calculation — far too broad a blast radius for a "small,
  defensible subset" (Phase 2) and squarely inside the P6 hard-freeze
  boundary's "REGIME ENGINE" item. Frozen.
- **C. Structure (8 params)**: define pivot/BOS/CHoCH/sweep/displacement/
  range detection — the shared geometric foundation every model and the
  correction engine depend on. Also explicitly named in the P6/P7 freeze
  boundary ("STRUCTURE ENGINE"). Frozen.
- **D. Correction (3 of 4 params excluded; `corrResolveConfirmBars`
  selected)**: `swingLookback`, `corrAtrMultiplier`,
  `corrMomentumLookback` define *whether* a correction is detected at
  all (a structural/regime-adjacent decision); only
  `corrResolveConfirmBars`, which governs *when a detected correction is
  considered resolved*, is a genuine confirmation-timing parameter in
  the spirit of Phase 15.
- **E. Model-specific setup lookbacks (6 params)**: `tcSetupLookback`,
  `pbSetupLookback`, `boRetestAtrTol`, `boRetestMaxBars`,
  `mrBoundaryAtrTol`, `mrDisplacementBlockBars` define *setup
  qualification* (whether a model's precondition exists at all), which
  is closer to structural/architectural behavior than to the
  confirmation/quality/RR gates Phase 2 asks P7 to prefer. Excluded to
  keep the research surface compact and non-redundant with
  `overextendAtrMult`/`boMaxEntryLateBars`, which already cover BO's
  late-entry dimension.
- **H. Late/overextension, TC/PB variants excluded**: `tcMaxEntryLateBars`
  and `pbMaxEntryLateBars` were excluded in favor of `boMaxEntryLateBars`
  because TC and PB have `VERY LIMITED SAMPLE` (0–1 occurrences) in the
  P6 full-window baseline on every timeframe — testing their late-entry
  gate would produce sample sizes too small to draw any conclusion from,
  and risks exactly the "3-trade 100% PASS rate" trap Phase 8 warns
  against. `overextendAtrMult` (model-agnostic) and
  `boMaxEntryLateBars` (BO has a real sample: 7–22 occurrences depending
  on timeframe) are kept instead.
- **G. RR/Risk, SL/TP-shape params excluded**: `slAtrBuffer`,
  `slAtrFallback`, `tp1RMultiple`, `tp2RMultipleDefault`,
  `tp2RMultipleCap` all change the *shape* of the SL/TP geometry itself,
  which would silently redefine what a PASS/FAIL/R-multiple even means
  for every future signal — this crosses into P6/P7's frozen "ENTRY
  PRICE / INITIAL SL / TP1 / TP2" boundary. Only `minRR`, a pure
  post-hoc acceptance filter that does not alter SL/TP geometry, is
  selected.
- **A. Market/Context (7 params)**: session-hour boundaries and HTF
  timeframe placeholder are architectural/definitional, not decision
  thresholds; changing them would redefine what "LONDON session" or
  "HTF" *means* rather than tune a decision. Frozen per Phase 20
  (session robustness: "preserve all existing sessions" is the default).
  `newsSuppressed` is a manual safety toggle, not a market parameter.
- **I. Display/Debug (4 params)**: `debugMode`, `p5ShowStatsTable`,
  `p5ShowRecentSignals` — pure visualization, explicitly excluded by the
  P7 mandate itself.
- **J. P5 Recorder/Resource (3 params)**: `p5MaxTrackedSignals`,
  `p5MaxOpenSignals`, `p5RecentSignalsCount` — storage/display capacities
  for the outcome recorder, not trading parameters. Explicitly excluded
  by the P7 mandate itself, and touching them would risk exactly the
  kind of P5-recorder-semantic mutation both P6 and P7's hard-freeze
  boundary forbid.
