# V10_PROPOSED_RISK_SPEC

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Status
**RISK_MODEL = INCONCLUSIVE. PROPOSED_RISK_SPEC = NO.**

Under the pre-registration a specification may be proposed only if a risk % is supported on DEV and confirmed on HOLD. None was supported, so **no risk percentage, maximum risk amount, daily limit or pause rule is proposed.** Do not invent a final risk percentage.

## Decision conditions
| Condition | Result |
|---|---|
| (i) Mechanical tests pass | see GIT_EVIDENCE (all V10 tests pass) |
| (ii) A SUPPORTED risk % exists on DEV and HOLD confirms | NO: no risk % supported on DEV |
| (iii) PCT never above approved risk | yes |
| (iv) Replay deterministic; restart = uninterrupted | yes |

## Production stays unchanged
RR 1.70; LOT 0.01; AUTO_SCALING OFF; CAPITAL_HARVEST OFF; MARTINGALE OFF; AVERAGING_DOWN OFF; EXECUTION_AUTHORITY NONE.

## What any future risk spec would have to satisfy (requirements derived from this study, not a proposal)
1. **An entry stream with demonstrated positive expectancy** after costs. Without it, every risk % only sets the speed of capital loss.
2. **A minimum-equity rule from the broker minimum lot:** trade only when 0.01 lot × worst-case loss ≤ equity × r. Otherwise reject.
3. **A swap allowance in the worst-case loss** for BUY positions that can cross the rollover.
4. **No universal fixed-dollar maximum loss.** Risk is a percentage of current equity, and the structural SL is never moved to fit a dollar amount.
5. **The validated mechanics** in V10_SUPPORTED_PARAMETERS: rounding down, actual-risk recalculation, margin buffer, single exposure, restart and duplicate safety, fail-safes.
