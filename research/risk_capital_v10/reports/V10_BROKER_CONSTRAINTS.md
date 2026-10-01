# V10_BROKER_CONSTRAINTS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Source
`state/xauusd_mt5_real_trade_log.jsonl (production MT5 bridge, read-only)`: the latest XAUUSDm record (2026-10-01T13:21:39.069Z). The values are read, not assumed. The loader fails closed if the file or a required field is missing (tested).

The same contract fields appear in all 9 REAL-verified records (2026-09-25 → 2026-09-30) and in the latest record. No login, password or server value is copied into the spec.

| Field | Value | Use |
|---|---|---|
| Contract size | 100 oz | loss per lot, margin |
| Volume min / step / max | 0.01 / 0.01 / 200 | rounding down, rejection below the minimum, cap |
| Point / digits | 0.001 / 3 | tick size 0.001 |
| Tick value per lot | 0.1 USD per point | (contract × point) |
| Stops level / freeze level | 0 / 0 points | no minimum SL distance imposed by the broker |
| Leverage | 1:200 | margin |
| Margin currency | XAU | margin scales with price |
| Margin call | 60 % | margin-level-after-loss rule (+40 buffer) |
| Spread (recorded) | 240 points = 0.24 USD | NORMAL cost spread 0.24 |
| Swap long | -560 points = -0.56 USD/oz/night | BUY overnight cost in the simulator; NOT in the worst-case formula (see V10_SLIPPAGE_STRESS) |

## Constraints that shape the result
- **Minimum lot.** 0.01 lot = 1 oz. The worst-case loss of the smallest possible position is (1.5 × SL + 0.34) USD: median 11.35 USD on HOLD, up to 225.70 USD.
  - Any risk budget below that must reject the trade.
  - This dominates small accounts (V10_ACCOUNT_SIZE_COMPARISON).
- **Step 0.01 and rounding down.** The actual risk is up to one step below the approved risk; small budgets lose proportionally more to rounding.
- **Stops and freeze level 0.** The broker places no extra distance constraint. The production rule "never closer than 4 spreads" remains a production property.

## Not read from the platform (gaps; handled conservatively)
- **Commission:** none is recorded for this account type; costs are modelled via spread + slippage.
- **Swap short:** not recorded in the log; SELL swap is modelled as 0.
- **Live tick-by-tick spread:** the study uses fixed NORMAL / MODERATE / SEVERE levels.
