# V15_CLOCK_INTEGRITY

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Clocks and conversions (documented, never mixed silently)
| Clock | Used for | Resolution / precision | Time zone |
|---|---|---|---|
| broker server (MT5 time_msc) | quote_timestamp_ms | 1 ms | UTC (live calibration offset 0 ms) |
| PC clock (Date.now / Python time.time) | decision and receive timestamps | 1 ms (Windows timer granularity ≈ 1–16 ms; w32tm precision 119 ns per tick) | UTC epoch |
| candle time (bar open, seconds) | NEVER used as a quote time | 1 s | server clock |

## Integrity checks
| Check | Result |
|---|---|
| Windows time service | NOT_SYNCHRONIZED (Leap Indicator 3, Source: Local CMOS Clock, never synced) |
| PC vs NTP (time.windows.com, read-only stripchart) | NTP − PC = 1230 ms (samples: 1230, 1226, 1234, 1230, 1229, 1291, 1228) |
| Broker vs PC (from live ticks) | broker ahead of PC by ≈ 1086 ms |
| Broker vs NTP | ≈ -144 ms |
| Negative quote ages (raw PC clock) | 682 / 687 → CLOCK_OR_DATA_ERROR → WAIT_STALE_DATA |
| Out-of-order ticks | 0 |
| Duplicate ticks | 2 |
| Future timestamps (quote after receipt) | 682 (all explained by the PC clock lag) |
| time (s) consistent with time_msc | true |

## CLOCK_INTEGRITY = FAIL (on this machine)
- **Cause:** this PC's Windows time service is NOT_SYNCHRONIZED (Leap Indicator 3, Source: Local CMOS Clock, never synced); the PC lags NTP (time.windows.com) by ≈ 1230 ms, while the broker clock agrees with NTP within ≈ 144 ms.
- **Behaviour:** the system does exactly what the specification requires. It refuses to compute a trustworthy quote age: negative ages are CLOCK_OR_DATA_ERROR and fail closed, so no quote is assumed fresh.
- **Required owner action** (not done in V15, because it changes the machine clock under the running REAL watcher):
  - enable Windows time synchronisation, for example in an elevated shell:
    - `w32tm /config /manualpeerlist:"time.windows.com,0x9" /syncfromflags:manual /update`
    - `net stop w32time && net start w32time`
    - `w32tm /resync`
  - verify with `w32tm /query /status` (Leap Indicator 0, a real source);
  - re-run `node research/quote_integrity_v15/scripts/live_capture.mjs` and the study.
