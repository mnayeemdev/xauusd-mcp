# V13_HINDSIGHT_AUDIT

V13 CORE EDGE RECONSTRUCTION · LEAN STRATEGY AUDIT · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · engine frozen (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · pre-registration 22f3109e020335b1… · freeze 2026-10-02T13:20:50.942Z

| Quantity | Known before entry? | Use |
|---|---|---|
| Strategy (model), side | YES | unit of analysis, DIRECTION grouping |
| Anchor distance class (V8 VALID / MARGINAL) | YES | LOCATION grouping |
| 5m structure state (st5) | YES | STRUCTURE grouping |
| Last 5m structure event (BOS / CHOCH) | YES | PATTERN_EVENT grouping |
| Engine SL source | YES | SL_SOURCE grouping |
| 15m bias | YES | BIAS grouping |
| Stage strings and bias-aware triggers | YES | stage tests |
| Outcome R, MFE, MAE, 1.70 R reach, duration | NO: HINDSIGHT_ONLY | metrics only, never a condition |
| Probe outcome after a stage bar | NO: HINDSIGHT_ONLY | measurement only |

**HINDSIGHT_CHECK = PASS.**
- Every grouping is computed from fields recorded at the signal close; a unit test shows that adding outcome fields never changes a level.
- No future candle, MFE, MAE, outcome, structure, reversal or price movement enters any condition.
