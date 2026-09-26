# XAUUSD_V4_EDGE_MATRIX

Research only (2026-09-26). Direction × volatility matrix and the consolidated gate table for the V4 market-state study. Source: `validation/v4_market_state_edge/v4_results.json` (`matrix`, `gates`). Protocol and gate wording: `docs/XAUUSD_V4_RESEARCH_PROTOCOL.md`. Excess = dir × (cell mean − region baseline mean) in ATR14 units at 10 and 20 days; brackets are block-bootstrap 95 % CIs; r = MFE/MAE in the cell's direction at 10 days.

Matrix cells: alignment state (ALIGNED_BULL, ALIGNED_BEAR, CONFLICT any, NEUTRAL_OR_MIXED) × volatility state (LOW, NORMAL, HIGH). CONFLICT cells are measured in the long convention (no directional hypothesis); NEUTRAL_OR_MIXED cells likewise. Pre-declared cell gate: a cell qualifies only if its parent directional state passed **and** the cell's excess exceeds the parent's in all three regions with N ≥ 60 per cell. No parent state passed, so **no cell can qualify**; the table is descriptive.

## 1. Matrix (h10 excess / h20 excess; n per region)

| Cell | dir | DISCOVERY | VALIDATION | HOLDOUT | Reading |
|---|---|---|---|---|---|
| ALIGNED_BULL \| LOW | + | n 109: −0.34 [−1.63, +0.80] / −0.54 | n 41: −0.09 / +0.96 [+0.64, +1.29] | n 5: −1.42 / −3.21 | negative or thin; validation h20 CI on n 41 is a single-horizon result |
| ALIGNED_BULL \| NORMAL | + | n 128: +0.45 [−0.80, +2.20] / +1.23 | n 91: +0.02 [−1.13, +1.22] / −0.29 | n 94: +0.97 [−0.05, +1.86] / +1.80 | positive in discovery and holdout, flat in validation; every CI includes zero |
| ALIGNED_BULL \| HIGH | + | n 388: −0.10 [−0.51, +0.34] / −0.30 | n 105: −0.06 [−0.45, +0.33] / −0.46 [−0.82, −0.10] | n 441: −0.04 [−0.62, +0.54] / −0.04 | the largest bullish cell (934 obs) is at or below the baseline in all regions |
| ALIGNED_BEAR \| LOW | − | n 133: +0.51 [−0.70, +1.66] / +1.19 | n 79: −0.39 [−1.73, +0.74] / −0.72 | n 0 | sign reversal; no holdout |
| ALIGNED_BEAR \| NORMAL | − | n 44: +0.46 [−0.18, +1.07] / +0.04 | n 74: −0.26 [−1.13, +0.89] / −0.66 | n 16: −1.66 / −4.06 | sign reversal; thin |
| ALIGNED_BEAR \| HIGH | − | n 31: +1.32 [+0.89, +1.77] / +1.58 | n 63: −0.41 [−0.97, +0.21] / −0.33 | n 36: +1.48 [+1.08, +1.87] / +2.25 | CI-excluding in discovery (n 31) and holdout (n 36) but **negative in validation** (n 63); 130 obs total; fails N ≥ 60 per region and fails validation |
| CONFLICT \| LOW | long | n 47: −0.93 [−1.98, −0.03] / −0.89 | n 34: +0.43 / +0.54 | n 7: +2.43 / +4.99 | sign flips region to region |
| CONFLICT \| NORMAL | long | n 55: +0.64 [−0.53, +2.08] / +0.47 | n 24: −0.34 [−0.96, +0.30] / −0.68 | n 10: +1.80 / +4.34 | sign flips |
| CONFLICT \| HIGH | long | n 45: −0.27 [−0.61, +0.10] / −0.51 | n 6: −2.74 / −1.74 | n 49: −0.78 [−1.25, −0.34] / −1.12 [−1.76, −0.49] | under-performs drift in all regions (long convention); n 6 in validation; short-side r 0.64 in holdout (1/1.57) |
| NEUTRAL_OR_MIXED \| LOW | long | n 317: +0.44 [−0.21, +1.18] / +0.68 | n 204: −0.09 [−0.79, +0.68] / +0.13 | n 16: +3.05 / +3.71 | flat in validation; thin holdout |
| NEUTRAL_OR_MIXED \| NORMAL | long | n 189: +0.32 [−0.27, +0.86] / +0.36 | n 109: −0.24 [−1.00, +0.56] / −0.78 [−1.58, −0.06] | n 41: +0.87 [−0.25, +1.92] / +1.93 | sign flips |
| NEUTRAL_OR_MIXED \| HIGH | long | n 121: −0.25 [−0.97, +0.44] / −0.13 | n 99: −0.13 [−0.46, +0.22] / −0.25 | n 117: −1.02 [−1.73, −0.39] / −2.39 | under-performs the drift in all three regions in the long convention; only the holdout CI excludes zero |

## 2. What the matrix says

1. **No cell qualifies** under the pre-declared rule (no parent state passed; the two cells with two CI-excluding regions, ALIGNED_BEAR|HIGH and CONFLICT|HIGH, both have a region with n < 60 and ALIGNED_BEAR|HIGH is negative in validation).
2. **ALIGNED_BEAR|HIGH** is the most striking single cell: +1.32 [+0.89, +1.77] on 31 discovery days (2015–2016 and 2018 clusters) and +1.48 [+1.08, +1.87] on 36 holdout days (2026 correction days), but −0.41 on 63 validation days (2021–2023). With 12 cells × 2 horizons × 3 regions = 72 tests, two agreeing CI exclusions at n ≈ 30 with a disagreeing larger middle region is what selection from noise looks like. It is recorded as REGIME_DEPENDENT, not promotable, and would need a fresh, pre-registered test on future data before it is even a hypothesis.
3. **NEUTRAL_OR_MIXED|HIGH and CONFLICT|HIGH** (mixed or conflicting trend state with high volatility) under-perform the drift in the long convention in all three regions. In a strongly positive-drift asset this reads as "high-volatility days without trend agreement are the days when the bull drift is absent". It is not a short signal (short-side MFE/MAE 0.64–0.86) and not a long signal; it is, if anything, an abstention description, and abstention is already the production engine's default when its own gates fail. No rule is derived.
4. **ALIGNED_BULL|HIGH** (934 observations, the dominant state of 2024–2026) adds nothing to the baseline in any region. Bull alignment in high volatility is the market's default state during the holdout and is priced into the unconditional drift.
5. **Volatility does not rescue direction.** Within each alignment row, LOW/NORMAL/HIGH do not order consistently across regions (ALIGNED_BULL: NORMAL best in discovery and holdout, all ≈ 0 in validation; ALIGNED_BEAR: HIGH best in discovery and holdout, all negative in validation).

## 3. Consolidated gate table (all states, from `R.gates`)

| Family | State | Disc N ok | ≥2 positive horizons (disc) | CI excl. 0 (disc) | Path r ≥ 1.10 | Validation same horizons | Holdout same horizons | ≥60 % years | Single-year ≤ 40 % | Outlier ok | PASS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D1 | UP | yes | no ({5}) | no | yes | partial | partial | no (50 %) | yes | no | NO |
| D1 | DOWN | yes | yes | no | no | no | yes | no (58 %) | yes | yes | NO |
| D2 | UP | yes | yes | no | yes | yes | yes | yes (67 %) | no (54 %) | no | NO |
| D2 | DOWN | yes | yes | no | no | partial | yes | no (58 %) | no | yes | NO |
| D3 | UPTREND | yes | yes | no | yes | no ({5} only) | yes | no (42 %) | yes | no | NO |
| D3 | DOWNTREND | yes | yes | no | no | no | yes | no (55 %) | no | yes | NO |
| ALIGN | ALIGNED_BULL | yes | no (none) | no | yes | no | yes | no (27 %) | yes | no | NO |
| ALIGN | ALIGNED_BEAR | yes | yes | no | yes | no | yes | no (29 %) | yes | yes | NO |
| ALIGN | CONFLICT D↑W↓ | no (37) | — | — | — | — | — | — | — | — | NO |
| ALIGN | CONFLICT D↓W↑ | no (110) | — | — | — | — | — | — | — | — | NO |
| W1 | UP | yes (127) | yes | no | yes | partial | yes | — | — | — | NO |
| W1 | DOWN | yes (108) | yes | no | no | partial | yes | — | — | — | NO |
| W2 | ALIGNED_BULL | yes (53) | no | no | no | no | yes | — | — | — | NO |
| W2 | ALIGNED_BEAR | no (36) | — | — | — | — | — | — | — | — | NO |
| W3 | UPTREND | yes (162) | no | no | yes | no | yes | — | — | — | NO |
| W3 | DOWNTREND | yes (95) | yes | no | no | no | yes | — | — | — | NO |
| VOL | LOW (magnitude) | yes | expands all regions (+8/+12/+14 %) | yes (h10 all regions) | n/a | — | — | — | — | — | NO (< 15 %) |
| VOL | HIGH (magnitude) | yes | contracts all regions (−8/−17/−3 %) | disc h5 only, val all | n/a | — | — | — | — | — | NO (< 15 % in disc/hold) |
| VOL-T | HIGH→STABLE | yes | contracts all regions (−12/−19/−7 %) | yes, all regions | n/a | — | — | — | — | — | NO (< 15 % in disc/hold) |
| VOL-T | LOW→FALLING | yes/yes/no (8) | expands (+27/+14/—) | yes, disc & val | n/a | — | — | — | — | — | NO (holdout unmeasurable) |
| MATRIX | any of 12 cells | — | — | — | — | — | — | — | — | — | NO (no parent passed) |

**Passing states: 0 of 16 directional, 0 of 2 volatility states, 0 of 8 transitions, 0 of 12 matrix cells.**

## 4. Decision inputs for the final report

- MARKET_STATE_EDGE_FOUND = NO
- STRONGEST_NON_PASSING_CANDIDATES (for the record only, not for use): D2 UP (+0.06 / +0.04 / +0.15 ATR at h10, all CIs include zero, single-year share 54 %); D3 DOWNTREND (+0.29 / −0.07 / +0.47, validation negative, r < 1); ALIGNED_BEAR|HIGH (+1.32 / −0.41 / +1.48 on n 31 / 63 / 36).
- VOLATILITY_MEAN_REVERSION = CONSISTENT SIGN, BELOW SIZE GATE.
- NEXT_GATE = C (change research premise; do not invent another structure/state model on price alone).
