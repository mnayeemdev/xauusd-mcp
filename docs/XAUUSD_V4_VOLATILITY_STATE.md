# XAUUSD_V4_VOLATILITY_STATE

Research only (2026-09-26). Volatility-state and volatility-transition results from `validation/v4_market_state_edge/v4_results.json` (`volatility`, `transition`). Definitions: `docs/XAUUSD_V4_RESEARCH_PROTOCOL.md` §6. Magnitude is measured, not direction: forward realized range (sum of true ranges over h) divided by ATR14 at t, relative to the region baseline of the same quantity ("rr" = state / baseline), with moving-block-bootstrap 95 % CIs; also forward |return| / ATR and ATR14 at t+h / ATR14 at t ("atrfwd"). Direction diagnostics (P(+0.5 before −0.5) long convention, MFE/MAE) are shown to confirm that volatility state carries no directional information.

Volatility state V: ATR14 versus its trailing 500-day distribution, LOW ≤ 33rd percentile, HIGH ≥ 67th, else NORMAL. Transition: ATR14_t / ATR14_{t−5}, RISING > 1.15, FALLING < 0.87, else STABLE.

## 1. Volatility state → forward magnitude

| V | Region | n | rr h5 [CI] | rr h10 [CI] | rr h20 [CI] | abs-move ratio h10 | atrfwd h10 (state / baseline) | P(+0.5 before −0.5) | MFE/MAE long h10 |
|---|---|---|---|---|---|---|---|---|---|
| LOW | DISC | 606 | 1.081 [1.033, 1.135] | 1.082 [1.020, 1.153] | 1.059 [0.999, 1.130] | 1.16 | 1.088 / 1.031 | 44.6 % | 1.27 |
| LOW | VAL | 358 | 1.110 [1.042, 1.191] | 1.124 [1.049, 1.204] | 1.151 [1.064, 1.249] | 1.19 | 1.110 / 1.021 | 39.9 % | 1.02 |
| LOW | HOLD | 28 | 1.159 [0.930, 1.376] | 1.143 [1.017, 1.270] | 1.118 | 1.77 | 1.162 / 1.058 | 60.7 % | 3.94 |
| NORMAL | DISC | 416 | 0.971 [0.914, 1.032] | 0.985 [0.907, 1.074] | 1.022 [0.915, 1.152] | 1.05 | 1.022 / 1.031 | 47.6 % | 1.57 |
| NORMAL | VAL | 298 | 1.003 [0.943, 1.065] | 1.008 [0.951, 1.073] | 0.998 [0.933, 1.064] | 1.08 | 1.030 / 1.021 | 46.3 % | 1.01 |
| NORMAL | HOLD | 161 | 1.073 [1.004, 1.149] | 1.109 [1.010, 1.231] | 1.132 [1.016, 1.274] | 1.40 | 1.139 / 1.058 | 52.8 % | 2.75 |
| HIGH | DISC | 585 | 0.936 [0.879, 0.997] | 0.925 [0.859, 1.010] | 0.923 [0.839, 1.044] | 0.79 | 0.978 / 1.031 | 45.6 % | 1.10 |
| HIGH | VAL | 273 | 0.852 [0.799, 0.909] | 0.829 [0.783, 0.879] | 0.804 [0.760, 0.857] | 0.67 | 0.896 / 1.021 | 44.0 % | 1.04 |
| HIGH | HOLD | 643 | 0.975 [0.910, 1.053] | 0.967 [0.882, 1.067] | 0.962 [0.860, 1.094] | 0.87 | 1.033 / 1.058 | 48.5 % | 1.35 |

Reading the table:

- **Ordering is stable:** LOW > NORMAL > HIGH in realized-range ratio in all three regions at every horizon. Low current volatility is followed by relatively more movement per unit of current ATR; high current volatility by relatively less. This is volatility mean reversion.
- **Magnitude is small outside 2021–2023:** LOW +8 % / +12 % / +14 % at h10; HIGH −8 % / −17 % / −3 %. The CI excludes 1.0 for LOW at h10 in all three regions and for HIGH at h5–h20 in discovery (h5 only) and validation (all), but not in the holdout.
- **The pre-declared magnitude gate (≥ 15 % from 1.0 in the same direction in all three regions, CI excluding 1.0 in discovery and validation) is NOT met** by either LOW (8 / 12 / 14 %) or HIGH (8 / 17 / 3 %). The effect is real in sign but under the size threshold declared before the run. The threshold is not revised after seeing the data.
- **Holdout composition:** 643 of 832 holdout days are HIGH volatility (the 2024–2026 bull phase pushed ATR14 above its trailing 500-day 67th percentile most of the time) and only 28 are LOW. The holdout's LOW cell is too thin to weigh; the holdout's HIGH cell (n 643) is the informative one and shows only −3 % at h10.
- **No directional content:** P(+0.5 ATR before −0.5) is 40–48 % in every adequately sampled cell regardless of V; MFE/MAE ordering follows the region (holdout > discovery > validation), not the volatility state. Forward absolute move ratio (|return| / ATR) follows realized range (1.16 / 1.05 / 0.79 in discovery).

## 2. Volatility transitions → forward magnitude (realized range ratio)

| Transition | DISC n / rr h5 / rr h10 | VAL n / rr h5 / rr h10 | HOLD n / rr h5 / rr h10 |
|---|---|---|---|
| LOW→RISING | 18 / — | 18 / — | 0 |
| LOW→STABLE | 513 / 1.051 [1.012, 1.094] / 1.046 [1.004, 1.096] | 280 / 1.101 [1.035, 1.188] / 1.120 [1.037, 1.209] | 20 / 1.113 / 1.107 |
| LOW→FALLING | 75 / 1.220 [1.112, 1.364] / 1.265 [1.123, 1.415] | 60 / 1.155 [1.055, 1.268] / 1.139 [1.052, 1.209] | 8 / — |
| NORMAL→RISING | 40 / 1.106 [0.864, 1.375] / 1.056 [0.911, 1.195] | 27 / 1.106 [0.950, 1.272] / 1.127 [0.980, 1.280] | 6 / — |
| NORMAL→STABLE | 345 / 0.951 / 0.967 | 244 / 0.996 / 0.999 | 135 / 1.090 [1.008, 1.171] / 1.131 [1.012, 1.273] |
| HIGH→RISING | 136 / 1.062 [0.958, 1.175] / 1.051 [0.924, 1.203] | 67 / 0.903 [0.828, 0.996] / 0.861 [0.804, 0.917] | 112 / 1.194 [0.967, 1.518] / 1.156 [0.944, 1.414] |
| HIGH→STABLE | 370 / 0.896 [0.851, 0.952] / 0.876 [0.829, 0.932] | 182 / 0.833 [0.776, 0.893] / 0.814 [0.756, 0.874] | 451 / 0.937 [0.893, 0.986] / 0.929 [0.873, 0.990] |
| HIGH→FALLING | 79 / 0.909 [0.825, 0.995] / 0.940 [0.864, 1.020] | 24 / 0.857 [0.790, 0.922] / 0.851 [0.802, 0.900] | 80 / 0.882 [0.823, 0.943] / 0.911 [0.824, 1.028] |

- **HIGH→STABLE** (the most common HIGH transition, n 370 / 182 / 451) contracts in all three regions with CIs excluding 1.0 at h5 and h10 in each: −12 % / −19 % / −7 % at h10. This is the one volatility cell that is consistent in sign *and* CI-excluding in all three regions. Its holdout magnitude (7 %) is under the 15 % gate.
- **HIGH→FALLING** contracts further in all regions (−6 % / −15 % / −9 % at h10); CIs exclude 1.0 in validation and at h5 in the holdout; below the gate in discovery and holdout.
- **LOW→FALLING** (ATR already low and still falling) expands the most: +27 % / +14 % at h10 with CIs excluding 1.0 in both regions where n ≥ 60; the holdout has 8 observations. This is the one cell that meets 15 % in discovery, but the validation is 14 % and the holdout is unmeasurable, so the gate is not met.
- **LOW→STABLE** expands mildly (+5 % / +12 % / +11 %).
- **RISING** transitions are too thin (LOW→RISING 18 / 18 / 0; NORMAL→RISING 40 / 27 / 6) or sign-inconsistent (HIGH→RISING +5 % / −14 % / +16 %). "Volatility expansion continues" is not supported; "volatility expansion from a high base reverts" is supported in validation only.

## 3. Direction within volatility states (from the directional-state by_vol panels, h10 excess in ATR)

| Directional state | LOW | NORMAL | HIGH |
|---|---|---|---|
| D1 UP | +0.05 | +0.15 | −0.11 |
| D1 DOWN | +0.05 | +0.19 | −0.10 |
| D2 UP | +0.13 | +0.28 | −0.07 |
| D2 DOWN | −0.04 | +0.39 | −0.05 |
| D3 UPTREND | +0.01 | +0.14 | +0.18 |
| D3 DOWNTREND | +0.22 | +0.13 | +0.46 |
| ALIGNED_BULL | −0.35 | +0.23 | +0.22 |
| ALIGNED_BEAR | +0.27 | +0.24 | +0.46 |
| NEUTRAL_OR_MIXED (long) | +0.24 | −0.16 | −0.32 |

Short-horizon direction states (D1, D2) are mildly positive in NORMAL volatility and negative in HIGH; trend states (D3, alignment) are if anything larger in HIGH volatility. These are pooled across all regions, are not drift-adjusted per region within the cell, and have no consistent ordering across state families. No volatility state converts any directional state into a passing one (see `XAUUSD_V4_EDGE_MATRIX.md`).

## 4. Conclusions

- VOLATILITY_MEAN_REVERSION_SIGN = CONSISTENT (LOW expands, HIGH contracts, in all regions; HIGH→STABLE CI-excluding in all regions).
- VOLATILITY_MAGNITUDE_GATE (≥ 15 % in all regions) = **NOT MET** (best broad state: HIGH 8 / 17 / 3 %; best transition: HIGH→STABLE 12 / 19 / 7 %; LOW→FALLING 27 / 14 / n 8).
- VOLATILITY_DIRECTIONAL_CONTENT = NONE (P(+0.5 before −0.5) 40–48 % in every cell; MFE/MAE follows region drift).
- VOLATILITY_STATE_PROMOTED = NO.

What this means for the (unchanged) production system: the 5m engine already normalises by ATR; a daily-volatility-state input would at most shade expectations of realized range by ±10 %, which is inside the noise of the 5m stop/target geometry and does not justify any change. No rule is proposed.
