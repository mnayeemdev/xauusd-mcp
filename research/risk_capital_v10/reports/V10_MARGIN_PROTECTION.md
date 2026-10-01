# V10_MARGIN_PROTECTION

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Rule (research library)
- **Required margin:** lots × 100 × price ÷ 200. The leverage is read from the account; the margin currency is XAU, so the margin moves with the gold price.
- **Reject MARGIN_ABOVE_CAP** if the margin exceeds the cap % of equity (researched: 10 %, 25 %, 50 %; production budget 50 %).
- **Reject MARGIN_LEVEL_AFTER_LOSS_TOO_LOW** if the margin level after the worst-case loss would be below the broker margin call (60 %) + 40 points.
- **Reject EQUITY_EXHAUSTED_AT_STOP** if the equity at the stop would be ≤ 0.
- **Margin availability is NOT risk permission:** size comes from risk only, and margin can only reject.

## Margin use observed (NORMAL cost, cap 50 %)
| Split | Account | 0.10 % max / mean | 0.25 % max / mean | 0.50 % max / mean | 0.75 % max / mean | 1.00 % max / mean | CURRENT max / mean |
|---|---|---|---|---|---|---|---|
| DEV | 100 | — | — | — | — | — | 25.1 % / 19.1 % |
| DEV | 250 | — | — | — | 6.7 % / 6.6 % | 9.4 % / 7.1 % | 28.9 % / 8.7 % |
| DEV | 500 | — | — | 4.7 % / 3.5 % | 5.8 % / 4.0 % | 8.3 % / 4.6 % | 7.3 % / 4.1 % |
| DEV | 1000 | — | 2.3 % / 1.8 % | 4.7 % / 2.2 % | 7.1 % / 2.9 % | 9.3 % / 3.5 % | 2.7 % / 1.9 % |
| DEV | 5000 | 0.9 % / 0.4 % | 2.6 % / 0.8 % | 5.0 % / 1.5 % | 7.6 % / 2.2 % | 10.0 % / 3.0 % | 0.5 % / 0.4 % |
| DEV | 10000 | 0.9 % / 0.3 % | 2.5 % / 0.7 % | 5.0 % / 1.5 % | 7.7 % / 2.3 % | 10.5 % / 3.1 % | 0.2 % / 0.2 % |
| HOLD | 100 | — | — | — | — | — | 28.4 % / 19.2 % |
| HOLD | 250 | — | — | — | — | 9.4 % / 8.9 % | 30.0 % / 12.3 % |
| HOLD | 500 | — | — | 4.7 % / 4.4 % | 5.4 % / 4.5 % | 9.8 % / 4.6 % | 14.9 % / 5.3 % |
| HOLD | 1000 | — | 2.4 % / 2.2 % | 4.8 % / 2.3 % | 6.8 % / 2.7 % | 10.9 % / 3.2 % | 3.8 % / 2.4 % |
| HOLD | 5000 | 0.9 % / 0.4 % | 2.5 % / 0.7 % | 5.3 % / 1.3 % | 8.2 % / 1.9 % | 11.1 % / 2.5 % | 0.6 % / 0.5 % |
| HOLD | 10000 | 1.1 % / 0.3 % | 2.7 % / 0.6 % | 5.6 % / 1.3 % | 8.5 % / 2.0 % | 11.4 % / 2.6 % | 0.3 % / 0.2 % |

## Margin caps (DESCRIPTIVE_ONLY_NOT_SELECTION: stage 3 runs only at a supported risk %, and there is none)
Share of otherwise-eligible trades rejected by margin rules:
| Split | Risk % | Account | Cap 10 % | Cap 25 % | Cap 50 % |
|---|---|---|---|---|---|
| DEV | 0.10 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.10 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.10 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.25 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.25 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.25 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.50 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.50 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.50 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.75 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.75 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 0.75 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 1.00 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 1.00 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| DEV | 1.00 % | 10000 | 0.18 % | 0.00 % | 0.00 % |
| HOLD | 0.10 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.10 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.10 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.25 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.25 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.25 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.50 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.50 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.50 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.75 % | 1000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.75 % | 5000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 0.75 % | 10000 | 0.00 % | 0.00 % | 0.00 % |
| HOLD | 1.00 % | 1000 | 0.09 % | 0.00 % | 0.00 % |
| HOLD | 1.00 % | 5000 | 0.13 % | 0.00 % | 0.00 % |
| HOLD | 1.00 % | 10000 | 0.20 % | 0.00 % | 0.00 % |

## CURRENT production veto
- **Rule:** `assessRealLot` lets 0.01 lot trade while the margin is ≤ 50 % of equity, the equity after the fixed −50 USD loss stays > 0, and the margin level at that loss is ≥ 60 %.
- **Floor:** at the HOLD median price that is any equity ≥ about **72.54 USD**.
- **Risk at the floor:** at that equity a single median-SL loss is 15.6 % of equity, and a 99th-percentile loss is 94.4 %.
- **Conclusion:** the production margin veto protects against margin exhaustion, not against capital loss.

## Conclusion
- **Margin never limits a percentage-risk position** in the tested range: at most about 11.4 % of equity at 1.00 % risk.
- **No cap is evidence-selected.** The margin-level-after-loss buffer and a 50 % cap are harmless backstops (they never rejected a trade). A 10 % cap would start to bind only at 1.00 % risk.
