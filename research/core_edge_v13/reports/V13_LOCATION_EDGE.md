# V13_LOCATION_EDGE

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## Do the existing entry gates (quality, location ≤ 2.5 ATR, RR ≥ 1.70, conflict) add value? (DIRECTION → ENTRY change)
| Strategy | DIRECTION → ENTRY (DEV · HOLD) | Class |
|---|---|---|
| MC | DEV -0.030 [-0.131, 0.065] · · HOLD -0.054 [-0.141, 0.031] · | NOT_DEMONSTRATED |
| PB | DEV 0.008 [-0.139, 0.165] · · HOLD -0.000 [-0.095, 0.099] · | NOT_DEMONSTRATED |
| BO | DEV 0.031 [-0.034, 0.096] · · HOLD -0.027 [-0.081, 0.032] · | NOT_DEMONSTRATED |
| SR | DEV -0.023 [-0.237, 0.210] · · HOLD 0.079 [-0.078, 0.234] · | NOT_DEMONSTRATED |
| MR | DEV -0.033 [-0.249, 0.210] · · HOLD 0.143 [-0.052, 0.347] · | NOT_DEMONSTRATED |
| ALL | DEV 0.015 [-0.046, 0.074] · · HOLD -0.011 [-0.054, 0.036] · | NOT_DEMONSTRATED |

## Existing location classes (V8: VALID ≤ 2.0 ATR, MARGINAL 2.0–2.5 ATR from the anchor), valid entries, net R
| Strategy | Level | n DEV | n HOLD | Sample | DEV net R | HOLD net R | Gross R DEV / HOLD | Stress R DEV / HOLD | PF DEV / HOLD |
|---|---|---|---|---|---|---|---|---|---|
| MC | MARGINAL_2.0_2.5 | 32 | 31 | INSUFFICIENT_EVIDENCE | 0.486 [-0.105, 0.976] · | 0.074 [-0.482, 0.589] · | 0.514 / 0.088 | 0.433 / 0.043 | 1.99 / 1.12 |
| MC | VALID_LE_2.0 | 381 | 436 | sufficient | -0.187 [-0.428, 0.048] · | -0.097 [-0.296, 0.098] · | -0.131 / -0.062 | -0.297 / -0.152 | 0.76 / 0.87 |
| PB | MARGINAL_2.0_2.5 | 148 | 223 | sufficient | 0.291 [-0.036, 0.602] · | -0.197 [-0.443, 0.060] · | 0.330 / -0.159 | 0.203 / -0.267 | 1.50 / 0.75 |
| PB | VALID_LE_2.0 | 501 | 671 | sufficient | 0.009 [-0.203, 0.216] · | 0.004 [-0.159, 0.162] · | 0.080 / 0.055 | -0.196 / -0.112 | 1.01 / 1.01 |
| BO | MARGINAL_2.0_2.5 | 134 | 175 | sufficient | 0.139 [-0.173, 0.451] · | -0.073 [-0.351, 0.209] · | 0.186 / -0.052 | 0.025 / -0.143 | 1.22 / 0.90 |
| BO | VALID_LE_2.0 | 3219 | 4382 | sufficient | -0.109 [-0.232, -0.004] ▼ | -0.034 [-0.110, 0.059] · | -0.008 / 0.034 | -0.364 / -0.199 | 0.86 / 0.96 |
| SR | VALID_LE_2.0 | 128 | 228 | sufficient | -0.222 [-0.523, 0.069] · | -0.186 [-0.401, 0.021] · | -0.090 / -0.097 | -0.505 / -0.367 | 0.75 / 0.78 |
| MR | VALID_LE_2.0 | 315 | 407 | sufficient | -0.193 [-0.429, 0.081] · | 0.009 [-0.285, 0.369] · | -0.092 / 0.084 | -0.456 / -0.161 | 0.78 / 1.01 |
| ALL | MARGINAL_2.0_2.5 | 314 | 429 | sufficient | 0.246 [0.006, 0.449] ▲ | -0.127 [-0.296, 0.034] · | 0.287 / -0.097 | 0.151 / -0.194 | 1.41 / 0.83 |
| ALL | VALID_LE_2.0 | 4544 | 6124 | sufficient | -0.112 [-0.211, -0.013] ▼ | -0.037 [-0.115, 0.039] · | -0.017 / 0.028 | -0.350 / -0.190 | 0.86 / 0.95 |

## Reading
- **No location edge is demonstrated.**
- **The combined engine's MARGINAL class is unstable.** It passed the DEV screen (net 0.246 [0.006, 0.449]) and reversed on HOLD (-0.127 [-0.296, 0.034]).
- **No distance threshold was invented or optimised.** Only the two existing V8 classes were used.
