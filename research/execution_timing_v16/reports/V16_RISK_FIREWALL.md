# V16_RISK_FIREWALL

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Risk can only reject
- **PRIMARY (RISK_PERCENTAGE UNRESOLVED) never returns TRADE_ELIGIBLE:** YES. A still-valid entry ends as VALID_ENTRY + RISK_REJECTED (WAIT_RISK_UNSAFE: RISK_PERCENTAGE_UNRESOLVED).
- **ILLUSTRATIVE (0.50 % of 10,000 USD)** is a research illustration and not an approved risk.
- **Risk is sized from the execution price and the original structural SL.**
- **The entry is protected twice:**
  - V14 throws if the risk layer changes the entry hash;
  - V16 hashes the original identity before and after.
- **Risk rejection keeps the entry valid:** RISK_REJECTED → `entry_revalidated = true`, and the identity is unchanged.
- **Broker rejection:** fail closed, no retry, no size change.
- **Duplicate delivery:** blocked by the existing exposure rule.
- **RR = 1.70 on every revalidated entry:** YES.
