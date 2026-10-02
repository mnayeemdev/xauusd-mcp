# V15_SPREAD_INTEGRITY

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Spread = ask − bid, raw USD; spread_points = spread ÷ point
- **Live:** min 0.24, p50 0.24, max 0.26 USD; 0 negative.
- **Platform:** the recorded spread is 240 points (V10).
- **Preservation:** the raw value is kept in every quote record, and the forward-shadow records keep both `quote.spread` and `spread_usd`.
- **No new spread filter.** The only spread rule remains the EXISTING production limit maxSpreadUsd = 0.60 USD (V11 fail-safe), applied by the gate using the live spread.
