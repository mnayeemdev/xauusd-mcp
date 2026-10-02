# V14_STRATEGY_CONFLICT

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## Definition
A conflict is a verified engine signal while another strategy has a valid trigger on the OPPOSITE side at the same bar.
- **Replay:** uses the bias-aware trigger list.
- **Live:** uses the bias-agnostic stages.

## Existing resolution
The frozen engine evaluates the strategies in a fixed priority chain (MC → PB → BO → SR → MR, `evaluateIntradayModels`). The first candidate wins, so the existing architecture already defines a deterministic resolution.
- **When a resolution exists:** the gate records STRATEGY_CONFLICT + `EXISTING_PRIORITY` and follows the engine's own choice. No new vote, score or rule is created.
- **When no resolution is defined:** configuration `conflictResolution: null` → WAIT_CONFLICT (unit-tested).

| Split | Configuration | Strategy conflicts | Resolved by existing priority | WAIT_CONFLICT |
|---|---|---|---|---|
| DEV | PRIMARY | 36 | 36 | 0 |
| DEV | ILLUSTRATIVE_PCT_0_50_10K | 36 | 36 | 0 |
| DEV | ILLUSTRATIVE_CURRENT_10K | 21 | 21 | 0 |
| HOLD | PRIMARY | 66 | 66 | 0 |
| HOLD | ILLUSTRATIVE_PCT_0_50_10K | 66 | 66 | 0 |
| HOLD | ILLUSTRATIVE_CURRENT_10K | 24 | 24 | 0 |

ENTRY_CONFLICT and HTF_CONFLICT are engine direction conflicts with higher timeframes, not strategy disagreements. They map to WAIT_DIRECTION_UNCLEAR.
