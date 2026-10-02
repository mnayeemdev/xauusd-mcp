# V15_TEST_RESULTS

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

| Suite | Pass / total |
|---|---|
| V15 tests (tests/quote_integrity_v15.test.js) | 27 / 27 (fail 0, skipped 0) |
| V8 forward shadow + authority isolation (runner / reader changes) | 40 / 40 (fail 0, skipped 0) |
| unit suite (npm run test:unit) | 2676 / 2676 (fail 0, skipped 0) |
| freeze suite (npm run test:freeze) | 527 / 527 (fail 0, skipped 0) |

The V15 tests cover every case in the owner's list:
- fresh quote, stale quote, missing quote timestamp, missing quote age, negative quote age, future timestamp;
- out-of-order timestamp, duplicate quote;
- bid missing, ask missing, invalid bid, invalid ask, negative spread;
- clock drift, delayed quote;
- restart, replay, same-input same-decision, no-lookahead, fail-closed.

They also cover side-of-market pricing, legacy data never fabricated, the live-gate wrapper, and the runner / reader contract.
