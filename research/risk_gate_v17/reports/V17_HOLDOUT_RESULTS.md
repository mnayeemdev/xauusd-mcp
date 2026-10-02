# V17_HOLDOUT_RESULTS

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## HOLDOUT (2026-01-01 → 2026-09-29): run once with the DEV freeze; nothing tuned
| Scenario | Accepted | Decision | Risk multiplier (losers) | Gap events |
|---|---|---|---|---|
| NORMAL | 795 | 439/440 losers within planned; GAP_EXCEEDANCE 1 | n 440; mean 0.7981; p50 0.7613; p90 1; p99 1; max 6.6025 | 1 |
| MODERATE | 791 | 327/438 losers within planned; SLIPPAGE_EXCEEDANCE 111 | n 438; mean 0.8247; p50 0.7818; p90 1.0303; p99 1.063; max 6.2979 | 1 |
| SEVERE | 475 | 102/400 losers within planned; SLIPPAGE_EXCEEDANCE 298 | n 400; mean 1.5272; p50 1.5369; p90 2.6918; p99 3.8856; max 4.3071 | 1 |

## Out-of-sample checks against the DEV freeze
| Item | DEV | HOLDOUT |
|---|---|---|
| in-session discontinuity p99 / max | 0.116 / 9.608 | 0.401 / 14.966 (3 above the frozen SEVERE) |
| closure gap max | 44.567 | 98.025 |
| daily-break gap max | 15.752 | 34.235 |
| worst realized multiplier (NORMAL) | 1.4957 | 6.6025 |
| swap exceedance, envelope basis | 0 | 0 |

**Reading:**
- **The gate's integrity holds out-of-sample:** no over-risk after rounding, RR 1.70, PRIMARY never accepted, replay parity.
- **The tail evidence moves the wrong way:** larger in-session jumps and a 6.6× weekend-gap loss. That is exactly why GAP_RISK and SLIPPAGE_RISK stay UNRESOLVED.
