# XAUUSD_V5_NEWS_SURPRISE_STUDY

Research only (2026-09-26). Studies F (actual vs forecast surprise), G (gold response to surprise), the multi-variable part of I (NFP cluster surprise consistency) and J (CPI/inflation cluster aligned vs conflicting surprises).

## Status: NOT PERFORMED — no trustworthy forecast data

ACTUAL_FORECAST_DATA_AVAILABLE = NO. SURPRISE_EDGE_ANALYZED = NO.

### What was checked (see `docs/XAUUSD_V5_NEWS_DATA_INTEGRITY.md` §1)

| Need | Source tried | Outcome |
|---|---|---|
| Consensus forecast per release (CPI, core CPI, NFP, unemployment, earnings, PPI, PCE, retail sales, FOMC expectations) | Forex Factory JSON used by the live protection layer | current week only; no historical endpoint |
| | local repository / user files | none |
| | FRED / ALFRED | unreachable from this host; API key not configured; FRED holds actuals and vintages, not consensus forecasts |
| | BLS, BEA, Federal Reserve | official sources publish actuals, never consensus forecasts |
| Actual values | BLS API v2 (works without key, values by reference month) | available but useless without the matching forecast |
| Revised previous | BLS/BEA release pages | available in principle (text parsing), unused for the same reason |

Reconstructing forecasts from memory, from secondary news articles or from a low-quality scrape was ruled out by the trusted-data rule. No surprise measure was computed, no event-specific standardisation was attempted, no aligned/conflicting cluster classification was made.

### What a future surprise study would require

1. A historical consensus dataset with per-release forecast, actual and revised-previous values, with a documented provenance and a stated timezone, covering at least 2022-07 → present (to overlap the 15m price data) and ideally 2017 → present if 1H-resolution study were acceptable (it is not, for release windows).
2. The same timestamp-integrity checks as V5 (DST label agreement, price-spike alignment) applied to the vendor's timestamps, since vendor calendars are the usual source of one-hour misalignments.
3. Family-specific standardisation (surprise divided by the trailing standard deviation of that family's surprises, or by the vendor's forecast dispersion), never pooling raw surprises across families.
4. The pre-declared gate structure of the V5 protocol (§8–§10), with the surprise sign treated as an unknown to be measured, not an assumed "hot CPI = sell gold".
5. Because the V5 behaviour study already shows that the first 15 minutes contain most of the movement and that continuation after the first bar is absent, any surprise study should measure whether surprise sign predicts the **first-bar** direction (which is not tradeable before it happens) separately from whether it predicts anything **after** the first completed bar (which would be). Only the latter could become a premise.

CPI_RESULT (surprise) = NOT ANALYSED. NFP_RESULT (surprise) = NOT ANALYSED. FOMC_RESULT (surprise / decision vs expectation) = NOT ANALYSED. PCE_RESULT (surprise) = NOT ANALYSED. RETAIL_SALES_RESULT = NOT ANALYSED (no release-date archive accessible either). The existence/volatility/continuation/reversal results for these families are in `docs/XAUUSD_V5_NEWS_BEHAVIOUR_STUDY.md`.
