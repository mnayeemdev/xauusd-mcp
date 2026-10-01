# V8_FORWARD_SIGNAL_LOG

V8 FORWARD SHADOW VALIDATION · MEASURE ONLY · EXECUTION_AUTHORITY = NONE · every trade figure is HYPOTHETICAL_NOT_EXECUTED · generated 2026-10-01T12:47:29.407Z

**ACCUMULATED EVIDENCE** for the observation period 2026-10-01T11:58:45.000Z → 2026-10-01T12:45:00.000Z (0 d 0 h 46 min). There is no sample-size gate and no trade target: the market decides how many setups occur, and the owner decides when the evidence is sufficient.

Engines on identical live inputs (Exness XAUUSDm via the read-only MT5 reader): **V8** = frozen corrected core (research/core_pattern_audit_v8/engines/ALL, hash-verified at start); **CONTROL** = production src/engine.

### V8 corrected core (1 counted signals; 1 valid setups; 0 blocked by execution safety; 2 duplicates not counted)
| Bar close (UTC) | Model | Side | Stages BUY / SELL | Entry | Structural SL | SL source | Risk (USD @0.01) | 1.70R TP | Engine TP2 (RR) | Spread | ATR14 | Session | Context (15m / 5m / 30m / 1H) | Safety | Decision | Outcome 1.70R (R) | Wrong-dir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | 00300 / 01011 | 4182.69 | 4178.05 | candidate_anchor | 4.64 | 4190.578 | 4192.38 (2.09) | 0.24 | 4.109 | LONDON | BULLISH/BULL_TREND · BULL_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.280 | no |

### CONTROL (production engine, same inputs) (1 counted signals; 1 valid setups; 0 blocked by execution safety; 2 duplicates not counted)
| Bar close (UTC) | Model | Side | Stages BUY / SELL | Entry | Structural SL | SL source | Risk (USD @0.01) | 1.70R TP | Engine TP2 (RR) | Spread | ATR14 | Session | Context (15m / 5m / 30m / 1H) | Safety | Decision | Outcome 1.70R (R) | Wrong-dir |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-01T12:00 | BO | BUY | 00300 / 01010 | 4182.69 | 4178.05 | candidate_anchor | 4.64 | 4190.578 | 4192.38 (2.09) | 0.24 | 4.109 | LONDON | BULLISH/BULL_TREND · BULL_TREND · TRANSITION · RANGE | OK news NORMAL | SHADOW_SIGNAL=TRUE EXECUTED=FALSE | -1.280 | no |

Stage digits per model MC PB BO SR MR: 0 none, 1 pattern, 2 setup, 3 trigger (bias-agnostic). Every row: SHADOW_SIGNAL = TRUE, EXECUTED = FALSE.
