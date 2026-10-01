# V8_CORE_EXECUTION_REVIEW

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:57:45.319Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:55:00.000Z (0 d 0 h 56 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Evidence for the owner's review of core execution. There is no automatic verdict and no completion gate.

| Measure | V8 CONTROL (production, same inputs) | V8 CORRECTED SHADOW |
|---|---|---|
| Valid setups / shadow signals | 1 / 1 | 1 / 1 |
| Pattern / setup / trigger parity (stage mismatches) | 0 | 0 |
| Specification violations on setups (D1-D6) | 3 | 0 |
| Missed / incorrect blocks / late | 0 / 0 / 0 | 0 / 0 / 0 |
| Invalid setups incorrectly accepted | 1 | 0 |
| Wrong-direction (labelled) | 0.0 % | 0.0 % |
| Valid losses / implementation errors | 0 / 1 | 1 / 0 |
| Expectancy (R, 1.70R, NORMAL) | -1.280 | -1.280 |
| PF | 0.00 | 0.00 |
| MFE / MAE (R) | 0.61 / 1.35 | 0.61 / 1.35 |
| 1.70R reach | 0.0 % | 0.0 % |
| Max DD (R, per-signal sequence) | 1.28 | 1.28 |
| STRESS expectancy (R) | -1.379 | -1.379 |

Core rule correctness (V8): **NO RULE VIOLATION OBSERVED SO FAR**. How to read it: V8 is correct while its replay parity, D1-D6 regressions, stage parity, implementation errors, missed setups and incorrect blocks stay at zero. CONTROL violations show the defects V8 removes. The owner decides when the observation period is long enough.
