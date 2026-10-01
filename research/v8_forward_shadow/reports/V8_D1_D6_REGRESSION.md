# V8_D1_D6_REGRESSION

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.871Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

Independent oracles written from the specification: D1 structure state and last BOS/CHoCH from time-ordered breaks; D2 most recent sweep; D3 PB depth ≥ 1 ATR on PB setups; D4 MR entry on the far side of its midpoint; D5 RR ≥ 1.70 before rounding; D6 no decision on a stale 5m/15m/30m snapshot.

| Check | V8 OK | V8 VIOLATION | V8 violations on setups |
|---|---|---|---|
| D1 | 1 | 0 | 0 |
| D2 | 1 | 0 | 0 |
| D3 | 0 | 0 | 0 |
| D4 | 0 | 0 | 0 |
| D5 | 1 | 0 | 0 |
| D6 | 1 | 0 | 0 |

| Check | CONTROL OK | CONTROL VIOLATION | CONTROL violations on setups |
|---|---|---|---|
| D1 | 1 | 0 | 0 |
| D2 | 0 | 1 | 1 |
| D3 | 0 | 0 | 0 |
| D4 | 0 | 0 | 0 |
| D5 | 1 | 0 | 0 |
| D6 | 1 | 0 | 0 |

CONTROL violations show the defects still live in production on forward data; V8 must stay at zero (any V8 violation = regression).
