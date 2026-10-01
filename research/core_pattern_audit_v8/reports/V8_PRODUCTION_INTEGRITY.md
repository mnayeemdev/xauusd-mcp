# V8_PRODUCTION_INTEGRITY

| Field | Value | Evidence |
|---|---|---|
| PRODUCTION_CHANGED | NO | `git status` shows no change under `src/`; corrections exist only as research copies (`research/core_pattern_audit_v8/engines/`, regenerable) and unified diffs (`patches/`); `git apply --check` was run in check-only mode |
| Strategy fingerprint | 356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed, ok true, unchanged | `npm run xauusd:fingerprint` (results/fingerprint.txt) |
| REAL_TRADE_PLACED | NO | V8 has no order path; the REAL trade log's only OPENED events are from 2026-09-25 (before V8); on 2026-10-01 the watcher logged only SKIPPED (MARGIN_SAFETY_VETO, volatility-shock block) and protection events |
| DEMO_TRADE_PLACED | NO | no DEMO process was started |
| REAL_POSITION_MODIFIED | NO | no bridge / executor import in any V8 script (test "no execution path") |
| DEMO_POSITION_MODIFIED | NO | same |
| REAL watcher | PID 10800, running since 2026-09-30, untouched | process start time unchanged |
| Shadow observer | PID 44380, untouched | lock file |
| MT5 / TradingView | not queried by V8 | the replay reads stored Exness bars (Edge Lab data); the live-path parity drives `calculateEntry` with injected bars, a no-op lock and an in-memory store (the real signal store file was never written) |
| RR | 1.70 | params.js minRR 1.7 unchanged |
| LOT | 0.01 | mt5RealPolicy REAL_FIXED_LOT 0.01 unchanged |
| CAPITAL_HARVEST | OFF | not used by V8 |
| AUTO_SCALING | OFF | unchanged |
| SILVER / DOM | not used by V8 | measure-only observer unchanged |
| Deployment of corrections | NOT DEPLOYED | owner decision required (V8_FINAL_SPEC §5) |
