# V14_REPLAY_VALIDATION

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

| Check | Result |
|---|---|
| Chronological replay deterministic: PRIMARY (two runs, identical record hash) | PASS |
| Chronological replay deterministic: illustrative CURRENT with breakers and positions | PASS |
| Restart from serialized gate + market state at bar 26,394 = uninterrupted | PASS |
| Duplicate bar / older bar after a decision | WAIT_STALE_DATA:OUT_OF_ORDER_OR_DUPLICATE_BAR; WAIT_STALE_DATA:OUT_OF_ORDER_OR_DUPLICATE_BAR |
| Illustrative PCT 0.50 % reproduces the V11 integration exactly (trades and end equity, DEV + HOLD) | PASS |
| Same input + same state = same decision (1,000 repeats, unit test) | PASS |
| Re-running after the discrepancy-flag change: results byte-identical | PASS |
