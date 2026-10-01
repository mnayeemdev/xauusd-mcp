# V8_PATTERN_DETECTION_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

## Deterministic fixtures (tests/core_pattern_audit_v8.test.js)
| Chart data | Expected pattern (specification) | Actual production | Match | Reason |
|---|---|---|---|---|
| D1 flip fixture (breaks at bars 14↓, 28↑, 36↑, 51↓; close 93.80) | state BEARISH, last event = bar-51 break of 94.8 | BULLISH, CHoCH bar 36 | MISMATCH | pivot-order processing (D1) |
| D1 BOS fixture (breaks 28↓, 35↑, 45↑ through 105.2) | last event BOS bar 45 level 105.2 | CHoCH bar 35 level 97.4 | MISMATCH | D1 |
| Sweep fixture (bar 50 wicks above the 105.2 high, closes 104.6) | last sweep = bar 50 at 105.2 (age 0) | bar 41 at 103.2 (age 9 > MR limit 3) | MISMATCH | D2 |
| PB fixture: 2.64-ATR pullback, 2 closes back above EMA20, close 0.64 ATR under the extreme | PB BUY, stop at the pullback low | null (correction NONE) | MISMATCH | D3 |
| PB fixture: only 1 close back above EMA20 | WAIT (not resolved) | WAIT | MATCH | — |
| MR fixture: SWEEP_HIGH at 103 in a 100–110 15m range | WAIT (entry below its own midpoint target) | MR SELL with target 105 above the entry | MISMATCH | D4 |
| MR fixture: SWEEP_HIGH at 108 | MR SELL, target 105 | MR SELL, target 105 | MATCH | — |
| SR fixture: 73 % lower wick, close in the top third, at the 5m swing low 100 | SR BUY, stop at the wick 99.8 | SR BUY, 99.8 | MATCH | — |
| SR fixture: same candle, no level within reach | WAIT | WAIT | MATCH | — |
| SR fixture: long wick, close mid-bar | WAIT | WAIT | MATCH | — |
| BO fixture: break of 100, retest low 100.3, reclaim close 101.5 | BO BUY, stop anchor 100.3 | BO BUY, 100.3 | MATCH | — |
| BO fixture: no retest / close back below / > 10 bars / CHOP | WAIT | WAIT | MATCH | — |
| BO fixture mirrored | BO SELL, mirrored stop | BO SELL | MATCH | — |
| MC fixture: 3 progressing closes above EMA20, ATR ratio 1.2, fresh swing break | MC BUY, origin at the break bar | MC BUY | MATCH | — |
| MC fixture: ATR ratio 0.9 / NEUTRAL bias | WAIT | WAIT | MATCH | — |
| Pivot latency: pivot with 4 right bars / 5 right bars | not reported / reported | same | MATCH | — |
| RR fixture: objective at 1.696 R | RR_NOT_ACCEPTABLE | OK (rounded to 1.70) | MISMATCH | D5 |
| Stale 15m snapshot (4 h old) on the live path | DATA_UNAVAILABLE (stale) | decision taken (status OK) | MISMATCH | D6 |

## Data-wide bias-agnostic funnel (bars where the stage is reached, BUY / SELL)
Stage 3 of every model was asserted equal to the production model function on every bar (8,944,290 checks across all variants, 0 mismatches).

### DEV — CONTROL
| Model | Pattern | Setup | Trigger |
|---|---|---|---|
| MC | 6,308 / 4,979 | 2,839 / 2,748 | 952 / 949 |
| PB | 39,386 / 41,827 | 9,062 / 9,569 | 3,405 / 3,560 |
| BO | 10,956 / 9,400 | 9,454 / 8,334 | 5,735 / 4,514 |
| SR | 4,860 / 4,060 | 734 / 646 | 340 / 258 |
| MR | 3,856 / 3,515 | 274 / 399 | 274 / 399 |

### DEV — corrected (ALL)
| Model | Pattern | Setup | Trigger |
|---|---|---|---|
| MC | 6,308 / 4,979 | 2,839 / 2,748 | 952 / 949 |
| PB | 39,386 / 41,827 | 14,330 / 12,979 | 5,058 / 4,876 |
| BO | 12,668 / 10,845 | 11,134 / 9,885 | 5,825 / 4,437 |
| SR | 4,860 / 4,060 | 734 / 646 | 340 / 249 |
| MR | 10,803 / 9,292 | 986 / 1,071 | 286 / 746 |

### HOLD — CONTROL
| Model | Pattern | Setup | Trigger |
|---|---|---|---|
| MC | 6,263 / 6,147 | 2,764 / 3,020 | 943 / 1,015 |
| PB | 45,761 / 46,616 | 10,410 / 11,718 | 3,745 / 4,108 |
| BO | 11,174 / 11,432 | 9,633 / 10,310 | 5,520 / 5,962 |
| SR | 5,194 / 4,788 | 856 / 808 | 427 / 392 |
| MR | 6,226 / 5,296 | 423 / 482 | 423 / 482 |

### HOLD — corrected (ALL)
| Model | Pattern | Setup | Trigger |
|---|---|---|---|
| MC | 6,263 / 6,147 | 2,764 / 3,020 | 943 / 1,015 |
| PB | 45,761 / 46,616 | 15,537 / 15,974 | 5,539 / 5,611 |
| BO | 12,832 / 13,141 | 11,223 / 11,972 | 5,359 / 5,849 |
| SR | 5,194 / 4,788 | 856 / 808 | 456 / 415 |
| MR | 16,068 / 14,470 | 1,199 / 1,310 | 466 / 849 |
