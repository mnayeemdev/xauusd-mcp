# V10_ACCOUNT_SIZE_COMPARISON

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## CURRENT fixed 0.01 lot expressed as % risk of equity (worst-case loss at the hard stop)
| Account | DEV p50 | DEV p90 | DEV max | HOLD p50 | HOLD p90 | HOLD p99 | HOLD max |
|---|---|---|---|---|---|---|---|
| 100 | 7.46 % | 16.15 % | 70.8 % | 11.35 % | 27.30 % | 68.4 % | 225.7 % |
| 250 | 2.99 % | 6.46 % | 28.3 % | 4.54 % | 10.92 % | 27.4 % | 90.3 % |
| 500 | 1.49 % | 3.23 % | 14.2 % | 2.27 % | 5.46 % | 13.7 % | 45.1 % |
| 1000 | 0.75 % | 1.61 % | 7.1 % | 1.13 % | 2.73 % | 6.8 % | 22.6 % |
| 5000 | 0.15 % | 0.32 % | 1.4 % | 0.23 % | 0.55 % | 1.4 % | 4.5 % |
| 10000 | 0.07 % | 0.16 % | 0.7 % | 0.11 % | 0.27 % | 0.7 % | 2.3 % |

## Per account: CURRENT versus percentage risk (NORMAL cost, end equity / max DD / trades)
| Account | Split | CURRENT | 0.10 % | 0.25 % | 0.50 % | 0.75 % | 1.00 % |
|---|---|---|---|---|---|---|---|
| 100 | DEV | 55.16 / 47.9 % / 8 | no trade | no trade | no trade | no trade | no trade |
| 100 | HOLD | 69.48 / 49.3 % / 10 | no trade | no trade | no trade | no trade | no trade |
| 250 | DEV | 69.68 / 81.4 % / 1071 | no trade | no trade | no trade | 247.67 / 1.5 % / 3 | 229.52 / 13.1 % / 106 |
| 250 | HOLD | 68.08 / 88.4 % / 221 | no trade | no trade | no trade | no trade | 247.44 / 2.0 % / 8 |
| 500 | DEV | 433.26 / 52.1 % / 1133 | no trade | no trade | 461.58 / 9.3 % / 118 | 390.51 / 24.1 % / 345 | 338.97 / 37.9 % / 480 |
| 500 | HOLD | 706.95 / 82.1 % / 1510 | no trade | no trade | 497.44 / 1.0 % / 8 | 460.86 / 11.5 % / 201 | 415.68 / 29.1 % / 497 |
| 1000 | DEV | 933.26 / 28.9 % / 1133 | no trade | 960.38 / 4.7 % / 128 | 772.31 / 24.6 % / 586 | 594.50 / 43.6 % / 809 | 524.94 / 52.0 % / 958 |
| 1000 | HOLD | 1206.95 / 51.4 % / 1510 | no trade | 997.44 / 0.5 % / 8 | 899.32 / 18.0 % / 511 | 695.38 / 39.2 % / 904 | 718.20 / 31.6 % / 1161 |
| 5000 | DEV | 4933.26 / 6.3 % / 1133 | 4748.28 / 5.6 % / 689 | 4114.99 / 19.1 % / 1155 | 3921.06 / 26.7 % / 1150 | 3421.68 / 38.5 % / 1151 | 2792.12 / 52.0 % / 1149 |
| 5000 | HOLD | 5206.95 / 12.9 % / 1510 | 4907.71 / 3.4 % / 503 | 4286.82 / 15.2 % / 1372 | 4296.81 / 16.6 % / 1589 | 4131.83 / 24.2 % / 1570 | 3780.66 / 33.2 % / 1541 |
| 10000 | DEV | 9933.26 / 3.2 % / 1133 | 9419.97 / 6.9 % / 1120 | 8747.61 / 15.3 % / 1154 | 7833.42 / 28.4 % / 1141 | 6542.05 / 42.3 % / 1132 | 5624.27 / 53.0 % / 1132 |
| 10000 | HOLD | 10206.94 / 6.7 % / 1510 | 9730.44 / 3.5 % / 1234 | 9289.30 / 8.3 % / 1590 | 8881.08 / 17.6 % / 1541 | 8533.89 / 24.0 % / 1523 | 7927.07 / 32.1 % / 1522 |

## Reading by account size
- **100 USD.** One 0.01 lot risks 11.3 % of equity on the median HOLD trade. No percentage ≤ 1 % can size a single trade. CURRENT trades only 10 times before the production veto stops it, with a 49.3 % drawdown.
- **250 – 500 USD.**
  - CURRENT risks 4.5 % (250) and 2.3 % (500) per median trade.
  - Its HOLD drawdowns are 88.4 % and 82.1 %.
  - Percentage risk ≤ 1 % sizes only a minority of trades.
- **1,000 USD.**
  - CURRENT ≈ 1.1 % median risk; HOLD drawdown 51.4 %.
  - 0.25 % sizes 0.1 % of HOLD trades; 0.50 % sizes 9.3 %.
- **5,000 – 10,000 USD.** The fixed 0.01 lot becomes a SMALL risk (≈ 0.11 % at 10,000), smaller than any candidate percentage, so CURRENT has the smallest drawdown there. Sizeable share at 10,000 USD: 0.25 % 95.5 % DEV / 78.1 % HOLD; 0.50 % 99.5 % / 94.6 %. At 5,000 USD: 0.50 % 94.3 % / 76.4 %.
- **Conclusion:** the fixed lot is oversized for small accounts and undersized (relative to every candidate) for large ones. Percentage sizing makes risk proportional but cannot make this entry stream profitable.
