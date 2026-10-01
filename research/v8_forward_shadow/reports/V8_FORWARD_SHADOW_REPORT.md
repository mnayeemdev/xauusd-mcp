# V8_FORWARD_SHADOW_REPORT

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.869Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

| Counter | V8 corrected | CONTROL |
|---|---|---|
| Forward decisions (FORWARD_LIVE bars) | 1 | 1 |
| Late / non-forward decisions (never counted) | 1 | 1 |
| **FORWARD_VALID_SETUP_COUNT** (core rule chain passed, non-duplicate) | **1** | 1 |
| **FORWARD_SIGNAL_COUNT** (after execution safety, non-duplicate) | **1** | 1 |
| Labelled hypothetical outcomes | 0 | 0 |
| Move events classified | 0 | 0 |
| Replay parity checked / mismatches | 1 / 0 | 1 / 0 |
| D1–D6 violations (all decisions) | 0 | 1 |

Checkpoints (25 / 50 / 100 / 150 / 200 / 250 / 300 signals): reached []. Conclusion: **INCONCLUSIVE** — collecting: 1 / 300 forward V8 signals. DEMO_ELIGIBLE = **NO**.

## Hypothetical economics (per counted signal, 1.70R target, NORMAL cost)
| Set | n | Win | Avg win / loss (R) | Expectancy (R) | PF | Max DD (R) | Loss streak | MFE / MAE (R) | 1.70R reach | Give-back (R) | Duration (bars) | Wrong-direction |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V8 | 0 | — | — / — | — | — | — | — | — / — | — | — | — | — |
| CONTROL | 0 | — | — / — | — | — | — | — | — / — | — | — | — | — |

A short forward sample proves nothing about profitability; no rule is changed at any checkpoint.

## Safety assertions
REAL_TRADE_PLACED NO · DEMO_TRADE_PLACED NO · POSITION_MODIFIED NO · EXECUTION_AUTHORITY NONE · SILVER_EXECUTION OFF · DOM_EXECUTION OFF · CAPITAL_HARVEST OFF · AUTO_SCALING OFF · MARTINGALE OFF · AVERAGING_DOWN OFF · RR 1.70 · LOT 0.01.
