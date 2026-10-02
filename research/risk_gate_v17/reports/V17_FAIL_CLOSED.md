# V17_FAIL_CLOSED

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

| Condition (owner §27) | Decision | Tested |
|---|---|---|
| equity unavailable | RISK_REJECTED_EQUITY_UNAVAILABLE | yes |
| risk calculation invalid (non-finite risk %, negative spread or swap) | RISK_REJECTED_INVALID_RISK | yes |
| SL unavailable or wrong side | RISK_REJECTED_SL_INVALID | yes |
| broker data unavailable / incoherent (each required field) | RISK_REJECTED_BROKER_DATA | yes |
| position size invalid (off step / non-finite) | RISK_REJECTED_INVALID_SIZE | yes |
| minimum lot exceeds risk | RISK_REJECTED_MINIMUM_LOT | yes |
| maximum lot exceeded (no capping) | RISK_REJECTED_BROKER_LIMIT | yes |
| margin insufficient / above cap / level after loss | MARGIN_REJECTED | yes |
| quote invalid / stale / missing / impossible timestamp (V16 timing) | RISK_REJECTED_QUOTE | yes |
| risk exposure inconsistent after rounding | RISK_REJECTED_INCONSISTENT | by construction |
| hard-stop distance below the broker stops level | RISK_REJECTED_STOPS_LEVEL | by construction (stops level 0) |
| position already open | RISK_REJECTED_EXPOSURE | yes |
| duplicate signal | RISK_REJECTED_DUPLICATE | yes |
| risk % unresolved (PRIMARY) | RISK_PERCENTAGE_UNRESOLVED | yes |

- **A 1–6 s execution delay is not a quote failure** (V16; tested).
- **Every rejection keeps VALID_ENTRY** separate from the rejection.
