# V8_REPLAY_PARITY

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.871Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

Sample: every valid setup / signal and every top-of-hour decision, re-evaluated at least 60 s later from the first-seen bar archive with the same engine. Input windows are compared by hash first; equal inputs must give identical action, wait reason and category, model, side, entry, SL, TP2, RR, 1.70R TP, stages and origin.

| | V8 | CONTROL |
|---|---|---|
| Checked | 1 | 1 |
| Inputs identical | 1 | 1 |
| Decision identical | 1 | 1 |
| Mismatches | 0 | 0 |
| Inputs changed (broker revision; not an engine mismatch) | 0 | 0 |
| Stage decomposition vs model functions: decisions with a mismatch | 0 | 0 |

No mismatch. REPLAY_PARITY = PASS.
