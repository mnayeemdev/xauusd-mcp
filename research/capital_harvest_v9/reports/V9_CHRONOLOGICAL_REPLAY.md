# V9_CHRONOLOGICAL_REPLAY

V9 CAPITAL HARVEST · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · RR 1.70 · lot 0.01 · pre-registration de61b5f19cb90a35… · selection frozen 2026-10-01T13:22:00.731Z

| Check | Result |
|---|---|
| Baseline / RUN_TO_END reproduce the V5/V8 simulator | 9716 comparisons, 0 mismatches |
| LIVE-TIME (bars fed one completed close at a time, fixed history window) = CHRONOLOGICAL REPLAY (full array) | 480 trades, 4205 decision bars, 0 mismatches |
| Hindsight: every bar after a decision replaced by garbage | 2434 earlier decisions re-checked, 0 changed |
| Determinism (two runs) | identical (sha d3271b570fa8558d…) |
| Cost accounting (zero vs 0.10 slippage) | mean difference 0.1 USD (expected 0.10): PASS |

The manager reads only bars ≤ the decision close and the same code path accepts the V8 forward-shadow archive format (completed 5m bars), so a future shadow evaluation would be reproducible from the same time-ordered data. **REPLAY_PARITY = PASS; HINDSIGHT_CHECK = PASS.**
