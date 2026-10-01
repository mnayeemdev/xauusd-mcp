# V10_SUPPORTED_PARAMETERS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Supported by the pre-registered selection
| Parameter | Value |
|---|---|
| SUPPORTED_RISK_PERCENTAGE | **none** |
| Supported controls | **none** |
| Margin cap | **none selected** |

## Mechanics validated (tests + replay)
These are not evidence of capital safety for this entry stream. They are the components a future governed risk layer would be built from:
| Mechanism | Validated property |
|---|---|
| Sizing from the structural SL | lots = ⌊equity × r ÷ worst-case loss per lot ÷ step⌋ × step; wider SL → smaller size; SL never moved |
| Rounding | always down; actual risk recalculated; never above approved (5,000-case property + every replay trade) |
| Minimum lot | REJECT below the broker minimum; never round up |
| Broker spec | read from the platform record; fails closed when missing |
| Margin | cap + margin-level-after-loss buffer (60 % + 40); leverage never increases the size |
| Daily / streak / weekly controller | limits as % of day- or week-start equity; resets; pure and serialisable |
| Exposure | MAX_SIMULTANEOUS_TRADES = 1 |
| Restart / duplicates / broker rejection | restart = uninterrupted; duplicates rejected (also after restart); broker rejection never retried or resized |
| Fail-safes | missing / wrong-side / loosened broker SL, excess actual exposure, lost connection → fail closed |
