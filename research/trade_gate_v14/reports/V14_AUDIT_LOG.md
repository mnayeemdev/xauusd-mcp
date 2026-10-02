# V14_AUDIT_LOG

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## One record per decision (§16)
| Field | Content |
|---|---|
| ts, bar_time | decision bar (UTC) |
| symbol, timeframe | XAUUSDm, 5m |
| source | V8_REPLAY_ROW or V8_FORWARD_SHADOW |
| obs | per strategy: stage BUY / SELL (0 none, 1 pattern, 2 setup, 3 trigger) |
| pattern, setup, trigger | PRESENT / ABSENT; list of valid triggers |
| direction, conflict | side or UNCLEAR:<reason>; opposite triggers and resolution |
| location, sl, rr, quality | VALID / INVALID / N/A |
| risk, broker | ACCEPTED:<lots> / REJECTED:<reason> / UNSAFE:<reason> / N/A |
| engine_action, engine_wait_reason | the frozen engine's own result |
| valid_entry, entry_id, entry_hash | the frozen entry record (never modified) |
| decision, reason | final state and deterministic reason |
| discrepancy | set if an engine signal could not be verified (fail closed) |

## Files
- **Full logs** (`results/audit/`, kept out of git, included in the handoff zip):
  - PRIMARY: every decision of DEV (46,593) and HOLD (52,788);
  - illustrative: every signal bar.
- **sha256 of each log** (`results/audit_hashes.json`):
  - DEV_PRIMARY: 85e6d9c8beb06b2a33f3d3e506fd13f0010f6d55577c00465348d705ffa68ae1
  - DEV_ILLUSTRATIVE_PCT_0_50_10K: 2df870f2fa864c8cdb35e1f734286296a759a75c87bf47eb03cd7554561fa633
  - DEV_ILLUSTRATIVE_CURRENT_10K: 17a91f291134abe25d4eeac94b28d3d24ae290e99b25e7bb28e082bdd6056927
  - HOLD_PRIMARY: b6c253f9bba2d65d645a24566fb073d4b0c2a905b1bd500db886e0fa45e172d6
  - HOLD_ILLUSTRATIVE_PCT_0_50_10K: 0c29991474c94f69968fadcb4b916104904e5e658a281f48794deb8a67ae4115
  - HOLD_ILLUSTRATIVE_CURRENT_10K: 9274a795a3f3f029ee4ae058f48a4f17342194f114d5be0872bac00a65da5e9d
- **Samples (in git):** `results/audit_samples/` holds the first 300 PRIMARY decisions per split, 3 examples per state per configuration, and the live forward-shadow gate decisions.

## Reason coverage
Every WAIT record carries a reason. There are 0 WAIT records without one (invariant sweep).
