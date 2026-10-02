# V14_RISK_FIREWALL

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## Invariant (V11, preserved)
Risk can only ACCEPT or REJECT; it never modifies entry validity.
- **Rejected entries stay valid:** a valid entry rejected by risk is recorded as VALID_ENTRY + RISK_REJECTED, never INVALID_ENTRY or MODIFIED_ENTRY.
- **Enforced in code:** if the V11 integration ever returned a changed entry hash, the gate throws. This never happened.

| Split | Configuration | Engine signals | Valid entries | Risk-rejected valid entries | Broker rejections | TRADE_ELIGIBLE |
|---|---|---|---|---|---|---|
| DEV | PRIMARY | 4,858 | 4,858 | 4,858 | 0 | 0 |
| DEV | ILLUSTRATIVE_PCT_0_50_10K | 4,858 | 4,858 | 3,339 | 0 | 1,141 |
| DEV | ILLUSTRATIVE_CURRENT_10K | 4,858 | 2,995 | 2,122 | 0 | 675 |
| HOLD | PRIMARY | 6,553 | 6,553 | 6,553 | 0 | 0 |
| HOLD | ILLUSTRATIVE_PCT_0_50_10K | 6,553 | 6,553 | 4,404 | 0 | 1,541 |
| HOLD | ILLUSTRATIVE_CURRENT_10K | 6,553 | 3,522 | 2,463 | 0 | 792 |

- **PRIMARY:** every valid entry is risk-rejected because RISK_PERCENTAGE is UNRESOLVED; an unresolved risk model can never approve.
- **Illustrative PCT parity:** it reproduces the V11 integration exactly (DEV 1141 / 1141 trades, end 7833.42 / 7833.42; HOLD 1541 / 1541, end 8881.08 / 8881.08).
- **No risk increase after a loss:** the size is always equity × r (V10 library), and the production consecutive-loss breaker halts entries.
