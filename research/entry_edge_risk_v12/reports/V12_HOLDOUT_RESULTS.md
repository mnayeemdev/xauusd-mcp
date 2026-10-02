# V12_HOLDOUT_RESULTS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Holdout discipline
- **DEV:** used for development, including the SR measurement correction D1 and pre-registration Amendment 1 (Part B only).
- **Freeze:** candidates (none passed), timing cuts and buffers were frozen.
- **HOLD:** replayed once (6553 valid entries, 1510 trades). Nothing was tuned on HOLD.

## HOLD entry results
| Measure | DEV | HOLD |
|---|---|---|
| Valid entries / trades | 4858 / 1133 | 6553 / 1510 |
| Trade expectancy net (CI) | -0.077 [-0.176, 0.013] | -0.022 [-0.105, 0.054] |
| Trade expectancy gross | 0.018 | 0.042 |
| PF | 0.90 | 0.97 |
| Pooled ENTRY-stage edge | -0.027 [-0.125, 0.061] | 0.023 [-0.059, 0.098] |
| Losing trades valid | 632 / 632 | 831 / 831 |

## Decision (pre-registered A7)
- ENTRY_EDGE_STATUS = **EDGE_FAILURE_NOT_ISOLATED**.
- ENTRY_FAILURE_STAGE = NO DETERMINISTIC FAILURE IDENTIFIED.
- ENTRY_EDGE_REMAINING_PROBLEM = YES.
