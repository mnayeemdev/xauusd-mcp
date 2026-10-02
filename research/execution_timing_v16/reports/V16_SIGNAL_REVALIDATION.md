# V16_SIGNAL_REVALIDATION

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Order (first failure decides; everything fails closed)
| Step | Check | Rule source | On failure |
|---|---|---|---|
| T1 | signal / decision / quote / receipt / bar timestamps present | data contract | WAIT_STALE_DATA (MISSING_*) |
| T2 | signal ≤ decision, quote receipt ≤ decision (monotonic) | clock model | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR) |
| T3 | tick ≥ open of the last closed bar; tick < latest bar + 2 bars; broker time not decreasing | broker clock | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR) |
| T4 | signal age ≤ 6 s | owner | WAIT_SIGNAL_EXPIRED (+ fresh evaluation) |
| T5 | quote age known and ≤ 6 s | owner | WAIT_STALE_DATA |
| T6 | bid > 0, ask > 0, ask ≥ bid | data contract | WAIT_BROKER_UNSAFE |
| E1 | same frozen engine on the latest closed bars: still a signal; identity unchanged | frozen V8 engine | V14 WAIT state / WAIT_SIGNAL_CHANGED |
| X1–X5 | price vs SL, 0.5 ATR minimum risk, 2.5 ATR overextension, 2.0 USD drift, RR ≥ 1.70 to the objective | engine + production | WAIT_INVALID_SL / LOCATION / BROKER_UNSAFE / INVALID_RR |
| G1 | safety, breakers, conflict, trigger, risk, broker | unchanged V14 gate | V14 state |

## Grid by state variant (ILLUSTRATIVE decisions; SELL | BUY are identical at every delay 0–6 s)
| State at execution (SCENARIO) | Meaning | 0 s | 1 s | 2 s | 3 s | 4 s | 5 s | 6 s | 8 s |
|---|---|---|---|---|---|---|---|---|---|
| UNCHANGED | market unchanged since the bar close | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | SIGNAL_EXPIRED |
| SMALL_MOVE_WITHIN_RULES | 0.15 USD toward the SL, inside every rule | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | SIGNAL_EXPIRED |
| TRIGGER_GONE | engine re-evaluation: trigger disappeared | NO_TRIGGER | NO_TRIGGER | NO_TRIGGER | NO_TRIGGER | NO_TRIGGER | NO_TRIGGER | NO_TRIGGER | SIGNAL_EXPIRED |
| DIRECTION_CHANGED | engine re-evaluation: opposite side | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_EXPIRED |
| LOCATION_OVEREXTENDED | price 2.6 ATR from the anchor | INVALID_LOCATION | INVALID_LOCATION | INVALID_LOCATION | INVALID_LOCATION | INVALID_LOCATION | INVALID_LOCATION | INVALID_LOCATION | SIGNAL_EXPIRED |
| SL_BREACHED | price beyond the structural SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | SIGNAL_EXPIRED |
| SL_INSIDE_ENGINE_MIN_RISK | price within 0.4 ATR of the SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | INVALID_SL | SIGNAL_EXPIRED |
| RR_INVALID | RR to the engine objective < 1.70 | INVALID_RR | INVALID_RR | INVALID_RR | INVALID_RR | INVALID_RR | INVALID_RR | INVALID_RR | SIGNAL_EXPIRED |
| ENTRY_DRIFT_ABOVE_LIMIT | 2.2 USD from the engine entry | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | SIGNAL_EXPIRED |
| SPREAD_ABOVE_LIMIT | spread 0.80 | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SIGNAL_EXPIRED |
| NEWS_BLOCK | News V2 blocks entries | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SAFETY_BREAKER | SIGNAL_EXPIRED |
| STRUCTURAL_SL_REVISED | bar revision moved the engine SL | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_EXPIRED |
| NEW_BAR_CLOSED | a newer bar closed | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_CHANGED | SIGNAL_EXPIRED |
| RISK_REJECTED | minimum lot above the illustrative risk (50 USD account) | RISK_UNSAFE | RISK_UNSAFE | RISK_UNSAFE | RISK_UNSAFE | RISK_UNSAFE | RISK_UNSAFE | RISK_UNSAFE | SIGNAL_EXPIRED |
| BROKER_REJECTED | broker rejects (simulated) | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | SIGNAL_EXPIRED |
| STALE_QUOTE | quote older than 6 s | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | SIGNAL_EXPIRED |
| MISSING_QUOTE | no quote | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| NO_WITNESSED_TICK | tick arrival not witnessed (restart) | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | SIGNAL_EXPIRED |
| QUOTE_RECEIVED_AFTER_DECISION | quote receipt after the decision | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| SIGNAL_AFTER_DECISION | signal time after the decision | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| QUOTE_AHEAD_OF_BROKER_BARS | tick two bars ahead of the broker bars | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| QUOTE_PREDATES_BARS | tick older than the decision bars | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| OUT_OF_ORDER_TICK | broker time went backwards | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA | STALE_DATA |
| BID_INVALID | bid 0 | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | BROKER_UNSAFE | SIGNAL_EXPIRED |
| CLOCK_DRIFT_1230MS_MONITOR | PC wall clock 1230 ms behind (monitor only) | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | **ELIGIBLE** | SIGNAL_EXPIRED |

- **Delay-independence:** within 0–6 s, 25 of 25 variants give the same decision at every delay.
- **The decision is set by the state.** The delay only matters beyond 6 s.
