# V13_COST_RESILIENCE

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## Cost bases
- **GROSS:** zero spread and slippage, swap added back.
- **NORMAL:** 0.24 + 0.10.
- **STRESS:** 0.60 + 0.60.
- **Gap risk:** excluded (V12 records it separately).

| Split | Strategy | Entries gross R | Entries normal R | Entries stress R | Walk gross / normal / stress R | Label |
|---|---|---|---|---|---|---|
| DEV | MC | -0.081 [-0.316, 0.146] · | -0.135 [-0.371, 0.088] · | -0.240 [-0.474, -0.019] ▼ | -0.121 / -0.191 / -0.305 | NO_COST_RESILIENT_EDGE |
| DEV | PB | 0.137 [-0.059, 0.332] · | 0.073 [-0.125, 0.269] · | -0.105 [-0.307, 0.100] · | 0.088 / 0.023 / -0.176 | NOT_DEMONSTRATED |
| DEV | BO | -0.000 [-0.118, 0.106] · | -0.099 [-0.219, 0.006] · | -0.349 [-0.469, -0.244] ▼ | 0.025 / -0.094 / -0.397 | NO_COST_RESILIENT_EDGE |
| DEV | SR | -0.090 [-0.399, 0.208] · | -0.222 [-0.523, 0.069] · | -0.505 [-0.803, -0.217] ▼ | -0.105 / -0.215 / -0.499 | NO_COST_RESILIENT_EDGE |
| DEV | MR | -0.092 [-0.324, 0.173] · | -0.193 [-0.429, 0.081] · | -0.456 [-0.680, -0.195] ▼ | -0.023 / -0.106 / -0.386 | NO_COST_RESILIENT_EDGE |
| DEV | ALL | 0.003 [-0.093, 0.099] · | -0.089 [-0.184, 0.010] · | -0.318 [-0.417, -0.217] ▼ | 0.018 / -0.077 / -0.336 | NO_COST_RESILIENT_EDGE |
| HOLD | MC | -0.052 [-0.259, 0.157] · | -0.086 [-0.292, 0.118] · | -0.140 [-0.345, 0.065] · | -0.059 / -0.081 / -0.137 | NO_COST_RESILIENT_EDGE |
| HOLD | PB | 0.001 [-0.146, 0.147] · | -0.046 [-0.193, 0.098] · | -0.150 [-0.304, -0.004] ▼ | 0.037 / -0.010 / -0.129 | NO_COST_RESILIENT_EDGE |
| HOLD | BO | 0.031 [-0.043, 0.121] · | -0.036 [-0.110, 0.053] · | -0.197 [-0.276, -0.106] ▼ | 0.066 / -0.017 / -0.205 | NO_COST_RESILIENT_EDGE |
| HOLD | SR | -0.097 [-0.306, 0.104] · | -0.186 [-0.401, 0.021] · | -0.367 [-0.580, -0.164] ▼ | -0.101 / -0.179 / -0.348 | NO_COST_RESILIENT_EDGE |
| HOLD | MR | 0.084 [-0.214, 0.431] · | 0.009 [-0.285, 0.369] · | -0.161 [-0.449, 0.194] · | 0.104 / 0.047 / -0.115 | NOT_DEMONSTRATED |
| HOLD | ALL | 0.020 [-0.054, 0.094] · | -0.043 [-0.118, 0.030] · | -0.190 [-0.269, -0.113] ▼ | 0.042 / -0.022 / -0.182 | NO_COST_RESILIENT_EDGE |

## Reading
- **No strategy has a gross expectancy whose interval is above 0 on either split.**
- **Costs make every strategy negative under stress on both splits.**
- **Where gross ≈ 0 and normal < 0, the label is NO_COST_RESILIENT_EDGE.**
- **Risk management and Capital Harvest cannot help.** Neither can compensate for this, and neither was used.
