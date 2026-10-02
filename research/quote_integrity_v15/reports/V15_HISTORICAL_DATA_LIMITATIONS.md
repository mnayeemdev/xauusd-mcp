# V15_HISTORICAL_DATA_LIMITATIONS

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Rule
- **Candles only.** The V8 replay rows (2025-05 → 2026-09) contain candles only: bar open time in seconds and OHLC. There are no quote timestamps, no bid / ask and no receive times.
- **Never reconstructed.** Quote age is therefore UNAVAILABLE and is never derived from candle timestamps.
- **Scope of historical replays.** They can still study entry rules, but they cannot validate execution eligibility.

## Historical replay through the live-gate wrapper
| Split | Configuration | Decisions | Valid entries | Reasons for valid entries | TRADE_ELIGIBLE | Fabricated quote ages |
|---|---|---|---|---|---|---|
| DEV | PRIMARY | 46593 | 4858 | QUOTE:QUOTE_TIMESTAMP_UNAVAILABLE: 4858 | 0 | 0 |
| DEV | ILLUSTRATIVE_PCT_0_50_10K | 46593 | 4858 | QUOTE:QUOTE_TIMESTAMP_UNAVAILABLE: 4858 | 0 | 0 |
| HOLD | PRIMARY | 52788 | 6553 | QUOTE:QUOTE_TIMESTAMP_UNAVAILABLE: 6553 | 0 | 0 |
| HOLD | ILLUSTRATIVE_PCT_0_50_10K | 52788 | 6553 | QUOTE:QUOTE_TIMESTAMP_UNAVAILABLE: 6553 | 0 | 0 |

## Consequence for earlier work
- **V14:** the illustrative risk replays assumed a bar-close quote age of 0 (documented there as a construction). Under the V15 contract that assumption is **withdrawn**: historically, no decision can be TRADE_ELIGIBLE.
- **The V14 PRIMARY result is unchanged:** 0 eligible.
