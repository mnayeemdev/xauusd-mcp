# V9_RIGHT_TAIL_ANALYSIS

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Strong trade = open-path (structural stop only) MFE ≥ 2.0 R. Kept = policy r ≥ baseline r − 0.05.

| Split | Policy | Strong trades | Kept | Closed below 1 R by management | Mean r policy | Mean r baseline |
|---|---|---|---|---|---|---|
| DEV | POLICY1_D_arm0.75_rho0.5_h1.25 | 1903 | 28.2 % | 63.4 % | 0.933 | 1.631 |
| DEV | POLICY2_E_arm1_k1.5_h1 | 1903 | 43.1 % | 36.4 % | 1.208 | 1.631 |
| DEV | POLICY3_A_arm0.75_lag0.5_h1.25 | 1903 | 32.3 % | 56.2 % | 1.004 | 1.631 |
| DEV | FLOOR_A_arm0.75_lag0.5 | 1903 | 48.0 % | 52.0 % | 0.988 | 1.631 |
| DEV | FLOOR_B_arm0.75_k2 | 1903 | 60.1 % | 39.2 % | 1.047 | 1.631 |
| DEV | FLOOR_C_arm0.75 | 1903 | 64.3 % | 35.2 % | 1.070 | 1.631 |
| DEV | FLOOR_D_arm0.75_rho0.4 | 1903 | 47.2 % | 52.8 % | 0.963 | 1.631 |
| DEV | FLOOR_E_arm0.75_k1.5 | 1903 | 53.5 % | 45.4 % | 1.004 | 1.631 |
| HOLD | POLICY1_D_arm0.75_rho0.5_h1.25 | 2586 | 28.0 % | 64.8 % | 0.921 | 1.663 |
| HOLD | POLICY2_E_arm1_k1.5_h1 | 2586 | 45.9 % | 36.3 % | 1.250 | 1.663 |
| HOLD | POLICY3_A_arm0.75_lag0.5_h1.25 | 2586 | 32.4 % | 57.7 % | 1.012 | 1.663 |
| HOLD | FLOOR_A_arm0.75_lag0.5 | 2586 | 45.7 % | 54.3 % | 0.979 | 1.663 |
| HOLD | FLOOR_B_arm0.75_k2 | 2586 | 61.2 % | 38.4 % | 1.069 | 1.663 |
| HOLD | FLOOR_C_arm0.75 | 2586 | 65.2 % | 34.6 % | 1.094 | 1.663 |
| HOLD | FLOOR_D_arm0.75_rho0.4 | 2586 | 44.3 % | 55.7 % | 0.937 | 1.663 |
| HOLD | FLOOR_E_arm0.75_k1.5 | 2586 | 54.0 % | 45.2 % | 1.015 | 1.663 |

**RIGHT_TAIL_PRESERVED = NO** for every policy (required ≥ 80 %).

## The uncapped reference and its drift control
RUN_TO_END (no target; structural SL, broker fail-safe, 288-bar horizon) — same entry bars and risk distance under different side assignments (NORMAL cost):

| Split | Side assignment | n | RUN_TO_END expectancy (R) | PF | Win | Fixed 1.70 R expectancy (R) |
|---|---|---|---|---|---|---|
| DEV | actual | 4858 | -0.081 | 0.93 | 12.7 % | -0.089 |
| DEV | opposite_side | 4858 | -0.169 | 0.86 | 13.1 % | -0.106 |
| DEV | random_side | 4858 | -0.020 | 0.98 | 13.8 % | -0.030 |
| DEV | actual_BUY_only | 2775 | 0.293 | 1.24 | 15.1 % | -0.013 |
| DEV | actual_SELL_only | 2083 | -0.580 | 0.53 | 9.4 % | -0.189 |
| DEV | all_entries_as_BUY | 4858 | 0.267 | 1.22 | 15.6 % | -0.027 |
| DEV | all_entries_as_SELL | 4858 | -0.517 | 0.58 | 10.1 % | -0.168 |
| HOLD | actual | 6549 | 0.465 | 1.39 | 14.2 % | -0.043 |
| HOLD | opposite_side | 6548 | 0.187 | 1.16 | 14.5 % | -0.091 |
| HOLD | random_side | 6549 | 0.424 | 1.36 | 14.6 % | -0.066 |
| HOLD | actual_BUY_only | 2996 | 0.303 | 1.25 | 14.1 % | -0.135 |
| HOLD | actual_SELL_only | 3553 | 0.601 | 1.51 | 14.4 % | 0.034 |
| HOLD | all_entries_as_BUY | 6544 | 0.170 | 1.14 | 13.8 % | -0.155 |
| HOLD | all_entries_as_SELL | 6553 | 0.481 | 1.41 | 15.0 % | 0.021 |

Market move: DEV 27.1 %, HOLD -3.4 %. On HOLD a RANDOM side earns almost as much as the real entries when held uncapped, and on DEV the real entries lose; the uncapped payoff is a 2026 volatility / regime property, not evidence that the entries or a run-the-winners rule have an edge. It is NOT proposed; a run-to-structure policy would need its own pre-registered study across regimes.
