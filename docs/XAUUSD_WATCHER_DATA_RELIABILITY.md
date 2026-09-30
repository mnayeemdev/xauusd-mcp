# XAUUSD watcher data-reliability layer (P1 repair, 2026-09-30)

Origin: LIVE vs REPLAY PARITY AUDIT (handoff/LIVE_REPLAY_PARITY_AUDIT/REPAIR_SPEC.md). On 2026-09-30 the REAL v9 watcher lost 4 of 110 confirmed 5m candles and evaluated 2 more without a complete multi-timeframe read because TradingView series loads failed after timeframe switches (33 "Could not extract OHLCV data" reads, 1 wrong-timeframe series, 2 feed stalls). The chart was resting on the 30-minute resolution, so every 60-second poll switched 30→5→30 in addition to the ten-timeframe sweep. Decisions were never wrong (fail-closed); coverage was.

## What the layer is
`src/engine/watcherDataReliability.js`, wired ONLY by `xauusd watch` in `src/cli/commands/xauusd.js` through the existing dependency-injection seams (`startWatcher({ _deps: { runCycle, cycle: { peekLatest5mCandle, analyzeMarket } } })`). No file on the frozen strategy surface (`src/engine/strategy.frozen.json`) changes; the strategy fingerprint stays `356e4189…`.

| Behaviour | Before | After |
|---|---|---|
| Resting timeframe | the 5m peek restored whatever resolution it found (30m in the incident) → two extra switches per poll | the peek's restore to a non-5m resolution is skipped once; the chart rests on 5m; the sweep then finds 5m as "original" and restores to 5m |
| 5m peek budget | frozen 8 × 500 ms, then CANDLE_READ_FAILED | the frozen peek is re-run up to 3 times inside 20 s (still far below the 60 s poll) |
| Sweep reads (10 timeframes) | one `getOhlcv` per timeframe; any non-empty array accepted (a series still belonging to the previous timeframe was consumed silently) | each read polls (250 ms) until the series is present AND verified to be the requested timeframe (minimum bar spacing over the last 12 bars), up to 6 s per read and 45 s per sweep; then fails closed exactly as before (fetch error → null → `DATA_UNAVAILABLE` for an entry timeframe) |
| Observability | `feed_failure_streak` only | `state.ops` in `state/xauusd_watcher_state.json`: per-day candle ledger (`candles_expected/processed/missed/unrecovered/recovered_late`, `candles_missed_times`, `feed_stalls`, `read_failed_polls`, `incomplete_mtf_reads`, `rebaselines`, processing delays) plus cumulative counters since process start (read failures, retries, wrong-timeframe reads, switch failures, sweep failures) |
| Missed-candle recovery | none ("no historical replay") | unchanged by design: a candle missed for a whole bar cannot be re-evaluated production-faithfully (the engine evaluates the latest confirmed candle from the live chart; a later alert would be refused as `STALE_SIGNAL` > 600 s). Counted and listed instead. A candle whose first poll failed is still evaluated by the next poll inside the same bar window, as before (`candles_recovered_late`). |

Decision path: unchanged. Same `peekLatest5mCandle`, same `analyzeMarket`/`calculateEntry`, same confirmed-candle semantics (last bar forming, second-to-last confirmed), same dedup, same executor gates. With ready data the wrapped sweep hands the engine byte-identical bars (`tests/watcher_data_reliability.test.js`).

## Operations
- Rollback lever without a code change: `XAUUSD_WATCHER_DATA_RELIABILITY=off` in the watcher's environment restores the legacy chart deps.
- The layer activates only on a watcher (re)start; a running watcher keeps the code it was started with.
- Startup banner line: `Watcher data-reliability layer: ON (resting timeframe 5, readiness-verified reads, peek outer attempts 3)`.
- If the owner changes the chart resolution by hand, the next poll moves it back to 5m once and logs `[watcher-reliability] chart found on resolution …` a single time per process.
