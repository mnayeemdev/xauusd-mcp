# V11_STRUCTURAL_SL

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Preservation
The structural SL is an input and never an output.
- Every integrated record keeps the engine's SL (entry hash unchanged; 0 mismatches in all cells).
- An accepted trade adds only DERIVED levels:
  - the broker fail-safe SL = entry ∓ (1.5 R + spread), outside the structural SL;
  - the research target = entry ± 1.70 R.
- The thesis exit is a confirmed close beyond the structural SL.

## Structural SL distance (USD per oz, all valid entries)
| Split | p10 | p50 | p90 | p99 | max |
|---|---|---|---|---|---|
| DEV | 2.00 | 4.75 | 10.54 | 20.18 | 46.99 |
| HOLD | 2.87 | 7.34 | 17.97 | 45.40 | 150.24 |

## RR 1.70
- Engine RR ≥ 1.70 on every entry (geometry check; V8: share of TP2 below 1.70 R = 0.0 %).
- The research exit uses exactly 1.70 R in every configuration, and the risk layer cannot change it.

## Production caveat (from V10, unchanged)
The production REAL path places the broker SL at min(−50 USD monetary distance at 0.01 lot, 1.5 R + spread).
- The monetary distance is tighter than the structural fail-safe on 1.9 % of HOLD signals.
- It lies inside the structural SL itself on 0.8 %. That moves the stop to fit a dollar amount, which the owner rule forbids.

The integrated research pipeline has no fixed-dollar stop. Reported, not changed.
