# V8_WAIT_REASON_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:47:29.408Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:45:00.000Z (0 d 0 h 46 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Every WAIT carries one of the 15 allowed categories and an exact detail (no generic "low quality": the quality gate is reported as OTHER_GOVERNED_REASON with the score, threshold, threshold basis and the weakest components).

| Category (V8) | Bars | Share of decisions |
|---|---|---|
| NO_PATTERN | 0 | 0.0 % |
| NO_SETUP | 1 | 10.0 % |
| NO_TRIGGER | 5 | 50.0 % |
| MODEL_NOT_ELIGIBLE | 0 | 0.0 % |
| LOCATION_INVALID | 0 | 0.0 % |
| STRUCTURAL_RISK_INVALID | 0 | 0.0 % |
| RR_INVALID | 1 | 10.0 % |
| SPREAD_BLOCK | 0 | 0.0 % |
| NEWS_BLOCK | 0 | 0.0 % |
| VOLATILITY_BLOCK | 0 | 0.0 % |
| BROKER_SAFETY | 0 | 0.0 % |
| DATA_UNAVAILABLE | 0 | 0.0 % |
| STALE_DATA | 0 | 0.0 % |
| CONTEXT_CONFLICT | 0 | 0.0 % |
| OTHER_GOVERNED_REASON | 0 | 0.0 % |

| Category (CONTROL) | Bars | Share |
|---|---|---|
| NO_PATTERN | 0 | 0.0 % |
| NO_SETUP | 0 | 0.0 % |
| NO_TRIGGER | 6 | 60.0 % |
| MODEL_NOT_ELIGIBLE | 0 | 0.0 % |
| LOCATION_INVALID | 0 | 0.0 % |
| STRUCTURAL_RISK_INVALID | 0 | 0.0 % |
| RR_INVALID | 1 | 10.0 % |
| SPREAD_BLOCK | 0 | 0.0 % |
| NEWS_BLOCK | 0 | 0.0 % |
| VOLATILITY_BLOCK | 0 | 0.0 % |
| BROKER_SAFETY | 0 | 0.0 % |
| DATA_UNAVAILABLE | 0 | 0.0 % |
| STALE_DATA | 0 | 0.0 % |
| CONTEXT_CONFLICT | 0 | 0.0 % |
| OTHER_GOVERNED_REASON | 0 | 0.0 % |

## Most frequent exact reasons (V8)
| Reason | Bars |
|---|---|
| NO_TRIGGER: PB BUY: setup present, trigger not confirmed | 4 |
| RR_INVALID: RR to the structural objective below 1.70 | 1 |
| NO_TRIGGER: MC BUY: setup present, trigger not confirmed | 1 |
| NO_SETUP: PB BUY: pattern present, setup conditions not met | 1 |

## Decision changes CONTROL → V8 on the same bar
| Change | Bars |
|---|---|
| NO_TRIGGER → NO_SETUP | 1 |
