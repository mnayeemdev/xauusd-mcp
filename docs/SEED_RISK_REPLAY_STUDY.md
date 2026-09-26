# SEED_RISK_REPLAY_STUDY — historical / replay evidence for the SEED risk policy

**Status:** READ-ONLY ANALYSIS (2026-09-26). No production code, configuration, runtime, lot lock, breaker or live state was changed. No trade was placed. Companion to `docs/CAPITAL_GROWTH_ARCHITECTURE_62_TO_6M.md` (Risk Policy V2).

Reproduce: `node validation/replay_audit_2026-09-25/seed_risk_study.mjs` (reads `xauusdm_bars_extended.json` and the live signal store; writes only `seed_risk_study_results.json` and `seed_risk_study_console.txt` in that folder; the per-signal appendix with all 424 signals is the `signals` array of the results file).

---

## 1. Data used and how trustworthy it is

| Class | Source | What it is | Count | Used for |
|---|---|---|---|---|
| A | `validation/mcp_engine_signals.json` (live store) | signals the REAL watcher actually generated under the current intraday_5m rules (25 Sep 2026), with the store's own SL-vs-TP2 resolution | 11 signals: 1 PASS (+1.8 R), 10 FAIL (−1 R) | cross-check of the replay; live expectancy reference |
| A′ | same store, `timeframe: 15m` | signals from the older reference_15m profile (22–24 Sep) | 15 (3 PASS, 4 FAIL, 8 unresolved) | EXCLUDED from the primary result (different engine) |
| A″ | REAL and DEMO executor logs | executed trades | 2 REAL losses (−50.00, −9.87), 1 DEMO win (+3.00) | context only |
| B | MT5 XAUUSDm confirmed bars replayed through the exact production functions (`computeBias`, `runPipeline` 30m, `computeHtfContext` 1H, `runIntradayPipeline`, `combineIntraday`, `computeProtectiveStops`, `evaluateTradeManagement`) | reconstruction of every production-rule signal and its outcome under the CURRENT exit stack | 39 sessions, 9,000 confirmed 5m candles (2026-08-12 02:35 → 2026-09-25 19:05), 965 signal bars → 424 distinct signals → 413 completed outcomes (11 refused by the effective-RR-at-fill recheck) | PRIMARY evidence |
| C | counterfactual strategy variants | — | none used | not mixed in |

Fidelity of B against A (25 Sep): 8 of the 11 live signals are reproduced within one bar with the same side, 6 with the same model and near-identical geometry; 3 (07:51 MR, 08:11 MR, 08:31 BO) are not reproduced because the broker feed (XAUUSDm) differs from OANDA by a few tenths at exactly the trigger levels. The earlier one-day audit matched 62/62 bars on action and reason, so the replay is a faithful but not perfect stand-in for the live feed.

Known limitations of B (stated, not hidden): broker feed instead of OANDA; News and Shock guards not replayable historically (no calendar/tick archive), so a few signals the live guards would have blocked are included; ENTRY_DRIFT and spread guards assumed to pass; adaptive management evaluated on confirmed closes exactly as the executor does, but the 3-second monetary monitor is approximated by intrabar broker SL/TP; same-thesis consecutive signals folded into one like the live store; one position at a time like the executor.

**DATA_SESSIONS = 39 (36 with at least one signal). CONFIRMED_5M_CANDLES = 9,000. VALID_CURRENT_STRATEGY_SIGNALS = 424 (B) of which 11 are also class A. TRUSTWORTHY_COMPLETED_OUTCOMES = 413. Mean 10.9 signals per session, mean quality 78.5, mean engine RR 2.35.**

---

## 2. Strategy expectancy at 0.01 lot (production exit stack), before any capital policy

| Metric | Value |
|---|---|
| Completed trades | 413 |
| Win rate | 49.6 % |
| Average R (realized P&L / structural risk) | +0.03 |
| Bootstrap 95 % CI for average R (5,000 resamples) | −0.13 to +0.20; P(mean R ≤ 0) = 36 % |
| Profit factor | 1.06 (95 % CI 0.82 to 1.36) |
| Net at 0.01 lot | +100.53 USD over 39 sessions (+0.24 USD per trade, before swap) |
| Median structural risk at 0.01 (stop + 0.60 cost) | 7.29 USD (interquartile 4.44 to 10.87) |
| Losses larger than 1.2 R | 105 of 208 (the broker fail-safe at 1.5 × structural + spread makes a stop-out cost up to −1.66 R) |
| Exit mix | PROFIT_PROTECT 174, THESIS_STOP_CLOSE 78, BROKER_SL 72, OPPOSITE_STRUCTURE_BREAK 40, BROKER_TP +30 34, DETERIORATION 15 |
| Same signals with V2 structural exits (SL = structural stop, TP = TP2) | win rate 44.6 %, average R −0.02, PF 0.99, net −16.24 USD |

By model: BO n = 246 PF 1.14; MR n = 19 PF 1.99; MC n = 50 PF 0.94; PB n = 73 PF 0.97; SR n = 25 PF 0.48. By period: 12–31 Aug PF 1.00 (n 167); 1–13 Sep PF 1.57 (n 121); 14–25 Sep PF 0.74 (n 125). By structural risk bucket at 0.01: ≤ 3.10 USD PF 1.20 (n 46, win rate 37 %); 3.10–4.66 PF 0.42 (n 65, avg R −0.47); 4.66–6.21 PF 1.35 (n 53); 6.21–10 PF 1.25 (n 128); 10–20 PF 1.19 (n 108); > 20 PF 0.40 (n 13).

**This is the central fact of the study: over 413 completed outcomes the current strategy shows no statistically demonstrable edge.** The point estimate is marginally positive, the confidence interval straddles zero, and the most recent two weeks are net negative. Any SEED risk percentage is being chosen on top of an expectancy that is not yet proven.

---

## 3. Policy simulation design (defined before running)

- Start equity 62.07 USD; 0.01 lot only (broker minimum); leverage 1:200; margin for 0.01 = entry / 200 (≈ 21.5–22.1 USD across the window); cost allowance 0.60 USD per trade.
- Affordability: `risk_at_0_01 = stop distance + 0.60 ≤ permitted_risk = equity × pct × multipliers`, computed from current simulated equity at every signal.
- Margin test (V2 tier 0): margin ≤ 40 % of equity, free margin after entry ≥ 55 % of equity, margin level at the structural stop ≥ 200 %. Sensitivity run at a 50 % margin cap.
- Governor (V2 tiers 0–2): drawdown from HWM ≥ 8 % → risk × 0.5; ≥ 12 % → × 0.25; ≥ 20 % → CAPITAL_PRESERVATION (no further trades; the V2 rule requires a user acknowledgement to exit, so the path stops).
- Loss-state multiplier (V2): after a loss risk × 0.5 until a win; after a 2-loss day × 0.5 until two consecutive wins. Runs are reported WITH these multipliers and WITHOUT (base percentage only) to separate the percentage from the multiplier design.
- VIEW1 = production 2-consecutive-loss daily breaker; VIEW2 = breaker ignored (observation only).
- Single position; a signal arriving while a simulated position is open is not an opportunity for the account and is excluded from the participation denominator.
- RUIN = equity ≤ 31.04 USD (50 % of start). NEAR-RUIN = peak-to-trough drawdown ≥ 30 %, or 0.01 lot unaffordable by the margin cap at the end of the path ("margin-locked").

---

## 4. Results — VIEW1 (production breaker), production exits

### 4a. With the V2 loss-state and drawdown multipliers as designed

| Policy | Taken | Refused (risk) | Refused (margin) | Breaker | Wins / losses | Net | End equity | Max DD | Participation |
|---|---|---|---|---|---|---|---|---|---|
| 3 % | 1 | 412 | 0 | 0 | 1 / 0 | +0.26 | 62.33 | 0 % | 0.2 % |
| 5 % | 2 | 411 | 0 | 0 | 1 / 1 | +0.29 | 62.36 | 5.7 % | 0.5 % |
| 6 % | 5 | 408 | 0 | 0 | 3 / 2 | −2.20 | 59.87 | 9.5 % | 1.2 % |
| 7.5 % | 1 | 412 | 0 | 0 | 0 / 1 | −5.14 | 56.93 | 8.3 % | 0.2 % |
| 10 % | 1 | 412 | 0 | 0 | 0 / 1 | −5.14 | 56.93 | 8.3 % | 0.2 % |

Finding (design defect in V2, not a market result): the "risk × 0.5 after a loss until a win" rule deadlocks a seed account. After the first loss, permitted risk halves to about 1.5–3 USD, nothing is affordable, no trade can occur, so no win can ever reset the multiplier. The V2 loss-state multiplier must reset on the UTC day roll (as the production breaker does) or decay with presented signals; otherwise the policy is a one-loss shutdown. This is flagged for the V2 revision; it is not a recommendation about the percentage.

### 4b. Base percentage only (no multipliers), governor and margin rules still applied

| RISK_POLICY | AFFORDABLE_TRADES | OPPORTUNITY_PARTICIPATION_% | ENDING_EQUITY | MAX_DRAWDOWN_% | PROFIT_FACTOR | EXPECTANCY_R | MINIMUM_EQUITY | CAPITAL_MINIMUM_LOT_FAILURE | NOTES |
|---|---|---|---|---|---|---|---|---|---|
| 3 % | 1 | 0.2 % | 62.33 | 0.0 | n/a (1 win) | +0.25 | 62.07 | NO | permitted 1.86 USD fits one stop in 39 sessions: equivalent to not trading |
| 5 % | 31 | 7.6 % | 110.28 (peak 138.64) | 20.5 | 1.98 | +0.70 | 62.07 | NO | 18 W / 13 L, longest loss run 6; breaker blocked 21 presentations; reached 138.64 on 3 monetary +30 exits, then a 20.5 % drawdown hit CAPITAL_PRESERVATION and the path stopped with 245 later signals unexamined |
| 6 % | 17 | 4.1 % | 52.46 | 21.8 | 0.67 | −0.07 | 52.46 | YES (margin-locked at end) | 8 margin refusals; different early trades than 5 %, net −9.61 |
| 7.5 % | 9 | 2.2 % | 53.18 | 16.9 | 0.55 | −0.12 | 53.18 | YES | 81 margin refusals once equity fell below 53.7; net −8.89 |
| 10 % | 9 | 2.2 % | 53.01 | 19.9 | 0.58 | −0.10 | 53.01 | YES | 122 margin refusals, breaker 10; net −9.06 |

Margin-cap sensitivity (50 % instead of 40 %): 5 % and 6 % converge (36 trades, PF 1.70, end 110.67, DD 20.4 % at 6 %); 7.5 % and 10 % end at 48.49 / 47.42 with PF 0.45 / 0.47 and drawdowns of 24–28 %. Loosening the margin cap does not rescue the higher percentages; it lets them lose more.

Reading 4b honestly: the 5 % path's +48 USD comes from 31 trades whose composition (three +30 USD monetary take-profits) is path luck, not a property of 5 %; the 6 % path, one step away, lost money on 17 different trades. With 9–36 trades per path these numbers cannot rank the percentages. What they do show robustly: every path that took more than a handful of trades reached a 17–22 % drawdown, and every percentage above 5 % ended margin-locked or in preservation.

---

## 5. Results — VIEW2 (breaker ignored, observation only)

| Policy | Taken | Net | End equity | Max DD | PF | Notes |
|---|---|---|---|---|---|---|
| 5 % | 34 | +43.29 | 105.36 | 21.0 % | 1.79 | 3 extra trades vs VIEW1 (21 presentations the breaker had blocked, 3 affordable): net lower, drawdown higher |
| 6 % | 17 | −9.61 | 52.46 | 21.8 % | 0.67 | identical to VIEW1 (breaker never bound) |
| 7.5 % | 9 | −8.89 | 53.18 | 16.9 % | 0.55 | identical |
| 10 % | 11 | −14.40 | 47.67 | 28.0 % | 0.48 | 2 extra trades, both losses |

**CURRENT_PRODUCTION_BREAKER_EFFECT:** across 424 presented signals the breaker blocked 21 (5 %) to 10 (10 %) presentations. In every policy where removing it changed anything, the result was worse (5 %: −4.9 USD net, +0.5 pt drawdown; 10 %: −5.3 USD, +8 pt drawdown). No affordable, valid opportunity was lost to the breaker that would have improved survival. The breaker is not a participation problem at SEED.

**STRATEGY_OPPORTUNITY_VIEW_RESULT:** valid opportunities after two same-day losses existed (21 presentations at 5 %) but their affordable subset was net negative in this sample. This is an observation, not a recommendation to remove or change the breaker.

---

## 6. Theoretical survival table (separate from historical performance)

Equity after n equal-percentage losses from 62.07 USD, and gain needed to recover the prior high:

| Policy | 1 loss | 2 | 3 | 5 | 7 | 10 | recover after 5 | recover after 10 |
|---|---|---|---|---|---|---|---|---|
| 3 % | 60.21 | 58.40 | 56.65 | 53.30 | 50.15 | 45.77 | +16.5 % | +35.6 % |
| 5 % | 58.97 | 56.02 | 53.22 | 48.03 | 43.35 | 37.16 | +29.2 % | +67.0 % |
| 6 % | 58.35 | 54.85 | 51.55 | 45.55 | 40.25 | 33.43 | +36.3 % | +85.7 % |
| 7.5 % | 57.41 | 53.11 | 49.13 | 42.03 | 35.97 | 28.44 | +47.7 % | +118.3 % |
| 10 % | 55.86 | 50.28 | 45.25 | 36.65 | 29.69 | 21.64 | +69.4 % | +186.8 % |

Margin facts overlay: 0.01 lot fails the 40 % margin cap below 53.7 USD (at gold ≈ 4,300), i.e. after a 13.5 % drawdown from 62.07; at 7.5 % that is three consecutive losses, at 10 % two. The 60 % margin-call level is reached after a 49 USD loss.

---

## 7. Monte Carlo (justified: 413 completed outcomes; seeded bootstrap, 5,000 paths × 400 presented signals ≈ one 6.5-week sample per path; identical sequences across policies; VIEW2 semantics; production exits; governor and 40 % margin cap applied)

Base percentage only:

| Policy | Median end | 5th pct | 95th pct | P(DD ≥ 20 %) | P(DD ≥ 30 %) | P(margin-locked at end) | P(preservation lock) | Median trades taken | P(end < start) |
|---|---|---|---|---|---|---|---|---|---|
| 3 % | 62.33 | 62.07 | 62.85 | 0 % | 0 % | 0 % | 0 % | 1 | 0 % |
| 5 % | 52.94 | 50.62 | 91.03 | 45.8 % | 0 % | 68.3 % | 45.8 % | 8 | 74.0 % |
| 6 % | 52.63 | 50.52 | 87.42 | 44.2 % | 0 % | 71.3 % | 44.2 % | 7 | 78.7 % |
| 7.5 % | 52.24 | 49.92 | 83.04 | 41.5 % | 0 % | 79.6 % | 41.5 % | 5 | 85.6 % |
| 10 % | 52.38 | 48.31 | 103.03 | 56.4 % | 0.1 % | 71.6 % | 56.4 % | 5 | 80.4 % |

With V2 multipliers (deadlock included): median end 56.9–59.2, median trades taken 1–3, P(end < start) 77–81 %.

P(DD ≥ 30 %) is near zero only because the 20 % preservation lock stops every path first; "margin-locked at end" is the real terminal state for 68–80 % of paths at 5–10 %. The RUIN criterion (≤ 31.04 USD) was never reached in any historical or Monte Carlo path because the governor and the margin cap stop trading long before it.

---

## 8. Class A detail (the 11 live signals of 25 Sep, current rules)

| UTC | Model | Side | Quality | Entry | Structural stop | Stop dist | Risk at 0.01 (+0.60) | Engine RR | Store result | Breaker | Affordable at 3 / 5 / 6 / 7.5 / 10 % of 62.07 | Margin | Free margin after | Capital decision at 5 % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 06:56 | BO | BUY | 78 | 4276.23 | 4273.21 | 3.02 | 3.62 | 1.80 | FAIL −1 R | allowed (0/2) | N / N / Y / Y / Y | 21.38 | 40.69 (65.6 %) | NO TRADE, risk 3.62 > 3.10 |
| 07:41 | SR | SELL | 68 | 4276.34 | 4281.27 | 4.93 | 5.53 | 1.75 | FAIL −1 R (REAL: −50 at 0.02) | allowed | N / N / N / N / Y | 21.38 | 65.6 % | NO TRADE |
| 07:46 | MR | SELL | 78 | 4276.80 | 4279.23 | 2.43 | 3.03 | 2.64 | FAIL −1 R | position open | N / Y / Y / Y / Y | 21.38 | 65.6 % | affordable at 5 % (would have been taken; lost) |
| 07:51 | MR | SELL | 77 | 4279.00 | 4281.17 | 2.17 | 2.77 | 3.00 | FAIL −1 R | position open | N / Y / Y / Y / Y | 21.40 | 65.5 % | affordable (folded into 07:46 thesis) |
| 08:11 | MR | SELL | 75 | 4278.33 | 4282.72 | 4.39 | 4.99 | 1.81 | FAIL −1 R | position open | N / N / N / N / Y | 21.39 | 65.5 % | NO TRADE |
| 08:21 | BO | BUY | 84 | 4281.22 | 4279.07 | 2.15 | 2.75 | 3.00 | FAIL −1 R | position open | N / Y / Y / Y / Y | 21.41 | 65.5 % | affordable (lost) |
| 08:31 | BO | BUY | 73 | 4284.29 | 4277.83 | 6.46 | 7.06 | 1.80 | PASS +1.8 R | position open | N / N / N / N / N | 21.42 | 65.5 % | NO TRADE |
| 10:11 | MC | BUY | 79 | 4301.66 | 4289.90 | 11.76 | 12.36 | 2.00 | FAIL −1 R | DAILY_LOSS_LIMIT | N / N / N / N / N | 21.51 | 65.3 % | NO TRADE |
| 11:01 | MC | BUY | 82 | 4310.94 | 4302.82 | 8.12 | 8.72 | 2.00 | FAIL −1 R (REAL: −9.87) | allowed (1/2) | N / N / N / N / N | 21.55 | 65.3 % | NO TRADE |
| 12:32 | PB | BUY | 73 | 4306.64 | 4296.44 | 10.20 | 10.80 | 2.00 | FAIL −1 R | BLOCKED (2/2) | N / N / N / N / N | 21.53 | 65.3 % | NO TRADE |
| 18:56 | BO | BUY | 76 | 4294.69 | 4292.42 | 2.27 | 2.87 | 2.51 | FAIL −1 R | BLOCKED (2/2) | N / Y / Y / Y / Y | 21.47 | 65.4 % | affordable at 5 % but breaker-blocked; lost |

On the one live day, 4 of 11 signals were affordable at 5 % and all 4 lost; the only winner (08:31, +1.8 R) needed 7.06 USD of risk, affordable at no policy up to 10 %.

---

## 9. Answers to the critical question

Is 5 % so restrictive that it prevents participation in almost all valid setups? **Yes.** At 62.07 USD, 5 % affords 46 of 413 signals at start equity (11 %); in the sequential simulation 7.6 % of opportunities were taken. 3 % affords 1 of 413.

Does 7.5 % (or 10 %) provide materially better participation without unacceptable survival characteristics? **No.** 7.5 % affords 111 of 413 at start equity (27 %) and 10 % affords 164 (40 %), but the extra participation comes mostly from the 3.10–4.66 USD risk bucket, which was the worst bucket in the sample (n 65, PF 0.42, average R −0.47), and from repeated exposure to −1.5 R broker stop-outs on a 62 USD base. Historically both ended margin-locked at 53 USD with PF 0.5–0.6; in Monte Carlo they end below start in 80–86 % of paths and margin-locked in 72–80 %.

Data-derived candidate: **none can be supported.** The bucket-level differences (PF 1.20 at ≤ 3.10, 0.42 at 3.10–4.66, 1.35 at 4.66–6.21) have no mechanism behind them and flip sign between adjacent buckets; selecting a percentage from them would be curve-fitting to noise. The strategy-level confidence interval (average R −0.13 to +0.20) says the underlying edge is not established, and no risk percentage can convert an unproven edge into compounding.

**BEST_SUPPORTED_SEED_RANGE_FROM_AVAILABLE_DATA = 3 % to 5 % as the only range that did not end margin-locked or in preservation in the historical paths, with the explicit understanding that 3 % is equivalent to not trading and 5 % takes about 8 % of opportunities and still hit a 20 % drawdown. No single percentage is justified.**

**MOST_CONSERVATIVE_USABLE_POLICY = 5 % base percentage** (3 % afforded one trade in 39 sessions). "Usable" here means "produces any trades"; it does not mean "expected to compound".

**MOST_AGGRESSIVE_SURVIVABLE_POLICY = 5 %.** 6 %, 7.5 % and 10 % all ended margin-locked (equity 47–53 USD, 0.01 lot no longer affordable) in the historical replay and in 71–80 % of Monte Carlo paths. Nothing above 5 % met the survival criteria.

**NO FINAL SEED RISK PERCENTAGE JUSTIFIED YET.** The evidence supports two firmer conclusions instead: (1) the SEED account cannot participate meaningfully at any percentage that also survives, because typical structural risk (median 7.29 USD at 0.01) is 12 % of the account; (2) the strategy's expectancy at 0.01 is not yet demonstrated (PF 1.06, CI 0.82–1.36), so the question "survive long enough for the edge to compound" currently has no edge to wait for.

---

## 10. RECOMMENDED_NEXT_RESEARCH_STEP

1. Establish expectancy before sizing: run the same replay on OANDA bar captures (extend the existing `tests/fixtures/xauusd_intraday_session_*.json` mechanism to save 499-bar snapshots each session) for at least 60 sessions, and separately track live class-A outcomes, until the 95 % CI of average R excludes zero in either direction. Until then the SEED question is moot.
2. Fix the V2 design defect found here before any implementation: the loss-state multiplier must reset at the UTC day roll or decay with presented signals; as written it is a one-loss shutdown at SEED. Also decide the SEED margin cap deliberately (40 % locks the account after a 13.5 % drawdown; 50 % after 31 %).
3. Investigate the two structural features that dominate losses at 0.01 rather than the percentage: the 1.5 × broker fail-safe (105 of 208 losses exceeded 1.2 R) and the > 20 USD-stop BO signals (n 13, PF 0.40, never affordable at SEED but a strategy-level drag). Any change there is a strategy decision outside this study.
4. If the user wants the account to trade at all before expectancy is established, the only options the data leaves are external funding to a level where median structural risk is 3–5 % of equity (150–250 USD) or an explicitly time-boxed, user-approved 5 % SEED trial with the understanding that it is an experiment, not a compounding plan.

---

PRODUCTION_CODE_CHANGED = NO
CONFIG_CHANGED = NO
USER_FIXED_0_01_CHANGED = NO
AUTO_SCALING_ENABLED = NO
BREAKER_CHANGED = NO
LIVE_ENGINE_RESTARTED = NO
TRADE_PLACED = NO
