# V8_WAIT_REASON_ANALYSIS

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.337Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

Every WAIT carries one of the 15 allowed categories and an exact detail (no generic "low quality": the quality gate is reported as OTHER_GOVERNED_REASON with the score, threshold, threshold basis and the weakest components).

| Category (V8) | Bars | Share of decisions |
|---|---|---|
| NO_PATTERN | 5 | 6.2 % |
| NO_SETUP | 8 | 9.9 % |
| NO_TRIGGER | 15 | 18.5 % |
| MODEL_NOT_ELIGIBLE | 23 | 28.4 % |
| LOCATION_INVALID | 0 | 0.0 % |
| STRUCTURAL_RISK_INVALID | 0 | 0.0 % |
| RR_INVALID | 19 | 23.5 % |
| SPREAD_BLOCK | 0 | 0.0 % |
| NEWS_BLOCK | 0 | 0.0 % |
| VOLATILITY_BLOCK | 0 | 0.0 % |
| BROKER_SAFETY | 0 | 0.0 % |
| DATA_UNAVAILABLE | 0 | 0.0 % |
| STALE_DATA | 0 | 0.0 % |
| CONTEXT_CONFLICT | 0 | 0.0 % |
| OTHER_GOVERNED_REASON | 1 | 1.2 % |

| Category (CONTROL) | Bars | Share |
|---|---|---|
| NO_PATTERN | 17 | 21.0 % |
| NO_SETUP | 8 | 9.9 % |
| NO_TRIGGER | 11 | 13.6 % |
| MODEL_NOT_ELIGIBLE | 12 | 14.8 % |
| LOCATION_INVALID | 3 | 3.7 % |
| STRUCTURAL_RISK_INVALID | 0 | 0.0 % |
| RR_INVALID | 13 | 16.0 % |
| SPREAD_BLOCK | 0 | 0.0 % |
| NEWS_BLOCK | 4 | 4.9 % |
| VOLATILITY_BLOCK | 0 | 0.0 % |
| BROKER_SAFETY | 0 | 0.0 % |
| DATA_UNAVAILABLE | 0 | 0.0 % |
| STALE_DATA | 0 | 0.0 % |
| CONTEXT_CONFLICT | 0 | 0.0 % |
| OTHER_GOVERNED_REASON | 2 | 2.5 % |

## Most frequent exact reasons (V8)
| Reason | Bars |
|---|---|
| RR_INVALID: RR to the structural objective below 1.70 | 19 |
| MODEL_NOT_ELIGIBLE: PB BUY triggered but not eligible under the 15m NEUTRAL RANGE bias | 8 |
| MODEL_NOT_ELIGIBLE: PB SELL triggered but not eligible under the 15m NEUTRAL RANGE bias | 6 |
| NO_TRIGGER: PB BUY: setup present, trigger not confirmed | 5 |
| NO_PATTERN: no eligible model shows its pattern | 5 |
| NO_TRIGGER: BO BUY: setup present, trigger not confirmed | 5 |
| NO_SETUP: PB BUY: pattern present, setup conditions not met | 2 |
| MODEL_NOT_ELIGIBLE: PB SELL triggered but not eligible under the 15m BULLISH BULL_TREND bias | 2 |
| NO_TRIGGER: MR SELL: setup present, trigger not confirmed | 2 |
| NO_SETUP: MR BUY: pattern present, setup conditions not met | 2 |
| MODEL_NOT_ELIGIBLE: MC BUY triggered but not eligible under the 15m NEUTRAL RANGE bias | 2 |
| NO_TRIGGER: MR BUY: setup present, trigger not confirmed | 2 |
| MODEL_NOT_ELIGIBLE: MC SELL triggered but not eligible under the 15m NEUTRAL COMPRESSION bias | 2 |
| NO_SETUP: BO SELL: pattern present, setup conditions not met | 2 |
| NO_TRIGGER: MC BUY: setup present, trigger not confirmed | 1 |

## Decision changes CONTROL → V8 on the same bar
| Change | Bars |
|---|---|
| NO_PATTERN → MODEL_NOT_ELIGIBLE | 5 |
| NO_PATTERN → RR_INVALID | 5 |
| NO_SETUP → MODEL_NOT_ELIGIBLE | 4 |
| MODEL_NOT_ELIGIBLE → RR_INVALID | 4 |
| RR_INVALID → NO_TRIGGER | 2 |
| LOCATION_INVALID → RR_INVALID | 2 |
| RR_INVALID → SELL | 2 |
| RR_INVALID → MODEL_NOT_ELIGIBLE | 2 |
| NO_PATTERN → NO_TRIGGER | 2 |
| NEWS_BLOCK → MODEL_NOT_ELIGIBLE | 2 |
| NEWS_BLOCK → NO_SETUP | 2 |
| NO_TRIGGER → NO_SETUP | 1 |
| OTHER_GOVERNED_REASON → MODEL_NOT_ELIGIBLE | 1 |
| LOCATION_INVALID → NO_SETUP | 1 |
| BUY → NO_TRIGGER | 1 |
