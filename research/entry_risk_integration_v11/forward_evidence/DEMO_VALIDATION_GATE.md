# DEMO_VALIDATION_GATE

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.338Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

**DEMO_ELIGIBLE = NO.** DEMO is never enabled automatically and there is no signal-count rule. Eligibility depends only on the owner's explicit review of the five areas below; this page lists the evidence collected so far.

## Owner review checklist
| Area | Evidence so far |
|---|---|
| CORE RULE CORRECTNESS | NO RULE VIOLATION OBSERVED SO FAR; D1-D6 violations V8 0 (CONTROL 101); replay mismatches 0; stage mismatches 0; implementation errors 0 |
| FORWARD BEHAVIOUR | 81 candles observed over 0 d 22 h 31 min; 5 valid setups, 5 shadow signals; missed 0, incorrect blocks 0, late 0; over-correction flags 2 |
| RISK CONTROL | structural SL on every setup (V8_SL_ANALYSIS); RR 1.70 verified (V8_RR_ANALYSIS); lot 0.01; no averaging, martingale or scaling |
| COST REALISM | 1.70R NORMAL -0.219 R vs STRESS -0.291 R per signal (V8_COST_STRESS) |
| STABILITY | daily evidence snapshots (state/v8_shadow/snapshots/), replay parity 3/16, data-integrity failures 0, broker revisions 110535 |

## Future DEMO specification (prepared only; NOT started)
| Item | Value |
|---|---|
| Account | 10,000 USD DEMO |
| Lot | 0.01 (USER_FIXED) |
| RR | 1.70 |
| AUTO_SCALING / MARTINGALE / AVERAGING_DOWN | OFF / OFF / OFF |
| Risk governance | percentage-of-equity cap per trade (structural distance x 0.01 lot as % of equity), structural SL, broker stops level and margin availability; no universal fixed-dollar loss |
| Engine | the frozen V8 corrected core exactly as validated (engines manifest hash), no new filters |
| Safety | production News V2, spread <= 0.60, drift guard, shock state, breaker, broker fail-safe SL |
| REAL | prohibited; no automatic deployment is prepared |
