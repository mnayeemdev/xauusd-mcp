# V17_MINIMUM_LOT

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Rule
If the rounded size is below volume_min (0.01), the minimum lot would exceed the permitted risk → RISK_REJECTED_MINIMUM_LOT. The size is never rounded up, and the risk, SL and entry are never changed. VALID_ENTRY is kept.

## Share of valid entries rejected for the minimum lot (static, NORMAL, ENVELOPE basis)
| Split | Equity (USD) | 0.10 % | 0.25 % | 0.50 % | 1.00 % |
|---|---|---|---|---|---|
| DEV | 250 | 100.00 % | 100.00 % | 100.00 % | 98.60 % |
| DEV | 1000 | 100.00 % | 98.60 % | 86.33 % | 42.55 % |
| DEV | 10000 | 42.55 % | 2.84 % | 0.16 % | 0.00 % |
| HOLD | 250 | 100.00 % | 100.00 % | 100.00 % | 99.92 % |
| HOLD | 1000 | 100.00 % | 99.92 % | 93.77 % | 63.92 % |
| HOLD | 10000 | 63.92 % | 14.21 % | 1.98 % | 0.37 % |

## Risk the minimum lot would have taken, when rejected (% of equity)
| Split | Equity | Risk % | Min-lot risk of rejected entries (% of equity) |
|---|---|---|---|
| DEV | 250 | 0.50 % | n 4858; mean 4.1752; p50 3.5924; p90 7.1744; p99 13.006; max 28.33 |
| DEV | 1000 | 0.50 % | n 4194; mean 1.1489; p50 0.9895; p90 1.8671; p99 3.301; max 7.0825 |
| HOLD | 250 | 0.50 % | n 6553; mean 6.3558; p50 5.0324; p90 11.4344; p99 28.2104; max 90.28 |
| HOLD | 1000 | 0.50 % | n 6145; mean 1.6683; p50 1.33; p90 2.9245; p99 7.2415; max 22.57 |

**Reading:** at small equity almost every valid entry is rejected rather than over-risked. This is the V10 finding, unchanged: the 0.01-lot minimum needs several thousand USD for a 0.25–0.50 % risk.
