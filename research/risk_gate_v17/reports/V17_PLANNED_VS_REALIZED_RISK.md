# V17_PLANNED_VS_REALIZED_RISK

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Planned (owner §9) and realized (owner §10) are recorded separately for every trade
- **Planned:** PLANNED_RISK_AMOUNT, PLANNED_RISK_PERCENT, ENTRY_PRICE, SL_PRICE, POSITION_SIZE, plus the post-rounding ACTUAL_STOP_RISK.
- **Realized:** STOP_LOSS_LOSS, COMMISSION, SWAP, SLIPPAGE, GAP_IMPACT → TOTAL_REALIZED_RISK and RISK_MULTIPLIER (= total ÷ actual stop risk).
- **The planned SL is not a guaranteed loss:** slippage beyond the allowance, swap and gaps through the stop are all recorded.

## 0.50 % research scenario, 10,000 USD, ENVELOPE basis (USD; losers for the loss columns)
| Split | Scenario | Accepted | Losers | Planned risk | Actual stop risk | Stop-loss loss | Commission | Swap | Slippage | Gap impact | Total realized (losers) | Risk multiplier (losers) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | NORMAL | 676 | 364 | 50.23 | 45.34 | 33.02 | 0.00 | 0.03 (max 4.62) | 0.64 | 0.05 (max 24.71) | 33.80 (max 74.57) | n 364; mean 0.7399; p50 0.7122; p90 1; p99 1; max 1.4957 |
| DEV | MODERATE | 654 | 367 | 44.47 | 39.49 | 28.95 | 0.00 | 0.03 (max 4.62) | 1.58 | 0.04 (max 17.11) | 30.64 (max 57.51) | n 367; mean 0.7754; p50 0.7405; p90 1.0379; p99 1.0734; max 1.5008 |
| DEV | SEVERE | 339 | 320 | 20.65 | 17.29 | 4.21 | 0.00 | 0.00 (max 0.51) | 23.81 | 0.00 (max 0.00) | 28.32 (max 208.47) | n 320; mean 1.7173; p50 1.7202; p90 2.979; p99 4.2534; max 4.5879 |
| HOLD | NORMAL | 795 | 440 | 48.85 | 42.11 | 32.79 | 0.00 | 0.02 (max 4.11) | 0.47 | 0.32 (max 251.22) | 33.83 (max 296.06) | n 440; mean 0.7981; p50 0.7613; p90 1; p99 1; max 6.6025 |
| HOLD | MODERATE | 791 | 438 | 45.06 | 38.03 | 30.03 | 0.00 | 0.02 (max 3.08) | 1.19 | 0.28 (max 219.81) | 31.72 (max 262.97) | n 438; mean 0.8247; p50 0.7818; p90 1.0303; p99 1.063; max 6.2979 |
| HOLD | SEVERE | 475 | 400 | 23.09 | 18.38 | 5.19 | 0.00 | 0.00 (max 0.51) | 18.37 | 0.00 (max 0.71) | 24.46 (max 137.13) | n 400; mean 1.5272; p50 1.5369; p90 2.6918; p99 3.8856; max 4.3071 |

## Stop execution vs gap through the stop
- **STOP EXECUTION:** the hard stop fills at its level plus slippage. In NORMAL, the multiplier is exactly 1.00 (sized for it).
- **GAP THROUGH STOP:** the bar opens beyond the level, and the fill is at that open. This is GAP_IMPACT, with no upper bound from the stop itself (see V17_GAP_RISK).
