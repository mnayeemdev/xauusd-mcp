# V11_POSITION_SIZING

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Sizing (V10 library; research only; production stays LOT 0.01)
- **Formula:** lots = ⌊ equity × r ÷ ((1.5 R + spread + 0.10) × 100) ÷ 0.01 ⌋ × 0.01, capped at 200.
- **Below the minimum:** < 0.01 → RISK_REJECTED, never rounded up.
- **Actual risk:** recalculated after rounding and cross-checked through the tick value (0.1 USD per point per lot, derived as tick size × contract because the profit currency equals the account currency (USD)).

## Sizes and planned risk (NORMAL cost)
| Split | Account | Model | Accepted | Mean / max lots | Mean / max planned risk | Minimum-lot rejections | Above approved |
|---|---|---|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | 1133 | 0.01 / 0.01 | 0.86 % / 5.87 % | 0 | n/a |
| DEV | 1000 | PCT 0.10 % | 0 | — / 0.00 | — / 0.00 % | 4858 | 0 |
| DEV | 1000 | PCT 0.25 % | 128 | 0.01 / 0.01 | 0.22 % / 0.25 % | 4499 | 0 |
| DEV | 1000 | PCT 0.50 % | 586 | 0.01 / 0.02 | 0.40 % / 0.50 % | 3129 | 0 |
| DEV | 1000 | PCT 1.00 % | 958 | 0.02 / 0.05 | 0.79 % / 1.00 % | 1573 | 0 |
| DEV | 5000 | CURRENT 0.01 lot | 1133 | 0.01 / 0.01 | 0.17 % / 1.03 % | 0 | n/a |
| DEV | 5000 | PCT 0.10 % | 689 | 0.01 / 0.02 | 0.08 % / 0.10 % | 2798 | 0 |
| DEV | 5000 | PCT 0.25 % | 1155 | 0.02 / 0.06 | 0.20 % / 0.25 % | 607 | 0 |
| DEV | 5000 | PCT 0.50 % | 1150 | 0.04 / 0.13 | 0.42 % / 0.50 % | 69 | 0 |
| DEV | 5000 | PCT 1.00 % | 1149 | 0.07 / 0.28 | 0.90 % / 1.00 % | 16 | 0 |
| DEV | 10000 | CURRENT 0.01 lot | 1133 | 0.01 / 0.01 | 0.08 % / 0.51 % | 0 | n/a |
| DEV | 10000 | PCT 0.10 % | 1120 | 0.02 / 0.05 | 0.08 % / 0.10 % | 878 | 0 |
| DEV | 10000 | PCT 0.25 % | 1154 | 0.04 / 0.13 | 0.21 % / 0.25 % | 55 | 0 |
| DEV | 10000 | PCT 0.50 % | 1141 | 0.08 / 0.27 | 0.45 % / 0.50 % | 6 | 0 |
| DEV | 10000 | PCT 1.00 % | 1132 | 0.15 / 0.57 | 0.95 % / 1.00 % | 1 | 0 |
| HOLD | 1000 | CURRENT 0.01 lot | 1510 | 0.01 / 0.01 | 1.33 % / 6.34 % | 0 | n/a |
| HOLD | 1000 | PCT 0.10 % | 0 | — / 0.00 | — / 0.00 % | 6553 | 0 |
| HOLD | 1000 | PCT 0.25 % | 8 | 0.01 / 0.01 | 0.22 % / 0.24 % | 6538 | 0 |
| HOLD | 1000 | PCT 0.50 % | 511 | 0.01 / 0.02 | 0.40 % / 0.50 % | 5010 | 0 |
| HOLD | 1000 | PCT 1.00 % | 1161 | 0.01 / 0.04 | 0.78 % / 1.00 % | 2752 | 0 |
| HOLD | 5000 | CURRENT 0.01 lot | 1510 | 0.01 / 0.01 | 0.26 % / 1.05 % | 0 | n/a |
| HOLD | 5000 | PCT 0.10 % | 503 | 0.01 / 0.02 | 0.08 % / 0.10 % | 5037 | 0 |
| HOLD | 5000 | PCT 0.25 % | 1372 | 0.02 / 0.05 | 0.20 % / 0.25 % | 1933 | 0 |
| HOLD | 5000 | PCT 0.50 % | 1589 | 0.03 / 0.11 | 0.41 % / 0.50 % | 492 | 0 |
| HOLD | 5000 | PCT 1.00 % | 1541 | 0.05 / 0.22 | 0.86 % / 1.00 % | 99 | 0 |
| HOLD | 10000 | CURRENT 0.01 lot | 1510 | 0.01 / 0.01 | 0.13 % / 0.51 % | 0 | n/a |
| HOLD | 10000 | PCT 0.10 % | 1234 | 0.01 / 0.05 | 0.08 % / 0.10 % | 2514 | 0 |
| HOLD | 10000 | PCT 0.25 % | 1590 | 0.03 / 0.12 | 0.20 % / 0.25 % | 447 | 0 |
| HOLD | 10000 | PCT 0.50 % | 1541 | 0.05 / 0.24 | 0.44 % / 0.50 % | 88 | 0 |
| HOLD | 10000 | PCT 1.00 % | 1522 | 0.10 / 0.47 | 0.93 % / 1.00 % | 11 | 0 |

- **CURRENT.** Its "planned risk" is the fixed 0.01 lot's worst case expressed in % of equity (capped by the production −50 USD assumption). It is not an approved percentage, so the "above approved" check does not apply.
- **RISK_PERCENTAGE = UNRESOLVED.** No percentage is approved (V10), and none is selected here.
