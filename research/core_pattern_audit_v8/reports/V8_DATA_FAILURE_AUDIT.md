# V8_DATA_FAILURE_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Failure | Production behaviour | Exact reason recorded | Verdict |
|---|---|---|---|
| 5m unavailable / too few bars / non-monotonic / invalid OHLC | DATA_UNAVAILABLE, WAIT | "5m: …" in `errors` | fail-closed (tested) |
| 15m unavailable or invalid | DATA_UNAVAILABLE, WAIT | "15m: …" | fail-closed (tested) |
| 30m unavailable or invalid | DATA_UNAVAILABLE, WAIT | "30m: …" | fail-closed |
| 1H and higher unavailable | that context tier = DATA_UNAVAILABLE; decision continues; the 1H veto cannot fire | context status | documented design ("context tiers never force WAIT"); reported |
| 15m / 30m snapshot STALE (last confirmed bar older than 4 bar durations) | decision continues on the stale snapshot | `stale: true` only in the per-timeframe summary | **D6 defect** → corrected copy: DATA_UNAVAILABLE with "15m: stale data (… s old)" |
| replay bars after a data gap | evaluated (as live would) | `gap` flag | D6 emulation turns post-gap decisions on stale 15m/30m into DATA_UNAVAILABLE_STALE: DEV 424 / HOLD 509 decisions, signals 4098 → 4078 (DEV), 5519 → 5495 (HOLD) |

DATA_UNAVAILABLE never becomes a pattern WAIT: it carries its own status and errors (missed-move forensics count it separately as DATA_UNAVAILABLE). **DATA_ERRORS = 1 (D6).**
