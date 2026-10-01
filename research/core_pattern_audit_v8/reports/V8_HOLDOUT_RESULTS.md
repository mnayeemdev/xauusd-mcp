# V8_HOLDOUT_RESULTS (HOLDOUT 2026-01-01 → 2026-09-29, 232 sessions, opened once after the freeze)

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Variant | Signals | Trades | Expectancy (R) | 95 % CI | PF | Win | Avg win / loss (R) | Max DD (R) | Wrong-direction | Capture | MFE / MAE (R) | Loss streak |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CONTROL | 5519 | 1163 | -0.064 | [-0.167, 0.041] | 0.93 | 36.3 % | 2.26 / 1.39 | 98.89 | 29.7 % | 26.6 % | 1.49 / 1.32 | 17 |
| D1 | 6230 | 1348 | -0.024 | [-0.118, 0.074] | 0.97 | 37.6 % | 2.26 / 1.40 | 81.32 | 28.6 % | 29.7 % | 1.56 / 1.34 | 13 |
| D2 | 5998 | 1238 | -0.082 | [-0.178, 0.024] | 0.91 | 35.8 % | 2.27 / 1.39 | 123.00 | 30.5 % | 28.6 % | 1.47 / 1.34 | 13 |
| D3 | 5697 | 1166 | -0.059 | [-0.162, 0.045] | 0.93 | 36.4 % | 2.26 / 1.38 | 91.66 | 29.2 % | 26.7 % | 1.50 / 1.31 | 15 |
| D4 | 5450 | 1152 | -0.069 | [-0.172, 0.038] | 0.92 | 36.1 % | 2.27 / 1.39 | 103.50 | 29.9 % | 26.1 % | 1.49 / 1.32 | 17 |
| D5 | 5513 | 1162 | -0.060 | [-0.164, 0.045] | 0.93 | 36.4 % | 2.26 / 1.39 | 94.17 | 29.6 % | 26.6 % | 1.49 / 1.32 | 17 |
| D6 | 5495 | 1159 | -0.060 | [-0.165, 0.048] | 0.93 | 36.4 % | 2.26 / 1.39 | 93.94 | 29.6 % | 26.5 % | 1.49 / 1.32 | 17 |
| ALL | 6553 | 1364 | -0.027 | [-0.121, 0.068] | 0.97 | 37.5 % | 2.27 / 1.41 | 88.75 | 29.3 % | 30.2 % | 1.56 / 1.34 | 16 |

| Variant | Stress exp (R) | Drift exp (R) | Fixed 1.70 R exp | Block CI 95 % | Trades / session (median, p90) | Max DD USD (0.01 lot) |
|---|---|---|---|---|---|---|
| CONTROL | -0.157 | -0.067 | -0.040 | [-0.172, 0.047] | 6, 9 | 744.10 |
| D1 | -0.107 | -0.016 | -0.028 | [-0.12, 0.081] | 6, 10 | 632.71 |
| D2 | -0.175 | -0.087 | -0.043 | [-0.179, 0.024] | 6, 10 | 809.05 |
| D3 | -0.151 | -0.063 | -0.030 | [-0.169, 0.05] | 5, 9 | 762.73 |
| D4 | -0.162 | -0.068 | -0.048 | [-0.176, 0.043] | 6, 9 | 836.71 |
| D5 | -0.153 | -0.060 | -0.036 | [-0.169, 0.051] | 6, 9 | 724.73 |
| D6 | -0.153 | -0.064 | -0.035 | [-0.165, 0.049] | 6, 9 | 703.92 |
| ALL | -0.112 | -0.017 | -0.022 | [-0.115, 0.069] | 6, 10 | 679.18 |

## Pre-registered decision
| Check | Result |
|---|---|
| hold_expectancy_gt_0 | FAIL |
| hold_ci_lower_gt_0 | FAIL |
| hold_pf_gt_1_10 | FAIL |
| hold_stress_gt_0 | FAIL |
| hold_quarters_positive_ge_2_of_3 | FAIL |
| dev_expectancy_gt_0 | FAIL |
| better than CONTROL on HOLD | yes |

**EDGE_DEMONSTRATED = NO. DEMO_ELIGIBLE = NO.** CONTROL reproduces V7 HOLD exactly (n 1,163, −0.064 R, PF 0.93, DD 98.89 R, wrong-direction 29.7 %).
