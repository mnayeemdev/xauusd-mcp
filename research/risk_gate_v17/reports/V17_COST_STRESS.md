# V17_COST_STRESS

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Final table (owner §33)
- **Setup:** 10,000 USD reference equity, ENVELOPE basis.
- **Units:** USD; means over accepted trades, with totals and multipliers over losers.
- **No scenario is "best"; there is no winner.**

| Split | Scenario | Risk % | Planned risk | Actual stop risk | Commission | Swap (mean / max) | Slippage | Gap impact (max) | Total exposure (mean / max, losers) | Risk multiplier (p50 / p99 / max) | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | NORMAL | 0.10 % | 9.95 | 7.73 | 0.00 | 0.00 / 0.51 | 0.13 | 3.80 (2 events) | 5.73 / 11.47 | 0.6997 / 1 / 1.4957 | 348/349 within; GAP_EXCEEDANCE: 1 |
| DEV | NORMAL | 0.25 % | 25.08 | 20.69 | 0.00 | 0.01 / 1.54 | 0.30 | 11.41 (1 events) | 15.47 / 34.42 | 0.7148 / 1 / 1.4957 | 367/368 within; GAP_EXCEEDANCE: 1 |
| DEV | NORMAL | 0.50 % | 50.23 | 45.34 | 0.00 | 0.03 / 4.62 | 0.64 | 24.71 (2 events) | 33.80 / 74.57 | 0.7122 / 1 / 1.4957 | 362/364 within; GAP_EXCEEDANCE: 2 |
| DEV | NORMAL | 1.00 % | 102.09 | 97.02 | 0.00 | 0.07 / 10.78 | 1.35 | 49.43 (2 events) | 72.31 / 149.14 | 0.7122 / 1 / 1.4957 | 361/363 within; GAP_EXCEEDANCE: 2 |
| DEV | MODERATE | 0.10 % | 9.72 | 7.50 | 0.00 | 0.00 / 0.51 | 0.37 | 3.80 (2 events) | 5.94 / 12.59 | 0.7405 / 1.0763 / 1.5008 | 246/354 within; SLIPPAGE_EXCEEDANCE: 107; GAP_EXCEEDANCE: 1 |
| DEV | MODERATE | 0.25 % | 23.54 | 19.19 | 0.00 | 0.01 / 1.54 | 0.79 | 9.51 (1 events) | 15.09 / 31.48 | 0.7498 / 1.0734 / 1.5008 | 281/366 within; SLIPPAGE_EXCEEDANCE: 85 |
| DEV | MODERATE | 0.50 % | 44.47 | 39.49 | 0.00 | 0.03 / 4.62 | 1.58 | 17.11 (2 events) | 30.64 / 57.51 | 0.7405 / 1.0734 / 1.5008 | 284/367 within; SLIPPAGE_EXCEEDANCE: 83 |
| DEV | MODERATE | 1.00 % | 78.18 | 73.10 | 0.00 | 0.05 / 7.70 | 2.91 | 26.61 (2 events) | 56.43 / 110.25 | 0.7393 / 1.0734 / 1.5008 | 284/364 within; SLIPPAGE_EXCEEDANCE: 80 |
| DEV | SEVERE | 0.10 % | 8.09 | 6.40 | 0.00 | 0.00 / 0.00 | 10.89 | 0.00 (0 events) | 11.86 / 37.37 | 1.979 / 4.4512 / 4.5879 | 74/314 within; SLIPPAGE_EXCEEDANCE: 240 |
| DEV | SEVERE | 0.25 % | 15.28 | 11.97 | 0.00 | 0.00 / 0.51 | 16.46 | 0.00 (0 events) | 19.78 / 98.10 | 1.702 / 4.2534 / 4.5879 | 91/338 within; SLIPPAGE_EXCEEDANCE: 247 |
| DEV | SEVERE | 0.50 % | 20.65 | 17.29 | 0.00 | 0.00 / 0.51 | 23.81 | 0.00 (0 events) | 28.32 / 208.47 | 1.7202 / 4.2534 / 4.5879 | 77/320 within; SLIPPAGE_EXCEEDANCE: 243 |
| DEV | SEVERE | 1.00 % | 30.68 | 27.23 | 0.00 | 0.00 / 0.51 | 36.11 | 1.17 (1 events) | 44.19 / 380.15 | 1.7692 / 4.5879 / 4.8729 | 46/224 within; SLIPPAGE_EXCEEDANCE: 178 |
| HOLD | NORMAL | 0.10 % | 9.92 | 7.60 | 0.00 | 0.00 / 0.51 | 0.12 | 9.74 (2 events) | 6.05 / 18.04 | 0.7371 / 1 / 2.174 | 373/375 within; GAP_EXCEEDANCE: 2 |
| HOLD | NORMAL | 0.25 % | 24.86 | 20.15 | 0.00 | 0.01 / 2.05 | 0.24 | 125.61 (1 events) | 16.11 / 148.03 | 0.7634 / 1 / 6.6025 | 442/443 within; GAP_EXCEEDANCE: 1 |
| HOLD | NORMAL | 0.50 % | 48.85 | 42.11 | 0.00 | 0.02 / 4.11 | 0.47 | 251.22 (1 events) | 33.83 / 296.06 | 0.7613 / 1 / 6.6025 | 439/440 within; GAP_EXCEEDANCE: 1 |
| HOLD | NORMAL | 1.00 % | 99.23 | 91.91 | 0.00 | 0.04 / 8.72 | 0.99 | 533.83 (1 events) | 73.84 / 629.12 | 0.7613 / 1 / 6.6025 | 435/436 within; GAP_EXCEEDANCE: 1 |
| HOLD | MODERATE | 0.10 % | 9.74 | 7.56 | 0.00 | 0.00 / 0.51 | 0.34 | 9.74 (2 events) | 6.37 / 19.16 | 0.7929 / 1.0696 / 2.1246 | 218/362 within; SLIPPAGE_EXCEEDANCE: 144 |
| HOLD | MODERATE | 0.25 % | 24.06 | 19.18 | 0.00 | 0.01 / 1.54 | 0.64 | 125.61 (1 events) | 15.89 / 150.27 | 0.7854 / 1.063 / 6.2979 | 327/440 within; SLIPPAGE_EXCEEDANCE: 113 |
| HOLD | MODERATE | 0.50 % | 45.06 | 38.03 | 0.00 | 0.02 / 3.08 | 1.19 | 219.81 (1 events) | 31.72 / 262.97 | 0.7818 / 1.063 / 6.2979 | 327/438 within; SLIPPAGE_EXCEEDANCE: 111 |
| HOLD | MODERATE | 1.00 % | 83.26 | 75.85 | 0.00 | 0.03 / 6.16 | 2.28 | 408.23 (1 events) | 63.27 / 488.37 | 0.7812 / 1.063 / 6.2979 | 325/431 within; SLIPPAGE_EXCEEDANCE: 106 |
| HOLD | SEVERE | 0.10 % | 8.23 | 6.66 | 0.00 | 0.00 / 0.00 | 10.24 | 4.87 (1 events) | 10.66 / 37.15 | 1.8543 / 3.9946 / 4.3071 | 115/335 within; SLIPPAGE_EXCEEDANCE: 220 |
| HOLD | SEVERE | 0.25 % | 16.02 | 12.48 | 0.00 | 0.00 / 0.00 | 14.08 | 0.00 (0 events) | 17.49 / 74.80 | 1.5702 / 3.7965 / 4.3071 | 113/402 within; SLIPPAGE_EXCEEDANCE: 289 |
| HOLD | SEVERE | 0.50 % | 23.09 | 18.38 | 0.00 | 0.00 / 0.51 | 18.37 | 0.71 (1 events) | 24.46 / 137.13 | 1.5369 / 3.8856 / 4.3071 | 102/400 within; SLIPPAGE_EXCEEDANCE: 298 |
| HOLD | SEVERE | 1.00 % | 35.02 | 29.71 | 0.00 | 0.00 / 1.03 | 27.00 | 0.71 (1 events) | 37.66 / 236.85 | 1.4313 / 4.3071 / 4.536 | 74/289 within; SLIPPAGE_EXCEEDANCE: 215 |
