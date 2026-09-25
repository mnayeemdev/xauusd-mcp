# XAUUSD MCP — MT5 REAL execution, stage 1 (prepared, NOT armed)

A SEPARATE execution profile from the DEMO profile (`docs/XAUUSD_MT5_DEMO_EXECUTION.md`).
The DEMO watcher/executor keeps running independently; nothing in the DEMO path was weakened.

## Hard locks (code, not config)

| Item | Value | Where |
|---|---|---|
| Account | login **460149329**, server **Exness-MT5Real51**, trade mode REAL (2) | `src/engine/mt5RealPolicy.js`, `mt5/mt5_bridge_real.py` |
| Symbol | XAUUSDm only | both |
| Magic | **88052001** (DEMO is 88051501) | both |
| Lot | approved default 0.01; absolute stage-1 ceiling **0.02** (bridge refuses more) | both |
| Exits | close at ACTUAL position P&L **>= +30 USD**, **<= -50 USD** (monitor is primary) | policy fixed values, executor monitor |
| Broker fail-safe | SL at 50 USD P&L distance from fill, TP at +30, placed on the order and re-aligned to the real fill | `computeBrokerStops()` |
| One position, fresh signal after close, dedup, write-ahead intent, restart reconciliation, manual-position isolation, kill switch | same executor logic as DEMO | `src/engine/mt5Executor.js` (mode `real`) |
| Daily ceiling 10 (never a target), daily loss limit 50, 2 consecutive losses | REAL defaults | `mt5RealPolicy.js` |
| State / log / kill switch | `state/xauusd_mt5_real_executor_state.json`, `state/xauusd_mt5_real_trade_log.jsonl`, `state/xauusd_mt5_real_kill_switch` | separate from DEMO |

Env may only tune lot (<= 0.02), daily ceiling, consecutive losses, spread/drift limits and
commission estimate, each inside a hard range; identity, magic, +30/-50 and the cap are refused.

## Terminal requirement

The MetaTrader5 Python package talks to ONE running terminal per process. The DEMO terminal
(`C:\Program Files\MetaTrader 5`) must stay logged into 480236873. REAL execution therefore
needs a SECOND terminal instance (portable install / separate data folder) logged into
460149329 on Exness-MT5Real51, and `XAUUSD_MT5_REAL_TERMINAL_PATH` pointing at its
`terminal64.exe`. Without it the REAL bridge attaches to the DEMO terminal and every guard
fails closed (`REAL_VERIFICATION_FAILED`), which is the intended behaviour.

## Commands

- `tv xauusd mt5-real-status` — read-only, no arming needed, sends nothing.
- `tv xauusd watch --mt5-demo --mt5-real --engine intraday_5m` — one decision path, two isolated
  executors. REFUSED unless `XAUUSD_MT5_REAL_ARMED=ARM_REAL_460149329_STAGE1` is set.
- `tv xauusd mt5-real-close --yes` — manual close of the single MCP-owned REAL position.

Tests: `tests/mt5_real_policy.test.js`, `tests/mt5_real_executor.test.js`.

## Dynamic capital scaling (replaces fixed stage-1 sizing)

Before EVERY new trade the executor calls `config.computeSizing()` (`src/engine/mt5RealScaling.js`)
with the CURRENT broker facts (equity, free margin, leverage, margin-call/stop-out levels, price,
contract size, volume min/max/step, spread):

```
lossPct(E)  = clamp( 0.50 * (100 / E)^0.5 , 0.02 , 0.50 )     # 50% at 100 USD, sqrt decay, 2% floor
lossBudget  = E * lossPct(E)
envelope    = 25 USD of price for the max loss, 15 USD for the target (from +30/-50 at lot 0.02)
lot         = floor( lossBudget / (25 * contract) , broker step )  capped by broker max, config cap, absolute 1.00
maxLoss     = lot * 25 * contract        profitTarget = lot * 15 * contract
broker safety: margin <= free margin, margin <= 50% equity, equity survives max loss,
               projected margin level at max loss >= 100% and >= margin call + 10%, > stop-out,
               loss distance >= 4 spreads   -> otherwise step the lot DOWN; below broker min -> no trade
```
Lot is non-decreasing in equity (no martingale by construction); losses shrink the next lot
automatically; growth compounds sub-linearly. Env can only lower the ceiling / risk
(`XAUUSD_MT5_REAL_LOT_CAP`, `XAUUSD_MT5_REAL_MAX_LOSS_PCT_OF_EQUITY`, `XAUUSD_MT5_REAL_ABSOLUTE_LOT_CEILING`,
`XAUUSD_MT5_REAL_MARGIN_BUDGET_PCT`). Each INTENT/OPENED/CLOSED event records equity_before_trade,
sizing tier and formula inputs, approved_lot, profit_target_usd, maximum_loss_usd, required margin,
projected margin level at max loss, signal_id/model, realised_pnl and equity_after_close.

| equity | lot | target | max loss | margin @1:200 |
|---|---|---|---|---|
| 100 | 0.02 | +30 | -50 | 42.7 |
| 500 | 0.04 | +60 | -100 | 85.5 |
| 1,000 | 0.06 | +90 | -150 | 128 |
| 5,000 | 0.14 | +210 | -350 | 299 |
| 10,000 | 0.20 | +300 | -500 | 427 |
| 100,000 | 0.80 | +1,200 | -2,000 | 1,710 |

## Corrections after the 2026-09-25 REAL SELL audit (signal 3f7f5be75b35983c)

- **Lot is user-fixed at 0.01** (`REAL_FIXED_LOT`): `lotSize = maxLotSize = exactLot = 0.01`; every lot
  env name must restate 0.01 or the config throws; the executor refuses any other volume
  (`LOT_NOT_USER_APPROVED`); the bridge independently requires `REQUIRED_EXACT_VOLUME = 0.01`.
  Margin/stop-out safety is a VETO only (`assessSafety` -> `MARGIN_SAFETY_VETO`); the lot is never
  resized, and `chooseRealLot()` is reporting-only. Dynamic capital scaling is NOT wired in.
- **Thesis metadata persisted** on intent and position (`engine.thesis_id, direction, model,
  planned_entry, structural_stop, setup_level, objective, quality, rr, timeframe`).
- **Post-entry thesis invalidation exit** (`evaluateThesisInvalidation`, executor `reviewThesis`,
  called by the watcher on every processed confirmed candle BEFORE the alert path): exits on (A) a
  confirmed close beyond the structural stop, (B) a confirmed opposite BOS/CHoCH through the setup
  level after entry, (C) a NEW opposite actionable signal in the same market area. Never on ticks,
  wicks, spread, planner states or non-actionable candidates. Exit authorities: structural, +target,
  -max-loss, broker SL/TP, kill switch / manual. A close sets `last_close_at`, so the fresh-signal
  rule blocks re-entry on the same cycle.
- **Broker fail-safe SL** (`computeProtectiveStops`): min(monetary distance, structural risk x 1.5 +
  spread), never closer than 4 spreads or the broker stops level; TP stays at the monetary target.
- **Executable-geometry recheck** (`evaluateExecutableGeometry`): effective RR at the live bid/ask
  must be >= 1.7 before send (`EXECUTABLE_GEOMETRY_INVALID`); after fill, an invalid geometry is
  closed through the governed path (`FILL_GEOMETRY_INVALID`).
- **SR hardening** (intraday_5m): an SR entry against 5m structure needs a directional 15m bias or a
  fresh confirmed 5m sweep of the level; **1H support** for the 65 bar is a directional 1H regime only
  (RANGE/TRANSITION structure is context, not support).
- **RR quality** is unchanged and documented: qRr = 10 x (rr - 1.7) / 1.7, so RR at the hard minimum
  contributes 0 by design (5 at RR 2.55, 10 at RR >= 3.4).
- At 0.01 lot the configurable monetary envelope means 30 USD (+30) and 50 USD (-50) of price.

Tests: `tests/mt5_real_thesis_exit.test.js`, `tests/mt5_real_policy.test.js`, `tests/mt5_real_executor.test.js`.

## Continuous monitoring policy (2026-09-25)

The REAL profile no longer has a daily realised-loss entry lock (`dailyLossLimitUsd = null`; a positive
`XAUUSD_MT5_REAL_DAILY_LOSS_LIMIT_USD` re-enables it explicitly). A realised loss never freezes entries until
00:00 UTC. Market analysis is continuous regardless; after a close, a genuinely NEW confirmed intraday_5m
signal that passes every entry gate may trade. Unchanged: consecutive-loss breaker (2, counted per UTC day as
before), kill switch, daily trade ceiling (10), one position, fresh signal after close, dedup, thesis guard,
lot 0.01, structural exit, effective-RR recheck. DEMO keeps its own daily limit (25).

## Adaptive trade management + capital-aware architecture (2026-09-25)

`src/engine/mt5TradeManagement.js` (pure) runs once per newly confirmed 5m candle on an open position,
before the alert path. States: HOLD, THESIS_INVALIDATION_CLOSE, THESIS_DETERIORATION_CLOSE,
PROFIT_PROTECT_CLOSE (strategy authorities, in that precedence), MONETARY_PROFIT_CLOSE,
MONETARY_MAX_LOSS_CLOSE (actual-P&L monitor), BROKER_PROTECTIVE_CLOSE, EMERGENCY_CLOSE (kill switch /
manual / safety close). Exact rules are documented in the module header (progress in R from confirmed
highs/lows; profit protection = progress >= 1R AND confirmed reversal; deterioration = losing on a
confirmed close AND >= 2 factors including at least one post-entry development). Stale evidence never
drives an exit; each confirmed bar is evaluated once; a close executes once and is fully audited
(exit_state, evidence, market context, MFE/MAE, broker response). Broker SL/TP stay unchanged after
entry (structural fail-safe); adaptive exits go through the governed close path.
`src/engine/mt5CapitalPolicy.js` separates capital state, monetary policy, lot policy (USER_FIXED 0.01;
scaling projection reported only) and structural risk. No loss-recovery sizing exists.

## NEWS + VOLATILITY SHOCK PROTECTION V1 (2026-09-25)

A safety/context layer on top of the unchanged entry authority: news windows
(pre / active / cooldown around gold-relevant USD releases), a relative
volatility shock detector (spread / velocity / jump / range vs. the live
baseline), feed-health and relative-spread gates for NEW orders, and risk-only
emergency handling for an open position (restore a vanished broker SL; close
when the market is already beyond the broker SL). It never produces a direction
and never closes a position because of news, spread, a shock or a stale feed.
Cannot be disabled for the REAL profile (provider `none` is audited as
`DISABLED`). Full specification, defaults, env names and audit events:
`docs/XAUUSD_NEWS_SHOCK_PROTECTION.md`. Tests:
`tests/news_shock_protection.test.js`.
