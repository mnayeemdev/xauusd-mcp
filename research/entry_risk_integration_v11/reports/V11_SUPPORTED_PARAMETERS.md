# V11_SUPPORTED_PARAMETERS

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

| Parameter / mechanism | Status | Evidence |
|---|---|---|
| Entry validity upstream and immutable (deep-frozen, hashed record) | SUPPORTED | 0 entry-hash mismatches; 400-scenario test; no assignment to entry fields |
| VALID_ENTRY + one outcome record per entry | SUPPORTED | identity holds in all cells; per-entry matrix files |
| Structural SL preserved; RR 1.70 | SUPPORTED | geometry 100 %; target = entry ± 1.70 R; broker SL = 1.5 R + spread outside |
| Sizing from equity × r and the structural SL; round down; minimum-lot reject | SUPPORTED (mechanics) | 0 above approved; tick-path consistency |
| Broker spec from the platform; tick value same-currency derivation | SUPPORTED | fail closed when missing or inconsistent |
| Margin cap 50 % + margin-level buffer (60 + 40) | SUPPORTED as a backstop | never binds in the clean replay; injected fault closes |
| MAX_SIMULTANEOUS_TRADES = 1 | SUPPORTED | exposure-blocked entries recorded |
| Fail-safes (13 injected types + unit tests) | SUPPORTED | 0 accepted of 172 (corrected harness) |
| Restart / duplicate / broker-rejection handling | SUPPORTED | replay results |
| Production safety limits (quote 90 s, signal 600 s, spread 0.60 USD) | SUPPORTED (read from production) | unit tests at the boundary |
| RISK_PERCENTAGE | **UNRESOLVED** | V10: no percentage met the capital-safety criteria; none invented |
| Daily / streak / weekly controls | NOT SUPPORTED | V10 (inconsistent across splits) |
