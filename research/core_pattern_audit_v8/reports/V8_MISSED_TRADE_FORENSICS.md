# V8_MISSED_TRADE_FORENSICS (V3 move events: ≥ 3 ATR within 24 bars before 1 ATR adverse)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

## DEV: 1640 move events
| Class | CONTROL | Corrected |
|---|---|---|
| CAPTURED | 186 | 224 |
| LATE | 136 | 163 |
| WRONG_SIDE_SIGNAL | 220 | 243 |
| POSITION_OCCUPIED | 289 | 266 |
| DATA_UNAVAILABLE | 0 | 0 |
| LOCATION_BLOCKED | 25 | 15 |
| RR_BLOCKED | 48 | 48 |
| RISK_BLOCKED | 59 | 60 |
| MODEL_BLOCKED:QUALITY | 8 | 10 |
| MODEL_BLOCKED:CONTEXT_VETO | 7 | 11 |
| MODEL_BLOCKED:BIAS | 202 | 209 |
| NO_TRIGGER | 175 | 145 |
| NO_SETUP | 285 | 246 |
| NO_PATTERN | 0 | 0 |

Bias-block detail: CONTROL NEUTRAL_BIAS 126, OPPOSING_BIAS 74, PRIORITY_OTHER_SIDE 2; corrected NEUTRAL_BIAS 134, OPPOSING_BIAS 74, PRIORITY_OTHER_SIDE 1.

**ENGINE_ERROR (missed valid patterns caused by implementation defects): 55** — CONTROL had no aligned entry in the onset window while the corrected engine had one (attributed: D1 41, D2 11, D3 4). Events captured by CONTROL but no longer by the corrected engine: 17 (LATE 8, POSITION_OCCUPIED 6, WRONG_SIDE_SIGNAL 1, LOCATION_BLOCKED 1, MODEL_BLOCKED:BIAS 1).

## HOLD: 1842 move events
| Class | CONTROL | Corrected |
|---|---|---|
| CAPTURED | 290 | 348 |
| LATE | 200 | 209 |
| WRONG_SIDE_SIGNAL | 276 | 305 |
| POSITION_OCCUPIED | 332 | 319 |
| DATA_UNAVAILABLE | 0 | 0 |
| LOCATION_BLOCKED | 32 | 12 |
| RR_BLOCKED | 56 | 56 |
| RISK_BLOCKED | 0 | 0 |
| MODEL_BLOCKED:QUALITY | 12 | 14 |
| MODEL_BLOCKED:CONTEXT_VETO | 13 | 16 |
| MODEL_BLOCKED:BIAS | 174 | 175 |
| NO_TRIGGER | 183 | 164 |
| NO_SETUP | 274 | 224 |
| NO_PATTERN | 0 | 0 |

Bias-block detail: CONTROL NEUTRAL_BIAS 108, OPPOSING_BIAS 65, PRIORITY_OTHER_SIDE 1; corrected NEUTRAL_BIAS 110, OPPOSING_BIAS 60, PRIORITY_OTHER_SIDE 4, CHOP 1.

**ENGINE_ERROR (missed valid patterns caused by implementation defects): 84** — CONTROL had no aligned entry in the onset window while the corrected engine had one (attributed: D1 63, D2 15, D3 4, COMBINED 2). Events captured by CONTROL but no longer by the corrected engine: 26 (LATE 9, POSITION_OCCUPIED 6, NO_TRIGGER 4, RR_BLOCKED 3, WRONG_SIDE_SIGNAL 3, MODEL_BLOCKED:BIAS 1).

MISSED_VALID_PATTERNS_AFTER = 0 by construction (no known defect remains); the corrected engine's remaining misses are rule-based (no pattern, setup or trigger; bias; gates; one-position rule). SAFETY_BLOCKED (news, spread, drift, margin) is outside the replay and not counted.
