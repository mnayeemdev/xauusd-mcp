# XAUUSD_STRATEGY_V2_VALIDATION

Research only (2026-09-26). Frozen spec: `docs/XAUUSD_STRATEGY_V2_SPEC.md` (implementation sha256 `4fa5e069973d48d727797b66182632fcf00e1beb3a37512ebdb2f052ec1b8f6a`, unchanged through B and C). Results: `validation/strategy_redesign_v2/v2_results_{A,B,C}_famC.json` (per-signal records with timestamp, family, direction, market state, 5m structure, 15m/30m/1H structural context, trigger, confirmation, entry, stop, stop distance, objective, planned RR, MAE, MFE, exit reason, realized R, holding bars). Production untouched; no trade; no restart.

## Verdict

**V2_EDGE_NOT_DEMONSTRATED.** The frozen challenger (compression → expansion with acceptance) failed the pre-declared validation gate on region B and, reported after the fact for transparency only, was strongly negative on the untouched holdout C. The two other families were rejected on discovery.

## Phase 2–3: discovery (region A, 64 sessions; families evaluated jointly, then the survivor alone)

| Family | n | Win % | PF | Mean R | Median R | Total R | Max DD R | Loss streak | MAE / MFE R | Total ex top-1 / top-3 / top-5 | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| V2-A sweep + reclaim | 102 | 31.4 | 0.77 | −0.171 | −0.95 | −17.4 | 31.1 | 9 | 1.06 / 1.18 | −22.0 / −27.8 / −32.7 | REJECTED (negative both sides: SELL −0.05, BUY −0.31; 32 % emergency-stop exits) |
| V2-B BOS + retest | 22 | 31.8 | 1.24 | +0.271 | −1.25 | +6.0 | 13.9 | 7 | 1.97 / 2.57 | −7.8 / −18.9 / −23.8 | REJECTED (all profit in SELL n 13; BUY n 9 mean −1.63 R; negative without the largest winner) |
| V2-C compression → expansion (alone) | 27 | 51.9 | 2.10 | +0.374 | +0.06 | +10.1 | 3.8 | 5 | 0.73 / 1.20 | +8.2 / +4.4 / +0.7 | FROZEN as V2 |

V2-C discovery detail: 157 compression breaks, 122 rejected by RR < 1.7, 27 trades on 23 sessions; SELL n 18 mean +0.63 R (PF 4.1), BUY n 9 mean −0.13 R (PF 0.5); stop distances 5–20+ USD (median bucket 12–20); all planned RR in 1.7–2.0; exits: target 11, opposite-structure deterioration 8, time stop 3, emergency stop 3, invalidation close 2; bootstrap CI [−0.087, +0.845], P(mean ≤ 0) = 6.6 %; spread 0.40 with 0.15 slippage: mean +0.34 R. Profit protection variant: +0.369 vs +0.374, frozen OFF.

## Phase 5: validation (region B, 32 sessions), frozen rules unchanged

| Metric | V2 (frozen) | Pre-declared requirement | Result |
|---|---|---|---|
| Signals | 10 on 10 sessions (77 breaks, 65 RR-rejected) | n ≥ 12 | FAIL |
| Mean R | −0.087 (median −0.31) | > 0 | FAIL |
| 95 % CI | [−0.901, +0.727] (bootstrap [−0.805, +0.722], P(mean ≤ 0) = 58 %) | — | — |
| PF | 1.02 | ≥ 1.2 | FAIL |
| Total R ex top-3 winners | −5.6 | > 0 | FAIL |
| Max DD R / loss streak | 3.6 / 3 | DD ≤ 8 | pass (only criterion met) |
| By side | SELL n 8 mean −0.42 R (PF 0.54, 5 of 8 emergency stops); BUY n 2 mean +1.26 R | — | the discovery-side asymmetry reversed |
| By market state / session / stop / RR | all COMPRESSION by construction; NY n 5 −0.19, other n 5 +0.01; RR all 1.7–2.0 | — | — |
| Friction | spread 0.40: −0.09; plus 0.15 slippage: −0.13 | — | — |

**VALIDATION_GATE = FAIL.** No rule was modified after B. Rejected families on B for transparency: V2-A n 34 mean +0.05 R, PF 1.35 but −7.1 R without its top 3; V2-B n 16 mean −0.27 R, PF 0.65.

## Phase 6: final holdout C (33 sessions) — reported AFTER THE FACT for transparency only; it could not and did not change the decision

| Metric | V2 on C |
|---|---|
| Signals | 20 on 16 sessions (109 breaks, 82 RR-rejected) |
| Win rate | 10 % (2 of 20) |
| Mean R / median R | −0.532 / −0.80; 95 % CI [−0.865, −0.199]; bootstrap P(mean ≤ 0) = 99.8 % |
| PF | 0.17 |
| Total R | −10.6; ex top-1 −12.4; ex top-3 −13.2 |
| Max DD R / loss streak | 10.7 / 13 |
| Exits | opposite-structure deterioration 9, emergency stop 6, invalidation close 2, time stop 2, target 1 |
| Both sides negative | BUY n 11 −0.47 R, SELL n 9 −0.61 R |
| Friction | spread 0.40 + 0.15 slippage: −0.57 R |

All regions combined: 57 trades, mean −0.025 R, CI [−0.334, +0.285], PF 1.02, win rate 35 %, natural frequency 0.44 signals per session.

## Outlier, friction, bootstrap

Discovery was not outlier-dependent (still +0.7 R without the top five), which is why the family was frozen; validation and holdout were negative with or without outliers. Friction sensitivity was small in every region (the family's stops are 8–20 USD, so costs are a minor fraction of R). Bootstrap: A P(mean ≤ 0) 6.6 %, B 58 %, C 99.8 %.

## Control comparison (descriptive; signals never combined)

| | CONTROL (production intraday_5m) | V2 (frozen) |
|---|---|---|
| Frequency | 11.2 signals / session | 0.44 signals / session |
| A / B / C mean R | +0.056 / −0.168 / +0.050 | +0.374 / −0.087 / −0.532 |
| A / B / C PF | 1.22 / 0.71 / 1.11 | 2.10 / 1.02 / 0.17 |
| All-region mean R (CI) | +0.001 [−0.083, +0.086], n 1,406 | −0.025 [−0.334, +0.285], n 57 |
| Max DD R (sequential) | 87.1 | 10.7 (C alone) |
| Loss streak | 9 | 13 (C) |
| Outlier dependence | negative without top-5 in every region | not outlier-dependent, but no edge either |
| Friction sensitivity | high (−0.095 R at 0.40 spread + slippage) | low |

Neither strategy demonstrates credible expectancy. V2 is cleaner (structural stops, low cost sensitivity, no outlier dependence) but has no edge and a sample too small to be informative beyond "not positive".

## Why V2 failed (evidence-based attribution)

1. **Event premise (primary).** The discovery-only event study found no symmetric 5m event with predictive asymmetry; the only CI-excluding-zero effects were one-sided (bearish) and coincident with the period's bearish drift. Compression breaks had 9 usable events in the study; the strategy's ATR-contraction gate produced 27 discovery trades whose profit came from the short side during a falling tape. In B and C the same rules produced 30 trades with a 20 % win rate. The premise "compression → confirmed expansion → continuation" does not hold out of sample on this feed at 5m.
2. **Market-state instability.** Discovery edge tracked the discovery regime (SELL PF 4.1, BUY 0.5); when the tape changed the SELL side inverted (B: PF 0.54) and both sides failed (C).
3. **Structural geometry.** In B five of eight losses and in C six of twenty exits were emergency stops 0.5 ATR beyond the opposite box edge, and nine of twenty in C were opposite-structure deteriorations: expansions reversed back through the box rather than continuing.
4. **Sample insufficiency (contributing, not the cause).** 27 / 10 / 20 trades cannot establish an edge, but the holdout CI ([−0.87, −0.20]) is wide enough only to exclude a meaningful positive edge, not to leave it open.
5. Entry timing and exit behaviour were not the primary failure: MAE and MFE were symmetric (0.7–0.9 R) and the thesis exits behaved as designed.

## Next research direction (recommendation, no implementation)

The 5m XAUUSD event space has now been searched two ways (production models across 1,406 trades; structural events across 14,393 discovery bars) without finding a symmetric, out-of-sample edge. The next premise should change the timeframe of the event, not the rules on 5m: study 15m and 1H structural events (range-extreme sweeps, CHoCH, compression) with 5m used only for execution timing, on a multi-year dataset spanning both trending and ranging gold regimes, with the same A/B/C discipline; keep collecting live class-A outcomes from the unchanged production system; and treat MR-type sweep reversals in 15m ranges (the only condition positive in all three regions in the Master study) as the first candidate event, tested first as an event study before any rule is written.

SHADOW_V2_JUSTIFIED = NO. CAPITAL_SCALING_READY = NO. Production unchanged.
