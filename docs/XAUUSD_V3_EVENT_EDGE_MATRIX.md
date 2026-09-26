# XAUUSD_V3_EVENT_EDGE_MATRIX

Research only (2026-09-26). Source: `validation/v3_multiyear_event_study/v3_event_results.json`. Feed: Exness XAUUSDm (see `XAUUSD_V3_DATA_INTEGRITY.md`). Values are the excess move over the region's unconditional drift, in ATR14 units, at the 4-, 8- and 16-bar horizons, with the 95 % CI of the 8-bar excess; r = MFE/MAE at 8 bars; p05 = probability of +0.5 ATR before −0.5 ATR over the full horizon. D / V / H = discovery / validation / holdout. Gate = pre-declared discovery gate (N, ≥ 2 CI-positive horizons, r ≥ 1.10 at ≥ 4 bars, p05 ≥ 53 %).

## 15m (2022-07 → 2026-09; drift at 8 bars D +0.059, V +0.122, H +0.059)

| Event | Dir | N D/V/H | D excess h4 / h8 [CI] / h16 · r · p05 | V excess h4 / h8 / h16 · r · p05 | H excess h4 / h8 / h16 · r · p05 | Gate | Class |
|---|---|---|---|---|---|---|---|
| A range sweep | bull | 97/66/73 | +0.05 / +0.16 [−0.23, +0.56] / +0.30 · 1.02 · 44 | +0.27 / +0.40 / +0.59 · 1.12 · 41 | −0.17 / −0.45 / −0.51 · 0.72 · 48 | fail (N) | NO_EDGE |
| A range sweep | bear | 109/73/60 | +0.21 / +0.14 [−0.34, +0.62] / +0.82 · 1.06 · 43 | −0.67 / **−1.14 [−1.85, −0.42]** / −1.41 · 0.52 · 36 | +0.08 / +0.23 / −0.16 · 1.10 · 43 | fail (1 CI horizon, p05) | REGIME_DEPENDENT |
| B sweep + reclaim | bull | 32/26/23 | −0.12 / +0.18 / +0.08 · 0.96 · 50 | +0.25 / +0.07 / +0.05 · 1.12 · 46 | −0.02 / −0.41 / −0.10 · 0.83 · 48 | fail (N) | NO_EDGE |
| B sweep + reclaim | bear | 43/25/24 | −0.08 / −0.25 / +0.39 · 0.79 · 42 | −0.84 / −1.42 / −1.50 · 0.38 · 28 | −0.27 / +0.13 / −0.35 · 1.00 · 50 | fail (N) | NO_EDGE |
| C sweep + CHoCH | bull | 16/6/9 | +0.15 / +0.82 / +1.07 · 1.32 · 38 | +0.02 / −0.40 / −1.19 · 0.69 · 33 | −0.41 / −0.31 / −0.17 · 0.76 · 56 | fail (N) | NO_EDGE |
| C sweep + CHoCH | bear | 13/8/6 | +0.20 / +0.34 / +0.34 · 1.45 · 46 | −0.37 / −1.11 / −0.70 · 0.47 · 38 | +0.81 / +0.65 / +0.81 · 2.77 · 67 | fail (N) | NO_EDGE (n too small) |
| D failed breakout | bull | 140/70/87 | −0.05 / −0.19 [−0.61, +0.23] / −0.49 · 0.92 · 44 | +0.35 / +0.07 / −0.07 · 1.05 · 41 | +0.04 / −0.07 / −0.23 · 0.88 · 54 | fail | NO_EDGE |
| D failed breakout | bear | 146/124/106 | +0.06 / +0.25 [−0.12, +0.63] / −0.12 · 1.07 · 51 | −0.03 / −0.41 / −0.23 · 0.81 · 49 | +0.06 / +0.02 / −0.19 · 1.08 · 39 | fail | NO_EDGE |
| E BOS retest HOLD | bull | 265/168/149 | +0.12 / −0.05 [−0.33, +0.23] / +0.22 · 1.07 · 45 | +0.09 / +0.14 / +0.31 · 1.16 · 46 | +0.23 / +0.34 [+0.02, +0.66] / +0.39 · 1.17 · 46 | fail | NO_EDGE (holdout-only) |
| E BOS retest HOLD | bear | 245/127/161 | +0.07 / −0.25 [−0.51, +0.01] / −0.18 · 0.97 · 49 | −0.02 / +0.10 / +0.07 · 1.00 · 46 | +0.31 / **+0.54 [+0.20, +0.88]** / +1.14 · 1.57 · 55 | fail | sign reversal D→H |
| E BOS retest FAIL | bull | 59/29/33 | +0.05 / −0.16 / −0.27 · 1.06 · 44 | +0.09 / −0.22 / +0.24 · 0.93 · 41 | −0.16 / −0.46 / −1.28 · 0.64 · 48 | fail (N) | NO_EDGE |
| E BOS retest FAIL | bear | 47/36/29 | −0.02 / +0.18 / −0.26 · 1.13 · 47 | −0.24 / +0.05 / −0.15 · 0.89 · 44 | +0.16 / +0.03 / +0.34 · 1.15 · 41 | fail (N) | NO_EDGE |
| F1 compression break | bull | 457/197/94 | −0.08 / +0.04 [−0.19, +0.26] / +0.24 · 1.06 · 42 | +0.11 / +0.36 [+0.01, +0.71] / +0.48 · 1.28 · 46 | +0.03 / +0.29 / +0.43 · 1.02 · 36 | fail | NO_EDGE (validation-only) |
| F1 compression break | bear | 357/108/92 | 0.00 / −0.02 / +0.01 · 0.95 · 42 | −0.13 / +0.07 / +0.45 · 1.02 · 45 | +0.08 / −0.06 / +0.04 · 1.04 · 30 | fail | NO_EDGE |
| F1 compression accept | bull | 338/152/68 | −0.13 / +0.01 [−0.26, +0.28] / +0.18 · 1.01 · 42 | +0.11 / +0.42 [+0.01, +0.82] / +0.39 · 1.33 · 48 | +0.08 / +0.49 / +0.84 · 1.16 · 40 | fail | NO_EDGE (validation-only) |
| F1 compression accept | bear | 267/80/58 | +0.02 / +0.15 [−0.16, +0.47] / +0.36 · 1.04 · 41 | −0.03 / +0.12 / +0.35 · 1.04 · 45 | +0.28 / +0.09 / +0.31 · 1.15 · 41 | fail (1 CI horizon, p05) | NO_EDGE |
| F2 20-bar box break | both | 5/1/0 | — | — | — | fail (N) | unmeasurable |
| BOS (plain) | bull | 663/453/354 | −0.03 / +0.02 / −0.02 · 1.10 · 41 | −0.03 / 0.00 / +0.03 · 1.02 · 45 | +0.11 / +0.16 / +0.12 · 1.09 · 44 | fail | NO_EDGE |
| BOS (plain) | bear | 602/321/326 | −0.03 / 0.00 / −0.13 · 1.00 · 45 | −0.09 / −0.16 / −0.26 · 0.96 · 39 | +0.07 / +0.20 / +0.15 · 1.22 · 40 | fail | NO_EDGE |
| CHoCH (plain) | bull | 455/278/259 | +0.03 / −0.01 / +0.14 · 1.09 · 47 | +0.12 / +0.10 / +0.16 · 1.08 · 46 | −0.04 / +0.09 / +0.24 · 1.02 · 44 | fail | NO_EDGE |
| CHoCH (plain) | bear | 451/283/246 | −0.06 / −0.10 / −0.07 · 0.97 · 43 | −0.20 / −0.34 [−0.63, −0.05] / −0.14 · 0.83 · 41 | −0.06 / +0.02 / +0.01 · 1.06 · 39 | fail | NO_EDGE |

## 1H (2014-01 → 2026-09, hourly structure from 2017; drift at 8 bars D +0.071, V +0.073, H +0.165)

| Event | Dir | N D/V/H | D excess h4 / h8 [CI] / h16 · r · p05 | V excess h4 / h8 / h16 · r · p05 | H excess h4 / h8 / h16 · r · p05 | Gate | Class |
|---|---|---|---|---|---|---|---|
| A range sweep | bull | 80/48/33 | +0.34 / +0.30 [−0.25, +0.85] / +0.51 · 1.26 · 51 | +0.14 / +0.36 / +0.33 · 1.31 · 33 | −0.38 / −0.71 / −0.40 · 0.66 · 39 | fail (1 CI horizon, p05) | NO_EDGE (holdout reverses) |
| A range sweep | bear | 70/34/29 | −0.22 / −0.15 / −0.10 · 0.85 · 37 | +0.31 / +0.10 / −0.45 · 0.91 · 29 | +0.30 / +0.18 / −0.29 · 1.39 · 45 | fail | NO_EDGE |
| B sweep + reclaim | bull | 32/12/4 | +0.06 / −0.16 / +0.15 · 0.82 · 44 | +0.03 / +0.71 / +0.52 · 1.89 · 42 | — | fail (N) | NO_EDGE |
| B sweep + reclaim | bear | 19/18/8 | +0.32 / +0.41 / +0.30 · 1.60 · 53 | −0.01 / −0.36 / −1.57 · 0.93 · 50 | +0.54 / −0.09 / −0.34 · 1.17 · 63 | fail (N) | NO_EDGE |
| C sweep + CHoCH | both | 19+6 / 7+6 / 2+3 | mixed, n too small | — | — | fail (N) | unmeasurable |
| D failed breakout | bull | 89/56/38 | −0.14 / −0.16 / −0.20 · 0.85 · 46 | +0.27 / +0.26 / +0.49 · 1.31 · 39 | −0.38 / −0.39 / −0.70 · 0.73 · 42 | fail | NO_EDGE |
| D failed breakout | bear | 87/47/40 | +0.15 / +0.21 [−0.18, +0.61] / +0.01 · 1.23 · 40 | 0.00 / +0.02 / −0.33 · 1.04 · 36 | −0.32 / −0.54 / −0.75 · 0.75 · 45 | fail | NO_EDGE |
| E BOS retest HOLD | bull | 158/114/68 | +0.03 / +0.08 [−0.25, +0.42] / −0.10 · 1.11 · 44 | −0.03 / +0.18 / −0.09 · 1.18 · 42 | +0.20 / +0.14 / −0.09 · 0.95 · 40 | fail | NO_EDGE |
| E BOS retest HOLD | bear | 162/60/61 | **+0.42 / +0.38 [+0.08, +0.69] / +0.28 · 1.60 · 49** | −0.10 / −0.17 [−0.69, +0.36] / +0.53 · 0.78 · 38 | +0.31 / +0.48 [−0.07, +1.02] / +0.41 · 1.37 · 52 | fail (p05 < 53) | REGIME_DEPENDENT |
| E BOS retest FAIL | bull | 30/16/14 | −0.02 / −0.51 / −0.22 · 0.74 · 50 | +0.32 / +0.24 / −0.03 · 1.71 · 69 | −0.69 / −0.29 / −0.03 · 0.54 · 14 | fail (N) | NO_EDGE |
| E BOS retest FAIL | bear | 27/18/15 | −0.32 / −0.39 / −0.27 · 0.79 · 37 | −0.13 / +0.25 / +0.85 · 1.04 · 39 | −0.10 / +0.07 / −0.93 · 1.19 · 33 | fail (N) | NO_EDGE |
| F1 compression break | bull | 70/18/37 | +0.16 / +0.39 [−0.31, +1.09] / +0.65 · 1.08 · 50 | −0.41 / −0.72 / −0.66 · 0.79 · 39 | −0.12 / −0.32 / +0.40 · 0.70 · 41 | fail | NO_EDGE |
| F1 compression break | bear | 43/30/14 | −0.28 / −0.21 / +0.40 · 0.96 · 40 | −0.23 / −0.44 / +0.50 · 0.78 · 50 | +0.35 / −0.13 / +0.86 · 1.31 · 43 | fail (N) | NO_EDGE |
| F1 compression accept | bull | 56/12/28 | +0.17 / +0.49 / +0.68 · 1.08 · 52 | −0.04 / −0.15 / +0.27 · 0.95 · 33 | −0.11 / −0.26 / +0.46 · 0.68 · 32 | fail (N) | NO_EDGE |
| F1 compression accept | bear | 30/26/11 | −0.30 / −0.08 / +0.95 · 0.96 · 47 | −0.32 / −0.38 / +0.23 · 0.67 · 31 | +0.06 / −0.55 / +0.88 · 0.93 · 55 | fail (N) | NO_EDGE |
| F2 20-bar box break | both | 1/0/0 | — | — | — | fail (N) | unmeasurable |
| BOS (plain) | bull | 444/219/232 | −0.02 / +0.05 [−0.18, +0.28] / +0.04 · 1.04 · 43 | +0.04 / −0.04 / −0.06 · 1.05 · 42 | +0.24 / +0.30 [+0.02, +0.57] / +0.67 · 1.31 · 51 | fail | NO_EDGE (bull-holdout artefact) |
| BOS (plain) | bear | 366/193/151 | see results file (≈ 0 on D and V) | — | — | fail | NO_EDGE |
| CHoCH (plain) | both | 530 / 266 / 244 total | ≈ 0 at all horizons | ≈ 0 | ≈ 0 | fail | NO_EDGE |

## Summary counts

| | 15m | 1H |
|---|---|---|
| Event-direction cells with adequate N on discovery | 12 | 10 |
| Cells passing the pre-declared gate | 0 | 0 |
| Cells with ≥ 2 CI-positive horizons on discovery | 0 (A bear has 1 at 16 bars) | 1 (E hold bear; fails p05; validation negative) |
| SYMMETRIC events | 0 | 0 |
| ONE_SIDED / REGIME_DEPENDENT | A range sweep bear (validation −1.14, yearly sign alternates); E hold bear (holdout only) | E hold bear (discovery positive, validation negative, holdout positive; sign tied to monthly direction) |

BEST_EVENT (least bad, not an edge) = 1H bearish BOS-with-displacement retest hold: discovery n 162, 8-bar excess +0.38 ATR (CI +0.08 to +0.69), MFE/MAE 1.60, P(+1 ATR before −1) 61 %, but P(+0.5 before −0.5) 49 %, validation n 60 excess −0.17 (CI −0.69 to +0.36), and the effect concentrates in bearish months (+0.75) and disappears in bullish months (−0.03).
