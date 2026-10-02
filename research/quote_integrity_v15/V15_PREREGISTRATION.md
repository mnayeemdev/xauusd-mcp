# V15 — LIVE QUOTE AGE + RISK DATA INTEGRITY — SPECIFICATION AND PRE-REGISTERED VALIDATION (frozen 2026-10-02, before any live capture)

A data-integrity study.
- **Not entry research.** No strategy, pattern, setup, trigger, direction, location, structural SL or RR change. No filter, indicator, threshold approval or risk percentage.
- **Authority:** REAL = OFF, DEMO = OFF, EXECUTION_AUTHORITY = NONE. The demo connection is used read-only. There is no order or position call anywhere.

## 1. Quote data contract (`quote-v15-1`)
One record per observation. A field the platform does not provide is the string `UNAVAILABLE`, never a guessed value.

| Field | Source | Notes |
|---|---|---|
| symbol | request | XAUUSDm |
| decision_timestamp_ms | PC clock, UTC (Date.now) | the instant the decision is evaluated |
| bid, ask | MT5 `symbol_info_tick` | raw broker prices |
| mid | (bid + ask) / 2 | descriptive only; never an execution price |
| quote_timestamp_ms | MT5 `symbol_info_tick.time_msc` | broker server clock, ms; `time` (seconds) kept as `quote_timestamp_s` |
| quote_age_ms | decision_timestamp_ms − (quote_timestamp_ms − server_utc_offset_ms) | see §2 |
| spread | ask − bid | raw USD; spread_points = spread / point |
| tick_sequence | UNAVAILABLE | MT5 provides no tick sequence number |
| tick_flags | MT5 `symbol_info_tick.flags` | raw |
| data_source | "MT5 terminal symbol_info_tick via the read-only shadow reader" | |
| data_received_timestamp_ms | PC clock, UTC, when the reader returned the tick | |
| clock | { quote_clock: BROKER_SERVER, decision_clock: PC_UTC, server_utc_offset_ms, offset_source } | |

## 2. Clocks
- **Two clocks.** The quote time is the broker-server clock; decisions use the PC clock (UTC).
- **Offset.** server_utc_offset_ms is the broker's time-zone offset, estimated from live observations: the median of (received − quote_timestamp), rounded to the nearest 15 minutes. If that rounds to 0, the broker clock is treated as UTC.
- **Candle time is never quote time.** Candle timestamps (bar open time, seconds) are never used as quote timestamps.
- **Resolution:** quote ms (time_msc); PC ms (Date.now; Windows timer granularity ≈ 1–16 ms).

## 3. Validation (fail closed; never repaired)
**INVALID_QUOTE** (gate: WAIT_STALE_DATA), reasons:
- QUOTE_TIMESTAMP_UNAVAILABLE;
- QUOTE_AGE_UNAVAILABLE;
- CLOCK_OR_DATA_ERROR: quote age < 0, or the quote timestamp is later than the receive time;
- OUT_OF_ORDER: the quote timestamp is older than the last accepted quote;
- DECISION_BEFORE_RECEIPT.

**INVALID_QUOTE** (gate: WAIT_BROKER_UNSAFE), reasons: BID_UNAVAILABLE, ASK_UNAVAILABLE, BID_NOT_POSITIVE, ASK_NOT_POSITIVE, ASK_BELOW_BID, SPREAD_NEGATIVE.

**Duplicates.** A duplicate (same timestamp, bid and ask as the last quote) is labelled DUPLICATE_QUOTE. It carries no new information, and its age keeps growing from its own timestamp.

**Freshness.** quote_age_ms > the configured limit → STALE_QUOTE (WAIT_STALE_DATA).
- The gate's limit is the EXISTING production rule maxQuoteAgeSec (90 s, REAL_DEFAULTS).
- 100 / 250 / 500 / 1,000 / 2,000 / 5,000 ms are technical measurement scenarios only, never approved parameters.

**Entry price.** BUY = ask, SELL = bid. Mid is never an execution price. The structural SL is never moved; an invalid risk calculation is rejected.

## 4. Integration
**Live path.**
- The V14 gate is unchanged. A V15 wrapper validates the quote first.
- For a decision with a valid entry, an invalid quote → WAIT_STALE_DATA / WAIT_BROKER_UNSAFE, with the quote reason.
- A valid quote age is passed to the gate (and the V11 firewall) as quote age, and the live spread as spread.

**Historical replay.**
- V8 replay rows carry candles only → QUOTE_AGE_UNAVAILABLE (LEGACY_DATA).
- Never reconstructed from candle times.
- Consequently, NO historical decision can be TRADE_ELIGIBLE. The V14 illustrative replays' bar-close assumption (quote age 0) is withdrawn.

**Forward shadow.**
- The read-only reader adds `time_msc`, `flags` and the receive time to its `tick` response (backward compatible).
- The V8 forward-shadow runner writes a `quote` object (contract §1) into every new decision record.
- Earlier records are LEGACY_DATA / QUOTE_AGE_UNAVAILABLE.

## 5. Live data test (read-only)
- Observe XAUUSDm ticks through the read-only reader for about 3 minutes at about 4 Hz.
- Measure:
  - quote-age distribution;
  - how often the quote timestamp advances;
  - duplicates and out-of-order arrivals;
  - negative ages;
  - receive latency;
  - the clock offset;
  - the share of observations within each technical scenario.

## 6. Decision (pre-registered)
**DATA_INTEGRITY_VALIDATED** only if all of:
- **live capture:**
  - the quote timestamp is captured on ≥ 99 % of observations;
  - quote age is computed for every valid observation;
  - no unexplained negative age;
  - the clock offset is documented;
- **validation and fail-closed:**
  - every validation and fail-closed unit test passes;
  - historical quote age is never fabricated (test);
- **forward shadow:** ≥ 3 NEW forward-shadow records written by the running runner carry a valid `quote` object;
- **replay and boundaries:**
  - replay of the recorded observations and records is deterministic and reproduces every quote-age decision;
  - no lookahead;
  - entry rules unchanged (fingerprint; V8 engine manifest);
  - RR 1.70;
  - no order.

**DATA_INTEGRITY_PARTIALLY_VALIDATED:** the contract, validation and tests pass, but a live criterion is not met (for example, no new forward-shadow records yet, or a clock offset that cannot be established).

**DATA_INTEGRITY_INCONCLUSIVE:** no live data could be captured.

**DATA_INTEGRITY_FAILED:** any eligible decision without a quote age, any fabricated historical quote age, any invalid quote accepted, or any entry-rule change.
