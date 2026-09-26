# XAUUSD_V3_MULTIYEAR_EVENT_STUDY

Research only (2026-09-26). Event discovery, not a strategy build. Production untouched; no trade; no restart. Scripts and results: `validation/v3_multiyear_event_study/` (`v3_events.mjs`, `v3_event_results.json`, `data_integrity.mjs`, `v3_data_integrity.json`, `xauusdm_multiyear_bars.json`). Data provenance and limitations: `docs/XAUUSD_V3_DATA_INTEGRITY.md`. Full matrix: `docs/XAUUSD_V3_EVENT_EDGE_MATRIX.md`.

## 1. Question and answer

**Do any simple 15m or 1H price-structure events show a repeatable, directionally symmetric, out-of-sample asymmetry in XAUUSD?**

**No.** Across 4.2 years of 15m data (98,667 evaluated bars) and 9.7 usable years of 1H data (56,118 bars) on the Exness XAUUSDm feed, with seven pre-declared event families evaluated in both directions, at six horizons, against the unconditional drift of each region, no event passed the pre-declared discovery gate in either direction on either timeframe. The events that came closest were one-sided and reversed sign in the next chronological region or the next year.

## 2. Protocol (pre-declared, then run once)

- Regions by whole sessions/months, written before any statistic was computed: 15m DISCOVERY 2022-07-04 → 2024-06-30, VALIDATION 2024-07-01 → 2025-08-31, HOLDOUT 2025-09-01 → 2026-09-25; 1H DISCOVERY 2014-01-14 → 2021-12-31 (hourly structure effectively from 2017), VALIDATION 2022-01-01 → 2024-06-30, HOLDOUT 2024-07-01 → 2026-09-25.
- Structure: confirmed pivots (5 left / 5 right), BOS/CHoCH on confirmed closes, mature range = extremes of the last five confirmed pivots with defining pivots ≥ 20 bars old and width ≥ 2 ATR14, range midpoint, ATR14. Trailing 300-bar window. No forming-bar data.
- Event families (single definitions; F has two labelled definitions): A range-extreme wick sweep (first pierce in 10 bars, close back inside); B sweep + reclaim (a confirmed close beyond the sweep bar's inner extreme within 3 bars); C sweep + opposing confirmed CHoCH within 12 bars, measured from the CHoCH bar; D failed breakout (1–4 confirmed closes outside a mature range, then a close back inside); E BOS with ≥ 0.5 ATR displacement + retest touch within 2–12 bars, split into HOLD (close on the break side) and FAIL (close back through, measured in the failure direction); F1 ATR-contraction break (ATR14 ≤ 0.7 × its 100-bar mean, close beyond the 12-bar box by 0.1 ATR) and F1-ACCEPT (next close still outside); F2 20-bar box ≤ 1.5 ATR break; plus plain BOS and CHoCH, and G location conditioning (near extreme / near mid / between / no range).
- Horizons: 15m 1, 2, 4, 8, 16, 32 bars; 1H 1, 2, 4, 8, 16, 24 bars. Metrics per event/direction/horizon: N, mean and median signed move (ATR and USD), excess over the region drift with a 95 % CI, MFE, MAE, MFE/MAE, P(favourable), P(adverse), P(+0.5 ATR before −0.5 ATR), P(+1 ATR before −1 ATR), time to MFE and MAE; bootstrap (2,000 resamples) and outlier panels (without the top 1 % absolute moves; winsorized 1/99) for candidates and forced near-misses.
- Discovery gate: N ≥ 100 (15m) or ≥ 60 (1H) per direction; excess move > 0 with the CI excluding zero at ≥ 2 horizons; MFE/MAE ≥ 1.10 at 4 bars or later; P(+0.5 before −0.5) ≥ 53 %. Symmetry: SYMMETRIC if both directions pass, ONE_SIDED if one, NO_EDGE if none. Regimes (pre-declared): volatility (ATR14 vs rolling 1,000-bar median: HIGH ≥ 1.25×, LOW ≤ 0.8×), structure (100-bar efficiency ratio ≥ 0.3 = TRENDING), direction (calendar-month return ≥ +2 % BULLISH, ≤ −2 % BEARISH, else MIXED). Sessions by UTC hour (Asia 0–8, London 8–13, overlap 13–16, New York 16–21, other).
- Multiple testing: 11 event labels × 2 directions × 2 timeframes × 6 horizons = 264 discovery cells; at the 5 % level about 13 spurious CI exclusions are expected by chance. Single-cell exclusions are therefore not treated as evidence; the gate requires two horizons plus a path criterion, and the later regions are the arbiter.

## 3. Results

**Event counts (discovery / validation / holdout).** 15m: A 206/139/133, B 75/51/47, C 29/14/15, D 286/194/193, E-hold 510/295/310, E-fail 106/65/62, F1 814/305/186, F1-accept 605/232/126, F2 5/1/0, BOS 1,265/774/680, CHoCH 906/561/505. 1H: A 150/82/62, B 51/30/12, C 25/13/5, D 176/103/78, E-hold 320/174/129, E-fail 57/34/29, F1 113/48/51, F1-accept 86/38/39, F2 1/0/0, BOS 810/412/383, CHoCH 530/266/244. Family C (sweep + CHoCH) and F2 never reach adequate sample; B is thin on 1H.

**Discovery gate: 0 of 44 event-direction cells pass.** P(+0.5 ATR before −0.5 ATR) exceeds 53 % for no adequately sampled cell (best 51.3 % for 1H bullish range sweeps and 50.7 % for 15m bearish failed breakouts); MFE/MAE ratios sit between 0.8 and 1.3; excess-move CIs exclude zero at two or more horizons only for 15m bearish range sweeps at the 16-bar horizon alone (one horizon) and for the 1H bearish BOS-retest hold (three horizons, but the path criterion fails).

**Near-misses and what happened to them out of sample (8-bar excess in ATR, CI in brackets):**

| Event | Discovery | Validation | Holdout | Verdict |
|---|---|---|---|---|
| 1H BOS-retest HOLD, bear | +0.38 [+0.08, +0.69], n 162, bootstrap [+0.02, +0.63] | −0.17 [−0.69, +0.36], n 60, bootstrap [−0.77, +0.28] | +0.48 [−0.07, +1.02], n 61 | REGIME_DEPENDENT: yearly excess 2017 −0.17, 2018 +1.06, 2019 +0.09, 2020 +0.70, 2021 +0.39, 2022 −0.81, 2023 +0.86, 2024 +0.24, 2025 +0.23, 2026 +0.78; positive in bearish months (+0.75) and flat in bullish months (−0.03) |
| 1H BOS-retest HOLD, bull | +0.08, n 158 | +0.18, n 114 | +0.14, n 68 | NO_EDGE (CIs include zero everywhere; 2025–2026 negative) |
| 15m BOS-retest HOLD, bear | −0.25 [−0.51, +0.01], n 245 | +0.10, n 127 | +0.54 [+0.20, +0.88], n 161 | sign reverses between discovery and holdout; holdout positive only |
| 15m BOS-retest HOLD, bull | −0.05, n 265 | +0.14, n 168 | +0.34 [+0.02, +0.66], n 149 | same pattern: nothing on discovery, positive in the 2025–26 bull holdout |
| 15m range sweep, bear | +0.14 (16-bar +0.82 [+0.08, +1.55]), n 109 | **−1.14 [−1.85, −0.42]**, n 73 | +0.23, n 60 | REGIME_DEPENDENT: yearly 2022 −0.35, 2023 +0.38, 2024 −0.40, 2025 −1.00, 2026 +0.53; positive in bearish months (+0.65), strongly negative in bullish months (−0.77) |
| 15m range sweep, bull | +0.16, n 97 | +0.40, n 66 | −0.45, n 73 | NO_EDGE |
| 15m compression accept, bull | +0.01, n 338 | +0.42 [+0.01, +0.82], n 152 | +0.49, n 68 | validation-only; discovery flat; positive only in bullish months (+0.50 vs −0.27 mixed) |
| 15m failed breakout, both | −0.19 / +0.25 | +0.07 / −0.41 | −0.07 / +0.02 | NO_EDGE |
| 1H range sweep, bull | +0.30, n 80 (4-bar +0.34 [−0.06, +0.74]) | +0.36, n 48 | −0.71 [−1.44, +0.02], n 33 | NO_EDGE (holdout reverses) |
| BOS and CHoCH (plain), all | ≈ 0 on discovery both TFs | ≈ 0 | 1H bull BOS +0.30 [+0.02, +0.57] in the 2024–26 bull holdout only | trend persistence of the holdout period, not an event edge |

**Year-by-year stability:** none of the near-misses is positive in more than about six of the years it spans; the 15m bearish range sweep alternates sign every year; the 1H bearish BOS-retest hold has three negative years out of ten and its validation region is negative.

**Regime stability:** the only consistent pattern is that bearish-side events do well in bearish months and badly in bullish months, and vice versa; i.e. the "edge" is the month's direction, which the drift adjustment removes only linearly. Volatility and trending/ranging splits show no stable ordering (for example 1H bearish BOS-retest: LOW −0.27, NORMAL +0.43, HIGH +0.20; 15m bull compression accept: LOW +0.21, NORMAL +0.15, HIGH +0.23).

**Session stability:** no session is consistently favourable across events and directions (15m bearish range sweep: Asia −0.54, London −0.81, overlap +0.20, New York +0.48; 1H bull BOS-retest: New York +0.45, Asia −0.26, London +0.47, overlap −0.05). These are descriptive only and shift by one hour across DST.

**Outlier dependence:** means barely change without the top 1 % or after winsorizing (differences ≤ 0.13 ATR), so the results are not carried by rare extreme moves; they are simply near zero.

**Location (G):** no differentiation. 15m BOS near an extreme +0.00, near the midpoint +0.08, no range −0.03 at 8 bars; CHoCH −0.06 / −0.05 / −0.06; sweep-reclaim and failed-breakout events occur near extremes by construction and show 0.99–0.85 MFE/MAE.

## 4. Interpretation

1. On this feed, XAUUSD price structure on 15m and 1H behaves close to a random walk with drift after every one of the studied events: the probability of reaching +0.5 ATR before −0.5 ATR sits at 40–52 % (below one half for most events, because the first touch on a same-bar reversal is counted as adverse), and MFE/MAE ratios sit near 1.
2. Whatever asymmetry exists is the prevailing monthly direction. Bearish events look good in bearish months and bullish events in bullish months; the discovery regions and the 2024–2026 bull holdout differ in direction, which produces sign flips rather than confirmations.
3. Break-and-retest continuation, the one family with several positive cells, is regime-dependent and fails its validation region on 1H while being negative on discovery on 15m. It cannot be promoted.
4. Sweep-reversal families (A, B, C), the hypothesis inherited from the MR observation, show no edge and, on the bear side, a strongly negative validation region. The earlier positive MR result (n 53) was small-sample and outlier-carried; the multi-year study does not support it.
5. Compression → expansion is unmeasurable under box definitions and flat under the ATR definition, with a validation-only positive bull cell that is a bull-market artefact.

## 5. Decisions

REPEATABLE_HTF_EVENT_EDGE = NO. V3_STRATEGY_PREMISE_SUPPORTED = NO. PRIMARY_FAILURE_REASON = no directional-symmetric asymmetry exists after the studied structural events on 15m or 1H; the observed effects are the period's directional drift, which flips between regions. The 5m secondary timing study was not performed because no HTF event passed the evidence gate.

NEXT_GATE = C) NO REPEATABLE STRUCTURAL EVENT EDGE — CHANGE RESEARCH PREMISE. The structure-event premise has now been tested at 5m (Master, Lab, V2) and at 15m/1H over multiple years (V3) without finding a symmetric out-of-sample edge. Any further research should change the premise rather than the timeframe or the definitions: candidates worth an event study first are (a) higher-timeframe directional persistence itself (daily/weekly trend state as the only conditioning variable, since drift is the one thing that consistently moved these results), (b) scheduled-event behaviour (news windows, which the production system currently only avoids), and (c) volatility-regime behaviour independent of structure. Each would need the same pre-declared, chronological, drift-adjusted design before any rule is written. Live class-A collection continues from the unchanged production system.
