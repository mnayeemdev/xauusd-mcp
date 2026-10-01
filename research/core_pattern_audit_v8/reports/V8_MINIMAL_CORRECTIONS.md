# V8_MINIMAL_CORRECTIONS (research copies only — NOT deployed)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| ID | File | Lines + / − | Patch |
|---|---|---|---|
| D1 | src/engine/structure.js | +11 / −12 | patches/D1_STRUCTURE_EVENT_CHRONOLOGY.patch |
| D2 | src/engine/structure.js | +8 / −8 | patches/D2_SWEEP_RECENCY.patch |
| D3 | src/engine/intraday/models5m.js | +11 / −2 | patches/D3_PULLBACK_DEPTH_MEASURED_AT_CURRENT_CLOSE.patch |
| D4 | src/engine/intraday/models5m.js | +3 / −0 | patches/D4_MEAN_REVERSION_LOCATION.patch |
| D5 | src/engine/intraday/risk5m.js | +4 / −2 | patches/D5_RR_GATE_ON_ROUNDED_VALUE.patch |
| D6 | src/core/xauusd_calculate.js | +4 / −1 | patches/D6_STALE_ENTRY_TIMEFRAME_NOT_FAIL_CLOSED.patch |
| ALL | 4 files | +41 / −25 | patches/ALL_V8_CORRECTIONS.patch (`git apply --check` clean against 48eb31d) |

Each correction changes only its defective rule: no threshold, indicator, RR, SL rule, exit, cost, lot or safety gate was changed, and nothing was added (no RSI, MACD, Bollinger, new EMA, oscillator, silver, dollar index or score). The corrections were selected by specification before any outcome was computed (pre-registration fbd6b65584267124…) and frozen before the HOLDOUT replay (configs/v8_freeze.json). They are NOT applied to `src/`; deployment would need the owner's decision, a fingerprint update and the usual safety review.
