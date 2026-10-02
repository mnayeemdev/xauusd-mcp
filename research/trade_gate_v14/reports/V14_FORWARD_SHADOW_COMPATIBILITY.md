# V14_FORWARD_SHADOW_COMPATIBILITY

V14 NO-EDGE BEHAVIOUR & TRADE GATE · ARCHITECTURE / SAFETY STUDY · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core: MC PB BO SR MR) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec aa330171e1350664… · gate ae58a7249fb2…

## Live input
- **Source:** the gate ran read-only over the V8 forward-shadow decision records (`state/v8_shadow/decisions.jsonl`), 143 V8 records from 2026-10-01T11:55:00.000Z to 2026-10-02T15:30:00.000Z.
- **The runner was not touched.**

## PRIMARY (risk UNRESOLVED): every live decision fully determined from recorded fields
| State | Live decisions |
|---|---|
| WAIT_STALE_DATA | 2 |
| WAIT_SAFETY_BREAKER | 1 |
| WAIT_NO_SETUP | 22 |
| WAIT_NO_TRIGGER | 39 |
| WAIT_DIRECTION_UNCLEAR | 44 |
| WAIT_CONFLICT | 0 |
| WAIT_INVALID_LOCATION | 0 |
| WAIT_INVALID_SL | 0 |
| WAIT_INVALID_RR | 22 |
| WAIT_ENTRY_QUALITY | 2 |
| WAIT_RISK_UNSAFE | 11 |
| WAIT_BROKER_UNSAFE | 0 |
| TRADE_ELIGIBLE | 0 |

## Live engine signals through the gate (illustrative risk model, each record evaluated independently)
| Bar (UTC) | Engine | Gate decision | Reason |
|---|---|---|---|
| 2026-10-01T11:50:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T11:55:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T12:00:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T12:30:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T13:15:00.000Z | SELL | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T13:20:00.000Z | SELL | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T13:50:00.000Z | SELL | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T13:55:00.000Z | SELL | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T15:25:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T17:40:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-01T17:45:00.000Z | BUY | WAIT_STALE_DATA | DATA_STALE_QUOTE |
| 2026-10-02T13:20:00.000Z | BUY | WAIT_SAFETY_BREAKER | NEWS_BLOCK |

## Findings
- **No forced entries:** 0 TRADE_ELIGIBLE where the engine waited (0).
- **Recorded production safety state is honoured.** For example, a NEWS_BLOCK on a live signal → WAIT_SAFETY_BREAKER, and a late decision (signal older than 600 s) → WAIT_STALE_DATA.
- **Missing field.** With any risk model, 11 live valid entries fail closed with DATA_STALE_QUOTE, because quote age (tick time) is not recorded in forward-shadow decisions. The gate refuses to assume a fresh quote.
- **Requirement for live operation with a risk model:** the forward-shadow decision record must carry the quote tick time (or quote age) at decision time. That is a logging addition to the shadow, not an engine change, and it is not made in V14.
