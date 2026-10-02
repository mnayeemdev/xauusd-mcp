# V16_SIX_SECOND_TOLERANCE

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Parameter
- **MAX_EXECUTION_SIGNAL_AGE = 6000 ms.** It is owner-defined and measured on the monotonic clock, from the moment the engine evaluation produced the signal.
- **Scenarios:** 0–6 s are the owner's test scenarios. 8 s is used only to exercise the "> 6 s" rule.
- **The 6 s boundary is inclusive.** A probe decides at k s − 0.5 ms, so the 6 s probe tests 6.000 s.

## Scenario grid: unchanged market (ILLUSTRATIVE risk model; PRIMARY gives VALID_ENTRY + RISK_REJECTED)
| Signal | 0 s | 1 s | 2 s | 3 s | 4 s | 5 s | 6 s | 8 s |
|---|---|---|---|---|---|---|---|---|
| SELL | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | SIGNAL_EXPIRED |
| BUY | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | SIGNAL_EXPIRED |

| Delay | Allowed when the original conditions still hold |
|---|---|
| 0 s | YES |
| 1 s | YES |
| 2 s | YES |
| 3 s | YES |
| 4 s | YES |
| 5 s | YES |
| 6 s | YES |

## What the window does NOT do
- **No forced trade.** Across 800 grid cells, TRADE_ELIGIBLE appears 0 times outside a still-valid state.
- **A same-delay WAIT when the state changed.** At every delay 0–6 s, 10 different decisions occur across the state variants.
- **> 6 s:** the original signal is never carried forward (WAIT_SIGNAL_EXPIRED). A NEW signal can come only from a newer closed bar with a valid engine entry.

## Live
| Delay | Probes | Entry still valid | PRIMARY | ILLUSTRATIVE | Signal age (ms) | Quote age (ms) |
|---|---|---|---|---|---|---|
| 0 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 58.272; p50 58.272; p90 58.272; max 58.272 | n 1; min 704.118; p50 704.118; p90 704.118; max 704.118 |
| 1 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 999.507; p50 999.507; p90 999.507; max 999.507 | n 1; min 443.32; p50 443.32; p90 443.32; max 443.32 |
| 2 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 1999.511; p50 1999.511; p90 1999.511; max 1999.511 | n 1; min 652.172; p50 652.172; p90 652.172; max 652.172 |
| 3 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 2999.511; p50 2999.511; p90 2999.511; max 2999.511 | n 1; min 1125.848; p50 1125.848; p90 1125.848; max 1125.848 |
| 4 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 3999.519; p50 3999.519; p90 3999.519; max 3999.519 | n 1; min 1087.636; p50 1087.636; p90 1087.636; max 1087.636 |
| 5 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 4999.515; p50 4999.515; p90 4999.515; max 4999.515 | n 1; min 531.121; p50 531.121; p90 531.121; max 531.121 |
| 6 s | 1 | 1 | WAIT_RISK_UNSAFE: 1 | TRADE_ELIGIBLE:ALL_CHECKS_PASSED: 1 | n 1; min 5999.511; p50 5999.511; p90 5999.511; max 5999.511 | n 1; min 497.017; p50 497.017; p90 497.017; max 497.017 |
| 8 s | 1 | 0 | WAIT_SIGNAL_EXPIRED: 1 | WAIT_SIGNAL_EXPIRED:SIGNAL_AGE_ABOVE_EXECUTION_TOLERANCE: 1 | n 1; min 7999.512; p50 7999.512; p90 7999.512; max 7999.512 | n 1; min 402.948; p50 402.948; p90 402.948; max 402.948 |
