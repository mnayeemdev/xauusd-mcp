# V11_FAILURE_MODES

V11 ENTRY + RISK INTEGRATION · RESEARCH ONLY · HYPOTHETICAL_NOT_EXECUTED · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · entries = frozen V8 corrected core (unchanged) · structural SL unchanged · RR 1.70 · pre-registration 722b5d612df887a8… · freeze 2026-10-02T10:28:24.397Z

Every failure mode ends in NO TRADE, the entry stays unchanged and a record remains. None is bypassed by altering the entry.

| Condition | Outcome / reason | Unit test | HOLD fault replay (corrected): injected / expected reason / upstream / accepted |
|---|---|---|---|
| equity unavailable / ≤ 0 / NaN | EQUITY_UNAVAILABLE | yes | 14 / 14 / 0 / 0 |
| SL unavailable | SL_UNAVAILABLE | yes | 14 / 14 / 0 / 0 |
| broker specification unavailable / incomplete | BROKER_SPEC_UNAVAILABLE | yes | 14 / 14 / 0 / 0 |
| tick value unavailable | TICK_VALUE_UNAVAILABLE | yes | 13 / 13 / 0 / 0 |
| tick value inconsistent with tick size × contract | TICK_VALUE_INCONSISTENT | yes | covered by the clean replay and tests |
| quote stale (> 90 s) or age unknown | DATA_STALE_QUOTE | yes | 13 / 13 / 0 / 0 |
| signal stale (> 600 s) | DATA_STALE_SIGNAL | yes | 13 / 13 / 0 / 0 |
| spread above 0.60 USD or unknown | SPREAD_UNAVAILABLE_OR_ABOVE_LIMIT | yes | 13 / 13 / 0 / 0 |
| entry geometry defect | ENTRY_GEOMETRY_DEFECT | yes | covered by the clean replay and tests |
| position sizing invalid (non-finite lots) | POSITION_SIZE_INVALID | yes | 13 / 12 / 1 / 0 |
| risk calculation inconsistent (independent path differs) | RISK_CALCULATION_INCONSISTENT | yes | 13 / 12 / 1 / 0 |
| PCT actual above approved | RISK_ABOVE_APPROVED | yes | covered by the clean replay and tests |
| minimum lot exceeds the approved risk | RISK_BELOW_MIN_LOT | yes | 13 / 13 / 0 / 0 |
| margin insufficient | MARGIN_ABOVE_CAP / MARGIN_LEVEL_AFTER_LOSS_TOO_LOW | yes | 13 / 12 / 1 / 0 |
| broker parameter rule (step, min / max, stops / freeze level, SL side) | BROKER_* | yes | 13 / 13 / 0 / 0 |
| broker rejects the order | REJECTED_BY_BROKER (no retry, no resize) | yes | 13 / 12 / 1 / 0 |
| position already open | EXPOSURE_BLOCKED POSITION_OPEN | yes | covered by the clean replay and tests |
| duplicate delivery (also after restart) | DUPLICATE_DELIVERY | yes | covered by the clean replay and tests |

- **"Upstream":** the injected entry was already rejected by an earlier stage (for example, the minimum lot), so no trade was possible.
- **Entry unchanged:** for every injected fault yes. The delivered record without an SL is a simulated corrupt input, not an alteration.

## Pre-registered harness (diagnostic)
- 2 of 171 injected faults were accepted, all under the leverage-1 margin injection.
- They satisfied the margin rule (V11_MARGIN_EXPOSURE), so the injection did not create the fault.
- Under the pre-registered rule this computed INTEGRATION_FAILED; see CORRECTION_LOG C1.
