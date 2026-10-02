# V15_FINAL_DECISION

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Decision
**DATA_INTEGRITY_PARTIALLY_VALIDATED**

| Pre-registered criterion | Result |
|---|---|
| quote_timestamp_captured_ge_99pct | true |
| quote_age_computed_every_observation | true |
| no_unexplained_negative_age | false |
| clock_negative_ages_explained | PC clock not synchronized: it lags NTP by ~1230 ms; the broker clock agrees with NTP within ~144 ms |
| forward_shadow_ge_3_valid_quote_records | false |
| replay_ok | true |
| eligible_without_quote_age | 0 |
| fabricated_historical_quote_age | 0 |

**What is fixed:**
- Quote freshness is now a first-class field: the broker tick time in ms, receive and decision times, bid / ask / spread and the quote age.
- It is in the reader, the forward-shadow records and the gate path.
- Missing, invalid, future or stale quotes fail closed.
- Historical quote age is never fabricated.

**What keeps V15 from "validated":** this PC's Windows time service is NOT_SYNCHRONIZED (Leap Indicator 3, Source: Local CMOS Clock, never synced); the PC lags NTP (time.windows.com) by ≈ 1230 ms, while the broker clock agrees with NTP within ≈ 144 ms. Until the clock is synchronized, every live quote age is negative and the system (correctly) refuses to trade.

**V15 does not create an entry edge and does not fix the negative expectancy (V13).** DATA_VALIDITY ≠ TRADING_EDGE.

## Final terminal summary
```
V15_STATUS                 = COMPLETE
DATA_INTEGRITY_STATUS      = DATA_INTEGRITY_PARTIALLY_VALIDATED
QUOTE_TIMESTAMP            = CAPTURED (MT5 time_msc, 100 % of live observations; broker clock = UTC)
QUOTE_AGE_AVAILABLE        = YES (computed for every observation); NOT TRUSTWORTHY until the PC clock is synchronized
QUOTE_AGE_DETERMINISTIC    = YES
CLOCK_INTEGRITY            = FAIL (PC clock not synchronized: −1230 ms vs NTP; broker ≈ NTP)
BID_ASK_INTEGRITY          = PASS
SPREAD_INTEGRITY           = PASS (raw 0.24–0.26 USD preserved)
ENTRY_PRICE_INTEGRITY      = PASS (BUY ask / SELL bid; executable-geometry recheck at the side price)
STALE_DATA_HANDLING        = PASS (WAIT_STALE_DATA)
MISSING_DATA_HANDLING      = PASS (fail closed)
FUTURE_TIMESTAMP_HANDLING  = PASS (CLOCK_OR_DATA_ERROR -> WAIT_STALE_DATA; demonstrated live)
FORWARD_SHADOW_UPDATED     = YES (runner PID 49200 writes quote-v15-1 in every new record; 296 legacy records LEGACY_DATA)
HISTORICAL_QUOTE_AGE       = UNAVAILABLE (never fabricated; 0 historical eligible)
REPLAY_PARITY              = PASS
HINDSIGHT_CHECK            = PASS
NO_LOOKAHEAD               = PASS
FAIL_CLOSED                = PASS
ENTRY_RULES_CHANGED        = NO
STRUCTURAL_SL_CHANGED      = NO
RR                         = 1.70
CAPITAL_HARVEST            = OFF
RISK_PERCENTAGE            = UNRESOLVED
REAL_TRADE_PLACED          = NO
DEMO_TRADE_PLACED          = NO
EXECUTION_AUTHORITY        = NONE
PRODUCTION_CHANGED         = NO (REAL / DEMO execution path and strategy files unchanged; fingerprint ok. Changed: the read-only shadow reader's tick response and the forward-shadow research runner)
```
