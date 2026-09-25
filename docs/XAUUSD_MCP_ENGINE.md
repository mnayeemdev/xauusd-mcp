# XAUUSD MCP Calculation Engine

MCP is now the primary calculation engine. It reads raw OHLCV directly
from TradingView and computes the trading decision itself — it does not
require or read the Pine indicator's `ACTION` to produce a result. The
existing Pine indicator/strategy are unchanged and remain available as a
reference/comparison source, never deleted.

## Architecture

```
TradingView (OANDA:XAUUSD, 5m/15m/30m + 1H/2H/4H/8H/1D/1W/1M raw OHLCV)
  → src/core/xauusd_calculate.js  (orchestrator: fetch, validate, restore chart)
    → src/engine/regime.js        (BULL_TREND/BEAR_TREND/RANGE/COMPRESSION/TRANSITION/HIGH_VOLATILITY/CHOP_UNCERTAIN)
    → src/engine/structure.js     (pivots, HH/HL/LH/LL, BOS/CHoCH, sweeps, range — no lookahead)
    → src/engine/correction.js    (ACTIVE/RESOLVED/NONE, 3-bar confirmation)
    → src/engine/models.js        (TC/PB/BO/MR/SR eligibility + trigger — 5m/15m/30m only)
    → src/engine/risk.js          (entry/SL/TP1/TP2/RR, overextension + RR gates — 5m/15m/30m only)
    → src/engine/quality.js       (0-100 quality score, threshold gate — 5m/15m/30m only)
    → src/engine/mtf.js           (30m context / 15m primary / 5m conflict check — unchanged)
    → src/engine/htf.js           (1H/2H/4H/8H/1D/1W/1M context + single 1H conflict gate — new)
    → src/engine/signalStore.js   (dedup, entry freeze, OPEN→PASS/FAIL)
  → src/core/presentation.js::formatEngineDecision()  (Claude-readable text)
```

All engine modules are pure functions over plain OHLCV arrays — no
TradingView/Pine dependency, fully unit-testable (`tests/engine_calculation.test.js`).

## Market inputs

Raw OHLCV for `OANDA:XAUUSD` on 5m/15m/30m, fetched by briefly switching
the chart's timeframe (the CDP architecture has no other way to read a
non-active timeframe) and restoring the original timeframe afterward.
Up to 500 bars per timeframe. The **last bar returned is always treated
as forming/unconfirmed** and excluded from every calculation; only
confirmed, closed bars feed the engine. Data is rejected (status
`DATA_UNAVAILABLE`) rather than used if there are too few confirmed
bars, non-monotonic/duplicate timestamps, or invalid OHLC geometry.

## WAIT gates (checked in this order)

`INSUFFICIENT_DATA` → `CHOP`/`TRANSITION` regime → `CORRECTION_ACTIVE` →
`NO_ELIGIBLE_STRATEGY` (no model triggered) → `OVEREXTENDED` →
`RR_NOT_ACCEPTABLE` → `NO_GOOD_ENTRY` (quality below threshold) →
otherwise BUY/SELL. Every WAIT carries `entry/sl/tp1/tp2/rr = null` —
never fabricated trade geometry.

Locked reference values (from the already-researched P7 candidate C4,
**not retuned in this implementation**): `minRR = 1.7`,
`qualityThreshold = 65`, `corrResolveConfirmBars = 3`.

## Multi-timeframe combination

30m is higher-timeframe context, 15m is the primary decision timeframe,
5m is a lower-timeframe conflict check. This is **not** "any timeframe
BUY = BUY" — 15m's own independently-computed decision is authoritative
unless it materially conflicts with 30m's trend or an actively opposing
fresh 5m structural break, in which case the result is
`WAIT / ENTRY_CONFLICT`. If 30m's context itself is unclear, the result
is `WAIT / HTF_CONTEXT_UNCLEAR`.

## Higher-timeframe context (1H/2H/4H/8H/1D/1W/1M)

`src/engine/htf.js` adds a read-only context/filtering layer above the
unchanged 5m/15m/30m entry pipeline:

```
1M + 1W   -> macro direction/regime/structure only, never gate or generate an entry
1D+8H+4H  -> major trend/regime/structure (informational)
2H+1H     -> intermediate trend, correction/pullback state (informational)
```

Each context timeframe reuses the SAME `classifyRegime`/`computeStructure`/
`computeCorrection` primitives the entry pipeline already uses (same
params, not retuned) but never runs model eligibility, risk, or quality —
it never produces a BUY/SELL candidate by itself.

The **only** way a higher timeframe changes the outcome is a single
explicit gate at 1H (`HTF_GATE_TIMEFRAME`), which reuses the exact same
regime-opposition rule already applied by 30m against 15m, one tier
higher: if 1H's regime is a clear, currently-available opposing trend
(`BEAR_TREND` vs. a BUY, `BULL_TREND` vs. a SELL), the result is
`WAIT / HTF_CONFLICT` with null trade geometry. This is **one**
authoritative layer, not majority voting across all context timeframes,
and an unavailable/unclear 1H context never blocks (informational only —
the engine does not WAIT merely because every timeframe isn't perfectly
aligned). 1M/1W are never read by this gate.

Each context timeframe's data is fetched and validated exactly like an
entry timeframe (confirmed/forming split, monotonic-timestamp and OHLC
geometry checks, staleness heuristic) but a context timeframe's own data
failure only degrades that one timeframe's reported context to
`DATA_UNAVAILABLE` — unlike 5m/15m/30m, it never fails the whole call
closed to `DATA_UNAVAILABLE`.

## BUY/SELL output

```
BUY
Entry: <computed>
SL: <computed>
TP1: <computed>
TP2: <computed>
RR: <computed>
Setup: <TC|PB|BO|MR|SR>
Quality: <0-100>/100
```
Every value comes from `computeRisk()`/`scoreQuality()` — never guessed,
derived after the fact, or moved once a signal is registered
(`src/engine/signalStore.js` freezes entry/SL/TP/side/model/regime/
signal time and enforces immutability; the same setup on the same origin
bar reuses the same signal ID rather than emitting a duplicate).

## Pine comparison (informational only)

If the Pine indicator is present and readable, its state is attached as
`pine_reference` for comparison — it never changes the MCP result. If
both engines are independently **actionable but pointing opposite
directions**, the combined result fails closed to `WAIT / ENGINE_DISAGREEMENT`
for launch safety. One engine being WAIT while the other is actionable
is recorded informationally and does not force WAIT.

## Claude's role

Claude explains and summarizes the MCP result; it never overrides it.
If MCP says WAIT, Claude says WAIT. If MCP data is unavailable, Claude
says `DATA UNAVAILABLE — NO TRADE DECISION`. If MCP says BUY/SELL,
Claude uses the exact MCP entry/SL/TP/RR values, never its own.

## How to start it tonight

```
npm run xauusd:launch-check   # connectivity, C4, source hashes, profile counts — never trades
npm run xauusd:check          # runs the engine, prints only the final WAIT/BUY/SELL decision
```

Or via the CLI directly: `node src/cli/index.js xauusd calculate` (full
structured result) / `node src/cli/index.js xauusd check` (short
decision only).

Through MCP: `xauusd_calculate_entry` is registered in the
**Development** profile (it switches chart timeframe internally to
gather 5m/15m/30m data, which disqualifies it from the non-mutating
Research profile — see `src/profiles.js`). `xauusd_master_state` (the
original Pine-reading tool) remains in both profiles unchanged.

## How to test

```
node --test tests/engine_calculation.test.js    # entry-tier (5m/15m/30m) engine unit tests, synthetic fixtures only
node --test tests/engine_htf_context.test.js    # higher-timeframe context + gate unit tests, synthetic fixtures only
npm run test:unit                               # full project regression
```

## Notes

- No broker orders are placed anywhere in this engine.
- P8 (Pine-based prospective forward observation) continues unaffected
  in parallel — `validation/p8_candidate_lock.json` and
  `validation/p8_forward_boundary.json` are untouched by this engine.
- The MCP engine's own signal ledger (`validation/mcp_engine_signals.json`)
  is separate from P8's Pine-based ledger and is never mixed with it.

## Engine profiles: `reference_15m` (default) and `intraday_5m`

Two decision layers share every other part of the engine (10-timeframe
fetch, validation, signal store, dedup, Pine comparison, MT5 execution):

| | `reference_15m` (default, unchanged) | `intraday_5m` (DEMO forward test) |
|---|---|---|
| Entry authority | 15m pipeline | **5m** pipeline (`src/engine/intraday/`) |
| 15m role | decides | bias / regime / correction phase / eligible model set |
| 30m | regime opposition vetoes | vetoes only when regime **and** structure both oppose |
| 1H | regime opposition vetoes | vetoes MR and trades not aligned with the 15m bias; aligned continuation gets a quality penalty |
| TRANSITION | hard WAIT | NEUTRAL bias, level models only (quality bar 70) |
| CORRECTION_ACTIVE | hard WAIT | selects the 5m Pullback model (5m correction measured against the 15m bias) |
| Models | BO, TC, PB, MR, SR | **MC** (momentum continuation), PB (5m), BO, SR (with rejection-candle evidence), MR (15m RANGE only) |
| TP2 | last-5-pivot extreme | nearest structural objective ≥ 1.0R, minor objectives skipped, cap 3R |
| Quality / RR | 65 / 1.7 | 65 / 1.7 (verbatim); + volatility-sufficiency gate |
| Signal identity | timeframe `15m` | timeframe `5m` (coexists in the same store) |
| Result schema | `1.1.0` | `1.2.0`, plus `engine_profile`, `bias`, `diagnostics.objective` |

Selection: `--engine intraday_5m` on `tv xauusd calculate|check|watch`, or
`XAUUSD_ENGINE_PROFILE=intraday_5m`. Nothing selected = `reference_15m`,
whose code path and constants are untouched (still the locked P7/C4
reference). Unknown values throw before any chart sweep.

Unchanged under both profiles: confirmed candles only, WAIT whenever no
model triggers, one MCP position at a time, fresh signal after close,
dedup/restart/replay/reconnect protection, and every MT5 DEMO safety rule
(`docs/XAUUSD_MT5_DEMO_EXECUTION.md`). Tests: `tests/engine_intraday.test.js`.

### intraday_5m: replay-verified adjustments (2026-09-25)

A bar-by-bar replay of the 2026-09-25 session (89 confirmed 5m bars, prefix-only
data on every timeframe, no look-ahead) found two implementation issues and
one observability gap. Nothing else was changed; quality 65 / RR 1.7 are intact.

1. **BO stop anchor** (`models5m.js`): the Breakout/Retest stop is now placed
   beyond the *retest extreme* (highest high after the breakout for a SELL,
   lowest low for a BUY). Before, the stop fell back to the prior 5m swing,
   3 to 6 ATR away, and turned every BO candidate with a legitimate objective
   into an RR 1.0 to 1.4 rejection. Objective selection was correct and is
   unchanged.
2. **Quality bar under NEUTRAL 15m bias** (`pipeline5m.js`,
   `resolveQualityThreshold()`): the 70 bar applies only when *nothing*
   supports the side. When the 1H tier supports it (regime or structure agrees
   and neither opposes), the normal 65 bar applies, because that is
   directional context. Model eligibility under NEUTRAL bias is unchanged
   (MC/PB still require a directional 15m bias; the replay showed the
   counterfactual "qualified bias" rule would have triggered nothing).
3. **Planner** (`xauusd_analyze_market.js`, `presentation.js`): on the
   intraday profile, evidence and the pre-entry plan are computed from the
   confirmed 5m bars, and the engine's own blocked 5m candidate is attached as
   `pre_entry_plan.engine_candidate` (model, side, provisional entry/SL/TP1/TP2,
   RR, quality vs bar, exact blocker, condition still required). It is
   planning-only: the top-level entry/sl/tp fields stay null on WAIT and are
   the only fields the executor reads.

Regression fixture: `tests/fixtures/xauusd_intraday_session_2026-09-25.json`
(real bars, used for invariants only, never for trade counts or outcomes).
