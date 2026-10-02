# V14_SAFETY_INVARIANTS

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

| Invariant (§19) | Unit test | Replay sweep |
|---|---|---|
| No setup → no trade | yes | 0 violations |
| No trigger → no trade (incl. an unverified engine signal) | yes | 0 |
| Unclear direction → no trade | yes | 0 |
| Invalid location → no trade | yes | 0 |
| Invalid SL → no trade | yes | 0 |
| Invalid RR → no trade | yes | 0 |
| Unsafe risk → no trade (unresolved, minimum lot, margin, exposure) | yes | 0 |
| Stale data → no trade | yes | 0 |
| Broker unsafe → no trade | yes | 0 |
| Safety breaker → no trade (production limits, kill switch, recorded block) | yes | 0 |
| Strategy conflict without a defined resolution → no trade | yes | 0 |
| No entry the engine did not generate | yes | 0 (live) / 0 (replay) |
| Every WAIT has a deterministic reason | yes | 0 |

The invariant sweep re-checks every audit record independently of the decision path: 298,429 decisions across both splits, three configurations and the live records, with **0 violations**.
