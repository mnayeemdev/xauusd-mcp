# V15_RISK_DATA_INTEGRITY

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Data required to model realized risk (V11 / V12) and its availability now
| Item | Availability | Source / note |
|---|---|---|
| quote age | computed; NOT trustworthy until the PC clock is synchronized | quote-v15-1 |
| bid, ask | available | symbol_info_tick |
| spread | available | ask − bid |
| tick timing | available (time_msc, flags); tick sequence UNAVAILABLE | symbol_info_tick |
| execution timestamp, execution price | UNAVAILABLE (no execution; research only) | would come from fills |
| SL price | available | frozen engine structural SL; broker SL = 1.5 R + spread |
| swap | available (rates) | platform record swap_long / swap_short history (V12) |
| commission | UNAVAILABLE as a measured value | production config estimates 0 per side; no fill evidence |
| slippage | UNAVAILABLE (3 historical fills only, V12) | needs real fills |

## Rule
**Risk data incomplete → RISK_VALIDATION = FAIL → REJECT / WAIT.**
- A valid entry with an invalid or missing quote is recorded with `risk_data: INCOMPLETE, risk_validation: FAIL` and WAIT_STALE_DATA / WAIT_BROKER_UNSAFE.
- RISK_PERCENTAGE stays UNRESOLVED; the risk model is not redesigned here.
