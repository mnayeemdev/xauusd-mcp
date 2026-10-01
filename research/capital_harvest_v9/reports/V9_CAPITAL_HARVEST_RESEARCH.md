# V9_CAPITAL_HARVEST_RESEARCH

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

## Question
Can a deterministic HOLD / PROTECT / HARVEST / EXIT layer protect meaningful open profit while keeping the right tail, on IDENTICAL V8-corrected-core entries and IDENTICAL structural stops, with RR 1.70 as the baseline objective?

## Verdict
**CAPITAL_HARVEST_EDGE = INCONCLUSIVE; PROPOSED_POLICY = NO.** The three frozen adaptive policies beat the fixed 1.70 R baseline by +0.002 to +0.015 R per trade on both splits, but no 95 % interval excludes zero, the right tail is not preserved (28–46 % on HOLD versus the required 80 %), and 67–72 % of early exits are premature. No formula is proposed.

## Answers (HOLDOUT, normal cost)
| Question | Answer |
|---|---|
| A. Reduce unnecessary give-back? | Yes, modestly: HOLD give-back 1.22 R (baseline) → 0.82 / 1.11 / 0.90 R (70.3 % → 61.2 % / 67.3 % / 62.7 % of MFE on trades whose MFE reached 0.5 R) — mostly by closing winners earlier. |
| B. Preserve strong-trade upside? | No: only 28.0 % / 45.9 % / 32.4 % of strong trades (open-path MFE ≥ 2 R) end at least as well as the baseline; 64.8 % / 36.3 % / 57.7 % of them are closed below 1 R by a management exit. |
| C. Improve expectancy? | Not demonstrably: HOLD paired gains 0.002 [-0.024, 0.026] / 0.015 [-0.007, 0.037] / 0.013 [-0.013, 0.037] R — every 95 % interval includes 0; DEV gains are of the same size. |
| D. Improve or preserve PF? | Roughly preserved: HOLD PF 0.94 → 0.92 / 0.95 / 0.94. |
| E. Reduce drawdown? | Mixed: sequential HOLD max DD 64.90 R → 119.49 / 57.73 / 74.65 R. |
| F. Survive realistic costs? | Paired gains stay ≈ +0.01 R under STRESS (0.010 / 0.011 / 0.015), but absolute expectancy is negative for every policy and the baseline under both cost models. |
| G. Avoid buying win rate with average win? | Partly not: the retention floor (Policy 1) lifts the win rate 43.5 % → 59.2 % while the average win falls 1.66 → 0.81 R; expectancy barely moves. |

## Important context: the uncapped reference
RUN_TO_END (structural stop only, no target, 24 h horizon) is +0.465 R on HOLD but -0.081 R on DEV. A drift control shows the HOLD figure is a property of the 2026 market, not of the entries or of exit skill: the SAME bars with a RANDOM side give 0.424 R and with every side flipped 0.187 R (V9_RIGHT_TAIL_ANALYSIS). It is reported, not proposed.

## Protocol
Pre-registered (sha de61b5f19cb90a35…), DEV grid of 58 configurations, per-family selection with the right-tail / premature constraints (every family: CONSTRAINT_UNMET), frozen, HOLDOUT once. The baseline reproduces the V5/V8 simulator exactly (9716 comparisons, 0 mismatches). Live-time feeding = chronological replay on 4205 decision bars; hindsight corruption 0 violations; deterministic; cost accounting exact.
