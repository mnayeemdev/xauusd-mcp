# XAUUSD_V5_NEWS_DATA_INTEGRITY

Research only (2026-09-26). Phase-0 inventory, provenance and timestamp integrity for the V5 scheduled-news study. Production untouched. Raw fetched pages are kept under `validation/v5_news_edge/raw/`; the unified event list is `validation/v5_news_edge/events_usd_official.json` (built by `build_events.mjs`, DST rule in `et_time.mjs`).

## 1. Inventory of scheduled-news sources

| Source | Result | Usable for history? |
|---|---|---|
| Project live calendar (`src/engine/newsMonitor.js`, Forex Factory weekly JSON `nfs.faireconomy.media/ff_calendar_thisweek.json`) and its snapshot `state/xauusd_news_calendar_snapshot.json` | current week only (82 events, 2026-09-20 → 26); `lastweek` / `nextweek` endpoints return 404 | **NO** (no history) |
| Local repository / user directories | no historical calendar, no forecast archive; only a synthetic test fixture (`tests/fixtures/ff_calendar_synthetic.json`, 11 rows, not real) | **NO** |
| MetaTrader5 Python package | no economic-calendar API (`calendar_*` functions are MQL5-only) | **NO** |
| FRED (St. Louis Fed) | HTML unreachable from this host (timeout); API requires a key that is not configured; the release page has no historical release-date table | **NO** |
| BLS schedule archive pages (`bls.gov/schedule/archives/*_nr.htm`) | HTTP 403 for curl / PowerShell / web-fetch | NO |
| **BLS archived news-release indexes** (`bls.gov/bls/news-release/cpi.htm`, `empsit.htm`, `ppi.htm`, `jolts.htm`) | readable through the session web-fetch tool; every archived release filename encodes the release date (`cpi_MMDDYYYY.htm`) | **YES** (dates) |
| **BLS archived release pages** | release time printed verbatim: CPI "embargoed until 8:30 a.m. (ET) Tuesday, September 13, 2022" and "... Friday, October 24, 2025"; Employment Situation "8:30 a.m. (ET) Friday, September 2, 2022"; PPI "8:30 a.m. (ET) Wednesday, September 14, 2022"; JOLTS "For release 10:00 a.m. (ET) Tuesday, October 4, 2022" | **YES** (times) |
| **Federal Reserve** FOMC calendar (`federalreserve.gov/monetarypolicy/fomccalendars.htm`, 2021–2027) and each statement page | 39 statement pages fetched; 38 print "For release at 2:00 p.m. EDT/EST"; the 2025-08-22 item is the long-run-goals statement at 10:00 a.m. and is excluded; press-conference links exist for all 38 | **YES** |
| **BEA** news-release archive (Personal Income and Outlays; GDP advance) | 70 release pages fetched; 54 print "EMBARGOED UNTIL RELEASE AT h:mm a.m. EDT/EST, Weekday, Month d, yyyy"; 16 pages without that line are excluded (listed in the event file) | **YES** (partial) |
| Census retail-sales schedule, DOL claims | Census pages list only 2025–2026; DOL PDF 403 | NO |
| ISM, ADP, Conference Board | no accessible official archive | NO |
| **Consensus forecasts** (any family) | none available from any trustworthy accessible source; not reconstructed from memory | **NO** |
| **Actual values** | BLS API v2 works without a key (series values), but without forecasts they cannot form a surprise measure; not used | not needed |

NEWS_DATA_SOURCE = official primary sources (BLS, Federal Reserve, BEA); no third-party calendar, no scraping of Forex Factory history, nothing fabricated.
ACTUAL_FORECAST_DATA_AVAILABLE = NO (forecasts unavailable; actuals available but unused).

## 2. Event list

| Family | Release time (ET) | Events 2022-01 → 2026-09 | With 15m price coverage (2022-07-27 →) | Notes |
|---|---|---|---|---|
| CPI | 08:30 | 55 | 50 | October 2025 release missing (government shutdown; September 2025 CPI released 2025-10-24) |
| NFP (Employment Situation cluster) | 08:30 | 55 | 50 (48 with a bar; two Good-Friday releases have no market bar) | October 2025 missing; September 2025 released 2025-11-20 |
| PPI | 08:30 | 55 | 50 | |
| JOLTS | 10:00 | 47 | 43 | 2026 rows not returned by the fetch; ends 2026-02-05 |
| FOMC statement | 14:00 (printed) | 38 | 34 | all with press conference |
| PCE (Personal Income and Outlays) | 08:30 (4 releases at 10:00 when combined with GDP: 2024-11-27, 2025-04-30, 2025-12-05, 2026-01-22) | 43 | 42 | 11 releases excluded for missing embargo line |
| GDP advance | 08:30 | 12 | 12 | 3 excluded (missing line) |

NEWS_DATA_DATE_RANGE = 2022-01-26 → 2026-09-16 (official timestamps). PRICE_DATA_DATE_RANGE = 15m 2022-07-04 → 2026-09-25; 5m 2025-05-06 → 2026-09-25; 1m (spread column) 2026-06-26 → 2026-09-25. YEARS_OVERLAP = 4.1 (15m), 1.4 (5m), 0.25 (1m).

## 3. Timestamp normalisation and checks

1. **DST rule:** ET → UTC with the explicit US rule (DST from the second Sunday of March 02:00 to the first Sunday of November 02:00). The computed EDT/EST label was compared with the label printed on every page that prints one: **93 checks, 0 mismatches** (38 FOMC, 55 BEA).
2. **Weekday check:** 0 events on a weekend.
3. **Broker clock:** Exness server stamps are UTC (V3 wall-clock verification; the last 1m bar on Friday 2026-09-25 is 20:57 UTC, the Friday close is 21:00 UTC).
4. **Price-spike alignment (all 279 events with a release bar):** the largest-range 15m bar within ±2 h is the release bar for CPI 70 %, NFP 69 %, JOLTS 56 %, PPI 52 %, GDP 42 %, FOMC 41 %, PCE 41 %; it is the bar **one hour earlier in 0 cases** (a mis-zoned calendar would put it there), and one hour later in 23 cases (09:30 ET equity open). Median release-bar range vs the pre-release median: CPI 7.8×, NFP 6.7×, FOMC 4.6×, PPI 3.4×, PCE 2.6×, GDP 2.6×, JOLTS 2.0×. For FOMC the competing bars are the 14:30 press-conference bars, as expected.
5. **Manual spot checks:** CPI 2022-09-13 12:30 UTC (17 bars 12:00–16:00 present, release bar the largest), FOMC 2023-06-14 18:00 UTC, CPI 2025-03-12 12:30 UTC all align with the first post-release bar.

TIMESTAMP_ALIGNMENT_VERIFIED = YES.

## 4. Price-data limitations (stated)

- 1m history on this terminal starts 2026-06-26 (90,000 bars); 5m starts 2025-04-30 (99,000 bars, V3 snapshot from 2025-05-06); 15m starts 2022-07-04. The [−15, −5), [−5, 0) and [0, +5) windows and the first-1m shock can therefore be measured only for the last 16 months (5m) or 3 months (1m). The main study runs on 15m, which allows [−60,−30), [−30,−15), [−15,0) and the [0,15) … [0,240) windows.
- Historical ticks are not available (`copy_ticks_range` returns 0 rows), so spread expansion, quote instability and slippage at the release second are **not measurable**. The 1m bar spread column (spread at bar formation, 0.001 USD points) is the only executability proxy and does not capture intra-minute widening.
- FEED_MISMATCH = YES: research on Exness XAUUSDm, production on TradingView OANDA:XAUUSD. Not merged.
- The 2024–2026 price history was already examined by V3 and V4 (structure and market-state studies). The news condition is new; the price history is not globally unseen.

## 5. Contamination policy applied

No two listed events share a minute. 8 events fall within ±240 min of another listed event and are excluded from single-family statistics (kept once in the pooled 08:30 family). Non-listed releases (retail sales, weekly claims, ISM, ADP) cannot be flagged; matched controls on the same weekday and clock time carry the same regular unlisted releases (claims every Thursday 08:30), which partly controls for them.

DATA_LIMITATIONS = no forecasts; 5m/1m depth short; no ticks/spread history; JOLTS 2026 and 16 BEA releases missing; feed mismatch; holdout price history previously examined.
