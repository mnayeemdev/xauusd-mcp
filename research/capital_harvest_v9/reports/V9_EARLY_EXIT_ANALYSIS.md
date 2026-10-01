# V9_EARLY_EXIT_ANALYSIS

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Early exit = a HARVEST, floor or structure exit taken in profit. GOOD: policy ≥ baseline on that trade; ACCEPTABLE: baseline better by < 0.5 R; PREMATURE: baseline better by ≥ 0.5 R or price continued ≥ 1 R beyond the exit before the original stop / horizon.

| Split | Policy | Early exits | Share of trades | GOOD | ACCEPTABLE | PREMATURE | Premature rate | Profit lost (R, mean) | Post-exit continuation (R, mean) |
|---|---|---|---|---|---|---|---|---|---|
| DEV | POLICY1_D_arm0.75_rho0.5_h1.25 | 2441 | 50.2 % | 725 | 39 | 1677 | 68.7 % | 0.633 | 4.04 |
| DEV | POLICY2_E_arm1_k1.5_h1 | 1616 | 33.3 % | 379 | 75 | 1162 | 71.9 % | 0.511 | 3.85 |
| DEV | POLICY3_A_arm0.75_lag0.5_h1.25 | 1839 | 37.9 % | 484 | 63 | 1292 | 70.3 % | 0.541 | 4.16 |
| DEV | FLOOR_A_arm0.75_lag0.5 | 1280 | 26.3 % | 432 | 1 | 847 | 66.2 % | 0.669 | 4.08 |
| DEV | FLOOR_B_arm0.75_k2 | 643 | 13.2 % | 241 | 0 | 402 | 62.5 % | 0.682 | 2.74 |
| DEV | FLOOR_C_arm0.75 | 239 | 4.9 % | 93 | 2 | 144 | 60.3 % | 0.606 | 2.57 |
| DEV | FLOOR_D_arm0.75_rho0.4 | 1869 | 38.5 % | 687 | 0 | 1182 | 63.2 % | 0.717 | 3.94 |
| DEV | FLOOR_E_arm0.75_k1.5 | 1052 | 21.7 % | 376 | 1 | 675 | 64.2 % | 0.703 | 3.08 |
| HOLD | POLICY1_D_arm0.75_rho0.5_h1.25 | 3248 | 49.6 % | 1029 | 43 | 2176 | 67.0 % | 0.657 | 5.16 |
| HOLD | POLICY2_E_arm1_k1.5_h1 | 2063 | 31.5 % | 485 | 86 | 1492 | 72.3 % | 0.521 | 4.78 |
| HOLD | POLICY3_A_arm0.75_lag0.5_h1.25 | 2367 | 36.1 % | 631 | 71 | 1665 | 70.3 % | 0.565 | 5.26 |
| HOLD | FLOOR_A_arm0.75_lag0.5 | 1755 | 26.8 % | 583 | 2 | 1170 | 66.7 % | 0.671 | 4.96 |
| HOLD | FLOOR_B_arm0.75_k2 | 820 | 12.5 % | 324 | 2 | 494 | 60.2 % | 0.664 | 3.11 |
| HOLD | FLOOR_C_arm0.75 | 280 | 4.3 % | 137 | 2 | 141 | 50.4 % | 0.549 | 2.44 |
| HOLD | FLOOR_D_arm0.75_rho0.4 | 2624 | 40.0 % | 975 | 2 | 1647 | 62.8 % | 0.726 | 4.95 |
| HOLD | FLOOR_E_arm0.75_k1.5 | 1407 | 21.5 % | 537 | 1 | 869 | 61.8 % | 0.675 | 3.36 |

Every policy exceeds the 30 % premature limit. A higher win rate is not evidence of success here: the early exits give up more continuation than they save.
