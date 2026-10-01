# V8_BEFORE_AFTER_REPLAY

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

## DEV
| Variant | Signals | Model mix | Trades | Wrong-direction | Capture | Entry timing mean (bars) | SL risk mean (ATR) | TP2 mean (R) | Expectancy (R) | PF | Max DD (R) | Decisions changed | Unexplained |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CONTROL | 4098 | BO 2881, PB 495, MC 414, MR 177, SR 131 | 878 | 29.8 % | 19.6 % | 3.92 | 1.546 | 2.273 | -0.055 | 0.94 | 81.16 | — | — |
| D1 | 4642 | BO 3420, PB 500, MC 415, MR 180, SR 127 | 1015 | 31.0 % | 22.1 % | 3.83 | 1.488 | 2.272 | -0.119 | 0.87 | 166.61 | 4130 | 0 |
| D2 | 4464 | BO 2881, MR 543, PB 495, MC 414, SR 131 | 908 | 29.0 % | 21.9 % | 3.68 | 1.509 | 2.295 | -0.068 | 0.92 | 85.22 | 1210 | 0 |
| D3 | 4223 | BO 2852, PB 650, MC 414, MR 177, SR 130 | 875 | 29.3 % | 20.1 % | 3.82 | 1.561 | 2.271 | -0.040 | 0.95 | 82.89 | 577 | 0 |
| D4 | 4030 | BO 2881, PB 495, MC 414, SR 131, MR 109 | 866 | 30.1 % | 19.4 % | 3.96 | 1.549 | 2.275 | -0.068 | 0.92 | 85.41 | 260 | 0 |
| D5 | 4085 | BO 2872, PB 492, MC 414, MR 176, SR 131 | 874 | 29.6 % | 19.6 % | 3.92 | 1.547 | 2.275 | -0.052 | 0.94 | 83.03 | 17 | 0 |
| D6 | 4078 | BO 2865, PB 494, MC 412, MR 177, SR 130 | 877 | 30.1 % | 19.5 % | 3.93 | 1.547 | 2.274 | -0.060 | 0.93 | 83.21 | 424 | 0 |
| ALL | 4858 | BO 3353, PB 649, MC 413, MR 315, SR 128 | 1034 | 30.2 % | 23.6 % | 3.66 | 1.483 | 2.290 | -0.099 | 0.89 | 155.91 | 5943 | 0 |

## HOLD
| Variant | Signals | Model mix | Trades | Wrong-direction | Capture | Entry timing mean (bars) | SL risk mean (ATR) | TP2 mean (R) | Expectancy (R) | PF | Max DD (R) | Decisions changed | Unexplained |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CONTROL | 5519 | BO 3930, PB 675, MC 461, MR 229, SR 224 | 1163 | 29.7 % | 26.6 % | 3.93 | 1.505 | 2.333 | -0.064 | 0.93 | 98.89 | — | — |
| D1 | 6230 | BO 4623, PB 687, MC 467, MR 233, SR 220 | 1348 | 28.6 % | 29.7 % | 3.82 | 1.431 | 2.333 | -0.024 | 0.97 | 81.32 | 4444 | 0 |
| D2 | 5998 | BO 3930, MR 703, PB 675, MC 461, SR 229 | 1238 | 30.5 % | 28.6 % | 3.68 | 1.468 | 2.353 | -0.082 | 0.91 | 123.00 | 1448 | 0 |
| D3 | 5697 | BO 3894, PB 891, MC 461, MR 229, SR 222 | 1166 | 29.2 % | 26.7 % | 3.84 | 1.525 | 2.329 | -0.059 | 0.93 | 91.66 | 639 | 0 |
| D4 | 5450 | BO 3930, PB 675, MC 461, SR 224, MR 160 | 1152 | 29.9 % | 26.1 % | 3.96 | 1.507 | 2.332 | -0.069 | 0.92 | 103.50 | 292 | 0 |
| D5 | 5513 | BO 3926, PB 674, MC 461, MR 228, SR 224 | 1162 | 29.6 % | 26.6 % | 3.93 | 1.505 | 2.334 | -0.060 | 0.93 | 94.17 | 7 | 0 |
| D6 | 5495 | BO 3913, PB 668, MC 461, MR 229, SR 224 | 1159 | 29.6 % | 26.5 % | 3.93 | 1.505 | 2.333 | -0.060 | 0.93 | 93.94 | 509 | 0 |
| ALL | 6553 | BO 4557, PB 894, MC 467, MR 407, SR 228 | 1364 | 29.3 % | 30.2 % | 3.66 | 1.434 | 2.343 | -0.027 | 0.97 | 88.75 | 6568 | 0 |

FLAGGED: D1 and ALL change thousands of decisions because the corrected structure primitive feeds the 5m, 15m, 30m and 1H tiers. Every changed decision is explained by a changed recorded primitive (unexplained = 0 for every variant). Single corrections do not sum to ALL: they interact through shared structure inputs.
