# XAUUSD Adaptive Master ↔ MCP Output Contract (Phase 2B)

**Status: provisional design, not yet implemented in a real Pine script.**
The XAUUSD Adaptive Master Pine indicator does not exist yet. This document
and `src/core/master_contract.js` define the contract that indicator MUST
implement once it is authored. Every field name, enum value, and transport
shape below is a design decision made without inspecting real Pine source
(there is none to inspect yet) — not something observed from a live
indicator. If the real script ends up differing, update this document and
the parser together; do not let them drift apart.

See [XAUUSD_ADAPTIVE_MASTER.md](XAUUSD_ADAPTIVE_MASTER.md) for the broader
architecture, profile system, and security model (all unchanged by Phase 2B).

## 0. Non-negotiable trading principle

> **NO GOOD ENTRY → WAIT.** Signal quantity is not a goal; a session that
> ends in WAIT is a successful outcome, not a failure. Every gate below
> exists to keep it that way — nothing in this contract or its parser can be
> loosened to manufacture a signal.

## 1. Authority boundary

**Pine is the authoritative trading-rule engine.** MCP is transport, a
structured reader, a provenance layer, and a research/debugging interface —
never a decision-maker. `src/core/master_contract.js` (the parser) and
`getMasterState()` (`src/core/xauusd.js`) never compute BUY, SELL, WAIT,
regime, correction completion, setup validity, trigger confirmation, entry
quality, entry, SL, TP, or RR from raw OHLCV, EMA, RSI, MACD, ATR, chart
appearance, or Claude's own reasoning. If Pine has not supplied a field, the
contract returns `null`/`"UNKNOWN"` — never a fabricated value. This is
enforced structurally: `buildMasterContract()`'s only inputs are the Pine
table's text rows and the chart's own symbol/timeframe — it has no parameter
through which raw market data could even be passed in (verified by a source-
audit test in `tests/master_contract.test.js`).

## 2. Pine transport design

Considered, in the order the spec asked for:

1. **Structured Pine table cells** — chosen. `table.cell()` already has a
   verified, deterministic reader (`data_get_pine_tables` /
   `core/data.js:getPineTables()`, built on
   `_primitivesCollection.dwgtablecells`, proven in Phase 1). A table gives
   Pine a natural two-column KEY/VALUE grid with no size limit worth
   worrying about for ~30 fields, and `getPineTables()` already formats each
   row as `"KEY | VALUE"` text (`.join(' | ')` in `buildGraphicsJS`) — this
   is a controlled, single deterministic format to parse, not free text.
2. Data Window / plot-backed values — rejected as the *primary* transport:
   `plot()` only carries numbers, not the string enums (`ACTION`,
   `REGIME`, `WAIT_REASON`, etc.) the contract needs, and `data_get_study_values`
   already has known limitations (see CLAUDE.md: encrypted/protected
   indicators return opaque blobs). Kept as a candidate for individual
   numeric fields only if a future revision needs it.
3. Labels — rejected as primary transport: `label.new()` text is
   free-form and meant for human eyeballs on a chart, with no guaranteed
   one-label-per-field structure; a table is far more parseable.
4. Lines/boxes — reserved for price-level provenance only (e.g. drawing the
   actual entry/SL/TP lines on the chart for a human to see), never for
   carrying the machine contract itself.
5. **Screenshot/OCR and chart-pixel/color parsing are explicitly never
   used** for the contract, and never will be — the parser has no image
   input of any kind.

**Format:** a two-column Pine table, one `KEY | VALUE` row per contract
field, `NA` for "not supplied." The parser locates the correct table (an
indicator could theoretically draw others) by finding the one whose rows
contain a `CONTRACT_VERSION | ...` row — see `CONTRACT_TABLE_ANCHOR` in
`core/xauusd.js`.

## 3. Contract schema (version 1)

| Transport key | Contract field (nested path) | Type | Notes |
|---|---|---|---|
| `CONTRACT_VERSION` | `contract_version` | integer | Required. Only `1` is currently supported. |
| `INDICATOR_VERSION` | *(pass-through only)* | string | Informational. |
| `SYMBOL` | *(not currently surfaced)* | string | `market.symbol` comes from `chart_get_state`, not this field — see §5. |
| `EXECUTION_TF` | *(pass-through only)* | string | Informational; `market.timeframe` comes from chart context. |
| `CONTEXT_TF` | *(pass-through only)* | string | Higher-timeframe context Pine used — informational only in Phase 2B. |
| `BAR_TIME` | *(pass-through only)* | numeric | |
| `BAR_INDEX` | *(pass-through only)* | numeric | |
| `BAR_CONFIRMED` | `signal.bar_confirmed` | boolean | `1`/`true` = confirmed; anything else (including missing) = **not confirmed**, fail-safe. |
| `REGIME` | `market.regime` | string | Opaque Pine-defined label (e.g. `BULL_TREND`) — no fixed enum yet. |
| `CORRECTION_STATE` | `market.correction_state` | string | `ACTIVE` is the one value the parser checks structurally (§6). |
| `CORRECTION_REASON` | *(pass-through only)* | string | |
| `MODEL` | `setup.model` | string | Strategy/model identifier (e.g. `PB`). |
| `SETUP_STATE` | `setup.setup_state` | string | |
| `TRIGGER_STATE` | `setup.trigger_state` | string | |
| `CONFIRMATION_STATE` | `setup.confirmation_state` | string | |
| `QUALITY` | `setup.quality` | numeric | A deterministic Pine-defined score — see §7 on naming. |
| `QUALITY_THRESHOLD` | `setup.quality_threshold` | numeric | |
| `OVEREXTENSION_STATE` | `setup.overextension_state` | string | `OVEREXTENDED`/`ENTRY_LATE` are checked structurally (§6). |
| `RR_VALIDATION_STATE` | `setup.rr_validation_state` | string | `RR_NOT_ACCEPTABLE` is checked structurally (§6). |
| `ACTION` | `decision.action` | enum | `WAIT` \| `BUY` \| `SELL` \| `UNKNOWN`. Closed enum — unrecognized value ⇒ `MALFORMED_CONTRACT`. |
| `WAIT_REASON` | `decision.wait_reason` | enum | See §4. Closed enum. |
| `ENTRY` | `decision.entry` | numeric | Required for BUY/SELL. |
| `SL` | `decision.stop_loss` | numeric | Required for BUY/SELL. |
| `TP1` | `decision.tp1` | numeric | Required for BUY/SELL. |
| `TP2` | `decision.tp2` | numeric | TP2 or EXIT_TARGET required (at least one). |
| `EXIT_TARGET` | `decision.exit_target` | numeric | See TP2. |
| `RR` | `decision.rr` | numeric | Required for BUY/SELL. Never overwritten by MCP — see `rr_check`. |
| `SESSION` | `market.session` | string | |
| `SIGNAL_ID` | `signal.signal_id` | string | Required for BUY/SELL. |
| `SIGNAL_BAR_TIME` | `signal.signal_bar_time` | numeric | Required for BUY/SELL. |
| `STATE_REASON` | *(pass-through only, not yet surfaced)* | string | Reserved for a future generic (non-enum) explanation string. |

All numeric fields accept `NA` (→ `null`) or a finite number; `NaN`,
`Infinity`, and non-numeric garbage are rejected as `MALFORMED_CONTRACT`,
never coerced.

## 4. WAIT reason enum

```
NO_GOOD_ENTRY, CORRECTION_ACTIVE, UNCLEAR_MARKET, CHOP, TRANSITION,
CONFIRMATION_INCOMPLETE, ENTRY_LATE, OVEREXTENDED, RR_NOT_ACCEPTABLE,
NO_ELIGIBLE_STRATEGY, NO_SETUP, NO_TRIGGER, NEWS_SUPPRESSION, UNKNOWN
```

This is a **reserved, closed vocabulary MCP accepts** — Pine is not required
to implement all of these yet. An unrecognized `WAIT_REASON` string is a
parse error (`MALFORMED_CONTRACT`), not silently accepted as a new reason,
so the enum can't drift out of sync between Pine and MCP without a visible
failure. Every reason is proven, in `tests/master_contract.test.js`, to
result in `decision.action === 'WAIT'` with all trade-price fields `null`.

## 5. Statuses (never collapsed into BUY/SELL/WAIT)

| Status | Meaning |
|---|---|
| `NOT_FOUND` | No study on the chart matches the Master Indicator's approved name (discovery layer, unchanged from Phase 2A). |
| `AMBIGUOUS` | More than one study matches; every candidate is listed, none chosen. |
| `READ_ERROR` | CDP/chart read itself failed. |
| `NO_CONTRACT` | The indicator is present, but no table row starts with `CONTRACT_VERSION` (not computing yet, or doesn't implement the contract). |
| `UNSUPPORTED_CONTRACT_VERSION` | `CONTRACT_VERSION` parsed but isn't in `SUPPORTED_CONTRACT_VERSIONS`. |
| `MALFORMED_CONTRACT` | Duplicate/conflicting keys, unparseable rows, an invalid enum/numeric field, or (for a BUY/SELL) a missing required trade field. |
| `SOURCE_UNCONFIRMED` | A BUY/SELL was reported on a bar that isn't confirmed (§6). |
| `CONTRACT_CONTRADICTION` | A BUY/SELL was reported alongside a Pine-reported state that should have forced WAIT (§6). |
| `OK` | The contract parsed and validated cleanly — `decision.action` may still be `WAIT` (the common case) or a fully-validated `BUY`/`SELL`. |

`market.symbol`/`market.timeframe` always come from `chart_get_state`
(MCP's own authoritative source), never from Pine's `SYMBOL`/`EXECUTION_TF`
echo fields — MCP does not trust Pine for facts MCP can verify itself.

## 6. Trade validation, in order

For any parsed `ACTION` of `BUY`/`SELL`, four gates run **in this order**,
and the first one that fails determines the status — nothing downstream is
evaluated once one fails, and none of them "fix" the data:

1. **Structural completeness** (`MALFORMED_CONTRACT`): `ENTRY`, `SL`, `TP1`,
   `RR`, `MODEL`, `REGIME`, `QUALITY`, `SIGNAL_ID`, `SIGNAL_BAR_TIME` all
   present and valid, plus at least one of `TP2`/`EXIT_TARGET`.
2. **Confirmed-bar provenance** (`SOURCE_UNCONFIRMED`): `BAR_CONFIRMED` must
   be exactly `true`. Missing/`0`/`false`/anything else fails safe — a
   candidate on a still-forming (repainting) bar can never be presented as a
   confirmed trade.
3. **Contradiction checks** (`CONTRACT_CONTRADICTION`, all four evaluated
   together and listed in `contradictions[]`):
   - `CORRECTION_STATE == ACTIVE` (§ correction safety — a trade during an
     active correction is never trusted, and MCP never reinterprets raw
     price action as "the correction must be over").
   - `OVEREXTENSION_STATE` is `OVEREXTENDED` or `ENTRY_LATE` (MCP never
     chases price or recomputes a new entry to "fix" this).
   - `RR_VALIDATION_STATE == RR_NOT_ACCEPTABLE`.
   - `QUALITY < QUALITY_THRESHOLD` (both present).
4. Only if all three gates pass: `status: 'OK'`, `decision` populated
   exactly with Pine's reported values, plus an informational `rr_check`
   (see §7).

On every non-`OK` trade status, `decision.action` is forced to `'UNKNOWN'`
and every trade-price field is `null` — never `WAIT` (that would imply Pine
itself decided to wait, which isn't what happened) and never the
contradictory `BUY`/`SELL` itself.

## 7. RR contract

`decision.rr` is always Pine's own reported value — **MCP never overwrites
it**. When all of `ENTRY`/`SL`/`TP1` are present for a validated trade, MCP
additionally computes `rr_check`:

```jsonc
"rr_check": {
  "pine_reported_rr": 2.0,
  "mcp_calculated_rr": 2.0,
  "consistent": true
}
```

`mcp_calculated_rr = |TP1 − ENTRY| / |ENTRY − SL|`. A mismatch (`consistent:
false`) is surfaced for research/debugging — it does not, by itself, block
the trade or move `decision.rr`. If `RR` is missing outright for a BUY/SELL,
that's gate 1 above (`MALFORMED_CONTRACT`), not a `rr_check` mismatch.

## 8. Quality contract

`setup.quality` is a transparent, deterministic Pine-defined setup-quality
score — **never** described as an AI confidence score, a win probability, or
a guaranteed accuracy figure anywhere in this codebase (enforced by a source-
audit test banning those terms in `master_contract.js`). MCP only transports
it and compares it to `quality_threshold` for the contradiction check in §6;
it never sets or adjusts either value.

## 9. 5m / 15m / 30m handling

`market.timeframe` is set from `chart_get_state`'s live resolution, so it
faithfully reflects whichever of `5`/`15`/`30` (or any other timeframe) is
actually on the chart. `EXECUTION_TF`/`CONTEXT_TF` from Pine's own table are
currently pass-through informational fields only — **MCP does not aggregate
multiple timeframes into a decision, and does not let a lower-timeframe
trigger override higher-level context**; that hierarchy is entirely Pine's
future responsibility (Phase 2B spec §2). No MTF logic exists anywhere in
`master_contract.js` (verified by a source-audit test).

## 10. `xauusd_master_state` output shape

```jsonc
{
  "schema_version": "2.0.0",
  "status": "OK",
  "indicator_found": true,
  "indicator_identity": { "display_name": "XAUUSD Adaptive Master", "entity_id": "...", "matching_reason": "exact_name_match" },
  "contract_version": 1,
  "market": { "symbol": "OANDA:XAUUSD", "timeframe": "30", "regime": "BULL_TREND", "correction_state": "NONE", "session": "LONDON" },
  "setup": { "model": "PB", "setup_state": "CONFIRMED", "trigger_state": "CONFIRMED", "confirmation_state": "CONFIRMED", "quality": 85, "quality_threshold": 70, "overextension_state": "NONE", "rr_validation_state": "ACCEPTABLE" },
  "decision": { "action": "BUY", "wait_reason": null, "entry": 100, "stop_loss": 95, "tp1": 110, "tp2": 120, "exit_target": null, "rr": 2.0 },
  "signal": { "signal_id": "sig-001", "signal_bar_time": 1700000000, "bar_confirmed": true },
  "rr_check": { "pine_reported_rr": 2.0, "mcp_calculated_rr": 2.0, "consistent": true },
  "contradictions": [],
  "invalid_fields": [],
  "warnings": [],
  "provenance": { "source": "pine_table", "source_study_id": "...", "capture_time": "2026-09-17T06:16:31.254Z" }
}
```

A WAIT example (the common case) has the same shape with `decision: {
"action": "WAIT", "wait_reason": "CORRECTION_ACTIVE", "entry": null, ... }`
and `status: "OK"` — **WAIT with status OK is success**, not an error.

CLI: `tv xauusd master` (unchanged command, upgraded output).

## 11. User-facing output (minimal trader-facing result)

When Claude (or any consumer) presents `xauusd_master_state` to a human, the
primary output should be exactly this, nothing cluttered:

**No trade:**
```
WAIT / NO TRADE
Reason: CORRECTION_ACTIVE
```

**Valid trade:**
```
BUY
ENTRY: 100
STOP LOSS: 95
TP1: 110
TP2: 120
RR: 2.0
TIMEFRAME: 30
SETUP/MODEL: PB
```

Optional supporting context (regime, quality, session) may be appended
*after* the primary decision — never in place of it, and never as the
headline when the decision is WAIT. If `status` is anything other than `OK`
(e.g. `MALFORMED_CONTRACT`, `SOURCE_UNCONFIRMED`), that should be surfaced
plainly as a data/contract problem, not silently treated as WAIT.

## 12. Testing

```bash
npm run test:contract   # tests/master_contract.test.js — 90 fixture/adversarial tests
npm run test:unit       # includes the above plus everything from Phase 2A
```

Fixtures cover: all 13 reserved WAIT reasons (never fabricate a trade), valid
BUY and SELL reproduced exactly, and adversarial cases for every required
field missing, unconfirmed bars, active correction, overextension/entry-late,
unacceptable RR, sub-threshold quality, `NaN`/`Infinity`/wrong-type numerics,
duplicate/conflicting keys, unknown enums, and unsupported contract versions
— none of which can be silently converted into a valid trade. See
`tests/master_contract.test.js` for the full matrix.

## 13. Limitations

- No real Pine script exists yet to validate this contract against live
  data — every test uses hand-built fixtures. Live regression against the
  actual TradingView chart can only exercise the `NOT_FOUND` path until the
  indicator is authored and deliberately installed (a separate, authorized
  step — Phase 2B does not add it).
- The exact vocabulary for `REGIME`, `MODEL`, `SETUP_STATE`, `TRIGGER_STATE`,
  `CONFIRMATION_STATE` is intentionally left open (opaque pass-through
  strings) since the real Pine logic that would define these doesn't exist
  yet. Only `ACTION` and `WAIT_REASON` — the two fields this project's core
  safety invariant depends on — are closed, validated enums.
- The MTF hierarchy (§9) is deliberately unimplemented here; it is Pine's
  responsibility per the phase plan.
