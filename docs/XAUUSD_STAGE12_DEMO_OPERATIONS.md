# XAUUSD_STAGE12_DEMO_OPERATIONS

## Prerequisite: an independent DEMO terminal instance

The validator's DEMO bridge attaches to a MetaTrader 5 terminal by path (`XAUUSD_MT5_DEMO_TERMINAL_PATH`, passed to the bridge as `XAUUSD_MT5_TERMINAL_PATH`). That terminal must be a SEPARATE installation/instance (e.g. a second install under `C:\MT5-DEMO\`, or a `/portable` copy) logged into **480236873 / Exness-MT5Trial11** by the owner. The installed terminal at `C:\Program Files\MetaTrader 5` is the REAL terminal and must never be switched: the validator does not log in anywhere and refuses to run against a non-demo account. Without an independent DEMO terminal, `node src/demo/validator.js --check` reports the pre-start gate as FAIL (`DEMO_IDENTITY_MISMATCH` or `DEMO_BRIDGE_HELLO_FAILED`) and the validator exits without starting.

## Start / check

```
# verify the DEMO connection and identity (no order, no watcher):
node src/demo/validator.js --check
# start exactly one validator (own lock: state/demo_forward/validator.lock):
$env:XAUUSD_MT5_DEMO_TERMINAL_PATH='C:\MT5-DEMO\terminal64.exe'
Start-Process node -ArgumentList 'src/demo/validator.js' -RedirectStandardOutput state/demo_forward/validator_stdout.log -RedirectStandardError state/demo_forward/validator_stderr.log -WindowStyle Hidden
```
The market-data feed attaches read-only to the installed (REAL) terminal by default (`XAUUSD_MT5_FEED_TERMINAL_PATH` overrides it) and only reads bars/ticks; execution goes exclusively through the DEMO bridge/terminal. A second start is refused by the lock. The production watcher is never restarted for Stage 12.

## Pre-activation gate (performed automatically at every start, and manually before the first activation)

REAL: flat or exactly understood, no unexpected order/position, watcher healthy, lot 0.01, scaling OFF, strategy/News V2/breaker unchanged. Stage 11C observer healthy. DEMO: login/server verified through the bridge hello, account demo, symbol XAUUSDm available, no positions/pending orders unless reconciled by the executor, lot 0.01, identity guard PASS, kill switch known. Market closed is not a failure.

## Stop

Send Ctrl+C / SIGTERM to the validator process (the same console-attach helper used for the watcher, or `taskkill /PID <pid>`); it stops the executor (broker SL/TP stay in force for any open DEMO position), stops the bridge and feed, writes STOPPED status and releases its lock. Never stop it by killing the terminal.

## Recovery

On every start the executor reconciles from broker truth: a PENDING write-ahead intent is resolved from deal history (INTENT_RESOLVED) or abandoned; unreadable history halts (RECONCILE_FAILED) and nothing new executes; an open DEMO position with our magic is resumed (RESUMED_POSITION) and managed; the watcher state prevents re-evaluating a consumed candle; evidence ids are content hashes so replayed cycles append nothing. Observer, feed or bridge restarts are independent of each other. If order state is ambiguous the validator stays halted and the `DEMO_POSITION_RECONCILED`/`ANOMALY` alert surfaces it; do not resend manually.

## Reporting

```
node src/demo/report.js            # text summary (system, DEMO account, provenance split, forward counts, blocks, reliability, status)
node src/demo/report.js --json
node src/demo/report.js --export state/demo_forward/export_<date>.json
```
Historical/backfill/test records are always separated from FORWARD_LIVE_DEMO. Do not read edge into a small sample: the status stays COLLECTING below 20 completed trades and the gates require ≥ 60 trades / 40 sessions / 90 days.

## Files

Code: `src/demo/{identityGuard,config,evidence,feed,validator,report}.js`, `mt5/mt5_feed_reader.py`, `mt5/mt5_bridge.py` (terminal-path attach only). Tests: `tests/demo_forward_validation.test.js`. Docs: this file, `XAUUSD_STAGE12_DEMO_FORWARD_PROTOCOL.md`, `XAUUSD_STAGE12_DEMO_EXECUTION_ARCHITECTURE.md`. Runtime (gitignored): `state/demo_forward/`.

## Known limitations

- Requires an owner-provisioned second terminal instance logged into the DEMO account (the validator never handles credentials).
- The feed is Exness XAUUSDm (the account's own symbol); production decides on OANDA:XAUUSD via TradingView, so decision timing/geometry can differ by a few tenths of a USD; the engine logic is identical.
- The Pine reference comparison is reported NOT_FOUND (no chart access); see the architecture document.
- Broker commission/swap appear in CLOSED records when the broker reports them; tick-level spread at the release second is not available.
