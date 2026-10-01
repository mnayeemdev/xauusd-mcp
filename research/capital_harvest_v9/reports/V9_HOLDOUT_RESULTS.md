# V9_HOLDOUT_RESULTS (opened once after the freeze)

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

| Policy | n | Expectancy (R) | Paired vs baseline (R) | 95 % CI paired | PF | Win | Avg win / loss (R) | Seq. max DD (R) | Seq. expectancy | Give-back (R) | Premature | Right tail kept | Duration (bars) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BASELINE A (fixed 1.70R) | 6553 | -0.043 | — | — | 0.94 | 43.5 % | 1.66 / 1.35 | 64.90 | -0.022 | 1.22 | — | 100 % (reference) | 16.21 |
| POLICY1_D_arm0.75_rho0.5_h1.25 | 6553 | -0.041 | 0.002 | [-0.024, 0.026] | 0.92 | 59.2 % | 0.81 / 1.27 | 119.49 | -0.060 | 0.82 | 67.0 % | 28.0 % | 8.97 |
| POLICY2_E_arm1_k1.5_h1 | 6553 | -0.028 | 0.015 | [-0.007, 0.037] | 0.95 | 46.1 % | 1.23 / 1.11 | 57.73 | -0.021 | 1.11 | 72.3 % | 45.9 % | 11.46 |
| POLICY3_A_arm0.75_lag0.5_h1.25 | 6553 | -0.030 | 0.013 | [-0.013, 0.037] | 0.94 | 46.7 % | 1.04 / 0.97 | 74.65 | -0.028 | 0.90 | 70.3 % | 32.4 % | 9.55 |
| FLOOR_A_arm0.75_lag0.5 | 6553 | -0.040 | 0.003 | [-0.021, 0.026] | 0.92 | 46.4 % | 1.03 / 0.97 | 96.71 | -0.049 | 0.86 | 66.7 % | 45.7 % | 9.49 |
| FLOOR_B_arm0.75_k2 | 6553 | -0.034 | 0.009 | [-0.013, 0.031] | 0.93 | 38.9 % | 1.25 / 0.85 | 103.71 | -0.052 | 0.94 | 60.2 % | 61.2 % | 9.67 |
| FLOOR_C_arm0.75 | 6553 | -0.034 | 0.009 | [-0.012, 0.03] | 0.93 | 32.5 % | 1.49 / 0.77 | 99.77 | -0.050 | 0.96 | 50.4 % | 65.2 % | 10.22 |
| FLOOR_D_arm0.75_rho0.4 | 6553 | -0.043 | 0.000 | [-0.024, 0.023] | 0.92 | 59.2 % | 0.80 / 1.27 | 111.25 | -0.057 | 0.82 | 62.8 % | 44.3 % | 9.13 |
| FLOOR_E_arm0.75_k1.5 | 6553 | -0.041 | 0.002 | [-0.021, 0.023] | 0.92 | 44.9 % | 1.06 / 0.94 | 99.75 | -0.049 | 0.91 | 61.8 % | 54.0 % | 9.20 |
| RUN_TO_END (reference: structural stop only, no target) | 6549 | 0.465 | — | — | 1.39 | 14.2 % | 11.61 / 1.39 | — | — | — | — | — | 72.35 |

## Pre-registered decision checks (adaptive policies)
| Check | POLICY1_D_arm0.75_rho0.5_h1.25 | POLICY2_E_arm1_k1.5_h1 | POLICY3_A_arm0.75_lag0.5_h1.25 |
|---|---|---|---|
| hold_paired_mean_gt_0 | PASS | PASS | PASS |
| dev_paired_mean_gt_0 | PASS | PASS | PASS |
| hold_paired_ci_lower_gt_0 | FAIL | FAIL | FAIL |
| hold_stress_paired_mean_gt_0 | PASS | PASS | PASS |
| hold_pf_ge_baseline | FAIL | PASS | PASS |
| hold_seq_dd_le_baseline | FAIL | PASS | FAIL |
| right_tail_preserved_ge_80 | FAIL | FAIL | FAIL |
| premature_rate_le_30 | FAIL | FAIL | FAIL |
| no_winrate_for_expectancy_trade | PASS | PASS | PASS |
| replay_parity | PASS | PASS | PASS |
| hindsight | PASS | PASS | PASS |
| verdict | INCONCLUSIVE | INCONCLUSIVE | INCONCLUSIVE |

**CAPITAL_HARVEST_EDGE = INCONCLUSIVE**, PROPOSED_POLICY = NO. Sensitivity on the production (CONTROL) entries, HOLD: POLICY1_D_arm0.75_rho0.5_h1.25 paired 0.002 [-0.025, 0.033]; POLICY2_E_arm1_k1.5_h1 paired 0.003 [-0.02, 0.026]; POLICY3_A_arm0.75_lag0.5_h1.25 paired 0.016 [-0.01, 0.044] — the same picture.
