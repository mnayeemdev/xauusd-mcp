# V8_REJECTION_AUDIT (SR)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Check | Implementation | Verdict |
|---|---|---|
| wick / body | the rejection wick ≥ 50 % of the bar range | correct |
| close position | close in the top third (BUY) / bottom third (SELL) | correct |
| location | the wick must reach a 15m or 5m swing level: within +0.3 ATR above to −0.6 ATR below (BUY), mirrored for SELL, and close back beyond the level | correct — a long wick without a level is WAIT (fixture) |
| previous structure | trades against 5m structure only with a supporting 15m bias or a fresh (≤ 3 bars) 5m sweep at the level | correct rule; its inputs (structure state, sweep) were affected by D1/D2 |
| confirmation | the rejection candle itself (confirmed close); no extra bar | by design |
| direction | from the level type (swing low → BUY, swing high → SELL) | correct, symmetric |

SR signals: DEV 131 (corrected 128), HOLD 224 (corrected 228). No SR-specific defect; SR changes in the corrected engine come from D1 (structure state) and D2 (sweep basis).
