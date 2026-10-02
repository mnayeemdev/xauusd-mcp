# V14_WAIT_STATES

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## States (13)
| State | Meaning |
|---|---|
| WAIT_STALE_DATA | input missing, stale, late, out of order or duplicated |
| WAIT_SAFETY_BREAKER | an existing production safety limit or recorded safety block is active |
| WAIT_NO_SETUP | no existing setup (pattern only or nothing) |
| WAIT_NO_TRIGGER | setup without a valid trigger |
| WAIT_DIRECTION_UNCLEAR | the existing direction rules establish no valid side |
| WAIT_CONFLICT | strategies disagree and no resolution is defined |
| WAIT_INVALID_LOCATION | entry outside the allowed location |
| WAIT_INVALID_SL * | structural SL invalid |
| WAIT_INVALID_RR * | RR below 1.70 / objective not feasible |
| WAIT_ENTRY_QUALITY * | the engine's existing quality gate rejects the triggered candidate |
| WAIT_RISK_UNSAFE | valid entry, risk cannot support it (RISK_REJECTED) |
| WAIT_BROKER_UNSAFE | broker data, rules or execution conditions unsafe |
| TRADE_ELIGIBLE | every check passed |

**\* Added to the owner's list, each necessary:**
- The owner's state machine (§14) validates the SL and RR as separate steps, and §19 / §23 require "invalid SL / RR → no trade".
- The engine's own quality gate needs a truthful name.
- No other sub-states were created; detail goes in the reason code.

## Counts: DEV
| State | PRIMARY | ILLUSTRATIVE_PCT_0_50_10K | ILLUSTRATIVE_CURRENT_10K |
|---|---|---|---|
| WAIT_STALE_DATA | 424 | 424 | 424 |
| WAIT_SAFETY_BREAKER | 0 | 378 | 17,449 |
| WAIT_NO_SETUP | 8,063 | 8,063 | 5,085 |
| WAIT_NO_TRIGGER | 16,683 | 16,683 | 10,485 |
| WAIT_DIRECTION_UNCLEAR | 9,955 | 9,955 | 6,012 |
| WAIT_CONFLICT | 0 | 0 | 0 |
| WAIT_INVALID_LOCATION | 781 | 781 | 521 |
| WAIT_INVALID_SL | 0 | 0 | 0 |
| WAIT_INVALID_RR | 5,004 | 5,004 | 3,329 |
| WAIT_ENTRY_QUALITY | 825 | 825 | 491 |
| WAIT_RISK_UNSAFE | 4,858 | 3,339 | 2,122 |
| WAIT_BROKER_UNSAFE | 0 | 0 | 0 |
| TRADE_ELIGIBLE | 0 | 1,141 | 675 |

## Counts: HOLD
| State | PRIMARY | ILLUSTRATIVE_PCT_0_50_10K | ILLUSTRATIVE_CURRENT_10K |
|---|---|---|---|
| WAIT_STALE_DATA | 509 | 509 | 509 |
| WAIT_SAFETY_BREAKER | 0 | 608 | 24,391 |
| WAIT_NO_SETUP | 9,195 | 9,195 | 5,116 |
| WAIT_NO_TRIGGER | 19,175 | 19,175 | 10,542 |
| WAIT_DIRECTION_UNCLEAR | 11,478 | 11,478 | 5,982 |
| WAIT_CONFLICT | 0 | 0 | 0 |
| WAIT_INVALID_LOCATION | 914 | 914 | 512 |
| WAIT_INVALID_SL | 0 | 0 | 0 |
| WAIT_INVALID_RR | 3,853 | 3,853 | 1,878 |
| WAIT_ENTRY_QUALITY | 1,111 | 1,111 | 603 |
| WAIT_RISK_UNSAFE | 6,553 | 4,404 | 2,463 |
| WAIT_BROKER_UNSAFE | 0 | 0 | 0 |
| TRADE_ELIGIBLE | 0 | 1,541 | 792 |

## Reasons (PRIMARY)
### DEV
| State : reason | Bars |
|---|---|
| WAIT_NO_TRIGGER:SETUP_WITHOUT_TRIGGER | 16,683 |
| WAIT_DIRECTION_UNCLEAR:NO_ELIGIBLE_STRATEGY | 9,341 |
| WAIT_NO_SETUP:PATTERN_ONLY | 8,063 |
| WAIT_RISK_UNSAFE:RISK_PERCENTAGE_UNRESOLVED | 4,858 |
| WAIT_INVALID_RR:RR_NOT_ACCEPTABLE | 2,793 |
| WAIT_INVALID_RR:VOLATILITY_INSUFFICIENT | 2,211 |
| WAIT_ENTRY_QUALITY:NO_GOOD_ENTRY | 825 |
| WAIT_INVALID_LOCATION:OVEREXTENDED | 781 |
| WAIT_STALE_DATA:DATA_UNAVAILABLE_STALE | 424 |
| WAIT_DIRECTION_UNCLEAR:HTF_CONFLICT | 336 |
| WAIT_DIRECTION_UNCLEAR:ENTRY_CONFLICT | 261 |
| WAIT_DIRECTION_UNCLEAR:CHOP | 17 |

### HOLD
| State : reason | Bars |
|---|---|
| WAIT_NO_TRIGGER:SETUP_WITHOUT_TRIGGER | 19,175 |
| WAIT_DIRECTION_UNCLEAR:NO_ELIGIBLE_STRATEGY | 10,588 |
| WAIT_NO_SETUP:PATTERN_ONLY | 9,195 |
| WAIT_RISK_UNSAFE:RISK_PERCENTAGE_UNRESOLVED | 6,553 |
| WAIT_INVALID_RR:RR_NOT_ACCEPTABLE | 3,850 |
| WAIT_ENTRY_QUALITY:NO_GOOD_ENTRY | 1,111 |
| WAIT_INVALID_LOCATION:OVEREXTENDED | 914 |
| WAIT_DIRECTION_UNCLEAR:HTF_CONFLICT | 517 |
| WAIT_STALE_DATA:DATA_UNAVAILABLE_STALE | 509 |
| WAIT_DIRECTION_UNCLEAR:ENTRY_CONFLICT | 357 |
| WAIT_DIRECTION_UNCLEAR:CHOP | 16 |
| WAIT_INVALID_RR:VOLATILITY_INSUFFICIENT | 3 |
