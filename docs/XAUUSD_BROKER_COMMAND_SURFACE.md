# XAUUSD BROKER COMMAND SURFACE (enumerated 2026-09-26)

Every code path able to mutate a broker account. Static regression: `tests/authority_isolation.test.js` (call-site counts, `order_send` only in the two bridges, readers without trading API, python guard constants) and `tests/weekend_hardening.test.js` I (python bridges driven offline through a fake MetaTrader5 module).

## 1. Python bridges (the only processes that call `order_send`)

| # | File / function | Account | Independent python guards |
|---|---|---|---|
| B1 | `mt5/mt5_bridge_real.py cmd_open` | REAL | `require_trade_guard` (trade_mode REAL, server not demo, login/server == bridge constants AND == values Node sent, connected, algo trading on, account trade allowed); `require_magic` (ALLOWED_MAGICS = {88052001}); volume must equal `REQUIRED_EXACT_VOLUME` 0.01; symbol fixed XAUUSDm; `order_check` must pass; retcode 10009 = filled, **10008/10012 = `ORDER_STATE_AMBIGUOUS`** (never a rejection), anything else = `ORDER_REJECTED`; an exception AFTER `order_send` = **`POST_SEND_EXCEPTION`** (never a rejection) |
| B2 | `mt5_bridge_real.py cmd_close` | REAL | trade guard, magic allowlist, position must carry our magic and symbol; `positions_get` **None => `POSITIONS_UNAVAILABLE`** (unknown is never "already closed"); empty => `already_closed`; 10008/10012 => `CLOSE_STATE_AMBIGUOUS` |
| B3 | `mt5_bridge_real.py cmd_modify` (TRADE_ACTION_SLTP) | REAL | trade guard, magic allowlist, our magic/symbol only; **`sl <= 0` refused (`MODIFY_INVALID_SL`: a stop may move, never vanish)**, `tp < 0` refused, no-op refused |
| B4-B6 | `mt5/mt5_bridge.py` `cmd_open/close/modify` | DEMO (legacy watcher + Stage 12) | same structure; trade_mode must be DEMO (0); login/server from `XAUUSD_MT5_LOGIN/SERVER` (defaults 480236873 / Exness-MT5Trial11); ALLOWED_MAGICS = {88051501, 88051512} (env `XAUUSD_MT5_ALLOWED_MAGICS`); attaches by `XAUUSD_MT5_TERMINAL_PATH` only, never a login/password switch |

Read-only helpers in both bridges (`hello`, `ping`, `tick`, `positions`, `deals`, `history`) now raise `POSITIONS_UNAVAILABLE` / `HISTORY_UNAVAILABLE` when MetaTrader5 returns `None` (IPC/terminal error) instead of pretending the result is empty; `hello` re-attaches once when `terminal_info()` is `None` (terminal restarted).

No mutation capability: `mt5/mt5_feed_reader.py`, `mt5/mt5_shadow_reader.py` (rates/tick/symbol_info only; static test). No bridge ever calls `mt5.login()` or handles a password (static test).

## 2. Node call sites (all in `src/engine/mt5Executor.js`)

| Command | Call site | Trigger | Guards before the send | Persistence / recovery |
|---|---|---|---|---|
| `open` | `executeSignal` (one call site) | validated NEW BUY/SELL from the watcher | full gate chain (`docs/XAUUSD_AUTHORITY_MAP.md` §2), fresh `hello`, News V2/shock/feed/spread guards, lot == 0.01, margin veto, executable RR >= 1.7 | write-ahead `INTENT PENDING` persisted BEFORE the send; ambiguous codes (`TRADE_REQUEST_TIMEOUT`, `BRIDGE_DOWN`, `BRIDGE_TIMEOUT`, `BRIDGE_WRITE_FAILED`, `ORDER_SEND_NONE`, `ORDER_STATE_AMBIGUOUS`, `POST_SEND_EXCEPTION`) => `ORDER_AMBIGUOUS` + HALT `AMBIGUOUS_ORDER_STATE`, never resent; restart reconciles the PENDING intent against broker history by order comment (`INTENT_RESOLVED` / `ABANDONED`), unreadable history => HALT `RECONCILE_FAILED` |
| `modify` | `executeSignal` after a slipped fill (`STOPS_REALIGNED`) | fill != requested price | position just opened by us | failure only audited (`STOPS_REALIGN_FAILED`, ops alert once) |
| `modify` | `monitorOnce` (`EMERGENCY_SL_RESTORE`) | broker SL missing on our position | protection on, throttled 60 s | failure audited + ops alert |
| `close` | `closeNow` (one call site) | thesis exit, monetary +30/-50, kill-switch "close", emergency breach, post-fill geometry invalid, manual CLI | `close_requested` persisted BEFORE the send; a repeated trigger checks broker deals first (`CLOSE_RETRY` only after verification) | bridge `already_closed` => finalize from deals; `POSITIONS_UNAVAILABLE` => `CLOSE_FAILED` (retry on the next trigger, position kept); after a crash the restart finalizes from broker deals (`CLOSED_WHILE_EXECUTOR_DOWN`) |

Transport (`src/engine/mt5Bridge.js`): one request at a time per id, no automatic retry of any command; `open`/`close` 45 s timeout, others 20 s; a timed-out or errored sidecar is **retired (killed) and lazily respawned** so a hung python process can never pin the bridge; in-flight requests fail `BRIDGE_DOWN` (ambiguous for trades); `onDown` raises an ops alert; stdin `'error'` events are caught (no process crash).

## 3. Process entry points that can reach a broker

| Route | Command | Account | Guards |
|---|---|---|---|
| R1 (PRODUCTION) | `tv xauusd watch --mt5-real --engine intraday_5m` | REAL | arming token `XAUUSD_MT5_REAL_ARMED`, watcher lock acquired BEFORE the executor starts, engine profile must be intraday_5m, REAL config integrity (`resolveRealExecutorConfig` throws on any deviation), bridge hello must be `real_verified` |
| R2 | `tv xauusd mt5-real-close --yes` | REAL close only | arming token + `--yes`; REFUSED while the watcher lock is live (use the kill-switch file with "close" instead) |
| R3 | `tv xauusd mt5-real-status` | REAL (reconciles + persists, sends no orders) | REFUSED while the watcher lock is live; `tv xauusd premarket` is the read-only replacement |
| R4 | `tv xauusd watch --mt5-demo` (legacy) | DEMO 88051501 | DEMO config; retired route (kill-switch file present) |
| R5 | `tv xauusd mt5-status`, `mt5-close --yes` (legacy DEMO) | DEMO | REFUSED while the watcher lock is live |
| R6 | `node src/demo/validator.js` / `--check` | DEMO 88051512 (Stage 12) | own lock, DEMO identity guard, DEMO parity config, `--check` refused while a validator runs; READY_NOT_STARTED today |

Anything else (MCP server/tools, shadow observer, research scripts, `xauusd check/calculate/snapshot`) has no path to a broker (transitive import test).

## 4. Known, accepted limitations (documented, not defects to freeze over)

- A REAL position adopted without an intent (`ADOPTED_EXISTING_POSITION`, engine null) receives monetary/broker/emergency management only, no thesis management.
- A persisted `close_requested` is not replayed after a restart; the monetary trigger re-fires within 3 s if still valid, a thesis trigger re-evaluates on the next confirmed bar.
- If `start()` halts early (bridge unavailable / verification failed / corrupt state) the 3 s monitor is not started for that session; the pre-market report flags `REAL_HALTED` and the watcher must be restarted after the cause is fixed.
- Broker/MT5 timestamps are used as UTC epoch (Exness server GMT+0 assumption; consistent with observed audit rows).
