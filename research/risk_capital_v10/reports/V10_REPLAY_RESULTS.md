# V10_REPLAY_RESULTS

V10 RISK + CAPITAL CONTROL · RESEARCH ONLY · dynamic sizing RESEARCH_ONLY · HYPOTHETICAL_NOT_EXECUTED · entries = V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 4a677f6e421ed033… · selection frozen 2026-10-01T13:45:42.325Z

## Integrity (FULL run)
| Check | Result |
|---|---|
| Chronological replay deterministic (two runs, identical trade lists by hash) | PASS |
| Restart from serialized state (first half → serialize → deserialize → second half) equals the uninterrupted run | PASS |
| Restart prefix consistent with the uninterrupted run | PASS |
| Duplicate signal rejected | PASS |
| PCT never above its approved risk (every split × account × risk % × cost) | PASS |

## Reproduction
- **Refactor check.** The simulation helpers were moved from `v10_study.mjs` into `scripts/sim.mjs` after the first FULL run. DEV was re-run (selection.json byte-identical; v10_dev.json identical apart from the timestamp; freeze hashes identical), and FULL was re-run: v10_results_FULL.json was identical apart from the timestamp.
- **Restore.** The original freeze file was restored.

## Mechanics tests (`tests/risk_capital_v10.test.js`)
The suite covers:
- percentage risk, sizing and SL distance;
- broker rounding (down, never up) and the actual-risk property over 5,000 random cases;
- minimum-lot rejection;
- the broker spec loaded from the platform log (fails closed);
- margin cap, margin level after loss, and margin ≠ risk permission;
- daily limit and capacity, next-day reset;
- consecutive-loss pause, weekly halt;
- MAX_SIMULTANEOUS_TRADES = 1;
- no martingale and no profit escalation;
- restart = uninterrupted;
- duplicates (also after restart);
- broker rejection (no retry, no size change);
- missing, wrong-side and loosened SL, lost connection;
- the excess-exposure fail-safe;
- stress-cost ordering;
- the CURRENT production margin veto;
- research boundaries;
- the frozen results.

Tests: see GIT_EVIDENCE for counts.
