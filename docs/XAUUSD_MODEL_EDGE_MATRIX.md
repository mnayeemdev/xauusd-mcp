# XAUUSD_MODEL_EDGE_MATRIX

Research only (2026-09-26). Source: `validation/master_edge_validation/master_edge_results.json` (CURRENT production rules replayed on 129 sessions, 2026-04-29 → 2026-09-25, production exit stack, 0.01 lot, 1,406 completed outcomes). Nothing in production was changed.

## Full model matrix

| Metric | MC | PB | BO | SR | MR | ALL |
|---|---|---|---|---|---|---|
| Signal count (distinct) | 188 | 236 | 854 | 112 | 57 | 1,447 |
| Trade count (completed) | 188 | 226 | 832 | 107 | 53 | 1,406 |
| Win rate % | 51.6 | 45.6 | 52.6 | 40.2 | 54.7 | 50.5 |
| Profit factor | 1.11 | 0.91 | 1.14 | 0.41 | 2.31 | 1.07 |
| Mean R | +0.024 | −0.122 | +0.047 | −0.377 | +0.490 | +0.001 |
| Median R | +0.11 | −0.47 | +0.12 | −0.73 | +0.19 | +0.03 |
| Total R | +4.5 | −27.5 | +39.3 | −40.4 | +26.0 | +1.9 |
| Net USD at 0.01 | +131.5 | −99.9 | +406.9 | −220.3 | +181.3 | +399.4 |
| Average winner R | +0.97 | +1.08 | +1.22 | +0.78 | +1.79 | +1.16 |
| Average loser R | −0.98 | −1.13 | −1.25 | −1.15 | −1.08 | −1.18 |
| Largest winner R | +3.44 | +4.25 | +14.35 | +4.85 | +6.79 | +14.35 |
| Largest loser R | −1.56 | −1.66 | −1.68 | −1.60 | −1.62 | −1.68 |
| Max losing streak | 7 | 6 | 8 | 6 | 3 | 9 |
| Max winning streak | 6 | 6 | 8 | 4 | 5 | 11 |
| Mean MAE R | 0.75 | 0.97 | 1.02 | 1.07 | 0.89 | 0.97 |
| Mean MFE R | 1.06 | 1.28 | 1.53 | 1.06 | 1.91 | 1.40 |
| Average holding (5m bars) | 16.6 | 11.9 | 8.6 | 5.9 | 8.3 | 10.0 |
| 95 % CI mean R (normal) | [−0.142, +0.190] | [−0.292, +0.049] | [−0.074, +0.168] | [−0.604, −0.151] | [−0.058, +1.038] | [−0.083, +0.086] |
| 95 % CI mean R (bootstrap) | [−0.150, +0.203] | [−0.292, +0.052] | [−0.069, +0.175] | [−0.589, −0.145] | [−0.018, +1.033] | [−0.082, +0.085] |
| Discovery (77 sessions) mean R / PF / n | +0.108 / 1.33 / 117 | −0.090 / 0.97 / 133 | +0.086 / 1.24 / 500 | −0.429 / 0.38 / 69 | +0.391 / 1.90 / 25 | +0.028 / 1.16 / 844 |
| Validation (52 sessions) mean R / PF / n | −0.115 / 0.79 / 71 | −0.167 / 0.83 / 93 | −0.011 / 1.00 / 332 | −0.284 / 0.47 / 38 | +0.578 / 2.72 / 28 | −0.039 / 0.95 / 562 |
| BUY: n / mean R / PF | 78 / +0.055 / 1.23 | 88 / −0.102 / 0.78 | 337 / +0.042 / 1.03 | 43 / −0.407 / 0.33 | 18 / +0.718 / 3.32 | 564 / +0.009 / 1.00 |
| SELL: n / mean R / PF | 110 / +0.002 / 1.03 | 138 / −0.134 / 1.01 | 495 / +0.051 / 1.23 | 64 / −0.358 / 0.46 | 35 / +0.373 / 2.06 | 842 / −0.004 / 1.12 |
| Winners: mean MAE R (share > 0.5 R) | 0.39 (28 %) | 0.49 (47 %) | 0.51 (44 %) | 0.48 (37 %) | 0.43 (28 %) | 0.49 (41 %) |
| Losers: mean MFE R (share ≥ 1 R) | 0.39 (1 %) | 0.45 (6 %) | 0.47 (10 %) | 0.41 (8 %) | 0.64 (17 %) | 0.46 (8 %) |
| **Classification** | NO_DEMONSTRATED_EDGE | NO_DEMONSTRATED_EDGE | NO_DEMONSTRATED_EDGE | **NEGATIVE_EVIDENCE** | **PROMISING_BUT_UNPROVEN** | **EDGE_NOT_DEMONSTRATED** |

Classification rule applied (not win rate): EDGE_SUPPORTED requires n ≥ 100, bootstrap CI lower bound > 0, PF > 1.2 and positive mean R in both walk-forward halves; PROMISING_BUT_UNPROVEN requires n ≥ 30, mean R > 0.1 and PF > 1.1; NEGATIVE_EVIDENCE requires CI upper bound < 0, or n ≥ 30 with PF < 0.8 and mean R < −0.1; otherwise NO_DEMONSTRATED_EDGE.

## Model notes

- **BO** carries 59 % of all trades and all of the strategy's gross profit, but its edge disappears in the validation half (PF 1.24 → 1.00). Its losses concentrate in sub-5 USD stops (390 of 832 BO trades) where the 1.5 × fail-safe fires.
- **MC** is positive only in the discovery half; holding time is the longest (16.6 bars) and its winners are small (+0.97 R). It fires only under a directional 15m bias, the regime group with negative expectancy.
- **PB** is negative in both halves and in both directions. Median R −0.47: most PB trades lose modestly after the correction "resolves".
- **SR** is the only model with a CI entirely below zero, negative in both halves and both directions, shortest holding (5.9 bars), win rate 40 %.
- **MR** is the only model positive in both halves (PF 1.90 → 2.72), with the largest average winner (+1.79 R) and the smallest loss streak, but n = 53 and the bootstrap CI still touches zero. It requires 15m RANGE, a non-trending 30m and a fresh 5m sweep, so it is rare (≈ 1 signal per 2.3 sessions).

## Where the edge exists (best-supported conditions, CURRENT rules)

| Condition | n | Mean R | PF | CI95 |
|---|---|---|---|---|
| 15m NEUTRAL bias (RANGE / COMPRESSION / TRANSITION) | 530 | +0.161 | 1.35 | [+0.004, +0.330] |
| Structural stop 8–12 USD | 271 | +0.183 | 1.37 | [+0.016, +0.340] |
| MR model | 53 | +0.490 | 2.31 | [−0.018, +1.033] |
| 30m RANGE context | 145 | +0.256 | 1.24 | [−0.053, +0.582] |

## Where the strategy loses (worst-supported conditions)

| Condition | n | Mean R | PF | CI95 |
|---|---|---|---|---|
| Signal during a 15m-lag episode (bias side against 5m structure) | 82 | −0.426 | 0.47 | [−0.658, −0.170] |
| SR model | 107 | −0.377 | 0.41 | [−0.589, −0.145] |
| Quality 85+ | 296 | −0.216 | 0.70 | [−0.379, −0.058] |
| 5m trend aligned with a directional 15m bias (continuation) | 489 | −0.128 | 0.96 | [−0.254, −0.009] |
| Stops < 5 USD | 523 | −0.116 | 0.83 | — |
| Asia session | 554 | −0.069 | 0.98 | [−0.201, +0.064] |
