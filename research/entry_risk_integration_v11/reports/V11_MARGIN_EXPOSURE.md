# V11_MARGIN_EXPOSURE

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Margin (cap 50 % of equity; margin level after the worst-case loss ≥ 60 + 40 %)
| Split | Account | Model | Max margin | Mean margin |
|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | 2.7 % | 1.9 % |
| DEV | 1000 | PCT 0.10 % | 0.0 % | — |
| DEV | 1000 | PCT 0.25 % | 2.3 % | 1.8 % |
| DEV | 1000 | PCT 0.50 % | 4.7 % | 2.2 % |
| DEV | 1000 | PCT 1.00 % | 9.3 % | 3.5 % |
| DEV | 5000 | CURRENT 0.01 lot | 0.5 % | 0.4 % |
| DEV | 5000 | PCT 0.10 % | 0.9 % | 0.4 % |
| DEV | 5000 | PCT 0.25 % | 2.6 % | 0.8 % |
| DEV | 5000 | PCT 0.50 % | 5.0 % | 1.5 % |
| DEV | 5000 | PCT 1.00 % | 10.0 % | 3.0 % |
| DEV | 10000 | CURRENT 0.01 lot | 0.2 % | 0.2 % |
| DEV | 10000 | PCT 0.10 % | 0.9 % | 0.3 % |
| DEV | 10000 | PCT 0.25 % | 2.5 % | 0.7 % |
| DEV | 10000 | PCT 0.50 % | 5.0 % | 1.5 % |
| DEV | 10000 | PCT 1.00 % | 10.5 % | 3.1 % |
| HOLD | 1000 | CURRENT 0.01 lot | 3.8 % | 2.4 % |
| HOLD | 1000 | PCT 0.10 % | 0.0 % | — |
| HOLD | 1000 | PCT 0.25 % | 2.4 % | 2.2 % |
| HOLD | 1000 | PCT 0.50 % | 4.8 % | 2.3 % |
| HOLD | 1000 | PCT 1.00 % | 10.9 % | 3.2 % |
| HOLD | 5000 | CURRENT 0.01 lot | 0.6 % | 0.5 % |
| HOLD | 5000 | PCT 0.10 % | 0.9 % | 0.4 % |
| HOLD | 5000 | PCT 0.25 % | 2.5 % | 0.7 % |
| HOLD | 5000 | PCT 0.50 % | 5.3 % | 1.3 % |
| HOLD | 5000 | PCT 1.00 % | 11.1 % | 2.5 % |
| HOLD | 10000 | CURRENT 0.01 lot | 0.3 % | 0.2 % |
| HOLD | 10000 | PCT 0.10 % | 1.1 % | 0.3 % |
| HOLD | 10000 | PCT 0.25 % | 2.7 % | 0.6 % |
| HOLD | 10000 | PCT 0.50 % | 5.6 % | 1.3 % |
| HOLD | 10000 | PCT 1.00 % | 11.4 % | 2.6 % |

Margin never binds in the clean replay; risk, not margin, limits size. Margin availability is never risk permission.

## Margin fault injection
- **Corrected harness** (leverage set so the minimum-lot margin = 2 × cap): 13 injected, 12 closed MARGIN_ABOVE_CAP, 1 closed upstream, 0 accepted.
- **Pre-registered harness** (leverage 1:1): 13 injected, 2 accepted. Those accepted trades did satisfy the margin rule:
| Entry | Lots | Leverage | Margin | Cap | Level after worst-case loss | Rule satisfied |
|---|---|---|---|---|---|---|
| 81370|BUY | 0.01 | 1 | 40.3 % | 50 % | 247.43 % | yes |
| 93876|SELL | 0.01 | 1 | 42.8 % | 50 % | 232.83 % | yes |

## Exposure (MAX_SIMULTANEOUS_TRADES = 1)
| Split | Account | Model | Exposure-blocked | of which POSITION_OPEN | STALE_SAME_SETUP | REVENGE_GUARD |
|---|---|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | 3725 | 3356 | 332 | 37 |
| DEV | 1000 | PCT 0.50 % | 1143 | 758 | 359 | 26 |
| DEV | 10000 | CURRENT 0.01 lot | 3725 | 3356 | 332 | 37 |
| DEV | 10000 | PCT 0.50 % | 3711 | 3333 | 341 | 37 |
| HOLD | 1000 | CURRENT 0.01 lot | 5043 | 4483 | 501 | 59 |
| HOLD | 1000 | PCT 0.50 % | 1032 | 584 | 419 | 29 |
| HOLD | 10000 | CURRENT 0.01 lot | 5043 | 4483 | 501 | 59 |
| HOLD | 10000 | PCT 0.50 % | 4924 | 4316 | 546 | 62 |

- **Not traded:** exposure-blocked valid entries are recorded and never queued, added or averaged.
- **Total planned exposure:** at any time it is at most one position's planned risk.
