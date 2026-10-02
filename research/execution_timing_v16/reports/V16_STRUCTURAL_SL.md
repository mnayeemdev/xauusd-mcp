# V16_STRUCTURAL_SL

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Never moved, widened or tightened by delay
- **Every grid decision keeps the original structural SL:** YES. A firewall hash of the original identity is checked on every record.
- **A revised engine SL is not adopted.** If a bar revision changes the engine's SL (STRUCTURAL_SL_REVISED), the result is WAIT_SIGNAL_CHANGED.
- **SL validity at execution** uses existing rules only:
  - price not beyond the SL (PRICE_BEYOND_STRUCTURAL_STOP);
  - the engine's minimum risk of 0.5 ATR (RISK_BELOW_ENGINE_MIN_AT_EXECUTION).
- **Output precision:** the engine rounds its stop to 2 decimals after applying the minimum. Half a cent (0.005 USD) is therefore the only tolerance, and it is documented in the code.

## Consequence (reported, not changed)
For a stop placed exactly at the engine minimum, a delay with an adverse move invalidates the SL rule at execution. The SL is never moved to rescue the entry; the decision is WAIT.
