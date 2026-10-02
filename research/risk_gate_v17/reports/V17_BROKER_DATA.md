# V17_BROKER_DATA

V17 RISK GATE HARDENING · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · RISK_PERCENTAGE UNRESOLVED · CAPITAL_HARVEST OFF · spec ed1af456b6e92ee0… · freeze 4bb8c9114e1818ff…

## Live read-only capture (`results/broker_spec_live.json`, 2026-10-02T17:55:12Z, account mode DEMO; identity never recorded)
| Field | Live | REAL bridge record | Equal |
|---|---|---|---|
| contract_size | 100 | 100 | YES |
| volume_min | 0.01 | 0.01 | YES |
| volume_max | 200 | 200 | YES |
| volume_step | 0.01 | 0.01 | YES |
| point | 0.001 | 0.001 | YES |
| digits | 3 | 3 | YES |
| stops_level_points | 0 | 0 | YES |
| freeze_level_points | 0 | 0 | YES |
| leverage | 200 | 200 | YES |
| margin_call_pct | 60 | 60 | YES |

| Check | Result |
|---|---|
| required fields (tick size, tick value, contract size, volume min / max / step, leverage, margin call, stops level, freeze level) | present and coherent |
| tick value: 0.01 lot × 1 USD move | formula 1 USD; MT5 order_calc_profit 1 USD |
| margin | formula = MT5 within ≤ 0.005 USD (V17_MARGIN) |
| spread (live) | 0.24 USD |
| swap | long -513.2 points, short 0, mode 1 (points), triple day 3 |
| commission | not a platform field; production estimate 0 per side; the 2 real closes record commission 0, swap 0, fee 0 |
| broker data validated | YES |

**Notes:**
- **The capture is from the connected DEMO account.** Every required field equals the REAL bridge record.
- **Fail-closed rule:** any missing or invalid required field rejects (RISK_REJECTED_BROKER_DATA, tested field by field).
