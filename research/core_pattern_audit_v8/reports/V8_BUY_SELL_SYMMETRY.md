# V8_BUY_SELL_SYMMETRY (price-mirror test)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

Method: 3000 seeded DEV bars; every timeframe mirrored around K = 2 x round(close of the decision bar) (open/close → K − x, high ↔ low). A symmetric implementation returns BUY ↔ SELL with the same model / wait reason and mirrored geometry.

| Engine | Bars | Signals | Exact mirror | Mismatch fields |
|---|---|---|---|---|
| CONTROL | 3000 | 256 | 2966 / 3000 (98.87 %) | bias 26, action 7, wait_reason 7, model 6, candidate_side 5, stop 4, tp2 4, entry 3, rr 3, structure 1 |
| ALL | 3000 | 312 | 2969 / 3000 (98.97 %) | bias 26, action 7, wait_reason 4, model 4, candidate_side 4, entry 3, stop 3, tp2 3, rr 3 |
| SYMPROBE | 3000 | 256 | 2999 / 3000 (99.97 %) | structure 1 |
| SYMPROBE_ALL | 3000 | 310 | 3000 / 3000 (100.00 %) | — |

SYMPROBE = production with the three price-relative terms neutralised (ATR % → ATR in the regime, Bollinger width / basis → absolute width, sweep tolerance 0.05 % → 2 USD). These terms are price-LEVEL normalisations (a mirrored chart has a different price history), so CONTROL's 1.1 % differences are expected and are not code asymmetry. With them neutralised production mirrors 2999 of 3000; the single residual is the D1 tie-order case (an outside bar that is both a pivot high and low): 2025-12-08T03:55:00.000Z production BEARISH/BEARISH, D1 BULLISH/BEARISH. The corrected engine with the same neutralisation mirrors 3000 of 3000.

**BUY_SELL_SYMMETRY: production FAIL (one genuine code asymmetry, caused by D1); corrected PASS.** Unit tests also mirror SR, BO, SL/TP/RR and the D1 fixture explicitly.
