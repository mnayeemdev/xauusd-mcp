# V9_REJECTED_POLICIES

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Every configuration is listed with the §21 failure conditions it meets (DEV); the frozen selections are also judged on HOLD. None relies on hindsight, loosens a floor, changes entries, increases frequency or adds partial-exit churn.

## Frozen selections on HOLD
| Policy | Verdict | Failed checks |
|---|---|---|
| POLICY1_D_arm0.75_rho0.5_h1.25 | INCONCLUSIVE | hold_paired_ci_lower_gt_0, hold_pf_ge_baseline, hold_seq_dd_le_baseline, right_tail_preserved_ge_80, premature_rate_le_30 |
| POLICY2_E_arm1_k1.5_h1 | INCONCLUSIVE | hold_paired_ci_lower_gt_0, right_tail_preserved_ge_80, premature_rate_le_30 |
| POLICY3_A_arm0.75_lag0.5_h1.25 | INCONCLUSIVE | hold_paired_ci_lower_gt_0, hold_seq_dd_le_baseline, right_tail_preserved_ge_80, premature_rate_le_30 |
| FLOOR_A_arm0.75_lag0.5 (floor-only) | REJECTED | premature 66.7 % > 30 %; right tail 45.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_B_arm0.75_k2 (floor-only) | REJECTED | premature 60.2 % > 30 %; right tail 61.2 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_C_arm0.75 (floor-only) | REJECTED | premature 50.4 % > 30 %; right tail 65.2 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_D_arm0.75_rho0.4 (floor-only) | REJECTED | premature 62.8 % > 30 %; right tail 44.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_E_arm0.75_k1.5 (floor-only) | REJECTED | premature 61.8 % > 30 %; right tail 54.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |

## All DEV configurations
| Configuration | Reasons |
|---|---|
| FLOOR_A_arm0.75_lag0.5 | premature 66.2 % > 30 %; right tail 48.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_A_arm0.75_lag0.75 | premature 62.4 % > 30 %; right tail 57.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_B_arm0.75_k1 | premature 66.4 % > 30 %; right tail 41.8 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_B_arm0.75_k1.5 | premature 64.2 % > 30 %; right tail 53.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_B_arm0.75_k2 | premature 62.5 % > 30 %; right tail 60.1 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_C_arm0.75 | premature 60.3 % > 30 %; right tail 64.3 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_D_arm0.75_rho0.4 | premature 63.2 % > 30 %; right tail 47.2 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_D_arm0.75_rho0.5 | premature 65.7 % > 30 %; right tail 39.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_D_arm0.75_rho0.6 | premature 67.7 % > 30 %; right tail 30.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_E_arm0.75_k1 | premature 66.4 % > 30 %; right tail 41.8 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_E_arm0.75_k1.5 | premature 64.2 % > 30 %; right tail 53.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_A_arm1_lag0.5 | premature 66.3 % > 30 %; right tail 55.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_A_arm1_lag0.75 | premature 62.0 % > 30 %; right tail 66.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_B_arm1_k1 | premature 68.6 % > 30 %; right tail 50.9 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_B_arm1_k1.5 | premature 65.4 % > 30 %; right tail 63.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| FLOOR_B_arm1_k2 | premature 62.3 % > 30 %; right tail 70.4 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_C_arm1 | premature 62.4 % > 30 %; right tail 75.1 % < 80 %; paired CI includes 0; PF below baseline |
| FLOOR_D_arm1_rho0.4 | premature 63.2 % > 30 %; right tail 60.9 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_D_arm1_rho0.5 | premature 67.0 % > 30 %; right tail 52.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_D_arm1_rho0.6 | premature 69.8 % > 30 %; right tail 44.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_E_arm1_k1 | premature 68.6 % > 30 %; right tail 50.9 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| FLOOR_E_arm1_k1.5 | premature 65.4 % > 30 %; right tail 63.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.5_h0.75 | premature 69.1 % > 30 %; right tail 25.4 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.6_h0.75 | premature 69.4 % > 30 %; right tail 21.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm0.75_k1_h0.75 | premature 70.3 % > 30 %; right tail 29.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm0.75_k1.5_h0.75 | premature 70.5 % > 30 %; right tail 34.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.5_h0.75 | premature 71.3 % > 30 %; right tail 28.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.75_h0.75 | premature 70.7 % > 30 %; right tail 33.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.5_h1 | premature 68.9 % > 30 %; right tail 26.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.6_h1 | premature 69.4 % > 30 %; right tail 22.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm0.75_k1_h1 | premature 70.3 % > 30 %; right tail 30.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm0.75_k1.5_h1 | premature 70.1 % > 30 %; right tail 36.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.5_h1 | premature 70.6 % > 30 %; right tail 30.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.75_h1 | premature 70.1 % > 30 %; right tail 36.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.5_h1.25 | premature 68.7 % > 30 %; right tail 28.2 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm0.75_rho0.6_h1.25 | premature 69.2 % > 30 %; right tail 22.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm0.75_k1_h1.25 | premature 70.4 % > 30 %; right tail 30.4 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm0.75_k1.5_h1.25 | premature 70.4 % > 30 %; right tail 37.6 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.5_h1.25 | premature 70.3 % > 30 %; right tail 32.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm0.75_lag0.75_h1.25 | premature 69.6 % > 30 %; right tail 39.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm1_rho0.5_h0.75 | premature 72.0 % > 30 %; right tail 33.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY1_D_arm1_rho0.6_h0.75 | premature 72.7 % > 30 %; right tail 29.8 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm1_k1_h0.75 | premature 73.0 % > 30 %; right tail 35.7 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm1_k1.5_h0.75 | premature 72.5 % > 30 %; right tail 40.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm1_lag0.5_h0.75 | premature 71.3 % > 30 %; right tail 33.8 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY3_A_arm1_lag0.75_h0.75 | premature 70.6 % > 30 %; right tail 39.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY1_D_arm1_rho0.5_h1 | premature 71.6 % > 30 %; right tail 35.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY1_D_arm1_rho0.6_h1 | premature 72.5 % > 30 %; right tail 30.8 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm1_k1_h1 | premature 72.9 % > 30 %; right tail 36.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm1_k1.5_h1 | premature 71.9 % > 30 %; right tail 43.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm1_lag0.5_h1 | premature 70.6 % > 30 %; right tail 36.4 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY3_A_arm1_lag0.75_h1 | premature 69.9 % > 30 %; right tail 43.1 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY1_D_arm1_rho0.5_h1.25 | premature 71.2 % > 30 %; right tail 38.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY1_D_arm1_rho0.6_h1.25 | premature 72.2 % > 30 %; right tail 31.9 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY2_E_arm1_k1_h1.25 | premature 73.0 % > 30 %; right tail 37.0 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline; sequential DD above baseline |
| POLICY2_E_arm1_k1.5_h1.25 | premature 72.0 % > 30 %; right tail 45.5 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm1_lag0.5_h1.25 | premature 70.1 % > 30 %; right tail 38.9 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
| POLICY3_A_arm1_lag0.75_h1.25 | premature 69.1 % > 30 %; right tail 47.3 % < 80 %; paired CI includes 0; raises win rate by cutting the average win; PF below baseline |
