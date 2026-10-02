# V17_POSITION_SIZING

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Pipeline (owner §4)
CURRENT EQUITY → APPROVED RESEARCH RISK % → MAX CASH RISK → EXECUTION PRICE (BUY ask / SELL bid) → STRUCTURAL SL → POSITION SIZE (rounded down) → BROKER ROUNDING → ACTUAL STOP EXPOSURE (recalculated).

## Worked example (DEV trade 42448|SELL, NORMAL, 0.50 %)
| Step | Value |
|---|---|
| equity × 0.50 % = planned risk amount | 50.67 USD |
| execution price (SELL bid) | 4197.03 |
| structural SL (V8, unchanged) | 4199.36 |
| exposure per oz = 1.5 × |entry − SL| + spread + 0.10 | 3.83 |
| raw size → rounded DOWN | 0.13 lot |
| actual stop exposure after rounding | 49.85 USD (≤ planned) |
| hard broker stop | 4200.765 |
| margin required | 272.81 USD |

## Decisions in the chronological walk (10,000 USD, ENVELOPE basis, NORMAL)
| Split | Risk % | Decisions |
|---|---|---|
| DEV | 0.10 % | RISK_ACCEPTED: 625; RISK_REJECTED_EXPOSURE: 1179; WAIT_SAFETY_BREAKER: 2307; RISK_REJECTED_MINIMUM_LOT: 747 |
| DEV | 0.25 % | RISK_ACCEPTED: 687; RISK_REJECTED_EXPOSURE: 1874; WAIT_SAFETY_BREAKER: 2261; RISK_REJECTED_MINIMUM_LOT: 36 |
| DEV | 0.50 % | RISK_ACCEPTED: 676; RISK_REJECTED_EXPOSURE: 1990; WAIT_SAFETY_BREAKER: 2190; RISK_REJECTED_MINIMUM_LOT: 2 |
| DEV | 1.00 % | RISK_ACCEPTED: 675; RISK_REJECTED_EXPOSURE: 2001; WAIT_SAFETY_BREAKER: 2182 |
| HOLD | 0.10 % | RISK_REJECTED_MINIMUM_LOT: 2161; RISK_ACCEPTED: 662; RISK_REJECTED_EXPOSURE: 824; WAIT_SAFETY_BREAKER: 2906 |
| HOLD | 0.25 % | RISK_ACCEPTED: 806; RISK_REJECTED_EXPOSURE: 1805; WAIT_SAFETY_BREAKER: 3638; RISK_REJECTED_MINIMUM_LOT: 304 |
| HOLD | 0.50 % | RISK_ACCEPTED: 795; RISK_REJECTED_EXPOSURE: 2206; WAIT_SAFETY_BREAKER: 3497; RISK_REJECTED_MINIMUM_LOT: 55 |
| HOLD | 1.00 % | RISK_ACCEPTED: 794; RISK_REJECTED_EXPOSURE: 2264; WAIT_SAFETY_BREAKER: 3490; RISK_REJECTED_MINIMUM_LOT: 5 |

- **Determinism:** the same inputs give the same size (tested). Every accepted size is re-checked after rounding.
- **Invariants over all walks:** 0 over-risk after rounding; 0 RR violations.
- **PRIMARY** (risk % unresolved): DEV RISK_PERCENTAGE_UNRESOLVED: 4858; HOLD RISK_PERCENTAGE_UNRESOLVED: 6553.
