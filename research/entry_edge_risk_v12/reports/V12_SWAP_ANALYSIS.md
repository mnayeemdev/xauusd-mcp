# V12_SWAP_ANALYSIS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Platform evidence
- **Swap-long history** (production MT5 bridge records): 0.5674 USD/oz/night at most (−567.4 points); latest record −513.2 points. Swap short is 0.
- **Buffer rate:** 0.5674 (the maximum).

## Intraday vs overnight vs weekend (every valid entry, own geometry, NORMAL; per oz; multiplier = REALISTIC realized loss ÷ planned worst case)
| Split | Class (calendar nights held) | Entries | BUY | Losing | Planned worst case (USD/oz) | Swap (USD/oz) | Swap ÷ planned | Total exposure (USD/oz) | Mean × | p99 × | Max × | Losers above plan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DEV | INTRADAY | 4533 | 2590 | 2575 | 8.62 | 0.000 | 0.00 % | 8.62 | 0.88 | 1.00 | 1.41 | 0.4 % |
| DEV | OVERNIGHT | 241 | 139 | 125 | 13.70 | 0.327 | 2.39 % | 14.03 | 0.84 | 1.16 | 1.19 | 18.4 % |
| DEV | WEEKEND_OR_MULTI | 84 | 46 | 58 | 14.54 | 0.736 | 5.07 % | 15.27 | 1.04 | 3.55 | 3.55 | 43.1 % |
| HOLD | INTRADAY | 6134 | 2825 | 3458 | 14.16 | 0.000 | 0.00 % | 14.16 | 0.87 | 1.00 | 2.17 | 0.2 % |
| HOLD | OVERNIGHT | 318 | 134 | 192 | 22.36 | 0.239 | 1.07 % | 22.60 | 0.84 | 1.12 | 1.13 | 12.5 % |
| HOLD | WEEKEND_OR_MULTI | 101 | 41 | 52 | 24.57 | 0.506 | 2.06 % | 25.07 | 2.15 | 7.61 | 7.61 | 36.5 % |

## Nights possible at entry (BUY entries; trading calendar)
| Split | BUY entries | Distribution (nights: count) |
|---|---|---|
| DEV | 2775 | 1 2150, 2 64, 3 541, 4 20 |
| HOLD | 3000 | 1 2285, 2 70, 3 627, 4 13, 5 5 |

## Reading
- **Swap is small.** It is 1.1 % of planned risk on overnight trades and 2.1 % on weekend trades (HOLD).
- **It is deterministic and known at entry:** nights possible × the maximum rate.
- **Unbuffered, it pushes some overnight losers above plan,** at most ×1.13 on HOLD.
- **The envelope removes it.** The swap buffer covers it completely (swap is never the cause of an exceedance under H1 / H2 / H3).
- **The extreme weekend multipliers are gap effects, not swap** (V12_GAP_STRESS).
- **No ban on overnight trades is justified by swap.**
