# V13_SETUP_EDGE

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## Does the setup add value beyond the pattern? (PATTERN → SETUP change in gross edge)
| Strategy | PATTERN → SETUP (DEV · HOLD) | Class | Label |
|---|---|---|---|
| MC | DEV 0.007 [-0.042, 0.053] · · HOLD 0.037 [-0.012, 0.087] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |
| PB | DEV -0.027 [-0.076, 0.025] · · HOLD 0.020 [-0.023, 0.064] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |
| BO | DEV -0.009 [-0.022, 0.006] · · HOLD -0.009 [-0.023, 0.004] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |
| SR | DEV 0.011 [-0.071, 0.090] · · HOLD -0.032 [-0.113, 0.046] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |
| MR | DEV -0.007 [-0.103, 0.087] · · HOLD 0.025 [-0.068, 0.126] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |
| ALL | DEV -0.019 [-0.051, 0.018] · · HOLD 0.013 [-0.016, 0.043] · | NOT_DEMONSTRATED | SETUP_ADDS_NO_DEMONSTRATED_EDGE |

## Existing setup / stop types (engine SL source), valid entries, net R
| Strategy | Level | n DEV | n HOLD | Sample | DEV net R | HOLD net R | Gross R DEV / HOLD | Stress R DEV / HOLD | PF DEV / HOLD |
|---|---|---|---|---|---|---|---|---|---|
| MC | candidate_anchor | 413 | 467 | sufficient | -0.135 [-0.371, 0.088] · | -0.086 [-0.292, 0.118] · | -0.081 / -0.052 | -0.240 / -0.140 | 0.83 / 0.88 |
| PB | candidate_anchor | 627 | 871 | sufficient | 0.087 [-0.113, 0.287] · | -0.049 [-0.201, 0.097] · | 0.147 / -0.003 | -0.083 / -0.146 | 1.12 / 0.93 |
| PB | candidate_anchor+min_risk | 22 | 23 | INSUFFICIENT_EVIDENCE | -0.317 [-0.940, 0.412] · | 0.085 [-0.575, 0.757] · | -0.163 / 0.170 | -0.747 / -0.305 | 0.68 / 1.11 |
| BO | candidate_anchor | 3107 | 4179 | sufficient | -0.083 [-0.206, 0.031] · | -0.029 [-0.110, 0.065] · | 0.007 / 0.032 | -0.311 / -0.175 | 0.89 / 0.96 |
| BO | candidate_anchor+min_risk | 246 | 378 | sufficient | -0.306 [-0.494, -0.097] ▼ | -0.107 [-0.267, 0.069] · | -0.100 / 0.021 | -0.827 / -0.444 | 0.68 / 0.88 |
| SR | candidate_anchor | 126 | 226 | sufficient | -0.227 [-0.512, 0.041] · | -0.202 [-0.407, 0.018] · | -0.096 / -0.113 | -0.506 / -0.382 | 0.74 / 0.77 |
| SR | candidate_anchor+min_risk | 2 | 2 | INSUFFICIENT_EVIDENCE | 0.093 [-1.420, 1.607] · | 1.600 [1.521, 1.679] ▲ | 0.257 / 1.700 | -0.437 / 1.321 | 1.13 / — |
| MR | atr_fallback | 9 | 10 | INSUFFICIENT_EVIDENCE | -1.055 [-1.447, -0.205] ▼ | 0.423 [-1.034, 1.380] · | -1.000 / 0.475 | -1.199 / 0.318 | 0.15 / 1.74 |
| MR | candidate_anchor | 271 | 347 | sufficient | -0.168 [-0.429, 0.116] · | 0.067 [-0.273, 0.435] · | -0.071 / 0.130 | -0.404 / -0.090 | 0.80 / 1.09 |
| MR | candidate_anchor+min_risk | 35 | 50 | INSUFFICIENT_EVIDENCE | -0.162 [-0.806, 0.486] · | -0.480 [-0.989, 0.102] · | -0.024 / -0.318 | -0.664 / -0.752 | 0.82 / 0.54 |
| ALL | atr_fallback | 9 | 10 | INSUFFICIENT_EVIDENCE | -1.055 [-1.447, -0.205] ▼ | 0.423 [-1.034, 1.380] · | -1.000 / 0.475 | -1.199 / 0.318 | 0.15 / 1.74 |
| ALL | candidate_anchor | 4544 | 6090 | sufficient | -0.073 [-0.170, 0.031] · | -0.037 [-0.116, 0.043] · | 0.011 / 0.021 | -0.284 / -0.171 | 0.91 / 0.95 |
| ALL | candidate_anchor+min_risk | 305 | 453 | sufficient | -0.287 [-0.477, -0.098] ▼ | -0.131 [-0.284, 0.034] · | -0.093 / -0.001 | -0.800 / -0.463 | 0.70 / 0.85 |

## Reading
**SETUP_ADDS_NO_DEMONSTRATED_EDGE** for every strategy: the pattern ≈ 0 and the setup adds ≈ 0.
