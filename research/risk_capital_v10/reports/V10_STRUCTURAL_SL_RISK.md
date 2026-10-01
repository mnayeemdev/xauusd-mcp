# V10_STRUCTURAL_SL_RISK

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Structural SL distance (USD per oz) and worst-case loss of 0.01 lot at the hard stop
| Split | Signals | Entry median | SL p10 | p50 | p90 | p99 | max | 0.01-lot loss p50 | p90 | p99 | max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | 4858 | 3685.74 | 2 | 4.75 | 10.54 | 20.18 | 46.99 | 7.47 | 16.15 | 30.61 | 70.82 |
| HOLD | 6553 | 4507.08 | 2.87 | 7.34 | 17.97 | 45.4 | 150.24 | 11.35 | 27.3 | 68.44 | 225.7 |

## Consequences
- **Wider SLs in 2026.** The holdout structural SL is roughly 1.55× wider than DEV at the median and 2.25× at the 99th percentile (higher gold price and volatility). At a fixed risk % the size is smaller; at a fixed lot the dollar risk is larger.
- **The SL is never moved.** Under percentage risk a wide SL gives a small lot or a rejection. The study never moves the SL to fit a dollar amount.
- **Production's fixed −50 USD maximum loss (0.01 lot) does move it.** It places the broker SL at min(50 USD, 1.5 × structural + spread):
  - the monetary distance is tighter than the structural fail-safe on 0.16 % of DEV and 1.92 % of HOLD signals;
  - it lies inside the structural SL itself on 0.00 % of DEV and 0.78 % of HOLD signals.
  - This conflicts with the owner principle "never move the structural SL simply to satisfy a desired dollar loss". Reported, not changed.
- **The +30 USD profit budget truncates the target.** The production profit budget at 0.01 lot closes below the 1.70 R objective whenever 1.70 × SL > 30 USD: 1.8 % of DEV and 10.5 % of HOLD signals.
- **Modelling note.** The study compares sizing on the COMMON structural exit (fixed 1.70 R target, hard broker fail-safe at 1.5 × structural + spread, thesis invalidation on a confirmed close, 288-bar horizon). The CURRENT replay therefore shows CURRENT sizing without the two fixed-dollar budgets.

## P&L by structural-SL quartile: why a fixed lot and percentage risk disagree (CURRENT trades, 10,000 USD)
| Split | Cost | Quartile | Trades | Mean SL $ | Mean R | P&L at 0.01 lot (USD) |
|---|---|---|---|---|---|---|
| DEV | normal | Q1 | 284 | 1.92 | -0.217 | -112.32 |
| DEV | normal | Q2 | 283 | 3.39 | -0.062 | -57.38 |
| DEV | normal | Q3 | 283 | 5.28 | -0.061 | -85.39 |
| DEV | normal | Q4 | 283 | 10.82 | 0.031 | 188.35 |
| DEV | moderate | Q1 | 283 | 1.92 | -0.401 | -205.65 |
| DEV | moderate | Q2 | 283 | 3.40 | -0.183 | -170.82 |
| DEV | moderate | Q3 | 283 | 5.31 | -0.133 | -187.14 |
| DEV | moderate | Q4 | 279 | 10.89 | -0.014 | 75.61 |
| HOLD | normal | Q1 | 378 | 2.70 | -0.154 | -149.57 |
| HOLD | normal | Q2 | 378 | 4.94 | 0.066 | 133.86 |
| HOLD | normal | Q3 | 377 | 8.29 | -0.052 | -130.27 |
| HOLD | normal | Q4 | 377 | 19.01 | 0.052 | 352.92 |
| HOLD | moderate | Q1 | 378 | 2.70 | -0.290 | -281.42 |
| HOLD | moderate | Q2 | 378 | 4.94 | 0.009 | 29.39 |
| HOLD | moderate | Q3 | 376 | 8.31 | -0.096 | -268.84 |
| HOLD | moderate | Q4 | 377 | 19.01 | 0.039 | 264.85 |

Fixed costs (spread + slippage) are a constant dollar amount, so they cost more R on tight SLs. A fixed lot puts more dollars on wide-SL trades; percentage risk puts the same risk on every trade. This explains CURRENT's positive HOLD result at NORMAL cost. It is not a reason to prefer a fixed lot: on DEV the fixed lot loses too, and it reverses under MODERATE cost.

## Largest CURRENT single losses (0.01 lot, 1,000 USD, NORMAL cost)
| Split | Signal | Date | Structural SL $ | Loss $ | Exit | Production −50 USD cap would bind |
|---|---|---|---|---|---|---|
| DEV | 32802|SELL | 2025-10-17 | 32.24 | 42.14 | THESIS_INVALIDATION | no |
| DEV | 33613|SELL | 2025-10-22 | 34.49 | 37.58 | THESIS_INVALIDATION | yes |
| DEV | 32783|SELL | 2025-10-17 | 21.09 | 31.98 | BROKER_SL | no |
| DEV | 34084|SELL | 2025-10-24 | 20.47 | 31.05 | BROKER_SL | no |
| DEV | 39247|SELL | 2025-11-20 | 27.73 | 28.23 | THESIS_INVALIDATION | no |
| HOLD | 52883|SELL | 2026-02-02 | 150.24 | 154.71 | THESIS_INVALIDATION | yes |
| HOLD | 52864|SELL | 2026-02-01 | 81.32 | 98.12 | THESIS_INVALIDATION | yes |
| HOLD | 53160|BUY | 2026-02-03 | 68.91 | 74.83 | THESIS_INVALIDATION | yes |
| HOLD | 53991|SELL | 2026-02-06 | 59.14 | 62.72 | THESIS_INVALIDATION | yes |
| HOLD | 52589|BUY | 2026-01-29 | 45.42 | 62.21 | THESIS_INVALIDATION | yes |
