# V12_SLIPPAGE_ANALYSIS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

## Scenario levels vs the 0.10 planning allowance (losing outcomes of every valid entry; multiplier = loss excluding swap and gap ÷ planned)
| Split | Level | Slippage | Losing | Losers above plan | Max × |
|---|---|---|---|---|---|
| DEV | normal | 0.1 | 2758 | 0.0 % | 1.000 |
| DEV | moderate | 0.3 | 2770 | 46.0 % | 1.100 |
| DEV | severe | 0.6 | 2790 | 48.8 % | 1.227 |
| HOLD | normal | 0.1 | 3702 | 0.0 % | 1.000 |
| HOLD | moderate | 0.3 | 3711 | 43.1 % | 1.085 |
| HOLD | severe | 0.6 | 3732 | 43.8 % | 1.196 |

## Recorded execution evidence (production logs; no account identifiers)
| Source | Side | Entry slippage (USD) | Spread (USD) | Entry drift (USD) |
|---|---|---|---|---|
| REAL | SELL | 0 | 0.26 | 1.32 |
| REAL | BUY | 0 | 0.26 | 0.1 |
| DEMO | BUY | -0.06 | 0.26 | 0.68 |

- **Stop-out slippage:** no fill data exists, and that is where slippage matters.
- **Entry drift does not raise the worst case.** The production broker SL is placed from the fill (fill ∓ (1.5 R + spread)), so the loss at the broker SL is unchanged; drift only changes the thesis-exit distance, which stays inside the broker SL.

## Reading
- **Slippage above the allowance is material relative to plan, but bounded.** It adds one-for-one at the stop: MODERATE puts ≈ 43–46 % of losers above plan, by at most ×1.10; SEVERE by at most ×1.23.
- **The envelope buffer of 0.2 covers MODERATE.** It is an **ASSUMPTION**, not evidence-calibrated (3 fills). This alone prevents RISK_HARDENED under the pre-registration.
