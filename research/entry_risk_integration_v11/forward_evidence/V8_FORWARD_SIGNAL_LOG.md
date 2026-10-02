# V8_FORWARD_SIGNAL_LOG

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-02T10:30:35.336Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z (0 d 22 h 31 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

### V8 corrected core (5 counted signals; 5 valid setups; 0 blocked by execution safety; 5 duplicates not counted)
| Bar close (UTC) | Model | Side | Stages BUY / SELL | Entry | Structural SL | SL source | Risk (USD @0.01) | 1.70R TP | Engine TP2 (RR) | Spread | ATR14 | Session | Context (15m / 5m / 30m / 1H) | Safety | Decision | Outcome 1.70R (R) | Wrong-dir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | 00300 / 01011 | 4182.69 | 4178.05 | candidate_anchor | 4.64 | 4190.578 | 4192.38 (2.09) | 0.24 | 4.109 | LONDON | BULLISH/BULL_TREND · BULL_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.280 | no |
| 2026-10-01T13:20 | BO | SELL | 01010 / 01302 | 4174.32 | 4176.57 | candidate_anchor+min_risk | 2.25 | 4170.495 | 4167.55 (3) | 0.24 | 4.513 | NEW_YORK | NEUTRAL/RANGE · BULL_TREND · TRANSITION · TRANSITION | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | 1.656 | no |
| 2026-10-01T13:55 | BO | SELL | 01000 / 02301 | 4163.82 | 4166.96 | candidate_anchor | 3.14 | 4158.482 | 4154.41 (3) | 0.24 | 4.661 | NEW_YORK | NEUTRAL/TRANSITION · BEAR_TREND · RANGE · TRANSITION | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | 1.668 | no |
| 2026-10-01T15:30 | MR | BUY | 01003 / 01000 | 4166.5 | 4159.86 | candidate_anchor | 6.64 | 4177.788 | 4179.26 (1.92) | 0.24 | 7.093 | NEW_YORK | NEUTRAL/RANGE · BEAR_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.551 | YES |
| 2026-10-01T17:45 | BO | BUY | 02301 / 01000 | 4176.82 | 4172.85 | candidate_anchor | 3.97 | 4183.569 | 4185.93 (2.3) | 0.24 | 6.175 | NEW_YORK | NEUTRAL/TRANSITION · TRANSITION · RANGE · COMPRESSION | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.586 | no |

### CONTROL (production engine, same inputs) (5 counted signals; 9 valid setups; 4 blocked by execution safety; 6 duplicates not counted)
| Bar close (UTC) | Model | Side | Stages BUY / SELL | Entry | Structural SL | SL source | Risk (USD @0.01) | 1.70R TP | Engine TP2 (RR) | Spread | ATR14 | Session | Context (15m / 5m / 30m / 1H) | Safety | Decision | Outcome 1.70R (R) | Wrong-dir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | 00300 / 01010 | 4182.69 | 4178.05 | candidate_anchor | 4.64 | 4190.578 | 4192.38 (2.09) | 0.24 | 4.109 | LONDON | BULLISH/BULL_TREND · BULL_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.280 | no |
| 2026-10-01T13:20 | BO | SELL | 01010 / 03303 | 4174.32 | 4176.57 | candidate_anchor+min_risk | 2.25 | 4170.495 | 4167.55 (3) | 0.24 | 4.513 | NEW_YORK | NEUTRAL/RANGE · BULL_TREND · TRANSITION · TRANSITION | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | 1.656 | no |
| 2026-10-01T14:55 | MR | BUY | 01003 / 01000 | 4164.07 | 4160.71 | candidate_anchor+min_risk | 3.36 | 4169.782 | 4174.14 (3) | 0.24 | 6.712 | NEW_YORK | NEUTRAL/RANGE · BEAR_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.601 | no |
| 2026-10-01T16:20 | SR | SELL | 02200 / 01033 | 4168.29 | 4173.95 | candidate_anchor | 5.66 | 4158.668 | 4151.28 (3) | 0.24 | 7.437 | NEW_YORK | NEUTRAL/RANGE · RANGE · RANGE · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.560 | no |
| 2026-10-01T17:45 | BO | BUY | 02300 / 01001 | 4176.82 | 4172.85 | candidate_anchor | 3.97 | 4183.569 | 4185.93 (2.3) | 0.24 | 6.175 | NEW_YORK | NEUTRAL/TRANSITION · TRANSITION · RANGE · COMPRESSION | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.586 | no |

## Primary audit — V8 (every genuine setup)
| Bar close (UTC) | Model | Side | 1 pattern | 2 model | 3 setup | 4 trigger | 5 direction | 6 location | 7 structural SL | 8 RR 1.70 | 9 block correct | Class | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | yes | yes | yes | yes | yes | yes | yes | yes | yes | VALID_LOSING_TRADE | all rules followed; the market went the other way |
| 2026-10-01T13:20 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | yes | DETECTED_CORRECTLY | all rules followed; hypothetical outcome positive |
| 2026-10-01T13:55 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | yes | DETECTED_CORRECTLY | all rules followed; hypothetical outcome positive |
| 2026-10-01T15:30 | MR | BUY | yes | yes | yes | yes | yes | yes | yes | yes | yes | VALID_LOSING_TRADE | all rules followed; the market went the other way |
| 2026-10-01T17:45 | BO | BUY | yes | yes | yes | yes | yes | yes | yes | yes | yes | VALID_LOSING_TRADE | all rules followed; the market went the other way |

## Primary audit — CONTROL (every genuine setup)
| Bar close (UTC) | Model | Side | 1 pattern | 2 model | 3 setup | 4 trigger | 5 direction | 6 location | 7 structural SL | 8 RR 1.70 | 9 block correct | Class | Reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D2 regression |
| 2026-10-01T13:20 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | yes | DETECTED_CORRECTLY | all rules followed; hypothetical outcome positive |
| 2026-10-01T14:55 | MR | BUY | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D1 regression, D2 regression |
| 2026-10-01T16:20 | SR | SELL | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D2 regression |
| 2026-10-01T17:45 | BO | BUY | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D2 regression |
| 2026-10-02T10:15 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D1 regression, D2 regression |
| 2026-10-02T10:20 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D1 regression, D2 regression |
| 2026-10-02T10:25 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D1 regression, D2 regression |
| 2026-10-02T10:30 | BO | SELL | yes | yes | yes | yes | yes | yes | yes | yes | — | IMPLEMENTATION_ERROR | D1 regression, D2 regression |

Question 10 (was a valid setup missed?) is answered per move event in V8_MISSED_SETUP_FORWARD.

Stage digits per model MC PB BO SR MR: 0 none, 1 pattern, 2 setup, 3 trigger (bias-agnostic). Every row: SHADOW_SIGNAL = TRUE, EXECUTED = FALSE.
