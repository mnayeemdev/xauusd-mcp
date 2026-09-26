# XAUUSD PRE-MARKET CHECKLIST + MARKET-OPEN RUNBOOK (frozen 2026-09-26)

Deterministic, read-only. Nothing in this runbook places, forces or manufactures a trade, restarts the REAL watcher, resets the breaker, changes the lot or bypasses WAIT. Existing production logic operates on its own only if every gate passes.

## A. One command

```
npm run xauusd:premarket          # read-only report from files + process list (exit 2 = blocking condition)
npm run xauusd:premarket:live     # same + read-only MT5 tick/spread/last 5m bars through mt5/mt5_feed_reader.py
npm run xauusd:fingerprint        # frozen strategy surface verification (exit 2 = surface changed)
```
`tv xauusd mt5-real-status` is REFUSED while the watcher runs (it would start a second executor on the live state). Do not use it at market open.

## B. Market-open runbook (execute in order; STOP at the first FAIL)

| # | Check | Source (read-only) | PASS condition | On FAIL |
|---|---|---|---|---|
| 1 | Git / frozen baseline | `GIT_HEAD`, `STRATEGY_FINGERPRINT` | HEAD == `docs/XAUUSD_PRE_MARKET_FREEZE.md` FINAL_HEAD (or a later reviewed commit); fingerprint matches | do not touch runtime; review the diff; re-freeze only if the change was deliberate and reviewed |
| 2 | REAL account identity | `REAL_ACCOUNT_IDENTITY`, `REAL_BRIDGE_CHECKS` | last STARTED: login 460149329, Exness-MT5Real51, trade_mode 2, real_verified, 13/13 checks, terminal `C:\Program Files\MetaTrader 5`, lot_size 0.01, magic 88052001 | STOP: owner action (terminal/login) |
| 3 | Flat / known broker state | `REAL_POSITION`, `REAL_INTENT`, `REAL_HALTED`, `REAL_AUDIT_SINCE_START` | position null (or an understood open position), intent not PENDING, not halted, no ANOMALY/ORDER_AMBIGUOUS/CLOSE_FAILED since start | STOP: an unexpected position/order is an owner decision; a halt requires cause analysis before any restart |
| 4 | Exactly one REAL watcher | `REAL_WATCHER_PROCESS`, `WATCHER_LOCK`, `WATCHER_LOCK_PID_MISMATCH`, `REAL_BRIDGE_PROCESS`, `LEGACY_DEMO_WATCHER` | one `xauusd watch --mt5-real` process, lock pid == that process, one `mt5_bridge_real.py`, no legacy demo watcher | duplicate => owner decides which to stop (graceful Ctrl+C helper), never kill the terminal |
| 5 | Stage 11C observer | `SHADOW_OBSERVER_PROCESS`, `SHADOW_LOCK`, `SHADOW_OBSERVER` | running, last cycle < 3 min, no last_error, malformed 0 | WARN only (observation); restart the observer independently if needed |
| 6 | News V2 / calendar | `NEWS_V2_CONFIG`, `REAL_RUNNING_NEWS_PARAMS`, `NEWS_SNAPSHOT`, `NEWS_UPCOMING_RELEVANT` | running params = BLOCK / tierB 55 / tierA 150-90-120 / extension 0; snapshot fresh (< 6 h) with usable events; know the next Tier A/B window | stale snapshot => the executor blocks by itself (DATA_UNAVAILABLE); do NOT change policy |
| 7 | Fresh broker tick | `--live LIVE_TICK`, `REAL_PROTECTION` | tick age <= 90 s after reopen; protection `FEED_STALE` clears on the first fresh tick (audited `PROTECTION_NORMALIZED`, sets `last_block_cleared_at`) | wait; the executor cannot enter while FEED_STALE |
| 8 | Spread | `--live LIVE_SPREAD` | <= 0.6 USD and not > 2x baseline | wait; `SPREAD_TOO_WIDE` / relative gate block by themselves |
| 9 | Fresh confirmed 5M | `WATCHER_FEED`, `LAST_PROCESSED_5M`, `--live LIVE_LAST_CONFIRMED_5M`, `WATCHER_LOG` | feed failure streak returns to 0 (`FEED_RECOVERED` alert), `last_processed_5m_time` advances to the first Monday candle, no stale-candle lines after reopen | CDP/TradingView issue: `node src/cli/index.js launch` restores CDP; the watcher re-baselines by itself |
| 10 | No stale / replayed signal | `SIGNAL_STORE`, executor gates | store readable; any Friday signal is `STALE_SIGNAL` (600 s), a pre-clear signal is `SIGNAL_PREDATES_NORMALIZATION`, executed ids are never re-sent (`executed_signals`) | nothing to do manually; never edit the store |
| 11 | Breaker / day rollover | `REAL_DAILY`, `BREAKER` | `daily.day` == today UTC after the first executor tick, consecutive_losses rebuilt from broker history (`DAILY_REBUILT`), max 2 | never reset manually |
| 12 | Kill switch | `REAL_KILL_SWITCH` | file absent (or deliberately present) | a present file blocks entries by design |
| 13 | Runtime errors | `WATCHER_LOG`, `WATCHER_CYCLE_ERRORS`, `REAL_AUDIT_INTEGRITY` | 0 unexpected errors, audit lines all parse | investigate before allowing trading to continue (the watcher fails closed on errors) |
| 14 | Allow existing logic | — | all above PASS | EXISTING production logic operates; do not force a trade, do not generate a signal manually, do not increase frequency, do not bypass WAIT |

## C. Conditions that block trading (by the system itself, no operator action)

`HALTED` (any reason), `KILL_SWITCH`, `PENDING_INTENT_UNRESOLVED`, `REAL_NOT_VERIFIED`, `TERMINAL_NOT_CONNECTED`, `ALGO_TRADING_DISABLED`, `STALE_QUOTE`/`FEED_UNHEALTHY_BLOCK`, `SPREAD_TOO_WIDE`, `VOLATILITY_SHOCK_ENTRY_BLOCK`, News V2 windows and `DATA_UNAVAILABLE`, `SIGNAL_PREDATES_NORMALIZATION`, `STALE_SIGNAL`, `DUPLICATE_SIGNAL`, `POSITION_ALREADY_OPEN`, `CONSECUTIVE_LOSS_LIMIT`, `DAILY_TRADE_CEILING`, `MARGIN_SAFETY_VETO`, `EXECUTABLE_GEOMETRY_INVALID`, Pine `ENGINE_DISAGREEMENT`.

## D. Operator actions that are ALLOWED during controlled validation

- Read: `npm run xauusd:premarket[:live]`, `npm run xauusd:fingerprint`, `node src/shadow/report.js`, tail `state/watcher_real_v8.log`.
- Emergency close of the MCP position without stopping the watcher: write `close` into `state/xauusd_mt5_real_kill_switch` (the live executor closes on its next 3 s tick and blocks new entries until the file is removed).
- Graceful stop (owner authorization required): Ctrl+C helper to the watcher pid; never kill the terminal.

## E. Operator actions that are FORBIDDEN

REAL/DEMO manual trades, breaker reset, lot change, scaling, leverage change, strategy/RR/stop/target changes, News V2 policy changes, forcing signals, clearing production state, switching the MT5 account, running `mt5-real-status`/`mt5-real-close`/e2e tests beside the live watcher.
