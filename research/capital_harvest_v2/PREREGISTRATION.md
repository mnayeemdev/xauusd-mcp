# PRE-REGISTRATION — CAPITAL HARVEST V2: RR & ENTRY FREQUENCY STUDY

Written: 2026-09-30 15:58 UTC, BEFORE any experimental outcome of this stage was computed.
Production: FROZEN (REAL v9, fingerprint `356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed`, git HEAD 1d8a85a). Nothing here proposes or permits a production change, a lot change, or any trade.

Snapshot at writing (read-only): REAL 460149329 / Exness-MT5Real51, balance = equity 62.07 USD, leverage 1:200, lot 0.01 USER_FIXED, AUTO_SCALING OFF, flat, 0 pending orders, breaker 0/2, halted null, protection not blocking, feed streak 0; watcher PID 10800 heartbeat 15:54:37Z; Stage11C PID 504 fresh; MT5 PID 46576 connected (tick 15:55:36Z, spread 0.24). Broker spec (read-only `symbol_info`, `order_calc_*`): XAUUSDm volume_min 0.01, step 0.01, contract 100 oz, 1.00 USD move at 0.01 lot = 1.00 USD, margin for 0.01 lot 20.78 USD (20.81 at the V1 read), swap long −0.56 USD/night, swap short 0.

V1 package read (files, not memory): PREREGISTRATION (final sha fe534411…, three logged corrections), CHATGPT_HANDOFF_REPORT, CAPITAL_RISK, HARVEST_MILESTONE, PROFIT_LOCK, BANK_VS_RUN, LOSS_ASYMMETRY, REENTRY, COST_STRESS, ACCOUNT_SCALE, ROBUSTNESS, H0–H4, scripts/tests/results. V1 H2a (holdout +0.655 USD/trade, PF 1.29, avg win 4.48 / loss 6.37, 9 trades/session) is used here ONLY as the fixed management layer; it is not being promoted.

Disclosure of prior knowledge: the author knows the V1 results above, the Entry Architecture V2 RR-band tables measured with STRUCTURAL exits (RR 1.5–1.7 bands negative under production's own TP2/SL exits), and the Edge Lab funnel counts (6,428 RR rejections of 19,322 geometry-valid candidates). No outcome of any RR threshold or RR bucket under H2a management has been seen. 2026-09-30 is MOTIVATING_EXAMPLES_ONLY and is excluded from all inference; §10 replays it for illustration after the frozen results.

---

## 1. Data, management, costs, outcomes (fixed; inherited from V1 unless stated)
- Data: Edge Lab MT5 XAUUSDm bars and replay; the enriched candidate set `research/entry_architecture_v2/results/candidates.jsonl` (23,950 candidate candles with production geometry, quality breakdown and context flags recomputed with the frozen engine). No new data.
- Management: **H2a exactly as corrected in V1** (`research/capital_harvest_v1/scripts/harvest_engine.mjs`, imported, not copied): entry at the signal close; structural stop = production engine stop, never moved; M1 = 3.00 USD of favourable excursion after spread; at the milestone bar the 2-of-3 continuation evidence (bar closed in trade direction; close beyond previous bar's extreme; range ≥ ATR14 at entry) decides BANK (P&L 2.90) or RUN with floor F = min(M1 − 1.00, close P&L) ≥ 0.50, ratcheted at each 5m close to max(F, min(MFE − 1.00, close P&L)), never lowered, never above executable market, banked at the close if the floor would be ≤ 0.50; exit on floor touch (F − 0.10), opposite production signal, or horizon 288 bars. Costs: spread 0.24 (BUY on entry, SELL on exit), slippage 0.10, stress 0.60 + 0.20, drift = next bar open, swap long −0.56/night.
- Re-entry (V1 rules): never on/before the exit candle; skip the same (model, side, anchor to 0.01) within 12 bars of the last entry; no same-side entry within 3 bars after a loss. One position at a time. Trades are 0.01 lot; no compounding.
- Splits: DEVELOPMENT 2025-05-07 → 2025-12-31; HOLDOUT 2026-01-01 → 2026-09-29. Sessions = UTC days with ≥ 1 processed candle (437; DEV 205, HOLD 232).
- Independent signals: same side ≤ 12 bars = one cluster (first candle). Bootstrap 2,000 resamples, 95% percentile CI.
- Family for multiple testing: the four experimental thresholds R1–R4 (Bonferroni α = 0.0125). Capital caps and buckets are descriptive.

## 2. Population A — frozen production signals up to the RR gate (causal isolation of RR)
A candidate is in Population A iff it passes every production gate EXCEPT the RR gate: ATR ≥ 2 USD, overextension ≤ 2.5 ATR, valid stop geometry, quality ≥ threshold (65 directional / 70 neutral-unsupported, HTF penalty 5), no fresh opposing 15m CHoCH, no 30m two-factor conflict, no 1H HTF conflict. The models, 5m/15m/30m/1H rules and all vetoes are unchanged.
**Quality coupling (production formula, frozen):** `scoreQuality` contains `qRr = clamp(10·(rr − minRR)/minRR, 0, 10)`. Lowering minRR changes this term, so for each threshold m the quality is re-evaluated as `q_m = (q_final − qRr_1.70) + clamp(10·(rr − m)/m, 0, 10)`; for R4 (no fixed RR) the term is 0. Nothing else in quality changes.

Thresholds (frozen): **R0 = 1.70 (control), R1 = 1.50, R2 = 1.25, R3 = 1.00**, and **R4 = NO_FIXED_RR** = rr > 0 AND structural objective distance |tp2 − entry| ≥ 3.34 USD (M1 + round-trip cost: the first harvest must be reachable before the structural target obstructs it) AND every non-RR requirement above. R4 is diagnostic.
Signal set S_m = Population A with rr ≥ m (R4 as defined). Each S_m is simulated sequentially under H2a; DEV and HOLDOUT are reported.

## 3. Population B — full signal funnel by threshold
From the same replay: completed candles → model eligible → candidate (setup + trigger) → ATR floor → overextension → geometry → RR pass at m → quality pass (q_m) → fresh-CHoCH → 30m two-factor → 1H HTF → signal. Safety/execution gates (News V2, shock, spread, drift, breaker, identity) are not in the replay and are identical across thresholds. Also per threshold: sessions with zero signals, and the distribution of sequential H2a trades per session (0 / 1–3 / 4–6 / 7–10 / > 10). A and B are never mixed.

## 4. Incremental RR buckets (mutually exclusive, Population A)
Buckets: rr < 1.00; 1.00 ≤ rr < 1.25; 1.25 ≤ rr < 1.50; 1.50 ≤ rr < 1.70; rr ≥ 1.70. Bucket membership uses `q_m` with m = the bucket's lower bound (0 for the first bucket). Per bucket: raw N, independent N, H2a per-signal outcomes on the independent set (win rate, expectancy USD, PF, CI, average win/loss, median MFE/MAE), +1/+2/+3/+5/+7.5/+10 USD hit rates before the structural stop and median bars to reach, sequential max drawdown within the bucket, stress and drift expectancy, DEV vs HOLD, model composition, BUY/SELL split, session distribution.

## 5. Capital risk, matrix, capital paths
Expected loss = |entry − stop| + 0.24 + 0.10 at 0.01 lot; bands ≤ 1%, 1–2%, 2–3%, 3–5%, 5–8%, > 8% of 62.07 USD. Per threshold: band shares, median and P75 expected loss, worst loss, margin burden (20.78 USD), k-loss effects (2, 3, 5 average losses as % of equity), capital required for the median risk to be ≤ 3% / 2% / 1%.
Matrix (frozen): thresholds {1.70, 1.50, 1.25, 1.00, R4} × capital caps {none, ≤ 8%, ≤ 5%, ≤ 3%} of 62.07 USD. A candidate above the cap is CAPITAL_RISK_TOO_HIGH (never a tighter stop). Each cell: N signals, sequential trades, holdout expectancy, PF, max DD. Empty cells are reported as empty.
Capital paths: each threshold's sequential H2a trade sequence (chronological) from 60, 100, 250, 500 and 1,000 USD at 0.01 lot; min balance, max DD, whether the path crosses the 20.78 USD margin floor; month-shuffled (500 draws) share crossing the floor at 60 USD.

## 6. Loss asymmetry, cost stress, stability (per threshold and per bucket)
Average win, average loss, wins erased by one average loss, median winning-streak contribution, median losing-streak damage, 95th-percentile and largest loss sequence, +2.90 banks needed to recover one average loss / one P75 loss / two average losses. Cost regimes: normal, stress, next-bar drift, swap. Stability: DEV vs HOLD, monthly and quarterly expectancy, 2025 vs 2026, BUY/SELL, model, 5m regime, session.

## 7. Controls (acceptance frozen; abort on failure)
Leak control (future 12-bar sign, symmetric 1 ATR stop / 1 ATR target) mean > +1.00 USD; null control |mean| < 0.50 USD; slippage accounting on identical paths = 0.100 ± 0.001; dedup (0 same-candle, 0 stale, 0 revenge re-entries); ratchet monotonicity (0 violations); deterministic repeatability (two in-process runs of the full study produce byte-identical results excluding the timestamp); timestamp alignment inherited (same slicing reproduced 43/43 and 37/38 live decisions today); look-ahead by construction (entries at signal close, evidence at the milestone bar, exits from the next bar).

## 8. Decision rule (frozen; HOLDOUT, normal cost)
For each experimental threshold m ∈ {1.50, 1.25, 1.00, R4} the judged object is the INCREMENTAL population S_m \ S_1.70 (the trades the lower threshold adds), on the independent set, plus the sequential comparison S_m vs S_1.70.
- REJECTED: incremental expectancy ≤ 0 USD, or incremental PF ≤ 1.00.
- INCONCLUSIVE: incremental expectancy > 0 but any of: CI includes 0; PF ≤ 1.10; the positive sum depends on one model (> 60% of positive contribution) or one month or one side (the other side negative); stress expectancy < −0.10 (catastrophic); sequential max DD of S_m worsens by a larger percentage than net profit improves versus S_1.70; frequency increase < 10% of S_1.70 trades; DEV and HOLD incremental expectancies of opposite sign with the DEV value outside the HOLD CI.
- RESEARCH_CANDIDATE: all of the following: incremental expectancy > 0 with CI lower > 0 (Bonferroni α 0.0125); PF > 1.10; no single-model/month/side dependence as above; stress expectancy ≥ −0.10; drawdown not worse than the benefit; frequency increase ≥ 10%; DEV/HOLD not contradictory; controls pass; capital constraint reported separately (§5) and explicitly flagged.
No threshold is PRODUCTION_READY from this study. A RESEARCH_CANDIDATE, if any, may only be recommended as a FORWARD SHADOW candidate.

## 9. Today's cases (illustrative only)
After the frozen results: replay 2026-09-30 RR-rejected production candidates (09:55 BO SELL RR 1.27, 12:20 SR BUY RR 1.31, 13:50 BO SELL RR 1.62, 14:15 BO SELL RR 1.43, and the stall-suppressed 13:55 RR 1.42 and 14:05 RR 1.21) under H2a on today's MT5 bars: production decision, RR, admitting threshold, H2a path, MFE, MAE, +3 reached, bank/run result, structural stop outcome. Labelled ILLUSTRATIVE — NOT EVIDENCE.

## 10. What this stage will not do
No production edit; no trade; no watcher/MT5/TradingView/Stage11C action; no change to lot, news, MTF, breaker or fingerprint; no reopening of the 30m two-factor veto or the impulse-without-retest hypothesis; no thresholds beyond the frozen family; no milestone re-selection; no PROVEN_EDGE or PRODUCTION_READY claim.

## 11. Correction log
| When (UTC) | Old sha256 | New sha256 | What | Outcome data observed? |
|---|---|---|---|---|
| 16:02 | ee5a4838426f9215def5a055da1d0c852d8a0eed8969ea5c42346b83fb5e87fd | see PREREGISTRATION.sha256 after this edit | §2 quality coupling formula: written as `q_m = (q_final − qRr_1.70) + qRr_m`, but production rounds each breakdown component while the score is rounded from the raw sum, so subtracting the ROUNDED breakdown term left 173 of 9,617 production signals 0.2–0.4 points under threshold at m = 1.70. Implemented as the equivalent delta form `q_m = q_final + (qRr_m(raw) − qRr_1.70(raw))`, which reproduces production exactly at 1.70 and applies the same coupling elsewhere. | NO — the run aborted at the pre-registered consistency check (R0 must equal production) before any threshold, bucket or matrix outcome was computed. |
