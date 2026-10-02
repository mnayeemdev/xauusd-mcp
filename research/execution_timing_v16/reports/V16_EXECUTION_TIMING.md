# V16_EXECUTION_TIMING

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## The rule (owner)
VALID SIGNAL + AGE ≤ 6 s + CURRENT ORIGINAL CONDITIONS STILL VALID + RISK SAFE + BROKER SAFE + SAFETY SAFE = TRADE ELIGIBLE. Anything else is WAIT / REJECT.
- **Age never decides on its own.** `IF AGE <= 6: BUY` does not exist anywhere in the code.
- **The 6 s window is execution tolerance only.** It is not an entry, a BUY, a SELL, a profitability assumption or a gap-fill assumption.

## What was built
| Part | File | Role |
|---|---|---|
| clock model, quote tracker, timing checks | `scripts/timing.mjs` | pure; monotonic durations, broker identity, no offset |
| revalidation | `scripts/revalidate.mjs` | timing → current engine state → execution geometry (existing rules) → the unchanged V14 gate (safety, risk, broker) |
| live probes | `scripts/probes.mjs` | re-validates an observed signal at 0–6 s and 8 s with fresh bars and the latest polled quote |
| scenario grid | `scripts/scenarios.mjs` | real V8 signal snapshots × constructed execution-time states (labelled SCENARIO) |
| forward shadow | `research/v8_forward_shadow/scripts/runner.mjs` | V16 block on every decision record; probes on forward-live V8 signals; continuous read-only quote polling (6 s tolerance, 250 ms polling) |

## Flow at execution time
1. **Timing (T1–T6):** timestamps present; monotonic order; broker-internal consistency; signal age ≤ 6 s; quote age ≤ 6 s; bid / ask integrity.
2. **Engine (E1):** the same frozen engine is re-run on the latest closed bars, and the original identity (side, model, anchor, structural SL, entry reference, objective) must be unchanged.
3. **Execution geometry (X1–X5)** at the ask (BUY) or bid (SELL), with the original structural SL. The rules are existing ones: price not beyond the SL; engine minimum risk 0.5 ATR; engine overextension 2.5 ATR; production drift 2.0 USD; RR ≥ 1.70 to the engine objective. The trade target is then 1.70 R exactly.
4. **Gate (G1):** the unchanged V14 gate: safety (spread, news, shock), breakers, conflict, trigger, risk (PRIMARY = unresolved → rejected), broker.

## Status
**EXECUTION_TIMING_VALIDATED.** 1 live V8 signal(s) were re-validated by the forward-shadow runner (8 probe decisions).
