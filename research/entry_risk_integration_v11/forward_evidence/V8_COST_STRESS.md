# V8_COST_STRESS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.337Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

NORMAL = spread 0.24 + slippage 0.10 USD; STRESS = 0.60 + 0.20 USD; entry pays the spread (BUY), exit pays slippage; broker fail-safe 1.5R + spread intrabar; thesis invalidation on a confirmed close beyond the structural stop; 288-bar horizon; swap 0.56 USD per BUY night.

| Set | n | Win | Avg win / loss (R) | Expectancy (R) | PF | Max DD (R) | Loss streak | MFE / MAE (R) | 1.70R reach | Give-back (R) | Duration (bars) | Wrong-direction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V8 per signal · 1.70R · NORMAL | 5 | 40.0 % | 1.66 / 1.47 | -0.219 | 0.75 | 3.14 | 2 | 3.20 / 2.46 | 40.0 % | 1.74 | 1.80 | 20.0 % |
| V8 per signal · 1.70R · STRESS | 5 | 40.0 % | 1.62 / 1.57 | -0.291 | 0.69 | 3.32 | 2 | 3.20 / 2.46 | 40.0 % | 1.70 | 1.80 | 20.0 % |
| V8 per signal · engine TP2 · NORMAL | 5 | 40.0 % | 2.96 / 1.47 | 0.302 | 1.34 | 3.14 | 2 | 3.20 / 2.46 | 40.0 % | 1.09 | 1.80 | 20.0 % |
| V8 per signal · engine TP2 · STRESS | 5 | 40.0 % | 2.93 / 1.57 | 0.230 | 1.25 | 3.32 | 2 | 3.20 / 2.46 | 40.0 % | 1.40 | 2.20 | 20.0 % |
| V8 one position at a time · 1.70R · NORMAL | 5 | 40.0 % | 1.66 / 1.47 | -0.219 | 0.75 | 3.14 | 2 | 3.20 / 2.46 | 40.0 % | 1.74 | 1.80 | 20.0 % |
| V8 one position at a time · 1.70R · STRESS | 5 | 40.0 % | 1.62 / 1.57 | -0.291 | 0.69 | 3.32 | 2 | 3.20 / 2.46 | 40.0 % | 1.70 | 1.80 | 20.0 % |
| CONTROL per signal · 1.70R · NORMAL | 5 | 20.0 % | 1.66 / 1.51 | -0.874 | 0.27 | 4.75 | 3 | 2.92 / 2.74 | 20.0 % | 2.26 | 4.20 | 0.0 % |
| CONTROL per signal · 1.70R · STRESS | 5 | 20.0 % | 1.61 / 1.61 | -0.970 | 0.25 | 5.08 | 3 | 2.92 / 2.74 | 20.0 % | 2.25 | 4.20 | 0.0 % |
| CONTROL one position · 1.70R · NORMAL | 5 | 20.0 % | 1.66 / 1.51 | -0.874 | 0.27 | 4.75 | 3 | 2.92 / 2.74 | 20.0 % | 2.26 | 4.20 | 0.0 % |

No edge is claimed before costs or on an interim sample.
