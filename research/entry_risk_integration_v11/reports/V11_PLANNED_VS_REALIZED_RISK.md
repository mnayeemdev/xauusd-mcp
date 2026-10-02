# V11_PLANNED_VS_REALIZED_RISK

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Definition
- **Planned:** the worst-case loss at the hard broker stop, (1.5 R + spread + 0.10 allowance) × 100 × lots.
- **Exceedance:** realized loss > planned.
- **Attribution:** the excess is attributed to overnight BUY swap, slippage above the allowance (broker-stop exits) and the SEVERE gap.

| Split | Account | Model | Cost | Losing trades | Exceedances | Share | Max realized / planned | Excess USD | Swap USD | Slippage USD | Gap USD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | 1000 | CURRENT 0.01 lot | normal | 632 | 7 | 1.1 % | 1.143 | 3.72 | 3.92 | 0.00 | 0.00 |
| DEV | 1000 | CURRENT 0.01 lot | moderate | 634 | 323 | 50.9 % | 1.186 | 67.87 | 3.92 | 63.80 | 0.00 |
| DEV | 1000 | CURRENT 0.01 lot | severe | 490 | 279 | 56.9 % | 1.452 | 211.27 | 1.68 | 121.00 | 125.12 |
| DEV | 1000 | PCT 0.25 % | normal | 70 | 0 | 0.0 % | 1.000 | 0.00 | 0.00 | 0.00 | 0.00 |
| DEV | 1000 | PCT 0.25 % | moderate | 45 | 40 | 88.9 % | 1.100 | 8.00 | 0.00 | 8.00 | 0.00 |
| DEV | 1000 | PCT 0.25 % | severe | 23 | 23 | 100.0 % | 1.452 | 12.22 | 0.00 | 10.50 | 1.60 |
| DEV | 1000 | PCT 0.50 % | normal | 322 | 2 | 0.6 % | 1.143 | 1.12 | 1.12 | 0.00 | 0.00 |
| DEV | 1000 | PCT 0.50 % | moderate | 261 | 207 | 79.3 % | 1.185 | 43.99 | 0.56 | 43.40 | 0.00 |
| DEV | 1000 | PCT 0.50 % | severe | 186 | 174 | 93.5 % | 1.452 | 94.01 | 0.56 | 77.50 | 13.87 |
| DEV | 1000 | PCT 1.00 % | normal | 534 | 5 | 0.9 % | 1.143 | 2.80 | 2.80 | 0.00 | 0.00 |
| DEV | 1000 | PCT 1.00 % | moderate | 406 | 278 | 68.5 % | 1.186 | 86.85 | 2.24 | 84.40 | 0.00 |
| DEV | 1000 | PCT 1.00 % | severe | 308 | 235 | 76.3 % | 1.452 | 177.19 | 1.68 | 140.00 | 38.54 |
| DEV | 10000 | CURRENT 0.01 lot | normal | 632 | 7 | 1.1 % | 1.143 | 3.72 | 3.92 | 0.00 | 0.00 |
| DEV | 10000 | CURRENT 0.01 lot | moderate | 634 | 323 | 50.9 % | 1.186 | 67.87 | 3.92 | 63.80 | 0.00 |
| DEV | 10000 | CURRENT 0.01 lot | severe | 640 | 365 | 57.0 % | 1.452 | 268.50 | 3.92 | 159.50 | 154.44 |
| DEV | 10000 | PCT 0.25 % | normal | 643 | 7 | 1.1 % | 1.143 | 10.80 | 11.20 | 0.00 | 0.00 |
| DEV | 10000 | PCT 0.25 % | moderate | 650 | 340 | 52.3 % | 1.186 | 291.91 | 10.08 | 281.40 | 0.00 |
| DEV | 10000 | PCT 0.25 % | severe | 663 | 390 | 58.8 % | 1.452 | 848.67 | 10.08 | 602.50 | 289.86 |
| DEV | 10000 | PCT 0.50 % | normal | 634 | 7 | 1.1 % | 1.143 | 21.95 | 22.96 | 0.00 | 0.00 |
| DEV | 10000 | PCT 0.50 % | moderate | 642 | 329 | 51.2 % | 1.186 | 530.97 | 19.04 | 511.00 | 0.00 |
| DEV | 10000 | PCT 0.50 % | severe | 644 | 373 | 57.9 % | 1.452 | 1376.94 | 13.44 | 965.50 | 482.03 |
| DEV | 10000 | PCT 1.00 % | normal | 632 | 7 | 1.1 % | 1.143 | 39.82 | 41.44 | 0.00 | 0.00 |
| DEV | 10000 | PCT 1.00 % | moderate | 634 | 323 | 50.9 % | 1.186 | 882.84 | 29.12 | 852.20 | 0.00 |
| DEV | 10000 | PCT 1.00 % | severe | 655 | 379 | 57.9 % | 1.452 | 1959.72 | 20.16 | 1384.50 | 683.96 |
| HOLD | 1000 | CURRENT 0.01 lot | normal | 831 | 6 | 0.7 % | 3.079 | 3.36 | 3.36 | 0.00 | 0.00 |
| HOLD | 1000 | CURRENT 0.01 lot | moderate | 830 | 425 | 51.2 % | 3.077 | 88.20 | 3.92 | 84.80 | 0.00 |
| HOLD | 1000 | CURRENT 0.01 lot | severe | 383 | 228 | 59.5 % | 3.074 | 228.68 | 1.68 | 106.00 | 192.39 |
| HOLD | 1000 | PCT 0.25 % | normal | 4 | 0 | 0.0 % | 1.000 | 0.00 | 0.00 | 0.00 | 0.00 |
| HOLD | 1000 | PCT 0.25 % | moderate | 1 | 1 | 100.0 % | 1.085 | 0.20 | 0.00 | 0.20 | 0.00 |
| HOLD | 1000 | PCT 0.25 % | severe | 0 | 0 | 0.0 % | 0.000 | 0.00 | 0.00 | 0.00 | 0.00 |
| HOLD | 1000 | PCT 0.50 % | normal | 271 | 2 | 0.7 % | 1.129 | 1.12 | 1.12 | 0.00 | 0.00 |
| HOLD | 1000 | PCT 0.50 % | moderate | 214 | 183 | 85.5 % | 1.169 | 37.32 | 0.56 | 36.60 | 0.00 |
| HOLD | 1000 | PCT 0.50 % | severe | 142 | 127 | 89.4 % | 1.412 | 76.93 | 0.00 | 61.00 | 16.27 |
| HOLD | 1000 | PCT 1.00 % | normal | 632 | 3 | 0.5 % | 1.129 | 2.80 | 2.80 | 0.00 | 0.00 |
| HOLD | 1000 | PCT 1.00 % | moderate | 463 | 364 | 78.6 % | 1.169 | 84.50 | 1.68 | 82.60 | 0.00 |
| HOLD | 1000 | PCT 1.00 % | severe | 322 | 276 | 85.7 % | 1.412 | 203.92 | 1.68 | 140.50 | 66.60 |
| HOLD | 10000 | CURRENT 0.01 lot | normal | 831 | 6 | 0.7 % | 3.079 | 3.36 | 3.36 | 0.00 | 0.00 |
| HOLD | 10000 | CURRENT 0.01 lot | moderate | 830 | 425 | 51.2 % | 3.077 | 88.20 | 3.92 | 84.80 | 0.00 |
| HOLD | 10000 | CURRENT 0.01 lot | severe | 830 | 466 | 56.1 % | 3.074 | 430.26 | 4.48 | 212.50 | 333.99 |
| HOLD | 10000 | PCT 0.25 % | normal | 872 | 5 | 0.6 % | 1.129 | 8.40 | 8.40 | 0.00 | 0.00 |
| HOLD | 10000 | PCT 0.25 % | moderate | 869 | 488 | 56.2 % | 1.169 | 294.37 | 8.40 | 287.00 | 0.00 |
| HOLD | 10000 | PCT 0.25 % | severe | 870 | 539 | 62.0 % | 1.408 | 970.64 | 7.28 | 626.50 | 433.30 |
| HOLD | 10000 | PCT 0.50 % | normal | 847 | 7 | 0.8 % | 1.123 | 13.44 | 13.44 | 0.00 | 0.00 |
| HOLD | 10000 | PCT 0.50 % | moderate | 851 | 446 | 52.4 % | 1.162 | 512.94 | 14.00 | 501.00 | 0.00 |
| HOLD | 10000 | PCT 0.50 % | severe | 864 | 503 | 58.2 % | 1.408 | 1530.06 | 8.96 | 960.00 | 721.44 |
| HOLD | 10000 | PCT 1.00 % | normal | 835 | 6 | 0.7 % | 1.123 | 23.52 | 23.52 | 0.00 | 0.00 |
| HOLD | 10000 | PCT 1.00 % | moderate | 836 | 429 | 51.3 % | 1.162 | 886.47 | 20.16 | 869.40 | 0.00 |
| HOLD | 10000 | PCT 1.00 % | severe | 857 | 489 | 57.1 % | 1.408 | 2138.81 | 14.00 | 1331.00 | 1027.27 |

## CURRENT's fixed-dollar assumption
For CURRENT the planned loss is capped by the production −50 USD assumption. Under the common structural exit, 9 HOLD losses exceed 50 USD at 0.01 lot (max ×3.08 of the planned value). In production, the −50 USD monetary broker SL would cut these trades, by moving the stop inside or near the structure (V11_STRUCTURAL_SL).

## Reading
- **Planned risk is controlled:** 0 PCT trades are above the approved risk.
- **Realized risk is not fully covered.** At NORMAL cost the only excess is the overnight BUY swap, which the worst-case formula omits; at SEVERE cost slippage and gaps push the majority of losing trades above plan (up to ≈ ×1.45).
- **REALIZED_RISK_CONTROL = PARTIAL.** A future spec would need a swap allowance and an explicit gap / slippage buffer.
