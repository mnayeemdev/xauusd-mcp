# NEW INFORMATION V7 — PRE-REGISTRATION (frozen before any V7 outcome is inspected)

Written 2026-10-01 ~07:20Z. HEAD 195ecc9. Fingerprint 356e4189…. Research only. CONTROL per V7_CONTROL_BASELINE.md.

## 1. Question
Can information the current MCP does NOT have (new data, not new parameters on XAUUSD price) reduce the wrong-direction trade population of the frozen entry streams and improve after-cost expectancy out of sample? "New information" = a feature whose raw input is not a function of the XAUUSDm price/volume/spread series or the production labels already in the V6 set.

## 2. Data availability decisions (frozen; DATA_AVAILABILITY.md)
AVAILABLE and replayable: XAGUSDm (5m/15m), DXYm (5m from 2025-05-27, 15m from 2022), USTECm (15m), official USD release timestamps. FORWARD_ONLY: MT5 market depth / order-book pressure (no history; Exness CFD depth is broker-synthetic). UNAVAILABLE / DATA_UNVERIFIED: exchange (COMEX) volume, Treasury yields (no instrument captured), release surprise values, news sentiment, execution latency. Tick volume is a broker activity proxy, never called exchange volume.

## 3. Timestamp integrity rules (hard)
All series are on the Exness server clock; bars are indexed by open time and are COMPLETE at open + timeframe. A cross-asset bar may be used at the gold decision (close of gold bar i, time t_c = open_i + 300 s) only if its close time ≤ t_c. For 5m series this is the bar with the same open time; for 15m series the last bar with open ≤ t_c − 900. Release timestamps are the published schedule (known in advance). A feature with no qualifying bar within 2 × timeframe is NA. NA → the candidate does NOT wait (deterministic pass-through) and the NA count is reported. Delay sensitivity: every finalist is re-evaluated with the cross-asset series delayed by one extra bar (conservative feed lag). Prefix invariance: features recomputed on a truncated copy of every series must be identical.

## 4. Outcome labels, populations, economics (frozen; as V6)
Populations: CONTROL (production entries, production geometry, control exit) and V4 S3 (first structure break, TP 1.70 R). WRONG_DIRECTION = open-path MFE < 0.5 R and structural stop reached; BAD_ENTRY = never +1 R before invalidation; event-level wrong direction = V1–V4 definition; move capture = V4 definition. Sequential one-position walk with the production re-entry guard; NORMAL / STRESS costs; R economics; 0.01-lot USD separately.

## 5. Feature definitions (frozen; relative to the signal side where directional; ATR = 14-bar simple ATR of the SAME instrument)
- silver_mom6 = (XAG close − XAG close 6 bars earlier) / XAG ATR14, on the 5m bar with the gold bar's open time. silver_act = XAG tick volume ÷ mean of the previous 48 XAG bars. gold_act = the same for XAUUSD.
- dxy_mom6 = (DXY close − DXY close 6 bars earlier) / DXY ATR14 on 5m when available; else the last completed 15m DXY bar: (close − close 2 bars earlier) / 15m ATR14; else NA. dxy_shock = any DXY 5m bar range ≥ 2.5 × DXY ATR14 within the last 3 bars (15m fallback: last 15m bar range ≥ 2.5 × 15m ATR14).
- ustec_mom2 = (USTEC 15m close − close 2 bars earlier) / USTEC 15m ATR14 on the last completed 15m bar.
- release_reaction = sign of the first COMPLETED 5m XAUUSD bar after an official release (available from that bar's close), valid for 120 min after the release; approaching = release within the next 30 min.
- spread_state = XAUUSD decision-bar spread points vs the trailing 288 bars: percentile rank and ratio to the trailing median.
Direction convention: sgn = +1 for BUY, −1 for SELL; "opposes" = sgn × feature ≤ −thr; "agrees" = sgn × feature ≥ +thr.

## 6. Candidates (≤ 8; one source at a time; thresholds = small frozen grids, one chosen on DEV by §8)
- **N1 SILVER_OPPOSE** (source XAGUSDm): WAIT if silver_mom6 opposes the signal, thr ∈ {0.5, 0.75, 1.0}. Mechanism: gold and silver move together (5m return correlation +0.75); a gold signal against silver's contemporaneous move is suspect.
- **N2 SILVER_CONFIRM** (XAGUSDm): WAIT unless silver_mom6 agrees, thr ∈ {0.3, 0.5, 0.75} (strict version).
- **N3 DXY_WITH** (DXYm): WAIT if dxy_mom6 moves in the SAME direction as the gold signal (dollar rising while buying gold) with magnitude ≥ thr ∈ {0.5, 0.75, 1.0}. Mechanism: Edge Lab G2 observation (gold breaks in the dollar's direction tend to fail).
- **N4 DXY_SHOCK** (DXYm): WAIT if dxy_shock (dollar volatility shock; non-directional), range multiple ∈ {2.0, 2.5, 3.0}.
- **N5 USTEC_RISK** (USTECm): hypothesis "risk-off (Nasdaq falling) favours gold BUY": WAIT if ustec_mom2 ≥ +thr and the signal is BUY, or ustec_mom2 ≤ −thr and the signal is SELL, thr ∈ {0.5, 0.75, 1.0}.
- **N6 ACTIVITY_DIVERGENCE** (XAGUSDm + XAUUSDm tick volume): WAIT if gold_act ≥ 1.5 and silver_act ≤ thr ∈ {0.6, 0.7, 0.8} (gold-only activity without silver participation).
- **N7 MACRO_REACTION** (release timestamps + XAUUSD price; DERIVED, not new raw data): within 120 min after a release, WAIT if the signal opposes release_reaction; WAIT in the 30 min before a release; window ∈ {60, 120, 180} min.
- **N8 SPREAD_STATE** (XAUUSDm broker spread; execution state, non-directional; existing data, new use): WAIT if spread percentile > p ∈ {0.85, 0.90, 0.95} OR spread ≥ 1.5 × trailing median.
Combination: only sources with DEV incremental value are combined (intersection), at most 3; none otherwise. Ablation: remove the new source from the best candidate.

## 7. Incremental value, redundancy, directional and economic tests
As V6: CONTROL vs CONTROL + source; incremental = N ≥ 200, expectancy ≥ +0.05 R above the population AND lower WRONG_DIRECTION rate. Redundancy: phi between each new WAIT flag and the V6 flags (HTF aligned, momentum supportive, regime trend-with, tick-volume high, shock, news window, session) on CONTROL signals; |phi| ≥ 0.5 = redundant. Directional impact: wrong-direction (trade and event level), bad-entry, right-direction. Trade economics: reach +1 R / +1.7 R, stop reach, MFE, MAE, give-back on the kept trades. Missed-move classes as V4/V6.

## 8. DEV selection and gate (§41)
Per candidate: the grid value with the highest DEV sequential expectancy with N ≥ 200 (ties → middle value). Gate on HOLDOUT (CONTROL stream): (1) data quality PASS (no duplicates, monotone, geometry valid, NA rate ≤ 5 % of signals for the source); (2) timestamp integrity PASS (prefix invariance; one-bar delay changes expectancy by < 0.03 R and does not flip the sign); (3) WRONG_DIRECTION (trade) < CONTROL AND event-level < CONTROL; (4) BAD_ENTRY < CONTROL; (5) expectancy > 0; (6) PF > 1.10; (7) expectancy ≥ CONTROL + 0.10 R and DD ≤ CONTROL; (8) N ≥ 200; (9) ≥ 60 % quarters positive; (10) ROBUST neighbours; (11) STRESS > 0; (12) trade AND block 95 % CI lower bounds > 0; (13) capture ≥ 50 % of CONTROL; (14) live/replay parity PASS for the source (live shadow records vs replay: 15m z-score and return match within tolerance for ≥ 95 % of comparable records); (15) practical availability (documented); DEV expectancy > 0. Verdicts as V6: INFORMATION_INCREMENTAL_VALUE YES / INCONCLUSIVE / NO (both splits / one / none); DIRECTIONAL_ACCURACY_IMPROVED YES if both wrong-direction measures fall ≥ 3 points at N ≥ 200; TRADE_ECONOMICS_IMPROVED YES if the best candidate's HOLD CI lower bound > CONTROL point estimate and expectancy > 0; EDGE_DEMONSTRATED YES only with a passing candidate; INCONCLUSIVE if some N ≥ 200 candidate has positive HOLD expectancy with lower wrong-direction and a CI through zero; else NO. DEMO_ELIGIBLE = YES only with EDGE = YES.

## 9. Controls
Leak / null / cost 0.10 / first exit ≥ t + 1 / prefix invariance of every cross-asset feature / CONTROL reproduces V6 exactly (n, expectancy, DD, capture, wrong-direction) / repeatability.

## 10. Correction log
Kept in `results/CORRECTION_LOG.md` (this file stays frozen).
