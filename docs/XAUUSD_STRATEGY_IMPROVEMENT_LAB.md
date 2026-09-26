# XAUUSD_STRATEGY_IMPROVEMENT_LAB

**Mode:** research / offline replay / shadow design only (2026-09-26). Nothing in production was changed; no trade, no restart, no threshold edit. Research code and data live only under `validation/strategy_improvement_lab/` and are imported by nothing in `src/`.

**Question:** can a small, logically justified set of corrections turn the CURRENT intraday_5m strategy (classified EDGE_NOT_DEMONSTRATED in `XAUUSD_MASTER_EDGE_VALIDATION.md`) into one with positive, stable, out-of-sample expectancy without hidden tail risk?

**Answer in one line:** no. Two candidates survived the pre-declared discovery/validation rules (a reduced quality score and a PB sub-filter); their frozen combination improved the untouched holdout by +0.013 R per trade, within noise, still depends on five outlier winners, and turns negative under realistic friction. The evidence points to structural redesign, not small corrections.

Reproduce: `node validation/strategy_improvement_lab/lab_stage1.mjs` (gate-level replay, four exit stacks, two friction settings, discovery-only diagnostics) then `node validation/strategy_improvement_lab/lab_stage2.mjs` (frozen candidates → A/B selection → combos → holdout C → robustness). Per-signal appendix: `lab_dataset.json` (4,280 gate candidates with all requested fields and every simulated outcome).

---

## 1. Data, fidelity, regions

| Item | Value |
|---|---|
| Dataset | same as Master Edge Validation: MT5 XAUUSDm confirmed bars, 2026-04-29 09:00 → 2026-09-25 19:20 UTC, 129 sessions, 29,500 confirmed 5m candles |
| CONTROL | exact production `intraday_5m` functions (bias, 30m pipeline, 1H context, 5m models, risk, quality, combiner, protective stops, adaptive management), confirmed candles only, 80 s evaluation lag, no lookahead |
| Gate-level candidates recorded | 4,280 (every model candidate that passed the risk gate, including the 1,095 that CONTROL rejected on quality or a combiner veto) |
| CONTROL signals / completed | 3,185 signal bars → 1,447 distinct → 1,406 completed (41 refused by the effective-RR recheck) |
| Regions (whole sessions, chronological) | **A DISCOVERY** 64 sessions (to 2026-07-12) · **B VALIDATION** 32 sessions (2026-07-13 → 08-18) · **C FINAL HOLDOUT** 33 sessions (2026-08-19 → 09-25). C was not read until the combos were frozen. |
| Evidence classes | A (11 live signals, 10/11 reproduced) · B (this replay, PRIMARY) · C (candidates, never mixed into CONTROL) |
| Limitations | broker feed (XAUUSDm) not OANDA; News/Shock states unreconstructable; ENTRY_DRIFT/spread guards assumed to pass; single position, same-thesis folding like the live store |

CONTROL by region (production exits, 0.01 lot):

| Region | n | Win % | PF | Mean R | CI95 | Total R | Max DD R | Loss streak | Top-5 winners R | Total ex top-5 |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 722 | 52.8 | 1.22 | +0.056 | [−0.062, +0.173] | +40.2 | 43.9 | 8 | +46.7 | **−6.6** |
| B | 333 | 46.0 | 0.71 | −0.168 | [−0.317, −0.019] | −55.9 | 72.5 | 8 | +30.4 | −86.3 |
| C | 351 | 50.1 | 1.11 | +0.050 | [−0.139, +0.240] | +17.6 | 31.1 | 9 | +46.1 | −28.5 |
| All | 1,406 | 50.5 | 1.07 | +0.001 | [−0.083, +0.086] | +1.9 | 87.1 | 9 | +58.0 | **−56.1** |

Two facts that frame everything below: the validation region is significantly negative on its own, and in every region the strategy is net negative once its five largest winners are removed.

---

## 2. Candidate families (root cause on DISCOVERY only, then frozen)

### Family 1 — SR
Discovery n 58, PF 0.35, mean −0.438 R, CI entirely negative. Breakdown: SR **against the current 5m structure** n 21, PF 0.09, mean −0.849 R, win rate 19 % (CI [−1.19, −0.51]) versus SR with structure n 37, PF 0.63; SR admitted through the "fresh sweep at level" confirmation path n 8, PF 0.05; SR fired during 15m-lag episodes n 15, PF 0.09; both directions negative; all sessions negative; 85+ quality SR n 15, PF 0.17. **SR_ROOT_CAUSE:** the counter-structure allowance in `evaluateStructureRejection` (bias support or a fresh sweep at the level) admits rejection candles against the prevailing 5m structure; those trades almost always fail, and the aligned SR trades are themselves only break-even.

| Candidate | Definition | A Δmean R / Δtotal R | B Δmean R / Δtotal R | Pre-declared rule | Holdout C (after the fact) mean R vs CONTROL +0.050 |
|---|---|---|---|---|---|
| SR-A | block counter-structure SR | +0.028 / +18.8 | −0.002 / +0.9 | FAIL (B loss streak 11 > 9) | +0.049 |
| SR-B | SR only with 5m structure AND aligned bias | +0.035 / +22.1 | −0.011 / −1.5 | FAIL | +0.061 |
| SR-C | require a fresh sweep (≤ 3 bars) | +0.019 / +11.0 | +0.024 / +11.1 | FAIL (streak) | +0.067 |
| SR-D | disable SR (benchmark) | +0.042 / +24.7 | +0.007 / +7.0 | FAIL (streak) | +0.082 |

**SR_CANDIDATE_RESULT:** every SR candidate improves discovery, the effect in validation is 1–11 R over 32 sessions, and all failed the pre-declared loss-streak criterion (removing SR trades lengthened the validation losing sequence to 10–11). After the fact, the benchmark SR-D is the best holdout performer of the family (+0.032 R per trade over CONTROL) but SR is only 7.6 % of trades, so no SR change can carry the strategy: CONTROL without SR is still +0.098 / −0.161 / +0.082 R across A / B / C.

### Family 2 — Quality score
Discovery correlations of components with realized R: qStructure −0.045, qTrigger +0.043, qEntryLocation −0.055, qMomentum −0.028, qVolatility −0.058, qMtf +0.003, qSession −0.015, qRr −0.060. Inverted components with meaningful sample: **qEntryLocation** (below-mean n 284 mean +0.216 R, CI [+0.03, +0.40] versus above-mean n 438 mean −0.049 R, PF 0.90) and **qRr** (top tercile n 234 mean −0.094, PF 0.84 versus bottom tercile n 388 mean +0.136, PF 1.38). Pairwise component correlations are small (max |0.26|, qMtf~qRr), so double counting is not the issue. Quality 65–69 was the best bucket on discovery (n 46, PF 3.91) and 85+ the worst (n 146, PF 0.69); high-quality losses cluster in SR (PF 0.17) and PB (0.37) under a directional bias. **QUALITY_ROOT_CAUSE:** the score rewards proximity to the anchor and a large planned RR, both of which historically lose; it has no predictive ordering, so raising or lowering the threshold cannot help.

| Candidate | Definition (threshold calibrated on A only) | A Δ | B Δ | Rule | Holdout C |
|---|---|---|---|---|---|
| QUALITY-A | drop qEntryLocation, shift 8 | −0.008 / −5.7 | +0.001 / +0.5 | FAIL | +0.050 |
| QUALITY-B | cap qEntryLocation at 7.5, shift 2 | −0.014 / −10.2 | −0.010 / −2.9 | FAIL | +0.048 |
| QUALITY-C | qEntryLocation neutral (= 10.55), shift −2.5 | −0.008 / −5.7 | +0.001 / +0.5 | FAIL | +0.050 |
| QUALITY-D | reduced score (qTrigger + qMtf + qSession) / 40, threshold 64 | +0.002 / +0.8 | +0.022 / +8.5 | **PASS** | +0.056 |

**QUALITY_CANDIDATE_RESULT:** removing or capping the inverted component changes nothing (the admitted and removed trades net out); the reduced score passes the rule with a validation gain of 8.5 R and a holdout gain of +0.006 R per trade, which is noise. No quality reweighting creates ordering.

### Family 3 — 15m lag
Signals fired during lag episodes (bias direction against 5m structure): A n 36 mean −0.409 R (CI [−0.76, −0.06]); B n 19 mean −0.699 (CI [−1.05, −0.35]); C n 27 mean −0.257 (CI includes 0); all 82: PF 0.47, composed of PB 51 (PF 0.58) and SR 29 (PF 0.20). Signals suppressed by the lag, measured by the Master Edge variants that neutralize or reverse the bias: +28 trades at PF 1.09 (A) and +12 at PF 2.68 (B) over five months, i.e. small and not consistent. **15M_LAG_ROOT_CAUSE:** the problem is permitting bias-side trades against 5m structure (mostly SR counter-structure and PB), not suppressing reversals; neutralizing stale authority and reversing it are indeed different, and neither adds meaningful opportunity.

| Candidate | Definition | A Δ | B Δ | Rule | Holdout C |
|---|---|---|---|---|---|
| LAG-B (= LAG-C in effect, since every lag signal is bias-side) | block bias-side trades against 5m structure during lag; never authorize the opposite side | +0.024 / +14.7 | +0.030 / +12.2 | FAIL (B streak 10) | +0.076 |
| LAG-A | neutralize only after opposing 15m structure AND confirmed 5m flip (evaluated as Master variants A∧B) | ≤ +0.009 total | validation unchanged | not selected | — |

**15M_LAG_CANDIDATE_RESULT:** LAG-B is consistent in direction across A, B and C (+0.024 / +0.030 / +0.026 R per trade) but failed the pre-declared streak criterion; its effect (−82 trades, +35 R over 129 sessions) overlaps with SR-A and PB-A. It is the most defensible single filter found, and it still does not make B positive (−0.138 R).

### Family 4 — Exit loss inflation
All regions, 696 CONTROL losses: 509 exceed 1.0 R (73 %), 351 exceed 1.2 R, 252 exceed 1.5 R (all broker fail-safe at 1.5 × structural + spread), none exceed 2 R. Loss beyond 1 R totals 190.7 R against 630.3 R of unavoidable loss. THESIS_STOP_CLOSE latency between the stop touch and the confirmed close that triggers the exit: median 0 bars, mean 1.2, 90th percentile 3 (the adaptive manager acts on the same or next confirmed close; the overshoot is the close beyond the stop, not delay). Winners: mean MFE 2.34 R, mean realized 1.17 R, 47 % give back more than 1 R. **EXIT_LOSS_INFLATION_ROOT_CAUSE:** protective geometry by design (1.5 × fail-safe binds on sub-5 USD stops within 3.9 bars) plus close-based invalidation; not gaps, not slippage, not implementation.

| Candidate | Definition | A | B | C | Verdict |
|---|---|---|---|---|---|
| EXIT-C | broker fail-safe at 1.0 × structural + spread | +0.092 / PF 1.26 | −0.121 / 0.75 | **−0.012 / 1.01, loss streak 16** | FAIL (rule: streak; holdout worse) |
| EXIT-B | fail-safe at 1.25 × | +0.068 | −0.169 | +0.065 | FAIL (no B improvement) |
| EXIT-D | lock +0.25 R once MFE ≥ 1 R | −0.162 / 0.86 | −0.323 / 0.51 | −0.159 / 0.78 | FAIL badly: the +30 USD and profit-protect winners are the only source of profit |
| EXIT-A | earlier thesis invalidation | not testable: latency is already ≈ 0 bars; nothing earlier exists on confirmed data | | | rejected |

**EXIT_BEST_CANDIDATE / RESULT:** none. Tightening the fail-safe trades −1.57 R losses for more −1.07 R losses and removes the room that produces the large winners; the net is zero or negative out of sample.

### Family 5 — PB
Discovery n 108, PF 1.10, mean −0.025. Negative subtype: PB fired while the 5m regime is already trending in the trade direction n 40, PF 0.57, mean −0.293 R (late continuation); PB with 5–8 USD stops n 24, PF 0.42; resolved 1 bar ago n 23, PF 0.55 (non-monotonic across 0/1/2/3, so not a rule); New York PB n 40, PF 0.78 versus Asia 1.65 (no mechanism). **PB_FINDING:** PB-A (block PB when the 5m regime trends with the trade) passes the rule: A +0.013 / +7.2 R, B +0.011 / +8.0 R, C +0.017 / +4.4 R, consistent sign in all three regions; PB's contribution moves from −27.4 R to about −2 R; PB-C (disable) is similar (+0.014 / +0.042 / +0.025). Neither turns the strategy positive.

### Family 6 — MR
A n 23 mean +0.287 (PF 1.70); B n 14 +0.952 (3.85); C n 16 +0.379 (2.11); all 53: PF 2.31, mean +0.490, bootstrap CI [−0.024, +1.056], P(mean ≤ 0) = 3 %. Dependence: the largest winner is 26 % of the total, the top 3 are 70 %, **the top 5 are 102 %: without them MR's mean is −0.012 R**. BUY (n 18) and SELL (n 35), both range-bound 15m by construction, 30m RANGE (n 20, mean +0.91) better than 30m COMPRESSION (n 24, +0.15), London/New York better than Asia. **MR_EDGE_STABLE = INCONCLUSIVE**: positive in all three regions but entirely carried by five trades out of 53. Not promoted, not loosened.

### Family 7 — MC / BO
MC discovery n 103, PF 1.31: no monotonic dependence on ATR expansion (1.0–1.2 PF 1.86, 1.2–1.5 PF 0.69, ≥ 1.5 PF 4.67), bars since break, ADX or stop size; 1H COMPRESSION n 11 PF 0.14 and quality 85+ n 21 PF 0.68 are small. **MC_FINDING:** no causal rule with adequate sample; MC is positive in A (+0.105) and negative in B (−0.115) and C (about 0). BO discovery n 430, PF 1.32: stops floored to 0.5 ATR n 47 PF 0.59 (no genuine structural stop), < 3 USD stops PF 0.76, fresh breaks ≤ 2 bars PF 1.54 versus 1.22–1.24 later, level near range mid PF 2.01 versus behind mid 0.83 (n 39), 5m COMPRESSION PF 0.78, quality 85+ PF 0.89, large stops fine. **BO_FINDING:** BO-A (block floored stops) improves A (+0.012) but worsens B (−0.045) and only then improves C (+0.092): unstable, rejected; BO carries all of the strategy's gross profit (+39.7 R) and all of its dependence on the +30 USD monetary winners.

---

## 3. Selection, combinations, holdout

Pre-declared rule (frozen before B was examined): a candidate passes if Δmean R > 0 and Δtotal R > 0 in both A and B, validation max drawdown ≤ 1.1 × CONTROL, validation loss streak ≤ CONTROL + 1, affected trades ≥ 30, benchmarks (SR-D, PB-C) never selected, one candidate per family, at most one exit stack.

Passing: **QUALITY-D** and **PB-A**. Frozen combinations: COMBO-1 = QUALITY-D; COMBO-2 = QUALITY-D + PB-A; COMBO-3 = same as COMBO-2 (no third candidate passed).

| | A mean R / PF / total | B mean R / PF / total | **C holdout mean R / PF / total / DD / streak** |
|---|---|---|---|
| CONTROL | +0.056 / 1.22 / +40.2 | −0.168 / 0.71 / −55.9 | +0.050 / 1.11 / +17.6 / 31.1 / 9 |
| COMBO-1 | +0.058 / 1.16 / +40.9 | −0.146 / 0.73 / −47.3 | +0.056 / 1.07 / +19.5 / 26.5 / 9 |
| COMBO-2 (= COMBO-3) | +0.069 / 1.18 / +46.9 | −0.136 / 0.74 / −40.5 | **+0.063 / 1.11 / +20.7 / 25.2 / 8** (n 326, CI [−0.131, +0.258]) |

Model contribution in C for COMBO-2: BO +15.3, MR +8.9, PB +5.8, MC −1.2, SR −8.0. Largest-winner dependence in C: top 5 = +46.1 R, total ex top-5 = −25.4 R (CONTROL −28.5).

**DISCOVERY_RESULT:** COMBO-2 +0.013 R per trade over CONTROL. **VALIDATION_RESULT:** +0.032 R per trade, but the region stays negative (−0.136). **FINAL_HOLDOUT_RESULT:** +0.013 R per trade (+3.1 R over 33 sessions), inside noise, still outlier-dependent. **HOLDOUT_EDGE_DEMONSTRATED = NO.**

---

## 4. Robustness (all regions; seeded bootstrap 2,000 resamples; friction from the broker's own spread 0.24 stressed to 0.40, then 0.40 plus 0.15 USD slippage per side)

| | Mean R | Bootstrap CI95 | P(mean ≤ 0) | B+C only mean / P(≤ 0) | Spread 0.40 mean R / PF | +0.15 slippage mean R / PF |
|---|---|---|---|---|---|---|
| CONTROL | +0.001 | [−0.083, +0.089] | 50 % | −0.056 / 82 % | −0.046 / 1.03 | −0.095 / 0.97 |
| COMBO-1 | +0.009 | [−0.070, +0.092] | 41 % | −0.041 / 75 % | −0.036 / 1.00 | −0.078 / 0.95 |
| COMBO-2 | +0.021 | [−0.069, +0.116] | 33 % | −0.032 / 70 % | −0.023 / 1.03 | −0.066 / 0.97 |

**ROBUSTNESS_RESULT:** the best combination is not distinguishable from zero, is negative over the later two regions with 70 % probability, and is negative under a 0.16 USD wider spread. The strategy's median structural risk (≈ 7 USD) makes it unusually cost-sensitive: each 0.10 USD of friction costs about 0.015 R per trade.

---

## 5. Loss-driver reconciliation (what the corrections did and did not address)

| Driver (Master Edge rank) | Addressed by | Effect out of sample |
|---|---|---|
| Broker fail-safe −396 R | EXIT-B / EXIT-C | none or negative |
| Continuation trades under directional bias −63 R net | PB-A, LAG-B | small, consistent, insufficient |
| Quality 85+ −64 R net | QUALITY-A..D | none |
| SR −40 R net | SR-A..D | small; failed streak rule; benchmark best after the fact |
| Sub-5 USD stops −60 R net | (exit geometry) | none |
| Outlier dependence (top-5 = whole result) | not addressable by filters | unchanged |

---

## 6. Decision

**STRATEGY_CORRECTION_SUPPORTED = NO.** The only corrections that survive discovery and validation (reduced quality score, PB late-continuation filter) add +0.013 R per trade on the untouched holdout with a confidence interval of [−0.13, +0.26], leave the validation region negative, leave the result dependent on five trades, and lose to a 0.16 USD spread increase. Larger single filters (disable SR, block lag trades, block floored-stop BO) either fail the pre-declared rules or flip sign between regions.

**WHY_NOT (structural, not parametric):** (1) the model set generates about 11 signals per session at 50 % win rate with symmetric MAE/MFE, i.e. no timing edge, and only the +30 USD monetary target and profit protection turn that into a marginal profit through a few outliers; (2) the 15m bias admits bias-side trades against 5m structure that lose reliably, while its neutral regime is the only profitable one; (3) the quality score has no ordering; (4) the exit stack cannot be tightened without losing the outliers that fund it; (5) the edge, if any, sits in a low-frequency model (MR) that is itself outlier-dependent.

**NEXT_GATE = C) STRATEGY REDESIGN REQUIRED**, alongside continued live data collection with the current, unchanged production system (no shadow candidate is justified because none passed all four gates). A redesign should start from the conditions that were positive in all three regions (15m neutral regimes, structure-aligned entries, 8–12 USD structural stops, MR-type sweep reversals) rather than from filters on the current signal stream, and must be validated with the same A/B/C discipline before any approval stage.

PRODUCTION_CODE_CHANGED = NO · PRODUCTION_CONFIG_CHANGED = NO · USER_FIXED_0_01_CHANGED = NO · BREAKER_CHANGED = NO · AUTO_SCALING_ENABLED = NO · LIVE_ENGINE_RESTARTED = NO · TRADE_PLACED = NO
