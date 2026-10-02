# V16_ENTRY_PRICE

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Rule
- **Side price:** BUY executes at the current ASK, SELL at the current BID. Never the mid, never the old signal price (grid: SELL side price 4135, BUY side price 4176.91 after a 0.15 USD move).
- **Location re-check:** the location is re-checked at that price with the existing rules only. No threshold was changed or created.

## Execution band of every forward-live V8 signal (existing rules, original structural SL)
The band is the side-price interval in which all of these hold: SL side, engine minimum risk, overextension, production drift and RR ≥ 1.70 to the engine objective. It is descriptive only.

| Bar close (UTC) | Side | Model | SL source | Band (USD) | Width | Side price if unchanged | Inside | Room toward SL | Room away |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00:00.000Z | BUY | BO | candidate_anchor | 4180.69 – 4183.357 | 2.667 | 4182.93 | YES | 2.24 | 0.427 |
| 2026-10-01T12:05:00.000Z | BUY | BO | candidate_anchor | 4180.118 – 4181.882 | 1.763 | 4180.87 | YES | 0.752 | 1.012 |
| 2026-10-01T12:35:00.000Z | BUY | BO | candidate_anchor | 4181.7 – 4185.7 | 4 | 4183.94 | YES | 2.24 | 1.76 |
| 2026-10-01T13:20:00.000Z | SELL | BO | candidate_anchor+min_risk | 4173.229 – 4174.318 | 1.089 | 4174.32 | NO | -0.002 | 1.091 |
| 2026-10-01T13:25:00.000Z | SELL | BO | candidate_anchor | 4169.06 – 4173.06 | 4 | 4171.06 | YES | 2 | 2 |
| 2026-10-01T13:55:00.000Z | SELL | BO | candidate_anchor | 4162.312 – 4164.635 | 2.323 | 4163.82 | YES | 0.815 | 1.508 |
| 2026-10-01T14:00:00.000Z | SELL | BO | candidate_anchor+min_risk | 4163.96 – 4165.092 | 1.132 | 4165.09 | YES | 0.002 | 1.13 |
| 2026-10-01T15:30:00.000Z | BUY | MR | candidate_anchor | 4164.5 – 4167.045 | 2.545 | 4166.74 | YES | 2.24 | 0.305 |
| 2026-10-01T17:45:00.000Z | BUY | BO | candidate_anchor | 4175.933 – 4177.694 | 1.762 | 4177.06 | YES | 1.127 | 0.634 |
| 2026-10-01T17:50:00.000Z | BUY | BO | candidate_anchor | 4175.882 – 4177.72 | 1.838 | 4177.54 | YES | 1.658 | 0.18 |
| 2026-10-02T13:25:00.000Z | BUY | BO | candidate_anchor | 4188.49 – 4192.49 | 4 | 4190.73 | YES | 2.24 | 1.76 |
| 2026-10-02T15:45:00.000Z | SELL | BO | candidate_anchor | 4133.184 – 4136.85 | 3.666 | 4134.85 | YES | 2 | 1.666 |
| 2026-10-02T15:50:00.000Z | SELL | BO | candidate_anchor | 4133.713 – 4137.32 | 3.607 | 4135.32 | YES | 2 | 1.607 |
| 2026-10-02T16:00:00.000Z | SELL | BO | candidate_anchor | 4126.379 – 4129.13 | 2.751 | 4127.13 | YES | 2 | 0.751 |
| 2026-10-02T16:05:00.000Z | SELL | BO | candidate_anchor+min_risk | 4129.463 – 4129.943 | 0.48 | 4129.94 | YES | 0.003 | 0.477 |
| 2026-10-02T17:20:00.000Z | SELL | PB | candidate_anchor | 4137.51 – 4139.84 | 2.33 | 4137.84 | YES | 2 | 0.33 |

- **Band width:** n 16; min 0.48; p50 2.545; p90 4; max 4 USD.
- **Unchanged market inside the band:** 15 / 16. The one case outside is a min-risk stop within the rounding of the recorded ATR.
- **Min-risk stops are tight.** Stops set by the engine's 0.5 ATR minimum (`+min_risk`) leave almost no room toward the SL: any adverse tick invalidates them, by the engine's own rule.

## Real tick movement context (V15 read-only capture, one 3-minute window)
| Lag | |Δbid| (USD) |
|---|---|
| 1 s | n 683; min 0; p50 0.186; p90 0.552; max 1.133 |
| 2 s | n 679; min 0; p50 0.27; p90 0.755; max 1.467 |
| 3 s | n 675; min 0.005; p50 0.305; p90 0.901; max 1.642 |
| 4 s | n 671; min 0.002; p50 0.327; p90 1.062; max 1.606 |
| 5 s | n 667; min 0; p50 0.38; p90 1.112; max 2.114 |
| 6 s | n 664; min 0; p50 0.387; p90 1.123; max 2.393 |

- **Reading:** over 1–6 s the price usually moves less than the median band width. Narrow min-risk bands can still be left within a second.
- **This is context, not a probability model and not a filter.**
