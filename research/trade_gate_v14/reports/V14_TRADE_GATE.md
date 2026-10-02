# V14_TRADE_GATE

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## Contract
- **Signature:** `decideGate(state, input, config) → { state, record }` (`scripts/gate.mjs`). It is pure: same input + same state = same decision.
- **Input:** one normalized record per confirmed 5m bar, from either adapter:
  - V8 replay row (historical);
  - V8 forward-shadow decision record (live, read-only).
- **Config:**
  - riskModel: `UNRESOLVED` (default) or an illustrative research model;
  - breakers: the production limits (REAL consecutive-loss 2 per UTC day, daily ceiling 10);
  - conflictResolution: `EXISTING_PRIORITY` (the engine's own chain) or none.

## Engine result → gate state (existing rules only)
| Engine result | Gate state |
|---|---|
| DATA_UNAVAILABLE_STALE / INSUFFICIENT_DATA / BIAS_UNAVAILABLE / missing stages / late signal / out-of-order bar | WAIT_STALE_DATA |
| no stage ≥ 2 (pattern only / no pattern) | WAIT_NO_SETUP |
| setup but no valid trigger | WAIT_NO_TRIGGER |
| NO_ELIGIBLE_STRATEGY / CHOP / HTF_CONFLICT / ENTRY_CONFLICT | WAIT_DIRECTION_UNCLEAR |
| OVEREXTENDED | WAIT_INVALID_LOCATION |
| INVALID_GEOMETRY | WAIT_INVALID_SL |
| RR_NOT_ACCEPTABLE / VOLATILITY_INSUFFICIENT | WAIT_INVALID_RR |
| NO_GOOD_ENTRY (engine quality gate) | WAIT_ENTRY_QUALITY |
| BUY / SELL signal, verified | risk → broker → TRADE_ELIGIBLE or WAIT |
| anything unrecognised | WAIT_SAFETY_BREAKER (fail closed) |

## Risk / broker result (V11 firewall, unchanged) → gate state
| Result | Gate state |
|---|---|
| risk model UNRESOLVED | WAIT_RISK_UNSAFE (RISK_PERCENTAGE_UNRESOLVED), valid entry kept |
| position open; minimum lot; margin; sizing inconsistent; above approved | WAIT_RISK_UNSAFE |
| broker order rule; broker rejection; equity / spec / tick value unavailable; spread above limit; entry drift | WAIT_BROKER_UNSAFE |
| stale quote / signal | WAIT_STALE_DATA |
| production breakers (consecutive losses, daily ceiling), kill switch, recorded news / shock block, re-entry guard, duplicate signal | WAIT_SAFETY_BREAKER |
| every check passed | TRADE_ELIGIBLE |

## Replay configurations
- **PRIMARY:** PRIMARY: risk UNRESOLVED, production breakers.
- **ILLUSTRATIVE_PCT_0_50_10K:** ILLUSTRATIVE: PCT 0.50 %, 10,000 USD, no breakers (V11 parity; not approved).
- **ILLUSTRATIVE_CURRENT_10K:** ILLUSTRATIVE: fixed 0.01 lot (production veto), production breakers (not approved).

The illustrative configurations only exercise the risk, broker and breaker paths. They are not approvals.
