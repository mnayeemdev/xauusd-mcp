# V8_STALE_DUPLICATE_AUDIT

V8 CORE PATTERN EXECUTION AUDIT · research only · production unchanged (fingerprint 356e4189…) · no order placed · pre-registration sha256 fbd6b65584267124… · freeze 2026-10-01T11:20:10.088Z

| Risk | Protection | Evidence |
|---|---|---|
| same candle / same setup / same model / same direction twice | signal id = hash of symbol, timeframe, model, side, origin bar, signal bar (`signalStore.registerOrGetSignal`): a second registration returns the existing record (isNew false); a second candidate on the same OPEN thesis is withheld (blockedByOpenThesis) | test: duplicate → isNew false; same thesis → blocked |
| watcher restart | the store is persisted atomically (temp + rename) and reloaded; ids are deterministic | test: save → reload → re-register → no second record |
| executor duplicates | `mt5Executor` keeps `executed_signals` and a write-ahead intent before order_send; reconcile resolves a crash in the send window | existing tests (mt5_executor, watcher_tick_overlap, weekend_hardening) — unchanged, all pass |
| re-entry | `canReenter`: never on the same or an earlier candle than the last exit; same model/side/anchor within 12 bars = STALE_SAME_SETUP; revenge guard 3 bars after a loss | test for each rule; the replay walk uses the same function (skipped: CONTROL HOLD {"SAME_OR_EARLIER_CANDLE":3996,"STALE_SAME_SETUP":321,"REVENGE_GUARD":39}) |
| stale signals | each model has its own lateness limit (MC/PB/MR 3 bars, BO 10, SR 0); CONTROL wrong-direction trades later than their limit: 2 (only via stale higher-timeframe data, D6) | forensics |
| reconnect / missed candle recovery | the watcher evaluates the latest confirmed bar only; a missed bar is not back-filled into a signal (no stale entry) | existing watcher tests |
| stale data | **D6**: a stale 15m/30m snapshot was used; corrected copy fails closed | live-path test |

**STALE_SIGNAL_ERRORS = 0** (stale data counted under DATA_ERRORS as D6).
