# XAUUSD_NEXT_EDGE_RESEARCH_PROTOCOL — Stage 11B (pre-declared before any outcome was computed)

Written 2026-09-26 from production HEAD e46b3be (News Protection V2 active, REAL watcher v8 running, lot USER_FIXED 0.01, scaling OFF). Offline research only: nothing under `validation/next_edge_session/` is imported by production; no trade, no restart, no production change. The owner's capital destinations (USD 6 M, then 600 M) have no influence on any definition, gate or ranking below.

## 0. Research inventory (Part 1)

| Premise | Tested? | Data period / timeframe | Sample | Result | Why failed / learned | Retest justified? |
|---|---|---|---|---|---|---|
| Production intraday_5m models (MC/PB/BO/SR/MR) with 15m bias, 30m/1H vetoes | YES (Master Edge Validation) | 2026-04-29 → 09-25, 5m XAUUSDm, 129 sessions | 1,406 trades | EDGE_NOT_DEMONSTRATED (mean R +0.001, CI −0.08..+0.09, PF 1.07; validation half PF 0.95; ex-top-5 negative) | loss pockets: 1.5× fail-safe on sub-5 USD stops, continuation trades under directional 15m bias, quality 85+ bucket; MR promising only at n 53 | NO (needs new information, not re-tuning) |
| Patches to production rules (quality, lag filter, exit stacks, PB/MR/MC-BO tweaks) | YES (Improvement Lab, A/B/C 64/32/33 sessions) | same 5m data | 2 frozen candidates | not supported (+0.013 R/trade holdout, CI incl. 0, negative at 0.40 spread) | patching a no-edge base does not create edge | NO |
| Structure-event redesign (sweep-reclaim, BOS-retest, compression-expansion) at 5m | YES (Strategy Redesign V2, frozen spec) | 2026-04-29 → 09-25, 5m | A +0.37 R n 27 → B −0.09 n 10 → C −0.53 n 20 | V2_EDGE_NOT_DEMONSTRATED | small samples; regime flip | NO |
| Multi-year 15m/1H structural events (7 families, ±, 6 horizons, regimes, sessions descriptive) | YES (V3) | 15m 2022-07 → 2026-09; 1H 2017 → 2026 | 264 discovery cells | 0 of 44 cells pass; near-misses flip sign with monthly direction | after structure, price ≈ random walk with drift; "edge" = period drift | NO |
| Daily/weekly direction, trend, alignment, volatility state, matrix | YES (V4, pre-declared) | 1D 2014 → 2026 | 16 states, 12 cells | NO_EFFECT; volatility mean-reversion below gate | drift dominates; conditioning adds nothing | NO |
| Scheduled-news direction / continuation / reversal | YES (V5) | 15m 2022-07 → 2026-09, 279 official events | 8 families | NO direction; YES magnitude (→ News Protection V2) | releases change how much, not which way | NO (direction); magnitude already used |
| News surprise (actual vs forecast) | NO — no trustworthy forecast archive | — | — | UNTESTABLE WITH CURRENT DATA | Forex Factory history unavailable, FRED key absent | only if a licensed consensus archive appears |
| Session / time-of-day structure (London open, NY open, Asia range, transitions) | **NO** (V3 sessions were descriptive event splits only) | — | — | — | — | **YES: genuinely untested** |
| Prior-day / prior-week high-low, daily open interaction | PARTIAL (V3 range extremes were pivot-based, not PDH/PDL) | — | — | — | — | YES (reference-level, not pivot) |
| Day-of-week / hour-of-day seasonality | NO | — | — | — | — | YES |
| Cross-asset (USD index, silver, equity risk) lead-lag / confirmation | **NO** (non-gold information never used) | — | — | — | — | **YES: new information source** |
| Rates/yields, DXY official, consensus, positioning | NO — no trustworthy accessible history (FRED key, ICE) | — | — | UNTESTABLE WITH CURRENT DATA, except the broker's DXY CFD used below | — | — |
| Spread / execution conditions | PARTIAL (V5: bar spread column, 3 months) | 1m 2026-06 → 09 | — | no tick history | UNTESTABLE beyond bar spread | — |

Repeated-dataset contamination: the 15m XAUUSDm bars 2022-07 → 2026-09 have been inspected by V3 (structure), V5 (news) and the V2 protection replay. The conditioning variables of this stage (session clocks, reference levels, cross-asset series) are new, but the price outcomes are not unseen; **no partition of this data is a pristine holdout**. The cross-asset series (DXYm, XAGUSDm, USTECm) were fetched for this stage and never inspected before. Future live/shadow data remains the only unseen evidence.

## 1. Selected premise and rationale (Part 2)

**Session-and-context structure of XAUUSD**: does behaviour conditioned on (a) the session clock (London open, New York open, Asia range, London→NY transition, hour/weekday), (b) prior-day reference levels, or (c) a contemporaneous non-gold driver (USD index, silver, Nasdaq) carry directional expectancy beyond the region drift? Rationale: liquidity and participation in gold are strongly time-of-day dependent (Asian range → London expansion → NY flows), reference levels are watched by discretionary and algorithmic participants, and gold's dominant macro driver is the dollar; none of these has been tested here, and they are materially different from the failed price-pattern research (they use the clock and other markets, not pivots/structure).

## 2. Data

- XAUUSDm 15m bars 2022-07-04 → 2026-09-25 (V3 snapshot, previously inspected); XAUUSDm 1D bars for prior-day levels (V4 snapshot); 5m 2025-05 → 2026-09 for a descriptive subperiod check only.
- DXYm (Exness USD-index CFD) 15m 2022-09-05 → 2026-09-25; XAGUSDm 15m 2022-06-15 →; USTECm 15m 2022-05-25 → (fetched read-only 2026-09-26; Market Watch restored). Same broker clock as gold (UTC-stamped), no feed mixing with OANDA; production trades OANDA:XAUUSD (mismatch stated).
- Costs: XAUUSDm spread 0.24–0.26 USD (median bar spread 2026-06 → 09), commission 0. Cost panels use 0.26 USD (base) and 0.40 USD (stress) round trip, plus 0.10 USD slippage and a 1-bar entry delay variant. No tick data: release-second/execution claims are not made.

## 3. Clocks, DST, sessions

All bars are UTC. Session clocks are converted with explicit rules: Europe/London (BST from the last Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC), America/New_York (US rule, `et_time.mjs`). Definitions (local clocks):
- Asia range: 00:00 → 08:00 London. London open 08:00 London. London opening range (OR-L): 08:00–08:30 London (two 15m bars). NY open 09:30 ET; NY opening range (OR-NY): 09:30–10:00 ET. London→NY transition: London leg = 08:00 London → 09:30 ET; NY leg = 09:30 ET → 16:00 ET.
- Prior day = previous broker daily bar (00:00 UTC stamp); PDH/PDL = its high/low. Only Monday–Friday bars; the Sunday session bar is a regular bar for PDH/PDL of Monday.
- Weekday/hour seasonality uses London local hour and weekday.

## 4. Regions (whole months, fixed)

| Region | Dates | Use |
|---|---|---|
| DISCOVERY | 2022-09-05 → 2024-06-30 | definitions fixed, candidates identified |
| VALIDATION | 2024-07-01 → 2025-08-31 | pass/fail of frozen candidates, no retuning |
| RESEARCH HOLDOUT (reused data, not pristine) | 2025-09-01 → 2026-09-25 | opened only for candidates with a machine-written validation-pass artifact |

## 5. Families and fixed definitions (Part 5 candidate conditions)

Each family has ONE fixed definition; adjacent-parameter variants are computed only in the robustness phase for surviving candidates, never for selection.

- **S1L London opening-range breakout**: first 15m close above OR-L high (BUY) or below OR-L low (SELL) between 08:30 and 12:00 London; entry at that close.
- **S1N New York opening-range breakout**: first 15m close beyond OR-NY between 10:00 and 13:00 ET.
- **S2 Asia-range break at London**: first 15m close beyond the Asia range between 08:00 and 12:00 London.
- **S3 London→NY transition**: on days where the London leg |move| ≥ 4 × ATR14(15m) at 09:30 ET, outcome = NY leg move in the London-leg direction (positive = continuation, negative = reversal; both signs are hypotheses, measured, not assumed).
- **S4 Prior-day level interaction**: first 15m bar of the day (London or NY session only) whose high ≥ PDH (BUY-side break) or low ≤ PDL (SELL-side break); entry at the bar close; outcome signed in the break direction (positive = continuation, negative = rejection).
- **S5 Seasonality**: mean 15m return by London hour (0–23) and by weekday, drift-adjusted; a candidate is one (hour) cell or one (weekday) cell.
- **D1 USD-index lead-lag**: DXYm 15m log return z-scored on a trailing 96-bar σ; condition |z| ≥ 1.5 at bar t; outcome = gold move over the next bars in the direction −sign(z) (dollar up → gold expected down). Also reported: contemporaneous beta (descriptive, not a candidate).
- **D2 Silver lead-lag** (XAGUSDm, sign +) and **D3 Nasdaq lead-lag** (USTECm, sign + as risk-on), same construction.

## 6. Outcomes

Entry price = close of the signal bar. Horizons h ∈ {4, 8, 16} 15m bars (1 h, 2 h, 4 h); S3 uses the NY leg (fixed). Measures per candidate/horizon: N, raw mean and median move (ATR14 units and USD), **excess** = dir × (move − region per-bar drift × h), win probability, profit factor at h8, MFE/MAE (h8), P(+0.5 ATR before −0.5 ATR), time to MFE, bootstrap 95 % CI of the excess (event-level, 2,000 resamples; for S5 a day-block bootstrap), P(excess ≤ 0), mean without the top 1 / 3 / 5 winners, 5/95-winsorized mean, per-year panel, bull/bear side split, session split (where applicable), volatility split (ATR14 tercile), cost-net excess (0.26 USD and 0.40 USD round trip), 1-bar-delayed entry variant.

## 7. Gates (fixed before results)

**Discovery gate** (per candidate = family × direction, or pooled symmetric when both directions are measured with the same rule): (1) N ≥ 100 (S3: ≥ 60 days; S5 hour cells: ≥ 300 bars); (2) excess > 0 with the bootstrap 95 % CI excluding 0 at ≥ 2 of {4, 8, 16} (S5: 99 % CI, because 24 + 5 cells are tested); (3) P(+0.5 before −0.5) ≥ 53 %; (4) MFE/MAE ≥ 1.10 at h8; (5) cost-net excess at h8 > 0 (0.26 USD); (6) ≥ 60 % of years positive (n ≥ 20); (7) excess without the top 5 winners > 0. Failing any item = NOT A CANDIDATE. If no candidate passes: NEXT_PREMISE_FAILED_AT_DISCOVERY; nothing is manufactured.

**Freeze**: candidates that pass are written to `validation/next_edge_session/frozen_candidates.json` with a SHA-256 before validation is opened; the validation run refuses to start without it and evaluates exactly those definitions.

**Validation gate**: N ≥ 40 (S3 ≥ 25); same sign at the same two horizons; mean excess ≥ max(0.10 ATR, 50 % of the discovery effect) at h8; CI lower bound > −0.05 ATR; without-top-3 > 0; cost-net > 0; ≥ 50 % of validation years positive. Failing = VALIDATION_FAILED for that candidate; the holdout is not opened for it.

**Holdout** (reused data, stated as such): only for validation passers, via a machine-written `validation_pass_<candidate>.json` artifact; PASS = positive excess at the same horizons and cost-net > 0. Even a triple pass is classified at most as "PROMISING, forward/shadow validation required", never as demonstrated edge, because the price history is not unseen.

**Robustness (Part 9, survivors only)**: adjacent parameters (OR length 15/45 min, break window ±1 h, S3 threshold 3/5 ATR, D z 1.0/2.0), per-year, per-session, bull/bear side, volatility terciles, top-1/3/5 removal, 0.40 USD cost, 0.10 USD slippage, 1-bar delay, bootstrap. A survivor must keep a positive cost-net excess in ≥ 80 % of these perturbations.

**Multiple testing**: S1L, S1N, S2, S4 × 2 sides + S3 × 2 signs + D1–D3 × 2 sides + S5 (24 hours + 5 weekdays) = about 47 candidate cells × 3 horizons ≈ 141 discovery tests; ≈ 7 spurious 5 % exclusions expected. Selection therefore requires two horizons, a path criterion, a cost criterion and year stability, and the validation region is the arbiter.

## 8. Rejection / promotion vocabulary

Per candidate: NOT_A_CANDIDATE (discovery), VALIDATION_FAILED, PROMISING (validation + holdout positive), NO_EFFECT. Final decision from the fixed list A–E of the stage instruction; A is impossible on this data (no unseen partition) unless a forward/shadow phase later confirms; the best attainable here is B.

No definition, horizon, threshold or gate will be changed after results are seen.
