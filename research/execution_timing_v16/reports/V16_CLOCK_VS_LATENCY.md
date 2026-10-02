# V16_CLOCK_VS_LATENCY

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Clock drift ≠ market / processing delay
| Quantity | What it is | Clock | Decision input? | Live value |
|---|---|---|---|---|
| signal age | time since the engine produced the signal | monotonic | yes (≤ 6 s) | n 1; min 5999.511; p50 5999.511; p90 5999.511; max 5999.511 at the 6 s probe |
| quote age | time since the quote could first have arrived | monotonic | yes (≤ 6 s) | n 4; min 648.812; p50 767.348; p90 789.677; max 789.677 |
| decision − quote receipt | how fresh the latest polled quote is at the instant | monotonic | no (evidence that the latest quote is used) | n 1; min 178.959; p50 178.959; p90 178.959; max 178.959 |
| observation latency | bar close → engine evaluation; an existing runner design (settle 8 s + ≤ 5 s polling) | broker bar time vs PC wall (existing runner field latency_sec) | no (provenance only, existing 120 s rule) | about 9–13 s |
| PC clock drift | the PC wall clock is wrong | PC wall vs NTP | no (monitor) | NTP − PC = 1230 ms |
| wall − broker monitor | drift + transport, not separable without a synchronized clock | PC wall vs broker | no (monitor) | n 4; min -1089; p50 -915; p90 -915; max -915 |

- **Only an impossible timestamp relation is a CLOCK_OR_DATA_ERROR:** a receipt after the decision, a signal after the decision, broker time going backwards, or a tick outside the broker's own bar range.
- **Normal delay is not an error.** A quote received 1–6 s after another event is a normal delay.
