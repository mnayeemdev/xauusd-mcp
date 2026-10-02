# V11_COST_STRESS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Entry economics by cost (risk-free one-position walk, R)
| Split | Cost | n | Expectancy R | PF | Win rate | Avg win / loss | Max DD R |
|---|---|---|---|---|---|---|---|
| DEV | normal | 1133 | -0.077 | 0.90 | 44.2 % | 1.62 / -1.42 | 120.78 |
| DEV | moderate | 1128 | -0.184 | 0.79 | 43.8 % | 1.54 / -1.52 | 228.36 |
| DEV | severe | 1122 | -0.368 | 0.62 | 43.0 % | 1.41 / -1.71 | 415.97 |
| HOLD | normal | 1510 | -0.022 | 0.97 | 45.0 % | 1.65 / -1.39 | 64.89 |
| HOLD | moderate | 1509 | -0.085 | 0.89 | 45.0 % | 1.60 / -1.46 | 136.03 |
| HOLD | severe | 1499 | -0.212 | 0.76 | 44.6 % | 1.52 / -1.61 | 323.9 |

## End equity by cost (USD)
| Split | Account | Model | NORMAL | MODERATE | SEVERE |
|---|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | 933.26 | 512.00 | 69.12 |
| DEV | 1000 | PCT 0.10 % | no trade | no trade | no trade |
| DEV | 1000 | PCT 0.25 % | 960.38 | 938.97 | 948.80 |
| DEV | 1000 | PCT 0.50 % | 772.31 | 702.18 | 610.82 |
| DEV | 1000 | PCT 1.00 % | 524.94 | 382.61 | 310.59 |
| DEV | 5000 | CURRENT 0.01 lot | 4933.26 | 4512.00 | 3655.11 |
| DEV | 5000 | PCT 0.10 % | 4748.28 | 4515.36 | 4298.57 |
| DEV | 5000 | PCT 0.25 % | 4114.99 | 3568.56 | 2875.38 |
| DEV | 5000 | PCT 0.50 % | 3921.06 | 2936.15 | 1640.88 |
| DEV | 5000 | PCT 1.00 % | 2792.12 | 1633.14 | 601.69 |
| DEV | 10000 | CURRENT 0.01 lot | 9933.26 | 9512.00 | 8655.11 |
| DEV | 10000 | PCT 0.10 % | 9419.97 | 8782.99 | 7988.17 |
| DEV | 10000 | PCT 0.25 % | 8747.61 | 7662.97 | 6021.89 |
| DEV | 10000 | PCT 0.50 % | 7833.42 | 5644.95 | 3562.00 |
| DEV | 10000 | PCT 1.00 % | 5624.27 | 3118.09 | 1185.89 |
| HOLD | 1000 | CURRENT 0.01 lot | 1206.95 | 743.98 | 57.28 |
| HOLD | 1000 | PCT 0.10 % | no trade | no trade | no trade |
| HOLD | 1000 | PCT 0.25 % | 997.44 | 1001.26 | 1001.23 |
| HOLD | 1000 | PCT 0.50 % | 899.32 | 807.23 | 751.08 |
| HOLD | 1000 | PCT 1.00 % | 718.20 | 392.72 | 373.01 |
| HOLD | 5000 | CURRENT 0.01 lot | 5206.95 | 4743.98 | 3625.37 |
| HOLD | 5000 | PCT 0.10 % | 4907.71 | 4790.84 | 4597.19 |
| HOLD | 5000 | PCT 0.25 % | 4286.82 | 3846.88 | 3200.22 |
| HOLD | 5000 | PCT 0.50 % | 4296.81 | 3381.04 | 1829.55 |
| HOLD | 5000 | PCT 1.00 % | 3780.66 | 2245.40 | 631.88 |
| HOLD | 10000 | CURRENT 0.01 lot | 10206.94 | 9743.98 | 8625.37 |
| HOLD | 10000 | PCT 0.10 % | 9730.44 | 9230.37 | 8425.12 |
| HOLD | 10000 | PCT 0.25 % | 9289.30 | 8052.82 | 6359.80 |
| HOLD | 10000 | PCT 0.50 % | 8881.08 | 6666.01 | 4100.94 |
| HOLD | 10000 | PCT 1.00 % | 7927.07 | 4842.15 | 1679.90 |

## Cost levels
- **Spread + slippage per oz:** NORMAL 0.24 + 0.10, MODERATE 0.40 + 0.30, SEVERE 0.60 + 0.60.
- **SEVERE gap:** every 10th stop-out fills a further 0.5 R worse.
- **Swap:** 0.56 USD/oz/night on BUY, every cost level.

The SEVERE spread equals the production limit of 0.60 USD and is therefore still admissible; any wider spread fails closed.
