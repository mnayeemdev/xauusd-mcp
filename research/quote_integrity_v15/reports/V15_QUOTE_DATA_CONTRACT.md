# V15_QUOTE_DATA_CONTRACT

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Contract `quote-v15-1` (one record per observation; a field the platform does not provide is `UNAVAILABLE`, never guessed)
| Field | Source | Live availability |
|---|---|---|
| symbol | request | yes |
| decision_timestamp_ms | PC clock (UTC, Date.now) at the decision | yes |
| bid, ask | MT5 symbol_info_tick | 687 / 687 |
| mid | (bid + ask) / 2; descriptive only, never an execution price | yes |
| quote_timestamp_ms | MT5 symbol_info_tick.time_msc (broker server clock, ms) | 687 / 687 |
| quote_timestamp_s | symbol_info_tick.time (seconds) | consistent with time_msc: true |
| quote_age_ms | decision − (quote − server offset) | computed for every observation (see V15_CLOCK_INTEGRITY) |
| spread, spread_points | ask − bid (raw); / point | yes |
| tick_sequence | MT5 provides none | **UNAVAILABLE** |
| tick_flags | symbol_info_tick.flags | yes |
| data_source | MT5 terminal via the read-only shadow reader | yes |
| data_received_timestamp_ms | PC clock (UTC) in the reader right after the tick call | yes |
| clock | quote clock, decision clock, server offset and its source | yes |

## What changed
- **`mt5/mt5_shadow_reader.py`** (read-only reader; not the REAL bridge; not in the strategy fingerprint):
  - the `tick` response adds `time_msc`, `flags` and `received_ms`;
  - `time / bid / ask / now` are unchanged, so the change is backward compatible;
  - the authority-isolation test (no trading call) still passes.
- **`research/v8_forward_shadow/scripts/runner.mjs`:** every new decision record carries `quote_contract`, `quote` and `quote_check`.
- **`research/quote_integrity_v15/scripts/quote.mjs`:** the pure contract (build, validate, side-of-market price, legacy record).
- **`live_gate.mjs`:** the unchanged V14 gate with quote integrity first.
