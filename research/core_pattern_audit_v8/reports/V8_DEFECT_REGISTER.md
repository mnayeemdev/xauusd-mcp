# V8_DEFECT_REGISTER

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

## D1 STRUCTURE_EVENT_CHRONOLOGY — PATTERN (`src/engine/structure.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | lastEvent / state = break of the highest-INDEX broken pivot; BOS/CHoCH labelled in pivot order |
| EXPECTED_BEHAVIOUR | the most recent confirmed break in time sets the direction and the last event; labels follow the running direction |
| EVIDENCE | fixtures (direction flip; stale CHoCH); mirror residual; 45–50 % of bars carry a changed structure primitive |
| ROOT_CAUSE | pivots processed in index order (outer loop) instead of collecting first breaks and walking them by break bar |
| MINIMAL_FIX | collect each pivot's first close-break, sort by (break bar, pivot index), walk (`patches/D1_STRUCTURE_EVENT_CHRONOLOGY.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — structure fixtures (state, last event, labels, mirror) |
| Decisions changed (DEV / HOLD) | 4130 / 4444 (unexplained 0) |

## D2 SWEEP_RECENCY — TRIGGER (`src/engine/structure.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | lastSweep = last sweep of the newest pivot that was ever swept (can be many bars old while a fresh sweep exists) |
| EXPECTED_BEHAVIOUR | the most recent sweep in time (ties → the more recent pivot) |
| EVIDENCE | sweep fixture: age 9 vs a current-bar sweep; MR needs age ≤ 3 |
| ROOT_CAUSE | reverse pivot loop breaks at the first pivot with any sweep |
| MINIMAL_FIX | scan all pivots, keep the sweep with the largest bar (`patches/D2_SWEEP_RECENCY.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — sweep fixture |
| Decisions changed (DEV / HOLD) | 1210 / 1448 (unexplained 0) |

## D3 PULLBACK_DEPTH_MEASURED_AT_CURRENT_CLOSE — SETUP (`src/engine/intraday/models5m.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | PB resolution required the CURRENT close ≥ 1 ATR from the 20-bar extreme |
| EXPECTED_BEHAVIOUR | pullback depth (extreme → deepest point after it) ≥ 1 ATR, then 2 reclaim closes |
| EVIDENCE | fixture: 2.64-ATR pullback with a decisive reclaim → no PB |
| ROOT_CAUSE | reuse of the 15m correction-state primitive (remaining distance) as a depth test |
| MINIMAL_FIX | depth from the extreme to the lowest low (BUY) after it; resolution/freshness unchanged (`patches/D3_PULLBACK_DEPTH_MEASURED_AT_CURRENT_CLOSE.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — PB fixtures |
| Decisions changed (DEV / HOLD) | 577 / 639 (unexplained 0) |

## D4 MEAN_REVERSION_LOCATION — LOCATION (`src/engine/intraday/models5m.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | MR SELL/BUY on any fresh sweep in a 15m RANGE, even when its own midpoint target lies behind the entry |
| EXPECTED_BEHAVIOUR | mean-reversion entry on the far side of its midpoint objective |
| EVIDENCE | fixture: SELL at 103 with target 105 |
| ROOT_CAUSE | location never checked although the reason text claims "at a 15m range boundary" |
| MINIMAL_FIX | return no candidate when the midpoint is missing or on the wrong side (`patches/D4_MEAN_REVERSION_LOCATION.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — MR fixtures |
| Decisions changed (DEV / HOLD) | 260 / 292 (unexplained 0) |

## D5 RR_GATE_ON_ROUNDED_VALUE — RR (`src/engine/intraday/risk5m.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | RR gate compared the 2-decimal-rounded RR with 1.70 |
| EXPECTED_BEHAVIOUR | RR ≥ 1.70 exactly (1e-9 tolerance) |
| EVIDENCE | (1.695).toFixed(2) === "1.70"; fixture 1.696 R accepted |
| ROOT_CAUSE | rounding before the comparison |
| MINIMAL_FIX | compare the unrounded value; keep the rounded value for reporting (`patches/D5_RR_GATE_ON_ROUNDED_VALUE.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — RR fixtures |
| Decisions changed (DEV / HOLD) | 17 / 7 (unexplained 0) |

## D6 STALE_ENTRY_TIMEFRAME_NOT_FAIL_CLOSED — DATA (`src/core/xauusd_calculate.js`)
| Field | |
|---|---|
| CURRENT_BEHAVIOUR | a 15m/30m snapshot older than 4 bar durations is used for the decision |
| EXPECTED_BEHAVIOUR | fail closed exactly like invalid data, with the reason |
| EVIDENCE | live-path test: 4 h-old 15m snapshot → decision taken |
| ROOT_CAUSE | `stale` computed by validateAndSplit but never enforced |
| MINIMAL_FIX | add stale to the existing entry-timeframe fail-closed condition and record the reason (`patches/D6_STALE_ENTRY_TIMEFRAME_NOT_FAIL_CLOSED.patch`) |
| REGRESSION_TEST | tests/core_pattern_audit_v8.test.js — live-path stale test |
| Decisions changed (DEV / HOLD) | 424 / 509 (unexplained 0) |

## Reported, not corrected
C1 TP2 objective vs owner's fixed 1.70 R; C6 range high/low comment; quality qTrigger/qStructure direction-agnostic (an opposite BOS earns trigger credit — scoring template without a directional specification); BO breakout not invalidated by an intermediate close back through the level; sweeps of already-broken pivots counted; 1H context data failure disables only that tier (documented); engine docs stale about the 1H quality-bar rule (C7).
