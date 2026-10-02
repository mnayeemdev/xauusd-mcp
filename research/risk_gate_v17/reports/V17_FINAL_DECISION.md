# V17_FINAL_DECISION

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Decision
**RISK_GATE_VALIDATED**

| Integrity criterion | Result |
|---|---|
| tests_pass | YES |
| no_rounding_up_or_overrisk | YES |
| rr_170 | YES |
| no_broker_rounding_exceedance | YES |
| primary_never_accepts | YES |
| replay_parity | YES |

| Measurement criterion | Result |
|---|---|
| broker_data_validated | YES |
| components_measured_dev | YES |
| components_measured_hold | YES |

## Owner success criteria (§34)
| # | Criterion | Met |
|---|---|---|
| 1 | risk never modifies entry validity | YES (entry hash firewall; tests) |
| 2 | structural SL unchanged | YES |
| 3 | RR 1.70 | YES |
| 4 | position sizing deterministic | YES (tests; replay) |
| 5 | broker rounding validated | YES |
| 6 | minimum-lot violations rejected | YES |
| 7 | margin violations rejected | YES |
| 8 | swap measured separately | YES |
| 9 | slippage measured separately | YES |
| 10 | gap risk explicitly separated | YES (GAP_RISK UNRESOLVED) |
| 11 | planned vs realized risk visible | YES |
| 12 | missing risk data fails closed | YES |
| 13 | replay parity | YES |
| 14 | no-lookahead | YES |
| 15 | no strategy rules changed | YES (fingerprint ok) |
| 16 | no orders placed | YES |

## Separately reported (not hidden, not converted into numbers)
- **GAP_RISK = UNRESOLVED:**
  - weekend / holiday reopen gaps pass through the hard stop;
  - the worst HOLDOUT case is 6.60× planned;
  - production has no maximum holding time, so no pre-trade calendar rule can bound it without changing exits.
- **SLIPPAGE_RISK = UNRESOLVED:** there is no stop-fill evidence, and HOLDOUT in-session jumps exceed the DEV maximum.
- **RISK_PERCENTAGE = UNRESOLVED; DAILY_LOSS_POLICY = UNRESOLVED.**
- **Risk creates no edge.** V17 measures and controls exposure only.

## Final table (0.50 % research scenario; all risk % in V17_COST_STRESS)
| Split | Scenario | Planned risk | Actual stop risk | Commission | Swap | Slippage | Gap impact (max) | Total exposure (max) | Risk multiplier (max) | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| DEV | NORMAL | 50.23 | 45.34 | 0.00 | 0.03 | 0.64 | 24.71 | 74.57 | 1.4957 | 362/364 within |
| DEV | MODERATE | 44.47 | 39.49 | 0.00 | 0.03 | 1.58 | 17.11 | 57.51 | 1.5008 | 284/367 within |
| DEV | SEVERE | 20.65 | 17.29 | 0.00 | 0.00 | 23.81 | 0.00 | 208.47 | 4.5879 | 77/320 within |
| HOLD | NORMAL | 48.85 | 42.11 | 0.00 | 0.02 | 0.47 | 251.22 | 296.06 | 6.6025 | 439/440 within |
| HOLD | MODERATE | 45.06 | 38.03 | 0.00 | 0.02 | 1.19 | 219.81 | 262.97 | 6.2979 | 327/438 within |
| HOLD | SEVERE | 23.09 | 18.38 | 0.00 | 0.00 | 18.37 | 0.71 | 137.13 | 4.3071 | 102/400 within |

## Final terminal summary
```
V17_STATUS                = COMPLETE
RISK_GATE_STATUS          = RISK_GATE_VALIDATED
RISK_PERCENTAGE           = UNRESOLVED
POSITION_SIZING           = DETERMINISTIC (equity -> % -> cash -> ask/bid -> structural SL -> size rounded down -> actual exposure recalculated)
BROKER_ROUNDING           = VALIDATED (0 over-risk after rounding; never rounded up)
MINIMUM_LOT               = ENFORCED (RISK_REJECTED_MINIMUM_LOT; e.g. 0.50 % at 1,000 USD rejects 93.77 % of HOLD entries)
MAXIMUM_LOT               = ENFORCED (RISK_REJECTED_BROKER_LIMIT; no silent cap)
LOT_STEP                  = ENFORCED (RISK_REJECTED_INVALID_SIZE)
STRUCTURAL_SL             = UNCHANGED
RR                        = 1.70
PLANNED_RISK              = RECORDED per trade (amount, %, entry, SL, size, actual stop exposure)
REALIZED_RISK             = DECOMPOSED (stop loss, commission, swap, slippage, gap); HOLD NORMAL losers p50 0.7613x, max 6.6025x of planned
SWAP_RISK                 = MEASURED and BOUNDED by the envelope (long -0.5132 USD/oz/night, short 0; 0 swap exceedances on the envelope basis)
SLIPPAGE_RISK             = UNRESOLVED (no stop-fill evidence; MODERATE / SEVERE exceed the 0.10 allowance)
GAP_RISK                  = UNRESOLVED (worst HOLD weekend gap 6.60x planned; no pre-trade rule bounds it without a new exit rule)
RISK_ENVELOPE             = DEFINED (planned + commission + known max swap); NORMAL losers within it except the gap tail
MARGIN_STATUS             = VALIDATED (formula = MT5 calculation; not binding at 10,000 USD)
BROKER_DATA_STATUS        = VALIDATED (live read-only capture = REAL record on every required field)
RISK_EXCEEDANCE           = CLASSIFIED (WITHIN / COST / SWAP / SLIPPAGE / GAP / BROKER_ROUNDING 0 / OTHER 0)
FAIL_CLOSED               = PASS
REPLAY_PARITY             = PASS
NO_LOOKAHEAD              = PASS
ENTRY_RULES_CHANGED       = NO
CAPITAL_HARVEST           = OFF
REAL_TRADE_PLACED         = NO
DEMO_TRADE_PLACED         = NO
EXECUTION_AUTHORITY       = NONE
PRODUCTION_CHANGED        = NO
```
