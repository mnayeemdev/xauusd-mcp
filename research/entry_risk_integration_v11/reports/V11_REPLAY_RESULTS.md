# V11_REPLAY_RESULTS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

| Check (HOLD, PCT 0.50 %, 10,000 USD, NORMAL) | Result |
|---|---|
| Chronological replay deterministic (two runs, identical record hash) | PASS |
| Restart from serialized state at entry 3276 equals the uninterrupted run | PASS |
| Duplicate delivery: first / second / after restart | RISK_ACCEPTED / DUPLICATE_DELIVERY / DUPLICATE_DELIVERY → PASS |
| Fault-injection replay: records before the first fault identical to the clean run | PASS |
| Fault-injection replay: every valid entry still recorded once | PASS |
| Integrated replay = V10 walk (all accounts, models; DEV + HOLD) | PASS |
| Entry-only replay = V8 audit (n and expectancy, DEV + HOLD) | PASS |

The corrected and pre-registered FULL runs are byte-identical in every split, grid, matrix, replay, restart and duplicate result. Only the fault-injection section differs (CORRECTION_LOG C1).
