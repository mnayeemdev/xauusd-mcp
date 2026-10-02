# V11_HOLDOUT_RESULTS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## HOLDOUT split (2026-01-01 → 2026-09-29): 6553 valid entries, replayed with the frozen code
| Check | Result |
|---|---|
| Geometry | 6553 / 6553 OK |
| V10 parity (walk and outcomes, 3 costs) | identical |
| Entry-only vs V8 fixed 1.70 R | n 1510 (V8 1510), -0.022 R (V8 -0.022) |
| Entry-hash mismatches / identity / above approved / broker-invalid | 0 / holds / 0 / 0 in every cell |
| Fault injection (corrected harness) | 172 injected, 0 accepted |
| Fault injection (pre-registered harness) | 171 injected, 2 accepted (margin rule satisfied: yes) |

## Decision conditions
| Condition | Corrected harness | Pre-registered harness |
|---|---|---|
| entry_changed | not met | not met |
| pct_above_approved | not met | not met |
| broker_invalid_accepted | not met | not met |
| identity_broken | not met | not met |
| fault_not_closed | not met | **FIRED** |
| restart_mismatch | not met | not met |
| duplicate_accepted | not met | not met |

- **Status:** INTEGRATION_PARTIALLY_VALIDATED (corrected harness); INTEGRATION_FAILED (pre-registered harness).
- **Supported risk percentage:** UNRESOLVED.

## HOLDOUT grid (NORMAL)
| Account | Model | Trade eligibility | Valid entries | Risk-rejected valid entries | End equity | Max DD | Actual risk mean / max | Minimum-lot rejections | Max margin | Cost sensitivity: end N / M / S |
|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | CURRENT 0.01 lot | 100.0 % | 6553 | 0 | 1206.95 | 51.4 % | 1.33 % / 6.34 % | 0 | 3.8 % | 1206.95 / 743.98 / 57.28 |
| 1000 | PCT 0.10 % | 0.0 % | 6553 | 6553 | 1000.00 | 0.0 % | — / 0.00 % | 6553 | 0.0 % | 1000.00 / 1000.00 / 1000.00 |
| 1000 | PCT 0.25 % | 0.1 % | 6553 | 6538 | 997.44 | 0.5 % | 0.22 % / 0.24 % | 6538 | 2.4 % | 997.44 / 1001.26 / 1001.23 |
| 1000 | PCT 0.50 % | 9.3 % | 6553 | 5010 | 899.32 | 18.0 % | 0.40 % / 0.50 % | 5010 | 4.8 % | 899.32 / 807.23 / 751.08 |
| 1000 | PCT 1.00 % | 29.7 % | 6553 | 2752 | 718.20 | 31.6 % | 0.78 % / 1.00 % | 2752 | 10.9 % | 718.20 / 392.72 / 373.01 |
| 5000 | CURRENT 0.01 lot | 100.0 % | 6553 | 0 | 5206.95 | 12.9 % | 0.26 % / 1.05 % | 0 | 0.6 % | 5206.95 / 4743.98 / 3625.37 |
| 5000 | PCT 0.10 % | 9.1 % | 6553 | 5037 | 4907.71 | 3.4 % | 0.08 % / 0.10 % | 5037 | 0.9 % | 4907.71 / 4790.84 / 4597.19 |
| 5000 | PCT 0.25 % | 41.5 % | 6553 | 1933 | 4286.82 | 15.2 % | 0.20 % / 0.25 % | 1933 | 2.5 % | 4286.82 / 3846.88 / 3200.22 |
| 5000 | PCT 0.50 % | 76.4 % | 6553 | 492 | 4296.81 | 16.6 % | 0.41 % / 0.50 % | 492 | 5.3 % | 4296.81 / 3381.04 / 1829.55 |
| 5000 | PCT 1.00 % | 94.0 % | 6553 | 99 | 3780.66 | 33.2 % | 0.86 % / 1.00 % | 99 | 11.1 % | 3780.66 / 2245.40 / 631.88 |
| 10000 | CURRENT 0.01 lot | 100.0 % | 6553 | 0 | 10206.94 | 6.7 % | 0.13 % / 0.51 % | 0 | 0.3 % | 10206.94 / 9743.98 / 8625.37 |
| 10000 | PCT 0.10 % | 32.9 % | 6553 | 2514 | 9730.44 | 3.5 % | 0.08 % / 0.10 % | 2514 | 1.1 % | 9730.44 / 9230.37 / 8425.12 |
| 10000 | PCT 0.25 % | 78.1 % | 6553 | 447 | 9289.30 | 8.3 % | 0.20 % / 0.25 % | 447 | 2.7 % | 9289.30 / 8052.82 / 6359.80 |
| 10000 | PCT 0.50 % | 94.6 % | 6553 | 88 | 8881.08 | 17.6 % | 0.44 % / 0.50 % | 88 | 5.6 % | 8881.08 / 6666.01 / 4100.94 |
| 10000 | PCT 1.00 % | 99.3 % | 6553 | 11 | 7927.07 | 32.1 % | 0.93 % / 1.00 % | 11 | 11.4 % | 7927.07 / 4842.15 / 1679.90 |
