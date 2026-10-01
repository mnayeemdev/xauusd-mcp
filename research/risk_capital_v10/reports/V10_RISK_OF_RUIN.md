# V10_RISK_OF_RUIN

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Assumptions (labelled)
- **Resampling:** trades are i.i.d. resamples of the realized risk units of the trades taken (P&L ÷ planned worst-case loss, NORMAL cost), DEV (1133 trades) or HOLD (1510 trades).
- **Sizing:** fixed fraction r, no controls, no minimum-lot effect.
- **Horizon:** one year = the split's trade rate scaled to 252 sessions (DEV 1535, HOLD 1821 trades).
- **Paths:** 2,000, seed 20261001.
- **Interpretation:** a stationarity-dependent PROXY, not a forecast. Ruin to zero is impossible under fixed-fraction sizing, so drawdown thresholds are used.

| Split | Risk % | P(DD ≥ 10 %) | P(DD ≥ 20 %) | P(DD ≥ 30 %) | P(DD ≥ 50 %) | Median DD | p95 DD |
|---|---|---|---|---|---|---|---|
| DEV | 0.10 % | 30.0 % | 0.0 % | 0.0 % | 0.0 % | 8.5 % | 13.5 % |
| DEV | 0.25 % | 95.6 % | 50.6 % | 6.3 % | 0.0 % | 20.1 % | 30.6 % |
| DEV | 0.50 % | 100.0 % | 95.0 % | 71.5 % | 8.2 % | 36.7 % | 52.2 % |
| DEV | 0.75 % | 100.0 % | 99.3 % | 93.6 % | 50.5 % | 50.2 % | 67.4 % |
| DEV | 1.00 % | 100.0 % | 100.0 % | 98.3 % | 77.1 % | 61.1 % | 77.9 % |
| HOLD | 0.10 % | 6.6 % | 0.0 % | 0.0 % | 0.0 % | 5.6 % | 10.4 % |
| HOLD | 0.25 % | 75.3 % | 15.6 % | 0.5 % | 0.0 % | 13.6 % | 24.3 % |
| HOLD | 0.50 % | 99.4 % | 71.9 % | 33.9 % | 0.9 % | 25.8 % | 43.3 % |
| HOLD | 0.75 % | 100.0 % | 95.3 % | 68.4 % | 15.6 % | 36.7 % | 57.9 % |
| HOLD | 1.00 % | 100.0 % | 99.3 % | 89.5 % | 40.3 % | 46.3 % | 69.0 % |

## Reading
- **Pre-registered gate (d): P(DD ≥ 20 %) ≤ 5 %.** It is met only by 0.10 %, on both splits. 0.25 % gives 50.6 % (DEV) and 15.6 % (HOLD).
- **0.10 % cannot size** most trades at the broker minimum lot (V10_RISK_PERCENTAGE_RESEARCH).
- **CURRENT, observed rather than proxied:** the fixed lot reached negative equity in one replay (HOLD, 250 USD, MODERATE cost) and drawdowns of 82.1 % (500 USD) and 51.4 % (1,000 USD) at NORMAL cost.
