# V8_FORWARD_SHADOW_REPORT

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.336Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

| Evidence | V8 corrected | CONTROL |
|---|---|---|
| OBSERVATION_START | 2026-10-01T11:58:45.000Z | same |
| OBSERVATION_END (last decided candle close) | 2026-10-02T10:30:00.000Z | same |
| ELAPSED_TIME | 0 d 22 h 31 min | same |
| Market candles observed (forward decisions) | 81 | 81 |
| Late / non-forward decisions (never counted) | 3 | 3 |
| TOTAL_CANDIDATES (a model produced a candidate) | 30 | 33 |
| VALID_SETUPS (full core rule chain passed, non-duplicate) | 5 | 9 |
| SHADOW SIGNALS (after execution safety; EXECUTED = FALSE) | 5 | 5 |
| MISSED_VALID_SETUPS | 0 | 0 |
| INCORRECT_BLOCKS | 0 | 0 |
| INVALID_SETUPS_INCORRECTLY_ACCEPTED | 0 | 8 |
| LATE_SIGNALS | 0 | 0 |
| WRONG_DIRECTION_DECISIONS | 1 | 0 |
| VALID_LOSING_TRADES | 3 | 0 |
| IMPLEMENTATION_ERRORS | 0 | 8 |
| D1-D6 REGRESSIONS (violations, all decisions) | 0 | 101 |
| Move events classified | 7 | 7 |
| Replay parity checked / mismatches | 16 / 0 | 20 / 0 |

## Primary audit (every genuine setup answered against the 10 owner questions)
| Class | V8 corrected | CONTROL |
|---|---|---|
| DETECTED_CORRECTLY | 2 | 1 |
| MISSED | 0 | 0 |
| DETECTED_LATE | 0 | 0 |
| BLOCKED_CORRECTLY | 0 | 0 |
| BLOCKED_INCORRECTLY | 0 | 0 |
| VALID_LOSING_TRADE | 3 | 0 |
| IMPLEMENTATION_ERROR | 0 | 8 |
| UNKNOWN | 0 | 0 |

Setup-level classes come from the per-setup checks (V8_FORWARD_SIGNAL_LOG); MISSED, and the event-level part of BLOCKED_INCORRECTLY and DETECTED_LATE, come from the move events (V8_MISSED_SETUP_FORWARD).

Strategy / model distribution of valid setups: V8 MC 0, PB 0, BO 4, SR 0, MR 1 · CONTROL MC 0, PB 0, BO 7, SR 1, MR 1.

Core rule correctness (V8): **NO RULE VIOLATION OBSERVED SO FAR**. Zero setups in a period is a valid observation; no minimum count is required and no rule is changed during observation. DEMO_ELIGIBLE = **NO** (owner review only; never automatic).

## Hypothetical economics (per counted signal, 1.70R target, NORMAL cost)
| Set | n | Win | Avg win / loss (R) | Expectancy (R) | PF | Max DD (R) | Loss streak | MFE / MAE (R) | 1.70R reach | Give-back (R) | Duration (bars) | Wrong-direction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V8 | 5 | 40.0 % | 1.66 / 1.47 | -0.219 | 0.75 | 3.14 | 2 | 3.20 / 2.46 | 40.0 % | 1.74 | 1.80 | 20.0 % |
| CONTROL | 5 | 20.0 % | 1.66 / 1.51 | -0.874 | 0.27 | 4.75 | 3 | 2.92 / 2.74 | 20.0 % | 2.26 | 4.20 | 0.0 % |

A few winning or losing trades prove neither success nor failure.

## Safety assertions
REAL_TRADE_PLACED NO · DEMO_TRADE_PLACED NO · POSITION_MODIFIED NO · EXECUTION_AUTHORITY NONE · SILVER_EXECUTION OFF · DOM_EXECUTION OFF · CAPITAL_HARVEST OFF · AUTO_SCALING OFF · MARTINGALE OFF · AVERAGING_DOWN OFF · RR 1.70 · LOT 0.01.
