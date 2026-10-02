# V11_BROKER_VALIDATION

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

## Platform specification (read, not assumed)
- **Source:** `state/xauusd_mt5_real_trade_log.jsonl`, latest XAUUSDm record (2026-10-02T10:16:46.039Z).
- **Account:** the connected MT5 account is non-real (account_is_real = false); this matches the owner's statement that the 10,000 USD demo is connected for platform verification only.
- **No credentials:** no account identifier, credential or server value enters the spec.
- **Same contract as REAL:** the contract fields are identical to the 9 REAL-verified records (V10_BROKER_CONSTRAINTS).

| Field | Value |
|---|---|
| Contract size | 100 oz |
| Volume min / step / max | 0.01 / 0.01 / 200 |
| Point / digits | 0.001 / 3 |
| Stops / freeze level | 0 / 0 points |
| Leverage / margin currency / margin call | 1:200 / XAU / 60 % |
| Profit / account currency | USD / USD |
| Platform tick value | not recorded → derived tick size × contract = 0.1 USD per point per lot (same currency) |
| Swap long (latest record) | -513.2 points = -0.513 USD/oz/night (the simulator charges 0.56, conservative) |

## Validation results
- **Accepted trades failing broker validation:** 0 in every cell (the lot is a step multiple within [min, max]; the structural and broker SLs are on the protective side, outside the stops and freeze levels).
- **Fault injection on HOLD (corrected harness):**
| Injected condition | Injected | Closed with expected reason | Closed upstream (other reason) | Accepted |
|---|---|---|---|---|
| BROKER_SPEC_UNAVAILABLE | 14 | 14 | 0 | 0 |
| TICK_VALUE_UNAVAILABLE | 13 | 13 | 0 | 0 |
| BROKER_STOPS_LEVEL | 13 | 13 | 0 | 0 |
| BROKER_REJECTS_ORDER | 13 | 12 | 1 | 0 |
- **Broker rejection:** recorded as RISK_REJECTED REJECTED_BY_BROKER with retry = false and size_change = false. The same entry cannot be resubmitted (DUPLICATE_DELIVERY).
