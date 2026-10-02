# V17_MARGIN

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Rule (existing)
- **Required margin** = lots × contract × price / leverage. Margin availability is never permission to raise risk.
- **MARGIN_REJECTED** in any of these cases:
  - required > available margin (equity − used margin; used = 0 because at most one position is open);
  - required > 50 % of equity;
  - margin level after the planned loss < margin call 60 % + 40 points.

## Validation against MT5's own calculation (live, read-only)
| Lots | Formula (USD) | MT5 order_calc_margin | |diff| |
|---|---|---|---|
| 0.01 | 20.7 | 20.7 | 0.0005 |
| 0.1 | 207 | 207 | 0.0046 |
| 1 | 2070.05 | 2070.05 | 0.004 |

## Replay (10,000 USD, NORMAL, ENVELOPE)
| Split | Risk % | Margin required (USD) | Margin / equity |
|---|---|---|---|
| DEV | 0.10 % | n 625; mean 24.443; p50 20.04; p90 39.72; p99 72.37; max 84.74 | n 625; mean 0.0025; p50 0.002; p90 0.004; p99 0.0072; max 0.0086 |
| DEV | 0.25 % | n 687; mean 55.0837; p50 48.4; p90 99.31; p99 192.82; max 231.21 | n 687; mean 0.0055; p50 0.0048; p90 0.0098; p99 0.0194; max 0.023 |
| DEV | 0.50 % | n 676; mean 116.5576; p50 101.07; p90 199.34; p99 389.71; max 483.43 | n 676; mean 0.0116; p50 0.0102; p90 0.0192; p99 0.039; max 0.0485 |
| DEV | 1.00 % | n 675; mean 246.5106; p50 215.02; p90 416.34; p99 796.09; max 966.86 | n 675; mean 0.0241; p50 0.021; p90 0.0399; p99 0.0786; max 0.0969 |
| HOLD | 0.10 % | n 662; mean 26.9682; p50 23; p90 44.4; p99 71.38; max 91.82 | n 662; mean 0.0027; p50 0.0023; p90 0.0045; p99 0.0071; max 0.0092 |
| HOLD | 0.25 % | n 806; mean 53.4026; p50 44.95; p90 94.37; p99 181.1; max 215.57 | n 806; mean 0.0054; p50 0.0045; p90 0.0094; p99 0.0182; max 0.0217 |
| HOLD | 0.50 % | n 795; mean 105.1053; p50 87.81; p90 199.62; p99 376.79; max 492.39 | n 795; mean 0.0108; p50 0.0091; p90 0.0204; p99 0.0384; max 0.0509 |
| HOLD | 1.00 % | n 794; mean 222.4945; p50 188.55; p90 419.87; p99 772.6; max 984.78 | n 794; mean 0.0225; p50 0.0189; p90 0.0419; p99 0.0764; max 0.1018 |

**Reading:**
- **Not binding at 10,000 USD:** at most about 10 % of equity at 1 %.
- **Tests:** leverage 1 and leverage 5 are rejected (insufficient / above cap / level after loss).
