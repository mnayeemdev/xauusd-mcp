# V16_NO_LOOKAHEAD

V16 EXECUTION TIMING TOLERANCE + QUOTE DATA INTEGRITY · RESEARCH ONLY · REAL OFF · DEMO EXECUTION OFF · EXECUTION_AUTHORITY NONE · frozen V8 entry engine unchanged · structural SL unchanged · RR 1.70 · CAPITAL_HARVEST OFF · RISK_PERCENTAGE UNRESOLVED · no trade-count target · spec eaf271933f0fbc78…

## Only information available at the decision instant
- **Quotes:**
  - only polls received before the instant are used (live: 0 violations in 8 probes);
  - a receipt after the decision is a CLOCK_OR_DATA_ERROR.
- **Bars:** only closed bars, using the runner's existing rule. The probe fetches them before the instant.
- **Engine:** the same frozen engine runs on those bars. No forming bar, no future candle.
- **Never read:** future price movement, outcomes, MFE / MAE. The study's band and tick-movement tables are descriptive and are never fed back.
- **Beyond 6 s:** a NEW signal only comes from a newer closed bar. The expired original is never carried forward.
