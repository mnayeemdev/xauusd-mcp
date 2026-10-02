# V17_SLIPPAGE

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Scenarios (frozen before HOLDOUT)
| Scenario | Spread | Exit slippage (USD/oz) | Source |
|---|---|---|---|
| NORMAL | 0.24 | 0.1 | V5/V9/V10 normal; production CAPITAL_DEFAULTS |
| MODERATE | 0.6 | 0.3 | production maxSpreadUsd; V12 moderate slippage level |
| SEVERE | 0.6 | 9.608 | DEV maximum in-session 5m discontinuity (2025-11-28T08:10:00.000Z) |

## Evidence
- **Real account:** two real fills, both 0 (state/xauusd_mt5_real_trade_log.jsonl). Stop fills: none (no real stop-out fill recorded).
- **In-session 5m discontinuities** (|open − previous close|, consecutive bars):
| Split | p50 | p90 | p99 | max (at) | above the frozen SEVERE |
|---|---|---|---|---|---|
| DEV | 0.035 | 0.075 | 0.116 | 9.608 (2025-11-28T08:10:00.000Z) | 1 |
| HOLD | 0.064 | 0.273 | 0.401 | 14.966 (2026-01-28T23:40:00.000Z) | 3 |

## Effect (0.50 %, ENVELOPE)
| Split | Scenario | Decision | Risk multiplier (losers) |
|---|---|---|---|
| DEV | NORMAL | 362/364 losers within planned; GAP_EXCEEDANCE 2 | n 364; mean 0.7399; p50 0.7122; p90 1; p99 1; max 1.4957 |
| DEV | MODERATE | 284/367 losers within planned; SLIPPAGE_EXCEEDANCE 83 | n 367; mean 0.7754; p50 0.7405; p90 1.0379; p99 1.0734; max 1.5008 |
| DEV | SEVERE | 77/320 losers within planned; SLIPPAGE_EXCEEDANCE 243 | n 320; mean 1.7173; p50 1.7202; p90 2.979; p99 4.2534; max 4.5879 |
| HOLD | NORMAL | 439/440 losers within planned; GAP_EXCEEDANCE 1 | n 440; mean 0.7981; p50 0.7613; p90 1; p99 1; max 6.6025 |
| HOLD | MODERATE | 327/438 losers within planned; SLIPPAGE_EXCEEDANCE 111 | n 438; mean 0.8247; p50 0.7818; p90 1.0303; p99 1.063; max 6.2979 |
| HOLD | SEVERE | 102/400 losers within planned; SLIPPAGE_EXCEEDANCE 298 | n 400; mean 1.5272; p50 1.5369; p90 2.6918; p99 3.8856; max 4.3071 |

**Reading:**
- **NORMAL:** slippage stays inside the 0.10 allowance.
- **MODERATE** (0.30) exceeds it by about 4–7 %.
- **SEVERE** (the DEV maximum jump on every exit) is an upper-bound stress; the multipliers reach about 4–4.6.
- **HOLDOUT** shows larger in-session jumps than DEV (p99 0.40 vs 0.12; max 14.97 > the frozen 9.61): 2026 is more volatile.
- **SLIPPAGE_RISK = UNRESOLVED:** there is no stop-fill evidence, so the allowance is an assumption.
