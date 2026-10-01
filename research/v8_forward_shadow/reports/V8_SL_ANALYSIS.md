# V8_SL_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:02:02.870Z · **INTERIM — NOT FINAL — 1 / 300 V8 forward signals**

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine. Forward collection started 2026-10-01T11:58:45.624Z.

Structural SL = the model's invalidation anchor ∓ 0.25 ATR (floor 0.5 ATR, wrong-side fallback 1.5 ATR) — unchanged; never tightened or widened. 0.01 lot = 1 oz: 1 USD of price = 1 USD of risk.

| Bar close | Engine | Model | Side | Entry | SL | SL distance (USD) | Risk at 0.01 lot (USD) | % of 10,000 DEMO | % of 62.07 REAL | SL source | Invalidation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | V8 | BO | BUY | 4182.69 | 4178.05 | 4.64 | 4.64 | 0.0 % | 7.5 % | candidate_anchor | retest extreme |
| 2026-10-01T12:00 | CONTROL | BO | BUY | 4182.69 | 4178.05 | 4.64 | 4.64 | 0.0 % | 7.5 % | candidate_anchor | retest extreme |

Broker fail-safe (production, unchanged): 1.5 × structural distance + spread.
