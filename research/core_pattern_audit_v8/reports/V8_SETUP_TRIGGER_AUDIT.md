# V8_SETUP_TRIGGER_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

A setup alone never produces a trade: every model returns a candidate only when its trigger condition holds on the current confirmed bar (stage 3), asserted bar-by-bar against the production functions.

| Question | Finding |
|---|---|
| Missing triggers | **D2** (MR / SR basis read a stale sweep → fresh sweeps missed); **D3** (PB resolution never recognised after a decisive reclaim) |
| Triggering too early | none: MC needs 3 closes + a confirmed break, PB 2 reclaim closes, BO a retest AND a reclaim close, SR / MR a completed candle |
| Triggering too late | bounded by rule (MC/PB/MR ≤ 3 bars, BO ≤ 10); entry timing from origin (bars): CONTROL HOLD mean 3.93, median 3, p90 9; corrected mean 3.66 |
| Incomplete candles | never (forming bar stripped; garbage forming bar test) |
| Wrong reference levels | **D1** (BO retest level / breakout bar from a stale event), **D2** (sweep level) |

Funnels (pattern → setup → trigger) per model and side: V8_PATTERN_DETECTION_AUDIT.
