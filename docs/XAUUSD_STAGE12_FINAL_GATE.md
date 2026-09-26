# XAUUSD STAGE 12 — FINAL GATE (12D + 12E + 12F), frozen 2026-09-26

One READ-ONLY command evaluates all three stages against the genuine evidence and prints the version links:

```
npm run xauusd:stage12:report            # human-readable
npm run xauusd:stage12:report:json       # full JSON
node validation/stage12/report.js --out <dir>   # also writes stage12_gate_report.json/.md into <dir> only
```
It never trades, restarts, modifies the strategy, resets state, changes the breaker or the lot, or enables scaling. `validation/stage12/*` cannot reach the executor, the bridge or any mutating command (transitive-closure test).

## The four distinct claims

| Claim | Meaning | Today |
|---|---|---|
| ENGINEERING_READY | the D/E/F machinery is complete, frozen and tested | YES (this stage) |
| EVIDENCE_READY | the frozen minimums are met on FORWARD_LIVE_DEMO evidence (60 trades / 40 sessions / 90 days / 2 families / 3 months) | NO — WAITING_FOR_FORWARD_EVIDENCE |
| EDGE_SUPPORTED | every frozen 12D gate passes with integrity OK (`EVIDENCE_COMPLETE_EDGE_SUPPORTED`) | NO |
| CAPITAL_REVIEW_ELIGIBLE | every 12F prerequisite holds incl. 12E `INDEPENDENT_VALIDATION_SUPPORTED` (`ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW`) | NO |

## Gate chain

1. **12D** (`docs/XAUUSD_STAGE12_FORWARD_EDGE_EVALUATION.md`): INSUFFICIENT_EVIDENCE → EVIDENCE_COMPLETE_EDGE_NOT_SUPPORTED / EVIDENCE_COMPLETE_EDGE_SUPPORTED.
2. **12E** (`docs/XAUUSD_STAGE12_INDEPENDENT_VALIDATION.md`): NOT_ELIGIBLE_YET → RUNNING → FAILED / SUPPORTED, on a window declared once by the owner after 12D completion.
3. **12F** (`docs/XAUUSD_STAGE12_CAPITAL_READINESS.md`): NOT_READY_* → ELIGIBLE_FOR_OWNER_CAPITAL_REVIEW.
4. **Owner decision** (outside software): any exposure change is a separate explicit approval, implementation, test and re-freeze.

## Version / evidence linking

Every report records the evaluation rule version (`stage12-def-1.0`) and its fingerprint, the strategy fingerprint (verified against `src/engine/strategy.frozen.json`), the git commit, the evidence schema versions (`demo-forward-1.0`, `shadow-1.0`), the Stage 11C candidate hashes, account class, symbol and timeframe. DEMO evidence records are stamped with the strategy fingerprint and git commit at creation; a different fingerprint is a separate cohort and is never pooled.

## Anti-overfitting policy

D/E/F evaluate the frozen system; they never tune quality, RR, stops, targets, sessions, model weights or news windows, never remove a losing model, never select months or sessions. A failing result is reported as failure. A rule change requires a new rule version documented before any new outcome is observed.

## Runtime facts at freeze (2026-09-26)

REAL watcher v8 RUNNING with the PRE-freeze code loaded (the 8cab96d hardening and this stage activate only after an owner-authorized controlled restart; repository HEAD ≠ code in the running process), REAL flat, lot 0.01, breaker 2 per UTC day, RR ≥ 1.7, News V2 active, scaling OFF. Stage 11C observer RUNNING (0 FORWARD_LIVE observations so far; BACKFILL only). Stage 12 DEMO validator READY_NOT_STARTED. No trade placed, no restart, no reset.

**EDGE_DEMONSTRATED = NO. CAPITAL_SCALING_READY = NO. WAITING_FOR_GENUINE_FORWARD_EVIDENCE = YES.**
