# V8_SL_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.337Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Structural SL = the model's invalidation anchor ∓ 0.25 ATR (floor 0.5 ATR, wrong-side fallback 1.5 ATR) — unchanged; never tightened or widened. 0.01 lot = 1 oz: 1 USD of price = 1 USD of risk.

| Bar close | Engine | Model | Side | Entry | SL | SL distance (USD) | Risk at 0.01 lot (USD) | % of 10,000 DEMO | % of 62.07 REAL | SL source | Invalidation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | V8 | BO | BUY | 4182.69 | 4178.05 | 4.64 | 4.64 | 0.0 % | 7.5 % | candidate_anchor | retest extreme |
| 2026-10-01T12:00 | CONTROL | BO | BUY | 4182.69 | 4178.05 | 4.64 | 4.64 | 0.0 % | 7.5 % | candidate_anchor | retest extreme |
| 2026-10-01T13:20 | V8 | BO | SELL | 4174.32 | 4176.57 | 2.25 | 2.25 | 0.0 % | 3.6 % | candidate_anchor+min_risk | retest extreme |
| 2026-10-01T13:20 | CONTROL | BO | SELL | 4174.32 | 4176.57 | 2.25 | 2.25 | 0.0 % | 3.6 % | candidate_anchor+min_risk | retest extreme |
| 2026-10-01T13:55 | V8 | BO | SELL | 4163.82 | 4166.96 | 3.14 | 3.14 | 0.0 % | 5.1 % | candidate_anchor | retest extreme |
| 2026-10-01T14:55 | CONTROL | MR | BUY | 4164.07 | 4160.71 | 3.36 | 3.36 | 0.0 % | 5.4 % | candidate_anchor+min_risk | sweep-bar extreme |
| 2026-10-01T15:30 | V8 | MR | BUY | 4166.5 | 4159.86 | 6.64 | 6.64 | 0.1 % | 10.7 % | candidate_anchor | sweep-bar extreme |
| 2026-10-01T16:20 | CONTROL | SR | SELL | 4168.29 | 4173.95 | 5.66 | 5.66 | 0.1 % | 9.1 % | candidate_anchor | rejection wick |
| 2026-10-01T17:45 | V8 | BO | BUY | 4176.82 | 4172.85 | 3.97 | 3.97 | 0.0 % | 6.4 % | candidate_anchor | retest extreme |
| 2026-10-01T17:45 | CONTROL | BO | BUY | 4176.82 | 4172.85 | 3.97 | 3.97 | 0.0 % | 6.4 % | candidate_anchor | retest extreme |

Broker fail-safe (production, unchanged): 1.5 × structural distance + spread.
