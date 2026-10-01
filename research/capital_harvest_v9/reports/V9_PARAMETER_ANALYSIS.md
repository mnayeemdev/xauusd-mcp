# V9_PARAMETER_ANALYSIS

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Every tested configuration (DEV, normal cost, 4858 signals), sorted by paired gain:

| Configuration | Family | Parameters | Paired (R) | 95 % CI | Expectancy | PF | Win | Avg win | Premature | Right tail kept | Seq. DD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FLOOR_D_arm0.75_rho0.4 | D | {family:D,arm:0.75,rho:0.4,harvestMinR:null} | 0.015 | [-0.011, 0.043] | -0.074 | 0.87 | 58.6 % | 0.81 | 63.2 % | 47.2 % | 80.51 |
| POLICY3_A_arm0.75_lag0.5_h1.25 | POLICY3 | {family:A,arm:0.75,lag:0.5,harvestMinR:1.25} | 0.015 | [-0.011, 0.043] | -0.074 | 0.87 | 47.0 % | 1.01 | 70.3 % | 32.3 % | 94.93 |
| FLOOR_B_arm0.75_k2 | B | {family:B,arm:0.75,k:2,harvestMinR:null} | 0.014 | [-0.01, 0.039] | -0.075 | 0.86 | 39.1 % | 1.21 | 62.5 % | 60.1 % | 81.88 |
| FLOOR_A_arm0.75_lag0.5 | A | {family:A,arm:0.75,lag:0.5,harvestMinR:null} | 0.013 | [-0.012, 0.04] | -0.076 | 0.86 | 46.8 % | 1.01 | 66.2 % | 48.0 % | 108.08 |
| FLOOR_B_arm1_k2 | B | {family:B,arm:1,k:2,harvestMinR:null} | 0.013 | [-0.008, 0.035] | -0.075 | 0.88 | 43.0 % | 1.29 | 62.3 % | 70.4 % | 102.04 |
| POLICY3_A_arm0.75_lag0.5_h1 | POLICY3 | {family:A,arm:0.75,lag:0.5,harvestMinR:1} | 0.013 | [-0.013, 0.041] | -0.076 | 0.86 | 47.0 % | 1.01 | 70.6 % | 30.7 % | 101.15 |
| FLOOR_A_arm0.75_lag0.75 | A | {family:A,arm:0.75,lag:0.75,harvestMinR:null} | 0.012 | [-0.012, 0.038] | -0.077 | 0.86 | 46.7 % | 1.01 | 62.4 % | 57.1 % | 110.89 |
| POLICY3_A_arm0.75_lag0.75_h1.25 | POLICY3 | {family:A,arm:0.75,lag:0.75,harvestMinR:1.25} | 0.012 | [-0.014, 0.04] | -0.077 | 0.86 | 46.9 % | 1.01 | 69.6 % | 39.7 % | 94.79 |
| POLICY3_A_arm1_lag0.5_h1.25 | POLICY3 | {family:A,arm:1,lag:0.5,harvestMinR:1.25} | 0.012 | [-0.011, 0.037] | -0.077 | 0.88 | 54.1 % | 1.02 | 70.1 % | 38.9 % | 117.60 |
| FLOOR_D_arm1_rho0.4 | D | {family:D,arm:1,rho:0.4,harvestMinR:null} | 0.011 | [-0.012, 0.035] | -0.078 | 0.88 | 54.1 % | 1.02 | 63.2 % | 60.9 % | 132.05 |
| POLICY3_A_arm0.75_lag0.75_h1 | POLICY3 | {family:A,arm:0.75,lag:0.75,harvestMinR:1} | 0.011 | [-0.015, 0.039] | -0.078 | 0.86 | 46.9 % | 1.01 | 70.1 % | 36.7 % | 103.29 |
| FLOOR_C_arm0.75 | C | {family:C,arm:0.75,harvestMinR:null} | 0.010 | [-0.013, 0.036] | -0.078 | 0.86 | 32.6 % | 1.45 | 60.3 % | 64.3 % | 87.70 |
| FLOOR_A_arm1_lag0.75 | A | {family:A,arm:1,lag:0.75,harvestMinR:null} | 0.010 | [-0.011, 0.033] | -0.078 | 0.88 | 54.0 % | 1.02 | 62.0 % | 66.6 % | 126.88 |
| POLICY1_D_arm0.75_rho0.5_h1.25 | POLICY1 | {family:D,arm:0.75,rho:0.5,harvestMinR:1.25} | 0.010 | [-0.017, 0.039] | -0.078 | 0.86 | 58.6 % | 0.81 | 68.7 % | 28.2 % | 83.95 |
| POLICY3_A_arm1_lag0.75_h1.25 | POLICY3 | {family:A,arm:1,lag:0.75,harvestMinR:1.25} | 0.009 | [-0.014, 0.033] | -0.080 | 0.87 | 54.0 % | 1.02 | 69.1 % | 47.3 % | 103.99 |
| FLOOR_D_arm0.75_rho0.5 | D | {family:D,arm:0.75,rho:0.5,harvestMinR:null} | 0.008 | [-0.018, 0.036] | -0.080 | 0.85 | 58.6 % | 0.80 | 65.7 % | 39.1 % | 101.55 |
| FLOOR_A_arm1_lag0.5 | A | {family:A,arm:1,lag:0.5,harvestMinR:null} | 0.008 | [-0.014, 0.032] | -0.081 | 0.87 | 54.1 % | 1.01 | 66.3 % | 55.7 % | 138.16 |
| FLOOR_C_arm1 | C | {family:C,arm:1,harvestMinR:null} | 0.008 | [-0.012, 0.03] | -0.080 | 0.87 | 37.2 % | 1.47 | 62.4 % | 75.1 % | 108.79 |
| POLICY1_D_arm0.75_rho0.5_h1 | POLICY1 | {family:D,arm:0.75,rho:0.5,harvestMinR:1} | 0.008 | [-0.019, 0.037] | -0.080 | 0.85 | 58.6 % | 0.80 | 68.9 % | 26.6 % | 86.42 |
| POLICY2_E_arm1_k1.5_h1 | POLICY2 | {family:E,arm:1,k:1.5,harvestMinR:1} | 0.008 | [-0.016, 0.035] | -0.081 | 0.87 | 46.2 % | 1.19 | 71.9 % | 43.1 % | 96.63 |
| POLICY3_A_arm1_lag0.5_h1 | POLICY3 | {family:A,arm:1,lag:0.5,harvestMinR:1} | 0.008 | [-0.015, 0.032] | -0.080 | 0.87 | 54.1 % | 1.01 | 70.6 % | 36.4 % | 127.83 |
| POLICY2_E_arm1_k1.5_h1.25 | POLICY2 | {family:E,arm:1,k:1.5,harvestMinR:1.25} | 0.008 | [-0.016, 0.035] | -0.081 | 0.87 | 46.2 % | 1.19 | 72.0 % | 45.5 % | 92.38 |
| FLOOR_B_arm0.75_k1.5 | B | {family:B,arm:0.75,k:1.5,harvestMinR:null} | 0.007 | [-0.018, 0.034] | -0.082 | 0.85 | 44.6 % | 1.05 | 64.2 % | 53.5 % | 99.41 |
| FLOOR_E_arm0.75_k1.5 | E | {family:E,arm:0.75,k:1.5,harvestMinR:null} | 0.007 | [-0.018, 0.034] | -0.082 | 0.85 | 44.6 % | 1.05 | 64.2 % | 53.5 % | 99.30 |
| FLOOR_B_arm1_k1.5 | B | {family:B,arm:1,k:1.5,harvestMinR:null} | 0.007 | [-0.014, 0.03] | -0.081 | 0.87 | 46.5 % | 1.18 | 65.4 % | 63.5 % | 114.56 |
| FLOOR_E_arm1_k1.5 | E | {family:E,arm:1,k:1.5,harvestMinR:null} | 0.007 | [-0.014, 0.03] | -0.081 | 0.87 | 46.5 % | 1.18 | 65.4 % | 63.5 % | 114.50 |
| POLICY3_A_arm0.75_lag0.5_h0.75 | POLICY3 | {family:A,arm:0.75,lag:0.5,harvestMinR:0.75} | 0.007 | [-0.019, 0.035] | -0.082 | 0.85 | 47.0 % | 1.00 | 71.3 % | 28.6 % | 108.48 |
| POLICY2_E_arm0.75_k1.5_h1 | POLICY2 | {family:E,arm:0.75,k:1.5,harvestMinR:1} | 0.006 | [-0.021, 0.035] | -0.083 | 0.85 | 44.4 % | 1.05 | 70.1 % | 36.0 % | 84.66 |
| POLICY3_A_arm1_lag0.75_h1 | POLICY3 | {family:A,arm:1,lag:0.75,harvestMinR:1} | 0.006 | [-0.017, 0.03] | -0.082 | 0.87 | 54.0 % | 1.01 | 69.9 % | 43.1 % | 117.33 |
| POLICY1_D_arm0.75_rho0.5_h0.75 | POLICY1 | {family:D,arm:0.75,rho:0.5,harvestMinR:0.75} | 0.005 | [-0.022, 0.034] | -0.083 | 0.85 | 58.6 % | 0.80 | 69.1 % | 25.4 % | 95.97 |
| POLICY1_D_arm0.75_rho0.6_h1.25 | POLICY1 | {family:D,arm:0.75,rho:0.6,harvestMinR:1.25} | 0.005 | [-0.022, 0.034] | -0.084 | 0.85 | 58.6 % | 0.80 | 69.2 % | 22.6 % | 75.83 |
| POLICY2_E_arm0.75_k1.5_h1.25 | POLICY2 | {family:E,arm:0.75,k:1.5,harvestMinR:1.25} | 0.005 | [-0.021, 0.034] | -0.084 | 0.85 | 44.4 % | 1.05 | 70.4 % | 37.6 % | 84.76 |
| POLICY3_A_arm0.75_lag0.75_h0.75 | POLICY3 | {family:A,arm:0.75,lag:0.75,harvestMinR:0.75} | 0.004 | [-0.021, 0.033] | -0.084 | 0.85 | 46.9 % | 0.99 | 70.7 % | 33.7 % | 116.83 |
| POLICY1_D_arm0.75_rho0.6_h1 | POLICY1 | {family:D,arm:0.75,rho:0.6,harvestMinR:1} | 0.004 | [-0.022, 0.033] | -0.085 | 0.85 | 58.6 % | 0.79 | 69.4 % | 22.1 % | 77.42 |
| FLOOR_D_arm1_rho0.5 | D | {family:D,arm:1,rho:0.5,harvestMinR:null} | 0.003 | [-0.02, 0.027] | -0.086 | 0.86 | 54.1 % | 1.00 | 67.0 % | 52.6 % | 147.09 |
| POLICY2_E_arm0.75_k1_h1.25 | POLICY2 | {family:E,arm:0.75,k:1,harvestMinR:1.25} | 0.003 | [-0.024, 0.032] | -0.085 | 0.84 | 52.1 % | 0.89 | 70.4 % | 30.4 % | 113.30 |
| POLICY2_E_arm1_k1.5_h0.75 | POLICY2 | {family:E,arm:1,k:1.5,harvestMinR:0.75} | 0.003 | [-0.021, 0.029] | -0.086 | 0.86 | 46.5 % | 1.17 | 72.5 % | 40.3 % | 107.06 |
| FLOOR_D_arm0.75_rho0.6 | D | {family:D,arm:0.75,rho:0.6,harvestMinR:null} | 0.002 | [-0.024, 0.031] | -0.087 | 0.84 | 58.6 % | 0.79 | 67.7 % | 30.3 % | 91.57 |
| POLICY1_D_arm0.75_rho0.6_h0.75 | POLICY1 | {family:D,arm:0.75,rho:0.6,harvestMinR:0.75} | 0.002 | [-0.024, 0.032] | -0.086 | 0.84 | 58.6 % | 0.79 | 69.4 % | 21.7 % | 85.17 |
| POLICY2_E_arm0.75_k1_h0.75 | POLICY2 | {family:E,arm:0.75,k:1,harvestMinR:0.75} | 0.002 | [-0.025, 0.031] | -0.086 | 0.84 | 52.2 % | 0.89 | 70.3 % | 29.6 % | 125.86 |
| POLICY2_E_arm0.75_k1.5_h0.75 | POLICY2 | {family:E,arm:0.75,k:1.5,harvestMinR:0.75} | 0.002 | [-0.024, 0.031] | -0.087 | 0.84 | 44.6 % | 1.04 | 70.5 % | 34.1 % | 98.13 |
| POLICY2_E_arm0.75_k1_h1 | POLICY2 | {family:E,arm:0.75,k:1,harvestMinR:1} | 0.002 | [-0.025, 0.031] | -0.087 | 0.84 | 52.1 % | 0.89 | 70.3 % | 30.0 % | 116.24 |
| POLICY1_D_arm1_rho0.5_h1.25 | POLICY1 | {family:D,arm:1,rho:0.5,harvestMinR:1.25} | 0.002 | [-0.022, 0.028] | -0.086 | 0.86 | 54.1 % | 1.00 | 71.2 % | 38.0 % | 127.44 |
| POLICY3_A_arm1_lag0.5_h0.75 | POLICY3 | {family:A,arm:1,lag:0.5,harvestMinR:0.75} | 0.001 | [-0.022, 0.025] | -0.087 | 0.86 | 54.1 % | 1.00 | 71.3 % | 33.8 % | 131.06 |
| POLICY2_E_arm1_k1_h1.25 | POLICY2 | {family:E,arm:1,k:1,harvestMinR:1.25} | 0.001 | [-0.022, 0.026] | -0.088 | 0.86 | 50.9 % | 1.06 | 73.0 % | 37.0 % | 128.44 |
| FLOOR_B_arm0.75_k1 | B | {family:B,arm:0.75,k:1,harvestMinR:null} | 0.000 | [-0.026, 0.028] | -0.089 | 0.84 | 52.1 % | 0.89 | 66.4 % | 41.8 % | 114.81 |
| FLOOR_E_arm0.75_k1 | E | {family:E,arm:0.75,k:1,harvestMinR:null} | 0.000 | [-0.026, 0.028] | -0.089 | 0.84 | 52.1 % | 0.89 | 66.4 % | 41.8 % | 114.81 |
| POLICY1_D_arm1_rho0.5_h1 | POLICY1 | {family:D,arm:1,rho:0.5,harvestMinR:1} | 0.000 | [-0.024, 0.026] | -0.089 | 0.86 | 54.1 % | 1.00 | 71.6 % | 35.3 % | 131.31 |
| POLICY2_E_arm1_k1_h1 | POLICY2 | {family:E,arm:1,k:1,harvestMinR:1} | 0.000 | [-0.023, 0.024] | -0.089 | 0.86 | 50.9 % | 1.06 | 72.9 % | 36.3 % | 129.99 |
| FLOOR_B_arm1_k1 | B | {family:B,arm:1,k:1,harvestMinR:null} | -0.001 | [-0.024, 0.023] | -0.090 | 0.86 | 50.9 % | 1.06 | 68.6 % | 50.9 % | 138.87 |
| FLOOR_E_arm1_k1 | E | {family:E,arm:1,k:1,harvestMinR:null} | -0.001 | [-0.024, 0.023] | -0.090 | 0.86 | 50.9 % | 1.06 | 68.6 % | 50.9 % | 138.87 |
| POLICY2_E_arm1_k1_h0.75 | POLICY2 | {family:E,arm:1,k:1,harvestMinR:0.75} | -0.001 | [-0.024, 0.024] | -0.089 | 0.86 | 50.9 % | 1.06 | 73.0 % | 35.7 % | 133.32 |
| POLICY3_A_arm1_lag0.75_h0.75 | POLICY3 | {family:A,arm:1,lag:0.75,harvestMinR:0.75} | -0.001 | [-0.024, 0.023] | -0.090 | 0.86 | 54.0 % | 1.00 | 70.6 % | 39.5 % | 128.20 |
| POLICY1_D_arm1_rho0.6_h1.25 | POLICY1 | {family:D,arm:1,rho:0.6,harvestMinR:1.25} | -0.001 | [-0.025, 0.024] | -0.090 | 0.86 | 54.1 % | 0.99 | 72.2 % | 31.9 % | 119.67 |
| FLOOR_D_arm1_rho0.6 | D | {family:D,arm:1,rho:0.6,harvestMinR:null} | -0.002 | [-0.024, 0.023] | -0.090 | 0.86 | 54.1 % | 0.99 | 69.8 % | 44.1 % | 138.76 |
| POLICY1_D_arm1_rho0.6_h1 | POLICY1 | {family:D,arm:1,rho:0.6,harvestMinR:1} | -0.002 | [-0.026, 0.024] | -0.090 | 0.86 | 54.1 % | 0.99 | 72.5 % | 30.8 % | 122.55 |
| POLICY1_D_arm1_rho0.5_h0.75 | POLICY1 | {family:D,arm:1,rho:0.5,harvestMinR:0.75} | -0.005 | [-0.028, 0.021] | -0.094 | 0.85 | 54.1 % | 0.99 | 72.0 % | 33.3 % | 135.19 |
| POLICY1_D_arm1_rho0.6_h0.75 | POLICY1 | {family:D,arm:1,rho:0.6,harvestMinR:0.75} | -0.005 | [-0.029, 0.02] | -0.094 | 0.85 | 54.1 % | 0.99 | 72.7 % | 29.8 % | 128.27 |

## Classification
| Class | Parameters |
|---|---|
| SUPPORTED_PARAMETERS | none — no configuration met the right-tail (≥ 80 %) and premature (≤ 30 %) constraints |
| REJECTED_PARAMETERS | tight protection: arm 0.75 R with retention ρ ≥ 0.4, R-step lag 0.5, chandelier k 1.0–1.5 (premature 63–71 %, right tail 22–54 %); harvestMinR 0.75 (mean paired gain 0.001 R vs 0.007 R at 1.25 R) |
| UNRESOLVED_PARAMETERS | wider protection (chandelier k ≥ 2.5, arm ≥ 1.5 R) and harvestMinR > 1.25 R were not in the pre-registered grid: k 2.0 / arm 1.0 kept 70 % of the tail on DEV, so the trend is toward "less management", which converges on the baseline or on RUN_TO_END (regime-dependent, V9_RIGHT_TAIL_ANALYSIS) |

No parameter was tuned on the HOLDOUT.
