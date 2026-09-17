# XAUUSD Adaptive Master MCP

**Developed by Mohamed Nayeem.** Customized/extended layer, version `0.1.0`.

> XAUUSD Adaptive Master MCP is a customized/extended research implementation
> based on the open-source [TradingView MCP Bridge](https://github.com/tradesdontlie/tradingview-mcp)
> project.

This document covers the customization layer added in Phase 2A. For the
underlying tool set, CDP connection model, and general disclaimers, see the
main [README.md](../README.md) — everything there still applies.

## Attribution

- Upstream project: TradingView MCP Bridge — https://github.com/tradesdontlie/tradingview-mcp
- Upstream license: MIT, Copyright (c) 2026 tradesdontlie — see [LICENSE](../LICENSE), unmodified.
- This customization layer does **not** claim authorship of the upstream codebase. It adds a profile/security layer and three new read-only tools on top of it.
- Local git history in this checkout starts from a documented baseline commit ("Baseline: tradingview-mcp checkout prior to XAUUSD Adaptive Master customization") because the ZIP checkout had no upstream `.git` metadata. No upstream commit SHA is fabricated.

## Architecture

```
XAUUSD MARKET
      ↓
TRADINGVIEW
      ↓
XAUUSD ADAPTIVE MASTER PINE   (not yet built — Phase 2B+)
      ↓
DETERMINISTIC PINE DECISION
      ↓
MCP STRUCTURED READ LAYER     (this project)
      ↓
CLAUDE RESEARCH / ANALYSIS
```

Pine owns every trading-relevant decision: regime, correction, structure,
strategy eligibility, setup, trigger, quality gate, RR validation,
WAIT/BUY/SELL, entry, stop-loss, take-profit, and signal pass/fail/open. The
MCP layer only **reads** what Pine already decided — it must never duplicate
or override that logic. `xauusd_master_state` enforces this by returning
`null`/`"UNKNOWN"` for every semantic field until a real Pine output contract
is designed and wired (see "Known limitations" below).

## Profile selection

Set the `TV_MCP_PROFILE` environment variable before starting the MCP server:

| Value | Behavior |
|---|---|
| unset / empty | `XAUUSD_RESEARCH` (default) |
| `XAUUSD_RESEARCH` | Read-only tools only |
| `XAUUSD_DEVELOPMENT` | Read-only tools + Pine source read/write/compile tools |
| anything else | **Server refuses to start** (fail-closed) — never falls back to exposing all tools |

```bash
# Default (Research)
node src/server.js

# Explicit Development
TV_MCP_PROFILE=XAUUSD_DEVELOPMENT node src/server.js
```

Enforcement happens in `src/profile_gate.js`: every `register*Tools()` call in
`src/server.js` goes through a `ProfileGate` instead of the raw MCP server
object. The gate only forwards a `server.tool(name, ...)` registration when
`name` is in the active profile's allowlist (`src/profiles.js`) — an
unapproved tool is **never registered with the MCP SDK**, not merely hidden
by a description. None of the 14 existing `register*Tools()` functions needed
to change.

### Research profile — exact tool list (13 tools)

```
tv_health_check, chart_get_state, quote_get, data_get_ohlcv,
data_get_study_values, data_get_pine_lines, data_get_pine_labels,
data_get_pine_tables, data_get_pine_boxes, capture_screenshot,
xauusd_market_snapshot, xauusd_master_state, xauusd_research_health
```

### Development profile — Research + 5 Pine tools (18 tools)

Adds: `pine_get_source`, `pine_set_source`, `pine_smart_compile`,
`pine_get_errors`, `pine_get_console`.

`pine_smart_compile` side effect (documented, not hidden): it clicks
TradingView's own "Add to Chart"/"Update on Chart" button, which adds or
replaces the study currently open in the Pine Editor on the live chart, and
can surface compiler errors/console output. It does **not** change symbol,
timeframe, alerts, drawings, or the watchlist.

Every other upstream tool is blocked in **both** profiles, but `src/profiles.js`
deliberately tracks *why* in two separate, non-overlapping lists (added in the
Phase 2A review to stop "excluded for scope" and "genuinely dangerous" from
being conflated):

- **`PROHIBITED_MUTATING_TOOLS`** (46 tools) — `tv_launch`, `tv_update`, all
  `chart_set_*`/`chart_manage_indicator`/`chart_scroll_to_date`/`chart_set_visible_range`,
  Pine `compile`/`save`/`new`/`open`, drawing/alert/watchlist mutations,
  `batch_run` (iterates symbols/timeframes, so it mutates the chart as a side
  effect even though its "action" is read-only), all `replay_*`, all `ui_*`
  (including `ui_evaluate`), `layout_new`/`layout_switch`, `pane_focus`/`pane_set_layout`/`pane_set_symbol`,
  `tab_new`/`tab_close`/`tab_switch`, `indicator_add`/`indicator_set_inputs`/`indicator_toggle_visibility`.
  This is the list `xauusd_research_health`'s `dangerous_tools_exposed` check
  actually scans for.
- **`OTHER_UPSTREAM_TOOLS_NOT_EXPOSED_BY_SCOPE`** (23 tools) — genuinely
  read-only upstream tools (`symbol_info`, `symbol_search`, `watchlist_get`,
  `draw_list`, `draw_get_properties`, `alert_list`, `tab_list`, `pane_list`,
  `layout_list`, `tv_discover`, `tv_ui_state`, `data_get_indicator`,
  `data_get_strategy_results`/`_trades`/`_equity`, `depth_get`,
  `indicator_search`, `pine_analyze`, `pine_check`, `pine_list_scripts`,
  `replay_status`, `chart_get_visible_range`, `ui_find_element`) simply not on
  the Phase 2A candidate list. Excluding a harmless read tool for scope
  reasons is **not** a "this is dangerous" claim, so it's never checked by the
  dangerous-tools assertion. Widening either profile is a Phase 2B decision.

A test (`tests/xauusd_profile.test.js`, "Review #3: the four classification
lists exactly partition the 84 upstream tools") programmatically proves these
four lists — the two above, plus the two allowlists — cover all 84 upstream
tool names exactly once each, with zero duplicates and zero omissions.

## Security model

1. **Allowlist, not denylist, at registration time.** `ProfileGate.tool()`
   only forwards calls for names in `profile.allowedTools`. A brand-new
   upstream tool added later is blocked by default until explicitly added to
   a profile — the fail-safe direction.
2. **Parameter-level hardening for the two tools whose parameter space allows
   mutation even though the tool itself is "read":**
   - `quote_get` — the gate replaces the handler entirely with
     `guardedQuoteGet` (`src/profile_gate.js`). If a `symbol` is requested
     that differs (by bare ticker) from the current chart symbol, the call is
     rejected **before** the real quote logic runs at all — `core/data.js`'s
     `getQuote()` is invoked with no `symbol` argument, full stop, so its own
     switch-and-restore code path is never reachable from this profile.
   - `capture_screenshot` — the gate replaces the handler with
     `guardedCaptureScreenshot`. Any `method` other than `"cdp"` (i.e. the
     `"api"` mode that opens TradingView's own screenshot/share UI) is
     rejected outright; the underlying `method: 'api'` branch in
     `core/capture.js` is never reached from this profile.
3. **`xauusd_research_health`** is a runtime self-check, not the enforcement
   mechanism — it reports the gate's *actual* registered-tool list against
   `PROHIBITED_MUTATING_TOOLS` (`src/profiles.js`) and returns `status: "FAIL"`
   if any state-changing tool is somehow exposed. It never flags a
   scope-excluded read-only tool as "dangerous" (see the previous section).
4. **Profile lookup uses a `Map`, not a plain object.** A plain-object lookup
   table (`PROFILES[key]`) is vulnerable to a key that collides with
   `Object.prototype`'s own properties — `({})['__proto__']` returns the
   prototype object itself (truthy), not `undefined`, which would have
   silently defeated the fail-closed check. This was caught in the Phase 2A
   review (`resolveProfile('__proto__')` did not throw before the fix) and is
   covered by a regression test.
5. **Known, permanent limitation — read this if you rely on the profile for
   isolation:**
   > **MCP PROFILE SECURITY DOES NOT SANDBOX THE STANDALONE `tv` CLI.**
   The profile gate protects the MCP tool-call surface only — the interface
   an MCP client (Claude) talks to via `node src/server.js`. The `tv` CLI
   (`src/cli/index.js`) is a **separate, intentionally ungated** entry point
   for maintainer scripting: `tv chart_set_symbol ...`, `tv alert-create ...`,
   etc. all work regardless of any `TV_MCP_PROFILE` setting. Anyone with shell
   access to this repository can bypass the MCP profile entirely by invoking
   the CLI directly — this is a separate access-control concern (host/agent
   shell permissions), not something an MCP tool allowlist can address, and
   is out of scope for Phase 2A. `tv --help` prints a one-line reminder of
   this; `src/cli/index.js` carries the full warning as a header comment. The
   `tv xauusd snapshot|master|health` subcommands ARE read-only, but that is a
   property of those three subcommands' own implementation (they call the
   same read-only core functions the MCP tools do), not a CLI-wide guarantee
   — do not assume any other `tv` command is safe by extension.

## XAUUSD / Gold chart guard

`src/xauusd_guard.js` checks the current chart symbol against an **explicit
allowlist** of exact `EXCHANGE:TICKER` strings — never a "contains GOLD"
substring check, which would wrongly match unrelated instruments.

Default approved aliases:

```
OANDA:XAUUSD, FOREXCOM:XAUUSD, FXCM:XAUUSD, PEPPERSTONE:XAUUSD,
ICMARKETS:XAUUSD, TVC:GOLD, COMEX:GC1!
```

`XAUUSD_ALLOWED_SYMBOLS` is **additive (union), not a replacement** — this
was changed in the Phase 2A review specifically because replacement semantics
let a well-intentioned operator (who just wants to add their own broker's
symbol) silently drop every built-in default, and a typo in the env var could
produce an allowlist that rejects even `OANDA:XAUUSD`. Union semantics can
only ever widen the allowlist relative to the immutable defaults — the safer
failure direction for a guard whose job is to say "no" by default:

```bash
# Effective allowlist = the 7 defaults above ∪ {MYBROKER:XAUUSD}
XAUUSD_ALLOWED_SYMBOLS="MYBROKER:XAUUSD" node src/server.js
```

Each additional alias is trimmed, uppercased, deduplicated, and matched
exactly — never as a substring — against the current chart symbol.

If the current chart isn't an approved symbol, `xauusd_guard.approved` is
`false` and a warning is surfaced in `xauusd_market_snapshot` /
`xauusd_research_health` — **the chart is never switched automatically** to
satisfy the check, in Research or Development.

## `xauusd_market_snapshot`

One read-only call, with a stable schema, combining quote, latest bar, recent
OHLCV, visible studies, data-window values, and Pine graphics. Missing data is
`null`/empty with an entry in `warnings`/`errors` — nothing is fabricated.

**Not atomic.** Each component is a separate, sequential CDP round-trip —
TradingView has no single "read everything as of instant T" API. The market
can tick between the quote read and the OHLCV read. `capture_started_at` and
`capture_completed_at` expose that window explicitly (`capture_is_atomic` is
always `false`) instead of implying a false point-in-time guarantee; on a
healthy connection the window is typically well under a second.

```jsonc
{
  "schema_version": "1.0.0",
  "captured_at": "2026-09-17T05:43:04.098Z",
  "capture_started_at": "2026-09-17T05:43:04.088Z",
  "capture_completed_at": "2026-09-17T05:43:04.098Z",
  "capture_is_atomic": false,
  "product": { "name": "XAUUSD Adaptive Master MCP", "version": "0.1.0" },
  "symbol": "OANDA:XAUUSD",
  "provider": "OANDA",
  "timeframe": "30",
  "chart_type": 1,
  "xauusd_guard": { "approved": true, "normalized": "OANDA:XAUUSD", "approved_aliases": ["..."] },
  "quote": { "last": 4295.685, "open": 4286.59, "high": 4297.9, "low": 4286.475, "close": 4295.685, "volume": 9546, "time": 1789623000, "bid": null, "ask": null },
  "latest_bar": { "time": 1789623000, "open": 4286.59, "high": 4297.9, "low": 4286.475, "close": 4295.685, "volume": 9546 },
  "recent_ohlcv": ["...bars..."],
  "visible_studies": [],
  "study_values": [],
  "pine": { "tables": [], "labels": [], "lines": [], "boxes": [] },
  "data_availability": { "chart_state": true, "quote": true, "ohlcv": true, "study_values": true, "pine_tables": false, "pine_labels": false, "pine_lines": false, "pine_boxes": false },
  "status": "ok",
  "warnings": [],
  "errors": []
}
```

CLI: `tv xauusd snapshot [--count N]`

## `xauusd_master_state`

Structured reader for the (not yet built) XAUUSD Adaptive Master Pine
indicator, upgraded in **Phase 2B** to parse a versioned Pine↔MCP contract.
**Pine remains authoritative** — this tool never derives a trading decision
on its own, and never promotes WAIT/UNKNOWN into BUY/SELL.

**Full contract schema, transport design, validation rules, and worked
examples now live in [MASTER_CONTRACT.md](MASTER_CONTRACT.md).** Summary:

- `status` is one of `NOT_FOUND` / `AMBIGUOUS` / `READ_ERROR` (discovery
  layer, from Phase 2A) or `NO_CONTRACT` / `UNSUPPORTED_CONTRACT_VERSION` /
  `MALFORMED_CONTRACT` / `SOURCE_UNCONFIRMED` / `CONTRACT_CONTRADICTION` /
  `OK` (contract layer, new in Phase 2B) — never collapsed into a bare
  BUY/SELL/WAIT.
- The response is nested: `market` / `setup` / `decision` / `signal` /
  `rr_check` / `provenance`, plus `contradictions`/`invalid_fields` arrays
  when relevant. `decision.action` is `'UNKNOWN'` on every status except a
  fully-validated `OK` (whether that OK is a `WAIT` or a real trade).
- Identity matching is **exact (case-insensitive) only**, against the names
  in `XAUUSD_MASTER_INDICATOR_NAMES` (comma-separated; defaults to just
  `"XAUUSD Adaptive Master"`) — never a prefix or substring match (fixed in
  the Phase 2A review after `name.startsWith(approved)` was found to let an
  unrelated indicator sharing a name prefix, e.g. `"XAUUSD Adaptive Master
  Pro"`, falsely register as a candidate).

```jsonc
{
  "schema_version": "2.0.0",
  "status": "NOT_FOUND",
  "indicator_found": false,
  "indicator_identity": null,
  "contract_version": null,
  "market": { "symbol": "OANDA:XAUUSD", "timeframe": "30", "regime": null, "correction_state": null, "session": null },
  "setup": { "model": null, "setup_state": null, "trigger_state": null, "confirmation_state": null, "quality": null, "quality_threshold": null, "overextension_state": null, "rr_validation_state": null },
  "decision": { "action": "UNKNOWN", "wait_reason": null, "entry": null, "stop_loss": null, "tp1": null, "tp2": null, "exit_target": null, "rr": null },
  "signal": { "signal_id": null, "signal_bar_time": null, "bar_confirmed": null },
  "rr_check": null,
  "contradictions": [], "invalid_fields": [],
  "warnings": ["XAUUSD Adaptive Master Pine indicator is not present on the current chart. ..."],
  "provenance": { "source": "chart", "source_study_id": null, "capture_time": "2026-09-17T06:16:31.254Z" }
}
```

CLI: `tv xauusd master`

## `xauusd_research_health`

Self-check combining MCP/CDP connectivity, the XAUUSD guard result, the
active profile name, the gate's actual registered/blocked tool counts, a
`dangerous_tools_exposed` list (empty unless something leaked through), and
Master Indicator detection status.

CLI: `tv xauusd health` (note: the CLI path bypasses the MCP profile gate
entirely — see "Security model" point 4 — so its `profile_active` always
reads `"CLI (ungated)"` and `tools_registered`/`tools_blocked` are empty;
use the MCP tool itself, or `node src/server.js` startup stderr, to see the
gate's real counts).

## Pine implementation status

Canonical Pine source: [`pine/XAUUSD_Adaptive_Master.pine`](../pine/XAUUSD_Adaptive_Master.pine),
currently **v0.3.0**. Built incrementally:

- **P1** (v0.1.0) — regime + correction foundation. See [PINE_P1.md](PINE_P1.md).
- **P2** (v0.2.0, + a review/fix pass) — confirmed market structure (pivots,
  HH/HL/LH/LL, BOS/CHoCH, sweeps, PDH/PDL, displacement, anchored range).
  See [PINE_P2.md](PINE_P2.md) if present, or the Pine P2 review report.
- **P3** (v0.3.0) — the first phase authorized to reach BUY/SELL. Adds the
  five approved entry models (TC/PB/BO/MR/SR), a full setup→trigger→
  confirmation→entry-location→quality→RR pipeline, and a freeze-once signal
  state machine — all gated behind a single `finalTradeApproved` conjunction
  that defaults to `WAIT`. See [PINE_P3.md](PINE_P3.md) for the complete
  design, eligibility matrix, per-model rules, and safety proofs.

It has not been installed on any live chart at any phase.

## Known TradingView private-API/CDP fragility

Unchanged from upstream: this tool reads undocumented internal TradingView
objects (`window.TradingViewApi`, `_chartWidget.model()`, Pine graphics
primitives, etc.) via CDP. A TradingView Desktop update can rename or
restructure these without notice and break any tool, including the new
XAUUSD ones (which are built entirely on the existing `core/chart.js` and
`core/data.js` read functions, so they share the same fragility surface — no
new internal API paths were added).

## Windows CDP startup

See the main [README.md](../README.md) and `scripts/launch_tv_debug.bat` for
the general procedure. Summary: TradingView Desktop must be started with
`--remote-debugging-port=9222` from the very beginning — CDP cannot be
attached to an already-running instance. On MSIX/Windows Store installs, a
direct launch from `WindowsApps` sometimes blocks the debug port; `tv_launch`
(or `tv launch` CLI) automatically falls back to a one-time local copy under
`%LOCALAPPDATA%\tradingview-mcp\` when that happens.

## Testing

```bash
npm run test:unit     # all non-CDP unit/regression tests (Phase 2A + 2B)
npm run test:xauusd   # just the Phase 2A profile/security test file
npm run test:contract # just the Phase 2B contract parser test file
npm run test:all      # unit tests + the live-CDP e2e suite (mutates the chart — see caution below)
```

> **Caution:** `tests/e2e.test.js` (upstream) exercises the full mutating
> tool surface — it switches symbols/timeframes, adds studies, creates
> drawings/alerts, and drives replay. Do not run `test:all` or `test:e2e`
> against a chart with work you don't want touched. `test:unit`,
> `test:xauusd`, and `test:contract` never touch a live chart.

## Current limitations

- The XAUUSD Adaptive Master Pine indicator itself does not exist yet.
  `xauusd_master_state` is verified against `NOT_FOUND` on a live chart; the
  `NO_CONTRACT`/`AMBIGUOUS`/`OK` (WAIT and trade) branches are covered by
  unit tests with injected chart state and hand-built contract-table
  fixtures (see [MASTER_CONTRACT.md](MASTER_CONTRACT.md)), not a live
  indicator — there is nothing to add one to yet, and adding one is a
  separate, explicitly authorized step outside both Phase 2A and 2B.
- The Phase 2B contract (`docs/MASTER_CONTRACT.md`) is a provisional design
  the real Pine script must implement — it was written without inspecting
  actual Pine source, because none exists yet.
- The profile gate only governs the MCP tool-call surface; it does not
  restrict the standalone `tv` CLI or direct shell access to this repository.
- `xauusd_market_snapshot`/`xauusd_master_state`/`xauusd_research_health` are
  built on the same undocumented internal TradingView APIs as the rest of
  this project and share its fragility (see above).

## Pine-authoritative design and disclaimers

**This MCP layer, and Claude using it, do not guarantee profitable trades and
do not predict future prices.** All trading-relevant computation (regime,
structure, setup, trigger, quality, entry/stop/target, WAIT/BUY/SELL) belongs
to the Pine indicator, once built. The MCP layer's job is to read that
decision faithfully and never to compute, infer, or override it. If Pine ever
reports `WAIT`, this layer must report `WAIT` (once the contract exists); if
Pine exposes no action, this layer reports `UNKNOWN` — never a guessed
`BUY`/`SELL`. See the "Architecture" diagram above.
