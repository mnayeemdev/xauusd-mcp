# V8_PULLBACK_AUDIT (PB)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Element | Implementation |
|---|---|
| Original impulse | the 15m bias direction; the 20-bar 5m extreme (highest high for BUY) |
| Correction / retracement | production: `computeCorrection` distance from the 20-bar extreme to the CURRENT close ≥ 1.0 ATR (ACTIVE while closes stay on the wrong side of EMA20) |
| Structure preservation | not checked beyond the 15m bias (no 5m swing-low preservation rule) |
| Depth | ≥ 1.0 × 5m ATR (`pbCorrAtrMultiplier`, "5m pullback depth") |
| Reclaim / confirmation | 2 consecutive closes back on the bias side of EMA20; entry ≤ 3 bars after |
| Entry location | signal close, ≤ 2.5 ATR from the pullback extreme |
| Invalidation | SL beyond the pullback extreme − 0.25 ATR |

**Defect D3:** RESOLVED required the CURRENT close to still be ≥ 1 ATR from the extreme, so a deep pullback with a decisive reclaim (close back near the extreme) was never recognised (MISSES VALID PULLBACKS), while a shallow, weak reclaim that stayed deep was (biased toward weak resumptions). Fixture: 2.64-ATR pullback, 2 closes back above EMA20 → production NONE. Correction: the depth is measured from the extreme to the deepest point after it; resolution and freshness unchanged; a bar that is itself the new extreme cannot be a pullback.

| | DEV CONTROL | DEV D3 | HOLD CONTROL | HOLD D3 |
|---|---|---|---|---|
| PB signals | 495 | 650 | 675 | 891 |
| decisions changed | — | 577 | — | 639 |
| expectancy (R) | -0.055 | -0.040 | -0.064 | -0.059 |
| wrong-direction | 29.8 % | 29.3 % | 29.7 % | 29.2 % |

Early / late / reversal confusion: PB cannot enter before 2 reclaim closes (not early) and never > 3 bars after them (not late). A reversal can still be taken as a pullback when the 15m bias has not yet turned (the 15m bias is the only trend arbiter) — this is the context-lag question, measured in V8_CONTEXT_LAG_AUDIT, not a code defect.
