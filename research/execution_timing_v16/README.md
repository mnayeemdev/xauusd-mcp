# V16 — EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY (research only)

RESEARCH ONLY.
- **Execution:** REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE.
- **Strategy:** the frozen V8 entry engine is unchanged, as are the structural SL and RR 1.70.
- **Risk:** CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED.
- **Targets:** there is no trade-count target and zero trades is valid.

## Rule (owner)
VALID SIGNAL + AGE ≤ 6 s + CURRENT ORIGINAL CONDITIONS STILL VALID + RISK SAFE + BROKER SAFE + SAFETY SAFE = TRADE ELIGIBLE. Otherwise WAIT / REJECT.
- **6 s is an execution-tolerance window only.** It is never a BUY/SELL command and never a gap-fill assumption.

## Outcome
See `reports/V16_FINAL_DECISION.md`.
- **Timing:** a delay of up to 6 s is tolerated only through a full revalidation:
  - the frozen engine is re-run on the latest closed bars;
  - the signal identity must be unchanged;
  - the existing execution rules are applied at the ask (BUY) or bid (SELL), with the original SL;
  - the unchanged V14 gate runs last.
- **State decides, not delay:** at every delay the decision depends on the market state, not the delay number.
- **Clocks:** durations use the monotonic clock and identity uses the broker clock; the PC wall clock is a monitor only, with no offset. The PC clock is still unsynchronized (an owner action), but it is no longer a decision input.

## Layout
| Path | Content |
|---|---|
| `V16_PREREGISTRATION.md` (+ `.sha256`) | definitions, revalidation order, decision criteria (written before any live probe) |
| `scripts/timing.mjs` | pure clock model, quote tracker, timing checks T1–T6 |
| `scripts/revalidate.mjs` | revalidation: timing → current engine → execution geometry → V14 gate |
| `scripts/probes.mjs` | live probes at 0–6 s and 8 s after a signal's observation + replay |
| `scripts/scenarios.mjs` | deterministic grid: real V8 signal snapshots × constructed execution-time states (SCENARIO, not market data) |
| `scripts/v16_study.mjs` | grid, live probes (replay / no-lookahead / invariants), clock monitor, historical limitation, execution band, decision |
| `scripts/write_reports.mjs` | the 16 reports |
| `results/` | study results, runner code hashes, read-only clock status, test outputs, live probe and V16 record evidence |

## Also changed
`research/v8_forward_shadow/scripts/runner.mjs`:
- continuous read-only quote polling;
- a `v16` block on every decision record;
- probes on forward-live V8 signals (`state/v8_shadow/timing_probes.jsonl`).

The runner was restarted: 49200 → 57864 → **59052**.

## Reproduce
```
node research/execution_timing_v16/scripts/v16_study.mjs
node research/execution_timing_v16/scripts/write_reports.mjs
node --test tests/execution_timing_v16.test.js
```
