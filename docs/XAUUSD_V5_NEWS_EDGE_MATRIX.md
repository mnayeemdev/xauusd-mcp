# XAUUSD_V5_NEWS_EDGE_MATRIX

Research only (2026-09-26). Consolidated gate table for the V5 scheduled-news study, from `validation/v5_news_edge/v5_results.json` (`gates`, `holdout`). Gates and minimum samples are those pre-declared in `docs/XAUUSD_V5_RESEARCH_PROTOCOL.md` §9–§10. The holdout (2025-09-01 → 2026-09-25) was computed only for candidates with a machine-written `validation_pass_*.json` artifact; four exist, all volatility/safety type.

## 1. Gate matrix (D = discovery 2022-07 → 2024-06, V = validation 2024-07 → 2025-08)

| Family | n D / V | Type 2 VOL (RR 60 ≥ 1.5, CI > 1, both) | Pre-compression (≤ 0.85, both) | Compression→expansion link | Type 4 CONT | Type 3 REV | Type 1 DIR | Type 5 SAFETY (bar-0 ≥ 3×, both) | Classification |
|---|---|---|---|---|---|---|---|---|---|
| CPI | 24 / 14 | **PASS** 2.78 / 1.79 → holdout 1.67 [1.30, 2.05] (n 12) | fail 1.02 / 0.85 | fail (+0.28 p 0.19 / +0.54 p 0.05, wrong sign for compression) | INCONCLUSIVE (N) | INCONCLUSIVE (N) | INCONCLUSIVE (N) | fail (4.26 / 2.73) | **VOLATILITY_ONLY (confirmed)** |
| NFP | 23 / 14 | **PASS** 2.21 / 2.40 → holdout 2.06 [1.62, 2.64] (n 11) | fail 0.87 / 0.99 | fail (−0.12 / +0.64) | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | **PASS** 3.10 / 4.13 → holdout 3.80 [2.77, 4.86] | **VOLATILITY + SAFETY (confirmed)** |
| PPI | 24 / 14 | fail 1.34 / 1.26 | fail 0.88 / 0.81 | fail | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | fail 1.69 / 1.34 | REGIME_DEPENDENT magnitude, small |
| JOLTS | 20 / 14 | fail 1.47 / 1.10 | fail 0.98 / 0.99 | fail | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | fail 1.80 / 1.29 | NO_EFFECT (validation ≈ control) |
| FOMC | 13 / 9 | INCONCLUSIVE (N < 15) — descriptive 5.80 / 3.89 | INCONCLUSIVE — 1.10 / 0.88 (expansion in the last 15 min) | fail | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE — 6.97 / 4.01 | INCONCLUSIVE for gates; largest magnitude descriptively |
| PCE | 21 / 11 | fail 1.35 / 1.04 | fail 0.88 / 0.97 | fail | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | fail 1.57 / 1.16 | NO_EFFECT (validation ≈ control) |
| GDP advance | 7 / 4 | INCONCLUSIVE | INCONCLUSIVE | — | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE (N) |
| USD_0830 pooled | 99 / 57 | **PASS** 1.89 / 1.62 → holdout 1.51 [1.28, 1.76] (n 42) | fail 0.92 / 0.92 | fail (+0.17 p 0.10 / +0.33 p 0.009: positive, i.e. clustering not compression) | **FAIL** (P 0.475 vs control 0.475; mean −0.26) | **FAIL** (P full reversal 0.20 vs control 0.29) | **FAIL** (−0.32 [−1.49, +0.74] / +0.23 [−0.67, +1.27]) | fail 2.57 / 2.26 | **VOLATILITY_ONLY (confirmed)** |

Passing candidates: 4 (VOL_CPI, VOL_NFP, VOL_USD_0830, SAFETY_NFP), all Type 2/5. Directional, continuation, reversal: 0 pass; pooled family fails outright; single families cannot reach the pre-declared minimum N on 4.1 years of 15m data.

## 2. Holdout results (Type 2/5 candidates only)

| Candidate | Holdout n | Metric | Holdout value | Gate threshold | Result |
|---|---|---|---|---|---|
| VOL_CPI | 12 | RR 60 ratio | 1.67 [1.30, 2.05] | ≥ 1.5, CI > 1 | CONFIRMED (smaller than discovery 2.78; CPI shock shrinking over time) |
| VOL_NFP | 11 | RR 60 ratio | 2.06 [1.62, 2.64] | ≥ 1.5, CI > 1 | CONFIRMED |
| VOL_USD_0830 | 42 | RR 60 ratio | 1.51 [1.28, 1.76] | ≥ 1.5, CI > 1 | CONFIRMED at the threshold |
| SAFETY_NFP | 11 | release-bar range ratio | 3.80 [2.77, 4.86] | ≥ 3, CI > 1 | CONFIRMED |

Holdout directional/continuation panels for these families are descriptive only (they were not candidates): pooled P(continuation 60) 0.595 vs control 0.512, mean +0.25 [−0.38, +0.87]; signed 60 +0.95 [+0.05, +1.76] in the 2025–26 bull market with P(positive) 0.67; CPI signed 60 +1.77 [+0.45, +3.19] (n 12). These are the period's drift (V4: holdout baseline +0.9 ATR per 10 days) appearing in a 12-event sample, not a news-conditioned direction, and the discovery/validation regions showed the opposite sign.

## 3. Multiple-testing note

8 families × 5 windows × 5 types = 200 discovery cells; about 10 spurious 5 % exclusions expected. The CI-excluding directional cells observed (FOMC discovery signed 60, PPI validation continuation, GDP discovery continuation, 5m cont 5/10 means) are single-region, small-N, and reverse or vanish in the other region: consistent with chance. The volatility cells are not chance: ratios 2–7 with CIs far from 1 in every region and every year.

## 4. Best effect (for the record)

- BEST_NEWS_EFFECT = NFP release-window volatility (60-min realized range 2.2 / 2.4 / 2.1 × matched control; release bar 3.1 / 4.1 / 3.8 ×).
- BEST_EFFECT_TYPE = TYPE 2 volatility (with a Type 5 safety component).
- BEST_EFFECT_N = 23 / 14 / 11 (discovery / validation / holdout).
- BEST_EFFECT_VS_MATCHED_BASELINE = 2.21 / 2.40 / 2.06 ×.
- BEST_EFFECT_95CI = [2.00, 2.43] / [2.02, 2.87] / [1.62, 2.64].
- BEST_EFFECT_YEAR_STABILITY = ratio > 1 in every half-year: 2022 H2 2.01, 2023 2.29, 2024 H1 2.27, 2024 H2 2.68, 2025 2.17.
- BEST_EFFECT_OUTLIER_DEPENDENCE = low (mean without the largest event and 5/95-winsorized mean within 3 % of the full mean in each region).
- It is not a trading edge: it says how much gold moves after NFP, not which way, and continuation after the first completed bar is absent.

## 5. Decisions

- DIRECTIONAL_NEWS_EDGE = NO (pooled fails; single families inconclusive; signs flip).
- VOLATILITY_NEWS_EDGE = YES (Type 2; CPI, NFP, pooled 08:30; confirmed on the holdout; FOMC descriptively largest but N-limited).
- REVERSAL_NEWS_EDGE = NO.
- CONTINUATION_NEWS_EDGE = NO (pooled), INCONCLUSIVE (single families).
- SAFETY_FINDING = YES: NFP (and CPI, FOMC descriptively) release bars are 3–7 × normal range; volatility takes 30–60 min after BLS/BEA releases and 105–150 min or more after FOMC to normalise; the FOMC press-conference hour is as volatile as the statement window; pre-event compression is too mild to be a signal; executability at the release second is unmeasured (no tick history).
- REPEATABLE_NEWS_CONDITIONED_EDGE (tradeable) = NO. V5_STRATEGY_PREMISE_SUPPORTED = NO. PRIMARY_FAILURE_REASON = scheduled releases change how much XAUUSD moves, not which way or whether the first move continues or reverses; no forecast data exists to test surprise-conditioned direction.
- CAPITAL_SCALING_READY = NO.
- **NEXT_GATE = D**: news provides safety/volatility information only. The existing News/Shock protection (a safety layer, unchanged) can be *reviewed* against these measurements (window lengths per family, FOMC press-conference coverage, normalisation times); no entry strategy follows from V5 and no change is made here.
