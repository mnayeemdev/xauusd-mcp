# V8_TIMING_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:47:29.408Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:45:00.000Z (0 d 0 h 46 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

| Item | V8 | CONTROL |
|---|---|---|
| Decision latency after the 5m close (all forward decisions) | median 10 s, p90 12 s, max 12 s | median 10 s, p90 12 s, max 12 s |
| Mean bars from setup origin to signal | 3.00 | 3.00 |
| Signals later than the model limit (MC/PB/MR 3, BO 10, SR 0) | 0 | 0 |
| DETECTED_LATE move events | 0 | 0 |
| Decisions taken more than 120 s after the close (not counted) | 1 | 1 |

The decision is taken on the last COMPLETED 5m candle (forming bar excluded on every timeframe, integrity-checked per decision); entry = that candle's close (hypothetical).
