# V8_RR_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.870Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

TP = entry ± 1.70 × structural risk distance. Verified per signal: |TP − entry| / risk = 1.70 (tolerance 0.002 for 3-decimal rounding of stored prices).

| | V8 | CONTROL |
|---|---|---|
| Signals | 1 | 1 |
| 1.70R TP mismatches | 0 | 0 |
| Engine RR below 1.70 before rounding (D5) | 0 | 0 |
| Mean engine TP2 RR | 2.09 | 2.09 |

The hypothetical outcome uses the fixed 1.70R target (owner rule); the engine's structural TP2 (≥ 1.70R) is tracked as a secondary series (V8_COST_STRESS).
