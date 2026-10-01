# V8_CANDLE_TIMING_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Moment | Live | Replay | Verified |
|---|---|---|---|
| Signal candle close | 5m bar close (open time + 300 s) | same | — |
| Decision timestamp | watcher cycle after the close; the last returned bar is the forming bar and is stripped | close + 80 s (FETCH_LAG) | live orchestrator driven offline = replay on 2245 bars (266 signals), 0 mismatches |
| Higher-timeframe availability | last returned 15m/30m/1H bar = forming, stripped | bars cut at floor(T / tf) × tf | same parity test |
| Forming bar | never used | never used | garbage forming bars (high × 1.5, low × 0.5) on every timeframe: 0 decision changes |
| Pivot confirmation | 5 right bars | same | fixture: 4 right bars → not a pivot; 5 → pivot |
| Entry timestamp | the executor fills at market after the decision (drift guard 2.00 USD, re-checked RR from the fill) | entry = signal close; DRIFT variant fills at the next open | DRIFT result in V8_COST_STRESS |
| Stale data | 5m: watcher freshness check; 15m/30m: `stale` computed but NOT enforced (**D6**) | D6 emulated with the production rule | live-path test: 4 h-old 15m snapshot → production decides; corrected → DATA_UNAVAILABLE |

**NO_LOOKAHEAD = PASS.** **TIMING_ERRORS = 0** (D6 is classified as a DATA error: stale data is used, but never future data).
