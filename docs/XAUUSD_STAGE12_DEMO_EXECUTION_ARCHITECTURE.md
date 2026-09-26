# XAUUSD_STAGE12_DEMO_EXECUTION_ARCHITECTURE (implemented 2026-09-26)

```
PRODUCTION REAL WATCHER (v8, unchanged)              STAGE 11C SHADOW OBSERVER (unchanged)
  TradingView chart (CDP) ──► engine ──► REAL executor      read-only MT5 reader ──► forward shadow evidence
  ──► REAL bridge (mt5_bridge_real.py) ──► REAL terminal      (no order path)

STAGE 12 DEMO VALIDATOR  (node src/demo/validator.js, separate process, own lock state/demo_forward/validator.lock)
  read-only MT5 feed reader (mt5/mt5_feed_reader.py: rates/tick/select/ping/quit only)
     └── XAUUSDm bars, all 10 engine timeframes, 500 bars each, once per cycle
  UNCHANGED watcher cycle (src/engine/watcher.js runWatcherCycle via createCycleDeps with injected deps)
     └── UNCHANGED engine: analyzeMarket()/calculateEntry() intraday_5m with feed-backed deps
  UNCHANGED executor (src/engine/mt5Executor.js) with the DEMO PARITY config (src/demo/config.js)
     └── DEMO identity guard (src/demo/identityGuard.js) ──► DEMO bridge (mt5/mt5_bridge.py, XAUUSD_MT5_TERMINAL_PATH = DEMO terminal) ──► DEMO terminal
  evidence recorder (src/demo/evidence.js) ──► state/demo_forward/demo_forward_evidence.jsonl (append-only)
  read-only report (src/demo/report.js)
```

## REAL isolation

- The validator never imports or spawns the REAL bridge, never reads REAL state, never touches the TradingView chart (no CDP lock, no chart peek, Pine reference stubbed as NOT_FOUND), and strips every `XAUUSD_MT5_REAL_*` variable from the environment it passes to the DEMO bridge.
- Stage 12 source contains no REAL identifier (test-enforced); `DEMO_IDENTITY` is a frozen constant (login 480236873, server Exness-MT5Trial11, symbol XAUUSDm, lot 0.01, trade_mode 0).
- The DEMO bridge attaches to a terminal by PATH only (`XAUUSD_MT5_TERMINAL_PATH`); it never calls `initialize(login=…, password=…)`, so it can never re-log a terminal into another account. If it attaches to a terminal that is logged into REAL, its own `hello` checks (`trade_mode_is_demo`, `login_matches_bridge`, `server_matches_bridge`) fail and the executor refuses to start.
- **DEMO identity guard** (highest priority): every `open` / `close` / `modify` is preceded by a fresh `hello`; login, server, trade mode (demo), symbol and — for `open` — volume exactly 0.01 and the expected identity parameters must match, otherwise the command is refused with `DEMO_ACCOUNT_MISMATCH` (no fallback, no retry, alert `DEMO_ACCOUNT_MISMATCH`). Tests prove REAL login, REAL server, non-demo trade mode, wrong symbol, wrong lot and missing identity are all blocked and that no order reaches the bridge.
- The executor's own gates (`demo_verified`, dedup, one position, PENDING-intent reconciliation, kill switch) remain in force underneath the guard: defence in depth.

## Strategy parity (src/demo/config.js)

DEMO config = DEMO policy identity + REAL defaults for every strategy-relevant setting: profit target +30 USD / maximum loss −50 USD (trade budget 100 × 30 % / 50 %), maxConsecutiveLosses 2, maxTradesPerDay 10, maxSignalAgeSec 600, maxQuoteAgeSec 90, maxSpreadUsd 0.6, maxEntryDriftUsd 2.0, deviation 300 points, broker TP on, thesisExit true, minEffectiveRr 1.7, brokerStructuralSlMultiple 1.5, exactLot 0.01, sizingMode fixed_user_lot, News Protection V2 on with identical newsRiskParams (Tier B 55, Tier A 150/90/120, ratio 1.5, confirm 2, max extension 0 = shadow only, BLOCK) and identical shockParams. Differences by design: login/server/magic (88051512) and the daily-loss lock (REAL: disabled; the DEMO policy requires a positive number so it is set to 1,000,000 USD, i.e. unreachable). `parityReport()` verifies all parity fields equal the REAL defaults; the identity fields must differ. The decision path is the same code: `tests/demo_forward_validation.test.js` proves identical bars through the feed deps and through chart-style deps yield an identical decision object.

Known parity limitation: production compares the engine decision with the chart's Pine reference (`getMasterState`, informational; with opposing actionable directions the engine fails closed to WAIT). The validator cannot read the chart and reports the reference as NOT_FOUND, so in that rare configuration production may WAIT where the validator would act. No ENGINE_DISAGREEMENT has been recorded in the production wait log to date; the report can be compared against production decisions by signal time.

## Execution lifecycle instrumentation (12B)

Every stage is timestamped in the executor audit (mirrored into EXECUTION evidence): SIGNAL (engine `calculated_at`, signal candle time) → decision (executor gate verdicts incl. news/shock/spread/feed/normalisation guard results) → INTENT (write-ahead, requested price, live bid/ask, spread, drift, broker SL/TP, geometry) → identity guard hello → broker request → acknowledgement (retcode, order, deal) → fill (price, entry deal) → position reconciliation (positions/history) → STOPS_REALIGNED → adaptive management (THESIS_* on confirmed candles) → CLOSE_TRIGGERED (reason, source) → CLOSED (exit price, realized net/gross, commission, swap, MFE/MAE) → history reconciliation. Entry slippage = |fill − requested| on OPENED; exit slippage where a requested exit price exists; latency from the timestamps of INTENT → OPENED. Unavailable values are null.

## Duplicate / restart protection

Reused from the executor: signal_id dedup (`executed_signals`), one governed position, write-ahead PENDING intent with broker-history reconciliation at start (`INTENT_RESOLVED` / `ABANDONED`; unreadable history → HALT `RECONCILE_FAILED`, no new execution), stale-signal (600 s) and normalisation guard (`SIGNAL_PREDATES_NORMALIZATION`). The validator adds: own process lock, watcher-state `last_processed_5m_time` (a restart never re-evaluates a consumed candle), evidence ids that are content hashes (restart rebuilds the index; duplicates rejected), BACKFILL/HISTORICAL_REPLAY/TEST provenance that can never become forward evidence, and the shadow observer/candidates have no execution authority at all (static tests).

## Alerts (operational, not signals)

DEMO_VALIDATOR_STARTED / STOPPED, DEMO_ACCOUNT_MISMATCH (once per reason), DEMO_ORDER_INTENT, DEMO_ORDER_FILLED, DEMO_ORDER_REJECTED (once per reason), DEMO_POSITION_RECONCILED (once per type), DEMO_TRADE_CLOSED, DEMO_DUPLICATE_BLOCKED (once per signal), DEMO_FEED_STALLED / RECOVERED, via the existing `notifyOps` channel (console + desktop toast, "NOT A TRADE SIGNAL"). Every execution log line carries `ACCOUNT_CLASS=DEMO login=480236873 server=Exness-MT5Trial11 symbol=XAUUSDm lot=0.01 signal_id=… RESULT=…`; passwords are never logged (none are handled).

## Storage

`state/demo_forward/` (gitignored): validator.lock, validator.log, validator_status.json, watcher_state.json + watcher.lock (own copies), executor_state.json, executor_audit.jsonl, kill_switch, engine_signals.json (own signal store — production's store is never written), news_calendar_snapshot.json, demo_forward_evidence.jsonl. Export: `node src/demo/report.js --export <path>`.
