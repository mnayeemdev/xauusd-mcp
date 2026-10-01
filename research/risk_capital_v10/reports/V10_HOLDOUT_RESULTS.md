# V10_HOLDOUT_RESULTS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Split
- **Period:** HOLDOUT 2026-01-01 → 2026-09-29.
- **Signals:** 6553 signals over 209 sessions, replayed once after the freeze.

## Pre-registered holdout check
- **Not applicable:** no risk % was frozen, so condition (ii) of the decision ("a SUPPORTED risk % exists on DEV and on HOLDOUT still meets (a)–(e)") fails at its first clause.
- **Holdout flags:** hold_confirms = false; hold_checks = {}.

## Holdout grid (NORMAL cost; DESCRIPTIVE: the holdout cannot select)
| Account | CURRENT end / DD / trades | 0.10 % | 0.25 % | 0.50 % | 0.75 % | 1.00 % |
|---|---|---|---|---|---|---|
| 100 | 69.48 / 49.3 % / 10 | no trade | no trade | no trade | no trade | no trade |
| 250 | 68.08 / 88.4 % / 221 | no trade | no trade | no trade | no trade | 247.44 / 2.0 % / 8 |
| 500 | 706.95 / 82.1 % / 1510 | no trade | no trade | 497.44 / 1.0 % / 8 | 460.86 / 11.5 % / 201 | 415.68 / 29.1 % / 497 |
| 1000 | 1206.95 / 51.4 % / 1510 | no trade | 997.44 / 0.5 % / 8 | 899.32 / 18.0 % / 511 | 695.38 / 39.2 % / 904 | 718.20 / 31.6 % / 1161 |
| 5000 | 5206.95 / 12.9 % / 1510 | 4907.71 / 3.4 % / 503 | 4286.82 / 15.2 % / 1372 | 4296.81 / 16.6 % / 1589 | 4131.83 / 24.2 % / 1570 | 3780.66 / 33.2 % / 1541 |
| 10000 | 10206.94 / 6.7 % / 1510 | 9730.44 / 3.5 % / 1234 | 9289.30 / 8.3 % / 1590 | 8881.08 / 17.6 % / 1541 | 8533.89 / 24.0 % / 1523 | 7927.07 / 32.1 % / 1522 |

## Would any risk % have passed on HOLD alone? (criteria b–f, accounts ≥ 1,000; descriptive)
| Risk % | 1,000 | 5,000 | 10,000 |
|---|---|---|---|
| 0.10 % | f | f | f |
| 0.25 % | d, f | b, c, d, f | c, d, f |
| 0.50 % | b, c, d, f | b, c, d, f | b, c, d |
| 0.75 % | b, c, d, f | b, c, d, f | b, c, d |
| 1.00 % | b, c, d, f | b, c, d | b, c, d |

## Reading
- **HOLD is less adverse than DEV** for percentage risk at 10,000 USD (taken mean R -0.020 vs -0.070). It is still negative.
- **The minimum-lot constraint is tighter on HOLD,** because the SLs are wider.
- **Nothing on HOLD changes the decision.** Using HOLD to pick a risk % would be holdout tuning and is not done.
