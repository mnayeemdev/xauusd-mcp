# XAUUSD_NEXT_EDGE_RESEARCH_RESULTS — Stage 11B

Results of the pre-declared protocol (`docs/XAUUSD_NEXT_EDGE_RESEARCH_PROTOCOL.md`), computed once by `validation/next_edge_session/next_edge.mjs` (phases gated by files: `discovery_results.json`, `frozen_candidates.json` + `.sha256`, `validation_results.json`; holdout refused; robustness had no survivors). Units: excess move in ATR14(15m) units after subtracting the region drift (per-bar drift × horizon) in the candidate's direction; "net" subtracts a 0.26 USD round-trip spread. Discovery region 2022-09-05 → 2024-06-30. Contemporaneous 15m correlations with gold in discovery (descriptive, not candidates): DXYm −0.56 (beta −1.01), XAGUSDm +0.77, USTECm +0.27.

## 1. Discovery (all families, fixed definitions)

| Candidate | N | h4 | h8 [95 % CI] | h16 | win h8 | PF h8 | MFE/MAE | P(+0.5 first) | net h8 | years + | no-top5 | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1L London OR break BUY | 224 | −0.06 | −0.02 [−0.25, +0.20] | +0.04 | 50 % | 0.96 | 1.01 | 0.49 | −0.16 | 33 % | −0.15 | fail |
| S1L SELL | 221 | +0.05 | +0.04 [−0.22, +0.31] | −0.23 | 51 % | 1.06 | 1.00 | 0.44 | −0.10 | 100 % | −0.09 | fail |
| S1N NY OR break BUY | 216 | −0.03 | −0.03 [−0.27, +0.21] | −0.12 | 49 % | 0.96 | 1.06 | 0.53 | −0.10 | 0 % | −0.16 | fail |
| S1N SELL | 202 | 0.00 | +0.16 [−0.03, +0.34] | +0.22 | 55 % | 1.35 | 1.12 | 0.51 | +0.08 | 67 % | +0.07 | fail (CI, path) |
| S2 Asia-range break BUY | 180 | −0.06 | −0.14 [−0.44, +0.14] | −0.23 | 45 % | 0.82 | 1.01 | 0.49 | −0.28 | 33 % | −0.31 | fail |
| S2 SELL | 157 | 0.00 | −0.07 [−0.42, +0.28] | −0.43 | 45 % | 0.92 | 0.96 | 0.53 | −0.20 | 33 % | −0.27 | fail |
| S3 London→NY continuation (≥ 4 ATR leg) | 79 days | — | +0.55 [−0.33, +1.41] | — | 49 % | 1.44 | 1.26 | 0.54 | +0.46 | 100 % | −0.09 | fail (CI, top-5 dependent) |
| S4 PDH break (continuation +) | 260 | −0.13 | −0.17 [−0.46, +0.15] | −0.64 | 48 % | 0.84 | 0.92 | 0.49 | −0.30 | 67 % | −0.31 | fail (rejection-leaning, not tradeable either way) |
| S4 PDL break (continuation +) | 233 | −0.01 | +0.01 [−0.28, +0.33] | +0.09 | 47 % | 1.01 | 0.95 | 0.48 | −0.12 | 67 % | −0.14 | fail |
| D1 USD-index lead-lag (both) | 4,878 | +0.02 | −0.01 [−0.08, +0.06] | −0.03 | 49 % | 0.99 | 1.03 | 0.50 | −0.13 | 33 % | −0.03 | fail (no lag effect despite −0.56 contemporaneous correlation) |
| D2 silver lead-lag SELL side | 2,239 | +0.12 | +0.20 [+0.07, +0.34] | +0.24 | 55 % | 1.27 | 1.13 | **0.50** | +0.09 | 100 % | +0.18 | **near-miss**: fails only P(+0.5 first) ≥ 0.53 |
| D2 BUY side | 2,207 | +0.03 | −0.01 [−0.18, +0.17] | −0.05 | 47 % | 0.99 | 1.10 | 0.50 | −0.12 | 33 % | −0.05 | fail (asymmetric: the effect exists only after silver drops) |
| D3 Nasdaq lead-lag (both) | 4,190 | −0.02 | −0.01 [−0.07, +0.06] | +0.02 | 51 % | 0.99 | 1.00 | 0.50 | −0.11 | 67 % | −0.03 | fail |
| S5 weekday cells (Mon–Fri) | 8.1–8.7 k each | — | −0.10 … +0.08 | — | 47–50 % | 0.87–1.10 | 0.97–1.11 | 0.49–0.52 | all < 0 | — | — | fail (Monday −0.10 [−0.21, +0.01]) |
| S5 hour cells (London hour) | 1.5–1.9 k each | — | 22 of 24 within ±0.18 | — | 43–60 % | 0.75–1.90 | 0.95–1.53 | 0.47–0.60 | 20 of 24 < 0 | — | — | fail, except: |
| **S5H:H21** (long, 21:00–22:00 London = last hour before the daily close) | 1,680 | +0.33 | **+0.34 [+0.20, +0.48]** (99 % CI also > 0) | +0.48 | 60 % | 1.90 | 1.53 | 0.60 | +0.16 | 100 % | +0.30 | **PASS → frozen** |
| S5H:H20 | 1,816 | −0.05 | +0.20 [+0.07, +0.34] | +0.24 | 53 % | 1.58 | 1.27 | 0.51 | +0.06 | 100 % | +0.16 | fail (path) |
| S5H:H23 / H00 (reopen hours) | 1,512 / 1,876 | +0.08 / +0.12 | +0.23 [+0.06, +0.40] / +0.25 [0.00, +0.51] | +0.33 / +0.12 | 54 / 51 % | 1.40 / 1.25 | 1.32 / 1.22 | 0.53 / 0.52 | +0.02 / +0.02 | 100 % | +0.20 / +0.21 | fail (one horizon / CI) |
| S5H:H19 | 1,825 | −0.07 | −0.12 [−0.22, −0.02] | +0.08 | 43 % | 0.75 | 0.97 | 0.47 | −0.24 | 0 % | −0.14 | negative cell (short side would fail cost) |

CANDIDATES_FROZEN = 1 (`S5H:H21`, sha256 6e1d61c4…7234d9). Multiple testing: 47 cells × 3 horizons; the H20/H21/H23/H00 cluster is one contiguous session-boundary effect, not four independent findings.

## 2. Validation (2024-07-01 → 2025-08-31), frozen candidate only, no retuning

| Candidate | N | h8 excess [95 % CI] | net h8 | no-top3 | years + | Required | Result |
|---|---|---|---|---|---|---|---|
| S5H:H21 | 1,088 | **+0.11 [−0.14, +0.34]** | +0.01 | +0.09 | 100 % | h8 ≥ max(0.10, 50 % × 0.34) = 0.17 and CI lower bound > −0.05 | **VALIDATION_FAILED** (effect one third of discovery; CI spans zero; cost-net ≈ 0) |

HOLDOUT_OPENED = NO (script refused: no validation-pass artifact). ROBUSTNESS = not applicable (no survivor).

## 3. Failure diagnosis of the H21 effect (descriptive; discovery + validation only; `h21_diagnostic.mjs`)

Every H21 entry is held across the broker's daily close (100 % of positions cross the 21:00/22:00 UTC break). Decomposition of the 8-bar move: close→reopen gap +0.08 ATR (discovery) / +0.07 (validation); intra-session part after the reopen (the Asian open hour) +0.34 / +0.17; mean ATR at entry 1.81 USD / 3.06 USD. Realistic costs a REAL 0.01-lot long would actually pay: spread 0.26 USD → +0.25 / +0.14; plus the published long swap (−0.55 USD per night, charged at the rollover every such position crosses) → **−0.12 / −0.07**; plus a reopen-spread stress of 1.5 USD if the exit happens at the Asian reopen → −1.12 / −0.65. Year panel: 2022 +0.28, 2023 +0.53, 2024 +0.28 / +0.30, 2025 +0.19 (shrinking as ATR rose and the bull drift concentrated in other hours). Interpretation: the "edge" is the positive overnight drift of the Asian reopen in a bull market, harvested through the daily close; it is not stable in size, and after swap and reopen spread it is negative in both regions. Not a tradeable effect.

## 4. Other observations (not candidates)

- Session structure: London and New-York opening-range breaks and Asia-range breaks have no continuation expectancy (P(+0.5 before −0.5) 0.44–0.53, MFE/MAE ≈ 1.0, negative net of spread on both sides); the London→NY continuation mean (+0.55) is carried by five days and its CI is [−0.33, +1.41].
- Prior-day levels: first touch of PDH continues in only 48 % of cases with negative excess (−0.17); PDL 47 %: reference levels neither reliably reject nor break through.
- Cross-asset: gold reacts contemporaneously to the dollar (corr −0.56) and silver (+0.77) but with no exploitable lag at 15m; the only positive lag cell (silver down → gold down next 2 h, +0.20 ATR) fails the path criterion (first-touch 50 %) and is asymmetric (silver up → nothing). It is the strongest non-price observation of the stage and is recorded as a near-miss for a future, separately pre-declared study with unseen data, not as a candidate.
- Seasonality: no weekday cell; hour cells cluster at the daily close/reopen boundary (H20–H00 positive, H19 negative) and elsewhere at zero.

## 5. Stage outcome

NEXT_PREMISE_FAILED_AT_VALIDATION. DISCOVERY_RESULT = 1 candidate of 47 cells (session-boundary effect). VALIDATION_RESULT = FAILED. EDGE_DEMONSTRATED = NO. Production remains authoritative and unchanged.
