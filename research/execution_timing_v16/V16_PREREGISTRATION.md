# V16 — EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · PRE-REGISTRATION

Written 2026-10-02, before any V16 live probe was recorded. RESEARCH ONLY.
- **Execution:** REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE.
- **Strategy:** the frozen V8 corrected engine is unchanged. Pattern, setup, trigger, direction, entry location, structural SL and RR 1.70 are all as before.
- **Risk:** CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED.
- **Targets:** there is no trade-count target and zero trades is valid.

## 1. Owner parameter
- **MAX_EXECUTION_SIGNAL_AGE = 6 s (6000 ms).** It is owner-defined and is an execution-tolerance window only. It is never an entry, never a BUY or SELL, and never a gap-fill assumption.
- **Delay scenarios** (owner): 0, 1, 2, 3, 4, 5 and 6 s.
- **Beyond-window scenario:** 8 s, used only to exercise the "> 6 s" rule. It is not a strategy.
- **No other new threshold is introduced.** Every other limit is an existing frozen-engine rule or an existing production rule:

| Limit | Value | Source |
|---|---|---|
| minRiskAtr | 0.5 | engine |
| overextendAtrMult | 2.5 | engine |
| minRR | 1.7 | engine |
| minEffectiveRr | 1.7 | production |
| maxEntryDriftUsd | 2.0 | production |
| maxSpreadUsd | 0.60 | production |
| daily breakers | as in production | production |

## 2. Clocks (owner §16/§17): never mixed silently, no application offset
| Clock | Used for | Never used for |
|---|---|---|
| Broker server clock (MT5 `time_msc`, bar times) | market-event identity: which tick, which bar, ordering, duplicates, broker-internal consistency | durations against the PC clock |
| Monotonic clock (`performance.now()`, process-local) | every elapsed duration: signal age, quote age | identity |
| PC wall clock (UTC) | human-readable timestamps; the clock monitor | any decision |

- **No offset:** the code contains no fixed application offset (+1000 / +1230 / +2000 ms or similar).
- **Clock monitor:** `wall_minus_broker_ms = PC receive time − broker tick time` is recorded on every quote.
  - It mixes the PC clock drift with transport delay; these two are not separable without a synchronized clock.
  - It is never a decision input.
  - The Windows time-service status is read read-only.
- **Clock drift ≠ latency.** A quote received 1 s after another event is not a clock error. Only an impossible timestamp relationship is a CLOCK_OR_DATA_ERROR (§4 T2/T3).

## 3. Definitions
- **Signal:**
  - A frozen-V8 BUY or SELL engine output observed by the forward-shadow runner on a newly closed 5m bar.
  - Its identity is (bar_time, model, side, anchor, structural SL).
  - `signal_observed` is the monotonic and wall time at which the engine evaluation returned.
  - The observation latency from bar close is an existing runner design (settle 8 s + ≤ 5 s polling). It is recorded and is not part of the execution tolerance.
- **signal_age_ms** = decision_mono − signal_observed_mono.
- **Quote:**
  - The latest broker tick from continuous read-only polling of `symbol_info_tick`. The 250 ms polling interval is a measurement setting.
  - Tick identity = (time_msc, bid, ask).
  - For a tick first returned by poll *j*:
    - `first_seen_mono` = poll *j* receive time;
    - `appeared_after_mono` = the request time of poll *j−1* (the last poll that returned an older tick).
- **quote_age_ms** (decision input; conservative upper bound of the local age) = decision_mono − appeared_after_mono.
  - Lower bound = decision_mono − first_seen_mono.
  - The broker→terminal transport delay is not included. It is monitored through the terminal round-trip ping, and is measurable only with a synchronized clock.
  - Without a witnessed tick transition (no earlier poll), quote_age is UNAVAILABLE.
- **Execution price:** BUY uses the current ask and SELL the current bid. Never the mid, and never the stale signal price.

## 4. Revalidation order (first failure decides; everything fails closed)
**Timing (T):**
1. **T1:** signal, decision and quote timestamps are present and finite. Otherwise → WAIT_STALE_DATA (`MISSING_TIMESTAMP:*`).
2. **T2:** monotonic order holds: signal_observed ≤ decision, and quote receipt ≤ decision. Otherwise → WAIT_STALE_DATA (`CLOCK_OR_DATA_ERROR:*_AFTER_DECISION`).
3. **T3:** broker-internal consistency. Otherwise → WAIT_STALE_DATA (`CLOCK_OR_DATA_ERROR:*`):
   - tick time ≥ the open of the last closed 5m bar used;
   - tick time < the latest broker bar open + 2 × 300 s;
   - tick time does not decrease versus the previous accepted tick.
4. **T4:** signal_age > 6000 → WAIT_SIGNAL_EXPIRED.
   - The original is never carried forward.
   - A fresh evaluation is recorded: NEW_SIGNAL_AVAILABLE only if a newer closed bar carries a valid engine entry, otherwise NO_NEW_SIGNAL.
5. **T5:** quote_age UNAVAILABLE, or > 6000 → WAIT_STALE_DATA.
6. **T6:** bid > 0, ask > 0, ask ≥ bid, spread ≥ 0. Otherwise → WAIT_BROKER_UNSAFE.

**Engine (E):**
7. **E1:** the same frozen engine is re-evaluated on the latest closed bars at the decision.
   - If the engine now says WAIT, the V14 gate maps the current state (WAIT_NO_TRIGGER, WAIT_NO_SETUP, WAIT_DIRECTION_UNCLEAR, …), with the reason `ORIGINAL_SIGNAL_INVALIDATED:*`.
   - If the engine gives a BUY/SELL with a different side, model, anchor or structural SL, or a newer bar has closed → WAIT_SIGNAL_CHANGED.

**Execution geometry (X)** at the execution price, with the ORIGINAL structural SL (never moved, widened or tightened):
8. **X1:** price beyond SL → WAIT_INVALID_SL.
9. **X2:** |price − SL| < 0.5 ATR (engine minRiskAtr) → WAIT_INVALID_SL.
10. **X3:** |price − anchor| > 2.5 ATR (engine overextension) → WAIT_INVALID_LOCATION.
11. **X4:** |price − engine entry| > 2.0 USD (production) → WAIT_BROKER_UNSAFE (ENTRY_DRIFT).
12. **X5:** effective RR from price to the engine objective (TP2) < 1.70 (production executable geometry) → WAIT_INVALID_RR.
13. **Research target:** TP = price ± 1.70 × |price − SL|, so RR = 1.70 is verified on every revalidated entry.

**Gate (G):**
14. **G1:** the unchanged V14 gate is run on the current engine input, with the execution entry.
    - The safety stage is re-evaluated: production spread limit, News V2 and shock state.
    - Breakers, conflict, trigger, risk and broker are checked.
    - With **PRIMARY** (risk UNRESOLVED), the result is WAIT_RISK_UNSAFE RISK_PERCENTAGE_UNRESOLVED (VALID_ENTRY + RISK_REJECTED).
    - With **ILLUSTRATIVE** (0.50 % of 10,000 USD, not approved), TRADE_ELIGIBLE is possible.
    - Risk is sized from the execution price and the original SL. A risk hash check proves risk never modifies the entry.

## 5. Evidence
- **Scenario grid** (deterministic; quotes are labelled SCENARIO, not market data):
  - real V8 signal records from the forward shadow;
  - every delay 0–6 s (and 8 s);
  - × state variants: unchanged, small drift, trigger gone, direction changed, location overextended, SL breached, RR invalid, drift over the limit, risk rejected, broker rejected, stale quote, missing quote, future / out-of-order timestamp, clock-drift monitor.
- **Live probes:**
  - The updated runner re-validates every forward-live V8 signal at 0–6 s and 8 s after observation.
  - It uses real polled quotes and freshly fetched closed bars (`state/v8_shadow/timing_probes.jsonl`).
  - Every probe stores its inputs, so it can be replayed.
- **Historical:** replay rows carry no quotes, so historical timing is UNAVAILABLE. Nothing is reconstructed from candles.

## 6. Decision
- **EXECUTION_TIMING_VALIDATED:** the owner's 15 success criteria are shown by the tests and the scenario grid, AND all of the following:
  - at least one live V8 signal was re-validated with real polled quotes;
  - live replay parity holds on all probe records;
  - no-lookahead holds on all probe records (every input was received before the decision);
  - no eligible decision lacks a signal age or quote age.
- **EXECUTION_TIMING_PARTIALLY_VALIDATED:** the logic criteria all pass, but live evidence is missing. This covers no forward-live V8 signal occurring while the updated runner ran before the weekend close. This is not a count target; it is the only live mechanism check.
- **EXECUTION_TIMING_INCONCLUSIVE:** a criterion cannot be established.
- **EXECUTION_TIMING_FAILED:** any one of the following:
  - an eligible decision with an invalid condition (a forced trade);
  - a moved SL;
  - RR ≠ 1.70;
  - risk modifying the entry;
  - an application clock offset in the decision path;
  - an accepted genuine timestamp error;
  - lookahead;
  - a replay mismatch;
  - a strategy-rule change;
  - any order.
- **CLOCK_INTEGRITY** (the PC wall clock vs NTP) is reported separately. Because no V16 decision uses a wall-clock comparison, it does not by itself decide the V16 status.
