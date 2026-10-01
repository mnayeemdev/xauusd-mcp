# V9_COST_STRESS

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

NORMAL = spread 0.24 + slippage 0.10 USD; STRESS = 0.60 + 0.20. Every exit pays slippage once; no partial exits (no extra churn).

| Split | Policy | Normal expectancy | Stress expectancy | Normal paired | Stress paired |
|---|---|---|---|---|---|
| DEV | POLICY1_D_arm0.75_rho0.5_h1.25 | -0.078 | -0.205 | 0.010 | 0.008 |
| DEV | POLICY2_E_arm1_k1.5_h1 | -0.081 | -0.207 | 0.008 | 0.006 |
| DEV | POLICY3_A_arm0.75_lag0.5_h1.25 | -0.074 | -0.203 | 0.015 | 0.010 |
| DEV | FLOOR_A_arm0.75_lag0.5 | -0.076 | -0.205 | 0.013 | 0.008 |
| DEV | FLOOR_B_arm0.75_k2 | -0.075 | -0.201 | 0.014 | 0.013 |
| DEV | FLOOR_C_arm0.75 | -0.078 | -0.203 | 0.010 | 0.010 |
| DEV | FLOOR_D_arm0.75_rho0.4 | -0.074 | -0.203 | 0.015 | 0.010 |
| DEV | FLOOR_E_arm0.75_k1.5 | -0.082 | -0.206 | 0.007 | 0.007 |
| HOLD | POLICY1_D_arm0.75_rho0.5_h1.25 | -0.041 | -0.111 | 0.002 | 0.010 |
| HOLD | POLICY2_E_arm1_k1.5_h1 | -0.028 | -0.110 | 0.015 | 0.011 |
| HOLD | POLICY3_A_arm0.75_lag0.5_h1.25 | -0.030 | -0.106 | 0.013 | 0.015 |
| HOLD | FLOOR_A_arm0.75_lag0.5 | -0.040 | -0.115 | 0.003 | 0.007 |
| HOLD | FLOOR_B_arm0.75_k2 | -0.034 | -0.106 | 0.009 | 0.015 |
| HOLD | FLOOR_C_arm0.75 | -0.034 | -0.107 | 0.009 | 0.014 |
| HOLD | FLOOR_D_arm0.75_rho0.4 | -0.043 | -0.117 | 0.000 | 0.004 |
| HOLD | FLOOR_E_arm0.75_k1.5 | -0.041 | -0.116 | 0.002 | 0.006 |
| DEV | BASELINE A | -0.089 | -0.213 | — | — |
| HOLD | BASELINE A | -0.043 | -0.121 | — | — |

The small paired gain survives stress, but every absolute result is negative: Capital Harvest cannot turn the negative entry expectancy positive.
