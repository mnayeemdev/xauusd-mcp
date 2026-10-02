# V17_DEVELOPMENT_RESULTS

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## DEV (2025-05-07 → 2025-12-31): frozen before HOLDOUT
| Frozen item | Value |
|---|---|
| SEVERE slippage | 9.608 USD/oz (DEV maximum in-session 5m discontinuity (2025-11-28T08:10:00.000Z)) |
| daily-break gap levels | normal_p50: 1.535; moderate_p90: 4.85; severe_p99: 9.017; historical_max: 15.752; n: 135 |
| closure gap levels | normal_p50: 4.064; moderate_p90: 13.693; severe_p99: 44.567; historical_max: 44.567; n: 35 |
| in-session discontinuity | normal_p50: 0.035; moderate_p90: 0.075; severe_p99: 0.116; historical_max: 9.608; n: 46421 |
| envelope swap nights | 5 |
| swap | ok: true; long: -0.5132000000000001; short: 0; rollover3days: 3; mode: POINTS |
| freeze sha256 | 4bb8c9114e1818ff67be64f68358330e3b74f5d4cc8b51adf3e6a242fd43852c |

## DEV results (0.50 %, ENVELOPE)
| Scenario | Accepted | Decision | Risk multiplier (losers) | Gap events |
|---|---|---|---|---|
| NORMAL | 676 | 362/364 losers within planned; GAP_EXCEEDANCE 2 | n 364; mean 0.7399; p50 0.7122; p90 1; p99 1; max 1.4957 | 2 |
| MODERATE | 654 | 284/367 losers within planned; SLIPPAGE_EXCEEDANCE 83 | n 367; mean 0.7754; p50 0.7405; p90 1.0379; p99 1.0734; max 1.5008 | 2 |
| SEVERE | 339 | 77/320 losers within planned; SLIPPAGE_EXCEEDANCE 243 | n 320; mean 1.7173; p50 1.7202; p90 2.979; p99 4.2534; max 4.5879 | 0 |
