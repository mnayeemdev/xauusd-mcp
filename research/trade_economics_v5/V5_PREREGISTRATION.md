# TRADE ECONOMICS V5 — PRE-REGISTRATION (frozen before any V5 outcome is inspected)

Written 2026-10-01 ~05:35Z. HEAD 186c427. Fingerprint 356e4189…. Research only. CONTROL per V5_CONTROL_BASELINE.md.

## 1. Questions
Q1 (entry economics): when the engine identifies a valid opportunity, is the trade geometry (entry location × structural invalidation × risk distance × target distance) the reason the economics are negative, or is the entry itself? Q2 (exit geometry): can any exit policy that uses only information available at the decision time convert the frozen entry populations into positive after-cost HOLDOUT economics without destroying the right tail? ENTRY_ECONOMICS_RESULT and EXIT_GEOMETRY_RESULT are reported separately; an exit cannot be credited as an entry edge.

## 2. Populations (frozen; no new entries, no entry re-tuning)
CONTROL = production signals with production geometry (entry, structural SL, objective TP2). V4 populations S1 … S7 regenerated from the frozen V4 finalists (entry = trigger close, structural stop, control exit = TP 1.70 R). Meaningful-sample populations for decisions: CONTROL, S2, S3, S4 (HOLD N ≥ 900); S1, S6, S7, S5 reported as reference only. The §35 four-way isolation uses CONTROL and S3 (the V4 population with the best detection).

## 3. Normalisation
1R = planned structural risk distance |entry − SL| of the trade (production SL for CONTROL; family stop floored at 0.5 ATR for V4). Fill = entry + spread (BUY) / entry (SELL). Per trade: entry, SL, risk distance (USD, ATR), target distance (R), MFE_R, MAE_R, MAE within 3 bars, exit_R, duration (bars), cost_R (spread + slippage + swap) / R, USD at 0.01 lot (× 1.0 USD per 1.00 price unit). No fixed-dollar risk anywhere.

## 4. Diagnostics definitions (frozen)
- Open path: structural stop only (EXIT_F semantics: broker 1.5 R + spread intrabar, thesis invalidation on close), no target, 288-bar horizon. Gives MFE_open, MAE, first bar reaching each milestone {0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.7, 2, 2.5, 3} R, stop bar. TARGET REACHABILITY = milestone reached before structural invalidation.
- MAE buckets: 0–0.10, 0.10–0.25, 0.25–0.50, 0.50–0.75, 0.75–1.00, 1.00–1.25, > 1.25 R (winners vs losers under the control exit). MFE buckets: < 0.25, 0.25–0.5, 0.5–0.75, 0.75–1, 1–1.25, 1.25–1.5, 1.5–1.7, 1.7–2, 2–2.5, > 2.5 R.
- Entry location: displacement from the move origin (12-bar extreme) in ATR — EARLY < 0.3, VALID 0.3–1.0, LATE 1.0–1.5, CHASED > 1.5; plus risk/ATR, TP/ATR, distance to the last confirmed swing on each side (ATR), position inside the 24-bar range (0–1), distance to the anchor level (breakout / pullback origin / reclaim level; CONTROL: production `overext_atr`).
- Structural stop: SL/ATR, stop reach rate (structural close OR broker 1.5 R), recovery rate = share of eventual winners whose MAE ≥ x for x ∈ {0.25, 0.5, 0.75, 1.0} R, "noise region" = MAE within 3 bars; tightened/widened stops (0.75× / 1.25× structural, R re-normalised) as diagnostics only.
- Time: bars to each milestone for winners / losers / eventual winners with MAE ≥ 0.5 R; time-to-stop buckets FAST ≤ 3 bars, MEDIUM 4–12, SLOW 13–48, LATE > 48; losers classified TEMPORARY_ADVERSE if MFE ≥ 0.5 R before the stop.
- Profit give-back: for trades with MFE ≥ 0.5 R under a policy, giveback = MFE_R − realized_R; reported at MFE ≥ 0.5 / 0.75 / 1.0 / 1.5 / 2.0 R.
- Right tail: trades with MFE_open ≥ 2 R: share, mean realized R under each policy, truncation rate = share of those trades realizing < 1.0 R, profit lost = Σ(control-exit realized − policy realized) on those trades. RIGHT_TAIL_PRESERVED = YES if a policy's mean realized R on MFE_open ≥ 2 R trades is ≥ 80 % of the control exit's on the same trades, INCONCLUSIVE 60–80 %, NO < 60 %.
- Cells: ENTRY TYPE × ENTRY TIMING × SL-distance tercile; MODEL × geometry; REGIME (5m) × geometry; DIRECTION × geometry; cells with N < 30 INSUFFICIENT.

## 5. Exit-policy families (information-time; thresholds in R or structure; TP = population target unless stated; structural stop + broker 1.5 R always active until raised)
- **B0 / P0 FIXED**: target rr ∈ {0.5, 0.75, 1.0, 1.25, 1.5, 1.70, 2.0, 2.5, 3.0} R. 1.70 = CONTROL reference (CONTROL population: production TP2 is B0-actual; fixed 1.70 R reported alongside).
- **P1 BREAK-EVEN**: once a completed bar's favourable excursion reaches m ∈ {0.5, 0.75, 1.0} R, the stop moves to the fill (+ spread cost) from the NEXT bar (intrabar thereafter); TP unchanged.
- **P2 PARTIAL PROTECTION**: once m ∈ {0.5, 0.75, 1.0} R is reached, the stop moves to fill − 0.5 R from the next bar; TP unchanged.
- **P3 PROFIT FLOOR**: once m ∈ {1.0, 1.25, 1.5} R is reached, the stop moves to m − 0.5 R from the next bar (static floor); TP unchanged.
- **P4 ADAPTIVE HARVEST**: once MFE ≥ a ∈ {1.0, 1.5} R, the stop ratchets to MFE − g, g ∈ {0.5, 0.75, 1.0} R, updated at each completed bar and effective from the next bar; no fixed TP (horizon 288).
- **B3 STRUCTURAL TRAIL**: no fixed TP; the stop moves to the most recent confirmed swing (3/3 pivot, known at pivot + 3) on the entry side once that swing is beyond the fill, updated at each completed bar; structural stop until then.
- **T TIME-STOP (diagnostic)**: exit at the close of bar n ∈ {3, 6} if the trade is at ≤ −0.5 R unrealised at that close; TP unchanged. Promoted only if it passes the gate like any other family.
Raised stops are hard intrabar levels (as a modified broker SL would be); fills at the level − slippage; TP touch intrabar; SL before TP on the same bar; horizon close. Policies never read a bar beyond the decision bar.

## 6. Candidates and selection (frozen)
Per population (CONTROL, S2, S3, S4) and per family (FIXED, BE, PARTIAL, FLOOR, HARVEST, STRUCT_TRAIL, TIME), the DEV parameter with the highest sequential after-cost expectancy with N ≥ 200 is the finalist (ties → the parameter closest to CONTROL). Baselines: B0 = control exit, B1 = best FIXED, B2 = best milestone protection (BE/PARTIAL/FLOOR), B3 = STRUCT_TRAIL, B4 = best HARVEST. Neighbourhoods = the other grid values of each parameter. ≤ 7 finalists per population; combinations of families are not tested (simplicity).

## 7. Success gate (§34; HOLDOUT, sequential one-position with the production re-entry guard, after NORMAL costs, on the SAME entry population as its control exit)
(1) expectancy > 0; (2) PF > 1.10; (3) expectancy ≥ control-exit expectancy + 0.10 R and DD ≤ control-exit DD (meaningful improvement); (4) N ≥ 200; (5) ≥ 60 % of quarters positive; (6) every threshold ROBUST (all neighbours positive); (7) no family × side × regime cell with N < 30 contributing > 30 % of net R; (8) RIGHT_TAIL_PRESERVED = YES; (9) no look-ahead (by construction + tests); (10) STRESS expectancy > 0; (11) live/replay compatible (stop/target levels from completed bars only); (12) no safety degradation; (13) trade-bootstrap AND session-block 95 % CI lower bounds > 0; DEV expectancy > 0. A policy meeting all but (13) is PROMISING/INCONCLUSIVE. EXIT_GEOMETRY_RESULT = POSITIVE only with a passing policy on a population whose entries are themselves not negative under that policy's HOLDOUT CI… (i.e. the policy's own HOLDOUT CI lower bound > 0); NEGATIVE if no policy beats its control exit by ≥ 0.10 R on any meaningful population; else INCONCLUSIVE. ENTRY_ECONOMICS_RESULT = POSITIVE only if a population is positive under the CONTROL exit on HOLDOUT with CI > 0; NEGATIVE if every meaningful population is ≤ 0 under the control exit; else INCONCLUSIVE. EDGE_DEMONSTRATED = YES only if a passing policy exists AND the same population's entry economics are not NEGATIVE-with-CI-below-zero (an exit cannot rescue an entry whose CI is wholly negative). CONTROL_VS_V5 = BETTER if the best (population, policy) HOLDOUT CI lower bound > CONTROL's point estimate and DD not worse; WORSE if the point estimate is lower; else INCONCLUSIVE. DEMO_ELIGIBLE = YES only with EDGE_DEMONSTRATED = YES. 99 % CIs reported (Bonferroni).

## 8. Capital diagnostics (not decision inputs)
0.01-lot USD per trade; equity paths and max DD in USD for $62 / $100 / $1,000 / $10,000; loss streaks; recovery time (trades to a new equity high); month-shuffle probability of a drawdown > 25 % / 50 % of each capital; margin ≈ price × 100 × 0.01 / 200 ≈ 20 USD and the production MARGIN_SAFETY_VETO threshold (≈ 71 USD equity) reported as context. Research conclusions are not altered by the $62 account.

## 9. Controls
Leak / null / cost accounting (0.10) / first exit ≥ t + 1 / CONTROL reproduces V4 CONTROL and V4 S3 exactly under the control exit / policy no-look-ahead (a raised stop never acts on the bar that produced the milestone; tests) / repeatability (DEV phase ≡ FULL phase on DEV).

## 10. Correction log
Kept in `results/CORRECTION_LOG.md` (this file stays frozen).
