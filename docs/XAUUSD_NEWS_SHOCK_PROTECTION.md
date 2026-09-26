# XAUUSD MCP — NEWS + VOLATILITY SHOCK PROTECTION V1 (2026-09-25)

> **Superseded on 2026-09-26 by News Protection V2** (`docs/XAUUSD_NEWS_PROTECTION_V2.md`): tiered calendar windows (Tier B CPI/NFP T+60, Tier A FOMC cluster anchor+150) and remembered events; everything else in this document (shock detector, guards, emergency handling, DATA_UNAVAILABLE, audit) is unchanged and remains authoritative. The generic 30 / 5 / 30 windows below are now the Tier C defaults.

A safety/context layer for the REAL MT5 profile. It sits on top of the unchanged
intraday_5m entry authority and does exactly two things:

1. **Vetoes NEW orders** while a gold-relevant news window or a confirmed
   volatility shock is in force (and while the feed, the relative spread or the
   calendar cannot be trusted).
2. **Risk-only emergency handling** for an OPEN position: restores a vanished
   broker SL, and closes through the governed path when the market already
   trades beyond the broker SL while the position is still open.

It never produces a direction, never reads news sentiment, and never closes a
position because of news, spread, a shock state or a stale feed. Every decision
and every state transition is written to the REAL audit log.

Unchanged REAL authorities: exact 0.01 lot, entry engine, adaptive trade
management, structural/thesis exits, broker SL/TP, one-position guard,
dedup/fresh-signal guards, consecutive-loss protection, kill switch. The
protection guards run AFTER all of them (`evaluateEntry` first, then the guards).
The DEMO profile has no protection flag and behaves exactly as before.

## Modules

| File | Role | I/O |
|------|------|-----|
| `src/engine/newsCalendar.js` | Normalises provider records into one event shape; timezone policy; dedup; gold relevance | pure |
| `src/engine/newsRisk.js` | News state machine + entry verdict + transition records | pure |
| `src/engine/newsMonitor.js` | Calendar providers (`http_json`, `file`, `none`), cache, snapshot, provider health | the only I/O |
| `src/engine/marketShock.js` | Spread / velocity / jump / range shock detector, relative spread gate, emergency conditions | pure |
| `src/engine/protectionGuards.js` | Guard interface `{ name, evaluate(ctx) }`; news, shock, feed, spread, normalisation guards | pure |
| `src/engine/mt5RealPolicy.js` | Configuration envelope (`news*`, `shock*` fields, env names, hard ranges) | pure |
| `src/engine/mt5Executor.js` | REAL integration: tick sampling, protection evaluation, entry veto, block/normalise bookkeeping, fast safety monitor, status | executor |
| `src/cli/commands/xauusd.js` | Builds the provider + monitor from config and injects them into the REAL executor | CLI |

Tests: `tests/news_shock_protection.test.js` (pure functions + scripted REAL
bridge; no network, no files, no orders). Fixtures:
`tests/fixtures/ff_calendar_synthetic.json` (synthetic Forex-Factory-shaped
week, including a duplicate and a naive-time record) and
`tests/fixtures/news_test_monitor.js` (permissive / scripted / fixture monitors).

## News states

| State | Meaning | New entries |
|-------|---------|-------------|
| `NORMAL` | no relevant event inside any window, calendar fresh | allowed |
| `PRE_NEWS` | a relevant release is due within `newsPreWindowMin` | blocked |
| `NEWS_ACTIVE` | release time reached; inside `newsActiveWindowMin` after it | blocked |
| `POST_NEWS_COOLDOWN` | inside `newsCooldownMin` after the active window | blocked |
| `DATA_UNAVAILABLE` | provider configured but data missing / stale / errored | blocked (`BLOCK`) or allowed-and-audited (`ALLOW`) |
| `DISABLED` | provider `none` (operator choice) | allowed, audited as `NEWS_DISABLED` |

Precedence when windows overlap: `NEWS_ACTIVE` > `PRE_NEWS` > `POST_NEWS_COOLDOWN`
(all block; precedence decides the reported state). `DATA_UNAVAILABLE`
overrides everything because the calendar cannot be trusted. `block_ends_utc`
is the latest end of the phases currently in force.

**Gold relevance (V1, deterministic):** currency `USD` AND (impact `HIGH` OR the
name matches a central-bank decision pattern: FOMC Statement / Press Conference /
Economic Projections, Federal Funds Rate, Fed Chair). The provider's impact grade
is primary; the patterns only make sure a rate decision is never missed.

**Timezone policy:** a source time is accepted only with an explicit `Z` or
numeric offset, as a unix epoch, or as a naive string with a known source
offset supplied by the caller. Anything else becomes `UNSCHEDULABLE`, is
counted and reported (`dropped`), and can never move a window by hours.

## Default windows and why

| Parameter | Default | Env | Range | Reason |
|-----------|---------|-----|-------|--------|
| `newsPreWindowMin` | 30 | `XAUUSD_NEWS_PRE_WINDOW_MIN` | 5–240 | a 5m confirmed-candle setup entered in the last half hour would be resolved by the release, not by structure |
| `newsActiveWindowMin` | 5 | `XAUUSD_NEWS_ACTIVE_WINDOW_MIN` | 1–60 | the print itself and the first repricing |
| `newsCooldownMin` | 30 | `XAUUSD_NEWS_COOLDOWN_MIN` | 5–240 | typical XAUUSD post-release spread / velocity tail |
| `newsStaleSec` | 21600 (6 h) | `XAUUSD_NEWS_STALE_SEC` | 600–172800 | a weekly feed refreshed every 15 min that could not be refreshed for 6 h is no longer trusted |
| `newsFetchIntervalSec` | 900 | `XAUUSD_NEWS_FETCH_INTERVAL_SEC` | 300–86400 | conservative cadence for a third-party feed |
| `newsDataUnavailablePolicy` | `BLOCK` | `XAUUSD_NEWS_DATA_UNAVAILABLE_POLICY` | `BLOCK` / `ALLOW` | fail closed by default |
| `newsProvider` | `http_json` | `XAUUSD_NEWS_PROVIDER` | `http_json` / `file` / `none` | |
| `newsCalendarUrl` | Forex Factory weekly JSON | `XAUUSD_NEWS_CALENDAR_URL` | https only | |
| `newsCalendarFile` | — | `XAUUSD_NEWS_CALENDAR_FILE` | required for `file` | |
| `shockClearAfterSec` | 600 | `XAUUSD_SHOCK_CLEAR_AFTER_SEC` | 60–3600 | quiet period before a shock may normalise |

`XAUUSD_NEWS_PROTECTION` cannot disable the layer for the REAL profile (the
config throws). Running without a calendar is `XAUUSD_NEWS_PROVIDER=none`, which
is audited as `DISABLED` on every decision.

## Calendar provider

`http_json` fetches the weekly JSON the Forex Factory calendar widget consumes
(`https://nfs.faireconomy.media/ff_calendar_thisweek.json`): one small GET per
interval, hard timeout, no retries inside one call, no HTML, no session. The
terms of automated third-party use of that feed are not formally published, so
the URL is configuration, the cadence is conservative, and any other provider
(`file`, or a licensed feed written to a file) substitutes without touching the
state machine. https://www.forexfactory.com/calendar remains the human
cross-check.

The last good calendar is persisted at `state/xauusd_news_calendar_snapshot.json`
so a restart does not begin in `DATA_UNAVAILABLE`. A provider failure after a
good fetch keeps the last good events (freshness still enforced) and counts
`consecutive_failures`. `evaluate()` is synchronous over the cache; refreshes run
in the background, so a network problem can never stall an entry decision or
the P&L monitor.

## Volatility shock detector

Inputs the executor already has: one bid/ask sample per monitor pass (~3 s) and
the confirmed 5m bars of the latest analysis (ATR 14 on the bars before the last
one). Every signal is relative to the recent baseline, never one fixed number:

| Trigger | Condition |
|---------|-----------|
| `SPREAD_SHOCK` | spread ≥ 3× median spread of the trailing 30 min (excluding the last 60 s) AND ≥ 0.5 USD |
| `VELOCITY_SHOCK` | \|mid(now) − mid(now − 60 s)\| ≥ 1.5 ATR |
| `JUMP_SHOCK` | \|mid(now) − mid(previous sample)\| ≥ 1.0 ATR AND the level before the jump differs from the level after it by ≥ 0.5 ATR (a single reverting bad tick is not a jump) |
| `RANGE_SHOCK` | last confirmed 5m true range ≥ 3 ATR, or the 5-minute sample window spans ≥ 3 ATR |
| feed stale | quote age > 90 s: blocks entries, never a shock, never closes |

States: `INSUFFICIENT_DATA` (fewer than 20 baseline samples or fewer than 16
confirmed bars: no shock claim either way; the absolute gates still apply),
`NORMAL`, `VOLATILITY_SHOCK` (entered only after 2 consecutive positive
evaluations; cleared only after `shockClearAfterSec` without any trigger AND
spread ≤ 1.5× baseline AND velocity ≤ 0.75 ATR — normalisation is a condition,
not a clock).

**Relative spread gate for new orders:** spread ≥ 2× baseline AND ≥ 0.35 USD
rejects (`SPREAD_ABNORMAL`), on top of the absolute REAL maximum (0.6 USD)
applied by `evaluateEntry` first. Without a baseline the absolute gate alone
applies and the decision is audited.

## Entry guard order and reasons

After every existing REAL gate passes, the guards run in this order; the first
block is the verdict, but every guard's result is recorded:

`news` (`NEWS_ENTRY_BLOCK`, `NEWS_DATA_UNAVAILABLE_BLOCK` / `_ALLOWED`,
`NEWS_DISABLED`) → `shock` (`VOLATILITY_SHOCK_ENTRY_BLOCK`,
`SHOCK_BASELINE_UNAVAILABLE_ABSOLUTE_GATES_ONLY`) → `feed`
(`FEED_UNHEALTHY_BLOCK`) → `spread` (`SPREAD_ABNORMAL`,
`SPREAD_BASELINE_UNAVAILABLE_ABSOLUTE_GATE_ONLY`) → `normalization`
(`PROTECTION_BLOCK_ACTIVE`, `SIGNAL_PREDATES_NORMALIZATION`).

A signal calculated before the last block cleared is a pre-news / pre-shock
signal and is never replayed after normalisation.

## Emergency handling (open position, risk only)

| Condition | Action | Audit |
|-----------|--------|-------|
| live position carries no broker SL although one was placed | re-send SL/TP through the bridge, at most once a minute | `EMERGENCY_SL_RESTORE`, `EMERGENCY_SL_RESTORED` / `EMERGENCY_SL_RESTORE_FAILED` |
| bid (BUY) / ask (SELL) beyond the broker SL by more than 0.5 USD while still open | close through the governed path | `CLOSE_TRIGGERED` (`EMERGENCY_BROKER_BOUNDARY_BREACHED`, source `FAST_SAFETY_MONITOR`), `CLOSED` (`EMERGENCY_CLOSE`) |

Spread expansion, a shock state, a stale feed or a news window never close a
position. The monetary monitor (+30 / −50) and adaptive management keep their
authority throughout.

## Audit events

`PROTECTION_STARTED`, `NEWS_STATE_CHANGED`, `SHOCK_STATE_CHANGED`,
`PROTECTION_BLOCK_STARTED` (`reasons`, `open_position_action: 'NONE'`),
`PROTECTION_NORMALIZED` (`cleared_at`), the emergency events above, and a
`protection` block on every `SKIPPED` / `INTENT` / `OPENED` carrying: news state,
event id / name / currency / impact / release time / minutes to event /
actual / forecast / previous, provider and freshness, shock state and
triggers, spread / baseline / ratio, velocity and ATR, range, jump, quote age,
block status, and each guard's verdict.

`xauusd mt5-status` reports the same under `news_protection`.

## Deployment note (2026-09-25)

The REAL watcher process that was running while V1 was written (started
16:31 IST, before these files existed) runs the pre-V1 code. The layer becomes
active only when that process is restarted, which must happen only when the REAL
account is confirmed FLAT (no open position, no pending intent). The state file
must never be edited by hand; `state.protection` is created by the executor on
first start.
