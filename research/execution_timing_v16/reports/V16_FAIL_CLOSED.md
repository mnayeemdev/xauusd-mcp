# V16_FAIL_CLOSED

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

| Case | Decision |
|---|---|
| missing signal / decision / quote / receipt / bar timestamp | WAIT_STALE_DATA (MISSING_*) |
| quote received after the decision; signal after the decision | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR) |
| tick older than the decision bars; tick two bars ahead; broker time backwards | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR) |
| missing quote; tick arrival not witnessed (restart) | WAIT_STALE_DATA |
| quote older than 6 s | WAIT_STALE_DATA |
| signal older than 6 s | WAIT_SIGNAL_EXPIRED |
| bid / ask missing, ≤ 0, ask < bid | WAIT_BROKER_UNSAFE |
| current engine state unavailable | WAIT_STALE_DATA |
| engine no longer signals / identity changed | V14 WAIT state / WAIT_SIGNAL_CHANGED |
| execution geometry invalid | WAIT_INVALID_SL / LOCATION / RR / BROKER_UNSAFE |
| spread / news / shock | WAIT_SAFETY_BREAKER |
| risk unresolved or rejected; broker rejection; platform spec missing | WAIT_RISK_UNSAFE / WAIT_BROKER_UNSAFE |
| revalidation code error | WAIT_SAFETY_BREAKER (REVALIDATION_ERROR) |

- **Normal delay never fails closed by itself.** A 1–6 s execution delay is not a failure.
