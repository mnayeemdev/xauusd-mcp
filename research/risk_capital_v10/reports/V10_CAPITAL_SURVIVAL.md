# V10_CAPITAL_SURVIVAL

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Loss-streak survival (mathematics only)
| Risk % | 5 losses | 10 losses | 15 losses | 20 losses | 20 losses (×1.25 severe) | Equity left after 20 |
|---|---|---|---|---|---|---|
| 0.10 % | 0.50 % | 1.00 % | 1.49 % | 1.98 % | 2.47 % | 98.0 % |
| 0.25 % | 1.24 % | 2.47 % | 3.69 % | 4.88 % | 6.07 % | 95.1 % |
| 0.50 % | 2.48 % | 4.89 % | 7.24 % | 9.54 % | 11.78 % | 90.5 % |
| 0.75 % | 3.69 % | 7.25 % | 10.68 % | 13.98 % | 17.17 % | 86.0 % |
| 1.00 % | 4.90 % | 9.56 % | 13.99 % | 18.21 % | 22.24 % | 81.8 % |

Fixed-fraction sizing cannot reach zero from losses alone: each loss is r × the current equity. A minimum-lot rejection stops trading before the risk % would be exceeded.

## Fixed 0.01 lot (CURRENT): survival depends on the account
| Account | Median risk / trade (DEV) | Equity after 20 median losses | Losses to zero at the median loss |
|---|---|---|---|
| 100 | 7.46 % | 0.00 | 13 |
| 250 | 2.99 % | 100.70 | 33 |
| 500 | 1.49 % | 350.70 | 66 |
| 1000 | 0.75 % | 850.70 | 133 |
| 5000 | 0.15 % | 4850.70 | 669 |
| 10000 | 0.07 % | 9850.70 | 1338 |

## Survival in the chronological replays (minimum equity reached; RUIN = equity ≤ 0)
| Split | Account | CURRENT N / M / S | 0.25 % N / M / S | 0.50 % N / M / S | 1.00 % N / M / S |
|---|---|---|---|---|---|
| DEV | 100 | 55.16 / 64.22 / 60.72 | 100.00 / 100.00 / 100.00 | 100.00 / 100.00 / 100.00 | 100.00 / 100.00 / 100.00 |
| DEV | 250 | 69.68 / 63.67 / 54.63 | 250.00 / 250.00 / 250.00 | 250.00 / 250.00 / 250.00 | 223.85 / 208.71 / 225.29 |
| DEV | 500 | 299.19 / 68.40 / 61.21 | 500.00 / 500.00 / 500.00 | 460.17 / 455.68 / 461.08 | 325.16 / 300.23 / 253.73 |
| DEV | 1000 | 799.19 / 394.89 / 69.12 | 960.38 / 937.95 / 948.80 | 772.31 / 702.18 / 610.82 | 515.15 / 382.61 / 310.59 |
| DEV | 5000 | 4799.19 / 4394.89 / 3580.02 | 4087.86 / 3556.23 / 2870.84 | 3843.59 / 2897.96 / 1622.25 | 2713.88 / 1582.31 / 592.89 |
| DEV | 10000 | 9799.19 / 9394.89 / 8580.02 | 8687.15 / 7589.79 / 5981.34 | 7631.52 / 5571.74 / 3552.41 | 5352.65 / 3013.74 / 1173.23 |
| HOLD | 100 | 69.48 / 65.88 / 66.65 | 100.00 / 100.00 / 100.00 | 100.00 / 100.00 / 100.00 | 100.00 / 100.00 / 100.00 |
| HOLD | 250 | 68.08 / -49.75 RUIN / 66.78 | 250.00 / 250.00 / 250.00 | 250.00 / 250.00 / 250.00 | 245.90 / 248.00 / 250.00 |
| HOLD | 500 | 149.91 / 51.95 / 61.71 | 500.00 / 500.00 / 500.00 | 495.90 / 498.00 / 500.00 | 393.25 / 354.95 / 338.46 |
| HOLD | 1000 | 649.92 / 390.27 / 57.28 | 995.90 / 998.00 / 1000.00 | 877.18 / 803.50 / 751.08 | 711.84 / 384.76 / 373.01 |
| HOLD | 5000 | 4649.92 / 4390.27 / 3624.16 | 4268.22 / 3846.88 / 3200.22 | 4245.81 / 3367.06 / 1829.55 | 3467.01 / 2229.79 / 628.28 |
| HOLD | 10000 | 9649.91 / 9390.27 / 8624.16 | 9258.97 / 8026.04 / 6359.10 | 8392.83 / 6651.98 / 4100.94 | 7089.10 / 4793.70 / 1679.90 |

## Reading
- **Small accounts.** Capital survival for accounts < 1,000 USD requires NOT trading at the 0.01-lot minimum on most signals. Of the 18 small-account CURRENT replays (100 / 250 / 500 USD × 2 splits × 3 costs), 15 end within 1.5× of the production veto floor (≈ 72.54 USD), where the veto stops further trading. 1 ends with negative equity (HOLD, 250 USD, MODERATE). Only 1 ends at or above its start.
- **Large accounts.** At 10,000 USD the fixed 0.01 lot is a very small risk (~0.1 %), which is why CURRENT shows a small drawdown there.
