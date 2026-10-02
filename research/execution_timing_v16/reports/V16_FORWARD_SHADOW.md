# V16_FORWARD_SHADOW

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Update
- **The runner** (`research/v8_forward_shadow/scripts/runner.mjs`, research, measure-only):
  - every decision record carries a `v16` block: symbol, timeframe, signal_timestamp, quote_timestamp, decision_timestamp, signal_age_seconds, bid, ask, spread, entry, SL, RR, final decision and decision reason;
  - a forward-live V8 signal is re-validated at 0–6 s and 8 s, with fresh bars and the latest polled quote (`state/v8_shadow/timing_probes.jsonl`). Nothing is executed (`executed: false`, `execution_authority: NONE`).
- **The restarts** (graceful, own console):
  - PID 49200 → 57864 (17:11:49Z);
  - 57864 → 59052 (17:17:33Z), to load the final revalidation code before any probe was recorded.
  - The frozen engine manifest is unchanged (1daa2c5f…).
- **Code identity:** the code loaded by PID 59052 is hashed in `results/runner_code_hashes.json`. It is unchanged since the start: YES.
- **Untouched:** the REAL watcher (PID 10800) and the silver / DOM observer (PID 44380).

## Records
| Item | Count |
|---|---|
| decision records in the store | 330 |
| with the V16 block | 4 |
| … with every required field | 4 |
| legacy (before V16; no observation time, timing UNAVAILABLE) | 326 |
| first V16 record | 2026-10-02T17:15:09.000Z |
| V16 final decisions | V8:WAIT: 1; CONTROL:WAIT: 1; V8:WAIT_RISK_UNSAFE: 1; CONTROL:SELL: 1 |
| live V8 signals re-validated | 1 |
| probe decisions | 8 |

| Bar close | Side | Decision at observation | Reason | Signal age (s) | Quote age (ms) |
|---|---|---|---|---|---|
| 2026-10-02T17:20:00.000Z | SELL | WAIT_RISK_UNSAFE | RISK_PERCENTAGE_UNRESOLVED | 0.003 | 648.812 |
- **No fabricated timing:** legacy records are not back-filled.
- **No sample gate:** there is no sample gate, no 300 concept and no trade target. Zero is valid.
