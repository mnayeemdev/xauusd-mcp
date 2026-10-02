# V12_REPLAY_RESULTS

V12 ENTRY EDGE ISOLATION + REALIZED RISK HARDENING · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entry engine frozen (V8 corrected core, 5 models) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · pre-registration c81714d1e5341fd7… (Amendment 1) · freeze 2026-10-02T13:00:04.187Z

| Check | Result |
|---|---|
| Entries reproduce V8 (valid entries and one-position trades) | DEV 4858 / 1133, HOLD 6553 / 1510 (V8: 4858 / 1133, 6553 / 1510) |
| Entry-only economics reproduce V8 / V11 | DEV -0.077 R, HOLD -0.022 R (V8: −0.077 / −0.022) |
| H0 risk replay reproduces V11 exactly (all risk %, accounts, costs, both splits) | PASS |
| Deterministic re-run (DEV + FULL re-run after the fail-closed fix D2) | byte-identical splits, decisions, integrity, replay and candidates |
| Probe and stage computations use completed bars only (no-lookahead unit tests) | PASS |
