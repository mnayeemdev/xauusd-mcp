# V8 FORWARD SHADOW VALIDATION — PRE-REGISTRATION (frozen 2026-10-01 before the first forward decision; owner amendment 1 the same day)

Continues V8 (commits 0d15538, 8fbf470). **Shadow / measure-only.** EXECUTION_AUTHORITY = NONE; REAL and DEMO OFF; no order, position or broker-order action exists in this code path (read-only MT5 reader, no executor or bridge import). Production `src/` is not modified.

## 1. What runs
- **V8** = the frozen corrected core `research/core_pattern_audit_v8/engines/ALL` (D1–D6). Its file hashes must match `research/core_pattern_audit_v8/configs/engines.sha256` at every start, or the runner refuses to start.
- **CONTROL** = production `src/engine`, evaluated on the same inputs.
- Data: Exness XAUUSDm 5m / 15m / 30m / 1H through the read-only reader. Each window holds the last 499 COMPLETED bars, and the forming bar is excluded on every timeframe.
- One decision per engine per new completed 5m candle, taken ≥ 8 s after the close.
- **FORWARD_LIVE** = decided ≤ 120 s after the close. Later decisions (restart, outage) are recorded as LATE_DECISION and never counted.
- Pipeline: 5m data → candle structure → pattern detection → model eligibility → setup → trigger → entry location → structural SL → RR 1.70 → safety → BUY / SELL / WAIT. Nothing in the engine is changed: no new indicator, filter or external data, the same RR and SL.
- **Execution-safety stage** (shadow; production limits, read-only inputs):
  - live spread ≤ 0.60 USD;
  - News V2 state from the production calendar snapshot is NORMAL (PRE_NEWS / NEWS_ACTIVE / POST_NEWS_COOLDOWN / missing data block);
  - the production volatility-shock state is not active;
  - margin for 0.01 lot is available at the 10,000 USD DEMO baseline. The REAL 62 USD account's margin veto is noted, not applied: the shadow validates the core.

## 2. WAIT reasons
Every WAIT gets exactly one of: NO_PATTERN, NO_SETUP, NO_TRIGGER, MODEL_NOT_ELIGIBLE, LOCATION_INVALID, STRUCTURAL_RISK_INVALID, RR_INVALID, SPREAD_BLOCK, NEWS_BLOCK, VOLATILITY_BLOCK, BROKER_SAFETY, DATA_UNAVAILABLE, STALE_DATA, CONTEXT_CONFLICT, OTHER_GOVERNED_REASON, plus an exact detail.

Mapping:
- INSUFFICIENT_DATA / BIAS_UNAVAILABLE / fetch or integrity failure → DATA_UNAVAILABLE.
- Stale 5m/15m/30m (V8 D6) → STALE_DATA.
- VOLATILITY_INSUFFICIENT → VOLATILITY_BLOCK.
- OVEREXTENDED → LOCATION_INVALID.
- INVALID_GEOMETRY → STRUCTURAL_RISK_INVALID.
- RR_NOT_ACCEPTABLE → RR_INVALID.
- ENTRY_CONFLICT / HTF_CONFLICT → CONTEXT_CONFLICT.
- CHOP → MODEL_NOT_ELIGIBLE.
- NO_GOOD_ENTRY → OTHER_GOVERNED_REASON "QUALITY_GATE" with score, threshold, basis and the weakest components (never a bare "low quality").
- NO_ELIGIBLE_STRATEGY:
  - → MODEL_NOT_ELIGIBLE if a model's trigger is present but the 15m bias does not allow that model / side;
  - otherwise the furthest stage reached by an allowed model: setup → NO_TRIGGER, pattern → NO_SETUP, none → NO_PATTERN.

## 3. Counting
- **FORWARD_VALID_SETUP_COUNT** = FORWARD_LIVE bars where the engine's full rule chain produced BUY/SELL (before execution safety), excluding duplicates.
- **FORWARD_SIGNAL_COUNT** = valid setups not blocked by execution safety (SHADOW_SIGNAL = TRUE, EXECUTED = FALSE).
- Duplicate = same engine, model, side and anchor (to the cent) within 12 bars of a counted signal (the production stale-same-setup rule).
- No replay, backfill, synthetic or hand-picked signal ever counts. Zero setups are recorded as zero.

## 4. Hypothetical outcomes (NOT EXECUTED)
- Entry = signal close.
- PRIMARY target = entry ± 1.70 × structural risk. SECONDARY = the engine TP2 (≥ 1.70 R).
- EXIT_F (V5/V8 simulator): broker fail-safe 1.5 R + spread intrabar; thesis invalidation on a confirmed close beyond the stop; target touch; stop before target on the same bar; 288-bar horizon; BUY swap 0.56 USD per night.
- Costs: NORMAL 0.24 + 0.10 USD, STRESS 0.60 + 0.20 USD.
- Recorded: MFE, MAE, reach of 1 / 1.25 / 1.5 / 1.7 / 2 R, duration, final R.
- A label is written only after every policy resolved or the horizon elapsed.

## 5. Missed setups
A move event is the V3–V8 definition: ≥ 3 ATR within 24 bars before 1 ATR adverse. It is examined after maturity, against the decisions recorded at their original timestamps in [onset − 6, onset + 6]. Classes:
- **DETECTED_CORRECTLY:** aligned shadow signal ≤ onset.
- **DETECTED_LATE:** aligned signal only after the onset.
- **UNCERTAIN:** no model's trigger in the move direction, so it is not a defined pattern, or no decisions were recorded.
- **BLOCKED_INCORRECTLY:** the blocking decision failed a D1–D6, replay or stage-parity check.
- **BLOCKED_CORRECTLY:** a governed rule blocked it (eligibility, context, location, RR, quality, safety, data, opposite-side priority).
- **MISSED:** a trigger was present and nothing governed explains the WAIT.

## 6. Wrong-direction forensics
Applied to labelled signals with a 1.70 R outcome ≤ 0 or a wrong-direction open path (MFE < 0.5 R and the structural stop reached). The first failing check gives the class:
1. DATA_ERROR: an integrity failure or stale input.
2. TIMING_ERROR: decision > 120 s after the close, or entry later than the model limit.
3. PATTERN_ERROR: the D1/D2 oracle differs.
4. SETUP_ERROR: D3 depth < 1 ATR.
5. TRIGGER_ERROR: D5 RR < 1.70 before rounding, or the traded model is not at stage 3.
6. LOCATION_ERROR: D4, or overextension > 2.5 ATR.
7. DIRECTION_ERROR: MC/PB side against the bias.
8. OTHER: stop on the wrong side.

If every check passes, the class is VALID_LOSING_TRADE.

## 7. D1–D6 regression
On every decision for both engines: independent oracles for D1 (time-ordered breaks) and D2 (most recent sweep), D3 on PB setups, D4 on MR setups, D5 on every setup, D6 on every decision. Any V8 violation is a regression. CONTROL violations measure the defects still live in production.

## 8. Replay cross-check, integrity, restart
- **Replay cross-check:**
  - Sample: every valid setup or signal and every top-of-hour decision.
  - Method: re-evaluated ≥ 60 s later from the first-seen bar archive. Inputs are compared by hash, then the decision fields.
  - Any mismatch is logged and investigated, never auto-fixed.
- **Integrity checks per decision:** window length, monotonic and aligned times, no forming bar, OHLC geometry, decision bar = last completed bar.
- **Restart determinism:** decision id = hash(schema, engine, symbol, timeframe, bar time), and a bar is never decided twice.

## 9. Over-correction flags (descriptive, recorded only)
Flags are computed on whatever has been observed, and the sample size is shown next to each flag. Small samples are noisy, and no flag triggers a code change.
1. V8 signals < 80 % of CONTROL.
2. Any model's share shifts > 15 points.
3. The BUY share differs by > 15 points.
4. Mean bars from origin > CONTROL + 1.
5. DETECTED_CORRECTLY share < CONTROL − 5 points.

## 10. Observation period, evidence and owner review
- There is **no sample-size gate and no trade-count target** of any kind. The market decides how many setups occur. Zero valid setups in a period is recorded as zero and is a valid observation; one setup, or many, is recorded exactly as it happens.
- Observation continues indefinitely until the owner stops the validation period. The validation context is the elapsed calendar time and the actual market observations.
- Reports show the accumulated evidence: OBSERVATION_START, OBSERVATION_END, ELAPSED_TIME, TOTAL_CANDIDATES, VALID_SETUPS, MISSED_VALID_SETUPS, INCORRECT_BLOCKS, INVALID_SETUPS_INCORRECTLY_ACCEPTED, LATE_SIGNALS, WRONG_DIRECTION_DECISIONS, VALID_LOSING_TRADES, IMPLEMENTATION_ERRORS and D1–D6 REGRESSIONS, for V8 and CONTROL.
- A daily evidence snapshot is written at each UTC day change, for calendar context only.
- **Core rule correctness:**
  - V8 is correct while its replay parity, D1–D6 regressions, stage parity, implementation errors, missed setups and incorrect blocks stay at zero.
  - CONTROL violations show the defects V8 removes.
  - No automatic verdict is drawn: a few profitable trades are not success, and a few losing trades are not failure.
- **DEMO_ELIGIBLE = NO** unless the owner explicitly decides otherwise after reviewing core rule correctness, forward behaviour, risk control, cost realism and stability. DEMO is never enabled automatically.
- REAL stays prohibited.
- Capital Harvest, auto-scaling, martingale and averaging down stay OFF.
- RR is 1.70 and the lot is 0.01.

## Amendment log
- **Amendment 1 (owner, 2026-10-01).** The fixed sample-size completion gate, the count-based milestones and the automatic DEMO rule were removed. They are replaced by continuous observation, time-based evidence snapshots and an owner review. Definitions in §1–§8 are unchanged.
