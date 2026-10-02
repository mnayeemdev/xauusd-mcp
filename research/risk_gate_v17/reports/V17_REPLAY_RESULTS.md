# V17_REPLAY_RESULTS

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

| Split | Deterministic (two runs) | Restart from serialized state = uninterrupted | Hash |
|---|---|---|---|
| DEV | YES | YES | da326e33975658477de78fe6525ab7615e3c7009d2db65ea1cd6eb916627f389 |
| HOLD | YES | YES | 75477244428b2950f21a904d9ae86b9b414e8822c786b6527b7572c7bf562834 |

## No-lookahead
- **Sizing and decisions read only entry-time inputs:** equity, execution price, SL, spread and broker data. A test adds outcome fields to the inputs, and nothing changes.
- **Envelope swap:** a DEV-frozen constant, not a per-entry count from future bar times (CORRECTION_LOG D1).
- **Realized components** are measured after the decision, from the bars after entry. They are outcome measurement and never fed back into a decision.
- **Freeze:** written before HOLDOUT; its hash is verified on every FULL run.
