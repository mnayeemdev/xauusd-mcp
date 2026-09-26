# XAUUSD AUTHORITY MAP (deterministic, verified 2026-09-26)

Machine-checked by `tests/authority_isolation.test.js` (transitive import closure, mutating-command call sites, config locks, path isolation) and `tests/strategy_fingerprint.test.js` (frozen strategy surface). This document states WHO may do WHAT; it grants nothing.

## 1. One production trading route

```
TradingView chart (CDP, OANDA:XAUUSD)
  -> src/engine/watcher.js runWatcherCycle (new CONFIRMED 5m candle only)
  -> src/core/xauusd_analyze_market.js -> src/core/xauusd_calculate.js (intraday_5m profile)   = DECISION AUTHORITY
  -> watcher validation/dedup -> deps.executeSignal (injected ONLY by `tv xauusd watch --mt5-real`)
  -> src/engine/mt5Executor.js (REAL profile config from src/engine/mt5RealPolicy.js)          = EXECUTION AUTHORITY
  -> src/engine/mt5Bridge.js -> mt5/mt5_bridge_real.py -> MT5 terminal (login 460149329)         = BROKER
```
There is no second route. `src/shadow/*`, `src/tools/*` (MCP), `src/server.js`, `src/core/*` and every `validation/*` script cannot reach `mt5Executor.js` or `mt5Bridge.js` (transitive closure test). `src/demo/validator.js` reaches the executor only with the DEMO parity config, its own files and the DEMO identity guard; it has no REAL identifier at all (test-enforced).

## 2. Authority table

| Capability | Who | Where | Notes |
|---|---|---|---|
| CREATE BUY/SELL | the engine only: `src/engine/intraday/models5m.js` -> `pipeline5m.js` -> `xauusd_calculate.js` (`finalAction`) | strategy surface, frozen | `analyzeMarket()` never creates an action; news, executor, policies, shadow, demo, research never do |
| VETO (turn BUY/SELL into WAIT) before execution | (a) engine gates inside the frozen surface (bias, CHoCH veto, HTF conflict, RR >= 1.7, quality, freshness); (b) **Pine reference on an OPPOSING actionable direction -> WAIT/ENGINE_DISAGREEMENT** (`xauusd_calculate.js` `detectMaterialDisagreement`, pinned by `tests/weekend_hardening.test.js` H); (c) watcher: `ENGINE_STATUS_NOT_OK`, `VALIDATION_FAILED`, `DUPLICATE_SIGNAL` (signal store `is_new_event`/same-thesis guard + `last_alerted_signal_id`) | `src/core/xauusd_calculate.js`, `src/engine/watcher.js`, `src/engine/signalStore.js` | the Pine reference can never create or flip a direction; with status != OK it has no effect |
| BLOCK ENTRY at execution | executor gates in order: `HALTED`, `KILL_SWITCH`, `REAL_NOT_VERIFIED`, `TERMINAL_NOT_CONNECTED`, `ALGO_TRADING_DISABLED`, `PENDING_INTENT_UNRESOLVED`, `NOT_ACTIONABLE`, `NO_SIGNAL_ID`, `DUPLICATE_SIGNAL`, `INVALID_ENGINE_ENTRY`, `INVALID_SIGNAL_TIME`, `STALE_SIGNAL` (600 s), `SIGNAL_PREDATES_LAST_CLOSE`, `POSITION_ALREADY_OPEN`, `BROKER_POSITIONS_UNKNOWN`, `BROKER_POSITION_ALREADY_OPEN`, `DAILY_TRADE_CEILING`, `CONSECUTIVE_LOSS_LIMIT`, `QUOTE_UNAVAILABLE`, `STALE_QUOTE` (90 s), `SPREAD_TOO_WIDE` (0.6), `ENTRY_DRIFT` (2.0), lot checks; then protection guards news -> shock -> feed -> spread-ratio -> `PROTECTION_BLOCK_ACTIVE` -> `SIGNAL_PREDATES_NORMALIZATION`; then `LOT_NOT_USER_APPROVED`, `MARGIN_SAFETY_VETO`, `EXECUTABLE_GEOMETRY_INVALID` (RR < 1.7); python bridge: `REAL_GUARD_FAILED`, `ALGO_TRADING_DISABLED`, `ACCOUNT_TRADE_DISABLED`, `MAGIC_NOT_ALLOWED`, `VOLUME_NOT_ALLOWED`, `ORDER_CHECK_FAILED`, `ORDER_REJECTED` | `src/engine/mt5Policy.js evaluateEntry`, `src/engine/protectionGuards.js`, `src/engine/mt5Executor.js`, `mt5/mt5_bridge_real.py` | every non-duplicate skip is recorded and the signal is never retried |
| CHANGE POSITION (SL/TP) | executor only: `STOPS_REALIGNED` after a slipped fill; `EMERGENCY_SL_RESTORE` when the broker SL is missing | `mt5Executor.js` `bridge.request('modify')` | bridge refuses `sl <= 0` (a stop may move, never vanish), refuses no-op, refuses foreign magic |
| CLOSE POSITION | executor `closeNow` (single close path) triggered by: thesis invalidation / deterioration / profit protection (`reviewThesis`, confirmed candles only), monetary +30 / -50 (`monitorOnce`, every 3 s), kill-switch file containing "close", emergency boundary breach, post-fill geometry invalid; broker-side SL/TP; manual `tv xauusd mt5-real-close --yes` (refused while the watcher runs) | `mt5Executor.js`, `mt5TradeManagement.js`, `mt5Policy.js`, `marketShock.js` | news NEVER closes a position (policy O1) |
| CHANGE LOT | nobody. REAL lot is exactly 0.01 in code (`REAL_FIXED_LOT`), env values other than 0.01 are rejected, executor refuses any other volume (`LOT_NOT_USER_APPROVED`), python bridge requires `REQUIRED_EXACT_VOLUME` 0.01 | `mt5RealPolicy.js`, `mt5Executor.js`, `mt5_bridge_real.py` | `mt5RealScaling.js` is DORMANT: imported only by the reporting-only `mt5CapitalPolicy.js` (`enabled_scaling: false`); no `computeSizing` hook exists in the REAL config (test-enforced); env, defaults, restart, balance cannot activate it |
| CHANGE RISK | owner + code change only. Monetary envelope +30/-50 and gates are configurable ONLY inside hard ranges via `XAUUSD_MT5_REAL_*` env, audited in `STARTED`/`PROTECTION_STARTED`; minEffectiveRr cannot go below 1.7, thesis exit cannot be disabled | `mt5RealPolicy.js resolveRealExecutorConfig` | the pre-market report (`tv xauusd premarket`) shows the RUNNING values and flags overrides |
| CHANGE NEWS STATE | `src/engine/newsMonitor.js` (calendar fetch every 900 s, snapshot) + `newsRisk.js` state machine + executor `evaluateProtection` (persists `state.protection`) | News V2 | news has ZERO directional authority (no BUY/SELL/side output, test-enforced); it only blocks or leaves entries alone |
| CHANGE BREAKER STATE | executor `finalizeClose` -> `applyClosedTrade` (loss increments, win/breakeven resets); `rollDaily` resets at 00:00 UTC; `rebuildDailyFromDeals` from broker history at start | `mt5Policy.js`, `mt5Executor.js` | NO manual reset command exists. Blocked/skipped/rejected signals never touch it. **Policy fact: the 2-loss breaker is scoped per UTC day** (documented in `docs/XAUUSD_MT5_REAL_EXECUTION.md`; owner decision item, unchanged) |
| WRITE EVIDENCE | REAL executor (`state/xauusd_mt5_real_*`), watcher (`state/xauusd_watcher_state.json`, opportunity/anticipation logs), engine signal store (`validation/mcp_engine_signals.json`, untracked runtime), news snapshot; Stage 11C observer (`state/shadow/*`, read-only inputs); Stage 12 validator (`state/demo_forward/*`) | separate files, no sharing (test-enforced) | on-demand reads (`tv xauusd calculate`, `watch --once`, MCP `xauusd_calculate_entry`) use an EPHEMERAL store since 2026-09-26 |
| SEND BROKER COMMANDS | `src/engine/mt5Executor.js` only (one `open` call site, one `close` call site, two `modify` call sites) through `Mt5Bridge` to the profile's python bridge | see `docs/XAUUSD_BROKER_COMMAND_SURFACE.md` | Stage 12 adds the DEMO identity guard proxy in front of the DEMO bridge |

## 3. Zero-authority declarations (all test-enforced)

- **Stage 11C shadow** (`src/shadow/*`): reads bars via `mt5/mt5_shadow_reader.py` (no trading API), reads the production signal store / REAL audit log / news snapshot, writes only `state/shadow/*`. Cannot import the executor or bridge.
- **Stage 12 DEMO** (`src/demo/*`): ZERO REAL execution authority. DEMO parity config strips `XAUUSD_MT5_REAL_*`, hard DEMO identity (login 480236873 / Exness-MT5Trial11 / XAUUSDm / lot 0.01 / trade_mode 0), fresh `hello` + identity check before every open/close/modify, no REAL identifier in source. Currently READY_NOT_STARTED.
- **Research / validation** (`validation/*`, research docs): ZERO execution authority (closure test); import only pure policy/management modules for offline replay.
- **News** (`newsCalendar.js`, `newsRisk.js`, `newsMonitor.js`): ZERO directional authority.
- **Capital objectives** (`docs/CAPITAL_GROWTH_ARCHITECTURE_62_TO_6M.md`, `docs/XAUUSD_CAPITAL_SCALING_READINESS.md`): documents only, referenced by no code (test-enforced). CAPITAL_SCALING_READY = NO.
- **MCP tools / Claude sessions**: read-only research profile; the calculate tool no longer touches the production signal store. No MCP tool can send an order.

## 4. Operational guards added 2026-09-26 (no authority change)

- The watcher lock is taken BEFORE any executor starts (`tv xauusd watch --mt5-real`); a duplicate start never runs a second REAL executor.
- `mt5-real-status`, `mt5-status`, `mt5-real-close`, `mt5-close` are refused while the watcher lock is live (they would start a second executor on the same state). `tv xauusd premarket` is the read-only replacement.
- `--mt5-real` requires `--engine intraday_5m` (the only profile whose protections and frozen baseline were verified).
- The DEMO validator `--check` is refused while a validator is running.
