# V8_WRONG_DIRECTION_FORWARD

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:57:45.318Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:55:00.000Z (0 d 0 h 56 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Every labelled signal whose hypothetical 1.70R outcome is ≤ 0 or whose open path was wrong-direction (MFE < 0.5 R and the structural stop reached) is re-verified: data integrity, staleness, timing, structure / sweep oracles (D1/D2), PB depth (D3), RR before rounding (D5), MR side (D4) and overextension, stage decomposition of the traded model, model direction rule, stop side.

| Class | V8 |
|---|---|
| VALID_LOSING_TRADE | 1 |
| PATTERN_ERROR | 0 |
| SETUP_ERROR | 0 |
| TRIGGER_ERROR | 0 |
| DIRECTION_ERROR | 0 |
| LOCATION_ERROR | 0 |
| TIMING_ERROR | 0 |
| DATA_ERROR | 0 |
| OTHER | 0 |

| Class | CONTROL |
|---|---|
| VALID_LOSING_TRADE | 0 |
| PATTERN_ERROR | 1 |
| SETUP_ERROR | 0 |
| TRIGGER_ERROR | 0 |
| DIRECTION_ERROR | 0 |
| LOCATION_ERROR | 0 |
| TIMING_ERROR | 0 |
| DATA_ERROR | 0 |
| OTHER | 0 |

VALID_LOSING_TRADES (V8) = 1; IMPLEMENTATION_ERROR_COUNT (V8) = 0.
