# XAUUSD_V5_NEWS_BEHAVIOUR_STUDY

Research only (2026-09-26). Studies A–E, H and I of `docs/XAUUSD_V5_RESEARCH_PROTOCOL.md`, computed once by `validation/v5_news_edge/v5_news.mjs` → `v5_results.json`. Production untouched; no rule is derived. Units: ATR_ref = mean 15m true range of the 24 h before the event (excluding the last hour). "Ratio" = event mean / matched-control mean (same weekday, same ET clock time, ±6 weeks, no listed event within ±4 h), bootstrap 95 % CI in brackets. Regions: DISCOVERY 2022-07 → 2024-06, VALIDATION 2024-07 → 2025-08; HOLDOUT (2025-09 → 2026-09) only for the four candidates that passed validation (all volatility/safety type).

## 1. Study A — does merely being near a scheduled release change behaviour? YES for magnitude, NO for direction

Release bar [0,15) range and 60/240-minute realized range, ratio to matched control:

| Family | n D / V | Bar-0 range D | Bar-0 range V | RR 60 D | RR 60 V | RR 240 D | RR 240 V | Holdout RR 60 (n) |
|---|---|---|---|---|---|---|---|---|
| CPI | 24 / 14 | 4.26 [3.61, 4.92] | 2.73 [1.99, 3.58] | 2.78 [2.46, 3.10] | 1.79 [1.42, 2.19] | 1.73 | 1.32 | **1.67 [1.30, 2.05]** (12) |
| NFP | 23 / 14 | 3.10 [2.64, 3.63] | 4.13 [2.92, 5.81] | 2.21 [2.00, 2.43] | 2.40 [2.02, 2.87] | 1.46 | 1.69 | **2.06 [1.62, 2.64]** (11) |
| FOMC | 13 / 9 | 6.97 [5.61, 8.51] | 4.01 [2.23, 6.47] | 5.80 [5.02, 6.58] | 3.89 [2.48, 5.64] | 4.23 | 2.63 | not opened (N < 15) |
| PPI | 24 / 14 | 1.69 [1.37, 2.07] | 1.34 [1.07, 1.68] | 1.34 [1.17, 1.55] | 1.26 [1.06, 1.48] | 1.06 | 1.10 | — |
| JOLTS | 21 / 14 | 1.80 [1.47, 2.19] | 1.29 [0.99, 1.67] | 1.47 [1.28, 1.67] | 1.10 [0.95, 1.28] | 1.23 | 1.09 | — |
| PCE | 21 / 11 | 1.57 [1.30, 1.93] | 1.16 [0.93, 1.43] | 1.35 [1.23, 1.50] | 1.04 [0.89, 1.18] | 1.04 | 1.05 | — |
| GDP adv | 7 / 4 | 1.54 | 1.14 | 1.41 | 1.20 | 1.18 | 1.12 | — |
| USD_0830 pooled | 99 / 57 | 2.57 [2.29, 2.91] | 2.26 [1.81, 2.76] | 1.89 [1.73, 2.06] | 1.62 [1.42, 1.83] | 1.32 | 1.30 | **1.51 [1.28, 1.76]** (42) |

- Signed 60-minute move (long convention, ATR_ref): CPI −0.17 [−3.87, +3.24] / +0.75 [−1.61, +3.49]; NFP −1.08 [−3.51, +1.27] / +0.98 [−0.96, +3.46]; FOMC +3.91 [+0.33, +8.03] / −1.01 [−5.06, +2.13]; pooled −0.32 [−1.49, +0.74] / +0.23 [−0.67, +1.27]; P(positive at 60) pooled 0.49 / 0.56. No family has a stable sign; the one CI-excluding cell (FOMC discovery, n 13) reverses in validation.
- Absolute 60-minute move ratio: CPI 3.65 / 1.98, NFP 2.45 / 2.15, FOMC 6.38 / 4.30, pooled 2.15 / 1.70 (holdout 1.65). Absolute 240-minute move ratio: pooled 1.29 / 1.68.
- MFE and MAE (long) at 60 min are both elevated in similar proportion (CPI 3.4 / 2.8, NFP 1.7 / 3.2, FOMC 8.3 / 3.9, pooled 1.9 / 2.0): the extra movement is two-sided.
- Time to peak |move| within 240 min: pooled 135 / 163 min vs control 149 min (ratio 0.91 / 1.07): the peak is not systematically early.
- Volatility normalisation (first bar whose range ≤ 1.5 × control median for the slot), median minutes: CPI 60 / 30 / 30 (holdout), NFP 45 / 30 / 30, PPI 22 / 15, JOLTS 15 / 15, PCE 30 / 15, pooled 30 / 15 / 22; FOMC 150 / 105 with 31 % / 11 % of meetings not back to normal within 4 h.
- Year-by-year RR 60 ratio (pooled): 2022 H2 1.97, 2023 1.83, 2024 H1 1.96, 2024 H2 1.83, 2025 1.46. CPI by period 3.35 → 2.53 → 2.76 → 2.09 → 1.55 → 1.67 (holdout): the CPI shock has been shrinking as inflation normalised; NFP is stable (2.0–2.7).

Verdict: **RELEASE_VOLATILITY_EFFECT = YES**, large, stable in sign in every region and year, confirmed out of sample for CPI, NFP and the pooled 08:30 family (Type 2). PPI, JOLTS, PCE and GDP produce a 15–80 % larger release bar in discovery but ≈ 1.0–1.3 in validation: regime-dependent, below the 1.5 gate. No directional content.

## 2. Study B — pre-news compression: mild, mostly in the [−60,−30) window, not predictive of expansion

Pre-window realized-range ratios (event / control):

| Family | [−60,−30) D / V | [−30,−15) D / V | [−15,0) D / V | [−60,0) D / V |
|---|---|---|---|---|
| CPI | 0.91 / 0.83 | 1.05 / 0.92 | 1.12 / 0.82 | 1.02 [0.90, 1.14] / 0.85 [0.72, 0.98] |
| NFP | 0.77 [0.70, 0.85] / 0.91 | 0.84 / 1.10 | 1.01 / 1.01 | 0.87 [0.79, 0.96] / 0.99 [0.83, 1.19] |
| PPI | 0.87 / 0.77 | 0.90 / 0.78 | 0.87 / 0.90 | 0.88 [0.78, 0.99] / 0.81 [0.73, 0.89] |
| PCE | 0.89 / 0.87 | 0.89 / 1.07 | 0.86 / 1.03 | 0.88 [0.79, 0.97] / 0.97 [0.80, 1.16] |
| JOLTS | 1.01 / 0.98 | 0.96 / 1.08 | 0.96 / 0.92 | 0.98 / 0.99 |
| FOMC | 0.90 / 0.79 | 1.21 [1.03, 1.40] / 0.91 | **1.49 [1.22, 1.81]** / 1.07 | 1.10 / 0.88 |
| USD_0830 pooled | 0.87 [0.81, 0.93] / 0.86 [0.78, 0.95] | 0.93 / 0.98 | 0.96 / 0.97 | 0.92 [0.87, 0.97] / 0.92 [0.85, 1.00] |

- The hour before a BLS/BEA release is 8–13 % quieter than the same hour on control days, concentrated in [−60,−30); the last 15 minutes are not quieter. Before FOMC the last 15–30 minutes are *busier* (positioning into 14:00), not compressed. On 5m data (2025-05 →, pooled n 80) [−15,−5) ratio 0.97 and [−5,0) 1.10: no last-minute compression.
- Gate (≤ 0.85 with CI excluding 1 in both regions): fails for every family (closest: PPI 0.88 / 0.81, pooled 0.92 / 0.92).
- Compression → expansion link (Spearman between the pre [−60,0) ratio and the post [0,60) ratio): pooled **+0.17** (perm p 0.095) / **+0.33** (p 0.009) / holdout +0.43 (p 0.006); NFP −0.12 / +0.64; CPI +0.28 / +0.54. The sign is **positive**: a busier pre-window goes with a bigger post-window (volatility clustering), the opposite of "compression predicts expansion". PRE_NEWS_COMPRESSION_EFFECT = MILD (8–13 %), NOT PREDICTIVE OF EXPANSION.

## 3. Study C — release shock

- First 15m bar displacement |close − open| ratio: CPI 5.17 [3.54, 7.17] / 3.08; NFP 4.46 / 4.35; FOMC 7.04 / 5.83; PPI 1.52 / 1.11; pooled 2.96 / 2.31 / 2.44 (holdout). In USD (2025 levels, ATR_ref ≈ 3–5 USD): a CPI or NFP release bar typically travels 10–25 USD.
- First 5m bar (2025-05 →, pooled n 80): displacement ratio 3.21 [2.4, 4.1 vs control 0.9], range ratio 2.95; [0,15) realized range 2.18×; [0,60) 1.64×. First 1m: only 3 months of data (≈ 12 events); not tabulated.
- Persistence of the first-bar direction (sign of the [0,h) move equals the first-bar sign): pooled 60 min 0.80 / 0.75 / 0.81 (holdout) vs control 0.72 / 0.65 / 0.69; 240 min 0.63 / 0.72 vs control 0.60 / 0.61. Full reversal within 60 min (close on the other side of the release open): pooled 0.20 / 0.25 / 0.19 vs control 0.29 / 0.35 / 0.32; within 120 min 0.29 / 0.28. Because the release bar itself is 3–5× a normal bar, its sign dominates the [0,h) move mechanically; this is not evidence of continuation beyond the bar (Study D).
- Volatility normalisation: 15–60 min for BLS/BEA releases, 105–150 min or longer for FOMC (see §1).

## 4. Study D — continuation after the first completed bar: NO

Move in the first-bar direction measured from the first-bar close (ATR_ref), and P(> 0):

| Family | cont 15 D / V | cont 30 D / V | cont 60 D / V | P(cont 60 > 0) D / V | control P |
|---|---|---|---|---|---|
| CPI | −0.19 / −0.27 | +0.22 / −0.58 | −0.89 [−2.97, +1.31] / −0.86 [−2.29, +0.66] | 0.46 / 0.43 | 0.46 / 0.49 |
| NFP | −0.06 / −0.40 | +0.07 / −0.91 | −0.22 / −1.41 [−3.42, +0.42] | 0.52 / 0.43 | 0.49 / 0.47 |
| PPI | +0.02 / −0.14 | −0.10 / +0.02 | −0.50 / +1.37 [+0.01, +3.06] | 0.42 / 0.79 | 0.45 / 0.42 |
| JOLTS | +0.30 / −0.04 | −0.10 / +0.29 | +0.09 / +0.21 | 0.38 / 0.64 | 0.53 / 0.51 |
| FOMC | −0.12 / +0.06 | +0.18 / −0.77 | +0.30 / −1.42 | 0.62 / 0.33 | 0.47 / 0.49 |
| PCE | −0.45 / +0.11 | −0.01 / +0.57 | −0.08 / +0.95 | 0.43 / 0.55 | 0.49 / 0.42 |
| USD_0830 pooled | −0.16 [−0.51, +0.18] / −0.08 | +0.06 / −0.11 | −0.26 [−0.97, +0.48] / +0.11 [−0.69, +0.94] | **0.475 / 0.561** | 0.475 / 0.445 |

- Pooled discovery: continuation probability 0.475, identical to control; mean continuation negative. Validation: 0.561 vs control 0.445 with mean +0.11 (CI −0.69 to +0.94). Holdout (opened only for the volatility candidates; reported descriptively): 0.595 vs 0.512, mean +0.25 [−0.38, +0.87]. Single families flip sign between regions (PPI −0.50 → +1.37, FOMC +0.30 → −1.42, NFP −0.22 → −1.41).
- 5m sub-study (first 5m bar, pooled n 80, 2025-05 → 2026-09): cont 5 +0.40 [+0.02, +0.79] with P 0.51 vs control 0.48; cont 10 +0.45 [+0.04, +0.90] P 0.55 vs 0.54; cont 15 +0.14 [−0.33, +0.59]; cont 60 +0.56 [−0.56, +1.67] P 0.56 vs 0.52. The positive 5–10 min means come with a coin-flip hit rate, i.e. a few large second-bar moves; descriptive, mixed families, includes holdout dates, not a gated result.
- Gate (Type 4) for the pooled family: FAIL (discovery P 0.475 < 0.58, mean −0.26). Single families: INCONCLUSIVE (N < 30). INITIAL_MOVE_CONTINUATION = NO (pooled), INCONCLUSIVE (single families).

## 5. Study E — reversal: NO edge; retracement is the norm, full reversal is rarer than on normal days

- Median retracement of the first-bar move during the next 60 min (as a fraction of the first-bar displacement): pooled 0.91 / 1.37; CPI 0.88 / —, NFP —, i.e. the typical release move gives back roughly its own size within the hour, but from a base 3–5× larger than normal.
- Full reversal within 60 min: pooled 0.20 [0.12, 0.28] / 0.25 [0.14, 0.37] vs control 0.29 / 0.35 (lower, not higher). Mean 60-min move against the initial direction: +0.26 / −0.11 ATR_ref (CIs include 0). Gate (Type 3): FAIL.
- Second leg after a full reversal (P that the 240-min move is in the reversal direction): 0.80 (n 20) / 0.64 (n 14) vs control 0.51 / 0.56; the validation difference +0.09 has CI [−0.21, +0.39]. Too few observations; descriptive only.
- Liquidity sweep / false breakout / spike shapes are not separately classifiable on 15m bars; the 5m panel shows the same picture (full reversal within 60 min 0.21 vs control 0.40). INITIAL_MOVE_REVERSAL = NO.

## 6. Study H — FOMC (statement vs press conference)

n 13 discovery / 9 validation (below the §9 minimum for any gate → INCONCLUSIVE for promotion; descriptive):
- Statement window [0,30) realized range 5.31 [4.39, 6.27] / 3.24 [1.95, 4.89] × control; press-conference window [30,90) 5.60 [4.76, 6.48] / 4.15 [2.78, 5.85] × control; absolute move in [30,90) 7.9 / 6.8 × control. The press-conference hour is at least as volatile as the statement half-hour.
- Signed [30,90) move +1.14 [−2.62, +4.59] / −2.20 [−6.23, +1.77]: no direction. Signed [0,60): +3.91 / −1.01 (sign flip).
- Persistence of the statement-bar direction at 240 min 0.85 / 0.33; full reversal within 120 min 0.15 / 0.67: the two regions disagree completely.
- Volatility normalises after 150 / 105 min (median); in 31 % / 11 % of meetings not within 4 h. Largest single-family magnitude effect in the study; no directional or path regularity.
- Contamination: no listed event within ±4 h of any FOMC statement. Press-conference start time (14:30 ET) is Fed practice, not printed on archived pages; only used for the window split.

## 7. Study I — NFP cluster

The Employment Situation is analysed as one cluster (payrolls, unemployment rate, earnings, revisions released together). Without forecasts no multi-variable surprise consistency can be measured. Cluster behaviour: release bar 3.1–4.1× control, 60-min range 2.2–2.4× (holdout 2.1×), pre-hour 13 % quieter in discovery only, first-bar persistence at 60 min 0.83 / 0.71 (control 0.70 / 0.63), continuation after the first bar −0.22 / −1.41 with P 0.52 / 0.43, full reversal 0.17 / 0.29. Volatility normalises in 30–45 min. NFP_RESULT = VOLATILITY_ONLY + SAFETY (release-bar range ≥ 3× in all three regions).

## 8. Executability (1m spread column, 2026-06-26 → 2026-09-25)

Spread at the release minute vs same-weekday same-clock-time controls: NFP (n 3) median ratio 1.00, max 1.42; CPI (n 3) 1.00 (max 1.42 one minute later); PPI (n 3) 1.00; FOMC (n 2) 1.04; typical 240–260 points (0.24–0.26 USD). The MT5 bar spread column records the spread when the bar forms and does not capture intra-minute widening; ticks are unavailable. Executability at the release second is therefore **unmeasured**, not shown to be normal. Raw-behaviour findings above are not executability findings.

## 9. Summary of behaviour findings

- Magnitude: strong, stable, out-of-sample-confirmed for CPI, NFP and the pooled 08:30 family; FOMC largest but N-limited; PPI/JOLTS/PCE/GDP regime-dependent and small.
- Pre-event: mild compression an hour before BLS/BEA releases, expansion before FOMC; not predictive of the size of the release move (positive volatility clustering instead).
- Direction, continuation, reversal: nothing repeatable; signs flip between regions and within families; hit rates equal matched controls.
- Safety: release bars of 3–7× normal range for CPI, NFP, FOMC; volatility takes 30–60 min (BLS/BEA) or 2–4 h (FOMC) to normalise; press-conference hour as volatile as the statement.
