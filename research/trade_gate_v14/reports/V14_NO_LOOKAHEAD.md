# V14_NO_LOOKAHEAD

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## What the gate can see at bar i
- **Inputs:** the record of bar i (built by the frozen engine from completed bars ≤ i) and the gate's prior state.
- **Position state:** for a hypothetical position the gate only knows whether it is still open; a close is applied only after its exit bar has passed.

## Checks
| Check | Result |
|---|---|
| Prefix stability: decisions on the first 20,000 HOLD bars alone = the first 20,000 decisions of the full run | PASS |
| Unit test: corrupting a later bar never changes an earlier decision | PASS |
| Adapters read no future field (forward-shadow and replay inputs are per-bar records) | PASS (by construction) |

## Position lifecycle (exit unknown one bar before it happens, known at it; simulator truncated at the decision bar)
| Split | Configuration | Hypothetical trades | Lookahead violations |
|---|---|---|---|
| DEV | ILLUSTRATIVE_PCT_0_50_10K | 1141 | 0 |
| DEV | ILLUSTRATIVE_CURRENT_10K | 675 | 0 |
| HOLD | ILLUSTRATIVE_PCT_0_50_10K | 1541 | 0 |
| HOLD | ILLUSTRATIVE_CURRENT_10K | 792 | 0 |

**NO_LOOKAHEAD = PASS.**
