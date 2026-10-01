# V8_STRATEGY_FORWARD_BREAKDOWN

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:57:45.318Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:55:00.000Z (0 d 0 h 56 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

## V8 corrected
| Model | Observations (pattern+) | Triggers | Valid setups | Shadow signals | Labelled | Missed / late move events | Wrong-direction | Valid losses | 1.70R reach | MFE / MAE (R) | Expectancy (R) | PF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MC | 2 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| PB | 12 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| BO | 8 | 4 | 1 | 1 | 1 | — | 0 | 1 | 0.0 % | 0.61 / 1.35 | -1.280 | 0.00 |
| SR | 4 | 1 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| MR | 12 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |

## CONTROL
| Model | Observations (pattern+) | Triggers | Valid setups | Shadow signals | Labelled | Missed / late move events | Wrong-direction | Valid losses | 1.70R reach | MFE / MAE (R) | Expectancy (R) | PF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MC | 2 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| PB | 12 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| BO | 8 | 4 | 1 | 1 | 1 | — | 0 | 0 | 0.0 % | 0.61 / 1.35 | -1.280 | 0.00 |
| SR | 4 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| MR | 4 | 0 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |

Missed / late move events are attributed per engine in V8_MISSED_SETUP_FORWARD (an event is not tied to a single model).
