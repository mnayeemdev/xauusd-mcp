# V8_STRATEGY_FORWARD_BREAKDOWN

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.336Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

## V8 corrected
| Model | Observations (pattern+) | Triggers | Valid setups | Shadow signals | Labelled | Missed / late move events | Wrong-direction | Valid losses | 1.70R reach | MFE / MAE (R) | Expectancy (R) | PF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MC | 20 | 6 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| PB | 81 | 23 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| BO | 44 | 20 | 4 | 4 | 4 | — | 0 | 2 | 50.0 % | 4.00 / 2.63 | 0.114 | 1.16 |
| SR | 19 | 1 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| MR | 80 | 11 | 1 | 1 | 1 | — | 1 | 1 | 0.0 % | 0.00 / 1.79 | -1.551 | 0.00 |

## CONTROL
| Model | Observations (pattern+) | Triggers | Valid setups | Shadow signals | Labelled | Missed / late move events | Wrong-direction | Valid losses | 1.70R reach | MFE / MAE (R) | Expectancy (R) | PF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MC | 20 | 6 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| PB | 81 | 15 | 0 | 0 | 0 | — | 0 | 0 | — | — / — | — | — |
| BO | 39 | 20 | 7 | 3 | 3 | — | 0 | 0 | 33.3 % | 4.02 / 2.95 | -0.403 | 0.58 |
| SR | 19 | 1 | 1 | 1 | 1 | — | 0 | 0 | 0.0 % | 1.50 / 1.58 | -1.560 | 0.00 |
| MR | 34 | 14 | 1 | 1 | 1 | — | 0 | 0 | 0.0 % | 1.02 / 3.26 | -1.601 | 0.00 |

Missed / late move events are attributed per engine in V8_MISSED_SETUP_FORWARD (an event is not tied to a single model).
