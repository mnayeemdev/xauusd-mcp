# V12_VALID_LOSS_ANALYSIS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Rule-conformance attribution of every losing trade
Classes are checked in pipeline order; the first failure wins.
| Split | Losing trades | PATTERN_ERROR | SETUP_ERROR | TRIGGER_ERROR | DIRECTION_ERROR | LOCATION_ERROR | SL_ERROR | RR_ERROR | UNKNOWN | VALID_LOSING_TRADE |
|---|---|---|---|---|---|---|---|---|---|---|
| DEV | 632 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 632 |
| HOLD | 831 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 831 |

## Valid losing trades: hindsight outcome labels (labels only, never rules)
| Split | ADVERSE_FROM_START | FAVOURABLE_THEN_LOST | NEAR_TARGET_REVERSAL | Outcome direction miss | Direction right, valid loss | Noise |
|---|---|---|---|---|---|---|
| DEV | 343 | 199 | 90 | 292 | 289 | 51 |
| HOLD | 438 | 257 | 136 | 373 | 393 | 65 |

## Per model (HOLD)
| Model | Losses | Classes | Outcome labels | Direction outcome |
|---|---|---|---|---|
| MC | 75 | VALID_LOSING_TRADE 75 | FAVOURABLE_THEN_LOST 23, ADVERSE_FROM_START 38, NEAR_TARGET_REVERSAL 14 | DIRECTION_RIGHT_VALID_LOSS 37, NOISE_BOTH_SIDES_LOSE 10, OUTCOME_DIRECTION_MISS 28 |
| PB | 136 | VALID_LOSING_TRADE 136 | FAVOURABLE_THEN_LOST 48, NEAR_TARGET_REVERSAL 19, ADVERSE_FROM_START 69 | DIRECTION_RIGHT_VALID_LOSS 67, NOISE_BOTH_SIDES_LOSE 11, OUTCOME_DIRECTION_MISS 58 |
| BO | 505 | VALID_LOSING_TRADE 505 | ADVERSE_FROM_START 267, FAVOURABLE_THEN_LOST 158, NEAR_TARGET_REVERSAL 80 | OUTCOME_DIRECTION_MISS 232, DIRECTION_RIGHT_VALID_LOSS 238, NOISE_BOTH_SIDES_LOSE 35 |
| SR | 62 | VALID_LOSING_TRADE 62 | ADVERSE_FROM_START 35, FAVOURABLE_THEN_LOST 15, NEAR_TARGET_REVERSAL 12 | OUTCOME_DIRECTION_MISS 30, DIRECTION_RIGHT_VALID_LOSS 27, NOISE_BOTH_SIDES_LOSE 5 |
| MR | 53 | VALID_LOSING_TRADE 53 | ADVERSE_FROM_START 29, NEAR_TARGET_REVERSAL 11, FAVOURABLE_THEN_LOST 13 | OUTCOME_DIRECTION_MISS 25, DIRECTION_RIGHT_VALID_LOSS 24, NOISE_BOTH_SIDES_LOSE 4 |

## Reading
- **Losses are valid losing trades, not implementation errors:** 1463 of 1463 (100 %).
- **A valid trade can lose.** About 15.4 % of losers came within 0.5 R of the target before reversing.
- **Records:** `results/loss_attribution_{DEV,HOLD}.jsonl` list every losing trade with its class, labels and mirror outcome.
