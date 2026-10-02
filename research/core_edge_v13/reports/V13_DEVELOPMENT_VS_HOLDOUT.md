# V13_DEVELOPMENT_VS_HOLDOUT

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## All pre-registered subgroups (66)
- **Sample:** 49 have sufficient samples (≥ 100 entries in each split); 17 are INSUFFICIENT_EVIDENCE.
- **Sign stability:** of the sufficient ones, 31 keep the same sign on both splits.
- **Positive on both splits (point estimates):** 3, all with intervals through 0.

| Subgroup (strategy | grouping | level) | n DEV | n HOLD | Sample | DEV net R | HOLD net R | Sign stable | Passes DEV screen | Passes HOLD criteria |
|---|---|---|---|---|---|---|---|---|
| MC|DIRECTION|BUY | 226 | 202 | SUFFICIENT | -0.083 [-0.435, 0.246] · | -0.049 [-0.373, 0.237] · | yes | no | no |
| MC|DIRECTION|SELL | 187 | 265 | SUFFICIENT | -0.197 [-0.499, 0.080] · | -0.114 [-0.371, 0.161] · | yes | no | no |
| MC|LOCATION|MARGINAL_2.0_2.5 | 32 | 31 | INSUFFICIENT_EVIDENCE | 0.486 [-0.105, 0.976] · | 0.074 [-0.482, 0.589] · | yes | no | no |
| MC|LOCATION|VALID_LE_2.0 | 381 | 436 | SUFFICIENT | -0.187 [-0.428, 0.048] · | -0.097 [-0.296, 0.098] · | yes | no | no |
| MC|STRUCTURE|ALIGNED | 413 | 467 | SUFFICIENT | -0.135 [-0.371, 0.088] · | -0.086 [-0.292, 0.118] · | yes | no | no |
| MC|PATTERN_EVENT|BOS | 382 | 428 | SUFFICIENT | -0.079 [-0.312, 0.156] · | -0.093 [-0.302, 0.124] · | yes | no | no |
| MC|PATTERN_EVENT|CHOCH | 31 | 39 | INSUFFICIENT_EVIDENCE | -0.825 [-1.186, -0.341] ▼ | -0.007 [-0.530, 0.521] · | yes | no | no |
| MC|SL_SOURCE|candidate_anchor | 413 | 467 | SUFFICIENT | -0.135 [-0.371, 0.088] · | -0.086 [-0.292, 0.118] · | yes | no | no |
| MC|BIAS|ALIGNED | 413 | 467 | SUFFICIENT | -0.135 [-0.371, 0.088] · | -0.086 [-0.292, 0.118] · | yes | no | no |
| PB|DIRECTION|SELL | 302 | 498 | SUFFICIENT | 0.076 [-0.212, 0.337] · | 0.163 [-0.028, 0.337] · | yes | no | no |
| PB|DIRECTION|BUY | 347 | 396 | SUFFICIENT | 0.071 [-0.198, 0.337] · | -0.308 [-0.544, -0.084] ▼ | no | no | no |
| PB|LOCATION|VALID_LE_2.0 | 501 | 671 | SUFFICIENT | 0.009 [-0.203, 0.216] · | 0.004 [-0.159, 0.162] · | yes | no | no |
| PB|LOCATION|MARGINAL_2.0_2.5 | 148 | 223 | SUFFICIENT | 0.291 [-0.036, 0.602] · | -0.197 [-0.443, 0.060] · | no | no | no |
| PB|STRUCTURE|COUNTER | 146 | 190 | SUFFICIENT | 0.141 [-0.195, 0.493] · | 0.067 [-0.253, 0.360] · | yes | no | no |
| PB|STRUCTURE|ALIGNED | 503 | 704 | SUFFICIENT | 0.054 [-0.161, 0.266] · | -0.076 [-0.240, 0.077] · | no | no | no |
| PB|PATTERN_EVENT|CHOCH | 129 | 182 | SUFFICIENT | -0.122 [-0.497, 0.292] · | -0.066 [-0.440, 0.282] · | yes | no | no |
| PB|PATTERN_EVENT|BOS | 520 | 712 | SUFFICIENT | 0.122 [-0.093, 0.334] · | -0.041 [-0.206, 0.115] · | no | no | no |
| PB|SL_SOURCE|candidate_anchor+min_risk | 22 | 23 | INSUFFICIENT_EVIDENCE | -0.317 [-0.940, 0.412] · | 0.085 [-0.575, 0.757] · | no | no | no |
| PB|SL_SOURCE|candidate_anchor | 627 | 871 | SUFFICIENT | 0.087 [-0.113, 0.287] · | -0.049 [-0.201, 0.097] · | no | no | no |
| PB|BIAS|ALIGNED | 649 | 894 | SUFFICIENT | 0.073 [-0.125, 0.269] · | -0.046 [-0.193, 0.098] · | no | no | no |
| BO|DIRECTION|BUY | 2081 | 2202 | SUFFICIENT | -0.016 [-0.164, 0.127] · | -0.099 [-0.214, 0.033] · | yes | no | no |
| BO|DIRECTION|SELL | 1272 | 2355 | SUFFICIENT | -0.235 [-0.408, -0.063] ▼ | 0.023 [-0.090, 0.124] · | no | no | no |
| BO|LOCATION|VALID_LE_2.0 | 3219 | 4382 | SUFFICIENT | -0.109 [-0.232, -0.004] ▼ | -0.034 [-0.110, 0.059] · | yes | no | no |
| BO|LOCATION|MARGINAL_2.0_2.5 | 134 | 175 | SUFFICIENT | 0.139 [-0.173, 0.451] · | -0.073 [-0.351, 0.209] · | no | no | no |
| BO|STRUCTURE|ALIGNED | 3353 | 4557 | SUFFICIENT | -0.099 [-0.219, 0.006] · | -0.036 [-0.110, 0.053] · | yes | no | no |
| BO|PATTERN_EVENT|CHOCH | 477 | 674 | SUFFICIENT | -0.277 [-0.485, -0.061] ▼ | -0.039 [-0.235, 0.161] · | yes | no | no |
| BO|PATTERN_EVENT|BOS | 2876 | 3883 | SUFFICIENT | -0.070 [-0.210, 0.041] · | -0.035 [-0.122, 0.053] · | yes | no | no |
| BO|SL_SOURCE|candidate_anchor+min_risk | 246 | 378 | SUFFICIENT | -0.306 [-0.494, -0.097] ▼ | -0.107 [-0.267, 0.069] · | yes | no | no |
| BO|SL_SOURCE|candidate_anchor | 3107 | 4179 | SUFFICIENT | -0.083 [-0.206, 0.031] · | -0.029 [-0.110, 0.065] · | yes | no | no |
| BO|BIAS|NEUTRAL | 1725 | 2284 | SUFFICIENT | -0.084 [-0.211, 0.054] · | 0.003 [-0.105, 0.119] · | no | no | no |
| BO|BIAS|ALIGNED | 1628 | 2273 | SUFFICIENT | -0.116 [-0.283, 0.058] · | -0.075 [-0.194, 0.043] · | yes | no | no |
| SR|DIRECTION|SELL | 63 | 129 | INSUFFICIENT_EVIDENCE | -0.381 [-0.783, 0.040] · | -0.061 [-0.370, 0.280] · | yes | no | no |
| SR|DIRECTION|BUY | 65 | 99 | INSUFFICIENT_EVIDENCE | -0.069 [-0.448, 0.321] · | -0.348 [-0.620, -0.063] ▼ | yes | no | no |
| SR|LOCATION|VALID_LE_2.0 | 128 | 228 | SUFFICIENT | -0.222 [-0.523, 0.069] · | -0.186 [-0.401, 0.021] · | yes | no | no |
| SR|STRUCTURE|COUNTER | 59 | 109 | INSUFFICIENT_EVIDENCE | 0.095 [-0.332, 0.493] · | -0.036 [-0.393, 0.307] · | no | no | no |
| SR|STRUCTURE|ALIGNED | 69 | 119 | INSUFFICIENT_EVIDENCE | -0.494 [-0.840, -0.100] ▼ | -0.323 [-0.596, -0.023] ▼ | yes | no | no |
| SR|PATTERN_EVENT|CHOCH | 45 | 58 | INSUFFICIENT_EVIDENCE | 0.089 [-0.449, 0.674] · | -0.275 [-0.743, 0.218] · | no | no | no |
| SR|PATTERN_EVENT|BOS | 83 | 170 | INSUFFICIENT_EVIDENCE | -0.391 [-0.694, -0.049] ▼ | -0.155 [-0.430, 0.103] · | yes | no | no |
| SR|SL_SOURCE|candidate_anchor | 126 | 226 | SUFFICIENT | -0.227 [-0.512, 0.041] · | -0.202 [-0.407, 0.018] · | yes | no | no |
| SR|SL_SOURCE|candidate_anchor+min_risk | 2 | 2 | INSUFFICIENT_EVIDENCE | 0.093 [-1.420, 1.607] · | 1.600 [1.521, 1.679] ▲ | yes | no | no |
| SR|BIAS|ALIGNED | 83 | 158 | INSUFFICIENT_EVIDENCE | -0.106 [-0.488, 0.259] · | -0.285 [-0.533, -0.018] ▼ | yes | no | no |
| SR|BIAS|NEUTRAL | 45 | 70 | INSUFFICIENT_EVIDENCE | -0.437 [-0.835, -0.015] ▼ | 0.037 [-0.383, 0.481] · | no | no | no |
| MR|DIRECTION|BUY | 56 | 101 | INSUFFICIENT_EVIDENCE | -0.076 [-0.568, 0.564] · | -0.214 [-0.631, 0.286] · | yes | no | no |
| MR|DIRECTION|SELL | 259 | 306 | SUFFICIENT | -0.218 [-0.463, 0.075] · | 0.082 [-0.270, 0.507] · | no | no | no |
| MR|LOCATION|VALID_LE_2.0 | 315 | 407 | SUFFICIENT | -0.193 [-0.429, 0.081] · | 0.009 [-0.285, 0.369] · | no | no | no |
| MR|STRUCTURE|COUNTER | 213 | 290 | SUFFICIENT | -0.227 [-0.569, 0.160] · | 0.053 [-0.303, 0.479] · | no | no | no |
| MR|STRUCTURE|ALIGNED | 102 | 117 | SUFFICIENT | -0.121 [-0.412, 0.201] · | -0.102 [-0.603, 0.413] · | yes | no | no |
| MR|PATTERN_EVENT|CHOCH | 88 | 118 | INSUFFICIENT_EVIDENCE | -0.282 [-0.686, 0.279] · | 0.447 [0.022, 0.912] ▲ | no | no | **yes** |
| MR|PATTERN_EVENT|BOS | 227 | 289 | SUFFICIENT | -0.158 [-0.439, 0.209] · | -0.170 [-0.493, 0.230] · | yes | no | no |
| MR|SL_SOURCE|candidate_anchor | 271 | 347 | SUFFICIENT | -0.168 [-0.429, 0.116] · | 0.067 [-0.273, 0.435] · | no | no | no |
| MR|SL_SOURCE|candidate_anchor+min_risk | 35 | 50 | INSUFFICIENT_EVIDENCE | -0.162 [-0.806, 0.486] · | -0.480 [-0.989, 0.102] · | yes | no | no |
| MR|SL_SOURCE|atr_fallback | 9 | 10 | INSUFFICIENT_EVIDENCE | -1.055 [-1.447, -0.205] ▼ | 0.423 [-1.034, 1.380] · | no | no | no |
| MR|BIAS|NEUTRAL | 315 | 407 | SUFFICIENT | -0.193 [-0.429, 0.081] · | 0.009 [-0.285, 0.369] · | no | no | no |
| ALL|DIRECTION|BUY | 2775 | 3000 | SUFFICIENT | -0.013 [-0.152, 0.113] · | -0.135 [-0.256, -0.018] ▼ | yes | no | no |
| ALL|DIRECTION|SELL | 2083 | 3553 | SUFFICIENT | -0.189 [-0.327, -0.059] ▼ | 0.034 [-0.061, 0.135] · | no | no | no |
| ALL|LOCATION|VALID_LE_2.0 | 4544 | 6124 | SUFFICIENT | -0.112 [-0.211, -0.013] ▼ | -0.037 [-0.115, 0.039] · | yes | no | no |
| ALL|LOCATION|MARGINAL_2.0_2.5 | 314 | 429 | SUFFICIENT | 0.246 [0.006, 0.449] ▲ | -0.127 [-0.296, 0.034] · | no | **yes** | no |
| ALL|STRUCTURE|ALIGNED | 4440 | 5964 | SUFFICIENT | -0.092 [-0.193, 0.009] · | -0.052 [-0.123, 0.032] · | yes | no | no |
| ALL|STRUCTURE|COUNTER | 418 | 589 | SUFFICIENT | -0.053 [-0.263, 0.195] · | 0.041 [-0.163, 0.251] · | no | no | no |
| ALL|PATTERN_EVENT|CHOCH | 770 | 1071 | SUFFICIENT | -0.252 [-0.417, -0.081] ▼ | -0.002 [-0.165, 0.167] · | yes | no | no |
| ALL|PATTERN_EVENT|BOS | 4088 | 5482 | SUFFICIENT | -0.058 [-0.173, 0.043] · | -0.051 [-0.136, 0.029] · | yes | no | no |
| ALL|SL_SOURCE|candidate_anchor+min_risk | 305 | 453 | SUFFICIENT | -0.287 [-0.477, -0.098] ▼ | -0.131 [-0.284, 0.034] · | yes | no | no |
| ALL|SL_SOURCE|candidate_anchor | 4544 | 6090 | SUFFICIENT | -0.073 [-0.170, 0.031] · | -0.037 [-0.116, 0.043] · | yes | no | no |
| ALL|SL_SOURCE|atr_fallback | 9 | 10 | INSUFFICIENT_EVIDENCE | -1.055 [-1.447, -0.205] ▼ | 0.423 [-1.034, 1.380] · | no | no | no |
| ALL|BIAS|NEUTRAL | 2085 | 2761 | SUFFICIENT | -0.108 [-0.227, 0.013] · | 0.005 [-0.101, 0.105] · | no | no | no |
| ALL|BIAS|ALIGNED | 2773 | 3792 | SUFFICIENT | -0.074 [-0.198, 0.066] · | -0.078 [-0.178, 0.032] · | yes | no | no |

## Reading
- **Frozen candidates:** only 1 subgroup passed the DEV screen (ALL|LOCATION|MARGINAL_2.0_2.5). It failed HOLD.
- **HOLD-only passes:** MR|PATTERN_EVENT|CHOCH passed the criteria on HOLD alone, after failing DEV. Selecting it would be holdout tuning, so it is NOT a candidate.
- **No subgroup works on both splits.**
