# V16_QUOTE_AGE

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Definition (no cross-clock arithmetic)
- **Polling:** the runner polls `symbol_info_tick` continuously and read-only. The 250 ms polling interval is a measurement setting.
- **Identity:** a tick is (broker time_msc, bid, ask).
- **Arrival bounds:** for a tick first returned by poll *j*:
  - it **appeared after** the request time of the last successful poll that returned an older tick;
  - it was **first seen** at poll *j*'s receipt.
- **quote_age_ms** = decision − appeared_after. This is a conservative upper bound on the monotonic clock, and it is the decision input.
- **quote_age_lower_ms** = decision − first_seen.
- **Unwitnessed arrival** (the first tick after a start or restart) → UNAVAILABLE → WAIT_STALE_DATA.
- **Not included:** the broker → terminal transport delay. It is measurable only with a synchronized clock; the terminal round-trip ping is about 253 ms.
- **No staleness rule at 1 s.** A quote is stale only above the owner's 6 s tolerance.

## Live
| Source | Quote age (ms) |
|---|---|
| forward-shadow decision records (V16 block) | n 4; min 648.812; p50 767.348; p90 789.677; max 789.677 |
| probe at 0 s | n 1; min 704.118; p50 704.118; p90 704.118; max 704.118 |
| probe at 1 s | n 1; min 443.32; p50 443.32; p90 443.32; max 443.32 |
| probe at 2 s | n 1; min 652.172; p50 652.172; p90 652.172; max 652.172 |
| probe at 3 s | n 1; min 1125.848; p50 1125.848; p90 1125.848; max 1125.848 |
| probe at 4 s | n 1; min 1087.636; p50 1087.636; p90 1087.636; max 1087.636 |
| probe at 5 s | n 1; min 531.121; p50 531.121; p90 531.121; max 531.121 |
| probe at 6 s | n 1; min 497.017; p50 497.017; p90 497.017; max 497.017 |
| probe at 8 s | n 1; min 402.948; p50 402.948; p90 402.948; max 402.948 |

