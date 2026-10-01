# V9_PROPOSED_CAPITAL_HARVEST_V1_SPEC

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

**PROPOSED_POLICY = NO. CAPITAL_HARVEST_EDGE = INCONCLUSIVE.** The evidence does not support a robust policy, so no Capital Harvest V1 formula is proposed and nothing is invented. Capital Harvest stays OFF.

What the evidence establishes for any future attempt (requirements, not a formula):

| Item | Established |
|---|---|
| Entry interaction | none — entries, structural SL, lot and RR 1.70 are inputs; Capital Harvest must not change them |
| Initial protection | structural SL + broker fail-safe (1.5 R + spread) + thesis invalidation, never widened |
| Profit detection / timing | decisions only at completed closes; floors act from the next bar (reproducible live = replay; hindsight-free) |
| Continuation state | the simple state model tested here does not separate continuation from reversal well enough (premature 67–72 %) |
| Protect / ratchet | monotone, ≥ break-even, capped at the market — mechanics verified; the PROTECTION LEVEL is the unresolved part (tight floors cut the tail; wide floors converge on the baseline) |
| Harvest condition | weakness-based harvesting lifts the win rate but does not lift expectancy with statistical support |
| Maximum give-back | not a free parameter: lowering give-back below ≈ 0.8 R per trade costs more right tail than it saves |
| Failsafe / broker / restart / duplicates | the pure step function is serialisable and deterministic; broker protections and breakers are never overridden; one decision per position per closed bar (no duplicate actions) |
| Next legitimate step | not more exit tuning on a negative-expectancy entry stream; if pursued, a separately pre-registered "run-to-structure" study across several market regimes, because the uncapped payoff is regime-dependent |
