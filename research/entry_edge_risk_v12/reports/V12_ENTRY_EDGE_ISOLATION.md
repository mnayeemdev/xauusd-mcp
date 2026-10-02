# V12_ENTRY_EDGE_ISOLATION

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Question
Where along PATTERN → SETUP → TRIGGER → DIRECTION → LOCATION / ENTRY does the negative expectancy of the frozen entry engine emerge?

## Verdict
**ENTRY_EDGE_STATUS = EDGE_FAILURE_NOT_ISOLATED. ENTRY_FAILURE_STAGE = NO DETERMINISTIC FAILURE IDENTIFIED. ENTRY_EDGE_REMAINING_PROBLEM = YES.**

**The existing strategy has no demonstrated edge.**
- **No stage carries a replicated gross edge.** Every pooled stage edge is slightly negative on DEV and slightly positive on HOLD, and none is significant on both splits (replicated stages: none).
- **No stage transition loses a significant amount of edge.** The failure is not at a stage: there is no edge to lose from the PATTERN stage onward.
- **Trades are close to zero gross:** 0.018 R (DEV) and 0.042 R (HOLD).
- **They are negative net:** -0.077 / -0.022 R. The difference, ≈ 0.095 / 0.065 R per trade, is the execution cost (spread + slippage + swap).
- **All 1463 losing trades are VALID_LOSING_TRADE** (0 rule errors).
- **No correction candidate passed DEV,** so none was frozen or tested.

## Pooled stage edge (gross, vs same-side baseline)
| Split | Observations | PATTERN | SETUP | TRIGGER | DIRECTION | ENTRY |
|---|---|---|---|---|---|---|
| DEV | 145028 | -0.013 [-0.028, 0.003] · | -0.032 [-0.076, 0.016] · | -0.045 [-0.086, 0.002] · | -0.042 [-0.105, 0.027] · | -0.027 [-0.125, 0.061] · |
| HOLD | 171280 | 0.006 [-0.006, 0.016] · | 0.019 [-0.018, 0.053] · | 0.027 [-0.011, 0.066] · | 0.033 [-0.023, 0.093] · | 0.023 [-0.059, 0.098] · |

## Pooled stage transitions (change in gross edge)
| Split | PATTERN->SETUP | SETUP->TRIGGER | TRIGGER->DIRECTION | DIRECTION->ENTRY |
|---|---|---|---|---|
| DEV | -0.019 [-0.051, 0.018] · | -0.013 [-0.040, 0.016] · | 0.003 [-0.035, 0.039] · | 0.015 [-0.046, 0.074] · |
| HOLD | 0.013 [-0.016, 0.043] · | 0.008 [-0.015, 0.030] · | 0.006 [-0.033, 0.044] · | -0.011 [-0.054, 0.036] · |

## Unconditional baseline (every traced bar, same probe)
| Split | Side | Bars | Gross R | Net R |
|---|---|---|---|---|
| DEV | BUY | 46593 | 0.017 [-0.041, 0.075] | -0.086 |
| DEV | SELL | 46593 | -0.026 [-0.079, 0.033] | -0.117 |
| HOLD | BUY | 52788 | -0.068 [-0.121, -0.013] | -0.122 |
| HOLD | SELL | 52788 | 0.064 [0.010, 0.116] | 0.016 |

The baseline flips with the market: on HOLD, SELL probes are positive and BUY probes negative. This is why every stage is measured against its same-side baseline.

Probe: entry at the stage bar close, SL = 1.35 × ATR14, fixed 1.70 R exit; GROSS = zero spread / slippage, swap added back. Edge vs baseline = gross R minus the unconditional same-side gross R (removes market drift). Intervals: 95 % day-block bootstrap. ▲ / ▼ = interval entirely above / below 0; · = includes 0.

## Funnel
| Split | Model | Observations (bars) | Valid patterns | Valid setups | Valid triggers | Valid directions | Valid entries | Trades |
|---|---|---|---|---|---|---|---|---|
| DEV | MC | 46593 | 11287 | 5587 | 1901 | 575 | 413 | 111 |
| DEV | PB | 46593 | 81213 | 27309 | 9934 | 2085 | 649 | 181 |
| DEV | BO | 46593 | 23513 | 21019 | 10262 | 8613 | 3353 | 690 |
| DEV | SR | 46593 | 8920 | 1380 | 683 | 407 | 128 | 64 |
| DEV | MR | 46593 | 20095 | 2057 | 1032 | 1031 | 315 | 87 |
| DEV | ALL | 46593 | 91548 | 42008 | 21980 | 12256 | 4858 | 1133 |
| HOLD | MC | 52788 | 12410 | 5784 | 1958 | 649 | 467 | 125 |
| HOLD | PB | 52788 | 92377 | 31511 | 11150 | 2409 | 894 | 251 |
| HOLD | BO | 52788 | 25973 | 23195 | 11208 | 9187 | 4557 | 925 |
| HOLD | SR | 52788 | 9982 | 1664 | 955 | 476 | 228 | 108 |
| HOLD | MR | 52788 | 30538 | 2509 | 1315 | 1315 | 407 | 101 |
| HOLD | ALL | 52788 | 103707 | 47554 | 24660 | 13527 | 6553 | 1510 |

Reports: V12_STRATEGY_BREAKDOWN · V12_PATTERN_ANALYSIS · V12_SETUP_ANALYSIS · V12_TRIGGER_ANALYSIS · V12_DIRECTION_ANALYSIS · V12_ENTRY_LOCATION_ANALYSIS · V12_VALID_LOSS_ANALYSIS · V12_HINDSIGHT_AUDIT · V12_HOLDOUT_RESULTS · V12_REPLAY_RESULTS
