# V14 — NO-EDGE BEHAVIOUR & TRADE GATE — SPECIFICATION AND PRE-REGISTERED VALIDATION (frozen 2026-10-02)

An architecture, safety and decision-gate study.
- **Not edge research.** No filter, indicator, regime / news model, external data, ML, score, threshold or strategy family is added.
- **Authority and production:** REAL = OFF, DEMO = OFF, EXECUTION_AUTHORITY = NONE, PRODUCTION_CHANGED = NO.
- **Fixed settings:** RR = 1.70, CAPITAL_HARVEST = OFF, RISK_PERCENTAGE = UNRESOLVED.
- **Unchanged strategies:** MC, PB, BO, SR, MR (frozen V8 corrected core).

## 1. Principle
WAIT is a valid, preferred state.
- **The gate is not an edge generator.** It never creates an entry the existing engine did not generate, never chooses a direction the existing rules did not establish, and never modifies an entry.
- **No trade-count target.** There is no minimum or target trade count; ZERO TRADES is not an error.
- **Its only job.** It decides TRADE_ELIGIBLE or WAIT / REJECT from the existing rules and the existing production safety limits.

## 2. Inputs
The same time-ordered inputs as the V8 corrected core and forward shadow.
- **One record per confirmed 5m bar:**
  - per-model, per-side stage strings (0 none / 1 pattern / 2 setup / 3 trigger);
  - the engine action (BUY / SELL / WAIT) and wait reason;
  - the chosen model and candidate side;
  - geometry;
  - 15m bias;
  - staleness;
  - safety states (news / shock / kill switch where recorded).
- **Adapters:**
  - V8 replay rows (historical);
  - forward-shadow decision records (live, read-only).
- **Prior gate state:** the open hypothetical position, the daily breaker counters and the last decided bar.

## 3. States
**Final states:**
- WAIT_STALE_DATA, WAIT_SAFETY_BREAKER, WAIT_NO_SETUP, WAIT_NO_TRIGGER, WAIT_DIRECTION_UNCLEAR, WAIT_CONFLICT;
- WAIT_INVALID_LOCATION, WAIT_INVALID_SL, WAIT_INVALID_RR, WAIT_ENTRY_QUALITY;
- WAIT_RISK_UNSAFE (= RISK_REJECTED for a valid entry), WAIT_BROKER_UNSAFE;
- TRADE_ELIGIBLE.

**Four states added to the owner's list, each necessary:**
- **WAIT_INVALID_SL and WAIT_INVALID_RR:** the owner's state machine (§14) validates the structural SL and RR as separate steps, and §19 / §23 require "invalid SL / RR → no trade".
- **WAIT_ENTRY_QUALITY:** the engine's existing quality gate (NO_GOOD_ENTRY) rejects a triggered candidate. No other state describes that rule truthfully.
- **Reason codes:** every WAIT carries a deterministic reason code.

## 4. State machine (first failing step wins; every step's state is still recorded in the audit log)
1. **STALE:** missing or stale input, a bar out of order or duplicated, or engine DATA_UNAVAILABLE_STALE / INSUFFICIENT_DATA / BIAS_UNAVAILABLE → WAIT_STALE_DATA.
2. **SAFETY BREAKER:** existing production limits.
   - The consecutive-loss limit (REAL 2 per UTC day; resets on the next UTC day).
   - The daily trade ceiling (10).
   - The kill switch.
   - News / shock blocks where recorded.
   - The V8 re-entry guard (STALE_SAME_SETUP, REVENGE_GUARD).
   - → WAIT_SAFETY_BREAKER.
3. **SETUP:** no model / side at stage ≥ 2 → WAIT_NO_SETUP (reason NO_PATTERN or PATTERN_ONLY).
4. **TRIGGER:** no valid trigger (stage 3, or the SR bias-support rule) → WAIT_NO_TRIGGER.
5. **DIRECTION:**
   - The engine has no candidate (NO_ELIGIBLE_STRATEGY), CHOP, HTF_CONFLICT or ENTRY_CONFLICT → WAIT_DIRECTION_UNCLEAR.
   - The engine signal's own (model, side) is not a verified, bias-valid trigger → WAIT_DIRECTION_UNCLEAR / WAIT_NO_TRIGGER (discrepancy flag).
6. **CONFLICT:** opposite-side valid triggers from other strategies at the same bar.
   - **Resolution:** the existing architecture resolves this deterministically by its model priority chain (MC → PB → BO → SR → MR; the first candidate wins). It is recorded as STRATEGY_CONFLICT + EXISTING_PRIORITY.
   - **No resolution:** WAIT_CONFLICT (configuration `conflictResolution: null`).
7. **LOCATION / SL / RR / QUALITY:**
   - Engine OVEREXTENDED → WAIT_INVALID_LOCATION.
   - INVALID_GEOMETRY → WAIT_INVALID_SL.
   - RR_NOT_ACCEPTABLE / VOLATILITY_INSUFFICIENT → WAIT_INVALID_RR.
   - NO_GOOD_ENTRY → WAIT_ENTRY_QUALITY.
   - For a signal, the V11 geometry check re-verifies location, SL and RR.
8. **RISK:**
   - **Risk model UNRESOLVED (primary):** every valid entry → WAIT_RISK_UNSAFE (RISK_PERCENTAGE_UNRESOLVED), recorded as VALID_ENTRY + RISK_REJECTED.
   - **Illustrative risk models:** the V11 integration firewall (unchanged), covering exposure, minimum lot, margin, sizing consistency and approved risk.
9. **BROKER / SAFETY:** V11 fail-safes (quote / signal age, spread limit, spec, tick value, broker order rules, broker rejection) and the production entry-drift limit → WAIT_BROKER_UNSAFE, or WAIT_STALE_DATA for stale quote / signal.
10. **TRADE_ELIGIBLE.**

## 5. Replays
| Configuration | Risk | Breakers | Purpose |
|---|---|---|---|
| PRIMARY | UNRESOLVED | production limits | the behaviour the evidence supports today |
| ILLUSTRATIVE_PCT_0.50_10K | PCT 0.50 %, 10,000 USD (research candidate, NOT approved) | off | exercises the risk path; must reproduce V11 exactly |
| ILLUSTRATIVE_CURRENT_10K | fixed 0.01 lot (production veto) | production limits | exercises the breaker path |

- **Hypothetical positions:** they close at their simulated exit. The gate only uses whether a position is open at the decision bar, which is known at that time.
- **Bar-close decisions:** signal age 0, quote age 0, NORMAL spread.
- **Forward shadow:** the gate is run read-only over the live V8 records (`state/v8_shadow/decisions.jsonl`).

## 6. Validation and decision (pre-registered)
**GATE_FAILED** if any of:
- a TRADE_ELIGIBLE record violates any §19 invariant: setup, trigger, direction, location, SL, RR, risk, broker, not stale, no breaker, conflict resolved;
- TRADE_ELIGIBLE on a bar where the engine did not generate that entry;
- any WAIT has no reason;
- an entry hash changes;
- a replay is not deterministic;
- restart ≠ uninterrupted;
- the no-lookahead check fails;
- illustrative PCT parity with V11 fails;
- any required unit test fails.

**GATE_VALIDATED:** no failure condition, AND the gate runs on the forward-shadow records with every live decision fully determined from recorded fields (no missing-field fail-closed).

**GATE_PARTIALLY_VALIDATED:** no failure condition, but live operation needs a field the forward-shadow records do not carry (the gate then fails closed). The missing field is documented as a requirement.

**GATE_INCONCLUSIVE:** the gate cannot be run on the forward-shadow records at all.

Profitability is not a criterion. No status may say PROFITABLE / BEST / WINNER / EDGE_FOUND.
