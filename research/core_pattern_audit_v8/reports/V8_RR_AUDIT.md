# V8_RR_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Item | Implementation |
|---|---|
| TP1 | entry ± 1.0 × structural risk |
| TP2 | nearest structural objective ≥ 1.0 R beyond the entry (5m/15m pivots, 15m range), capped 3 R; 2 R if none; MR: 15m midpoint |
| RR gate | RR to TP2 ≥ 1.70 (`minRR`, kept verbatim) |
| BUY / SELL | TP = entry + / − R-multiple × risk; tested symmetric with fractional prices |
| Spread | not in the engine geometry; the executor re-checks effective RR from the fill (`minEffectiveRr` 1.7) and the replay pays 0.24 spread + 0.10 slippage |

**Conflict C1:** the owner's rule "TP = entry ± 1.70 × risk" ≠ implementation (TP2 is an objective ≥ 1.70 R, mean 2.333 R, 26.3 % at the 3 R cap on HOLD). Not changed by V8 (RR not optimised); both are reported: PRIMARY (production TP2) and SECONDARY (fixed 1.70 R).

**Defect D5:** `rr = +(…).toFixed(2)` was compared with 1.70, so 1.695 ≤ RR < 1.70 passed (JavaScript rounds 1.695 to "1.70"). Share of signals below 1.70 R: CONTROL HOLD 0.1 %, after D5 0.0 %. Decisions changed by D5: DEV 17, HOLD 7 (signals removed: SELL:BO -> WAIT:RR_NOT_ACCEPTABLE 3, SELL:PB -> WAIT:RR_NOT_ACCEPTABLE 1, BUY:MR -> WAIT:RR_NOT_ACCEPTABLE 1, BUY:BO -> WAIT:RR_NOT_ACCEPTABLE 1).

| Split | Variant | PRIMARY (TP2) exp R | FIXED 1.70 R exp R | FIXED 1.70 R stress |
|---|---|---|---|---|
| DEV | CONTROL | -0.055 | -0.070 | -0.203 |
| DEV | ALL | -0.099 | -0.077 | -0.226 |
| HOLD | CONTROL | -0.064 | -0.040 | -0.127 |
| HOLD | ALL | -0.027 | -0.022 | -0.107 |
