# V8_REPLAY_PARITY

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.337Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Sample: every valid setup / signal and every top-of-hour decision, re-evaluated at least 60 s later from the first-seen bar archive with the same engine. Input windows are compared by hash first; equal inputs must give identical action, wait reason and category, model, side, entry, SL, TP2, RR, 1.70R TP, stages and origin.

| | V8 | CONTROL |
|---|---|---|
| Checked | 16 | 20 |
| Inputs identical | 3 | 3 |
| Decision identical | 3 | 3 |
| Mismatches | 0 | 0 |
| Inputs changed (broker revision; not an engine mismatch) | 13 | 17 |
| Stage decomposition vs model functions: decisions with a mismatch | 0 | 0 |

No mismatch. REPLAY_PARITY = PASS.
