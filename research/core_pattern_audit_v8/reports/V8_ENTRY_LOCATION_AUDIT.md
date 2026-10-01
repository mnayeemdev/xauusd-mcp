# V8_ENTRY_LOCATION_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

Entry = close of the confirmed signal bar. Location rule: entry ≤ 2.5 × 5m ATR from the model's anchor (OVEREXTENDED otherwise). Classes (descriptive): VALID ≤ 2.0 ATR from the anchor and within the model's own rules; MARGINAL 2.0–2.5 ATR (the last fifth of the allowance; distances are recomputed from the stored 2-decimal risk/ATR ratio, so values within 0.01 ATR of 2.5 count as MARGINAL); INVALID = violates the model's own definition (MR entry on the wrong side of its own midpoint target = D4).

| | Signals | Mean distance from anchor (ATR) | VALID | MARGINAL | > 2.5 ATR | MR signals whose target is NOT the midpoint (midpoint behind the entry or missing) |
|---|---|---|---|---|---|---|
| CONTROL_DEV | 4098 | 0.88 | 3791 | 307 | 0 | 68 of 177 |
| CONTROL_HOLD | 5519 | 0.88 | 5108 | 411 | 0 | 69 of 229 |
| ALL_DEV | 4858 | 0.81 | 4544 | 314 | 0 | 0 of 315 |
| ALL_HOLD | 6553 | 0.80 | 6124 | 429 | 0 | 0 of 407 |

D4 removes every MR entry whose own objective lies behind it (CONTROL MR signals with a non-midpoint target are exactly those). No other location defect was found; thresholds were not changed.
