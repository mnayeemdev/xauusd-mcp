# V16_CLOCK_INTEGRITY

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Clocks (documented, never mixed)
| Clock | Used for | Never used for | Resolution |
|---|---|---|---|
| broker (MT5 time_msc, bar times) | tick / bar identity, ordering, broker-internal consistency | durations against the PC | 1 ms (ticks), 1 s (bars) |
| monotonic (performance.now, per process) | signal age, quote age, probe schedule | identity | sub-ms |
| PC wall clock (UTC) | readable timestamps; the clock monitor | any decision | 1 ms |

## Integrity on this machine
| Check | Result |
|---|---|
| Windows time service (read-only w32tm) | NOT_SYNCHRONIZED (Leap Indicator 3, Local CMOS Clock) |
| PC vs NTP (V15, read-only stripchart) | NTP − PC = 1230 ms |
| broker vs NTP (V15) | ≈ -144 ms |
| live monitor: PC first receipt − broker tick time | n 4; min -1089; p50 -915; p90 -915; max -915 |
| decision inputs that use the PC wall clock | 0 |
| application clock offset in the decision path | none (test: no +1000 / +1230 / +2000 ms, no offset parameter) |

## CLOCK_INTEGRITY = FAIL (machine condition), not a V16 decision input
- **Condition:** the PC wall clock is still unsynchronized, about 1.23 s behind NTP. That is a fact about this machine, and it stays visible: the monitor is recorded on every quote.
- **Effect:** V16 decisions do not depend on it. Every duration is monotonic and every identity is on the broker clock, so the V15 "every live quote age negative" blocker is gone without any offset.
- **Monitor only:** the wall-clock relation is never turned into an age.
- **Owner action, still recommended** (enables the cross-clock transport-delay measurement): enable Windows time synchronisation in an elevated shell:
  - `w32tm /config /manualpeerlist:"time.windows.com,0x9" /syncfromflags:manual /update`
  - `net stop w32time && net start w32time`
  - `w32tm /resync`
