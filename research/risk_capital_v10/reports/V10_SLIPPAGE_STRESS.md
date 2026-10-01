# V10_SLIPPAGE_STRESS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Cost levels (per oz)
- **NORMAL:** spread 0.24 + slippage 0.10.
- **MODERATE:** 0.40 + 0.30.
- **SEVERE:** 0.60 + 0.60, plus a gap. Every 10th stop-out (broker SL or thesis invalidation) in time order fills a further 0.5 × structural distance worse.
- **Planning assumption:** the worst-case loss always uses the NORMAL slippage allowance (0.10), so the stress tests how wrong the plan can be.

## Realized loss versus the planned hard-stop loss (all losing signal outcomes)
| Split | Cost | Losing outcomes | Share above plan | Share above ×1.25 | p99 ratio | Max ratio |
|---|---|---|---|---|---|---|
| DEV | normal | 2758 | 1.1 % | 0.0 % | 1.043 | 1.143 |
| DEV | moderate | 2770 | 46.1 % | 0.0 % | 1.094 | 1.186 |
| DEV | severe | 2790 | 53.7 % | 5.3 % | 1.401 | 1.485 |
| HOLD | normal | 3702 | 0.8 % | 0.0 % | 1.000 | 1.129 |
| HOLD | moderate | 3711 | 43.2 % | 0.0 % | 1.063 | 1.169 |
| HOLD | severe | 3732 | 49.6 % | 4.7 % | 1.382 | 1.424 |

### Worst NORMAL-cost overshoots
| Split | Signal | Date | Exit | SL $ | Loss $/oz | Ratio |
|---|---|---|---|---|---|---|
| DEV | 35618|BUY | 2025-10-31 | BROKER_SL | 2.39 | 4.49 | 1.143 |
| DEV | 5428|BUY | 2025-06-01 | BROKER_SL | 2.41 | 4.51 | 1.142 |
| DEV | 41072|BUY | 2025-11-28 | BROKER_SL | 2.47 | 4.61 | 1.138 |
| DEV | 41073|BUY | 2025-11-28 | BROKER_SL | 2.5 | 4.65 | 1.137 |
| DEV | 35619|BUY | 2025-10-31 | BROKER_SL | 2.56 | 4.74 | 1.134 |
| HOLD | 76827|BUY | 2026-06-03 | BROKER_SL | 2.66 | 4.89 | 1.129 |
| HOLD | 85540|BUY | 2026-07-17 | BROKER_SL | 2.8 | 5.1 | 1.123 |
| HOLD | 82017|BUY | 2026-06-30 | BROKER_SL | 4.91 | 8.27 | 1.073 |
| HOLD | 48463|BUY | 2026-01-08 | BROKER_SL | 5.11 | 8.57 | 1.070 |
| HOLD | 92146|BUY | 2026-08-20 | BROKER_SL | 6.03 | 9.95 | 1.060 |

Every NORMAL overshoot is a BUY held overnight: the bar simulator charges the broker swap (0.56 USD/oz/night), and the worst-case formula does not include it.
**A future sizing formula must add a swap allowance for BUY positions that can cross the daily rollover.**

The bar simulator fills the broker SL at its level (+ slippage). Gap-through fills beyond the stop are represented only by the SEVERE deterministic gap.

## End equity / max drawdown by cost (USD)
| Split | Account | Model | NORMAL | MODERATE | SEVERE |
|---|---|---|---|---|---|
| DEV | 250 | CURRENT | 69.68 / 81.4 % | 63.67 / 79.4 % | 54.63 / 78.6 % |
| DEV | 250 | PCT_0.001 | no trade | no trade | no trade |
| DEV | 250 | PCT_0.0025 | no trade | no trade | no trade |
| DEV | 250 | PCT_0.005 | no trade | no trade | no trade |
| DEV | 250 | PCT_0.01 | 229.52 / 13.1 % | 208.71 / 17.1 % | 225.29 / 10.8 % |
| DEV | 1000 | CURRENT | 933.26 / 28.9 % | 512.00 / 62.7 % | 69.12 / 93.1 % |
| DEV | 1000 | PCT_0.001 | no trade | no trade | no trade |
| DEV | 1000 | PCT_0.0025 | 960.38 / 4.7 % | 938.97 / 6.4 % | 948.80 / 5.4 % |
| DEV | 1000 | PCT_0.005 | 772.31 / 24.6 % | 702.18 / 30.3 % | 610.82 / 38.9 % |
| DEV | 1000 | PCT_0.01 | 524.94 / 52.0 % | 382.61 / 63.5 % | 310.59 / 69.2 % |
| DEV | 10000 | CURRENT | 9933.26 / 3.2 % | 9512.00 / 6.6 % | 8655.11 / 14.2 % |
| DEV | 10000 | PCT_0.001 | 9419.97 / 6.9 % | 8782.99 / 12.8 % | 7988.17 / 20.4 % |
| DEV | 10000 | PCT_0.0025 | 8747.61 / 15.3 % | 7662.97 / 25.0 % | 6021.89 / 40.3 % |
| DEV | 10000 | PCT_0.005 | 7833.42 / 28.4 % | 5644.95 / 46.4 % | 3562.00 / 64.8 % |
| DEV | 10000 | PCT_0.01 | 5624.27 / 53.0 % | 3118.09 / 72.3 % | 1185.89 / 88.4 % |
| HOLD | 250 | CURRENT | 68.08 / 88.4 % | -49.75 / 117.4 % **RUIN** | 66.78 / 76.4 % |
| HOLD | 250 | PCT_0.001 | no trade | no trade | no trade |
| HOLD | 250 | PCT_0.0025 | no trade | no trade | no trade |
| HOLD | 250 | PCT_0.005 | no trade | no trade | no trade |
| HOLD | 250 | PCT_0.01 | 247.44 / 2.0 % | 251.26 / 1.0 % | 251.23 / 0.0 % |
| HOLD | 1000 | CURRENT | 1206.95 / 51.4 % | 743.98 / 69.6 % | 57.28 / 94.9 % |
| HOLD | 1000 | PCT_0.001 | no trade | no trade | no trade |
| HOLD | 1000 | PCT_0.0025 | 997.44 / 0.5 % | 1001.26 / 0.3 % | 1001.23 / 0.0 % |
| HOLD | 1000 | PCT_0.005 | 899.32 / 18.0 % | 807.23 / 20.9 % | 751.08 / 25.5 % |
| HOLD | 1000 | PCT_0.01 | 718.20 / 31.6 % | 392.72 / 62.5 % | 373.01 / 63.4 % |
| HOLD | 10000 | CURRENT | 10206.94 / 6.7 % | 9743.98 / 8.7 % | 8625.37 / 14.8 % |
| HOLD | 10000 | PCT_0.001 | 9730.44 / 3.5 % | 9230.37 / 7.9 % | 8425.12 / 15.9 % |
| HOLD | 10000 | PCT_0.0025 | 9289.30 / 8.3 % | 8052.82 / 20.4 % | 6359.80 / 36.8 % |
| HOLD | 10000 | PCT_0.005 | 8881.08 / 17.6 % | 6666.01 / 34.6 % | 4100.94 / 59.6 % |
| HOLD | 10000 | PCT_0.01 | 7927.07 / 32.1 % | 4842.15 / 53.8 % | 1679.90 / 83.8 % |

## Reading
- **Costs dominate.** Moving from NORMAL to SEVERE turns a 10,000 USD account at 0.50 % risk from 8881.08 to 4100.94 USD on HOLD.
- **Results are not strictly monotone in cost** at small accounts, because the size is path-dependent: higher spread → larger worst-case loss per lot → more minimum-lot rejections → a different trade set.
- **CURRENT can go below zero.** The 250 USD account under MODERATE cost ends at -49.75 USD on HOLD: the fixed lot keeps trading while equity approaches the production veto floor, and a single wide-SL loss exceeds the remaining equity. Specifically, the final trade (2026-02-02, structural SL 111.85 USD) lost 122.07 USD at 1 oz from 72.32 USD of equity. That replay uses the common structural exit; production's −50 USD monetary broker SL would have bound on that trade, limiting the loss to about 50 USD and leaving about 21.92 USD.
- **Percentage sizing never ruins** (minimum equity stays > 0 in every scenario): it shrinks or rejects instead.
