# XAUUSD_SILVER_N2_FORWARD_OBSERVATION — protocol (frozen 2026-10-01, MEASURE ONLY)

Owner directive: SILVER N2 + DOM FORWARD OBSERVATION, MEASURE-ONLY MASTER PROMPT. Continues the Stage 11C shadow observer (`src/shadow/`) with two new frozen MEASURE_ONLY candidates. **Execution authority = NONE.** Nothing in `src/shadow/` imports the engine, watcher, executor, policy or bridge; the Python reader has no trading call; the only new reader command is the read-only market book.

## 1. What is observed
Every genuine forward production signal (from the unchanged production signal store `validation/mcp_engine_signals.json`) gets an SC3 record with: timestamp (UTC), symbol, direction, XAUUSD price at the signal (entry), last 5m close, XAGUSD price (same-open 5m bar), silver direction and 6-bar momentum in silver ATR, silver confirmation state (CONFIRMED / CONFLICT / NEUTRAL / NA), divergence flag, production context (regime, structure, session, quality, model, executor status), the entry / structural SL that production produced, the 1.70R theoretical target, live spread, 5m ATR, UTC hour, news state from the calendar snapshot, DOM snapshot (SC4), and later the hypothetical outcome. The order is never sent by the observer; production's own executor decision is recorded as-is (today: MARGIN_SAFETY_VETO).

## 2. Minimum sample and provenance
300 genuine forward production signals with labelled outcomes. Only `provenance = FORWARD_LIVE` (record created ≤ 15 min after the signal bar closed) counts. BACKFILL, HISTORICAL_REPLAY and TEST never count. One record per `signal_id` (observation_id derived from candidate + symbol + timeframe + bar_time; duplicates rejected by the store). No synthetic or manually selected signals.

## 3. Three-way comparison
A. CONTROL = all forward signals (unfiltered production decision). B. SILVER CONFIRMED = signed silver_mom6 ≥ +0.75 silver-ATR. C. SILVER CONFLICT = signed silver_mom6 ≤ −0.75. NEUTRAL and NA reported. Same signals, partitioned after the fact; execution unchanged.

## 4. Hypothetical outcome (HYPOTHETICAL_NOT_EXECUTED)
Geometry: production entry and structural stop; target = entry ± 1.70 × risk (production tp2 recorded, not used). Exit model EXIT_F (as V1–V7): broker fail-safe 1.5R + spread intrabar; thesis invalidation at a confirmed close beyond the stop; target touch; SL before TP on the same bar; 288-bar horizon. Open path (structural stop only) gives MFE_R, MAE_R and reach of 1 / 1.25 / 1.5 / 1.7 / 2R before invalidation; wrong-direction = open-path MFE < 0.5R and stop reached; bad entry = never +1R. Costs: NORMAL 0.24 + 0.10 USD, STRESS 0.60 + 0.20 USD. Outcomes are written only after the open path resolved or the horizon elapsed, from completed bars only.

## 5. Gate (SILVER_EDGE_STATUS)
Evaluated only when ≥ 300 FORWARD_LIVE SC3 observations are labelled. POSITIVE requires ALL: CONFIRMED expectancy ≥ CONTROL + 0.10 R; wrong-direction ≥ 3 points lower; PF > 1.10; 95 % CI lower bound > 0; STRESS expectancy > 0; not timing-sensitive; 1.70R reach, MFE, MAE and DD not worse than CONTROL. NEGATIVE if CONFIRMED expectancy ≤ CONTROL or neither improvement nor wrong-direction criteria hold. Otherwise INCONCLUSIVE. Win rate, drawdown or trade count alone never make it POSITIVE.

### 5a. Freeze rule and final decision (declared 2026-10-01 before any SC3 record existed)
When FORWARD_LIVE_COUNT reaches 300, the analysis dataset is frozen as the FIRST 300 forward SC3 observations in decision-time order; its observation-id list is hashed (sha256) and reported. Later forward records are kept in the store but never enter the final analysis. Until all 300 are labelled the status is GATE_REACHED_AWAITING_LABELS. The final comparison covers CONTROL, SILVER CONFIRMED, SILVER CONFLICT and SILVER NEUTRAL on wrong-direction, expectancy_R, PF, MFE, MAE, reach of 1 / 1.25 / 1.5 / 1.7 / 2R, normal and stress cost, timing sensitivity and data quality. FINAL_DECISION wording: POSITIVE maps to PROMISING_REQUIRES_NEW_RESEARCH_SPEC (never a deployment, never automatic activation of silver or DOM), NEGATIVE maps to REJECTED, INCONCLUSIVE stays INCONCLUSIVE. Before the gate every report carries the banner INTERIM — NOT FINAL — INSUFFICIENT_SAMPLE with FORWARD_LIVE_COUNT and REMAINING_TO_300.

## 6. Timing
Same-bar silver (bar open == signal bar open, complete at the decision instant) and one-bar-lag silver (previous completed bar) are recorded for every signal and evaluated separately. If the sign of the improvement differs between them, TIMING_SENSITIVE = TRUE and the result is not treated as proven (V7 found exactly this in the backtest: +0.021 → −0.007 R).

## 7. DOM (SC4)
Read-only `market_book_add` / `market_book_get` on XAUUSDm per 5m decision and per production signal: best bid/ask, spread, bid depth, ask depth, imbalance, level count, change vs previous snapshot, liquidity-withdrawal flag, availability reason. DOM_MEASURE_ONLY = TRUE; FORWARD_ONLY_DATA = TRUE (no historical DOM; none fabricated); no entry rule is derived.

## 8. Data quality
Timestamp integrity (bar_time in the id; freshness window; anti-future schema check), missing/stale silver (NA, counted), duplicates (store), feed interruption (reader reasons), symbol mismatch (same_open_as_signal flag), timezone (UTC server clock), latency (created − decision). No repair from future information.

## 9. Reports
`node src/shadow/silverReport.js --out <dir>` renders SILVER_N2_FORWARD_REPORT, DOM_FORWARD_REPORT, FORWARD_DATA_QUALITY, SILVER_TIMING_ANALYSIS, SILVER_COST_STRESS, SILVER_CONTROL_COMPARISON, V8_RESEARCH_RECOMMENDATION and `silver_dom_status.json`, any time; the status stays COLLECTING / INSUFFICIENT_FORWARD_EVIDENCE until the 300 gate.

## 10. Stop conditions
Any change that could let SC3/SC4 influence order authorisation stops the stage and restores MEASURE_ONLY. The existing test `tests/shadow_observer.test.js` (no engine/executor/bridge import; closed read-only reader protocol; production files read-only) and `tests/silver_dom_forward_observation.test.js` enforce this.

## 11. Frozen
Everything else unchanged: RR 1.70, lot 0.01, entry engine, SL, TP, Capital Harvest OFF, News V2, breaker, drift, broker protection, AUTO_SCALING OFF.
