# Pine P4A — Real Pine ↔ MCP Integration Foundation

**P4A is a transport/integration-hardening phase, not a trading-logic
phase.** P1/P2/P3 are frozen (commit `01e8d50f422e9a1693971812f31b8ff0bc5c6bac`)
and untouched. Pine `INDICATOR_VERSION` remains `"0.3.0"`, `CONTRACT_VERSION`
remains `1`. This document describes how the already-frozen Pine contract
table is actually read, identified, normalized, parsed, and validated by
MCP — end to end, proven against the real production functions, not a
reference-model stand-in.

## Pipeline

```
FROZEN PINE (pine/XAUUSD_Adaptive_Master.pine)
  → table.new(position.top_right, 2, 50, ...) "contractTable", drawn once
    per bar close via `if barstate.islast`
→ TRADINGVIEW RUNTIME REPRESENTATION
  → internal Pine graphics primitives (table cells), read via CDP
→ RAW MCP READ
  → src/core/data.js:getPineTables() → { studies: [{ name, tables: [{ rows:
    ["KEY | VALUE", ...] }] }] } — ONE evaluate() CDP round-trip per call
→ CONTRACT EXTRACTION
  → src/core/xauusd.js:getMasterState() — exact-name study match (no
    fallback), exact anchor-based table match (fails closed if 0 or >1),
    passes the SAME rows array (one read, one snapshot) onward
→ CONTRACT PARSER
  → src/core/master_contract.js:parseTableRows() (normalize) +
    buildMasterContract() (parse + validate)
→ MASTER STATE
  → the xauusd_master_state-shaped payload (status/market/setup/decision/
    signal/structure/rr_check/contradictions/invalid_fields/provenance)
→ USER OUTPUT
  → src/tools/xauusd.js registers this as the `xauusd_master_state` MCP tool
```

## A. Where Pine renders CONTRACT_VERSION

`pine/XAUUSD_Adaptive_Master.pine` line 32 (`CONTRACT_VERSION = 1`), emitted
as the table's row 0: `f_row(contractTable, 0, "CONTRACT_VERSION",
str.tostring(CONTRACT_VERSION))`. This row is also the **anchor** used to
identify which table (if the indicator ever drew more than one) is the
machine contract — see `CONTRACT_TABLE_ANCHOR` in `src/core/xauusd.js`.

## B. Where Pine renders ACTION

Row 19: `f_row(contractTable, 19, "ACTION", contractAction)`, where
`contractAction = finalTradeApproved ? (candIsLong ? "BUY" : "SELL") :
"WAIT"` (unchanged from the frozen P3 source).

## C. Where Pine renders WAIT_REASON

Row 20: `f_row(contractTable, 20, "WAIT_REASON", finalTradeApproved ? "NA" :
waitReason)`.

## D. Where Pine renders BUY/SELL mandatory fields

Rows 21–29: `ENTRY, SL, TP1, TP2, EXIT_TARGET, RR, SESSION, SIGNAL_ID,
SIGNAL_BAR_TIME`, plus `BAR_CONFIRMED` (row 7), `MODEL` (row 11), `REGIME`
(row 8), `QUALITY`/`QUALITY_THRESHOLD` (rows 15–16) — all consumed by
`REQUIRED_TRADE_FIELDS` in `master_contract.js`.

## E. TradingView primitive used

**Table only** (`table.new` / `table.cell`), no labels/lines/boxes are part
of the contract. Screenshots/OCR are never used for the contract (unchanged
from Phase 2B). The `contractTable` is distinct from the separate
`debugTable` (56 rows, gated behind `debugMode`, at `position.bottom_right`)
— the debug table has no `CONTRACT_VERSION` row and is never mistaken for
the contract table by the anchor-based selection.

## F. Existing MCP primitives capable of reading it

`data_get_pine_tables` (`src/core/data.js:getPineTables`) is the only one
used for the contract. `data_get_pine_labels`/`data_get_pine_lines`/
`data_get_pine_boxes`/`data_get_study_values` are read by
`xauusd_market_snapshot` for general context, never for the contract itself
— see boundary G below.

## G. Existing xauusd_master_state flow

`src/core/xauusd.js:getMasterState()` — see Pipeline above. Fully
unchanged in its overall shape from Phase 2B; P4A hardened exactly two
things inside it (see "P4A fixes" below).

## H. Existing master_contract parser

`src/core/master_contract.js` — unchanged in this phase. `parseTableRows()`
is the normalizer (KEY|VALUE text → `{fields, duplicateKeys,
malformedRows}`); `buildMasterContract()` is the parser+validator.

## I. Current study identity resolution

`src/master_identity.js:discoverMasterCandidates()` — exact
case-insensitive name match only (no prefix/substring matching, hardened in
the Phase 2A review against name-squatting). Returns `NOT_FOUND` (0
matches), `FOUND` (exactly 1), or `AMBIGUOUS` (>1, every candidate listed,
none chosen).

## J. Current ambiguity handling

Two independent ambiguity layers, now both fail-closed after P4A:
1. **Study-level** (pre-existing): >1 study on the chart with the exact
   approved name → `AMBIGUOUS`, `candidates` lists every match.
2. **Table-level** (P4A fix — see below): the one confirmed study draws >1
   table that each contain a `CONTRACT_VERSION` row → `AMBIGUOUS`,
   `candidate_table_count` reports how many.

## K. Current read-error handling

Any thrown error from `getState()` or `getPineTables()` → `READ_ERROR`,
with the specific failing call named in `warnings`. Never falls back to a
previous result (see "Stale-data policy" below).

## L. Current source-confirmation handling

"Source confirmed" means: (1) exact study-name match via
`discoverMasterCandidates` (identity), (2) exactly one table carrying the
`CONTRACT_VERSION` anchor (structure), (3) `CONTRACT_VERSION` is an
integer in `SUPPORTED_CONTRACT_VERSIONS` (version). No cryptographic
source hash exists or is claimed — TradingView does not expose one, and
none is fabricated. For a BUY/SELL specifically, `BAR_CONFIRMED === true`
is additionally required before the trade is trusted (`SOURCE_UNCONFIRMED`
otherwise) — this is the confirmed-bar/non-repaint provenance check, not a
"who authored this indicator" cryptographic check.

## P4A fixes (transport-layer only — no trading-logic/threshold change)

Both fixes are inside `getMasterState()` in `src/core/xauusd.js`
(`MASTER_SCHEMA_VERSION` bumped `2.1.0` → `2.1.1`, no field-shape change):

1. **Removed an unsafe "first study" fallback.** The prior code was:
   ```js
   const studyTables = tablesResult?.studies?.find((s) => s.name === identity.display_name) ?? tablesResult?.studies?.[0];
   ```
   If the table-read response ever came back without an entry exactly
   matching the confirmed study's name (e.g. a `study_filter` quirk), this
   silently fell back to `studies[0]` — which could be a **completely
   unrelated indicator's table**, including one that happens to also emit a
   `CONTRACT_VERSION`-prefixed row by coincidence or convention. This is
   exactly the "read another indicator's table accidentally" failure the
   discovery layer exists to prevent. Fixed by removing the fallback
   entirely — no match now means no usable contract data (falls through to
   `NO_CONTRACT` via `rows: []`), never a guess. Covered by a new
   regression test ("wrong study ... is never read as the contract").
2. **Added fail-closed handling for multiple candidate contract tables**
   within one confirmed study (`contractTables.length > 1` → `AMBIGUOUS`,
   `candidate_table_count` in the response). Previously `.find()` silently
   used the first match. This cannot happen with the current frozen Pine
   source (it draws exactly one `CONTRACT_VERSION`-bearing table), but the
   read layer must not assume that invariant holds forever. Reuses the
   existing `AMBIGUOUS` status rather than inventing a new one (same
   underlying concept: "more than one candidate exists, refuse to guess").

Neither fix touches `master_contract.js`, Pine, thresholds, or any
BUY/SELL validation rule — both are strictly about *which table's rows*
ever reach the unchanged parser.

## Runtime contract source (§3)

Exactly one authoritative representation: the Pine `KEY | VALUE` table,
identified by its `CONTRACT_VERSION` anchor row. Table identity: the first
(and, after the P4A fix, *only allowed*) table under the exact-matched
study whose rows include a `CONTRACT_VERSION |`-prefixed entry. Expected
columns: exactly 2 (key, value) — `parseTableRows` rejects any row that
doesn't split into exactly 2 parts on `' | '` as malformed. Row semantics:
one row per field, `KEY | VALUE` text. Missing row: field is `undefined`
in `fields`, normalized to `null` via `normalizeNA` (never fabricated).
Duplicate key: the row is recorded in `duplicateKeys` and the *whole
contract* fails `MALFORMED_CONTRACT` (never "last write wins" or "first
write wins"). Malformed cell (wrong column count, blank key): pushed to
`malformedRows`/rejected as malformed, same outcome. Empty cell / literal
`"NA"` (any case): both normalize identically to `null` — this was the
exact Phase 2B fix that prevented `Number('') === 0` from fabricating a
missing `ENTRY` as `0`.

## Complete field inventory (§4)

| FIELD | Pine output type | Wire format | Parser type | WAIT requirement | BUY/SELL requirement | NULL/NA rule | Validation |
|---|---|---|---|---|---|---|---|
| CONTRACT_VERSION | int | `"1"` | integer | required always | required always | never NA | must be integer in `SUPPORTED_CONTRACT_VERSIONS` |
| INDICATOR_VERSION | string | `"0.3.0"` | string | optional | optional | NA→null | pass-through |
| SYMBOL | string | `syminfo.tickerid` | string | optional | optional | NA→null | pass-through (not trusted for `market.symbol`; chart_get_state is) |
| EXECUTION_TF | string | `timeframe.period` | string | optional | optional | NA→null | pass-through (not trusted for `market.timeframe`; chart_get_state is) |
| CONTEXT_TF | string | `htfTimeframe` | string | optional | optional | NA→null | pass-through |
| BAR_TIME | numeric | `str.tostring(time)` | numeric | optional | optional | NA→null | finite number or null |
| BAR_INDEX | numeric | `str.tostring(bar_index)` | numeric | optional | optional | NA→null | finite number or null |
| BAR_CONFIRMED | bool | `"1"`/`"0"` | boolean (strict) | optional | **required = true** | NA→null | **P4A review/fix:** only the exact literal `"1"` → true; anything else (including `"TRUE"`, `"yes"`, `"0"`) → false (never "invalid" — see `parseBarConfirmed`) |
| REGIME | string | e.g. `"BULL_TREND"` | string | optional | required (non-null) | NA→null | pass-through enum (Pine-owned vocabulary) |
| CORRECTION_STATE | string | e.g. `"NONE"`/`"ACTIVE"` | string | optional | checked for contradiction | NA→null | pass-through; `"ACTIVE"` on BUY/SELL → `CONTRACT_CONTRADICTION` |
| CORRECTION_REASON | string | evidence string or NA | string | optional | optional | NA→null | pass-through |
| MODEL | string | e.g. `"TC"` | string | optional | **required (non-null)** | NA→null | pass-through, never inferred from REGIME |
| SETUP_STATE | string | enum | string | optional | optional | NA→null | pass-through |
| TRIGGER_STATE | string | enum | string | optional | optional | NA→null | pass-through |
| CONFIRMATION_STATE | string | enum | string | optional | optional | NA→null | pass-through |
| QUALITY | numeric | e.g. `"78.5"` | numeric | optional | **required (non-null)** | NA→null | finite number; `< QUALITY_THRESHOLD` on BUY/SELL → contradiction |
| QUALITY_THRESHOLD | numeric | e.g. `"65"` | numeric | optional | optional | NA→null | finite number |
| OVEREXTENSION_STATE | string | `"NONE"`/`"ENTRY_LATE"`/`"OVEREXTENDED"` | string | optional | checked for contradiction | NA→null | `ENTRY_LATE`/`OVEREXTENDED` on BUY/SELL → contradiction |
| RR_VALIDATION_STATE | string | `"ACCEPTABLE"`/`"RR_NOT_ACCEPTABLE"`/`"NA"` | string | optional | checked for contradiction | NA→null | `RR_NOT_ACCEPTABLE` on BUY/SELL → contradiction |
| ACTION | closed enum | `WAIT`\|`BUY`\|`SELL` | enum:ACTION | is the field | is the field | never NA (absent → `UNKNOWN`) | unrecognized value → `MALFORMED_CONTRACT` |
| WAIT_REASON | closed enum | one of `WAIT_REASONS` or `NA` | enum:WAIT_REASON | present when WAIT | must be NA | NA→null (WAIT with no reason → `UNKNOWN`, never invented) | unrecognized string → `MALFORMED_CONTRACT` |
| ENTRY | numeric | price string or NA | numeric | must be NA | **required (non-null)** | NA→null | finite number; never inferred from current price |
| SL | numeric | price string or NA | numeric | must be NA | **required (non-null)** | NA→null | finite number; never calculated |
| TP1 | numeric | price string or NA | numeric | must be NA | **required (non-null)** | NA→null | finite number |
| TP2 | numeric | price string or NA | numeric | must be NA | required unless EXIT_TARGET present | NA→null | finite number |
| EXIT_TARGET | numeric | always `"NA"` (P3 doesn't own this field yet) | numeric | must be NA | required unless TP2 present | NA→null | finite number |
| RR | numeric | e.g. `"2.79"` | numeric | must be NA | **required (non-null)** | NA→null | finite number; never recalculated to "fix" a contract (informational `rr_check` only) |
| SESSION | string | e.g. `"NEW_YORK"` | string | optional | optional | NA→null | pass-through |
| SIGNAL_ID | string | `outSignalId` | string | must be NA | **required (non-null)** | NA→null | pass-through, never regenerated by MCP |
| SIGNAL_BAR_TIME | numeric | epoch ms or NA | numeric | must be NA | **required (non-null)** | NA→null | finite number, never replaced with MCP read time |
| *(P2 structure fields ×20)* | mixed | see `pine_p2_structure_model.test.js` | numeric/string | optional context | optional context | NA→null | pass-through, additive, never gates BUY/SELL |

No field in this table was invented for P4A — every row above is read
directly from the frozen Pine source (lines 1219–1268) and
`master_contract.js`'s existing `FIELD_KINDS`/`REQUIRED_TRADE_FIELDS`.

## Table structural validation (§6) — status vocabulary

No new status was added. Existing 9-value vocabulary
(`NOT_FOUND`/`AMBIGUOUS`/`READ_ERROR`/`NO_CONTRACT`/
`UNSUPPORTED_CONTRACT_VERSION`/`MALFORMED_CONTRACT`/
`CONTRACT_CONTRADICTION`/`SOURCE_UNCONFIRMED`/`OK`) already covers every
required fail-closed case, including the newly-hardened "multiple
candidate contract tables" case (reuses `AMBIGUOUS`).

## Study identity (§7) / Source confirmation (§8)

See I and L above. No cryptographic source hash exists or is claimed.

## Snapshot/coherence architecture (§16)

`getPineTables()` is **one CDP round-trip** (`evaluate()` runs a single
synchronous JS function inside the TradingView page that reads every table
cell from the same in-memory graphics collection at once) — `ACTION`,
`ENTRY`, `SL`, `SIGNAL_ID`, etc. are read as part of the exact same
snapshot, not staggered separate reads. `getMasterState()` calls
`getPineTables()` exactly once and passes the identical `rows` array into
`buildMasterContract()`. The one two-step sequencing that DOES exist —
`getState()` (for the study list) happening before `getPineTables()` — only
affects *discovery* (does the study still exist, under what entity id), not
any of the trade-decision field values themselves, all of which come from
the single later table read. No atomicity guarantee beyond this is claimed;
this is the same limitation already documented for `xauusd_market_snapshot`
(`capture_is_atomic: false`).

## WAIT / BUY / SELL pipelines (§9, §10)

Unchanged from Phase 2B, now proven end-to-end through `getMasterState()`
with realistic fixtures (`tests/pine_p4a_integration.test.js`) rather than
only through `buildMasterContract()` in isolation. WAIT: `status: 'OK'`,
`decision.action: 'WAIT'`, every trade numeric field `null`. BUY/SELL:
structural completeness → confirmed-bar → contradiction checks → `OK` with
`decision` fully populated from Pine's own values, unchanged.

## Numeric / boolean parsing (§11, §12)

Audited, no code change required — already correct:
- `Number('')`, `Number(' ')` → normalized to `null` **before** reaching
  `Number()` (the exact Phase 2B fix); never produces `0`.
- `NaN`, `Infinity`, `-Infinity`, locale separators (`"1,234.56"`),
  currency symbols (`"$100"`) → `Number.isFinite` check rejects all of
  these as `MALFORMED_CONTRACT`, never mis-parsed as a number.
- `BAR_CONFIRMED`: **tightened in the P4A review/fix pass.** Originally only
  `"1"` or case-insensitive `"TRUE"` parsed to `true`. Audited directly
  against the frozen Pine source (`confirmedBar ? "1" : "0"`) and found
  Pine **exclusively** emits `"1"`/`"0"` — `"TRUE"` was never a real wire
  value, only a speculative leniency from a pre-Pine draft of the contract
  doc. `parseBarConfirmed()` now accepts only the exact literal `"1"`;
  everything else (including `"TRUE"`, `"yes"`, `"on"`, `"0"`, empty,
  whitespace, omitted) parses to `false`, which for a BUY/SELL correctly
  produces `SOURCE_UNCONFIRMED` (fails closed). 13 adversarial tests in
  `tests/pine_p4a_review_fix.test.js` §1 prove this end-to-end through the
  real pipeline, including that trimming (the one universally-applied
  normalization) does not turn `"TRUE"` into `"1"`.

## Price-geometry contract validation (P4A review/fix)

Added as new `CONTRACT_CONTRADICTION` checks in `buildMasterContract()`,
evaluated alongside the existing correction/overextension/RR-state/quality
checks (never a new status — reuses the existing 9-value vocabulary). This
is transport-layer **validation of levels Pine already supplied**, not
trading logic: MCP never derives, moves, or repairs SL/TP; it only checks
that Pine's own claimed levels are directionally self-consistent with the
direction Pine itself reported.

- **BUY:** `SL < ENTRY`, `TP1 > ENTRY`; if present, `TP2 > ENTRY` and
  `EXIT_TARGET > ENTRY` — each checked independently (both validated when
  both exist, neither discarded because the other passed).
- **SELL:** the exact mirror (`SL > ENTRY`, `TP1 < ENTRY`, etc.).
- Strict inequality rejects equality too (`ENTRY == SL`, `ENTRY == target`
  are contradictions, not edge cases needing separate handling).
- **WAIT is entirely unaffected** — these checks live inside the
  BUY/SELL-only branch of `buildMasterContract()`, after the early WAIT
  return; a WAIT with all-NA trade fields is untouched by construction.
- **RR consistency — audited, not changed.** RR is required to be a
  present, finite number (structural completeness) — that's the entire
  hard requirement. Separately, the pre-existing `rr_check` field
  independently cross-checks Pine's reported RR against
  `|TP1-ENTRY|/|ENTRY-SL|`, but this remains **informational only** (a
  mismatch never changes `status` away from `OK`) — unchanged from Phase
  2B, confirmed by a new test proving a wildly mismatched RR still returns
  `status: OK` with `rr_check.consistent: false`. No new RR formula or
  threshold was added, per the explicit instruction not to expand trading
  semantics without explicit need.
- 27 new adversarial tests (`tests/pine_p4a_review_fix.test.js` §2/§7)
  cover every BUY/SELL × {SL, TP1, TP2, EXIT_TARGET} × {valid, equal,
  inverted} combination end-to-end through `getMasterState()`.

### Known limitation, still open (unchanged from the original P4A report)

MCP's geometry validation checks *direction only* (which side of ENTRY a
level falls on) — it does not, and was not asked to, re-derive or sanity-
check the *magnitude* of SL/TP distances (e.g. an absurdly tight or wide
stop is not flagged). That remains entirely Pine's domain.

## Signal identity/time, timeframe, symbol fidelity (§13, §14, §15)

`SIGNAL_ID`/`SIGNAL_BAR_TIME` are pass-through only — never regenerated,
never replaced with MCP read time (`provenance.capture_time` is a
**separate** field for exactly this reason: to keep "when Pine's signal
happened" and "when MCP read it" distinguishable, never conflated).
`market.timeframe` comes from `chart_get_state` (`state.resolution`), never
from Pine's own `EXECUTION_TF` row — proven by the P4A BUY fixture test
(`EXECUTION_TF: '15'` in the row data, asserted separately against
`chart.resolution`). No chart mutation, no symbol switch, occurs anywhere
in this phase.

## Stale-data policy (§24)

Audited: **no caching or memoization exists anywhere** in
`getMasterState()`, `getMarketSnapshot()`, or `getResearchHealth()` (fresh
`grep` for cache/memo/lastResult/previousState across the module returns
nothing). Every call performs a fresh read; a read failure returns
`READ_ERROR` immediately and never falls back to a previously-returned
result.

## Profile boundary (§19, §20, §21)

Verified unchanged and exact: Research = 13 tools, Development = Research +
5 = 18 tools (both counted directly from `src/profiles.js` in this phase,
not assumed). `tests/xauusd_profile.test.js`'s 97 tests, including the full
84-upstream-tool partition assertion, all still pass. No CLI-only command
was exposed through MCP; no new tool was added by P4A.

## Error provenance (§23)

Unchanged: every non-OK status carries a distinguishing `warnings` message
naming exactly which check failed (see the status table above), and
`decision.action` is `'UNKNOWN'` on every status except a fully-validated
`OK`. A read failure never returns a stale BUY/SELL (see Stale-data policy).

## Known limitation: no independent SL/TP geometry re-check in MCP

Pine's own P3 `slGeometryOk` gate (frozen, reviewed, tested) guarantees a
BUY/SELL can never be emitted with SL on the wrong side of ENTRY.
`master_contract.js` does not *independently* re-derive this geometry check
— its trust boundary is exact study identity + `CONTRACT_VERSION` +
confirmed-bar, not re-verifying every invariant Pine already enforces
upstream (the existing `rr_check` is explicitly informational-only for the
same reason: RR is not re-validated as a gate, only reported for
comparison). Adding a redundant MCP-side geometry gate would be a new
validation rule on top of the frozen Phase 2B contract, which was not
explicitly authorized for this phase and risks scope creep into
"redesigning" contract validation. **This is flagged here for an explicit
future decision, not silently added or silently ignored.**

## P4A vs P4B boundary

P4A proves the read/normalize/parse/validate pipeline is correct against
realistic fixtures and hardens two real transport-layer gaps found during
the audit. **P4A does not prove live Pine execution** — the indicator has
still never been installed on the live chart, and 0 studies remaining on
the live chart is the expected, correct state at the end of this phase
(confirmed via a read-only `chart_get_state` check, see the report). P4B
is expected to be the phase that actually installs/verifies the frozen
Pine source against a live, running instance.

## Known TradingView/CDP limitations (carried forward, unchanged)

- No single "read everything as of instant T" CDP API exists; multi-call
  reads (e.g. `xauusd_market_snapshot`'s five separate reads) are
  explicitly non-atomic and labeled as such. The contract table itself
  (§16 above) does not have this problem because it's a single read.
- No live Pine bar-replay harness exists outside TradingView's own runtime;
  verification remains compile success + production-function integration
  tests (this phase) + source audits + fixture-based contract tests.
