# V8_OVER_CORRECTION_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:57:45.318Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:55:00.000Z (0 d 0 h 56 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

| Measure | V8 | CONTROL |
|---|---|---|
| Counted signals | 1 | 1 |
| WAIT share of decisions | 75.0 % | 75.0 % |
| BUY share of signals | 100.0 % | 100.0 % |
| Model mix | MC 0, PB 0, BO 1, SR 0, MR 0 | MC 0, PB 0, BO 1, SR 0, MR 0 |
| Mean bars from origin | 3.00 | 3.00 |
| Move events detected correctly | 0 | 0 |
| CONTROL signals not produced by V8 (outcome mean R) | 0 (—) | |

OVER_CORRECTION_CANDIDATE flags (descriptive, computed on whatever has been observed; the sample size is shown and small samples are noisy): none. No code is changed because of a flag; flags are evidence for the owner's review.
