# V16_REPLAY

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Same input = same decision
- **Grid:** every one of the 800 cells is a pure function of its inputs. The test suite checks that two runs give identical JSON.
- **Live probes:** every probe record stores its complete inputs (original signal, current engine snapshot, quote, timestamps, bars, news, shock, platform spec). The study replays all of them with the same code:
  - 8 probe records;
  - **0 mismatches**;
  - code unchanged since the runner started: YES.
- **Restart:** the revalidation is stateless per probe. A restarted tracker cannot make an unwitnessed tick look fresh (its age is UNAVAILABLE → WAIT).
- **Forward-shadow parity:** the existing engine replay-parity check of the runner is unchanged.
