# XAUUSD PRE-MARKET ENGINEERING FREEZE (2026-09-26, weekend, market closed)

This freezes the intended PRODUCTION ENGINEERING BASELINE for controlled market-open runtime validation.
It is NOT strategy approval, NOT edge proof and NOT capital-scaling approval. EDGE_DEMONSTRATED = NO. CAPITAL_SCALING_READY = NO.

## Identity of the baseline

| Item | Value |
|---|---|
| FINAL_HEAD | the commit that introduced this file: `git log -1 --format=%H -- docs/XAUUSD_PRE_MARKET_FREEZE.md` (subject `chore: freeze XAUUSD pre-market engineering baseline`) |
| ROLLBACK_CHECKPOINT | `2933ab263212feb8400c3d40f1c9f3ffd051a926` (`feat: add controlled XAUUSD demo forward validation`) — the tree the RUNNING REAL watcher v8 is byte-identical to on the strategy surface (its own load was e46b3be; no strategy-surface file changed between e46b3be and 2933ab2) |
| STRATEGY_FINGERPRINT | `356e41898259af88e459c4d5287f346992ad5c308c9f7aee1ee141671f1e46ed` (registry `src/engine/strategy.frozen.json`, version `PROD_STRATEGY_2026-09-26_PREMARKET_FREEZE`, 50 files, engine profile `intraday_5m`; verify with `npm run xauusd:fingerprint`) |
| CONFIG_FINGERPRINT | code defaults with an empty environment, pinned inside the registry (`config_fingerprint`); the pre-market report compares the RUNNING executor's `PROTECTION_STARTED.news_params` against these defaults |
| Tests | full unit suite `npm run test:unit` = **2181 / 2181 PASS** (104 files; previous baseline 1388 across 53 files — 50 previously unlisted offline suites plus 3 new suites were added, none excluded); lint 0 errors (4 pre-existing warnings unchanged) |
| Python bridges | `mt5/mt5_bridge_real.py`, `mt5/mt5_bridge.py` hardened and verified offline through `tests/fixtures/fake_mt5_bridge_harness.py` (no terminal, no orders) |

## Runtime process state at freeze (verified read-only)

- REAL watcher v8 RUNNING (`tv xauusd watch --mt5-real --engine intraday_5m`), REAL bridge sidecar RUNNING, lock held by the watcher pid. Account 460149329 / Exness-MT5Real51 verified at its last start (13/13 checks), equity ≈ 62 USD, lot 0.01, magic 88052001. REAL flat, last intent FILLED (resolved 2026-09-25), not halted, breaker counter 0 today, protection BLOCKING `FEED_STALE` (weekend, expected).
- Stage 11C shadow observer RUNNING (read-only), evidence store healthy (0 malformed).
- Stage 12 DEMO validator READY_NOT_STARTED (no independent DEMO terminal); NOT to be activated this weekend.
- No REAL watcher restart, no REAL/DEMO trade, no breaker reset, no lot change, no scaling, no account switch happened during the freeze work.

## What the RUNNING process does NOT yet have (activation requires the next AUTHORIZED restart)

The following hardening is in the tree and tested but is not loaded by the live v8 process (Node loads code at start). No restart was performed (production policy). Until the next authorized restart the live process behaves exactly as before this freeze, which the audit found safe for controlled validation with the operational guards below.

1. Executor: `ORDER_STATE_AMBIGUOUS` / `POST_SEND_EXCEPTION` treated as ambiguous (halt + reconcile, never a rejection); `HALT_CLEARED_BY_RESTART` audit; ANOMALY dedupe; corrupt-state preservation; torn-audit-line guard; Windows rename retry; ops alerts for HALTED/ORDER_AMBIGUOUS/OPENED/CLOSED/EMERGENCY/ANOMALY/REJECTED/CLOSE_FAILED/bridge down.
2. Bridge transport: stdin error handling (no process crash), hung/never-ready sidecar retired and respawned, `onDown` alert.
3. Python bridges: MetaTrader5 `None` results raised as `POSITIONS_UNAVAILABLE`/`HISTORY_UNAVAILABLE` (unknown is never empty), retcodes 10008/10012 ambiguous, magic allowlist, `sl <= 0` modify refused, terminal re-attach. (The running python sidecar keeps the old file until restart.)
4. News V2 monitor: empty/unusable calendar payload rejected like a failed fetch (never fail-open).
5. Watcher: cycle-error one-shot alert; signal store atomic write; execution log wording.
6. CLI: watcher lock BEFORE executor start; status/close commands refused while the watcher runs; `--mt5-real` requires `intraday_5m`; process guards (unhandled rejection / uncaught exception logged + alerted); on-demand engine reads use an ephemeral signal store (also the MCP calculate tool — active immediately for new MCP sessions).

Operational guards that ARE effective immediately (they act on new processes, not the running one): no second executor can be started beside the live watcher; the read-only `npm run xauusd:premarket` replaces `mt5-real-status`.

## Findings summary (audit of the whole repository)

- P0 fixed in code: executor started before the single-instance lock; "read-only" status commands reconciling/persisting the live REAL state; python bridges mapping `None` (IPC error) to "no positions / no deals".
- P1 fixed in code: non-atomic signal store; hidden entry-blocking authority of manual/MCP engine reads; engine profile not enforced for REAL; ambiguous-after-send codes classed as rejections; stdin EPIPE crash path; hung sidecar; empty-calendar fail-open; manual close beside a live watcher; audit torn lines; corrupt state overwritten; missing ops alerts; validator `--check` beside a live validator.
- P1 documented, NOT changed (owner decisions / accepted limitations): breaker scoped per UTC day; calendar freshness keyed to Last-Modified; `ALLOW`/`none` news configuration accepted (audited, flagged); adopted positions without thesis management; `close_requested` not replayed after restart; early start-halt leaves the 3 s monitor off; Pine veto has no DEMO equivalent.
- P2/P3 fixed: log wording, ANOMALY spam, docs reconciliation (7 documents), runtime signal store untracked from git, unit script completeness.
- UNRESOLVED_P0 = none.

## Known limitations carried into validation

- Pine reference veto (`ENGINE_DISAGREEMENT`) exists only in production; the DEMO validator flags `pine_parity` on every SIGNAL record. 0 vetoes recorded to date.
- The first confirmed 5m candle after the weekend is analysed as soon as the feed recovers; execution is additionally gated by `FEED_STALE` clearing, the fresh-signal rule (`SIGNAL_PREDATES_NORMALIZATION`), spread, shock warm-up and News V2 (tested: `tests/weekend_hardening.test.js` B).
- Broker timestamps are assumed UTC (Exness GMT+0), consistent with all audited rows.
- Alerts are local (console + Windows toast); no remote channel.

## Required market-open checks and blocking conditions

See `docs/XAUUSD_PRE_MARKET_CHECKLIST.md` (runbook steps 1–14, one command `npm run xauusd:premarket[:live]`). Any FAIL in the report blocks controlled validation until resolved; the system's own gates (listed there in §C) block trading without operator action.

## Rollback

`git checkout 2933ab2` restores the pre-freeze tree (identical strategy surface). Runtime files under `state/` are never touched by a checkout. The running v8 process is unaffected by any checkout until restarted.
