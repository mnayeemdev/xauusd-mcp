# XAUUSD_V3_DATA_INTEGRITY

Research only (2026-09-26). Data inventory and integrity for the V3 multi-year 15m / 1H event study. Nothing in production was changed; the MT5 terminal was only read.

## 1. Sources inventoried

| Source | Available | Notes |
|---|---|---|
| MT5 Exness XAUUSDm history (read-only `copy_rates_from_pos` / `copy_rates_range`, terminal build 6182, maxbars 100,000) | **YES** | the approved research data path already used by the Master Edge Validation and the Improvement Lab |
| OANDA:XAUUSD multi-year history | **NO locally** | the chart path reads at most 500 bars per timeframe and switching timeframes would disturb the live watcher; no local OANDA archive exists beyond a 300-bar fixture (`tests/fixtures/xauusd_intraday_session_2026-09-25.json`) |
| Third-party datasets | not used | none downloaded, per instruction |

**FEED_MISMATCH = YES, stated:** the study uses Exness XAUUSDm; production trades OANDA:XAUUSD via TradingView. Overlap agreement is known only from the one-day and five-month replays of the production strategy on this feed (10 of 11 live signals reproduced on 25 Sep; 62 of 62 candles matched on action and reason), i.e. structural events agree closely but prices differ by a few tenths of a USD. No merging of feeds was done.

## 2. Coverage (saved snapshot `validation/v3_multiyear_event_study/xauusdm_multiyear_bars.json`)

| TF | Bars | From (UTC) | To (UTC) | Effective usable range |
|---|---|---|---|---|
| 1D | 3,909 | 2014-01-14 | 2026-09-25 | full |
| 1H | 57,443 | 2014-01-14 | 2026-09-25 20:00 | **true hourly bars only from 2017** (2014–2016 hold ≈ 300 bars/year, one bar per day; 2017 partial with 4,996 bars; ≈ 5,900 bars/year from 2018) |
| 15m | 100,000 (terminal cap) | 2022-07-04 15:45 | 2026-09-25 20:45 | full: ≈ 23,500 bars/year, 4.2 years |
| 5m | 99,000 (cap) | 2025-05-06 | 2026-09-25 20:55 | 1.4 years; reserved for a secondary timing study only if an HTF event had passed (it did not) |

YEARS_COVERED = 1H 2014–2026 (9.7 usable hourly years from 2017), 15m July 2022 → September 2026 (4.2 years). Target of ≥ 2 years met; 3–5 years met on 15m, exceeded on 1H.

## 3. Integrity scan (`data_integrity.mjs` → `v3_data_integrity.json`)

| TF | Duplicates | Non-monotonic | Bad OHLC geometry | Non-weekend gaps > 2 bars + 1 h | Largest gaps |
|---|---|---|---|---|---|
| 1H | 0 | 0 | 0 | 908 (almost all the daily 1-hour close and holidays) | Christmas/New Year 2016–17 (96 h, the daily-only era), Easter and Christmas closures 74–78 h |
| 15m | 0 | 0 | 0 | daily close + holidays | as above |
| 5m | 0 | 0 | 0 | 17 (holidays: Good Friday 2026, Independence Day, Thanksgiving, Christmas) | 73 h Easter 2026 |

**DST / session offset:** the daily close gap starts at 20:00 UTC during northern-hemisphere summer and 21:00 UTC in winter (2017 onward); in 2014–2016 bars are stamped 00:00 (daily-only era). The server timestamps are treated as UTC (verified against wall-clock UTC on 2026-09-25). Session labels in the study use raw UTC hours and therefore shift by one hour across DST; the session study is descriptive only and this is stated as a limitation. No broker/feed change is visible in the data other than the 2017 transition from daily-only to hourly history.

## 4. Pre-declared regions (written before any event statistic was computed)

| TF | DISCOVERY | VALIDATION | FINAL HOLDOUT |
|---|---|---|---|
| 15m | 2022-07-04 → 2024-06-30 | 2024-07-01 → 2025-08-31 | 2025-09-01 → 2026-09-25 |
| 1H | 2014-01-14 → 2021-12-31 (effectively 2017–2021 for hourly structure) | 2022-01-01 → 2024-06-30 | 2024-07-01 → 2026-09-25 |

Unconditional drift (mean 8-bar move in ATR units) per region: 15m +0.059 / +0.122 / +0.059; 1H +0.071 / +0.073 / +0.165. Gold was in a strong bull phase throughout the 15m sample and the 1H holdout, which is why every event statistic is reported as excess over the region's drift.

## 5. Structure primitives and lookahead control

Confirmed pivots (5 bars left and right, so a pivot is known only 5 bars after it forms), BOS/CHoCH from confirmed closes, range extremes from the last five confirmed pivots (mature only if the defining pivots are ≥ 20 bars old and the width ≥ 2 ATR), compression from ATR14 versus its 100-bar mean or a 20-bar box, all computed on a 300-bar trailing window ending at the event bar. Forward measurements start at the event bar's close. No forming-bar data is used.

MULTI_YEAR_DATA_SUFFICIENT = YES
