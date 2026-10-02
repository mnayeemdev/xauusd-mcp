# V8_MISSED_SETUP_FORWARD

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.336Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Move events (≥ 3 ATR within 24 bars before 1 ATR adverse, the V3–V8 definition) are evaluated only after 24 bars have passed; the decisions examined are the ones recorded at their original timestamps (no hindsight signals).

| Class | V8 |
|---|---|
| DETECTED_CORRECTLY | 0 |
| MISSED | 0 |
| DETECTED_LATE | 0 |
| BLOCKED_CORRECTLY | 2 |
| BLOCKED_INCORRECTLY | 0 |
| UNCERTAIN | 5 |

| Class | CONTROL |
|---|---|
| DETECTED_CORRECTLY | 0 |
| MISSED | 0 |
| DETECTED_LATE | 0 |
| BLOCKED_CORRECTLY | 0 |
| BLOCKED_INCORRECTLY | 0 |
| UNCERTAIN | 7 |

MISSED_VALID_SETUP_COUNT (V8) = 0; INCORRECT_BLOCK_COUNT (V8) = 0; LATE (V8) = 0.

## Events
| Onset (UTC) | Direction | V8 | V8 reason | CONTROL | CONTROL reason |
|---|---|---|---|---|---|
| 2026-10-01T12:30 | SELL | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) |
| 2026-10-01T14:35 | SELL | BLOCKED_CORRECTLY | governed rule: RR_INVALID RR to the structural objective below 1.70 | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) |
| 2026-10-01T16:40 | BUY | BLOCKED_CORRECTLY | governed rule: RR_INVALID RR to the structural objective below 1.70 | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) |
| 2026-10-02T00:25 | SELL | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) | UNCERTAIN | no existing model showed its trigger in the move direction (not one of the defined patterns) |
| 2026-10-02T02:25 | BUY | UNCERTAIN | no forward decision recorded around the move (runner not running) | UNCERTAIN | no forward decision recorded around the move (runner not running) |
| 2026-10-02T04:35 | BUY | UNCERTAIN | no forward decision recorded around the move (runner not running) | UNCERTAIN | no forward decision recorded around the move (runner not running) |
| 2026-10-02T06:40 | BUY | UNCERTAIN | no forward decision recorded around the move (runner not running) | UNCERTAIN | no forward decision recorded around the move (runner not running) |
