# V11_ENTRY_CORRECTNESS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

Entry correctness is a property of the frozen V8 corrected engine. V11 does not change it; it re-verifies the geometry of every entry and carries the V8 audit and forward evidence forward.

## Rule execution (V8 audit, independent re-implementation of every stage)
| Measure | DEV | HOLD |
|---|---|---|
| Valid setups (engine signals) | 4858 | 6553 |
| Pattern / setup / trigger stage checks | 465,930 | 527,880 |
| Stage mismatches (incorrect setups) | 0 | 0 |
| Implementation-caused missed valid patterns: CONTROL → corrected | 55 → 0 | 84 → 0 |
| Unexplained decision changes vs CONTROL | 0 | 0 |
| Entry timing from origin (median / p90 bars) | 3 / 8 | 3 / 8 |
| Outcome "wrong direction" rate (price moved against the signal) | 31.4 % | 29.9 % |
| SL risk in ATR (mean / median) | 1.483 / 1.36 | 1.434 / 1.31 |
| Engine TP2 below 1.70 R | 0.0 % | 0.0 % |
| Location: entries > 2.5 ATR from anchor (from V8_ENTRY_LOCATION_AUDIT) | 0 | 0 |

"Wrong direction" here is an OUTCOME label: the price moved against the trade. It is not a rule error.

In the V8 CONTROL forensics, 80.9 % (DEV) and 82.9 % (HOLD) of such trades were valid losing trades. The remaining implementation-caused classes are the D1–D6 defects that the corrected core removes.

## Missed setups (V8 event forensics, corrected core)
Reference events are independent large-move origins. Classes explain why the engine did not capture them. These are rule outcomes, not implementation errors; implementation-caused misses are 0 after the corrections.
| Class | DEV | HOLD |
|---|---|---|
| NO_SETUP | 246 | 224 |
| WRONG_SIDE_SIGNAL | 243 | 305 |
| MODEL_BLOCKED:BIAS | 209 | 175 |
| NO_TRIGGER | 145 | 164 |
| LATE | 163 | 209 |
| POSITION_OCCUPIED | 266 | 319 |
| CAPTURED | 224 | 348 |
| MODEL_BLOCKED:QUALITY | 10 | 14 |
| RR_BLOCKED | 48 | 56 |
| RISK_BLOCKED | 60 | 0 |
| LOCATION_BLOCKED | 15 | 12 |
| MODEL_BLOCKED:CONTEXT_VETO | 11 | 16 |

"RISK_BLOCKED" in this table is the ENGINE's own geometry gate (risk5m: stop / objective validity). It is part of entry validity, not the V11 capital-risk layer.

## V11 geometry re-verification (every entry, never repaired)
- **Rules checked:**
  - side = candidate side;
  - SL on the protective side;
  - R > 0;
  - R ≥ 0.5 ATR;
  - |entry − anchor| ≤ 2.5 ATR;
  - engine RR ≥ 1.70 and consistent with TP2;
  - TP on the correct side.
- **Results:**
| Split | Entries | Geometry OK | Defects | BUY / SELL | Model mix |
|---|---|---|---|---|---|
| DEV | 4858 | 4858 | none | 2775 / 2083 | BO 3353, PB 649, MR 315, MC 413, SR 128 |
| HOLD | 6553 | 6553 | none | 3000 / 3553 | BO 4557, SR 228, PB 894, MC 467, MR 407 |

## Forward shadow evidence (live, read-only, 2026-10-01T11:58:45.000Z → 2026-10-02T10:30:00.000Z, 22.52 h)
| Measure | V8 corrected (frozen) | CONTROL (production, same inputs) |
|---|---|---|
| Candidates / valid setups / signals | 30 / 5 / 5 | 33 / 9 / 5 |
| Missed valid setups / incorrect blocks / late | 0 / 0 / 0 | 0 / 0 / 0 |
| Invalid setups accepted | 0 | 8 |
| D1–D6 specification violations | 0 | 101 |
| Implementation errors | 0 | 8 |
| Valid losing trades | 3 | 0 |

The forward sample is 5 signals, far too small for any economic statement. The full snapshot is in `forward_evidence/`, rendered read-only from the running shadow store; the runner was not touched.

## Entry economics (risk-free, one position at a time, RR 1.70, NORMAL cost)
| Split | n | Expectancy R | PF | Win rate | Avg win / loss R | Max DD R | Worst losing streak |
|---|---|---|---|---|---|---|---|
| DEV | 1133 | -0.077 | 0.90 | 44.2 % | 1.62 / -1.42 | 120.78 | 10 |
| HOLD | 1510 | -0.022 | 0.97 | 45.0 % | 1.65 / -1.39 | 64.89 | 16 |

**Conclusion.** The entry engine executes its rules correctly, but the valid entries have negative expectancy. A losing valid trade is acceptable; it is not an implementation error.
