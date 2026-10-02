# V16_TEST_RESULTS

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

| Suite | Pass / total |
|---|---|
| V16 tests (tests/execution_timing_v16.test.js) | 27 / 27 (fail 0, skipped 0) |
| V8 forward shadow + authority isolation (runner / reader changes) | 40 / 40 (fail 0, skipped 0) |
| unit suite (npm run test:unit) | 2703 / 2703 (fail 0, skipped 0) |
| freeze suite (npm run test:freeze) | 554 / 554 (fail 0, skipped 0) |

The V16 tests cover every case in the owner's §31 list:
- **Delays:** 0, 1, 2, 3, 4, 5 and 6 s.
- **Invalidation:**
  - signal invalidated before execution;
  - direction change;
  - trigger disappears;
  - location, SL or RR becomes invalid.
- **Rejection:** risk rejection, broker rejection.
- **Data problems:** stale data, missing quote, future timestamp, clock mismatch.
- **System:** restart, duplicate signal, replay, no-lookahead.

They also cover the tracker semantics, the no-offset scan, the field contract, the probe orchestrator and the runner integration (fake read-only reader, injected timing).
