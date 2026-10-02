# V11_ENTRY_RISK_MATRIX

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Record taxonomy
Each valid entry from the frozen engine gets exactly one record per configuration: `VALID_ENTRY` plus one outcome.
- **RISK_ACCEPTED:** eligible; size computed.
- **RISK_REJECTED:<reason>:** RISK_BELOW_MIN_LOT, MARGIN_*, BROKER_*, REJECTED_BY_BROKER, daily / streak / weekly when enabled. The entry stays valid; the trade is not taken.
- **EXPOSURE_BLOCKED:<reason>:** POSITION_OPEN (MAX_SIMULTANEOUS_TRADES = 1); STALE_SAME_SETUP and REVENGE_GUARD (the unchanged V8/V9 re-entry guard).
- **FAIL_CLOSED:<reason>:** a safety pre-check or consistency failure (none in the clean replay; see V11_FAILURE_MODES).
- **NOT_EVALUABLE:** no forward bars at the end of the data set (no hypothetical outcome exists).

## Accounting identity (NORMAL cost): valid entries = accepted + risk-rejected + exposure-blocked + fail-closed + not evaluable
| Split | Account | Model | Valid entries | Accepted | Risk-rejected | Exposure-blocked | Fail-closed | Not evaluable | Identity | Entry-hash mismatches |
|---|---|---|---|---|---|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | 4858 | 1133 | 0 | 3725 | 0 | 0 | holds | 0 |
| DEV | 1000 | PCT 0.10 % | 4858 | 0 | 4858 | 0 | 0 | 0 | holds | 0 |
| DEV | 1000 | PCT 0.25 % | 4858 | 128 | 4499 | 231 | 0 | 0 | holds | 0 |
| DEV | 1000 | PCT 0.50 % | 4858 | 586 | 3129 | 1143 | 0 | 0 | holds | 0 |
| DEV | 1000 | PCT 1.00 % | 4858 | 958 | 1573 | 2327 | 0 | 0 | holds | 0 |
| DEV | 5000 | CURRENT 0.01 lot | 4858 | 1133 | 0 | 3725 | 0 | 0 | holds | 0 |
| DEV | 5000 | PCT 0.10 % | 4858 | 689 | 2798 | 1371 | 0 | 0 | holds | 0 |
| DEV | 5000 | PCT 0.25 % | 4858 | 1155 | 607 | 3096 | 0 | 0 | holds | 0 |
| DEV | 5000 | PCT 0.50 % | 4858 | 1150 | 69 | 3639 | 0 | 0 | holds | 0 |
| DEV | 5000 | PCT 1.00 % | 4858 | 1149 | 16 | 3693 | 0 | 0 | holds | 0 |
| DEV | 10000 | CURRENT 0.01 lot | 4858 | 1133 | 0 | 3725 | 0 | 0 | holds | 0 |
| DEV | 10000 | PCT 0.10 % | 4858 | 1120 | 878 | 2860 | 0 | 0 | holds | 0 |
| DEV | 10000 | PCT 0.25 % | 4858 | 1154 | 55 | 3649 | 0 | 0 | holds | 0 |
| DEV | 10000 | PCT 0.50 % | 4858 | 1141 | 6 | 3711 | 0 | 0 | holds | 0 |
| DEV | 10000 | PCT 1.00 % | 4858 | 1132 | 1 | 3725 | 0 | 0 | holds | 0 |
| HOLD | 1000 | CURRENT 0.01 lot | 6553 | 1510 | 0 | 5043 | 0 | 0 | holds | 0 |
| HOLD | 1000 | PCT 0.10 % | 6553 | 0 | 6553 | 0 | 0 | 0 | holds | 0 |
| HOLD | 1000 | PCT 0.25 % | 6553 | 8 | 6538 | 7 | 0 | 0 | holds | 0 |
| HOLD | 1000 | PCT 0.50 % | 6553 | 511 | 5010 | 1032 | 0 | 0 | holds | 0 |
| HOLD | 1000 | PCT 1.00 % | 6553 | 1161 | 2752 | 2640 | 0 | 0 | holds | 0 |
| HOLD | 5000 | CURRENT 0.01 lot | 6553 | 1510 | 0 | 5043 | 0 | 0 | holds | 0 |
| HOLD | 5000 | PCT 0.10 % | 6553 | 503 | 5037 | 1013 | 0 | 0 | holds | 0 |
| HOLD | 5000 | PCT 0.25 % | 6553 | 1372 | 1933 | 3248 | 0 | 0 | holds | 0 |
| HOLD | 5000 | PCT 0.50 % | 6553 | 1589 | 492 | 4472 | 0 | 0 | holds | 0 |
| HOLD | 5000 | PCT 1.00 % | 6553 | 1541 | 99 | 4913 | 0 | 0 | holds | 0 |
| HOLD | 10000 | CURRENT 0.01 lot | 6553 | 1510 | 0 | 5043 | 0 | 0 | holds | 0 |
| HOLD | 10000 | PCT 0.10 % | 6553 | 1234 | 2514 | 2805 | 0 | 0 | holds | 0 |
| HOLD | 10000 | PCT 0.25 % | 6553 | 1590 | 447 | 4516 | 0 | 0 | holds | 0 |
| HOLD | 10000 | PCT 0.50 % | 6553 | 1541 | 88 | 4924 | 0 | 0 | holds | 0 |
| HOLD | 10000 | PCT 1.00 % | 6553 | 1522 | 11 | 5020 | 0 | 0 | holds | 0 |

## Accepted versus risk-rejected valid entries (hypothetical outcome of each entry; NORMAL cost)
| Split | Configuration | Accepted n | Accepted mean R | Accepted median SL $ | Risk-rejected n | Rejected mean R (hypothetical) | Rejected median SL $ |
|---|---|---|---|---|---|---|---|
| DEV | PCT 0.10 % @ 1000 | 0 | — | — | 4858 | -0.089 | 4.75 |
| DEV | PCT 0.25 % @ 1000 | 128 | -0.267 | 1.28 | 4499 | -0.078 | 4.98 |
| DEV | PCT 0.50 % @ 1000 | 586 | -0.177 | 2.02 | 3129 | -0.060 | 6.05 |
| DEV | PCT 1.00 % @ 1000 | 958 | -0.134 | 2.86 | 1573 | -0.036 | 8.01 |
| DEV | PCT 0.10 % @ 5000 | 689 | -0.152 | 2.17 | 2798 | -0.046 | 6.36 |
| DEV | PCT 0.25 % @ 5000 | 1155 | -0.129 | 3.66 | 607 | 0.136 | 10.66 |
| DEV | PCT 0.50 % @ 5000 | 1150 | -0.075 | 4.22 | 69 | 0.038 | 19.16 |
| DEV | PCT 1.00 % @ 5000 | 1149 | -0.075 | 4.24 | 16 | 0.470 | 27.73 |
| DEV | PCT 0.10 % @ 10000 | 1120 | -0.117 | 3.33 | 878 | 0.040 | 9.63 |
| DEV | PCT 0.25 % @ 10000 | 1154 | -0.078 | 4.22 | 55 | 0.204 | 19.94 |
| DEV | PCT 0.50 % @ 10000 | 1141 | -0.071 | 4.24 | 6 | -0.194 | 39.80 |
| DEV | PCT 1.00 % @ 10000 | 1132 | -0.079 | 4.24 | 1 | 1.698 | 39.80 |
| HOLD | PCT 0.10 % @ 1000 | 0 | — | — | 6553 | -0.043 | 7.34 |
| HOLD | PCT 0.25 % @ 1000 | 8 | -0.165 | 1.36 | 6538 | -0.042 | 7.35 |
| HOLD | PCT 0.50 % @ 1000 | 511 | -0.085 | 2.45 | 5010 | -0.023 | 8.72 |
| HOLD | PCT 1.00 % @ 1000 | 1161 | -0.071 | 3.77 | 2752 | -0.009 | 11.79 |
| HOLD | PCT 0.10 % @ 5000 | 503 | -0.076 | 2.45 | 5037 | -0.028 | 8.68 |
| HOLD | PCT 0.25 % @ 5000 | 1372 | -0.078 | 4.34 | 1933 | -0.007 | 13.49 |
| HOLD | PCT 0.50 % @ 5000 | 1589 | -0.023 | 5.67 | 492 | 0.095 | 22.87 |
| HOLD | PCT 1.00 % @ 5000 | 1541 | -0.020 | 6.31 | 99 | 0.255 | 48.05 |
| HOLD | PCT 0.10 % @ 10000 | 1234 | -0.061 | 3.91 | 2514 | -0.002 | 12.23 |
| HOLD | PCT 0.25 % @ 10000 | 1590 | -0.028 | 5.79 | 447 | 0.154 | 23.50 |
| HOLD | PCT 0.50 % @ 10000 | 1541 | -0.020 | 6.33 | 88 | 0.394 | 49.83 |
| HOLD | PCT 1.00 % @ 10000 | 1522 | -0.018 | 6.36 | 11 | 0.680 | 96.80 |

## Minimum-lot rejection by structural-SL quartile (PCT_0.0025 @ 10000 USD)
| Split | SL quartile | SL range $ | Evaluated | Risk-rejected share | Rejected mean R | Accepted mean R |
|---|---|---|---|---|---|---|
| DEV | Q1 | ≤ 2.94 | 351 | 0.0 % | — | -0.155 |
| DEV | Q2 | 2.94 – 4.75 | 316 | 0.0 % | — | -0.111 |
| DEV | Q3 | 4.75 – 7.37 | 267 | 0.0 % | — | -0.004 |
| DEV | Q4 | > 7.37 | 275 | 20.0 % | 0.204 | 0.001 |
| HOLD | Q1 | ≤ 4.42 | 569 | 0.0 % | — | -0.084 |
| HOLD | Q2 | 4.42 – 7.34 | 433 | 0.0 % | — | 0.029 |
| HOLD | Q3 | 7.34 – 11.78 | 404 | 0.0 % | — | -0.000 |
| HOLD | Q4 | > 11.78 | 631 | 70.8 % | 0.154 | -0.051 |

## Reading
- **The rejection is driven by the SL width alone.** It falls almost entirely on the widest-SL quartile, because one 0.01 lot already exceeds the approved cash risk there.
- **Rejected entries are better on average.** Their hypothetical R is higher than that of the accepted entries at the larger accounts, which makes risk rejection outcome-relevant. This is reported as an integration property.
- **Not an argument for anything.** It is not a reason to raise risk, change the SL or build a filter; that would be post-outcome optimisation.
- **The records:** `results/entry_risk_matrix_{DEV,HOLD}.jsonl` keep one line per valid entry, with its frozen fields, entry hash, hypothetical R and the outcome code in all 15 configurations (`A:<lots>`, `R:<reason>`, `EX:<reason>`, `F:<reason>`, `N:<reason>`).
