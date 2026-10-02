# V17_GAP_RISK

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Reopen gaps (|open − previous close|, USD/oz)
| Split | Type | Normal (p50) | Moderate (p90) | Severe (p99) | Historical max | n |
|---|---|---|---|---|---|---|
| DEV | DAILY_BREAK | 1.535 | 4.85 | 9.017 | 15.752 | 135 |
| DEV | CLOSURE | 4.064 | 13.693 | 44.567 | 44.567 | 35 |
| HOLD | DAILY_BREAK | 2.545 | 12.054 | 30.631 | 34.235 | 153 |
| HOLD | CLOSURE | 15.595 | 58.015 | 98.025 | 98.025 | 40 |

## Realized gap-through in the chronological replay (NORMAL, 0.50 %, ENVELOPE)
| Split | Events | Kind | Gap impact (USD) | Risk multiplier | Worst trade |
|---|---|---|---|---|---|
| DEV | 2 | CLOSURE: 2 | n 2; mean 17.4785; p50 24.713; p90 24.713; p99 24.713; max 24.713 | n 2; mean 1.3494; p50 1.4957; p90 1.4957; p99 1.4957; max 1.4957 | 42448|SELL SELL BO: planned 49.85 USD → realized 74.57 USD (1.50×) |
| HOLD | 1 | CLOSURE: 1 | n 1; mean 251.216; p50 251.216; p90 251.216; p99 251.216; max 251.216 | n 1; mean 6.6025; p50 6.6025; p90 6.6025; p99 6.6025; max 6.6025 | 74604|SELL SELL BO: planned 44.84 USD → realized 296.06 USD (6.60×) |

## Exposure counterfactual
Positions open over a reopen, with an adverse gap at each DEV level. The table shows the extra loss as a multiple of the stop risk.

| Split | Type | Positions | Gap level | Share through the stop | Extra multiple |
|---|---|---|---|---|---|
| DEV | DAILY_BREAK | 20 | normal_p50 | 0.00 % | n 20; mean 0; p50 0; p90 0; p99 0; max 0 |
| DEV | DAILY_BREAK | 20 | moderate_p90 | 5.00 % | n 20; mean 0.0096; p50 0; p90 0; p99 0.192; max 0.192 |
| DEV | DAILY_BREAK | 20 | severe_p99 | 25.00 % | n 20; mean 0.0773; p50 0; p90 0.2439; p99 0.8325; max 0.8325 |
| DEV | DAILY_BREAK | 20 | historical_max | 85.00 % | n 20; mean 0.3604; p50 0.1905; p90 0.9051; p99 1.8677; max 1.8677 |
| DEV | CLOSURE | 5 | normal_p50 | 40.00 % | n 5; mean 0.2538; p50 0; p90 0.7314; p99 0.7314; max 0.7314 |
| DEV | CLOSURE | 5 | moderate_p90 | 40.00 % | n 5; mean 1.2523; p50 0; p90 3.2131; p99 3.2131; max 3.2131 |
| DEV | CLOSURE | 5 | severe_p99 | 100.00 % | n 5; mean 4.8806; p50 1.4063; p90 11.1704; p99 11.1704; max 11.1704 |
| DEV | CLOSURE | 5 | historical_max | 100.00 % | n 5; mean 4.8806; p50 1.4063; p90 11.1704; p99 11.1704; max 11.1704 |
| HOLD | DAILY_BREAK | 19 | normal_p50 | 0.00 % | n 19; mean 0; p50 0; p90 0; p99 0; max 0 |
| HOLD | DAILY_BREAK | 19 | moderate_p90 | 5.26 % | n 19; mean 0.051; p50 0; p90 0; p99 0.9682; max 0.9682 |
| HOLD | DAILY_BREAK | 19 | severe_p99 | 21.05 % | n 19; mean 0.2226; p50 0; p90 0.6549; p99 2.8885; max 2.8885 |
| HOLD | DAILY_BREAK | 19 | historical_max | 26.32 % | n 19; mean 0.5379; p50 0; p90 1.9807; p99 5.9922; max 5.9922 |
| HOLD | CLOSURE | 8 | normal_p50 | 12.50 % | n 8; mean 0.0174; p50 0; p90 0.1391; p99 0.1391; max 0.1391 |
| HOLD | CLOSURE | 8 | moderate_p90 | 62.50 % | n 8; mean 0.563; p50 0.4451; p90 1.7135; p99 1.7135; max 1.7135 |
| HOLD | CLOSURE | 8 | severe_p99 | 100.00 % | n 8; mean 3.1118; p50 3.1581; p90 6.8756; p99 6.8756; max 6.8756 |
| HOLD | CLOSURE | 8 | historical_max | 100.00 % | n 8; mean 3.1118; p50 3.1581; p90 6.8756; p99 6.8756; max 6.8756 |

## Pre-trade condition GC1 (informational only)
- **The candidate:** "a closure is reachable within the 288-bar horizon → reject".
- **What it would flag:** 20.56 % (DEV) / 21.14 % (HOLD) of valid entries.
- **What it would remove:** the realized closure-gap exceedances (2 DEV, 1 HOLD).
- **Why it is not adopted:**
  - production has no maximum holding time, so the 288-bar horizon is not a real guarantee, and GC1 cannot bound live exposure without a new exit rule (forbidden);
  - daily-break gaps can also pass through stops (counterfactual above).

## GAP_RISK = UNRESOLVED
- **Stop execution ≠ market gap through the stop.** The stop does not guarantee the planned loss: the worst realized HOLDOUT case lost 6.60× its planned risk across a weekend reopen.
- **No multiplier is invented,** and the tail is not converted into a production percentage.
