# V13_CORRECTION_CANDIDATES

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

## Protocol (pre-registered rule D)
A correction candidate must satisfy all of:
- defined before entry;
- deterministic;
- ≥ 100 entries per split;
- gross and normal CI above 0, and stress mean above 0, on DEV;
- frozen;
- the same on HOLD;
- replay parity.

## Candidates frozen on DEV and their single HOLD test
| Subgroup | DEV n | DEV gross R (CI) | DEV net R (CI) | DEV stress R | HOLD n | HOLD net R (CI) | HOLD stress R | Survives |
|---|---|---|---|---|---|---|---|---|
| ALL|LOCATION|MARGINAL_2.0_2.5 | 314 | 0.287 [0.047, 0.490] | 0.246 [0.006, 0.449] | 0.151 | 429 | -0.127 [-0.296, 0.034] · | -0.194 | no |

## Not admissible
MR|PATTERN_EVENT|CHOCH: passes on HOLD only (failed DEV). Using it would be holdout selection.

## Result
**CORRECTION_CANDIDATE = NONE.** No change is proposed to any strategy.
