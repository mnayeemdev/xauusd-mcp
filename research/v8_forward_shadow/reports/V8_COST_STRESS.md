# V8_COST_STRESS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:47:29.408Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:45:00.000Z (0 d 0 h 46 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

NORMAL = spread 0.24 + slippage 0.10 USD; STRESS = 0.60 + 0.20 USD; entry pays the spread (BUY), exit pays slippage; broker fail-safe 1.5R + spread intrabar; thesis invalidation on a confirmed close beyond the structural stop; 288-bar horizon; swap 0.56 USD per BUY night.

| Set | n | Win | Avg win / loss (R) | Expectancy (R) | PF | Max DD (R) | Loss streak | MFE / MAE (R) | 1.70R reach | Give-back (R) | Duration (bars) | Wrong-direction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V8 per signal · 1.70R · NORMAL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |
| V8 per signal · 1.70R · STRESS | 1 | 0.0 % | — / 1.38 | -1.379 | 0.00 | 1.38 | 1 | 0.61 / 1.35 | 0.0 % | 1.91 | 2.00 | 0.0 % |
| V8 per signal · engine TP2 · NORMAL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |
| V8 per signal · engine TP2 · STRESS | 1 | 0.0 % | — / 1.38 | -1.379 | 0.00 | 1.38 | 1 | 0.61 / 1.35 | 0.0 % | 1.91 | 2.00 | 0.0 % |
| V8 one position at a time · 1.70R · NORMAL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |
| V8 one position at a time · 1.70R · STRESS | 1 | 0.0 % | — / 1.38 | -1.379 | 0.00 | 1.38 | 1 | 0.61 / 1.35 | 0.0 % | 1.91 | 2.00 | 0.0 % |
| CONTROL per signal · 1.70R · NORMAL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |
| CONTROL per signal · 1.70R · STRESS | 1 | 0.0 % | — / 1.38 | -1.379 | 0.00 | 1.38 | 1 | 0.61 / 1.35 | 0.0 % | 1.91 | 2.00 | 0.0 % |
| CONTROL one position · 1.70R · NORMAL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |

No edge is claimed before costs or on an interim sample.
