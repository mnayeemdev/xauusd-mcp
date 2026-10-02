# V17_SWAP

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Broker rates (live read-only capture)
- **Long:** -0.5132 USD per oz per charged night (−513.2 points × 0.001).
- **Short:** 0 (no swap on SELL positions).
- **Triple:** on day 3 (Wednesday).
- **Calendar:** Saturday and Sunday rollovers are not charged.

## Categories (0.50 %, NORMAL, ENVELOPE walk; cost USD; share of the actual stop risk)
| Split | Rule | Category | Trades | BUY | Swap cost (USD) | Swap / stop risk |
|---|---|---|---|---|---|---|
| DEV | 00:00 broker time (primary) | INTRADAY | 643 | 342 | n 643; mean 0; p50 0; p90 0; p99 0; max 0 | n 643; mean 0; p50 0; p90 0; p99 0; max 0 |
| DEV | 00:00 broker time (primary) | OVERNIGHT | 31 | 18 | n 31; mean 0.5463; p50 0; p90 2.0528; p99 2.566; max 2.566 | n 31; mean 0.0127; p50 0; p90 0.0446; p99 0.0548; max 0.0548 |
| DEV | 00:00 broker time (primary) | TRIPLE_ROLLOVER | 2 | 1 | n 2; mean 2.3094; p50 4.6188; p90 4.6188; p99 4.6188; max 4.6188 | n 2; mean 0.0564; p50 0.1128; p90 0.1128; p99 0.1128; max 0.1128 |
| DEV | daily break (sensitivity) | INTRADAY | 651 | 350 | n 651; mean 0.011; p50 0; p90 0; p99 0; max 2.0528 | n 651; mean 0.0003; p50 0; p90 0; p99 0; max 0.048 |
| DEV | daily break (sensitivity) | OVERNIGHT | 23 | 10 | n 23; mean 0.4239; p50 0; p90 1.5396; p99 2.566; max 2.566 | n 23; mean 0.0098; p50 0; p90 0.0375; p99 0.0548; max 0.0548 |
| DEV | daily break (sensitivity) | TRIPLE_ROLLOVER | 2 | 1 | n 2; mean 2.3094; p50 4.6188; p90 4.6188; p99 4.6188; max 4.6188 | n 2; mean 0.0564; p50 0.1128; p90 0.1128; p99 0.1128; max 0.1128 |
| HOLD | 00:00 broker time (primary) | INTRADAY | 768 | 327 | n 768; mean 0; p50 0; p90 0; p99 0; max 0 | n 768; mean 0; p50 0; p90 0; p99 0; max 0 |
| HOLD | 00:00 broker time (primary) | OVERNIGHT | 24 | 9 | n 24; mean 0.5132; p50 0; p90 1.5396; p99 4.1056; max 4.1056 | n 24; mean 0.012; p50 0; p90 0.0388; p99 0.0839; max 0.0839 |
| HOLD | 00:00 broker time (primary) | TRIPLE_ROLLOVER | 3 | 1 | n 3; mean 1.0264; p50 0; p90 3.0792; p99 3.0792; max 3.0792 | n 3; mean 0.0317; p50 0; p90 0.0951; p99 0.0951; max 0.0951 |
| HOLD | daily break (sensitivity) | INTRADAY | 768 | 327 | n 768; mean 0.0047; p50 0; p90 0; p99 0; max 2.0528 | n 768; mean 0.0001; p50 0; p90 0; p99 0; max 0.0499 |
| HOLD | daily break (sensitivity) | OVERNIGHT | 23 | 9 | n 23; mean 0.3793; p50 0; p90 1.0264; p99 4.1056; max 4.1056 | n 23; mean 0.0086; p50 0; p90 0.0235; p99 0.0839; max 0.0839 |
| HOLD | daily break (sensitivity) | TRIPLE_ROLLOVER | 4 | 1 | n 4; mean 0.7698; p50 0; p90 3.0792; p99 3.0792; max 3.0792 | n 4; mean 0.0238; p50 0; p90 0.0951; p99 0.0951; max 0.0951 |

## Exceedance
| Split | SWAP_EXCEEDANCE, PLANNED basis | SWAP_EXCEEDANCE, ENVELOPE basis | Envelope nights (DEV-frozen) | Maximum charged nights in the horizon (this split) |
|---|---|---|---|---|
| DEV | 1 | 0 | 5 | 5 |
| HOLD | 1 | 0 | 5 | 5 |

**Reading:**
- **Swap is small, but not zero:** overnight BUYs pay up to about 5–8 % of the stop risk; a triple night up to about 11 %.
- **Sized on the planned stop only,** one loser per split exceeds its planned risk because of swap.
- **The deterministic fix needs no prohibition.** The swap is known from the broker data and the calendar, so the envelope includes it (DEV-frozen maximum of 5 charged nights, CORRECTION_LOG D1). Swap exceedance is then 0.
- **No overnight prohibition is created.**
