# XAUUSD MT5 DEMO Execution (TradeBudget exit overlay)

Status (2026-09-26): **LEGACY / RETIRED route** (magic 88051501; `state/xauusd_mt5_kill_switch` present). Superseded by the Stage 12 DEMO forward validator (`src/demo/validator.js`, docs `XAUUSD_STAGE12_DEMO_*.md`). Historical text follows.

## 1. What this is, and what it is not

This connects the EXISTING MCP decision engine to an Exness MetaTrader 5
**DEMO** account. It is an execution layer plus an exit overlay. It is:

- **not** a new decision engine (nothing in `src/engine/pipeline.js`, `mtf.js`,
  `risk.js`, `quality.js`, `htf.js`, `signalStore.js`, `xauusd_calculate.js` or
  `xauusd_analyze_market.js` was changed; `tests/engine_watcher_mt5_hook.test.js`
  audits that none of them even mention MT5),
- **not** a strategy change to increase frequency (every existing gate stays;
  execution only adds further reasons to *not* trade),
- **not** a measurement of the engine's own SL/TP/RR performance (see §7),
- **not** real-money capable (see §5).

## 2. Decision authority (unchanged)

Implemented code, per newly confirmed 5m candle (`src/engine/watcher.js`):

```
5m/15m/30m confirmed bars -> runPipeline() per timeframe
  regime -> structure -> correction -> model trigger -> overextension/RR gate (minRR 1.7)
  -> quality gate (>= 65)
combineTimeframes(): 15m decides; 30m regime opposition / fresh opposing 5m break -> WAIT
calculateEntry(): 1H regime conflict -> WAIT/HTF_CONFLICT
                  Pine actionable AND opposite -> WAIT/ENGINE_DISAGREEMENT
signalStore: deterministic signal_id, same-thesis OPEN guard -> is_new_event
watcher alert gate (evaluateEngineResult): status OK, BUY/SELL, finite entry/sl/tp1/tp2/rr,
                  signal_id present, is_new_event true, != last_alerted_signal_id
  -> notify(alert)                                   (existing)
  -> executeSignal({alert, signalId, result})        (NEW, optional, off by default)
```

15m remains the decision timeframe. M5 is the watcher's trigger cadence and the
executor's monitoring context. WAIT remains a valid outcome. MT5 never invents
a BUY/SELL.

## 3. Architecture

```
watcher alert gate
  -> src/engine/mt5Executor.js   policy + persistence + monitor (Node)
       uses src/engine/mt5Policy.js   pure gates / budget maths (unit-tested)
  -> src/engine/mt5Bridge.js     JSON-lines client, spawns the sidecar
  -> mt5/mt5_bridge.py           thin executor with its OWN hard guards (Python, MetaTrader5 pkg)
  -> MetaTrader 5 terminal (Exness-MT5Trial11, login 480236873, XAUUSDm)
```

Enable: `npm run xauusd:watch:mt5-demo` (= `tv xauusd watch --mt5-demo`).
Without the flag the watcher is byte-for-byte the previous behaviour.

Read-only status: `npm run xauusd:mt5-status`.
Manual close of the MCP-owned position: `tv xauusd mt5-close --yes`.

Runtime files (gitignored `state/`): `xauusd_mt5_executor_state.json`,
`xauusd_mt5_trade_log.jsonl`, `xauusd_mt5_kill_switch`.

## 4. Money-management model (configurable, env vars)

| Env | Default | Meaning |
|---|---|---|
| `XAUUSD_MT5_TRADE_BUDGET_USD` | 10 | TradeBudgetUSD, a risk-configuration number |
| `XAUUSD_MT5_TAKE_PROFIT_PERCENT` | 30 | ProfitTargetUSD = budget x % |
| `XAUUSD_MT5_STOP_LOSS_PERCENT` | 50 | MaximumLossUSD = -(budget x %) |
| `XAUUSD_MT5_LOT_SIZE` | 0.01 | position volume (independent of budget) |
| `XAUUSD_MT5_MAX_LOT_SIZE` | 0.01 | independent hard cap; both must change to raise volume |
| `XAUUSD_MT5_MAX_ENTRY_DRIFT_USD` | 2.00 | ENTRY_DRIFT skip threshold |
| `XAUUSD_MT5_MAX_SPREAD_USD` | 0.60 | spread filter (live spread was 0.26) |
| `XAUUSD_MT5_DEVIATION_POINTS` | 300 | max slippage for market orders (0.300 USD) |
| `XAUUSD_MT5_MAX_TRADES_PER_DAY` | 150 | hard ceiling (cannot be raised above 150) |
| `XAUUSD_MT5_DAILY_LOSS_LIMIT_USD` | 25 | circuit breaker on realised net P&L per UTC day |
| `XAUUSD_MT5_MAX_CONSECUTIVE_LOSSES` | 5 | circuit breaker, resets on a win or a new UTC day |
| `XAUUSD_MT5_MAX_SIGNAL_AGE_SEC` | 600 | stale-signal protection |
| `XAUUSD_MT5_MAX_QUOTE_AGE_SEC` | 90 | stale-quote protection |
| `XAUUSD_MT5_MONITOR_INTERVAL_MS` | 3000 | P&L monitor cadence |
| `XAUUSD_MT5_BROKER_TP` | 1 | broker-side TP fail-safe on/off (SL is never optional) |
| `XAUUSD_MT5_COMMISSION_PER_SIDE_USD` | 0 | commission estimate (Exness Standard: 0) |
| `XAUUSD_MT5_LOGIN` / `_SERVER` / `_SYMBOL` / `_MAGIC` | 480236873 / Exness-MT5Trial11 / XAUUSDm / 88051501 | identity |
| `XAUUSD_MT5_PYTHON` | `py -3` (win) | Python launcher for the bridge |

Worked values: 10 USD -> +3.00 / -5.00. 100 USD -> +30.00 / -50.00, lot still 0.01.
Budget, lot, broker margin, notional exposure and position P&L are separate
concepts and are never substituted for one another in code.

## 5. DEMO-only hard protection (three independent layers)

1. **Node config** (`resolveExecutorConfig`): mode must be exactly `demo`
   (no other mode exists; `live`/`real` throw), server must contain
   "Trial" or "Demo", lot <= hard cap, ceiling <= 150.
2. **Node executor**: a fresh `hello` handshake is required at start AND before
   every trade-changing operation (`executeSignal`, close). It demands
   account `trade_mode == 0` (ACCOUNT_TRADE_MODE_DEMO), login 480236873,
   server Exness-MT5Trial11, symbol XAUUSDm. Any mismatch -> SKIPPED /
   `DEMO_NOT_VERIFIED`, halted at start.
3. **Python bridge** (`require_trade_guard`): independently re-checks the same
   facts against its own env-derived expectations on every `open`, `close`,
   `modify`; also refuses if terminal Algo Trading is OFF (so no 10027 order
   ever leaves) and if volume exceeds its own `HARD_MAX_VOLUME` (0.01).
   `close`/`modify` refuse any position not carrying our magic number.

Switching the terminal to a real account while the executor runs makes the
next `hello` fail verification and every trade command fail closed.

## 6. Position lifecycle

Entry (`executeSignal`, serialised, never throws):

1. read kill switch, fresh `hello`, broker positions (our magic only), tick
2. `evaluateEntry()` in order: HALTED, KILL_SWITCH, DEMO_NOT_VERIFIED,
   TERMINAL_NOT_CONNECTED, ALGO_TRADING_DISABLED, PENDING_INTENT_UNRESOLVED,
   NOT_ACTIONABLE, NO_SIGNAL_ID, DUPLICATE_SIGNAL, INVALID_ENGINE_ENTRY,
   INVALID_SIGNAL_TIME, STALE_SIGNAL, SIGNAL_PREDATES_LAST_CLOSE,
   POSITION_ALREADY_OPEN, BROKER_POSITIONS_UNKNOWN,
   BROKER_POSITION_ALREADY_OPEN, DAILY_TRADE_CEILING, DAILY_LOSS_LIMIT,
   CONSECUTIVE_LOSS_LIMIT, QUOTE_UNAVAILABLE, STALE_QUOTE, SPREAD_TOO_WIDE,
   ENTRY_DRIFT, lot validation. Any deny -> `SKIPPED`, signal_id recorded,
   never retried.
3. Write-ahead **intent** persisted (`PENDING`) before `order_send`.
4. Market order, IOC, `deviation` points, magic 88051501, comment `MCP:<signal_id>`,
   broker SL/TP already attached (§8).
5. Fill -> position record, intent `FILLED`, ledger `EXECUTED`, `OPENED` logged.
   If the fill slipped by >= 1 point, stops are re-aligned to the real fill
   (`modify`, `STOPS_REALIGNED`).
6. Ambiguous send (timeout / bridge down) -> `ORDER_AMBIGUOUS`, executor halts
   new entries, intent stays `PENDING` until a restart reconciles it against
   broker history. Never resent.

Exit (`monitorOnce`, every 3 s):

- net P&L = `position.profit` (gross, already at live bid/ask and the actual
  fill) + `position.swap` + entry-deal commission + estimated exit commission
  (+ fees). MFE/MAE tracked in net USD.
- `evaluateExit()`: net >= ProfitTargetUSD -> close (`TAKE_PROFIT_BUDGET`);
  net <= MaximumLossUSD -> close (`STOP_LOSS_BUDGET`); kill switch content
  `close` -> close.
- After the close, realised gross/commission/swap/fee/net are read from the
  position's deals (`CLOSED` event), daily counters updated, `last_close_at`
  set. If the broker closed it first (SL/TP/stop-out), it is finalised from
  deals with `BROKER_SL` / `BROKER_TP` and no close order is sent.

After every close a NEW signal_id from a FRESH engine evaluation with
`calculated_at` later than `last_close_at` is required. No martingale, no
averaging, no grid, no lot increase, no automatic reopen.

## 7. Broker-side fail-safe design

With 0.01 lot and contract 100, 1.00 USD of XAUUSDm price = 1.00 USD of
gross P&L. MT5 evaluates a BUY's P&L and SL/TP against BID, a SELL's against
ASK, and the position is opened at ASK (BUY) / BID (SELL), so the spread is
paid at entry and already inside `position.profit`. Therefore:

- **SL** = fill -/+ (|MaximumLossUSD| - round-trip commission) / (lot x contract).
  Gross loss at the stop = exactly the budget; net = budget minus slippage on
  the stop fill. This is the crash/disconnect protection and is ALWAYS placed.
- **TP** = fill +/- (ProfitTargetUSD + round-trip commission) / (lot x contract).
  For a BUY the TP triggers on bid, so no systematic spread conflict exists.
  The only residual is overnight swap (unknown at open time), so the
  actual-P&L monitor (which sees live swap) is the PRIMARY profit exit; the
  broker TP is a secondary fail-safe and can be disabled with
  `XAUUSD_MT5_BROKER_TP=0`.
- Stops level and freeze level on XAUUSDm are 0, so these distances are
  always accepted by the server.

The monitor and broker stops normally coincide within cents; whichever fires
first closes the position. A broker-side close is detected and finalised by
the monitor or by the next restart.

## 8. Restart / reconnect recovery (`reconcile()` on every start)

1. `hello` -> DEMO verification (halt on failure).
2. `PENDING` intent: search deal history (our magic) from the intent time for
   an entry deal whose comment carries the signal_id. Found and open -> adopt
   and monitor. Found and already closed -> finalise from deals. Not found ->
   intent `ABANDONED`, signal marked, never resent. History unreadable ->
   `RECONCILE_FAILED`, halted.
3. Persisted position: still on the broker -> `RESUMED_POSITION`; gone with
   an exit deal -> finalised `CLOSED_WHILE_EXECUTOR_DOWN`; gone without an
   exit deal -> `ANOMALY`, halted.
4. Unknown MCP-magic position on the broker -> `ADOPTED_EXISTING_POSITION`
   (signal_id from comment). More than one -> `MULTIPLE_MCP_POSITIONS`, halted.
5. Daily counters rebuilt from the broker's exit deals for the current UTC
   day (`DAILY_REBUILT`); local state is only used if the broker shows fewer.

Manual trades and other EAs' positions are invisible to the executor (every
positions/history query is filtered by our magic; close/modify refuse other
magics in Python too).

## 9. Audit log (`state/xauusd_mt5_trade_log.jsonl`)

Event types: `STARTED`, `DAILY_REBUILT`, `DAILY_REBUILD_FAILED`, `INTENT`,
`INTENT_RESOLVED`, `OPENED`, `STOPS_REALIGNED`, `STOPS_REALIGN_FAILED`,
`SKIPPED`, `REJECTED`, `ORDER_AMBIGUOUS`, `HALTED`, `RESUMED_POSITION`,
`ADOPTED_EXISTING_POSITION`, `CLOSE_TRIGGERED`, `CLOSED`, `CLOSE_FAILED`,
`ANOMALY`, `STOPPED`.

Every event carries: timestamp, lot_size, trade_budget_usd,
take_profit_percent, stop_loss_percent, profit_target_usd, maximum_loss_usd,
magic, symbol, account login/server. Entry/exit events add: signal_id,
decision_id, action, regime, setup, correction/confirmation state, engine
entry/SL/TP1/TP2/RR/quality, live bid/ask, spread, entry_drift,
requested vs execution price, slippage, broker SL/TP, MT5 order id, deal id,
position id, retcode, gross P&L, commission, swap, fee, net P&L, MFE/MAE,
exit reason/source/timestamp, rejection/skip reason and details.

## 10. Statistics are reported separately

`tv xauusd mt5-status` prints:

- **A. MCP decision quality**: from `validation/mcp_engine_signals.json`
  (the engine's own OPEN/PASS/FAIL resolution against its own SL/TP2).
- **B. TradeBudget 30%/50% execution overlay**: from the trade log (closed
  trades, wins/losses, net USD, exits by reason, skips by reason).

B does **not** measure the engine's TP/SL performance: with a 10 USD budget
the overlay closes at +3/-5 USD, far inside the engine's own structure-based
levels (recent signals had ~30 USD stops).

## 11. Safety summary

spread filter, deviation/slippage cap, stale signal + stale quote checks,
terminal connection + Algo Trading permission checks, per-trade DEMO
re-verification, write-ahead intent + executed-signal ledger + magic isolation
+ history reconciliation (duplicate prevention), one-position rule (local AND
broker), daily ceiling (150 hard), daily-loss and consecutive-loss circuit
breakers, kill switch file (`state/xauusd_mt5_kill_switch`; content `close`
also closes), persistent audit log. Any uncertainty -> no new trade.

## 12. Known limits / assumptions

- Commission is assumed 0 unless `XAUUSD_MT5_COMMISSION_PER_SIDE_USD` is set
  (Exness Standard demo showed no commission field on positions; the entry
  deal's commission is read live and used when present).
- Slippage on a broker-side SL fill can push the realised loss slightly past
  the budget; the monitor cannot prevent that (it is the fail-safe path).
- The executor's daily counters use UTC days.
- Python bridge requires the `MetaTrader5` package (present: 5.0.6180) and
  Python 3.14; the OpenBLAS import needs `OPENBLAS_NUM_THREADS=1`, which the
  bridge sets automatically.
- MT5 was verified read-only (account 480236873, trade_mode 0, XAUUSDm digits 3,
  contract 100, min/step 0.01, stops level 0). Terminal Algo Trading is OFF;
  until it is switched on, every entry is skipped with `ALGO_TRADING_DISABLED`.
