# Pine P8 — Master Forward / Replay Test

**P8 is not an optimization phase.** The P7 research candidate C4
(`minRR: 1.7`, `corrResolveConfirmBars: 3`, `qualityThreshold: 65`
unchanged) is locked in `validation/p8_candidate_lock.json` and was
**never changed** during this phase, regardless of any outcome observed.

## 1. Baseline

Started from P7 freeze commit `d276af41fb9fbe459a94edb0ea54d02815f98bfa`
("PINE P7: freeze controlled optimization research"), clean working tree,
765/765 tests passing, indicator/strategy hashes and versions confirmed
exact before any P8 artifact was created.

## 2. Candidate lock

`validation/p8_candidate_lock.json` was written **before** any P8
outcome was observed, recording the exact C4 parameter values, the
source P7 commit, both frozen source hashes, and a deterministic
`candidate_lock_hash`. No P8 finding may change any value in that file.

## 3. Evidence mode audit

Intraday Bar Replay was re-checked (not re-litigated exhaustively) at
P8 start: `replay_start` failed on 5m, 15m, and 30m for `OANDA:XAUUSD`
with the same error already documented in the P6 continuation
("Replay failed to start... Try a higher timeframe"), consistent with
the previously-identified account/plan-tier restriction. Per the
explicit P8 instruction not to repeatedly fight a clearly-still-present
UI restriction, this was not re-tested cross-symbol again — the P6
continuation already established that proof rigorously.

**Evidence mode selected: PROSPECTIVE FORWARD BOUNDARY**, not replay.

## 4. Forward boundary

`validation/p8_forward_boundary.json` locks the boundary at
`2026-09-17T13:47:01Z` UTC, recorded with the exact last-confirmed-bar
time/index per timeframe at declaration time (5m/15m: bar closing
2026-09-17T13:45:00Z; 30m: bar closing 2026-09-17T13:30:00Z). The
eligibility rule is explicit: a signal qualifies only if its
`SIGNAL_BAR_TIME` is strictly greater than the recorded boundary bar
time for its timeframe. This file was written and this document
generated from it before any post-boundary outcome was observed, and
the boundary will not move regardless of how the forward sample
develops.

## 5. C4 application

C4 was applied via `indicator set --inputs` (the same live TradingView
Pine input mechanism used throughout P7 — no Pine source edit) to the
single existing indicator instance, and confirmed effective on all three
required timeframes by reading back the raw input array
(`in_23=3, in_51=1.7, in_52=65`). The frozen `.pine` file was never
touched; both hashes remain exact.

## 6. Historical contamination handled explicitly

Applying C4 recomputes P5 statistics across the entire already-loaded
history (the same bars used to select C4 in P7) — these are **not** P8
evidence. `validation/p8_results.json` keeps this
`p7_development_reference_NOT_forward_evidence` block explicitly
separate from the `forward_observation_window` block, which contains
only post-boundary findings.

## 7. Forward observation window

**Observability method**: each check reads both the live contract
table's current-bar `SIGNAL_ID`/`SIGNAL_BAR_TIME`/`ACTION` fields AND
the P5 recorder's lifetime `P5_TOTAL_SIGNALS` counter and
`P5_LAST_SIGNAL_TIME` pointer. These are persistent `var` accumulators
that update the instant any new signal is authorized on any bar, and are
never reset by display/history eviction — so an unchanged counter
between two checks is complete proof that zero signals occurred
anywhere in the entire elapsed interval, not just on the single bar
visible at check time. This holds only as long as the same indicator
instance (entity `TYuV4V`) keeps running without being removed/re-added,
which it has.

**Run 1** — checked from boundary declaration (`13:47:01Z`) through
`13:55:02Z` (~8 minutes): 5m 2 new confirmed bars/0 signals, 15m/30m
still in the boundary-reference bar.

**Run 2** — checked from `13:55:02Z` through `14:23:03Z` (~28 more
minutes): 5m 6 new confirmed bars (13:50→14:15), 15m 1 new confirmed bar
(14:00:00), 30m 0 new *eligible* confirmed bars yet (the 13:30-14:00 bar
closed but its bar time equals the boundary reference exactly, so it is
excluded by the strict-greater-than rule). All three timeframes'
`P5_TOTAL_SIGNALS` and `P5_LAST_SIGNAL_TIME` were confirmed unchanged
from their pre-boundary values (5m=50, 15m=60, 30m=106 — each matching
the P7 development reference exactly), proving zero new signals in
either run.

**Cumulative since boundary** (through `14:23:03Z`, ~36 minutes):

| TF | Post-boundary confirmed bars | Qualifying signals | Last action | Last WAIT reason |
|---|---|---|---|---|
| 5m | 8 | 0 | WAIT | NO_ELIGIBLE_STRATEGY |
| 15m | 1 | 0 | WAIT | NO_TRIGGER |
| 30m | 0 (first eligible bar still forming) | 0 | WAIT | NO_TRIGGER |

**Sample sufficiency**: `NO FORWARD SIGNALS YET` on all three timeframes.
This is expected — the system's documented signal sparsity is
~10-14 signals per 1000 bars, and only ~36 minutes have elapsed. Zero
signals in this window neither confirms nor refutes C4; it is simply the
honest, unpadded state of evidence at execution time.

## 8. WAIT/no-signal behavior

Every checked bar returned `WAIT` with a legitimate, pre-existing
gate reason (`NO_ELIGIBLE_STRATEGY`, `NO_TRIGGER`) — exactly the
intended behavior philosophy (`NO GOOD ENTRY → WAIT`). No signal was
created to satisfy a quota; none was expected to exist yet.

## 9. Entry/SL/TP immutability

No P8 signal exists yet, so no entry/SL/TP freeze has been exercised in
this run. The ledger schema and its accompanying tests
(`tests/pine_p8_forward_test_integrity.test.js`) enforce immutability of
`ENTRY`/`SL`/`TP1`/`TP2`/`side`/`model`/`regime`/`signal_id`/
`signal_bar_time` for whenever a first qualifying signal does appear.

## 10. P7 development vs P8 forward

Kept in permanently separate JSON sections (`p7_development_reference_NOT_forward_evidence`
vs `forward_observation_window` in `validation/p8_results.json`) and
never pooled into one figure, per the explicit P8 instruction.

## 11. Chronology / non-repaint

No frozen file was touched, so the existing chronology/non-repaint audit
stands unchanged: `lookahead_off`, confirmed-bar authorization,
next-bar-only outcome resolution, conservative same-bar ambiguity,
immutable signal snapshot — all still present in the unmodified source.

## 12. MCP / contract

Research profile 13 tools, Development profile 18 tools — unchanged.
`CONTRACT_VERSION` remains 1. Exact study identity confirmed
(`matching_reason: exact_name_match`) on every checked timeframe; one
unambiguous contract table; no fabricated fields.

## 13. Real TradingView

`OANDA:XAUUSD`, C4 applied and confirmed effective on 5m/15m/30m, no
broker orders, no execution. Final state restored to 15m with exactly
one healthy indicator instance (entity `TYuV4V`) running C4.

## 14. Limitations

- **NO GENUINE OOS BASELINE EXISTS** (inherited from P6) — still true;
  P8's forward evidence, once it accumulates, will be the first genuine
  prospective evidence in this project, but it does not retroactively
  validate P6 or P7.
- Intraday Bar Replay remains unavailable in this environment/account —
  P8 cannot accelerate evidence collection; it can only observe real
  wall-clock time going forward.
- Zero forward signals exist at the time of this report. This is a
  valid, honest P8 outcome (`FORWARD OBSERVATION OPEN`), not a defect.

## 15. Next required action

Continue periodically reading the live contract table's
`SIGNAL_ID`/`SIGNAL_BAR_TIME`/`ACTION` fields on 5m/15m/30m over
subsequent wall-clock time. Any signal whose `SIGNAL_BAR_TIME` exceeds
the locked boundary must be appended to `validation/p8_forward_ledger.json`
without altering its frozen fields, and its eventual PASS/FAIL/OPEN
outcome tracked per the unchanged P5 outcome semantics. The boundary
itself must never move.
