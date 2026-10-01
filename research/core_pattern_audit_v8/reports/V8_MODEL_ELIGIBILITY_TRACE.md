# V8_MODEL_ELIGIBILITY_TRACE

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

Mapping (`eligibleModelsFor`): BULLISH/BEARISH 15m → MC, PB, BO, SR; RANGE → BO, SR, MR; COMPRESSION / HIGH_VOLATILITY → BO; TRANSITION → BO, SR; CHOP → none. It matches the engine documentation. **MODEL_ELIGIBILITY_ERRORS = 0.**

## DEV — CONTROL (46,593 bars)
| Model | Eligible bars | Triggered under the real bias | Selected | Pre-empted by a higher-priority model | Final signals | Bias-agnostic triggers BUY / SELL |
|---|---|---|---|---|---|---|
| MC | 20,956 | 575 | 575 | 0 | 414 | 952 / 949 |
| PB | 20,956 | 1,585 | 1,572 | 13 | 495 | 3,405 / 3,560 |
| BO | 46,584 | 8,578 | 8,256 | 322 | 2,881 | 5,735 / 4,514 |
| SR | 33,855 | 415 | 385 | 30 | 131 | 340 / 258 |
| MR | 5,700 | 672 | 553 | 119 | 177 | 274 / 399 |

Decision mix: NO_ELIGIBLE_STRATEGY 35220, SIGNAL 4098, RR_NOT_ACCEPTABLE 2632, VOLATILITY_INSUFFICIENT 2130, OVEREXTENDED 1143, NO_GOOD_ENTRY 883, HTF_CONFLICT 248, ENTRY_CONFLICT 207, CHOP 32

## DEV — corrected
| Model | Eligible bars | Triggered under the real bias | Selected | Pre-empted by a higher-priority model | Final signals | Bias-agnostic triggers BUY / SELL |
|---|---|---|---|---|---|---|
| MC | 20,956 | 575 | 575 | 0 | 413 | 952 / 949 |
| PB | 20,956 | 2,085 | 2,059 | 26 | 649 | 5,058 / 4,876 |
| BO | 46,584 | 8,613 | 8,290 | 323 | 3,353 | 5,825 / 4,437 |
| SR | 33,855 | 407 | 377 | 30 | 128 | 340 / 249 |
| MR | 5,700 | 1,031 | 857 | 174 | 315 | 286 / 746 |

## HOLD — CONTROL (52,788 bars)
| Model | Eligible bars | Triggered under the real bias | Selected | Pre-empted by a higher-priority model | Final signals | Bias-agnostic triggers BUY / SELL |
|---|---|---|---|---|---|---|
| MC | 25,133 | 649 | 649 | 0 | 461 | 943 / 1,015 |
| PB | 25,133 | 1,872 | 1,854 | 18 | 675 | 3,745 / 4,108 |
| BO | 52,764 | 9,330 | 8,942 | 388 | 3,930 | 5,520 / 5,962 |
| SR | 37,807 | 458 | 436 | 22 | 224 | 427 / 392 |
| MR | 5,348 | 905 | 712 | 193 | 229 | 423 / 482 |

Decision mix: NO_ELIGIBLE_STRATEGY 40156, SIGNAL 5519, RR_NOT_ACCEPTABLE 3796, OVEREXTENDED 1336, NO_GOOD_ENTRY 1293, HTF_CONFLICT 361, ENTRY_CONFLICT 285, CHOP 39, VOLATILITY_INSUFFICIENT 3

## HOLD — corrected
| Model | Eligible bars | Triggered under the real bias | Selected | Pre-empted by a higher-priority model | Final signals | Bias-agnostic triggers BUY / SELL |
|---|---|---|---|---|---|---|
| MC | 25,133 | 649 | 649 | 0 | 467 | 943 / 1,015 |
| PB | 25,133 | 2,409 | 2,388 | 21 | 894 | 5,539 / 5,611 |
| BO | 52,764 | 9,187 | 8,819 | 368 | 4,557 | 5,359 / 5,849 |
| SR | 37,807 | 476 | 447 | 29 | 228 | 456 / 415 |
| MR | 5,348 | 1,315 | 1,091 | 224 | 407 | 466 / 849 |

## Per-bar trace sample (CONTROL, 2026-09-25 07:00–09:30 UTC, Exness replay)
| Bar (UTC) | 15m bias | Eligible | Triggered (model+side) | Stages BUY MC PB BO SR MR | Stages SELL | Final |
|---|---|---|---|---|---|---|
| 07:00 | NEUTRAL RANGE | BOSRMR | MRS | 02200 | 01023 | WAIT RR_NOT_ACCEPTABLE |
| 07:05 | NEUTRAL RANGE | BOSRMR | BOB,MRS | 02300 | 01003 | WAIT RR_NOT_ACCEPTABLE |
| 07:10 | NEUTRAL RANGE | BOSRMR | MRS | 02000 | 01003 | WAIT RR_NOT_ACCEPTABLE |
| 07:15 | NEUTRAL RANGE | BOSRMR | MRS | 01000 | 01003 | WAIT RR_NOT_ACCEPTABLE |
| 07:20 | NEUTRAL RANGE | BOSRMR | — | 01000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 07:25 | NEUTRAL RANGE | BOSRMR | — | 01000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 07:30 | NEUTRAL RANGE | BOSRMR | MRS | 01000 | 01003 | WAIT RR_NOT_ACCEPTABLE |
| 07:35 | NEUTRAL RANGE | BOSRMR | MRS | 03000 | 01023 | SELL MR |
| 07:40 | NEUTRAL RANGE | BOSRMR | MRS | 23000 | 01003 | SELL MR |
| 07:45 | NEUTRAL RANGE | BOSRMR | MRS | 21000 | 01003 | SELL MR |
| 07:50 | NEUTRAL RANGE | BOSRMR | — | 01000 | 01020 | WAIT NO_ELIGIBLE_STRATEGY |
| 07:55 | NEUTRAL TRANSITION | BOSR | — | 00000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 08:00 | NEUTRAL TRANSITION | BOSR | — | 01000 | 01001 | WAIT NO_ELIGIBLE_STRATEGY |
| 08:05 | NEUTRAL TRANSITION | BOSR | — | 01000 | 01001 | WAIT NO_ELIGIBLE_STRATEGY |
| 08:10 | NEUTRAL RANGE | BOSRMR | MRS | 00000 | 01003 | WAIT ENTRY_CONFLICT |
| 08:15 | NEUTRAL RANGE | BOSRMR | BOB,MRS | 00300 | 01013 | BUY BO |
| 08:20 | NEUTRAL RANGE | BOSRMR | BOB,MRS | 01310 | 01003 | BUY BO |
| 08:25 | NEUTRAL TRANSITION | BOSR | BOB | 30300 | 01001 | BUY BO |
| 08:30 | NEUTRAL TRANSITION | BOSR | BOB | 20300 | 01001 | BUY BO |
| 08:35 | NEUTRAL TRANSITION | BOSR | BOB | 00300 | 01000 | BUY BO |
| 08:40 | NEUTRAL TRANSITION | BOSR | BOB | 00300 | 01000 | WAIT OVEREXTENDED |
| 08:45 | NEUTRAL TRANSITION | BOSR | BOB | 02300 | 01010 | WAIT NO_GOOD_ENTRY |
| 08:50 | NEUTRAL TRANSITION | BOSR | BOB | 02300 | 01000 | WAIT OVEREXTENDED |
| 08:55 | NEUTRAL TRANSITION | BOSR | BOB | 21300 | 01000 | WAIT OVEREXTENDED |
| 09:00 | NEUTRAL TRANSITION | BOSR | BOB | 20300 | 01000 | WAIT OVEREXTENDED |
| 09:05 | NEUTRAL TRANSITION | BOSR | — | 20000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 09:10 | NEUTRAL TRANSITION | BOSR | — | 00000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 09:15 | NEUTRAL TRANSITION | BOSR | — | 02000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 09:20 | NEUTRAL TRANSITION | BOSR | — | 01000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |
| 09:25 | NEUTRAL TRANSITION | BOSR | — | 02000 | 01000 | WAIT NO_ELIGIBLE_STRATEGY |

Stage digits: 0 none, 1 pattern, 2 setup, 3 trigger (bias-agnostic). Pre-emption by priority is rare (largest: MR 193 bars HOLD) and follows the documented MC > PB > BO > SR > MR order.
