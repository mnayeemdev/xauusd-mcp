# V8_STRUCTURAL_SL_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Model | Structural invalidation (slAnchor) | Engine SL |
|---|---|---|
| MC | lowest low / highest high of the momentum leg (2 bars before the break → now) | anchor ∓ 0.25 ATR |
| PB | pullback extreme | idem |
| BO | retest extreme after the break | idem |
| SR | rejection wick | idem |
| MR | sweep-bar extreme | idem |
| all | wrong side of entry → entry ∓ 1.5 ATR (atr_fallback); never closer than 0.5 ATR (min_risk floor) | broker fail-safe 1.5 × structural distance + spread (unchanged) |

SL source mix (signals): DEV CONTROL candidate_anchor 3844, candidate_anchor+min_risk 242, atr_fallback 12; corrected candidate_anchor 4544, candidate_anchor+min_risk 305, atr_fallback 9 · HOLD CONTROL candidate_anchor 5176, candidate_anchor+min_risk 337, atr_fallback 6; corrected candidate_anchor 6090, candidate_anchor+min_risk 453, atr_fallback 10.

Risk distance (ATR): CONTROL HOLD mean 1.505, median 1.390; corrected 1.434 / 1.310. BUY and SELL SL formulas mirror exactly (tests). **SL_ERRORS = 0**: no stop was tightened or widened by V8. Wide stops are handled by risk eligibility (V8_COST_STRESS capital section), not by moving the stop.
