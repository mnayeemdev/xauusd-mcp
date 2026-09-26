# Offline Replay / Missed-Opportunity Audit — XAUUSD, 2026-09-25 12:30–18:15 UTC

**Status:** analysis only. No strategy, threshold, configuration, counter, state or live-runtime change was made. The live watcher (v7, PID 23064) and the TradingView/CDP session were not touched.

## 1. Method

| Item | Detail |
|---|---|
| Engine under test | The live `intraday_5m` profile exactly as it runs in the REAL watcher: `computeBias` (15m) → `runPipeline` (30m) → `computeHtfContext` (1H) → `runIntradayPipeline` (5m) → `combineIntraday`. All imported from `src/engine/**` as pure functions. |
| Data | MT5 Exness `XAUUSDm` history read-only via `copy_rates_from_pos` (5m 2000 bars, 15m 900, 30m 600, 1H 500, 4H 300, 1D 300), saved as `xauusdm_bars_snapshot.json`. The forming bar is stripped and the last 499 confirmed bars per timeframe are used, evaluated 80 s after each 5m close, exactly like the watcher. |
| Data caveat | The watcher trades on OANDA:XAUUSD; XAUUSDm prices differ by a few tenths. See the fidelity check below for how much this matters (almost not at all). |
| Fidelity check | Replay vs the watcher's own recorded decisions (`state/xauusd_wait_opportunity_log.jsonl`) for every bar in the window that the watcher evaluated. |
| Outcome simulation | Entry at the confirmed close (BUY fills at ask = close + 0.25, SELL at bid). Broker SL from `computeProtectiveStops` (min(50 USD, 1.5 × structural risk + spread)), broker TP = +30 USD, then the REAL adaptive management `evaluateTradeManagement` (thesis stop close, opposite structure break, profit-protect, deterioration) evaluated on every subsequent confirmed 5m close with freshly computed 5m structure and 15m bias. 0.01 lot = 1 USD per 1.00 price. |
| Reproduce | `node validation/replay_audit_2026-09-25/replay.mjs` (writes only `replay_results.json` in this folder). |

### Fidelity result

| Comparison | Match |
|---|---|
| Authoritative action (WAIT/BUY/SELL) | 62 / 62 bars |
| Authoritative wait reason | 62 / 62 |
| Reference 5m regime (observability field) | 61 / 62 (14:00: replay BEAR_TREND vs recorded HIGH_VOLATILITY; broker-feed difference on one bar) |
| Reference 15m regime | 62 / 62 |

The replay reproduces the live engine. Conclusions below are about the live rules, not an approximation of them.

### Bars the live watcher never evaluated in this window

13:25, 13:30, 13:35, 13:40, 13:45 (TradingView CANDLE_READ_FAILED stall under memory pressure), 14:05 (watcher crash 14:11), 14:35, 14:40 (controlled reboot gap). The replay fills these in: 13:25–14:05 would all have been WAIT / NO_ELIGIBLE_STRATEGY. **14:35 and 14:40 would have been SELL signals under the live rules** (BO, RR 2.1 / 2.58, quality 79 / 84). They fell exactly in the reboot gap; had the watcher been up, the 2/2 consecutive-loss breaker would have refused them; simulated, they lose (see §4).

## 2. Important clarification: what "CORRECTION_ACTIVE" in the logs means

The `candidates.5m.blocked_by: CORRECTION_ACTIVE` values recorded all afternoon come from the **reference** single-timeframe pipeline (`src/engine/pipeline.js`), which the watcher runs only as an observability layer. The **live authority** (`src/engine/intraday/pipeline5m.js`) has no CORRECTION_ACTIVE veto and no TRANSITION veto. In the live engine the 5m correction state is only an input to the PB model. So the question "did the correction gate over-filter?" has to be answered on the PB resolution rule (2 EMA20 closes), which is what variants A1/A2 test.

What actually blocked entries, bar by bar, in the live engine:

| Period (UTC) | 15m bias | Eligible 5m models | 5m regime | Why nothing fired |
|---|---|---|---|---|
| 12:30–13:50 | BULLISH (15m BULL_TREND) | MC/PB/BO/SR, **BUY only** | BULL_TREND → COMPRESSION → RANGE → TRANSITION → BEAR_TREND (13:25) | Every SELL model was disallowed by the bullish 15m bias while price fell 4302 → 4276. The only BUY candidates (SR at 12:35/12:40) were rejected by RR. |
| 13:55–15:20 | NEUTRAL (15m TRANSITION) | BO, SR only | BEAR_TREND / HIGH_VOLATILITY | MC/PB not eligible under a neutral bias. BO fired at 14:35/14:40 (reboot gap). SR never met the rejection-candle test. |
| 15:25–16:05 | BEARISH (15m BEAR_TREND) | MC/PB/BO/SR, SELL only | BEAR_TREND → TRANSITION | PB SELL triggered at 15:40 (RR 1.51) and 15:45 (RR 1.11); both below 1.7. MC needed expanding ATR plus a break of the prior 5m swing low (4254.23), never happened. |
| 16:10–16:20 | NEUTRAL (TRANSITION) | BO, SR | TRANSITION | No breakout to retest, no rejection candle. |
| 16:25–16:50 | BULLISH (15m BULL_TREND) | MC/PB/BO/SR, BUY only | TRANSITION / RANGE | 5m structure stayed BEARISH (lower high 4309.53 never broken), so no bullish BOS for BO and no PB resolution above EMA20 with expanding ATR. |
| 16:55–18:15 | NEUTRAL (15m RANGE) | BO, SR, MR | RANGE → COMPRESSION | No fresh 5m sweep for MR; no rejection candle for SR; no breakout for BO. Compression correctly produced nothing. |

## 3. Objective market moves in the window (zigzag, 6.56 USD ≈ 1 × 5m ATR reversal)

| Move | Start → End | Size | Was an entry available BEFORE the move under live rules? |
|---|---|---|---|
| **A. Bearish leg** 4309.5 (12:25 LH, retested 4308.7 at 12:45) → 4254.2 (14:05 low) | 12:45 → 14:05 | 54.5 USD | **No.** 15m bias was BULLISH until 13:50, so SELL was disallowed for the entire leg. 5m structure had been BEARISH since the 12:50 BOS below 4299.59. Only the 5m-structure-as-bias counterfactual (B2) sells at 12:50 (see §4). |
| **B. Rebound** 4254.2 (14:05) → 4299.3 (16:05) | 14:05 → 16:05 | 45.0 USD | **No, under any variant.** 5m structure never flipped bullish (the 4309.53 lower high held), so BO/MC/PB BUY had no trigger; MR was ineligible (15m not RANGE); SR BUY at the 14:05 sweep bar failed the ≥50 % wick rule (lower wick 30 % of range). The rebound was a counter-structure correction the engine is designed not to buy. |
| **C. Consolidation / compression** 4270–4300 | 16:05 → 18:15 | legs of 7–16 USD | Correctly no trade in every variant (only OVEREXTENDED / RR rejects under B2 at 17:30–17:40). |
| **D. 15:40 / 15:45 PB SELL** | — | — | Live geometry: entry 4275.09 / SL 4287.52 / TP2 4256.29 (RR 1.51) and 4271.70 / 4287.48 / 4254.23 (RR 1.11). The "RR 0.44" figure the user cites is the reference pipeline's observability geometry (structural stop at the 4309.5 swing high). Both live candidates are simulated in §4: both lose. |

## 4. Counterfactual candidates (analysis only)

Variants tested (compositions of existing rules or parameter variants, no new rules):

| Key | Change |
|---|---|
| A1 | PB correction resolves after 1 EMA20 close instead of 2 |
| A2 | PB correction resolved by a fresh confirmed 5m BOS/CHoCH in the bias direction |
| B1 | 15m NEUTRAL → use the 5m trend regime as bias (MC/PB become eligible) |
| B2 | 5m structure direction used as bias every bar (all models) |
| C1 | TP2 = default 2R (objective-aware target selection disabled) |
| C2 | skip structural objectives closer than 1.7R instead of 1.0R |
| C3 | reference `risk.js` stop/target (structural swing stop, range objective) |

Distinct candidates (same thesis on consecutive bars listed once per bar where the geometry differs):

| # | TIME | DIRECTION | MODEL | ORIGINAL_DECISION | ORIGINAL_BLOCK_REASON | ORIGINAL_RR | COUNTERFACTUAL_CHANGE | WOULD_HAVE_ENTERED | MFE | MAE | 1R | 1.7R | 2R | OUTCOME_WITH_EXISTING_ADAPTIVE_EXIT_LOGIC | HINDSIGHT_DEPENDENT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 12:35 | BUY | SR | WAIT | RR_NOT_ACCEPTABLE (TP2 at 5m pivot 4309.63) | 1.52 | C1 (2R) / C2 (RR 2.79) / C3 (RR 3.0) | YES | 6.23 USD (1.28R) | 10.87 USD (2.24R) | YES 12:45 | NO | NO | Broker structural SL at 13:00, **-7.54 USD (-1.55R)**; under C3 thesis-stop close 12:55, -4.52 USD | NO |
| 2 | 12:40 | BUY | SR | WAIT | RR_NOT_ACCEPTABLE | 1.36 | C1 / C2 / C3 | YES (skipped sequentially: #1 open) | 6.86 USD (1.16R) | 10.24 USD (1.74R) | YES 12:45 | NO | NO | Broker structural SL at 13:00, **-9.09 USD (-1.54R)** | NO |
| 3 | 12:50 | SELL | BO | WAIT | NO_ELIGIBLE_STRATEGY (SELL disallowed by BULLISH 15m bias) | — | B2 only (5m structure as bias) → RR 2.36, quality 86 | YES | 41.32 USD (3.48R) | 1.33 USD (0.11R) | YES 13:20 | YES 13:25 | YES 13:30 | Broker TP at 14:00, **+30.00 USD (+2.53R)** | NO for the trigger; **YES for rule selection** (B2 chosen after seeing it work) |
| 4 | 14:00 | SELL | MC | WAIT | NO_ELIGIBLE_STRATEGY (MC not eligible under NEUTRAL bias) | — | B1 / B2 → RR 2.0, quality 67 | YES | 3.75 USD (0.14R) | 41.30 USD (1.53R) | NO | NO | NO | Thesis stop close 15:55, **-32.92 USD (-1.22R)** (sold the low) | NO |
| 5 | 14:35 | SELL | BO | **SELL under live rules** (bar never evaluated: reboot gap; breaker would deny) | — | 2.10 | none (live rules) | YES if watcher up and no breaker | 2.95 USD (0.85R) | 8.06 USD (2.31R) | NO | NO | NO | Broker structural SL at 14:45, **-5.48 USD (-1.57R)** | NO |
| 6 | 14:40 | SELL | BO | SELL under live rules (same thesis) | — | 2.58 | none | YES (skipped sequentially: #5 open) | 3.10 USD (0.91R) | 6.57 USD (1.92R) | NO | NO | NO | Broker structural SL at 14:45, **-5.38 USD (-1.57R)** | NO |
| 7 | 15:35 | SELL | PB | WAIT | NO_ELIGIBLE_STRATEGY (needs 2 confirm closes) | — | A1 → RR 1.82, quality 75 | YES | 6.45 USD (0.58R) | 23.05 USD (2.08R) | NO | NO | NO | Thesis stop close 15:55, **-14.68 USD (-1.32R)** | NO |
| 8 | 15:40 | SELL | PB | WAIT | RR_NOT_ACCEPTABLE (TP2 at 15m pivot 4256.29) | 1.51 | C1 / C2 (2R) | YES | 5.07 USD (0.41R) | 24.43 USD (1.97R) | NO | NO | NO | Thesis stop close 15:55, **-16.06 USD (-1.29R)** | NO |
| 9 | 15:45 | SELL | PB | WAIT | RR_NOT_ACCEPTABLE (TP2 at 5m pivot 4254.23) | 1.11 | C1 / C2 (2R) | YES (skipped sequentially: #8 open) | 1.68 USD (0.11R) | 27.82 USD (1.76R) | NO | NO | NO | Thesis stop close 15:55, **-19.45 USD (-1.23R)** | NO |

No variant produced any BUY during the 45 USD rebound (move B). A2 produced nothing beyond the live rules. 16:50 (A1) and 17:30–17:40 (B2) produced only RR / OVEREXTENDED rejections.

### Sequential P&L per variant over the window (one position at a time, breaker ignored)

| Variant | Trades taken | Net |
|---|---|---|
| BASE (live rules, watcher up, no breaker) | 14:35 BO SELL | **-5.48 USD** |
| A1 | 14:35, 15:35 | -20.16 USD |
| A2 | 14:35 | -5.48 USD |
| B1 | 14:00 MC SELL | -32.92 USD |
| B2 | 12:50 (+30.00), 14:00 (-32.92) | **-2.92 USD** |
| C1 | 12:35 (-7.54), 14:35 (-5.48), 15:40 (-16.06) | -29.08 USD |
| C2 | same as C1 | -29.08 USD |
| C3 | 12:35 (-4.52) | -4.52 USD |
| Actual (breaker 2/2 active) | none | 0.00 USD |

For context, the one signal the breaker did block just before the window (12:32 UTC, PB BUY 4306.64, quality 73) is recorded in the signal store as FAIL, realized -1R.

## 5. Answers

| Question | Answer |
|---|---|
| GOOD_TRADES_CORRECTLY_FILTERED_OUT | **2 setups (4 candidate bars)** — live candidates that passed model and quality gates and were rejected only by the RR gate, and that would have lost: SR BUY 12:35/12:40, PB SELL 15:40/15:45. |
| BAD_TRADES_CORRECTLY_FILTERED_OUT | **2 setups** — only exist under relaxed rules and would have lost: MC SELL 14:00 (B1/B2, sold the low, -32.9 USD), PB SELL 15:35 (A1). Plus the live-rule BO SELL 14:35/14:40 (reboot gap, breaker-blocked) which also lost. |
| POTENTIALLY_MISSED_VALID_SETUPS | **1** — 12:50 BO SELL, +30 USD / +2.53R, available only if 5m structure overrides the 15m bias (B2). The same rule produced the 14:00 -32.9 USD loser 70 minutes later; net -2.9 USD in-sample. |
| CORRECTION_GATE_OVERFILTER_EVIDENCE | **NO.** The live engine has no correction veto; relaxing PB resolution (A1/A2) added only a loser. |
| RR_LOGIC_OVERFILTER_EVIDENCE | **NO.** All four live RR rejections lost when simulated; none reached 1.7R (max MFE 1.28R). Changing target selection (C1/C2/C3) only converted them into losing entries. |
| REGIME_LAG_EVIDENCE | **YES, on the 15m bias.** 15m stayed BULL_TREND until 13:50 while price fell 4302 → 4276, disallowing every SELL during move A. But the tested substitute (5m structure as bias) did not improve results in-sample. |
| MODEL_COVERAGE_GAP_EVIDENCE | **YES, mild.** No model can buy a counter-structure rebound outside a 15m RANGE (MR is RANGE-only; SR needs a ≥50 % wick; `structure.lastSweep` reports the most recently swept pivot, so the 4254 sweep of the older 4256.29 pivot was not visible). Whether such a trade is valid a priori is unproven; the rebound was toward an unbroken lower high. |
| MOST_IMPORTANT_FINDING | In this window the filters were net protective, and the absence of trades since 15:02 is genuinely "no valid signal", not over-filtering. Every candidate the live gates rejected would have lost under the existing exit logic. The only live-rule signal (BO SELL 14:35/14:40) fell in the reboot gap, would have been breaker-blocked, and would have lost. The single profitable counterfactual needs a rule that lost more than it made in the same session. |
| ENGINE_CHANGE_JUSTIFIED_BY_THIS_SAMPLE_ALONE | **NO.** One session, 70 candles, one profitable counterfactual (n = 1), one regime sequence. |

### Required before changing production rules

1. Replay at least 20 sessions (mixed London/NY trend days, range days, news days) with this harness, producing ≥ 30 distinct candidate setups per variant.
2. Capture OANDA bar snapshots live (the `tests/fixtures/xauusd_intraday_session_*.json` mechanism exists) so replay uses the exact feed the watcher trades, removing the broker-offset caveat.
3. Require a variant to beat BASE on expectancy (R per trade) with ≥ 30 trades, no worse maximum drawdown, and no increase in thesis-stop closes; evaluate B2 specifically on sessions where the 15m bias lags a 5m structure flip, since that is the only variant with a winner here and it is also the one with the largest single loss.
4. Keep the 1.7 RR threshold and the 2/2 breaker fixed during that study; neither showed over-filtering evidence in this sample.

## 6. Files

- `replay.mjs` — the replay harness (pure engine functions, no chart/state access).
- `xauusdm_bars_snapshot.json` — MT5 bars used.
- `replay_results.json` — every bar's reconstruction, all variant outputs, fidelity table, swing legs, simulated outcomes.
