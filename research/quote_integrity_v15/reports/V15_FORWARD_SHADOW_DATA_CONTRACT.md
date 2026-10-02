# V15_FORWARD_SHADOW_DATA_CONTRACT

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Update
- **The runner:** the V8 forward-shadow runner (research, measure-only) now writes `quote_contract: quote-v15-1`, `quote` (§1) and `quote_check` into every decision record. There is no separate pipeline.
- **The reader:** the read-only reader supplies the broker tick time in ms and the receive time.
- **The restart:** the runner was restarted to load the change. PID 50540 was stopped gracefully (its own console; lock released) and PID 49200 started. The frozen V8 engine manifest is unchanged (1daa2c5f…).
- **Untouched:** the REAL watcher and the silver / DOM observer.

## Records
| Item | Count |
|---|---|
| decision records in the store | 300 |
| LEGACY_DATA / QUOTE_AGE_UNAVAILABLE (before the update) | 296 |
| records with the quote contract | 4 |
| … with every contract field present | 4 |
| … with a broker quote timestamp | 4 |
| … with a computed quote age | 4 |
| quote status | INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT: 4 |
| quote age (ms) | n 4; min -1054; p10 -1054; p50 -1030; p90 -1030; p99 -1030; max -1030 |
| first quote-contract record | 2026-10-02T16:00:09.000Z |

## Gate on the new V8 records (illustrative risk model; nothing executed)
| Bar close (UTC) | Engine | Gate decision | Reason | Quote age (ms) | Quote status |
|---|---|---|---|---|---|
| 2026-10-02T16:00:00.000Z | SELL | WAIT_STALE_DATA | QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT | -1054 | INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT |
| 2026-10-02T16:05:00.000Z | SELL | WAIT_STALE_DATA | QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT | -1030 | INVALID_QUOTE:CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT |

**Reading:** every new record carries the quote data the risk gate needs. On this machine the quote age is invalid because of the PC clock lag, so a live signal fails closed (WAIT_STALE_DATA) instead of being treated as fresh.
