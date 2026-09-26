# XAUUSD_V4_MARKET_STATE_STUDY

Research only (2026-09-26). Market-state persistence study on daily/weekly XAUUSD (Exness XAUUSDm daily bars, 2014-01-14 → 2026-09-25, 3,909 bars, 663 weeks). Production untouched; no trade; no restart; nothing under `validation/v4_market_state_edge/` is imported by production. Protocol pre-declared in `docs/XAUUSD_V4_RESEARCH_PROTOCOL.md` before the run. Script and results: `validation/v4_market_state_edge/v4_states.mjs`, `v4_results.json`, `v4_console.json`. Companion documents: `XAUUSD_V4_DIRECTIONAL_PERSISTENCE.md`, `XAUUSD_V4_VOLATILITY_STATE.md`, `XAUUSD_V4_EDGE_MATRIX.md`.

## 1. Question and answer

**Does XAUUSD show a repeatable daily/weekly directional-persistence or volatility-state effect beyond the unconditional drift, stable across chronological regions and years?**

**Direction: NO.** None of the 16 gated directional states (D1/D2/D3 daily, W1/W2/W3 weekly, daily×weekly alignment) passes the pre-declared promotion gate. No state produces a discovery excess whose block-bootstrap 95 % CI excludes zero at any of the required horizons (gate item 2 fails for every state), and most states also fail at least one of: validation sign agreement, year-by-year share, or outlier robustness. The dominant, repeatable feature of the data is the unconditional drift itself, which is region-dependent: roughly zero in 2021–2023 and strongly positive in 2024–2026.

**Volatility magnitude: consistent in sign, below the pre-declared size gate.** HIGH volatility state (ATR14 ≥ 67th trailing-500-day percentile) is followed by lower realized range relative to the current ATR in all three regions (10-day ratio 0.93 / 0.83 / 0.97), and LOW volatility by higher (1.08 / 1.12 / 1.14). Only the HIGH state in the validation region reaches the ≥ 15 % magnitude threshold; discovery and holdout sit at 3–8 %, so the "≥ 15 % in all three regions" gate is **not** met. It is mean reversion of volatility, not a directional edge, and it says nothing about which way price goes.

## 2. Data and regions

| Item | Value |
|---|---|
| Daily bars | 3,909 (2014-01-14 → 2026-09-25), ~310/year incl. Sunday session bar, no gaps |
| Weekly bars (derived) | 663 completed weeks |
| Daily observations with ATR/SMA50/500-day quantile defined | 3,368 |
| Weekly observations | 628 |
| DISCOVERY | 2014-01-14 → 2020-12-31 (daily n 1,607; weekly n 334) |
| VALIDATION | 2021-01-01 → 2023-12-31 (daily n 929; weekly n 156) |
| V4 RESEARCH HOLDOUT | 2024-01-01 → 2026-09-25 (daily n 832; weekly n 138), not pristine (V3 used the same feed) |

Feed mismatch with production (OANDA:XAUUSD on TradingView) is stated; no feeds merged. Forward horizons overlap: the count of approximately independent trials is N/h (discovery baseline: 161 at h10, 80 at h20).

## 3. Unconditional baseline (what every state is measured against)

Forward close-to-close move in ATR14 units, long convention, moving-block-bootstrap 95 % CI.

| Region | n | h1 | h5 | h10 | h20 | P(+0.5 before −0.5) | P(+1 before −1) |
|---|---|---|---|---|---|---|---|
| DISCOVERY | 1,607 | +0.042 [+0.004, +0.079] | +0.197 [+0.031, +0.371] | +0.362 [+0.027, +0.702], pos 56 %, MFE/MAE 1.28 | +0.680 [−0.015, +1.327] | 45.7 % | 54.2 % |
| VALIDATION | 929 | ≈ 0 | ≈ 0 | +0.066 [−0.347, +0.510] | ≈ 0 | — | — |
| HOLDOUT | 832 | — | +0.438 [+0.216, +0.689] | +0.895 [+0.427, +1.365], pos 62 % | +1.789 [+0.671, +2.893], pos 65 %, MFE/MAE 2.05 | — | — |

Weekly baseline (Friday close, weekly-ATR units): DISCOVERY w1 +0.041, w2 +0.087, w4 +0.181 (CIs include zero); VALIDATION w1 +0.027, w2 +0.060, w4 +0.126 (include zero); HOLDOUT w1 +0.210 [+0.101, +0.327], w2 +0.421 [+0.215, +0.652], w4 +0.839 [+0.406, +1.330], pos 58–67 %.

Year-by-year raw 10-day mean (ATR units): 2015 −0.25, 2016 +0.24, 2017 +0.48, 2018 −0.10, 2019 +0.79, 2020 +0.61, 2021 −0.15, 2022 +0.09, 2023 +0.25, 2024 +0.84, 2025 +1.49, 2026 +0.08. The drift is the strongest and least stable single feature in the sample; this is why every state is reported as excess over its own region's drift.

## 4. Gate results at a glance

| State | dir | Disc N | Disc positive horizons of {5,10,20} | Disc CI excludes 0 | MFE/MAE ≥ 1.10 at h10 | Val positive (same) | Hold positive (same) | Years ≥ 60 % positive | Outlier ok | PASS |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 UP | + | 725 | {5} | no | yes (1.30) | {5,10} | {5} | 50 % | no | **NO** |
| D1 DOWN | − | 629 | {5,10,20} | no | no (0.82) | none | {5,10,20} | 58 % | yes | **NO** |
| D2 UP | + | 673 | {5,10,20} | no | yes (1.41) | {5,10,20} | {5,10,20} | 67 % | no (single-year share 54 %) | **NO** |
| D2 DOWN | − | 570 | {5,10,20} | no | no (0.84) | {5,10} | {5,10,20} | 58 % | yes | **NO** |
| D3 UPTREND | + | 795 | {5,10,20} | no | yes (1.36) | {5} | {5,10,20} | 42 % | no | **NO** |
| D3 DOWNTREND | − | 508 | {5,10,20} | no | no (0.91) | none | {5,10,20} | 55 % | yes | **NO** |
| ALIGNED_BULL | + | 625 | none | no | yes (1.28) | {5} | {5,10,20} | 27 % | no | **NO** |
| ALIGNED_BEAR | − | 208 | {5,10,20} | no | yes (1.26) | none | {5,10,20} | 29 % | yes | **NO** |
| CONFLICT D↑W↓ | + | 37 | — | — | — | — | — | — | — | **NO (N)** |
| CONFLICT D↓W↑ | − | 110 | — | — | — | — | — | — | — | **NO (N < 150)** |
| W1 UP | + | 127 | {1,2,4} | no | yes | {1,2} | {1,2,4} | — | — | **NO** |
| W1 DOWN | − | 108 | {1,2} | no | no | {1,2} | {1,2,4} | — | — | **NO** |
| W2 ALIGNED_BULL | + | 53 | none | no | no | none | {1,2,4} | — | — | **NO** |
| W2 ALIGNED_BEAR | − | 36 | — | — | — | — | — | — | — | **NO (N < 40)** |
| W3 UPTREND | + | 162 | none | no | yes | {4} | {1,2,4} | — | — | **NO** |
| W3 DOWNTREND | − | 95 | {1,2,4} | no | no | none | {1,2,4} | — | — | **NO** |

Gate item 2 (CI excluding zero at ≥ 1 required horizon in discovery) fails for all 16 states. The only excess CIs that exclude zero anywhere in the study are (a) CONFLICT_D_UP_W_DOWN in discovery (n 37, h10 +1.67 [+0.74, +2.60]), below the N floor, with n 17 and 7 in the later regions and a sign reversal at 20 days in the holdout; (b) CONFLICT_D_DOWN_W_UP in discovery in the *wrong* direction for a bearish state (h10 −0.75 [−1.71, −0.08], h20 −1.47 [−2.27, −0.78]: price rose after the bearish-daily/bullish-weekly conflict), not confirmed in validation (−0.31 [−1.26, +0.91]) and mixed in the holdout; (c) matrix cells with small N (see edge matrix). Every one of these is a small-sample or single-region result.

## 5. Findings by block (detail in the companion documents)

1. **One-day and three-day direction (D1, D2).** Excess at 10 days is within ±0.06 ATR in every region for D1. D2 UP shows +0.06 / +0.04 / +0.15 (discovery / validation / holdout) with CIs about 1 ATR wide and 8 positive years of 12, but the excess is carried by 2015–2017 and 2023 (single-year share 54 % of total) and fails the outlier gate. D2 DOWN is +0.02 / +0.03 / +0.13 with a discovery MFE/MAE of 0.84 in its own direction. No measurable one- or three-day momentum after drift adjustment.
2. **Daily trend (D3).** UPTREND excess +0.09 / −0.05 / +0.07; positive in only 5 of 12 years; sign flips yearly (2016 +0.39, 2017 −0.57, 2018 +0.40, 2021 −0.87, 2022 +0.74, 2023 −0.32). DOWNTREND excess +0.29 / −0.07 / +0.47 with CIs [−0.20, +0.79] / [−0.68, +0.48] / [−0.47, +1.36] and a discovery MFE/MAE of 0.91 (the short side loses on path even when the mean is favourable). Not repeatable.
3. **Weekly (W1–W3).** All weekly excesses are within ±0.15 weekly-ATR in discovery and validation with CIs including zero; the holdout's positive numbers for UP/UPTREND/ALIGNED_BULL are the 2024–2026 bull drift, and the holdout's positive numbers for DOWN/DOWNTREND rest on n 10–34.
4. **Alignment.** ALIGNED_BULL has negative excess in discovery (−0.03 at h10) and validation (−0.03) and only 3 positive years out of 11; it does not beat the baseline it is embedded in. ALIGNED_BEAR shows +0.62 in discovery (CI [−0.22, +1.43]), **−0.35** in validation and +0.52 in the holdout (n 52), positive in 2 of 7 years. REGIME_DEPENDENT at best; NO_EFFECT under the gate.
5. **Volatility.** Realized-range and forward-ATR ratios order consistently LOW > NORMAL > HIGH in all three regions (mean reversion of volatility); direction is unaffected (P(+0.5 before −0.5) 40–48 % in every cell; MFE/MAE ordering follows the region drift, not the volatility state). Transitions: HIGH→FALLING and HIGH→STABLE contract further (0.85–0.94); LOW→FALLING and LOW→STABLE expand (1.05–1.27); RISING cells are thin or inconsistent (HIGH→RISING 1.05 / 0.86 / 1.16).
6. **Direction × volatility matrix.** No cell qualifies (no parent directional state passed). Descriptively, ALIGNED_BULL|NORMAL is +0.45 / +0.02 / +0.97 and ALIGNED_BEAR|HIGH is +1.32 [+0.89, +1.77] (n 31) / **−0.41** (n 63) / +1.48 (n 36): a validation-region reversal on an n 31 discovery cell. NEUTRAL_OR_MIXED|HIGH is negative in all three regions in the long convention (−0.25 / −0.13 / −1.02 [−1.73, −0.39]), i.e. mixed-trend/high-volatility days under-perform the drift. That is a do-nothing observation, not a tradeable direction.

## 6. Bull/bear classification

For every state family the bullish side does not pass and the bearish side does not pass. Sign patterns across regions: bullish states are ≈ 0 in discovery and validation and positive only where the holdout drift is positive; bearish states are mildly positive in discovery, negative in validation, positive in the thin holdout. **Classification = NO_EFFECT** (neither side passes; the sign flips across regions would otherwise read REGIME_DEPENDENT, which describes ALIGNED_BEAR and D3 DOWNTREND but does not promote them).

## 7. Interpretation

1. After removing each region's drift, daily and weekly direction in XAUUSD carries no persistence that survives the block bootstrap: the excess CIs at 10 days are typically ±0.5 ATR wide around a centre of ±0.1 ATR.
2. Whatever appears as "trend persistence" in raw numbers is the unconditional drift of the period. In 2024–2026 every bullish state looks good in raw terms (h20 +1.8 to +2.0 ATR, 65–72 % positive), and so does the baseline (+1.79, 65 %). Conditioning on state adds nothing measurable.
3. Bearish states have the wrong path shape even where the mean is favourable: MFE/MAE in the short direction is 0.6–0.9 at 10 days in discovery for D1/D2/D3 DOWN, meaning short exposure sees larger adverse excursions than favourable ones.
4. Volatility mean-reverts (well known, confirmed here) and the effect is stable in sign across regions, but its magnitude on this feed is 3–17 % of ATR-normalised realized range and it does not meet the pre-declared 15 %-in-all-regions gate. It is at most a sizing/expectation input, not an entry premise.
5. The only cells with CI-excluding excess are small-N conflict/matrix cells whose later regions reverse or shrink. With 16 gated states × 3 horizons plus 12 matrix cells × 2 horizons ≈ 72 discovery tests, 3–4 spurious exclusions are expected by chance; the handful observed is consistent with chance.

## 8. Decisions

- DAILY_DIRECTIONAL_PERSISTENCE = NOT_DEMONSTRATED
- WEEKLY_DIRECTIONAL_PERSISTENCE = NOT_DEMONSTRATED
- DAILY_WEEKLY_ALIGNMENT_EDGE = NOT_DEMONSTRATED (ALIGNED_BEAR regime-dependent, fails validation)
- VOLATILITY_STATE_MAGNITUDE = consistent in sign (volatility mean reversion) but below the pre-declared 15 % gate in discovery and holdout → NOT_PROMOTED
- DIRECTION_×_VOLATILITY_MATRIX = NO CELL QUALIFIES
- BULL_BEAR_CLASSIFICATION = NO_EFFECT

**NEXT_GATE = C.** No repeatable market-state edge is demonstrated at daily/weekly resolution or in volatility state. Per instruction, no new structure model is invented. Together with the Master validation (5m production), the Lab (5m patches), V2 (5m challenger) and V3 (15m/1H structural events), the price-only premise has now been tested from 5m to weekly without a symmetric, drift-adjusted, out-of-sample edge. The premise families not yet tested are scheduled-event (news-window) behaviour and non-price inputs (rates, USD, positioning); each would need its own pre-declared protocol before any rule is written, and none alters production, the breaker, the lot, or the $6M objective's zero influence.
