# V9_PROFIT_PROTECTION_FORMULA

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

Every floor is armed once MFE ≥ arm, is ≥ break-even (fill + slippage), is capped at the current close, only ratchets in the trade's favour, and acts from the next bar. The 1.70 R target stays active (floor-only research).

| Family | Formula | DEV configurations | Best DEV paired (R) | Selected | HOLD paired (R) [95 % CI] | HOLD premature | HOLD right tail kept |
|---|---|---|---|---|---|---|---|
| A | R-step: fill + (⌊MFE_R / 0.5⌋ × 0.5 − lag) × R | 4 | 0.013 | FLOOR_A_arm0.75_lag0.5 (CONSTRAINT_UNMET) | 0.003 [-0.021, 0.026] | 66.7 % | 45.7 % |
| B | volatility (chandelier): highest high since entry − k × ATR14 | 6 | 0.014 | FLOOR_B_arm0.75_k2 (CONSTRAINT_UNMET) | 0.009 [-0.013, 0.031] | 60.2 % | 61.2 % |
| C | structure: last confirmed 3/3 pivot after entry − 0.1 ATR | 2 | 0.010 | FLOOR_C_arm0.75 (CONSTRAINT_UNMET) | 0.009 [-0.012, 0.03] | 50.4 % | 65.2 % |
| D | MFE retention: fill + ρ × MFE | 6 | 0.015 | FLOOR_D_arm0.75_rho0.4 (CONSTRAINT_UNMET) | 0.000 [-0.024, 0.023] | 62.8 % | 44.3 % |
| E | hybrid: max(structure, chandelier) | 4 | 0.007 | FLOOR_E_arm0.75_k1.5 (CONSTRAINT_UNMET) | 0.002 [-0.021, 0.023] | 61.8 % | 54.0 % |

No family is superior: all improve the paired mean by about 0.01 R with intervals that include zero, and all cut the right tail. Wider floors (k = 2, structure) keep more of the tail but are still below 80 %.
