# V12_GAP_STRESS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Gap-through at broker-SL exits (every valid entry, NORMAL; the fill is at the bar open when it opens beyond the broker level)
| Split | Exit after | Broker-SL exits | With gap-through | Over 0.5 R | Max (R) |
|---|---|---|---|---|---|
| DEV | IN_SESSION | 1209 | 0 | 0 | 0.00 |
| DEV | SESSION_BREAK | 14 | 9 | 1 | 0.70 |
| DEV | CLOSURE (> 24 h) | 34 | 20 | 6 | 3.71 |
| HOLD | IN_SESSION | 1548 | 0 | 0 | 0.00 |
| HOLD | SESSION_BREAK | 26 | 7 | 2 | 1.92 |
| HOLD | CLOSURE (> 24 h) | 16 | 14 | 14 | 10.67 |

| Split | Entry could reach a market closure? | Broker-SL exits | With gap-through | Over 0.5 R | Max (R) |
|---|---|---|---|---|---|
| DEV | YES | 310 | 21 | 6 | 3.71 |
| DEV | NO | 947 | 8 | 1 | 0.70 |
| HOLD | YES | 333 | 14 | 14 | 10.67 |
| HOLD | NO | 1257 | 7 | 2 | 1.92 |

| Split | Share of broker exits with gap-through | p99 (R) | p99.5 (R) | Max (R) | Max (USD/oz) |
|---|---|---|---|---|---|
| DEV | 2.31 % | 0.27 | 0.52 | 3.71 | 8.87 |
| HOLD | 1.32 % | 0.86 | 6.96 | 10.67 | 45.64 |

## Reading
- **Gaps are deterministic in WHERE they occur.** They happen only at market reopens, never in session, and whether a position can be open across a closure is known at entry.
- **Their SIZE is not predictable from DEV.** The HOLD closure maximum (10.67 R) is ≈ 2.88× the DEV maximum. The session-break maximum is 1.92 R vs 0.70 R on DEV.
- **SEVERE deterministic stress** (0.5 R on every 10th stop-out) is far milder than the real reopen tail.
- **Gap stress materially affects risk:** it is the dominant source of realized loss above the approved risk.
