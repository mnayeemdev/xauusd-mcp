# V15_FAIL_CLOSED

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

| Condition | Result | Evidence |
|---|---|---|
| quote age missing | WAIT_STALE_DATA (QUOTE_AGE_UNAVAILABLE / CLOCK_OFFSET_UNAVAILABLE) | unit test; historical replay |
| quote timestamp missing | WAIT_STALE_DATA (QUOTE_TIMESTAMP_UNAVAILABLE) | unit test; 22822 historical valid entries |
| quote age invalid / negative | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR) | unit test; live 682 / 687; forward-shadow records |
| quote timestamp in the future | WAIT_STALE_DATA (CLOCK_OR_DATA_ERROR:QUOTE_AFTER_RECEIPT) | unit test; live |
| out-of-order / replayed tick | WAIT_STALE_DATA (OUT_OF_ORDER) | unit test |
| stale / delayed quote | WAIT_STALE_DATA (STALE_QUOTE, existing 90 s limit) | unit test |
| bid / ask missing or invalid; spread negative | WAIT_BROKER_UNSAFE | unit tests |
| clock integrity invalid | WAIT_STALE_DATA | live |
| risk data incomplete | risk_validation FAIL → WAIT | unit test |
| broker data incomplete | WAIT_BROKER_UNSAFE (V11 / V14, unchanged) | V14 tests |

Eligible decisions without a valid quote age: **0**.
