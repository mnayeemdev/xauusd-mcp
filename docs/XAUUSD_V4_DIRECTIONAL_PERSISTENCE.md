# XAUUSD_V4_DIRECTIONAL_PERSISTENCE

Research only (2026-09-26). Daily and weekly directional-state results from `validation/v4_market_state_edge/v4_results.json` (`daily`, `weekly`, `alignment`, `gates`). Definitions and gate: `docs/XAUUSD_V4_RESEARCH_PROTOCOL.md`. All excesses are dir × (state mean − region baseline mean) in ATR14 units (daily) or weekly-ATR(8) units (weekly); brackets are moving-block-bootstrap 95 % CIs; "P≤0" is the bootstrap probability that the excess is ≤ 0; "r" is MFE/MAE in the state's direction; "pos" is the share of positive raw moves (long convention).

Regions: DISCOVERY 2014–2020, VALIDATION 2021–2023, HOLDOUT 2024-01 → 2026-09-25.

## 1. D1 previous-day direction (±0.1 ATR dead-band)

| State | Region | n | h5 excess | h10 excess [CI] | P≤0 | h20 excess | r(h10) | pos(h10) |
|---|---|---|---|---|---|---|---|---|
| UP | DISC | 725 | +0.034 | −0.016 [−0.44, +0.39] | 56 % | −0.035 | 1.30 | 54.9 % |
| UP | VAL | 378 | +0.005 | +0.054 [−0.43, +0.54] | 43 % | −0.046 | 1.07 | 52.7 % |
| UP | HOLD | 391 | +0.020 | −0.018 [−0.61, +0.58] | 51 % | −0.023 | 1.66 | 60.9 % |
| DOWN | DISC | 629 | +0.102 | +0.023 [−0.31, +0.36] | 47 % | +0.087 | 0.82 | 46.4 % |
| DOWN | VAL | 375 | −0.052 | −0.022 [−0.46, +0.40] | 50 % | −0.097 | 0.98 | 46.7 % |
| DOWN | HOLD | 298 | +0.024 | +0.009 [−0.54, +0.53] | 48 % | +0.072 | 0.62 | 33.9 % |
| NEUTRAL | DISC | 253 | +0.153 | +0.103 [−0.37, +0.58] | 32 % | +0.317 | 1.37 | 56.9 % |
| NEUTRAL | VAL | 176 | −0.120 | −0.165 [−0.60, +0.23] | 79 % | −0.107 | 0.90 | 48.3 % |
| NEUTRAL | HOLD | 143 | −0.004 | +0.070 [−0.56, +0.70] | 42 % | +0.215 | 1.62 | 59.4 % |

Year-by-year h10 excess, UP: 2015 +0.06, 2016 +0.03, 2017 +0.01, 2018 −0.18, 2019 −0.13, 2020 +0.04, 2021 +0.04, 2022 −0.01, 2023 +0.17, 2024 −0.05, 2025 −0.07, 2026 0.00 (positive 6/12). DOWN: 2015 +0.01, 2016 +0.03, 2017 +0.08, 2018 −0.20, 2019 +0.05, 2020 +0.06, 2021 +0.03, 2022 −0.18, 2023 +0.11, 2024 −0.03, 2025 −0.05, 2026 −0.04 (positive 7/12).

By volatility (h10 excess): UP LOW +0.05 / NORMAL +0.15 / HIGH −0.11; DOWN LOW +0.05 / NORMAL +0.19 / HIGH −0.10.

**Verdict: NO one-day momentum or reversal.** Both sides are within ±0.06 ATR of the baseline at every horizon and region; no CI excludes zero. DOWN days are followed by *further* down on average in raw terms only where the region's drift is negative or flat; the short-side MFE/MAE is 0.62–0.98, i.e. the short path is worse than a coin flip on excursion.

## 2. D2 three-day direction (±0.3 ATR)

| State | Region | n | h5 excess | h10 excess [CI] | P≤0 | h20 excess | r(h10) | pos(h10) |
|---|---|---|---|---|---|---|---|---|
| UP | DISC | 673 | +0.103 | +0.060 [−0.40, +0.56] | 38 % | +0.225 | 1.41 | 54.5 % |
| UP | VAL | 378 | +0.122 | +0.035 [−0.49, +0.58] | 50 % | +0.037 | 1.12 | 51.3 % |
| UP | HOLD | 382 | +0.031 | +0.152 [−0.50, +0.83] | 34 % | +0.090 | 1.73 | 62.0 % |
| DOWN | DISC | 570 | +0.102 | +0.018 [−0.33, +0.42] | 46 % | +0.030 | 0.84 | 39.8 % |
| DOWN | VAL | 346 | +0.110 | +0.025 [−0.45, +0.45] | 44 % | −0.150 | 1.07 | 48.8 % |
| DOWN | HOLD | 248 | +0.017 | +0.129 [−0.35, +0.63] | 27 % | +0.223 | 0.69 | 33.9 % |
| FLAT | DISC | 364 | −0.031 | −0.083 [−0.57, +0.41] | 65 % | −0.369 | 1.18 | 52.2 % |
| FLAT | VAL | 205 | −0.039 | −0.025 [−0.42, +0.38] | 54 % | −0.321 | 0.99 | 55.1 % |
| FLAT | HOLD | 202 | −0.040 | −0.129 [−0.78, +0.46] | 69 % | +0.105 | 1.64 | 58.9 % |

Year-by-year h10 excess, UP: 2015 +0.39, 2016 +0.11, 2017 +0.26, 2018 +0.12, 2019 −0.14, 2020 −0.22, 2021 −0.11, 2022 −0.07, 2023 +0.25, 2024 +0.13, 2025 +0.06, 2026 +0.03 (positive 8/12; the four years 2015–2018 plus 2023 contribute more than the total, single-year share 54 %). DOWN: 2015 +0.25, 2016 +0.25, 2017 +0.10, 2018 −0.31, 2019 −0.11, 2020 −0.05, 2021 −0.13, 2022 +0.02, 2023 +0.20, 2024 −0.14, 2025 +0.17, 2026 +0.21 (positive 7/12; single-year share 110 % because the total is near zero).

By period (h10 excess, UP): pre-2020 +0.13, 2020–2022 −0.12, 2023+ +0.19. By volatility: UP LOW +0.13 / NORMAL +0.28 / HIGH −0.07; DOWN LOW −0.04 / NORMAL +0.39 / HIGH −0.05.

**Verdict: NOT DEMONSTRATED.** D2 UP is the best-behaved directional state in the study (positive excess at all three horizons in all three regions, 8/12 positive years, r 1.41 in discovery) but every CI includes zero by a wide margin (P≤0 34–50 %), the effect is +0.04 to +0.15 ATR at 10 days (about 0.1–0.4 % of price), it is carried by five years, and it is negative in HIGH-volatility states, which are 46 % of observations. It does not meet gate items 2, 6 or 7. D2 DOWN fails the path criterion (r 0.84 / 0.69) and item 2. FLAT (no 3-day move) is mildly *negative* in all regions at 10–20 days: an absence of movement is followed by under-performance versus the drift, not a breakout.

## 3. D3 daily trend (close vs SMA50, SMA50 slope over 10 bars)

| State | Region | n | h5 excess | h10 excess [CI] | P≤0 | h20 excess | r(h10) | pos(h10) | median h10 |
|---|---|---|---|---|---|---|---|---|---|
| UPTREND | DISC | 795 | +0.052 | +0.093 [−0.35, +0.59] | 38 % | +0.147 | 1.36 | 55.9 % | +0.35 |
| UPTREND | VAL | 335 | +0.023 | −0.052 [−0.79, +0.65] | 59 % | −0.220 | 1.13 | 52.2 % | +0.13 |
| UPTREND | HOLD | 557 | +0.058 | +0.071 [−0.49, +0.63] | 42 % | +0.136 | 1.70 | 62.3 % | +0.71 |
| DOWNTREND | DISC | 508 | +0.124 | +0.286 [−0.20, +0.79] | 12 % | +0.486 | 0.91 | 48.2 % | −0.11 |
| DOWNTREND | VAL | 373 | −0.026 | −0.072 [−0.68, +0.48] | 62 % | −0.073 | 1.01 | 46.7 % | −0.16 |
| DOWNTREND | HOLD | 153 | +0.272 | +0.472 [−0.47, +1.36] | 17 % | +0.630 | 0.81 | 43.8 % | −0.26 |
| NO_TREND | DISC | 304 | +0.070 | +0.237 [−0.40, +0.89] | 25 % | +0.428 | 1.38 | 63.5 % | +0.73 |
| NO_TREND | VAL | 221 | −0.078 | −0.044 [−0.76, +0.66] | 55 % | +0.211 | 0.90 | 49.8 % | −0.04 |
| NO_TREND | HOLD | 122 | +0.075 | +0.269 [−0.56, +1.08] | 28 % | +0.172 | 1.79 | 71.3 % | +1.01 |

Year-by-year h10 excess, UPTREND: 2015 −0.67, 2016 +0.39, 2017 −0.57, 2018 +0.40, 2019 −0.06, 2020 +0.20, 2021 −0.87, 2022 +0.74, 2023 −0.32, 2024 −0.23, 2025 −0.13, 2026 +0.41 (positive 5/12). DOWNTREND: 2015 −0.63, 2016 +0.54, 2017 −0.71, 2018 +0.60, 2019 +0.17, 2020 +0.30, 2021 −0.19, 2022 +0.37, 2023 −0.73, 2024 −0.32, 2026 +0.13 (positive 6/11; 2025 has < 20 downtrend days).

By volatility: UPTREND LOW +0.01 / NORMAL +0.14 / HIGH +0.18; DOWNTREND LOW +0.22 / NORMAL +0.13 / HIGH +0.46.

**Verdict: NOT DEMONSTRATED; UPTREND is NO_EFFECT, DOWNTREND is REGIME_DEPENDENT.** UPTREND alternates sign year by year and is negative in validation. Its raw holdout numbers (h20 +1.93 ATR, 70 % positive) are indistinguishable from the holdout baseline (+1.79, 65 %): being in an uptrend during a bull market adds ≈ +0.1 ATR. DOWNTREND has the largest mean excess among broad states (+0.29 / −0.07 / +0.47) but its CIs are ≈ 1–1.8 ATR wide, the validation region is negative, the short-side MFE/MAE is below 1.0 in discovery and holdout, and the median forward move in the holdout is only −0.26 ATR against a mean that implies −0.42: the mean is pulled by a few large down-moves (2016, 2018, 2022 cluster).

## 4. Weekly states (Friday-close observations, weekly-ATR units)

| State | Region | n | w1 excess | w2 excess [CI] | P≤0 | w4 excess | r(w2) |
|---|---|---|---|---|---|---|---|
| W1 UP | DISC | 127 | +0.028 | +0.015 [−0.19, +0.25] | 44 % | +0.014 | 1.22 |
| W1 UP | VAL | 55 | +0.060 | +0.052 [−0.14, +0.29] | 32 % | −0.163 | 1.18 |
| W1 UP | HOLD | 59 | +0.010 | +0.111 [−0.21, +0.52] | 26 % | +0.246 | 2.16 |
| W1 DOWN | DISC | 108 | +0.023 | +0.071 [−0.12, +0.26] | 25 % | −0.006 | 0.99 |
| W1 DOWN | VAL | 46 | +0.088 | +0.007 [−0.40, +0.37] | 45 % | −0.105 | 1.13 |
| W1 DOWN | HOLD | 34 | +0.120 | +0.128 [−0.19, +0.43] | 22 % | +0.240 | 0.82 |
| W2 ALIGNED_BULL | DISC | 53 | −0.037 | −0.049 [−0.39, +0.31] | 59 % | −0.222 | 1.06 |
| W2 ALIGNED_BULL | VAL | 20 | −0.094 | −0.146 [−0.43, +0.12] | 84 % | −0.454 [−0.81, −0.08] | 0.92 |
| W2 ALIGNED_BULL | HOLD | 26 | +0.230 | +0.267 [−0.23, +0.86] | 19 % | +0.773 | 2.91 |
| W2 ALIGNED_BEAR | DISC | 36 | +0.049 | +0.037 | 41 % | −0.046 | 1.02 |
| W3 UPTREND | DISC | 162 | −0.006 | −0.025 [−0.20, +0.16] | 61 % | −0.059 | 1.18 |
| W3 UPTREND | VAL | 62 | −0.048 | −0.077 [−0.39, +0.28] | 64 % | +0.014 | 1.05 |
| W3 UPTREND | HOLD | 117 | +0.039 | +0.073 [−0.17, +0.34] | 30 % | +0.153 | 2.02 |
| W3 DOWNTREND | DISC | 95 | +0.039 | +0.069 [−0.15, +0.31] | 28 % | +0.071 | 1.06 |
| W3 DOWNTREND | VAL | 51 | −0.048 | −0.112 [−0.47, +0.23] | 76 % | −0.219 | 0.88 |
| W3 DOWNTREND | HOLD | 11 | +0.086 | +0.207 | — | +0.425 | 0.74 |
| W3 NO_TREND | DISC | 77 | +0.060 | +0.138 [−0.15, +0.44] | 17 % | +0.211 | 1.38 |
| W3 NO_TREND | VAL | 43 | +0.011 | −0.022 | 58 % | −0.281 [−0.60, +0.06] | 0.87 |

**Verdict: NOT DEMONSTRATED at weekly resolution.** Every weekly excess in discovery and validation is within ±0.15 weekly-ATR with CIs including zero; the single CI-excluding cell (W2 ALIGNED_BULL, validation, w4 −0.45) points *against* persistence (two up-weeks were followed by under-performance in 2021–2023) and reverses in the holdout. Two-week bullish alignment is negative in discovery and validation and positive only in the 2024–2026 bull drift. Weekly sample sizes (34–162 per region) cannot resolve effects smaller than ≈ 0.3 weekly-ATR anyway.

## 5. Daily × weekly alignment

| State | Region | n | h5 excess | h10 excess [CI] | P≤0 | h20 excess | r(h10) |
|---|---|---|---|---|---|---|---|
| ALIGNED_BULL | DISC | 625 | −0.013 | −0.029 [−0.49, +0.55] | 53 % | −0.028 | 1.28 |
| ALIGNED_BULL | VAL | 237 | +0.002 | −0.033 [−0.90, +0.91] | 51 % | −0.148 | 1.20 |
| ALIGNED_BULL | HOLD | 540 | +0.068 | +0.120 [−0.47, +0.71] | 35 % | +0.249 | 1.74 |
| ALIGNED_BEAR | DISC | 208 | +0.309 | +0.622 [−0.22, +1.43] | 7 % | +1.003 | 1.26 |
| ALIGNED_BEAR | VAL | 216 | −0.159 | −0.352 [−1.19, +0.38] | 80 % | −0.583 | 0.85 |
| ALIGNED_BEAR | HOLD | 52 | +0.261 | +0.517 [−0.66, +1.48] | 21 % | +0.306 | 0.83 |
| CONFLICT D↑ W↓ | DISC | 37 | +0.659 | +1.671 [+0.74, +2.60] | 0 % | +3.299 | 3.47 |
| CONFLICT D↑ W↓ | VAL | 17 | −0.227 | +0.252 | — | +1.466 | 0.98 |
| CONFLICT D↑ W↓ | HOLD | 7 | +1.741 | +0.250 | — | −2.251 | 3.61 |
| CONFLICT D↓ W↑ (bearish dir) | DISC | 110 | −0.264 | −0.750 [−1.71, −0.08] | 99 % | −1.465 [−2.27, −0.78] | 0.92 |
| CONFLICT D↓ W↑ | VAL | 47 | +0.066 | −0.309 [−1.26, +0.91] | 70 % | −0.703 | 0.84 |
| CONFLICT D↓ W↑ | HOLD | 59 | −0.098 | −0.086 [−0.78, +0.50] | 59 % | +0.663 | 2.07 |
| NEUTRAL_OR_MIXED | DISC | 627 | +0.122 | +0.269 [−0.30, +0.78] | 18 % | +0.424 | 1.48 |
| NEUTRAL_OR_MIXED | VAL | 412 | −0.082 | −0.142 [−0.65, +0.33] | 71 % | −0.200 | 0.87 |
| NEUTRAL_OR_MIXED | HOLD | 174 | −0.170 | −0.197 [−1.04, +0.67] | 68 % | −0.815 | 1.31 |

Year-by-year h10 excess, ALIGNED_BULL: 2016 −0.25, 2017 −1.11, 2018 −0.08, 2019 −0.06, 2020 +0.20, 2021 −3.33 (n 23), 2022 +0.67, 2023 −0.08, 2024 −0.23, 2025 −0.13, 2026 +0.71 (positive 3/11). ALIGNED_BEAR: 2015 −0.63, 2016 +0.44, 2018 +0.75, 2021 −0.32, 2022 −0.16, 2023 −1.37, 2026 −0.29 (positive 2/7).

**Verdict: NOT DEMONSTRATED.**
- ALIGNED_BULL is the largest bullish state (1,402 observations) and is *below* the baseline in discovery and validation, positive only in the holdout where the baseline itself is +0.9 ATR at 10 days. Under-performance versus the drift in 8 of 11 years. Being in a daily-and-weekly uptrend does not add to the drift.
- ALIGNED_BEAR: discovery +0.62 (P≤0 7 %, CI includes zero), validation −0.35, holdout +0.52 on n 52. Positive in 2 of 7 years; the 2016 and 2018 clusters carry the discovery mean. REGIME_DEPENDENT, fails gate items 2, 4 and 6.
- CONFLICT (daily up, weekly down): n 37/17/7. The discovery CI excludes zero (+1.67 at h10) but the cell is 2 % of observations, the validation is +0.25 on n 17, and the holdout reverses to −2.25 at 20 days on n 7. Below the N floor; reported for completeness, not as evidence.
- CONFLICT (daily down, weekly up): the bearish reading is wrong. Price rose after these days in discovery (bearish-direction excess −0.75 [−1.71, −0.08]), i.e. the weekly trend "won" the conflict in 2014–2020; in validation the same sign but the CI includes zero; in the holdout the 10-day result is flat and the 20-day is +0.66 in the bearish direction. Sign-unstable; N 110 < 150; not promotable and not a symmetric rule.

## 6. Overall directional conclusion

DIRECTIONAL_PERSISTENCE = NOT_DEMONSTRATED on daily and weekly resolution. BULL_BEAR_CLASSIFICATION = NO_EFFECT. The three candidate patterns with the largest means (D3 DOWNTREND, ALIGNED_BEAR, D2 UP) fail the pre-declared gate on CI, validation sign, year share or outlier criteria, and none survives in all three regions. Raw persistence numbers in 2024–2026 are the bull drift and are reproduced by the unconditional baseline.
