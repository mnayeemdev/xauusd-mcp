# V8_300_SIGNAL_FINAL_REPORT

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.871Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

**PENDING**: 1 of 300 forward V8 signals (1 awaiting their hypothetical outcome). The analysis below is the pre-registered method applied to the current sample; it becomes final only when 300 signals are frozen and labelled.

| Measure | V8 CONTROL (production, same inputs) | V8 CORRECTED SHADOW |
|---|---|---|
| Signals | 1 | 1 |
| Pattern / setup / trigger parity (stage mismatches) | 0 | 0 |
| Specification violations on setups (D1–D6) | 1 | 0 |
| Missed / incorrect blocks / late | 0 / 0 / 0 | 0 / 0 / 0 |
| Wrong-direction (labelled) | — | — |
| Valid losses / implementation errors | 0 / 0 | 0 / 0 |
| Expectancy (R, 1.70R, NORMAL) | — | — |
| PF | — | — |
| MFE / MAE (R) | — / — | — / — |
| 1.70R reach | — | — |
| Max DD (R, per-signal sequence) | — | — |
| STRESS expectancy (R) | — | — |

CORE_EXECUTION = **INCONCLUSIVE** (collecting: 1 / 300 forward V8 signals). Decision rule (pre-registered): REGRESSED if any V8 correctness check fails or an over-correction flag is active; IMPROVED if V8 is clean and CONTROL shows ≥ 1 specification violation per 100 signals that V8 removes; UNCHANGED if V8 is clean and CONTROL violations are below 1 per 100; INCONCLUSIVE before the frozen 300.
