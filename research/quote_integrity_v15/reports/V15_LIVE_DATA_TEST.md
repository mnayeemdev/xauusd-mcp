# V15_LIVE_DATA_TEST

V15 LIVE QUOTE AGE + RISK DATA INTEGRITY · DATA-INTEGRITY STUDY (not entry research) · RESEARCH ONLY · REAL OFF · DEMO OFF · EXECUTION_AUTHORITY NONE · strategies unchanged (V8 corrected core) · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · spec 08af1516e5e20d13…

## Setup
- **Source:** the connected MT5 demo, read-only, through the existing shadow reader protocol (rates / tick / select / ping). There is no order, position or account command.
- **What was stored:** no account identifiers.
- **Run:** 2026-10-02T15:52:44.273Z, 180 s, polled every 250 ms.

| Measure | Value |
|---|---|
| observations / ok / errors | 687 / 687 / 0 |
| quote timestamp captured (time_msc) | 687 (100.0 %) |
| distinct ticks / updates per second | 477 / 2.65 |
| observations with a new tick / duplicates / out of order | 685 / 2 / 0 |
| IPC latency reader → decision (ms) | p50 0, p99 1, max 1 |
| receive − quote (ms, raw PC clock) | min: -1085; p50: -934; p99: -74; max: 737 |
| quote age (ms, raw PC clock) | n 687; min -1086; p10 -1065; p50 -934; p90 -500; p99 -74; max 737 |
| spread (USD) | min 0.24, p50 0.24, max 0.26 |
| candle reference (bar open times, s) | 1790955900, 1790956200, 1790956500 |

## Conclusion
- **The live path works.** Quote timestamps are captured on 100 % of observations, quote age updates with every tick, and bid / ask / spread integrity holds.
- **The age is not trustworthy until the PC clock is synchronized** (V15_CLOCK_INTEGRITY), and the system fails closed meanwhile.
