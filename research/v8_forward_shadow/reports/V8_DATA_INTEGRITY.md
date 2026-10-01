# V8_DATA_INTEGRITY

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.870Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

Checked on every decision: window length 499 per timeframe, monotonic and aligned timestamps, no forming bar (bar + timeframe ≤ decision time), OHLC geometry, decision bar = last completed 5m bar. Inputs are hashed per decision and archived first-seen; later broker revisions of a confirmed bar are logged, never used to repair a past decision.

| Check (V8 decisions) | PASS | FAIL |
|---|---|---|
| 5m_length | 1 | 0 |
| 5m_monotonic | 1 | 0 |
| 5m_aligned | 1 | 0 |
| 5m_no_forming_bar | 1 | 0 |
| 5m_geometry | 1 | 0 |
| 15m_length | 1 | 0 |
| 15m_monotonic | 1 | 0 |
| 15m_aligned | 1 | 0 |
| 15m_no_forming_bar | 1 | 0 |
| 15m_geometry | 1 | 0 |
| 30m_length | 1 | 0 |
| 30m_monotonic | 1 | 0 |
| 30m_aligned | 1 | 0 |
| 30m_no_forming_bar | 1 | 0 |
| 30m_geometry | 1 | 0 |
| 1H_length | 1 | 0 |
| 1H_monotonic | 1 | 0 |
| 1H_aligned | 1 | 0 |
| 1H_no_forming_bar | 1 | 0 |
| 1H_geometry | 1 | 0 |
| 5m_complete_decision_bar | 1 | 0 |

| Item | V8 | CONTROL |
|---|---|---|
| Decisions failing integrity (recorded DATA_UNAVAILABLE) | 0 | 0 |
| STALE_DATA decisions (V8 fails closed; CONTROL decides) | 0 | stale inputs used: 0 |
| DATA_UNAVAILABLE decisions | 0 | 0 |
| Duplicate signals suppressed | 0 | 0 |
| Broker revisions of archived confirmed bars | 0 | |
| Restart determinism | decision id = hash(schema, engine, symbol, timeframe, bar time); a restarted runner never re-decides a bar | |
