# DEMO_VALIDATION_GATE

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.871Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

**DEMO_ELIGIBLE = NO.** The gate cannot open before 300 frozen, labelled forward signals (current 1). DEMO is never started automatically; opening it needs a separate owner approval.

## Gate (pre-registered; all required)
| Condition | Current |
|---|---|
| 300 frozen forward V8 signals, all labelled | NOT MET |
| V8 correctness clean (replay parity, D1–D6 regressions 0, stage parity, implementation errors 0, no missed / incorrectly blocked setups) | MET (so far) |
| CORE_EXECUTION = IMPROVED or UNCHANGED | INCONCLUSIVE |
| V8 hypothetical expectancy > 0 and PF > 1.0 at NORMAL cost | — / — |
| V8 STRESS expectancy ≥ 0 | — |

## Future DEMO specification (prepared only; NOT started)
| Item | Value |
|---|---|
| Account | 10,000 USD DEMO |
| Lot | 0.01 (USER_FIXED) |
| RR | 1.70 |
| AUTO_SCALING / MARTINGALE / AVERAGING_DOWN | OFF / OFF / OFF |
| Risk governance | percentage-of-equity cap per trade (structural distance × 0.01 lot as % of equity), structural SL, broker stops level and margin availability; no universal fixed-dollar loss |
| Engine | the frozen V8 corrected core exactly as validated (engines manifest hash), no new filters |
| Safety | production News V2, spread ≤ 0.60, drift guard, shock state, breaker, broker fail-safe SL |
| REAL | prohibited; no automatic deployment is prepared |
