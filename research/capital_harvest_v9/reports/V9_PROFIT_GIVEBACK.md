# V9_PROFIT_GIVEBACK

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Give-back = MFE on the policy path − realized, over trades whose MFE reached ≥ 0.5 R ("meaningful profit available").

| Split | Policy | Trades | Mean give-back (R) | Aggregate % of MFE | Mean USD (0.01 lot) |
|---|---|---|---|---|---|
| DEV | BASELINE A | 3331 | 1.168 | 69.6 % | 6.29 |
| DEV | POLICY1_D_arm0.75_rho0.5_h1.25 | 3331 | 0.810 | 60.7 % | 4.36 |
| DEV | POLICY2_E_arm1_k1.5_h1 | 3331 | 1.081 | 67.4 % | 5.64 |
| DEV | POLICY3_A_arm0.75_lag0.5_h1.25 | 3331 | 0.897 | 62.8 % | 4.88 |
| DEV | FLOOR_A_arm0.75_lag0.5 | 3331 | 0.847 | 61.6 % | 4.56 |
| DEV | FLOOR_B_arm0.75_k2 | 3331 | 0.906 | 63.1 % | 4.78 |
| DEV | FLOOR_C_arm0.75 | 3331 | 0.930 | 63.9 % | 5.01 |
| DEV | FLOOR_D_arm0.75_rho0.4 | 3331 | 0.799 | 60.0 % | 4.26 |
| DEV | FLOOR_E_arm0.75_k1.5 | 3331 | 0.879 | 62.8 % | 4.57 |
| HOLD | BASELINE A | 4592 | 1.223 | 70.3 % | 11.03 |
| HOLD | POLICY1_D_arm0.75_rho0.5_h1.25 | 4592 | 0.819 | 61.2 % | 7.34 |
| HOLD | POLICY2_E_arm1_k1.5_h1 | 4592 | 1.110 | 67.3 % | 9.75 |
| HOLD | POLICY3_A_arm0.75_lag0.5_h1.25 | 4592 | 0.899 | 62.7 % | 8.20 |
| HOLD | FLOOR_A_arm0.75_lag0.5 | 4592 | 0.863 | 62.3 % | 7.83 |
| HOLD | FLOOR_B_arm0.75_k2 | 4592 | 0.945 | 64.1 % | 8.30 |
| HOLD | FLOOR_C_arm0.75 | 4592 | 0.962 | 64.5 % | 8.55 |
| HOLD | FLOOR_D_arm0.75_rho0.4 | 4592 | 0.818 | 61.2 % | 7.34 |
| HOLD | FLOOR_E_arm0.75_k1.5 | 4592 | 0.913 | 63.7 % | 7.85 |

Give-back falls by 0.1–0.4 R per trade, but the saved give-back is offset by the profit forgone on trades that would have continued (V9_EARLY_EXIT_ANALYSIS), so expectancy barely changes.
