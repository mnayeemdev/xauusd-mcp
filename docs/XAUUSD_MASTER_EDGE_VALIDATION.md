# XAUUSD_MASTER_EDGE_VALIDATION

**Mode:** research / replay / validation only (2026-09-26). No production code, config, runtime, lot lock, breaker, RR, quality threshold, protection rule or live state was changed. No trade was placed. The live watcher kept running throughout.

**Question answered:** does the CURRENT intraday_5m strategy have a real, repeatable edge, and if not, which parts are responsible?

**Reproduce:** `node validation/master_edge_validation/master_edge.mjs` (reads `xauusdm_bars_master.json` and the live signal store read-only; writes only `master_edge_results.json` in that folder; the full per-signal appendix with every field requested in Part 3 is the `signals` array, variant signals under `variant_signals`). Research code lives only under `validation/` and is not imported by anything in `src/`.

---

## PART 1 — DATASET

| Item | Value |
|---|---|
| Source | MT5 Exness XAUUSDm confirmed bars via `copy_rates_from_pos` (read-only): 5m 30,000 bars (2026-04-27 → 2026-09-25), 15m 10,500, 30m 5,500, 1H 3,000, 4H 1,000, 1D 500 |
| Evaluable window (after 499-bar warm-up on every entry tier) | **2026-04-29 09:00 → 2026-09-25 19:20 UTC** |
| Sessions (UTC days with confirmed 5m candles) | **129** |
| Confirmed 5m candles evaluated | **29,500** |
| Chronological split for walk-forward | discovery 77 sessions (to 2026-07-27), validation 52 sessions (from 2026-07-28) |
| Missing data / feed gaps | daily 21:00–22:00 UTC market close (normal); two holiday closes 2026-05-25 and 2026-09-07 (18:25–22:00); no other non-weekend gap > 65 min |
| Live-runtime gaps (not data gaps) | 25 Sep 13:25–13:45 feed stall, 14:05 crash, 14:35–14:40 reboot; the replay evaluates those candles from bars, so they are reconstructable |
| Unreconstructable | historical News and Shock protection states (no calendar or tick archive), ENTRY_DRIFT and live-spread guard outcomes, OANDA feed differences (a few tenths) |

Evidence classes:

| Class | Content | Count | Use |
|---|---|---|---|
| A | live intraday_5m signals in the store (25 Sep) and executions | 11 signals (1 PASS, 10 FAIL by the store's SL-vs-TP2 rule), 2 REAL trades (−50.00, −9.87), 1 DEMO (+3.00) | cross-check: **10 of 11 reproduced by the replay** within one bar with the same side |
| B | deterministic reconstruction with the exact production functions | **3,185 signal bars → 1,447 distinct signals → 1,406 completed outcomes** (41 refused by the effective-RR-at-fill recheck, 0 open at end) | PRIMARY |
| C | observational variants A/B/C (Part 7) | 1,430 / 1,450 / 1,526 signals | never mixed into primary statistics |

Mean 11.2 signals per session; models BO 854, PB 236, MC 188, SR 112, MR 57.

---

## PART 2 — ACTUAL_PRODUCTION_TIMEFRAME_AUTHORITY_MAP (verified from executable call paths)

Path: `watcher.js runWatcherCycle` → `analyzeMarket()` → `calculateEntry({engineProfile:'intraday_5m'})` → `calculateIntradayEntry()` in `src/core/xauusd_calculate.js` → `computeBias` (15m) · `runPipeline` (30m) · `computeHtfContext` (1H/2H/4H/8H/D/W/M) · `runIntradayPipeline` (5m) → `combineIntraday` → Pine-disagreement check (Pine absent) → executor guards (`protectionGuards`, `evaluateEntry`, `assessSafety`, `evaluateExecutableGeometry`).

| TF | Fetched | Live role | Creates direction | Blocks entry | Authority code |
|---|---|---|---|---|---|
| 5m | yes (500) | entry authority: regime (CHOP veto, model conditions, quality), structure (BOS/CHoCH, swings, sweeps), models MC/PB/BO/SR/MR, stop geometry, 5m-pivot objectives, quality, signal identity; post-entry thesis invalidation and adaptive management run on 5m bars | YES | YES (CHOP, NO_ELIGIBLE_STRATEGY, VOLATILITY_INSUFFICIENT, OVEREXTENDED, INVALID_GEOMETRY, RR_NOT_ACCEPTABLE, NO_GOOD_ENTRY) | `intraday/pipeline5m.js`, `models5m.js`, `risk5m.js` |
| 15m | yes | bias: regime → side lock (BULL→BUY only, BEAR→SELL only) and model set (directional MC/PB/BO/SR; RANGE BO/SR/MR; COMPRESSION/HIGH_VOL BO; TRANSITION BO/SR; CHOP none); ONE veto: fresh opposing CHoCH ≤ 3 bars; geometry: 15m swing levels for SR, 15m pivots and range extreme as TP2 objectives (a 15m pivot can set RR), 15m range midpoint as the MR target; correction state reported only | NO (side gate only) | YES (side lock, empty set on CHOP, ENTRY_CONFLICT, and indirectly RR) | `intraday/bias.js`, `models5m.js allowed()`, `risk5m.js collectObjectives`, `combineIntraday` |
| 30m | yes | reference `runPipeline` output, regime and structure only: two-factor veto (regime AND structure oppose), MR ineligible when 30m trends, qMtf quality component (15/0/7.5) | NO | YES (scoped; only when 30m is BULL/BEAR_TREND with opposing structure) | `combineIntraday`, `evaluateMeanReversion`, `quality.js` |
| 1H | yes | `computeHtfContext`: HTF_CONFLICT veto only for MR or trades unaligned with the 15m bias; −5 quality for aligned trades against it; supporting 1H lowers the neutral-bias quality bar 70 → 65 | NO | YES (scoped) | `htf.js detectHtfConflict`, `pipeline5m.js htfSupportsSide / resolveQualityThreshold` |
| 2H, 8H | yes | context summary only; no consumer | NO | NO | none |
| 4H, Daily | yes | context summary; read only by `confluence.js` for the htf_alignment display field | NO | NO | none |
| Weekly, Monthly | yes | context summary only; no consumer; fetch failure degrades only that tier | NO | NO | none |

Legacy observability: `xauusd_analyze_market.js computeEntryPipelineByTf` runs the reference `runPipeline` on 5m/15m/30m and logs `candidates.*.blocked_by` (CORRECTION_ACTIVE, TRANSITION) into the wait log, ledger and anticipation stores. Those fields never reach `decision.action`; the live engine has no correction or transition veto. Confirmed by the 62/62 bar fidelity check of the earlier one-day audit and the 10/11 class-A match here.

---

## PART 3 — REPLAY RESULT (CURRENT rules, production exit stack, 0.01 lot)

| Metric | Value |
|---|---|
| Completed outcomes | 1,406 |
| Win rate | 50.5 % |
| Mean R | **+0.001** (median +0.03) |
| 95 % CI (bootstrap, 1,000 resamples) | **−0.082 to +0.085** |
| Profit factor | **1.07** |
| Total R / net USD at 0.01 | +1.86 R / +399.44 USD over 129 sessions (≈ +0.28 USD per trade before swap) |
| Average winner / loser | +1.16 R / −1.18 R |
| Largest winner / loser | +14.35 R / −1.68 R |
| Max losing / winning streak | 9 / 11 |
| Mean MAE / MFE | 0.97 R / 1.40 R |
| Average holding | 10.0 bars (50 min) |
| Walk-forward | discovery n 844: mean +0.028 R, PF 1.16, CI [−0.081, +0.141]; validation n 562: mean **−0.039 R, PF 0.95**, CI [−0.165, +0.106] |
| Monte Carlo (5,000 seeded resamples of 1,406 trades) | mean R 5th/50th/95th = −0.068 / 0.000 / +0.072; P(mean R ≤ 0) = 50 %; max drawdown median 66.7 R (95th 129.3 R); max loss streak median 9 (95th 13) |

The store's own class-A resolution on 25 Sep (1 of 11 PASS) is consistent with the replay's validation segment.

---

## PART 4 — MODEL-BY-MODEL EDGE AUDIT (full matrix in `XAUUSD_MODEL_EDGE_MATRIX.md`)

| Model | n | Win % | PF | Mean R | CI95 | Total R | Discovery → Validation (mean R / PF) | Classification |
|---|---|---|---|---|---|---|---|---|
| BO | 832 | 52.6 | 1.14 | +0.047 | [−0.069, +0.175] | +39.3 | +0.086 / 1.24 → −0.011 / 1.00 | NO_DEMONSTRATED_EDGE |
| PB | 226 | 45.6 | 0.91 | −0.122 | [−0.292, +0.052] | −27.5 | −0.090 / 0.97 → −0.167 / 0.83 | NO_DEMONSTRATED_EDGE (negative in both halves) |
| MC | 188 | 51.6 | 1.11 | +0.024 | [−0.150, +0.203] | +4.5 | +0.108 / 1.33 → −0.115 / 0.79 | NO_DEMONSTRATED_EDGE |
| SR | 107 | 40.2 | 0.41 | −0.377 | [−0.589, −0.145] | −40.4 | −0.429 / 0.38 → −0.284 / 0.47 | **NEGATIVE_EVIDENCE** |
| MR | 53 | 54.7 | 2.31 | +0.490 | [−0.018, +1.033] | +26.0 | +0.391 / 1.90 → +0.578 / 2.72 | **PROMISING_BUT_UNPROVEN** (n small, CI touches 0) |

---

## PART 5 — LONG / SHORT

| | n | Win % | PF | Mean R | CI95 |
|---|---|---|---|---|---|
| SELL | 842 | 51.1 | 1.12 | −0.004 | [−0.104, +0.104] |
| BUY | 564 | 49.7 | 1.00 | +0.009 | [−0.128, +0.158] |

Directions behave alike overall. Per model: PB BUY PF 0.78 vs PB SELL 1.01 (both negative mean R); SR negative both ways; MR BUY PF 3.32 (n 18) and SELL 2.06 (n 35); BO SELL PF 1.23 vs BO BUY 1.03. Nothing here justifies disabling a direction.

---

## PART 6 — REGIME AUDIT

| Condition | n | PF | Mean R | CI95 |
|---|---|---|---|---|
| 15m bias NEUTRAL (all) | 530 | 1.35 | **+0.161** | [+0.004, +0.330] |
| 15m NEUTRAL: RANGE | 144 | 1.45 | +0.295 | [−0.011, +0.632] |
| 15m NEUTRAL: COMPRESSION | 224 | 1.45 | +0.119 | [−0.117, +0.351] |
| 15m NEUTRAL: TRANSITION | 137 | 1.12 | +0.082 | [−0.216, +0.428] |
| 15m bias BEARISH | 523 | 0.96 | −0.116 | [−0.239, +0.001] |
| 15m bias BULLISH | 353 | 0.96 | −0.064 | [−0.206, +0.095] |
| 5m trend ALIGNED with 15m bias (continuation trades) | 489 | 0.96 | **−0.128** | [−0.254, −0.009] |
| 5m trend OPPOSED to 15m | 7 | 0.04 | −0.981 | — |
| Trade WITH 5m structure | 1,270 | 1.09 | +0.010 | [−0.078, +0.098] |
| Trade AGAINST 5m structure | 136 | 0.93 | −0.081 | [−0.339, +0.197] |
| Signal fired during a 15m-lag episode | 82 | 0.47 | **−0.426** | [−0.658, −0.170] |
| 30m ALIGNED | 688 | 0.97 | −0.056 | [−0.163, +0.057] |
| 30m RANGE / COMPRESSION | 145 / 298 | 1.24 / 1.25 | +0.256 / +0.055 | — |
| 1H ALIGNED / CONFLICTED | 655 / 86 | 1.03 / 0.88 | −0.037 / −0.079 | — |
| Session ASIA / LONDON / NEW_YORK | 554 / 308 / 460 | 0.98 / 1.12 / 1.13 | −0.069 / +0.068 / +0.017 | — |

**15m lag quantified:** the 15m bias disagreed with 5m structure on 4,163 of 29,500 bars (14.1 %), in 281 episodes, median 12 bars (60 min), mean 14.8 bars, longest 71 bars (≈ 6 h). 84 CURRENT signals fired inside those episodes (all on the bias side, against 5m structure) and were the single worst identifiable group (PF 0.47). Signals suppressed by the lag are measured through the variants below.

---

## PART 7 — 15M LAG RESEARCH (observational variants, one concept each; production unchanged)

| Variant | Concept | Added trades | Removed trades | Total mean R / PF | Discovery mean R / PF | Validation mean R / PF | Whipsaw proxy |
|---|---|---|---|---|---|---|---|
| CURRENT | — | — | — | +0.001 / 1.07 | +0.028 / 1.16 | −0.039 / 0.95 | — |
| A | a 15m structure state opposing the 15m regime neutralizes the bias (BO/SR only) | 28 (mean +0.24 R, PF 1.09; disc n10 PF 0.69, val n17 PF 1.41) | 45 (mean −0.008 R) | +0.008 / 1.08 | +0.040 / 1.17 | −0.039 / 0.94 | 10 trades, PF 3.06 |
| B | confirmed 5m flip (5m trend regime agreeing with 5m structure) allows the 5m side under quality ≥ 75 | 12 (mean +0.44 R, PF 2.68; disc n8 PF 3.32, val n4 mean −0.15) | 9 (mean −0.89 R) | +0.010 / 1.08 | +0.040 / 1.18 | −0.035 / 0.96 | 2 trades |
| C | under 15m TRANSITION use 15m structure as a directional bias (full model set) | 147 (mean −0.148 R, PF 0.83; val n51 PF 0.53) | 68 (mean +0.24 R) | −0.023 / 1.03 | +0.009 / 1.13 | −0.072 / 0.90 | 133 trades, PF 0.85 |

**15M_VARIANT_OUT_OF_SAMPLE_RESULT:** none of the variants turns the validation segment positive; A and B move the total by +0.007 to +0.009 R on 12–28 added trades (statistically nothing); C is harmful and is REJECTED. The 15m lag is real and its signals lose, but the tested cures do not create an edge; they only remove a handful of losers.

---

## PART 8 — STOP DISTANCE AUDIT (structural stop, USD at 0.01)

| Bucket | n | Models | Win % | PF | Mean R | CI95 | Total R | MAE / MFE R | Dominant exits |
|---|---|---|---|---|---|---|---|---|---|
| < 3 | 225 | BO 190, PB 28, SR 14, MR 5 | 48.4 | 0.82 | −0.134 | [−0.378, +0.162] | −30.1 | 1.36 / 1.84 | PROFIT_PROTECT 111, BROKER_SL_1.5R 87 |
| 3–5 | 298 | BO 200, SR 61, PB 31, MR 17 | 49.3 | 0.84 | −0.102 | [−0.294, +0.143] | −30.4 | 1.16 / 1.50 | PROFIT_PROTECT 138, BROKER_SL_1.5R 90 |
| 5–8 | 345 | BO 219, PB 63, SR 29, MR 23, MC 20 | 50.7 | 1.03 | +0.020 | [−0.140, +0.184] | +6.9 | 0.92 / 1.40 | PROFIT_PROTECT 154, THESIS_INV 93 |
| 8–12 | 271 | BO 144, PB 64, MC 52 | 56.5 | **1.37** | **+0.183** | [+0.016, +0.340] | +49.5 | 0.77 / 1.34 | PROFIT_PROTECT 122, THESIS_INV 90, TP+30 33 |
| 12–20 | 217 | MC 87, BO 84, PB 44 | 45.6 | 1.00 | +0.012 | [−0.131, +0.172] | +2.7 | 0.74 / 1.05 | THESIS_INV 103, TP+30 37 |
| > 20 | 50 | MC 27, BO 17, PB 6 | 54.0 | 1.22 | +0.066 | — | +3.3 | 0.62 / 0.79 | THESIS_INV 25, TP+30 16 |

**STOP_DISTANCE_FINDING:** the earlier one-week suggestion that very large BO stops perform poorly does not replicate (> 20 USD: PF 1.22, n 50). The loss pocket is the opposite end: stops under 5 USD (n 523, PF 0.82–0.84, −60 R) where 177 of the 252 broker fail-safe stop-outs occur. Tight stops sit inside 5m noise (MAE 1.2–1.4 R on average) and the 1.5 × fail-safe converts that noise into −1.57 R losses. The 8–12 USD bucket is the only one whose CI excludes zero. No stop cap or floor is proposed from this alone.

---

## PART 9 — RR AUDIT

| Planned RR | n | Win % | PF | Mean R | | Effective RR at fill | n | PF | Mean R |
|---|---|---|---|---|---|---|---|---|---|
| 1.7–2.0 | 138 | 48.6 | 1.02 | −0.005 | | 1.7–2.0 | 404 | 1.06 | +0.052 |
| 2.0–2.5 | 759 | 50.3 | 1.10 | +0.013 | | 2.0–2.5 | 531 | 1.10 | −0.040 |
| 2.5–3.0 | 129 | 51.9 | 1.06 | +0.055 | | 2.5–3.0 | 278 | 1.01 | +0.028 |
| 3.0+ | 380 | 51.1 | 0.99 | −0.039 | | 3.0+ | 193 | 1.06 | −0.027 |

**RR_FINDING:** no monotonic relation between planned or effective RR and outcome; higher-RR signals are not better. The 1.7 minimum is neither contradicted nor supported by this data (nothing below 1.7 was ever taken, so its protective value cannot be measured here). 41 signals failed the effective-RR recheck at the live price; they are excluded from outcomes.

---

## PART 10 — QUALITY SCORE AUDIT

| Quality | n | Win % | PF | Mean R | CI95 |
|---|---|---|---|---|---|
| 65–69 | 100 | 50.0 | 1.21 | +0.012 | [−0.208, +0.277] |
| 70–74 | 280 | 52.9 | 1.10 | +0.029 | [−0.133, +0.195] |
| 75–79 | 369 | 53.9 | 1.21 | +0.133 | [−0.055, +0.349] |
| 80–84 | 361 | 47.4 | 1.14 | +0.020 | [−0.161, +0.221] |
| 85+ | 296 | 48.0 | **0.70** | **−0.216** | [−0.379, −0.058] |

Component check (correlation of each component with realized R across 1,406 trades): qStructure −0.015, qTrigger +0.012, qEntryLocation −0.023, qMomentum −0.041, qVolatility −0.037, qMtf −0.035, qSession +0.012, qRr −0.014. Trades with above-average qMomentum, qEntryLocation, qVolatility or qMtf have lower mean R than trades below average.

**QUALITY_SCORE_FINDING:** the score has no predictive ordering; the highest bucket (85+) is the only one with a CI excluding zero, and it is negative. Responsible components: qMomentum, qEntryLocation, qVolatility and qMtf all associate inversely with outcome. Not retuned.

---

## PART 11 — EXIT STACK AUDIT

Production exits (1,406 trades):

| Exit | n | Mean R | Total R | Hold bars | MAE / MFE R |
|---|---|---|---|---|---|
| PROFIT_PROTECT_CLOSE | 592 | +0.70 | +415.8 | 10.1 | 0.50 / 2.01 |
| THESIS_INVALIDATION_CLOSE (stop close 248, opposite structure break 142) | 390 | −0.99 | −386.6 | 12.1 | 1.14 / 0.41 |
| BROKER_SL (structural × 1.5 + spread) | 252 | **−1.57** | −395.6 | 3.9 | 2.09 / 0.53 |
| BROKER_TP monetary +30 USD | 119 | +3.41 | +405.7 | 16.5 | 0.43 / 3.96 |
| THESIS_DETERIORATION_CLOSE | 53 | −0.71 | −37.4 | 6.6 | 0.94 / 0.39 |
| MONETARY_MAX_LOSS / EMERGENCY | 0 | — | — | — | never reached (the structural fail-safe always binds first at 0.01) |

Loss magnitude (696 losses): > 1.0 R 509 (73 %), > 1.2 R 344 (49 %), > 1.5 R 252 (36 %, all broker fail-safe), > 2.0 R 0. THESIS_STOP_CLOSE averages −1.19 R because it acts on the confirmed close beyond the stop.

V2 structural exits on the same signals (SL = structural stop, TP = TP2): win rate 46.4 %, mean R −0.005, PF 1.04, total −7.2 R; discovery +0.014 / 1.11, validation −0.034 / 0.95. STRUCTURAL_SL 615 losses at −1.07 R; STRUCTURAL_TP2 240 wins at +2.24 R.

**EXIT_STACK_FINDING:** neither stack has an edge. The production stack earns +415 R from profit protection and +406 R from the monetary +30 target, then gives back −396 R at the 1.5 × fail-safe and −387 R at thesis invalidation. The structural stack loses the big monetary winners and gains nothing.

**BROKER_FAILSAFE_FINDING:** yes, the 1.5 × multiple allows losses materially larger than structural risk: 252 trades (18 % of all, 36 % of losses) closed at −1.57 R, 70 % of them on stops under 5 USD, with an average hold of 3.9 bars. Cause is broker protective geometry by design (the monitor's monetary −50 USD boundary never binds at 0.01) plus the adaptive manager's confirmed-close delay (THESIS_STOP_CLOSE overshoots by ≈ 0.19 R). Not gaps or slippage (no loss exceeded 1.68 R). Not implementation error. Whether closing at 1.0 × structural would help is answered by the V2 stack comparison: it does not, in aggregate.

---

## PART 12 — ENTRY TIMING / MAE / MFE

| Model | Winners: mean MAE (USD / ATR / R), share > 0.5 R | Losers: mean MFE (USD / ATR / R), share ≥ 1 R, share < 0.25 R |
|---|---|---|
| MC | 5.37 / 0.91 / 0.39, 28 % | 5.77 / 0.96 / 0.39, 1 %, 40 % |
| PB | 3.85 / 0.69 / 0.49, 47 % | 3.81 / 0.69 / 0.45, 6 %, 36 % |
| BO | 3.16 / 0.61 / 0.51, 44 % | 2.85 / 0.55 / 0.47, 10 %, 38 % |
| SR | 2.09 / 0.42 / 0.48, 37 % | 2.27 / 0.38 / 0.41, 8 %, 42 % |
| MR | 2.71 / 0.51 / 0.43, 28 % | 3.91 / 0.74 / 0.64, 17 %, 25 % |
| ALL | 3.48 / 0.64 / 0.49, 41 % | 3.39 / 0.62 / 0.46, 8 %, 38 % |

Winners typically endure 0.5 R of adverse movement and losers typically achieve 0.46 R of favourable movement before failing: the two distributions are near-symmetric, which is the signature of entries without timing edge, not of systematically early or late entries. 57 losers (8 %) reached ≥ 1 R and still lost (−74 R total), an execution give-back pocket. No entry-offset optimisation is proposed.

---

## PART 13 — NEWS / SHOCK

Historical News/Shock states cannot be reconstructed (no calendar archive, no tick archive). Known live states exist only for 25 Sep: two VOLATILITY_SHOCK blocks (14:04–14:16 and 16:01–16:11 UTC) with zero signals blocked, and news NORMAL all day. **NEWS_SHOCK_FINDING:** UNRECONSTRUCTABLE for the dataset; no claim can be made about tail-risk reduction; the replay therefore includes a small number of signals the live guards would have blocked. Protection unchanged.

---

## PART 14 — BREAKER AUDIT (flat 0.01, sequential, single position, no capital policy)

| | Taken | Blocked | Blocked-signal outcomes | Net R | Net USD | Max DD R / USD | Max loss streak |
|---|---|---|---|---|---|---|---|
| CURRENT 2-loss daily breaker | 532 | 591 | n 591, mean +0.013 R, PF 1.14 | **+7.7** | −19.4 | 40.2 / 325 | 8 |
| No breaker (observation only) | 933 | 0 | — | **−7.2** | +57.3 | 50.5 / 328 | 11 |

**BREAKER_FINDING:** blocked signals were individually neutral (mean +0.01 R), but the sequential path with the breaker ended +15 R better with a 10 R smaller drawdown and a shorter worst streak. No evidence supports removing or loosening it.

---

## PART 15 — LOSS DRIVERS (ranked by total negative R; "net" is the group's total R)

| # | Driver | n | Neg R | Net R | Mean R | CI95 | Confidence | Likely cause |
|---|---|---|---|---|---|---|---|---|
| 1 | Broker fail-safe stop-outs at 1.5 × structural | 252 | −395.6 | −395.6 | −1.57 | tight | HIGH | RISK MANAGEMENT (protective geometry + confirmed-close delay) |
| 2 | 5m trend aligned with 15m bias (continuation trades, mostly MC/PB) | 489 | −301.6 | −62.8 | −0.128 | [−0.247, −0.006] | HIGH | STRATEGY DESIGN |
| 3 | THESIS_STOP_CLOSE exits (close beyond structural stop) | 248 | −294.8 | −294.8 | −1.19 | tight | HIGH | EXECUTION (confirmed-close latency, by design) |
| 4 | Quality 85+ bucket | 296 | −197.7 | −63.9 | −0.216 | [−0.382, −0.042] | HIGH | STRATEGY DESIGN (score components mis-ordered) |
| 5 | Stops under 5 USD (< 3 and 3–5) | 523 | −374.8 | −60.5 | −0.116 | — | MEDIUM | RISK MANAGEMENT (noise stops × 1.5 fail-safe) |
| 6 | SR model | 107 | −73.8 | −40.4 | −0.377 | [−0.617, −0.133] | HIGH | STRATEGY DESIGN |
| 7 | Signals during 15m-lag episodes | 82 | −52.5 | −35.0 | −0.426 | [−0.658, −0.170] | HIGH | STRATEGY DESIGN (bias lag) |
| 8 | PB model | 226 | −138.4 | −27.5 | −0.122 | [−0.284, +0.048] | MEDIUM | STRATEGY DESIGN |
| 9 | Losers that had ≥ 1 R open profit | 57 | −74.2 | −74.2 | −1.30 | tight | HIGH | EXECUTION (profit protection trigger timing) |
| 10 | Asia session | 554 | — | −38.1 | −0.069 | [−0.201, +0.064] | LOW | INCONCLUSIVE |

Drivers 2, 4, 6 and 7 overlap heavily (SR and continuation trades fire in the highest quality buckets during directional bias). Data/runtime is not a loss driver in this dataset. Nothing above is a hindsight rule removal; each is a candidate for the separate approval stage with out-of-sample confirmation.

---

## PART 16 — WALK-FORWARD

| Segment | Sessions | n | Mean R | PF | CI95 |
|---|---|---|---|---|---|
| DISCOVERY (2026-04-29 → 07-27) | 77 | 844 | +0.028 | 1.16 | [−0.081, +0.141] |
| VALIDATION (2026-07-28 → 09-25) | 52 | 562 | −0.039 | 0.95 | [−0.165, +0.106] |

DISCOVERY_RESULT = marginally positive, not significant. VALIDATION_RESULT = marginally negative, not significant. Per model, only MR is positive in both halves (n 25 / 28); BO and MC flip from positive to negative; PB and SR are negative in both. Every variant tested in Part 7 also fails to make the validation segment positive, so **no improvement survives out of sample**.

---

## PART 17 — BOOTSTRAP / MONTE CARLO (seeded, CURRENT outcomes only)

Strategy: mean R 5th/50th/95th percentile −0.068 / 0.000 / +0.072; P(mean ≤ 0) = 50 %; max drawdown over 1,406 trades median 66.7 R (95th 129.3 R); max losing streak median 9 (95th 13). Model CIs are in Part 4. **Empirical expectancy is not distinguishable from zero.**

---

## PART 22 — DECISION

**CURRENT_STRATEGY_CLASSIFICATION = EDGE_NOT_DEMONSTRATED.** Basis: n 1,406; mean R +0.001 with CI [−0.082, +0.085]; PF 1.07; walk-forward flips sign (1.16 → 0.95); model consistency poor (only MR positive in both halves, n 53); drawdown median 67 R with loss streaks of 9–13 at 0.01. It is not NEGATIVE_EXPECTANCY_EVIDENCE (the CI includes clearly positive values and the point estimate is not negative), and it is not PROMISING (mean R < 0.1 and PF < 1.1).

Per model: BO NO_DEMONSTRATED_EDGE; MC NO_DEMONSTRATED_EDGE; PB NO_DEMONSTRATED_EDGE (negative in both halves); SR NEGATIVE_EVIDENCE; MR PROMISING_BUT_UNPROVEN.

Where the strategy currently earns: 15m NEUTRAL bias (RANGE and COMPRESSION), MR entries, 8–12 USD stops, London/New York sessions. Where it currently loses: continuation trades under a directional 15m bias (MC/PB), SR, quality 85+, sub-5 USD stops through the 1.5 × fail-safe, signals during 15m-lag episodes, Asia.

**STRATEGY_CHANGE_JUSTIFIED = NO** for production at this stage. Candidates supported by both discovery and validation segments, to be re-tested on future out-of-sample data before any approval stage: (1) SR model negative in both halves (n 69 / 38); (2) quality-85+ bucket negative overall and the score components mis-ordered; (3) signals fired against 5m structure during 15m-lag episodes (n 82, both halves negative). Broker fail-safe geometry and sub-5 USD stops are large loss sources but the V2 structural-exit comparison shows that simply tightening the fail-safe does not recover the edge, so no exit change is supported yet.

NEXT_PRODUCTION_CHANGE_RECOMMENDED = NONE.

**MASTER_RESEARCH_COMPLETE = YES** for everything reconstructable. Still missing for stronger conclusions: OANDA-feed bar captures for every session (to remove the broker-feed offset), a historical News/Shock state archive, live class-A outcomes across at least 60 sessions, and out-of-sample sessions after 2026-09-25 to re-test the three candidate findings.
