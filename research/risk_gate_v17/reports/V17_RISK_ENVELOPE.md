# V17_RISK_ENVELOPE

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Definition (owner §15)
- **ENVELOPE per oz** = planned exposure (1.5 R + spread + 0.10 slippage allowance) + commission (0) + the known maximum swap within the horizon (DEV-frozen 5 charged nights × the adverse rate).
- **Sizing:** the V17 gate sizes on the ENVELOPE.
- **Gap tail:** reported separately.

## Losers within the envelope, excluding gap (NORMAL, 0.50 %)
| Split | Losers | Within the envelope (gap excluded) | Exceed (gap excluded) | Gap tail events |
|---|---|---|---|---|
| DEV | 364 | 364 | — | 2 |
| HOLD | 440 | 440 | — | 1 |

## By scenario
| Split | Scenario | Decision |
|---|---|---|
| DEV | NORMAL | 362/364 losers within planned; GAP_EXCEEDANCE 2 |
| DEV | MODERATE | 284/367 losers within planned; SLIPPAGE_EXCEEDANCE 83 |
| DEV | SEVERE | 77/320 losers within planned; SLIPPAGE_EXCEEDANCE 243 |
| HOLD | NORMAL | 439/440 losers within planned; GAP_EXCEEDANCE 1 |
| HOLD | MODERATE | 327/438 losers within planned; SLIPPAGE_EXCEEDANCE 111 |
| HOLD | SEVERE | 102/400 losers within planned; SLIPPAGE_EXCEEDANCE 298 |

**Reading:**
- **NORMAL:** every loser stays within the envelope except the gap tail.
- **MODERATE / SEVERE:** losers exceed through slippage beyond the 0.10 allowance. That is an assumption-level item (no stop-fill evidence).
- **The envelope is not a guarantee.** The gap tail is outside it by definition.
