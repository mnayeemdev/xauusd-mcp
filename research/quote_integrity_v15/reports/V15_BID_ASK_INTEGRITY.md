# V15_BID_ASK_INTEGRITY

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Rules (fail closed, never repaired)
- bid > 0; ask > 0; ask ≥ bid; spread ≥ 0.
- A missing or invalid value → INVALID_QUOTE → WAIT_BROKER_UNSAFE.

## Live
- **Observations:** 687 / 687 returned a tick, and every bid / ask passed: 0 BID / ASK reasons in INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT: 682; VALID: 5.
- **Spread:** min 0.24, p50 0.24, max 0.26; 0 negative.

## Unit tests
Bid missing, ask missing, invalid bid (0), invalid ask (−1) and ask below bid each fail closed with the exact reason (tests/quote_integrity_v15.test.js).
