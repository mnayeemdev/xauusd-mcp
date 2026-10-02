# V11_DEVELOPMENT_RESULTS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## DEV split (2025-05-07 → 2025-12-31): 4858 valid entries
- **Purpose:** DEV was used to build and debug the integration.
- **No tuning:** no parameter was selected; the risk percentage stays UNRESOLVED from V10.
- **Before the freeze:** a dry run of the FULL code path on DEV only (no holdout data) confirmed that the pipeline runs end-to-end.

| Check | Result |
|---|---|
| Geometry | 4858 / 4858 OK |
| V10 parity (walk and outcomes, 3 costs) | identical |
| Entry-only vs V8 fixed 1.70 R | n 1133 (V8 1133), -0.077 R (V8 -0.077) |

## Freeze records
| Freeze | Frozen (UTC) | prereg | integrate.mjs | v11_study.mjs | V10 risk.mjs |
|---|---|---|---|---|---|
| pre-registered harness | 2026-10-02T10:25:17.128Z | 722b5d612df8 | 82c1e6c77374 | 708d06052d6d | 2fc1806a1e14 |
| after correction C1 | 2026-10-02T10:28:24.397Z | 722b5d612df8 | 82c1e6c77374 | 6b61376acc40 | 2fc1806a1e14 |

The pre-registration, the integration layer and the risk library are identical in both freezes. Only the study harness changed (CORRECTION_LOG C1).

## DEV grid (NORMAL)
| Account | Model | Trade eligibility | Valid entries | Risk-rejected valid entries | End equity | Max DD | Actual risk mean / max | Minimum-lot rejections | Max margin | Cost sensitivity: end N / M / S |
|---|---|---|---|---|---|---|---|---|---|---|
| 1000 | CURRENT 0.01 lot | 100.0 % | 4858 | 0 | 933.26 | 28.9 % | 0.86 % / 5.87 % | 0 | 2.7 % | 933.26 / 512.00 / 69.12 |
| 1000 | PCT 0.10 % | 0.0 % | 4858 | 4858 | 1000.00 | 0.0 % | — / 0.00 % | 4858 | 0.0 % | 1000.00 / 1000.00 / 1000.00 |
| 1000 | PCT 0.25 % | 2.8 % | 4858 | 4499 | 960.38 | 4.7 % | 0.22 % / 0.25 % | 4499 | 2.3 % | 960.38 / 938.97 / 948.80 |
| 1000 | PCT 0.50 % | 15.8 % | 4858 | 3129 | 772.31 | 24.6 % | 0.40 % / 0.50 % | 3129 | 4.7 % | 772.31 / 702.18 / 610.82 |
| 1000 | PCT 1.00 % | 37.9 % | 4858 | 1573 | 524.94 | 52.0 % | 0.79 % / 1.00 % | 1573 | 9.3 % | 524.94 / 382.61 / 310.59 |
| 5000 | CURRENT 0.01 lot | 100.0 % | 4858 | 0 | 4933.26 | 6.3 % | 0.17 % / 1.03 % | 0 | 0.5 % | 4933.26 / 4512.00 / 3655.11 |
| 5000 | PCT 0.10 % | 19.8 % | 4858 | 2798 | 4748.28 | 5.6 % | 0.08 % / 0.10 % | 2798 | 0.9 % | 4748.28 / 4515.36 / 4298.57 |
| 5000 | PCT 0.25 % | 65.5 % | 4858 | 607 | 4114.99 | 19.1 % | 0.20 % / 0.25 % | 607 | 2.6 % | 4114.99 / 3568.56 / 2875.38 |
| 5000 | PCT 0.50 % | 94.3 % | 4858 | 69 | 3921.06 | 26.7 % | 0.42 % / 0.50 % | 69 | 5.0 % | 3921.06 / 2936.15 / 1640.88 |
| 5000 | PCT 1.00 % | 98.6 % | 4858 | 16 | 2792.12 | 52.0 % | 0.90 % / 1.00 % | 16 | 10.0 % | 2792.12 / 1633.14 / 601.69 |
| 10000 | CURRENT 0.01 lot | 100.0 % | 4858 | 0 | 9933.26 | 3.2 % | 0.08 % / 0.51 % | 0 | 0.2 % | 9933.26 / 9512.00 / 8655.11 |
| 10000 | PCT 0.10 % | 56.1 % | 4858 | 878 | 9419.97 | 6.9 % | 0.08 % / 0.10 % | 878 | 0.9 % | 9419.97 / 8782.99 / 7988.17 |
| 10000 | PCT 0.25 % | 95.5 % | 4858 | 55 | 8747.61 | 15.3 % | 0.21 % / 0.25 % | 55 | 2.5 % | 8747.61 / 7662.97 / 6021.89 |
| 10000 | PCT 0.50 % | 99.5 % | 4858 | 6 | 7833.42 | 28.4 % | 0.45 % / 0.50 % | 6 | 5.0 % | 7833.42 / 5644.95 / 3562.00 |
| 10000 | PCT 1.00 % | 99.9 % | 4858 | 1 | 5624.27 | 53.0 % | 0.95 % / 1.00 % | 1 | 10.5 % | 5624.27 / 3118.09 / 1185.89 |
