# V9_HARVEST_DECISION_RULES

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

| Decision | Condition (completed bar, information ≤ close) | Effect |
|---|---|---|
| HOLD | before profit is available (MFE < arm), or state STRONG with no floor change | the trade continues under the structural SL, broker fail-safe and thesis invalidation |
| PROTECT | MFE ≥ arm: the family floor rises (monotone, ≥ break-even, ≤ close) | hard intrabar floor from the next bar |
| PROTECT + RUN | state STRONG while protected | the 1.70 R target is suspended for the next bar |
| HARVEST | state WEAK and open profit ≥ harvestMinR, or the target was suspended, price is beyond it and the state is no longer STRONG | close at this bar's close |
| EXIT | state INVALIDATED (close beyond the last confirmed post-entry pivot) while protected, or the thesis invalidation / broker fail-safe at any time | close |

## Exit mix (HOLD, normal)
| Policy | Exits |
|---|---|
| BASELINE A | target / broker SL / thesis invalidation / horizon |
| POLICY1_D_arm0.75_rho0.5_h1.25 | PROTECTED_FLOOR 3191, HARVEST 254, TARGET_170R 633, BROKER_SL 1028, THESIS_INVALIDATION 1432, STRUCTURE_EXIT 15 |
| POLICY2_E_arm1_k1.5_h1 | HARVEST 605, TARGET_170R 957, PROTECTED_FLOOR 2122, BROKER_SL 1192, THESIS_INVALIDATION 1674, STRUCTURE_EXIT 3 |
| POLICY3_A_arm0.75_lag0.5_h1.25 | PROTECTED_FLOOR 3135, HARVEST 216, TARGET_170R 696, BROKER_SL 1028, THESIS_INVALIDATION 1432, STRUCTURE_EXIT 46 |

Harvested before 1.70 R: 2.0 % / 6.3 % / 2.2 % of trades; protected and ran beyond 1.70 R: 2.0 % / 4.3 % / 2.9 %.
