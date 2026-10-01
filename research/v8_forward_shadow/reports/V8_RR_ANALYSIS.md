# V8_RR_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:47:29.408Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:45:00.000Z (0 d 0 h 46 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

TP = entry ± 1.70 × structural risk distance. Verified per signal: |TP − entry| / risk = 1.70 (tolerance 0.002 for 3-decimal rounding of stored prices).

| | V8 | CONTROL |
|---|---|---|
| Signals | 1 | 1 |
| 1.70R TP mismatches | 0 | 0 |
| Engine RR below 1.70 before rounding (D5) | 0 | 0 |
| Mean engine TP2 RR | 2.09 | 2.09 |

The hypothetical outcome uses the fixed 1.70R target (owner rule); the engine's structural TP2 (≥ 1.70R) is tracked as a secondary series (V8_COST_STRESS).
