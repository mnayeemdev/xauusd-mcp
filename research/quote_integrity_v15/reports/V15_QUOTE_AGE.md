# V15_QUOTE_AGE

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Definition
- **Formula:** quote_age_ms = decision_timestamp_ms − (quote_timestamp_ms − server_utc_offset_ms).
- **Offset:** live calibration gives server_utc_offset_ms = 0, so the broker clock is UTC. This is the median of (time_msc − received), rounded to 15 minutes, which can never absorb a real quote age below 7.5 minutes.

## Live measurement (687 observations, 180 s, 250 ms polling)
| Clock basis | Quote age (ms) | Negative ages | Validation |
|---|---|---|---|
| raw PC clock (as the system would run today) | n 687; min -1086; p10 -1065; p50 -934; p90 -500; p99 -74; max 737 | 682 | INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT: 682; VALID: 5 |
| documented NTP conversion SCENARIO (PC + measured NTP offset; research only, not used for decisions) | n 687; min 144; p10 165; p50 296; p90 730; p99 1156; max 1967 | 0 | VALID: 579; INVALID_QUOTE:DECISION_BEFORE_RECEIPT: 108 |

## Technical freshness scenarios (measurement settings, NOT approved parameters; NTP-converted ages)
| Scenario | ≤ 100 ms | ≤ 250 ms | ≤ 500 ms | ≤ 1000 ms | ≤ 2000 ms | ≤ 5000 ms |
|---|---|---|---|---|---|---|
| share of observations | 0.0 % | 40.5 % | 77.3 % | 96.7 % | 100.0 % | 100.0 % |

## Reading
- **The gate's limit is the existing production rule** maxQuoteAgeSec = 90 s; no threshold is approved here.
- **Quote age is measurable to the millisecond.** Ticks advance about 2.65 times per second, and IPC latency is p99 1 ms.
- **But it is only trustworthy once the PC clock is synchronized.** With the raw clock, the age is negative on 682 / 687 observations, which correctly fail closed.
- **Cross-check.** With the documented NTP conversion, the smallest age is 144 ms, consistent with the terminal's measured round-trip ping of 253 ms (one-way ≈ 127 ms).
- **Second finding: 1 ms cross-process resolution.** The receive time is taken by the Python reader (time.time) and the decision time by Node (Date.now): two processes reading the same PC clock at 1 ms resolution. Decision − receive (ms) over the live capture: 0: 547; 1: 32; -1: 108. On 108 / 687 observations the decision reads 1 ms *before* receipt, so even with a synchronized clock these fail closed as DECISION_BEFORE_RECEIPT (the 108 rows in the NTP scenario). This is safe (it only adds WAITs) and is reported, not repaired: no tolerance is introduced in V15. Taking both times in one process, or a documented 1 ms resolution tolerance, is an open design question for the owner.
- **Note on `live_capture_summary.json`:** its `technical_scenarios` shares are computed on the raw (negative) ages and are therefore not meaningful; the scenario table above uses the NTP-converted ages.
