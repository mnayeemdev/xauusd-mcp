# XAUUSD MCP Calculation Engine

MCP is now the primary calculation engine. It reads raw OHLCV directly
from TradingView and computes the trading decision itself — it does not
require or read the Pine indicator's `ACTION` to produce a result. The
existing Pine indicator/strategy are unchanged and remain available as a
reference/comparison source, never deleted.

## Architecture

```
TradingView (OANDA:XAUUSD, 5m/15m/30m raw OHLCV)
  → src/core/xauusd_calculate.js  (orchestrator: fetch, validate, restore chart)
    → src/engine/regime.js        (BULL_TREND/BEAR_TREND/RANGE/COMPRESSION/TRANSITION/HIGH_VOLATILITY/CHOP_UNCERTAIN)
    → src/engine/structure.js     (pivots, HH/HL/LH/LL, BOS/CHoCH, sweeps, range — no lookahead)
    → src/engine/correction.js    (ACTIVE/RESOLVED/NONE, 3-bar confirmation)
    → src/engine/models.js        (TC/PB/BO/MR/SR eligibility + trigger)
    → src/engine/risk.js          (entry/SL/TP1/TP2/RR, overextension + RR gates)
    → src/engine/quality.js       (0-100 quality score, threshold gate)
    → src/engine/mtf.js           (30m context / 15m primary / 5m conflict check)
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
node --test tests/engine_calculation.test.js   # engine unit tests, synthetic fixtures only
npm run test:unit                              # full project regression
```

## Notes

- No broker orders are placed anywhere in this engine.
- P8 (Pine-based prospective forward observation) continues unaffected
  in parallel — `validation/p8_candidate_lock.json` and
  `validation/p8_forward_boundary.json` are untouched by this engine.
- The MCP engine's own signal ledger (`validation/mcp_engine_signals.json`)
  is separate from P8's Pine-based ledger and is never mixed with it.
