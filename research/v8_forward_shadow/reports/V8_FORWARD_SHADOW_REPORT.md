# V8_FORWARD_SHADOW_REPORT

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:57:45.318Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:55:00.000Z (0 d 0 h 56 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

| Evidence | V8 corrected | CONTROL |
|---|---|---|
| OBSERVATION_START | 2026-10-01T11:58:45.000Z | same |
| OBSERVATION_END (last decided candle close) | 2026-10-01T12:55:00.000Z | same |
| ELAPSED_TIME | 0 d 0 h 56 min | same |
| Market candles observed (forward decisions) | 12 | 12 |
| Late / non-forward decisions (never counted) | 1 | 1 |
| TOTAL_CANDIDATES (a model produced a candidate) | 4 | 4 |
| VALID_SETUPS (full core rule chain passed, non-duplicate) | 1 | 1 |
| SHADOW SIGNALS (after execution safety; EXECUTED = FALSE) | 1 | 1 |
| MISSED_VALID_SETUPS | 0 | 0 |
| INCORRECT_BLOCKS | 0 | 0 |
| INVALID_SETUPS_INCORRECTLY_ACCEPTED | 0 | 1 |
| LATE_SIGNALS | 0 | 0 |
| WRONG_DIRECTION_DECISIONS | 0 | 0 |
| VALID_LOSING_TRADES | 1 | 0 |
| IMPLEMENTATION_ERRORS | 0 | 1 |
| D1-D6 REGRESSIONS (violations, all decisions) | 0 | 9 |
| Move events classified | 0 | 0 |
| Replay parity checked / mismatches | 3 / 0 | 3 / 0 |

## Primary audit (every genuine setup answered against the 10 owner questions)
| Class | V8 corrected | CONTROL |
|---|---|---|
| DETECTED_CORRECTLY | 0 | 0 |
| MISSED | 0 | 0 |
| DETECTED_LATE | 0 | 0 |
| BLOCKED_CORRECTLY | 0 | 0 |
| BLOCKED_INCORRECTLY | 0 | 0 |
| VALID_LOSING_TRADE | 1 | 0 |
| IMPLEMENTATION_ERROR | 0 | 1 |
| UNKNOWN | 0 | 0 |

Setup-level classes come from the per-setup checks (V8_FORWARD_SIGNAL_LOG); MISSED, and the event-level part of BLOCKED_INCORRECTLY and DETECTED_LATE, come from the move events (V8_MISSED_SETUP_FORWARD).

Strategy / model distribution of valid setups: V8 MC 0, PB 0, BO 1, SR 0, MR 0 · CONTROL MC 0, PB 0, BO 1, SR 0, MR 0.

Core rule correctness (V8): **NO RULE VIOLATION OBSERVED SO FAR**. Zero setups in a period is a valid observation; no minimum count is required and no rule is changed during observation. DEMO_ELIGIBLE = **NO** (owner review only; never automatic).

## Hypothetical economics (per counted signal, 1.70R target, NORMAL cost)
| Set | n | Win | Avg win / loss (R) | Expectancy (R) | PF | Max DD (R) | Loss streak | MFE / MAE (R) | 1.70R reach | Give-back (R) | Duration (bars) | Wrong-direction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V8 | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |
| CONTROL | 1 | 0.0 % | — / 1.28 | -1.280 | 0.00 | 1.28 | 1 | 0.61 / 1.35 | 0.0 % | 1.89 | 2.00 | 0.0 % |

A few winning or losing trades prove neither success nor failure.

## Safety assertions
REAL_TRADE_PLACED NO · DEMO_TRADE_PLACED NO · POSITION_MODIFIED NO · EXECUTION_AUTHORITY NONE · SILVER_EXECUTION OFF · DOM_EXECUTION OFF · CAPITAL_HARVEST OFF · AUTO_SCALING OFF · MARTINGALE OFF · AVERAGING_DOWN OFF · RR 1.70 · LOT 0.01.
