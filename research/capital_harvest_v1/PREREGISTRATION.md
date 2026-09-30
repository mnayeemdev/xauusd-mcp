# PRE-REGISTRATION — CAPITAL HARVEST V1 (small-profit accumulation + capital preservation)

Written: 2026-09-30 15:14 UTC, BEFORE any experimental outcome of this stage was computed.
Production: FROZEN (REAL v9, fingerprint `356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed`, git HEAD 0df0e62). Nothing here proposes or permits a production change, a lot change, or a REAL trade.

Snapshot at writing (read-only): REAL 460149329 / Exness-MT5Real51, balance = equity = 62.07 USD, leverage 1:200, lot 0.01, AUTO_SCALING OFF, flat, no pending orders, breaker 0/2, halted null, News NORMAL (post-PCE), shock NORMAL, feed streak 0, watcher PID 10800 heartbeat 15:09:37Z, Stage11C PID 504 fresh, MT5 PID 46576 connected.
Broker specification (MT5 `symbol_info`, read-only): XAUUSDm digits 3, contract 100 oz, volume_min 0.01, volume_step 0.01, stops level 0, spread floating (0.24 USD at read), margin for 0.01 lot 20.81 USD (33.5% of equity), P&L for a 1.00 USD move at 0.01 lot = 1.00 USD, swap long −0.56 USD/night at 0.01 lot, swap short 0.

Disclosure of prior knowledge: the author knows the Edge Lab replay schema, the Entry Architecture V2 results (production structural expectancy ≈ −0.04 R, 6 trades/session median, no over-restrictive gate), the H1/H2 missed-opportunity results, and the Edge Lab production-stack simulation aggregates (median simulated MFE 5.9 USD, +30 USD reached by 8.9%, exits dominated by profit-protect and thesis closes). No milestone hit rate, harvest architecture outcome, bank-vs-run outcome or capital-risk band outcome has been seen.

Motivating examples from 2026-09-30 are MOTIVATING_EXAMPLES_ONLY; all 2026-09-30 rows are excluded.

---

## 1. Data, entries, costs, outcomes (fixed)

- Data: Edge Lab MT5 XAUUSDm bars and replay (`handoff/edge_discovery_lab/data/`), the enriched candidate set `research/entry_architecture_v2/results/candidates.jsonl` (23,950 candidates with production geometry, quality, context), and `lab_trades.json` (production-stack simulation) for the control. No new data.
- **Entries are production's own signals** (the 9,617 replay candles where the frozen engine said BUY/SELL). Entry Architecture V2 found no better entry stack, and this stage does not loosen entry quality; the funnel from setup to signal is taken from that study (GATE_ATTRITION) and re-reported, not re-optimised. Position turnover (how earlier exits free the system for later valid signals) is measured by the sequential simulation.
- Lot 0.01 (1 oz): P&L in USD = price distance in USD. Partial close is impossible at the minimum volume, so every architecture is FULL BANK or FULL PROTECTED RUN.
- Costs (normal): spread 0.24 USD (BUY pays it on entry, SELL on exit, bars are bid), slippage 0.10 USD per round trip. Stress: spread 0.60 + slippage 0.20 (0.80 total). Drift stress: entry at the NEXT bar's open. Swap: −0.56 USD per night held for BUY (applied when a position crosses 00:00 UTC), 0 for SELL.
- Splits: DEVELOPMENT 2025-05-07 → 2025-12-31; HOLDOUT 2026-01-01 → 2026-09-29. Sessions = UTC days with ≥ 1 processed candle.
- Structural stop = production engine stop (`sl` in the candidate geometry). Never moved closer. Stop touch: BUY low ≤ sl; SELL high + spread ≥ sl. Same-bar stop-and-milestone → stop first (conservative).
- Horizon 288 bars (24 h); a position still open is marked at the horizon close (counted OPEN_AT_HORIZON). Positions crossing a > 3 h bar gap are flagged GAP and excluded from primary statistics.
- Governed early thesis exit (all H1–H4, deterministic proxy of production rule C): if a production signal of the OPPOSITE side is generated while the position is open, exit at that candle's close. Production rule A (confirmed close beyond the structural stop) is subsumed by the stop touch.
- Sequential simulation: one position at a time. Re-entry rules (all architectures): (i) never enter on the exit candle or earlier; (ii) a new signal is skipped if its (model, side, anchor rounded to 0.01) equals the last traded signal's and it is ≤ 12 bars after that entry (stale re-entry); (iii) after a losing exit, no same-side entry within 3 bars (revenge guard). Violations are asserted by the dedup control.
- Clustering for inference: sequential trades are non-overlapping by construction; the 12-bar same-side rule is additionally applied to the independent-signal counts reported for the milestone tables.
- Bootstrap: 2,000 resamples, 95% percentile CI. Multiple testing: 11 experimental variants (below), Bonferroni α = 0.05/11 = 0.0045 for any significance statement.

## 2. Capital-risk eligibility layer (research-only gate)

For every entry: STOP_DISTANCE = |entry − sl|; EXPECTED_LOSS_USD = STOP_DISTANCE + spread (0.24) + slippage (0.10) at 0.01 lot; PERCENT_EQUITY_AT_RISK = EXPECTED_LOSS_USD / 62.07. Bands: ≤ 1%, 1–2%, 2–3%, 3–5%, 5–8%, > 8%. Report the population of production signals per band, and how often 0.01 lot cannot reach ≤ 2% / ≤ 3% / ≤ 5% (MINIMUM_LOT_CONSTRAINT). A candidate above a band is classified CAPITAL_RISK_TOO_HIGH, never given a tighter fake stop. Primary architecture evaluation uses ALL production signals (no capital gate) so that entries are identical across H0–H4; the capital gate is reported as a per-band breakdown of each architecture's outcomes and as the eligibility that a deployment would need. Account-scale table: 60 / 100 / 500 / 1,000 USD with risk %, harvest %, margin burden (20.81 USD per 0.01 lot), and minimum-lot constraint.

## 3. Milestone measurement (before any architecture)

On production signals: probability that MFE (measured on bar extremes, bid basis, after spread) reaches each milestone BEFORE the structural stop is touched, before an opposite production signal, and within the horizon. Dollar family: 1, 2, 3, 5, 7.5, 10 USD. R family: 0.25, 0.50, 0.75, 1.00 R (R = structural stop distance). Also the bar count to first reach.

## 4. Architectures (frozen; exactly these 1 + 11)

**H0 CURRENT PRODUCTION** = the Edge Lab production-stack simulation of the same signals (`lab_trades.json` `taken == true`, `prod`: broker structural/monetary stops, +30 USD broker TP, adaptive thesis/deterioration/profit-protect management), minus 0.10 USD slippage per trade for cost parity. Reported as-is; it is the control.

**H1 FIXED HARVEST** (5 variants): entry at signal close; exit at the first of: milestone M reached (exit at entry + M, P&L = M − slippage), structural stop touched, opposite signal, horizon. M ∈ {2 USD, 3 USD, 5 USD} and M ∈ {0.5 R, 1.0 R}.

**H2 HARVEST + PROTECTED RUN** (2 variants): M1 = 3 USD. At the bar j where MFE first reaches M1, evaluate continuation evidence using only bars ≤ j: E1 = bar j closed in the trade direction; E2 = bar j's close is beyond bar j−1's extreme (BUY: close_j > high_{j−1}); E3 = bar j's range ≥ ATR14 at entry (expansion). STRONG iff ≥ 2 of 3.
- H2a (BANK/RUN): if not STRONG → BANK at M1 (P&L = M1 − slippage). If STRONG → RUN with protected floor F = M1 − 1.00 USD (fixed-dollar buffer, ≈ 4 × spread); at each subsequent bar close F = max(F, MFE_so_far − 1.00). Exit when the bar's adverse extreme touches entry + F (P&L = F − slippage), on an opposite signal (P&L at close), or at the horizon. F never decreases (asserted).
- H2b (ALWAYS RUN): same but the bank/run decision is skipped: every trade that reaches M1 runs with the same floor and ratchet. This isolates the value of the bank/run evidence.

**H3 VOLATILITY-AWARE HARVEST** (2 variants): identical mechanics to H2a with M1 and buffer expressed in ATR14 at entry (5m, USD): H3a M1 = 0.50 ATR, buffer 0.25 ATR (ratchet MFE − 0.25 ATR); H3b M1 = 0.75 ATR, buffer 0.25 ATR. Floors are clamped to ≥ 0.50 USD above entry so protection is always positive after costs.

**H4 STRUCTURE-AWARE HARVEST** (2 variants): M1 = production TP1 distance (= 1 R structural) for H4a, 0.5 R for H4b. On reaching M1 the protected floor is the two-bar trailing extreme: for BUY, F = max(F, min(low_j, low_{j−1}) − entry − spread), updated at each bar close, clamped ≥ 0.50 USD; exit on touch of entry + F, opposite signal, or horizon. No explicit bank/run decision: structure decides.

No other variant will be run. If a variant is found unrunnable (e.g. a definition bug) the correction is logged with old/new hash and reason before results are read.

## 5. Metrics (per architecture, DEV and HOLDOUT, sequential trades unless noted)

Raw signals, independent signals, trades, trades per session (P10/P25/median/P75/P90), zero-trade sessions, average and median hold (bars), time-in-market share; win rate, average win (USD), average loss (USD), win/loss ratio, expectancy (USD per trade, after costs) and in R, PF, 95% CI; max drawdown (USD), median drawdown of the balance path, loss streak, top-5 winner share; gross profit, total costs (spread + slippage + swap), net profit, net profit per active day, COST_AS_%_OF_GROSS_HARVEST; milestone hit rate, profit-lock activation rate, protected-run rate, profit given back after M1 (MFE − final P&L, mean), HARVEST_WINS_ERASED_BY_ONE_LOSS = average loss / average win; balance path from 62.07 USD at fixed 0.01 lot, minimum balance, share of paths (bootstrap of trade order within month blocks, 500 draws) that touch ≤ 31.0 USD (50% depletion) or ≤ 21 USD (margin for 0.01 lot); stress cost, drift stress, spread stress.

## 6. Decision rule (frozen; HOLDOUT, normal cost, sequential trades)

- REJECTED: expectancy ≤ 0 USD, or PF < 1.00, or average loss / average win > 5, or max drawdown > 31.0 USD (50% of equity), or a > 5% bootstrap share of balance paths touching the 21 USD margin floor.
- NO_IMPROVEMENT: not REJECTED, and net profit per active day ≤ H0's + 0.10 USD, or (CI includes 0 and PF < 1.10).
- INTERESTING_RESEARCH_LEAD: expectancy > 0 with PF ≥ 1.10 and net/day > H0 + 0.10 USD, but fails any promotion check.
- ELIGIBLE_FOR_FORWARD_SHADOW_VALIDATION (all required): holdout trades ≥ 300; expectancy > 0 with CI lower > 0; PF ≥ 1.20; average loss / average win ≤ 3; max drawdown ≤ 18.6 USD (30% of equity); loss streak ≤ 10; positive expectancy in DEVELOPMENT; positive under stress cost and under drift stress; ≥ 60% of holdout months positive; top-5 winner share ≤ 30%; costs ≤ 50% of gross harvest; no control failure.
PROVEN_EDGE is not an allowed output. More trades alone, higher win rate alone, or a pretty equity curve alone are failures by construction of the rule above.

## 7. Controls (acceptance frozen)

Leak control: side from the FUTURE 12-bar sign with a SYMMETRIC control geometry (stop 1 ATR, fixed target 1 ATR) must give mean net P&L > +1.00 USD per trade. Null control: random side, same symmetric geometry, |mean| < 0.50 USD. Cost test: slippage is pure accounting, so on IDENTICAL trade paths (normal spread) net with slippage 0.10 minus net with slippage 0 = 0.10 USD ± 0.001; spread application (BUY fill = close + spread, SELL exit pays spread) is asserted by unit tests. Look-ahead: all decisions from bars ≤ current bar; entries at signal close; evidence for bank/run from bars ≤ j. Timestamp alignment: slicing reproduced 43/43 and 37/38 live decisions today. Dedup test: no same-candle re-entry, no stale re-entry, no revenge re-entry (asserted in simulation). Ratchet monotonicity: asserted per bar. Capital-risk calculation: unit-tested against hand values (e.g. stop 3.00 USD → 3.34 USD → 5.38% of 62.07). Spread/slippage application: unit-tested. The study aborts on any control failure.

## 8. What this stage will not do
No tuning after outcomes; no dollar-target selection beyond the family above; no lot change; no REAL trade; no production edit; no watcher/executor/MT5/TradingView action; no relaxation of news, spread, drift, shock, breaker or stale-feed protection; no reopening of the rejected 30m-veto or impulse hypotheses; no PROVEN_EDGE claim. Historical results do not prove future profitability.

## 9. Correction log

| When (UTC) | Old sha256 | New sha256 | What | Why |
|---|---|---|---|---|
| 15:18 code change; 15:24 this log entry | 849b493ab34f0ae912e3377015d74f4b01b22e82dab95857b7a95aafd12b5f3a | see PREREGISTRATION.sha256 after this edit | §7 controls only: control geometry changed from the capped H1 3-USD exit to a symmetric 1 ATR stop / 1 ATR target; cost test changed from a zero-cost path comparison to a slippage-only accounting test on identical paths. Acceptance thresholds (+1.00 / 0.50 / 0.10) unchanged. No architecture definition, milestone family, cost, split or decision rule was touched. | The first run (15:17Z) aborted at the controls with leak +0.81 USD (threshold +1.00) and cost-test diff 0.314 (expected 0.34): a 3-USD capped win against a 1-ATR stop makes the leak/null expectations asymmetric, and changing the spread changes stop timing so two runs are not the same paths. **Disclosure:** the code correction was applied before any architecture outcome existed (the script aborts at the controls), but the first attempt to write this log entry failed on a scripting error and the corrected study then ran to completion at 15:19Z; this documentation entry was therefore written AFTER the outcomes were seen. The study is deterministic and was re-run unchanged after this entry so that the results file carries the final hash. |
| 15:29 | 557b60cf791df703dde20597a94256b434e28bbe13dbb2eb8b15e93eb658208e | see PREREGISTRATION.sha256 after this edit | Engine correction, no specification change: `simulateTrade` had an extra same-bar floor check on the milestone activation bar that is NOT in §4 (§4: the floor is evaluated at subsequent bars). Because the activation bar by definition spans from near entry to M1, that check banked almost every RUN trade at M1 − buffer on the activation bar, making H2/H3 degenerate. The check was removed so the code matches §4. | **Disclosure:** discovered after the first complete run (15:20Z) from the unit test "continuation can remain open" failing and from the degenerate RUN outcomes; this is a return to the frozen definition, not a new rule. The study was re-run unchanged afterwards. All 11 variants and every threshold are as pre-registered. |
| 15:36 | a148a023a9c64433082e7066e411aa71c0eedf30bc847cefd136748c2dcf3ad2 | see PREREGISTRATION.sha256 after this edit | Engine realism correction to §4 RUN/TRAIL mechanics: the ratchet `F = max(F, MFE − buffer)` (and the activation floor `M1 − buffer`) can place the protective stop ABOVE the current price whenever a bar closes more than the buffer below its high; a stop above market fills at market, not at the stop. The floor is now capped at the close-based P&L of the bar that sets it (`F = max(F, min(MFE − buffer, P&L_close))`), and when even that is ≤ 0.50 USD at activation the trade is banked at that bar's close (exit kind PROTECTED_BANK_AT_CLOSE). Same cap applied to TRAIL. Monotonicity is unchanged. | **Disclosure:** discovered after the second complete run (15:29Z) showed RUN variants with average wins of 5.5 USD against a 3 USD milestone and a 1 USD trail, which is only possible if stops were being honoured above market. This correction can only LOWER the RUN results; nothing else changed. Third and final run follows. |
