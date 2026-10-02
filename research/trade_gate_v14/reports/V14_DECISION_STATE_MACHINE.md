# V14_DECISION_STATE_MACHINE

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## Order (first failing step wins; every step's state is still recorded in the audit log)
```
OBSERVE (input, ordering, freshness) ── fail → WAIT_STALE_DATA
→ SAFETY BREAKERS (production limits, kill switch, recorded block) ── active → WAIT_SAFETY_BREAKER
→ VALIDATE EXISTING SETUP ── none → WAIT_NO_SETUP
→ VALIDATE TRIGGER ── none / engine signal unverified → WAIT_NO_TRIGGER
→ VALIDATE DIRECTION (existing engine rules; the gate never picks a side) ── none → WAIT_DIRECTION_UNCLEAR
→ STRATEGY CONFLICT ── no defined resolution → WAIT_CONFLICT   (defined: existing priority chain MC → PB → BO → SR → MR)
→ VALIDATE LOCATION ── WAIT_INVALID_LOCATION
→ VALIDATE STRUCTURAL SL ── WAIT_INVALID_SL
→ VALIDATE RR ── WAIT_INVALID_RR      (engine quality gate → WAIT_ENTRY_QUALITY)
→ VALIDATE RISK (V11 firewall; UNRESOLVED never approves) ── WAIT_RISK_UNSAFE (VALID_ENTRY + RISK_REJECTED)
→ VALIDATE BROKER / EXECUTION SAFETY ── WAIT_BROKER_UNSAFE / WAIT_STALE_DATA
→ TRADE_ELIGIBLE
```

- **No fallback.** No step has an automatic fallback strategy.
- **Global preconditions first.** Staleness and active safety breakers are checked before the strategy steps: a halted or blind system does not evaluate entries.

## Path evidence (DEV + HOLD, PRIMARY)
| Exit point | Bars |
|---|---|
| WAIT_STALE_DATA | 933 |
| WAIT_SAFETY_BREAKER | 0 |
| WAIT_NO_SETUP | 17,258 |
| WAIT_NO_TRIGGER | 35,858 |
| WAIT_DIRECTION_UNCLEAR | 21,433 |
| WAIT_CONFLICT | 0 |
| WAIT_INVALID_LOCATION | 1,695 |
| WAIT_INVALID_SL | 0 |
| WAIT_INVALID_RR | 8,857 |
| WAIT_ENTRY_QUALITY | 1,936 |
| WAIT_RISK_UNSAFE | 11,411 |
| WAIT_BROKER_UNSAFE | 0 |
| TRADE_ELIGIBLE | 0 |
