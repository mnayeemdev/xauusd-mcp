# V12_STRATEGY_BREAKDOWN

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

Every model is reported; none is hidden or removed.
- **Funnel counts:** (bar, side) observations.
- **Trades:** the one-position walk with each entry's own geometry, NORMAL cost.

| Split | Model | Observations | Valid patterns | Valid setups | Valid triggers | Valid directions | Valid entries | Trades | Wins | Losses | Expectancy R (net) | 95 % CI | Gross R | PF | MFE R | MAE R | 1.70R reach | Max DD R |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | MC | 46593 | 11287 | 5587 | 1901 | 575 | 413 | 111 | 41 | 70 | -0.163 | [-0.438, 0.123] | -0.122 | 0.79 | 1.05 | 1.12 | 36.9 % | 25.06 |
| DEV | PB | 46593 | 81213 | 27309 | 9934 | 2085 | 649 | 181 | 79 | 102 | -0.052 | [-0.279, 0.153] | 0.009 | 0.93 | 1.22 | 1.16 | 43.6 % | 14.71 |
| DEV | BO | 46593 | 23513 | 21019 | 10262 | 8613 | 3353 | 690 | 317 | 373 | -0.051 | [-0.174, 0.062] | 0.061 | 0.94 | 1.30 | 1.27 | 45.8 % | 83.92 |
| DEV | SR | 46593 | 8920 | 1380 | 683 | 407 | 128 | 64 | 29 | 35 | -0.074 | [-0.393, 0.284] | 0.034 | 0.91 | 1.32 | 1.25 | 45.3 % | 12.95 |
| DEV | MR | 46593 | 20095 | 2057 | 1032 | 1031 | 315 | 87 | 35 | 52 | -0.225 | [-0.542, 0.140] | -0.139 | 0.75 | 1.23 | 1.30 | 40.2 % | 22.19 |
| DEV | ALL | 46593 | 91548 | 42008 | 21980 | 12256 | 4858 | 1133 | 501 | 632 | -0.077 | [-0.176, 0.013] | 0.018 | 0.90 | 1.26 | 1.24 | 44.1 % | 120.78 |
| HOLD | MC | 52788 | 12410 | 5784 | 1958 | 649 | 467 | 125 | 50 | 75 | -0.068 | [-0.304, 0.190] | -0.047 | 0.91 | 1.18 | 0.99 | 38.4 % | 16.18 |
| HOLD | PB | 52788 | 92377 | 31511 | 11150 | 2409 | 894 | 251 | 115 | 136 | 0.054 | [-0.113, 0.235] | 0.091 | 1.08 | 1.25 | 1.09 | 45.8 % | 12.81 |
| HOLD | BO | 52788 | 25973 | 23195 | 11208 | 9187 | 4557 | 925 | 420 | 505 | -0.031 | [-0.129, 0.066] | 0.044 | 0.96 | 1.36 | 1.30 | 45.4 % | 64.68 |
| HOLD | SR | 52788 | 9982 | 1664 | 955 | 476 | 228 | 108 | 46 | 62 | -0.129 | [-0.406, 0.169] | -0.037 | 0.85 | 1.28 | 1.30 | 42.6 % | 25.06 |
| HOLD | MR | 52788 | 30538 | 2509 | 1315 | 1315 | 407 | 101 | 48 | 53 | 0.037 | [-0.281, 0.403] | 0.095 | 1.05 | 1.29 | 1.28 | 47.5 % | 16.33 |
| HOLD | ALL | 52788 | 103707 | 47554 | 24660 | 13527 | 6553 | 1510 | 679 | 831 | -0.022 | [-0.105, 0.054] | 0.042 | 0.97 | 1.31 | 1.24 | 44.8 % | 64.90 |

## Reading
- **No model has a net expectancy whose interval excludes zero on either split.**
- **Signs change between splits.**
  - PB and MR are positive on HOLD (0.054 / 0.037 R) and negative on DEV (-0.052 / -0.225 R).
  - MC is negative on both, but with intervals through zero.
- **BO dominates the sample:** 925 of 1510 HOLD trades.
- **Every model's MFE ≈ MAE (≈ 1.2–1.3 R),** consistent with no directional information.
