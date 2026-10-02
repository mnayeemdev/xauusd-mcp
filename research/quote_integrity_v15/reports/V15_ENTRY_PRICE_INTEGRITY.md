# V15_ENTRY_PRICE_INTEGRITY

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Side of market
- **BUY:** executable price = ASK.
- **SELL:** executable price = BID.
- **Mid:** never an execution price (unit test).

## Structural SL integrity at the side price (existing production rule)
- **The recheck:** for a valid entry with a valid quote, the wrapper applies the production executable-geometry recheck `evaluateExecutableGeometry` (minEffectiveRr 1.70) at the side price.
  - Price beyond the structural stop → WAIT_INVALID_SL.
  - Effective RR below 1.70 → WAIT_INVALID_RR.
- **Drift:** the production entry-drift limit (2.0 USD between the engine entry and the side price) → WAIT_BROKER_UNSAFE.
- **The SL is never moved;** an invalid risk calculation is rejected (unit tests).
- **Source of each price:** `quote.ask` / `quote.bid` from `symbol_info_tick` (raw broker prices). The engine entry is the confirmed bar close (unchanged).
