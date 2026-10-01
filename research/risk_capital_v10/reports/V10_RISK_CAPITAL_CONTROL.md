# V10_RISK_CAPITAL_CONTROL

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Question
Can a simple governed risk layer (equity → risk % → maximum cash risk → structural SL distance → position size → broker validation → margin safety → eligibility) protect capital on the frozen V8 corrected-core entries, with the structural SL and RR 1.70 unchanged, better than the CURRENT fixed-lot / fixed-dollar model?

## Verdict
**RISK_MODEL = INCONCLUSIVE; PROPOSED_RISK_SPEC = NO.** The sizing mechanics work. Every test passes: sizing, rounding down, actual risk ≤ approved, margin, daily, pause, exposure, gap fail-safe, restart, duplicates, broker rejection, missing SL. Replay is deterministic, and the percentage model never exceeded its approved risk on any trade in any scenario. But **no risk percentage met the pre-registered capital-safety criteria on DEV**, so nothing was frozen for the holdout, and under the pre-registration no risk percentage is proposed. *Do not invent a final risk percentage.*

## Findings
1. **Negative entry expectancy is the root cause.** At 0.50 % risk / 10,000 USD the trades taken average -0.070 R (DEV) and -0.020 R (HOLD) at NORMAL cost; every percentage-risk walk with more than 4 trades loses money on both splits at every cost. Risk sizing controls how fast capital is lost; it cannot create an edge.
2. **CURRENT's positive HOLD result is a weighting effect, not an edge.** The fixed 0.01 lot ends HOLD at +206.95 USD at NORMAL cost (the same dollar amount at every account from 500 to 10,000 USD), while its trades average -0.022 R. A fixed lot weights each trade by its SL width in dollars, and the widest-SL quartile is the only one with positive R on both splits (DEV 0.031 R, HOLD 0.052 R). The tightest quartile loses -0.217 / -0.154 R, mostly because fixed costs are a large fraction of a small R. Percentage risk weights every trade equally in R. Under MODERATE cost CURRENT also loses on HOLD (-256.02 USD) and on DEV at every cost. An SL-width or cost/R filter would be an ENTRY change and is out of scope; it is reported, not proposed.
3. **The broker minimum lot (0.01) sets a minimum account size for governed risk.** One 0.01 lot at the median HOLD structural SL already risks 11.35 USD, so 0.25 % risk needs ≥ 4540.00 USD for the median trade and 10918.00 USD for the 90th-percentile trade. Below that the trade must be REJECTED, never rounded up.
4. **CURRENT (fixed 0.01 lot, fixed −50 USD assumption) is not a constant risk.** On HOLD its per-trade risk is 0.11 % of equity (median) at 10,000 USD but 1.1 % at 1,000 USD and 4.5 % at 250 USD (90th percentile 10.9 %). The HOLD drawdown is 51.4 % at 1,000 USD and 88.4 % at 250 USD; under MODERATE cost the 250 USD account ends at -49.75 USD (negative equity): the final trade (2026-02-02, structural SL 111.85 USD) lost 122.07 USD at 1 oz from 72.32 USD of equity. That replay uses the common structural exit; production's −50 USD monetary broker SL would have bound on that trade, limiting the loss to about 50 USD and leaving about 21.92 USD.
5. **No risk percentage passes the pre-registered capital-safety gate on DEV.** 0.10 % fails only sizeability (0.0 % / 19.8 % / 56.1 % of trades sizeable at 1k / 5k / 10k). 0.25 % fails the Monte Carlo gate at every account (P(DD ≥ 20 % in a year) = 50.6 % on DEV, 15.6 % on HOLD), plus sizeability at 1,000 / 5,000 USD and the drawdown gates at 5,000 / 10,000 USD. 0.50 % and above fail the historical drawdown gate at every account.
6. **Margin is never the binding constraint.** At 1.00 % risk the largest margin use is 11.4 % of equity; the 25 % and 50 % caps never reject a trade and the 10 % cap rejects at most 0.20 %. Risk, not margin, limits size.
7. **Daily-loss, loss-streak and weekly controls are not consistently protective.** Described at every risk % (no risk % was supported, so stage 2 never selected): the same control reduces drawdown on one split and increases it on the other (for example daily 1 % at 0.25 % / 10,000 USD: 4.7 % on DEV, -35.9 % on HOLD). None is supported.
8. **Realized loss can exceed the planned worst case.** At NORMAL cost 0.8 % of HOLD losing outcomes exceed the planned hard-stop loss (max ×1.13); the whole excess is the overnight BUY swap (0.56 USD/oz/night) that the worst-case formula omits. Under SEVERE cost (slippage 0.60 vs the 0.10 allowance, plus gaps) 49.6 % exceed it, up to ×1.42.
9. **Production fixed-dollar budgets bind on real trades.** The production −50 USD monetary broker SL (0.01 lot) is tighter than the structural fail-safe on 1.9 % of HOLD signals and lies INSIDE the structural SL itself on 0.8 % (the stop is moved to satisfy a dollar amount). The +30 USD profit budget closes below 1.70 R on 10.5 % of HOLD signals. These are exactly the universal fixed-dollar assumptions the owner principle forbids; they are reported, not changed.

## CURRENT versus percentage risk (identical signals, structural SL and exits; NORMAL cost)
| Account | Split | CURRENT end / max DD | PCT 0.10 % | PCT 0.25 % | PCT 0.50 % | PCT 1.00 % |
|---|---|---|---|---|---|---|
| 100 | DEV | 55.16 / 47.9 % | no sizeable trade | no sizeable trade | no sizeable trade | no sizeable trade |
| 100 | HOLD | 69.48 / 49.3 % | no sizeable trade | no sizeable trade | no sizeable trade | no sizeable trade |
| 250 | DEV | 69.68 / 81.4 % | no sizeable trade | no sizeable trade | no sizeable trade | 229.52 / 13.1 % (106 tr) |
| 250 | HOLD | 68.08 / 88.4 % | no sizeable trade | no sizeable trade | no sizeable trade | 247.44 / 2.0 % (8 tr) |
| 500 | DEV | 433.26 / 52.1 % | no sizeable trade | no sizeable trade | 461.58 / 9.3 % (118 tr) | 338.97 / 37.9 % (480 tr) |
| 500 | HOLD | 706.95 / 82.1 % | no sizeable trade | no sizeable trade | 497.44 / 1.0 % (8 tr) | 415.68 / 29.1 % (497 tr) |
| 1000 | DEV | 933.26 / 28.9 % | no sizeable trade | 960.38 / 4.7 % (128 tr) | 772.31 / 24.6 % (586 tr) | 524.94 / 52.0 % (958 tr) |
| 1000 | HOLD | 1206.95 / 51.4 % | no sizeable trade | 997.44 / 0.5 % (8 tr) | 899.32 / 18.0 % (511 tr) | 718.20 / 31.6 % (1161 tr) |
| 5000 | DEV | 4933.26 / 6.3 % | 4748.28 / 5.6 % (689 tr) | 4114.99 / 19.1 % (1155 tr) | 3921.06 / 26.7 % (1150 tr) | 2792.12 / 52.0 % (1149 tr) |
| 5000 | HOLD | 5206.95 / 12.9 % | 4907.71 / 3.4 % (503 tr) | 4286.82 / 15.2 % (1372 tr) | 4296.81 / 16.6 % (1589 tr) | 3780.66 / 33.2 % (1541 tr) |
| 10000 | DEV | 9933.26 / 3.2 % | 9419.97 / 6.9 % (1120 tr) | 8747.61 / 15.3 % (1154 tr) | 7833.42 / 28.4 % (1141 tr) | 5624.27 / 53.0 % (1132 tr) |
| 10000 | HOLD | 10206.94 / 6.7 % | 9730.44 / 3.5 % (1234 tr) | 9289.30 / 8.3 % (1590 tr) | 8881.08 / 17.6 % (1541 tr) | 7927.07 / 32.1 % (1522 tr) |

Cells give end equity / max drawdown in USD (trades). "No sizeable trade" means the broker minimum lot exceeds the approved risk on every signal, so the account does not trade.

## What is validated, what is not
- **Validated (mechanics):**
  - sizing from the structural SL;
  - rounding down and minimum-lot rejection;
  - actual-risk recalculation;
  - margin checks;
  - the daily, streak and weekly controller;
  - single exposure;
  - restart from serialized state equal to an uninterrupted run;
  - duplicate and broker-rejection handling;
  - SL fail-safes;
  - the broker spec read from the platform log.
  - Evidence: tests/risk_capital_v10.test.js and V10_REPLAY_RESULTS.
- **Not validated:**
  - a capital-safe risk percentage for this entry stream;
  - any daily, streak or weekly limit.

## Operational observation (outside the research, no action taken)
The most recent production bridge record (2026-10-01T13:21:39.069Z) shows the MT5 terminal connected to a non-real (trial) server with algo trading disabled; the REAL watcher logged REAL_NOT_VERIFIED and is failing closed. The broker contract fields are identical to the 9 REAL-verified records (2026-09-25 to 2026-09-30). The REAL watcher, the silver/DOM observer and the V8 forward shadow were not touched.

## Protocol
- Pre-registered (sha 4a677f6e421ed033…).
- DEV 2025-05-07 → 2025-12-31: 4858 signals over 186 sessions.
- Three stages on DEV only. The selection is frozen (sha c7dbe6eeb5ed0cd2…), as is the risk library (sha 2fc1806a1e14748e…).
- HOLDOUT 2026-01-01 → 2026-09-29: 6553 signals over 209 sessions, replayed once.
- Costs: NORMAL, MODERATE and SEVERE (with a deterministic gap).
- Monte Carlo proxy: 2,000 paths.
- Descriptive tables (controls and margin caps at every candidate risk) are labelled DESCRIPTIVE_ONLY_NOT_SELECTION.

## Report index
V10_RISK_PERCENTAGE_RESEARCH · V10_POSITION_SIZING · V10_STRUCTURAL_SL_RISK · V10_MARGIN_PROTECTION · V10_DAILY_LOSS_CONTROL · V10_CONSECUTIVE_LOSS_RESEARCH · V10_TOTAL_EXPOSURE · V10_BROKER_CONSTRAINTS · V10_SLIPPAGE_STRESS · V10_CAPITAL_SURVIVAL · V10_RECOVERY_MATH · V10_RISK_OF_RUIN · V10_ACCOUNT_SIZE_COMPARISON · V10_DEVELOPMENT_RESULTS · V10_HOLDOUT_RESULTS · V10_REPLAY_RESULTS · V10_REJECTED_PARAMETERS · V10_SUPPORTED_PARAMETERS · V10_PROPOSED_RISK_SPEC
